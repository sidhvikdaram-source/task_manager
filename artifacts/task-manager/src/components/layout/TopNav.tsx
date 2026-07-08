import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Timer, LineChart, Zap, Bell, Plus, LogOut, LogIn } from 'lucide-react';
import { useGetUserStats } from '@workspace/api-client-react';
import { useState, useRef, useEffect } from 'react';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { useAuth } from '@workspace/replit-auth-web';

export function TopNav() {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();
  const { user, logout, login, isAuthenticated } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const links = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/focus', label: 'Focus Arena', icon: Timer },
    { href: '/analytics', label: 'Analytics', icon: LineChart },
  ];

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
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_24px_rgba(0,213,255,0.36)]">
              <Zap className="w-4 h-4 fill-primary-foreground" />
            </div>
            <span className="tech-title text-lg">Velocity</span>
          </motion.div>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <motion.div
                  data-testid={`nav-link-${link.label.toLowerCase().replace(' ', '-')}`}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
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

        <div className="flex items-center gap-3">
          <motion.button
            className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/70"
            data-testid="button-notifications"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Bell className="w-4 h-4" />
          </motion.button>

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

      <CreateTaskModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </>
  );
}
