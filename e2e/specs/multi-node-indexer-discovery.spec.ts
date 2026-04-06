import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_B_URL,
  TEST_WEB_URL,
  ensureDefaultThemeAt,
  expectPosterAbsentFromIndexer,
  registerNodePeer,
  resetDevStack,
  searchIndexer,
  uploadPoster,
  waitForIndexedPoster,
  waitForIndexerNode,
} from "../helpers/openposter";

test.beforeEach(async () => {
  await resetDevStack();
});

test("indexer discovers node-b through node-a and exposes node-b artwork to web search", async ({ page }) => {
  const creatorId = "nodeb-e2e";
  const creatorDisplayName = "Node B E2E";
  const theme = await ensureDefaultThemeAt(TEST_NODE_B_URL, creatorId);

  const uploaded = await uploadPoster({
    nodeUrl: TEST_NODE_B_URL,
    creatorId,
    creatorDisplayName,
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-node-b-fixture.jpg",
    mediaType: "show",
    tmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: theme.theme_id,
    language: "en",
    published: true,
  });

  await expectPosterAbsentFromIndexer(
    201834,
    "show",
    (poster) => poster.poster_id === uploaded.poster_id,
  );

  await registerNodePeer("http://localhost:8081", "http://node-b:8080");

  await waitForIndexerNode(
    (node) => node.url === "http://node-b:8080" && node.status === "up",
    90_000,
  );

  await waitForIndexedPoster(
    201834,
    "show",
    (poster) => poster.poster_id === uploaded.poster_id,
    90_000,
  );

  const directResults = await searchIndexer({ tmdbId: 201834, type: "show", limit: 50 });
  expect(directResults.some((poster) => poster.poster_id === uploaded.poster_id)).toBe(true);

  await page.goto(`${TEST_WEB_URL}/api/search?tmdb_id=201834&type=show&limit=50`);
  const json = await page.evaluate(() => document.body.innerText);
  expect(json).toContain(uploaded.poster_id);
  expect(json).toContain(creatorDisplayName);
});
