import assert from "node:assert/strict";
import test from "node:test";
import { boundsWithin } from "../src/lib/motionGeometry.ts";
import { sortRewardChests } from "../src/lib/rewardUi.ts";

test("sidebar indicator bounds remain relative to the persistent sidebar", () => {
  assert.deepEqual(
    boundsWithin(
      { left: 12, top: 20, width: 224, height: 800 },
      { left: 24, top: 310, width: 200, height: 40 },
    ),
    { x: 12, y: 290, width: 200, height: 40 },
  );
});

test("unopened chests stay reachable ahead of opened reward history", () => {
  const ordered = sortRewardChests([
    { id: 1, status: "opened", awardedAt: "2026-07-22T12:00:00Z" },
    { id: 2, status: "unopened", awardedAt: "2026-07-20T12:00:00Z" },
    { id: 3, status: "opened", awardedAt: "2026-07-23T12:00:00Z" },
    { id: 4, status: "unopened", awardedAt: "2026-07-21T12:00:00Z" },
  ]);

  assert.deepEqual(ordered.map((chest) => chest.id), [4, 2, 3, 1]);
});

test("sorting chest history never mutates cached API data", () => {
  const source = [
    { id: 1, status: "opened", awardedAt: "2026-07-20T12:00:00Z" },
    { id: 2, status: "unopened", awardedAt: "2026-07-19T12:00:00Z" },
  ];
  sortRewardChests(source);
  assert.deepEqual(source.map((chest) => chest.id), [1, 2]);
});
