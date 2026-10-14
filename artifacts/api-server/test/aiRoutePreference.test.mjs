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
