export type CompletionDisposition =
  | "already-complete"
  | "complete-without-award"
  | "complete-and-award";

export function completionDisposition(
  status: string,
  completionAwardedAt: Date | null,
): CompletionDisposition {
  if (status === "completed") return "already-complete";
  if (completionAwardedAt) return "complete-without-award";
  return "complete-and-award";
}
