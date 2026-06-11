import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Check, Filter, LayoutGrid, ListChecks, Loader2, Rocket, Search, X, Calendar,
} from 'lucide-react';
import {
  useApiBoardColumns,
  useApiBoards,
  useApiProjectMembers,
  useApiProjects,
  useApiSprints,
  useApiTags,
  useApiTasks,
} from '../hooks/useProjectData';
import { useAuth } from '../context/AuthContext';
import type { ApiBoardColumn, ApiTask } from '../../services';

type BacklogView = 'kanban' | 'product' | 'sprints';
type StatusFilter = 'all' | 'pending' | 'completed';

const VIEW_TABS: { id: BacklogView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'kanban', label: 'Tablero', icon: LayoutGrid },
  { id: 'product', label: 'Product Backlog', icon: ListChecks },
  { id: 'sprints', label: 'En Sprints', icon: Rocket },
];

export default function Backlog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id ?? 0);
    return Number.isNaN(parsed) || parsed === 0 ? null : parsed;
  }, [user]);
  const isAdmin = user?.role === 'admin';

  const [view, setView] = useState<BacklogView>('kanban');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  // Kanban view requires an explicit project + board selection.
  const [kanbanProjectId, setKanbanProjectId] = useState<number | null>(null);
  const [kanbanBoardId, setKanbanBoardId] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  const { data: projects, loading: loadingProjects } = useApiProjects();
  const { data: tasks, loading: loadingTasks, priorities } = useApiTasks();
  const { data: tags } = useApiTags();
  const { data: sprints } = useApiSprints();
  const { data: boards, loading: loadingBoards } = useApiBoards();
  const { data: columns, loading: loadingColumns } = useApiBoardColumns();
  const { data: memberships, loading: loadingMemberships } = useApiProjectMembers(
    undefined,
    currentUserId ?? undefined,
  );

  // Tags are per-project, so a tag id selected in one project becomes stale (and empties
  // results) when the project context changes — clear the tag filter on any project change.
  useEffect(() => {
    setSelectedTagIds([]);
  }, [kanbanProjectId, projectFilter]);

  const loading = loadingProjects || loadingTasks || loadingBoards || loadingColumns || (isAdmin ? false : loadingMemberships);

  // Projects the user can see: admins see all, everyone else sees only the ones they belong to.
  const visibleProjectIds = useMemo(() => {
    if (isAdmin) return new Set<number>((projects ?? []).map((p) => p.id_project));
    return new Set<number>((memberships ?? []).map((m) => m.project));
  }, [isAdmin, projects, memberships]);

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p) => visibleProjectIds.has(p.id_project)),
    [projects, visibleProjectIds],
  );

  const projectById = useMemo(() => {
    const map = new Map<number, string>();
    visibleProjects.forEach((p) => map.set(p.id_project, p.name));
    return map;
  }, [visibleProjects]);

  const priorityById = useMemo(() => {
    const map = new Map<number, string>();
    priorities.forEach((p) => map.set(p.id_priority, p.name));
    return map;
  }, [priorities]);

  const tagById = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    (tags ?? []).forEach((t) => map.set(t.id_tag, { name: t.name, color: t.color || '#56697f' }));
    return map;
  }, [tags]);

  const sprintById = useMemo(() => {
    const map = new Map<number, { name: string; project: number }>();
    (sprints ?? []).forEach((s) => map.set(s.id_sprint, { name: s.name, project: s.project }));
    return map;
  }, [sprints]);

  // columns grouped + sorted by board
  const columnsByBoard = useMemo(() => {
    const map = new Map<number, ApiBoardColumn[]>();
    (columns ?? []).forEach((col) => {
      const list = map.get(col.board) ?? [];
      list.push(col);
      map.set(col.board, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [columns]);

  // Tasks within the user's visible projects.
  const scopedTasks = useMemo(
    () => (tasks ?? []).filter((t) => visibleProjectIds.has(t.project)),
    [tasks, visibleProjectIds],
  );

  // Shared filters that don't depend on the project (search, priority, status, tags).
  const matchesFiltersNoProject = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (task: ApiTask) => {
      if (priorityFilter != null && task.priority !== priorityFilter) return false;
      if (statusFilter === 'pending' && task.completed_at != null) return false;
      if (statusFilter === 'completed' && task.completed_at == null) return false;
      if (selectedTagIds.length > 0 && !selectedTagIds.every((id) => task.tags.includes(id))) return false;
      if (query) {
        const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    };
  }, [search, priorityFilter, statusFilter, selectedTagIds]);

  // Full filter (adds the project dropdown) used by the Product Backlog / Sprints list views.
  const matchesFilters = useMemo(
    () => (task: ApiTask) => (projectFilter == null || task.project === projectFilter) && matchesFiltersNoProject(task),
    [projectFilter, matchesFiltersNoProject],
  );

  const filteredTasks = useMemo(() => scopedTasks.filter(matchesFilters), [scopedTasks, matchesFilters]);

  const productBacklogTasks = useMemo(() => filteredTasks.filter((t) => t.sprint == null), [filteredTasks]);
  const sprintTasks = useMemo(() => filteredTasks.filter((t) => t.sprint != null), [filteredTasks]);

  // Kanban needs an explicit project + board. Only projects that actually have boards are offered.
  const visibleBoards = useMemo(
    () => (boards ?? []).filter((b) => visibleProjectIds.has(b.project)),
    [boards, visibleProjectIds],
  );
  const projectsWithBoards = useMemo(() => {
    const ids = new Set(visibleBoards.map((b) => b.project));
    return visibleProjects.filter((p) => ids.has(p.id_project));
  }, [visibleProjects, visibleBoards]);

  // Resolve the effective selection, defaulting to the first available project/board.
  const effectiveKanbanProjectId = useMemo(() => {
    if (kanbanProjectId != null && projectsWithBoards.some((p) => p.id_project === kanbanProjectId)) return kanbanProjectId;
    return projectsWithBoards[0]?.id_project ?? null;
  }, [kanbanProjectId, projectsWithBoards]);

  const kanbanBoardOptions = useMemo(
    () => visibleBoards.filter((b) => b.project === effectiveKanbanProjectId).sort((a, b) => a.name.localeCompare(b.name)),
    [visibleBoards, effectiveKanbanProjectId],
  );
  const effectiveKanbanBoardId = useMemo(() => {
    if (kanbanBoardId != null && kanbanBoardOptions.some((b) => b.id_board === kanbanBoardId)) return kanbanBoardId;
    return kanbanBoardOptions[0]?.id_board ?? null;
  }, [kanbanBoardId, kanbanBoardOptions]);

  const selectedKanbanBoard = useMemo(
    () => kanbanBoardOptions.find((b) => b.id_board === effectiveKanbanBoardId) ?? null,
    [kanbanBoardOptions, effectiveKanbanBoardId],
  );

  // Tasks shown in the selected board's kanban (board columns + active filters, ignoring the project dropdown).
  const kanbanTasks = useMemo(() => {
    if (!selectedKanbanBoard) return [];
    const colIds = new Set((columnsByBoard.get(selectedKanbanBoard.id_board) ?? []).map((c) => c.id_column));
    return scopedTasks.filter((t) => colIds.has(t.board_column) && matchesFiltersNoProject(t));
  }, [selectedKanbanBoard, columnsByBoard, scopedTasks, matchesFiltersNoProject]);

  // Group sprint tasks by sprint for the "En Sprints" view.
  const sprintGroups = useMemo(() => {
    const groups = new Map<number, ApiTask[]>();
    sprintTasks.forEach((t) => {
      const list = groups.get(t.sprint!) ?? [];
      list.push(t);
      groups.set(t.sprint!, list);
    });
    return [...groups.entries()]
      .map(([sprintId, list]) => ({
        sprintId,
        name: sprintById.get(sprintId)?.name ?? `Sprint #${sprintId}`,
        projectName: projectById.get(sprintById.get(sprintId)?.project ?? -1) ?? '',
        tasks: list,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sprintTasks, sprintById, projectById]);

  // tag options derived from visible tasks (plus any currently-selected tag, so an active
  // filter is never hidden from the list and can always be removed).
  const tagOptions = useMemo(() => {
    const ids = new Set(scopedTasks.flatMap((t) => t.tags));
    return (tags ?? []).filter((t) => ids.has(t.id_tag) || selectedTagIds.includes(t.id_tag));
  }, [tags, scopedTasks, selectedTagIds]);

  const hasActiveFilters =
    projectFilter != null || priorityFilter != null || statusFilter !== 'all' || selectedTagIds.length > 0 || search.trim() !== '';

  const clearFilters = () => {
    setSearch('');
    setProjectFilter(null);
    setPriorityFilter(null);
    setStatusFilter('all');
    setSelectedTagIds([]);
  };

  // Deep-link into the project AND open the task: ProjectDetail only honors `task`
  // when a workspace tab is present, so pick the tab matching where the task lives.
  const openTask = (task: ApiTask) => navigate(`/projects/${task.project}?tab=${task.sprint == null ? 'backlog' : 'sprints'}&task=${task.id_task}`);

  const TagChips = ({ task }: { task: ApiTask }) => {
    if (task.tags.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {task.tags.slice(0, 3).map((tagId) => {
          const tag = tagById.get(tagId);
          return (
            <span
              key={`${task.id_task}-${tagId}`}
              className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium"
              style={{
                borderColor: `${tag?.color ?? '#56697f'}55`,
                backgroundColor: `${tag?.color ?? '#56697f'}1a`,
                color: tag?.color ?? '#56697f',
              }}
            >
              {tag?.name ?? `#${tagId}`}
            </span>
          );
        })}
        {task.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{task.tags.length - 3}</span>}
      </div>
    );
  };

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1600px] min-h-full flex flex-col gap-3">

      {/* ── Header + view tabs ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Backlog</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Tareas de todos tus proyectos y sus tableros.</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-secondary/40 p-1 shrink-0">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={`h-7 px-3 rounded-sm text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                  view === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tarea..."
            className="h-8 w-56 rounded-sm border border-border bg-surface-secondary pl-7 pr-2 text-[11px] placeholder:text-muted-foreground/60"
          />
        </div>

        {view === 'kanban' ? (
          <>
            {/* Kanban: project + board are required selections (projects without boards aren't offered). */}
            <select
              value={effectiveKanbanProjectId ?? ''}
              onChange={(e) => { setKanbanProjectId(e.target.value ? Number(e.target.value) : null); setKanbanBoardId(null); }}
              disabled={projectsWithBoards.length === 0}
              className="h-8 min-w-[150px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground disabled:opacity-50"
            >
              {projectsWithBoards.length === 0 && <option value="">Sin proyectos con tableros</option>}
              {projectsWithBoards.map((p) => (
                <option key={p.id_project} value={p.id_project}>{p.name}</option>
              ))}
            </select>
            <select
              value={effectiveKanbanBoardId ?? ''}
              onChange={(e) => setKanbanBoardId(e.target.value ? Number(e.target.value) : null)}
              disabled={kanbanBoardOptions.length === 0}
              className="h-8 min-w-[150px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground disabled:opacity-50"
            >
              {kanbanBoardOptions.length === 0 && <option value="">Sin tableros</option>}
              {kanbanBoardOptions.map((b) => (
                <option key={b.id_board} value={b.id_board}>{b.name}</option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={projectFilter ?? ''}
            onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
            className="h-8 min-w-[150px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
          >
            <option value="">Todos los proyectos</option>
            {visibleProjects.map((p) => (
              <option key={p.id_project} value={p.id_project}>{p.name}</option>
            ))}
          </select>
        )}

        <select
          value={priorityFilter ?? ''}
          onChange={(e) => setPriorityFilter(e.target.value ? Number(e.target.value) : null)}
          className="h-8 min-w-[130px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
        >
          <option value="">Toda prioridad</option>
          {priorities.map((p) => (
            <option key={p.id_priority} value={p.id_priority}>{p.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-8 min-w-[120px] rounded-sm border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
        >
          <option value="all">Todo estado</option>
          <option value="pending">Pendientes</option>
          <option value="completed">Completadas</option>
        </select>

        {/* Tag filter */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTagFilter((v) => !v)}
            className={`h-8 px-2.5 rounded-sm border text-[11px] inline-flex items-center gap-1.5 transition-colors ${
              selectedTagIds.length > 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Tags
            {selectedTagIds.length > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {selectedTagIds.length}
              </span>
            )}
          </button>
          {showTagFilter && (
            <div className="absolute left-0 top-full mt-1 z-20 rounded-md border border-border bg-card shadow-md p-2.5 w-[300px] flex flex-col gap-2">
              {tagOptions.length === 0 ? (
                <span className="text-[10px] text-muted-foreground px-1 py-1">No hay tags en tus tareas</span>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                  {tagOptions.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id_tag);
                    return (
                      <button
                        key={tag.id_tag}
                        type="button"
                        onClick={() => setSelectedTagIds((cur) => selected ? cur.filter((id) => id !== tag.id_tag) : [...cur, tag.id_tag])}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-secondary/60 text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#56697f' }} />
                        {tag.name}
                        {selected && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active tag filters — always visible & removable */}
        {selectedTagIds.map((id) => {
          const t = tagById.get(id);
          return (
            <span
              key={`chip-${id}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{ borderColor: `${t?.color ?? '#56697f'}66`, backgroundColor: `${t?.color ?? '#56697f'}1a`, color: t?.color ?? '#56697f' }}
            >
              {t?.name ?? `#${id}`}
              <button type="button" onClick={() => setSelectedTagIds((cur) => cur.filter((x) => x !== id))} className="opacity-70 hover:opacity-100" title="Quitar filtro">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-8 px-2.5 rounded-sm border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}

        <div className="flex-1" />
        {(() => {
          const count = view === 'product' ? productBacklogTasks.length : view === 'sprints' ? sprintTasks.length : kanbanTasks.length;
          return <span className="text-[11px] text-muted-foreground">{count} tarea{count === 1 ? '' : 's'}</span>;
        })()}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="rounded-md border border-border bg-card py-16 text-center">
          <p className="text-[12px] text-muted-foreground">No perteneces a ningún proyecto todavía.</p>
        </div>
      ) : view === 'kanban' ? (
        /* ───── KANBAN: one required project + board ───── */
        !selectedKanbanBoard ? (
          <div className="rounded-md border border-border bg-card py-16 text-center">
            <p className="text-[12px] text-muted-foreground">
              {projectsWithBoards.length === 0
                ? 'Ninguno de tus proyectos tiene tableros todavía.'
                : 'Selecciona un proyecto y un tablero para ver el Kanban.'}
            </p>
          </div>
        ) : (
          (() => {
            const boardColumns = columnsByBoard.get(selectedKanbanBoard.id_board) ?? [];
            return (
              <section className="rounded-md border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-secondary/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground truncate">
                      {projectById.get(selectedKanbanBoard.project) ?? `Proyecto #${selectedKanbanBoard.project}`}
                    </span>
                    <span className="text-muted-foreground/40">›</span>
                    <span className="text-[12px] font-semibold text-foreground truncate">{selectedKanbanBoard.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{kanbanTasks.length} tarea{kanbanTasks.length === 1 ? '' : 's'}</span>
                </div>
                {boardColumns.length === 0 ? (
                  <p className="px-3 py-10 text-center text-[11px] text-muted-foreground">Este tablero no tiene columnas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex gap-3 p-3 min-w-min">
                      {boardColumns.map((column) => {
                        const colTasks = kanbanTasks.filter((t) => t.board_column === column.id_column);
                        return (
                          <div key={column.id_column} className="w-[260px] shrink-0 rounded-md border border-border bg-surface-secondary/30 flex flex-col">
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60">
                              <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground truncate">{column.name}</span>
                              <span className={`text-[10px] px-1.5 rounded-full ${column.is_final ? 'bg-success/20 text-success' : 'bg-card text-muted-foreground'}`}>{colTasks.length}</span>
                            </div>
                            <div className="p-1.5 space-y-1.5 min-h-[80px] max-h-[540px] overflow-y-auto">
                              {colTasks.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground/50 px-1 py-3 text-center">—</p>
                              ) : (
                                colTasks.map((task) => (
                                  <button
                                    key={task.id_task}
                                    type="button"
                                    onClick={() => openTask(task)}
                                    className="w-full text-left rounded-sm border border-border bg-card p-2 hover:border-primary/40 hover:bg-accent/20 transition-colors"
                                  >
                                    <p className="text-[11px] font-medium text-foreground line-clamp-2">{task.title}</p>
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                      <span className="text-[9px] text-muted-foreground">{priorityById.get(task.priority) ?? '—'}</span>
                                      {task.completed_at && <Check className="w-3 h-3 text-success shrink-0" />}
                                    </div>
                                    <div className="mt-1"><TagChips task={task} /></div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })()
        )
      ) : view === 'product' ? (
        /* ───── PRODUCT BACKLOG: tasks with no sprint ───── */
        productBacklogTasks.length === 0 ? (
          <div className="rounded-md border border-border bg-card py-16 text-center">
            <p className="text-[12px] text-muted-foreground">
              {hasActiveFilters ? 'No hay tareas que coincidan con los filtros.' : 'El Product Backlog está vacío.'}
            </p>
          </div>
        ) : (
          <section className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-secondary/40">
              <div className="flex items-center gap-2 min-w-0">
                <ListChecks className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[12px] font-semibold text-foreground truncate">Product Backlog</span>
                <span className="text-[10px] text-muted-foreground truncate">· tareas sin sprint</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{productBacklogTasks.length} tarea{productBacklogTasks.length === 1 ? '' : 's'}</span>
            </div>
            <TaskTable tasks={productBacklogTasks} projectById={projectById} priorityById={priorityById} TagChips={TagChips} onOpen={openTask} />
          </section>
        )
      ) : (
        /* ───── EN SPRINTS: tasks assigned to a sprint, grouped ───── */
        sprintGroups.length === 0 ? (
          <div className="rounded-md border border-border bg-card py-16 text-center">
            <p className="text-[12px] text-muted-foreground">
              {hasActiveFilters ? 'No hay tareas que coincidan con los filtros.' : 'No hay tareas en sprints.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sprintGroups.map((group) => (
              <section key={group.sprintId} className="rounded-md border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-secondary/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <Rocket className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-[12px] font-semibold text-foreground truncate">{group.name}</span>
                    {group.projectName && <span className="text-[10px] text-muted-foreground truncate">· {group.projectName}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{group.tasks.length} tarea{group.tasks.length === 1 ? '' : 's'}</span>
                </div>
                <TaskTable tasks={group.tasks} projectById={projectById} priorityById={priorityById} TagChips={TagChips} onOpen={openTask} hideProject />
              </section>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Shared task table (Product Backlog + per-sprint groups) ─────────────────
function TaskTable({
  tasks,
  projectById,
  priorityById,
  TagChips,
  onOpen,
  hideProject = false,
}: {
  tasks: ApiTask[];
  projectById: Map<number, string>;
  priorityById: Map<number, string>;
  TagChips: (props: { task: ApiTask }) => React.ReactNode;
  onOpen: (task: ApiTask) => void;
  hideProject?: boolean;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] text-[11px]">
        <thead>
          <tr className="border-b border-border bg-surface-secondary/50">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Título</th>
            {!hideProject && <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-40">Proyecto</th>}
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Prioridad</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Vencimiento</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tags</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, i) => {
            const isOverdue = !task.completed_at && task.due_date && new Date(task.due_date) < new Date();
            return (
              <tr
                key={task.id_task}
                onClick={() => onOpen(task)}
                className={`border-b border-border/60 align-top hover:bg-accent/30 transition-colors cursor-pointer ${i === tasks.length - 1 ? 'border-b-0' : ''}`}
              >
                <td className="px-4 py-3 min-w-[280px]">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-medium text-foreground">{task.title}</p>
                    {task.completed_at && <span className="inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-medium text-success">Completada</span>}
                  </div>
                  {task.description && <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed line-clamp-1 break-words">{task.description}</p>}
                </td>
                {!hideProject && (
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{projectById.get(task.project) ?? `#${task.project}`}</td>
                )}
                <td className="px-4 py-3"><span className="text-[11px] text-foreground">{priorityById.get(task.priority) ?? '—'}</span></td>
                <td className="px-4 py-3">
                  {task.due_date ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-foreground'}`}>
                      <Calendar className="w-3 h-3" />{task.due_date}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {task.tags.length === 0 ? <span className="text-[10px] text-muted-foreground/50">—</span> : <TagChips task={task} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
