import React, { useState } from 'react';
import { 
  useGetTask, 
  useUpdateTask, 
  useDeleteTask,
  useListChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  getListTasksQueryKey,
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  getListChecklistItemsQueryKey,
  getGetTaskQueryKey
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Plus, CheckCircle2, Circle, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';

interface TaskDetailsModalProps {
  taskId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailsModal({ taskId, open, onOpenChange }: TaskDetailsModalProps) {
  const queryClient = useQueryClient();
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  const { data: task, isLoading: isLoadingTask } = useGetTask(taskId, {
    query: { enabled: open && !!taskId, queryKey: getGetTaskQueryKey(taskId) }
  });

  const { data: checklist, isLoading: isLoadingChecklist } = useListChecklistItems(taskId, {
    query: { enabled: open && !!taskId, queryKey: getListChecklistItemsQueryKey(taskId) }
  });

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  
  const createChecklistItem = useCreateChecklistItem();
  const updateChecklistItem = useUpdateChecklistItem();
  const deleteChecklistItem = useDeleteChecklistItem();

  const handleUpdateTask = (field: string, value: any) => {
    updateTask.mutate({ id: taskId, data: { [field]: value } }, {
      onSuccess: () => {
        toast.success('Task updated');
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      }
    });
  };

  const handleDeleteTask = () => {
    deleteTask.mutate({ id: taskId }, {
      onSuccess: () => {
        toast.success('Task deleted');
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
        onOpenChange(false);
      }
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
      }
    });
  };

  const handleToggleChecklist = (itemId: number, completed: boolean) => {
    updateChecklistItem.mutate({ itemId, data: { completed } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const handleDeleteChecklist = (itemId: number) => {
    deleteChecklistItem.mutate({ itemId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChecklistItemsQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
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
          <div className="space-y-6 mt-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Title</label>
                <Input 
                  defaultValue={task.title} 
                  onBlur={(e) => {
                    if (e.target.value !== task.title) handleUpdateTask('title', e.target.value);
                  }}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <Textarea 
                  defaultValue={task.description || ''} 
                  onBlur={(e) => {
                    if (e.target.value !== task.description) handleUpdateTask('description', e.target.value);
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Priority</label>
                  <Select 
                    value={task.priority} 
                    onValueChange={(val) => handleUpdateTask('priority', val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Select 
                    value={task.status} 
                    onValueChange={(val) => handleUpdateTask('status', val)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-3">Checklist</h3>
              <div className="space-y-2 mb-3">
                {isLoadingChecklist ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  checklist?.map(item => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox 
                        checked={item.completed} 
                        onCheckedChange={(checked) => handleToggleChecklist(item.id, checked as boolean)}
                      />
                      <span className={`flex-1 text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {item.title}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteChecklist(item.id)}
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
                <Button type="submit" size="sm" className="h-8 px-2" disabled={!newChecklistTitle.trim() || createChecklistItem.isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <DialogFooter className="pt-4 border-t sm:justify-between">
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
