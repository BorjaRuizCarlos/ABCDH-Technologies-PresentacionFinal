import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { tasksService, sprintsService } from '../../services';
import CreateSprintModal from './CreateSprintModal';
import { Plus } from 'lucide-react';

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function Timeline({ projectId, canCreateSprints }: { projectId: number; canCreateSprints: boolean }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [sprintFilter, setSprintFilter] = useState<number | 'all'>('all');
  const [sprintMap, setSprintMap] = useState<Record<number, any>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [list, sprints] = await Promise.all([tasksService.list(undefined, projectId), sprintsService.list(projectId)]);
      const filtered = (list as any).filter((t: any) => t.start_date && t.due_date).map((t: any) => ({ ...t }));
      setTasks(filtered);
      setSprintMap(((sprints as any) || []).reduce((acc: any, s: any) => { acc[s.id_sprint] = s; return acc; }, {}));
    } catch (err) {
      setTasks([]);
      setSprintMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const visibleTasks = useMemo(() => (
    sprintFilter === 'all' ? tasks : tasks.filter((t) => t.sprint === sprintFilter)
  ), [tasks, sprintFilter]);

  const range = useMemo(() => {
    if (!visibleTasks || visibleTasks.length === 0) return null;
    const starts = visibleTasks.map((t) => new Date(t.start_date));
    const ends = visibleTasks.map((t) => new Date(t.due_date));
    const min = new Date(Math.min(...starts.map((d) => d.getTime())));
    const max = new Date(Math.max(...ends.map((d) => d.getTime())));
    return { min, max, totalDays: Math.max(1, daysBetween(min, max) + 1) };
  }, [visibleTasks]);

  if (loading) return <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando timeline…</div>;
  if (!range) return <div className="py-8 text-center text-[12px] text-muted-foreground">No hay tareas con fechas para mostrar para este filtro.</div>;

  const headerDays = Array.from({ length: range.totalDays }).map((_, i) => {
    const d = new Date(range.min);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-foreground">Timeline</h2>
        <div className="flex items-center gap-3">
          {Object.keys(sprintMap).length > 0 && (
            <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="h-8 bg-surface-secondary border border-border rounded-[3px] px-2 text-[11px]">
              <option value="all">Todos</option>
              {Object.values(sprintMap).map((s: any) => (
                <option key={s.id_sprint} value={s.id_sprint}>{s.name}</option>
              ))}
            </select>
          )}

          {canCreateSprints && (
            <button onClick={() => setShowCreateSprint(true)} className="h-8 px-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-[3px] text-[11px] font-medium inline-flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Crear Sprint
            </button>
          )}
        </div>
      </div>

      <div className="overflow-auto border border-border rounded-[6px] bg-card p-2">
        <div className="min-w-max">
          {/* Header */}
          <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-2">
            <div className="text-[11px] text-muted-foreground">Tarea</div>
            <div className="flex overflow-x-auto scrollbar-app">
              <div className="flex" style={{ minWidth: `${range.totalDays * 28}px` }}>
                {headerDays.map((d, i) => (
                  <div key={i} className="w-7 text-[10px] text-muted-foreground border-r border-border/40 text-center py-1">
                    {format(d, 'dd')}
                    <div className="text-[9px]">{format(d, 'MMM')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="mt-3">
            {visibleTasks.map((task) => {
              const s = new Date(task.start_date);
              const e = new Date(task.due_date);
              const leftDays = daysBetween(range.min, s);
              const widthDays = Math.max(1, daysBetween(s, e) + 1);
              const leftPx = leftDays * 28;
              const widthPx = widthDays * 28;
              const sprint = task.sprint ? sprintMap[task.sprint] : null;
              const sprintColor = sprint ? `hsl(${(task.sprint * 47) % 360} 70% 40%)` : '#94a3b8';

              return (
                <div key={task.id_task} className="flex items-center gap-2 py-2">
                  <div className="w-72 pr-2">
                    <div className="text-[12px] font-medium text-foreground truncate">{task.title}</div>
                    <div className="text-[11px] text-muted-foreground">{task.assigned_to ? String(task.assigned_to) : '—'}</div>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-8 relative">
                      <div className="absolute left-0 top-0 bottom-0 right-0 bg-transparent" />
                      <div className="absolute top-1.5 h-5 rounded-md" style={{ left: leftPx, width: widthPx, backgroundColor: sprintColor }}>
                        <div className="h-full px-2 text-[11px] text-white truncate leading-5">{task.title}</div>
                      </div>
                      {sprint && (
                        <div className="absolute left-0 top-0 -translate-y-6">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded text-white" style={{ background: sprintColor }}>{sprint.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showCreateSprint && (
        <CreateSprintModal open={showCreateSprint} onOpenChange={setShowCreateSprint} projectId={projectId} onCreated={() => { fetchData(); }} />
      )}
    </div>
  );
}

export default Timeline;
