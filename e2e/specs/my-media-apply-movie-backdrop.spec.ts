import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_URL,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  openMyMediaMovie,
  resetDevStack,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can apply an OpenPoster movie backdrop", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Movie Backdrop";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-my-media-backdrop.jpg",
    mediaType: "backdrop",
    tmdbId: 646,
    title: "Dr. No",
    year: 1962,
    themeId: theme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(
    646,
    "backdrop",
    (poster) => poster.poster_id === uploaded.poster_id,
  );

  const library = await ensureMediaLibrarySynced();
  const movie = library.movies.find((item) => item.tmdb_id === 646);
  expect(movie, "expected Dr. No to exist in the synced media library").toBeTruthy();

  await openMyMediaMovie(page, movie!);
  await expect(page.getByRole("heading", { name: /Dr\. No/i })).toBeVisible();

  const selectedBackdropCard = page.getByRole("button", {
    name: "Dr. No backdrop options",
  }).first();

  await selectedBackdropCard.click();
  await page.getByRole("menuitem", {
    name: "Choose a backdrop from OpenPoster",
  }).click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this backdrop" }),
  }).last();
  await expect(drawer.getByText(fixtureCreatorDisplayName, { exact: false }).first()).toBeVisible();

  const useBackdropButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(useBackdropButton).toBeVisible();

  const applyRequestPromise = page.waitForRequest((request) =>
    request.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && request.method() === "POST",
  { timeout: 15_000 });
  const applyResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && response.request().method() === "POST",
  { timeout: 15_000 });

  await useBackdropButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const applyRequest = await applyRequestPromise;
  const applyResponse = await applyResponsePromise;
  if (!applyResponse.ok()) {
    const responseText = await applyResponse.text().catch(() => "");
    throw new Error(`Movie backdrop apply failed with ${applyResponse.status()}: ${responseText}`);
  }

  const applyRequestBody = applyRequest.postDataJSON() as {
    poster_id?: string | null;
    asset_hash?: string | null;
  } | null;
  if (!applyRequestBody?.poster_id || !applyRequestBody?.asset_hash) {
    throw new Error(`Movie backdrop apply omitted tracking fields: ${JSON.stringify(applyRequestBody)}`);
  }

  const applyJson = (await applyResponse.json()) as { media_item_id?: string };
  const trackedMediaItemId = `${applyJson.media_item_id ?? movie!.id}:bg`;

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media movie backdrop to be tracked on the node",
    })
    .toBe(uploaded.poster_id);

});
