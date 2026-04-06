import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_URL,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getMediaChildren,
  getTrackedArtwork,
  openMyMediaSeason,
  resetDevStack,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can apply an OpenPoster episode card", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Episode";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-episode-my-media-fixture.jpg",
    mediaType: "episode",
    tmdbId: 201834,
    showTmdbId: 201834,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await waitForIndexedPoster(
    201834,
    "episode",
    (poster) =>
      poster.poster_id === uploaded.poster_id
      && poster.media.season_number === 1
      && poster.media.episode_number === 1,
  );

  const library = await ensureMediaLibrarySynced();
  const tedShow = library.shows.find((item) => item.tmdb_id === 201834);
  expect(tedShow, "expected ted (2024) to exist in the synced media library").toBeTruthy();

  const seasons = await getMediaChildren(tedShow!.id);
  const seasonOne = seasons.find((item) => item.type === "season" && item.index === 1) ?? seasons[0];
  expect(seasonOne, "expected season 1 to exist for ted").toBeTruthy();

  const episodes = await getMediaChildren(seasonOne!.id);
  const episodeOne = episodes.find((item) => item.type === "episode" && item.index === 1) ?? episodes[0];
  expect(episodeOne, "expected episode 1 to exist for ted season 1").toBeTruthy();

  await openMyMediaSeason(page, { show: tedShow!, season: seasonOne! });
  await expect(page.getByRole("heading", { name: /Season/i }).first()).toBeVisible();

  const selectEpisodeButton = page.getByRole("button", {
    name: "Select an episode card from an OpenPoster creator",
  }).first();
  await expect(selectEpisodeButton).toBeVisible();
  await selectEpisodeButton.click();

  const drawer = page.getByRole("presentation").filter({
    has: page.getByRole("button", { name: "Use this episode card" }),
  }).last();
  await expect(drawer.getByText(fixtureCreatorDisplayName, { exact: false }).first()).toBeVisible();

  const useEpisodeButton = drawer.getByTestId(`use-artwork-${uploaded.poster_id}`);
  await expect(useEpisodeButton).toBeVisible();

  const applyRequestPromise = page.waitForRequest((request) =>
    request.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && request.method() === "POST",
  { timeout: 15_000 });
  const applyResponsePromise = page.waitForResponse((response) =>
    response.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && response.request().method() === "POST",
  { timeout: 15_000 });

  await useEpisodeButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const applyRequest = await applyRequestPromise;
  const applyResponse = await applyResponsePromise;
  if (!applyResponse.ok()) {
    const responseText = await applyResponse.text().catch(() => "");
    throw new Error(`Episode card apply failed with ${applyResponse.status()}: ${responseText}`);
  }

  const applyRequestBody = applyRequest.postDataJSON() as {
    poster_id?: string | null;
    asset_hash?: string | null;
  } | null;
  if (!applyRequestBody?.poster_id || !applyRequestBody?.asset_hash) {
    throw new Error(`Episode apply omitted tracking fields: ${JSON.stringify(applyRequestBody)}`);
  }

  const applyJson = (await applyResponse.json()) as { media_item_id?: string };
  const trackedMediaItemId = applyJson.media_item_id ?? episodeOne!.id;

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === trackedMediaItemId)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected the applied My Media episode card to be tracked on the node",
    })
    .toBe(uploaded.poster_id);
});
