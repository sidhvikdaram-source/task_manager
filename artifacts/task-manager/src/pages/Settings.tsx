import React, { useState } from "react";
import { Check, Settings2, ShieldCheck, Sparkles, Users, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useExperience } from "@/experience";

export default function Settings() {
  const { preferences, updatePreferences } = useExperience();
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: "advancedFeaturesEnabled" | "socialEnabled" | "completionSoundEnabled", value: boolean) {
    setSaving(key);
    try {
      await updatePreferences(key === "socialEnabled" && value ? { socialEnabled: true, advancedFeaturesEnabled: true } : { [key]: value });
      toast.success(key === "socialEnabled" ? (value ? "Social is now available" : "Social is turned off") : key === "completionSoundEnabled" ? (value ? "Completion sounds enabled" : "Completion sounds muted") : (value ? "Advanced workspace enabled" : "Workspace simplified"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setting could not be saved");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="border-b pb-4">
        <p className="text-xs font-black uppercase text-primary">Preferences</p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose which parts of Velocity are part of your workspace.</p>
      </header>
      <section className="bento-card divide-y">
        <SettingRow icon={Users} title="Social" detail="Friends, private messages, challenges, and friend activity. Your account is hidden from Social search while this is off." enabled={preferences.socialEnabled} disabled={saving === "socialEnabled"} onChange={(value) => void toggle("socialEnabled", value)} />
        <SettingRow icon={Sparkles} title="Advanced workspace" detail="Projects, Calendar, Insights, and other planning tools." enabled={preferences.advancedFeaturesEnabled} disabled={saving === "advancedFeaturesEnabled"} onChange={(value) => void toggle("advancedFeaturesEnabled", value)} />
        <SettingRow icon={Volume2} title="Completion sounds" detail="Play a short confirmation sound when a task is completed." enabled={preferences.completionSoundEnabled} disabled={saving === "completionSoundEnabled"} onChange={(value) => void toggle("completionSoundEnabled", value)} />
      </section>
      <section className="bento-card p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-black">Privacy by default</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Turning Social off keeps existing friendships and messages stored, but blocks Social access and removes your profile from search until you turn it on again.</p></div></div>
      </section>
      <section className="bento-card p-5">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /><h2 className="font-black">Tutorial</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Replay the workspace tour, including where to find these settings.</p>
        <button type="button" onClick={() => void updatePreferences({ tutorialCompleted: false })} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"><Check className="h-3.5 w-3.5" /> Replay tutorial</button>
      </section>
    </div>
  );
}

function SettingRow({ icon: Icon, title, detail, enabled, disabled, onChange }: { icon: typeof Users; title: string; detail: string; enabled: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-start gap-3 p-5"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h2 className="font-black">{title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={`Turn ${title} ${enabled ? "off" : "on"}`} disabled={disabled} onClick={() => onChange(!enabled)} className={`h-6 w-11 shrink-0 rounded-full p-1 transition-colors disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : ""}`} /></button></div>;
}
