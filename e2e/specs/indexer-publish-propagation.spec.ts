import { test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  ensureDefaultTheme,
  expectPosterAbsentFromIndexer,
  reindexIndexer,
  resetDevStack,
  setPosterPublished,
  uploadPoster,
  waitForIndexedPoster,
} from "../helpers/openposter";

test.beforeEach(async () => {
  await resetDevStack();
});

test("published artwork propagates to the indexer while drafts stay hidden", async () => {
  const fixtureCreatorDisplayName = "E2E Indexer";
  const theme = await ensureDefaultTheme();

  const uploaded = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-indexer-fixture.jpg",
    mediaType: "show",
    tmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: false,
    creatorDisplayName: fixtureCreatorDisplayName,
  });

  await reindexIndexer();
  await expectPosterAbsentFromIndexer(
    201834,
    "show",
    (poster) => poster.poster_id === uploaded.poster_id,
  );

  await setPosterPublished(uploaded.poster_id, true);

  await waitForIndexedPoster(
    201834,
    "show",
    (poster) => poster.poster_id === uploaded.poster_id,
    90_000,
  );
});
