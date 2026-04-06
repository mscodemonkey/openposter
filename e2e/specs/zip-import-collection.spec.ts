import { test, expect } from "@playwright/test";

import {
  BOND_COLLECTION_ZIP,
  ensureDefaultTheme,
  extractZipEntry,
  listPosters,
  openStudioMedia,
  pinCollection,
  resetDevStack,
  setDefaultLanguage,
  skipIfTmdbUnavailable,
  uploadPoster,
} from "../helpers/openposter";

skipIfTmdbUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("collection ZIP import reuses the collection poster slot cleanly", async ({ page }) => {
  const theme = await ensureDefaultTheme();
  await pinCollection(645, "James Bond Collection");
  await setDefaultLanguage("en");

  await uploadPoster({
    fileBuffer: extractZipEntry(BOND_COLLECTION_ZIP, "James Bond Collection .jpg"),
    fileName: "James Bond Collection .jpg",
    mediaType: "collection",
    tmdbId: 645,
    collectionTmdbId: 645,
    title: "James Bond Collection",
    themeId: theme.theme_id,
    language: "en",
    published: true,
    mimeType: "image/jpeg",
  });

  await openStudioMedia(page, "collection:645", theme.theme_id);

  await page.getByRole("button", { name: "Import ZIP" }).click();
  const importDialog = page.getByRole("dialog").last();
  await expect(importDialog).toBeVisible();
  await page.locator('input[type="file"]').last().setInputFiles(BOND_COLLECTION_ZIP);
  const importButton = page.getByRole("button", { name: /Import \d+/i }).last();
  await expect(importButton).toBeVisible();
  await importButton.click();
  await expect(importDialog).toBeHidden({ timeout: 120_000 });

  await expect(page.getByRole("link", { name: "James Bond Collection", exact: true })).toBeVisible();

  const collectionPosters = (await listPosters()).filter((poster) =>
    poster.media.type === "collection"
    && poster.kind === "poster"
    && poster.media.tmdb_id === 645
    && poster.media.theme_id === theme.theme_id
    && poster.language === "en",
  );

  expect(collectionPosters).toHaveLength(1);
  expect(collectionPosters[0]?.media.title).toBe("James Bond Collection");
  expect(collectionPosters[0]?.published).toBe(false);
});
