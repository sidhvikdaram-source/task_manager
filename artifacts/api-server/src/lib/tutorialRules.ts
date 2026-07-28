export const TUTORIAL_CHAPTER_COUNT = 9;

export function normalizeTutorialStep(value: unknown) {
  if (!Number.isInteger(value)) return null;
  return Math.min(TUTORIAL_CHAPTER_COUNT, Math.max(0, Number(value)));
}
