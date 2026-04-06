import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_B_URL,
  TEST_WEB_B_URL,
  ensureDefaultTheme,
  ensureMediaLibrarySyncedAt,
  getTrackedArtworkAt,
  openMyMediaMovieAt,
  resetDevStack,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("web-b can apply indexed node-a artwork onto node-b from My Media", async ({ page }) => {
  const fixtureCreatorDisplayName = "E2E Consumer";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-node-b-consumer-fixture.jpg",
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

  const nodeBLibrary = await ensureMediaLibrarySyncedAt(TEST_NODE_B_URL);
  const movie = nodeBLibrary.movies.find((item) => item.tmdb_id === 646);
  expect(movie, "expected Dr. No to exist in node-b's synced media library").toBeTruthy();

  await openMyMediaMovieAt(page, movie!, {
    webUrl: TEST_WEB_B_URL,
    nodeUrl: TEST_NODE_B_URL,
  });
  await expect(page.getByRole("heading", { name: /Dr\. No/i })).toBeVisible();

  const movieCard = page.getByRole("button", {
    name: "View alternate artwork and other options",
  }).first();
  await movieCard.click();
  await movieCard.getByRole("button", {
    name: "Select a new poster from an OpenPoster creator",
  }).click();

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
      const tracked = await getTrackedArtworkAt(TEST_NODE_B_URL);
      return tracked.find((item) => item.media_item_id === movie!.id)?.poster_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected node-b to track the artwork applied through web-b",
    })
    .toBe(uploaded.poster_id);
});
