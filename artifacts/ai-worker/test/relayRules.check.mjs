import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(
  resolve(
    process.env.NIMBUS_RULE_TEST_MODULE_DIR || process.cwd(),
    "package.json",
  ),
);
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} = require("firebase/firestore");
const rules = (
  await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8")
).replace(
  /(function relayProcessor\(\)[\s\S]*?request.auth.uid == )'[^']+'/,
  "$1'processor'",
);
const env = await initializeTestEnvironment({
  projectId: "demo-nimbus-relay",
  firestore: { host: "127.0.0.1", port: 8089, rules },
});
try {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "aiRelayConfig", "default"), {
      enabled: true,
    });
  });
  const owner = env.authenticatedContext("owner").firestore();
  const other = env.authenticatedContext("other").firestore();
  const processor = env.authenticatedContext("processor").firestore();
  const submit = (db, uid, id, extra = {}) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "aiRelayLimits", uid), {
      jobId: id,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "aiRelayJobs", id), {
      ownerUid: uid,
      mode: "general",
      status: "pending",
      inputJson: '{"message":"Hello"}',
      createdAt: serverTimestamp(),
      ...extra,
    });
    return batch.commit();
  };
  await assertSucceeds(submit(owner, "owner", "ABCDEFGHIJKLMNOPQRST"));
  await assertFails(getDoc(doc(other, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST")));
  await assertSucceeds(
    getDoc(doc(processor, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST")),
  );
  await assertFails(
    updateDoc(doc(owner, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST"), {
      status: "done",
      responseText: "Forged answer",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(processor, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST"), {
      status: "processing",
    }),
  );
  await assertFails(
    updateDoc(doc(processor, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST"), {
      ownerUid: "other",
    }),
  );
  await assertFails(submit(owner, "owner", "ZYXWVUTSRQPONMLKJIHG"));
  await assertFails(deleteDoc(doc(owner, "aiRelayLimits", "owner")));
  await assertFails(
    submit(other, "other", "ZZZZZZZZZZZZZZZZZZZZ", { ownerUid: "owner" }),
  );
  await assertFails(
    submit(other, "other", "YYYYYYYYYYYYYYYYYYYY", { status: "done" }),
  );
  await assertFails(
    setDoc(doc(owner, "aiRelayConfig", "default"), { enabled: true }),
  );
  await assertFails(
    getDoc(doc(processor, "users", "owner", "aiChats", "private")),
  );
  await assertFails(
    setDoc(doc(processor, "users", "owner", "tasks", "task"), {
      title: "Unauthorized",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(processor, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST"), {
      status: "done",
      responseStatus: 200,
      responseText: "answer",
    }),
  );
  await assertSucceeds(
    deleteDoc(doc(owner, "aiRelayJobs", "ABCDEFGHIJKLMNOPQRST")),
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "aiRelayConfig", "default"), {
      enabled: false,
    });
    await setDoc(doc(context.firestore(), "aiRelayLimits", "other"), {
      jobId: "old",
      updatedAt: Timestamp.fromMillis(0),
    });
  });
  await assertFails(submit(other, "other", "XXXXXXXXXXXXXXXXXXXX"));
  console.log(
    "Relay rules: 16 ownership, authorization, rate-limit, and disabled-state checks passed.",
  );
} finally {
  await env.cleanup();
}
