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
  const response = await fetchAIResponse(candidates, mode, {
    method: "POST",
    headers: mode === "general" ? {
      "Content-Type": "text/plain;charset=UTF-8",
    } : {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mode === "general" ? { ...input, firebaseIdToken: token } : input),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "AI is temporarily unavailable.");
  }
  return response;
}

export { readGeneralStream } from "./generalStream";
