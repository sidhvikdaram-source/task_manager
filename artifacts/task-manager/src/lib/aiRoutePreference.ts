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
