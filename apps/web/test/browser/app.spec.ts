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
  const treePaths = await files.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-path") ?? ""),
  );
  const headers = page.locator("#viewer [data-diffs-header]");
  await expect(headers).toHaveCount(treePaths.length);
  const diffHeaders = await headers.evaluateAll((elements) =>
    elements.map((element) => element.textContent ?? ""),
  );
  expect(diffHeaders).toHaveLength(treePaths.length);
  for (const [index, path] of treePaths.entries())
    expect(diffHeaders[index]).toContain(path);
  await expect(
    page.getByText("export const value = 2;", { exact: true }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: "Filter files" }).fill("Badge");
  await expect(files).toHaveCount(1);
  await expect(files).toHaveAttribute("data-path", "src/components/Badge.tsx");
});

test("theme picker follows system and persists explicit choices", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/");

  const theme = page.getByRole("button", { name: "Theme: System" });
  await expect(theme).toBeVisible();
  await expect(theme.locator("svg")).toHaveClass(/lucide-monitor/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme-v2")))
    .toBe("system");

  await theme.click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(
    page.getByRole("button", { name: "Theme: Light" }).locator("svg"),
  ).toHaveClass(/lucide-sun/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("theme-v2")))
    .toBe("light");

  await page.getByRole("button", { name: "Theme: Light" }).click();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(
    page.getByRole("button", { name: "Theme: System" }).locator("svg"),
  ).toHaveClass(/lucide-monitor/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Theme: System" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await page.reload();
  const darkTheme = page.getByRole("button", { name: "Theme: Dark" });
  await expect(darkTheme).toBeVisible();
  await expect(darkTheme.locator("svg")).toHaveClass(/lucide-moon/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("display controls expose state and persist preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Piped diff" })).toBeVisible();

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

test("header icons and sidebar tab indicator use design-system sizes", async ({
  page,
}) => {
  await page.goto("/");

  const styles = await page.evaluate(() => {
    const size = (selector: string) => {
      const element = document.querySelector<SVGElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      return getComputedStyle(element).width;
    };
    const tab = document.querySelector<HTMLElement>("#files-tab");
    if (!tab) throw new Error("Missing Changes tab");
    const indicator = getComputedStyle(tab, "::after");
    const colorProbe = document.createElement("span");
    colorProbe.style.color = "var(--accent)";
    document.body.append(colorProbe);
    const accent = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    return {
      sidebar: size("#sidebar-toggle svg"),
      branch: size(".branch-badge svg"),
      refresh: size("#refresh svg"),
      theme: size("#theme svg"),
      tabBorderWidth: getComputedStyle(tab).borderBottomWidth,
      indicatorColor: indicator.backgroundColor,
      indicatorOpacity: indicator.opacity,
      accent,
    };
  });

  expect(styles).toMatchObject({
    sidebar: "20px",
    branch: "16px",
    refresh: "16px",
    theme: "20px",
    tabBorderWidth: "0px",
    indicatorOpacity: "1",
  });
  expect(styles.indicatorColor).toBe(styles.accent);
});

test("sidebar resizer supports pointer dragging", async ({ page }) => {
  await page.goto("/");
  const resizer = page.getByRole("separator", {
    name: "Resize file sidebar",
  });
  await expect(resizer).toBeVisible();
  const box = await resizer.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(100);
  const before = Number(await resizer.getAttribute("aria-valuenow"));
  if (!box) throw new Error("Missing sidebar resizer bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 20);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await resizer.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
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

  const treeCommentCount = page.locator(".file-comment-count");
  await expect(treeCommentCount).toHaveText("1");
  await expect(treeCommentCount).toHaveCSS("flex-direction", "row");
  await expect(treeCommentCount.locator("svg")).toHaveCSS("width", "14px");
  const treeCommentBox = await treeCommentCount.boundingBox();
  expect(treeCommentBox?.height ?? 0).toBeLessThanOrEqual(20);

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
