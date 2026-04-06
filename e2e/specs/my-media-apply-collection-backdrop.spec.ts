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

test("my media can apply an OpenPoster collection backdrop", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Collection Backdrop";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "bond-collection-my-media-backdrop.jpg",
    mediaType: "backdrop",
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

  const collectionBackdropCard = page.getByRole("button", {
    name: "View alternate backdrops and other options",
  }).first();
  const backdropContainer = collectionBackdropCard.locator("xpath=..");

  await collectionBackdropCard.click();
  const selectBackdropButton = backdropContainer.getByRole("button", {
    name: "Select a backdrop from an OpenPoster creator",
  });
  await expect(selectBackdropButton).toBeEnabled({ timeout: 30_000 });
  await selectBackdropButton.click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this backdrop" }),
  }).last();
  await expect(drawer.getByText(fixtureCreatorDisplayName, { exact: false }).first()).toBeVisible();

  const useBackdropButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(useBackdropButton).toBeVisible();
  await useBackdropButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const trackedMediaItemId = `${collection!.id}:bg`;
  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media collection backdrop to be tracked on the node",
    })
    .toBe(uploaded.poster_id);
});
