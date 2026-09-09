import type { CodeViewHandle } from "@pierre/diffs/react";
import type { ChangedFile, DiffMode } from "@serve-diff/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ancestorPaths } from "./file-tree.ts";
import { readDiffTheme, readLineDiffType } from "./display-options.ts";
import { save, saved, savedReviews } from "./preferences.ts";
import {
  anchored,
  type CommentAnnotation,
  type ReviewComment,
} from "./review-model.ts";
import { useDiff } from "./use-diff.ts";
import { useReview } from "./use-review.ts";
import { useSidebar } from "./use-sidebar.ts";

export function togglePath(paths: Set<string>, path: string) {
  const next = new Set(paths);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

// Shared source, navigation, appearance, and review state live above all page sections.
// Keeping one draft here also lets the server polling pause while either editor is open.
function usePageState() {
  const [mode, setMode] = useState<DiffMode>("all");
  const [layout, setLayout] = useState<"split" | "unified">(() =>
    saved("layout") === "unified" ? "unified" : "split",
  );
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    saved("theme") === "dark" ? "dark" : "light",
  );
  const [wrap, setWrap] = useState(() => saved("wrap") === "true");
  const [diffTheme, setDiffTheme] = useState(() =>
    readDiffTheme(saved("diff-theme")),
  );
  const [lineDiffType, setLineDiffType] = useState(() =>
    readLineDiffType(saved("line-diff-type")),
  );
  const [tab, setTab] = useState<"files" | "comments">("files");
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
    save("diff-theme", diffTheme);
  }, [diffTheme]);
  useEffect(() => {
    save("line-diff-type", lineDiffType);
  }, [lineDiffType]);
  useEffect(() => {
    document.title = `serve-diff · ${piped ? "Piped diff" : "Local diff"}`;
  }, [piped]);

  const selectFile = useCallback(
    (path: string) => {
      setSelected(path);
      const expandParents = (previous: Set<string>) => {
        const parents = ancestorPaths(path);
        if (!parents.some((parent) => previous.has(parent))) return previous;
        const next = new Set(previous);
        for (const parent of parents) next.delete(parent);
        return next;
      };
      setClosed(expandParents);
      setFilteredClosed(expandParents);
      setCollapsed((previous) => {
        if (!previous.has(path)) return previous;
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
        document
          .querySelector<HTMLElement>(
            `#file-tree .file-row[data-path="${CSS.escape(path)}"]`,
          )
          ?.scrollIntoView({ block: "nearest" });
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

  return {
    source: { diff, repository, mode, piped, changeMode },
    display: {
      theme,
      setTheme,
      layout,
      setLayout,
      wrap,
      setWrap,
      diffTheme,
      setDiffTheme,
      lineDiffType,
      setLineDiffType,
      collapsed,
      setCollapsed,
    },
    navigation: {
      tab,
      setTab,
      filter,
      setFilter,
      files,
      activePath,
      closed,
      setClosed,
      filteredClosed,
      setFilteredClosed,
      selectFile,
      search,
    },
    reviewed: {
      isReviewed,
      toggleReviewed,
      resetReviewed: () => storeReviews(new Map()),
    },
    draft,
    setDraft,
    review,
    sidebar,
    viewer,
    navigateComment,
  };
}

const AppContext = createContext<ReturnType<typeof usePageState> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const state = usePageState();
  return <AppContext value={state}>{children}</AppContext>;
}

export function useAppState() {
  const state = useContext(AppContext);
  if (!state) throw new Error("Page components require AppProvider");
  return state;
}
