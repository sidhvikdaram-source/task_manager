import test from "node:test";
import assert from "node:assert/strict";
import {
  prefersRelay,
  rememberRelay,
} from "../../task-manager/src/lib/aiRoutePreference.ts";
test("working route persists per account, expires, and tolerates storage denial", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  rememberRelay(storage, "alice");
  assert.equal(prefersRelay(storage, "alice"), true);
  assert.equal(prefersRelay(storage, "bob"), false);
  assert.equal(prefersRelay(storage, "alice", Date.now() + 7 * 3600000), false);
  assert.equal(
    prefersRelay(
      {
        getItem: () => {
          throw Error("denied");
        },
      },
      "alice",
    ),
    false,
  );
});

test("school host starts on Firebase in a fresh session; custom endpoints stay explicit", async () => {
  const { schoolRelayPreferred, relayCooldownMillis, waitForRelayCooldown } =
    await import("../../task-manager/src/lib/aiRoutePreference.ts");
  assert.equal(schoolRelayPreferred("nimbusdo.firebaseapp.com"), true);
  assert.equal(
    schoolRelayPreferred("nimbusdo.firebaseapp.com", "https://custom.example"),
    false,
  );
  assert.equal(schoolRelayPreferred("nimbusdo.web.app"), false);
  assert.equal(
    schoolRelayPreferred("nimbusdo.firebaseapp.com.untrusted.example"),
    false,
  );
  assert.equal(relayCooldownMillis(10000, 16000), 4250);
  assert.equal(relayCooldownMillis(10000, 21000), 0);
  assert.equal(relayCooldownMillis(NaN), 0);
  assert.equal(relayCooldownMillis(999999, 10000), 10250);
  const controller = new AbortController();
  const waiting = waitForRelayCooldown(10000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, (error) => error.name === "AbortError");
});
