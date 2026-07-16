import React, { useEffect, useState } from 'react';
import { Award, Check, Flame, Lock, Palette, ShoppingBag, Sparkles, Zap } from 'lucide-react';
import { useGetUserStats } from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import { themes, useTheme, type ThemeId } from '@/theme';
import { toast } from 'sonner';

type Reward = { id: string; name: string; kind: string; cost: number; style: string };
type RewardsResponse = { balance: number; owned: string[]; equipped: string; avatarStyle: string; items: Reward[] };

function AvatarPreview({ style, name, large = false }: { style: string; name: string; large?: boolean }) {
  const palette: Record<string, string> = { bolt: 'bg-primary text-primary-foreground', orbit: 'bg-violet-500 text-white ring-4 ring-violet-300/40', signal: 'bg-cyan-500 text-slate-950 ring-4 ring-cyan-200/50', ember: 'bg-orange-500 text-slate-950 ring-4 ring-orange-200/50', prism: 'bg-fuchsia-500 text-white ring-4 ring-fuchsia-200/50' };
  return <div className={`flex shrink-0 items-center justify-center rounded-[1.4rem] font-black shadow-lg ${large ? 'h-20 w-20 text-3xl' : 'h-12 w-12 text-xl'} ${palette[style] ?? palette.bolt}`}><Zap className={large ? 'h-9 w-9 fill-current' : 'h-5 w-5 fill-current'} /></div>;
}

export default function Profile() {
  const { user } = useAuth();
  const { data: stats, refetch: refetchStats } = useGetUserStats();
  const { theme, setTheme } = useTheme();
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const name = user?.firstName || user?.email?.split('@')[0] || 'Velocity member';
  const loadRewards = async () => { const response = await fetch('/api/rewards', { credentials: 'include' }); if (response.ok) setRewards(await response.json() as RewardsResponse); };
  useEffect(() => { void loadRewards(); }, []);

  const purchase = async (item: Reward) => {
    setWorking(item.id);
    try { const response = await fetch(`/api/rewards/${item.id}/purchase`, { method: 'POST', credentials: 'include' }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); toast.success(`${item.name} added to your collection`); await loadRewards(); await refetchStats(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Purchase failed'); } finally { setWorking(null); }
  };
  const equip = async (item: Reward) => {
    setWorking(item.id);
    try { const response = await fetch(`/api/rewards/${item.id}/equip`, { method: 'POST', credentials: 'include' }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); toast.success(`${item.name} equipped`); await loadRewards(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not equip item'); } finally { setWorking(null); }
  };

  return <div className="space-y-5">
    <section className="bento-card p-6 sm:p-8"><div className="flex items-center gap-4"><AvatarPreview style={rewards?.avatarStyle ?? 'bolt'} name={name} large /><div><p className="text-xs font-black uppercase text-primary">Velocity profile</p><h1 className="tech-title mt-1 text-3xl">{name}</h1><p className="mt-1 text-sm text-muted-foreground">Build your setup. Keep your momentum.</p></div></div></section>
    <div className="grid gap-5 md:grid-cols-3"><div className="bento-card p-5"><Zap className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-black">{stats?.totalVp ?? 0}</p><p className="text-xs font-bold uppercase text-muted-foreground">VP balance</p></div><div className="bento-card p-5"><Flame className="h-5 w-5 text-secondary" /><p className="mt-3 text-3xl font-black">{stats?.streakDays ?? 0}</p><p className="text-xs font-bold uppercase text-muted-foreground">Current streak</p></div><div className="bento-card p-5"><Award className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-black">{stats?.tier ?? 1}</p><p className="text-xs font-bold uppercase text-muted-foreground">Level</p></div></div>
    <section className="bento-card p-5"><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><h2 className="tech-title text-lg">Avatar collection</h2></div><p className="mt-1 text-sm text-muted-foreground">Spend earned VP on avatar cores and profile frames.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rewards?.items.map((item) => { const owned = rewards.owned.includes(item.id); const equipped = rewards.equipped === item.id; return <div key={item.id} className={`rounded-xl border p-4 transition-all ${equipped ? 'border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/.16)]' : 'border-border bg-muted/20'}`}><div className="flex items-center justify-between"><AvatarPreview style={item.style} name={item.name} /><Sparkles className="h-4 w-4 text-secondary" /></div><p className="mt-4 font-black">{item.name}</p><p className="mt-1 text-xs uppercase text-muted-foreground">{item.kind}</p>{owned ? <button disabled={working === item.id || equipped} onClick={() => equip(item)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-55">{equipped ? <><Check className="h-3.5 w-3.5" /> Equipped</> : 'Equip'}</button> : <button disabled={working === item.id} onClick={() => purchase(item)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-black text-secondary-foreground disabled:opacity-55"><Lock className="h-3.5 w-3.5" /> {item.cost} VP</button>}</div>; })}</div></section>
    <section className="bento-card p-5"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="tech-title text-lg">Appearance</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id as ThemeId)} className={`rounded-xl border p-4 text-left transition-all ${theme === item.id ? 'border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/.16)]' : 'border-border hover:border-primary/45'}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-2 block h-2 rounded-full bg-primary" /></button>)}</div></section>
  </div>;
}
