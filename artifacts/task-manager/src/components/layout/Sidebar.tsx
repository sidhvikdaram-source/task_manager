import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Timer, LineChart, Target, FolderOpen, Plus, LogOut, ChevronDown, Folder, BookOpen, X } from 'lucide-react';
import { useGetUserStats, useListProjects, useCreateProject } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@workspace/replit-auth-web';

const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { data: stats } = useGetUserStats();
  const { data: projects } = useListProjects();
  const createProject = useCreateProject();
  const qc = useQueryClient();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [newProjectType, setNewProjectType] = useState<'project' | 'class'>('project');

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/focus', label: 'Focus Arena', icon: Timer },
    { href: '/analytics', label: 'Analytics', icon: LineChart },
  ];

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    createProject.mutate(
      { data: { name: newProjectName.trim(), color: newProjectColor, type: newProjectType } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['listProjects'] });
          setNewProjectName('');
          setShowNewProject(false);
        },
      }
    );
  };

  return (
    <div className="w-64 border-r bg-sidebar flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Target className="w-5 h-5" />
        </div>
        <span className="font-bold text-xl tracking-tight text-sidebar-foreground">Velocity</span>
      </div>

      <div className="px-4 pb-6 border-b border-sidebar-border">
        {stats && (
          <div className="bg-card rounded-xl p-4 shadow-sm border relative overflow-hidden">
            {stats.multiplier > 1.0 && (
              <div className="absolute inset-0 bg-secondary/10 opacity-50 pointer-events-none" />
            )}
            <div className="flex items-center gap-3 mb-3 relative z-10">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold">
                  {stats.tier}
                </div>
                {stats.multiplier > 1.0 && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-1 border-2 border-secondary border-dashed rounded-full pointer-events-none"
                  />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold">Tier {stats.tier}</div>
                <div className="text-xs text-muted-foreground">{stats.totalVp} VP</div>
              </div>
              {stats.multiplier > 1.0 && (
                <div className="ml-auto bg-secondary/20 text-secondary-foreground text-xs font-bold px-2 py-1 rounded-md">
                  {stats.multiplier}x VP
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative z-10">
              <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                <span>Progress to Tier {stats.tier + 1}</span>
                <span>{stats.tierProgress}%</span>
              </div>
              <Progress value={stats.tierProgress} className="h-1.5" />
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}>
                <link.icon className="w-5 h-5" />
                {link.label}
              </div>
            </Link>
          );
        })}

        <div className="pt-4">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Projects</span>
            </div>
            <button
              onClick={() => setShowNewProject(!showNewProject)}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-accent-foreground transition-colors"
            >
              {showNewProject ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>

          <AnimatePresence>
            {showNewProject && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <form onSubmit={handleCreateProject} className="px-3 py-2 space-y-2">
                  <Input
                    placeholder="Project name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewProjectColor(c)}
                        className={`w-4 h-4 rounded-full transition-transform ${newProjectColor === c ? 'scale-125 ring-2 ring-offset-1 ring-muted-foreground' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewProjectType('project')}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${newProjectType === 'project' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      Project
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewProjectType('class')}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${newProjectType === 'class' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      Class
                    </button>
                  </div>
                  <Button type="submit" size="sm" className="w-full h-7 text-xs" disabled={!newProjectName.trim() || createProject.isPending}>
                    Create
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5 mt-1">
            {projects?.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color ?? '#6366f1' }} />
                <span className="text-sm truncate flex-1">{project.name}</span>
                {project.type === 'class' && <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />}
                {(project.taskCount ?? 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium">{project.taskCount}</span>
                )}
              </div>
            ))}
            {projects?.length === 0 && !showNewProject && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No projects yet</p>
            )}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        {user && (
          <div className="flex items-center gap-2 mb-3 px-1">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {user.firstName?.[0] ?? user.email?.[0] ?? '?'}
              </div>
            )}
            <span className="text-xs text-sidebar-foreground truncate flex-1">
              {user.firstName ?? user.email ?? 'Account'}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
