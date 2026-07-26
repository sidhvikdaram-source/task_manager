import assert from "node:assert/strict";
import test from "node:test";
import { FORECAST_COSTS, rollForecast, windyReward } from "../src/lib/forecastRules.ts";

test("daily forecast bands preserve a five percent rainbow chance", () => {
  assert.equal(rollForecast(0), "rainbow");
  assert.equal(rollForecast(4), "rainbow");
  assert.equal(rollForecast(5), "windy");
  assert.equal(rollForecast(29), "windy");
  assert.equal(rollForecast(30), "foggy");
  assert.equal(rollForecast(49), "foggy");
  assert.equal(rollForecast(50), "stormy");
  assert.equal(rollForecast(69), "stormy");
  assert.equal(rollForecast(70), "sunny");
  assert.equal(rollForecast(99), "sunny");
});

test("wind rewards are bounded and not guaranteed", () => {
  assert.equal(windyReward(45, 4), 0);
  assert.equal(windyReward(12, 0), 6);
  assert.equal(windyReward(12, 10), 16);
  assert.equal(windyReward(12, 999), 16);
});

test("forecast agency prices increase with information and progression value", () => {
  assert.ok(FORECAST_COSTS.reroll < FORECAST_COSTS.peek);
  assert.ok(FORECAST_COSTS.peek < FORECAST_COSTS.boost);
});
