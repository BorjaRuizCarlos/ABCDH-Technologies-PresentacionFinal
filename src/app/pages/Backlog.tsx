import { useMemo, useState } from 'react';
import { Check, Filter, Loader2, Search, X } from 'lucide-react';
import {
  useApiProjects,
  useApiSprints,
  useApiTags,
  useApiTasks,
} from '../hooks/useProjectData';
import { useAuth } from '../context/AuthContext';

type StatusFilter = 'pending' | 'completed' | 'all';
type ScopeFilter = 'all' | 'backlog' | 'sprint';

export default function Backlog() {
  const { user } = useAuth();
  const currentUserId = useMemo(() => {
    const parsed = Number(user?.id ?? 0);
    return Number.isNaN(parsed) || parsed === 0 ? null : parsed;
  }, [user]);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  const { data: projects, loading: loadingProjects } = useApiProjects();
  const { data: tasks, loading: loadingTasks, priorities } = useApiTasks();
  const { data: tags } = useApiTags();
  const { data: sprints } = useApiSprints();

  const loading = loadingProjects || loadingTasks;

  // Only tasks assigned to the logged-in user.
  const myTasks = useMemo(() => {
    if (currentUserId == null) return [];
    return (tasks ?? []).filter((task) =>
      (task.assigned_users ?? []).some((u) => u.id_user === currentUserId) ||
      task.assigned_to === currentUserId,
    );
  }, [tasks, currentUserId]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return myTasks.filter((task) => {
      if (projectFilter != null && task.project !== projectFilter) return false;
      if (priorityFilter != null && task.priority !== priorityFilter) return false;
      if (statusFilter === 'pending' && task.completed_at != null) return false;
      if (statusFilter === 'completed' && task.completed_at == null) return false;
      if (scopeFilter === 'backlog' && task.sprint != null) return false;
      if (scopeFilter === 'sprint' && task.sprint == null) return false;
      if (selectedTagIds.length > 0 && !selectedTagIds.every((tagId) => task.tags.includes(tagId))) return false;
      if (query) {
        const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [myTasks, search, projectFilter, priorityFilter, statusFilter, scopeFilter, selectedTagIds]);

  const priorityById = useMemo(() => {
    const map = new Map<number, string>();
    priorities.forEach((priority) => map.set(priority.id_priority, priority.name));
    return map;
  }, [priorities]);

  const tagById = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    (tags ?? []).forEach((tag) => {
      map.set(tag.id_tag, { name: tag.name, color: tag.color || '#56697f' });
    });
    return map;
  }, [tags]);

  const projectById = useMemo(() => {
    const map = new Map<number, string>();
    (projects ?? []).forEach((project) => map.set(project.id_project, project.name));
    return map;
  }, [projects]);

  const sprintById = useMemo(() => {
    const map = new Map<number, string>();
    (sprints ?? []).forEach((sprint) => map.set(sprint.id_sprint, sprint.name));
    return map;
  }, [sprints]);

  // Only show projects/tags the user actually has tasks in, so filters stay relevant.
  const projectOptions = useMemo(() => {
    const ids = new Set(myTasks.map((task) => task.project));
    return (projects ?? []).filter((project) => ids.has(project.id_project));
  }, [projects, myTasks]);

  const tagOptions = useMemo(() => {
    const ids = new Set(myTasks.flatMap((task) => task.tags));
    return (tags ?? []).filter((tag) => ids.has(tag.id_tag));
  }, [tags, myTasks]);

  const hasActiveFilters =
    projectFilter != null || priorityFilter != null || statusFilter !== 'pending' || scopeFilter !== 'all' || selectedTagIds.length > 0 || search.trim() !== '';

  const clearFilters = () => {
    setSearch('');
    setProjectFilter(null);
    setPriorityFilter(null);
    setStatusFilter('pending');
    setScopeFilter('all');
    setSelectedTagIds([]);
  };

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1600px] min-h-full flex flex-col gap-3">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="rounded-[6px] border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h1 className="text-[14px] font-semibold text-foreground">Mi Backlog</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Todas las tareas asignadas a ti, en todos tus proyectos.</p>
        </div>

        {/* Toolbar: search + filters */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface-secondary/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarea..."
              className="h-8 w-56 rounded-[3px] border border-border bg-surface-secondary pl-7 pr-2 text-[11px] placeholder:text-muted-foreground/60"
            />
          </div>

          <select
            value={projectFilter ?? ''}
            onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : null)}
            className="h-8 min-w-[150px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
          >
            <option value="">Todos los proyectos</option>
            {projectOptions.map((project) => (
              <option key={project.id_project} value={project.id_project}>{project.name}</option>
            ))}
          </select>

          <select
            value={priorityFilter ?? ''}
            onChange={(e) => setPriorityFilter(e.target.value ? Number(e.target.value) : null)}
            className="h-8 min-w-[130px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
          >
            <option value="">Toda prioridad</option>
            {priorities.map((priority) => (
              <option key={priority.id_priority} value={priority.id_priority}>{priority.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 min-w-[120px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
          >
            <option value="pending">Pendientes</option>
            <option value="completed">Completadas</option>
            <option value="all">Todas</option>
          </select>

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="h-8 min-w-[120px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
          >
            <option value="all">Backlog y sprints</option>
            <option value="backlog">Solo backlog</option>
            <option value="sprint">Solo en sprint</option>
          </select>

          {/* Tag filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTagFilter((v) => !v)}
              className={`h-8 px-2.5 rounded-[3px] border text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                selectedTagIds.length > 0
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
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
              <div className="absolute left-0 top-full mt-1 z-20 rounded-[8px] border border-border bg-card shadow-md p-2.5 w-[300px] flex flex-col gap-2">
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
                          onClick={() => setSelectedTagIds((current) => selected ? current.filter((id) => id !== tag.id_tag) : [...current, tag.id_tag])}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                            selected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-surface-secondary/60 text-foreground hover:bg-accent'
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

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-8 px-2.5 rounded-[3px] border border-border text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}

          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground">{filteredTasks.length} tarea{filteredTasks.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : currentUserId == null ? (
        <div className="rounded-[6px] border border-border bg-card py-16 text-center">
          <p className="text-[12px] text-muted-foreground">Inicia sesión para ver tus tareas.</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-[6px] border border-border bg-card py-16 text-center">
          <p className="text-[12px] text-muted-foreground">
            {myTasks.length === 0 ? 'No tienes tareas asignadas.' : 'No hay tareas que coincidan con los filtros.'}
          </p>
        </div>
      ) : (
        <div className="rounded-[6px] border border-border bg-card overflow-auto">
          <table className="w-full min-w-[960px] text-[11px]">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Título</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-40">Proyecto</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Prioridad</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-32">Sprint</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Vencimiento</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task, i) => {
                const isOverdue = !task.completed_at && task.due_date && new Date(task.due_date) < new Date();
                return (
                  <tr key={task.id_task} className={`border-b border-border/60 align-top hover:bg-accent/30 transition-colors ${i === filteredTasks.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-4 py-3 min-w-[320px]">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-medium text-foreground">{task.title}</p>
                        {task.completed_at && (
                          <span className="inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-medium text-success">Completada</span>
                        )}
                      </div>
                      {task.description && <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {projectById.get(task.project) ?? `#${task.project}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-foreground">{priorityById.get(task.priority) ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {task.sprint != null ? (
                        <span className="inline-flex items-center rounded-[3px] border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {sprintById.get(task.sprint) ?? `Sprint #${task.sprint}`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Backlog</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {task.due_date ? (
                        <span className={`text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-foreground'}`}>{task.due_date}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {task.tags.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground/50">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {task.tags.slice(0, 3).map((tagId) => {
                            const tag = tagById.get(tagId);
                            return (
                              <span
                                key={`${task.id_task}-${tagId}`}
                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
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
                          {task.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
