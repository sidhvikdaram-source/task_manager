const TTL = 6 * 60 * 60 * 1000;
const key = (uid: string) => `nimbus-ai-relay:${uid}`;
export function prefersRelay(
  storage: Pick<Storage, "getItem">,
  uid: string,
  now = Date.now(),
) {
  try {
    const saved = Number(storage.getItem(key(uid)));
    return saved > 0 && saved <= now && now - saved < TTL;
  } catch {
    return false;
  }
}
export function rememberRelay(storage: Pick<Storage, "setItem">, uid: string) {
  try {
    storage.setItem(key(uid), String(Date.now()));
  } catch {
    /* Optional route cache. */
  }
}

// This is the official host used on the school network. Start on its known
// working route even when storage is cleared or disabled between sessions.
export function schoolRelayPreferred(hostname: string, configured = "") {
  return hostname === "nimbusdo.firebaseapp.com" && !configured.trim();
}

export function relayCooldownMillis(updatedAt: number, now = Date.now()) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 0;
  return Math.max(0, Math.min(10250, updatedAt + 10250 - now));
}
export function waitForRelayCooldown(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Response stopped", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
