import { BP_RULES } from "./economyConfig";

export function nextBpBalance(balance: number, delta: number) {
  if (!Number.isInteger(balance) || balance < 0 || !Number.isInteger(delta) || delta === 0) {
    throw new Error("INVALID_BP_TRANSACTION");
  }
  const next = balance + delta;
  if (next < 0) throw new Error("INSUFFICIENT_BP");
  return next;
}

export function momentumMilestoneAwards(previous: number, current: number) {
  if (!Number.isInteger(previous) || !Number.isInteger(current) || previous < 0 || current < previous) {
    throw new Error("INVALID_MOMENTUM_RANGE");
  }
  return Object.entries(BP_RULES.momentumMilestones)
    .map(([days, bp]) => ({ days: Number(days), bp }))
    .filter(({ days }) => previous < days && current >= days)
    .sort((a, b) => a.days - b.days);
}

export function purchaseEligibility(input: {
  balance: number;
  priceBp: number;
  owned: boolean;
  repeatable: boolean;
  lockReason: string | null;
}) {
  if (input.lockReason) return { allowed: false, reason: input.lockReason };
  if (input.owned && !input.repeatable) return { allowed: false, reason: "ALREADY_OWNED" };
  if (input.balance < input.priceBp) return { allowed: false, reason: "INSUFFICIENT_BP" };
  return { allowed: true, reason: null };
}
