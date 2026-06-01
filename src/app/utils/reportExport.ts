import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  ApiProject,
  ApiTask,
  ApiTaskStatus,
  ApiTaskPriority,
  ApiBoard,
  ApiTaskWarning,
} from '../../services/types';

export type ReportFormat = 'pdf' | 'xlsx';

export interface ReportInput {
  projects: ApiProject[];
  tasks: ApiTask[];
  statuses: ApiTaskStatus[];
  priorities: ApiTaskPriority[];
  boards: ApiBoard[];
  warnings: ApiTaskWarning[];
  selectedProjectIds: number[];
  format: ReportFormat;
  includeTaskList: boolean;
}

export interface ProjectKPIs {
  projectId: number;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  avgDays: number;
  activeWarnings: number;
  statusBreakdown: { name: string; count: number }[];
  priorityBreakdown: { name: string; count: number }[];
}

function buildBoardProjectMap(boards: ApiBoard[]): Map<number, number> {
  const m = new Map<number, number>();
  boards.forEach((b) => m.set(b.id_board, b.project));
  return m;
}

function computeProjectKPIs(
  project: ApiProject,
  tasks: ApiTask[],
  statuses: ApiTaskStatus[],
  priorities: ApiTaskPriority[],
  boards: ApiBoard[],
  warnings: ApiTaskWarning[],
): ProjectKPIs {
  const boardProjectMap = buildBoardProjectMap(boards);
  const projectTasks = tasks.filter((t) => {
    if (t.project === project.id_project) return true;
    return boardProjectMap.get(t.board ?? 0) === project.id_project;
  });

  const now = new Date();
  const totalTasks = projectTasks.length;
  const completedTasks = projectTasks.filter((t) => t.completed_at != null).length;
  const overdueTasks = projectTasks.filter(
    (t) => !t.completed_at && t.due_date && new Date(t.due_date) < now,
  ).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const completedWithDates = projectTasks.filter((t) => t.completed_at && t.created_at);
  const avgDays = completedWithDates.length > 0
    ? Math.round(
        completedWithDates.reduce((sum, t) => {
          const created = new Date(t.created_at).getTime();
          const completed = new Date(t.completed_at!).getTime();
          return sum + (completed - created) / (1000 * 60 * 60 * 24);
        }, 0) / completedWithDates.length,
      )
    : 0;

  const taskIds = new Set(projectTasks.map((t) => t.id_task));
  const projectWarnings = warnings.filter((w) => taskIds.has(w.task));
  const activeWarnings = projectWarnings.filter((w) => w.status === 'active').length;

  const statusCounts = new Map<number, number>();
  for (const t of projectTasks) {
    const sid = t.status ?? 0;
    statusCounts.set(sid, (statusCounts.get(sid) ?? 0) + 1);
  }
  const statusBreakdown = statuses
    .map((s) => ({ name: s.name, count: statusCounts.get(s.id_status) ?? 0 }))
    .filter((s) => s.count > 0);

  const priorityCounts = new Map<number, number>();
  for (const t of projectTasks) {
    const pid = t.priority ?? 0;
    priorityCounts.set(pid, (priorityCounts.get(pid) ?? 0) + 1);
  }
  const priorityBreakdown = priorities
    .map((p) => ({ name: p.name, count: priorityCounts.get(p.id_priority) ?? 0 }))
    .filter((p) => p.count > 0);

  return {
    projectId: project.id_project,
    projectName: project.name,
    totalTasks,
    completedTasks,
    overdueTasks,
    completionRate,
    avgDays,
    activeWarnings,
    statusBreakdown,
    priorityBreakdown,
  };
}

function tasksForProject(
  projectId: number,
  tasks: ApiTask[],
  boards: ApiBoard[],
): ApiTask[] {
  const boardProjectMap = buildBoardProjectMap(boards);
  return tasks.filter((t) => {
    if (t.project === projectId) return true;
    return t.board != null && boardProjectMap.get(t.board) === projectId;
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function exportPDF(input: ReportInput, kpisList: ProjectKPIs[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const generatedAt = new Date().toLocaleString();

  doc.setFontSize(18);
  doc.setTextColor(40, 40, 40);
  doc.text('Reporte de Proyectos', 40, 50);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado: ${generatedAt}`, 40, 68);
  doc.text(`Proyectos incluidos: ${kpisList.length}`, 40, 82);

  // Aggregate KPIs (totals across selected projects)
  const totals = kpisList.reduce(
    (acc, k) => {
      acc.totalTasks += k.totalTasks;
      acc.completedTasks += k.completedTasks;
      acc.overdueTasks += k.overdueTasks;
      acc.activeWarnings += k.activeWarnings;
      return acc;
    },
    { totalTasks: 0, completedTasks: 0, overdueTasks: 0, activeWarnings: 0 },
  );
  const aggCompletionRate =
    totals.totalTasks > 0 ? Math.round((totals.completedTasks / totals.totalTasks) * 100) : 0;

  autoTable(doc, {
    startY: 100,
    head: [['Métrica Global', 'Valor']],
    body: [
      ['Total de tareas', String(totals.totalTasks)],
      ['Completadas', String(totals.completedTasks)],
      ['Vencidas', String(totals.overdueTasks)],
      ['Tasa de completado', `${aggCompletionRate}%`],
      ['Warnings activos', String(totals.activeWarnings)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [212, 25, 44], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9 },
  });

  // Per-project KPIs table
  let cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  cursorY += 24;
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('KPIs por Proyecto', 40, cursorY);

  autoTable(doc, {
    startY: cursorY + 8,
    head: [['Proyecto', 'Total', 'Completadas', 'Vencidas', '% Comp.', 'Días prom.', 'Warnings']],
    body: kpisList.map((k) => [
      k.projectName,
      String(k.totalTasks),
      String(k.completedTasks),
      String(k.overdueTasks),
      `${k.completionRate}%`,
      `${k.avgDays}d`,
      String(k.activeWarnings),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 140 } },
  });

  // Per-project detail sections
  for (const k of kpisList) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text(`Proyecto: ${k.projectName}`, 40, 50);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Tareas: ${k.totalTasks} · Completadas: ${k.completedTasks} · Vencidas: ${k.overdueTasks}`, 40, 66);
    doc.text(`Tasa de completado: ${k.completionRate}% · Tiempo promedio: ${k.avgDays} días`, 40, 80);

    autoTable(doc, {
      startY: 100,
      head: [['Estado', 'Cantidad']],
      body: k.statusBreakdown.length
        ? k.statusBreakdown.map((s) => [s.name, String(s.count)])
        : [['Sin datos', '0']],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
    });

    const afterStatusY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    autoTable(doc, {
      startY: afterStatusY + 16,
      head: [['Prioridad', 'Cantidad']],
      body: k.priorityBreakdown.length
        ? k.priorityBreakdown.map((p) => [p.name, String(p.count)])
        : [['Sin datos', '0']],
      theme: 'striped',
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
    });

    if (input.includeTaskList) {
      const projectTasks = tasksForProject(k.projectId, input.tasks, input.boards);
      const afterPriorityY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300;
      autoTable(doc, {
        startY: afterPriorityY + 20,
        head: [['ID', 'Título', 'Estado', 'Prioridad', 'Vence', 'Completada']],
        body: projectTasks.slice(0, 200).map((t) => [
          String(t.id_task),
          (t.title ?? '').slice(0, 60),
          input.statuses.find((s) => s.id_status === t.status)?.name ?? '',
          input.priorities.find((p) => p.id_priority === t.priority)?.name ?? '',
          formatDate(t.due_date),
          formatDate(t.completed_at),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 1: { cellWidth: 180 } },
      });
    }
  }

  const totalPages = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${totalPages}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(`reporte-proyectos-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportXLSX(input: ReportInput, kpisList: ProjectKPIs[]): void {
  const wb = XLSX.utils.book_new();

  const totals = kpisList.reduce(
    (acc, k) => {
      acc.totalTasks += k.totalTasks;
      acc.completedTasks += k.completedTasks;
      acc.overdueTasks += k.overdueTasks;
      acc.activeWarnings += k.activeWarnings;
      return acc;
    },
    { totalTasks: 0, completedTasks: 0, overdueTasks: 0, activeWarnings: 0 },
  );
  const aggCompletionRate =
    totals.totalTasks > 0 ? Math.round((totals.completedTasks / totals.totalTasks) * 100) : 0;

  const summaryRows = [
    { Metrica: 'Generado', Valor: new Date().toLocaleString() },
    { Metrica: 'Proyectos incluidos', Valor: kpisList.length },
    { Metrica: 'Total de tareas', Valor: totals.totalTasks },
    { Metrica: 'Completadas', Valor: totals.completedTasks },
    { Metrica: 'Vencidas', Valor: totals.overdueTasks },
    { Metrica: 'Tasa de completado (%)', Valor: aggCompletionRate },
    { Metrica: 'Warnings activos', Valor: totals.activeWarnings },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');

  const kpiRows = kpisList.map((k) => ({
    Proyecto: k.projectName,
    Total: k.totalTasks,
    Completadas: k.completedTasks,
    Vencidas: k.overdueTasks,
    'Tasa (%)': k.completionRate,
    'Días promedio': k.avgDays,
    'Warnings activos': k.activeWarnings,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'KPIs por proyecto');

  const statusRows: Record<string, unknown>[] = [];
  for (const k of kpisList) {
    for (const s of k.statusBreakdown) {
      statusRows.push({ Proyecto: k.projectName, Estado: s.name, Cantidad: s.count });
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(statusRows.length ? statusRows : [{ Proyecto: '', Estado: '', Cantidad: '' }]),
    'Estados',
  );

  const priorityRows: Record<string, unknown>[] = [];
  for (const k of kpisList) {
    for (const p of k.priorityBreakdown) {
      priorityRows.push({ Proyecto: k.projectName, Prioridad: p.name, Cantidad: p.count });
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      priorityRows.length ? priorityRows : [{ Proyecto: '', Prioridad: '', Cantidad: '' }],
    ),
    'Prioridades',
  );

  if (input.includeTaskList) {
    const taskRows: Record<string, unknown>[] = [];
    for (const k of kpisList) {
      const projectTasks = tasksForProject(k.projectId, input.tasks, input.boards);
      for (const t of projectTasks) {
        taskRows.push({
          Proyecto: k.projectName,
          ID: t.id_task,
          Titulo: t.title,
          Estado: input.statuses.find((s) => s.id_status === t.status)?.name ?? '',
          Prioridad: input.priorities.find((p) => p.id_priority === t.priority)?.name ?? '',
          Creada: formatDate(t.created_at),
          Vence: formatDate(t.due_date),
          Completada: formatDate(t.completed_at),
        });
      }
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        taskRows.length
          ? taskRows
          : [{ Proyecto: '', ID: '', Titulo: '', Estado: '', Prioridad: '', Creada: '', Vence: '', Completada: '' }],
      ),
      'Tareas',
    );
  }

  XLSX.writeFile(wb, `reporte-proyectos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function generateReport(input: ReportInput): void {
  const selected = input.projects.filter((p) => input.selectedProjectIds.includes(p.id_project));
  const kpisList = selected.map((p) =>
    computeProjectKPIs(p, input.tasks, input.statuses, input.priorities, input.boards, input.warnings),
  );

  if (input.format === 'pdf') {
    exportPDF(input, kpisList);
  } else {
    exportXLSX(input, kpisList);
  }
}
