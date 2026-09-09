import type { CodeViewItem, DiffLineAnnotation } from "@pierre/diffs";
import { CodeView, type CodeViewReactOptions } from "@pierre/diffs/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { togglePath, useAppState } from "./app-state.tsx";
import { DiffToolbar } from "./DiffToolbar.tsx";
import { DraftComment, ReviewCommentCard } from "./review.tsx";
import type { CommentAnnotation } from "./review-model.ts";

// Pierre needs numeric versions. Cache them by preview identity and annotation
// contents so typing in a React comment editor doesn't rebuild the diff DOM.
function itemVersions() {
  const versions = new Map<
    string,
    {
      item: CodeViewItem<CommentAnnotation>;
      signature: string;
      version: number;
    }
  >();
  let next = 0;
  return (item: CodeViewItem<CommentAnnotation>, signature: string) => {
    const previous = versions.get(item.id);
    if (previous?.item === item && previous.signature === signature)
      return previous.version;
    const version = ++next;
    versions.set(item.id, { item, signature, version });
    return version;
  };
}

// Keep Pierre's annotation versions and event callbacks local to its renderer.
export function DiffWorkspace() {
  const {
    source: { diff, repository, piped, mode },
    display: { theme, layout, wrap, collapsed, setCollapsed },
    navigation: { files, filter },
    reviewed: { isReviewed, toggleReviewed },
    draft,
    review,
    navigateComment,
    viewer,
  } = useAppState();
  const lineMetric = useRef<HTMLSpanElement>(null);
  const [lineHeight, setLineHeight] = useState<number>();
  // Virtual scroll offsets must use the same row height as our rem-based CSS.
  // Observe a sizing probe so browser font preferences also stay in sync.
  useLayoutEffect(() => {
    const element = lineMetric.current;
    if (!element) return;
    const measure = () => setLineHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const versionFor = useMemo(itemVersions, []);
  const allFiles = repository?.files ?? [];
  const items = useMemo(
    () =>
      files.flatMap((file): CodeViewItem<CommentAnnotation>[] => {
        const item = diff.items.get(file.path);
        if (!item) return [];
        const annotations: DiffLineAnnotation<CommentAnnotation>[] =
          review.comments
            .filter(
              (comment) =>
                comment.path === file.path &&
                comment.scope === mode &&
                comment.fingerprint === file.fingerprint &&
                comment.id !== draft?.id,
            )
            .map((comment) => ({
              side: comment.side,
              lineNumber: comment.end,
              metadata: { kind: "saved", comment },
            }));
        if (
          draft &&
          draft.path === file.path &&
          draft.scope === mode &&
          draft.fingerprint === file.fingerprint
        )
          annotations.push({
            side: draft.side,
            lineNumber: draft.end,
            metadata: { kind: "draft" },
          });
        return [
          {
            ...item,
            ...(item.type === "diff" ? { annotations } : {}),
            collapsed: collapsed.has(file.path),
            version: versionFor(
              item,
              `${collapsed.has(file.path)}:${JSON.stringify(annotations)}`,
            ),
          },
        ];
      }),
    [files, diff.items, review.comments, draft, mode, collapsed, versionFor],
  );

  // Keep renderer options stable while event callbacks see current React state.
  const actions = useRef({
    repository,
    begin: review.begin,
    draft,
    navigateComment,
  });
  useLayoutEffect(() => {
    actions.current = {
      repository,
      begin: review.begin,
      draft,
      navigateComment,
    };
  });
  const options = useMemo<CodeViewReactOptions<CommentAnnotation, undefined>>(
    () => ({
      theme: { light: "pierre-light", dark: "pierre-dark" },
      themeType: theme,
      diffStyle: layout,
      overflow: wrap ? "wrap" : "scroll",
      diffIndicators: "bars",
      unsafeCSS: '[data-change-icon="change"] { color: var(--modified); }',
      stickyHeaders: true,
      ...(lineHeight === undefined
        ? {}
        : {
            // Pierre's default header adds 12px padding above and below the row.
            itemMetrics: { lineHeight, diffHeaderHeight: lineHeight + 24 },
          }),
      enableLineSelection: true,
      enableGutterUtility: true,
      lineHoverHighlight: "number",
      layout: { paddingTop: 0, paddingBottom: 24, gap: 1 },
      onGutterUtilityClick(range, context) {
        if (context.item.type !== "diff") return;
        const current = actions.current;
        if (current.draft) {
          current.navigateComment(current.draft);
          return;
        }
        const file = current.repository?.files.find(
          (file) => file.path === context.item.id,
        );
        if (file) current.begin(file, context.item.fileDiff, range);
      },
      onLineEnter(_event, context) {
        requestAnimationFrame(() =>
          context.element?.shadowRoot
            ?.querySelector("[data-utility-button]")
            ?.setAttribute("aria-label", "Add review comment"),
        );
      },
    }),
    [theme, layout, wrap, lineHeight],
  );

  const scopeDescription = piped
    ? "Command output · fixed snapshot"
    : mode === "staged"
      ? "HEAD → index"
      : mode === "unstaged"
        ? "Index → working tree, including untracked files"
        : "HEAD → working tree, including untracked files";
  const emptyTitle = !repository
    ? diff.notice
      ? "Cannot load changes"
      : "Loading changes"
    : filter
      ? "No matching files"
      : piped
        ? "No file changes in this input"
        : mode === "staged"
          ? "Nothing staged"
          : "Working tree is clean";
  const emptyDescription = !repository
    ? diff.notice
      ? "Check that the server is running, then refresh."
      : "Your working tree, in focus."
    : filter
      ? "Try a different filename or clear the filter."
      : piped
        ? "Run a command that emits a Git patch, then pipe it into serve-diff."
        : mode === "staged"
          ? "Stage changes with Git to review them here."
          : "Changes will appear here as you edit. Ignored files stay hidden.";

  return (
    <main>
      <DiffToolbar />
      <div id="notice" role="status" hidden={!diff.notice}>
        {diff.notice}
      </div>
      <div className="review-surface">
        <section id="viewer" aria-label="Code differences">
          <span
            ref={lineMetric}
            className="diff-line-metric"
            aria-hidden="true"
          />
          <CodeView
            ref={viewer}
            items={items}
            options={options}
            style={{ height: "100%", width: "100%", overflow: "auto" }}
            renderHeaderPrefix={(item) => (
              <button
                type="button"
                className="diff-collapse"
                aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${item.id}`}
                aria-expanded={!item.collapsed}
                onClick={() =>
                  setCollapsed((previous) => togglePath(previous, item.id))
                }
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d={item.collapsed ? "m6 4 4 4-4 4" : "m4 6 4 4 4-4"} />
                </svg>
              </button>
            )}
            renderHeaderMetadata={(item) => {
              const file = allFiles.find((file) => file.path === item.id);
              return file ? (
                <button
                  type="button"
                  className="review-button"
                  aria-label={`Mark ${file.path} ${isReviewed(file) ? "unreviewed" : "reviewed"}`}
                  aria-pressed={isReviewed(file)}
                  onClick={() => toggleReviewed(file)}
                >
                  <svg
                    className="review-checkbox"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    {isReviewed(file) && <path d="m4.5 8 2.5 2.5 4.5-5" />}
                  </svg>
                  viewed
                </button>
              ) : null;
            }}
            renderAnnotation={(annotation) =>
              annotation.metadata.kind === "draft" ? (
                <DraftComment />
              ) : (
                <ReviewCommentCard comment={annotation.metadata.comment} />
              )
            }
          />
        </section>
        <div id="empty" role="status" hidden={files.length > 0}>
          <div className="empty-symbol">±</div>
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
        </div>
      </div>
      <footer className="main-footer">
        <span id="scope-description">{scopeDescription}</span>
        <span>
          <kbd>J</kbd> <kbd>K</kbd> files <kbd>/</kbd> filter <kbd>R</kbd>{" "}
          refresh
        </span>
      </footer>
    </main>
  );
}
