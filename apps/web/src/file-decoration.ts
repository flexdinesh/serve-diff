import type { ChangedFile } from "@serve-diff/shared";

export type FileKind =
  | "typescript"
  | "javascript"
  | "react"
  | "json"
  | "markdown"
  | "style"
  | "html"
  | "python"
  | "rust"
  | "go"
  | "shell"
  | "git"
  | "lock"
  | "config"
  | "image"
  | "archive"
  | "code"
  | "file";

const extensions: Record<string, FileKind> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  tsx: "react",
  jsx: "react",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  css: "style",
  scss: "style",
  sass: "style",
  less: "style",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  py: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  yaml: "config",
  yml: "config",
  toml: "config",
  ini: "config",
  env: "config",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  svg: "image",
  webp: "image",
  avif: "image",
  ico: "image",
  zip: "archive",
  gz: "archive",
  tar: "archive",
  br: "archive",
  woff: "archive",
  woff2: "archive",
  c: "code",
  h: "code",
  cpp: "code",
  cs: "code",
  java: "code",
  rb: "code",
  php: "code",
  swift: "code",
  kt: "code",
  sql: "code",
};

// Recognize special filenames before extensions (lockfiles are often YAML/JSON).
export function fileKind(path: string): FileKind {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (
    /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|cargo\.lock|poetry\.lock)$/.test(
      name,
    ) ||
    name.endsWith(".lock")
  )
    return "lock";
  if (/^\.git(ignore|attributes|modules|keep)?$/.test(name)) return "git";
  if (
    /^(\.env($|\.)|\.node-version$|\.npmrc$|\.editorconfig$|dockerfile($|\.)|makefile$|license($|\.)|.*rc$)/.test(
      name,
    )
  )
    return "config";
  return extensions[name.split(".").at(-1) ?? ""] ?? "file";
}

const labels: Record<string, string> = {
  A: "Added",
  M: "Modified",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  T: "Type changed",
  U: "Conflicted",
  "?": "Untracked",
  " ": "Unchanged",
};

// Keep change type distinct from staging: a modified file can occupy both layers.
export function gitDecoration(file: ChangedFile) {
  if (file.indexStatus === "" && file.worktreeStatus === "") {
    const label = `${labels[file.status] ?? "Changed"} · Piped diff`;
    return { code: file.status, state: "patch", label, details: label };
  }
  const conflict =
    file.status === "U" ||
    /U/.test(file.indexStatus + file.worktreeStatus) ||
    ["AA", "DD"].includes(file.indexStatus + file.worktreeStatus);
  const staged = ![" ", "?"].includes(file.indexStatus);
  const unstaged = file.worktreeStatus !== " ";
  const state = conflict
    ? "conflict"
    : staged && unstaged
      ? "both"
      : staged
        ? "staged"
        : file.status === "?"
          ? "untracked"
          : "unstaged";
  const change = conflict ? "Conflicted" : (labels[file.status] ?? "Changed");
  const stageLabel = {
    conflict: "Resolve merge conflict",
    both: "Staged and unstaged",
    staged: "Staged",
    unstaged: "Unstaged",
    untracked: "Not tracked by Git",
  }[state];
  return {
    code: conflict ? "!" : file.status === "?" ? "U" : file.status,
    state,
    label: `${change} · ${stageLabel}`,
    details: `${change} · ${stageLabel}\nIndex: ${labels[file.indexStatus] ?? file.indexStatus}\nWorking tree: ${labels[file.worktreeStatus] ?? file.worktreeStatus}`,
  };
}

function svgIcon(className: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}
function addPath(svg: SVGSVGElement, d: string) {
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", d);
  svg.append(path);
}

export function folderIcon(open: boolean) {
  const svg = svgIcon("folder-icon");
  addPath(svg, "M2 16V5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v2");
  addPath(svg, open ? "M2 16l3-7h13l-3 7Z" : "M2 8h15v8H2Z");
  return svg;
}

const shapes: Partial<Record<FileKind, string>> = {
  react:
    "M3 6c2-3 16 4 14 8S1 10 3 6Zm0 8C1 10 15 3 17 6S5 17 3 14ZM10 2c4 0 4 16 0 16s-4-16 0-16Zm0 7v2",
  json: "M7 3H5v5l-2 2 2 2v5h2m6-14h2v5l2 2-2 2v5h-2",
  markdown: "M2 5h16v11H2Zm3 8V8l2 3 2-3v5m5-5v5m-2-2 2 2 2-2",
  style: "m3 3 1 13 6 2 6-2 1-13Zm3 4h8l-1 6-3 1-3-1m0-3h6",
  html: "m7 5-5 5 5 5m6-10 5 5-5 5m-2-13-2 16",
  code: "m7 5-5 5 5 5m6-10 5 5-5 5",
  shell: "M2 4h16v12H2Zm3 3 3 3-3 3m5 0h5",
  git: "m10 1 9 9-9 9-9-9Zm-4 5 8 8m-4-4v5m0-6 4-3",
  lock: "M6 9V6a4 4 0 0 1 8 0v3M4 9h12v9H4Zm6 3v3",
  config: "M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-5 1v4",
  image: "M2 3h16v14H2Zm0 11 5-5 4 4 3-3 4 4M13 6h1v1h-1Z",
  archive: "M4 2h9l3 3v13H4Zm5 0v3h2v3H9v3h2v3H9v3",
  file: "M4 2h8l4 4v12H4Zm8 0v5h4M7 11h6m-6 3h6",
};
const monograms: Partial<Record<FileKind, string>> = {
  typescript: "TS",
  javascript: "JS",
  python: "Py",
  rust: "Rs",
  go: "Go",
};

export function fileIcon(path: string, reviewed: boolean) {
  const kind = fileKind(path);
  const wrapper = document.createElement("span");
  wrapper.className = "file-icon";
  wrapper.dataset.kind = kind;
  wrapper.setAttribute("aria-hidden", "true");
  const svg = svgIcon("file-type-icon");
  const monogram = monograms[kind];
  if (monogram) {
    addPath(svg, "M2 2h16v16H2Z");
    svg.classList.add("monogram-icon");
    const text = document.createElementNS(svg.namespaceURI, "text");
    text.setAttribute("x", "10");
    text.setAttribute("y", "13.5");
    text.textContent = monogram;
    svg.append(text);
  } else addPath(svg, shapes[kind] ?? shapes.file ?? "");
  wrapper.append(svg);
  if (reviewed) {
    const check = document.createElement("span");
    check.className = "file-reviewed-check";
    check.textContent = "✓";
    wrapper.append(check);
  }
  return wrapper;
}

export function statusBadge(file: ChangedFile) {
  const decoration = gitDecoration(file);
  const badge = document.createElement("span");
  badge.className = "file-status";
  badge.dataset.status = file.status;
  badge.dataset.state = decoration.state;
  badge.title = decoration.details;
  badge.setAttribute("aria-label", decoration.label);
  const code = document.createElement("span");
  code.textContent = decoration.code;
  badge.append(code);
  if (["staged", "unstaged", "both"].includes(decoration.state)) {
    const dot = document.createElement("span");
    dot.className = `staging-dot ${decoration.state}`;
    dot.setAttribute("aria-hidden", "true");
    badge.append(dot);
  }
  return badge;
}
