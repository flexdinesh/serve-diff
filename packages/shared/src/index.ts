export type DiffMode = "all" | "staged" | "unstaged";

export function isDiffMode(value: unknown): value is DiffMode {
  return value === "all" || value === "staged" || value === "unstaged";
}

export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: string;
  indexStatus: string;
  worktreeStatus: string;
  additions: number;
  deletions: number;
  binary: boolean;
  fingerprint: string;
  recreated?: boolean;
}

export interface RepositoryDiff {
  source?: "stdin";
  root: string;
  name: string;
  branch: string;
  head: string | null;
  mode: DiffMode;
  files: ChangedFile[];
  revision: string;
}

export interface FilePatch {
  patch: string;
  message: string | null;
  contents?: { before: string; after: string };
}
