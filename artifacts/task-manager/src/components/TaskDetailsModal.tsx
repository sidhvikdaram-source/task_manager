import React, { useState } from 'react';
import {
  useGetTask,
  useUpdateTask,
  useDeleteTask,
  useListChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useListProjects,
  getListTasksQueryKey,
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  getListChecklistItemsQueryKey,
  getGetTaskQueryKey,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Plus, X, Link as LinkIcon, Clock, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

interface TaskLink { url: string; label?: string; }

interface TaskDetailsModalProps {
  taskId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailsModal({ taskId, open, onOpenChange }: TaskDetailsModalProps) {
  const queryClient = useQueryClient();
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);

  const { data: task, isLoading: isLoadingTask } = useGetTask(taskId, {
    query: { enabled: open && !!taskId, queryKey: getGetTaskQueryKey(taskId) },
  });
  const { data: checklist, isLoading: isLoadingChecklist } = useListChecklistItems(taskId, {
    query: { enabled: open && !!taskId, queryKey: getListChecklistItemsQueryKey(taskId) },
  });
  const { data: projects } = useListProjects();

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createChecklistItem = useCreateChecklistItem();
  const updateChecklistItem = useUpdateChecklistItem();
  const deleteChecklistItem = useDeleteChecklistItem();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
  };

  const handleUpdate = (field: string, value: unknown) => {
    updateTask.mutate({ id: taskId, data: { [field]: value } as never }, {
      onSuccess: invalidate,
      onError: () => toast.error('Failed to update'),
    });
  };

  const handleDeleteTask = () => {
    deleteTask.mutate({ id: taskId }, {
      onSuccess: () => {
        toast.success('Task deleted');
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
        onOpenChange(false);
      },
    });
  };

  const handleAddChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistTitle.trim()) return;
    createChecklistItem.mutate({ id: taskId, data: { title: newChecklistTitle } }, {
      onSuccess: () => {
        setNewChecklistTitle('');
        queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      },
    });
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    let url = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const existing: TaskLink[] = (task?.links as TaskLink[] | null) ?? [];
    const newLinks: TaskLink[] = [...existing, { url, label: newLinkLabel.trim() || undefined }];
    handleUpdate('links', newLinks);
    setNewLinkUrl('');
    setNewLinkLabel('');
    setShowLinkForm(false);
  };

  const handleRemoveLink = (idx: number) => {
    const existing: TaskLink[] = (task?.links as TaskLink[] | null) ?? [];
    const newLinks = existing.filter((_, i) => i !== idx);
    handleUpdate('links', newLinks);
  };

  const links: TaskLink[] = (task?.links as TaskLink[] | null) ?? [];
  const checklistTotal = checklist?.length ?? 0;
  const checklistDone = checklist?.filter((item) => item.completed).length ?? 0;
  const checklistProgress = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0;

  const handleBreakDownTask = () => {
    if (!task || createChecklistItem.isPending) return;
    const title = task.title.toLowerCase();
    const steps = title.includes('test') || title.includes('exam') || title.includes('quiz')
      ? ['Gather study material', 'Review weakest topics', 'Complete a practice round', 'Pack what you need']
      : title.includes('call') || title.includes('email') || title.includes('message')
        ? ['Clarify the goal', 'Prepare key points', 'Send or make contact', 'Log the follow-up']
        : title.includes('code') || title.includes('bug') || title.includes('build')
          ? ['Define expected behavior', 'Reproduce the issue', 'Implement the fix', 'Verify and ship']
          : ['Define the next action', 'Gather what you need', 'Do the focused work', 'Review and close'];

    for (const step of steps) {
      createChecklistItem.mutate({ id: taskId, data: { title: step } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      });
    }
    toast.success('Action steps added');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Task Details</DialogTitle>
        </DialogHeader>

        {isLoadingTask ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : task ? (
          <div className="space-y-5 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              <Input
                defaultValue={task.title}
                onBlur={(e) => { if (e.target.value !== task.title) handleUpdate('title', e.target.value); }}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea
                defaultValue={task.description || ''}
                className="resize-none"
                rows={2}
                onBlur={(e) => { if (e.target.value !== (task.description ?? '')) handleUpdate('description', e.target.value); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Priority</label>
                <Select value={task.priority} onValueChange={(val) => handleUpdate('priority', val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Status</label>
                <Select value={task.status} onValueChange={(val) => handleUpdate('status', val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {projects && projects.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Project</label>
                <Select
                  value={task.projectId ? String(task.projectId) : 'none'}
                  onValueChange={(val) => handleUpdate('projectId', val === 'none' ? null : parseInt(val, 10))}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                  Start Date <span className="text-xs">(soft)</span>
                </label>
                <Input
                  type="date"
                  defaultValue={task.startDate || ''}
                  onBlur={(e) => handleUpdate('startDate', e.target.value || null)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                  Due Date <span className="text-xs">(hard)</span>
                </label>
                <Input
                  type="date"
                  defaultValue={task.dueDate || ''}
                  onBlur={(e) => handleUpdate('dueDate', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  Est. Time (min)
                </label>
                <Input
                  type="number"
                  min="1"
                  defaultValue={task.estimatedMinutes ?? ''}
                  onBlur={(e) => handleUpdate('estimatedMinutes', e.target.value ? parseInt(e.target.value, 10) : null)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  Actual Time (min)
                </label>
                <Input
                  type="number"
                  min="0"
                  defaultValue={task.actualMinutes ?? ''}
                  onBlur={(e) => handleUpdate('actualMinutes', e.target.value ? parseInt(e.target.value, 10) : null)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Quick Notes</label>
              <Textarea
                defaultValue={task.notes || ''}
                className="resize-none"
                rows={3}
                placeholder="Add notes..."
                onBlur={(e) => { if (e.target.value !== (task.notes ?? '')) handleUpdate('notes', e.target.value || null); }}
              />
            </div>

            <div className="pt-1 border-t">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" />
                  Links
                </h3>
                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {showLinkForm && (
                <form onSubmit={handleAddLink} className="space-y-1.5 mb-3 p-3 bg-muted/40 rounded-lg">
                  <Input
                    placeholder="URL (e.g. https://...)"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Input
                    placeholder="Label (optional)"
                    value={newLinkLabel}
                    onChange={(e) => setNewLinkLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="h-7 text-xs" disabled={!newLinkUrl.trim()}>Add link</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowLinkForm(false)}>Cancel</Button>
                  </div>
                </form>
              )}

              <div className="space-y-1.5">
                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-1.5 group">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate flex-1 text-xs"
                    >
                      {link.label || link.url}
                    </a>
                    <button
                      onClick={() => handleRemoveLink(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-1 border-t">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <h3 className="font-medium">Action steps</h3>
                    {checklistTotal > 0 && (
                      <span className="text-xs text-muted-foreground">{checklistDone}/{checklistTotal}</span>
                    )}
                  </div>
                  {checklistTotal > 0 && <Progress value={checklistProgress} className="mt-2 h-1.5" />}
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={handleBreakDownTask}>
                  Break down
                </Button>
              </div>
              <div className="space-y-2 mb-3">
                {isLoadingChecklist ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  checklist?.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={(checked) =>
                          updateChecklistItem.mutate({ itemId: item.id, data: { completed: checked as boolean } }, {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
                              queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                            },
                          })
                        }
                      />
                      <span className={`flex-1 text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {item.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() =>
                          deleteChecklistItem.mutate({ itemId: item.id }, {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
                              queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                            },
                          })
                        }
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddChecklist} className="flex items-center gap-2">
                <Input
                  placeholder="Add item..."
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 px-2"
                  disabled={!newChecklistTitle.trim() || createChecklistItem.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <DialogFooter className="pt-3 border-t sm:justify-between">
              <Button variant="destructive" onClick={handleDeleteTask} disabled={deleteTask.isPending}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="py-4 text-center text-muted-foreground">Task not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
