import React, { useEffect, useMemo, useRef, useState } from "react";
import { Award, Check, ImagePlus, Lock, Palette, ShoppingBag, Sparkles, Tag, Trash2, X, Zap } from "lucide-react";
import { useGetUserStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { themes, useTheme, type ThemeId } from "@/theme";
import { toast } from "sonner";
import { MomentumIcon } from "@/components/MomentumIcon";
import { FramePreview, PetCompanion, ProfilePhoto } from "@/components/ProfileCosmetics";
import { useQueryClient } from "@tanstack/react-query";

type RewardKind = "frame" | "pet" | "title";
type Reward = {
  id: string;
  name: string;
  kind: RewardKind;
  cost: number;
  style: string;
  requirement?: string;
  source?: "quest" | "achievement" | "tier";
};
export type RewardsResponse = {
  balance: number;
  earnedVp: number;
  owned: string[];
  newlyUnlockedTitles: string[];
  equipped: { frame: string; pet: string; title: string };
  profileImageUrl: string | null;
  items: Reward[];
};

export default function Profile() {
  const { user } = useAuth();
  const { data: stats, refetch: refetchStats } = useGetUserStats();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | RewardKind>("pet");
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
    try {
      const response = await fetch(`/api/rewards/${item.id}/equip`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success(`${item.name} equipped`);
      await loadRewards();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not equip item"); }
    finally { setWorking(null); }
  };

  const unequip = async (kind: RewardKind) => {
    setWorking(`none-${kind}`);
    try {
      const response = await fetch(`/api/rewards/equipped/${kind}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Could not remove item");
      await loadRewards();
      toast.success(`${kind === "pet" ? "Companion" : kind[0].toUpperCase() + kind.slice(1)} removed`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove item"); }
    finally { setWorking(null); }
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
          <div className="relative w-fit">
            <ProfilePhoto frameId={rewards?.equipped.frame} profileImageUrl={rewards?.profileImageUrl ?? user?.profileImageUrl} name={name} className="w-24" />
            <PetCompanion petId={rewards?.equipped.pet} earnedVp={rewards?.earnedVp} className="absolute -bottom-2 -right-4 h-11 w-11" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-primary">Velocity profile</p>
            <h1 className="mt-1 truncate text-3xl font-black">{name}</h1>
            {equippedTitle && <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary"><Tag className="h-3 w-3" /> {equippedTitle}</p>}
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

      <section className="bento-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Profile collection</h2></div><p className="mt-1 text-sm text-muted-foreground">Equip one frame, companion, and earned title.</p></div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Profile item category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">All categories</option><option value="frame">Frames</option><option value="pet">Companions</option><option value="title">Titles</option></select>
            <select aria-label="Ownership filter" value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)} className="h-9 rounded-lg border bg-background px-2 text-xs font-bold"><option value="all">Owned and locked</option><option value="owned">Owned</option><option value="locked">Not owned</option></select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {visibleItems.map((item) => {
            const owned = rewards?.owned.includes(item.id) ?? false;
            const equipped = rewards?.equipped[item.kind] === item.id;
            return <article key={item.id} className={`rounded-lg border p-3 transition-colors ${equipped ? "border-primary bg-primary/10" : "bg-muted/15 hover:border-primary/40"}`}>
              <div className="flex h-14 items-center justify-between">
                {item.kind === "frame" && <FramePreview frameId={item.id} className="w-14" />}
                {item.kind === "pet" && <PetCompanion petId={item.id} earnedVp={rewards?.earnedVp} className="h-12 w-12" />}
                {item.kind === "title" && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Tag className="h-5 w-5" /></div>}
                <Sparkles className="h-4 w-4 text-secondary" />
              </div>
              <p className="mt-3 min-h-10 text-sm font-black leading-tight">{item.name}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">{item.kind === "pet" ? "companion" : item.kind}{item.source ? ` - ${item.source}` : ""}</p>
              {!owned && item.kind === "title" && <p className="mt-2 min-h-10 text-[11px] leading-4 text-muted-foreground">{item.requirement}</p>}
              {owned ? <button disabled={working === item.id || equipped} onClick={() => void equip(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-primary-foreground disabled:opacity-55">{equipped ? <><Check className="h-3.5 w-3.5" /> Equipped</> : "Equip"}</button> : item.kind === "title" ? <div className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-black text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Locked</div> : <button disabled={working === item.id} onClick={() => void purchase(item)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-xs font-black text-secondary-foreground disabled:opacity-55"><Lock className="h-3.5 w-3.5" /> {item.cost} VP</button>}
            </article>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["frame", "pet", "title"] as const).map((kind) => rewards?.equipped[kind] !== "none" && <button key={kind} onClick={() => void unequip(kind)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><X className="h-3.5 w-3.5" /> Remove {kind === "pet" ? "companion" : kind}</button>)}
        </div>
      </section>

      <section className="bento-card p-4 sm:p-5"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="text-lg font-black">Appearance</h2></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id as ThemeId)} className={`rounded-lg border p-3 text-left transition-colors ${theme === item.id ? "border-primary bg-primary/10" : "hover:border-primary/45"}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-2 block h-2 rounded-full bg-primary" /></button>)}</div></section>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <div className="bento-card p-4 text-primary"><div>{icon}</div><p className="mt-2 text-2xl font-black text-foreground">{value}</p><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p></div>;
}
