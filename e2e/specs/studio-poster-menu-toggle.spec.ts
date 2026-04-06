import { test, expect } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  ensureDefaultTheme,
  openPosterMenuForTitle,
  openStudioMedia,
  pinShow,
  resetDevStack,
  setDefaultLanguage,
  skipIfTmdbUnavailable,
  uploadPoster,
} from "../helpers/openposter";

skipIfTmdbUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("studio poster actions menu can publish and return to draft", async ({ page }) => {
  const theme = await ensureDefaultTheme();
  await pinShow(201834, "ted (2024)");
  await setDefaultLanguage("en");

  await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-fixture.jpg",
    mediaType: "show",
    tmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: false,
  });

  await openStudioMedia(page, "show:201834", theme.theme_id);

  await expect(page.getByText("1 DRAFT")).toBeVisible();

  await openPosterMenuForTitle(page, "ted");
  await page.getByRole("menuitem", { name: "Publish" }).click();
  await expect(page.getByText("1 PUBLISHED")).toBeVisible();

  await openPosterMenuForTitle(page, "ted");
  await page.getByRole("menuitem", { name: "Set as draft" }).click();
  await expect(page.getByText("1 DRAFT")).toBeVisible();
});
