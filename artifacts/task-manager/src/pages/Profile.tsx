import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, BadgeCheck, Check, CircleDollarSign, Gift, Headphones, ImagePlus, KeyRound, Lock, PackageOpen, Palette, PartyPopper, Play, ShoppingBag, Sparkles, Tag, Trash2, X, Zap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGetUserStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { themes, useTheme, type ThemeId } from "@/theme";
import { toast } from "sonner";
import { MomentumIcon } from "@/components/MomentumIcon";
import { FramePreview, PetPreview, ProfilePhoto } from "@/components/ProfileCosmetics";
import { useQueryClient } from "@tanstack/react-query";
import { sortRewardChests, withEquippedReward } from "@/lib/rewardUi";
import { playCompletionEffect, completionOrigin } from "@/lib/completionSound";

type RewardKind = "frame" | "pet" | "title" | "completion_effect" | "transition" | "profile_theme" | "focus_sound" | "badge_display" | "momentum_cosmetic" | "chest_key";
type StoreCategory = "profile_customization" | "pet_cosmetics" | "focus_items" | "chest_items" | "reward_effects" | "limited_items" | "momentum_cosmetics";
type ChestRarity = "common" | "rare" | "epic" | "legendary";
type Reward = {
  id: string;
  name: string;
  kind: RewardKind;
  description: string;
  category: StoreCategory;
  priceBp: number;
  style: string;
  rarity: ChestRarity;
  lockReason?: string | null;
  repeatable?: boolean;
  equipable?: boolean;
  limited?: boolean;
  requirement?: string;
  source?: "store" | "quest" | "achievement" | "tier" | "chest" | "default";
  chestRarity?: ChestRarity;
};
type RewardChest = {
  id: number;
  sourceKey: string;
  rarity: ChestRarity;
  status: "unopened" | "opening" | "opened";
  rewardItemId: string | null;
  vpFallback: number;
  bpReward: number;
  chestKeysReward: number;
  requiresKey: boolean;
  awardedAt: string;
  openedAt: string | null;
};
type ChestOpening = {
  stage: "shaking" | "upgrading" | "opening";
  initialRarity: ChestRarity;
  finalRarity: ChestRarity;
  upgraded: boolean;
};
type ChestOpenResponse = {
  chest: RewardChest;
  reward?: Reward | null;
  bpReward?: number;
  chestKeysReward?: number;
  initialRarity?: ChestRarity;
  finalRarity?: ChestRarity;
  upgraded?: boolean;
  error?: string;
};
export type RewardsResponse = {
  bpBalance: number;
  lifetimeBp: number;
  chestKeys: number;
  vpTotal: number;
  earnedVp: number;
  owned: string[];
  newlyUnlockedTitles: string[];
  achievementBpAwarded: number;
  equipped: Record<RewardKind, string>;
  profileImageUrl: string | null;
  chests: RewardChest[];
  unopenedChestCount: number;
  items: Reward[];
  transactions: Array<{ id: number; amount: number; description: string; createdAt: string }>;
};

function rarityStyle(rarity: ChestRarity) {
  return rarity === "legendary"
    ? "border-rose-400/50 bg-rose-400/15 text-rose-500 shadow-[0_0_38px_rgba(244,63,94,.3)]"
    : rarity === "epic"
    ? "border-amber-400/40 bg-amber-400/20 text-amber-500 shadow-[0_0_34px_rgba(251,191,36,.28)]"
    : rarity === "rare"
      ? "border-violet-500/40 bg-violet-500/15 text-violet-500 shadow-[0_0_30px_rgba(139,92,246,.25)]"
      : "border-sky-500/35 bg-sky-500/15 text-sky-500 shadow-[0_0_24px_rgba(14,165,233,.2)]";
}

function animationScope(item: Pick<Reward, "kind">) {
  if (item.kind === "completion_effect") return "Task completion";
  return null;
}

export default function Profile() {
  const { user } = useAuth();
  const { data: stats, refetch: refetchStats } = useGetUserStats();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [rewardsError, setRewardsError] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | StoreCategory>("profile_customization");
  const [ownership, setOwnership] = useState<"all" | "owned" | "locked">("all");
  const [opening, setOpening] = useState<ChestOpening | null>(null);
  const [reveal, setReveal] = useState<{ reward: Reward | null; bpReward: number; chestKeysReward: number; initialRarity: ChestRarity; rarity: ChestRarity; upgraded: boolean } | null>(null);
  const [showAllChests, setShowAllChests] = useState(false);
  const [equippedPulse, setEquippedPulse] = useState<RewardKind | null>(null);
  const equippedPulseTimer = useRef<number | null>(null);
  const name = user?.firstName || user?.email?.split("@")[0] || "Velocity member";

  const loadRewards = async (force = false) => {
    const data = await queryClient.fetchQuery<RewardsResponse>({
      queryKey: ["rewards"],
      staleTime: force ? 0 : 30_000,
      queryFn: async () => {
        const response = await fetch("/api/rewards", { credentials: "include" });
        if (!response.ok) throw new Error("Customization could not be loaded");
        return response.json() as Promise<RewardsResponse>;
      },
    });
    setRewards(data);
    setRewardsError(false);
    return data;
  };

  useEffect(() => {
    void loadRewards()
      .catch(() => {
        setRewardsError(true);
        toast.error("Customization could not be loaded");
      })
      .finally(() => setRewardsLoading(false));
  }, []);

  useEffect(() => () => {
    if (equippedPulseTimer.current) window.clearTimeout(equippedPulseTimer.current);
  }, []);

  const visibleItems = useMemo(() => (rewards?.items ?? []).filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    const owned = item.repeatable ? false : rewards?.owned.includes(item.id);
    return ownership === "all" || (ownership === "owned" ? owned : !owned);
  }), [category, ownership, rewards]);
  const sortedChests = useMemo(
    () => sortRewardChests(rewards?.chests ?? []),
    [rewards?.chests],
  );
  const equippedTitle = rewards?.items.find((item) => item.id === rewards.equipped.title)?.name;
  const profileThemeClass = rewards?.equipped.profile_theme === "carbon-profile"
    ? "border-neutral-700 bg-neutral-950 text-white"
    : rewards?.equipped.profile_theme === "scholar-grid"
      ? "border-primary/40 bg-primary/5"
      : "";

  const previewReward = (item: Reward, target?: HTMLElement | null) => {
    if (item.kind !== "completion_effect") return;
    playCompletionEffect(item.id, completionOrigin(target));
  };

  const purchase = async (item: Reward) => {
    if (working) return;
    setWorking(item.id);
    try {
      const response = await fetch(`/api/rewards/${item.id}/purchase`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as {
        error?: string;
        bpBalance?: number;
        chestKeys?: number;
      };
      if (!response.ok) throw new Error(data.error || "Purchase failed");
      const applyPurchase = (current: RewardsResponse | null | undefined) => {
        if (!current) return current;
        return {
          ...current,
          bpBalance: data.bpBalance ?? current.bpBalance,
          chestKeys: data.chestKeys ?? current.chestKeys,
          owned: item.repeatable || current.owned.includes(item.id)
            ? current.owned
            : [...current.owned, item.id],
        };
      };
      setRewards((current) => applyPurchase(current) ?? null);
      queryClient.setQueryData<RewardsResponse>(["rewards"], (current) =>
        applyPurchase(current) ?? current,
      );
      toast.success(`${item.name} purchased`, { description: `${item.priceBp} BP spent.` });
      playCompletionEffect("aurora-finish", completionOrigin());
      void Promise.all([loadRewards(true), refetchStats()]).catch(() => undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Purchase failed"); }
    finally { setWorking(null); }
  };

  const equip = async (item: Reward) => {
    if (working) return;
    setWorking(item.id);
    const previous = rewards;
    const previousCache = queryClient.getQueryData<RewardsResponse>(["rewards"]);
    const applyEquipped = (current: RewardsResponse | null | undefined) =>
      current ? withEquippedReward(current, item.kind, item.id) : current;
    try {
      await queryClient.cancelQueries({ queryKey: ["rewards"] });
      setRewards((current) => applyEquipped(current) ?? null);
      queryClient.setQueryData<RewardsResponse>(["rewards"], (current) =>
        applyEquipped(current) ?? current,
      );
      const response = await fetch(`/api/rewards/${item.id}/equip`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not equip item");
      setEquippedPulse(item.kind);
      if (equippedPulseTimer.current) window.clearTimeout(equippedPulseTimer.current);
      equippedPulseTimer.current = window.setTimeout(() => setEquippedPulse(null), 1200);
      toast.success(`${item.name} equipped`);
      previewReward(item);
      try {
        await loadRewards(true);
      } catch {
        queryClient.setQueryData(["rewards"], applyEquipped(previousCache));
      }
    } catch (error) {
      setRewards(previous);
      queryClient.setQueryData(["rewards"], previousCache);
      toast.error(error instanceof Error ? error.message : "Could not equip item");
    }
    finally { setWorking(null); }
  };

  const unequip = async (kind: RewardKind) => {
    if (working) return;
    setWorking(`none-${kind}`);
    const previous = rewards;
    const previousCache = queryClient.getQueryData<RewardsResponse>(["rewards"]);
    const defaultItem = kind === "completion_effect"
      ? "clean-confetti"
      : "none";
    const applyDefault = (current: RewardsResponse | null | undefined) =>
      current ? withEquippedReward(current, kind, defaultItem) : current;
    try {
      await queryClient.cancelQueries({ queryKey: ["rewards"] });
      setRewards((current) => applyDefault(current) ?? null);
      queryClient.setQueryData<RewardsResponse>(["rewards"], (current) =>
        applyDefault(current) ?? current,
      );
      const response = await fetch(`/api/rewards/equipped/${kind}`, { method: "DELETE", credentials: "include" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove item");
      try {
        await loadRewards(true);
      } catch {
        queryClient.setQueryData(["rewards"], applyDefault(previousCache));
      }
      toast.success(`${kind === "pet" ? "Pet" : kind.replace("_", " ")} reset`);
    } catch (error) {
      setRewards(previous);
      queryClient.setQueryData(["rewards"], previousCache);
      toast.error(error instanceof Error ? error.message : "Could not remove item");
    }
    finally { setWorking(null); }
  };

  const openChest = async (chest: RewardChest) => {
    if (working) return;
    setWorking(`chest-${chest.id}`);
    setReveal(null);
    setOpening({ stage: "shaking", initialRarity: chest.rarity, finalRarity: chest.rarity, upgraded: false });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const startedAt = performance.now();
      const response = await fetch(`/api/rewards/chests/${chest.id}/open`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as ChestOpenResponse;
      if (!response.ok) throw new Error(data.error || "Chest could not be opened");
      const remainingIntro = reduceMotion ? 0 : Math.max(0, 320 - (performance.now() - startedAt));
      if (remainingIntro) await new Promise((resolve) => window.setTimeout(resolve, remainingIntro));
      const initialRarity = data.initialRarity ?? chest.rarity;
      const finalRarity = data.finalRarity ?? chest.rarity;
      const upgraded = data.upgraded ?? initialRarity !== finalRarity;
      if (upgraded) {
        setOpening({ stage: "upgrading", initialRarity, finalRarity, upgraded });
        if (!reduceMotion) await new Promise((resolve) => window.setTimeout(resolve, 520));
      }
      setOpening({ stage: "opening", initialRarity, finalRarity, upgraded });
      if (!reduceMotion) await new Promise((resolve) => window.setTimeout(resolve, 260));
      const openedChest = data.chest ?? {
        ...chest,
        status: "opened" as const,
        rarity: finalRarity,
        rewardItemId: data.reward?.id ?? null,
        bpReward: data.bpReward ?? 0,
        chestKeysReward: data.chestKeysReward ?? 0,
        openedAt: new Date().toISOString(),
      };
      const applyResult = (current: RewardsResponse | null | undefined) => {
        if (!current) return current;
        const rewardId = data.reward?.id;
        return {
          ...current,
          bpBalance: current.bpBalance + (data.bpReward ?? 0),
          lifetimeBp: current.lifetimeBp + (data.bpReward ?? 0),
          chestKeys: current.chestKeys + (data.chestKeysReward ?? 0),
          owned: rewardId && !current.owned.includes(rewardId)
            ? [...current.owned, rewardId]
            : current.owned,
          chests: current.chests.map((item) => item.id === chest.id ? openedChest : item),
          unopenedChestCount: Math.max(0, current.unopenedChestCount - 1),
        };
      };
      setRewards((current) => applyResult(current) ?? null);
      queryClient.setQueryData<RewardsResponse>(["rewards"], (current) => applyResult(current) ?? current);
      setOpening(null);
      setReveal({ reward: data.reward ?? null, bpReward: data.bpReward ?? 0, chestKeysReward: data.chestKeysReward ?? 0, initialRarity, rarity: finalRarity, upgraded });
      void Promise.all([loadRewards(true), refetchStats()]).catch(() => undefined);
    } catch (error) {
      setOpening(null);
      void loadRewards(true).catch(() => undefined);
      toast.error(
        error instanceof DOMException && error.name === "AbortError"
          ? "Chest opening took too long. Your rewards are being refreshed."
          : error instanceof Error
            ? error.message
            : "Chest could not be opened",
      );
    } finally {
      window.clearTimeout(timeout);
      setWorking(null);
    }
  };

  const showChestReward = (chest: RewardChest, reward?: Reward) => {
    setReveal({
      reward: reward ?? null,
      bpReward: chest.bpReward,
      chestKeysReward: chest.chestKeysReward,
      initialRarity: chest.rarity,
      rarity: chest.rarity,
      upgraded: false,
    });
  };

  const useChestKey = async () => {
    if (working) return;
    setWorking("chest-key-use");
    try {
      const response = await fetch("/api/rewards/chests/key/use", { method: "POST", credentials: "include" });
      const data = await response.json() as {
        error?: string;
        chest?: RewardChest;
        chestKeys?: number;
      };
      if (!response.ok) throw new Error(data.error || "Chest key could not be used");
      if (data.chest) {
        const applyKeyUse = (current: RewardsResponse | null | undefined) => {
          if (!current) return current;
          return {
            ...current,
            chestKeys: data.chestKeys ?? Math.max(0, current.chestKeys - 1),
            chests: [data.chest!, ...current.chests],
            unopenedChestCount: current.unopenedChestCount + 1,
          };
        };
        setRewards((current) => applyKeyUse(current) ?? null);
        queryClient.setQueryData<RewardsResponse>(["rewards"], (current) =>
          applyKeyUse(current) ?? current,
        );
      }
      void loadRewards(true).catch(() => undefined);
      toast.success("Chest key used", { description: "A new Common chest is ready to open." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chest key could not be used");
    } finally {
      setWorking(null);
    }
  };

  const updatePhoto = async (profileImageUrl: string | null) => {
    if (working) return;
    setWorking("profile-photo");
    try {
      const response = await fetch("/api/user/profile", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileImageUrl }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Photo could not be updated");
      await loadRewards(true);
      toast.success(profileImageUrl ? "Profile photo updated" : "Profile photo removed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Photo could not be updated"); }
    finally { setWorking(null); }
  };

  const selectPhoto = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5_000_000) {
      toast.error("Choose a PNG, JPEG, or WebP image under 5 MB");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await updatePhoto(canvas.toDataURL("image/webp", 0.82));
    } catch {
      toast.error("That image could not be processed");
    }
  };

  return (
    <div className="page-stack space-y-5">
      <section className={`bento-card p-5 transition-colors sm:p-7 ${profileThemeClass}`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <motion.div
            key={`${rewards?.equipped.frame}-${rewards?.equipped.pet}`}
            initial={reduceMotion ? false : { opacity: 0.7, scale: 0.92, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="relative w-fit"
          >
            <ProfilePhoto frameId={rewards?.equipped.frame} profileImageUrl={rewards?.profileImageUrl ?? user?.profileImageUrl} name={name} className="w-24" />
            <PetPreview petId={rewards?.equipped.pet} earnedVp={rewards?.earnedVp} className="absolute -bottom-2 -right-4 h-11 w-11" animated />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-primary">Velocity profile</p>
            <h1 className="mt-1 truncate text-3xl font-black">{name}</h1>
            <AnimatePresence mode="wait">
              {equippedTitle && <motion.p key={equippedTitle} initial={reduceMotion ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary"><Tag className="h-3 w-3" /> {equippedTitle}</motion.p>}
            </AnimatePresence>
            <AnimatePresence>
              {equippedPulse && <motion.p role="status" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-xs font-black text-secondary">Profile updated</motion.p>}
            </AnimatePresence>
            <div className="mt-3 flex flex-wrap gap-2">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void selectPhoto(event.target.files?.[0])} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={working === "profile-photo"} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><ImagePlus className="h-3.5 w-3.5" /> Change photo</button>
              {rewards?.profileImageUrl && <button type="button" onClick={() => void updatePhoto(null)} disabled={working === "profile-photo"} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold text-destructive hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={<Zap className="h-5 w-5" />} value={stats?.totalVp ?? 0} label="Lifetime VP" />
        <Metric icon={<CircleDollarSign className="h-5 w-5" />} value={rewards?.bpBalance ?? 0} label="BP balance" />
        <Metric icon={<MomentumIcon className="h-5 w-5" />} value={stats?.streakDays ?? 0} label="Momentum days" />
        <div className="bento-card p-4">
          <div className="flex items-center justify-between text-primary"><Award className="h-5 w-5" /><span className="text-xs font-black">Tier {stats?.tier ?? 1}</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${stats?.tierProgress ?? 0}%` }} /></div>
          <div className="mt-2 flex justify-between text-[11px] font-bold text-muted-foreground"><span>{stats?.tierProgress ?? 0} VP</span><span>100 VP</span></div>
        </div>
      </div>

      <section id="reward-chests" className="bento-card scroll-mt-4 overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black">Reward chests</h2>
              <p className="text-xs text-muted-foreground">Earned from meaningful task, focus, tier, and weekly-review milestones.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">{rewards?.unopenedChestCount ?? 0} unopened</span>
            {sortedChests.length > 6 && <button type="button" onClick={() => setShowAllChests((value) => !value)} className="rounded-lg border px-3 py-1.5 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground">{showAllChests ? "Collapse" : "Show all"}</button>}
            <button type="button" onClick={() => void useChestKey()} disabled={!rewards?.chestKeys || working !== null} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-black disabled:opacity-45"><KeyRound className="h-3.5 w-3.5" /> {rewards?.chestKeys ?? 0} keys</button>
          </div>
        </div>
        <div className="grid gap-2 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
          {rewardsLoading && [0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/70" />)}
          {rewardsError && !rewardsLoading && <button type="button" onClick={() => { setRewardsLoading(true); void loadRewards().catch(() => { setRewardsError(true); toast.error("Customization could not be loaded"); }).finally(() => setRewardsLoading(false)); }} className="rounded-lg border border-dashed p-4 text-left text-sm font-bold text-primary">Retry loading rewards</button>}
          {!rewardsLoading && (showAllChests ? sortedChests : sortedChests.slice(0, 6)).map((chest, index) => {
            const reward = rewards?.items.find((item) => item.id === chest.rewardItemId);
            const isOpening = working === `chest-${chest.id}`;
            const isUnoopened = chest.status === "unopened";
            return (
              <motion.div
                key={chest.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.2 }}
                whileHover={reduceMotion ? undefined : { y: -2, transition: { type: "spring", stiffness: 400, damping: 28 } }}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${isUnoopened ? "border-primary/20 bg-primary/5 hover:border-primary/40" : "bg-muted/15"}`}
              >
                <motion.div
                  animate={isOpening && !reduceMotion ? { rotate: [0, -8, 8, -6, 6, 0], scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5, repeat: isOpening ? Infinity : 0, repeatDelay: 0.3 }}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    chest.rarity === "legendary" ? "bg-rose-400/15 text-rose-500"
                    : chest.rarity === "epic" ? "bg-amber-400/20 text-amber-500"
                    : chest.rarity === "rare" ? "bg-violet-500/15 text-violet-500"
                    : "bg-sky-500/15 text-sky-500"
                  }`}
                >
                  {chest.status === "opened" ? <PackageOpen className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black capitalize">{chest.rarity} chest</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {chest.status === "opened"
                      ? reward?.name ?? (chest.bpReward ? `+${chest.bpReward} BP` : chest.chestKeysReward ? `${chest.chestKeysReward} key${chest.chestKeysReward === 1 ? "" : "s"}` : chest.vpFallback ? `${chest.vpFallback} VP` : "Reward claimed")
                      : chest.sourceKey.replace(/[:-]/g, " ")}
                  </p>
                </div>
                {isUnoopened && (
                  <motion.button
                    type="button"
                    onClick={() => void openChest(chest)}
                    disabled={working !== null}
                    whileHover={reduceMotion ? undefined : { scale: 1.05 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/.3)] disabled:opacity-50 disabled:shadow-none"
                  >
                    {isOpening ? "..." : "Open"}
                  </motion.button>
                )}
                {chest.status === "opened" && (
                  <motion.button
                    type="button"
                    onClick={() => showChestReward(chest, reward)}
                    whileHover={reduceMotion ? undefined : { scale: 1.05 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                    className="rounded-lg border px-2.5 py-2 text-xs font-black text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    View
                  </motion.button>
                )}
              </motion.div>
            );
          })}
          {!rewardsLoading && !rewardsError && (rewards?.chests.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">Your first chest unlocks at Tier 2 or after 10 completed tasks.</p>}
        </div>
      </section>

      <section className="bento-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Velocity Store</h2></div><p className="mt-1 text-sm text-muted-foreground">Spend BP on optional customization. VP always stays with your progress.</p></div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-secondary/15 px-3 text-xs font-black text-secondary"><CircleDollarSign className="h-4 w-4" /> {rewards?.bpBalance ?? 0} BP</span>
            <select aria-label="Store category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">All categories</option><option value="profile_customization">Profile customization</option><option value="pet_cosmetics">Pet cosmetics</option><option value="focus_items">Focus items</option><option value="chest_items">Chest items</option><option value="reward_effects">Animations</option><option value="limited_items">Limited items</option><option value="momentum_cosmetics">Momentum cosmetics</option></select>
            <select aria-label="Ownership filter" value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">Owned and locked</option><option value="owned">Owned</option><option value="locked">Not owned</option></select>
          </div>
        </div>

        <div className="mt-4 grid grid-flow-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visibleItems.map((item) => {
            const owned = !item.repeatable && (rewards?.owned.includes(item.id) ?? false);
            const equipped = item.equipable && rewards?.equipped[item.kind] === item.id;
            const scope = animationScope(item);
            const previewable = owned && item.kind === "completion_effect";
            return <motion.article key={item.id} layout whileHover={reduceMotion ? undefined : { y: -4 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} className={`group relative flex min-h-64 flex-col overflow-hidden rounded-xl border p-4 transition-colors ${equipped ? "border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/.12)]" : "bg-muted/15 hover:border-primary/40 hover:bg-muted/25"}`}>
              {equipped && <motion.div layoutId={`equipped-${item.kind}`} className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary" transition={{ type: "spring", stiffness: 320, damping: 26 }} />}
              <div className="flex h-14 items-center justify-between">
                {item.kind === "frame" && <FramePreview frameId={item.id} className="w-14" />}
                {item.kind === "pet" && <PetPreview petId={item.id} earnedVp={rewards?.earnedVp} className="h-12 w-12" />}
                {item.kind === "title" && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Tag className="h-5 w-5" /></div>}
                {item.kind === "completion_effect" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15 text-secondary"><PartyPopper className="h-5 w-5" /></div>}
                {item.kind === "profile_theme" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="h-5 w-5" /></div>}
                {item.kind === "focus_sound" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15 text-secondary"><Headphones className="h-5 w-5" /></div>}
                {item.kind === "badge_display" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><BadgeCheck className="h-5 w-5" /></div>}
                {item.kind === "momentum_cosmetic" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15 text-secondary"><MomentumIcon className="h-5 w-5" /></div>}
                {item.kind === "chest_key" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div>}
                <Sparkles className="h-4 w-4 text-secondary" />
              </div>
              <div className="mt-4 flex items-start justify-between gap-2"><p className="text-sm font-black leading-tight text-balance">{item.name}</p><span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${rarityStyle(item.rarity).split(" ").slice(0, 3).join(" ")}`}>{item.rarity}</span></div>
              {scope && <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">{scope}</p>}
              <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">{item.description || item.requirement}</p>
              <div className="mt-4 flex gap-2">
                {previewable && (
                  <button
                    type="button"
                    aria-label={`Preview ${item.name}`}
                    title={`Preview ${item.name}`}
                    disabled={working !== null}
                    onClick={(event) => previewReward(item, event.currentTarget)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Preview
                  </button>
                )}
                {item.lockReason ? <div className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-black text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {item.lockReason}</div> : owned && item.equipable ? <button disabled={working !== null || equipped} onClick={() => void equip(item)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-primary-foreground disabled:opacity-55">{equipped ? <><Check className="h-3.5 w-3.5" /> Equipped</> : "Equip"}</button> : owned ? <div className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-black text-primary"><Check className="h-3.5 w-3.5" /> Owned</div> : item.source === "chest" ? <div className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-black text-muted-foreground"><Gift className="h-3.5 w-3.5" /> Chest reward</div> : item.source === "quest" || item.source === "achievement" || item.source === "tier" ? <div className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-black text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {item.requirement ?? "Earn to unlock"}</div> : <button disabled={working !== null || (rewards?.bpBalance ?? 0) < item.priceBp} onClick={() => void purchase(item)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-xs font-black text-secondary-foreground disabled:opacity-55"><CircleDollarSign className="h-3.5 w-3.5" /> {item.priceBp} BP</button>}
              </div>
            </motion.article>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["frame", "pet", "title", "completion_effect", "profile_theme", "focus_sound", "badge_display", "momentum_cosmetic"] as const).map((kind) => rewards?.equipped[kind] !== "none" && <button key={kind} disabled={working !== null} onClick={() => void unequip(kind)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-45"><X className="h-3.5 w-3.5" /> Remove {kind === "pet" ? "pet" : kind.replace("_", " ")}</button>)}
        </div>
      </section>

      <section className="bento-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Recent BP activity</h2><p className="mt-1 text-xs text-muted-foreground">Server-verified earnings and purchases.</p></div><span className="text-xs font-black text-secondary">{rewards?.lifetimeBp ?? 0} earned</span></div>
        <div className="mt-3 divide-y divide-border/60">
          {(rewards?.transactions ?? []).slice(0, 6).map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="truncate text-muted-foreground">{transaction.description}</span><span className={`shrink-0 font-black ${transaction.amount > 0 ? "text-secondary" : "text-foreground"}`}>{transaction.amount > 0 ? "+" : ""}{transaction.amount} BP</span></div>)}
          {!rewardsLoading && !(rewards?.transactions.length) && <p className="py-5 text-sm text-muted-foreground">Complete a Momentum milestone or weekly review to earn your first BP.</p>}
        </div>
      </section>

      <motion.section layout className="bento-card p-4 sm:p-5">
        <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">App appearance</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Core app themes stay free and never require BP.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {themes.map((item) => <motion.button key={item.id} type="button" whileTap={reduceMotion ? undefined : { scale: 0.97 }} onClick={() => setTheme(item.id as ThemeId)} className={`relative overflow-hidden rounded-lg border p-3 text-left transition-colors ${theme === item.id ? "border-primary bg-primary/10" : "hover:border-primary/45"}`}>
            {theme === item.id && <motion.span layoutId="selected-theme" className="absolute inset-0 border-2 border-primary" transition={{ type: "spring", stiffness: 320, damping: 28 }} />}
            <span className="relative block text-sm font-black">{item.label}</span><span className="relative mt-2 block h-2 rounded-full bg-primary" />
          </motion.button>)}
        </div>
      </motion.section>
      {createPortal(<AnimatePresence mode="wait">
        {opening && (
          <motion.div
            key="chest-opening"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: "hsl(var(--background) / 0.88)" }}
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Opening reward chest"
              className="bento-card w-full max-w-sm overflow-hidden p-8 text-center"
              initial={{ y: 24, scale: 0.90, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 340, damping: 26 }}
            >
              <div className="relative mx-auto h-36 w-36">
                {/* Glow ring behind chest */}
                {!reduceMotion && (
                  <motion.div
                    className={`absolute inset-0 rounded-3xl ${rarityStyle(opening.stage === "shaking" ? opening.initialRarity : opening.finalRarity).split(" ").slice(0, 2).join(" ")} opacity-40`}
                    animate={opening.stage === "shaking"
                      ? { scale: [1, 1.12, 1], opacity: [0.3, 0.55, 0.3] }
                      : opening.stage === "upgrading"
                        ? { scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4], rotate: [0, 180, 360] }
                        : { scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: opening.stage === "upgrading" ? 0.7 : 0.9, repeat: opening.stage !== "opening" ? Infinity : 0, ease: "easeInOut" }}
                    style={{ filter: "blur(12px)" }}
                  />
                )}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${opening.stage}-${opening.finalRarity}`}
                    initial={{ opacity: 0, scale: 0.72, y: 8 }}
                    animate={opening.stage === "shaking" && !reduceMotion
                      ? { opacity: 1, scale: 1, y: 0, rotate: [0, -6, 6, -5, 5, -3, 3, 0] }
                      : opening.stage === "upgrading" && !reduceMotion
                        ? { opacity: 1, scale: [0.88, 1.22, 1], y: 0, rotate: [0, 180, 360] }
                        : { opacity: 1, scale: [0.85, 1.15, 1], y: [6, -8, 0] }}
                    exit={{ opacity: 0, scale: 1.2, y: -10 }}
                    transition={{ duration: opening.stage === "upgrading" ? 0.68 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute inset-3 flex items-center justify-center rounded-2xl border-2 ${rarityStyle(opening.stage === "shaking" ? opening.initialRarity : opening.finalRarity)}`}
                  >
                    <motion.div
                      animate={opening.stage === "shaking" && !reduceMotion ? { rotate: [0, -3, 3, -3, 3, 0] } : {}}
                      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.4 }}
                    >
                      {opening.stage === "opening" ? <PackageOpen className="h-14 w-14" /> : <Gift className="h-14 w-14" />}
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
                {/* Upgrade particles */}
                {opening.stage === "upgrading" && !reduceMotion && [0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <motion.span
                    key={index}
                    className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                    style={{ backgroundColor: index % 2 === 0 ? "hsl(var(--secondary))" : "hsl(var(--primary))" }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                    animate={{
                      x: Math.cos((index * Math.PI * 2) / 8) * 70,
                      y: Math.sin((index * Math.PI * 2) / 8) * 70,
                      opacity: [0, 1, 1, 0],
                      scale: [0, 1.2, 0.8, 0],
                    }}
                    transition={{ duration: 0.8, delay: index * 0.03, ease: "easeOut" }}
                  />
                ))}
                {/* Opening burst particles */}
                {opening.stage === "opening" && !reduceMotion && [0, 1, 2, 3, 4, 5].map((index) => (
                  <motion.span
                    key={index}
                    className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-primary"
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                    animate={{
                      x: Math.cos((index * Math.PI * 2) / 6) * 55,
                      y: Math.sin((index * Math.PI * 2) / 6) * 55,
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                    }}
                    transition={{ duration: 0.55, delay: index * 0.04, ease: "easeOut" }}
                  />
                ))}
              </div>
              <div aria-live="polite" className="mt-5 min-h-16">
                <AnimatePresence mode="wait">
                  {opening.stage === "shaking" && (
                    <motion.div key="shaking-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{opening.initialRarity} chest</p>
                      <h2 className="mt-1 text-xl font-black">Checking rarity…</h2>
                    </motion.div>
                  )}
                  {opening.stage === "upgrading" && (
                    <motion.div key="upgrading-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      <p className="text-xs font-black uppercase tracking-widest text-secondary">Rarity upgrade!</p>
                      <h2 className="mt-1 text-2xl font-black capitalize">{opening.initialRarity} → {opening.finalRarity}</h2>
                    </motion.div>
                  )}
                  {opening.stage === "opening" && (
                    <motion.div key="opening-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{opening.finalRarity} chest</p>
                      <h2 className="mt-1 text-xl font-black">Opening…</h2>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
        {reveal && (
          <motion.div
            key="chest-reveal"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ backgroundColor: "hsl(var(--background) / 0.85)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
            exit={{ opacity: 0 }}
            onClick={() => setReveal(null)}
          >
            {/* Scattered sparkle particles on reveal */}
            {!reduceMotion && Array.from({ length: 12 }).map((_, index) => (
              <motion.span
                key={index}
                className="pointer-events-none absolute rounded-full"
                style={{
                  width: Math.random() * 6 + 4,
                  height: Math.random() * 6 + 4,
                  left: `${20 + Math.random() * 60}%`,
                  top: `${20 + Math.random() * 60}%`,
                  backgroundColor: index % 3 === 0 ? "hsl(var(--secondary))" : index % 3 === 1 ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.6)",
                }}
                initial={{ opacity: 0, scale: 0, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.3, 1, 0], y: -60 - Math.random() * 60 }}
                transition={{ duration: 1 + Math.random() * 0.5, delay: Math.random() * 0.4, ease: "easeOut" }}
              />
            ))}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Chest reward"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: 40, scale: 0.78, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 20, scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
              className="bento-card relative w-full max-w-sm overflow-hidden p-8 text-center"
            >
              {/* Rarity glow backdrop */}
              {!reduceMotion && (
                <motion.div
                  className={`pointer-events-none absolute inset-0 ${rarityStyle(reveal.rarity).split(" ").slice(0, 2).join(" ")} opacity-10`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.12 }}
                  transition={{ duration: 0.4 }}
                />
              )}
              <motion.div
                animate={reduceMotion ? undefined : { y: [6, -8, 0], scale: [0.82, 1.18, 1], rotate: [-5, 5, 0] }}
                transition={{ duration: 0.65, type: "spring", stiffness: 260, damping: 18 }}
                className={`relative mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border-2 ${rarityStyle(reveal.rarity)}`}
              >
                <PackageOpen className="h-11 w-11" />
              </motion.div>
              {reveal.upgraded && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.8, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="mx-auto mt-4 w-fit rounded-full bg-secondary/15 px-3 py-1 text-[10px] font-black uppercase text-secondary"
                >
                  ↑ Upgraded from {reveal.initialRarity}
                </motion.p>
              )}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <p className="mt-5 text-xs font-black uppercase tracking-widest text-muted-foreground">{reveal.rarity} reward</p>
                <h2 className="mt-1 text-2xl font-black">
                  {reveal.reward?.name ?? (reveal.bpReward ? `+${reveal.bpReward} BP` : reveal.chestKeysReward ? `${reveal.chestKeysReward} chest key${reveal.chestKeysReward === 1 ? "" : "s"}` : "Reward claimed")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {reveal.reward?.description ?? (reveal.bpReward ? "Added to your store balance." : reveal.chestKeysReward ? "Added to your chest key inventory." : "This reward is already in your collection.")}
                </p>
              </motion.div>
              <motion.button
                type="button"
                onClick={() => setReveal(null)}
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="relative mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/.25)]"
              >
                Continue
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="bento-card bento-card-lift p-4 text-primary"
      whileHover={reduceMotion ? undefined : { y: -3, transition: { type: "spring", stiffness: 380, damping: 28 } }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div>{icon}</div>
      <motion.p
        className="mt-2 text-2xl font-black text-foreground"
        key={value}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {value}
      </motion.p>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
    </motion.div>
  );
}
