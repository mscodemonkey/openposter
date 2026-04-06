import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  openMyMediaCollection,
  resetDevStack,
  seedConfirmedCollectionTmdbMatch,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can apply OpenPoster collection square artwork", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Collection Square";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "bond-collection-my-media-square.jpg",
    mediaType: "collection",
    tmdbId: 645,
    collectionTmdbId: 645,
    title: "James Bond Collection",
    themeId: theme.theme_id,
    language: "en",
    published: true,
    kind: "square",
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(
    645,
    "collection",
    (poster) => poster.poster_id === uploaded.poster_id,
    120_000,
    "square",
  );

  const library = await ensureMediaLibrarySynced();
  const collection = library.collections.find((item) => /James Bond/i.test(item.title));
  expect(collection, "expected James Bond collection to exist in the synced media library").toBeTruthy();

  await seedConfirmedCollectionTmdbMatch(page, collection!.id, 645, "James Bond Collection");

  await openMyMediaCollection(page, collection!);
  await expect(page.getByRole("heading", { name: /James Bond/i })).toBeVisible();

  const collectionSquareCard = page.getByRole("button", {
    name: "View alternate square artwork and other options",
  }).first();
  const squareContainer = collectionSquareCard.locator("xpath=..");

  await collectionSquareCard.click();
  const selectSquareButton = squareContainer.getByRole("button", {
    name: "Select square artwork from an OpenPoster creator",
  });
  await expect(selectSquareButton).toBeEnabled({ timeout: 30_000 });
  await selectSquareButton.click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this poster" }),
  }).last();

  const useSquareButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(useSquareButton).toBeVisible();
  await useSquareButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === `${collection!.id}:square`)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media collection square artwork to be tracked on the node",
    })
    .toBe(uploaded.poster_id);
});
