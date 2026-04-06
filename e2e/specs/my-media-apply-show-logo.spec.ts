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

test("my media can apply OpenPoster show logo artwork", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Show Logo";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-my-media-logo.jpg",
    mediaType: "show",
    tmdbId: 201834,
    showTmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: true,
    kind: "logo",
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(
    201834,
    "show",
    (poster) => poster.poster_id === uploaded.poster_id,
    120_000,
    "logo",
  );

  const library = await ensureMediaLibrarySynced();
  const tedShow = library.shows.find((item) => item.tmdb_id === 201834);
  expect(tedShow, "expected ted (2024) to exist in the synced media library").toBeTruthy();

  await openMyMediaShow(page, tedShow!);
  await expect(page.getByRole("heading", { name: /ted/i })).toBeVisible();

  const logoCard = page.getByRole("button", {
    name: "View logo options",
  }).first();
  const logoContainer = logoCard.locator("xpath=..");
  await logoCard.click();
  await logoContainer.getByRole("button", {
    name: "Select a logo from an OpenPoster creator",
  }).click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this poster" }),
  }).last();

  const useLogoButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(useLogoButton).toBeVisible();

  const applyRequestPromise = page.waitForRequest((request) =>
    request.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && request.method() === "POST",
  { timeout: 15_000 });
  const applyResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && response.request().method() === "POST",
  { timeout: 15_000 });

  await useLogoButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const applyRequest = await applyRequestPromise;
  const applyResponse = await applyResponsePromise;
  if (!applyResponse.ok()) {
    const responseText = await applyResponse.text().catch(() => "");
    throw new Error(`Show logo apply failed with ${applyResponse.status()}: ${responseText}`);
  }

  const applyRequestBody = applyRequest.postDataJSON() as {
    poster_id?: string | null;
    asset_hash?: string | null;
  } | null;
  if (!applyRequestBody?.poster_id || !applyRequestBody?.asset_hash) {
    throw new Error(`Show logo apply omitted tracking fields: ${JSON.stringify(applyRequestBody)}`);
  }

  const applyJson = (await applyResponse.json()) as { media_item_id?: string };
  const trackedMediaItemId = `${applyJson.media_item_id ?? tedShow!.id}:logo`;

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media show logo artwork to be tracked on the node",
    })
    .toBe(uploaded.poster_id);
});
