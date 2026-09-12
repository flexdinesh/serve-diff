#!/usr/bin/env node
import { fstatSync } from "node:fs";
import { parseArgs } from "node:util";
import { openBrowser } from "./browser.ts";
import { startServer } from "./server.ts";
import { readPatchInput } from "./stdin.ts";

try {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: "string", short: "p", default: "3333" },
      dev: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      "Usage: serve-diff [directory | -] [--port 3333] [--dev]\n\nExamples:\n  serve-diff .                 Watch the current repository\n  serve-diff /path/to/repo     Watch another repository\n  git diff | serve-diff       Read a patch from stdin\n  git show | serve-diff       Review a commit\n  serve-diff - < saved.patch  Read a saved patch\n  serve-diff . --port 4000     Use a different port\n\nPiped or redirected input takes priority, even when empty.\nWithout input redirection, provide a directory to watch with Git.\nRequires Node 26. Opens your browser automatically on macOS and Linux, except over SSH. Ctrl+C stops the server.",
    );
  } else {
    if (Number(process.versions.node.split(".")[0]) !== 26)
      throw new Error("serve-diff requires Node 26");
    if (positionals.length > 1)
      throw new Error("Expected at most one repository directory");
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Port must be between 0 and 65535");
    // An empty pipe is a valid empty diff. A terminal or /dev/null is no input.
    const stdin = fstatSync(0);
    const piped =
      positionals[0] === "-" ||
      stdin.isFIFO() ||
      stdin.isSocket() ||
      stdin.isFile();
    const input = piped ? await readPatchInput(process.stdin) : "";
    if (!piped && (!positionals[0] || positionals[0] === "-"))
      throw new Error(
        "Provide a repository path (serve-diff .) or pipe a Git diff into serve-diff. No input received.",
      );
    const server = await startServer({
      directory: positionals[0] ?? process.cwd(),
      port,
      dev: values.dev,
      ...(piped ? { input } : {}),
    });
    const browserError = await openBrowser(server.addresses.localhost);
    console.log(
      `\n  serve-diff\n  Local    ${server.addresses.localhost}\n  All      ${server.addresses.all}\n  Network  ${server.addresses.network ?? "unavailable"}\n  API token  ${server.token}\n  ${piped ? "Piped diff · fixed snapshot" : server.root}\n\n  Press Ctrl+C to stop.\n`,
    );
    if (browserError) console.warn(`serve-diff: ${browserError}`);
    let closing = false;
    const close = () => {
      if (!closing) {
        closing = true;
        void server.close();
      }
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  }
} catch (error) {
  console.error(
    `serve-diff: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
