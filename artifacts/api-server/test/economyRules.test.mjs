import assert from "node:assert/strict";
import test from "node:test";
import { STORE_ITEMS, VP_RULES } from "../src/lib/economyConfig.ts";
import {
  momentumMilestoneAwards,
  nextBpBalance,
  purchaseEligibility,
} from "../src/lib/economyRules.ts";

test("BP earning and spending preserve a nonnegative balance", () => {
  assert.equal(nextBpBalance(25, 15), 40);
  assert.equal(nextBpBalance(40, -30), 10);
  assert.throws(() => nextBpBalance(10, -11), /INSUFFICIENT_BP/);
});

test("duplicate cosmetics and locked inventory are rejected", () => {
  assert.deepEqual(purchaseEligibility({ balance: 500, priceBp: 100, owned: true, repeatable: false, lockReason: null }), { allowed: false, reason: "ALREADY_OWNED" });
  assert.deepEqual(purchaseEligibility({ balance: 500, priceBp: 100, owned: false, repeatable: false, lockReason: "Reach Tier 3" }), { allowed: false, reason: "Reach Tier 3" });
  assert.deepEqual(purchaseEligibility({ balance: 50, priceBp: 100, owned: false, repeatable: false, lockReason: null }), { allowed: false, reason: "INSUFFICIENT_BP" });
});

test("repeatable chest keys remain purchasable after ownership", () => {
  assert.deepEqual(purchaseEligibility({ balance: 500, priceBp: 125, owned: true, repeatable: true, lockReason: null }), { allowed: true, reason: null });
  assert.equal(STORE_ITEMS.find((item) => item.id === "chest-key")?.repeatable, true);
});

test("forecast tools are repeatable BP purchases rather than permanent cosmetics", () => {
  const tools = STORE_ITEMS.filter((item) => item.category === "forecast_items");
  assert.deepEqual(tools.map((item) => item.id), ["weather-reroll", "tomorrow-peek", "tailwind-boost"]);
  assert.ok(tools.every((item) => item.repeatable && !item.equipable && item.kind === "forecast_consumable"));
});

test("Momentum milestone rewards are lifetime thresholds and never imply a reset", () => {
  assert.deepEqual(momentumMilestoneAwards(2, 3), [{ days: 3, bp: 20 }]);
  assert.deepEqual(momentumMilestoneAwards(3, 7), [{ days: 7, bp: 35 }]);
  assert.deepEqual(momentumMilestoneAwards(7, 7), []);
  assert.throws(() => momentumMilestoneAwards(7, 6), /INVALID_MOMENTUM_RANGE/);
});

test("store inventory is priced only in BP while VP remains progression config", () => {
  assert.ok(STORE_ITEMS.every((item) => item.priceBp > 0));
  assert.equal(VP_RULES.tierSize, 100);
  assert.equal("priceVp" in STORE_ITEMS[0], false);
});
