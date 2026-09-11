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
