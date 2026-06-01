import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetDashboardOverview, useListTasks, getListTasksQueryKey } from '@workspace/api-client-react';
import { TaskCard } from '@/components/TaskCard';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { Button } from '@/components/ui/button';
import { Plus, ListFilter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetDashboardOverview();
  const { data: allTasks, isLoading: tasksLoading } = useListTasks(
    { sortBy: 'priority' },
    { query: { queryKey: getListTasksQueryKey({ sortBy: 'priority' }) } }
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'vpValue' | 'dueDate'>('priority');
  const isLoading = overviewLoading || tasksLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const activeTasks = (allTasks ?? []).filter(t => t.status !== 'completed');

  const getSortedTasks = (tasks: any[]) => {
    return [...tasks].sort((a, b) => {
      if (sortBy === 'priority') {
        const p = { critical: 4, high: 3, medium: 2, low: 1 };
        return p[b.priority as keyof typeof p] - p[a.priority as keyof typeof p];
      }
      if (sortBy === 'vpValue') {
        return b.vpValue - a.vpValue;
      }
      if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    });
  };

  const criticalTasks = getSortedTasks(
    activeTasks.filter(t => t.priority === 'critical')
  );
  
  const inFlightTasks = getSortedTasks(
    activeTasks.filter(t => t.status === 'in_progress' && t.priority !== 'critical')
  );
  
  const backlogTasks = getSortedTasks(
    activeTasks.filter(t => t.status === 'todo' && t.priority !== 'critical')
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
          <p className="text-muted-foreground mt-1">Ready to build momentum today?</p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10">
                <ListFilter className="w-4 h-4 mr-2" />
                Sort: {sortBy}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('priority')}>Priority</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('vpValue')}>VP Value</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('dueDate')}>Due Date</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button onClick={() => setIsCreateModalOpen(true)} className="h-10 shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -2 }} className="p-4 bg-card rounded-xl border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Today's Tasks</div>
          <div className="text-2xl font-bold">{overview.todayTasks.length}</div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="p-4 bg-card rounded-xl border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Completed</div>
          <div className="text-2xl font-bold text-primary">{overview.completedCount}</div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="p-4 bg-card rounded-xl border border-destructive/20 shadow-sm bg-destructive/5">
          <div className="text-sm font-medium text-destructive mb-1">Critical Priority</div>
          <div className="text-2xl font-bold text-destructive">{overview.criticalCount}</div>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} className="p-4 bg-card rounded-xl border shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">In Progress</div>
          <div className="text-2xl font-bold text-amber-600">{overview.inProgressCount}</div>
        </motion.div>
      </div>

      {/* Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Critical Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <h2 className="font-semibold text-lg">Critical Quest</h2>
            <span className="text-muted-foreground text-sm ml-auto bg-muted px-2 py-0.5 rounded-full">{criticalTasks.length}</span>
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {criticalTasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TaskCard task={task} layoutId={`task-${task.id}`} />
                </motion.div>
              ))}
              {criticalTasks.length === 0 && (
                <div className="p-6 border border-dashed rounded-xl text-center text-muted-foreground text-sm">
                  No critical tasks. You're clear!
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* In Progress Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <h2 className="font-semibold text-lg">Active In-Flight</h2>
            <span className="text-muted-foreground text-sm ml-auto bg-muted px-2 py-0.5 rounded-full">{inFlightTasks.length}</span>
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {inFlightTasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TaskCard task={task} layoutId={`task-${task.id}`} />
                </motion.div>
              ))}
              {inFlightTasks.length === 0 && (
                <div className="p-6 border border-dashed rounded-xl text-center text-muted-foreground text-sm">
                  No active tasks.
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Backlog Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <h2 className="font-semibold text-lg">Backlog</h2>
            <span className="text-muted-foreground text-sm ml-auto bg-muted px-2 py-0.5 rounded-full">{backlogTasks.length}</span>
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {backlogTasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TaskCard task={task} layoutId={`task-${task.id}`} />
                </motion.div>
              ))}
              {backlogTasks.length === 0 && (
                <div className="p-6 border border-dashed rounded-xl text-center text-muted-foreground text-sm">
                  Backlog is empty.
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <CreateTaskModal 
        open={isCreateModalOpen} 
        onOpenChange={setIsCreateModalOpen} 
      />
    </div>
  );
}
