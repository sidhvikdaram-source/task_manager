import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Settings2,
  Timer,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useGetUserStats } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useExperience } from "@/experience";
import { cn } from "@/lib/utils";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

const coreLinks = [
  { href: "/", label: "My Day", icon: ListChecks },
  { href: "/school", label: "Academics", icon: GraduationCap },
  { href: "/focus", label: "Focus", icon: Timer },
];

const advancedLinks = [
  { href: "/calendar", label: "Schedule", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Insights", icon: ChartNoAxesCombined },
  { href: "/social", label: "Social", icon: Users },
];

function SidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();
  const { preferences, updatePreferences } = useExperience();

  async function setAdvanced(enabled: boolean) {
    try {
      await updatePreferences({ advancedFeaturesEnabled: enabled });
      if (enabled) toast.success("Advanced workspace is now available");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Workspace settings could not be updated",
      );
    }
  }

  const navigation = preferences.advancedFeaturesEnabled
    ? [...coreLinks, advancedLinks[0]]
    : coreLinks;

  return (
    <div
      data-tour="primary-navigation"
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <Link href="/" onClick={onNavigate}>
          <div className="flex cursor-pointer items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.82rem] bg-[#141414] text-white shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <span className="text-xl font-black tracking-tight">Velocity</span>
          </div>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 text-[10px] font-black uppercase text-muted-foreground">
          Workspace
        </p>
        <nav className="mt-2 space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate}>
                <div
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {preferences.advancedFeaturesEnabled ? (
          <div className="mt-6">
            <div className="flex items-center justify-between px-3">
              <p className="text-[10px] font-black uppercase text-muted-foreground">
                More tools
              </p>
              <button
                type="button"
                onClick={() => void setAdvanced(false)}
                className="text-[10px] font-bold text-muted-foreground hover:text-foreground"
              >
                Simplify
              </button>
            </div>
            <nav className="mt-2 space-y-1" aria-label="Advanced navigation">
              {advancedLinks.slice(1).map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}>
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          <section className="mt-6 rounded-lg border border-primary/20 bg-primary/8 p-3">
            <div className="flex items-center gap-2 text-primary">
              <Settings2 className="h-4 w-4" />
              <h2 className="text-sm font-black">Need more?</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Turn on Advanced Workspace whenever you want Schedule, Projects,
              Insights, and Social.
            </p>
            <button
              type="button"
              onClick={() => void setAdvanced(true)}
              className="mt-3 flex w-full items-center justify-between rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
            >
              Show advanced tools <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </section>
        )}
      </div>

      {stats && (
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <Link href="/profile" onClick={onNavigate}>
            <div className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-sidebar-accent">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="h-4 w-4 fill-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black">Tier {stats.tier}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${stats.tierProgress}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground">
                {stats.tierProgress}/100
              </span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden h-[100dvh] w-64 shrink-0 border-r border-sidebar-border lg:block">
        <SidebarBody onNavigate={() => undefined} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <aside className="relative h-full w-[min(86vw,300px)] border-r border-sidebar-border shadow-2xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
