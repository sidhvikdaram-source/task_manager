import {
  BarChart3,
  Circle,
  Focus,
  LayoutList,
  Play,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { NimbusMascot } from "@/components/NimbusMascot";
import { cn } from "@/lib/utils";

type ProductScene = "today" | "focus" | "analytics";

type NimbusProductPreviewProps = {
  scene: ProductScene;
  className?: string;
};

const navigation = [
  { label: "My day", icon: LayoutList },
  { label: "Focus", icon: Focus },
  { label: "Insights", icon: BarChart3 },
];

const tasks = [
  { title: "Review chemistry cards", detail: "Today · Science", color: "bg-[#7565e8]" },
  { title: "Play ping pong", detail: "10 min · Medium energy", color: "bg-[#55bda7]" },
  { title: "Outline history essay", detail: "Tomorrow · High priority", color: "bg-[#ee9c55]" },
];

function PreviewShell({ scene, children }: { scene: ProductScene; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[1.55rem] border border-white/70 bg-[#f7f5ff] text-[#171522] shadow-[0_28px_90px_rgba(33,29,54,.2)]">
      <div className="flex h-9 items-center gap-1.5 border-b border-[#ded9ee] bg-white/90 px-4">
        <span className="h-2 w-2 rounded-full bg-[#ff8f86]" />
        <span className="h-2 w-2 rounded-full bg-[#f6c661]" />
        <span className="h-2 w-2 rounded-full bg-[#73cba7]" />
        <span className="ml-3 hidden rounded-md bg-[#f1eff8] px-3 py-1 text-[8px] font-semibold text-[#777085] sm:block">
          nimbusdo.onrender.com/{scene === "today" ? "" : scene}
        </span>
      </div>
      <div className="grid min-h-[23rem] grid-cols-[3.6rem_1fr] sm:min-h-[29rem] sm:grid-cols-[10.5rem_1fr]">
        <aside className="border-r border-[#ded9ee] bg-white p-2.5 sm:p-4">
          <div className="flex items-center gap-2">
            <NimbusMascot variant="mark" animated={false} interactive={false} className="h-9 w-10" />
            <span className="nimbus-wordmark hidden text-sm sm:inline">nimbus</span>
          </div>
          <div className="mt-6 space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = (scene === "today" && item.label === "My day") || item.label.toLowerCase() === scene;
              return (
                <div key={item.label} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-bold", active ? "bg-[#ece8ff] text-[#5f51ca]" : "text-[#777085]")}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-auto hidden pt-24 sm:block">
            <div className="rounded-xl bg-[#171522] p-3 text-white">
              <p className="text-[8px] font-bold text-[#b8aeff]">Momentum</p>
              <p className="mt-1 text-xl font-black">14 days</p>
            </div>
          </div>
        </aside>
        <div className="min-w-0 bg-[radial-gradient(circle_at_90%_0%,rgba(184,174,255,.28),transparent_24rem)] p-3.5 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function TodayScene() {
  return (
    <PreviewShell scene="today">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold text-[#7565e8]">Good afternoon, Alex.</p>
          <h3 className="mt-1 text-xl font-[720] tracking-[-.045em] sm:text-3xl">What fits right now?</h3>
        </div>
        <NimbusMascot state="assistant" className="h-12 w-16 sm:h-16 sm:w-20" />
      </div>
      <div className="mt-5 rounded-xl border border-[#ded9ee] bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-2 rounded-lg bg-[#f4f2fa] px-3 py-2.5 text-[9px] text-[#8d869b]">
          <Sparkles className="h-3.5 w-3.5 text-[#7565e8]" />
          Add a task in plain language...
          <span className="ml-auto rounded-md bg-[#171522] px-2 py-1 font-bold text-white">Capture</span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.55fr_.8fr]">
        <div className="overflow-hidden rounded-xl border border-[#ded9ee] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e8e4f1] px-3 py-2.5">
            <p className="text-[10px] font-black">Today’s tasks</p>
            <span className="rounded-md bg-[#ece8ff] px-2 py-1 text-[8px] font-bold text-[#5f51ca]">3 active</span>
          </div>
          {tasks.map((task) => (
            <div key={task.title} className="flex items-center gap-2.5 border-b border-[#eeeaf5] px-3 py-3 last:border-0">
              <Circle className="h-4 w-4 shrink-0 text-[#9d97aa]" />
              <span className={cn("h-2 w-2 shrink-0 rounded-full", task.color)} />
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black sm:text-[10px]">{task.title}</p>
                <p className="mt-0.5 truncate text-[8px] font-medium text-[#8d869b]">{task.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-[#171522] p-3.5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-[8px] font-bold text-[#b8aeff]">
            <Sparkles className="h-3 w-3" /> Best next move
          </div>
          <p className="mt-3 text-sm font-black leading-tight">Play ping pong</p>
          <p className="mt-2 text-[8px] leading-4 text-white/55">Fits your 10 minutes and medium energy without ignoring priority.</p>
          <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 text-[8px] font-black text-[#171522]">
            Start this task <Play className="ml-auto h-3 w-3 fill-current" />
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function FocusScene() {
  return (
    <PreviewShell scene="focus">
      <div className="relative flex min-h-[20rem] flex-col items-center justify-center overflow-hidden rounded-2xl bg-[#171522] p-6 text-center text-white sm:min-h-[25rem]">
        <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[#7565e8]/35 blur-3xl" />
        <div className="absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-[#55bda7]/25 blur-3xl" />
        <NimbusMascot state="assistant" className="absolute right-4 top-4 h-14 w-20 opacity-80 sm:right-8 sm:top-7 sm:h-20 sm:w-28" />
        <p className="relative text-[9px] font-bold uppercase tracking-[.18em] text-[#b8aeff]">Focus space</p>
        <h3 className="relative mt-3 max-w-md text-lg font-[680] sm:text-2xl">Review chemistry cards</h3>
        <div className="relative mt-6 flex h-36 w-36 items-center justify-center rounded-full border-[7px] border-white/10 sm:h-44 sm:w-44">
          <div className="absolute inset-[-7px] rotate-45 rounded-full border-[7px] border-transparent border-r-[#8f80f2] border-t-[#8f80f2]" />
          <div>
            <p className="text-3xl font-[650] tracking-[-.06em] sm:text-4xl">18:42</p>
            <p className="mt-1 text-[8px] font-bold text-white/45">of 25 minutes</p>
          </div>
        </div>
        <div className="relative mt-6 flex items-center gap-2">
          <button className="rounded-xl bg-white px-4 py-2 text-[9px] font-black text-[#171522]">Pause</button>
          <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 text-white/65"><TimerReset className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </PreviewShell>
  );
}

function AnalyticsScene() {
  return (
    <PreviewShell scene="analytics">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-bold text-[#7565e8]">Your progress</p>
          <h3 className="mt-1 text-xl font-[720] tracking-[-.045em] sm:text-3xl">Momentum, made visible.</h3>
        </div>
        <NimbusMascot state="momentum" className="h-12 w-16 sm:h-16 sm:w-22" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["14", "Momentum days"],
          ["2,480", "Nimbus points"],
          ["38", "Tasks finished"],
          ["420", "Focus minutes"],
        ].map(([value, label], index) => (
          <div key={label} className={cn("rounded-xl p-3 shadow-sm", index === 0 ? "bg-[#7565e8] text-white" : "border border-[#ded9ee] bg-white")}>
            <p className="text-lg font-black sm:text-xl">{value}</p>
            <p className={cn("mt-1 text-[7px] font-bold", index === 0 ? "text-white/65" : "text-[#8d869b]")}>{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-[#ded9ee] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black">Nimbus Points · 30 days</p>
          <span className="text-[8px] font-bold text-[#55a28f]">+22% this month</span>
        </div>
        <svg viewBox="0 0 600 180" className="mt-4 h-32 w-full overflow-visible sm:h-44">
          <defs>
            <linearGradient id="nimbusChart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7565E8" stopOpacity=".35" />
              <stop offset="100%" stopColor="#7565E8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 75, 120, 165].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#E8E4F1" strokeDasharray="4 5" />)}
          <path d="M0 155 C55 145 70 118 120 125 S205 92 252 104 S320 58 370 73 S450 30 500 49 S558 18 600 24 L600 180 L0 180Z" fill="url(#nimbusChart)" />
          <path d="M0 155 C55 145 70 118 120 125 S205 92 252 104 S320 58 370 73 S450 30 500 49 S558 18 600 24" fill="none" stroke="#7565E8" strokeLinecap="round" strokeWidth="5" />
          <circle cx="500" cy="49" r="7" fill="#7565E8" stroke="white" strokeWidth="4" />
        </svg>
      </div>
    </PreviewShell>
  );
}

export function NimbusProductPreview({ scene, className }: NimbusProductPreviewProps) {
  return (
    <div className={cn("w-full", className)}>
      {scene === "today" && <TodayScene />}
      {scene === "focus" && <FocusScene />}
      {scene === "analytics" && <AnalyticsScene />}
    </div>
  );
}
