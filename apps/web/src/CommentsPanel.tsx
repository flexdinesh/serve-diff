import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { useAppState } from "./app-state.tsx";
import { DraftComment, ReviewCommentCard } from "./review.tsx";
import { anchored } from "./review-model.ts";

export function CommentsPanel() {
  const {
    source: { repository },
    draft,
    review,
    navigateComment,
  } = useAppState();
  const openComments = review.comments.filter(
    (comment) => comment.status === "open",
  ).length;
  const currentRound = review.rounds.find((round) => round.current);
  const earlierRounds = review.rounds.filter((round) => !round.current);
  return (
    <TabsContent
      value="comments"
      id="comments-panel"
      aria-label="Review comments"
    >
      <p className="comment-summary">
        {openComments} open · {review.comments.length - openComments} resolved
      </p>
      {draft &&
        (!anchored(draft, repository) ? (
          <DraftComment />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => navigateComment(draft)}
          >
            Continue draft
          </Button>
        ))}
      {currentRound && (
        <section className="review-round" aria-label="Current review">
          <h2>Current review</h2>
          {currentRound.comments.map((comment) => (
            <ReviewCommentCard key={comment.id} comment={comment} sidebar />
          ))}
        </section>
      )}
      {earlierRounds.map((round, index) => {
        const open = round.comments.filter(
          (comment) => comment.status === "open",
        ).length;
        return (
          <details className="review-round earlier-review" key={round.key}>
            <summary>
              Earlier review {earlierRounds.length - index} · {open} open ·{" "}
              {round.comments.length - open} resolved
            </summary>
            {round.comments.map((comment) => (
              <ReviewCommentCard key={comment.id} comment={comment} sidebar />
            ))}
          </details>
        );
      })}
      {!review.comments.length && (
        <p className="comment-empty">
          Hover a code line and click + to leave feedback. Select several lines
          to comment on a range. Saved comments stay in this browser and can be
          copied for your coding agent.
        </p>
      )}
      {!!review.comments.length && !currentRound && (
        <p className="comment-empty">
          No comments in this review yet. Changes after copied feedback start a
          new review round; add comments from the Files tab.
        </p>
      )}
    </TabsContent>
  );
}
