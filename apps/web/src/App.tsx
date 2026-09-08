import type { CodeViewItem, DiffLineAnnotation } from "@pierre/diffs";
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewReactOptions,
} from "@pierre/diffs/react";
import {
  type ChangedFile,
  type DiffMode,
  isDiffMode,
} from "@serve-diff/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileNavigation } from "./file-navigation.tsx";
import { ancestorPaths } from "./file-tree.ts";
import { save, saved, savedReviews } from "./preferences.ts";
import {
  anchored,
  CommentCard,
  CommentEditor,
  CopyDialog,
  useReview,
} from "./review.tsx";
import type { CommentAnnotation, ReviewComment } from "./review-model.ts";
import { useDiff } from "./use-diff.ts";
import { useSidebar } from "./use-sidebar.ts";

function togglePath(paths: Set<string>, path: string) {
  const next = new Set(paths);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

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

export function App() {
  const [mode, setMode] = useState<DiffMode>("all");
  const [layout, setLayout] = useState<"split" | "unified">(() =>
    saved("layout") === "unified" ? "unified" : "split",
  );
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    saved("theme") === "dark" ? "dark" : "light",
  );
  const [wrap, setWrap] = useState(() => saved("wrap") === "true");
  const [tab, setTab] = useState<"files" | "comments">("files");
  const [toolsCollapsed, setToolsCollapsed] = useState(
    () => saved("review-tools-collapsed") === "true",
  );
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [closed, setClosed] = useState(new Set<string>());
  const [filteredClosed, setFilteredClosed] = useState(new Set<string>());
  const [draft, setDraft] = useState<ReviewComment | null>(null);
  const [pendingComment, setPendingComment] = useState<ReviewComment | null>(
    null,
  );
  const diff = useDiff(mode, draft !== null);
  const repository = diff.repository;
  const review = useReview(repository, draft, setDraft);
  const sidebar = useSidebar();
  const viewer = useRef<CodeViewHandle<CommentAnnotation, undefined>>(null);
  const versionFor = useMemo(itemVersions, []);
  const search = useRef<HTMLInputElement>(null);
  const piped = repository?.source === "stdin";
  const reviewKey = `reviewed:${repository?.root ?? ""}:${mode}`;
  const [reviewedState, setReviewedState] = useState({
    key: "",
    entries: new Map<string, string>(),
  });
  const reviewed = useMemo(
    () =>
      reviewedState.key === reviewKey
        ? reviewedState.entries
        : savedReviews(reviewKey),
    [reviewedState, reviewKey],
  );
  const files = useMemo(
    () =>
      repository?.files.filter((file) =>
        file.path.toLowerCase().includes(filter.toLowerCase()),
      ) ?? [],
    [repository, filter],
  );
  const activePath = files.some((file) => file.path === selected)
    ? selected
    : (files[0]?.path ?? "");
  const allCollapsed =
    files.length > 0 && files.every((file) => collapsed.has(file.path));
  const folderPaths = useMemo(
    () => [...new Set(files.flatMap((file) => ancestorPaths(file.path)))],
    [files],
  );
  // Closing every root folder hides the whole tree, even after manual toggles.
  const foldersCollapsed =
    folderPaths.length > 0 &&
    folderPaths
      .filter((path) => !path.includes("/"))
      .every((path) => (filter ? filteredClosed : closed).has(path));
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of review.comments)
      counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    return counts;
  }, [review.comments]);
  const isReviewed = useCallback(
    (file: ChangedFile) => reviewed.get(file.path) === file.fingerprint,
    [reviewed],
  );
  function storeReviews(entries: Map<string, string>) {
    setReviewedState({ key: reviewKey, entries });
    save(reviewKey, JSON.stringify([...entries]));
  }
  function toggleReviewed(file: ChangedFile) {
    const next = new Map(reviewed);
    if (isReviewed(file)) next.delete(file.path);
    else next.set(file.path, file.fingerprint);
    storeReviews(next);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("theme", theme);
  }, [theme]);
  useEffect(() => {
    save("layout", layout);
  }, [layout]);
  useEffect(() => {
    save("wrap", String(wrap));
  }, [wrap]);
  useEffect(() => {
    save("review-tools-collapsed", String(toolsCollapsed));
  }, [toolsCollapsed]);
  useEffect(() => {
    document.title = `serve-diff · ${piped ? "Piped diff" : "Local diff"}`;
  }, [piped]);

  const selectFile = useCallback(
    (path: string) => {
      setSelected(path);
      const expandParents = (previous: Set<string>) => {
        const next = new Set(previous);
        for (const parent of ancestorPaths(path)) next.delete(parent);
        return next;
      };
      setClosed(expandParents);
      setFilteredClosed(expandParents);
      setCollapsed((previous) => {
        const next = new Set(previous);
        next.delete(path);
        return next;
      });
      sidebar.closeMobile();
      requestAnimationFrame(() => {
        viewer.current?.scrollTo({
          type: "item",
          id: path,
          align: "start",
          behavior: "instant",
        });
        for (const row of document.querySelectorAll<HTMLElement>(
          "#file-tree .file-row",
        ))
          if (row.dataset.path === path)
            row.scrollIntoView({ block: "nearest" });
      });
    },
    [sidebar.closeMobile],
  );
  function changeMode(value: DiffMode) {
    if (value === mode || piped) return;
    setMode(value);
    setCollapsed(new Set());
  }
  function navigateComment(comment: ReviewComment) {
    if (comment.scope !== mode && !piped) {
      setPendingComment(comment);
      changeMode(comment.scope);
      return;
    }
    if (!anchored(comment, repository)) {
      setTab("comments");
      sidebar.show();
      review.setFeedback(
        "This comment belongs to an earlier diff. Its original code context is preserved below.",
      );
      return;
    }
    setFilter("");
    setPendingComment(comment);
    selectFile(comment.path);
  }
  // Navigate only after the requested scope and its parsed previews are installed.
  useEffect(() => {
    if (
      !pendingComment ||
      diff.busy ||
      repository?.mode !== pendingComment.scope
    )
      return;
    if (anchored(pendingComment, repository)) {
      setFilter("");
      selectFile(pendingComment.path);
      const frame = requestAnimationFrame(() => {
        viewer.current?.scrollTo({
          type: "line",
          id: pendingComment.path,
          lineNumber: pendingComment.end,
          side: pendingComment.side,
          align: "center",
        });
        setPendingComment(null);
      });
      return () => cancelAnimationFrame(frame);
    }
    setTab("comments");
    setPendingComment(null);
  }, [pendingComment, diff.busy, repository, selectFile]);

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
    [theme, layout, wrap],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event
          .composedPath()
          .some(
            (target) =>
              target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement ||
              (target instanceof HTMLElement && target.isContentEditable),
          ) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        sidebar.show();
        setTab("files");
        requestAnimationFrame(() => search.current?.focus());
      }
      if (event.key.toLowerCase() === "r") diff.refresh();
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const index = Math.max(
          0,
          files.findIndex((file) => file.path === activePath),
        );
        const file =
          files[
            Math.max(
              0,
              Math.min(files.length - 1, index + (event.key === "j" ? 1 : -1)),
            )
          ];
        if (file) selectFile(file.path);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [files, activePath, sidebar.show, diff.refresh, selectFile]);

  const editor = draft ? (
    <CommentEditor
      draft={draft}
      onChange={(body) =>
        setDraft((previous) => (previous ? { ...previous, body } : null))
      }
      onSave={review.submit}
      onCancel={review.cancel}
    />
  ) : null;
  function card(comment: ReviewComment, inSidebar = false) {
    return (
      <CommentCard
        key={comment.id}
        comment={comment}
        sidebar={inSidebar}
        repository={repository}
        onNavigate={navigateComment}
        onEdit={(comment) => {
          if (review.edit(comment)) navigateComment(comment);
        }}
        onToggle={review.toggle}
        onDelete={review.remove}
      />
    );
  }
  const allFiles = repository?.files ?? [];
  const additions = allFiles.reduce((sum, file) => sum + file.additions, 0);
  const deletions = allFiles.reduce((sum, file) => sum + file.deletions, 0);
  const openComments = review.comments.filter(
    (comment) => comment.status === "open",
  ).length;
  const scopeDescription = piped
    ? "Command output · fixed snapshot"
    : mode === "staged"
      ? "HEAD → index"
      : mode === "unstaged"
        ? "Index → working tree, including untracked files"
        : "HEAD → working tree, including untracked files";
  const connection = !diff.connected
    ? diff.busy && !repository
      ? "Connecting…"
      : "Disconnected"
    : piped
      ? "Fixed snapshot"
      : "Watching changes";
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
    <>
      <header className="topbar">
        <button
          type="button"
          id="sidebar-toggle"
          className="icon-button"
          aria-controls="sidebar"
          aria-expanded={sidebar.expanded}
          aria-label={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
          title={`${sidebar.expanded ? "Hide" : "Show"} file sidebar`}
          onClick={sidebar.toggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="1.5" />
            <path d="M15 3v18" />
            <path
              d={sidebar.expanded ? "m11 8-4 4 4 4Z" : "m7 8 4 4-4 4Z"}
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </button>
        <a className="brand" href="/" aria-label="serve-diff home">
          <span className="brand-mark">±</span>
          <span className="brand-name">serve-diff</span>
        </a>
        <span className="header-divider" />
        <div className="header-heading">
          <div className="header-title">
            <h1 id="changes-title">{piped ? "Piped diff" : "Local diff"}</h1>
            {!piped && (
              <span id="repo-name">
                {repository?.name ?? "Local repository"}
              </span>
            )}
          </div>
          <p
            id="repo-path"
            title={piped ? "Re-run your command to update" : repository?.root}
          >
            {piped
              ? "Read from stdin · Re-run your command to update"
              : (repository?.root ?? "Reading your repository…")}
          </p>
        </div>
        <span className="branch-badge">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {piped ? (
              <>
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
                <path d="m4 5 2.5 3L4 11m4-1h4" />
              </>
            ) : (
              <>
                <path d="M4 4v7m8-7v2a3 3 0 0 1-3 3H7" />
                <circle cx="4" cy="3" r="2" />
                <circle cx="4" cy="13" r="2" />
                <circle cx="12" cy="3" r="2" />
              </>
            )}
          </svg>
          <span id="branch">{repository?.branch ?? "—"}</span>
        </span>
        <span className="local-badge">
          <span /> Local only
        </span>
        <button
          type="button"
          id="refresh"
          className="button"
          aria-label="Refresh changes"
          title="Refresh changes (R)"
          hidden={piped}
          aria-busy={diff.busy}
          onClick={diff.refresh}
        >
          <span aria-hidden="true">↻</span>
          <span className="refresh-label">Refresh</span>
        </button>
        <button
          type="button"
          id="theme"
          className="icon-button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title="Switch theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          ◐
        </button>
      </header>
      <div className="workspace">
        <aside
          id="sidebar"
          className={`sidebar${sidebar.collapsed ? " is-collapsed" : ""}${sidebar.open ? " open" : ""}`}
          aria-label="Changed files"
        >
          <fieldset className="sidebar-tabs" aria-label="Sidebar view">
            <button
              type="button"
              id="files-tab"
              aria-pressed={tab === "files"}
              onClick={() => setTab("files")}
            >
              <span className="sidebar-tab-label">Changes</span>
              <span id="file-count" className="count">
                {allFiles.length}
              </span>
            </button>
            <button
              type="button"
              id="comments-tab"
              aria-pressed={tab === "comments"}
              onClick={() => setTab("comments")}
            >
              <span className="sidebar-tab-label">Comments</span>
              <span id="comment-count" className="count">
                {review.comments.length}
              </span>
            </button>
            <button
              type="button"
              id="tree-toggle"
              className="tree-control"
              aria-label={`${foldersCollapsed ? "Expand" : "Collapse"} all folders`}
              title={`${foldersCollapsed ? "Expand" : "Collapse"} all folders`}
              disabled={folderPaths.length === 0}
              onClick={() => {
                const paths = new Set(foldersCollapsed ? [] : folderPaths);
                if (filter) setFilteredClosed(paths);
                else setClosed(paths);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="15" height="15" rx="2" />
                <path d="M7 10.5h7M21 7v12a2 2 0 0 1-2 2H7" />
                {foldersCollapsed && <path d="M10.5 7v7" />}
              </svg>
            </button>
          </fieldset>
          <div id="file-panel" hidden={tab !== "files"}>
            <div className="search-box">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3 3" />
              </svg>
              <input
                ref={search}
                id="search"
                type="search"
                placeholder="Filter files…"
                aria-label="Filter files"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setFilteredClosed(new Set());
                }}
              />
              <kbd>/</kbd>
            </div>
            <FileNavigation
              files={files}
              selected={activePath}
              closed={filter ? filteredClosed : closed}
              filtering={!!filter}
              isReviewed={isReviewed}
              commentCounts={commentCounts}
              onToggle={(path) =>
                (filter ? setFilteredClosed : setClosed)((previous) =>
                  togglePath(previous, path),
                )
              }
              onSelect={selectFile}
            />
            <div
              id="git-legend"
              className="git-legend"
              title="Git staging indicators"
              hidden={piped}
            >
              <span>
                <i className="staging-dot staged" aria-hidden="true" />
                Staged
              </span>
              <span>
                <i className="staging-dot both" aria-hidden="true" />
                Both
              </span>
              <span>
                <i className="staging-dot unstaged" aria-hidden="true" />
                Unstaged
              </span>
              <span title="Untracked file">U Untracked</span>
            </div>
          </div>
          <section
            id="comments-panel"
            aria-label="Review comments"
            hidden={tab !== "comments"}
          >
            <p className="comment-summary">
              {openComments} open · {review.comments.length - openComments}{" "}
              resolved
            </p>
            {draft &&
              (!anchored(draft, repository) ? (
                editor
              ) : (
                <button
                  type="button"
                  className="button"
                  onClick={() => navigateComment(draft)}
                >
                  Continue draft
                </button>
              ))}
            {review.comments.map((comment) => card(comment, true))}
            {!review.comments.length && (
              <p className="comment-empty">
                Hover a code line and click + to leave feedback. Select several
                lines to comment on a range. Saved comments stay in this browser
                and can be copied for your coding agent.
              </p>
            )}
          </section>
          <section className="review-tools" aria-label="Review tools">
            <button
              type="button"
              className="review-tools-toggle"
              aria-controls="review-tools-content"
              aria-expanded={!toolsCollapsed}
              aria-label={`${toolsCollapsed ? "Show" : "Hide"} review tools`}
              onClick={() => setToolsCollapsed((previous) => !previous)}
            >
              Review tools
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d={toolsCollapsed ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} />
              </svg>
            </button>
            <div id="review-tools-content" hidden={toolsCollapsed}>
              <div className="copy-comments-bar">
                <button
                  type="button"
                  id="copy-comments"
                  className="button"
                  disabled={!review.comments.length}
                  onClick={() => {
                    void review.copy();
                  }}
                >
                  Copy comments
                </button>
                <p id="comment-feedback" role="status" aria-live="polite">
                  {review.feedback}
                </p>
              </div>
              <div className="sidebar-bottom">
                <div className="summary-label">CHANGE SUMMARY</div>
                <div className="summary-row">
                  <span>Files changed</span>
                  <strong id="summary-files">{allFiles.length}</strong>
                </div>
                <div className="summary-row">
                  <span>Additions</span>
                  <strong id="additions" className="positive">
                    +{additions.toLocaleString()}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Deletions</span>
                  <strong id="deletions" className="negative">
                    −{deletions.toLocaleString()}
                  </strong>
                </div>
                <div
                  id="change-bar"
                  className="change-bar"
                  style={{ opacity: additions + deletions ? 1 : 0.15 }}
                >
                  <span
                    style={{
                      width: `${additions + deletions ? (additions / (additions + deletions)) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="review-progress">
                  <span id="review-count">
                    {allFiles.filter(isReviewed).length} of {allFiles.length}{" "}
                    reviewed
                  </span>
                  <button
                    type="button"
                    id="reset-reviewed"
                    title="Clear reviewed files"
                    onClick={() => storeReviews(new Map())}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </section>
          <div className="sidebar-footer">
            <span className="live-dot" />
            <span id="connection">{connection}</span>
            <span className="read-only">Read-only</span>
          </div>
        </aside>
        <hr
          id="sidebar-resizer"
          aria-label="Resize file sidebar"
          aria-orientation="vertical"
          aria-valuemin={200}
          aria-valuemax={520}
          aria-valuenow={sidebar.width}
          tabIndex={0}
          hidden={sidebar.collapsed || sidebar.mobile}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.classList.add("resizing-sidebar");
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              sidebar.setWidth(event.clientX);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() =>
            document.body.classList.remove("resizing-sidebar")
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              sidebar.setWidth(
                sidebar.width + (event.key === "ArrowRight" ? 20 : -20),
              );
            }
          }}
        />
        <main>
          <div className="toolbar">
            <fieldset
              id="diff-scope"
              className="segmented modes"
              aria-label="Diff scope"
              hidden={piped}
            >
              {["all", "staged", "unstaged"].map((value) => (
                <button
                  key={value}
                  type="button"
                  data-mode={value}
                  aria-pressed={mode === value}
                  onClick={() => {
                    if (isDiffMode(value)) changeMode(value);
                  }}
                >
                  {value === "all"
                    ? "All changes"
                    : value === "staged"
                      ? "Staged"
                      : "Unstaged"}
                </button>
              ))}
            </fieldset>
            <div className="toolbar-spacer" />
            <button
              type="button"
              id="collapse-all"
              className="quiet-button"
              title="Collapse or expand all files"
              onClick={() =>
                setCollapsed(
                  allCollapsed
                    ? new Set()
                    : new Set(files.map((file) => file.path)),
                )
              }
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <button
              type="button"
              id="wrap"
              className="quiet-button"
              aria-pressed={wrap}
              title="Wrap long lines"
              onClick={() => setWrap(!wrap)}
            >
              Wrap
            </button>
            <fieldset className="segmented" aria-label="Diff layout">
              <button
                type="button"
                data-layout="split"
                aria-pressed={layout === "split"}
                onClick={() => setLayout("split")}
              >
                Split
              </button>
              <button
                type="button"
                data-layout="unified"
                aria-pressed={layout === "unified"}
                onClick={() => setLayout("unified")}
              >
                Unified
              </button>
            </fieldset>
          </div>
          <div id="notice" role="status" hidden={!diff.notice}>
            {diff.notice}
          </div>
          <div className="review-surface">
            <section id="viewer" aria-label="Code differences">
              <CodeView
                ref={viewer}
                items={items}
                options={options}
                style={{ height: "100%", width: "100%" }}
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
                      <path
                        d={item.collapsed ? "m6 4 4 4-4 4" : "m4 6 4 4 4-4"}
                      />
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
                  annotation.metadata.kind === "draft"
                    ? editor
                    : card(annotation.metadata.comment)
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
      </div>
      {review.copyText !== null && (
        <CopyDialog text={review.copyText} onClose={review.closeCopy} />
      )}
    </>
  );
}
