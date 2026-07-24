import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  sortRewardChests,
  withEquippedReward,
} from "../src/lib/rewardUi.ts";

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

test("equipping a reward updates shared state without mutating the cache snapshot", () => {
  const original = {
    equipped: {
      completion_effect: "clean-confetti",
      transition: "velocity-slide",
    },
    owned: ["prism-pop"],
  };
  const updated = withEquippedReward(
    original,
    "completion_effect",
    "prism-pop",
  );

  assert.equal(updated.equipped.completion_effect, "prism-pop");
  assert.equal(original.equipped.completion_effect, "clean-confetti");
  assert.notEqual(updated.equipped, original.equipped);
});

test("page navigation renders without reward-driven route animation", () => {
  const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /transitionMotion|routeDirection|equipped\?\.transition/);
  assert.doesNotMatch(routes, /key=\{location\}/);
});

test("Quick Capture uses one visible, forward-only trace and pauses off-page", () => {
  const css = readFileSync(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  const quickCapture = css.slice(
    css.indexOf(".quick-capture-shell"),
    css.indexOf(".velocity-skeleton"),
  );

  assert.match(quickCapture, /animation:\s*quick-capture-trace\s+3\.8s\s+linear\s+infinite/);
  assert.match(quickCapture, /data-page-visible="true"/);
  assert.match(quickCapture, /conic-gradient/);
  assert.match(quickCapture, /var\(--secondary\)/);
  assert.doesNotMatch(quickCapture, /::before|animation-direction|alternate|rotate\(/);
  assert.match(
    css,
    /@property --quick-capture-angle[\s\S]*@keyframes quick-capture-trace\s*\{\s*to\s*\{\s*--quick-capture-angle:\s*360deg/,
  );
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("navigation and writes avoid persistent observers and global refetch storms", () => {
  const sidebar = readFileSync(
    new URL("../src/components/layout/Sidebar.tsx", import.meta.url),
    "utf8",
  );
  const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const canvas = readFileSync(
    new URL("../src/hooks/useCanvasSync.ts", import.meta.url),
    "utf8",
  );
  const createTask = readFileSync(
    new URL("../src/components/CreateTaskModal.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(sidebar, /ResizeObserver|requestAnimationFrame/);
  assert.doesNotMatch(routes, /mode="popLayout"|will-change-transform/);
  assert.doesNotMatch(canvas, /queryClient\.invalidateQueries\(\)/);
  assert.doesNotMatch(createTask, /refetchQueries|refetchType:\s*['"]all['"]/);
});
