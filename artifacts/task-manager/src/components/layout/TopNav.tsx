import React, { lazy, Suspense } from "react";
import { Link } from "wouter";
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
  const { data: stats } = useGetUserStats();
  const { data: tasks } = useListTasks(
    { sortBy: "dueDate" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } },
  );
  const { user, logout, login, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const { preferences, updatePreferences } = useExperience();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
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

  return (
    <>
      <header className="neon-rule sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/78 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:px-4 lg:justify-end">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={onOpenSidebar}
            data-tour="mobile-navigation"
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link href="/">
            <div className="flex cursor-pointer items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-[0.78rem] bg-[#141414] text-white">
                <Zap className="h-4 w-4 fill-white text-white" />
              </div>
              <span className="text-lg font-black tracking-tight text-foreground">
                Velocity
              </span>
            </div>
          </Link>
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
              onClick={() => setAccountOpen((o) => !o)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="w-9 h-9 rounded-xl ring-2 ring-transparent hover:ring-primary/40 transition-all overflow-hidden flex items-center justify-center bg-muted text-xs font-bold text-muted-foreground border border-border/70"
              title="Account"
            >
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  width="36"
                  height="36"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{user?.firstName?.[0] ?? user?.email?.[0] ?? "?"}</span>
              )}
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
                      {stats && (
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-bold text-primary">
                          <span>Tier {stats.tier}</span>
                          <span>{stats.tierProgress}/100 VP</span>
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
                          Schedule and planning tools
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
                      <Link href="/social">
                        <button
                          onClick={() => setAccountOpen(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Users className="h-3.5 w-3.5" /> Social
                        </button>
                      </Link>
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
