import {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  ChartNoAxesCombined,
  FolderKanban,
  GraduationCap,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { useGetUserStats } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

const navLinks = [
  { href: "/", label: "My Day", icon: ListChecks },
  { href: "/school", label: "Academics", icon: GraduationCap },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Insights", icon: ChartNoAxesCombined },
];

function SlidingLabel({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
          }
          className={className}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
  indicatorId,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  indicatorId: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined}>
      <div
        className={cn(
          "relative z-10 flex cursor-pointer items-center overflow-hidden rounded-lg text-sm font-bold transition-colors",
          collapsed ? "h-10 justify-center px-2" : "gap-3 px-2.5 py-2.5",
          active
            ? "text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        data-sidebar-active={active}
        title={collapsed ? label : undefined}
      >
        {active && (
          <motion.span
            layoutId={`sidebar-active-${indicatorId}`}
            aria-hidden="true"
            className="absolute inset-0 rounded-lg bg-primary shadow-sm"
            initial={false}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 390,
                    damping: 31,
                    mass: 0.72,
                  }
            }
          />
        )}
        <Icon className="relative z-10 h-4 w-4 shrink-0" />
        <SlidingLabel
          show={!collapsed}
          className="relative z-10 flex-1 whitespace-nowrap"
        >
          {label}
        </SlidingLabel>
      </div>
    </Link>
  );
}

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
  const reduceMotion = useReducedMotion();
  const indicatorId = useId();
  const activeTransition = reduceMotion
    ? { duration: 0 }
    : {
        type: "spring" as const,
        stiffness: 390,
        damping: 31,
        mass: 0.72,
      };

  return (
    <LayoutGroup id={`sidebar-navigation-${indicatorId}`}>
      <div
        data-tour="primary-navigation"
        className="relative flex h-full min-w-0 flex-col overflow-x-hidden bg-background text-foreground"
      >
      {/* Logo header */}
      <div
        className={cn(
          "relative z-10 flex h-16 shrink-0 items-center border-b border-border/70 bg-background",
          collapsed ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        {collapsed && onToggle ? (
          <motion.button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            whileHover={reduceMotion ? undefined : { scale: 1.05 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="flex h-11 w-11 items-center justify-center rounded-[0.95rem] bg-[#141414] text-white shadow-[0_6px_14px_rgba(0,0,0,0.14)]"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </motion.button>
        ) : (
          <Link href="/" onClick={onNavigate}>
            <motion.div
              className="flex cursor-pointer items-center gap-2.5"
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              title="Velocity"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#141414] text-white shadow-[0_6px_14px_rgba(0,0,0,0.14)]">
                <Zap className="h-5 w-5 fill-white text-white" />
              </div>
              <SlidingLabel
                show={!collapsed}
                className="whitespace-nowrap text-lg font-black tracking-tight"
              >
                Velocity
              </SlidingLabel>
            </motion.div>
          </Link>
        )}
        {onToggle && !collapsed && (
          <motion.button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            whileHover={reduceMotion ? undefined : { scale: 1.08 }}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      {/* Navigation */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto py-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <SlidingLabel
          show={!collapsed}
          className="mb-2 block px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70"
        >
          Navigate
        </SlidingLabel>
        <nav className="space-y-0.5" aria-label="Primary navigation">
          {navLinks.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={location === item.href}
              collapsed={collapsed}
              onClick={onNavigate}
              indicatorId={indicatorId}
            />
          ))}
        </nav>
      </div>

      {/* Bottom: Settings */}
      <div className={cn("shrink-0 border-t border-border/70", collapsed ? "p-2" : "px-3 py-2")}>
        <Link href="/settings" onClick={onNavigate} aria-current={location === "/settings" ? "page" : undefined}>
          <motion.div
            whileHover={reduceMotion ? undefined : { x: collapsed ? 0 : 3, transition: { type: "spring", stiffness: 400, damping: 28 } }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            data-sidebar-active={location === "/settings"}
            className={cn(
              "relative z-10 flex cursor-pointer items-center overflow-hidden rounded-lg text-sm font-bold transition-colors",
              location === "/settings" ? "text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed ? "h-10 justify-center" : "gap-3 px-2.5 py-2",
            )}
            title={collapsed ? "Settings" : undefined}
          >
            {location === "/settings" && (
              <motion.span
                layoutId={`sidebar-active-${indicatorId}`}
                aria-hidden="true"
                className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                initial={false}
                transition={activeTransition}
              />
            )}
            <Settings2 className="relative z-10 h-4 w-4" />
            <SlidingLabel
              show={!collapsed}
              className="relative z-10 whitespace-nowrap"
            >
              Settings
            </SlidingLabel>
          </motion.div>
        </Link>
      </div>

      {/* Bottom: Profile / Tier */}
      {stats && (
        <div className={cn("shrink-0 border-t border-border/70", collapsed ? "p-2" : "p-3")}>
          <Link href="/profile" onClick={onNavigate} aria-current={location === "/profile" ? "page" : undefined}>
            <motion.div
              whileHover={reduceMotion ? undefined : { x: collapsed ? 0 : 3, transition: { type: "spring", stiffness: 400, damping: 28 } }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              data-sidebar-active={location === "/profile"}
              className={cn(
                "relative z-10 flex cursor-pointer items-center overflow-hidden rounded-lg transition-colors",
                location === "/profile" ? "text-primary-foreground" : "hover:bg-muted",
                collapsed ? "justify-center p-2" : "gap-3 px-2 py-2.5",
              )}
              title={collapsed ? `Tier ${stats.tier} · ${100 - stats.tierProgress} VP to next` : undefined}
            >
              {location === "/profile" && (
                <motion.span
                  layoutId={`sidebar-active-${indicatorId}`}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                  initial={false}
                  transition={activeTransition}
                />
              )}
              <div className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                location === "/profile" ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary",
              )}>
                <Zap className="h-4 w-4 fill-current" />
              </div>
              {!collapsed && (
                <>
                  <div className="relative z-10 min-w-0 flex-1">
                    <p className="text-xs font-black">Tier {stats.tier}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ width: `${stats.tierProgress}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                  <span className={cn(
                    "relative z-10 text-[10px] font-bold",
                    location === "/profile" ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}>
                    {100 - stats.tierProgress} left
                  </span>
                </>
              )}
            </motion.div>
          </Link>
        </div>
      )}

      </div>
    </LayoutGroup>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("velocity-sidebar-width"));
    return Number.isFinite(saved) ? Math.min(288, Math.max(184, saved)) : 224;
  });
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem("velocity-sidebar-collapsed") === "true",
  );
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("velocity-sidebar-width", String(width));
  }, [width]);

  useEffect(() => {
    window.localStorage.setItem("velocity-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setResizing(true);
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      setWidth(Math.min(288, Math.max(184, startWidth + moveEvent.clientX - startX)));
    };
    const stop = () => {
      setResizing(false);
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
      <motion.aside
        data-sidebar-state={collapsed ? "collapsed" : "expanded"}
        className="relative hidden h-[100dvh] shrink-0 overflow-hidden border-r border-border/70 bg-background/92 shadow-[12px_0_32px_hsl(var(--background)/.16)] backdrop-blur-xl lg:block"
        initial={false}
        animate={{ width: collapsed ? 64 : width }}
        transition={
          reduceMotion || resizing
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 360,
                damping: 34,
                mass: 0.78,
              }
        }
      >
        <SidebarBody
          onNavigate={() => undefined}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
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
              if (event.key === "ArrowLeft") setWidth((v) => Math.max(184, v - 8));
              if (event.key === "ArrowRight") setWidth((v) => Math.min(288, v + 8));
            }}
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize transition-colors hover:bg-primary/20 focus-visible:bg-primary/25 focus-visible:outline-none"
          />
        )}
      </motion.aside>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] hidden md:block lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      stiffness: 330,
                      damping: 32,
                      mass: 0.8,
                    }
              }
              className="relative h-full w-[min(82vw,280px)] border-r border-border bg-background shadow-2xl"
            >
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
