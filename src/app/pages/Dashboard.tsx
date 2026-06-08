import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Briefcase, ArrowRight, RefreshCw, CheckCircle2, Timer, ListChecks,
  AlertTriangle, GitCommit, Calendar, TrendingUp, Activity, Layers,
} from 'lucide-react';
import { CommandBar } from '../components/CommandBar';
import {
  useApiBoards, useApiBoardColumns, useApiProjectMembers, useApiProjects, useApiTasks,
  useApiTaskAssignments, useApiTaskWarnings, useApiGithubPushes,
} from '../hooks/useProjectData';
import { LevelProgress } from '../components/Gamification';
import { useAuth } from '../context/AuthContext';
import { shouldShowInGenericProjectDisplays, compareProjectsForGenericPriority } from '../utils/projectStatus';
import { formatProjectDate } from '../utils/projectDates';
import { computeProjectProgress, getProjectHealth, type ProjectHealth } from '../utils/projectHealth';
import {
  computeStatusDistribution, computeThroughput, buildStatusNameMap,
} from '../utils/dashboardMetrics';
import { ChartCard } from '../components/charts/chartUtils';
import { TaskStatusDonut } from '../components/charts/TaskStatusDonut';
import { VelocityChart } from '../components/charts/VelocityChart';

const HEALTH_DOT: Record<ProjectHealth, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};
const HEALTH_BAR: Record<ProjectHealth, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};
const HEALTH_BORDER: Record<ProjectHealth, string> = {
  green: 'border-l-emerald-500',
  yellow: 'border-l-amber-500',
  red: 'border-l-red-500',
};
const HEALTH_LABEL: Record<ProjectHealth, string> = {
  green: 'Saludable',
  yellow: 'En riesgo',
  red: 'Crítico',
};

const PANEL_PAGE_SIZE = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function relativeDueLabel(dueIso: string, now: Date): { label: string; tone: 'overdue' | 'today' | 'tomorrow' | 'soon' } {
  const due = startOfDay(new Date(dueIso));
  const today = startOfDay(now);
  const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) {
    const abs = Math.abs(diff);
    return { label: abs === 1 ? 'vencida ayer' : `vencida hace ${abs}d`, tone: 'overdue' };
  }
  if (diff === 0) return { label: 'HOY', tone: 'today' };
  if (diff === 1) return { label: 'mañana', tone: 'tomorrow' };
  return { label: `en ${diff}d`, tone: 'soon' };
}

function taskStatusColor(name: string) {
  const n = name.trim().toLowerCase();
  if (n.includes('backlog')) return '#64748b';
  if (n.includes('to do') || n.includes('por hacer') || n.includes('todo')) return '#0ea5e9';
  if (n.includes('progress') || n.includes('progreso') || n.includes('curso')) return '#f59e0b';
  if (n.includes('review') || n.includes('revisión') || n.includes('revision')) return '#8b5cf6';
  if (n.includes('done') || n.includes('completad') || n.includes('finalizad') || n.includes('hecho')) return '#22c55e';
  if (n.includes('block') || n.includes('bloque')) return '#ef4444';
  return '#14b8a6';
}

interface KpiDef {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  iconBg: string;
  iconColor: string;
}

function KpiCard({ kpi, index }: { kpi: KpiDef; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04, ease: 'easeOut' }}
      className={`relative bg-card border border-border rounded-[8px] p-3.5 overflow-hidden group hover:border-primary/30 hover:shadow-sm transition-all`}
    >
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${kpi.accent}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase truncate">
            {kpi.title}
          </div>
          <div className="text-[24px] font-bold text-foreground leading-tight mt-1 tabular-nums">
            {kpi.value}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {kpi.subtitle}
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${kpi.iconBg} ${kpi.iconColor}`}>
          {kpi.icon}
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = useMemo(() => Number(user?.id ?? 0), [user?.id]);
  const validUserId = !Number.isNaN(currentUserId) && currentUserId > 0 ? currentUserId : null;

  const { data: projects, loading: loadingProjects, error: errorProjects, refetch: refetchProjects } = useApiProjects();
  const { data: tasks, loading: loadingTasks, refetch: refetchTasks } = useApiTasks();
  const { data: boards, loading: loadingBoards } = useApiBoards();
  const { data: boardColumns } = useApiBoardColumns();
  const { data: myProjectMemberships, loading: loadingMemberships } = useApiProjectMembers(
    undefined,
    Number.isNaN(currentUserId) || currentUserId <= 0 ? undefined : currentUserId,
  );
  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id_task), [tasks]);
  const { data: taskAssignments } = useApiTaskAssignments(taskIds);
  const { data: warnings } = useApiTaskWarnings({ status: 'active' });
  const { data: pushes } = useApiGithubPushes();
  const { data: gamificationProfile } = useApiGamificationProfile();
  const { data: userBadges } = useApiUserBadges();

  const isStakeholderUser = user?.role === 'stakeholder';
  const isAdminUser = user?.role === 'admin';
  // Admins & project managers see the whole team; everyone else sees only their own tasks.
  const isManagerView = user?.role === 'admin' || user?.role === 'project_manager';

  const loading = loadingProjects || loadingTasks || loadingBoards || (isAdminUser ? false : loadingMemberships);

  const visibleProjectIds = useMemo(() => {
    if (isAdminUser) return new Set<number>((projects ?? []).map((p) => p.id_project));
    return new Set<number>((myProjectMemberships ?? []).map((m) => m.project));
  }, [isAdminUser, projects, myProjectMemberships]);

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p) => visibleProjectIds.has(p.id_project)),
    [projects, visibleProjectIds],
  );

  const projectById = useMemo(() => {
    const m = new Map<number, string>();
    visibleProjects.forEach((p) => m.set(p.id_project, p.name));
    return m;
  }, [visibleProjects]);

  const boardProjectMap = useMemo(() => {
    const m = new Map<number, number>();
    (boards ?? []).forEach((b) => m.set(b.id_board, b.project));
    return m;
  }, [boards]);

  const columnNameById = useMemo(() => {
    const m = new Map<number, string>();
    (columns ?? []).forEach((c) => m.set(c.id_column, c.name));
    return m;
  }, [columns]);

  // Set of task ids assigned to the current user (assignments table + legacy field).
  const myTaskIdSet = useMemo(() => {
    const ids = new Set<number>();
    if (validUserId == null) return ids;
    (taskAssignments ?? []).forEach((a) => { if (a.assigned_to === validUserId) ids.add(a.task); });
    (tasks ?? []).forEach((t) => { if (t.assigned_to === validUserId) ids.add(t.id_task); });
    return ids;
  }, [taskAssignments, tasks, validUserId]);

  // Tasks within the user's visible projects.
  const scopedTasks = useMemo(() => {
    if (visibleProjectIds.size === 0) return [];
    return (tasks ?? []).filter((t) => {
      if (t.project != null && visibleProjectIds.has(t.project)) return true;
      const pid = boardProjectMap.get(t.board ?? 0);
      return pid != null && visibleProjectIds.has(pid);
    });
  }, [tasks, boardProjectMap, visibleProjectIds]);

  // What the dashboard is "about": everything for managers, only my tasks for regular users.
  const dashboardTasks = useMemo(
    () => (isManagerView ? scopedTasks : scopedTasks.filter((t) => myTaskIdSet.has(t.id_task))),
    [isManagerView, scopedTasks, myTaskIdSet],
  );

  const dashboardTaskIdSet = useMemo(() => new Set(dashboardTasks.map((t) => t.id_task)), [dashboardTasks]);
  const scopedWarnings = useMemo(
    () => (warnings ?? []).filter((w) => dashboardTaskIdSet.has(w.task)),
    [warnings, dashboardTaskIdSet],
  );

  const refetchAll = () => { refetchProjects(); refetchTasks(); };

  // ── KPIs (task-focused) ──
  const kpis = useMemo(() => {
    const tList = dashboardTasks;
    const now = new Date();
    const totalTasks = tList.length;
    const completed = tList.filter((t) => t.completed_at != null).length;
    const overdue = tList.filter((t) => !t.completed_at && t.due_date && new Date(t.due_date) < now).length;
    const open = totalTasks - completed;
    const projectCount = isManagerView
      ? visibleProjects.filter((p) => shouldShowInGenericProjectDisplays(p.status)).length
      : new Set(dashboardTasks.map((t) => t.project)).size;
    return { totalTasks, completed, open, overdue, projectCount };
  }, [dashboardTasks, visibleProjects, isManagerView]);
  const activeWarningsCount = scopedWarnings.length;

  // ── Task status distribution (donut) ──
  const taskStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    dashboardTasks.forEach((t) => {
      const name = columnNameById.get(t.board_column) ?? 'Sin estado';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value, color: taskStatusColor(name) }))
      .sort((a, b) => b.value - a.value);
  }, [dashboardTasks, columnNameById]);
  const taskStatusTotal = useMemo(() => taskStatusData.reduce((s, d) => s + d.value, 0), [taskStatusData]);

  // ── Burndown ──
  const sprintOptions = useMemo(() => {
    const list = (sprints ?? []).filter((s) => visibleProjectIds.has(s.project));
    const rank = (s: ApiSprint) => (s.status === 'active' ? 0 : s.status === 'planned' ? 1 : 2);
    return [...list].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (b.start_date ?? '').localeCompare(a.start_date ?? '');
    });
  }, [sprints, visibleProjectIds]);

  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const activeSprintId = selectedSprintId ?? sprintOptions[0]?.id_sprint ?? null;
  const activeSprint = useMemo(
    () => sprintOptions.find((s) => s.id_sprint === activeSprintId) ?? null,
    [sprintOptions, activeSprintId],
  );
  const burndownData = useMemo(() => {
    if (!activeSprint) return [];
    const sprintTasks = dashboardTasks.filter((t) => t.sprint === activeSprint.id_sprint);
    return buildBurndownSeries(activeSprint, sprintTasks, new Date());
  }, [activeSprint, dashboardTasks]);

  // ── My tasks panel (always personal, pending only) ──
  const myTasks = useMemo(() => {
    if (validUserId == null) return [];
    return scopedTasks
      .filter((t) => !t.completed_at && myTaskIdSet.has(t.id_task))
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [scopedTasks, myTaskIdSet, validUserId]);

  const [myTasksPage, setMyTasksPage] = useState(0);
  const [pushesPage, setPushesPage] = useState(0);

  const paginatedMyTasks = useMemo(() => myTasks.slice(myTasksPage * PANEL_PAGE_SIZE, myTasksPage * PANEL_PAGE_SIZE + PANEL_PAGE_SIZE), [myTasks, myTasksPage]);
  const paginatedPushes = useMemo(() => (pushes ?? []).slice(pushesPage * PANEL_PAGE_SIZE, pushesPage * PANEL_PAGE_SIZE + PANEL_PAGE_SIZE), [pushes, pushesPage]);
  const myTasksTotalPages = Math.max(1, Math.ceil(myTasks.length / PANEL_PAGE_SIZE));
  const pushesTotalPages = Math.max(1, Math.ceil((pushes ?? []).length / PANEL_PAGE_SIZE));

  // ── Upcoming tasks (next 7 days + recent overdue) ──
  const upcomingDueTasks = useMemo(() => {
    const today = startOfDay(new Date());
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 8);
    return dashboardTasks
      .filter((t) => !t.completed_at && t.due_date && new Date(t.due_date).getTime() < cutoff.getTime())
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  }, [dashboardTasks]);

  // ── Task-focused analytics (dashboard headline) ──
  const statusNameById = useMemo(() => buildStatusNameMap(statuses), [statuses]);
  const columnNameById = useMemo(() => {
    const m = new Map<number, string>();
    (boardColumns ?? []).forEach((c) => m.set(c.id_column, c.name));
    return m;
  }, [boardColumns]);
  const taskStatusDist = useMemo(
    () => computeStatusDistribution(scopedTasks, statusNameById, columnNameById),
    [scopedTasks, statusNameById, columnNameById],
  );
  const throughput = useMemo(() => computeThroughput(scopedTasks), [scopedTasks]);

  // ── Project cards ──
  const upcomingProjects = useMemo(() => {
    return [...visibleProjects]
      .filter((p) => shouldShowInGenericProjectDisplays(p.status))
      .filter((p) => relevantIds == null || relevantIds.has(p.id_project))
      .sort(compareProjectsForGenericPriority)
      .map((p) => {
        const progress = computeProjectProgress(p.id_project, taskList, boardList);
        const now = new Date();
        const overdue = taskList.filter((t) => {
          const belongs = t.project === p.id_project || boardProjectMap.get(t.board ?? 0) === p.id_project;
          return belongs && !t.completed_at && t.due_date && new Date(t.due_date) < now;
        }).length;
        return { project: p, progress, overdue };
      });
  }, [visibleProjects, tasks, boards, boardProjectMap, isManagerView, dashboardTasks]);

  const isAuthExpiredError = useMemo(() => {
    if (!errorProjects) return false;
    const n = errorProjects.toLowerCase();
    return n.includes('token') || n.includes('sesion') || n.includes('sesión') || n.includes('expir') || n.includes('venc');
  }, [errorProjects]);

  if (errorProjects) {
    return (
      <div className="px-4 pt-10 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-[13px] text-destructive">
          {isAuthExpiredError ? 'Tu sesión venció. Vuelve a iniciar sesión.' : errorProjects}
        </p>
        <button
          onClick={() => { if (isAuthExpiredError) { window.location.href = '/'; return; } refetchAll(); }}
          className="mt-3 text-[12px] text-primary hover:underline"
        >
          {isAuthExpiredError ? 'Ir al inicio' : 'Reintentar'}
        </button>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] ?? '';

  const kpiList: KpiDef[] = [
    {
      title: 'Proyectos', value: kpis.totalProjects, subtitle: 'activos',
      icon: <Briefcase className="w-4 h-4" />, accent: 'bg-primary',
      iconBg: 'bg-primary/10', iconColor: 'text-primary',
    },
    {
      title: 'Tareas', value: kpis.totalTasks, subtitle: 'en tus proyectos',
      icon: <ListChecks className="w-4 h-4" />, accent: 'bg-sky-500',
      iconBg: 'bg-sky-500/10', iconColor: 'text-sky-500',
    },
    {
      title: 'Completadas', value: kpis.completed, subtitle: 'tareas terminadas',
      icon: <CheckCircle2 className="w-4 h-4" />, accent: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500',
    },
    {
      title: 'Pendientes', value: kpis.open, subtitle: 'tareas abiertas',
      icon: <Timer className="w-4 h-4" />, accent: 'bg-amber-500',
      iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500',
    },
    {
      title: 'Vencidas', value: kpis.overdue, subtitle: 'requieren atención',
      icon: <AlertTriangle className="w-4 h-4" />, accent: 'bg-red-500',
      iconBg: 'bg-red-500/10', iconColor: 'text-red-500',
    },
    {
      title: 'Warnings', value: activeWarningsCount, subtitle: 'alertas activas',
      icon: <TrendingUp className="w-4 h-4" />, accent: 'bg-violet-500',
      iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500',
    },
  ];

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1600px] min-h-full flex flex-col gap-4">
      <CommandBar
        actions={[{ label: 'Actualizar', icon: <RefreshCw className="w-3.5 h-3.5" />, onClick: () => refetchAll() }]}
        rightSlot={
          <span className="text-xs text-muted-foreground">
            Hola, <span className="font-medium text-foreground">{firstName}</span>
          </span>
        }
      />

      {/* ───────── Gamification strip ───────── */}
      {gamificationProfile?.is_eligible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}
          className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <LevelProgress profile={gamificationProfile} />
          </div>
          <Link
            to="/profile"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-secondary/40 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
          >
            🏅 {(userBadges ?? []).filter((b) => b.unlocked_at).length} insignia{(userBadges ?? []).filter((b) => b.unlocked_at).length === 1 ? '' : 's'}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </motion.div>
      )}

      {/* ───────── KPI Row ───────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-[8px] h-[90px] animate-pulse" />
            ))
          : kpiList.map((kpi, i) => <KpiCard key={kpi.title} kpi={kpi} index={i} />)
        }
      </div>

      {/* ───────── Charts row: Task status + Velocity + Próximas ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
        {/* Estado de las tareas (donut) — task-focused */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1, ease: 'easeOut' }}
        >
          <ChartCard
            eyebrow="ESTADO"
            title="Estado de las tareas"
            icon={<Layers className="w-3.5 h-3.5 text-violet-500" />}
            className="h-full"
            right={<span className="text-[10px] text-muted-foreground">{kpis.totalTasks} total</span>}
          >
            <TaskStatusDonut data={taskStatusDist} total={kpis.totalTasks} size={150} />
          </ChartCard>
        </motion.div>

        {/* Velocidad semanal (mini) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.13, ease: 'easeOut' }}
        >
          <ChartCard
            eyebrow="VELOCIDAD"
            title="Completadas por semana"
            icon={<Activity className="w-3.5 h-3.5 text-sky-500" />}
            className="h-full"
            right={
              <div className="text-right">
                <div className="text-[16px] font-bold text-foreground leading-none tabular-nums">{throughput.avgPerWeek}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">prom/sem</div>
              </div>
            }
          >
            <VelocityChart result={throughput} height={172} compact />
          </ChartCard>
        </motion.div>

        {/* Burndown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15, ease: 'easeOut' }}
          className="bg-card border border-border rounded-[8px] flex flex-col"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <h2 className="text-[13px] font-semibold text-foreground">Burndown</h2>
            </div>
            {sprintOptions.length > 0 && (
              <select
                value={activeSprintId ?? ''}
                onChange={(e) => setSelectedSprintId(e.target.value ? Number(e.target.value) : null)}
                className="h-7 max-w-[200px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
              >
                {sprintOptions.map((s) => (
                  <option key={s.id_sprint} value={s.id_sprint}>
                    {s.name}{projectById.get(s.project) ? ` · ${projectById.get(s.project)}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {upcomingDueTasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground">
                  Sin tareas próximas a vencer.
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Estás al día.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 max-h-[300px] overflow-y-auto scrollbar-app divide-y divide-border">
                {upcomingDueTasks.slice(0, 8).map((task) => {
                  const rel = relativeDueLabel(task.due_date!, new Date());
                  const projectId = task.project ?? boardProjectMap.get(task.board ?? 0);
                  const projectName = projectId
                    ? (projectById.get(projectId) ?? `Proyecto #${projectId}`)
                    : 'Sin proyecto';
                  const dotColor =
                    rel.tone === 'overdue' ? 'bg-red-500'
                    : rel.tone === 'today' ? 'bg-amber-500'
                    : rel.tone === 'tomorrow' ? 'bg-sky-500'
                    : 'bg-emerald-500';
                  const pillCls =
                    rel.tone === 'overdue' ? 'text-red-600 bg-red-500/10 border-red-500/30'
                    : rel.tone === 'today' ? 'text-amber-700 bg-amber-500/10 border-amber-500/30'
                    : rel.tone === 'tomorrow' ? 'text-sky-700 bg-sky-500/10 border-sky-500/30'
                    : 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30';
                  return (
                    <button
                      key={task.id_task}
                      type="button"
                      onClick={() => projectId && navigate(`/projects/${projectId}?tab=tareas&task=${task.id_task}`)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground truncate">{task.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{projectName}</div>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${pillCls}`}>
                        {rel.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-border px-4 py-1.5 text-right">
                <Link
                  to="/backlog"
                  className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  Ver todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* ───────── Próximas a Vencer ───────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2, ease: 'easeOut' }}
        className="bg-card border border-border rounded-[8px] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-foreground">Mis Proyectos</h2>
          <Link to="/projects" className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1">Ver todos <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-secondary/40 border border-border rounded-[6px] h-[110px] animate-pulse" />
            ))}
          </div>
        ) : projectCards.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">No tienes proyectos asignados.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectCards.slice(0, 6).map(({ project, progress, overdue }) => (
              <button
                key={project.id_project}
                type="button"
                onClick={() => navigate(`/projects/${project.id_project}`)}
                className={`bg-card border border-border border-l-[3px] ${HEALTH_BORDER[health]} rounded-[6px] p-3.5 hover:bg-accent/20 hover:border-primary/40 transition-colors text-left`}
              >
                <h3 className="text-[13px] font-semibold text-foreground truncate mb-2">{project.name}</h3>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress.percentage}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground tabular-nums">{progress.percentage}%</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{progress.completed} de {progress.total} tareas</span>
                  {overdue > 0 ? (
                    <span className="text-red-600 font-medium inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {overdue} {overdue === 1 ? 'vencida' : 'vencidas'}
                    </span>
                  ) : (
                    <span className="text-emerald-600">Al día</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ───────── Bottom: My Tasks + Git Activity ───────── */}
      <div className="grid xl:grid-cols-2 gap-3 items-start">
        {!isStakeholderUser && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.25, ease: 'easeOut' }}
            className="bg-card border border-border rounded-[8px] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="text-[13px] font-semibold text-foreground">Mis Tareas Pendientes</h2>
                {myTasks.length > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{myTasks.length}</span>}
              </div>
              <Link to="/backlog" className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1">Ver Backlog <ArrowRight className="w-3 h-3" /></Link>
            </div>
            {loadingTasks ? (
              <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse bg-secondary rounded" />)}</div>
            ) : myTasks.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-muted-foreground">Sin tareas pendientes.</div>
            ) : (
              <>
                <div className="max-h-[360px] overflow-y-auto scrollbar-app divide-y divide-border">
                  {paginatedMyTasks.map((task) => {
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                    const projectId = task.project ?? boardProjectMap.get(task.board ?? 0);
                    const projectName = projectId
                      ? (projectById.get(projectId) ?? `Proyecto #${projectId}`)
                      : 'Sin proyecto';
                    const statusLabel =
                      (task.status != null ? taskStatusNameById.get(task.status) : undefined)
                      ?? columnNameById.get(task.board_column)
                      ?? 'Sin estado';
                    const statusCol = taskStatusColor(statusLabel);
                    return (
                      <button
                        key={task.id_task}
                        type="button"
                        onClick={() => projectId && navigate(`/projects/${projectId}?tab=${task.sprint == null ? 'backlog' : 'sprints'}&task=${task.id_task}`)}
                        className="w-full px-4 py-2.5 hover:bg-accent/30 transition-colors flex items-center gap-3 text-left"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCol }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-foreground truncate">{task.title}</div>
                          <div className="flex items-center gap-2 mt-0.5 min-w-0">
                            <span className="text-[10px] text-muted-foreground truncate">{projectName}</span>
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${statusCol}1a`, color: statusCol }}>{statusLabel}</span>
                          </div>
                        </div>
                        {task.due_date && (
                          <span className={`text-[10px] whitespace-nowrap ${isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                            {formatProjectDate(task.due_date)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {myTasksTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-1.5 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">Página {myTasksPage + 1} de {myTasksTotalPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMyTasksPage((p) => Math.max(0, p - 1))}
                        disabled={myTasksPage === 0}
                        className="h-6 px-2 border border-border rounded-[3px] text-[10px] hover:bg-accent disabled:opacity-50"
                      >‹ Ant.</button>
                      <button
                        type="button"
                        onClick={() => setMyTasksPage((p) => Math.min(myTasksTotalPages - 1, p + 1))}
                        disabled={myTasksPage >= myTasksTotalPages - 1}
                        className="h-6 px-2 border border-border rounded-[3px] text-[10px] hover:bg-accent disabled:opacity-50"
                      >Sig. ›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

          {/* Git Activity */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.3, ease: 'easeOut' }}
            className="bg-card border border-border rounded-[8px] flex flex-col"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold text-foreground">Actividad Reciente (Git)</h2>
            </div>
            {!pushes || pushes.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-muted-foreground">Sin push events recientes.</div>
            ) : (
              <>
                <div className="max-h-[360px] overflow-y-auto scrollbar-app divide-y divide-border">
                  {paginatedPushes.map((push) => {
                    const commitCount = Array.isArray(push.commits) ? push.commits.length : 0;
                    return (
                      <div key={push.id_push} className="px-4 py-2.5 hover:bg-accent/30 transition-colors flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                          {(push.pusher ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-foreground truncate">
                              {push.pusher ?? 'unknown'}
                            </span>
                            <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-[2px] shrink-0">
                              {push.ref?.replace('refs/heads/', '') ?? 'main'}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {commitCount} commit{commitCount !== 1 ? 's' : ''} · {new Date(push.received_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{commitCount} commit{commitCount !== 1 ? 's' : ''} · {new Date(push.received_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    );
                  })}
                </div>
                {pushesTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-1.5 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">
                      Página {pushesPage + 1} de {pushesTotalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPushesPage((p) => Math.max(0, p - 1))}
                        disabled={pushesPage === 0}
                        className="h-6 px-2 border border-border rounded-[3px] text-[10px] hover:bg-accent disabled:opacity-50"
                      >‹ Ant.</button>
                      <button
                        type="button"
                        onClick={() => setPushesPage((p) => Math.min(pushesTotalPages - 1, p + 1))}
                        disabled={pushesPage >= pushesTotalPages - 1}
                        className="h-6 px-2 border border-border rounded-[3px] text-[10px] hover:bg-accent disabled:opacity-50"
                      >Sig. ›</button>
                    </div>
                  );
                })}
              </div>
              {pushesTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-1.5 border-t border-border">
                  <span className="text-[10px] text-muted-foreground">Página {pushesPage + 1} de {pushesTotalPages}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setPushesPage((p) => Math.max(0, p - 1))} disabled={pushesPage === 0} className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50">‹ Ant.</button>
                    <button type="button" onClick={() => setPushesPage((p) => Math.min(pushesTotalPages - 1, p + 1))} disabled={pushesPage >= pushesTotalPages - 1} className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50">Sig. ›</button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
