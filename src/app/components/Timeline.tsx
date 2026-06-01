import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { CheckCircle2, Circle, Loader2, Target, User, ZoomIn, ZoomOut } from 'lucide-react';
import { useApiTasks } from '../hooks/useProjectData';
import { useAuth } from '../context/AuthContext';
import type { ApiTask } from '../../services';

const LEFT_COL_W = 280;
const DAY_MIN_W  = 24;
const BAR_H      = 28;
const ROW_H      = 44;

function daysBetween(a: Date, b: Date) {
  return differenceInCalendarDays(b, a);
}

function parseTaskDate(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getTaskStart(task: ApiTask): Date | null {
  return parseTaskDate(task.start_date) ?? parseTaskDate(task.created_at) ?? parseTaskDate(task.due_date);
}
function getTaskEnd(task: ApiTask): Date | null {
  return parseTaskDate(task.due_date) ?? getTaskStart(task);
}

function sortTasks(tasks: ApiTask[]) {
  return tasks
    .filter((t) => getTaskStart(t) && getTaskEnd(t))
    .slice()
    .sort((a, b) => {
      const diff = (getTaskStart(a) as Date).getTime() - (getTaskStart(b) as Date).getTime();
      if (diff !== 0) return diff;
      return (getTaskEnd(a) as Date).getTime() - (getTaskEnd(b) as Date).getTime();
    });
}

function TimelineHeader({
  onlyMine, onToggleMine, zoom, onZoomIn, onZoomOut,
}: {
  onlyMine: boolean; onToggleMine: () => void;
  zoom: number; onZoomIn: () => void; onZoomOut: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground">Timeline</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Tareas ordenadas por fecha de inicio.</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-1 border border-border rounded-[4px] overflow-hidden">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoom <= 0.5}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-[11px] text-muted-foreground tabular-nums select-none">{zoom.toFixed(2).replace(/\.?0+$/, '')}×</span>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoom >= 4}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors disabled:opacity-30"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleMine}
          className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-[4px] border text-[11px] transition-colors ${
            onlyMine
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          {onlyMine ? 'Mis tareas' : 'Todas las tareas'}
        </button>
      </div>
    </div>
  );
}

export function Timeline({ projectId, projectStartDate, projectEndDate }: { projectId: number; projectStartDate?: string | null; projectEndDate?: string | null }) {
  const { data: tasks, loading, statuses } = useApiTasks(undefined, projectId);
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  const [zoom, setZoom] = useState(1);
  const ZOOM_STEP = 0.25;
  const onZoomIn  = () => setZoom((z) => Math.min(4, +(z + ZOOM_STEP).toFixed(2)));
  const onZoomOut = () => setZoom((z) => Math.max(0.5, +(z - ZOOM_STEP).toFixed(2)));

  const currentUserId = useMemo(() => {
    const n = Number(user?.id ?? 0);
    return Number.isNaN(n) ? null : n;
  }, [user]);

  const statusById = useMemo(
    () => new Map((statuses ?? []).map((s) => [s.id_status, s.name])),
    [statuses],
  );

  const timelineTasks = useMemo(() => {
    let source = tasks ?? [];
    if (onlyMine && currentUserId != null) {
      source = source.filter(
        (t) =>
          t.assigned_to === currentUserId ||
          t.assigned_users?.some((u) => u.id_user === currentUserId),
      );
    }
    return sortTasks(source);
  }, [tasks, onlyMine, currentUserId]);

  const range = useMemo(() => {
    if (timelineTasks.length === 0) return null;
    const starts = timelineTasks.map((t) => (getTaskStart(t) as Date).getTime());
    const ends   = timelineTasks.map((t) => (getTaskEnd(t) as Date).getTime());
    const projStart = parseTaskDate(projectStartDate);
    const taskMin   = new Date(Math.min(...starts));
    const min = projStart && projStart.getTime() < taskMin.getTime() ? projStart : taskMin;
    const max    = new Date(Math.max(...ends));
    const limit  = parseTaskDate(projectEndDate);
    if (limit && limit.getTime() > max.getTime()) max.setTime(limit.getTime());
    max.setDate(max.getDate() + 2);
    return { min, max, totalDays: Math.max(1, daysBetween(min, max) + 1) };
  }, [timelineTasks, projectStartDate, projectEndDate]);

  const headerDays = useMemo(() => {
    if (!range) return [];
    return Array.from({ length: range.totalDays }, (_, i) => {
      const d = new Date(range.min);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [range]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIndex   = range ? daysBetween(range.min, today) : -1;
  const showToday    = range ? todayIndex >= 0 && todayIndex < range.totalDays : false;
  const todayLeftPct = range ? ((todayIndex + 0.5) / range.totalDays) * 100 : 0;
  const dayW         = DAY_MIN_W * zoom;
  const trackW       = range ? Math.max(range.totalDays * dayW, 600) : 600;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />Cargando timeline...
      </div>
    );
  }

  if (!range || timelineTasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden rounded-[6px] border border-border bg-card">
        <TimelineHeader onlyMine={onlyMine} onToggleMine={() => setOnlyMine((v) => !v)} zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12">
          <Target className="w-8 h-8 text-muted-foreground opacity-40" />
          <p className="text-[12px] text-muted-foreground">
            {onlyMine ? 'No tienes tareas con fecha en este proyecto.' : 'No hay tareas con fecha para mostrar en el timeline.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[6px] border border-border bg-card">
      <TimelineHeader onlyMine={onlyMine} onToggleMine={() => setOnlyMine((v) => !v)} zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />

      {/* Single scrollable container — header + all rows scroll together in both axes */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ minWidth: `${LEFT_COL_W + trackW}px` }}>

          {/* Sticky date-header row */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-card">
            <div
              className="sticky left-0 z-30 shrink-0 flex items-end bg-card border-r border-border/50 px-3 pb-2 pt-3"
              style={{ width: LEFT_COL_W }}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Tarea</span>
            </div>

            <div className="relative flex" style={{ minWidth: trackW, flex: '1 0 auto' }}>
              {showToday && (
                <div
                  className="absolute inset-y-0 z-10 w-px bg-red-500/70"
                  style={{ left: `${todayLeftPct}%` }}
                />
              )}
              {headerDays.map((day, i) => (
                <div
                  key={i}
                  className={`flex-1 py-1.5 text-center border-r border-border/20 ${day.getTime() === today.getTime() ? 'bg-red-500/5' : ''}`}
                  style={{ minWidth: dayW }}
                >
                  <div className={`text-[10px] leading-tight ${day.getTime() === today.getTime() ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                    {format(day, 'dd')}
                  </div>
                  <div className="text-[9px] leading-tight uppercase text-muted-foreground/60">
                    {format(day, 'MMM')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Task rows */}
          {timelineTasks.map((task, index) => {
            const start     = getTaskStart(task) as Date;
            const due       = getTaskEnd(task)   as Date;
            const leftDays  = daysBetween(range.min, start);
            const widthDays = Math.max(1, daysBetween(start, due) + 1);
            const leftPct   = (leftDays / range.totalDays) * 100;
            const widthPct  = Math.max(100 / range.totalDays, (widthDays / range.totalDays) * 100);
            const hue       = (task.id_task * 47 + index * 13) % 360;
            const statusName     = task.status ? (statusById.get(task.status) ?? '') : '';
            const isDone         = Boolean(task.completed_at) || /(done|closed|complet|terminad|resuelt)/i.test(statusName);
            const firstAssignee  = task.assigned_users?.[0]?.username ?? null;
            const extraCount     = Math.max(0, (task.assigned_users?.length ?? 0) - 1);

            return (
              <div
                key={task.id_task}
                className="flex border-b border-border/20 hover:bg-surface-secondary/10 transition-colors"
                style={{ height: ROW_H }}
              >
                {/* Sticky left info column */}
                <div
                  className="sticky left-0 z-10 shrink-0 bg-card border-r border-border/30 flex flex-col justify-center px-3 gap-0.5"
                  style={{ width: LEFT_COL_W }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isDone
                      ? <CheckCircle2 className="w-3 h-3 shrink-0 text-violet-400" />
                      : <Circle       className="w-3 h-3 shrink-0 text-emerald-400" />
                    }
                    <span className="text-[11px] font-medium text-foreground truncate">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-[18px]">
                    <span>{format(start, 'd MMM yyyy')}–{format(due, 'd MMM yyyy')}</span>
                    {firstAssignee && (
                      <>
                        <span>·</span>
                        <span className="truncate">{firstAssignee}{extraCount > 0 ? ` +${extraCount}` : ''}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Bar track — same scroll container, today line always aligned */}
                <div className="relative" style={{ minWidth: trackW, flex: '1 0 auto' }}>
                  {showToday && (
                    <div
                      className="absolute inset-y-0 z-10 w-px bg-red-500/70"
                      style={{ left: `${todayLeftPct}%` }}
                    />
                  )}
                  <div
                    className="absolute rounded-[3px] flex items-center overflow-hidden"
                    style={{
                      top:    `${(ROW_H - BAR_H) / 2}px`,
                      height: BAR_H,
                      left:   `${Math.max(0, leftPct)}%`,
                      width:  `${widthPct}%`,
                      backgroundColor: `hsl(${hue} 60% ${isDone ? 35 : 44}%)`,
                      opacity: isDone ? 0.7 : 1,
                    }}
                    title={task.title}
                  >
                    <span className="px-2 text-[10px] text-white truncate select-none">{task.title}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Timeline;
