import { useState, useMemo, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { tasksService } from '../../services';
import type { ApiTask, ApiSprint } from '../../services';

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

interface ScrumPokerPanelProps {
  tasks: ApiTask[] | null;
  sprints: ApiSprint[];
  userMap: Map<number, string>;
  canEdit: boolean;
}

export function ScrumPokerPanel({ tasks, sprints, userMap, canEdit }: ScrumPokerPanelProps) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [localTasks, setLocalTasks] = useState<ApiTask[] | null>(tasks);

  // Sync local copy when parent passes new tasks (e.g. after tab change or new task created)
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const sprintMap = useMemo(
    () => new Map(sprints.map((s) => [s.id_sprint, s.name])),
    [sprints],
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
    setSaving(true);
    try {
      const updated = await tasksService.update(taskId, {
        scrum_number: selectedValue || null,
      });
      setLocalTasks((prev) => prev?.map((t) => (t.id_task === taskId ? updated : t)) ?? null);
      setEditingTaskId(null);
      setSelectedValue('');
      toast.success('Story points actualizados');
    } catch {
      toast.error('No se pudo actualizar los story points');
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

  return (
    <div className="space-y-2">
      {localTasks.map((task) => {
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
  );
}
