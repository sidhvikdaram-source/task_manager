export async function readGeneralStream(
  response: Response,
  onText: (text: string) => void,
) {
  if (!response.body) throw new Error("AI returned no response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    finished = false;
  const line = (value: string) => {
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      finished = true;
      return;
    }
    const event = JSON.parse(data);
    if (event.error)
      throw new Error("AI stopped before finishing. Please retry.");
    if (event.choices?.[0]?.finish_reason === "length")
      throw new Error(
        "The answer reached the free response limit. Ask to continue in your next message.",
      );
    const content = event.choices?.[0]?.delta?.content;
    if (typeof content === "string") {
      text += content;
      onText(text);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(line);
      if (done) {
        if (buffer) line(buffer);
        break;
      }
    }
    if (!text.trim()) throw new Error("AI returned no answer. Please retry.");
    if (!finished)
      throw new Error(
        "The connection ended before the answer finished. Please retry.",
      );
    return text;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
