import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Timer, LineChart, Target, Zap, Bell, Plus } from 'lucide-react';
import { useGetUserStats } from '@workspace/api-client-react';
import { useState } from 'react';
import { CreateTaskModal } from '@/components/CreateTaskModal';

export function TopNav() {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const links = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/focus', label: 'Focus Arena', icon: Timer },
    { href: '/analytics', label: 'Analytics', icon: LineChart },
  ];

  return (
    <>
      <header className="h-14 border-b bg-card/80 backdrop-blur-sm flex items-center px-6 gap-6 shrink-0 sticky top-0 z-40">
        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2.5 mr-2 cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Target className="w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">Velocity</span>
          </div>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 flex-1">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div
                  data-testid={`nav-link-${link.label.toLowerCase().replace(' ', '-')}`}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* VP Display */}
          {stats !== undefined && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-primary/8 border border-primary/20 rounded-lg px-3 py-1.5"
            >
              {stats.multiplier > 1.0 && (
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                </motion.div>
              )}
              <span className="text-sm font-bold text-primary">{stats.totalVp.toLocaleString()} VP</span>
              {stats.multiplier > 1.0 && (
                <span className="text-xs text-amber-600 font-semibold">{stats.multiplier}×</span>
              )}
            </motion.div>
          )}

          <button
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="button-new-task-nav"
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </header>

      <CreateTaskModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </>
  );
}
