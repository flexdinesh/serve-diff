import assert from "node:assert/strict";
import { test } from "node:test";
import {
  languageOverride,
  readDiffTheme,
  readLineDiffType,
  themesFor,
} from "../src/display-options.ts";

test("validates persisted diff appearance options", () => {
  assert.equal(readDiffTheme("github"), "github");
  assert.equal(readDiffTheme("unknown"), "pierre");
  assert.equal(readLineDiffType("char"), "char");
  assert.equal(readLineDiffType("unknown"), "word-alt");
  assert.deepEqual(themesFor("catppuccin"), {
    light: "catppuccin-latte",
    dark: "catppuccin-mocha",
  });
});

test("overrides ambiguous filenames and extensionless shebangs", () => {
  assert.equal(languageOverride("ops/Dockerfile.dev"), "dockerfile");
  assert.equal(languageOverride("config/.env.local"), "dotenv");
  assert.equal(languageOverride("Justfile"), "just");
  assert.equal(languageOverride("Procfile"), "shellscript");
  assert.equal(
    languageOverride("scripts/release", "#!/usr/bin/env python3"),
    "python",
  );
  assert.equal(languageOverride("README", "plain text"), undefined);
});
