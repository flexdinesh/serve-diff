import { useAppState } from "./app-state.tsx";
import { DraftComment, ReviewCommentCard } from "./review.tsx";
import { anchored } from "./review-model.ts";

export function CommentsPanel() {
  const {
    source: { repository },
    navigation: { tab },
    draft,
    review,
    navigateComment,
  } = useAppState();
  const openComments = review.comments.filter(
    (comment) => comment.status === "open",
  ).length;
  return (
    <section
      id="comments-panel"
      aria-label="Review comments"
      hidden={tab !== "comments"}
    >
      <p className="comment-summary">
        {openComments} open · {review.comments.length - openComments} resolved
      </p>
      {draft &&
        (!anchored(draft, repository) ? (
          <DraftComment />
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => navigateComment(draft)}
          >
            Continue draft
          </button>
        ))}
      {review.comments.map((comment) => (
        <ReviewCommentCard key={comment.id} comment={comment} sidebar />
      ))}
      {!review.comments.length && (
        <p className="comment-empty">
          Hover a code line and click + to leave feedback. Select several lines
          to comment on a range. Saved comments stay in this browser and can be
          copied for your coding agent.
        </p>
      )}
    </section>
  );
}
