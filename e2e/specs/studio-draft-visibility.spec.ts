import { test, expect } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  ensureDefaultTheme,
  openStudioMedia,
  pinShow,
  resetDevStack,
  setDefaultLanguage,
  setPosterPublished,
  uploadPoster,
} from "../helpers/openposter";

test.beforeEach(async () => {
  await resetDevStack();
});

test("draft and published show posters stay visible in Studio", async ({ page }) => {
  const theme = await ensureDefaultTheme();
  await pinShow(201834, "ted (2024)");
  await setDefaultLanguage("en");

  const uploaded = await uploadPoster({
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

  await expect(page.getByRole("heading", { name: "ted (2024)" })).toBeVisible();
  await expect(page.getByText("TV show posters")).toBeVisible();
  await expect(page.getByText("1 DRAFT")).toBeVisible();
  await expect(page.getByRole("link", { name: "ted", exact: true })).toBeVisible();

  await setPosterPublished(uploaded.poster_id, true);
  await page.reload();

  await expect(page.getByText("1 PUBLISHED")).toBeVisible();
  await expect(page.getByRole("link", { name: "ted", exact: true })).toBeVisible();

  await setPosterPublished(uploaded.poster_id, false);
  await page.reload();

  await expect(page.getByText("1 DRAFT")).toBeVisible();
  await expect(page.getByRole("link", { name: "ted", exact: true })).toBeVisible();
});
