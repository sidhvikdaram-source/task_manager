import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCreateTask,
  useListProjects,
  getListTasksQueryKey,
  getGetDashboardOverviewQueryKey,
  type ListTasksParams,
  type Task,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  calendarDate: z.string().optional(),
  projectId: z.string().optional(),
  estimatedMinutes: z.string().optional(),
  notes: z.string().optional(),
  subject: z.string().optional(),
  taskKind: z.enum(['assignment', 'test', 'quiz', 'project', 'note', 'reading', 'practice']),
  difficulty: z.enum(['1', '2', '3']),
  blocked: z.boolean(),
});

const priorityRank: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function taskMatchesParams(task: Task, params?: ListTasksParams) {
  if (!params) return true;
  if (params.status && task.status !== params.status) return false;
  if (params.priority && task.priority !== params.priority) return false;
  if (params.projectId && task.projectId !== params.projectId) return false;
  return true;
}

function sortTasksForParams(tasks: Task[], params?: ListTasksParams) {
  const sorted = [...tasks];
  if (params?.sortBy === 'dueDate') {
    return sorted.sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
  }
  if (params?.sortBy === 'vpValue') {
    return sorted.sort((a, b) => b.vpValue - a.vpValue);
  }
  if (params?.sortBy === 'priority') {
    return sorted.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  }
  return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function seedCreatedTask(queryClient: ReturnType<typeof useQueryClient>, task: Task) {
  const taskQueries = queryClient.getQueryCache().findAll({ queryKey: ['/api/tasks'] });

  if (taskQueries.length === 0) {
    queryClient.setQueryData(getListTasksQueryKey(), [task]);
    return;
  }

  for (const query of taskQueries) {
    const queryKey = query.queryKey;
    const params = Array.isArray(queryKey) ? queryKey[1] as ListTasksParams | undefined : undefined;

    queryClient.setQueryData<Task[]>(queryKey, (current) => {
      if (!Array.isArray(current)) return current;

      const withoutDuplicate = current.filter((existing) => existing.id !== task.id);
      if (!taskMatchesParams(task, params)) return withoutDuplicate;

      return sortTasksForParams([task, ...withoutDuplicate], params);
    });
  }
}

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCalendarDate?: string;
  onSuccess?: () => void;
}

export function CreateTaskModal({ open, onOpenChange, defaultCalendarDate, onSuccess }: CreateTaskModalProps) {
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const { data: projects } = useListProjects();
  const [subjects, setSubjects] = React.useState<Array<{ id: number; name: string }>>([]);
  React.useEffect(() => { if (open) fetch('/api/subjects', { credentials: 'include' }).then((response) => response.ok ? response.json() : []).then(setSubjects).catch(() => setSubjects([])); }, [open]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      startDate: '',
      calendarDate: defaultCalendarDate || '',
      projectId: '',
      estimatedMinutes: '',
      notes: '',
      subject: '',
      taskKind: 'assignment',
      difficulty: '2',
      blocked: false,
    },
  });

  React.useEffect(() => {
    if (defaultCalendarDate) {
      form.setValue('calendarDate', defaultCalendarDate);
    }
  }, [defaultCalendarDate, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    const payload: Record<string, unknown> = {
      title: values.title,
      priority: values.priority,
    };
    if (values.description) payload.description = values.description;
    if (values.dueDate) payload.dueDate = values.dueDate;
    if (values.startDate) payload.startDate = values.startDate;
    if (values.calendarDate) payload.calendarDate = values.calendarDate;
    if (values.projectId) payload.projectId = parseInt(values.projectId, 10);
    if (values.estimatedMinutes) payload.estimatedMinutes = parseInt(values.estimatedMinutes, 10);
    if (values.notes) payload.notes = values.notes;
    if (values.subject) payload.subject = values.subject;
    payload.taskKind = values.taskKind;
    payload.difficulty = Number(values.difficulty);
    payload.blocked = values.blocked;

    createTask.mutate(
      { data: payload as never },
      {
        onSuccess: (createdTask) => {
          toast.success('Task created');
          seedCreatedTask(queryClient, createdTask);
          void queryClient.invalidateQueries({
            queryKey: getGetDashboardOverviewQueryKey(),
            refetchType: 'active',
          });
          form.reset();
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          console.error('Task creation failed:', error);
          toast.error('Failed to create task');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Complete quarterly report" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Details..." className="resize-none" rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {projects && projects.length > 0 && (
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                        value={field.value || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="subject" render={({ field }) => <FormItem><FormLabel>Subject</FormLabel><Select onValueChange={(value) => field.onChange(value === 'none' ? '' : value)} value={field.value || 'none'}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None / Inbox</SelectItem>{subjects.map((subject) => <SelectItem key={subject.id} value={subject.name}>{subject.name}</SelectItem>)}</SelectContent></Select></FormItem>} />
              <FormField control={form.control} name="taskKind" render={({ field }) => <FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="assignment">Assignment</SelectItem><SelectItem value="test">Test</SelectItem><SelectItem value="quiz">Quiz</SelectItem><SelectItem value="project">Project</SelectItem><SelectItem value="reading">Reading</SelectItem><SelectItem value="practice">Practice</SelectItem><SelectItem value="note">Note</SelectItem></SelectContent></Select></FormItem>} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="difficulty" render={({ field }) => <FormItem><FormLabel>Difficulty</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="1">Light</SelectItem><SelectItem value="2">Standard</SelectItem><SelectItem value="3">Deep work</SelectItem></SelectContent></Select></FormItem>} />
              <FormField control={form.control} name="blocked" render={({ field }) => <FormItem><FormLabel>Availability</FormLabel><button type="button" onClick={() => field.onChange(!field.value)} className={`flex h-10 w-full items-center rounded-md border px-3 text-sm ${field.value ? 'border-secondary bg-secondary/10 text-secondary' : 'text-muted-foreground'}`}>{field.value ? 'Waiting / blocked' : 'Ready to work'}</button></FormItem>} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date <span className="text-muted-foreground font-normal text-xs">(soft)</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date <span className="text-muted-foreground font-normal text-xs">(hard)</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="estimatedMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Time <span className="text-muted-foreground font-normal">(minutes, optional)</span></FormLabel>
                  <FormControl>
                    <Input type="number" min="1" placeholder="e.g. 30" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quick Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any quick notes..." className="resize-none" rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTask.isPending}>
                {createTask.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
