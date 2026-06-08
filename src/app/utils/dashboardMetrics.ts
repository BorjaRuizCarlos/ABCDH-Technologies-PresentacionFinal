// ─── Dashboard / report metrics ──────────────────────────────────────────────
// Pure, backend-free analytics computed from the data the API already exposes.
// Used by both the Dashboard and the Reports pages so the math stays consistent.

import type { ApiTask, ApiTaskStatus, ApiTaskPriority } from '../../services/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Status buckets ───────────────────────────────────────────────────────────
// Normalizes the free-text status names into a small, stable set of workflow
// buckets so charts/colors don't depend on exact backend wording.

export type StatusBucket =
  | 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'other';

export const BUCKET_META: Record<StatusBucket, { label: string; color: string; order: number }> = {
  backlog:     { label: 'Backlog',      color: '#64748b', order: 0 },
  todo:        { label: 'Por hacer',    color: '#0ea5e9', order: 1 },
  in_progress: { label: 'En progreso',  color: '#f59e0b', order: 2 },
  review:      { label: 'En revisión',  color: '#8b5cf6', order: 3 },
  blocked:     { label: 'Bloqueada',    color: '#ef4444', order: 4 },
  done:        { label: 'Completada',   color: '#22c55e', order: 5 },
  other:       { label: 'Sin estado',   color: '#14b8a6', order: 6 },
};

export function bucketFromStatusName(name: string | null | undefined): StatusBucket {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return 'other';
  if (n.includes('backlog')) return 'backlog';
  if (n.includes('block') || n.includes('bloque')) return 'blocked';
  if (n.includes('to do') || n.includes('todo') || n.includes('por hacer') || n.includes('pendiente') || n.includes('abierta')) return 'todo';
  if (n.includes('progress') || n.includes('progreso') || n.includes('curso') || n.includes('doing') || n.includes('desarrollo')) return 'in_progress';
  if (n.includes('review') || n.includes('revisión') || n.includes('revision') || n.includes('qa') || n.includes('test')) return 'review';
  if (n.includes('done') || n.includes('complet') || n.includes('finaliz') || n.includes('cerrad') || n.includes('termin')) return 'done';
  return 'other';
}

/**
 * Authoritative bucket for a task: completed_at wins, otherwise its workflow
 * status. This backend models status via the board column, so we fall back to
 * the column name when the legacy `status` field isn't present.
 */
export function bucketForTask(
  task: ApiTask,
  statusNameById: Map<number, string>,
  columnNameById?: Map<number, string>,
): StatusBucket {
  if (task.completed_at) return 'done';
  let name = task.status != null ? statusNameById.get(task.status) : undefined;
  if (!name && task.board_column != null && columnNameById) {
    name = columnNameById.get(task.board_column);
  }
  return bucketFromStatusName(name);
}

export function buildStatusNameMap(statuses: ApiTaskStatus[]): Map<number, string> {
  const m = new Map<number, string>();
  statuses.forEach((s) => m.set(s.id_status, s.name));
  return m;
}

// ─── Small date helpers ───────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

// ─── Burndown ─────────────────────────────────────────────────────────────────

export interface BurndownPoint {
  label: string;
  t: number;
  ideal: number | null;     // straight line from scope → 0
  remaining: number | null; // actual outstanding work (only up to today)
  projected: number | null; // throughput-based forecast (today → end)
}

export interface BurndownResult {
  points: BurndownPoint[];
  scope: number;
  done: number;
  remaining: number;
  idealNow: number;
  onTrack: boolean;
  projectedEndLabel: string | null;
  ratePerDay: number;     // recent completion velocity
  hasDeadline: boolean;
}

/**
 * Count-based burndown (no story points in the model).
 * `remaining` at day d = (tasks created on/before d) − (tasks completed on/before d),
 * which naturally surfaces scope creep when the actual line rises above the ideal.
 */
export function computeBurndown(
  tasks: ApiTask[],
  opts: { start: Date | null; end: Date | null; now?: Date },
): BurndownResult {
  const now = opts.now ?? new Date();
  const created = tasks.map((t) => parse(t.created_at)).filter((v): v is number => v != null);
  const completedAll = tasks.map((t) => parse(t.completed_at)).filter((v): v is number => v != null);

  const scope = tasks.length;
  const doneNow = completedAll.filter((c) => c <= now.getTime()).length;
  const remainingNow = Math.max(0, scope - doneNow);

  // Resolve a sensible window even when dates are missing.
  const startMs = startOfDay(
    opts.start ?? new Date(Math.min(...(created.length ? created : [now.getTime()]))),
  ).getTime();
  const hasDeadline = opts.end != null;
  const endMs = startOfDay(
    opts.end ?? new Date(now.getTime() + 8 * 7 * DAY_MS),
  ).getTime();

  const span = Math.max(DAY_MS, endMs - startMs);
  const totalDays = Math.ceil(span / DAY_MS);
  // Keep the chart readable: daily for short windows, weekly sampling for long ones.
  const step = totalDays > 70 ? 7 : totalDays > 35 ? 2 : 1;

  // Recent completion velocity (tasks/day) over the trailing window, for the forecast.
  const lookbackDays = Math.min(21, Math.max(7, Math.round((now.getTime() - startMs) / DAY_MS)));
  const lookbackStart = now.getTime() - lookbackDays * DAY_MS;
  const recentCompletions = completedAll.filter((c) => c > lookbackStart && c <= now.getTime()).length;
  const ratePerDay = recentCompletions / lookbackDays;

  const points: BurndownPoint[] = [];
  for (let d = 0; d <= totalDays; d += step) {
    const t = startMs + d * DAY_MS;
    const createdBy = created.filter((c) => c <= t + DAY_MS - 1).length;
    const completedBy = completedAll.filter((c) => c <= t + DAY_MS - 1).length;
    const remaining = t <= startOfDay(now).getTime() + DAY_MS - 1
      ? Math.max(0, createdBy - completedBy)
      : null;

    const frac = Math.min(1, Math.max(0, (t - startMs) / span));
    const ideal = hasDeadline ? Math.max(0, Math.round((scope * (1 - frac)) * 10) / 10) : null;

    let projected: number | null = null;
    if (t >= now.getTime()) {
      const daysAhead = (t - now.getTime()) / DAY_MS;
      projected = Math.max(0, remainingNow - ratePerDay * daysAhead);
    }
    points.push({ label: fmtDay(new Date(t)), t, ideal, remaining, projected });
  }

  // Forecast finish date from current velocity.
  let projectedEndLabel: string | null = null;
  if (remainingNow === 0) {
    projectedEndLabel = 'completado';
  } else if (ratePerDay > 0) {
    const daysToZero = remainingNow / ratePerDay;
    projectedEndLabel = fmtDay(new Date(now.getTime() + daysToZero * DAY_MS));
  }

  const idealNow = hasDeadline
    ? Math.round(scope * (1 - Math.min(1, Math.max(0, (now.getTime() - startMs) / span))))
    : remainingNow;
  const onTrack = remainingNow <= idealNow;

  return {
    points, scope, done: doneNow, remaining: remainingNow,
    idealNow, onTrack, projectedEndLabel, ratePerDay, hasDeadline,
  };
}

// ─── Throughput / velocity ────────────────────────────────────────────────────

export interface ThroughputPoint { label: string; completed: number; avg: number }
export interface ThroughputResult {
  data: ThroughputPoint[];
  recent: number;
  prior: number;
  deltaPct: string;
  avgPerWeek: number;
  bestWeek: number;
}

export function computeThroughput(
  tasks: ApiTask[],
  opts: { maxWeeks?: number; now?: Date } = {},
): ThroughputResult {
  const now = opts.now ?? new Date();
  const maxWeeks = opts.maxWeeks ?? 14;
  const completed = tasks
    .map((t) => parse(t.completed_at))
    .filter((v): v is number => v != null);

  const earliest = completed.length ? Math.min(...completed) : now.getTime() - 8 * 7 * DAY_MS;
  let weekStart = mondayOf(new Date(earliest));
  const thisMonday = mondayOf(now);
  const weeks: Date[] = [];
  while (weekStart.getTime() <= thisMonday.getTime()) {
    weeks.push(new Date(weekStart));
    weekStart = new Date(weekStart.getTime() + 7 * DAY_MS);
  }
  const trimmed = weeks.slice(-maxWeeks);

  const raw = trimmed.map((w) => {
    const wEnd = w.getTime() + 7 * DAY_MS;
    const count = completed.filter((c) => c >= w.getTime() && c < wEnd).length;
    return { label: fmtDay(w), completed: count };
  });

  // 4-week trailing moving average.
  const data: ThroughputPoint[] = raw.map((r, i) => {
    const windowSlice = raw.slice(Math.max(0, i - 3), i + 1);
    const avg = windowSlice.reduce((s, x) => s + x.completed, 0) / windowSlice.length;
    return { label: r.label, completed: r.completed, avg: Math.round(avg * 10) / 10 };
  });

  const n = data.length;
  const half = Math.max(1, Math.floor(n / 2));
  const recent = data.slice(n - half).reduce((s, w) => s + w.completed, 0);
  const prior = data.slice(0, n - half).reduce((s, w) => s + w.completed, 0);
  const totalCompleted = data.reduce((s, w) => s + w.completed, 0);

  return {
    data, recent, prior,
    deltaPct: pctDelta(recent, prior),
    avgPerWeek: n > 0 ? Math.round((totalCompleted / n) * 10) / 10 : 0,
    bestWeek: data.reduce((m, w) => Math.max(m, w.completed), 0),
  };
}

export function pctDelta(curr: number, prev: number): string {
  if (prev === 0 && curr === 0) return '0%';
  if (prev === 0) return '+∞';
  const diff = Math.round(((curr - prev) / prev) * 100);
  return `${diff >= 0 ? '+' : ''}${diff}%`;
}

// ─── Cumulative flow (CFD) ────────────────────────────────────────────────────
// Honest 2-band CFD reconstructable from create/complete timestamps:
//   top edge = cumulative scope (created), split into Completadas + Pendientes.
// The thickness of the "Pendientes" band is work-in-progress; a widening band
// means arrivals are outpacing completions (a bottleneck forming).

export interface CfdPoint { label: string; done: number; pending: number; total: number }

export function computeCumulativeFlow(
  tasks: ApiTask[],
  opts: { start: Date | null; now?: Date; points?: number } = { start: null },
): CfdPoint[] {
  const now = opts.now ?? new Date();
  const created = tasks.map((t) => parse(t.created_at)).filter((v): v is number => v != null);
  if (created.length === 0) return [];
  const completed = tasks.map((t) => parse(t.completed_at)).filter((v): v is number => v != null);

  const startMs = startOfDay(opts.start ?? new Date(Math.min(...created))).getTime();
  const endMs = startOfDay(now).getTime();
  const steps = opts.points ?? 24;
  const span = Math.max(DAY_MS, endMs - startMs);
  const stepMs = span / steps;

  const out: CfdPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = startMs + i * stepMs;
    const createdBy = created.filter((c) => c <= t).length;
    const doneBy = completed.filter((c) => c <= t).length;
    out.push({
      label: fmtDay(new Date(t)),
      done: doneBy,
      pending: Math.max(0, createdBy - doneBy),
      total: createdBy,
    });
  }
  return out;
}

// ─── Workload by assignee ─────────────────────────────────────────────────────

export interface WorkloadRow {
  id: number;
  name: string;
  open: number;
  overdue: number;
  completed: number;
  total: number;
}

export function computeWorkload(
  tasks: ApiTask[],
  opts: { now?: Date; limit?: number } = {},
): WorkloadRow[] {
  const now = (opts.now ?? new Date()).getTime();
  const rows = new Map<number, WorkloadRow>();
  const nameOf = new Map<number, string>();

  const touch = (id: number, name: string): WorkloadRow => {
    if (name && !nameOf.has(id)) nameOf.set(id, name);
    let r = rows.get(id);
    if (!r) { r = { id, name, open: 0, overdue: 0, completed: 0, total: 0 }; rows.set(id, r); }
    return r;
  };

  for (const task of tasks) {
    const assignees = new Map<number, string>();
    (task.assigned_users ?? []).forEach((u) => assignees.set(u.id_user, u.username || u.email || `Usuario #${u.id_user}`));
    if (assignees.size === 0 && task.assigned_to != null) assignees.set(task.assigned_to, `Usuario #${task.assigned_to}`);
    if (assignees.size === 0) continue;

    const isDone = task.completed_at != null;
    const due = parse(task.due_date);
    const isOverdue = !isDone && due != null && due < now;

    assignees.forEach((name, id) => {
      const r = touch(id, name);
      r.total += 1;
      if (isDone) r.completed += 1;
      else r.open += 1;
      if (isOverdue) r.overdue += 1;
    });
  }

  const list = Array.from(rows.values()).map((r) => ({
    ...r,
    name: nameOf.get(r.id) ?? r.name,
  }));
  list.sort((a, b) => (b.open - a.open) || (b.total - a.total));
  return opts.limit ? list.slice(0, opts.limit) : list;
}

// ─── Distributions ────────────────────────────────────────────────────────────

export interface DistSlice { key: string; label: string; color: string; value: number }

export function computeStatusDistribution(
  tasks: ApiTask[],
  statusNameById: Map<number, string>,
  columnNameById?: Map<number, string>,
): DistSlice[] {
  const counts = new Map<StatusBucket, number>();
  for (const t of tasks) {
    const b = bucketForTask(t, statusNameById, columnNameById);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return (Object.keys(BUCKET_META) as StatusBucket[])
    .map((b) => ({ key: b, label: BUCKET_META[b].label, color: BUCKET_META[b].color, value: counts.get(b) ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => BUCKET_META[a.key as StatusBucket].order - BUCKET_META[b.key as StatusBucket].order);
}

// Ramp from most critical → least critical. Colored by rank, so it's robust to
// whichever numeric convention the backend uses for `level` (here level 1 = top).
const PRIORITY_RAMP = ['#ef4444', '#f97316', '#f59e0b', '#0ea5e9', '#94a3b8'];

export function computePriorityDistribution(
  tasks: ApiTask[],
  priorities: ApiTaskPriority[],
): DistSlice[] {
  const counts = new Map<number, number>();
  for (const t of tasks) {
    if (t.completed_at) continue; // priority matters for outstanding work
    counts.set(t.priority, (counts.get(t.priority) ?? 0) + 1);
  }
  // Lower level number = higher priority (Crítica = 1) → list most critical first.
  const ordered = [...priorities].sort((a, b) => a.level - b.level);
  return ordered
    .map((p, i) => ({
      key: String(p.id_priority),
      label: p.name,
      color: PRIORITY_RAMP[Math.min(i, PRIORITY_RAMP.length - 1)],
      value: counts.get(p.id_priority) ?? 0,
    }))
    .filter((s) => s.value > 0);
}
