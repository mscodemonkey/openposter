import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  openMyMediaCollection,
  resetDevStack,
  uploadPoster,
} from "../helpers/openposter";

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can apply an OpenPoster collection poster", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Collection";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "bond-collection-my-media-poster.jpg",
    mediaType: "collection",
    tmdbId: 645,
    collectionTmdbId: 645,
    title: "James Bond Collection",
    themeId: theme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  const library = await ensureMediaLibrarySynced();
  const collection = library.collections.find((item) => /James Bond/i.test(item.title));
  expect(collection, "expected James Bond collection to exist in the synced media library").toBeTruthy();

  await page.addInitScript(({ collectionId }) => {
    const key = "openposter_tmdb_collection_map";
    const map = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    map[collectionId] = { tmdbId: 645, tmdbName: "James Bond Collection", source: "confirmed" };
    window.localStorage.setItem(key, JSON.stringify(map));
  }, { collectionId: collection!.id });

  await openMyMediaCollection(page, collection!);
  await expect(page.getByRole("heading", { name: /James Bond/i })).toBeVisible();

  const collectionPosterCard = page.getByRole("button", {
    name: "View alternate artwork and other options",
  }).first();
  const posterContainer = collectionPosterCard.locator("xpath=..");

  await collectionPosterCard.click();
  const selectPosterButton = posterContainer.getByRole("button", {
    name: "Select a new poster from an OpenPoster creator",
  });
  await expect(selectPosterButton).toBeEnabled({ timeout: 30_000 });
  await selectPosterButton.click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this poster" }),
  }).last();
  await expect(drawer.getByText(fixtureCreatorDisplayName, { exact: false }).first()).toBeVisible();

  const usePosterButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(usePosterButton).toBeVisible();
  await usePosterButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === collection!.id)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media collection poster to be tracked on the node",
    })
    .toBe(uploaded.poster_id);
});
