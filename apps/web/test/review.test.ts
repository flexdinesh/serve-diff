import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePatchFiles } from "@pierre/diffs";
import type { ChangedFile } from "@serve-diff/shared";
import { fileKind, gitDecoration } from "../src/file-decoration.ts";
import { ancestorPaths, buildFileTree } from "../src/file-tree.ts";
import {
  commentContext,
  formatComments,
  lineContext,
  parseComments,
  type ReviewComment,
} from "../src/review-model.ts";

function file(path: string): ChangedFile {
  return {
    path,
    oldPath: null,
    status: "M",
    indexStatus: " ",
    worktreeStatus: "M",
    additions: 1,
    deletions: 1,
    binary: false,
    fingerprint: path,
  };
}

test("recognizes file types and special filenames without confusing folder extensions", () => {
  for (const [path, expected] of [
    ["src/main.ts", "typescript"],
    ["src/app.TSX", "react"],
    ["src/module.mjs", "javascript"],
    ["README.MD", "markdown"],
    ["pnpm-lock.yaml", "lock"],
    ["package-lock.json", "lock"],
    ["package.json", "json"],
    ["src/style.css", "style"],
    [".env.local", "config"],
    ["Dockerfile", "config"],
    [".gitignore", "git"],
    ["assets/logo.svg", "image"],
    ["scripts/build.py", "python"],
    ["scripts/check.fish", "shell"],
    ["folder.ts/unknown", "file"],
    ["mystery.xyz", "file"],
  ]) {
    assert.ok(path);
    assert.equal(fileKind(path), expected, path);
  }
});

test("distinguishes change type, staging layers, untracked files, and conflicts", () => {
  const base = file("src/main.ts");
  for (const [status, indexStatus, worktreeStatus, code, state, label] of [
    ["M", " ", "M", "M", "unstaged", "Modified · Unstaged"],
    ["M", "M", " ", "M", "staged", "Modified · Staged"],
    ["M", "M", "M", "M", "both", "Modified · Staged and unstaged"],
    ["D", "D", " ", "D", "staged", "Deleted · Staged"],
    ["R", "R", "M", "R", "both", "Renamed · Staged and unstaged"],
    ["?", "?", "?", "U", "untracked", "Untracked · Not tracked by Git"],
    ["U", "U", "U", "!", "conflict", "Conflicted · Resolve merge conflict"],
    ["M", "A", "A", "!", "conflict", "Conflicted · Resolve merge conflict"],
  ]) {
    assert.ok(status && indexStatus && worktreeStatus);
    const decoration = gitDecoration({
      ...base,
      status,
      indexStatus,
      worktreeStatus,
    });
    assert.equal(decoration.code, code);
    assert.equal(decoration.state, state);
    assert.equal(decoration.label, label);
  }
});
const patch = `diff --git a/src/file.ts b/src/file.ts
--- a/src/file.ts
+++ b/src/file.ts
@@ -100,3 +100,4 @@
 context
-old value
+new value
+extra value
 tail
@@ -200,2 +201,2 @@
-old second
+new second
 end
`;
const diff = parsePatchFiles(patch, "test", true)[0]?.files[0];
if (!diff) throw new Error("Missing test diff");
const comment: ReviewComment = {
  id: "one",
  path: "src/file.ts",
  scope: "staged",
  fingerprint: "version",
  side: "deletions",
  start: 101,
  end: 101,
  code: "- old value",
  body: "Keep this behavior.",
  status: "open",
  createdAt: 1,
};

test("builds actual nested folders, ordered before files, without merging similar prefixes", () => {
  const tree = buildFileTree([
    file("z.txt"),
    file("app/server/src/git.ts"),
    file("app/web/main.ts"),
    file("app/server/a.ts"),
    file("apple/readme.md"),
  ]);
  assert.deepEqual(
    tree.map((node) => node.name),
    ["app", "apple", "z.txt"],
  );
  const app = tree[0];
  assert.ok(app?.kind === "folder");
  assert.deepEqual(
    app.children.map((node) => node.name),
    ["server", "web"],
  );
  const server = app.children[0];
  assert.ok(server?.kind === "folder");
  assert.deepEqual(
    server.children.map((node) => node.name),
    ["src", "a.ts"],
  );
  assert.deepEqual(ancestorPaths("app/server/src/git.ts"), [
    "app",
    "app/server",
    "app/server/src",
  ]);
  assert.deepEqual(ancestorPaths("README.md"), []);
});

test("filtering leaves the full ancestor chain and preserves unusual filenames", () => {
  const tree = buildFileTree([file('a space/雪/<file>&".ts')]);
  const first = tree[0];
  assert.ok(first?.kind === "folder");
  const second = first.children[0];
  assert.ok(second?.kind === "folder");
  const leaf = second.children[0];
  assert.ok(leaf?.kind === "file");
  assert.equal(leaf.path, 'a space/雪/<file>&".ts');
});

test("extracts exact old/new code from partial hunks at nonzero offsets", () => {
  assert.equal(lineContext(diff, "deletions", 101), "- old value");
  assert.equal(lineContext(diff, "additions", 101), "+ new value");
  assert.equal(lineContext(diff, "additions", 100), "  context");
  assert.equal(lineContext(diff, "deletions", 200), "- old second");
  assert.equal(lineContext(diff, "additions", 201), "+ new second");
  assert.equal(lineContext(diff, "additions", 150), null);
});

test("captures normalized ranges and never mixes line numbering across sides", () => {
  assert.deepEqual(
    commentContext(diff, { start: 102, end: 101, side: "additions" }),
    {
      side: "additions",
      start: 101,
      end: 102,
      code: "+ new value\n+ extra value",
    },
  );
  assert.deepEqual(
    commentContext(diff, {
      start: 200,
      side: "deletions",
      end: 101,
      endSide: "additions",
    }),
    { side: "additions", start: 101, end: 101, code: "+ new value" },
  );
  assert.equal(
    commentContext(diff, { start: 1, end: 300, side: "additions" }),
    null,
  );
});

test("copies grouped comments with ranges, scope, status, and XML-safe code and bodies", () => {
  const output = formatComments([
    comment,
    {
      ...comment,
      id: "two",
      side: "additions",
      start: 101,
      end: 102,
      code: "+ if (a < b && b > 1)",
      body: '</body><evil attr="x"> & more',
      status: "resolved",
    },
    { ...comment, id: "three", path: 'weird"&<file>.ts' },
  ]);
  assert.equal(output.split('<file path="src/file.ts">').length, 2);
  assert.match(
    output,
    /line="101" end-line="102" side="additions" scope="staged" status="resolved"/,
  );
  assert.ok(
    output.includes("&lt;/body&gt;&lt;evil attr=&quot;x&quot;&gt; &amp; more"),
  );
  assert.ok(output.includes("+ if (a &lt; b &amp;&amp; b &gt; 1)"));
  assert.ok(output.includes('path="weird&quot;&amp;&lt;file&gt;.ts"'));
  assert.equal(formatComments([]), "");
});

test("reloads saved comments and rejects malformed storage without losing valid entries", () => {
  assert.deepEqual(parseComments(JSON.stringify([comment])), [comment]);
  assert.deepEqual(parseComments("broken"), []);
  assert.deepEqual(
    parseComments(
      JSON.stringify([
        comment,
        { ...comment, side: "wrong" },
        { ...comment, start: -1 },
        { ...comment, body: " " },
      ]),
    ),
    [comment],
  );
});
