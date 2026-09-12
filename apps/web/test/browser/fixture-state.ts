import type { APIRequestContext } from "@playwright/test";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function resetFixtureState(request: APIRequestContext) {
  const response = await request.get("/api/v1/comments");
  const body: unknown = await response.json();
  if (record(body) && Array.isArray(body.comments)) {
    for (const comment of body.comments) {
      if (record(comment) && typeof comment.id === "string")
        await request.delete(
          `/api/v1/comments/${encodeURIComponent(comment.id)}`,
        );
    }
  }
  for (const scope of ["all", "staged", "unstaged"])
    await request.delete(`/api/v1/review-marks?scope=${scope}`);
}
