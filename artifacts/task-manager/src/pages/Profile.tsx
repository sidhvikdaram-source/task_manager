import React, { useEffect, useMemo, useRef, useState } from "react";
import { Award, Check, Gift, ImagePlus, Lock, Navigation2, PackageOpen, Palette, PartyPopper, ShoppingBag, Sparkles, Tag, Trash2, X, Zap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGetUserStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { themes, useTheme, type ThemeId } from "@/theme";
import { toast } from "sonner";
import { MomentumIcon } from "@/components/MomentumIcon";
import { FramePreview, PetPreview, ProfilePhoto } from "@/components/ProfileCosmetics";
import { useQueryClient } from "@tanstack/react-query";

type RewardKind = "frame" | "pet" | "title" | "completion_effect" | "transition";
type Reward = {
  id: string;
  name: string;
  kind: RewardKind;
  cost: number;
  style: string;
  requirement?: string;
  source?: "quest" | "achievement" | "tier" | "chest" | "default";
  chestRarity?: "common" | "rare" | "epic";
};
type RewardChest = {
  id: number;
  sourceKey: string;
  rarity: "common" | "rare" | "epic";
  status: "unopened" | "opening" | "opened";
  rewardItemId: string | null;
  vpFallback: number;
  awardedAt: string;
  openedAt: string | null;
};
type ChestRarity = RewardChest["rarity"];
type ChestOpening = {
  stage: "shaking" | "upgrading" | "opening";
  initialRarity: ChestRarity;
  finalRarity: ChestRarity;
  upgraded: boolean;
};
export type RewardsResponse = {
  balance: number;
  earnedVp: number;
  owned: string[];
  newlyUnlockedTitles: string[];
  equipped: Record<RewardKind, string>;
  profileImageUrl: string | null;
  chests: RewardChest[];
  unopenedChestCount: number;
  items: Reward[];
};

function rarityStyle(rarity: ChestRarity) {
  return rarity === "epic"
    ? "border-amber-400/40 bg-amber-400/20 text-amber-500 shadow-[0_0_34px_rgba(251,191,36,.28)]"
    : rarity === "rare"
      ? "border-violet-500/40 bg-violet-500/15 text-violet-500 shadow-[0_0_30px_rgba(139,92,246,.25)]"
      : "border-sky-500/35 bg-sky-500/15 text-sky-500 shadow-[0_0_24px_rgba(14,165,233,.2)]";
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
  const [category, setCategory] = useState<"all" | RewardKind>("pet");
  const [ownership, setOwnership] = useState<"all" | "owned" | "locked">("all");
  const [opening, setOpening] = useState<ChestOpening | null>(null);
  const [reveal, setReveal] = useState<{ reward: Reward | null; vpFallback: number; initialRarity: ChestRarity; rarity: ChestRarity; upgraded: boolean } | null>(null);
  const [equippedPulse, setEquippedPulse] = useState<RewardKind | null>(null);
  const name = user?.firstName || user?.email?.split("@")[0] || "Velocity member";

  const loadRewards = async () => {
    const response = await fetch("/api/rewards", { credentials: "include" });
    if (!response.ok) throw new Error("Customization could not be loaded");
    const data = (await response.json()) as RewardsResponse;
    setRewards(data);
    setRewardsError(false);
    queryClient.setQueryData(["rewards"], data);
  };

  useEffect(() => {
    void loadRewards()
      .catch(() => {
        setRewardsError(true);
        toast.error("Customization could not be loaded");
      })
      .finally(() => setRewardsLoading(false));
  }, []);

  const visibleItems = useMemo(() => (rewards?.items ?? []).filter((item) => {
    if (category !== "all" && item.kind !== category) return false;
    const owned = rewards?.owned.includes(item.id);
    return ownership === "all" || (ownership === "owned" ? owned : !owned);
  }), [category, ownership, rewards]);
  const equippedTitle = rewards?.items.find((item) => item.id === rewards.equipped.title)?.name;

  const purchase = async (item: Reward) => {
    setWorking(item.id);
    try {
      const response = await fetch(`/api/rewards/${item.id}/purchase`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success(`${item.name} added to your collection`);
      await Promise.all([loadRewards(), refetchStats()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Purchase failed"); }
    finally { setWorking(null); }
  };

  const equip = async (item: Reward) => {
    setWorking(item.id);
    const previous = rewards;
    setRewards((current) => current ? { ...current, equipped: { ...current.equipped, [item.kind]: item.id } } : current);
    try {
      const response = await fetch(`/api/rewards/${item.id}/equip`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setEquippedPulse(item.kind);
      window.setTimeout(() => setEquippedPulse(null), 1200);
      toast.success(`${item.name} equipped`);
      await loadRewards();
    } catch (error) { setRewards(previous); toast.error(error instanceof Error ? error.message : "Could not equip item"); }
    finally { setWorking(null); }
  };

  const unequip = async (kind: RewardKind) => {
    setWorking(`none-${kind}`);
    try {
      const response = await fetch(`/api/rewards/equipped/${kind}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not remove item");
      await loadRewards();
      toast.success(`${kind === "pet" ? "Pet" : kind.replace("_", " ")} reset`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove item"); }
    finally { setWorking(null); }
  };

  const openChest = async (chest: RewardChest) => {
    setWorking(`chest-${chest.id}`);
    setOpening({ stage: "shaking", initialRarity: chest.rarity, finalRarity: chest.rarity, upgraded: false });
    try {
      const request = fetch(`/api/rewards/chests/${chest.id}/open`, { method: "POST", credentials: "include" });
      if (!reduceMotion) await new Promise((resolve) => window.setTimeout(resolve, 700));
      const response = await request;
      const data = await response.json() as { reward?: Reward | null; vpFallback?: number; initialRarity?: ChestRarity; finalRarity?: ChestRarity; upgraded?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Chest could not be opened");
      const initialRarity = data.initialRarity ?? chest.rarity;
      const finalRarity = data.finalRarity ?? chest.rarity;
      const upgraded = data.upgraded ?? initialRarity !== finalRarity;
      if (upgraded) {
        setOpening({ stage: "upgrading", initialRarity, finalRarity, upgraded });
        if (!reduceMotion) await new Promise((resolve) => window.setTimeout(resolve, 950));
      }
      setOpening({ stage: "opening", initialRarity, finalRarity, upgraded });
      if (!reduceMotion) await new Promise((resolve) => window.setTimeout(resolve, 480));
      setOpening(null);
      setReveal({ reward: data.reward ?? null, vpFallback: data.vpFallback ?? 0, initialRarity, rarity: finalRarity, upgraded });
      void Promise.all([loadRewards(), refetchStats()]);
    } catch (error) {
      setOpening(null);
      toast.error(error instanceof Error ? error.message : "Chest could not be opened");
    } finally {
      setWorking(null);
    }
  };

  const updatePhoto = async (profileImageUrl: string | null) => {
    setWorking("profile-photo");
    try {
      const response = await fetch("/api/user/profile", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileImageUrl }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      await loadRewards();
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
    <div className="space-y-5">
      <section className="bento-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <motion.div
            key={`${rewards?.equipped.frame}-${rewards?.equipped.pet}`}
            initial={reduceMotion ? false : { opacity: 0.7, scale: 0.92, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="relative w-fit"
          >
            <ProfilePhoto frameId={rewards?.equipped.frame} profileImageUrl={rewards?.profileImageUrl ?? user?.profileImageUrl} name={name} className="w-24" />
            <PetPreview petId={rewards?.equipped.pet} earnedVp={rewards?.earnedVp} className="absolute -bottom-2 -right-4 h-11 w-11" />
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Zap className="h-5 w-5" />} value={stats?.totalVp ?? 0} label="VP balance" />
        <Metric icon={<MomentumIcon className="h-5 w-5" />} value={stats?.streakDays ?? 0} label="Momentum days" />
        <div className="bento-card p-4">
          <div className="flex items-center justify-between text-primary"><Award className="h-5 w-5" /><span className="text-xs font-black">Tier {stats?.tier ?? 1}</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${stats?.tierProgress ?? 0}%` }} /></div>
          <div className="mt-2 flex justify-between text-[11px] font-bold text-muted-foreground"><span>{stats?.tierProgress ?? 0} VP</span><span>100 VP</span></div>
        </div>
      </div>

      <section className="bento-card overflow-hidden">
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
          <span className="w-fit rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
            {rewards?.unopenedChestCount ?? 0} unopened
          </span>
        </div>
        <div className="grid gap-2 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
          {rewardsLoading && [0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/70" />)}
          {rewardsError && !rewardsLoading && <button type="button" onClick={() => { setRewardsLoading(true); void loadRewards().catch(() => { setRewardsError(true); toast.error("Customization could not be loaded"); }).finally(() => setRewardsLoading(false)); }} className="rounded-lg border border-dashed p-4 text-left text-sm font-bold text-primary">Retry loading rewards</button>}
          {!rewardsLoading && (rewards?.chests ?? []).slice(0, 6).map((chest) => {
            const reward = rewards?.items.find((item) => item.id === chest.rewardItemId);
            return (
              <div key={chest.id} className="flex items-center gap-3 rounded-lg border bg-muted/15 p-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${chest.rarity === "epic" ? "bg-amber-400/20 text-amber-500" : chest.rarity === "rare" ? "bg-violet-500/15 text-violet-500" : "bg-sky-500/15 text-sky-500"}`}>
                  {chest.status === "opened" ? <PackageOpen className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black capitalize">{chest.rarity} chest</p>
                  <p className="truncate text-[11px] text-muted-foreground">{chest.status === "opened" ? reward?.name ?? `${chest.vpFallback} VP` : chest.sourceKey.replace(/[:-]/g, " ")}</p>
                </div>
                {chest.status === "unopened" && (
                  <button type="button" onClick={() => void openChest(chest)} disabled={working === `chest-${chest.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">
                    Open
                  </button>
                )}
              </div>
            );
          })}
          {!rewardsLoading && !rewardsError && (rewards?.chests.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">Your first chest unlocks at Tier 2 or after 10 completed tasks.</p>}
        </div>
      </section>

      <section className="bento-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Profile collection</h2></div><p className="mt-1 text-sm text-muted-foreground">Equip one frame, pet, title, completion effect, and transition.</p></div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Profile item category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">All categories</option><option value="frame">Frames</option><option value="pet">Pets</option><option value="title">Titles</option><option value="completion_effect">Completion effects</option><option value="transition">Transitions</option></select>
            <select aria-label="Ownership filter" value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">Owned and locked</option><option value="owned">Owned</option><option value="locked">Not owned</option></select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {visibleItems.map((item) => {
            const owned = rewards?.owned.includes(item.id) ?? false;
            const equipped = rewards?.equipped[item.kind] === item.id;
            return <motion.article key={item.id} layout whileHover={reduceMotion ? undefined : { y: -3 }} whileTap={reduceMotion ? undefined : { scale: 0.985 }} className={`relative overflow-hidden rounded-lg border p-3 transition-colors ${equipped ? "border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/.12)]" : "bg-muted/15 hover:border-primary/40"}`}>
              {equipped && <motion.div layoutId={`equipped-${item.kind}`} className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary" transition={{ type: "spring", stiffness: 320, damping: 26 }} />}
              <div className="flex h-14 items-center justify-between">
                {item.kind === "frame" && <FramePreview frameId={item.id} className="w-14" />}
                {item.kind === "pet" && <PetPreview petId={item.id} earnedVp={rewards?.earnedVp} className="h-12 w-12" />}
                {item.kind === "title" && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Tag className="h-5 w-5" /></div>}
                {item.kind === "completion_effect" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15 text-secondary"><PartyPopper className="h-5 w-5" /></div>}
                {item.kind === "transition" && <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><Navigation2 className="h-5 w-5" /></div>}
                <Sparkles className="h-4 w-4 text-secondary" />
              </div>
              <p className="mt-3 min-h-10 text-sm font-black leading-tight">{item.name}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">{item.kind === "completion_effect" ? "completion effect" : item.kind}{item.source ? ` - ${item.source}` : ""}</p>
              {!owned && item.kind === "title" && <p className="mt-2 min-h-10 text-[11px] leading-4 text-muted-foreground">{item.requirement}</p>}
              {owned ? <button disabled={working === item.id || equipped} onClick={() => void equip(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-primary-foreground disabled:opacity-55">{equipped ? <><Check className="h-3.5 w-3.5" /> Equipped</> : "Equip"}</button> : item.source === "chest" ? <div className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-black text-muted-foreground"><Gift className="h-3.5 w-3.5" /> Chest reward</div> : item.kind === "title" ? <div className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-black text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Locked</div> : <button disabled={working === item.id} onClick={() => void purchase(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-xs font-black text-secondary-foreground disabled:opacity-55"><Lock className="h-3.5 w-3.5" /> {item.cost} VP</button>}
            </motion.article>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["frame", "pet", "title", "completion_effect", "transition"] as const).map((kind) => rewards?.equipped[kind] !== "none" && <button key={kind} onClick={() => void unequip(kind)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><X className="h-3.5 w-3.5" /> Reset {kind === "pet" ? "pet" : kind.replace("_", " ")}</button>)}
        </div>
      </section>

      <motion.section layout className="bento-card p-4 sm:p-5">
        <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Appearance</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {themes.map((item) => <motion.button key={item.id} type="button" whileTap={reduceMotion ? undefined : { scale: 0.97 }} onClick={() => setTheme(item.id as ThemeId)} className={`relative overflow-hidden rounded-lg border p-3 text-left transition-colors ${theme === item.id ? "border-primary bg-primary/10" : "hover:border-primary/45"}`}>
            {theme === item.id && <motion.span layoutId="selected-theme" className="absolute inset-0 border-2 border-primary" transition={{ type: "spring", stiffness: 320, damping: 28 }} />}
            <span className="relative block text-sm font-black">{item.label}</span><span className="relative mt-2 block h-2 rounded-full bg-primary" />
          </motion.button>)}
        </div>
      </motion.section>
      <AnimatePresence>
        {opening && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="dialog" aria-modal="true" aria-label="Opening reward chest" className="bento-card w-full max-w-sm overflow-hidden p-7 text-center" initial={{ y: 18, scale: 0.94, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}>
              <div className="relative mx-auto h-28 w-28">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${opening.stage}-${opening.finalRarity}`}
                    initial={{ opacity: 0, scale: 0.78 }}
                    animate={opening.stage === "shaking" && !reduceMotion
                      ? { opacity: 1, scale: 1, rotate: [0, -5, 5, -4, 4, 0], y: [0, -2, 0] }
                      : opening.stage === "upgrading" && !reduceMotion
                        ? { opacity: 1, scale: [0.92, 1.16, 1], rotate: [0, 0, 360] }
                        : { opacity: 1, scale: [0.9, 1.08, 1], y: [4, -5, 0] }}
                    exit={{ opacity: 0, scale: 1.15 }}
                    transition={{ duration: opening.stage === "upgrading" ? 0.72 : 0.52, ease: "easeOut" }}
                    className={`absolute inset-2 flex items-center justify-center rounded-2xl border ${rarityStyle(opening.stage === "shaking" ? opening.initialRarity : opening.finalRarity)}`}
                  >
                    {opening.stage === "opening" ? <PackageOpen className="h-12 w-12" /> : <Gift className="h-12 w-12" />}
                  </motion.div>
                </AnimatePresence>
                {opening.stage === "upgrading" && !reduceMotion && [0, 1, 2, 3].map((index) => (
                  <motion.span key={index} className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm bg-current text-secondary" initial={{ x: 0, y: 0, opacity: 0 }} animate={{ x: Math.cos(index * Math.PI / 2) * 58, y: Math.sin(index * Math.PI / 2) * 58, opacity: [0, 1, 0], rotate: 90 }} transition={{ duration: 0.75, delay: index * 0.05 }} />
                ))}
              </div>
              <div aria-live="polite" className="mt-4 min-h-16">
                {opening.stage === "shaking" && <><p className="text-xs font-black uppercase text-muted-foreground">{opening.initialRarity} chest</p><h2 className="mt-1 text-xl font-black">Checking rarity...</h2></>}
                {opening.stage === "upgrading" && <><p className="text-xs font-black uppercase text-secondary">Rarity upgrade</p><h2 className="mt-1 text-2xl font-black capitalize">{opening.initialRarity} to {opening.finalRarity}</h2></>}
                {opening.stage === "opening" && <><p className="text-xs font-black uppercase text-muted-foreground">{opening.finalRarity} chest</p><h2 className="mt-1 text-xl font-black">{opening.upgraded ? "Opening upgraded chest..." : `${opening.finalRarity.charAt(0).toUpperCase()}${opening.finalRarity.slice(1)} rarity held - opening...`}</h2></>}
              </div>
            </motion.div>
          </motion.div>
        )}
        {reveal && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReveal(null)}>
            <motion.div role="dialog" aria-modal="true" aria-label="Chest reward" onClick={(event) => event.stopPropagation()} initial={{ y: 28, scale: 0.82, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 16, scale: 0.92, opacity: 0 }} transition={{ type: "spring", stiffness: 290, damping: 19 }} className="bento-card w-full max-w-sm p-7 text-center">
              <motion.div animate={reduceMotion ? undefined : { y: [4, -5, 0], scale: [0.9, 1.12, 1] }} transition={{ duration: 0.58 }} className={`mx-auto flex h-20 w-20 items-center justify-center rounded-xl border ${rarityStyle(reveal.rarity)}`}><PackageOpen className="h-9 w-9" /></motion.div>
              {reveal.upgraded && <p className="mx-auto mt-4 w-fit rounded-full bg-secondary/15 px-3 py-1 text-[10px] font-black uppercase text-secondary">Upgraded from {reveal.initialRarity}</p>}
              <p className="mt-5 text-xs font-black uppercase text-muted-foreground">{reveal.rarity} reward</p>
              <h2 className="mt-1 text-2xl font-black">{reveal.reward?.name ?? `${reveal.vpFallback} VP`}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{reveal.reward ? "Added to your profile collection." : "Added to your VP balance."}</p>
              <button type="button" onClick={() => setReveal(null)} className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Continue</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <div className="bento-card p-4 text-primary"><div>{icon}</div><p className="mt-2 text-2xl font-black text-foreground">{value}</p><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p></div>;
}
