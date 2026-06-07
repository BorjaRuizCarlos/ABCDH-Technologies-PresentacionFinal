import { useMemo } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { CheckCircle2, Circle, Loader2, Target } from 'lucide-react';
import { useApiTasks } from '../hooks/useProjectData';
import type { ApiTask } from '../../services';

function daysBetween(a: Date, b: Date) {
  return differenceInCalendarDays(b, a);
}

function parseTaskDate(value?: string | null): Date | null {
  if (!value) return null;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTaskStart(task: ApiTask): Date | null {
  return parseTaskDate(task.start_date) ?? parseTaskDate(task.created_at) ?? parseTaskDate(task.due_date);
}

function getTaskEnd(task: ApiTask): Date | null {
  return parseTaskDate(task.due_date) ?? getTaskStart(task);
}

function sortTasks(tasks: ApiTask[]) {
  return tasks
    .filter((task) => getTaskStart(task) && getTaskEnd(task))
    .slice()
    .sort((a, b) => {
      const aStart = (getTaskStart(a) as Date).getTime();
      const bStart = (getTaskStart(b) as Date).getTime();
      if (aStart !== bStart) return aStart - bStart;
      const aDue = (getTaskEnd(a) as Date).getTime();
      const bDue = (getTaskEnd(b) as Date).getTime();
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    });
}

export function Timeline({ projectId, projectEndDate }: { projectId: number; projectEndDate?: string | null }) {
  const { data: tasks, loading, statuses } = useApiTasks(undefined, projectId);

  const timelineTasks = useMemo(() => sortTasks(tasks ?? []), [tasks]);

  const statusById = useMemo(() => {
    return new Map((statuses ?? []).map((status) => [status.id_status, status.name]));
  }, [statuses]);

  const range = useMemo(() => {
    if (timelineTasks.length === 0) return null;

    const starts = timelineTasks.map((task) => getTaskStart(task) as Date);
    const ends = timelineTasks.map((task) => getTaskEnd(task) as Date);
    const min = new Date(Math.min(...starts.map((date) => date.getTime())));
    const max = new Date(Math.max(...ends.map((date) => date.getTime())));
    const projectLimit = parseTaskDate(projectEndDate);
    if (projectLimit && projectLimit.getTime() > max.getTime()) {
      max.setTime(projectLimit.getTime());
    }
    // Keep the start anchored to the first real task date to avoid extra empty gap.
    max.setDate(max.getDate() + 2);

    return { min, max, totalDays: Math.max(1, daysBetween(min, max) + 1) };
  }, [timelineTasks, projectEndDate]);

  const headerDays = useMemo(() => {
    if (!range) return [];
    return Array.from({ length: range.totalDays }, (_, index) => {
      const day = new Date(range.min);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [range]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIndex = range ? daysBetween(range.min, today) : -1;
  const showToday = range ? todayIndex >= 0 && todayIndex < range.totalDays : false;
  const todayPct = showToday && range ? ((todayIndex + 0.5) / range.totalDays) * 100 : 0;

  if (loading) {
    return (
      <div className="py-10 text-center text-[12px] text-muted-foreground inline-flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando timeline...
      </div>
    );
  }

  if (!range) {
    return (
      <div className="py-12 text-center">
        <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-[12px] text-muted-foreground">No hay tareas con fecha para mostrar en el timeline.</p>
      </div>
    );
  }

  const trackMinWidth = Math.max(range.totalDays * 24, 720);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[6px] border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">Timeline</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Historial de tareas ordenadas por fecha de inicio y vencimiento.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="min-w-max space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[360px_minmax(0,1fr)] md:items-start">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Tarea</div>
            <div className="overflow-x-auto scrollbar-app">
              <div className="relative flex w-full" style={{ minWidth: `${trackMinWidth}px` }}>
                {showToday && (
                  <div
                    className="absolute inset-y-0 z-40"
                    style={{
                      left: `${Math.min(100, Math.max(0, todayPct))}%`,
                      width: '2px',
                      backgroundColor: 'rgba(239,68,68,0.95)'
                    }}
                  />
                )}
                {headerDays.map((day, index) => (
                  <div
                    key={`${day.toISOString()}-${index}`}
                    className="flex-1 min-w-[24px] border-r border-border/40 py-1 text-center text-[10px] text-muted-foreground"
                  >
                    <div>{format(day, 'dd')}</div>
                    <div className="text-[9px] uppercase">{format(day, 'MMM')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {timelineTasks.map((task, index) => {
              const start = getTaskStart(task) as Date;
              const due = getTaskEnd(task) as Date;
              const firstAssignee = task.assigned_users?.[0]?.username ?? 'Sin asignar';
              const assigneeExtraCount = Math.max(0, (task.assigned_users?.length ?? 0) - 1);
              const statusName = task.status ? (statusById.get(task.status) ?? `Estado ${task.status}`) : 'Sin estado';
              const normalizedStatus = statusName.toLowerCase();
              const isDone = Boolean(task.completed_at) || /(done|closed|complet|terminad|resuelt)/.test(normalizedStatus);
              const leftDays = daysBetween(range.min, start);
              const widthDays = Math.max(1, daysBetween(start, due) + 1);
              const leftPct = (leftDays / range.totalDays) * 100;
              const widthPct = (widthDays / range.totalDays) * 100;
              const hue = (task.id_task * 47 + index * 11) % 360;

              return (
                <div key={task.id_task} className="grid grid-cols-1 gap-2 md:grid-cols-[360px_minmax(0,1fr)] md:items-center md:gap-3">
                  <div className="min-w-0 pr-2 rounded-[4px] border border-border/60 bg-surface-secondary/20 px-2 py-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 shrink-0 text-center text-muted-foreground">{index + 1}</span>
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{task.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">#{task.id_task}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{format(start, 'dd/MM/yy')} - {format(due, 'dd/MM/yy')}</span>
                      <span>•</span>
                      <span className="truncate">{firstAssignee}{assigneeExtraCount > 0 ? ` +${assigneeExtraCount}` : ''}</span>
                      <span>•</span>
                      <span className="truncate">{statusName}</span>
                    </div>
                  </div>

                  <div
                    className="relative h-9 overflow-hidden rounded-[4px] border border-border/50 bg-surface-secondary/30"
                    style={{ minWidth: `${trackMinWidth}px` }}
                  >
                    {showToday && (
                      <div
                        className="absolute top-0 bottom-0 z-40"
                        style={{
                          left: `${Math.min(100, Math.max(0, todayPct))}%`,
                          width: '2px',
                          backgroundColor: 'rgba(239,68,68,0.95)'
                        }}
                      />
                    )}
                    <div
                      className="absolute top-1.5 h-6 rounded-[4px] shadow-sm transition-opacity hover:opacity-90"
                      style={{
                        left: `${Math.max(0, leftPct)}%`,
                        width: `max(18px, ${Math.max((100 / range.totalDays), widthPct)}%)`,
                        backgroundColor: `hsl(${hue} 68% 46%)`,
                      }}
                      title={task.description ? `${task.title}: ${task.description}` : task.title}
                    >
                      <div className="h-full px-2 text-[10px] leading-6 text-white truncate">
                        {task.title}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
