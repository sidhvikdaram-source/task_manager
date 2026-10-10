import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(
        "Copy was blocked by your browser. Select the text to copy it.",
      );
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
export function CopyableAnswer({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const parts = content.split(/(```[\s\S]*?(?:```|$))/g).filter(Boolean);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <CopyButton text={content} label="Copy answer" />
        {streaming && (
          <span className="text-xs text-muted-foreground" role="status">
            Writing…
          </span>
        )}
      </div>
      <div className="space-y-4 break-words text-sm leading-7 sm:text-base">
        {parts.map((part, index) => {
          if (part.startsWith("```")) {
            const newline = part.indexOf("\n");
            const language = part
              .slice(3, newline < 0 ? undefined : newline)
              .trim();
            const code = (newline < 0 ? "" : part.slice(newline + 1))
              .replace(/```\s*$/, "")
              .replace(/\n$/, "");
            return (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-border bg-muted/40"
              >
                <div className="flex items-center gap-3 border-b border-border px-2 py-1">
                  <CopyButton
                    text={code}
                    label={`Copy ${language || "code"} block`}
                  />
                  <span className="font-mono text-xs text-muted-foreground">
                    {language}
                  </span>
                </div>
                <pre className="max-w-full overflow-x-auto p-4 text-sm leading-6">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }
          return (
            <div key={index} className="space-y-3">
              {part
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((paragraph, i) => {
                  const heading = paragraph.match(/^(#{1,4})\s+(.+)$/);
                  return heading ? (
                    <h3 key={i} className="text-base font-bold">
                      <Inline text={heading[2]} />
                    </h3>
                  ) : (
                    <p key={i} className="whitespace-pre-wrap">
                      <Inline text={paragraph} />
                    </p>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
