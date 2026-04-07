import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_URL,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  openMyMediaShow,
  resetDevStack,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can apply and reset an OpenPoster show backdrop", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Show Backdrop";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-my-media-backdrop.jpg",
    mediaType: "backdrop",
    tmdbId: 201834,
    showTmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(
    201834,
    "backdrop",
    (poster) => poster.poster_id === uploaded.poster_id,
  );

  const library = await ensureMediaLibrarySynced();
  const tedShow = library.shows.find((item) => item.tmdb_id === 201834);
  expect(tedShow, "expected ted (2024) to exist in the synced media library").toBeTruthy();

  await openMyMediaShow(page, tedShow!);
  await expect(page.getByRole("heading", { name: /ted/i })).toBeVisible();

  const selectedBackdropCard = page.getByRole("button", {
    name: "ted backdrop options",
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
    throw new Error(`Show backdrop apply failed with ${applyResponse.status()}: ${responseText}`);
  }

  const applyRequestBody = applyRequest.postDataJSON() as {
    poster_id?: string | null;
    asset_hash?: string | null;
  } | null;
  if (!applyRequestBody?.poster_id || !applyRequestBody?.asset_hash) {
    throw new Error(`Show backdrop apply omitted tracking fields: ${JSON.stringify(applyRequestBody)}`);
  }

  const applyJson = (await applyResponse.json()) as { media_item_id?: string };
  const trackedMediaItemId = `${applyJson.media_item_id ?? tedShow!.id}:bg`;

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media show backdrop to be tracked on the node",
    })
    .toBe(uploaded.poster_id);

  await selectedBackdropCard.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  const resetBackdropButton = page.getByRole("menuitem", {
    name: "Reset to default backdrop",
  }).first();
  await expect(resetBackdropButton).toBeVisible();
  await resetBackdropButton.evaluate((item) => {
    (item as HTMLElement).click();
  });

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.some((item) => item.media_item_id === trackedMediaItemId);
    }, {
      timeout: 15_000,
      message: "expected the tracked show backdrop entry to be removed after reset",
    })
    .toBe(false);
});
