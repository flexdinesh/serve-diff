import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { parsePatchFiles } from "@pierre/diffs";
import type {
  ChangedFile,
  FilePatch,
  RepositoryDiff,
} from "@serve-diff/shared";
import type { Plugin } from "vite";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export async function fixtureApiPlugin(): Promise<Plugin> {
  const input = await readFile(
    new URL("../../../test/fixtures/sample.diff", import.meta.url),
    "utf8",
  );
  const revision = digest(input);
  const files: ChangedFile[] = [];
  const previews = new Map<string, FilePatch>();
  for (const patch of input
    .split(/(?=^diff --git )/m)
    .filter((part) => part.startsWith("diff --git "))) {
    const parsed = parsePatchFiles(patch, undefined, true).flatMap(
      (entry) => entry.files,
    );
    const file = parsed[0];
    if (!file || parsed.length !== 1)
      throw new Error("Invalid sample diff fixture");
    const fingerprint = digest(patch);
    files.push({
      path: file.name,
      oldPath: file.prevName ?? null,
      status:
        file.type === "new"
          ? "A"
          : file.type === "deleted"
            ? "D"
            : file.type.startsWith("rename")
              ? "R"
              : "M",
      indexStatus: "",
      worktreeStatus: "",
      additions: file.hunks.reduce(
        (total, hunk) => total + hunk.additionLines,
        0,
      ),
      deletions: file.hunks.reduce(
        (total, hunk) => total + hunk.deletionLines,
        0,
      ),
      binary: false,
      fingerprint,
    });
    previews.set(file.name, { patch, message: null });
  }
  const manifest: RepositoryDiff = {
    source: "stdin",
    root: `fixture:${revision}`,
    name: "Piped diff",
    branch: "stdin",
    head: null,
    mode: "all",
    files,
    revision,
  };

  return {
    name: "serve-diff-fixture-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) {
          next();
          return;
        }
        if (request.method !== "GET") {
          json(response, 405, { error: "Read-only fixture server" });
          return;
        }
        if (url.pathname === "/api/diff") {
          json(response, 200, manifest);
          return;
        }
        if (url.pathname === "/api/file") {
          const path = url.searchParams.get("path");
          const file = files.find((entry) => entry.path === path);
          const preview = path ? previews.get(path) : undefined;
          if (!file || !preview) {
            json(response, 404, { error: "File is not in the fixture" });
            return;
          }
          if (url.searchParams.get("version") !== file.fingerprint) {
            json(response, 409, { error: "Fixture version mismatch" });
            return;
          }
          json(response, 200, preview);
          return;
        }
        if (url.pathname === "/api/contents") {
          json(response, 400, {
            error: "Full context is unavailable for piped diffs",
          });
          return;
        }
        json(response, 404, { error: "Unknown API route" });
      });
    },
  };
}
