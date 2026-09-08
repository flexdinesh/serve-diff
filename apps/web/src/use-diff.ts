import {
  type CodeViewItem,
  parseDiffFromFile,
  parsePatchFiles,
} from "@pierre/diffs";
import {
  type ChangedFile,
  type DiffMode,
  isDiffMode,
  type RepositoryDiff,
} from "@serve-diff/shared";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { CommentAnnotation } from "./review-model.ts";

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
function messageItem(
  file: ChangedFile,
  message: string,
): CodeViewItem<CommentAnnotation> {
  return {
    id: file.path,
    type: "file",
    file: { name: file.path, contents: `${message}\n`, lang: "text" },
  };
}
interface Preview {
  fingerprint: string;
  item: CodeViewItem<CommentAnnotation>;
  additions: number;
  deletions: number;
}
interface DiffState {
  repository: RepositoryDiff | null;
  items: Map<string, CodeViewItem<CommentAnnotation>>;
  busy: boolean;
  notice: string;
  connected: boolean;
}
const initialState: DiffState = {
  repository: null,
  items: new Map(),
  busy: false,
  notice: "",
  connected: false,
};

// Own polling and cancellation in one effect; drafts pause polling and scope changes
// abort stale requests. Cached previews retain their identity between refreshes.
export function useDiff(mode: DiffMode, composing: boolean) {
  const [state, setState] = useState<DiffState>(initialState);
  const cache = useRef(new Map<string, Preview>());
  const refreshRef = useRef<(force: boolean) => void>(() => {});
  const paused = useEffectEvent(() => composing);
  const refresh = useCallback(() => refreshRef.current(true), []);
  useEffect(() => {
    let disposed = false;
    let busy = false;
    let retry = false;
    let current: RepositoryDiff | null = null;
    let controller = new AbortController();
    cache.current.clear();
    setState(initialState);
    async function load(force: boolean) {
      if (
        disposed ||
        (!force && (busy || paused() || current?.source === "stdin"))
      )
        return;
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      busy = true;
      setState((previous) => ({ ...previous, busy: true }));
      try {
        const data = await getJson(`/api/diff?mode=${mode}`, signal);
        if (!isSnapshot(data)) throw new Error("Invalid repository response");
        if (signal.aborted || disposed) return;
        if (!force && !retry && current?.revision === data.revision) {
          setState((previous) => ({
            ...previous,
            connected: true,
            notice: "",
          }));
          return;
        }
        current = data;
        const paths = new Set(data.files.map((file) => file.path));
        for (const path of cache.current.keys())
          if (!paths.has(path)) cache.current.delete(path);
        const items = new Map<string, CodeViewItem<CommentAnnotation>>();
        const pending: ChangedFile[] = [];
        for (const file of data.files) {
          const cached = cache.current.get(file.path);
          if (cached?.fingerprint === file.fingerprint) {
            items.set(file.path, cached.item);
            file.additions = cached.additions;
            file.deletions = cached.deletions;
          } else {
            items.set(file.path, messageItem(file, "Loading diff…"));
            pending.push(file);
          }
        }
        setState({
          repository: {
            ...data,
            files: data.files.map((file) => ({ ...file })),
          },
          items: new Map(items),
          busy: true,
          notice: "",
          connected: true,
        });
        let next = 0;
        let failed = 0;
        let loadedBytes = 0;
        async function loadNext() {
          while (next < pending.length && !signal.aborted) {
            const file = pending[next++];
            if (!file) continue;
            try {
              const body = await getJson(
                `/api/file?${new URLSearchParams({ mode, path: file.path, version: file.fingerprint })}`,
                signal,
              );
              if (
                !record(body) ||
                typeof body.patch !== "string" ||
                !(body.message === null || typeof body.message === "string")
              )
                throw new Error("Invalid patch response");
              if (signal.aborted || disposed) return;
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
                      ? parsePatchFiles(
                          body.patch,
                          file.fingerprint,
                          true,
                        ).flatMap((patch) => patch.files)[0]
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
              cache.current.set(file.path, {
                fingerprint: file.fingerprint,
                item,
                additions: file.additions,
                deletions: file.deletions,
              });
            } catch (error) {
              if (signal.aborted || disposed) return;
              failed++;
              items.set(
                file.path,
                messageItem(
                  file,
                  error instanceof Error
                    ? error.message
                    : "Unable to load diff",
                ),
              );
            }
          }
        }
        await Promise.all(Array.from({ length: 4 }, loadNext));
        if (signal.aborted || disposed) return;
        retry = failed > 0;
        setState({
          repository: data,
          items,
          busy: false,
          connected: true,
          notice: failed
            ? `${failed} file previews could not load. Refresh to retry.`
            : "",
        });
      } catch (error) {
        if (signal.aborted || disposed) return;
        setState((previous) => ({
          ...previous,
          connected: false,
          notice:
            error instanceof Error
              ? error.message
              : "Unable to connect to the server",
        }));
      } finally {
        if (!signal.aborted && !disposed) {
          busy = false;
          setState((previous) => ({ ...previous, busy: false }));
        }
      }
    }
    refreshRef.current = (force) => {
      void load(force);
    };
    void load(true);
    const check = () => {
      if (!document.hidden) void load(false);
    };
    const timer = setInterval(check, 3000);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [mode]);
  return { ...state, refresh };
}
