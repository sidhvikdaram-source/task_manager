import { firebaseAuth } from "@workspace/replit-auth-web";
import { aiEndpoints, fetchAIResponse } from "./aiConnection";

function endpoints() {
  return aiEndpoints(
    Boolean(import.meta.env.PROD),
    import.meta.env.VITE_NIMBUS_AI_URL as string | undefined,
  );
}

export function aiEndpoint() {
  return endpoints()[0] || "";
}

export async function aiRequest(
  mode: "task" | "general",
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const candidates = endpoints();
  if (!candidates.length)
    throw new Error("AI is not connected yet. Your chats can still be saved.");
  await firebaseAuth.authStateReady();
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to use AI.");
  let response: Response;
  try {
    response = await fetchAIResponse(candidates, mode, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify({ ...input, firebaseIdToken: token }),
      signal,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/\[AI-(?:NETWORK|POST)\]/.test(error.message) ||
      signal?.aborted
    )
      throw error;
    const relay = await import("./aiFirebaseRelay");
    if (!(await relay.firebaseRelayEnabled().catch(() => false))) throw error;
    response = await relay.requestFirebaseRelay(mode, input, signal);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "AI is temporarily unavailable.");
  }
  return response;
}

export { readGeneralStream } from "./generalStream";
