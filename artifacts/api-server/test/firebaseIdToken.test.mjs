import assert from "node:assert/strict";
import test from "node:test";
import { validateFirebaseClaims } from "../src/lib/firebaseIdToken.ts";

function validClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "nimbusdo",
    iss: "https://securetoken.google.com/nimbusdo",
    sub: "firebase-user-1",
    exp: now + 3600,
    iat: now - 10,
    auth_time: now - 20,
    email: "student@example.com",
    email_verified: true,
    ...overrides,
  };
}

test("accepts current Firebase claims for the Nimbus project", () => {
  assert.equal(validateFirebaseClaims(validClaims()).sub, "firebase-user-1");
});

test("rejects tokens issued for a different Firebase project", () => {
  assert.throws(() => validateFirebaseClaims(validClaims({ aud: "another-project" })), /audience/);
  assert.throws(() => validateFirebaseClaims(validClaims({ iss: "https://securetoken.google.com/another-project" })), /issuer/);
});

test("rejects expired or future-dated Firebase claims", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => validateFirebaseClaims(validClaims({ exp: now - 1 })), /expired/);
  assert.throws(() => validateFirebaseClaims(validClaims({ iat: now + 120 })), /issued-at/);
});
