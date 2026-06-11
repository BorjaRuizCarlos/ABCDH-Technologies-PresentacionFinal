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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRightLeft, Calendar, Check, Filter, GripVertical, LayoutDashboard, LayoutList, Loader2, Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApiBoardColumns,
  useApiBoards,
  useApiSprints,
  useApiSprintBoards,
  useApiTags,
  useApiTaskAssignments,
  useApiTasks,
} from '../hooks/useProjectData';
import { usePreventDoubleClick } from '../hooks/usePreventDoubleClick';
import { tasksService } from '../../services';
import type { ApiBoardColumn, ApiTask, ApiTaskPriority } from '../../services';
import { TaskDetailPanel } from './TaskDetailPanel';
import { DatePickerField } from './DatePickerField';
import { TaskAssigneePicker } from './TaskAssigneePicker';
import { TagColorPicker } from './TagColorPicker';

// The "review" column is positional — always the second-to-last column (the penultimate),
// mirroring how the last column is always the final one.
function isReviewIndex(index: number, total: number): boolean {
  return total > 1 && index === total - 2;
}

type SprintStatus = 'planned' | 'active' | 'closed';

// Sprint status is derived purely from its dates: before start = planned,
// between start and end = active, after end = finished (closed).
function deriveSprintStatus(startDate: string | null, endDate: string | null, now: Date = new Date()): SprintStatus {
  const today = now.toISOString().slice(0, 10);
  if (startDate && today < startDate) return 'planned';
  if (endDate && today > endDate) return 'closed';
  if (startDate && endDate) return 'active';
  // Missing dates: best-effort fallbacks.
  if (startDate && today >= startDate) return 'active';
  return 'planned';
}

const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: 'Planeado',
  active: 'Activo',
  closed: 'Finalizado',
};

interface SortableColumnItemProps {
  column: ApiBoardColumn;
  index: number;
  totalCount: number;
  isEditing: boolean;
  editName: string;
  savingEdit: boolean;
  onEditStart: () => void;
  onEditChange: (name: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  locked?: boolean;
}

function SortableColumnItem({ column, index, totalCount, isEditing, editName, savingEdit, onEditStart, onEditChange, onEditSave, onEditCancel, onDelete, locked = false }: SortableColumnItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.id_column, disabled: locked });
  const isLast = index === totalCount - 1;
  const isRevision = totalCount > 1 && index === totalCount - 2;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-1.5 rounded-[3px] border border-border bg-surface-secondary/40 px-2 py-1.5 text-[11px]"
    >
      {locked ? (
        <span className="w-3.5 shrink-0" />
      ) : (
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}
      <span className="text-[10px] text-muted-foreground w-5 shrink-0 text-right">{index + 1}.</span>
      {isEditing ? (
        <input
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          className="flex-1 h-6 rounded-[3px] border border-border bg-card px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
        />
      ) : (
        <span className="flex-1 text-foreground truncate">{column.name}</span>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {isRevision && !isEditing && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">Revisión</span>
        )}
        {isLast && !isEditing && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/20 text-success font-medium">Final</span>
        )}
        {isEditing ? (
          <>
            <button type="button" onClick={onEditSave} disabled={savingEdit} className="h-5 px-2 rounded-[3px] bg-primary text-primary-foreground text-[10px] disabled:opacity-50">
              {savingEdit ? '…' : 'Guardar'}
            </button>
            <button type="button" onClick={onEditCancel} className="h-5 px-2 rounded-[3px] border border-border text-muted-foreground text-[10px]">Cancelar</button>
          </>
        ) : locked ? null : (
          <>
            <button type="button" onClick={onEditStart} className="h-5 w-5 rounded-[3px] border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors" title="Editar columna">
              <Pencil className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={totalCount <= 3}
              className="h-5 w-5 rounded-[3px] border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={totalCount <= 3 ? 'El board debe tener al menos 3 columnas' : 'Eliminar columna'}
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface ProjectTasksWorkspaceProps {
  projectId: number;
  userMap: Map<number, string>;
  assignableUsers: Array<{ id: number; name: string }>;
  canCreateTasks: boolean;
  canCreateBoards: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canMoveTasks?: boolean;
  projectEndDate?: string | null;
  projectStartDate?: string | null;
  forcedTab?: WorkspaceTab;
  initialTaskId?: number | null;
  onInitialTaskHandled?: (taskId: number) => void;
}

const TAB_OPTIONS = ['backlog', 'sprints', 'boards'] as const;
export type WorkspaceTab = typeof TAB_OPTIONS[number];

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} className="h-full">{children}</div>;
}

function TaskCard({
  task,
  onOpen,
  onMove,
  draggable,
  tagById,
}: {
  task: ApiTask;
  onOpen: (task: ApiTask) => void;
  onMove?: (task: ApiTask) => void;
  draggable: boolean;
  tagById: Map<number, { name: string; color: string }>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id_task, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onOpen(task)}
      className="rounded-[4px] border border-border bg-card p-2 text-[11px] cursor-pointer"
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button type="button" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="mt-0.5">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="font-medium text-foreground truncate flex-1">{task.title}</p>
            {onMove && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMove(task); }}
                className="shrink-0 h-5 px-1.5 rounded-[3px] border border-border text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1"
                title="Mover a otro sprint"
              >
                <ArrowRightLeft className="w-2.5 h-2.5" /> Mover
              </button>
            )}
          </div>
          {task.description && <p className="mt-1 text-muted-foreground line-clamp-2 break-words">{task.description}</p>}
          {task.due_date && (
            <div className="mt-2 flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{task.due_date}</span>
            </div>
          )}
          {task.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {task.tags.map((tagId) => {
                const tag = tagById.get(tagId);
                return (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-secondary/70 px-2 py-0.5 text-[10px] text-foreground"
                    style={{ boxShadow: `inset 0 0 0 1px ${(tag?.color ?? '#56697f')}33` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tag?.color ?? '#56697f' }} />
                    {tag?.name ?? `#${tagId}`}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



export function ProjectTasksWorkspace({
  projectId,
  userMap,
  assignableUsers,
  canCreateTasks,
  canCreateBoards,
  canEditTasks,
  canDeleteTasks,
  canMoveTasks = false,
  projectEndDate = null,
  projectStartDate = null,
  forcedTab,
  initialTaskId = null,
  onInitialTaskHandled,
}: ProjectTasksWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(forcedTab ?? 'backlog');
  const [selectedTask, setSelectedTask] = useState<ApiTask | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [sprintViewMode, setSprintViewMode] = useState<'kanban' | 'list'>('kanban');
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagFilterSearch, setTagFilterSearch] = useState('');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState<{ id: number; name: string; start_date: string; end_date: string; status: 'planned' | 'active' | 'closed' } | null>(null);
  const [savingSprintEdit, setSavingSprintEdit] = useState(false);
  const [newSprintBoardIds, setNewSprintBoardIds] = useState<number[]>([]);
  const [editingSprintBoardIds, setEditingSprintBoardIds] = useState<number[]>([]);
  const [deletingSprintId, setDeletingSprintId] = useState<number | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    start_date: '',
    due_date: '',
    priority: null as number | null,
    tags: [] as number[],
    assignedTo: [] as number[],
    sprint: null as number | null,
    subtasks: [] as string[],
  });
  const [newSubtaskInput, setNewSubtaskInput] = useState('');
  const [newBoard, setNewBoard] = useState({
    name: '', description: '',
    coding_style: 'standard', review_focus: 'strict', tech_stack: 'mixed',
    naming_convention: 'default', response_language: 'es', custom_instructions: '',
  });
  const [newBoardColumns, setNewBoardColumns] = useState<Array<{ name: string; tempId: number }>>([
    { name: 'To Do', tempId: 1 },
    { name: 'In Progress', tempId: 2 },
    { name: 'Done', tempId: 3 },
  ]);
  const [newBoardColumnInput, setNewBoardColumnInput] = useState('');
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editingBoardDraft, setEditingBoardDraft] = useState<{
    name: string; description: string; coding_style: string; review_focus: string;
    tech_stack: string; naming_convention: string; response_language: string; custom_instructions: string;
  } | null>(null);
  const [savingBoardEdit, setSavingBoardEdit] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [savingColumnEdit, setSavingColumnEdit] = useState(false);
  const [showCreateBoardInSprint, setShowCreateBoardInSprint] = useState(false);
  const [newBoardInSprintName, setNewBoardInSprintName] = useState('');
  const [creatingBoardInSprint, setCreatingBoardInSprint] = useState(false);
  const [newColumn, setNewColumn] = useState({ name: '', is_final: false });
  const [newSprint, setNewSprint] = useState({ name: '', start_date: '', end_date: '', status: 'planned' as 'planned' | 'active' | 'closed' });
  const [newTag, setNewTag] = useState({ name: '', color: '#56697f' });

  // State for pushing backlog tasks to a sprint+board
  const [pushingTaskId, setPushingTaskId] = useState<number | null>(null);
  const [pushSprintId, setPushSprintId] = useState<number | null>(null);
  const [pushBoardId, setPushBoardId] = useState<number | null>(null);
  const [pushColumnId, setPushColumnId] = useState<number | null>(null);
  const [savingPush, setSavingPush] = useState(false);

  const { data: tasks, loading: loadingTasks, refetch: refetchTasks, priorities } = useApiTasks(undefined, projectId);
  const { data: boards, loading: loadingBoards, refetch: refetchBoards } = useApiBoards(projectId);
  const { data: columns, loading: loadingColumns, refetch: refetchColumns } = useApiBoardColumns();
  const { data: sprints, loading: loadingSprints, refetch: refetchSprints } = useApiSprints(projectId);
  const { data: tags, loading: loadingTags, refetch: refetchTags } = useApiTags(projectId);
  const { data: allSprintBoards, refetch: refetchSprintBoards } = useApiSprintBoards();

  const taskIds = useMemo(() => (tasks ?? []).map((task) => task.id_task), [tasks]);
  const { data: taskAssignments, refetch: refetchTaskAssignments } = useApiTaskAssignments(taskIds);

  const loading = loadingTasks || loadingBoards || loadingColumns || loadingSprints || loadingTags;

  const boardColumnsByBoard = useMemo(() => {
    const map = new Map<number, ApiBoardColumn[]>();
    (columns ?? []).forEach((column) => {
      const existing = map.get(column.board) ?? [];
      existing.push(column);
      map.set(column.board, existing);
    });
    map.forEach((value, key) => {
      map.set(key, value.slice().sort((a, b) => a.order - b.order));
    });
    return map;
  }, [boards, columns]);

  const backlogTasks = useMemo(
    () => (tasks ?? []).filter((task) => task.sprint == null),
    [tasks],
  );

  const selectedBoardColumns = useMemo(
    () => (selectedBoardId ? (boardColumnsByBoard.get(selectedBoardId) ?? []) : []),
    [selectedBoardId, boardColumnsByBoard],
  );

  const tomorrowDate = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }, []);

  // Earliest selectable date for tasks: not in the past, but never before the project starts
  // (a project can start in the future, in which case "tomorrow" is too early).
  const taskMinDate = useMemo(
    () => (projectStartDate && projectStartDate > tomorrowDate ? projectStartDate : tomorrowDate),
    [projectStartDate, tomorrowDate],
  );

  // Latest end_date among sprints that have one, used to enforce sequential sprint creation
  const latestSprintEndDate = useMemo(() => {
    const dates = (sprints ?? [])
      .map((s) => s.end_date)
      .filter((d): d is string => d != null)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [sprints]);

  // True when the latest sprint already reaches the project end - no room for more
  const noMoreSprintsAllowed = !!(latestSprintEndDate && projectEndDate && latestSprintEndDate >= projectEndDate);

  // Minimum start date for a new sprint: day AFTER the latest sprint end, otherwise the
  // project start (when it's in the future) or tomorrow.
  const sprintStartMinDate = useMemo(() => {
    const base = projectStartDate && projectStartDate > tomorrowDate ? projectStartDate : tomorrowDate;
    if (!latestSprintEndDate) return base;
    const d = new Date(latestSprintEndDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [latestSprintEndDate, projectStartDate, tomorrowDate]);

  const sortedSprints = useMemo(
    () => [...(sprints ?? [])].sort((a, b) => {
      if (!a.start_date && !b.start_date) return a.id_sprint - b.id_sprint;
      if (!a.start_date) return -1;
      if (!b.start_date) return 1;
      return a.start_date.localeCompare(b.start_date);
    }),
    [sprints],
  );

  // Date bounds for the sprint being edited: start ≥ project start; end ≤ project end
  // and strictly before the next sprint's start (no overlap).
  const editingSprintBounds = useMemo(() => {
    const addDays = (iso: string, days: number) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    if (!editingSprint) return { minStart: undefined as string | undefined, maxEnd: undefined as string | undefined, nextStart: null as string | null };
    const idx = sortedSprints.findIndex((s) => s.id_sprint === editingSprint.id);
    const next = idx >= 0 && idx < sortedSprints.length - 1 ? sortedSprints[idx + 1] : null;
    const minStart = projectStartDate ?? undefined;
    let maxEnd = projectEndDate ?? undefined;
    if (next?.start_date) {
      const dayBeforeNext = addDays(next.start_date, -1);
      maxEnd = maxEnd ? (dayBeforeNext < maxEnd ? dayBeforeNext : maxEnd) : dayBeforeNext;
    }
    return { minStart, maxEnd, nextStart: next?.start_date ?? null };
  }, [editingSprint, sortedSprints, projectStartDate, projectEndDate]);

  const priorityById = useMemo(() => {
    const map = new Map<number, ApiTaskPriority>();
    priorities.forEach((priority) => map.set(priority.id_priority, priority));
    return map;
  }, [priorities]);

  const defaultBacklogColumnId = useMemo(() => {
    const projectBoardIds = new Set((boards ?? []).map((board) => board.id_board));
    const allColumns = (columns ?? [])
      .filter((column) => projectBoardIds.has(column.board))
      .slice()
      .sort((a, b) => a.order - b.order);
    if (allColumns.length === 0) return null;

    const namedBacklog = allColumns.find((column) => {
      const name = column.name.trim().toLowerCase();
      return name.includes('backlog') || name.includes('to do') || name.includes('todo') || name.includes('por hacer');
    });
    if (namedBacklog) return namedBacklog.id_column;

    const firstNonFinal = allColumns.find((column) => !column.is_final);
    return firstNonFinal?.id_column ?? allColumns[0].id_column;
  }, [columns]);

  const sprintTasks = useMemo(() => {
    const query = backlogSearch.trim().toLowerCase();
    const source = (tasks ?? []).filter((task) => selectedSprintId != null && task.sprint === selectedSprintId);
    let withFilters = selectedTagIds.length > 0
      ? source.filter((task) => selectedTagIds.every((tagId) => task.tags.includes(tagId)))
      : source;
    if (query) withFilters = withFilters.filter((task) => task.title.toLowerCase().includes(query));

    if (!selectedBoardId) return withFilters;
    const boardColumnIds = new Set((boardColumnsByBoard.get(selectedBoardId) ?? []).map((col) => col.id_column));
    return withFilters.filter((task) => boardColumnIds.has(task.board_column));
  }, [tasks, selectedSprintId, selectedTagIds, backlogSearch, selectedBoardId, boardColumnsByBoard]);

  const backlogTagFilteredTasks = useMemo(() => {
    let result = backlogTasks;
    if (selectedTagIds.length > 0) result = result.filter((task) => selectedTagIds.every((tagId) => task.tags.includes(tagId)));
    if (backlogSearch.trim()) result = result.filter((task) => task.title.toLowerCase().includes(backlogSearch.trim().toLowerCase()));
    return result;
  }, [backlogTasks, selectedTagIds, backlogSearch]);

  const tagById = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    (tags ?? []).forEach((tag) => {
      map.set(tag.id_tag, { name: tag.name, color: tag.color || '#56697f' });
    });
    return map;
  }, [tags]);

  // ── Sprint-board computed values ─────────────────────────────────────────
  const selectedSprintBoardIds = useMemo(() => {
    if (!selectedSprintId) return new Set<number>();
    return new Set(
      (allSprintBoards ?? []).filter((sb) => sb.sprint === selectedSprintId).map((sb) => sb.board),
    );
  }, [allSprintBoards, selectedSprintId]);

  const sprintBoardsList = useMemo(() => {
    if (!allSprintBoards) return boards ?? []; // still loading
    return selectedSprintBoardIds.size === 0
      ? []
      : (boards ?? []).filter((b) => selectedSprintBoardIds.has(b.id_board));
  }, [boards, selectedSprintBoardIds, allSprintBoards]);

  const boardsWithTasksInEditingSprint = useMemo(() => {
    if (!editingSprint) return new Set<number>();
    const result = new Set<number>();
    (tasks ?? [])
      .filter((t) => t.sprint === editingSprint.id)
      .forEach((t) => {
        const col = (columns ?? []).find((c) => c.id_column === t.board_column);
        if (col) result.add(col.board);
      });
    return result;
  }, [tasks, columns, editingSprint]);

  const pushBoardOptions = useMemo(() => {
    if (!pushSprintId) return boards ?? [];
    const pushSprintBoardIds = new Set(
      (allSprintBoards ?? []).filter((sb) => sb.sprint === pushSprintId).map((sb) => sb.board),
    );
    return pushSprintBoardIds.size > 0
      ? (boards ?? []).filter((b) => pushSprintBoardIds.has(b.id_board))
      : boards ?? [];
  }, [boards, allSprintBoards, pushSprintId]);
  // ─────────────────────────────────────────────────────────────────────────

  const filteredTagOptions = useMemo(() => {
    const query = tagFilterSearch.trim().toLowerCase();
    // Options always come from the full project tag list (never from the filtered task set), and
    // already-selected tags are always kept — so selecting a tag never removes the others.
    const source = (tags ?? []).filter((tag) => selectedTagIds.includes(tag.id_tag) || (query ? tag.name.toLowerCase().includes(query) : true));
    return source.sort((a, b) => {
      const aSelected = selectedTagIds.includes(a.id_tag) ? 0 : 1;
      const bSelected = selectedTagIds.includes(b.id_tag) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [tags, tagFilterSearch, selectedTagIds]);

  useEffect(() => {
    if (!initialTaskId || !tasks) return;
    const target = tasks.find((task) => task.id_task === initialTaskId);
    if (!target) return;
    setSelectedTask(target);
    onInitialTaskHandled?.(initialTaskId);
  }, [initialTaskId, onInitialTaskHandled, tasks]);

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);

  // Reset task filters when the project changes so per-project tag ids/search don't leak over.
  useEffect(() => {
    setSelectedTagIds([]);
    setBacklogSearch('');
  }, [projectId]);

  const selectedTaskAssignments = useMemo(() => taskAssignments ?? [], [taskAssignments]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTasks) {
      toast.error('No tienes permisos para crear tareas.');
      return;
    }

    const trimmedTitle = newTask.title.trim();
    if (!trimmedTitle) {
      toast.error('El titulo es obligatorio.');
      return;
    }

    const isDuplicateTitle = (tasks ?? []).some(
      (task) => task.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
    );
    if (isDuplicateTitle) {
      toast.error('Ya existe una tarea con ese nombre en este proyecto.');
      return;
    }

    const boardColumn = defaultBacklogColumnId ?? null;

    if (newTask.priority == null) {
      toast.error('Selecciona una prioridad.');
      return;
    }

    try {
      const created = await tasksService.create({
        project: projectId,
        board_column: boardColumn,
        title: trimmedTitle,
        description: newTask.description.trim() || undefined,
        start_date: newTask.start_date || undefined,
        due_date: newTask.due_date || undefined,
        priority: newTask.priority,
        sprint: newTask.sprint,
        milestone: null,
        tags: newTask.tags,
        ...(newTask.assignedTo.length > 0 ? { assigned_to: newTask.assignedTo[0] } : {}),
      });

      await Promise.all(newTask.assignedTo.map((assignedId) => tasksService.createAssignment({ task: created.id_task, assigned_to: assignedId })));

      // Create any subtasks added in the modal, preserving their order.
      const subtaskTitles = newTask.subtasks.map((s) => s.trim()).filter(Boolean);
      if (subtaskTitles.length > 0) {
        await Promise.all(subtaskTitles.map((title, i) =>
          tasksService.createSubtask({ parent_task: created.id_task, title, order: i + 1 }),
        ));
      }

      setShowTaskModal(false);
      setNewSubtaskInput('');
      setNewTask({
        title: '',
        description: '',
        start_date: '',
        due_date: '',
        priority: null,
        tags: [],
        assignedTo: [],
        sprint: null,
        subtasks: [],
      });
      refetchTasks();
      refetchTaskAssignments();
      toast.success('Tarea creada.');
    } catch {
      toast.error('No se pudo crear la tarea.');
    }
  };

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoard.name.trim()) return;
    try {
      const created = await tasksService.createBoard(projectId, {
        name: newBoard.name.trim(),
        description: newBoard.description.trim() || undefined,
        coding_style: newBoard.coding_style || undefined,
        review_focus: newBoard.review_focus || undefined,
        tech_stack: newBoard.tech_stack || undefined,
        naming_convention: newBoard.naming_convention || undefined,
        response_language: newBoard.response_language || undefined,
        custom_instructions: newBoard.custom_instructions.trim() || undefined,
      });
      for (let i = 0; i < newBoardColumns.length; i++) {
        await tasksService.createBoardColumn({
          board: created.id_board,
          name: newBoardColumns[i].name,
          order: i + 1,
          is_final: i === newBoardColumns.length - 1,
          is_review: isReviewIndex(i, newBoardColumns.length),
        });
      }
      if (newBoardColumns.length > 0) refetchColumns();
      setSelectedBoardId(created.id_board);
      setNewBoard({ name: '', description: '', coding_style: 'standard', review_focus: 'strict', tech_stack: 'mixed', naming_convention: 'default', response_language: 'es', custom_instructions: '' });
      setNewBoardColumns([{ name: 'To Do', tempId: 1 }, { name: 'In Progress', tempId: 2 }, { name: 'Done', tempId: 3 }]);
      setNewBoardColumnInput('');
      setShowBoardModal(false);
      refetchBoards();
      toast.success('Board creado.');
    } catch {
      toast.error('No se pudo crear el board.');
    }
  };

  const saveBoard = async () => {
    if (!editingBoardId || !editingBoardDraft) return;
    setSavingBoardEdit(true);
    try {
      await tasksService.updateBoard(editingBoardId, {
        name: editingBoardDraft.name.trim() || undefined,
        description: editingBoardDraft.description.trim() || null,
        coding_style: editingBoardDraft.coding_style || undefined,
        review_focus: editingBoardDraft.review_focus || undefined,
        tech_stack: editingBoardDraft.tech_stack || undefined,
        naming_convention: editingBoardDraft.naming_convention || undefined,
        response_language: editingBoardDraft.response_language || undefined,
        custom_instructions: editingBoardDraft.custom_instructions.trim() || null,
      });
      setEditingBoardId(null);
      setEditingBoardDraft(null);
      refetchBoards();
      toast.success('Board actualizado.');
    } catch {
      toast.error('No se pudo actualizar el board.');
    } finally {
      setSavingBoardEdit(false);
    }
  };

  const createColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBoardId || !newColumn.name.trim()) return;
    const existingCols = [...(boardColumnsByBoard.get(selectedBoardId) ?? [])].sort((a, b) => a.order - b.order);
    try {
      // New columns go to the TOP: shift existing ones down, then insert at order 1.
      await Promise.all(existingCols.map((c) => tasksService.updateBoardColumn(c.id_column, { order: c.order + 1 })));
      await tasksService.createBoardColumn({
        board: selectedBoardId,
        name: newColumn.name.trim(),
        order: 1,
        is_final: existingCols.length === 0,
        // Inserted at the top, so it's the penultimate (review) column only when it lands second-to-last.
        is_review: existingCols.length === 1,
      });
      setNewColumn({ name: '', is_final: false });
      setShowColumnModal(false);
      refetchColumns();
      toast.success('Columna creada.');
    } catch {
      toast.error('No se pudo crear la columna.');
    }
  };

  const saveSprintEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSprint) return;
    // Grandfather pre-existing out-of-range dates: only enforce the project/next-sprint bounds on
    // a date the user actually changed, so an out-of-range sprint (e.g. after the project was
    // rescheduled) can still be edited toward a valid range or have its boards/status updated.
    const original = (sprints ?? []).find((s) => s.id_sprint === editingSprint.id);
    const startChanged = editingSprint.start_date !== (original?.start_date ?? '');
    const endChanged = editingSprint.end_date !== (original?.end_date ?? '');

    if (editingSprint.start_date && editingSprint.end_date && editingSprint.start_date > editingSprint.end_date) {
      toast.error('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }
    if (startChanged && projectStartDate && editingSprint.start_date && editingSprint.start_date < projectStartDate) {
      toast.error(`El sprint no puede iniciar antes del inicio del proyecto (${projectStartDate}).`);
      return;
    }
    if (endChanged && projectEndDate && editingSprint.end_date && editingSprint.end_date > projectEndDate) {
      toast.error(`El sprint no puede terminar después del fin del proyecto (${projectEndDate}).`);
      return;
    }
    if (endChanged && editingSprintBounds.nextStart && editingSprint.end_date && editingSprint.end_date >= editingSprintBounds.nextStart) {
      toast.error(`El sprint debe terminar antes del inicio del siguiente sprint (${editingSprintBounds.nextStart}).`);
      return;
    }
    setSavingSprintEdit(true);
    try {
      await tasksService.updateSprint(editingSprint.id, {
        start_date: editingSprint.start_date || null,
        end_date: editingSprint.end_date || null,
        status: deriveSprintStatus(editingSprint.start_date || null, editingSprint.end_date || null),
      });
      // Sync board associations
      const currentBoardAssocs = (allSprintBoards ?? []).filter((sb) => sb.sprint === editingSprint.id);
      const currentBoardIdsSet = new Set(currentBoardAssocs.map((sb) => sb.board));
      const newBoardIdsSet = new Set(editingSprintBoardIds);
      const toAdd = editingSprintBoardIds.filter((id) => !currentBoardIdsSet.has(id));
      const toRemove = currentBoardAssocs.filter((sb) => !newBoardIdsSet.has(sb.board));
      if (toAdd.length > 0 || toRemove.length > 0) {
        await Promise.all([
          ...toAdd.map((boardId) => tasksService.createSprintBoard({ sprint: editingSprint.id, board: boardId })),
          ...toRemove.map((sb) => tasksService.deleteSprintBoard(sb.id)),
        ]);
        refetchSprintBoards();
      }
      refetchSprints();
      setEditingSprint(null);
      toast.success('Sprint actualizado.');
    } catch {
      toast.error('No se pudo actualizar el sprint.');
    } finally {
      setSavingSprintEdit(false);
    }
  };

  const startMoveTask = (taskId: number) => {
    setPushingTaskId(taskId);
    setPushSprintId(null);
    setPushBoardId(null);
    setPushColumnId(null);
  };

  const handlePushTaskToSprint = async () => {
    if (!pushingTaskId || !pushSprintId) return;
    setSavingPush(true);
    try {
      await tasksService.update(pushingTaskId, {
        sprint: pushSprintId,
        board_column: pushColumnId ?? null,
      });
      refetchTasks();
      setPushingTaskId(null);
      setPushSprintId(null);
      setPushBoardId(null);
      setPushColumnId(null);
      toast.success('Tarea enviada al sprint.');
    } catch {
      toast.error('No se pudo enviar la tarea al sprint.');
    } finally {
      setSavingPush(false);
    }
  };

  const createSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSprint.start_date || !newSprint.end_date) {
      toast.error('Las fechas de inicio y fin son obligatorias.');
      return;
    }
    if (latestSprintEndDate && newSprint.start_date <= latestSprintEndDate) {
      toast.error(`El sprint debe iniciar despues del ${latestSprintEndDate} (el dia siguiente o mas tarde).`);
      return;
    }
    if (projectEndDate && newSprint.end_date > projectEndDate) {
      toast.error(`El sprint no puede terminar despues del fin del proyecto (${projectEndDate}).`);
      return;
    }
    if (newSprint.start_date > newSprint.end_date) {
      toast.error('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }
    const autoName = `Sprint ${(sprints ?? []).length + 1}`;
    try {
      const created = await tasksService.createSprint({
        project: projectId,
        name: autoName,
        start_date: newSprint.start_date || undefined,
        end_date: newSprint.end_date || undefined,
        status: deriveSprintStatus(newSprint.start_date || null, newSprint.end_date || null),
      });
      if (newSprintBoardIds.length > 0) {
        await Promise.all(
          newSprintBoardIds.map((boardId) =>
            tasksService.createSprintBoard({ sprint: created.id_sprint, board: boardId }),
          ),
        );
        refetchSprintBoards();
      }
      setSelectedSprintId(created.id_sprint);
      const firstBoardId = newSprintBoardIds[0] ?? (boards ?? [])[0]?.id_board ?? null;
      setSelectedBoardId(firstBoardId ?? null);
      setNewSprintBoardIds([]);
      setNewSprint({ name: '', start_date: '', end_date: '', status: 'planned' });
      setShowSprintModal(false);
      refetchSprints();
      toast.success('Sprint creado.');
    } catch {
      toast.error('No se pudo crear el sprint.');
    }
  };

  const createTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;
    try {
      await tasksService.createTag({ project: projectId, name: newTag.name.trim(), color: newTag.color });
      setShowTagModal(false);
      setNewTag({ name: '', color: '#56697f' });
      refetchTags();
      toast.success('Tag creado.');
    } catch {
      toast.error('No se pudo crear el tag.');
    }
  };

  const deleteSprint = async (sprintId: number, sprintName: string) => {
    if (!confirm(`¿Eliminar “${sprintName}”? Las tareas volverán al backlog.`)) return;
    setDeletingSprintId(sprintId);
    try {
      await tasksService.deleteSprint(sprintId);
      // Renumber remaining sprints so the "Sprint N" sequence stays contiguous
      // (delete Sprint 3 of 1-4 → old Sprint 4 becomes Sprint 3).
      const remaining = (sprints ?? [])
        .filter((s) => s.id_sprint !== sprintId)
        .sort((a, b) => {
          if (!a.start_date && !b.start_date) return a.id_sprint - b.id_sprint;
          if (!a.start_date) return -1;
          if (!b.start_date) return 1;
          return a.start_date.localeCompare(b.start_date);
        });
      const renames = remaining
        .map((s, i) => ({ s, desired: `Sprint ${i + 1}` }))
        .filter(({ s, desired }) => s.name !== desired)
        .map(({ s, desired }) => tasksService.updateSprint(s.id_sprint, { name: desired }));
      if (renames.length > 0) await Promise.all(renames);

      if (selectedSprintId === sprintId) setSelectedSprintId(null);
      setEditingSprint(null);
      refetchSprints();
      refetchTasks();
      refetchSprintBoards();
      toast.success('Sprint eliminado.');
    } catch {
      toast.error('No se pudo eliminar el sprint.');
    } finally {
      setDeletingSprintId(null);
    }
  };

  // Double-click prevention for modal open buttons
  const handleShowTaskModal = usePreventDoubleClick(
    () => {
      setNewTask((prev) => ({ ...prev, sprint: null }));
      setShowTaskModal(true);
    },
  );

  const handleShowBoardModal = usePreventDoubleClick(() => setShowBoardModal(true));
  const handleShowColumnModal = usePreventDoubleClick(() => setShowColumnModal(true));
  const handleShowSprintModal = usePreventDoubleClick(() => {
    setNewSprint((prev) => ({ ...prev, start_date: sprintStartMinDate, end_date: '' }));
    setNewSprintBoardIds([]);
    setShowSprintModal(true);
  });
  const handleShowSprintTaskModal = usePreventDoubleClick(
    () => {
      setNewTask((prev) => ({ ...prev, sprint: selectedSprintId }));
      setShowTaskModal(true);
    },
  );

  const selectedBoard = (boards ?? []).find((board) => board.id_board === selectedBoardId) ?? null;

  // Structural board editing (settings, add/delete/rename columns) is locked once the
  // board has tasks, to avoid orphaning them. Reordering columns stays allowed.
  const boardHasTasks = (boardId: number) => {
    const colIds = new Set((boardColumnsByBoard.get(boardId) ?? []).map((c) => c.id_column));
    return (tasks ?? []).some((t) => colIds.has(t.board_column));
  };
  const selectedBoardLocked = selectedBoardId != null && boardHasTasks(selectedBoardId);

  // A board can only be deleted if no sprint references it.
  const boardInSprint = (boardId: number) => (allSprintBoards ?? []).some((sb) => sb.board === boardId);
  const selectedBoardInSprint = selectedBoardId != null && boardInSprint(selectedBoardId);

  const handleDeleteBoard = async () => {
    if (!selectedBoard) return;
    if (boardInSprint(selectedBoard.id_board)) {
      toast.error('No se puede eliminar: el board está asignado a un sprint.');
      return;
    }
    if (!confirm(`¿Eliminar el board "${selectedBoard.name}"? Se eliminarán sus columnas.`)) return;
    setDeletingBoard(true);
    try {
      await tasksService.deleteBoard(selectedBoard.id_board);
      setSelectedBoardId(null);
      setEditingBoardId(null);
      setEditingBoardDraft(null);
      refetchBoards();
      refetchColumns();
      toast.success('Board eliminado.');
    } catch {
      toast.error('No se pudo eliminar el board.');
    } finally {
      setDeletingBoard(false);
    }
  };

  const pushingTask = pushingTaskId != null ? (tasks ?? []).find((task) => task.id_task === pushingTaskId) ?? null : null;
  // When moving a task that already belongs to a sprint, don't offer its current sprint as a destination.
  const pushSprintOptions = (sprints ?? []).filter((s) => pushingTask?.sprint == null || s.id_sprint !== pushingTask.sprint);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    if (!canMoveTasks) return;
    const { active, over } = event;
    if (!over) return;
    const draggedTask = (tasks ?? []).find((task) => task.id_task === Number(active.id));
    if (!draggedTask) return;
    let targetColumnId: number | null = null;
    const overId = String(over.id);
    if (overId.startsWith('column-')) {
      targetColumnId = Number(overId.replace('column-', ''));
    } else {
      const overTask = (tasks ?? []).find((task) => String(task.id_task) === overId);
      targetColumnId = overTask?.board_column ?? null;
    }
    if (!targetColumnId || draggedTask.board_column === targetColumnId) return;
    const targetColumn = (columns ?? []).find((column) => column.id_column === targetColumnId);
    const targetIsFinal =
      targetColumn?.is_final === true
      || /^(done|completad[ao]|finalizad[ao])$/i.test((targetColumn?.name ?? '').trim());
    try {
      await tasksService.update(draggedTask.id_task, {
        board_column: targetColumnId,
        completed_at: targetIsFinal
          ? (draggedTask.completed_at ?? new Date().toISOString())
          : null,
      });
      refetchTasks();
      toast.success(targetIsFinal ? 'Tarea completada.' : 'Tarea movida.');
    } catch {
      toast.error('No se pudo mover la tarea.');
    }
  };

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    if (!canCreateBoards) return; // read-only roles (e.g. stakeholder) cannot reorder columns
    const { active, over } = event;
    if (!over || String(active.id) === String(over.id) || !selectedBoardId) return;
    // A board with tasks is locked — no column reordering.
    if (boardHasTasks(selectedBoardId)) return;
    const cols = [...(boardColumnsByBoard.get(selectedBoardId) ?? [])].sort((a, b) => a.order - b.order);
    const oldIndex = cols.findIndex((c) => c.id_column === Number(active.id));
    const newIndex = cols.findIndex((c) => c.id_column === Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(cols, oldIndex, newIndex);
    try {
      await Promise.all(
        reordered.map((col, i) =>
          tasksService.updateBoardColumn(col.id_column, { order: i + 1, is_final: i === reordered.length - 1, is_review: isReviewIndex(i, reordered.length) }),
        ),
      );
      refetchColumns();
    } catch {
      toast.error('No se pudo reordenar las columnas.');
    }
  };

  const handleDeleteColumn = async (columnId: number, boardId: number) => {
    const cols = boardColumnsByBoard.get(boardId) ?? [];
    if (cols.length <= 3) {
      toast.error('El board debe tener al menos 3 columnas.');
      return;
    }
    if (!confirm('¿Eliminar esta columna? Las tareas que estén aquí quedarán sin columna asignada.')) return;
    try {
      await tasksService.deleteBoardColumn(columnId);
      const remaining = [...cols].filter((c) => c.id_column !== columnId).sort((a, b) => a.order - b.order);
      await Promise.all(
        remaining.map((col, i) =>
          tasksService.updateBoardColumn(col.id_column, { order: i + 1, is_final: i === remaining.length - 1, is_review: isReviewIndex(i, remaining.length) }),
        ),
      );
      refetchColumns();
      toast.success('Columna eliminada.');
    } catch {
      toast.error('No se pudo eliminar la columna.');
    }
  };

  const createBoardInSprint = async () => {
    if (!newBoardInSprintName.trim()) return;
    setCreatingBoardInSprint(true);
    try {
      const created = await tasksService.createBoard(projectId, {
        name: newBoardInSprintName.trim(),
        coding_style: 'standard',
        review_focus: 'strict',
        tech_stack: 'mixed',
        naming_convention: 'default',
        response_language: 'es',
      });
      await tasksService.createBoardColumn({ board: created.id_board, name: 'To Do', order: 1, is_final: false, is_review: false });
      await tasksService.createBoardColumn({ board: created.id_board, name: 'In Progress', order: 2, is_final: false, is_review: false });
      await tasksService.createBoardColumn({ board: created.id_board, name: 'Review', order: 3, is_final: false, is_review: true });
      await tasksService.createBoardColumn({ board: created.id_board, name: 'Done', order: 4, is_final: true, is_review: false });
      setNewSprintBoardIds((prev) => [...prev, created.id_board]);
      setNewBoardInSprintName('');
      setShowCreateBoardInSprint(false);
      refetchBoards();
      refetchColumns();
      toast.success('Board creado.');
    } catch {
      toast.error('No se pudo crear el board.');
    } finally {
      setCreatingBoardInSprint(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {/* Left: tab switcher (when not forced) */}
        {!forcedTab && (
          <div className="flex items-center gap-1 rounded-[4px] border border-border bg-surface-secondary/40 p-1 shrink-0">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-7 px-3 rounded-[3px] text-[11px] font-medium capitalize ${activeTab === tab ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* Left: search + tag filter dropdown (backlog & sprints) */}
        {(activeTab === 'backlog' || activeTab === 'sprints') && (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder="Buscar tarea..."
                className="h-8 w-48 rounded-[3px] border border-border bg-surface-secondary pl-7 pr-2 text-[11px] placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowTagFilter((v) => !v); setTagFilterSearch(''); }}
                className={`h-8 px-2.5 rounded-[3px] border text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                  selectedTagIds.length > 0
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filtrar
                {selectedTagIds.length > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {selectedTagIds.length}
                  </span>
                )}
              </button>
              {showTagFilter && (
                <div className="absolute left-0 top-full mt-1 z-20 rounded-[8px] border border-border bg-card shadow-md p-2.5 w-[320px] flex flex-col gap-2">
                  {(tags ?? []).length > 3 && (
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      <input
                        value={tagFilterSearch}
                        onChange={(e) => setTagFilterSearch(e.target.value)}
                        placeholder="Buscar tags..."
                        className="h-7 w-full rounded-[4px] border border-border bg-surface-secondary pl-7 pr-2 text-[11px] placeholder:text-muted-foreground/60"
                      />
                    </div>
                  )}

                  {(tags ?? []).length === 0 ? (
                    <span className="text-[10px] text-muted-foreground px-1 py-1">Sin tags en este proyecto</span>
                  ) : filteredTagOptions.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground px-1 py-1">No se encontraron tags</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                      {filteredTagOptions.map((tag) => {
                        const selected = selectedTagIds.includes(tag.id_tag);
                        return (
                          <button
                            key={tag.id_tag}
                            type="button"
                            onClick={() => setSelectedTagIds((current) => selected ? current.filter((id) => id !== tag.id_tag) : [...current, tag.id_tag])}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                              selected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-surface-secondary/60 text-foreground hover:bg-accent'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color ?? '#56697f' }} />
                            {tag.name}
                            {selected && <Check className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedTagIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTagIds([])}
                      className="mt-0.5 h-7 px-2 rounded-[4px] text-[10px] text-muted-foreground hover:text-foreground border border-border text-left"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5">
          {canCreateBoards && activeTab === 'boards' && (
            <>
              <button
                type="button"
                onClick={() => handleShowBoardModal()}
                className="h-8 px-3 rounded-[3px] bg-primary text-primary-foreground text-[11px] font-medium inline-flex items-center gap-1.5"
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Nuevo board
              </button>
              <button
                type="button"
                onClick={() => handleShowColumnModal()}
                disabled={!selectedBoardId || selectedBoardLocked}
                title={selectedBoardLocked ? 'El board tiene tareas; edición bloqueada' : undefined}
                className="h-8 px-3 rounded-[3px] border border-border text-[11px] inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-accent/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva columna
              </button>
            </>
          )}
          {canCreateTasks && (activeTab === 'backlog' || activeTab === 'sprints') && (
            <button type="button" onClick={() => setShowTagModal(true)} className="h-8 px-3 rounded-[3px] border border-border text-[11px] inline-flex items-center gap-1 hover:bg-accent/30 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nuevo tag
            </button>
          )}
          {canCreateTasks && activeTab === 'backlog' && (
            <button type="button" onClick={() => handleShowTaskModal()} className="h-8 px-3 rounded-[3px] bg-primary text-primary-foreground text-[11px] font-medium inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nueva tarea
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && activeTab === 'backlog' && (
        <div className="rounded-[4px] border border-border bg-card overflow-auto">
          <table className="w-full min-w-[920px] text-[11px]">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/50">
                <th className="text-left px-4 py-2">Titulo</th>
                <th className="text-left px-4 py-2">Prioridad</th>
                <th className="text-left px-4 py-2">Tags</th>
                {canMoveTasks && <th className="text-left px-4 py-2 w-[140px]">Sprint</th>}
              </tr>
            </thead>
            <tbody>
              {backlogTagFilteredTasks.map((task) => (
                <tr key={task.id_task} className="border-b border-border/60 hover:bg-accent/20 cursor-pointer align-top" onClick={() => setSelectedTask(task)}>
                  <td className="px-4 py-3 min-w-[360px] max-w-[520px]">
                    <p className="text-[12px] font-semibold text-foreground">{task.title}</p>
                    {task.description && <p className="mt-1 text-muted-foreground leading-relaxed line-clamp-2 break-words">{task.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium text-foreground">
                      {priorityById.get(task.priority)?.name ?? `Prioridad ${task.priority}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {task.tags.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">Sin tags</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 max-w-[420px]">
                        {task.tags.slice(0, 4).map((tagId) => {
                          const tag = tagById.get(tagId);
                          const tagName = tag?.name ?? `#${tagId}`;
                          return (
                            <span
                              key={`${task.id_task}-${tagId}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-secondary/70 px-2.5 py-1 text-[10px] font-medium text-foreground"
                              title={tagName}
                              style={{
                                boxShadow: `inset 0 0 0 1px ${(tag?.color ?? '#56697f')}33`,
                              }}
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: tag?.color ?? '#56697f' }}
                              />
                              {tagName}
                            </span>
                          );
                        })}
                        {task.tags.length > 4 && (
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground bg-card">
                            +{task.tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  {canMoveTasks && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => startMoveTask(task.id_task)}
                        className="h-6 px-2 rounded-[3px] border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Mover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === 'sprints' && (
        <div className="flex-1 min-h-0 flex overflow-hidden rounded-[4px] border border-border bg-card">
          {/* Left: scrollable sprint selector */}
          <div className="w-[210px] flex-shrink-0 border-r border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground font-medium">Sprints</p>
              {canCreateBoards && (
                <button
                  type="button"
                  onClick={() => handleShowSprintModal()}
                  disabled={noMoreSprintsAllowed}
                  className="h-6 w-6 rounded-[4px] bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  title={noMoreSprintsAllowed ? 'No hay espacio para mas sprints' : 'Nuevo sprint'}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {sortedSprints.length === 0 ? (
                <p className="px-3 py-4 text-[11px] text-muted-foreground">Sin sprints creados</p>
              ) : (
                sortedSprints.map((sprint) => (
                  <button
                    key={sprint.id_sprint}
                    type="button"
                    onClick={() => {
                      setSelectedSprintId(sprint.id_sprint);
                      const sprintBoards = (allSprintBoards ?? []).filter((sb) => sb.sprint === sprint.id_sprint);
                      const firstBoardId =
                        sprintBoards.length > 0
                          ? sprintBoards[0].board
                          : (boards ?? [])[0]?.id_board ?? null;
                      setSelectedBoardId(firstBoardId ?? null);
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/40 last:border-0 transition-colors group ${
                      selectedSprintId === sprint.id_sprint
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-accent/20 text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[11px] font-medium truncate">{sprint.name}</p>
                      {canCreateBoards && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentBoardIds = (allSprintBoards ?? [])
                              .filter((sb) => sb.sprint === sprint.id_sprint)
                              .map((sb) => sb.board);
                            setEditingSprint({ id: sprint.id_sprint, name: sprint.name, start_date: sprint.start_date ?? '', end_date: sprint.end_date ?? '', status: sprint.status });
                            setEditingSprintBoardIds(currentBoardIds);
                          }}
                          className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-[3px] border border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center justify-center shrink-0 transition-opacity"
                          title="Editar sprint"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(() => {
                        const derived = deriveSprintStatus(sprint.start_date, sprint.end_date);
                        return (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            derived === 'active' ? 'bg-success/20 text-success' :
                            derived === 'closed' ? 'bg-muted text-muted-foreground' :
                            'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}>
                            {SPRINT_STATUS_LABEL[derived]}
                          </span>
                        );
                      })()}
                      {sprint.end_date && (
                        <span className="text-[9px] text-muted-foreground truncate">{sprint.end_date}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: sprint content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {selectedSprintId == null ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px] text-muted-foreground">Selecciona un sprint para ver las tareas</p>
              </div>
            ) : (
              <>
                {/* Inner toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
                  <select
                    value={selectedBoardId ?? ''}
                    onChange={(e) => setSelectedBoardId(e.target.value ? Number(e.target.value) : null)}
                    className="h-7 min-w-[200px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]"
                  >
                    <option value="">Todas las tareas</option>
                    {sprintBoardsList.map((board) => (
                      <option key={board.id_board} value={board.id_board}>{board.name}</option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  {selectedBoardId != null && (
                    <div className="flex items-center rounded-[3px] border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setSprintViewMode('kanban')}
                        className={`h-7 px-2 inline-flex items-center ${sprintViewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-surface-secondary text-muted-foreground hover:text-foreground'}`}
                        title="Vista kanban"
                      >
                        <LayoutDashboard className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSprintViewMode('list')}
                        className={`h-7 px-2 inline-flex items-center ${sprintViewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-surface-secondary text-muted-foreground hover:text-foreground'}`}
                        title="Vista lista"
                      >
                        <LayoutList className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {canCreateTasks && (
                    <button
                      type="button"
                      onClick={() => handleShowSprintTaskModal()}
                      className="h-7 px-2.5 rounded-[3px] bg-primary text-primary-foreground text-[10px] font-medium inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Nueva tarea
                    </button>
                  )}
                </div>

                {/* Kanban when board selected, list when "Todas las tareas" */}
                <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col">
                  {selectedBoardId != null && sprintViewMode === 'kanban' ? (
                    <DndContext
                      collisionDetection={closestCenter}
                      onDragStart={(event) => setActiveDragId(Number(event.active.id))}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="grid gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: `repeat(${Math.max(selectedBoardColumns.length, 1)}, minmax(0, 1fr))` }}>
                        {selectedBoardColumns.map((column) => {
                          const colTasks = sprintTasks.filter((task) => task.board_column === column.id_column);
                          return (
                            <DroppableColumn key={column.id_column} id={`column-${column.id_column}`}>
                              <div className="h-full rounded-[4px] border border-border bg-surface-secondary/40 p-2 flex flex-col min-h-0">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{column.name}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${column.is_final ? 'bg-success/20 text-success' : 'bg-card text-muted-foreground'}`}>{colTasks.length}</span>
                                </div>
                                <SortableContext items={colTasks.map((task) => task.id_task)} strategy={verticalListSortingStrategy}>
                                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                                    {colTasks.map((task) => (
                                      <TaskCard
                                        key={task.id_task}
                                        task={task}
                                        onOpen={setSelectedTask}
                                        onMove={canMoveTasks ? (t) => startMoveTask(t.id_task) : undefined}
                                        draggable={canMoveTasks}
                                        tagById={tagById}
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                              </div>
                            </DroppableColumn>
                          );
                        })}
                      </div>
                      <DragOverlay>
                        {activeDragId ? (
                          <div className="rounded-[4px] border border-primary bg-card p-2 text-[11px] shadow-sm">
                            {(tasks ?? []).find((task) => task.id_task === activeDragId)?.title ?? 'Tarea'}
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  ) : (
                    <div className="rounded-[4px] border border-border bg-card overflow-auto h-full">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border bg-surface-secondary/50">
                            <th className="text-left px-3 py-2">Titulo</th>
                            <th className="text-left px-3 py-2">Tags</th>
                            {canMoveTasks && <th className="text-left px-3 py-2 w-[100px]">Sprint</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {sprintTasks.length === 0 ? (
                            <tr>
                              <td colSpan={canMoveTasks ? 3 : 2} className="px-3 py-6 text-center text-muted-foreground">Sin tareas en este sprint</td>
                            </tr>
                          ) : (
                            sprintTasks.map((task) => {
                              const colName = (columns ?? []).find((col) => col.id_column === task.board_column)?.name ?? null;
                              return (
                                <tr key={task.id_task} className="border-b border-border/60 hover:bg-accent/20 cursor-pointer align-middle" onClick={() => setSelectedTask(task)}>
                                  <td className="px-3 py-2.5 min-w-[260px]">
                                    <p className="font-medium text-foreground">{task.title}</p>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {colName && (
                                        <span className="inline-flex items-center gap-1 rounded-[3px] border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                          {colName}
                                        </span>
                                      )}
                                      {task.tags.map((tagId) => {
                                        const tag = tagById.get(tagId);
                                        return (
                                          <span
                                            key={tagId}
                                            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-secondary/70 px-2 py-0.5 text-[10px] text-foreground"
                                            style={{ boxShadow: `inset 0 0 0 1px ${(tag?.color ?? '#56697f')}33` }}
                                          >
                                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: tag?.color ?? '#56697f' }} />
                                            {tag?.name ?? `#${tagId}`}
                                          </span>
                                        );
                                      })}
                                      {!colName && task.tags.length === 0 && (
                                        <span className="text-[10px] text-muted-foreground">Sin tags</span>
                                      )}
                                    </div>
                                  </td>
                                  {canMoveTasks && (
                                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => startMoveTask(task.id_task)}
                                        className="h-6 px-2 rounded-[3px] border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1"
                                        title="Mover a otro sprint"
                                      >
                                        <ArrowRightLeft className="w-3 h-3" /> Mover
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && activeTab === 'boards' && (
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-3 min-h-0 flex-1">
          {/* Left: board list */}
          <div className="rounded-[4px] border border-border bg-card overflow-y-auto">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground font-medium">Boards</p>
            </div>
            {(boards ?? []).length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-muted-foreground">Sin boards creados</p>
            ) : (
              <div className="p-1.5 space-y-0.5">
                {(boards ?? []).map((board) => (
                  <div
                    key={board.id_board}
                    className={`group relative rounded-[4px] px-3 py-2 text-[11px] cursor-pointer transition-colors ${
                      selectedBoardId === board.id_board
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent/30 text-foreground'
                    }`}
                    onClick={() => { setSelectedBoardId(board.id_board); setEditingBoardId(null); setEditingBoardDraft(null); }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-medium truncate flex-1">{board.name}</p>
                      {canCreateBoards && !boardHasTasks(board.id_board) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBoardId(board.id_board);
                            setEditingBoardId(board.id_board);
                            setEditingBoardDraft({
                              name: board.name,
                              description: board.description ?? '',
                              coding_style: board.coding_style ?? 'standard',
                              review_focus: board.review_focus ?? 'strict',
                              tech_stack: board.tech_stack ?? 'mixed',
                              naming_convention: board.naming_convention ?? 'default',
                              response_language: board.response_language ?? 'es',
                              custom_instructions: board.custom_instructions ?? '',
                            });
                          }}
                          className={`opacity-0 group-hover:opacity-100 h-5 w-5 rounded-[3px] border inline-flex items-center justify-center shrink-0 transition-opacity ml-1 ${
                            selectedBoardId === board.id_board
                              ? 'border-primary-foreground/30 text-primary-foreground/70 hover:text-primary-foreground bg-primary/30'
                              : 'border-border text-muted-foreground hover:text-foreground bg-card'
                          }`}
                          title="Editar board"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    {board.description && (
                      <p className={`text-[10px] mt-0.5 truncate ${selectedBoardId === board.id_board ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{board.description}</p>
                    )}
                    <p className={`text-[9px] mt-1 ${selectedBoardId === board.id_board ? 'text-primary-foreground/60' : 'text-muted-foreground/70'}`}>
                      {(boardColumnsByBoard.get(board.id_board) ?? []).length} columnas
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: board details / column manager */}
          <div className="rounded-[4px] border border-border bg-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0">
              {editingBoardId === selectedBoard?.id_board && editingBoardDraft ? (
                <input
                  value={editingBoardDraft.name}
                  onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, name: e.target.value } : null)}
                  className="flex-1 h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[12px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              ) : (
                <h3 className="flex-1 text-[12px] font-medium text-foreground">{selectedBoard ? selectedBoard.name : 'Selecciona un board'}</h3>
              )}
              {selectedBoard && canCreateBoards && selectedBoardLocked && editingBoardId !== selectedBoard.id_board && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-surface-secondary/60 px-2 py-1 rounded-[3px] shrink-0">
                  <Lock className="w-3 h-3" /> Con tareas — edición bloqueada
                </span>
              )}
              {selectedBoard && canCreateBoards && (!selectedBoardLocked || editingBoardId === selectedBoard.id_board) && (
                <div className="flex items-center gap-1 shrink-0">
                  {editingBoardId === selectedBoard.id_board ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveBoard()}
                        disabled={savingBoardEdit}
                        className="h-7 px-2.5 rounded-[3px] bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {savingBoardEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingBoardId(null); setEditingBoardDraft(null); }}
                        className="h-7 px-2 rounded-[3px] border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBoardId(selectedBoard.id_board);
                        setEditingBoardDraft({
                          name: selectedBoard.name,
                          description: selectedBoard.description ?? '',
                          coding_style: selectedBoard.coding_style ?? 'standard',
                          review_focus: selectedBoard.review_focus ?? 'strict',
                          tech_stack: selectedBoard.tech_stack ?? 'mixed',
                          naming_convention: selectedBoard.naming_convention ?? 'default',
                          response_language: selectedBoard.response_language ?? 'es',
                          custom_instructions: selectedBoard.custom_instructions ?? '',
                        });
                      }}
                      className="h-7 px-2.5 rounded-[3px] border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  )}
                  {editingBoardId !== selectedBoard.id_board && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteBoard()}
                      disabled={selectedBoardInSprint || deletingBoard}
                      title={selectedBoardInSprint ? 'No se puede eliminar: asignado a un sprint' : 'Eliminar board'}
                      className="h-7 px-2.5 rounded-[3px] border border-destructive/30 text-[11px] text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingBoard ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Body */}
            {selectedBoard ? (
              <div className="flex-1 overflow-y-auto p-3">
                {editingBoardId === selectedBoard.id_board && editingBoardDraft ? (
                  /* Edit form */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-1">Descripción</label>
                      <textarea
                        value={editingBoardDraft.description}
                        onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, description: e.target.value } : null)}
                        rows={2}
                        placeholder="Descripción opcional"
                        className="w-full rounded-[3px] border border-border bg-surface-secondary px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-1">Estilo de código</label>
                        <select value={editingBoardDraft.coding_style} onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, coding_style: e.target.value } : null)} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                          <option value="standard">Standard</option>
                          <option value="clean_code">Clean Code / SOLID</option>
                          <option value="tdd">Test-Driven Development</option>
                          <option value="security">Security-First</option>
                          <option value="performance">Performance &amp; Optimization</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-1">Enfoque de revisión</label>
                        <select value={editingBoardDraft.review_focus} onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, review_focus: e.target.value } : null)} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                          <option value="strict">Strict — Story &amp; criteria only</option>
                          <option value="general">General — Story + code quality</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-1">Stack tecnológico</label>
                        <select value={editingBoardDraft.tech_stack} onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, tech_stack: e.target.value } : null)} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                          <option value="mixed">Mixed / Full-Stack</option>
                          <option value="python">Python</option>
                          <option value="nodejs">Node.js / JavaScript</option>
                          <option value="typescript">TypeScript / Node.js</option>
                          <option value="java">Java / Spring</option>
                          <option value="go">Go</option>
                          <option value="dotnet">C# / .NET</option>
                          <option value="react">React</option>
                          <option value="nextjs">Next.js</option>
                          <option value="angular">Angular</option>
                          <option value="vue">Vue.js</option>
                          <option value="vite">Vite / Vanilla JS</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-1">Convención de nombres</label>
                        <select value={editingBoardDraft.naming_convention} onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, naming_convention: e.target.value } : null)} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                          <option value="default">Language defaults</option>
                          <option value="camel_case">camelCase</option>
                          <option value="pascal_case">PascalCase</option>
                          <option value="snake_case">snake_case</option>
                          <option value="kebab_case">kebab-case</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-1">Idioma de respuesta</label>
                      <select value={editingBoardDraft.response_language} onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, response_language: e.target.value } : null)} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-1">Instrucciones personalizadas</label>
                      <textarea
                        value={editingBoardDraft.custom_instructions}
                        onChange={(e) => setEditingBoardDraft((prev) => prev ? { ...prev, custom_instructions: e.target.value } : null)}
                        rows={3}
                        placeholder="Instrucciones adicionales para el revisor de código..."
                        className="w-full rounded-[3px] border border-border bg-surface-secondary px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                ) : (
                  /* Column list with DnD */
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.06em] font-medium mb-2">
                      Columnas ({(boardColumnsByBoard.get(selectedBoard.id_board) ?? []).length})
                    </p>
                    <DndContext collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                      <SortableContext
                        items={(boardColumnsByBoard.get(selectedBoard.id_board) ?? []).map((c) => c.id_column)}
                        strategy={verticalListSortingStrategy}
                      >
                        {(boardColumnsByBoard.get(selectedBoard.id_board) ?? []).map((column, index) => {
                          const allCols = boardColumnsByBoard.get(selectedBoard.id_board) ?? [];
                          return (
                            <SortableColumnItem
                              key={column.id_column}
                              column={column}
                              index={index}
                              totalCount={allCols.length}
                              isEditing={editingColumnId === column.id_column}
                              editName={editingColumnName}
                              savingEdit={savingColumnEdit}
                              onEditStart={() => { setEditingColumnId(column.id_column); setEditingColumnName(column.name); }}
                              onEditChange={setEditingColumnName}
                              onEditSave={() => void (async () => {
                                if (!editingColumnName.trim()) return;
                                setSavingColumnEdit(true);
                                try {
                                  await tasksService.updateBoardColumn(column.id_column, { name: editingColumnName.trim() });
                                  setEditingColumnId(null);
                                  refetchColumns();
                                  toast.success('Columna actualizada.');
                                } catch {
                                  toast.error('No se pudo actualizar la columna.');
                                } finally {
                                  setSavingColumnEdit(false);
                                }
                              })()}
                              onEditCancel={() => setEditingColumnId(null)}
                              onDelete={() => void handleDeleteColumn(column.id_column, selectedBoard.id_board)}
                              locked={selectedBoardLocked || !canCreateBoards}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px] text-muted-foreground">Selecciona un board para ver sus columnas</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <form onSubmit={createTask} className="w-full max-w-2xl rounded-[6px] border border-border bg-card p-5 space-y-3">
            <h2 className="text-[13px] font-semibold text-foreground">
              {newTask.sprint != null
                ? `Nueva tarea - ${(sprints ?? []).find((s) => s.id_sprint === newTask.sprint)?.name ?? 'Sprint'}`
                : 'Nueva tarea (Product Backlog)'}
            </h2>
            <input value={newTask.title} onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))} placeholder="Titulo" className="w-full h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]" />
            <textarea value={newTask.description} onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descripcion" className="w-full rounded-[3px] border border-border bg-surface-secondary px-2 py-1 text-[11px]" rows={3} />

            <div className="grid md:grid-cols-2 gap-2">
              <DatePickerField
                value={newTask.start_date}
                onChange={(value) => setNewTask((prev) => ({ ...prev, start_date: value, due_date: value && prev.due_date && prev.due_date < value ? '' : prev.due_date }))}
                minDate={taskMinDate}
                maxDate={projectEndDate ?? undefined}
                placeholder="Fecha inicio"
              />
              <DatePickerField
                value={newTask.due_date}
                onChange={(value) => setNewTask((prev) => ({ ...prev, due_date: value }))}
                disabled={!newTask.start_date}
                minDate={newTask.start_date || taskMinDate}
                maxDate={projectEndDate ?? undefined}
                placeholder="Fecha limite"
              />
            </div>

            <select
              value={newTask.priority ?? ''}
              onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value ? Number(e.target.value) : null }))}
              className="h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]"
            >
              <option value="">Selecciona prioridad</option>
              {priorities.map((priority) => (
                <option key={priority.id_priority} value={priority.id_priority}>{priority.name}</option>
              ))}
            </select>

            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Asignar personas</p>
              <TaskAssigneePicker users={assignableUsers} selectedIds={newTask.assignedTo} onChange={(ids) => setNewTask((prev) => ({ ...prev, assignedTo: ids }))} />
            </div>

            {(tags ?? []).length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Tags</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {(tags ?? []).map((tag) => {
                    const selected = newTask.tags.includes(tag.id_tag);
                    return (
                      <button
                        key={tag.id_tag}
                        type="button"
                        onClick={() => setNewTask((prev) => ({
                          ...prev,
                          tags: selected ? prev.tags.filter((id) => id !== tag.id_tag) : [...prev.tags, tag.id_tag],
                        }))}
                        className={`h-6 px-2 rounded-full border text-[10px] ${selected ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Subtareas</p>
              {newTask.subtasks.length > 0 && (
                <div className="space-y-1 mb-2">
                  {newTask.subtasks.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-[3px] border border-border bg-surface-secondary/40 px-2 py-1.5 text-[11px]">
                      <span className="flex-1 text-foreground break-words">{st}</span>
                      <button
                        type="button"
                        onClick={() => setNewTask((prev) => ({ ...prev, subtasks: prev.subtasks.filter((_, idx) => idx !== i) }))}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Quitar subtarea"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  value={newSubtaskInput}
                  onChange={(e) => setNewSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = newSubtaskInput.trim();
                      if (v) { setNewTask((prev) => ({ ...prev, subtasks: [...prev.subtasks, v] })); setNewSubtaskInput(''); }
                    }
                  }}
                  placeholder="Nueva subtarea…"
                  className="flex-1 h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] placeholder:text-muted-foreground/60"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = newSubtaskInput.trim();
                    if (v) { setNewTask((prev) => ({ ...prev, subtasks: [...prev.subtasks, v] })); setNewSubtaskInput(''); }
                  }}
                  className="h-8 px-2.5 rounded-[3px] border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Agregar
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <p className="flex-1 text-[10px] text-muted-foreground self-center">
                {newTask.sprint != null
                  ? 'La tarea se creara y asignara al sprint seleccionado.'
                  : 'Se creara en Product Backlog (sin sprint, sin milestone).'}
              </p>
              <button type="button" onClick={() => { setNewTask((prev) => ({ ...prev, sprint: null, subtasks: [] })); setNewSubtaskInput(''); setShowTaskModal(false); }} className="h-8 px-3 rounded-[3px] border border-border text-[11px]">Cancelar</button>
              <button type="submit" className="h-8 px-3 rounded-[3px] bg-primary text-primary-foreground text-[11px]">Crear</button>
            </div>
          </form>
        </div>
      )}

      {/* Push task to sprint modal */}
      {pushingTaskId != null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-[6px] border border-border bg-card p-5 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold">{pushingTask?.sprint != null ? 'Mover a otro sprint' : 'Mover al sprint'}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {pushingTask?.sprint != null
                  ? `Actualmente en ${(sprints ?? []).find((s) => s.id_sprint === pushingTask.sprint)?.name ?? 'un sprint'}. Selecciona el sprint destino y board.`
                  : 'Selecciona sprint y board. La tarea se colocara en la primera columna del board.'}
              </p>
            </div>
            <select
              value={pushSprintId ?? ''}
              onChange={(e) => { setPushSprintId(e.target.value ? Number(e.target.value) : null); setPushBoardId(null); setPushColumnId(null); }}
              className="w-full h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]"
            >
              <option value="">Selecciona sprint</option>
              {pushSprintOptions.map((s) => (
                <option key={s.id_sprint} value={s.id_sprint}>{s.name}</option>
              ))}
            </select>
            <select
              value={pushBoardId ?? ''}
              onChange={(e) => {
                const boardId = e.target.value ? Number(e.target.value) : null;
                setPushBoardId(boardId);
                const firstCol = boardId ? (boardColumnsByBoard.get(boardId) ?? [])[0] ?? null : null;
                setPushColumnId(firstCol ? firstCol.id_column : null);
              }}
              className="w-full h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]"
            >
              <option value="">Selecciona board</option>
              {pushBoardOptions.map((b) => (
                <option key={b.id_board} value={b.id_board}>{b.name}</option>
              ))}
            </select>
            {pushBoardId != null && pushColumnId != null && (
              <p className="text-[10px] text-muted-foreground bg-surface-secondary/60 rounded-[3px] px-2.5 py-1.5">
                Columna asignada: <span className="font-medium text-foreground">{(boardColumnsByBoard.get(pushBoardId) ?? []).find((c) => c.id_column === pushColumnId)?.name ?? '-'}</span>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPushingTaskId(null)} className="h-8 px-3 border border-border rounded-[3px] text-[11px]">Cancelar</button>
              <button
                type="button"
                disabled={!pushSprintId || !pushBoardId || savingPush}
                onClick={() => void handlePushTaskToSprint()}
                className="h-8 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px] disabled:opacity-50 inline-flex items-center gap-1"
              >
                {savingPush ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Mover al sprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit sprint modal */}
      {editingSprint && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <form onSubmit={saveSprintEdit} className="w-full max-w-md rounded-[6px] border border-border bg-card p-5 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold">Editar {editingSprint.name}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DatePickerField
                value={editingSprint.start_date}
                onChange={(v) => setEditingSprint((prev) => prev ? { ...prev, start_date: v } : null)}
                placeholder="Fecha inicio"
                minDate={editingSprintBounds.minStart}
                maxDate={editingSprint.end_date || editingSprintBounds.maxEnd}
              />
              <DatePickerField
                value={editingSprint.end_date}
                onChange={(v) => setEditingSprint((prev) => prev ? { ...prev, end_date: v } : null)}
                placeholder="Fecha fin"
                minDate={editingSprint.start_date || editingSprintBounds.minStart}
                maxDate={editingSprintBounds.maxEnd}
              />
            </div>
            <p className="text-[10px] text-muted-foreground bg-surface-secondary/60 rounded-[3px] px-2.5 py-1.5">
              Estado actual: <span className="font-medium text-foreground">{SPRINT_STATUS_LABEL[deriveSprintStatus(editingSprint.start_date || null, editingSprint.end_date || null)]}</span>
              <span className="text-muted-foreground/70"> — se determina automáticamente según las fechas.</span>
            </p>
            {/* Board management */}
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1.5">
                Boards del sprint
                {editingSprintBoardIds.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">({editingSprintBoardIds.length} seleccionado{editingSprintBoardIds.length !== 1 ? 's' : ''})</span>
                )}
              </label>
              {(boards ?? []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sin boards en el proyecto.</p>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                  {(boards ?? []).map((board) => {
                    const selected = editingSprintBoardIds.includes(board.id_board);
                    const locked = boardsWithTasksInEditingSprint.has(board.id_board) && selected;
                    return (
                      <button
                        key={board.id_board}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          if (locked) return;
                          setEditingSprintBoardIds((prev) =>
                            selected ? prev.filter((id) => id !== board.id_board) : [...prev, board.id_board],
                          );
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[3px] border text-[11px] transition-colors text-left ${
                          locked
                            ? 'border-border/50 bg-surface-secondary/60 opacity-70 cursor-not-allowed'
                            : selected
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border hover:bg-accent/20'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 ${
                            selected && !locked ? 'bg-primary border-primary' : 'border-border bg-surface-secondary'
                          }`}
                        >
                          {selected && !locked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          {locked && <Lock className="w-2 h-2 text-muted-foreground" />}
                        </span>
                        <span className={selected && !locked ? 'text-primary font-medium' : 'text-foreground'}>{board.name}</span>
                        {locked && <span className="ml-auto text-[10px] text-muted-foreground">Con tareas</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingSprint(null)} className="h-8 px-3 border border-border rounded-[3px] text-[11px]">Cancelar</button>
              <button type="submit" disabled={savingSprintEdit} className="h-8 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px] disabled:opacity-50">
                {savingSprintEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            {/* Danger zone */}
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => void deleteSprint(editingSprint.id, editingSprint.name)}
                disabled={deletingSprintId === editingSprint.id}
                className="h-7 px-2.5 rounded-[3px] border border-destructive/30 text-destructive text-[11px] hover:bg-destructive/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingSprintId === editingSprint.id ? 'Eliminando...' : 'Eliminar sprint'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBoardModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-6 overflow-y-auto">
          <form onSubmit={createBoard} className="w-full max-w-lg rounded-[6px] border border-border bg-card p-5 space-y-4 my-auto">
            <h2 className="text-[13px] font-semibold">Nuevo board</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Nombre *</label>
                <input value={newBoard.name} onChange={(e) => setNewBoard((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre del board" className="w-full h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]" autoFocus />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Descripción</label>
                <textarea value={newBoard.description} onChange={(e) => setNewBoard((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descripción opcional" rows={2} className="w-full rounded-[3px] border border-border bg-surface-secondary px-2 py-1.5 text-[11px] resize-none" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Estilo de código</label>
                <select value={newBoard.coding_style} onChange={(e) => setNewBoard((prev) => ({ ...prev, coding_style: e.target.value }))} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                  <option value="standard">Standard</option>
                  <option value="clean_code">Clean Code / SOLID</option>
                  <option value="tdd">Test-Driven Development</option>
                  <option value="security">Security-First</option>
                  <option value="performance">Performance &amp; Optimization</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Enfoque de revisión</label>
                <select value={newBoard.review_focus} onChange={(e) => setNewBoard((prev) => ({ ...prev, review_focus: e.target.value }))} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                  <option value="strict">Strict — Story &amp; criteria only</option>
                  <option value="general">General — Story + code quality</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Stack tecnológico</label>
                <select value={newBoard.tech_stack} onChange={(e) => setNewBoard((prev) => ({ ...prev, tech_stack: e.target.value }))} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                  <option value="mixed">Mixed / Full-Stack</option>
                  <option value="python">Python</option>
                  <option value="nodejs">Node.js / JavaScript</option>
                  <option value="typescript">TypeScript / Node.js</option>
                  <option value="java">Java / Spring</option>
                  <option value="go">Go</option>
                  <option value="dotnet">C# / .NET</option>
                  <option value="react">React</option>
                  <option value="nextjs">Next.js</option>
                  <option value="angular">Angular</option>
                  <option value="vue">Vue.js</option>
                  <option value="vite">Vite / Vanilla JS</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Convención de nombres</label>
                <select value={newBoard.naming_convention} onChange={(e) => setNewBoard((prev) => ({ ...prev, naming_convention: e.target.value }))} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                  <option value="default">Language defaults</option>
                  <option value="camel_case">camelCase</option>
                  <option value="pascal_case">PascalCase</option>
                  <option value="snake_case">snake_case</option>
                  <option value="kebab_case">kebab-case</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Idioma de respuesta</label>
                <select value={newBoard.response_language} onChange={(e) => setNewBoard((prev) => ({ ...prev, response_language: e.target.value }))} className="w-full h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]">
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">Instrucciones personalizadas</label>
                <textarea value={newBoard.custom_instructions} onChange={(e) => setNewBoard((prev) => ({ ...prev, custom_instructions: e.target.value }))} placeholder="Instrucciones adicionales para el revisor de código..." rows={2} className="w-full rounded-[3px] border border-border bg-surface-secondary px-2 py-1.5 text-[11px] resize-none" />
              </div>
            </div>
            {/* Column setup */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1.5">Columnas iniciales</label>
              <div className="space-y-1 mb-2">
                {newBoardColumns.map((col, i) => {
                  const isLast = i === newBoardColumns.length - 1;
                  const isReview = isReviewIndex(i, newBoardColumns.length);
                  return (
                    <div key={col.tempId} className="flex items-center gap-1.5 rounded-[3px] border border-border bg-surface-secondary/40 px-2 py-1.5 text-[11px]">
                      <span className="text-[10px] text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                      <span className="flex-1 text-foreground">{col.name}</span>
                      {isReview && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">Revisión</span>}
                      {isLast && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/20 text-success font-medium">Final</span>}
                      <button
                        type="button"
                        onClick={() => setNewBoardColumns((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={newBoardColumns.length <= 3}
                        className="h-5 w-5 rounded-[3px] border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                        title={newBoardColumns.length <= 3 ? 'Mínimo 3 columnas' : 'Eliminar'}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newBoardColumnInput}
                  onChange={(e) => setNewBoardColumnInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newBoardColumnInput.trim()) {
                        setNewBoardColumns((prev) => [...prev, { name: newBoardColumnInput.trim(), tempId: Date.now() }]);
                        setNewBoardColumnInput('');
                      }
                    }
                  }}
                  placeholder="Nueva columna..."
                  className="flex-1 h-7 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBoardColumnInput.trim()) {
                      setNewBoardColumns((prev) => [...prev, { name: newBoardColumnInput.trim(), tempId: Date.now() }]);
                      setNewBoardColumnInput('');
                    }
                  }}
                  className="h-7 px-2.5 rounded-[3px] border border-border text-muted-foreground hover:text-foreground text-[11px] inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Agregar
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">La última columna es siempre la final (done). Mínimo 3 columnas; las nuevas se agregan arriba.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowBoardModal(false); setNewBoardColumnInput(''); }} className="h-8 px-3 border border-border rounded-[3px] text-[11px]">Cancelar</button>
              <button type="submit" disabled={!newBoard.name.trim()} className="h-8 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px] disabled:opacity-50">Crear</button>
            </div>
          </form>
        </div>
      )}

      {showColumnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <form onSubmit={createColumn} className="w-full max-w-sm rounded-[6px] border border-border bg-card p-5 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold">Nueva columna</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Se agregará al inicio del tablero. Puedes reordenar las columnas arrastrándolas.</p>
            </div>
            <input value={newColumn.name} onChange={(e) => setNewColumn((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre de la columna" className="w-full h-8 rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px]" autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowColumnModal(false)} className="h-8 px-3 border border-border rounded-[3px] text-[11px]">Cancelar</button>
              <button type="submit" disabled={!newColumn.name.trim()} className="h-8 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px] disabled:opacity-50">Crear</button>
            </div>
          </form>
        </div>
      )}

      {showSprintModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <form onSubmit={createSprint} className="w-full max-w-md rounded-[6px] border border-border bg-card p-5 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold">Nuevo sprint</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Se creara como <span className="font-medium text-foreground">Sprint {(sprints ?? []).length + 1}</span></p>
            </div>
            {latestSprintEndDate && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-[3px] px-2.5 py-1.5">
                El sprint anterior termina el <strong>{latestSprintEndDate}</strong>. Este sprint debe iniciar el <strong>{sprintStartMinDate}</strong> o despues.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <DatePickerField
                value={newSprint.start_date}
                onChange={(value) => setNewSprint((prev) => ({ ...prev, start_date: value }))}
                placeholder="Fecha inicio"
                minDate={sprintStartMinDate}
                maxDate={projectEndDate ?? undefined}
              />
              <DatePickerField
                value={newSprint.end_date}
                onChange={(value) => setNewSprint((prev) => ({ ...prev, end_date: value }))}
                placeholder="Fecha fin"
                minDate={newSprint.start_date || sprintStartMinDate}
                maxDate={projectEndDate ?? undefined}
              />
            </div>
            {(newSprint.start_date || newSprint.end_date) && (
              <p className="text-[10px] text-muted-foreground bg-surface-secondary/60 rounded-[3px] px-2.5 py-1.5">
                Estado inicial: <span className="font-medium text-foreground">{SPRINT_STATUS_LABEL[deriveSprintStatus(newSprint.start_date || null, newSprint.end_date || null)]}</span>
                <span className="text-muted-foreground/70"> — se determina por las fechas.</span>
              </p>
            )}
            {/* Board selection */}
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1.5">
                Boards del sprint
                {newSprintBoardIds.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">({newSprintBoardIds.length} seleccionado{newSprintBoardIds.length !== 1 ? 's' : ''})</span>
                )}
              </label>
              {(boards ?? []).length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sin boards. Crea uno en la pestaña Boards.</p>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                  {(boards ?? []).map((board) => {
                    const selected = newSprintBoardIds.includes(board.id_board);
                    return (
                      <button
                        key={board.id_board}
                        type="button"
                        onClick={() =>
                          setNewSprintBoardIds((prev) =>
                            selected ? prev.filter((id) => id !== board.id_board) : [...prev, board.id_board],
                          )
                        }
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[3px] border text-[11px] transition-colors text-left ${
                          selected
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border hover:bg-accent/20'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 ${
                            selected ? 'bg-primary border-primary' : 'border-border bg-surface-secondary'
                          }`}
                        >
                          {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </span>
                        <span className={selected ? 'text-primary font-medium' : 'text-foreground'}>{board.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Inline board creation */}
            <div className="border-t border-border/60 pt-3">
              {showCreateBoardInSprint ? (
                <div className="rounded-[3px] border border-border bg-surface-secondary/40 p-2.5 space-y-2">
                  <p className="text-[10px] font-medium text-foreground">Crear nuevo board</p>
                  <div className="flex gap-1.5">
                    <input
                      value={newBoardInSprintName}
                      onChange={(e) => setNewBoardInSprintName(e.target.value)}
                      placeholder="Nombre del board"
                      className="flex-1 h-7 rounded-[3px] border border-border bg-card px-2 text-[11px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void createBoardInSprint()}
                      disabled={!newBoardInSprintName.trim() || creatingBoardInSprint}
                      className="h-7 px-2.5 rounded-[3px] bg-primary text-primary-foreground text-[10px] disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {creatingBoardInSprint ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Crear
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCreateBoardInSprint(false); setNewBoardInSprintName(''); }}
                      className="h-7 w-7 rounded-[3px] border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Se crearán 4 columnas: To Do, In Progress, Review, Done.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateBoardInSprint(true)}
                  className="h-7 px-2.5 rounded-[3px] border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> Crear nuevo board
                </button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowSprintModal(false); setShowCreateBoardInSprint(false); setNewBoardInSprintName(''); }} className="h-8 px-3 border border-border rounded-[3px] text-[11px]">Cancelar</button>
              <button type="submit" className="h-8 px-3 bg-primary text-primary-foreground rounded-[3px] text-[11px]">Crear</button>
            </div>
          </form>
        </div>
      )}

      {showTagModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <form onSubmit={createTag} className="w-full max-w-sm rounded-[8px] border border-border bg-card overflow-hidden shadow-lg">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground">Nuevo tag</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Define un nombre y un color para el tag.</p>
            </div>

            {/* Body */}
            <div className="px-4 py-4 space-y-4">
              {/* Name section */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Nombre</label>
                <input
                  value={newTag.name}
                  onChange={(e) => setNewTag((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="ej. Bug, Feature, Urgente..."
                  className="w-full h-9 rounded-[4px] border border-border bg-surface-secondary px-3 text-[12px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>

              {/* Divider */}
              <div className="border-t border-border/60" />

              {/* Color section */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Color</label>
                <TagColorPicker
                  value={newTag.color}
                  onChange={(color) => setNewTag((prev) => ({ ...prev, color }))}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface-secondary/30">
              <button type="button" onClick={() => setShowTagModal(false)} className="h-8 px-3 border border-border rounded-[4px] text-[11px] hover:bg-accent transition-colors">Cancelar</button>
              <button type="submit" disabled={!newTag.name.trim()} className="h-8 px-3 bg-primary text-primary-foreground rounded-[4px] text-[11px] disabled:opacity-40 transition-opacity">Crear tag</button>
            </div>
          </form>
        </div>
      )}

      <TaskDetailPanel
        task={selectedTask}
        statuses={[]}
        priorities={priorities}
        tags={tags ?? []}
        minDueDate={taskMinDate}
        maxDueDate={projectEndDate ?? undefined}
        userMap={userMap}
        assignableUsers={assignableUsers}
        taskAssignments={selectedTaskAssignments}
        canEditAssignment={canEditTasks}
        canEditTask={canEditTasks}
        canDeleteTask={canDeleteTasks}
        onClose={() => setSelectedTask(null)}

        onDeleteTask={async (taskToDelete) => {
          await tasksService.delete(taskToDelete.id_task);
          setSelectedTask(null);
          refetchTasks();
          refetchTaskAssignments();
        }}
        onTaskUpdated={(updatedTask) => {
          setSelectedTask(updatedTask);
          refetchTasks();
          refetchTaskAssignments();
        }}
        onCreateTag={async (name, color) => {
          const created = await tasksService.createTag({ project: projectId, name, color });
          refetchTags();
          return created;
        }}
      />
    </div>
  );
}


