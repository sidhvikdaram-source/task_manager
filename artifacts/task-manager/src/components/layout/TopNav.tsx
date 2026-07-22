import React, { lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Zap,
  Bell,
  Plus,
  LogOut,
  LogIn,
  Palette,
  AlertTriangle,
  Users,
  UserRound,
  Check,
  FolderKanban,
  Settings2,
  Menu,
  Gift,
} from "lucide-react";
import {
  getListTasksQueryKey,
  useGetUserStats,
  useListTasks,
  type Task,
} from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { themes, useTheme, type ThemeId } from "@/theme";
import { useExperience } from "@/experience";
import { useQuery } from "@tanstack/react-query";
import { ProfilePhoto } from "@/components/ProfileCosmetics";
import type { RewardsResponse } from "@/pages/Profile";
import { toast } from "sonner";

const CreateTaskModal = lazy(() =>
  import("@/components/CreateTaskModal").then((module) => ({
    default: module.CreateTaskModal,
  })),
);

function daysUntil(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function notificationLabel(task: Task) {
  const text =
    `${task.title} ${task.description ?? ""} ${task.notes ?? ""}`.toLowerCase();
  if (/\b(test|exam|quiz|midterm|final)\b/.test(text)) return "Test coming up";
  if (/\b(deadline|due|submit|turn in)\b/.test(text))
    return "Deadline coming up";
  return "Upcoming task";
}

export function TopNav({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();
  const { data: tasks } = useListTasks(
    { sortBy: "dueDate" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } },
  );
  const { user, logout, login, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = useExperience();
  const { data: rewards } = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const response = await fetch("/api/rewards", { credentials: "include" });
      if (!response.ok) return null;
      return response.json() as Promise<RewardsResponse>;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const equippedTitle = rewards?.items.find((item) => item.id === rewards.equipped.title)?.name;
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const themesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(e.target as Node)
      ) {
        setAccountOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (themesRef.current && !themesRef.current.contains(e.target as Node)) {
        setThemesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (rewards?.newlyUnlockedTitles.length) {
      toast.success(`Title unlocked: ${rewards.newlyUnlockedTitles[0]}`, {
        description: rewards.achievementBpAwarded
          ? `Equip it from your profile. +${rewards.achievementBpAwarded} BP earned.`
          : "Equip it from your profile.",
      });
    }
  }, [rewards?.newlyUnlockedTitles]);

  const upcomingNotifications = (tasks ?? [])
    .filter((task) => task.status !== "completed")
    .map((task) => ({
      task,
      days: daysUntil(task.dueDate || task.calendarDate),
    }))
    .filter(
      (item): item is { task: Task; days: number } =>
        item.days !== null && item.days >= 0 && item.days <= 2,
    )
    .slice(0, 8);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const pageTitles: Record<string, string> = { "/calendar": "Calendar", "/school": "Academics", "/projects": "Projects", "/focus": "Focus", "/analytics": "Insights", "/social": "Social", "/profile": "Profile", "/settings": "Settings", "/review": "Weekly review", "/workspace": "Workspace" };

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/92 px-3 py-2.5 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            data-tour="mobile-navigation"
            aria-label="Open navigation"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground md:flex lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link href="/" className="lg:hidden">
            <div className="flex cursor-pointer items-center gap-2.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#141414] text-white shadow-sm">
                <Zap className="h-5 w-5 fill-white text-white" />
              </div>
              <span className="hidden text-lg font-black tracking-tight text-foreground sm:inline">
                Velocity
              </span>
            </div>
          </Link>
          {location === "/" ? (
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-lg font-black leading-tight">{greeting}, {user?.firstName || user?.email?.split("@")[0] || "there"}.</p>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{stats?.streakDays ?? 0} Momentum days</span>
                <span aria-hidden="true">/</span>
                <span>Tier {stats?.tier ?? 1}, {stats?.tierProgress ?? 0}/100 VP</span>
              </p>
            </div>
          ) : (
            <h1 className="truncate text-base font-black sm:text-lg">{pageTitles[location] ?? "Velocity"}</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative hidden lg:block" ref={themesRef}>
            <motion.button
              type="button"
              aria-label="Choose theme"
              title="Theme"
              onClick={() => setThemesOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              whileTap={{ scale: 0.92 }}
            >
              <Palette className="h-4 w-4" />
            </motion.button>
            <AnimatePresence>
              {themesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.13 }}
                  className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border bg-popover p-1 shadow-2xl"
                >
                  {themes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTheme(item.id as ThemeId);
                        setThemesOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      {item.label}
                      {item.id === theme && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link href="/profile">
            <motion.button
              type="button"
              aria-label={`${rewards?.unopenedChestCount ?? 0} unopened reward chests`}
              title="Reward chests"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              whileTap={{ scale: 0.92 }}
            >
              <Gift className="h-4 w-4" />
              {(rewards?.unopenedChestCount ?? 0) > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-black text-secondary-foreground">{rewards?.unopenedChestCount}</span>}
            </motion.button>
          </Link>

          <div className="relative" ref={notificationsRef}>
            <motion.button
              type="button"
              aria-label="Open notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/70"
              data-testid="button-notifications"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <Bell className="w-4 h-4" />
              {upcomingNotifications.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-black text-secondary-foreground">
                  {upcomingNotifications.length}
                </span>
              )}
            </motion.button>

            <AnimatePresence>
              {notificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.13 }}
                  className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border bg-popover shadow-2xl"
                >
                  <div className="border-b px-3 py-2">
                    <p className="text-sm font-bold text-foreground">
                      Notifications
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Due and test reminders within 2 days.
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {upcomingNotifications.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        Nothing urgent in the next 2 days.
                      </p>
                    ) : (
                      upcomingNotifications.map(({ task, days }) => (
                        <Link key={task.id} href="/calendar">
                          <button
                            type="button"
                            onClick={() => setNotificationsOpen(false)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {task.title}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {notificationLabel(task)}{" "}
                                {days === 0
                                  ? "today"
                                  : days === 1
                                    ? "tomorrow"
                                    : `in ${days} days`}
                              </span>
                            </span>
                          </button>
                        </Link>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Account menu */}
          <div className="relative" ref={accountRef}>
            <motion.button
              type="button"
              aria-label="Open account menu"
              data-tour="settings-access"
              onClick={() => setAccountOpen((o) => !o)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="h-9 w-9 rounded-full ring-2 ring-transparent transition-all hover:ring-primary/40"
              title="Account"
            >
              <ProfilePhoto
                frameId={rewards?.equipped.frame}
                profileImageUrl={rewards?.profileImageUrl ?? user?.profileImageUrl}
                name={user?.firstName ?? user?.email ?? "Account"}
                className="w-9"
              />
            </motion.button>

            <AnimatePresence>
              {accountOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.13 }}
                  className="absolute right-0 top-11 w-64 bg-popover border rounded-xl shadow-2xl z-50 py-1 overflow-hidden"
                >
                  {user && (
                    <div className="px-3 py-2 border-b">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {user.firstName ?? user.email ?? "Account"}
                      </p>
                      {user.email && user.firstName && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                      {equippedTitle && <p className="mt-1 truncate text-[10px] font-black uppercase text-primary">{equippedTitle}</p>}
                      {stats && (
                        <div className="mt-2 rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-bold text-primary">
                          <div className="flex items-center justify-between"><span>Tier {stats.tier}</span><span>{100 - stats.tierProgress} VP to next</span></div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${stats.tierProgress}%` }} /></div>
                        </div>
                      )}
                    </div>
                  )}
                  <Link href="/profile">
                    <button
                      onClick={() => setAccountOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <UserRound className="w-3.5 h-3.5" />
                      Profile
                    </button>
                  </Link>
                  <Link href="/settings">
                    <button
                      onClick={() => setAccountOpen(false)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Settings
                    </button>
                  </Link>
                  <div className="border-t px-2 py-2">
                    <button
                      type="button"
                      aria-pressed={preferences.advancedFeaturesEnabled}
                      onClick={() =>
                        void updatePreferences({
                          advancedFeaturesEnabled:
                            !preferences.advancedFeaturesEnabled,
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                    >
                      <Settings2 className="h-3.5 w-3.5 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          Advanced workspace
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Calendar and planning tools
                        </span>
                      </span>
                      <span
                        className={`h-5 w-9 rounded-full p-0.5 transition-colors ${preferences.advancedFeaturesEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                        aria-hidden="true"
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white transition-transform ${preferences.advancedFeaturesEnabled ? "translate-x-4" : ""}`}
                        />
                      </span>
                    </button>
                    {!preferences.advancedFeaturesEnabled && (
                      <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                        Optional now. Recommended from Tier 2.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        void updatePreferences({ tutorialCompleted: false });
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Check className="h-3.5 w-3.5" /> Replay tutorial
                    </button>
                  </div>
                  {preferences.advancedFeaturesEnabled && (
                    <div className="border-t py-1">
                      <Link href="/projects">
                        <button
                          onClick={() => setAccountOpen(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <FolderKanban className="h-3.5 w-3.5" /> Projects
                        </button>
                      </Link>
                      <Link href="/analytics">
                        <button
                          onClick={() => setAccountOpen(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <LineChart className="h-3.5 w-3.5" /> Insights
                        </button>
                      </Link>
                      {preferences.socialEnabled && <Link href="/social">
                        <button
                          onClick={() => setAccountOpen(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Users className="h-3.5 w-3.5" /> Social
                        </button>
                      </Link>}
                    </div>
                  )}
                  {isAuthenticated ? (
                    <button
                      onClick={() => {
                        setAccountOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log out
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setAccountOpen(false);
                        login();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Log in
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="button-new-task-nav"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-[0_0_26px_rgba(255,111,26,0.24)]"
            aria-label="Create task"
            title="Create task"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      </header>

      {isCreateModalOpen && (
        <Suspense fallback={null}>
          <CreateTaskModal open onOpenChange={setIsCreateModalOpen} />
        </Suspense>
      )}
    </>
  );
}
