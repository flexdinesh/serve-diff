import type { RepositoryDiff } from "@serve-diff/shared";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
      <Textarea
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
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!draft.body.trim()}>
          Save comment
        </Button>
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
          <Button
            type="button"
            className="comment-location"
            variant="ghost"
            size="xs"
            title={location(comment)}
            onClick={() => onNavigate(comment)}
          >
            {location(comment)}
          </Button>
        ) : (
          <span>
            Review · {comment.side === "additions" ? "new" : "old"} line{" "}
            {comment.start}
            {comment.end !== comment.start ? `–${comment.end}` : ""}
          </span>
        )}
        <Badge variant="outline" className="comment-state">
          {comment.status === "resolved" ? "Resolved" : "Open"}
        </Badge>
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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onEdit(comment)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onToggle(comment)}
        >
          {comment.status === "resolved" ? "Reopen" : "Resolve"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={() => onDelete(comment)}
        >
          Delete
        </Button>
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
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (open) input.current?.select();
      }}
    >
      <DialogContent
        className="copy-dialog"
        showCloseButton={false}
        initialFocus={input}
      >
        <DialogTitle id="copy-dialog-title">Copy review comments</DialogTitle>
        <DialogDescription>
          Clipboard access is unavailable. Copy the selected text with ⌘C /
          Ctrl+C.
        </DialogDescription>
        <Textarea ref={input} value={text} readOnly aria-label="Comments XML" />
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
