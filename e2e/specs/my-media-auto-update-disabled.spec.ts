import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TED_POSTER_IMAGE_ALT,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  openMyMediaMovie,
  replacePosterAssets,
  resetDevStack,
  setArtworkAutoUpdate,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media does not auto-update tracked artwork when auto-update is disabled", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Auto Update Off";
  const theme = await ensureDefaultTheme();

  await setArtworkAutoUpdate(false);

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-auto-update-off-fixture.jpg",
    mediaType: "movie",
    tmdbId: 646,
    title: "Dr. No",
    year: 1962,
    themeId: theme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(646, "movie", (poster) => poster.poster_id === uploaded.poster_id);

  const library = await ensureMediaLibrarySynced();
  const movie = library.movies.find((item) => item.tmdb_id === 646);
  expect(movie, "expected Dr. No to exist in the synced media library").toBeTruthy();

  await openMyMediaMovie(page, movie!);
  await expect(page.getByRole("heading", { name: /Dr\. No/i })).toBeVisible();

  const movieCard = page.getByRole("button", {
    name: "Card options",
  }).nth(0);
  await movieCard.click();
  await page.getByRole("menuitem", {
    name: "Choose a poster from OpenPoster",
  }).click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this poster" }),
  }).last();
  const usePosterButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(usePosterButton).toBeVisible();
  await usePosterButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === movie!.id)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied movie poster to be tracked before replacement",
    })
    .toBe(uploaded.poster_id);

  const originalTracked = (await getTrackedArtwork()).find((item) => item.media_item_id === movie!.id) ?? null;
  expect(originalTracked, "expected tracked artwork record to exist before replacement").toBeTruthy();
  const originalAssetHash = originalTracked!.asset_hash;

  const replaced = await replacePosterAssets({
    posterId: uploaded.poster_id,
    filePath: TED_POSTER_IMAGE_ALT,
    fileName: "dr-no-auto-update-off-fixture-v2.jpg",
  });
  expect(replaced.full_hash).not.toBe(originalAssetHash);

  await openMyMediaMovie(page, movie!);
  await expect(page.getByRole("heading", { name: /Dr\. No/i })).toBeVisible();

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === movie!.id)?.asset_hash ?? null;
    }, {
      timeout: 8_000,
      message: "expected tracked artwork hash to remain unchanged when auto-update is disabled",
    })
    .toBe(originalAssetHash);
});
