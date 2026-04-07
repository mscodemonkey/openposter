import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_URL,
  createIssuerSession,
  ensureDefaultTheme,
  ensureMediaLibrarySynced,
  getTrackedArtwork,
  listFavouriteCreators,
  openMyMediaMovie,
  primeIssuerSession,
  resetDevStack,
  skipIfPlexUnavailable,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

skipIfPlexUnavailable(test);

test.beforeEach(async () => {
  await resetDevStack();
});

test("my media can subscribe to the creator of applied artwork", async ({ page }) => {
  const fixtureCreatorId = "mcfly";
  const fixtureCreatorDisplayName = "E2E Subscribe Creator";
  const theme = await ensureDefaultTheme();
  const issuerSession = await createIssuerSession({ displayName: "E2E Subscriber" });

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-subscribe-fixture.jpg",
    mediaType: "movie",
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
    "movie",
    (poster) => poster.poster_id === uploaded.poster_id,
  );

  const library = await ensureMediaLibrarySynced();
  const movie = library.movies.find((item) => item.tmdb_id === 646);
  expect(movie, "expected Dr. No to exist in the synced media library").toBeTruthy();

  await primeIssuerSession(page, issuerSession);
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

  const applyRequestPromise = page.waitForResponse((response) =>
    response.url().startsWith(`${TEST_NODE_URL}/v1/admin/plex/apply`)
      && response.request().method() === "POST",
  { timeout: 15_000 });

  await usePosterButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const applyResponse = await applyRequestPromise;
  if (!applyResponse.ok()) {
    const responseText = await applyResponse.text().catch(() => "");
    throw new Error(`Movie apply before subscribe failed with ${applyResponse.status()}: ${responseText}`);
  }

  await expect
    .poll(async () => {
      const tracked = await getTrackedArtwork();
      return tracked.find((item) => item.media_item_id === movie!.id)?.creator_id ?? null;
    }, {
      timeout: 15_000,
      message: "expected movie poster to be tracked before subscribing to the creator",
    })
    .toBe(fixtureCreatorId);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden({ timeout: 15_000 });

  await movieCard.click();
  const subscribeMenuItem = page.getByTestId(`creator-subscription-${fixtureCreatorId}`).first();
  await expect(subscribeMenuItem).toBeVisible();
  await subscribeMenuItem.evaluate((item) => {
    (item as HTMLElement).click();
  });

  await expect
    .poll(async () => {
      const favourites = await listFavouriteCreators(issuerSession.token);
      return favourites.some((entry) => entry.creator_id === fixtureCreatorId);
    }, {
      timeout: 15_000,
      message: "expected the applied artwork creator to be stored in issuer favourites",
    })
    .toBe(true);
});
