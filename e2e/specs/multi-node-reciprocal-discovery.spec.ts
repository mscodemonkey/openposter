import { expect, test } from "@playwright/test";

import {
  TED_POSTER_IMAGE,
  TEST_NODE_B_URL,
  TEST_NODE_URL,
  TEST_WEB_URL,
  ensureDefaultTheme,
  ensureDefaultThemeAt,
  listNodePeersAt,
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

test("node-a and node-b register each other and both creators become searchable through the indexer", async ({ page }) => {
  const nodeATheme = await ensureDefaultTheme();
  const nodeBTheme = await ensureDefaultThemeAt(TEST_NODE_B_URL, "nodeb-recip");

  const nodeAPoster = await uploadPoster({
    filePath: TED_POSTER_IMAGE,
    fileName: "dr-no-node-a-recip.jpg",
    mediaType: "movie",
    tmdbId: 646,
    title: "Dr. No",
    year: 1962,
    themeId: nodeATheme.theme_id,
    language: "en",
    published: true,
    creatorDisplayName: "Node A Reciprocal",
  });

  const nodeBPoster = await uploadPoster({
    nodeUrl: TEST_NODE_B_URL,
    creatorId: "nodeb-recip",
    creatorDisplayName: "Node B Reciprocal",
    filePath: TED_POSTER_IMAGE,
    fileName: "ted-node-b-recip.jpg",
    mediaType: "show",
    tmdbId: 201834,
    title: "ted",
    year: 2024,
    themeId: nodeBTheme.theme_id,
    language: "en",
    published: true,
  });

  await registerNodePeer(TEST_NODE_URL, "http://node-b:8080");
  await registerNodePeer(TEST_NODE_B_URL, "http://node-a:8080");

  await expect
    .poll(async () => {
      const nodes = await listNodePeersAt(TEST_NODE_URL);
      return nodes.some((node) => node.url === "http://node-b:8080" && node.status === "active");
    }, {
      timeout: 30_000,
      message: "expected node-a to list node-b as an active peer",
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const nodes = await listNodePeersAt(TEST_NODE_B_URL);
      return nodes.some((node) => node.url === "http://node-a:8080" && node.status === "active");
    }, {
      timeout: 30_000,
      message: "expected node-b to list node-a as an active peer",
    })
    .toBe(true);

  await waitForIndexerNode(
    (node) => node.url === "http://node-a:8080" && node.status === "up",
    90_000,
  );
  await waitForIndexerNode(
    (node) => node.url === "http://node-b:8080" && node.status === "up",
    90_000,
  );

  await waitForIndexedPoster(
    646,
    "movie",
    (poster) => poster.poster_id === nodeAPoster.poster_id,
    90_000,
  );
  await waitForIndexedPoster(
    201834,
    "show",
    (poster) => poster.poster_id === nodeBPoster.poster_id,
    90_000,
  );

  const movieResults = await searchIndexer({ tmdbId: 646, type: "movie", limit: 50 });
  const showResults = await searchIndexer({ tmdbId: 201834, type: "show", limit: 50 });
  expect(movieResults.some((poster) => poster.poster_id === nodeAPoster.poster_id)).toBe(true);
  expect(showResults.some((poster) => poster.poster_id === nodeBPoster.poster_id)).toBe(true);

  await page.goto(`${TEST_WEB_URL}/api/search?tmdb_id=646&type=movie&limit=50`);
  const movieJson = await page.evaluate(() => document.body.innerText);
  expect(movieJson).toContain(nodeAPoster.poster_id);
  expect(movieJson).toContain("Node A Reciprocal");

  await page.goto(`${TEST_WEB_URL}/api/search?tmdb_id=201834&type=show&limit=50`);
  const showJson = await page.evaluate(() => document.body.innerText);
  expect(showJson).toContain(nodeBPoster.poster_id);
  expect(showJson).toContain("Node B Reciprocal");
});
