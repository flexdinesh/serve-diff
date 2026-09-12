import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { useAppState } from "./app-state.tsx";
import { DraftComment, ReviewCommentCard } from "./review.tsx";
import { anchored } from "./review-model.ts";

type CommentFilter = "open" | "resolved" | "all";

const COMMENT_FILTERS: readonly CommentFilter[] = ["open", "resolved", "all"];

function filterLabel(filter: CommentFilter) {
  if (filter === "open") return "Open";
  if (filter === "resolved") return "Resolved";
  return "All";
}

export function CommentsPanel() {
  const [filter, setFilter] = useState<CommentFilter>("open");
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
  const visible = (status: "open" | "resolved") =>
    filter === "all" || filter === status;
  const currentComments =
    currentRound?.comments.filter((comment) => visible(comment.status)) ?? [];
  const visibleEarlierComments = earlierRounds.reduce(
    (count, round) =>
      count +
      round.comments.filter((comment) => visible(comment.status)).length,
    0,
  );
  return (
    <TabsContent
      value="comments"
      id="comments-panel"
      aria-label="Review comments"
    >
      <div className="comment-panel-header">
        <p className="comment-summary">
          {openComments} open · {review.comments.length - openComments} resolved
        </p>
        {!!review.comments.length && (
          <div
            className="comment-filters"
            role="group"
            aria-label="Filter comments"
          >
            {COMMENT_FILTERS.map((value) => (
              <Button
                key={value}
                type="button"
                variant={filter === value ? "secondary" : "ghost"}
                size="xs"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {filterLabel(value)}
              </Button>
            ))}
          </div>
        )}
      </div>
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
      {currentRound && !!currentComments.length && (
        <section className="review-round" aria-label="Current review">
          <h2>Current review</h2>
          {currentComments.map((comment) => (
            <ReviewCommentCard key={comment.id} comment={comment} sidebar />
          ))}
        </section>
      )}
      {earlierRounds.map((round, index) => {
        const open = round.comments.filter(
          (comment) => comment.status === "open",
        ).length;
        const comments = round.comments.filter((comment) =>
          visible(comment.status),
        );
        if (!comments.length) return null;
        return (
          <details className="review-round earlier-review" key={round.key}>
            <summary>
              Earlier review {earlierRounds.length - index} · {open} open ·{" "}
              {round.comments.length - open} resolved
            </summary>
            {comments.map((comment) => (
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
      {!!review.comments.length &&
        !currentRound &&
        !!visibleEarlierComments && (
          <p className="comment-empty">
            No comments in this review yet. Changes after copied feedback start
            a new review round; add comments from the Files tab.
          </p>
        )}
      {!!review.comments.length &&
        !currentComments.length &&
        !visibleEarlierComments && (
          <p className="comment-empty">No {filter} comments.</p>
        )}
    </TabsContent>
  );
}
