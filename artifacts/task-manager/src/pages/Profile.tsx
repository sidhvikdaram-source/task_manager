import React, { useEffect, useMemo, useState } from "react";
import { Award, Check, Lock, Palette, ShoppingBag, Sparkles, X, Zap } from "lucide-react";
import { useGetUserStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { themes, useTheme, type ThemeId } from "@/theme";
import { toast } from "sonner";
import { MomentumIcon } from "@/components/MomentumIcon";
import { FramePreview, PetCompanion, ProfileAvatar } from "@/components/ProfileCosmetics";
import { useQueryClient } from "@tanstack/react-query";

type RewardKind = "avatar" | "frame" | "pet";
type Reward = { id: string; name: string; kind: RewardKind; cost: number; style: string };
export type RewardsResponse = {
  balance: number;
  owned: string[];
  equipped: { avatar: string; frame: string; pet: string };
  avatarStyle: string;
  items: Reward[];
};

export default function Profile() {
  const { user } = useAuth();
  const { data: stats, refetch: refetchStats } = useGetUserStats();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | RewardKind>("all");
  const [ownership, setOwnership] = useState<"all" | "owned" | "locked">("all");
  const name = user?.firstName || user?.email?.split("@")[0] || "Velocity member";

  const loadRewards = async () => {
    const response = await fetch("/api/rewards", { credentials: "include" });
    if (!response.ok) throw new Error("Customization could not be loaded");
    const data = (await response.json()) as RewardsResponse;
    setRewards(data);
    queryClient.setQueryData(["rewards"], data);
  };

  useEffect(() => { void loadRewards().catch(() => toast.error("Customization could not be loaded")); }, []);

  const visibleItems = useMemo(() => (rewards?.items ?? []).filter((item) => {
    if (category !== "all" && item.kind !== category) return false;
    const owned = rewards?.owned.includes(item.id);
    return ownership === "all" || (ownership === "owned" ? owned : !owned);
  }), [category, ownership, rewards]);

  const purchase = async (item: Reward) => {
    setWorking(item.id);
    try {
      const response = await fetch(`/api/rewards/${item.id}/purchase`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success(`${item.name} added to your collection`);
      await Promise.all([loadRewards(), refetchStats()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purchase failed");
    } finally { setWorking(null); }
  };

  const equip = async (item: Reward) => {
    setWorking(item.id);
    try {
      const response = await fetch(`/api/rewards/${item.id}/equip`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success(`${item.name} equipped`);
      await loadRewards();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not equip item");
    } finally { setWorking(null); }
  };

  const unequip = async (kind: "frame" | "pet") => {
    setWorking(`none-${kind}`);
    try {
      const response = await fetch(`/api/rewards/equipped/${kind}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not remove item");
      await loadRewards();
      toast.success(`${kind === "pet" ? "Companion" : "Frame"} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove item");
    } finally { setWorking(null); }
  };

  return (
    <div className="space-y-5">
      <section className="bento-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <ProfileAvatar avatarId={rewards?.equipped.avatar} frameId={rewards?.equipped.frame} profileImageUrl={user?.profileImageUrl} name={name} className="w-24" />
            <PetCompanion petId={rewards?.equipped.pet} className="absolute -bottom-2 -right-4 h-11 w-11" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-primary">Velocity profile</p>
            <h1 className="mt-1 truncate text-3xl font-black">{name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">A focused workspace that still feels like yours.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Zap className="h-5 w-5" />} value={stats?.totalVp ?? 0} label="VP balance" />
        <Metric icon={<MomentumIcon className="h-5 w-5" />} value={stats?.streakDays ?? 0} label="Momentum days" />
        <Metric icon={<Award className="h-5 w-5" />} value={stats?.tier ?? 1} label="Level" />
      </div>

      <section className="bento-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Customization collection</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Mix an avatar, frame, and animated companion.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Customization category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold">
              <option value="all">All categories</option><option value="avatar">Avatars</option><option value="frame">Frames</option><option value="pet">Companions</option>
            </select>
            <select aria-label="Ownership filter" value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold">
              <option value="all">Owned and locked</option><option value="owned">Owned</option><option value="locked">Not owned</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {visibleItems.map((item) => {
            const owned = rewards?.owned.includes(item.id) ?? false;
            const equipped = rewards?.equipped[item.kind] === item.id;
            return (
              <article key={item.id} className={`rounded-lg border p-3 transition-colors ${equipped ? "border-primary bg-primary/10" : "bg-muted/15 hover:border-primary/40"}`}>
                <div className="flex h-14 items-center justify-between">
                  {item.kind === "avatar" && <ProfileAvatar avatarId={item.id} className="w-14" />}
                  {item.kind === "frame" && <FramePreview frameId={item.id} className="w-14" />}
                  {item.kind === "pet" && <PetCompanion petId={item.id} className="h-12 w-12" />}
                  <Sparkles className="h-4 w-4 text-secondary" />
                </div>
                <p className="mt-3 min-h-10 text-sm font-black leading-tight">{item.name}</p>
                <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">{item.kind === "pet" ? "companion" : item.kind}</p>
                {owned ? (
                  <button disabled={working === item.id || equipped} onClick={() => void equip(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-primary-foreground disabled:opacity-55">
                    {equipped ? <><Check className="h-3.5 w-3.5" /> Equipped</> : "Equip"}
                  </button>
                ) : (
                  <button disabled={working === item.id} onClick={() => void purchase(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-xs font-black text-secondary-foreground disabled:opacity-55">
                    <Lock className="h-3.5 w-3.5" /> {item.cost} VP
                  </button>
                )}
              </article>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {rewards?.equipped.frame !== "none" && <button onClick={() => void unequip("frame")} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><X className="h-3.5 w-3.5" /> Remove frame</button>}
          {rewards?.equipped.pet !== "none" && <button onClick={() => void unequip("pet")} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><X className="h-3.5 w-3.5" /> Remove companion</button>}
        </div>
      </section>

      <section className="bento-card p-4 sm:p-5">
        <div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Appearance</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id as ThemeId)} className={`rounded-lg border p-3 text-left transition-colors ${theme === item.id ? "border-primary bg-primary/10" : "hover:border-primary/45"}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-2 block h-2 rounded-full bg-primary" /></button>)}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <div className="bento-card p-4 text-primary"><div>{icon}</div><p className="mt-2 text-2xl font-black text-foreground">{value}</p><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p></div>;
}
