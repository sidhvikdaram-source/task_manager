import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
  isPast,
  differenceInDays
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Clock, CircleAlert as AlertCircle } from 'lucide-react';
import { useListTasks, Task } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: tasks, isLoading } = useListTasks();

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const dateFormat = "yyyy-MM-dd";
  const days = eachDayOfInterval({
    start: startDate,
    end: endDate
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDayTasks = (date: Date) => {
    if (!tasks) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.filter(t => 
      t.status !== 'completed' && (
        (t.calendarDate && t.calendarDate.startsWith(dateStr)) ||
        (t.dueDate && t.dueDate.startsWith(dateStr))
      )
    );
  };

  const getProximityColor = (date: Date, dayTasks: Task[]) => {
    let hasCriticalOrOverdue = false;
    let minDays = Infinity;

    for (const t of dayTasks) {
      if (t.status === 'completed') continue;
      
      if (t.dueDate) {
        const dueDate = parseISO(t.dueDate);
        if (isPast(dueDate) && !isSameDay(dueDate, new Date())) {
          return 'ring-destructive border-destructive'; // Overdue
        }
        
        const diff = differenceInDays(dueDate, new Date());
        if (diff <= 3 && diff >= 0) {
          minDays = Math.min(minDays, diff);
        }
      }
      
      if (t.priority === 'critical') {
        hasCriticalOrOverdue = true;
      }
    }

    if (hasCriticalOrOverdue || minDays <= 0) return 'ring-destructive border-destructive';
    if (minDays <= 3) return 'ring-amber-500 border-amber-500';
    
    return dayTasks.length > 0 ? 'ring-primary/50 border-primary/30' : 'border-border ring-transparent';
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Calendar</h1>
          <p className="text-muted-foreground mt-1">Map out your velocity trajectory.</p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold w-40 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weekDays.map(day => (
            <div key={day} className="py-3 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((day, dayIdx) => {
            const dayTasks = getDayTasks(day);
            const isSelectedMonth = isSameMonth(day, monthStart);
            const ringColor = getProximityColor(day, dayTasks);
            
            return (
              <motion.div
                key={day.toString()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: dayIdx * 0.01 }}
                onClick={() => handleDayClick(day)}
                className={`
                  min-h-[120px] p-2 border-r border-b cursor-pointer transition-colors relative
                  hover:bg-accent/50 group
                  ${!isSelectedMonth ? 'bg-muted/20 text-muted-foreground' : 'bg-card'}
                `}
              >
                <div className={`
                  w-7 h-7 flex items-center justify-center rounded-full mb-2 mx-auto
                  ${isToday(day) ? 'bg-primary text-primary-foreground font-bold' : ''}
                  ${dayTasks.length > 0 && !isToday(day) ? `ring-2 ring-offset-1 ring-offset-card ${ringColor}` : ''}
                `}>
                  {format(day, 'd')}
                </div>

                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map(task => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md truncate font-medium border-l-2 transition-all",
                        "shadow-sm hover:shadow-md hover:translate-x-0.5 cursor-pointer",
                        task.status === 'completed'
                          ? "line-through opacity-50 bg-muted/50 border-muted-foreground/30 text-muted-foreground"
                          : task.priority === 'critical'
                          ? "bg-gradient-to-r from-red-500/15 to-red-500/5 border-red-500 text-red-700"
                          : task.priority === 'high'
                          ? "bg-gradient-to-r from-amber-500/15 to-amber-500/5 border-amber-500 text-amber-800"
                          : task.priority === 'medium'
                          ? "bg-gradient-to-r from-blue-500/15 to-blue-500/5 border-blue-500 text-blue-700"
                          : "bg-gradient-to-r from-slate-500/15 to-slate-500/5 border-slate-400 text-slate-600"
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {task.priority === 'critical' && !task.status.startsWith('compl') && (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{task.title}</span>
                      </div>
                    </motion.div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-muted-foreground font-medium text-center bg-muted/30 rounded px-1 py-0.5">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-background/40 transition-opacity backdrop-blur-[1px]">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                    <Plus className="w-5 h-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <CreateTaskModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen}
        defaultCalendarDate={selectedDate ? format(selectedDate, dateFormat) : undefined}
      />
    </div>
  );
}
