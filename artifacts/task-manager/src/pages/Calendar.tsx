import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
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
} from "date-fns";
import {
  CalendarPlus,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  List,
  ListFilter,
  Plus,
  Target,
} from "lucide-react";
import {
  getListTasksQueryKey,
  Task,
  useListTasks,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CanvasSyncButton } from "@/components/CanvasSyncButton";
import { toast } from "sonner";
import { useExperience } from "@/experience";

type CanvasEvent = {
  id: number;
  externalEventId: string;
  title: string;
  description: string | null;
  category: "Quiz/Test" | "Meeting" | "Class Event" | "Deadline" | "Other";
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  externalUrl: string | null;
};
const canvasCategories = [
  "Quiz/Test",
  "Meeting",
  "Class Event",
  "Deadline",
  "Other",
] as const;

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type CalendarView = "month" | "week" | "day" | "agenda";

function taskDate(task: Task) {
  if (task.dueAt) return format(new Date(task.dueAt), "yyyy-MM-dd");
  return task.calendarDate || task.dueDate || task.startDate || null;
}

function matchesDate(task: Task, day: Date) {
  const value = taskDate(task);
  if (!value) return false;
  return value.startsWith(format(day, "yyyy-MM-dd"));
}

function priorityStyle(priority: Task["priority"]) {
  if (priority === "critical")
    return "border-destructive/60 bg-destructive/15 text-destructive";
  if (priority === "high")
    return "border-secondary/70 bg-secondary/15 text-secondary";
  if (priority === "medium")
    return "border-primary/55 bg-primary/12 text-primary";
  return "border-white/15 bg-white/8 text-muted-foreground";
}

function urgencyClass(tasks: Task[]) {
  if (tasks.some((task) => task.priority === "critical"))
    return "bento-card-hot";
  if (
    tasks.some(
      (task) =>
        task.dueDate &&
        differenceInCalendarDays(parseISO(task.dueDate), new Date()) <= 2,
    )
  ) {
    return "border-secondary/55 shadow-[0_0_24px_rgba(255,111,26,0.12)]";
  }
  if (tasks.length > 0)
    return "border-primary/35 shadow-[0_0_22px_rgba(0,213,255,0.1)]";
  return "";
}

function canvasTaskCategory(task: Task) {
  if (task.taskKind === "test" || task.taskKind === "quiz") return "Quiz/Test";
  if (task.taskKind === "meeting") return "Meeting";
  if (task.taskKind === "class_event") return "Class Event";
  if (task.taskKind === "deadline" || task.taskKind === "assignment")
    return "Deadline";
  return "Other";
}

export default function Calendar() {
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useExperience();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>(preferences.calendarView);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [eventCategories, setEventCategories] = useState<Set<string>>(
    new Set(canvasCategories),
  );

  function selectView(nextView: CalendarView) {
    setView(nextView);
    if (nextView !== preferences.calendarView) {
      void updatePreferences({ calendarView: nextView }).catch(() => {
        toast.error("Calendar view preference could not be saved.");
      });
    }
  }

  const { data: tasks = [], isLoading } = useListTasks(
    { sortBy: "dueDate" },
    {
      query: {
        queryKey: getListTasksQueryKey({ sortBy: "dueDate" }),
        refetchOnMount: "always",
      },
    },
  );
  const { data: canvasEvents = [] } = useQuery({
    queryKey: ["canvas-events"],
    queryFn: async () => {
      const response = await fetch("/api/canvas/events", {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json() as Promise<CanvasEvent[]>;
    },
  });
  const linkedEventIds = new Set(
    tasks
      .filter(
        (task) => task.externalSource === "canvas_event" && task.externalId,
      )
      .map((task) => task.externalId),
  );
  const visibleEvents = canvasEvents.filter(
    (event) =>
      eventCategories.has(event.category) &&
      !linkedEventIds.has(event.externalEventId),
  );
  const eventsOn = (day: Date) =>
    visibleEvents.filter(
      (event) => event.startsAt && isSameDay(new Date(event.startsAt), day),
    );
  const ignoreEvent = async (event: CanvasEvent) => {
    if (
      !window.confirm(
        "Remove this event from Velocity? Canvas itself will not be changed.",
      )
    )
      return;
    const response = await fetch("/api/canvas/ignore", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        externalType: "event",
        externalId: event.externalEventId,
      }),
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ["canvas-events"] });
      toast.success("Canvas event removed from Velocity");
    }
  };

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(endOfMonth(monthStart)),
    });
  }, [currentMonth]);

  const activeTasks = tasks.filter(
    (task) =>
      task.status !== "completed" &&
      (!task.externalSource?.startsWith("canvas") ||
        eventCategories.has(canvasTaskCategory(task))),
  );
  const selectedTasks = activeTasks.filter((task) =>
    matchesDate(task, selectedDate),
  );
  const unscheduledTasks = activeTasks.filter((task) => !taskDate(task));
  const focusedDays =
    view === "day"
      ? [selectedDate]
      : eachDayOfInterval({
          start: startOfWeek(selectedDate),
          end: endOfWeek(selectedDate),
        });
  const agendaItems = [
    ...activeTasks
      .filter((task) => taskDate(task))
      .map((task) => ({
        key: `task-${task.id}`,
        date: taskDate(task)!,
        title: task.title,
        kind: "Task",
        taskId: task.id,
      })),
    ...visibleEvents
      .filter((event) => event.startsAt)
      .map((event) => ({
        key: `event-${event.id}`,
        date: event.startsAt!,
        title: event.title,
        kind: event.category,
        taskId: null,
      })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const scheduleTask = async (taskId: number, date: Date) => {
    const dateValue = format(date, "yyyy-MM-dd");
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: dateValue, calendarDate: dateValue }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error ?? "Task could not be scheduled");
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: getListTasksQueryKey({ sortBy: "dueDate" }),
    });
    toast.success(`Scheduled for ${format(date, "MMM d")}`);
  };

  const movePeriod = (direction: -1 | 1) => {
    if (view === "month") {
      setCurrentMonth(
        direction < 0 ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1),
      );
      return;
    }
    const daysToMove = view === "day" ? direction : direction * 7;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + daysToMove);
    setSelectedDate(next);
    setCurrentMonth(next);
  };

  const openCreate = (date: Date) => {
    setSelectedDate(date);
    setCreateDate(format(date, "yyyy-MM-dd"));
  };

  if (isLoading) {
    return (
      <div className="page-stack space-y-5">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[640px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="page-stack space-y-5">
      <section className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-primary">Your time</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tasks and school events, ordered by when they happen.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CanvasSyncButton />
            {view !== "agenda" && (
              <>
                <Button variant="outline" size="icon" aria-label="Previous calendar period" onClick={() => movePeriod(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-36 rounded-lg border bg-muted/40 px-3 py-1.5 text-center">
                  <div className="text-sm font-black text-foreground">
                    {view === "month" ? format(currentMonth, "MMMM") : view === "week" ? `${format(focusedDays[0], "MMM d")} - ${format(focusedDays[focusedDays.length - 1], "MMM d")}` : format(selectedDate, "MMM d")}
                  </div>
                  <div className="text-[10px] font-semibold text-muted-foreground">
                    {view === "month" ? format(currentMonth, "yyyy") : `${view[0].toUpperCase()}${view.slice(1)} view`}
                  </div>
                </div>
                <Button variant="outline" size="icon" aria-label="Next calendar period" onClick={() => movePeriod(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              onClick={() => openCreate(selectedDate)}
              size="sm"
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-xl border bg-muted/35 p-1"
          aria-label="Calendar view"
        >
          {(
            [
              { id: "month", label: "Month", icon: CalendarDays },
              { id: "week", label: "Week", icon: CalendarRange },
              { id: "day", label: "Day", icon: Target },
              { id: "agenda", label: "Agenda", icon: List },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectView(item.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold",
                (item.id === "week" || item.id === "day") && "hidden sm:inline-flex",
                view === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className="gap-1.5">
          <ListFilter className="h-3.5 w-3.5" /> Filters
        </Button>
      </div>

      {filtersOpen && (canvasEvents.length > 0 ||
        tasks.some((task) => task.externalSource?.startsWith("canvas"))) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/25 p-3">
          <span className="text-xs font-bold text-muted-foreground">
            Canvas categories
          </span>
          {canvasCategories.map((category) => (
            <button
              key={category}
              onClick={() =>
                setEventCategories((current) => {
                  const next = new Set(current);
                  if (next.has(category)) next.delete(category);
                  else next.add(category);
                  return next;
                })
              }
              className={cn(
                "rounded-lg border px-2 py-1 text-[11px] font-bold",
                eventCategories.has(category)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-5", view !== "agenda" && "xl:grid-cols-[minmax(0,1fr)_280px]")}>
        <section className="bento-card overflow-hidden">
          {view === "month" && (
            <div>
              <div className="sm:min-w-[760px]">
                <div className="grid grid-cols-7 border-b neon-rule bg-white/[0.03]">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="px-2 py-3 text-center text-[11px] font-black uppercase text-muted-foreground"
                    >
                      <span className="sm:hidden">{day[0]}</span><span className="hidden sm:inline">{day}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {days.map((day, index) => {
                    const dayTasks = activeTasks.filter((task) =>
                      matchesDate(task, day),
                    );
                    const dayEvents = eventsOn(day);
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
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedDate(day);
                          }
                        }}
                        onDoubleClick={() => openCreate(day)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          const taskId = Number(
                            event.dataTransfer.getData("text/task-id"),
                          );
                          if (Number.isInteger(taskId))
                            void scheduleTask(taskId, day);
                        }}
                        className={cn(
                          "group min-h-16 border-r border-b border-border/70 p-1 text-left transition-all hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-[112px] sm:p-2",
                          !isCurrentMonth &&
                            "bg-black/20 text-muted-foreground/55",
                          selected && "bg-primary/10",
                          urgencyClass(dayTasks),
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-1 sm:mb-2 sm:gap-2">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black sm:h-7 sm:w-7 sm:rounded-xl sm:text-xs",
                              isToday(day) &&
                                "bg-primary text-primary-foreground shadow-[0_0_18px_rgba(0,213,255,0.35)]",
                              selected &&
                                !isToday(day) &&
                                "border border-primary/40 text-primary",
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          <span className="hidden h-6 w-6 items-center justify-center rounded-lg bg-secondary text-secondary-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 sm:hidden">
                          {dayTasks.slice(0, 3).map((task) => <span key={task.id} className={cn("h-1.5 w-1.5 rounded-full", task.priority === "critical" ? "bg-destructive" : task.priority === "high" ? "bg-secondary" : "bg-primary")} />)}
                          {dayEvents.slice(0, 2).map((event) => <span key={event.id} className="h-1.5 w-1.5 rounded-full bg-[#0f6cbf]" />)}
                          {dayTasks.length + dayEvents.length > 5 && <span className="text-[8px] font-black text-muted-foreground">+{dayTasks.length + dayEvents.length - 5}</span>}
                        </div>
                        <div className="hidden space-y-1.5 sm:block">
                          {dayTasks.slice(0, 2).map((task) => (
                            <span
                              key={task.id}
                              title={task.title}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedTaskId(task.id);
                              }}
                              className={cn(
                                "block min-h-[34px] break-words rounded-lg border px-2 py-1 text-[11px] font-bold leading-tight line-clamp-2",
                                priorityStyle(task.priority),
                              )}
                            >
                              {task.title}
                            </span>
                          ))}
                          {dayTasks.length > 2 && (
                            <span className="block rounded-lg bg-white/8 px-2 py-1 text-center text-[10px] font-bold text-muted-foreground">
                              +{dayTasks.length - 2} more
                            </span>
                          )}
                          {dayEvents
                            .slice(
                              0,
                              Math.max(0, 2 - Math.min(dayTasks.length, 2)),
                            )
                            .map((event) => (
                              <span
                                key={`event-${event.id}`}
                                title={event.title}
                                className="block min-h-[34px] break-words rounded-lg border border-[#0f6cbf]/40 bg-[#0f6cbf]/10 px-2 py-1 text-[11px] font-bold leading-tight text-[#0f6cbf] line-clamp-2"
                              >
                                {event.title}
                              </span>
                            ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {(view === "week" || view === "day") && (
            <div
              className={cn(
                "grid min-h-[520px] divide-x divide-border/70",
                view === "week" ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1",
              )}
            >
              {focusedDays.map((day) => {
                const dayTasks = activeTasks.filter((task) =>
                  matchesDate(task, day),
                );
                const dayEvents = eventsOn(day);
                return (
                  <section
                    key={day.toISOString()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const taskId = Number(
                        event.dataTransfer.getData("text/task-id"),
                      );
                      if (Number.isInteger(taskId))
                        void scheduleTask(taskId, day);
                    }}
                    className="min-w-0 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "mb-3 w-full rounded-lg px-2 py-2 text-left",
                        isSameDay(day, selectedDate) &&
                          "bg-primary/10 text-primary",
                      )}
                    >
                      <span className="block text-[10px] font-black uppercase">
                        {format(day, "EEE")}
                      </span>
                      <span className="text-lg font-black">
                        {format(day, "d")}
                      </span>
                    </button>
                    <div className="space-y-2">
                      {dayTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className={cn(
                            "w-full break-words rounded-lg border p-2 text-left text-xs font-bold leading-snug",
                            priorityStyle(task.priority),
                          )}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="break-words rounded-lg border border-[#0f6cbf]/40 bg-[#0f6cbf]/10 p-2 text-xs font-bold leading-snug text-[#0f6cbf]"
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayTasks.length === 0 && dayEvents.length === 0 && (
                        <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                          Open day
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {view === "agenda" && (
            <div className="divide-y divide-border/70">
              {agendaItems.slice(0, 100).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.taskId === null}
                  onClick={() => item.taskId && setSelectedTaskId(item.taskId)}
                  className="grid w-full grid-cols-[58px_minmax(0,1fr)] items-center gap-2 p-3 text-left hover:bg-muted/40 disabled:cursor-default sm:grid-cols-[90px_minmax(0,1fr)_100px] sm:gap-3 sm:p-4"
                >
                  <span className="text-xs font-black text-primary">
                    {format(
                      item.date.length === 10
                        ? parseISO(item.date)
                        : new Date(item.date),
                      "MMM d",
                    )}
                  </span>
                  <span className="break-words text-sm font-bold">
                    {item.title}
                  </span>
                  <span className="hidden text-right text-[10px] font-black uppercase text-muted-foreground sm:block">
                    {item.kind}
                  </span>
                </button>
              ))}
              {agendaItems.length === 0 && (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No dated tasks or events yet.
                </div>
              )}
            </div>
          )}
        </section>

        {view !== "agenda" && (
        <aside className="bento-card self-start p-4 xl:sticky xl:top-16">
          <div className="flex items-center justify-between border-b neon-rule pb-4">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">
                Selected day
              </p>
              <h2 className="tech-title mt-1 text-xl">
                {format(selectedDate, "MMM d")}
              </h2>
            </div>
            <Button
              size="icon"
              aria-label={`Add task on ${format(selectedDate, "MMMM d")}`}
              onClick={() => openCreate(selectedDate)}
              className="bg-secondary text-secondary-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {selectedTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No tasks scheduled here.
              </div>
            ) : (
              selectedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className="w-full rounded-lg border border-border/80 bg-muted/20 p-3 text-left transition-colors hover:border-primary/45 hover:bg-primary/8"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold leading-tight">
                      {task.title}
                    </span>
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase",
                        priorityStyle(task.priority),
                      )}
                    >
                      {task.priority}
                    </span>
                  </div>
                  {(task.dueDate || task.calendarDate) && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {task.calendarDate ? "Scheduled" : "Due"}{" "}
                      {format(parseISO(taskDate(task)!), "MMM d")}
                    </div>
                  )}
                  {task.externalSource?.startsWith("canvas") && (
                    <span className="mt-2 inline-flex rounded-md bg-[#0f6cbf]/10 px-2 py-1 text-[10px] font-black uppercase text-[#0f6cbf]">
                      {canvasTaskCategory(task)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          {unscheduledTasks.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-black uppercase text-muted-foreground">
                Unscheduled tasks
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {unscheduledTasks.slice(0, 12).map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "text/task-id",
                        String(task.id),
                      );
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className="flex items-center gap-2 rounded-xl border bg-muted/30 p-2"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className="min-w-0 flex-1 truncate text-left text-xs font-bold"
                    >
                      {task.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => void scheduleTask(task.id, selectedDate)}
                      className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-black text-primary"
                    >
                      Schedule
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {eventsOn(selectedDate).length > 0 && (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-black uppercase text-muted-foreground">
                Canvas events
              </p>
              <div className="space-y-2">
                {eventsOn(selectedDate).map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-[#0f6cbf]/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">{event.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.category}
                          {event.startsAt
                            ? ` · ${new Date(event.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => void ignoreEvent(event)}
                        className="text-[10px] font-bold text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                    {event.externalUrl && (
                      <a
                        href={event.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-bold text-primary"
                      >
                        Open in Canvas
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
        )}
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
