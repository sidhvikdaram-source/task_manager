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
  getGetUserStatsQueryKey,
  getListDailyHabitsQueryKey,
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
});

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

    createTask.mutate(
      { data: payload as never },
      {
        onSuccess: () => {
          toast.success('Task created');
          // Invalidate all task/overview/stats queries so every view refreshes
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListDailyHabitsQueryKey() });
          form.reset();
          onOpenChange(false);
          onSuccess?.();
        },
        onError: () => toast.error('Failed to create task'),
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
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