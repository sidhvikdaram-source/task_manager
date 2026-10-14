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
  const candidates = mode === "general" ? endpoints : endpoints.slice(0, 1);
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
  throw new Error(
    `Nimbus could not connect to AI. The connection may be blocked by your browser or network. Please retry.${mode === "general" ? " Your chat is saved." : ""}`,
    { cause: networkError },
  );
}
