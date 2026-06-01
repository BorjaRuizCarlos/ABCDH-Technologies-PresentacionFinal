import { useEffect, useMemo, useState } from 'react';
import { FileText, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { generateReport, type ReportFormat } from '../utils/reportExport';
import type {
  ApiProject, ApiTask, ApiTaskStatus, ApiTaskPriority, ApiBoard, ApiTaskWarning,
} from '../../services/types';

interface ReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ApiProject[];
  tasks: ApiTask[];
  statuses: ApiTaskStatus[];
  priorities: ApiTaskPriority[];
  boards: ApiBoard[];
  warnings: ApiTaskWarning[];
}

export function ReportExportDialog({
  open, onOpenChange, projects, tasks, statuses, priorities, boards, warnings,
}: ReportExportDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [includeTaskList, setIncludeTaskList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(projects.map((p) => p.id_project)));
      setError(null);
    }
  }, [open, projects]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(projects.map((p) => p.id_project)));
  const selectNone = () => setSelectedIds(new Set());

  const selectedCount = selectedIds.size;
  const canGenerate = selectedCount > 0 && !generating;

  const handleGenerate = async () => {
    setError(null);
    if (selectedCount === 0) {
      setError('Selecciona al menos un proyecto.');
      return;
    }
    setGenerating(true);
    try {
      // Defer so the spinner can render before the heavy sync export work
      await new Promise((r) => setTimeout(r, 0));
      generateReport({
        projects,
        tasks,
        statuses,
        priorities,
        boards,
        warnings,
        selectedProjectIds: Array.from(selectedIds),
        format,
        includeTaskList,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el reporte.');
    } finally {
      setGenerating(false);
    }
  };

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Descargar reporte</DialogTitle>
          <DialogDescription className="text-[12px]">
            Selecciona proyectos y formato. El reporte incluye KPIs y métricas agregadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <div className="text-[11px] font-medium text-foreground mb-2">Formato</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex items-center gap-2 px-3 py-2 rounded-[4px] border text-[12px] transition-colors ${
                  format === 'pdf'
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <FileText className="w-4 h-4" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`flex items-center gap-2 px-3 py-2 rounded-[4px] border text-[12px] transition-colors ${
                  format === 'xlsx'
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel (XLSX)
              </button>
            </div>
          </div>

          {/* Project selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-foreground">
                Proyectos ({selectedCount}/{projects.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  Todos
                </button>
                <span className="text-[11px] text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-[11px] text-muted-foreground hover:underline"
                >
                  Ninguno
                </button>
              </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto border border-border rounded-[4px] divide-y divide-border">
              {sortedProjects.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-muted-foreground text-center">
                  No hay proyectos disponibles.
                </div>
              ) : (
                sortedProjects.map((p) => {
                  const checked = selectedIds.has(p.id_project);
                  return (
                    <label
                      key={p.id_project}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(p.id_project)}
                      />
                      <span className="text-[12px] text-foreground flex-1 truncate">
                        {p.name}
                      </span>
                      {p.status && (
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {p.status}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="text-[11px] font-medium text-foreground mb-2">Contenido</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeTaskList}
                onCheckedChange={(v) => setIncludeTaskList(v === true)}
              />
              <span className="text-[12px] text-foreground">
                Incluir listado detallado de tareas
              </span>
            </label>
          </div>

          {error && (
            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-[4px] px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={generating}
            className="px-3 py-1.5 rounded-[4px] border border-border bg-card text-foreground hover:bg-accent text-[12px] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="px-3 py-1.5 rounded-[4px] bg-primary text-primary-foreground hover:bg-primary-hover text-[12px] flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Generar reporte
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
