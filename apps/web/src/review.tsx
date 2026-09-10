import type { RepositoryDiff } from "@serve-diff/shared";
import { useEffect, useRef } from "react";
import { useAppState } from "./app-state.tsx";
import { anchored, type ReviewComment } from "./review-model.ts";

function location(comment: ReviewComment) {
  return `${comment.path}:${comment.start}${comment.end !== comment.start ? `–${comment.end}` : ""} · ${comment.side === "additions" ? "new" : "old"} · ${comment.scope}`;
}

// Both the diff annotations and sidebar edit the same page-level draft.
export function DraftComment() {
  const { draft, setDraft, review } = useAppState();
  return draft ? (
    <CommentEditor
      draft={draft}
      onChange={(body) =>
        setDraft((previous) => (previous ? { ...previous, body } : null))
      }
      onSave={review.submit}
      onCancel={review.cancel}
    />
  ) : null;
}

export function ReviewCommentCard({
  comment,
  sidebar = false,
}: {
  comment: ReviewComment;
  sidebar?: boolean;
}) {
  const {
    source: { repository },
    review,
    navigateComment,
  } = useAppState();
  return (
    <CommentCard
      comment={comment}
      sidebar={sidebar}
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
          className="quiet-button destructive-button"
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
    <dialog
      ref={dialog}
      className="copy-dialog"
      aria-labelledby="copy-dialog-title"
      onCancel={onClose}
    >
      <h2 id="copy-dialog-title">Copy review comments</h2>
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
