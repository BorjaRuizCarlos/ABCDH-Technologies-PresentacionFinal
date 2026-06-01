import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  Briefcase, ArrowRight, RefreshCw, CheckCircle2, Timer, ListChecks,
  AlertTriangle, GitCommit, Calendar, TrendingUp,
} from 'lucide-react';
import { KPICard } from '../components/KPICard';
import {
  useApiBoards, useApiProjectMembers, useApiProjects, useApiTasks,
  useApiTaskAssignments, useApiTaskWarnings, useApiGithubPushes,
} from '../hooks/useProjectData';
import { useAuth } from '../context/AuthContext';
import {
  compareProjectsForGenericPriority, shouldShowInGenericProjectDisplays,
} from '../utils/projectStatus';
import { formatProjectDate } from '../utils/projectDates';
import { computeProjectProgress, getProjectHealth, type ProjectHealth } from '../utils/projectHealth';

const HEALTH_DOT: Record<ProjectHealth, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
};
const HEALTH_BAR: Record<ProjectHealth, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
};
const HEALTH_BORDER: Record<ProjectHealth, string> = {
  green: 'border-l-success',
  yellow: 'border-l-warning',
  red: 'border-l-destructive',
};
const HEALTH_LABEL: Record<ProjectHealth, string> = {
  green: 'Saludable',
  yellow: 'En riesgo',
  red: 'Crítico',
};

const PANEL_PAGE_SIZE = 8;

function relativeDueLabel(dueIso: string, now: Date): { label: string; tone: 'overdue' | 'today' | 'tomorrow' | 'soon' } {
  const due = new Date(dueIso);
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
  if (n.includes('to do') || n.includes('por hacer')) return '#0ea5e9';
  if (n.includes('progress') || n.includes('progreso')) return '#f59e0b';
  if (n.includes('review') || n.includes('revisión') || n.includes('revision')) return '#8b5cf6';
  if (n.includes('done') || n.includes('completad') || n.includes('finalizad')) return '#22c55e';
  if (n.includes('block') || n.includes('bloque')) return '#ef4444';
  return '#14b8a6';
}

type KpiAccent = 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'ai';

interface KpiDef {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor?: KpiAccent;
}

// Los KPI usan el primitivo KPICard (src/app/components/KPICard.tsx) — ver render abajo.

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = useMemo(() => Number(user?.id ?? 0), [user?.id]);
  const { data: projects, loading: loadingProjects, error: errorProjects, refetch: refetchProjects } = useApiProjects();
  const { data: tasks, loading: loadingTasks, statuses, refetch: refetchTasks } = useApiTasks();
  const { data: boards, loading: loadingBoards } = useApiBoards();
  const { data: myProjectMemberships, loading: loadingMemberships } = useApiProjectMembers(
    undefined,
    Number.isNaN(currentUserId) || currentUserId <= 0 ? undefined : currentUserId,
  );
  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id_task), [tasks]);
  const { data: taskAssignments } = useApiTaskAssignments(taskIds);
  const { data: warnings } = useApiTaskWarnings({ status: 'active' });
  const { data: pushes } = useApiGithubPushes();
  const isStakeholderUser = user?.role === 'stakeholder';
  const isAdminUser = user?.role === 'admin';

  const loading = loadingProjects || loadingTasks || loadingBoards || (isAdminUser ? false : loadingMemberships);

  const visibleProjectIds = useMemo(() => {
    if (isAdminUser) return new Set<number>((projects ?? []).map((p) => p.id_project));
    const ids = new Set<number>();
    (myProjectMemberships ?? []).forEach((m) => ids.add(m.project));
    return ids;
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

  const scopedTasks = useMemo(() => {
    const list = tasks ?? [];
    if (visibleProjectIds.size === 0) return [];
    return list.filter((t) => {
      if (t.project != null && visibleProjectIds.has(t.project)) return true;
      const pid = boardProjectMap.get(t.board ?? 0);
      return pid != null && visibleProjectIds.has(pid);
    });
  }, [tasks, boardProjectMap, visibleProjectIds]);

  const scopedTaskIdSet = useMemo(() => new Set(scopedTasks.map((t) => t.id_task)), [scopedTasks]);
  const scopedWarnings = useMemo(
    () => (warnings ?? []).filter((w) => scopedTaskIdSet.has(w.task)),
    [warnings, scopedTaskIdSet],
  );

  const taskStatusNameById = useMemo(() => {
    const m = new Map<number, string>();
    statuses.forEach((s) => m.set(s.id_status, s.name));
    return m;
  }, [statuses]);

  const refetchAll = () => { refetchProjects(); refetchTasks(); };

  // ── KPIs ──
  const kpis = useMemo(() => {
    const pList = visibleProjects.filter((p) => shouldShowInGenericProjectDisplays(p.status));
    const tList = scopedTasks;
    const now = new Date();
    const totalProjects = pList.length;
    const totalTasks = tList.length;
    const completed = tList.filter((t) => t.completed_at != null).length;
    const overdue = tList.filter((t) => !t.completed_at && t.due_date && new Date(t.due_date) < now).length;
    const open = totalTasks - completed;
    return { totalProjects, totalTasks, completed, open, overdue };
  }, [visibleProjects, scopedTasks]);
  const activeWarningsCount = scopedWarnings.length;

  // ── My tasks ──
  const myTasks = useMemo(() => {
    if (!user) return [];
    const uid = Number(user.id);
    const assignmentMap = new Map<number, Set<number>>();
    (taskAssignments ?? []).forEach((a) => {
      const s = assignmentMap.get(a.task) ?? new Set<number>();
      s.add(a.assigned_to);
      assignmentMap.set(a.task, s);
    });
    return scopedTasks
      .filter((t) => {
        if (t.completed_at) return false;
        const assigned = assignmentMap.get(t.id_task);
        if (assigned && assigned.size > 0) return assigned.has(uid);
        return t.assigned_to === uid;
      })
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [scopedTasks, taskAssignments, user]);

  const [myTasksPage, setMyTasksPage] = useState(0);
  const [pushesPage, setPushesPage] = useState(0);

  const paginatedMyTasks = useMemo(() => {
    const start = myTasksPage * PANEL_PAGE_SIZE;
    return myTasks.slice(start, start + PANEL_PAGE_SIZE);
  }, [myTasks, myTasksPage]);

  const paginatedPushes = useMemo(() => {
    const start = pushesPage * PANEL_PAGE_SIZE;
    return (pushes ?? []).slice(start, start + PANEL_PAGE_SIZE);
  }, [pushes, pushesPage]);

  const myTasksTotalPages = Math.max(1, Math.ceil(myTasks.length / PANEL_PAGE_SIZE));
  const pushesTotalPages = Math.max(1, Math.ceil((pushes ?? []).length / PANEL_PAGE_SIZE));

  // ── Upcoming tasks (due in next 7 days, plus recent overdue) ──
  const upcomingDueTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 8);
    const out = scopedTasks
      .filter((t) => {
        if (t.completed_at) return false;
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        return d.getTime() < cutoff.getTime();
      })
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
    return out;
  }, [scopedTasks]);

  // ── Portfolio health (donut) ──
  const portfolioHealthData = useMemo(() => {
    const taskList = tasks ?? [];
    const boardList = boards ?? [];
    const counts: Record<ProjectHealth, number> = { green: 0, yellow: 0, red: 0 };
    for (const p of visibleProjects) {
      if (!shouldShowInGenericProjectDisplays(p.status)) continue;
      const progress = computeProjectProgress(p.id_project, taskList, boardList);
      const health = getProjectHealth(p, progress);
      counts[health] += 1;
    }
    const meta: { key: ProjectHealth; name: string; color: string }[] = [
      { key: 'green', name: 'Saludable', color: 'var(--success)' },
      { key: 'yellow', name: 'En riesgo', color: 'var(--warning)' },
      { key: 'red', name: 'Crítico', color: 'var(--destructive)' },
    ];
    return meta
      .filter((m) => counts[m.key] > 0)
      .map((m) => ({ ...m, value: counts[m.key] }));
  }, [visibleProjects, tasks, boards]);

  const portfolioHealthTotal = useMemo(
    () => portfolioHealthData.reduce((sum, d) => sum + d.value, 0),
    [portfolioHealthData],
  );

  // ── Project cards ──
  const upcomingProjects = useMemo(() => {
    return [...visibleProjects]
      .filter((p) => shouldShowInGenericProjectDisplays(p.status))
      .sort(compareProjectsForGenericPriority);
  }, [visibleProjects]);

  const projectCards = useMemo(() => {
    const taskList = tasks ?? [];
    const boardList = boards ?? [];
    return upcomingProjects.map((p) => {
      const progress = computeProjectProgress(p.id_project, taskList, boardList);
      const health = getProjectHealth(p, progress);
      const now = new Date();
      const overdue = taskList.filter((t) => {
        const belongs = t.project === p.id_project
          || boardProjectMap.get(t.board ?? 0) === p.id_project;
        if (!belongs) return false;
        return !t.completed_at && t.due_date && new Date(t.due_date) < now;
      }).length;
      return { project: p, progress, health, overdue };
    });
  }, [upcomingProjects, tasks, boards, boardProjectMap]);

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
          onClick={() => {
            if (isAuthExpiredError) { window.location.href = '/'; return; }
            refetchAll();
          }}
          className="mt-3 text-[12px] text-primary hover:underline"
        >
          {isAuthExpiredError ? 'Ir al inicio' : 'Reintentar'}
        </button>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] ?? '';

  const kpiList: KpiDef[] = [
    { title: 'Proyectos', value: kpis.totalProjects, subtitle: 'activos', icon: <Briefcase className="w-4 h-4" /> },
    { title: 'Tareas', value: kpis.totalTasks, subtitle: 'en tus proyectos', icon: <ListChecks className="w-4 h-4" /> },
    { title: 'Completadas', value: kpis.completed, subtitle: 'tareas terminadas', icon: <CheckCircle2 className="w-4 h-4" /> },
    { title: 'Pendientes', value: kpis.open, subtitle: 'tareas abiertas', icon: <Timer className="w-4 h-4" /> },
    { title: 'Vencidas', value: kpis.overdue, subtitle: 'requieren atención', icon: <AlertTriangle className="w-4 h-4" /> },
    { title: 'Warnings', value: activeWarningsCount, subtitle: 'alertas activas', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1600px] min-h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
          Hola, {firstName}
        </h1>
        <button
          type="button"
          onClick={() => refetchAll()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-all [transition-timing-function:var(--ease-out)] hover:bg-accent active:scale-[0.98]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* ───────── KPI Row ───────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg h-[90px] animate-pulse" />
            ))
          : kpiList.map((kpi, i) => (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: i * 0.04, ease: 'easeOut' }}
              >
                <KPICard
                  title={kpi.title}
                  value={kpi.value}
                  subtitle={kpi.subtitle}
                  icon={kpi.icon}
                  accentColor={kpi.accentColor}
                />
              </motion.div>
            ))
        }
      </div>

      {/* ───────── Charts row: Donut + Bar ───────── */}
      <div className="grid lg:grid-cols-2 gap-3 items-stretch">
        {/* Salud del Portafolio (donut) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1, ease: 'easeOut' }}
          className="bg-card border border-border rounded-lg p-4 flex flex-col"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-foreground">Salud del Portafolio</h2>
            <span className="text-[10px] text-muted-foreground">{portfolioHealthTotal} total</span>
          </div>
          {portfolioHealthData.length > 0 ? (
            <div className="flex items-center gap-6 flex-1">
              <div className="relative w-[180px] h-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolioHealthData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={78}
                      dataKey="value"
                      paddingAngle={3}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {portfolioHealthData.map((d) => <Cell key={d.key} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[24px] font-bold text-foreground leading-none tabular-nums">
                    {portfolioHealthTotal}
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
                    proyectos
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {portfolioHealthData.map((d) => {
                  const pct = portfolioHealthTotal > 0 ? Math.round((d.value / portfolioHealthTotal) * 100) : 0;
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-foreground">{d.name}</span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {d.value} <span className="text-muted-foreground/60">· {pct}%</span>
                        </span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground py-8 text-center">Sin proyectos.</p>
          )}
        </motion.div>

        {/* Próximas a Vencer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15, ease: 'easeOut' }}
          className="bg-card border border-border rounded-lg flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold text-foreground">Próximas a Vencer</h2>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {upcomingDueTasks.length} en 7 días
            </span>
          </div>
          {upcomingDueTasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <CheckCircle2 className="w-6 h-6 text-success mx-auto mb-2" />
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
                    rel.tone === 'overdue' ? 'bg-destructive'
                    : rel.tone === 'today' ? 'bg-warning'
                    : rel.tone === 'tomorrow' ? 'bg-info'
                    : 'bg-success';
                  const pillCls =
                    rel.tone === 'overdue' ? 'text-destructive bg-destructive/10 border-destructive/30'
                    : rel.tone === 'today' ? 'text-warning bg-warning/10 border-warning/30'
                    : rel.tone === 'tomorrow' ? 'text-info bg-info/10 border-info/30'
                    : 'text-success bg-success/10 border-success/30';
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

      {/* ───────── Project cards ───────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2, ease: 'easeOut' }}
        className="bg-card border border-border rounded-lg p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-foreground">Mis Proyectos</h2>
          <Link to="/projects" className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-secondary/40 border border-border rounded-md h-[110px] animate-pulse" />
            ))}
          </div>
        ) : projectCards.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">
            No tienes proyectos asignados.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectCards.slice(0, 6).map(({ project, progress, health, overdue }) => (
              <button
                key={project.id_project}
                type="button"
                onClick={() => navigate(`/projects/${project.id_project}`)}
                className={`bg-card border border-border border-l-[3px] ${HEALTH_BORDER[health]} rounded-md p-3.5 hover:bg-accent/20 hover:border-primary/40 transition-colors text-left`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-[13px] font-semibold text-foreground truncate flex-1">{project.name}</h3>
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${HEALTH_DOT[health]}`}
                    title={HEALTH_LABEL[health]}
                  />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${HEALTH_BAR[health]}`}
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground tabular-nums">
                    {progress.percentage}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{progress.completed} de {progress.total} tareas</span>
                  {overdue > 0 ? (
                    <span className="text-destructive font-medium inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {overdue} {overdue === 1 ? 'vencida' : 'vencidas'}
                    </span>
                  ) : (
                    <span className="text-success">Al día</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ───────── Bottom: My Tasks + Git Activity ───────── */}
      {!isStakeholderUser && (
        <div className="grid xl:grid-cols-2 gap-3 items-start">
          {/* My tasks */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.25, ease: 'easeOut' }}
            className="bg-card border border-border rounded-lg flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <h2 className="text-[13px] font-semibold text-foreground">Mis Tareas Pendientes</h2>
                {myTasks.length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {myTasks.length}
                  </span>
                )}
              </div>
              <Link to="/backlog" className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1">
                Ver Backlog <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {loadingTasks ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse bg-secondary rounded" />)}
              </div>
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
                    const statusLabel = task.status != null
                      ? (taskStatusNameById.get(task.status) ?? 'Sin estado')
                      : 'Sin estado';
                    const statusCol = taskStatusColor(statusLabel);
                    return (
                      <button
                        key={task.id_task}
                        type="button"
                        onClick={() => projectId && navigate(`/projects/${projectId}?tab=tareas&task=${task.id_task}`)}
                        className="w-full px-4 py-2.5 hover:bg-accent/30 transition-colors flex items-center gap-3 text-left"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCol }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-foreground truncate">{task.title}</div>
                          <div className="flex items-center gap-2 mt-0.5 min-w-0">
                            <span className="text-[10px] text-muted-foreground truncate">{projectName}</span>
                            <span
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ backgroundColor: `${statusCol}1a`, color: statusCol }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        {task.due_date && (
                          <span className={`text-[10px] whitespace-nowrap ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            {formatProjectDate(task.due_date)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {myTasksTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-1.5 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">
                      Página {myTasksPage + 1} de {myTasksTotalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMyTasksPage((p) => Math.max(0, p - 1))}
                        disabled={myTasksPage === 0}
                        className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50"
                      >‹ Ant.</button>
                      <button
                        type="button"
                        onClick={() => setMyTasksPage((p) => Math.min(myTasksTotalPages - 1, p + 1))}
                        disabled={myTasksPage >= myTasksTotalPages - 1}
                        className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50"
                      >Sig. ›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* Git Activity */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.3, ease: 'easeOut' }}
            className="bg-card border border-border rounded-lg flex flex-col"
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
                            <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm shrink-0">
                              {push.ref?.replace('refs/heads/', '') ?? 'main'}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {commitCount} commit{commitCount !== 1 ? 's' : ''} · {new Date(push.received_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
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
                        className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50"
                      >‹ Ant.</button>
                      <button
                        type="button"
                        onClick={() => setPushesPage((p) => Math.min(pushesTotalPages - 1, p + 1))}
                        disabled={pushesPage >= pushesTotalPages - 1}
                        className="h-6 px-2 border border-border rounded-sm text-[10px] hover:bg-accent disabled:opacity-50"
                      >Sig. ›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
