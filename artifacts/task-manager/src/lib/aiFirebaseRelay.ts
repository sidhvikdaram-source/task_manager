import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { relayCooldownMillis, waitForRelayCooldown } from "./aiRoutePreference";
import { firebaseAuth, firebaseDb } from "@workspace/replit-auth-web";

export async function firebaseRelayEnabled() {
  const config = await getDocFromServer(
    doc(firebaseDb, "aiRelayConfig", "default"),
  );
  return config.exists() && config.data().enabled === true;
}
export async function requestFirebaseRelay(
  mode: "task" | "general",
  input: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (stage: "connecting" | "queued" | "processing") => void,
  configConfirmed = false,
): Promise<Response> {
  signal?.throwIfAborted();
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw Error("Sign in to use AI.");
  // Server read prevents a cached configuration from activating an unavailable relay.
  if (!configConfirmed && !(await firebaseRelayEnabled()))
    throw Error(
      "The Firebase AI connection is not enabled yet. Your chat is saved.",
    );
  const inputJson = JSON.stringify(input);
  if (
    new TextEncoder().encode(inputJson).length >
    (mode === "task" ? 100000 : 450000)
  )
    throw Error("AI request is too large.");
  const limit = await getDocFromServer(doc(firebaseDb, "aiRelayLimits", uid));
  const wait = relayCooldownMillis(limit.data()?.updatedAt?.toMillis?.() ?? 0);
  if (wait > 0) {
    onProgress?.("queued");
    await waitForRelayCooldown(wait, signal);
  }
  signal?.throwIfAborted();
  if (firebaseAuth.currentUser?.uid !== uid)
    throw Error("Your account changed. Please reopen the chat.");
  const job = doc(collection(firebaseDb, "aiRelayJobs"));
  const batch = writeBatch(firebaseDb);
  batch.set(doc(firebaseDb, "aiRelayLimits", uid), {
    jobId: job.id,
    updatedAt: serverTimestamp(),
  });
  batch.set(job, {
    ownerUid: uid,
    mode,
    inputJson,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "permission-denied")
      throw Error(
        "Nimbus could not queue this message. Wait ten seconds and retry; if it persists, refresh your sign-in. This is not the AI provider’s credit limit. [FIREBASE-QUEUE]",
      );
    if (code === "resource-exhausted")
      throw Error(
        "Nimbus’s Firebase allowance is currently exhausted. This is separate from the AI provider’s allowance. [FIREBASE-LIMIT]",
      );
    throw error;
  }
  onProgress?.("queued");
  return new Promise<Response>((resolve, reject) => {
    let unsubscribe = () => {};
    let finished = false;
    const finish = (error?: Error, response?: Response) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      // The owner may delete only their job. Cleanup failure never changes an answer.
      void deleteDoc(job).catch(() => {});
      error ? reject(error) : resolve(response!);
    };
    const abort = () =>
      finish(new DOMException("Response stopped", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "The queued AI request timed out. Please retry; your chat is saved.",
          ),
        ),
      210000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    unsubscribe = onSnapshot(
      job,
      (snapshot) => {
        if (firebaseAuth.currentUser?.uid !== uid) {
          finish(new Error("Your account changed. Please reopen the chat."));
          return;
        }
        if (!snapshot.exists()) return;
        const result = snapshot.data();
        if (result.status === "processing") onProgress?.("processing");
        if (result.status === "failed")
          finish(new Error(String(result.error || "AI could not finish.")));
        if (result.status === "done") {
          if (
            typeof result.responseText !== "string" ||
            !Number.isInteger(result.responseStatus) ||
            result.responseStatus < 200 ||
            result.responseStatus > 599
          ) {
            finish(new Error("AI returned an invalid response."));
            return;
          }
          finish(
            undefined,
            new Response(result.responseText, {
              status: result.responseStatus,
              headers: {
                "Content-Type": result.responseType || "application/json",
              },
            }),
          );
        }
      },
      () =>
        finish(
          new Error(
            "Nimbus could not read the queued AI response. Your chat is saved.",
          ),
        ),
    );
  });
}
