import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import type { ChangedFile, RepositoryDiff } from "@serve-diff/shared";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { save, saved } from "./preferences.ts";
import {
  commentContext,
  formatComments,
  parseComments,
  type ReviewComment,
} from "./review-model.ts";

// Preserve the existing storage format so migration keeps prior reviews intact.
export function useReview(
  repository: RepositoryDiff | null,
  draft: ReviewComment | null,
  setDraft: Dispatch<SetStateAction<ReviewComment | null>>,
) {
  const root = repository?.root ?? "";
  const [stored, setStored] = useState<{
    key: string;
    comments: ReviewComment[];
  }>({ key: "", comments: [] });
  const key = root ? `serve-diff:comments:${root}` : stored.key;
  const previousRoot = useRef("");
  const comments = stored.key === key ? stored.comments : [];
  const [feedback, setFeedback] = useState("");
  const [copyText, setCopyText] = useState<string | null>(null);
  useEffect(() => {
    if (!root) return;
    if (previousRoot.current && previousRoot.current !== root) setDraft(null);
    previousRoot.current = root;
    setStored({ key, comments: parseComments(saved(key)) });
    const sync = (event: StorageEvent) => {
      if (event.key === key)
        setStored({ key, comments: parseComments(event.newValue) });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, root, setDraft]);
  function commit(next: ReviewComment[]) {
    setStored({ key, comments: next });
    if (!save(key, JSON.stringify(next)))
      setFeedback(
        "Browser storage unavailable. Copy comments to keep this session’s feedback.",
      );
  }
  function begin(
    file: ChangedFile,
    diff: FileDiffMetadata,
    range: SelectedLineRange,
  ) {
    if (draft) {
      setFeedback("Finish or cancel your current draft first.");
      return;
    }
    if (!repository) return;
    const context = commentContext(diff, range);
    if (!context) {
      setFeedback("Select up to 200 visible lines on one side to comment.");
      return;
    }
    setDraft({
      id: crypto.randomUUID(),
      path: file.path,
      scope: repository.mode,
      fingerprint: file.fingerprint,
      ...context,
      body: "",
      status: "open",
      createdAt: Date.now(),
      origin: {
        source: repository.source === "stdin" ? "stdin" : "local",
        repository: repository.name,
        branch: repository.branch,
        head: repository.head,
        revision: repository.revision,
        file: { status: file.status, oldPath: file.oldPath },
      },
    });
    setFeedback("Draft open — automatic refresh paused.");
  }
  function submit() {
    if (!draft?.body.trim()) return;
    const comment = { ...draft, body: draft.body.trim() };
    setDraft(null);
    setFeedback("Comment saved.");
    commit(
      comments.some((entry) => entry.id === comment.id)
        ? comments.map((entry) => (entry.id === comment.id ? comment : entry))
        : [...comments, comment],
    );
  }
  function cancel() {
    setDraft(null);
    setFeedback("Draft cancelled.");
  }
  function edit(comment: ReviewComment) {
    if (draft) {
      setFeedback("Finish or cancel your current draft first.");
      return false;
    }
    setDraft({ ...comment });
    setFeedback("Draft open — automatic refresh paused.");
    return true;
  }
  function toggle(comment: ReviewComment) {
    commit(
      comments.map((entry) =>
        entry.id === comment.id
          ? { ...entry, status: entry.status === "open" ? "resolved" : "open" }
          : entry,
      ),
    );
  }
  function remove(comment: ReviewComment) {
    if (draft?.id === comment.id) setDraft(null);
    commit(comments.filter((entry) => entry.id !== comment.id));
  }
  async function copy(includeResolved: boolean) {
    const copied = includeResolved
      ? comments
      : comments.filter((comment) => comment.status === "open");
    const output = formatComments(copied, includeResolved);
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setFeedback(
        `Copied ${copied.length} ${copied.length === 1 ? "comment" : "comments"} as XML.`,
      );
    } catch {
      setCopyText(output);
    }
  }
  return {
    comments,
    feedback,
    setFeedback,
    begin,
    submit,
    cancel,
    edit,
    toggle,
    remove,
    copy,
    copyText,
    closeCopy: () => setCopyText(null),
  };
}
