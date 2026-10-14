const PRIMARY = "https://nimbus-ai-gateway.pages.dev";
const SECONDARY = "https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev";

export function aiEndpoints(production: boolean, configured = "") {
  const override = configured.trim().replace(/\/+$/, "");
  // An explicit endpoint may belong to a different environment. Never redirect it.
  return override ? [override] : production ? [PRIMARY, SECONDARY] : [];
}

export async function fetchAIResponse(
  endpoints: string[],
  mode: "task" | "general",
  init: RequestInit,
  fetcher: typeof fetch = fetch,
) {
  let networkError: unknown;
  const candidates = endpoints;
  for (const base of candidates) {
    init.signal?.throwIfAborted();
    try {
      // Retry only before response headers arrive. HTTP/provider errors and
      // interrupted response streams must not silently submit a second request.
      return await fetcher(`${base}/${mode}`, init);
    } catch (error) {
      if (!(error instanceof TypeError) || init.signal?.aborted) throw error;
      networkError = error;
    }
  }
  // Probe without sign-in or prompt data. The response distinguishes endpoint
  // reachability from a POST failure on the actual user's browser/network.
  let reachable = false;
  for (const base of candidates) {
    init.signal?.throwIfAborted();
    try {
      const response = await fetcher(`${base}/health`, {
        method: "GET", cache: "no-store",
        signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(4000)]),
      });
      if (response.ok) { reachable = true; break; }
    } catch {
      init.signal?.throwIfAborted();
    }
  }
  throw new Error(
    reachable
      ? `Nimbus can reach AI, but this browser could not send the prompt. [AI-POST]${mode === "general" ? " Your chat is saved." : " No task was changed."}`
      : `This browser could not reach either Nimbus AI endpoint. [AI-NETWORK]${mode === "general" ? " Your chat is saved." : " No task was changed."}`,
    { cause: networkError },
  );
}
