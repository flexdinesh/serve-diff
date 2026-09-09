import { useMemo } from "react";
import { togglePath, useAppState } from "./app-state.tsx";
import { CommentsPanel } from "./CommentsPanel.tsx";
import { FileNavigation } from "./file-navigation.tsx";
import { ancestorPaths } from "./file-tree.ts";
import { ReviewTools } from "./ReviewTools.tsx";

export function FileExplorerNav() {
  const {
    source: { repository, piped, diff },
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
    sidebar,
    review,
    reviewed: { isReviewed },
  } = useAppState();
  const allFiles = repository?.files ?? [];
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
  const connection = !diff.connected
    ? diff.busy && !repository
      ? "Connecting…"
      : "Disconnected"
    : piped
      ? "Fixed snapshot"
      : "Watching changes";
  return (
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
      <CommentsPanel />
      <ReviewTools />
      <div className="sidebar-footer">
        <span className="live-dot" />
        <span id="connection">{connection}</span>
        <span className="read-only">Read-only</span>
      </div>
    </aside>
  );
}

export function SidebarResizer() {
  const { sidebar } = useAppState();
  return (
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
  );
}
