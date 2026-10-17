export async function searchWeb(
  input,
  { fetcher = fetch, signal, apiKey } = {},
) {
  // Use the regular prompt; bound lengthy messages without another model call.
  const message = String(input.message || "")
    .replace(/\s+/g, " ")
    .trim();
  const query =
    message.length <= 400
      ? message
      : message.slice(0, 400).replace(/\s+\S*$/, "");
  if (!query)
    throw Object.assign(new Error("Enter a message to search the web."), {
      status: 400,
    });
  let response;
  try {
    response = await fetcher("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        query,
        limit: 3,
        sources: ["web"],
        safe: true,
        timeout: 10000,
      }),
      signal: AbortSignal.any([
        signal || new AbortController().signal,
        AbortSignal.timeout(12000),
      ]),
    });
    if (response.status === 429)
      throw Object.assign(
        Error(
          "Web search’s free rate limit was reached. Wait a minute or turn Search web off. This is separate from the chat model’s allowance. [SEARCH-LIMIT]",
        ),
        { searchLimit: true },
      );
    if (!response.ok) throw Error("Search unavailable");
    const data = await response.json();
    if (data.success !== true) throw Error("Search unavailable");
    const rows = Array.isArray(data.data) ? data.data : data.data?.web;
    const sources = (Array.isArray(rows) ? rows : [])
      .slice(0, 3)
      .flatMap((row) => {
        try {
          const url = new URL(row.url);
          if (url.protocol !== "https:" || url.username || url.password)
            return [];
          return [
            {
              url: url.href,
              title: String(row.title || url.hostname).slice(0, 160),
              snippet: String(row.description || "").slice(0, 1200),
            },
          ];
        } catch {
          return [];
        }
      });
    if (!sources.length) throw Error("No results");
    return { query, searchedAt: new Date().toISOString(), sources };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error?.searchLimit) throw Object.assign(error, { status: 503 });
    throw Object.assign(
      new Error(
        "Web search is unavailable or its free allowance is busy. Try again, or turn Search web off. [SEARCH-UNAVAILABLE]",
      ),
      { status: 503 },
    );
  }
}
export function searchSourceFooter(search) {
  if (!search?.sources?.length) return "";
  return (
    "\n\nSearch sources:\n" +
    search.sources
      .map(
        (source) =>
          `- [${source.title.replace(/[\[\]\n\r]/g, " ")}](${source.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
      )
      .join("\n")
  );
}
