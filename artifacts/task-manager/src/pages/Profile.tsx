import React from 'react';
import { Award, Flame, Palette, ShieldCheck, Zap } from 'lucide-react';
import { useGetUserStats } from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import { themes, useTheme, type ThemeId } from '@/theme';

export default function Profile() {
  const { user } = useAuth();
  const { data: stats } = useGetUserStats();
  const { theme, setTheme } = useTheme();
  const name = user?.firstName || user?.email?.split('@')[0] || 'Velocity member';
  return <div className="space-y-5">
    <section className="bento-card p-6 sm:p-8"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground">{name.slice(0, 1).toUpperCase()}</div><div><p className="text-xs font-black uppercase text-primary">Velocity profile</p><h1 className="tech-title mt-1 text-3xl">{name}</h1><p className="mt-1 text-sm text-muted-foreground">Private productivity identity</p></div></div></section>
    <div className="grid gap-5 md:grid-cols-3"><div className="bento-card p-5"><Zap className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-black">{stats?.totalVp ?? 0}</p><p className="text-xs font-bold uppercase text-muted-foreground">VP balance</p></div><div className="bento-card p-5"><Flame className="h-5 w-5 text-secondary" /><p className="mt-3 text-3xl font-black">{stats?.streakDays ?? 0}</p><p className="text-xs font-bold uppercase text-muted-foreground">Current streak</p></div><div className="bento-card p-5"><Award className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-black">{stats?.tier ?? 1}</p><p className="text-xs font-bold uppercase text-muted-foreground">Level</p></div></div>
    <section className="bento-card p-5"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><h2 className="tech-title text-lg">Appearance</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id as ThemeId)} className={`rounded-xl border p-4 text-left transition-all ${theme === item.id ? 'border-primary bg-primary/10 shadow-[0_0_22px_hsl(var(--primary)/.16)]' : 'border-border hover:border-primary/45'}`}><span className="block text-sm font-black">{item.label}</span><span className="mt-2 block h-2 rounded-full bg-primary" /></button>)}</div></section>
    <section className="bento-card flex gap-3 p-5 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" />Profile details and earned customizations stay private unless you choose to share them with friends.</section>
  </div>;
}
