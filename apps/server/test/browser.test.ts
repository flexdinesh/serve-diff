import assert from "node:assert/strict";
import { test } from "node:test";
import { browserCommand, isSshSession, openBrowser } from "../src/browser.ts";

test("selects the browser launcher for supported platforms", () => {
  assert.equal(browserCommand("darwin"), "open");
  assert.equal(browserCommand("linux"), "xdg-open");
  assert.equal(browserCommand("win32"), null);
});

test("recognizes SSH sessions", () => {
  assert.equal(isSshSession({ SSH_CONNECTION: "host 1 2 3" }), true);
  assert.equal(isSshSession({ SSH_TTY: "/dev/pts/0" }), true);
  assert.equal(isSshSession({}), false);
});

test("opens localhost with the platform launcher outside SSH", async () => {
  const calls: Array<[string, string]> = [];
  const error = await openBrowser("http://localhost:3333", {
    platform: "linux",
    environment: {},
    launcher: async (command, url) => {
      calls.push([command, url]);
    },
  });
  assert.equal(error, null);
  assert.deepEqual(calls, [["xdg-open", "http://localhost:3333"]]);
});

test("does not launch a browser in SSH or on unsupported platforms", async () => {
  const launcher = async () => {
    throw new Error("should not launch");
  };
  assert.equal(
    await openBrowser("http://localhost:3333", {
      environment: { SSH_CONNECTION: "host 1 2 3" },
      launcher,
    }),
    null,
  );
  assert.equal(
    await openBrowser("http://localhost:3333", {
      platform: "win32",
      environment: {},
      launcher,
    }),
    null,
  );
});

test("reports launcher failures without throwing", async () => {
  const error = await openBrowser("http://localhost:3333", {
    platform: "darwin",
    environment: {},
    launcher: async () => {
      throw new Error("not found");
    },
  });
  assert.equal(error, "Unable to open browser with open: not found");
});
