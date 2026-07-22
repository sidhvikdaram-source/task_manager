import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  FolderKanban,
  GraduationCap,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
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
import { AnimatePresence, motion } from "framer-motion";

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
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Insights", icon: ChartNoAxesCombined },
  { href: "/social", label: "Social", icon: Users },
];

function SidebarBody({
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  onNavigate: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
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
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border/70",
          collapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <Link href="/" onClick={onNavigate}>
          <div
            className="flex cursor-pointer items-center gap-2.5"
            title="Velocity"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#141414] text-white shadow-[0_6px_14px_rgba(0,0,0,0.14)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            {!collapsed && (
              <span className="text-lg font-black tracking-tight">
                Velocity
              </span>
            )}
          </div>
        </Link>
        {onToggle && !collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto py-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && (
          <p className="px-2 text-[10px] font-black uppercase text-muted-foreground">
            Workspace
          </p>
        )}
        <nav
          className={cn("space-y-1", !collapsed && "mt-2")}
          aria-label="Primary navigation"
        >
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate}>
                <div
                  className={cn(
                    "relative flex cursor-pointer items-center overflow-hidden rounded-lg text-sm font-bold transition-colors",
                    collapsed
                      ? "h-10 justify-center px-2"
                      : "gap-3 px-2.5 py-2.5",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 bg-primary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  <Icon className="relative z-10 h-4 w-4 shrink-0" />
                  {!collapsed && <span className="relative z-10 flex-1">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {!collapsed && preferences.advancedFeaturesEnabled ? (
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
              {advancedLinks.slice(1).filter((item) => item.href !== "/social" || preferences.socialEnabled).map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate}>
                    <div
                      className={cn(
                        "relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 bg-primary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                      <Icon className="relative z-10 h-4 w-4" />
                      <span className="relative z-10">{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : !collapsed ? (
          <section className="mt-6 rounded-lg border border-primary/20 bg-primary/8 p-3">
            <div className="flex items-center gap-2 text-primary">
              <Settings2 className="h-4 w-4" />
              <h2 className="text-sm font-black">Need more?</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Turn on Advanced Workspace whenever you want Calendar, Projects,
              and Insights.
            </p>
            <button
              type="button"
              onClick={() => void setAdvanced(true)}
              className="mt-3 flex w-full items-center justify-between rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
            >
              Show advanced tools <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </section>
        ) : null}
      </div>

      <div className={cn("shrink-0 border-t border-border/70", collapsed ? "p-2" : "px-3 py-2")}>
        <Link href="/settings" onClick={onNavigate}>
          <div className={cn("flex cursor-pointer items-center rounded-lg text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground", collapsed ? "h-10 justify-center" : "gap-3 px-2.5 py-2")} title={collapsed ? "Settings" : undefined}>
            <Settings2 className="h-4 w-4" />{!collapsed && <span>Settings</span>}
          </div>
        </Link>
      </div>

      {stats && (
        <div
          className={cn(
            "shrink-0 border-t border-border/70",
            collapsed ? "p-2" : "p-3",
          )}
        >
          <Link href="/profile" onClick={onNavigate}>
            <div
              className={cn(
                "flex cursor-pointer items-center rounded-lg hover:bg-muted",
                collapsed ? "justify-center p-2" : "gap-3 px-2 py-2.5",
              )}
              title={
                collapsed
                  ? `Tier ${stats.tier} - ${100 - stats.tierProgress} VP to next tier`
                  : undefined
              }
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="h-4 w-4 fill-primary" />
              </div>
              {!collapsed && (
                <>
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
                    {100 - stats.tierProgress} left
                  </span>
                </>
              )}
            </div>
          </Link>
        </div>
      )}

      {collapsed && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="absolute bottom-16 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const [width, setWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("velocity-sidebar-width"));
    return Number.isFinite(saved) ? Math.min(288, Math.max(184, saved)) : 224;
  });
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem("velocity-sidebar-collapsed") === "true",
  );

  useEffect(() => {
    window.localStorage.setItem("velocity-sidebar-width", String(width));
  }, [width]);

  useEffect(() => {
    window.localStorage.setItem(
      "velocity-sidebar-collapsed",
      String(collapsed),
    );
  }, [collapsed]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      setWidth(
        Math.min(288, Math.max(184, startWidth + moveEvent.clientX - startX)),
      );
    };
    const stop = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  return (
    <>
      <aside
        className="relative hidden h-[100dvh] shrink-0 border-r border-border/70 lg:block"
        style={{ width: collapsed ? 64 : width }}
      >
        <SidebarBody
          onNavigate={() => undefined}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />
        {!collapsed && (
          <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={184}
            aria-valuemax={288}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft")
                setWidth((value) => Math.max(184, value - 8));
              if (event.key === "ArrowRight")
                setWidth((value) => Math.min(288, value + 8));
            }}
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize transition-colors hover:bg-primary/20 focus-visible:bg-primary/25 focus-visible:outline-none"
          />
        )}
      </aside>

      <AnimatePresence>
        {open && (
        <motion.div className="fixed inset-0 z-[70] hidden md:block lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 330, damping: 34 }} className="relative h-full w-[min(82vw,280px)] border-r border-border bg-background shadow-2xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody onNavigate={onClose} />
          </motion.aside>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
