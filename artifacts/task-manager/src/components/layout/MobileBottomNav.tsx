import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  CalendarDays,
  Check,
  Ellipsis,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Palette,
  Settings2,
  Timer,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useExperience } from "@/experience";
import { themes, useTheme, type ThemeId } from "@/theme";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/", label: "Today", icon: ListChecks },
  { href: "/school", label: "Academics", icon: GraduationCap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/focus", label: "Focus", icon: Timer },
] as const;

const moreLinks = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/social", label: "Social", icon: Users },
  { href: "/analytics", label: "Insights", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function MobileBottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { preferences, updatePreferences } = useExperience();
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <>
      <nav
        aria-label="Phone navigation"
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <LayoutGroup id="velocity-mobile-navigation">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 px-2">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <button
                  type="button"
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-16 w-full items-center justify-center text-muted-foreground transition-colors",
                    active && "text-primary",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-nav-active"
                      className="absolute top-1 h-1 w-7 rounded-full bg-primary"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38, mass: 0.65 }}
                    />
                  )}
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                  <span className="sr-only">{item.label}</span>
                </button>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More navigation"
            aria-expanded={moreOpen}
            className={cn(
              "relative flex h-16 items-center justify-center text-muted-foreground",
              moreOpen && "text-primary",
            )}
          >
            <Ellipsis className="h-5 w-5" />
          </button>
        </div>
        </LayoutGroup>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-[80] md:hidden">
            <motion.button
              type="button"
              aria-label="Close more menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            />
            <motion.section
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 330, damping: 32 }}
              className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-2xl border-t bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black">More</h2>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close more menu"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {moreLinks.map((item) => {
                  const Icon = item.icon;
                  const locked =
                    item.href !== "/profile" && item.href !== "/settings" &&
                    !preferences.advancedFeaturesEnabled;
                  if (item.href === "/social" && !preferences.socialEnabled) {
                    return <Link key={item.href} href="/settings"><button type="button" onClick={() => setMoreOpen(false)} className="flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"><Users className="h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-bold">Social</span><span className="block text-[10px] text-muted-foreground">Turn on in Settings</span></span></button></Link>;
                  }
                  return locked ? (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() =>
                        void updatePreferences({
                          advancedFeaturesEnabled: true,
                        })
                      }
                      className="flex min-h-14 items-center gap-3 rounded-lg border p-3 text-left text-muted-foreground"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-bold">{item.label}</span>
                    </button>
                  ) : (
                    <Link key={item.href} href={item.href}>
                      <button
                        type="button"
                        onClick={() => setMoreOpen(false)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">{item.label}</span>
                      </button>
                    </Link>
                  );
                })}
              </div>

              {!preferences.advancedFeaturesEnabled && (
                <button
                  type="button"
                  onClick={() =>
                    void updatePreferences({ advancedFeaturesEnabled: true })
                  }
                  className="mt-3 flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary/8 p-3 text-left"
                >
                  <Settings2 className="h-4 w-4 text-primary" />
                  <span>
                    <span className="block text-sm font-black">
                      Enable advanced workspace
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Unlock Projects, Social, and Insights.
                    </span>
                  </span>
                </button>
              )}

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-muted-foreground">
                  <Palette className="h-3.5 w-3.5" /> Theme
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {themes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTheme(item.id as ThemeId)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold",
                        theme === item.id &&
                          "border-primary bg-primary/10 text-primary",
                      )}
                    >
                      {theme === item.id && <Check className="h-3 w-3" />}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
