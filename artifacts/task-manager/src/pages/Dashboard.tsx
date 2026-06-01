import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useGetDashboardOverview,
  useListTasks,
  useCompleteTask,
  useUpdateTask,
  getListTasksQueryKey,
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { IntroAnimation } from '@/components/IntroAnimation';
import { DailyChecklist } from '@/components/DailyChecklist';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Zap, Flame, Target, ChevronRight, CheckCircle2, Circle,
  Clock, Trophy, ArrowRight, BarChart3,
} from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-rose-600 bg-rose-50 border-rose-200',
  high: 'text-amber-600 bg-amber-50 border-amber-200',
  medium: 'text-zinc-600 bg-zinc-50 border-zinc-200',
  low: 'text-slate-500 bg-slate-50 border-slate-200',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  medium: 'bg-zinc-400',
  low: 'bg-slate-400',
};

function getHourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function useCountUp(target: number, duration = 900, start = true) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    if (target === 0) { setDisplay(0); return; }
    const startTime = performance.now();
    const startVal = 0;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, start]);

  return display;
}

interface TaskRowProps {
  task: any;
  onComplete: (id: number) => void;
  completing: boolean;
  onClick: (task: any) => void;
  delay?: number;
}

function TaskRow({ task, onComplete, completing, onClick, delay = 0 }: TaskRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -14, filter: 'blur(2px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: 12, scale: 0.97 }}
      transition={{ delay, duration: 0.28, ease: 'easeOut' }}
      whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.45)', x: 1 }}
      className="flex items-center gap-4 py-3.5 px-4 rounded-xl transition-colors group cursor-pointer"
      onClick={() => onClick(task)}
      data-testid={`task-row-${task.id}`}
    >
      <motion.button
        onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
        disabled={completing}
        data-testid={`button-complete-task-${task.id}`}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.88 }}
      >
        {completing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
          />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </motion.button>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground truncate">{task.title}</div>
        {task.dueDate && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${PRIORITY_COLORS[task.priority] ?? 'text-zinc-600 bg-zinc-50 border-zinc-200'}`}>
          {task.priority}
        </span>
        <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
          <Zap className="w-3 h-3 fill-primary" />
          +{task.vpValue} VP
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}

function AnimatedProgressBar({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  return <Progress value={displayed} className="h-2" style={{ transition: 'all 1.1s cubic-bezier(0.34,1.56,0.64,1)' }} />;
}

function fadeIn(delay: number) {
  return {
    initial: { opacity: 0, y: 18, filter: 'blur(3px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { delay, duration: 0.38, ease: 'easeOut' as const },
  };
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: overview, isLoading: overviewLoading } = useGetDashboardOverview();
  const { data: allTasks, isLoading: tasksLoading } = useListTasks(
    { sortBy: 'priority' },
    { query: { queryKey: getListTasksQueryKey({ sortBy: 'priority' }) } }
  );
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [introDone, setIntroDone] = useState(() => {
    try { return sessionStorage.getItem('velocity-intro-seen') === '1'; } catch { return true; }
  });

  const isLoading = overviewLoading || tasksLoading;

  const handleIntroDone = () => {
    try { sessionStorage.setItem('velocity-intro-seen', '1'); } catch {}
    setIntroDone(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListTasksQueryKey({ sortBy: 'priority' }) });
    qc.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
  };

  const handleComplete = (id: number) => {
    setCompletingId(id);
    completeTask.mutate({ id }, {
      onSuccess: (result) => {
        invalidate();
        if (result.tierUp) {
          toast.success(`Tier ${result.newTier} unlocked!`, {
            description: `+${result.vpAwarded} VP earned. You've advanced to the next tier.`,
          });
        } else {
          toast.success(`+${result.vpAwarded} VP earned`, {
            description: result.multiplier > 1 ? `${result.multiplier}× multiplier applied` : 'Task complete',
          });
        }
      },
      onSettled: () => setCompletingId(null),
    });
  };

  if (isLoading) {
    return (
      <>
        {!introDone && <IntroAnimation onComplete={handleIntroDone} />}
        <div className="space-y-6">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-3">
              <Skeleton className="h-6 w-32" />
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </>
    );
  }

  if (!overview) return null;

  const stats = overview.userStats;
  const activeTasks = (allTasks ?? []).filter(t => t.status !== 'completed');
  const criticalTasks = activeTasks.filter(t => t.priority === 'critical');
  const inFlightTasks = activeTasks.filter(t => t.status === 'in_progress' && t.priority !== 'critical');
  const backlogTasks = activeTasks.filter(t => t.status === 'todo' && t.priority !== 'critical');

  const totalActive = activeTasks.length;
  const vpToNextTier = 100 - stats.tierProgress;

  const statCards = [
    {
      label: 'Daily VP',
      rawValue: stats.totalVp,
      icon: <Zap className="w-4 h-4 text-primary" />,
      color: 'text-primary',
      countUp: true,
    },
    {
      label: 'Streak',
      rawValue: stats.streakDays,
      displayValue: `${stats.streakDays} Day${stats.streakDays !== 1 ? 's' : ''}`,
      icon: <Flame className="w-4 h-4 text-amber-500" />,
      color: 'text-amber-600',
    },
    {
      label: 'Active Quests',
      rawValue: totalActive,
      displayValue: `${totalActive > 0 ? 1 : 0}/${totalActive}`,
      icon: <Target className="w-4 h-4 text-foreground" />,
      color: 'text-foreground',
    },
    {
      label: 'Focus Multiplier',
      rawValue: stats.multiplier,
      displayValue: `${stats.multiplier}×`,
      icon: <BarChart3 className="w-4 h-4 text-foreground" />,
      color: 'text-foreground',
    },
  ];

  return (
    <>
      {!introDone && <IntroAnimation onComplete={handleIntroDone} />}

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="dashboard-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-7"
          >
            {/* Greeting */}
            <motion.div
              {...fadeIn(0.05)}
              
              initial="hidden"
              animate="visible"
              className="flex items-start justify-between"
            >
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {getHourGreeting()}.
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {stats.totalVp === 0
                    ? "Start completing tasks to build your velocity."
                    : `You're ${vpToNextTier} VP away from reaching Tier ${stats.tier + 1}. Let's crush it.`}
                </p>
              </div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  size="sm"
                  className="h-9 shadow-sm"
                  data-testid="button-start-focus"
                >
                  <Target className="w-4 h-4 mr-1.5" />
                  Start Focus Session
                </Button>
              </motion.div>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} ready={introDone} />
              ))}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Task columns */}
              <div className="lg:col-span-2 space-y-6">

                {/* Critical Quests */}
                <motion.div
                  {...fadeIn(0.22)}
                  
                  initial="hidden"
                  animate="visible"
                  className="bg-card border rounded-xl shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2 h-2 rounded-full bg-rose-500"
                        animate={{ scale: criticalTasks.length > 0 ? [1, 1.3, 1] : 1 }}
                        transition={{ duration: 1.5, repeat: criticalTasks.length > 0 ? Infinity : 0, repeatDelay: 2 }}
                      />
                      <span className="font-semibold text-sm">Critical Quests</span>
                      {criticalTasks.length > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                          className="text-xs bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-md"
                        >
                          {criticalTasks.length}
                        </motion.span>
                      )}
                    </div>
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                      data-testid="button-view-all-critical"
                    >
                      View All <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="divide-y divide-border/50">
                    <AnimatePresence>
                      {criticalTasks.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="py-8 text-center text-muted-foreground text-sm"
                        >
                          No critical tasks — you're ahead of the curve.
                        </motion.div>
                      ) : (
                        criticalTasks.map((task, i) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onComplete={handleComplete}
                            completing={completingId === task.id}
                            onClick={setSelectedTask}
                            delay={i * 0.05}
                          />
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>

                {/* Active In-Flight */}
                <motion.div
                  {...fadeIn(0.30)}
                  
                  initial="hidden"
                  animate="visible"
                  className="bg-card border rounded-xl shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="font-semibold text-sm">Active In-Flight</span>
                      {inFlightTasks.length > 0 && (
                        <span className="text-xs bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-md">
                          {inFlightTasks.length} Task{inFlightTasks.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-border/50">
                    <AnimatePresence>
                      {inFlightTasks.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="py-8 text-center text-muted-foreground text-sm"
                        >
                          No in-progress tasks. Move something from the backlog.
                        </motion.div>
                      ) : (
                        inFlightTasks.map((task, i) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onComplete={handleComplete}
                            completing={completingId === task.id}
                            onClick={setSelectedTask}
                            delay={i * 0.05}
                          />
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>

                {/* Backlog */}
                <AnimatePresence>
                  {backlogTasks.length > 0 && (
                    <motion.div
                      {...fadeIn(0.38)}
                      
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, y: 8 }}
                      className="bg-card border rounded-xl shadow-sm overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          <span className="font-semibold text-sm">Backlog</span>
                          <span className="text-xs bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-md">
                            {backlogTasks.length}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-border/50">
                        <AnimatePresence>
                          {backlogTasks.map((task, i) => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              onComplete={handleComplete}
                              completing={completingId === task.id}
                              onClick={(t) => {
                                updateTask.mutate({ id: t.id, data: { status: 'in_progress' } }, { onSuccess: invalidate });
                              }}
                              delay={i * 0.04}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {totalActive === 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 24 }}
                    className="text-center py-16 bg-card border border-dashed rounded-xl"
                  >
                    <motion.div
                      animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.05, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <CheckCircle2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    </motion.div>
                    <p className="font-semibold text-foreground">All clear</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">No active tasks — create one to start earning VP</p>
                    <Button size="sm" onClick={() => setIsCreateModalOpen(true)} data-testid="button-create-first-task">
                      Create your first task
                    </Button>
                  </motion.div>
                )}

                {/* Daily Habits */}
                <DailyChecklist />
              </div>

              {/* Right Panel */}
              <div className="space-y-4">
                {/* Tier Progression */}
                <motion.div
                  {...fadeIn(0.18)}
                  
                  initial="hidden"
                  animate="visible"
                  className="bg-card border rounded-xl shadow-sm p-5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Tier {stats.tier} Progression
                    </span>
                    <motion.div
                      animate={{ rotate: [0, -12, 12, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
                    >
                      <Trophy className="w-4 h-4 text-amber-500" />
                    </motion.div>
                  </div>

                  <div className="mt-3 mb-4">
                    <div className="text-xl font-bold text-foreground">
                      {stats.totalVp === 0 ? 'Begin your journey' : stats.tier === 1 && stats.tierProgress < 25 ? 'Rising Operator' : 'Building Momentum'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Earn {vpToNextTier} VP to unlock Tier {stats.tier + 1}
                    </div>
                  </div>

                  <div className="flex gap-1.5 mb-3">
                    {[1, 2, 3, 4, 5].map((t, idx) => (
                      <motion.div
                        key={t}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 + idx * 0.07, type: 'spring', stiffness: 400, damping: 20 }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                          t < stats.tier
                            ? 'bg-primary border-primary text-white'
                            : t === stats.tier
                            ? 'bg-primary/15 border-primary text-primary'
                            : 'bg-muted border-border text-muted-foreground'
                        }`}
                      >
                        {t}
                      </motion.div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <AnimatedProgressBar value={stats.tierProgress} />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{stats.tierProgress} / 100 VP</span>
                      <span>{stats.tierProgress}%</span>
                    </div>
                  </div>
                </motion.div>

                {/* Recent Achievements */}
                <motion.div
                  {...fadeIn(0.26)}
                  
                  initial="hidden"
                  animate="visible"
                  className="bg-card border rounded-xl shadow-sm p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Achievements</span>
                  </div>

                  {overview.completedCount === 0 ? (
                    <div className="text-center py-4">
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        className="w-8 h-8 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center"
                      >
                        <Trophy className="w-4 h-4 text-muted-foreground/50" />
                      </motion.div>
                      <p className="text-xs text-muted-foreground">Complete tasks to earn achievements</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {overview.completedCount >= 1 && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 }}
                          className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg border"
                        >
                          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                            <Zap className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">First Completion</div>
                            <div className="text-[10px] text-muted-foreground">{overview.completedCount} task{overview.completedCount !== 1 ? 's' : ''} done</div>
                          </div>
                        </motion.div>
                      )}
                      {stats.streakDays >= 2 && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 }}
                          className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg border"
                        >
                          <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                            <Flame className="w-3.5 h-3.5 text-rose-600" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">On a Streak</div>
                            <div className="text-[10px] text-muted-foreground">{stats.streakDays} consecutive days</div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.div>

                {/* Quick Stats */}
                <motion.div
                  {...fadeIn(0.34)}
                  
                  initial="hidden"
                  animate="visible"
                  className="bg-card border rounded-xl shadow-sm p-5"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Overview</span>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { label: 'Tasks Completed', value: overview.completedCount },
                      { label: 'In Progress', value: overview.inProgressCount },
                      { label: 'Backlog', value: overview.todoCount },
                      { label: 'Total VP Earned', value: `${stats.totalVp} VP` },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + i * 0.06 }}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="text-muted-foreground">{item.label}</span>
                        <motion.span
                          key={String(item.value)}
                          initial={{ scale: 1.2, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                          className="font-semibold"
                        >
                          {item.value}
                        </motion.span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>

            <CreateTaskModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} onSuccess={invalidate} />
            {selectedTask && (
              <TaskDetailsModal
                taskId={selectedTask.id}
                open={!!selectedTask}
                onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface StatCardProps {
  stat: {
    label: string;
    rawValue: number;
    displayValue?: string;
    icon: React.ReactNode;
    color: string;
    countUp?: boolean;
  };
  index: number;
  ready: boolean;
}

function StatCard({ stat, index, ready }: StatCardProps) {
  const counted = useCountUp(stat.rawValue, 900, ready && !!stat.countUp);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{
        delay: 0.06 + index * 0.08,
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      whileTap={{ scale: 0.97 }}
      className="bg-card border rounded-xl p-4 shadow-sm cursor-default"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        {stat.icon}
        {stat.label}
      </div>
      <div className={`text-2xl font-bold ${stat.color}`}>
        {stat.countUp ? counted.toLocaleString() : (stat.displayValue ?? stat.rawValue)}
      </div>
    </motion.div>
  );
}
