import { test, expect } from "@playwright/test";

import { TEST_DIAG_URL, resetDevStack } from "../helpers/openposter";

test.beforeEach(async () => {
  await resetDevStack();
});

test("diagnostics page loads the core panels", async ({ page }) => {
  await page.goto(TEST_DIAG_URL);

  await expect(page.getByRole("heading", { name: "OpenPoster Diagnostics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Node A" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Indexer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issuer / Directory" })).toBeVisible();
});
