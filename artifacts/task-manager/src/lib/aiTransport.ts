import { firebaseAuth } from "@workspace/replit-auth-web";

export function aiEndpoint() {
  const configured = (
    import.meta.env.VITE_NIMBUS_AI_URL as string | undefined
  )?.trim();
  const productionEndpoint = import.meta.env.PROD
    ? "https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev"
    : "";
  return (configured || productionEndpoint).replace(/\/+$/, "");
}

export async function aiRequest(
  mode: "task" | "general",
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const base = aiEndpoint();
  if (!base)
    throw new Error("AI is not connected yet. Your chats can still be saved.");
  await firebaseAuth.authStateReady();
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to use AI.");
  let response: Response;
  try {
    response = await fetch(`${base}/${mode}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Nimbus could not connect to AI. The connection may be blocked by your browser or network. Please retry.${mode === "general" ? " Your chat is saved." : ""}`,
        { cause: error },
      );
    }
    throw error;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "AI is temporarily unavailable.");
  }
  return response;
}

export { readGeneralStream } from "./generalStream";
