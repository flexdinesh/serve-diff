import type {
  AnnotationSide,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import {
  type DiffMode,
  isDiffMode,
  type RepositoryDiff,
} from "@serve-diff/shared";

export interface ReviewComment {
  id: string;
  path: string;
  scope: DiffMode;
  fingerprint: string;
  side: AnnotationSide;
  start: number;
  end: number;
  code: string;
  body: string;
  status: "open" | "resolved";
  createdAt: number;
}

export type CommentAnnotation =
  | { kind: "saved"; comment: ReviewComment }
  | { kind: "draft" };

// Patch arrays contain only hunks: translate file line numbers before reading them.
export function lineContext(
  diff: FileDiffMetadata,
  side: AnnotationSide,
  lineNumber: number,
): string | null {
  const lines = side === "additions" ? diff.additionLines : diff.deletionLines;
  for (const hunk of diff.hunks) {
    const start =
      side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count =
      side === "additions" ? hunk.additionCount : hunk.deletionCount;
    if (lineNumber < start || lineNumber >= start + count) continue;
    const offset = lineNumber - start;
    const index = diff.isPartial
      ? (side === "additions"
          ? hunk.additionLineIndex
          : hunk.deletionLineIndex) + offset
      : lineNumber - 1;
    const content = lines[index];
    if (content === undefined) return null;
    let remaining = offset;
    let prefix = " ";
    for (const segment of hunk.hunkContent) {
      const length =
        segment.type === "context"
          ? segment.lines
          : side === "additions"
            ? segment.additions
            : segment.deletions;
      if (remaining < length) {
        prefix =
          segment.type === "context" ? " " : side === "additions" ? "+" : "-";
        break;
      }
      remaining -= length;
    }
    return `${prefix} ${content.replace(/\r?\n$/, "")}`;
  }
  const content = !diff.isPartial ? lines[lineNumber - 1] : undefined;
  return content === undefined ? null : `  ${content.replace(/\r?\n$/, "")}`;
}

export function commentContext(
  diff: FileDiffMetadata,
  range: SelectedLineRange,
) {
  const side = range.endSide ?? range.side;
  if (side !== "additions" && side !== "deletions") return null;
  const crossSide = range.side !== undefined && range.side !== side;
  const start = crossSide ? range.end : Math.min(range.start, range.end);
  const end = crossSide ? range.end : Math.max(range.start, range.end);
  if (start < 1 || end - start > 199) return null;
  const code: string[] = [];
  for (let line = start; line <= end; line++) {
    const content = lineContext(diff, side, line);
    if (content === null) return null;
    code.push(content);
  }
  return { side, start, end, code: code.join("\n") };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function validComment(value: unknown): value is ReviewComment {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.path === "string" &&
    isDiffMode(value.scope) &&
    typeof value.fingerprint === "string" &&
    (value.side === "additions" || value.side === "deletions") &&
    typeof value.start === "number" &&
    Number.isInteger(value.start) &&
    value.start > 0 &&
    typeof value.end === "number" &&
    Number.isInteger(value.end) &&
    value.end >= value.start &&
    value.end - value.start < 200 &&
    typeof value.code === "string" &&
    typeof value.body === "string" &&
    value.body.trim().length > 0 &&
    (value.status === "open" || value.status === "resolved") &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}
export function parseComments(raw: string | null): ReviewComment[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter(validComment) : [];
  } catch {
    return [];
  }
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Preserve the captured code, side, scope, and range when handing feedback to an agent.
export function formatComments(comments: readonly ReviewComment[]): string {
  if (comments.length === 0) return "";
  const grouped = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const group = grouped.get(comment.path) ?? [];
    group.push(comment);
    grouped.set(comment.path, group);
  }
  const lines = ["<code-review-comments>"];
  for (const [path, group] of grouped) {
    const escapedPath = xml(path)
      .replaceAll("\n", "&#10;")
      .replaceAll("\r", "&#13;")
      .replaceAll("\t", "&#9;");
    lines.push(`  <file path="${escapedPath}">`);
    for (const comment of group) {
      lines.push(
        `    <comment line="${comment.start}" end-line="${comment.end}" side="${comment.side}" scope="${comment.scope}" status="${comment.status}">`,
        `      <code>${xml(comment.code)}</code>`,
        `      <body>${xml(comment.body)}</body>`,
        "    </comment>",
      );
    }
    lines.push("  </file>");
  }
  lines.push("</code-review-comments>");
  return lines.join("\n");
}

export function anchored(
  comment: ReviewComment,
  repository: RepositoryDiff | null,
) {
  return (
    comment.scope === repository?.mode &&
    repository.files.some(
      (file) =>
        file.path === comment.path && file.fingerprint === comment.fingerprint,
    )
  );
}
