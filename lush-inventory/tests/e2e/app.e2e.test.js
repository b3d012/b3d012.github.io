import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/PreChanges.xlsx");

test("imports the weekly workbook and persists tablet counts", async ({ page }) => {
  await page.goto("/lush-inventory/");
  await expect(page.getByRole("heading", { name: "Weekly inventory, without the paperwork." })).toBeVisible();
  await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(fixture);
  await expect(page.locator(".metric").filter({ hasText: "Products" }).getByText("119", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start counting" }).click();
  await expect(page.getByText("VEGANESE 100G CONDITIONER", { exact: true })).toBeVisible();
  const first = page.locator(".product").first();
  await first.getByLabel("Display").fill("0");
  await first.getByLabel("Cupboard").fill("3");
  await first.getByLabel("Store Room").fill("5");
  await expect(first.getByText("Matches", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue current count" }).click();
  await expect(page.locator(".product").first().getByLabel("Display")).toHaveValue("0");
});

test("supports search and review status filters", async ({ page }) => {
  await page.goto("/lush-inventory/");
  if (await page.getByRole("button", { name: "Continue current count" }).isVisible()) {
    await page.getByRole("button", { name: "Continue current count" }).click();
  } else {
    await page.locator('input[type="file"][accept*="xlsx"]').setInputFiles(fixture);
    await page.getByRole("button", { name: "Start counting" }).click();
  }
  await page.getByPlaceholder("Search product or PLU").fill("2001063000000");
  await expect(page.getByText("AVOCADO CO-WASH", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Review/ }).click();
  await page.getByRole("button", { name: /Incomplete/ }).click();
  await expect(page.locator(".reviewRow")).toHaveCount(119);
});
