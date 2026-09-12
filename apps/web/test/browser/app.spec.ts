import { expect, test } from "@playwright/test";

test("renders and filters a piped diff", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Piped diff" })).toBeVisible();
  await expect(page.locator("#connection")).toHaveText("Fixed snapshot");
  await expect(page.locator("#file-count")).toHaveText("3");

  const files = page.locator("#file-tree [data-path]");
  await expect(files).toHaveCount(3);
  await expect(files.filter({ hasText: "value.ts" })).toHaveAttribute(
    "data-path",
    "src/value.ts",
  );
  await expect(files.filter({ hasText: "Badge.tsx" })).toHaveAttribute(
    "data-path",
    "src/components/Badge.tsx",
  );
  await expect(files.filter({ hasText: "legacy.md" })).toHaveAttribute(
    "data-path",
    "docs/legacy.md",
  );
  await expect(
    page.getByText("export const value = 2;", { exact: true }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "Filter files" }).fill("Badge");
  await expect(files).toHaveCount(1);
  await expect(files).toHaveAttribute("data-path", "src/components/Badge.tsx");
});

test("display controls expose state and persist preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Piped diff" })).toBeVisible();

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme")))
    .toBe("dark");

  await page.getByRole("tab", { name: /Comments/ }).click();
  await expect(page.getByRole("tab", { name: /Comments/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#comments-panel")).toBeVisible();
  await expect(page.locator("#file-panel")).toBeHidden();
  await page.getByRole("tab", { name: /Changes/ }).click();

  const wrap = page.getByRole("button", { name: "Wrap", exact: true });
  await expect(wrap).toHaveAttribute("aria-pressed", "false");
  await wrap.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("wrap")))
    .toBe("true");

  const unified = page.getByRole("button", {
    name: "Unified",
    exact: true,
  });
  await unified.click();
  await expect(unified).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("layout")))
    .toBe("unified");

  const inline = page.getByRole("combobox", { name: "Inline change detail" });
  await inline.click();
  await page.getByRole("option", { name: "Characters" }).click();
  await expect(inline).toContainText("Characters");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("line-diff-type")))
    .toBe("char");

  const codeTheme = page.getByRole("combobox", { name: "Code theme" });
  await codeTheme.click();
  await page.getByRole("option", { name: "GitHub" }).click();
  await expect(codeTheme).toContainText("GitHub");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("diff-theme")))
    .toBe("github");
});

test("fallback copy dialog traps and restores focus", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => ({
        writeText: () => Promise.reject(new Error("Clipboard unavailable")),
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toHaveText("Fixed snapshot");
  await page.evaluate(async () => {
    const response = await fetch("/api/diff");
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null)
      throw new Error("Bad fixture");
    const root = Reflect.get(data, "root");
    if (typeof root !== "string") throw new Error("Missing fixture root");
    localStorage.setItem(
      `serve-diff:comments:${root}`,
      JSON.stringify([
        {
          id: "browser-test",
          path: "src/value.ts",
          scope: "all",
          fingerprint: "earlier",
          side: "additions",
          start: 1,
          end: 1,
          code: "+ export const value = 2;",
          body: "Keep the exported value stable.",
          status: "open",
          createdAt: 1,
        },
      ]),
    );
  });
  await page.reload();

  await page.getByRole("tab", { name: /Comments/ }).click();
  await page.getByText(/Earlier review 1/).click();
  const resolve = page.getByRole("button", { name: "Resolve", exact: true });
  await resolve.click();
  const reopen = page.getByRole("button", { name: "Reopen", exact: true });
  await expect(reopen).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  await reopen.click();
  await expect(resolve).toBeVisible();

  const copy = page.getByRole("button", { name: "Copy all rounds" });
  await copy.click();
  const dialog = page.getByRole("dialog", { name: "Copy review comments" });
  await expect(dialog).toBeVisible();
  const output = page.getByRole("textbox", { name: "Comments XML" });
  await expect(output).toBeFocused();
  await expect
    .poll(() =>
      output.evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) return false;
        return (
          element.selectionStart === 0 &&
          element.selectionEnd === element.value.length
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(copy).toBeFocused();
});

test("mobile sidebar preserves accessible touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Show file sidebar" });
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  await toggle.click();
  await expect(page.locator("#sidebar")).toBeVisible();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
