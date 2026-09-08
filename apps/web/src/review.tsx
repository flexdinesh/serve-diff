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
function location(comment: ReviewComment) {
  return `${comment.path}:${comment.start}${comment.end !== comment.start ? `–${comment.end}` : ""} · ${comment.side === "additions" ? "new" : "old"} · ${comment.scope}`;
}

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
  async function copy() {
    const output = formatComments(comments);
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setFeedback(
        `Copied ${comments.length} ${comments.length === 1 ? "comment" : "comments"} as XML.`,
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

export function CommentEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: ReviewComment;
  onChange: (body: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const id = draft.id;
  useEffect(() => {
    if (!id) return;
    input.current?.focus({ preventScroll: true });
    input.current?.scrollIntoView({ block: "nearest" });
  }, [id]);
  return (
    <form
      className="comment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <strong>Comment on {location(draft)}</strong>
      <textarea
        ref={input}
        placeholder="Leave a review comment…"
        aria-label="Review comment"
        rows={3}
        value={draft.body}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="comment-actions">
        <span>⌘ / Ctrl + Enter to save</span>
        <button type="button" className="quiet-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="button primary-button"
          disabled={!draft.body.trim()}
        >
          Save comment
        </button>
      </div>
    </form>
  );
}

export function CommentCard({
  comment,
  sidebar = false,
  repository,
  onNavigate,
  onEdit,
  onToggle,
  onDelete,
}: {
  comment: ReviewComment;
  sidebar?: boolean;
  repository: RepositoryDiff | null;
  onNavigate: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment) => void;
  onToggle: (comment: ReviewComment) => void;
  onDelete: (comment: ReviewComment) => void;
}) {
  return (
    <article
      className={`comment-card${comment.status === "resolved" ? " resolved" : ""}`}
      data-comment-id={comment.id}
    >
      <div className="comment-card-header">
        {sidebar ? (
          <button
            type="button"
            className="comment-location"
            title={location(comment)}
            onClick={() => onNavigate(comment)}
          >
            {location(comment)}
          </button>
        ) : (
          <span>
            Review · {comment.side === "additions" ? "new" : "old"} line{" "}
            {comment.start}
            {comment.end !== comment.start ? `–${comment.end}` : ""}
          </span>
        )}
        <span className="comment-state">
          {comment.status === "resolved" ? "Resolved" : "Open"}
        </span>
      </div>
      <p className="comment-body">{comment.body}</p>
      {sidebar && (
        <>
          {!anchored(comment, repository) && (
            <p className="comment-outdated">
              {comment.scope !== repository?.mode
                ? `From ${comment.scope} changes`
                : "Earlier diff — original code preserved"}
            </p>
          )}
          <details>
            <summary>Code context</summary>
            <pre>{comment.code}</pre>
          </details>
        </>
      )}
      <div className="comment-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={() => onEdit(comment)}
        >
          Edit
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={() => onToggle(comment)}
        >
          {comment.status === "resolved" ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={() => onDelete(comment)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function CopyDialog({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    input.current?.focus();
    input.current?.select();
    return () => node?.close();
  }, []);
  return (
    <dialog ref={dialog} className="copy-dialog" onCancel={onClose}>
      <h2>Copy review comments</h2>
      <p>
        Clipboard access is unavailable. Copy the selected text with ⌘C /
        Ctrl+C.
      </p>
      <textarea ref={input} value={text} readOnly aria-label="Comments XML" />
      <button type="button" className="button" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
