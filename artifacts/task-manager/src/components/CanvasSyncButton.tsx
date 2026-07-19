import { RefreshCw } from 'lucide-react';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import { cn } from '@/lib/utils';

export function CanvasSyncButton({className}:{className?:string}){const{status,sync,running}=useCanvasSync(false);if(!status?.connected)return null;return <button type="button" onClick={()=>void sync()} disabled={running||status.needsCourseSelection} title={status.integration?.lastSyncedAt?`Last synced ${new Date(status.integration.lastSyncedAt).toLocaleString()}`:'Sync Canvas'} className={cn('inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50',className)}><RefreshCw className={cn('h-3.5 w-3.5',running&&'animate-spin')}/>{running?'Syncing':'Sync changes'}</button>}
