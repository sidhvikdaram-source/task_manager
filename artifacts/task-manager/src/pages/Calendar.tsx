import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Flame, Plus, Target, Zap } from 'lucide-react';
import { getListTasksQueryKey, Task, useListTasks } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function taskDate(task: Task) {
  return task.calendarDate || task.dueDate || task.startDate || null;
}

function matchesDate(task: Task, day: Date) {
  const value = taskDate(task);
  if (!value) return false;
  return value.startsWith(format(day, 'yyyy-MM-dd'));
}

function priorityStyle(priority: Task['priority']) {
  if (priority === 'critical') return 'border-destructive/60 bg-destructive/15 text-destructive';
  if (priority === 'high') return 'border-secondary/70 bg-secondary/15 text-secondary';
  if (priority === 'medium') return 'border-primary/55 bg-primary/12 text-primary';
  return 'border-white/15 bg-white/8 text-muted-foreground';
}

function urgencyClass(tasks: Task[]) {
  if (tasks.some((task) => task.priority === 'critical')) return 'bento-card-hot';
  if (tasks.some((task) => task.dueDate && differenceInCalendarDays(parseISO(task.dueDate), new Date()) <= 2)) {
    return 'border-secondary/55 shadow-[0_0_24px_rgba(255,111,26,0.12)]';
  }
  if (tasks.length > 0) return 'border-primary/35 shadow-[0_0_22px_rgba(0,213,255,0.1)]';
  return '';
}

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const { data: tasks = [], isLoading } = useListTasks(
    { sortBy: 'dueDate' },
    { query: { queryKey: getListTasksQueryKey({ sortBy: 'dueDate' }), refetchOnMount: 'always' } },
  );

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(endOfMonth(monthStart)),
    });
  }, [currentMonth]);

  const activeTasks = tasks.filter((task) => task.status !== 'completed');
  const selectedTasks = activeTasks.filter((task) => matchesDate(task, selectedDate));
  const monthTasks = activeTasks.filter((task) => {
    const value = taskDate(task);
    return value ? isSameMonth(parseISO(value), currentMonth) : false;
  });

  const openCreate = (date: Date) => {
    setSelectedDate(date);
    setCreateDate(format(date, 'yyyy-MM-dd'));
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[640px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="bento-card p-5 sm:p-6 overflow-hidden relative">
        <div className="absolute right-8 top-0 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 relative">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-black uppercase">
              <Zap className="h-3.5 w-3.5 fill-primary" />
              Temporal Command
            </div>
            <h1 className="tech-title mt-2 text-3xl sm:text-5xl text-foreground">Calendar</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Scheduled tasks, due dates, and focus windows in one bento control surface.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-44 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-center">
              <div className="tech-title text-sm text-primary">{format(currentMonth, 'MMMM')}</div>
              <div className="text-xs text-muted-foreground">{format(currentMonth, 'yyyy')}</div>
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button onClick={() => openCreate(selectedDate)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <section className="bento-card overflow-hidden">
          <div className="grid grid-cols-7 border-b neon-rule bg-white/[0.03]">
            {weekDays.map((day) => (
              <div key={day} className="px-2 py-3 text-center text-[11px] font-black uppercase text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const dayTasks = activeTasks.filter((task) => matchesDate(task, day));
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const selected = isSameDay(day, selectedDate);

              return (
                <motion.div
                  key={day.toISOString()}
                  role="button"
                  tabIndex={0}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.008 }}
                  onClick={() => setSelectedDate(day)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedDate(day);
                    }
                  }}
                  onDoubleClick={() => openCreate(day)}
                  className={cn(
                    'group min-h-[118px] border-r border-b border-border/70 p-2 text-left transition-all hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    !isCurrentMonth && 'bg-black/20 text-muted-foreground/55',
                    selected && 'bg-primary/10',
                    urgencyClass(dayTasks),
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black',
                        isToday(day) && 'bg-primary text-primary-foreground shadow-[0_0_18px_rgba(0,213,255,0.35)]',
                        selected && !isToday(day) && 'border border-primary/40 text-primary',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-secondary-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <span
                        key={task.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedTaskId(task.id);
                        }}
                        className={cn(
                          'block truncate rounded-lg border px-2 py-1 text-[11px] font-bold',
                          priorityStyle(task.priority),
                        )}
                      >
                        {task.title}
                      </span>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="block rounded-lg bg-white/8 px-2 py-1 text-center text-[10px] font-bold text-muted-foreground">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <aside className="bento-card p-5 xl:sticky xl:top-24 self-start">
          <div className="flex items-center justify-between border-b neon-rule pb-4">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Selected Vector</p>
              <h2 className="tech-title mt-1 text-xl">{format(selectedDate, 'MMM d')}</h2>
            </div>
            <Button size="icon" onClick={() => openCreate(selectedDate)} className="bg-secondary text-secondary-foreground">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <Target className="h-4 w-4 text-primary" />
              <div className="mt-2 text-2xl font-black">{selectedTasks.length}</div>
              <div className="text-[11px] uppercase text-muted-foreground">Tasks</div>
            </div>
            <div className="rounded-2xl border border-secondary/25 bg-secondary/10 p-3">
              <Flame className="h-4 w-4 text-secondary" />
              <div className="mt-2 text-2xl font-black">{monthTasks.length}</div>
              <div className="text-[11px] uppercase text-muted-foreground">This Month</div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {selectedTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No tasks scheduled here.
              </div>
            ) : (
              selectedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className="w-full rounded-2xl border border-border/80 bg-white/[0.035] p-3 text-left transition-colors hover:border-primary/45 hover:bg-primary/8"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold leading-tight">{task.title}</span>
                    <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase', priorityStyle(task.priority))}>
                      {task.priority}
                    </span>
                  </div>
                  {(task.dueDate || task.calendarDate) && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {task.calendarDate ? 'Scheduled' : 'Due'} {format(parseISO(taskDate(task)!), 'MMM d')}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      <CreateTaskModal
        open={!!createDate}
        onOpenChange={(open) => {
          if (!open) setCreateDate(undefined);
        }}
        defaultCalendarDate={createDate}
      />

      {selectedTaskId !== null && (
        <TaskDetailsModal
          taskId={selectedTaskId}
          open={selectedTaskId !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedTaskId(null);
          }}
        />
      )}
    </div>
  );
}
