import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readRoute = (name) =>
  readFileSync(new URL(`../src/routes/${name}.ts`, import.meta.url), "utf8");

test("personalized API responses are private and never shared by caches", () => {
  const routes = readRoute("index");
  assert.match(routes, /Cache-Control", "private, no-store"/);
  assert.match(routes, /Vary", "Cookie"/);
});

test("recommendations only rank the authenticated user's tasks", () => {
  const planning = readRoute("planning");
  const recommendationRoute = planning.slice(
    planning.indexOf('router.get("/recommendations/next"'),
    planning.indexOf('router.get("/weekly-review"'),
  );
  assert.match(recommendationRoute, /eq\(tasksTable\.userId, req\.user\.id\)/);
  assert.match(recommendationRoute, /eq\(tasksTable\.archived, false\)/);
  assert.match(recommendationRoute, /eq\(tasksTable\.blocked, false\)/);
});

test("subject and friend-request mutations retain authenticated ownership checks", () => {
  const planning = readRoute("planning");
  const social = readRoute("social");
  assert.match(
    planning,
    /eq\(subjectsTable\.id, existing\.id\), eq\(subjectsTable\.userId, req\.user\.id\)/,
  );
  assert.match(
    social,
    /eq\(friendshipsTable\.id, id\), eq\(friendshipsTable\.recipientId, req\.user\.id\)/,
  );
});
