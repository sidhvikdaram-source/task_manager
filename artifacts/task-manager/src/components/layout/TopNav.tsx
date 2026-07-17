import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Timer, LineChart, Zap, Bell, Plus, LogOut, LogIn, Palette, AlertTriangle, Users, UserRound, Library, ListChecks, Check } from 'lucide-react';
import {
  getListTasksQueryKey,
  useGetUserStats,
  useListTasks,
  type Task,
} from '@workspace/api-client-react';
import { useState, useRef, useEffect } from 'react';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { useAuth } from '@workspace/replit-auth-web';
import { themes, useTheme, type ThemeId } from '@/theme';

function daysUntil(date?: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function notificationLabel(task: Task) {
  const text = `${task.title} ${task.description ?? ''} ${task.notes ?? ''}`.toLowerCase();
  if (/\b(test|exam|quiz|midterm|final)\b/.test(text)) return 'Test coming up';
  if (/\b(deadline|due|submit|turn in)\b/.test(text)) return 'Deadline coming up';
  return 'Upcoming task';
}

export function TopNav() {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();
  const { data: tasks } = useListTasks(
    { sortBy: 'dueDate' },
    { query: { queryKey: getListTasksQueryKey({ sortBy: 'dueDate' }) } },
  );
  const { user, logout, login, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const themesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (themesRef.current && !themesRef.current.contains(e.target as Node)) {
        setThemesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const links = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/workspace', label: 'Tasks', icon: ListChecks },
    { href: '/school', label: 'Academics', icon: Library },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/focus', label: 'Focus', icon: Timer },
    { href: '/social', label: 'Community', icon: Users },
    { href: '/analytics', label: 'Progress', icon: LineChart },
  ];

  const upcomingNotifications = (tasks ?? [])
    .filter((task) => task.status !== 'completed')
    .map((task) => ({ task, days: daysUntil(task.dueDate || task.calendarDate) }))
    .filter((item): item is { task: Task; days: number } => item.days !== null && item.days >= 0 && item.days <= 2)
    .slice(0, 8);

  return (
    <>
      <header className="h-16 border-b neon-rule bg-background/78 backdrop-blur-xl flex items-center px-4 sm:px-6 gap-4 sm:gap-6 shrink-0 sticky top-0 z-40 shadow-[0_12px_40px_rgba(0,0,0,0.32)]">
        <Link href="/">
          <motion.div
            className="flex items-center gap-2.5 mr-2 cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-[#141414] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-foreground">Velocity</span>
          </motion.div>
        </Link>

        <nav className="hidden xl:flex items-center gap-0.5">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <motion.div
                  data-testid={`nav-link-${link.label.toLowerCase().replace(' ', '-')}`}
                  className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  whileTap={{ scale: 0.96 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-pill"
                      className="absolute inset-0 bg-primary rounded-xl shadow-[0_0_28px_rgba(0,213,255,0.28)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  {!isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-muted opacity-0"
                      whileHover={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                    />
                  )}
                  <link.icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{link.label}</span>
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
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
                      onClick={() => { setTheme(item.id as ThemeId); setThemesOpen(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      {item.label}
                      {item.id === theme && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={notificationsRef}>
            <motion.button
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
                    <p className="text-sm font-bold text-foreground">Notifications</p>
                    <p className="text-[11px] text-muted-foreground">Due and test reminders within 2 days.</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {upcomingNotifications.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing urgent in the next 2 days.</p>
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
                              <span className="block truncate text-sm font-semibold text-foreground">{task.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {notificationLabel(task)} {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
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
              onClick={() => setAccountOpen((o) => !o)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="w-9 h-9 rounded-xl ring-2 ring-transparent hover:ring-primary/40 transition-all overflow-hidden flex items-center justify-center bg-muted text-xs font-bold text-muted-foreground border border-border/70"
              title="Account"
            >
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{user?.firstName?.[0] ?? user?.email?.[0] ?? '?'}</span>
              )}
            </motion.button>

            <AnimatePresence>
              {accountOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.13 }}
                  className="absolute right-0 top-11 w-48 bg-popover border rounded-xl shadow-2xl z-50 py-1 overflow-hidden"
                >
                  {user && (
                    <div className="px-3 py-2 border-b">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {user.firstName ?? user.email ?? 'Account'}
                      </p>
                      {user.email && user.firstName && (
                        <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                      )}
                    </div>
                  )}
                  <Link href="/profile">
                    <button onClick={() => setAccountOpen(false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <UserRound className="w-3.5 h-3.5" />
                      Profile
                    </button>
                  </Link>
                  {isAuthenticated ? (
                    <button
                      onClick={() => { setAccountOpen(false); logout(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log out
                    </button>
                  ) : (
                    <button
                      onClick={() => { setAccountOpen(false); login(); }}
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

          <AnimatePresence>
            {stats !== undefined && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="hidden sm:flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 shadow-[0_0_24px_rgba(0,213,255,0.12)]"
              >
                {stats.multiplier > 1.0 && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 8, -8, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1 }}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  </motion.div>
                )}
                <motion.span
                  key={stats.totalVp}
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="text-sm font-bold text-primary"
                >
                  {stats.totalVp.toLocaleString()} VP
                </motion.span>
                {stats.multiplier > 1.0 && (
                  <span className="text-xs text-amber-600 font-semibold">{stats.multiplier}×</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="button-new-task-nav"
            className="flex items-center gap-1.5 bg-secondary text-secondary-foreground text-sm font-extrabold px-3 py-2 rounded-xl shadow-[0_0_26px_rgba(255,111,26,0.24)]"
            whileHover={{ scale: 1.03, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Plus className="w-4 h-4" />
            New Task
          </motion.button>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/70 bg-background/90 px-3 py-2 xl:hidden">
        {links.map((link) => {
          const active = location === link.href;
          return <Link key={link.href} href={link.href}><div className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><link.icon className="h-3.5 w-3.5" />{link.label}</div></Link>;
        })}
      </nav>

      <CreateTaskModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </>
  );
}
