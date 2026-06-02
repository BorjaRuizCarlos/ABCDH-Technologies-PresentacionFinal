import { useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, ExternalLink,
  RefreshCw, Loader2, Search, Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { StatusBadge } from '../components/StatusBadge';
import { useApiBoards, useApiProjectMembers, useApiRoles, useApiTaskWarnings, useApiTasks } from '../hooks/useProjectData';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAuth } from '../context/AuthContext';
import { getProjectCapabilities, getProjectRoleIds } from '../utils/projectPermissions';
import { tasksService } from '../../services';

type SeverityFilter = 'all' | 'active' | 'resolved';

export default function Alerts() {
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const { data: warnings, loading, refetch } = useApiTaskWarnings();
  const { data: tasks } = useApiTasks();
  const { data: boards } = useApiBoards();
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id ?? 0);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }, [user]);
  const { data: myMemberships } = useApiProjectMembers(undefined, currentUserId ?? undefined);
  const { data: roles } = useApiRoles();

  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarning, setSelectedWarning] = useState<number | null>(null);
  const [deletingWarningId, setDeletingWarningId] = useState<number | null>(null);

  const boardProjectMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const board of boards ?? []) {
      map.set(board.id_board, board.project);
    }
    return map;
  }, [boards]);

  // Build task lookup
  const taskMap = useMemo(() => {
    const map = new Map<number, { title: string; board: number; project: number | null }>();
    for (const t of tasks ?? []) {
      const boardId = t.board ?? 0;
      map.set(t.id_task, {
        title: t.title,
        board: boardId,
        project: boardProjectMap.get(boardId) ?? null,
      });
    }
    return map;
  }, [tasks, boardProjectMap]);

  const projectDeletePermissions = useMemo(() => {
    const map = new Map<number, boolean>();
    if (!myMemberships || !roles) return map;
    const roleIds = getProjectRoleIds(roles);
    for (const membership of myMemberships) {
      const capabilities = getProjectCapabilities(membership, null, roleIds);
      map.set(membership.project, capabilities.canManageTasks);
    }
    return map;
  }, [myMemberships, roles]);

  const canDeleteWarningInProject = (projectId: number | null) => {
    if (projectId == null) return false;
    return projectDeletePermissions.get(projectId) ?? false;
  };

  const handleDeleteWarning = async (warningId: number, projectId: number | null) => {
    if (!canDeleteWarningInProject(projectId)) {
      toast.error('Solo PM y PO pueden eliminar alertas de tareas en este proyecto.');
      return;
    }

    try {
      setDeletingWarningId(warningId);
      await tasksService.deleteWarning(warningId);
      if (selectedWarning === warningId) {
        setSelectedWarning(null);
      }
      refetch();
      toast.success('Alerta eliminada.');
    } catch {
      toast.error('No se pudo eliminar la alerta.');
    } finally {
      setDeletingWarningId(null);
    }
  };

  // Filtered warnings
  const filtered = useMemo(() => {
    let w = warnings ?? [];
    if (severity !== 'all') {
      w = w.filter((wr) => wr.status === severity);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      w = w.filter((wr) => {
        const taskTitle = taskMap.get(wr.task)?.title ?? '';
        return wr.message.toLowerCase().includes(q) || taskTitle.toLowerCase().includes(q);
      });
    }
    return w.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [warnings, severity, searchQuery, taskMap]);

  // KPI counts
  const counts = useMemo(() => {
    const all = warnings ?? [];
    return {
      total: all.length,
      active: all.filter((w) => w.status === 'active').length,
      resolved: all.filter((w) => w.status === 'resolved').length,
    };
  }, [warnings]);

  // Format relative time
  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `hace ${days}d`;
  };

  // Date grouping
  const dateGroup = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86_400_000);
    const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
    if (d >= today) return 'Hoy';
    if (d >= yesterday) return 'Ayer';
    if (d >= weekAgo) return 'Esta semana';
    return 'Anterior';
  };

  const groupedWarnings = useMemo(() => {
    const groups: { label: string; items: typeof filtered }[] = [];
    const seen = new Map<string, typeof filtered>();
    for (const w of filtered) {
      const g = dateGroup(w.created_at);
      if (!seen.has(g)) { seen.set(g, []); groups.push({ label: g, items: seen.get(g)! }); }
      seen.get(g)!.push(w);
    }
    return groups;
  }, [filtered]);

  const filterChips: { value: SeverityFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: counts.total },
    { value: 'active', label: 'Activos', count: counts.active },
    { value: 'resolved', label: 'Resueltos', count: counts.resolved },
  ];

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1600px] min-h-full flex flex-col gap-4">

      {/* ── Header sobre el lienzo (shell unificado) ──────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Alertas</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">Warnings de tareas: vencimientos, bloqueos y resoluciones.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar alertas…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar alertas"
                className="w-full h-9 bg-surface-secondary border border-border rounded-sm pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/60 transition-[box-shadow,border-color] focus:outline-none focus:ring-2 focus:ring-ring focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 h-9 text-[12px] font-medium text-foreground transition-all [transition-timing-function:var(--ease-out)] hover:bg-accent active:scale-[0.98] shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refrescar
            </button>
          </div>
        </div>

        {/* Filter chips (conteos fusionados aquí; sin barra de stats duplicada) */}
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => {
            const active = severity === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSeverity(chip.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${active ? 'bg-secondary text-foreground border border-border' : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'}`}
              >
                {chip.label}
                <span className={`tabular-nums text-[10px] ${active ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                <div className="w-4 h-4 rounded-full bg-surface-secondary animate-pulse mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded-sm bg-surface-secondary animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded-sm bg-surface-secondary animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg flex flex-col items-center justify-center py-20 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
          <span className="text-[13px]">
            {searchQuery ? 'Sin resultados para la búsqueda' : 'No hay alertas'}
          </span>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto scrollbar-app">
            {groupedWarnings.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-surface-secondary/80 backdrop-blur-sm border-b border-border">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{group.label}</span>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((w, wi) => {
                    const taskInfo = taskMap.get(w.task);
                    const isActive = w.status === 'active';
                    const isSelected = selectedWarning === w.id_warning;
                    const canDeleteWarning = canDeleteWarningInProject(taskInfo?.project ?? null);
                    const isDeleting = deletingWarningId === w.id_warning;

                    return (
                      <motion.button
                        key={w.id_warning}
                        initial={reduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : Math.min(wi, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => setSelectedWarning(isSelected ? null : w.id_warning)}
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-secondary ${
                          isSelected ? 'bg-surface-secondary' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {isActive ? (
                              <AlertTriangle className="w-4 h-4 text-warning" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-success" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[12px] font-medium text-foreground">
                                {w.message}
                              </span>
                              <StatusBadge
                                status={isActive ? 'warning' : 'success'}
                                text={isActive ? 'Activo' : 'Resuelto'}
                                size="sm"
                              />
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              {taskInfo && (
                                <span className="flex items-center gap-1 truncate max-w-[200px]">
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  Tarea: {taskInfo.title}
                                </span>
                              )}
                              <span>{relativeTime(w.created_at)}</span>
                              {w.resolved_at && (
                                <span className="text-success">
                                  Resuelto {relativeTime(w.resolved_at)}
                                </span>
                              )}
                            </div>
                            {/* Expanded detail */}
                            {isSelected && (
                              <div className="mt-2 p-3 bg-surface-secondary/50 border border-border rounded-md text-[11px] space-y-1">
                                <div className="flex items-center justify-end mb-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleDeleteWarning(w.id_warning, taskInfo?.project ?? null);
                                    }}
                                    disabled={!canDeleteWarning || isDeleting}
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-destructive/20"
                                  >
                                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Eliminar alerta
                                  </button>
                                </div>
                                <div><span className="text-muted-foreground">ID:</span> {w.id_warning}</div>
                                <div><span className="text-muted-foreground">Tarea ID:</span> {w.task}</div>
                                <div><span className="text-muted-foreground">Creado:</span> {new Date(w.created_at).toLocaleString('es-ES')}</div>
                                {w.resolved_at && (
                                  <div><span className="text-muted-foreground">Resuelto:</span> {new Date(w.resolved_at).toLocaleString('es-ES')}</div>
                                )}
                                {w.resolved_in_push && (
                                  <div><span className="text-muted-foreground">Push de resolución:</span> #{w.resolved_in_push}</div>
                                )}
                                {!canDeleteWarning && (
                                  <div className="text-muted-foreground">Solo PM y PO del proyecto pueden eliminar esta alerta.</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
