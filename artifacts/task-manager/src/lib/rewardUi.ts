type DisplayChest = {
  status: string;
  awardedAt: string;
};

export function sortRewardChests<T extends DisplayChest>(chests: readonly T[]) {
  return [...chests].sort((a, b) => {
    if (a.status === "unopened" && b.status !== "unopened") return -1;
    if (a.status !== "unopened" && b.status === "unopened") return 1;
    return new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime();
  });
}
