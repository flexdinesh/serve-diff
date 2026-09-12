import type { ReviewComment } from "@serve-diff/shared";

export {
  anchored,
  commentContext,
  formatComments,
  lineContext,
  parseComments,
  reviewRounds,
} from "@serve-diff/shared";
export type {
  ReviewComment,
  ReviewOrigin,
  ReviewRound,
} from "@serve-diff/shared";

export type CommentAnnotation =
  | { kind: "saved"; comment: ReviewComment }
  | { kind: "draft" };

export function createCommentId(
  bytes = crypto.getRandomValues(new Uint8Array(16)),
) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
