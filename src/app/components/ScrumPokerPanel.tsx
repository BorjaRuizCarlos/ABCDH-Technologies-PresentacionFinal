import { useState, useMemo, useEffect } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { tasksService, ApiRequestError } from '../../services';
import type { ApiTask, ApiSprint, ApiTag } from '../../services';

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
type EstimationFilter = 'all' | 'estimated' | 'unestimated';

// Turn a DRF error body ({ detail } or per-field arrays) into a readable line.
function formatApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiRequestError)) return fallback;
  const body = err.body as Record<string, unknown> | undefined;
  if (body?.detail) return String(body.detail);
  if (body && typeof body === 'object') {
    const parts: string[] = [];
    for (const [field, value] of Object.entries(body)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      parts.push(field === 'non_field_errors' ? text : `${field}: ${text}`);
    }
    if (parts.length > 0) return parts.join(' · ');
  }
  return err.message || fallback;
}

interface ScrumPokerPanelProps {
  tasks: ApiTask[] | null;
  sprints: ApiSprint[];
  userMap: Map<number, string>;
  canEdit: boolean;
  tags?: ApiTag[];
  onTasksUpdated?: () => void;
}

export function ScrumPokerPanel({ tasks, sprints, userMap, canEdit, tags = [], onTasksUpdated }: ScrumPokerPanelProps) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [localTasks, setLocalTasks] = useState<ApiTask[] | null>(tasks);
  const [estimationFilter, setEstimationFilter] = useState<EstimationFilter>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // Sync local copy when parent passes new tasks (e.g. after tab change or new task created)
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const sprintMap = useMemo(
    () => new Map(sprints.map((s) => [s.id_sprint, s.name])),
    [sprints],
  );

  const filteredTasks = useMemo(() => {
    if (!localTasks) return null;
    return localTasks.filter((task) => {
      const hasEstimate = task.scrum_number != null && String(task.scrum_number).trim() !== '';
      if (estimationFilter === 'estimated' && !hasEstimate) return false;
      if (estimationFilter === 'unestimated' && hasEstimate) return false;
      if (selectedTagIds.length > 0 && !selectedTagIds.every((id) => task.tags.includes(id))) return false;
      return true;
    });
  }, [localTasks, estimationFilter, selectedTagIds]);

  const unestimatedCount = useMemo(
    () => (localTasks ?? []).filter((t) => t.scrum_number == null || String(t.scrum_number).trim() === '').length,
    [localTasks],
  );

  const startEdit = (task: ApiTask) => {
    if (!canEdit) return;
    setEditingTaskId(task.id_task);
    setSelectedValue(task.scrum_number != null ? String(task.scrum_number) : '');
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setSelectedValue('');
  };

  const saveEdit = async (taskId: number) => {
    const nextValue = selectedValue || null;
    setSaving(true);
    try {
      const updated = await tasksService.update(taskId, { scrum_number: nextValue });
      // Merge over the previous task so the new value always reflects, even if the
      // backend response omits scrum_number for some tasks.
      setLocalTasks((prev) => prev?.map((t) => (t.id_task === taskId ? { ...t, ...updated, scrum_number: nextValue } : t)) ?? null);
      setEditingTaskId(null);
      setSelectedValue('');
      onTasksUpdated?.();
      toast.success('Story points actualizados');
    } catch (err) {
      // Surface the real reason — the backend often rejects updates to tasks in a
      // sprint or already completed (e.g. date validation), which we can't see otherwise.
      toast.error(formatApiError(err, 'No se pudo actualizar los story points'));
    } finally {
      setSaving(false);
    }
  };

  if (!localTasks) {
    return (
      <div className="py-10 text-center text-muted-foreground text-[12px]">
        Cargando tareas...
      </div>
    );
  }

  if (localTasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[12px] text-muted-foreground">No hay tareas en este proyecto todavía.</p>
      </div>
    );
  }

  const visibleTasks = filteredTasks ?? [];

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-border bg-surface-secondary/30 px-3 py-2">
        <div className="inline-flex items-center rounded-[3px] border border-border p-0.5">
          {([
            { v: 'all', label: 'Todas' },
            { v: 'unestimated', label: `Sin estimar${unestimatedCount > 0 ? ` (${unestimatedCount})` : ''}` },
            { v: 'estimated', label: 'Estimadas' },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setEstimationFilter(v)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-[2px] transition-colors ${
                estimationFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id_tag);
              return (
                <button
                  key={tag.id_tag}
                  type="button"
                  onClick={() => setSelectedTagIds((cur) => active ? cur.filter((id) => id !== tag.id_tag) : [...cur, tag.id_tag])}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color || '#56697f' }} />
                  {tag.name}
                  {active && <Check className="w-2.5 h-2.5" />}
                </button>
              );
            })}
          </div>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground">{visibleTasks.length} tarea{visibleTasks.length === 1 ? '' : 's'}</span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-muted-foreground">No hay tareas que coincidan con los filtros.</div>
      ) : (
      <div className="space-y-2">
      {visibleTasks.map((task) => {
        const isEditing = editingTaskId === task.id_task;
        const sprintName = task.sprint != null ? sprintMap.get(task.sprint) : null;
        const assignedName = task.assigned_to != null ? (userMap.get(task.assigned_to) ?? `#${task.assigned_to}`) : null;

        return (
          <div
            key={task.id_task}
            className={`rounded-[5px] border bg-card p-3 transition-colors ${isEditing ? 'border-primary/40' : 'border-border'}`}
          >
            {/* Row header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-foreground truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {sprintName && (
                    <span className="text-[10px] text-muted-foreground bg-surface-secondary px-1.5 py-0.5 rounded-[3px]">
                      {sprintName}
                    </span>
                  )}
                  {!sprintName && (
                    <span className="text-[10px] text-muted-foreground">Backlog</span>
                  )}
                  {assignedName && (
                    <span className="text-[10px] text-muted-foreground">· {assignedName}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {task.scrum_number ? (
                  <span className="inline-flex items-center justify-center h-9 min-w-[36px] px-2.5 rounded-full bg-primary/10 text-primary text-[16px] font-bold">
                    {task.scrum_number}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
                {canEdit && !isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(task)}
                    className="p-1 rounded-[3px] text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors"
                    title="Editar story points"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {isEditing && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="p-1 rounded-[3px] text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors"
                    title="Cancelar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Edit section */}
            {isEditing && (
              <div className="mt-3 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">Selecciona los story points</p>
                <div className="flex flex-wrap gap-2">
                  {FIBONACCI.map((value) => {
                    const strVal = String(value);
                    const active = selectedValue === strVal;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelectedValue(active ? '' : strVal)}
                        className={`w-10 h-10 rounded-[4px] border text-[13px] font-bold transition-colors ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    {selectedValue ? `Seleccionado: ${selectedValue} pts` : 'Ningún valor seleccionado'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="h-7 px-3 border border-border rounded-[3px] text-[11px] hover:bg-surface-secondary transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit(task.id_task)}
                      disabled={saving}
                      className="h-7 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px] disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
      )}
    </div>
  );
}
