import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useApiBoards, useApiTaskAssignments, useApiTasks, useApiTaskWarnings } from '../hooks/useProjectData';
import { tasksService } from '../../services';
import type { ApiTask, ApiTaskPriority, ApiTaskStatus, ApiTaskAssignment } from '../../services';
import { TaskDetailPanel, TASK_REOPEN_ID_STORAGE_KEY, TASK_REOPEN_PATH_STORAGE_KEY } from './TaskDetailPanel';
import CreateSprintModal from './CreateSprintModal';
import { TaskAssigneePicker } from './TaskAssigneePicker';
import { DatePickerField } from './DatePickerField';
import { useAuth } from '../context/AuthContext';
import { sprintsService } from '../../services';
import { formatProjectDate } from '../utils/projectDates';

interface ProjectTasksWorkspaceProps {
  projectId: number;
  userMap: Map<number, string>;
  assignableUsers: Array<{ id: number; name: string }>;
  canCreateTasks: boolean;
  canCreateBoards: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canCreateSprints?: boolean;
  initialTaskId?: number | null;
  onInitialTaskHandled?: (taskId: number) => void;
}

interface OrderedColumn {
  name: string;
  status: ApiTaskStatus | null;
  tasks: ApiTask[];
  isMissing: boolean;
}

const STATUS_ORDER = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
const DONE_STATUS_NAMES = new Set(['done', 'completada', 'completado']);

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function summarizeAssignedNames(assignedNames: string[]) {
  if (assignedNames.length === 0) return 'Sin asignar';
  if (assignedNames.length <= 2) return assignedNames.join(', ');
  return `${assignedNames.slice(0, 2).join(', ')} +${assignedNames.length - 2}`;
}

function getTaskStatusColor(statusName?: string | null) {
  const normalized = (statusName ?? '').trim().toLowerCase();
  if (normalized.includes('backlog')) return '#64748b';
  if (normalized.includes('to do') || normalized.includes('por hacer')) return '#0ea5e9';
  if (normalized.includes('progress') || normalized.includes('progreso')) return '#f59e0b';
  if (normalized.includes('review') || normalized.includes('revision') || normalized.includes('revisión')) return '#8b5cf6';
  if (normalized.includes('done') || normalized.includes('completad') || normalized.includes('finalizad')) return '#22c55e';
  if (normalized.includes('block') || normalized.includes('bloque')) return '#ef4444';
  return '#14b8a6';
}

function getPriorityTone(priority?: ApiTaskPriority | null) {
  if (!priority) {
    return 'bg-secondary text-muted-foreground border border-border';
  }

  const normalized = priority.name.trim().toLowerCase();
  if (normalized.includes('crit')) return 'bg-destructive/10 text-destructive border border-destructive/20';
  if (normalized.includes('alta')) return 'bg-warning/15 text-warning border border-warning/20';
  if (normalized.includes('media')) return 'bg-info/15 text-info border border-info/20';
  if (normalized.includes('baja')) return 'bg-success/15 text-success border border-success/20';

  switch (priority.level) {
    case 1:
      return 'bg-destructive/10 text-destructive border border-destructive/20';
    case 2:
      return 'bg-warning/15 text-warning border border-warning/20';
    case 3:
      return 'bg-info/15 text-info border border-info/20';
    default:
      return 'bg-success/15 text-success border border-success/20';
  }
}

function priorityDotColor(level: number) {
  if (level <= 1) return 'bg-destructive';
  if (level === 2) return 'bg-warning';
  if (level === 3) return 'bg-info';
  return 'bg-success';
}

function TaskCard({
  task,
  priorities,
  assignedNames,
  assignedToCurrentUser,
  warningCount = 0,
  statusName,
  onOpen,
  draggable,
}: {
  task: ApiTask;
  priorities: ApiTaskPriority[];
  assignedNames: string[];
  assignedToCurrentUser: boolean;
  warningCount?: number;
  statusName?: string;
  onOpen: (task: ApiTask) => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id_task,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const prio = priorities.find((p) => p.id_priority === task.priority);
  const priorityTone = getPriorityTone(prio);
  const assignedLabel = summarizeAssignedNames(assignedNames);
  const statusColor = getTaskStatusColor(statusName);

  return (
    <div
      ref={setNodeRef}
      onClick={() => onOpen(task)}
      className="relative bg-card border border-border border-l-[3px] rounded-[4px] p-2.5 mb-1.5 hover:border-primary/30 transition-colors cursor-pointer group"
      // Status color on the side accent makes state visible while dragging through columns.
      style={{ ...style, borderLeftColor: statusColor }}
    >
      {assignedToCurrentUser && (
        <span title="Asignada a ti" className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
          <span className="sr-only">Asignada a ti</span>
        </span>
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Mover tarea"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
          {...attributes}
          {...listeners}
          disabled={!draggable}
        >
          {draggable && <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
            <h3 className="text-[12px] font-medium text-foreground truncate">{task.title}</h3>
            {warningCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning"
                title={`${warningCount} warning${warningCount === 1 ? '' : 's'} activo${warningCount === 1 ? '' : 's'}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                {warningCount}
              </span>
            )}
          </div>
          {task.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{task.description}</p>}
          <p className="text-[10px] text-muted-foreground mt-1 truncate" title={assignedNames.join(', ')}>Asignado: {assignedLabel}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {task.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatProjectDate(task.due_date)}
            </span>
          )}
        </div>
        {prio && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityTone}`}>{prio.name}</span>}
      </div>
    </div>
  );
}

function DroppableColumn({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id, disabled });
  return <div ref={setNodeRef} className="h-full min-h-0">{children}</div>;
}

export function ProjectTasksWorkspace({
  projectId,
  userMap,
  assignableUsers,
  canCreateTasks,
  canCreateBoards,
  canEditTasks,
  canDeleteTasks,
  canCreateSprints = false,
  initialTaskId = null,
  onInitialTaskHandled,
}: ProjectTasksWorkspaceProps) {
  const { user } = useAuth();
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id ?? 0);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }, [user]);

  const { data: boards, loading: loadingBoards, refetch: refetchBoards } = useApiBoards(projectId);
  const [selectedBoardId, setSelectedBoardId] = useState<number | undefined>(undefined);
  const [showBoardChooser, setShowBoardChooser] = useState(false);

  const { data: tasks, loading: loadingTasks, statuses, priorities, refetch: refetchTasks } = useApiTasks(selectedBoardId, projectId);
  const taskIds = useMemo(() => (tasks ?? []).map((task) => task.id_task), [tasks]);
  const { data: taskAssignments, refetch: refetchTaskAssignments } = useApiTaskAssignments(taskIds);
  const { data: taskWarnings, refetch: refetchWarnings } = useApiTaskWarnings({ project_id: projectId, status: 'active' });


  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<number | 'all'>('all');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStatus, setFormStatus] = useState<number | ''>('');
  const [formPriority, setFormPriority] = useState<number | ''>('');
  const [formAssignedTo, setFormAssignedTo] = useState<number[]>([]);
  const [formDueDate, setFormDueDate] = useState('');

  const [showBoardModal, setShowBoardModal] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [pendingInitialTaskId, setPendingInitialTaskId] = useState<number | null>(initialTaskId);
  const [sprints, setSprints] = useState<Array<{ id_sprint: number; name: string }>>([]);
  const [sprintFilter, setSprintFilter] = useState<number | 'all'>('all');

  function sprintColorFromId(id?: number | null) {
    if (!id) return '#94a3b8';
    const hue = (id * 47) % 360;
    return `hsl(${hue} 70% 40%)`;
  }

  useEffect(() => {
    const storedTaskId = Number(sessionStorage.getItem(TASK_REOPEN_ID_STORAGE_KEY));
    const storedPath = sessionStorage.getItem(TASK_REOPEN_PATH_STORAGE_KEY);
    const isValidTaskId = !Number.isNaN(storedTaskId) && storedTaskId > 0;

    if (!isValidTaskId) {
      sessionStorage.removeItem(TASK_REOPEN_ID_STORAGE_KEY);
      sessionStorage.removeItem(TASK_REOPEN_PATH_STORAGE_KEY);
      return;
    }

    if (storedPath && storedPath !== window.location.pathname) {
      return;
    }

    setPendingInitialTaskId((current) => current ?? storedTaskId);
    sessionStorage.removeItem(TASK_REOPEN_ID_STORAGE_KEY);
    sessionStorage.removeItem(TASK_REOPEN_PATH_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (boards && boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id_board);
    }
  }, [boards, selectedBoardId]);

  useEffect(() => {
    setPendingInitialTaskId(initialTaskId ?? null);
  }, [initialTaskId]);

  useEffect(() => {
    if (!pendingInitialTaskId || !boards || boards.length === 0) return;

    let cancelled = false;
    tasksService.get(pendingInitialTaskId)
      .then((task) => {
        if (cancelled) return;
        if (task.board !== selectedBoardId) {
          setSelectedBoardId(task.board);
        }
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => { cancelled = true; };
  }, [pendingInitialTaskId, boards, selectedBoardId]);

  const loading = loadingBoards || loadingTasks;

  const filteredTasks = useMemo(() => {
    let list = tasks ?? [];

    if (priorityFilter !== 'all') {
      list = list.filter((t) => t.priority === priorityFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(term));
    }

    if (sprintFilter !== 'all') {
      list = list.filter((t) => t.sprint === sprintFilter);
    }

    return list;
  }, [tasks, priorityFilter, searchTerm, sprintFilter]);

  const statusByName = useMemo(() => {
    const map = new Map<string, ApiTaskStatus>();
    statuses.forEach((s) => map.set(normalizeName(s.name), s));
    return map;
  }, [statuses]);

  const statusNameById = useMemo(() => {
    const map = new Map<number, string>();
    statuses.forEach((status) => map.set(status.id_status, status.name));
    return map;
  }, [statuses]);

  const doneStatusIds = useMemo(
    () => new Set(statuses.filter((s) => DONE_STATUS_NAMES.has(normalizeName(s.name))).map((s) => s.id_status)),
    [statuses],
  );

  const columns = useMemo<OrderedColumn[]>(() => {
    return STATUS_ORDER.map((name) => {
      const status = statusByName.get(normalizeName(name)) ?? null;
      return {
        name,
        status,
        tasks: status ? filteredTasks.filter((t) => t.status === status.id_status) : [],
        isMissing: status == null,
      };
    });
  }, [statusByName, filteredTasks]);

  const taskAssignmentsByTask = useMemo(() => {
    const map = new Map<number, ApiTaskAssignment[]>();
    (taskAssignments ?? []).forEach((assignment) => {
      const existing = map.get(assignment.task) ?? [];
      existing.push(assignment);
      map.set(assignment.task, existing);
    });
    return map;
  }, [taskAssignments]);

  const warningCountByTask = useMemo(() => {
    const map = new Map<number, number>();
    (taskWarnings ?? []).forEach((warning) => {
      map.set(warning.task, (map.get(warning.task) ?? 0) + 1);
    });
    return map;
  }, [taskWarnings]);

  const getAssignedNames = (task: ApiTask) => {
    const assignments = taskAssignmentsByTask.get(task.id_task) ?? [];
    if (assignments.length > 0) {
      return assignments.map((assignment) => userMap.get(assignment.assigned_to) ?? `#${assignment.assigned_to}`);
    }
    return task.assigned_to ? [userMap.get(task.assigned_to) ?? `#${task.assigned_to}`] : [];
  };

  const isAssignedToCurrentUser = (task: ApiTask) => {
    if (!currentUserId) return false;
    const assignments = taskAssignmentsByTask.get(task.id_task) ?? [];
    if (assignments.length > 0) {
      return assignments.some((assignment) => assignment.assigned_to === currentUserId);
    }
    return task.assigned_to === currentUserId;
  };

  useEffect(() => {
    if (!pendingInitialTaskId) return;
    const targetTask = (tasks ?? []).find((task) => task.id_task === pendingInitialTaskId);
    if (!targetTask) return;

    setSelectedTask(targetTask);
    onInitialTaskHandled?.(pendingInitialTaskId);
    setPendingInitialTaskId(null);
  }, [pendingInitialTaskId, tasks, onInitialTaskHandled]);

  const fetchSprints = () => {
    let cancelled = false;
    sprintsService.list(projectId)
      .then((list) => {
        if (cancelled) return;
        setSprints((list as any).map((s: any) => ({ id_sprint: s.id_sprint, name: s.name })) ?? []);
      })
      .catch(() => { if (!cancelled) setSprints([]); });
    return () => { cancelled = true; };
  };

  useEffect(() => { const cancel = fetchSprints(); return cancel; }, [projectId]);

  const handleDragStart = (event: { active: { id: string | number } }) => {
    setActiveDragId(Number(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canEditTasks) return;
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;

    const overId = String(over.id);
    let targetStatus: ApiTaskStatus | null = null;

    const column = columns.find((col) => `status-${col.name}` === overId);
    if (column?.status) {
      targetStatus = column.status;
    } else {
      const overTask = (tasks ?? []).find((t) => String(t.id_task) === overId);
      if (overTask) {
        targetStatus = statuses.find((s) => s.id_status === overTask.status) ?? null;
      }
    }

    if (!targetStatus) return;

    const draggedTask = (tasks ?? []).find((t) => t.id_task === Number(active.id));
    if (!draggedTask || draggedTask.status === targetStatus.id_status) return;

    try {
      const enteringDone = doneStatusIds.has(targetStatus.id_status);
      await tasksService.update(draggedTask.id_task, {
        status: targetStatus.id_status,
        completed_at: enteringDone ? (draggedTask.completed_at ?? new Date().toISOString()) : null,
      });
      toast.success(`Tarea movida a ${targetStatus.name}`);
      refetchTasks();
    } catch {
      toast.error('No se pudo mover la tarea.');
    }
  };

  const activeTask = activeDragId ? (tasks ?? []).find((t) => t.id_task === activeDragId) ?? null : null;

  const handleQuickUpdate = async (
    task: ApiTask,
    patch: { status?: number | null; priority?: number | null; completed_at?: string | null },
  ) => {
    if (!canEditTasks) {
      toast.error('Tu rol no puede editar historias.');
      return;
    }
    setUpdatingTaskId(task.id_task);
    try {
      const nextPatch = { ...patch };
      if (typeof patch.status !== 'undefined') {
        const enteringDone = patch.status != null && doneStatusIds.has(patch.status);
        nextPatch.completed_at = enteringDone ? (task.completed_at ?? new Date().toISOString()) : null;
      }
      await tasksService.update(task.id_task, nextPatch);
      refetchTasks();
      if (selectedTask?.id_task === task.id_task) {
        const refreshed = await tasksService.get(task.id_task);
        setSelectedTask(refreshed);
      }
    } catch {
      toast.error('No se pudo actualizar la tarea.');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBoardId) {
      toast.error('Selecciona un board primero.');
      return;
    }
    if (!canCreateTasks) {
      toast.error('Tu rol no puede crear historias.');
      return;
    }
    if (formStatus === '') {
      toast.error('Selecciona un estado.');
      return;
    }
    if (formPriority === '') {
      toast.error('Selecciona una prioridad.');
      return;
    }

    setCreatingTask(true);
    try {
      const createdTask = await tasksService.create({
        board: selectedBoardId,
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        status: formStatus,
        priority: formPriority,
        created_by: currentUserId ?? undefined,
        ...(formAssignedTo.length > 0 ? { assigned_to: formAssignedTo[0] } : {}),
        due_date: formDueDate || undefined,
      });

      if (formAssignedTo.length > 0) {
        await Promise.all(formAssignedTo.map((assignedUserId) => tasksService.createAssignment({
          task: createdTask.id_task,
          assigned_to: assignedUserId,
        })));
      }

      setFormTitle('');
      setFormDesc('');
      setFormStatus('');
      setFormPriority('');
      setFormAssignedTo([]);
      setFormDueDate('');
      setShowTaskModal(false);
      toast.success('Historia creada.');
      refetchTasks();
      refetchTaskAssignments();
    } catch {
      toast.error('No se pudo crear la historia.');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateBoards) {
      toast.error('Tu rol no puede crear boards.');
      return;
    }

    if (!boardName.trim()) {
      toast.error('El nombre del board es obligatorio.');
      return;
    }

    setCreatingBoard(true);
    try {
      const created = await tasksService.createBoard(projectId, boardName.trim(), boardDescription.trim() || undefined);
      setBoardName('');
      setBoardDescription('');
      setShowBoardModal(false);
      toast.success('Board creado.');
      await refetchBoards();
      setSelectedBoardId(created.id_board);
    } catch {
      toast.error('No se pudo crear el board.');
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleDeleteBoard = async (boardId: number) => {
    if (!canCreateBoards) {
      toast.error('Tu rol no puede eliminar boards.');
      return;
    }
    const board = (boards ?? []).find((candidate) => candidate.id_board === boardId);
    if (!board) return;
    if (!window.confirm(`¿Eliminar el board "${board.name}"?`)) return;

    try {
      await tasksService.deleteBoard(boardId);
      toast.success('Board eliminado.');

      const remainingBoards = (boards ?? []).filter((candidate) => candidate.id_board !== boardId);
      setSelectedBoardId((current) => {
        if (current !== boardId) return current;
        return remainingBoards[0]?.id_board;
      });
      setShowBoardChooser(false);
      await refetchBoards();
      refetchTasks();
      refetchTaskAssignments();
      refetchWarnings();
    } catch {
      toast.error('No se pudo eliminar el board.');
    }
  };

  const selectedBoard = (boards ?? []).find((board) => board.id_board === selectedBoardId) ?? null;

  const handleStatusChangeFromPanel = async (task: ApiTask, newStatusId: number) => {
    if (!canEditTasks) {
      toast.error('Tu rol no puede editar historias.');
      return;
    }
    try {
      const enteringDone = doneStatusIds.has(newStatusId);
      await tasksService.update(task.id_task, {
        status: newStatusId,
        completed_at: enteringDone ? (task.completed_at ?? new Date().toISOString()) : null,
      });
      const refreshed = await tasksService.get(task.id_task);
      setSelectedTask(refreshed);
      refetchTasks();
      const name = statuses.find((s) => s.id_status === newStatusId)?.name ?? 'nuevo estado';
      toast.success(`Estado actualizado a ${name}`);
    } catch {
      toast.error('No se pudo cambiar el estado.');
    }
  };

  const handleDeleteTaskFromPanel = async (taskToDelete: ApiTask) => {
    if (!canDeleteTasks) {
      toast.error('Solo Product Owner o Project Manager pueden eliminar historias.');
      return;
    }

    try {
      await tasksService.delete(taskToDelete.id_task);
      setSelectedTask(null);
      refetchTasks();
      refetchTaskAssignments();
      toast.success('Historia eliminada.');
    } catch {
      toast.error('No se pudo eliminar la historia.');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center gap-2 rounded-[6px] border border-border bg-surface-secondary/40 px-2 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Board</span>
            <button
              type="button"
              onClick={() => setShowBoardChooser((current) => !current)}
              className="h-8 min-w-[220px] bg-card border border-border rounded-[4px] px-2.5 text-[11px] text-foreground inline-flex items-center justify-between gap-2"
              disabled={!boards || boards.length === 0}
            >
              <span className="truncate">{selectedBoard?.name ?? 'Sin boards'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {showBoardChooser && !!boards && boards.length > 0 && (
              <div className="absolute left-12 top-[46px] z-20 w-[320px] rounded-[6px] border border-border bg-card shadow-lg">
                <div className="max-h-64 overflow-y-auto py-1">
                  {boards.map((board) => {
                    const isSelectedBoard = selectedBoardId === board.id_board;
                    return (
                      <div key={board.id_board} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-accent/50">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBoardId(board.id_board);
                            setShowBoardChooser(false);
                          }}
                          className={`flex-1 text-left text-[11px] ${isSelectedBoard ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                        >
                          {board.name}
                        </button>
                        {canCreateBoards && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteBoard(board.id_board)}
                            className="inline-flex items-center gap-1 rounded-[3px] border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/20"
                            title="Eliminar board"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {canCreateBoards && (
              <button
                onClick={() => setShowBoardModal(true)}
                className="h-8 px-3 bg-card border border-border rounded-[4px] text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
              >
                <span className="inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo board</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-secondary border border-border rounded-[3px] p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2 py-1 rounded-[2px] text-[11px] font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'kanban' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-3 h-3" /> Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded-[2px] text-[11px] font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-3 h-3" /> Lista
            </button>
          </div>

          {canCreateTasks && (
            <>
              <button
                onClick={() => setShowTaskModal(true)}
                disabled={!selectedBoardId}
                className="h-7 px-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-[3px] text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva historia
              </button>
              {/** Sprint creation button: only when allowed (prop) */}
              {canCreateSprints && (
                <button
                  onClick={() => setShowCreateSprint(true)}
                  className="h-7 px-3 bg-card border border-border rounded-[3px] text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 ml-2"
                >
                  Crear Sprint
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {priorities.length > 0 && (
          <div className="flex items-center gap-0 border border-border rounded-[3px] overflow-hidden">
            <button
              type="button"
              onClick={() => setPriorityFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium border-r border-border transition-colors ${priorityFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            >
              Prioridad
            </button>
            {priorities.map((p) => (
              <button
                key={p.id_priority}
                type="button"
                onClick={() => setPriorityFilter(p.id_priority)}
                className={`px-2.5 py-1 text-[11px] font-medium border-r border-border last:border-r-0 transition-colors ${priorityFilter === p.id_priority ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${priorityDotColor(p.level)}`} />
                {p.name}
              </button>
            ))}
          </div>
        )}

        {sprints.length > 0 && (
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Sprint</label>
            <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-7 bg-surface-secondary border border-border rounded-[3px] px-2 text-[11px] mr-2">
              <option value="all">Todos</option>
              {sprints.map((s) => (
                <option key={s.id_sprint} value={s.id_sprint}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar historias..."
            className="h-7 bg-surface-secondary border border-border rounded-[3px] pl-7 pr-3 text-[11px] w-52"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && !selectedBoardId && (
        <div className="py-16 text-center text-[12px] text-muted-foreground">Este proyecto no tiene boards.</div>
      )}

      {!loading && selectedBoardId && viewMode === 'kanban' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1 min-h-0 items-stretch" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((column, colIndex) => (
              <DroppableColumn
                key={column.name}
                id={`status-${column.name}`}
                disabled={column.isMissing}
              >
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: colIndex * 0.04, ease: 'easeOut' }}
                  className={`rounded-[4px] p-2.5 border ${column.isMissing ? 'border-dashed border-border/60 bg-surface-secondary/30' : 'border-border bg-surface-secondary/50'} h-full min-h-0 flex flex-col`}
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em] inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTaskStatusColor(column.status?.name ?? column.name) }} />
                      {column.name}
                    </h2>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-card text-muted-foreground">
                      {column.tasks.length}
                    </span>
                  </div>

                  {!column.isMissing ? (
                    <SortableContext
                      items={column.tasks.map((t) => t.id_task)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-app pr-1">
                        {column.tasks.map((task) => (
                          <TaskCard
                            key={task.id_task}
                            task={task}
                            priorities={priorities}
                            assignedNames={getAssignedNames(task)}
                            assignedToCurrentUser={isAssignedToCurrentUser(task)}
                            warningCount={warningCountByTask.get(task.id_task) ?? 0}
                            statusName={statusNameById.get(task.status ?? -1)}
                            onOpen={setSelectedTask}
                            draggable={canEditTasks}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  ) : (
                    <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-muted-foreground text-center px-2">
                      Estado no disponible en backend
                    </div>
                  )}

                </motion.div>
              </DroppableColumn>
            ))}
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="bg-card border border-primary rounded-[4px] p-2.5 rotate-2 opacity-90">
                <h3 className="text-[12px] font-medium text-foreground">{activeTask.title}</h3>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        </div>
      )}

      {!loading && selectedBoardId && viewMode === 'table' && (
        <div className="bg-card border border-border rounded-[4px] overflow-auto">
          <table className="w-full min-w-[940px] table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-surface-secondary/50">
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Titulo</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Estado</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Prioridad</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Asignado</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Creador</th>
                                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Sprint</th>
                <th className="text-left py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Vence</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const assignedNames = getAssignedNames(task);
                const assignedSummary = summarizeAssignedNames(assignedNames);
                const assignedToCurrentUser = isAssignedToCurrentUser(task);

                return (
                  <tr key={task.id_task} className="border-b border-border/60 hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelectedTask(task)}>
                    <td className="relative py-2 px-3">
                      {assignedToCurrentUser && (
                        <span title="Asignada a ti" className="absolute right-2 top-2 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
                          <span className="sr-only">Asignada a ti</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 max-w-[280px]">
                        <p className="text-[12px] font-medium text-foreground truncate">{task.title}</p>
                        {(warningCountByTask.get(task.id_task) ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {warningCountByTask.get(task.id_task)}
                          </span>
                        )}
                      </div>
                      {task.description && <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">{task.description}</p>}
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={task.status ?? ''}
                        disabled={updatingTaskId === task.id_task || !canEditTasks}
                        onChange={(e) => handleQuickUpdate(task, { status: e.target.value ? Number(e.target.value) : null })}
                        className="h-7 bg-surface-secondary border border-border rounded-[3px] px-2 text-[11px]"
                      >
                        <option value="">Sin estado</option>
                        {statuses.map((s) => (
                          <option key={s.id_status} value={s.id_status}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={task.priority ?? ''}
                        disabled={updatingTaskId === task.id_task || !canEditTasks}
                        onChange={(e) => handleQuickUpdate(task, { priority: e.target.value ? Number(e.target.value) : null })}
                        className="h-7 bg-surface-secondary border border-border rounded-[3px] px-2 text-[11px]"
                      >
                        <option value="">Sin prioridad</option>
                        {priorities.map((p) => (
                          <option key={p.id_priority} value={p.id_priority}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-muted-foreground">
                      <span className="block truncate" title={assignedNames.join(', ')}>{assignedSummary}</span>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-muted-foreground">
                      {task.created_by ? (userMap.get(task.created_by) ?? `#${task.created_by}`) : '—'}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-muted-foreground">{task.due_date ?? '—'}</td>
                                      <td className="py-2 px-3">
                                        {task.sprint ? (
                                          <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[11px] font-medium text-white" style={{ background: sprintColorFromId(task.sprint) }}>
                                            {(sprints.find((s) => s.id_sprint === task.sprint)?.name) ?? `Sprint #${task.sprint}`}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground">—</span>
                                        )}
                                      </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border rounded-[6px] p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-app shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[13px] font-semibold text-foreground">Nueva historia de usuario</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Completa la configuración base antes de crear la historia.</p>
              </div>
              <button onClick={() => setShowTaskModal(false)} className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-secondary">
                Cerrar
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleCreateTask}>
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Titulo *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full h-7 bg-surface-secondary border border-border rounded-[3px] px-2.5 text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Descripcion</label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full bg-surface-secondary border border-border rounded-[3px] px-2.5 py-1.5 text-[11px] resize-none"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Estado *</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value ? Number(e.target.value) : '')}
                    className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px]"
                  >
                    <option value="">-</option>
                    {statuses.map((s) => (
                      <option key={s.id_status} value={s.id_status}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Prioridad *</label>
                  <select
                    required
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value ? Number(e.target.value) : '')}
                    className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px]"
                  >
                    <option value="" disabled>Selecciona prioridad</option>
                    {priorities.map((p) => (
                      <option key={p.id_priority} value={p.id_priority}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Fecha limite</label>
                <DatePickerField
                  value={formDueDate}
                  onChange={setFormDueDate}
                  placeholder="Selecciona una fecha"
                />
              </div>

              <div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Asignar a</label>
                  <TaskAssigneePicker
                    users={assignableUsers}
                    selectedIds={formAssignedTo}
                    onChange={setFormAssignedTo}
                    emptyText="Opcional"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Opcional. Si asignas personas, la primera se conserva como responsable principal para compatibilidad.</p>
                </div>
              </div>

              <div className="rounded-[4px] border border-border bg-surface-secondary/30 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Campos obligatorios: estado y prioridad.</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 h-9 border border-border rounded-[4px] text-[12px] font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className="flex-1 h-9 bg-primary text-primary-foreground rounded-[4px] text-[12px] font-medium disabled:opacity-50"
                >
                  {creatingTask ? 'Creando...' : 'Crear historia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateSprint && (
        <CreateSprintModal open={showCreateSprint} onOpenChange={setShowCreateSprint} projectId={projectId} onCreated={() => { fetchSprints(); }} />
      )}

      {showBoardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border rounded-[8px] p-6 max-w-lg w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Crear nuevo board</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">Organiza historias con un nuevo tablero para este proyecto.</p>
              </div>
              <button onClick={() => setShowBoardModal(false)} className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-secondary">Cerrar</button>
            </div>

            <form className="space-y-4" onSubmit={handleCreateBoard}>
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="Ej: Sprint Backlog"
                  className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">Descripcion</label>
                <textarea
                  rows={3}
                  value={boardDescription}
                  onChange={(e) => setBoardDescription(e.target.value)}
                  placeholder="Contexto o enfoque del board"
                  className="w-full bg-surface-secondary border border-border rounded-[4px] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBoardModal(false)}
                  className="flex-1 h-9 border border-border rounded-[4px] text-[12px] font-medium text-foreground hover:bg-surface-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingBoard}
                  className="flex-1 h-9 bg-primary text-primary-foreground rounded-[4px] text-[12px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {creatingBoard ? 'Creando...' : 'Crear board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TaskDetailPanel
        task={selectedTask}
        statuses={statuses}
        priorities={priorities}
        userMap={userMap}
        assignableUsers={assignableUsers}
        canEditAssignment={canEditTasks}
        canEditTask={canEditTasks}
        canDeleteTask={canDeleteTasks}
        taskAssignments={taskAssignments ?? []}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChangeFromPanel}
        onDeleteTask={handleDeleteTaskFromPanel}
        onTaskUpdated={(updated) => {
          setSelectedTask(updated);
          refetchTasks();
          refetchTaskAssignments();
        }}
      />
    </div>
  );
}
