import assert from "node:assert/strict";
import test from "node:test";
import { readThemePreference, resolveTheme } from "../src/theme.ts";

test("theme preference defaults invalid and missing values to system", () => {
  assert.equal(readThemePreference(null), "system");
  assert.equal(readThemePreference("unknown"), "system");
  assert.equal(readThemePreference("system"), "system");
  assert.equal(readThemePreference("light"), "light");
  assert.equal(readThemePreference("dark"), "dark");
});

test("system theme resolves from the operating system", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
