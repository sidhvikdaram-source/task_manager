# Firebase AI relay

Firebase queue transport for browsers unable to reach the existing AI HTTPS endpoints. Activation is controlled by the server configuration document. No billing is required within existing free quotas. Cloudflare/Groq quotas still apply; this changes the browser transport, not model capacity.

The browser first tries the existing HTTPS AI endpoints. Only a transport failure permits relay fallback, and only when a server-read `aiRelayConfig/default` document has `enabled: true`. Provider HTTP failures never resubmit via the relay. The browser atomically writes `aiRelayJobs/{autoId}` with its Firebase UID, mode, serialized input, pending status, and server timestamp, plus a per-user rate document. No identity token or provider key is saved in a job. Rules enforce ownership, one submission per ten seconds, immutable inputs, and processor-only answer updates. Users can read/delete only their own jobs. The client deletes completed, stopped, and timed-out jobs; cron additionally removes old queue records in bounded batches.

A dedicated Firebase Authentication identity uses the Firebase REST API under the actual deployed security rules. It can read the queue and write results, but cannot read another user's chat history or edit their tasks. It has no IAM administrator role or service-account key. Its long-lived refresh credential stays in the existing Worker secret `FIREBASE_RELAY_REFRESH_TOKEN`; the corresponding UID is server configuration `FIREBASE_RELAY_UID` and the deployed rule's `relayProcessor()` identifier. Use a dedicated identity that is neither an approved administrator nor a real Nimbus user's account. Do not use a user's refresh token.

The scheduled handler enumerates at most three pending jobs each minute using the built-in single-field status index and delegates them through the same-Worker service binding. The processor verifies that its caller is the restricted Firebase identity, claims the job with a Firestore update-time precondition, and invokes the existing task/general pipeline under the rules-verified job owner's rate-limit key. Expired jobs fail without calling AI. It never automatically retries a claimed job. The processor-only `/relay-poll` endpoint permits setup diagnostics but is not called from the browser. Thus a failed or interrupted model call cannot silently double-consume allowance. Public `/relay-process` requests from other identities fail closed.

Replies are buffered in Firebase then read with the existing response parser; incremental streaming is unavailable on this fallback. Waiting for the next scheduled scan can add up to around a minute, in addition to inference. Client waiting is bounded. Worker free CPU limits and database/provider quotas require live verification; successful emulator tests alone do not prove capacity. A canceled in-progress job may already have consumed model allowance.

Activation order:

1. Obtain approval to create the restricted identity and transfer its credential to the existing Worker.
2. Create it privately, replace the inactive rule UID placeholder, configure the UID and secret, and deploy the rules. No new composite index is required.
3. Deploy Worker with one-minute cron and its service binding. Keep the client config disabled.
4. Run disposable task/general relay smoke jobs, checking results and authentication rejection; remove test jobs.
5. Enable the server configuration and deploy/verify the matching frontend. Exercise the school flow when that browser is available.

If activation fails, keep or restore `enabled: false`; do not enable billing, weaken authentication, or store credentials in queue/client data. The queue approach still requires the school to permit Nimbus's existing Firebase data connection; it does not disable school controls.

Validation: `test/firebaseRelay.test.mjs` covers processor identity, claims, replay suppression, final response transport, and inactive setup. `test/relayRules.check.mjs` uses an isolated Firestore emulator with `@firebase/rules-unit-testing` and `firebase` installed in the directory specified by `NIMBUS_RULE_TEST_MODULE_DIR`. Sixteen rules checks cover cross-user reads, forged replies, impersonated owners, submission cooldown, immutable ownership, disabled config, and denial of processor access to other users' chats/tasks.
