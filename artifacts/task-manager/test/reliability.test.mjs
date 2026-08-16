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

test("public home and authenticated My Day use distinct routes", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const onboarding = readFileSync(
    new URL("../src/components/OnboardingFlow.tsx", import.meta.url),
    "utf8",
  );
  const sidebar = readFileSync(
    new URL("../src/components/layout/Sidebar.tsx", import.meta.url),
    "utf8",
  );
  const tutorial = readFileSync(
    new URL("../src/components/TutorialTour.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /location === "\/"[\s\S]*<LandingPage/);
  assert.match(app, /<Route path="\/today" component=\{Today\}/);
  assert.match(onboarding, /navigate\("\/today", \{ replace: true \}\)/);
  assert.match(sidebar, /href: "\/today", label: "My Day"/);
  assert.doesNotMatch(tutorial, /path: "\/",/);
  assert.match(tutorial, /path: "\/today",/);
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

test("mobile navigation uses Safari-safe tap targets and safe-area layout", () => {
  const mobileNav = readFileSync(
    new URL("../src/components/layout/MobileBottomNav.tsx", import.meta.url),
    "utf8",
  );
  const topNav = readFileSync(
    new URL("../src/components/layout/TopNav.tsx", import.meta.url),
    "utf8",
  );
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.doesNotMatch(`${mobileNav}\n${topNav}`, /<Link[^>]*>\s*<(?:motion\.)?button/);
  assert.match(mobileNav, /aria-label=\{item\.label\}[\s\S]*touch-manipulation/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.mobile-solid-surface[\s\S]*backdrop-filter:\s*none/);
});

test("startup work is cached and deferred without weakening AI actions", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const experience = readFileSync(
    new URL("../src/experience.tsx", import.meta.url),
    "utf8",
  );
  const canvas = readFileSync(
    new URL("../src/hooks/useCanvasSync.ts", import.meta.url),
    "utf8",
  );
  const assistant = readFileSync(
    new URL("../src/components/VelocityAssistantCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /staleTime:\s*30_000/);
  assert.match(experience, /velocity-preferences:/);
  assert.match(experience, /AbortController/);
  assert.match(canvas, /requestIdleCallback/);
  assert.match(canvas, /enabled:\s*statusEnabled/);
  assert.match(assistant, /fetch\('\/api\/ai\/chat'/);
  assert.match(assistant, /history/);
  assert.match(assistant, /AbortController/);
  assert.match(assistant, /\/api\/ai\/plans\/confirm/);
  assert.match(assistant, /\/api\/ai\/workspace\/confirm/);
  assert.doesNotMatch(assistant, /i \+= 8|setTimeout\(resolve, 4\)/);
});
