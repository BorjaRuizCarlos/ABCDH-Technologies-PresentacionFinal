import { useEffect, useMemo, useState } from 'react';
import {
  Download, FileDown, RefreshCw, Loader2, TrendingUp, TrendingDown, Gauge,
  CheckCircle2, AlertTriangle, Clock, ListChecks, ArrowRight, Flame, Users, Activity, Layers,
} from 'lucide-react';
import { CommandBar } from '../components/CommandBar';
import { ReportExportDialog } from '../components/ReportExportDialog';
import {
  useApiProjects, useApiTasks, useApiTaskWarnings, useApiBoards, useApiSprints, useApiBoardColumns,
} from '../hooks/useProjectData';
import { computeProjectProgress, getProjectHealth, type ProjectHealth } from '../utils/projectHealth';
import {
  computeBurndown, computeThroughput, computeCumulativeFlow, computeWorkload,
  computeStatusDistribution, computePriorityDistribution, buildStatusNameMap,
} from '../utils/dashboardMetrics';
import { ChartCard } from '../components/charts/chartUtils';
import { BurndownChart } from '../components/charts/BurndownChart';
import { VelocityChart } from '../components/charts/VelocityChart';
import { CumulativeFlowChart } from '../components/charts/CumulativeFlowChart';
import { WorkloadChart } from '../components/charts/WorkloadChart';
import { TaskStatusDonut } from '../components/charts/TaskStatusDonut';
import { DistributionBars } from '../components/charts/DistributionBars';

const COMPLETION_TARGET = 80;

type StatusLevel = 'healthy' | 'attention' | 'risk';

interface KpiCardData {
  label: string;
  value: string;
  delta?: string;
  status: StatusLevel;
  icon: React.ReactNode;
}

function statusFromHealthMix(reds: number, yellows: number): StatusLevel {
  if (reds > 0) return 'risk';
  if (yellows > 0) return 'attention';
  return 'healthy';
}

function statusBadge(level: StatusLevel) {
  if (level === 'risk') {
    return { dot: 'bg-red-500', ring: 'ring-red-500/30', pill: 'bg-red-500/10 text-red-600 border-red-500/30', label: 'EN RIESGO' };
  }
  if (level === 'attention') {
    return { dot: 'bg-amber-500', ring: 'ring-amber-500/30', pill: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: 'REQUIERE ATENCIÓN' };
  }
  return { dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', pill: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', label: 'SALUDABLE' };
}

function statusLabelByLevel(l: StatusLevel) {
  if (l === 'risk') return 'crítico';
  if (l === 'attention') return 'atención';
  return 'saludable';
}

export default function Reports() {
  const { data: projects, loading: loadingProjects, refetch: refetchProjects } = useApiProjects();
  const { data: tasks, loading: loadingTasks, statuses, priorities, refetch: refetchTasks } = useApiTasks();
  const { data: warnings, refetch: refetchWarnings } = useApiTaskWarnings();
  const { data: boards } = useApiBoards();
  const { data: boardColumns } = useApiBoardColumns();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const { data: sprints } = useApiSprints(selectedProject ?? undefined);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const loading = loadingProjects || loadingTasks;
  const refetchAll = () => { refetchProjects(); refetchTasks(); refetchWarnings(); };

  const projectList = projects ?? [];
  const taskList = tasks ?? [];
  const boardList = boards ?? [];
  const warningList = warnings ?? [];

  const statusNameById = useMemo(() => buildStatusNameMap(statuses), [statuses]);
  const columnNameById = useMemo(() => {
    const m = new Map<number, string>();
    (boardColumns ?? []).forEach((c) => m.set(c.id_column, c.name));
    return m;
  }, [boardColumns]);

  const boardProjectMap = useMemo(() => {
    const m = new Map<number, number>();
    boardList.forEach((b) => m.set(b.id_board, b.project));
    return m;
  }, [boardList]);

  const inScopeProjects = useMemo(
    () => (selectedProject ? projectList.filter((p) => p.id_project === selectedProject) : projectList),
    [projectList, selectedProject],
  );

  const filteredTasks = useMemo(() => {
    if (!selectedProject) return taskList;
    return taskList.filter((t) => {
      if (t.project === selectedProject) return true;
      return boardProjectMap.get(t.board ?? 0) === selectedProject;
    });
  }, [taskList, selectedProject, boardProjectMap]);

  const filteredWarnings = useMemo(() => {
    if (!selectedProject) return warningList;
    const ids = new Set(filteredTasks.map((t) => t.id_task));
    return warningList.filter((w) => ids.has(w.task));
  }, [warningList, selectedProject, filteredTasks]);

  // ── Per-project health (hero + ranking) ──
  const projectHealthList = useMemo(() => {
    return inScopeProjects.map((p) => {
      const progress = computeProjectProgress(p.id_project, taskList, boardList);
      const health = getProjectHealth(p, progress);
      const overdue = taskList.filter((t) => {
        const belongs = t.project === p.id_project || boardProjectMap.get(t.board ?? 0) === p.id_project;
        if (!belongs) return false;
        return !t.completed_at && t.due_date && new Date(t.due_date) < new Date();
      }).length;
      return { project: p, progress, health, overdue };
    });
  }, [inScopeProjects, taskList, boardList, boardProjectMap]);

  // ── Aggregate task KPIs ──
  const kpis = useMemo(() => {
    const now = new Date();
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.completed_at != null).length;
    const overdue = filteredTasks.filter((t) => !t.completed_at && t.due_date && new Date(t.due_date) < now).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedWithDates = filteredTasks.filter((t) => t.completed_at && t.created_at);
    const avgDays = completedWithDates.length > 0
      ? Math.round(completedWithDates.reduce((sum, t) => {
          const c = new Date(t.created_at).getTime();
          const d = new Date(t.completed_at!).getTime();
          return sum + (d - c) / (1000 * 60 * 60 * 24);
        }, 0) / completedWithDates.length)
      : 0;

    const activeWarnings = filteredWarnings.filter((w) => w.status === 'active').length;
    return { total, completed, overdue, completionRate, avgDays, activeWarnings };
  }, [filteredTasks, filteredWarnings]);

  // ── New analytics ──
  const throughput = useMemo(() => computeThroughput(filteredTasks), [filteredTasks]);

  const scopeWindow = useMemo(() => {
    let start: number | null = null;
    let end: number | null = null;
    for (const p of inScopeProjects) {
      const c = p.created_at ? new Date(p.created_at).getTime() : null;
      if (c != null) start = start == null ? c : Math.min(start, c);
      const e = p.end_date ? new Date(p.end_date).getTime() : null;
      if (e != null) end = end == null ? e : Math.max(end, e);
    }
    return { start: start != null ? new Date(start) : null, end: end != null ? new Date(end) : null };
  }, [inScopeProjects]);

  const sprintOptions = useMemo(() => {
    const inScopeIds = new Set(inScopeProjects.map((p) => p.id_project));
    return (sprints ?? [])
      .filter((s) => inScopeIds.has(s.project))
      .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  }, [sprints, inScopeProjects]);

  // Reset sprint selection when it leaves the current scope.
  useEffect(() => {
    if (selectedSprintId != null && !sprintOptions.some((s) => s.id_sprint === selectedSprintId)) {
      setSelectedSprintId(null);
    }
  }, [sprintOptions, selectedSprintId]);

  const selectedSprint = useMemo(
    () => sprintOptions.find((s) => s.id_sprint === selectedSprintId) ?? null,
    [sprintOptions, selectedSprintId],
  );

  const burndown = useMemo(() => {
    if (selectedSprint) {
      const sprintTasks = filteredTasks.filter((t) => t.sprint === selectedSprint.id_sprint);
      return computeBurndown(sprintTasks, {
        start: selectedSprint.start_date ? new Date(selectedSprint.start_date) : null,
        end: selectedSprint.end_date ? new Date(selectedSprint.end_date) : null,
      });
    }
    return computeBurndown(filteredTasks, { start: scopeWindow.start, end: scopeWindow.end });
  }, [selectedSprint, filteredTasks, scopeWindow]);

  const cfd = useMemo(
    () => computeCumulativeFlow(filteredTasks, { start: scopeWindow.start }),
    [filteredTasks, scopeWindow],
  );
  const workload = useMemo(() => computeWorkload(filteredTasks, { limit: 8 }), [filteredTasks]);
  const statusDist = useMemo(() => computeStatusDistribution(filteredTasks, statusNameById, columnNameById), [filteredTasks, statusNameById, columnNameById]);
  const priorityDist = useMemo(() => computePriorityDistribution(filteredTasks, priorities), [filteredTasks, priorities]);

  // ── Portfolio aggregate stats ──
  const portfolioStats = useMemo(() => {
    const reds = projectHealthList.filter((p) => p.health === 'red').length;
    const yellows = projectHealthList.filter((p) => p.health === 'yellow').length;
    const greens = projectHealthList.filter((p) => p.health === 'green').length;
    const overallStatus: StatusLevel = statusFromHealthMix(reds, yellows);
    return { reds, yellows, greens, overallStatus, count: projectHealthList.length };
  }, [projectHealthList]);

  // ── Insights ──
  const insights = useMemo(() => {
    const out: { tone: 'good' | 'warn' | 'bad'; text: string }[] = [];

    if (throughput.prior > 0 || throughput.recent > 0) {
      const diff = throughput.recent - throughput.prior;
      if (diff > 0) out.push({ tone: 'good', text: `Velocidad ${throughput.deltaPct} vs el periodo anterior · ${throughput.avgPerWeek} tareas/semana en promedio.` });
      else if (diff < 0) out.push({ tone: 'warn', text: `Velocidad ${throughput.deltaPct} vs el periodo anterior — el equipo cerró ${Math.abs(diff)} tareas menos.` });
    }

    if (selectedSprint && burndown.scope > 0) {
      out.push({
        tone: burndown.onTrack ? 'good' : 'bad',
        text: burndown.onTrack
          ? `Sprint "${selectedSprint.name}" en ritmo: ${burndown.remaining} restantes vs ${burndown.idealNow} ideales.`
          : `Sprint "${selectedSprint.name}" atrasado: ${burndown.remaining} restantes (ideal ${burndown.idealNow})${burndown.projectedEndLabel ? `, terminaría ~${burndown.projectedEndLabel}` : ''}.`,
      });
    }

    if (kpis.total > 0) {
      if (kpis.completionRate >= COMPLETION_TARGET) out.push({ tone: 'good', text: `Tasa de completado ${kpis.completionRate}% por encima de la meta (${COMPLETION_TARGET}%).` });
      else out.push({ tone: 'warn', text: `Tasa de completado ${kpis.completionRate}% bajo la meta de ${COMPLETION_TARGET}%.` });
    }

    if (kpis.avgDays > 0) {
      out.push({ tone: kpis.avgDays <= 7 ? 'good' : 'warn', text: `Tiempo de ciclo promedio: ${kpis.avgDays} días por tarea.` });
    }

    const overloaded = workload[0];
    if (overloaded && overloaded.overdue > 0) {
      out.push({ tone: 'bad', text: `${overloaded.name} concentra la carga: ${overloaded.open} abiertas, ${overloaded.overdue} vencidas.` });
    }

    return out.slice(0, 4);
  }, [throughput, kpis, selectedSprint, burndown, workload]);

  // ── KPI cards ──
  const kpiCards: KpiCardData[] = useMemo(() => {
    const pending = Math.max(0, kpis.total - kpis.completed);
    const completedStatus: StatusLevel =
      kpis.total === 0 ? 'attention' : kpis.completionRate >= COMPLETION_TARGET ? 'healthy' : kpis.completionRate >= 50 ? 'attention' : 'risk';
    const pendingStatus: StatusLevel = pending === 0 ? 'healthy' : pending <= 10 ? 'attention' : 'risk';
    const overdueStatus: StatusLevel = kpis.overdue === 0 ? 'healthy' : kpis.overdue <= 3 ? 'attention' : 'risk';
    const cycleStatus: StatusLevel = kpis.avgDays === 0 ? 'attention' : kpis.avgDays <= 7 ? 'healthy' : kpis.avgDays <= 14 ? 'attention' : 'risk';

    return [
      { label: 'TOTAL TAREAS', value: String(kpis.total), delta: kpis.total === 1 ? 'tarea registrada' : 'tareas registradas', status: 'healthy', icon: <ListChecks className="w-4 h-4" /> },
      { label: 'COMPLETADAS', value: String(kpis.completed), delta: kpis.total > 0 ? `${kpis.completionRate}% del total` : 'sin tareas', status: completedStatus, icon: <CheckCircle2 className="w-4 h-4" /> },
      { label: 'PENDIENTES', value: String(pending), delta: pending === 1 ? 'tarea por completar' : 'tareas por completar', status: pendingStatus, icon: <Clock className="w-4 h-4" /> },
      { label: 'VENCIDAS', value: String(kpis.overdue), delta: kpis.overdue === 1 ? 'pasó su fecha límite' : 'pasaron su fecha límite', status: overdueStatus, icon: <AlertTriangle className="w-4 h-4" /> },
      { label: 'TIEMPO DE CICLO', value: kpis.avgDays > 0 ? `${kpis.avgDays}d` : '—', delta: 'promedio para completar', status: cycleStatus, icon: <Gauge className="w-4 h-4" /> },
    ];
  }, [kpis]);

  const projectRanking = useMemo(() => {
    const healthOrder: Record<ProjectHealth, number> = { red: 0, yellow: 1, green: 2 };
    return [...projectHealthList]
      .sort((a, b) => {
        const h = healthOrder[a.health] - healthOrder[b.health];
        if (h !== 0) return h;
        return a.progress.percentage - b.progress.percentage;
      })
      .slice(0, 6);
  }, [projectHealthList]);

  const projectFilters = useMemo(() => {
    return [
      { label: 'Todos', active: selectedProject === null, count: projectList.length, onClick: () => setSelectedProject(null) },
      ...projectList.map((p) => ({ label: p.name, active: selectedProject === p.id_project, onClick: () => setSelectedProject(p.id_project) })),
    ];
  }, [projectList, selectedProject]);

  const exportCSV = () => {
    const rows = filteredTasks.map((t) => ({
      id: t.id_task, title: t.title, assigned_to: t.assigned_to ?? '',
      due_date: t.due_date ?? '', completed_at: t.completed_at ?? '', created_at: t.created_at,
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${String(r[h as keyof typeof r]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-tareas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Cargando reportes…</span>
      </div>
    );
  }

  const hero = statusBadge(portfolioStats.overallStatus);
  const burndownTitle = selectedSprint ? `Sprint · ${selectedSprint.name}` : 'Proyecto completo';

  return (
    <div className="flex flex-col h-full">
      <CommandBar
        actions={[
          { label: 'Descargar reporte', icon: <FileDown className="w-3.5 h-3.5" />, onClick: () => setExportDialogOpen(true), variant: 'primary' },
          { label: 'Exportar CSV', icon: <Download className="w-3.5 h-3.5" />, onClick: exportCSV },
          { label: 'Refrescar', icon: <RefreshCw className="w-3.5 h-3.5" />, onClick: refetchAll },
        ]}
        filters={projectFilters}
      />

      <ReportExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        projects={projectList}
        tasks={taskList}
        statuses={statuses}
        priorities={priorities}
        boards={boardList}
        warnings={warningList}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-[1600px]">
        {/* HERO */}
        <div className={`relative bg-card border border-border rounded-[6px] p-6 ring-1 ${hero.ring}`}>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-wider ${hero.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hero.dot}`} />
                {hero.label}
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <div className="text-[44px] leading-none font-bold text-foreground">{kpis.completionRate}%</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Tareas completadas<br />{kpis.completed} de {kpis.total}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                {insights.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground">Sin insights disponibles.</div>
                ) : (
                  insights.map((ins, i) => {
                    const toneColor = ins.tone === 'bad' ? 'text-red-600' : ins.tone === 'warn' ? 'text-amber-600' : 'text-emerald-600';
                    const Icon = ins.tone === 'bad' ? AlertTriangle : ins.tone === 'warn' ? TrendingDown : TrendingUp;
                    return (
                      <div key={i} className="flex items-start gap-2 text-[12px]">
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${toneColor}`} />
                        <span className="text-foreground">{ins.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 text-right min-w-[180px]">
              <div>
                <div className="text-[28px] leading-none font-semibold text-foreground">{portfolioStats.count}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{portfolioStats.count === 1 ? 'proyecto' : 'proyectos'}</div>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">{portfolioStats.greens} ok</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-muted-foreground">{portfolioStats.yellows} atención</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-muted-foreground">{portfolioStats.reds} riesgo</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpiCards.map((c) => {
            const s = statusBadge(c.status);
            return (
              <div key={c.label} className="bg-card border border-border rounded-[6px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground">{c.icon}{c.label}</div>
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} title={statusLabelByLevel(c.status)} />
                </div>
                <div className="text-[26px] font-bold text-foreground leading-tight tabular-nums">{c.value}</div>
                {c.delta && <div className="text-[11px] text-muted-foreground mt-1">{c.delta}</div>}
              </div>
            );
          })}
        </div>

        {/* BURNDOWN + FORECAST */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ChartCard
            className="lg:col-span-2"
            eyebrow="BURNDOWN"
            title={burndownTitle}
            icon={<TrendingDown className="w-3.5 h-3.5 text-primary" />}
            subtitle="Trabajo restante real vs línea ideal, con proyección por velocidad"
            right={
              <select
                value={selectedSprintId ?? ''}
                onChange={(e) => setSelectedSprintId(e.target.value ? Number(e.target.value) : null)}
                className="h-7 max-w-[180px] rounded-[4px] border border-border bg-card text-[11px] px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Proyecto completo</option>
                {sprintOptions.map((s) => (
                  <option key={s.id_sprint} value={s.id_sprint}>{s.name}</option>
                ))}
              </select>
            }
          >
            <BurndownChart result={burndown} />
          </ChartCard>

          <div className="bg-card border border-border rounded-[8px] p-4 flex flex-col">
            <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-3">Pronóstico del alcance</div>
            <div className="grid grid-cols-2 gap-3">
              <ForecastStat label="Alcance" value={burndown.scope} tone="neutral" />
              <ForecastStat label="Completadas" value={burndown.done} tone="good" />
              <ForecastStat label="Restantes" value={burndown.remaining} tone={burndown.remaining > 0 ? 'warn' : 'good'} />
              <ForecastStat label="Ideal hoy" value={burndown.idealNow} tone="neutral" />
            </div>
            <div className={`mt-4 rounded-[6px] border px-3 py-2.5 text-[12px] ${burndown.onTrack ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/30 bg-amber-500/10 text-amber-700'}`}>
              <div className="flex items-center gap-1.5 font-semibold">
                {burndown.onTrack ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {burndown.onTrack ? 'En ritmo' : 'Atrasado'}
              </div>
              <p className="mt-1 text-foreground/80">
                {burndown.remaining === 0
                  ? 'Todo el trabajo del alcance está completado.'
                  : burndown.projectedEndLabel
                  ? `Al ritmo actual (${burndown.ratePerDay.toFixed(1)} tareas/día) terminaría ~${burndown.projectedEndLabel}.`
                  : 'Sin completados recientes: no hay velocidad para proyectar un cierre.'}
              </p>
            </div>
          </div>
        </div>

        {/* VELOCITY + STATUS DONUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ChartCard
            className="lg:col-span-2"
            eyebrow={`VELOCIDAD · ${throughput.data.length} ${throughput.data.length === 1 ? 'SEMANA' : 'SEMANAS'}`}
            title="Tareas completadas por semana"
            icon={<Activity className="w-3.5 h-3.5 text-sky-500" />}
            subtitle={`Promedio ${throughput.avgPerWeek}/sem · mejor semana ${throughput.bestWeek}`}
            right={
              <div className="text-right">
                <div className="text-[20px] font-bold text-foreground leading-none tabular-nums">{throughput.recent}</div>
                <div className={`text-[11px] font-medium ${throughput.recent >= throughput.prior ? 'text-emerald-600' : 'text-red-600'}`}>{throughput.deltaPct} vs anterior</div>
              </div>
            }
          >
            <VelocityChart result={throughput} />
          </ChartCard>

          <ChartCard eyebrow="ESTADO" title="Distribución de tareas" icon={<Layers className="w-3.5 h-3.5 text-violet-500" />}>
            <TaskStatusDonut data={statusDist} total={kpis.total} size={150} />
          </ChartCard>
        </div>

        {/* CFD + PRIORITY */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ChartCard
            className="lg:col-span-2"
            eyebrow="FLUJO ACUMULADO (CFD)"
            title="Llegadas vs completadas en el tiempo"
            icon={<Layers className="w-3.5 h-3.5 text-emerald-600" />}
            subtitle="La banda ámbar es trabajo en curso (WIP): si crece, se está acumulando trabajo"
          >
            <CumulativeFlowChart data={cfd} />
          </ChartCard>

          <ChartCard eyebrow="PRIORIDAD" title="Tareas abiertas por prioridad" icon={<Flame className="w-3.5 h-3.5 text-orange-500" />}>
            <DistributionBars data={priorityDist} emptyMessage="Sin tareas abiertas con prioridad." />
          </ChartCard>
        </div>

        {/* WORKLOAD + RANKING */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ChartCard
            className="lg:col-span-2"
            eyebrow="CARGA DEL EQUIPO"
            title="Tareas por responsable"
            icon={<Users className="w-3.5 h-3.5 text-primary" />}
            subtitle="Quién lleva más trabajo abierto y cuánto va vencido"
          >
            <WorkloadChart rows={workload} />
          </ChartCard>

          <div className="bg-card border border-border rounded-[8px] p-4">
            <div className="text-[10px] font-bold tracking-wider text-muted-foreground mb-3 uppercase">Atención prioritaria</div>
            {projectRanking.length === 0 ? (
              <div className="text-[12px] text-muted-foreground py-4 text-center">Sin proyectos.</div>
            ) : (
              <div className="space-y-2">
                {projectRanking.map(({ project, progress, health, overdue }) => {
                  const dotColor = health === 'red' ? 'bg-red-500' : health === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <div key={project.id_project} className="flex items-center gap-2.5 py-1.5 border-b border-border last:border-b-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground truncate">{project.name}</div>
                        <div className="text-[10px] text-muted-foreground">{progress.percentage}% · {overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ForecastStat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-[6px] bg-secondary/40 border border-border px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-[22px] font-bold leading-tight tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
