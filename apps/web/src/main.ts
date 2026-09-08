import {
  CodeView,
  type CodeViewItem,
  type CodeViewOptions,
  parseDiffFromFile,
  parsePatchFiles,
} from "@pierre/diffs";
import {
  type ChangedFile,
  type DiffMode,
  isDiffMode,
  type RepositoryDiff,
} from "@serve-diff/shared";
import "./style.css";
import "./review.css";
import { Comments } from "./comments.ts";
import {
  fileIcon,
  folderIcon,
  gitDecoration,
  statusBadge,
} from "./file-decoration.ts";
import {
  ancestorPaths,
  buildFileTree,
  type FileTreeNode,
} from "./file-tree.ts";
import type { CommentAnnotation, ReviewComment } from "./review-model.ts";
import { setupSidebar } from "./sidebar.ts";

function element(id: string): HTMLElement {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing UI element: ${id}`);
  return result;
}
function text(id: string, value: string) {
  element(id).textContent = value;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isFile(value: unknown): value is ChangedFile {
  return (
    record(value) &&
    typeof value.path === "string" &&
    (value.oldPath === null || typeof value.oldPath === "string") &&
    typeof value.status === "string" &&
    typeof value.indexStatus === "string" &&
    typeof value.worktreeStatus === "string" &&
    typeof value.additions === "number" &&
    typeof value.deletions === "number" &&
    typeof value.binary === "boolean" &&
    typeof value.fingerprint === "string"
  );
}
function isSnapshot(value: unknown): value is RepositoryDiff {
  return (
    record(value) &&
    typeof value.root === "string" &&
    (value.source === undefined || value.source === "stdin") &&
    typeof value.name === "string" &&
    typeof value.branch === "string" &&
    (value.head === null || typeof value.head === "string") &&
    isDiffMode(value.mode) &&
    typeof value.revision === "string" &&
    Array.isArray(value.files) &&
    value.files.every(isFile)
  );
}
async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      record(body) && typeof body.error === "string"
        ? body.error
        : "Unable to load changes",
    );
  return body;
}
function saved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Browsing without persistent storage still works. */
  }
}

let mode: DiffMode = "all";
let layout: "split" | "unified" =
  saved("layout") === "unified" ? "unified" : "split";
let theme: "light" | "dark" = saved("theme") === "dark" ? "dark" : "light";
let wrap = saved("wrap") === "true";
let current: RepositoryDiff | null = null;
let selected = "";
let filter = "";
let generation = 0;
let version = 0;
let busy = false;
let retryPreviews = false;
let controller = new AbortController();
let allCollapsed = false;
const collapsed = new Set<string>();
const closedDirectories = new Set<string>();
const filteredClosedDirectories = new Set<string>();
const items = new Map<string, CodeViewItem<CommentAnnotation>>();
const cache = new Map<
  string,
  {
    fingerprint: string;
    item: CodeViewItem<CommentAnnotation>;
    additions: number;
    deletions: number;
  }
>();
const reviewed = new Map<string, string>();
const viewerElement = element("viewer");
const viewer = new CodeView<CommentAnnotation, undefined>();
viewer.setup(viewerElement);
const sidebar = setupSidebar(
  element("sidebar"),
  element("sidebar-toggle"),
  element("sidebar-resizer"),
);
const copyButton = element("copy-comments");
if (!(copyButton instanceof HTMLButtonElement))
  throw new Error("Missing copy button");
let pendingComment: ReviewComment | null = null;
const comments = new Comments({
  container: element("comments-panel"),
  copyButton,
  count: element("comment-count"),
  feedback: element("comment-feedback"),
  repository: () => current,
  onChange: () => {
    renderItems();
    renderTree();
  },
  onNavigate: navigateComment,
});

function sidebarTab(tab: "files" | "comments") {
  element("file-panel").hidden = tab !== "files";
  element("comments-panel").hidden = tab !== "comments";
  element("files-tab").setAttribute("aria-pressed", String(tab === "files"));
  element("comments-tab").setAttribute(
    "aria-pressed",
    String(tab === "comments"),
  );
}
function navigateComment(comment: ReviewComment) {
  if (comment.scope !== mode) {
    pendingComment = comment;
    changeMode(comment.scope);
    return;
  }
  const file = current?.files.find((file) => file.path === comment.path);
  if (!file || file.fingerprint !== comment.fingerprint) {
    sidebarTab("comments");
    sidebar.show();
    text(
      "comment-feedback",
      "This comment belongs to an earlier diff. Its original code context is preserved below.",
    );
    return;
  }
  filter = "";
  const search = element("search");
  if (search instanceof HTMLInputElement) search.value = "";
  selectFile(comment.path);
  viewer.scrollTo({
    type: "line",
    id: comment.path,
    lineNumber: comment.end,
    side: comment.side,
    align: "center",
  });
}

function reviewKey() {
  return `reviewed:${current?.root ?? ""}:${mode}`;
}
function storeReviewed() {
  save(reviewKey(), JSON.stringify([...reviewed]));
}
function loadReviewed() {
  reviewed.clear();
  try {
    const data: unknown = JSON.parse(saved(reviewKey()) ?? "[]");
    if (Array.isArray(data))
      for (const entry of data) {
        if (
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "string"
        )
          reviewed.set(entry[0], entry[1]);
      }
  } catch {
    /* Ignore malformed local preferences. */
  }
}
function isReviewed(file: ChangedFile) {
  return reviewed.get(file.path) === file.fingerprint;
}
function visibleFiles() {
  return (
    current?.files.filter((file) =>
      file.path.toLowerCase().includes(filter.toLowerCase()),
    ) ?? []
  );
}

function updateOptions() {
  document.documentElement.dataset.theme = theme;
  save("theme", theme);
  save("layout", layout);
  save("wrap", String(wrap));
  element("theme").setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
  );
  element("wrap").setAttribute("aria-pressed", String(wrap));
  for (const button of document.querySelectorAll<HTMLElement>("[data-layout]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.layout === layout),
    );
  const options: CodeViewOptions<CommentAnnotation, undefined> = {
    theme: { light: "pierre-light", dark: "pierre-dark" },
    themeType: theme,
    diffStyle: layout,
    overflow: wrap ? "wrap" : "scroll",
    diffIndicators: "bars",
    stickyHeaders: true,
    enableLineSelection: true,
    enableGutterUtility: true,
    onGutterUtilityClick(range, context) {
      if (context.item.type !== "diff") return;
      const file = current?.files.find((file) => file.path === context.item.id);
      if (file) comments.begin(file, context.item.fileDiff, range);
    },
    onLineEnter(_event, context) {
      // Pierre creates its gutter button on hover; label it once it is mounted.
      requestAnimationFrame(() => {
        const button = context.element?.shadowRoot?.querySelector(
          "[data-utility-button]",
        );
        button?.setAttribute("aria-label", "Add review comment");
      });
    },
    renderAnnotation(annotation) {
      return comments.renderAnnotation(annotation.metadata);
    },
    lineHoverHighlight: "number",
    layout: { paddingTop: 0, paddingBottom: 24, gap: 1 },
    renderHeaderPrefix(_file, context) {
      const button = document.createElement("button");
      button.className = "diff-collapse";
      button.textContent = context.item.collapsed ? "›" : "⌄";
      button.setAttribute(
        "aria-label",
        `${context.item.collapsed ? "Expand" : "Collapse"} ${context.item.id}`,
      );
      button.setAttribute("aria-expanded", String(!context.item.collapsed));
      button.onclick = () => {
        if (collapsed.has(context.item.id)) collapsed.delete(context.item.id);
        else collapsed.add(context.item.id);
        renderItems();
      };
      return button;
    },
    renderHeaderMetadata(_file, context) {
      const file = current?.files.find(
        (entry) => entry.path === context.item.id,
      );
      if (!file) return null;
      const button = document.createElement("button");
      button.className = "review-button";
      button.textContent = isReviewed(file) ? "✓ Viewed" : "☐ Viewed";
      button.setAttribute(
        "aria-label",
        `Mark ${file.path} ${isReviewed(file) ? "unreviewed" : "reviewed"}`,
      );
      button.setAttribute("aria-pressed", String(isReviewed(file)));
      button.onclick = () => {
        if (isReviewed(file)) reviewed.delete(file.path);
        else reviewed.set(file.path, file.fingerprint);
        storeReviewed();
        renderTree();
        renderSummary();
        renderItems();
      };
      return button;
    },
  };
  viewer.setOptions(options);
}

function messageItem(
  file: ChangedFile,
  message: string,
): CodeViewItem<CommentAnnotation> {
  return {
    id: file.path,
    type: "file",
    file: { name: file.path, contents: `${message}\n`, lang: "text" },
    version: ++version,
  };
}

function showEmpty(title: string, description: string) {
  const host = element("empty");
  const heading = host.querySelector("h2");
  const paragraph = host.querySelector("p");
  if (heading) heading.textContent = title;
  if (paragraph) paragraph.textContent = description;
  host.hidden = false;
}
function notice(message: string) {
  text("notice", message);
  element("notice").hidden = !message;
}

function renderItems() {
  const files = visibleFiles();
  viewer.setItems(
    files.flatMap((file) => {
      const item = items.get(file.path);
      if (!item) return [];
      return [
        {
          ...item,
          ...(item.type === "diff"
            ? { annotations: comments.annotations(file) }
            : {}),
          collapsed: collapsed.has(file.path),
          version: ++version,
        },
      ];
    }),
  );
  if (files.length > 0) element("empty").hidden = true;
  else if (filter)
    showEmpty(
      "No matching files",
      "Try a different filename or clear the filter.",
    );
  else if (current?.source === "stdin")
    showEmpty(
      "No file changes in this input",
      "Run a command that emits a Git patch, then pipe it into serve-diff.",
    );
  else
    showEmpty(
      mode === "staged" ? "Nothing staged" : "Working tree is clean",
      mode === "staged"
        ? "Stage changes with Git to review them here."
        : "Changes will appear here as you edit. Ignored files stay hidden.",
    );
}
function renderTree() {
  const tree = element("file-tree");
  const focused = document.activeElement;
  const focusPath =
    focused instanceof HTMLElement && tree.contains(focused)
      ? focused.dataset.treePath
      : undefined;
  tree.replaceChildren();
  function renderNodes(nodes: FileTreeNode[], depth: number): HTMLUListElement {
    const list = document.createElement("ul");
    list.className = "tree-list";
    for (const node of nodes) {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.treePath = node.path;
      button.style.paddingLeft = `${8 + depth * 16}px`;
      if (node.kind === "folder") {
        const closed = filter ? filteredClosedDirectories : closedDirectories;
        const open = !closed.has(node.path);
        button.className = "tree-folder";
        button.title = node.path;
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute(
          "aria-label",
          `${open ? "Collapse" : "Expand"} folder ${node.path}`,
        );
        const chevron = document.createElement("span");
        chevron.className = "tree-chevron";
        chevron.textContent = open ? "⌄" : "›";
        const icon = folderIcon(open);
        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = node.name;
        button.append(chevron, icon, name);
        button.onclick = () => {
          if (closed.has(node.path)) closed.delete(node.path);
          else closed.add(node.path);
          renderTree();
        };
        row.append(button);
        if (open) row.append(renderNodes(node.children, depth + 1));
      } else {
        const file = node.file;
        button.className = `file-row${isReviewed(file) ? " reviewed" : ""}`;
        button.dataset.path = file.path;
        button.setAttribute("aria-current", String(selected === file.path));
        button.title = file.oldPath
          ? `${file.oldPath} → ${file.path}`
          : file.path;
        const decoration = gitDecoration(file);
        button.title += `\n${decoration.details}`;
        button.setAttribute(
          "aria-label",
          `${file.path}, ${decoration.label}${isReviewed(file) ? ", reviewed" : ""}`,
        );
        const icon = fileIcon(file.path, isReviewed(file));
        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = node.name;
        const status = statusBadge(file);
        button.append(icon, name);
        const count = comments.countFor(file.path);
        if (count) {
          const badge = document.createElement("span");
          badge.className = "file-comment-count";
          badge.textContent = `◫ ${count}`;
          badge.setAttribute("aria-label", `${count} comments`);
          button.append(badge);
        }
        button.append(status);
        button.onclick = () => selectFile(file.path);
        row.append(button);
      }
      list.append(row);
    }
    return list;
  }
  const nodes = buildFileTree(visibleFiles());
  if (nodes.length) tree.append(renderNodes(nodes, 0));
  else {
    const hint = document.createElement("p");
    hint.className = "tree-folder";
    hint.textContent = filter ? "No matching files" : "No changed files";
    tree.append(hint);
  }
  if (focusPath)
    for (const button of tree.querySelectorAll<HTMLElement>("button"))
      if (button.dataset.treePath === focusPath)
        button.focus({ preventScroll: true });
}
function selectFile(path: string) {
  selected = path;
  for (const parent of ancestorPaths(path)) {
    closedDirectories.delete(parent);
    filteredClosedDirectories.delete(parent);
  }
  collapsed.delete(path);
  renderItems();
  renderTree();
  viewer.scrollTo({
    type: "item",
    id: path,
    align: "start",
    behavior: "instant",
  });
  for (const row of element("file-tree").querySelectorAll<HTMLElement>(
    ".file-row",
  ))
    if (row.dataset.path === path) row.scrollIntoView({ block: "nearest" });
  sidebar.closeMobile();
}
function renderSummary() {
  const files = current?.files ?? [];
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  text("file-count", String(files.length));
  text("summary-files", String(files.length));
  text("additions", `+${additions.toLocaleString()}`);
  text("deletions", `−${deletions.toLocaleString()}`);
  const bar = element("change-bar").firstElementChild;
  if (bar instanceof HTMLElement)
    bar.style.width = `${additions + deletions ? (additions / (additions + deletions)) * 100 : 0}%`;
  element("change-bar").style.opacity = additions + deletions ? "1" : ".15";
  text(
    "review-count",
    `${files.filter(isReviewed).length} of ${files.length} reviewed`,
  );
}

// Fetch patches with bounded concurrency; keep unchanged render data between refreshes.
async function refresh(force = false) {
  if (busy && !force) return;
  if (comments.composing && !force) return;
  const turn = ++generation;
  controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  busy = true;
  element("refresh").setAttribute("aria-busy", "true");
  try {
    const data = await getJson(`/api/diff?mode=${mode}`, signal);
    if (!isSnapshot(data)) throw new Error("Invalid repository response");
    const requestMode = data.mode;
    if (turn !== generation) return;
    text(
      "connection",
      data.source === "stdin" ? "Fixed snapshot" : "Watching changes",
    );
    if (!force && !retryPreviews && current?.revision === data.revision) {
      notice("");
      return;
    }
    current = data;
    comments.syncRepository();
    loadReviewed();
    text("repo-name", data.name);
    text("branch", data.branch);
    const piped = data.source === "stdin";
    text(
      "repo-path",
      piped ? "Read from stdin · Re-run your command to update" : data.root,
    );
    text("source-label", piped ? "PIPED DIFF" : "WORKING TREE");
    text("changes-title", piped ? "Piped changes" : "Local changes");
    element("diff-scope").hidden = piped;
    element("git-legend").hidden = piped;
    element("refresh").hidden = piped;
    if (piped) text("scope-description", "Command output · fixed snapshot");
    document.title = `${data.name} · serve-diff`;
    const paths = new Set(data.files.map((file) => file.path));
    for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path);
    for (const path of reviewed.keys())
      if (!paths.has(path)) reviewed.delete(path);
    for (const path of collapsed) if (!paths.has(path)) collapsed.delete(path);
    if (!paths.has(selected)) selected = data.files[0]?.path ?? "";
    items.clear();
    for (const file of data.files) {
      const cached = cache.get(file.path);
      if (cached?.fingerprint === file.fingerprint) {
        items.set(file.path, cached.item);
        file.additions = cached.additions;
        file.deletions = cached.deletions;
      } else items.set(file.path, messageItem(file, "Loading diff…"));
    }
    renderTree();
    renderSummary();
    renderItems();
    notice("");
    const pending = data.files.filter(
      (file) => cache.get(file.path)?.fingerprint !== file.fingerprint,
    );
    let next = 0;
    let failed = 0;
    let loadedBytes = 0;
    async function loadNext() {
      while (next < pending.length && !signal.aborted) {
        const file = pending[next++];
        if (!file) continue;
        try {
          const body = await getJson(
            `/api/file?${new URLSearchParams({ mode: requestMode, path: file.path, version: file.fingerprint })}`,
            signal,
          );
          if (
            !record(body) ||
            typeof body.patch !== "string" ||
            !(body.message === null || typeof body.message === "string")
          )
            throw new Error("Invalid patch response");
          if (turn !== generation) return;
          const contents =
            record(body.contents) &&
            typeof body.contents.before === "string" &&
            typeof body.contents.after === "string"
              ? { before: body.contents.before, after: body.contents.after }
              : null;
          loadedBytes +=
            body.patch.length +
            (contents?.before.length ?? 0) +
            (contents?.after.length ?? 0);
          let item: CodeViewItem<CommentAnnotation>;
          if (loadedBytes > 16 * 1024 * 1024) {
            item = messageItem(
              file,
              "Preview budget exceeded (16 MiB per refresh). Narrow the diff scope to load more.",
            );
          } else {
            const parsed =
              contents && body.message === null
                ? parseDiffFromFile(
                    { name: file.path, contents: contents.before },
                    { name: file.path, contents: contents.after },
                  )
                : body.patch
                  ? parsePatchFiles(body.patch, file.fingerprint, true).flatMap(
                      (patch) => patch.files,
                    )[0]
                  : undefined;
            if (parsed && parsed.hunks.length > 0) {
              parsed.name = file.path;
              if (file.oldPath) parsed.prevName = file.oldPath;
              file.additions = parsed.hunks.reduce(
                (sum, hunk) => sum + hunk.additionLines,
                0,
              );
              file.deletions = parsed.hunks.reduce(
                (sum, hunk) => sum + hunk.deletionLines,
                0,
              );
              item = {
                id: file.path,
                type: "diff",
                fileDiff: parsed,
                version: ++version,
              };
            } else
              item = messageItem(
                file,
                body.message ??
                  (body.patch.includes("Binary files")
                    ? "Binary file changed. No text preview available."
                    : file.oldPath
                      ? `Renamed from ${file.oldPath}. No text changes.`
                      : "No text changes (empty file or file metadata changed)."),
              );
          }
          items.set(file.path, item);
          cache.set(file.path, {
            fingerprint: file.fingerprint,
            item,
            additions: file.additions,
            deletions: file.deletions,
          });
        } catch (error) {
          if (signal.aborted || turn !== generation) return;
          failed++;
          items.set(
            file.path,
            messageItem(
              file,
              error instanceof Error ? error.message : "Unable to load diff",
            ),
          );
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, loadNext));
    if (turn !== generation) return;
    renderItems();
    renderSummary();
    renderTree();
    retryPreviews = failed > 0;
    if (pendingComment) {
      const comment = pendingComment;
      pendingComment = null;
      navigateComment(comment);
    }
    if (failed) {
      notice(`${failed} file previews could not load. Refresh to retry.`);
    }
  } catch (error) {
    if (signal.aborted || turn !== generation) return;
    text("connection", "Disconnected");
    notice(
      error instanceof Error
        ? error.message
        : "Unable to connect to the server",
    );
    if (!current)
      showEmpty(
        "Cannot load changes",
        "Check that the server is running, then refresh.",
      );
  } finally {
    if (turn === generation) {
      busy = false;
      element("refresh").removeAttribute("aria-busy");
    }
  }
}

function changeMode(value: DiffMode) {
  if (current?.source === "stdin") return;
  if (value === mode) return;
  mode = value;
  current = null;
  items.clear();
  viewer.setItems([]);
  showEmpty("Loading changes", "Reading the selected Git scope…");
  cache.clear();
  collapsed.clear();
  allCollapsed = false;
  text("collapse-all", "Collapse all");
  for (const item of document.querySelectorAll<HTMLElement>("[data-mode]"))
    item.setAttribute("aria-pressed", String(item.dataset.mode === mode));
  text(
    "scope-description",
    mode === "staged"
      ? "HEAD → index"
      : mode === "unstaged"
        ? "Index → working tree, including untracked files"
        : "HEAD → working tree, including untracked files",
  );
  void refresh(true);
}
for (const button of document.querySelectorAll<HTMLElement>("[data-mode]"))
  button.onclick = () => {
    const value = button.dataset.mode;
    if (isDiffMode(value)) changeMode(value);
  };
for (const button of document.querySelectorAll<HTMLElement>("[data-layout]"))
  button.onclick = () => {
    layout = button.dataset.layout === "unified" ? "unified" : "split";
    updateOptions();
  };
element("theme").onclick = () => {
  theme = theme === "light" ? "dark" : "light";
  updateOptions();
};
element("wrap").onclick = () => {
  wrap = !wrap;
  updateOptions();
};
element("refresh").onclick = () => {
  void refresh(true);
};
element("files-tab").onclick = () => sidebarTab("files");
element("comments-tab").onclick = () => {
  sidebarTab("comments");
  comments.renderList();
};
element("tree-expand").onclick = () => {
  closedDirectories.clear();
  filteredClosedDirectories.clear();
  renderTree();
};
element("tree-collapse").onclick = () => {
  for (const file of current?.files ?? [])
    for (const path of ancestorPaths(file.path)) {
      closedDirectories.add(path);
      filteredClosedDirectories.add(path);
    }
  renderTree();
};
element("file-tree").onkeydown = (event) => {
  const buttons = [
    ...element("file-tree").querySelectorAll<HTMLButtonElement>("button"),
  ];
  const focused = document.activeElement;
  if (!(focused instanceof HTMLButtonElement)) return;
  const index = buttons.indexOf(focused);
  if (index < 0) return;
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : index + (event.key === "ArrowDown" ? 1 : -1);
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }
  if (
    event.key === "ArrowRight" &&
    focused.getAttribute("aria-expanded") === "false"
  ) {
    event.preventDefault();
    focused.click();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (focused.getAttribute("aria-expanded") === "true") focused.click();
    else {
      const parent = ancestorPaths(focused.dataset.treePath ?? "").at(-1);
      buttons.find((button) => button.dataset.treePath === parent)?.focus();
    }
  }
};
element("collapse-all").onclick = () => {
  allCollapsed = !allCollapsed;
  for (const file of visibleFiles()) {
    if (allCollapsed) collapsed.add(file.path);
    else collapsed.delete(file.path);
  }
  text("collapse-all", allCollapsed ? "Expand all" : "Collapse all");
  renderItems();
};
element("reset-reviewed").onclick = () => {
  reviewed.clear();
  storeReviewed();
  renderTree();
  renderSummary();
  renderItems();
};
element("search").oninput = (event) => {
  if (event.target instanceof HTMLInputElement) {
    filter = event.target.value;
    filteredClosedDirectories.clear();
    renderTree();
    renderItems();
  }
};
document.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return;
  if (event.key === "/") {
    event.preventDefault();
    sidebar.show();
    sidebarTab("files");
    element("search").focus();
  }
  if (event.key.toLowerCase() === "r") void refresh(true);
  if (event.key === "j" || event.key === "k") {
    event.preventDefault();
    const files = visibleFiles();
    const index = Math.max(
      0,
      files.findIndex((file) => file.path === selected),
    );
    const file =
      files[
        Math.min(
          files.length - 1,
          Math.max(0, index + (event.key === "j" ? 1 : -1)),
        )
      ];
    if (file) selectFile(file.path);
  }
});
updateOptions();
void refresh();
const timer = setInterval(() => {
  if (!document.hidden && current?.source !== "stdin") void refresh();
}, 3000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && current?.source !== "stdin") void refresh();
});
window.addEventListener("pagehide", () => {
  clearInterval(timer);
  controller.abort();
  viewer.cleanUp();
});
