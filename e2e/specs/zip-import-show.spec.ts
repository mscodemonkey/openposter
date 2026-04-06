import { test, expect } from "@playwright/test";

import {
  TED_SHOW_ZIP,
  ensureDefaultTheme,
  listPosters,
  openStudioMedia,
  pinShow,
  resetDevStack,
  skipIfTmdbUnavailable,
} from "../helpers/openposter";

skipIfTmdbUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("show ZIP import creates a draft backdrop for the active show", async ({ page }) => {
  const theme = await ensureDefaultTheme();
  await pinShow(201834, "ted (2024)");

  await openStudioMedia(page, "show:201834", theme.theme_id);

  await page.getByRole("button", { name: "Import ZIP" }).click();
  const importDialog = page.getByRole("dialog").last();
  await expect(importDialog).toBeVisible();
  await page.locator('input[type="file"]').last().setInputFiles(TED_SHOW_ZIP);
  const importButton = page.getByRole("button", { name: /Import 1 item/i }).last();
  await expect(importButton).toBeVisible();
  await importButton.click();
  await expect(importDialog).toBeHidden({ timeout: 120_000 });

  await expect(page.getByText("TV show backdrops")).toBeVisible();
  await expect(page.getByText("1 DRAFT")).toBeVisible();

  const showBackdrops = (await listPosters()).filter((poster) =>
    poster.media.type === "backdrop"
    && poster.media.show_tmdb_id === 201834
    && poster.media.theme_id === theme.theme_id
    && poster.language === "en",
  );

  expect(showBackdrops).toHaveLength(1);
  expect(showBackdrops[0]?.published).toBe(false);
});
