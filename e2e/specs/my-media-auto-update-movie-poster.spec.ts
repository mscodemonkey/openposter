import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TED_POSTER_IMAGE_ALT,
  TEST_NODE_URL,
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

test("my media auto-update reapplies a revised movie poster from the same poster id", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Auto Update";
  const theme = await ensureDefaultTheme();

  await setArtworkAutoUpdate(true);

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-auto-update-fixture.jpg",
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
    name: "Dr. No poster options",
  }).first();
  await movieCard.click();
  await page.getByRole("menuitem", {
    name: "Choose a poster from OpenPoster",
  }).click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this poster" }),
  }).last();
  await expect(drawer.getByText(fixtureCreatorDisplayName, { exact: false }).first()).toBeVisible();

  const usePosterButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(usePosterButton).toBeVisible();

  const applyRequestPromise = page.waitForRequest((request) =>
    request.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && request.method() === "POST",
  { timeout: 15_000 });
  const applyResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && response.request().method() === "POST",
  { timeout: 15_000 });

  await usePosterButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const applyRequest = await applyRequestPromise;
  const applyResponse = await applyResponsePromise;

  if (!applyResponse.ok()) {
    const responseText = await applyResponse.text().catch(() => "");
    throw new Error(`Movie apply failed with ${applyResponse.status()}: ${responseText}`);
  }

  const applyRequestBody = applyRequest.postDataJSON() as {
    poster_id?: string | null;
    asset_hash?: string | null;
  } | null;
  if (!applyRequestBody?.poster_id || !applyRequestBody?.asset_hash) {
    throw new Error(`Movie apply omitted tracking fields: ${JSON.stringify(applyRequestBody)}`);
  }
  const initialAssetHash = applyRequestBody.asset_hash;

  const applyJson = (await applyResponse.json()) as { media_item_id?: string };
  const trackedMediaItemId = applyJson.media_item_id ?? movie!.id;

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId) ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media movie poster to be tracked on the node",
    })
    .toMatchObject({
      poster_id: uploaded.poster_id,
      asset_hash: initialAssetHash,
      auto_update: true,
    });

  const replaced = await replacePosterAssets({
    posterId: uploaded.poster_id,
    filePath: TED_POSTER_IMAGE_ALT,
    fileName: "dr-no-auto-update-fixture-v2.jpg",
  });

  expect(replaced.full_hash).not.toBe(initialAssetHash);

  await openMyMediaMovie(page, movie!);
  await expect(page.getByRole("heading", { name: /Dr\. No/i })).toBeVisible();

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.asset_hash ?? null;
    }, {
      timeout: 20_000,
      message: "expected My Media auto-update to refresh the tracked movie artwork hash",
    })
    .toBe(replaced.full_hash);
});
