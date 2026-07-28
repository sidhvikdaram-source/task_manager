import assert from "node:assert/strict";
import test from "node:test";
import { isAdminEmail, normalizeAccountEmail } from "../src/lib/adminAccess.ts";

test("admin sandbox is limited to the two Nimbus tester accounts", () => {
  assert.equal(isAdminEmail("sidhvik.daram@gmail.com"), true);
  assert.equal(isAdminEmail("SIDHVIK.DARAM@K12.FRISCOISD.ORG"), true);
  assert.equal(isAdminEmail("sidhvik.daram+test@gmail.com"), false);
  assert.equal(isAdminEmail("student@k12.friscoisd.org"), false);
  assert.equal(isAdminEmail(null), false);
});

test("account emails are normalized before access checks", () => {
  assert.equal(normalizeAccountEmail("  SIDHVIK.DARAM@GMAIL.COM "), "sidhvik.daram@gmail.com");
});

