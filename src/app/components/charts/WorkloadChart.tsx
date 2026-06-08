import type { WorkloadRow } from '../../utils/dashboardMetrics';
import { EmptyChart, ChartLegend } from './chartUtils';

interface Props {
  rows: WorkloadRow[];
}

const DONE = '#22c55e';
const OPEN = '#0ea5e9';
const OVERDUE = '#ef4444';

/** Horizontal stacked bars of each person's load (overdue / open / completed). */
export function WorkloadChart({ rows }: Props) {
  if (rows.length === 0) {
    return <EmptyChart message="Sin tareas asignadas en este alcance." />;
  }
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const openNotOverdue = Math.max(0, r.open - r.overdue);
          const widthPct = (r.total / maxTotal) * 100;
          const seg = (n: number) => (r.total > 0 ? (n / r.total) * 100 : 0);
          return (
            <div key={r.id} className="flex items-center gap-2.5">
              <div className="w-24 shrink-0 text-[11px] text-foreground truncate" title={r.name}>{r.name}</div>
              <div className="flex-1 min-w-0">
                <div className="h-4 rounded-[3px] overflow-hidden bg-secondary flex" style={{ width: `${Math.max(8, widthPct)}%` }}>
                  {r.overdue > 0 && <div style={{ width: `${seg(r.overdue)}%`, backgroundColor: OVERDUE }} title={`${r.overdue} vencidas`} />}
                  {openNotOverdue > 0 && <div style={{ width: `${seg(openNotOverdue)}%`, backgroundColor: OPEN }} title={`${openNotOverdue} abiertas`} />}
                  {r.completed > 0 && <div style={{ width: `${seg(r.completed)}%`, backgroundColor: DONE }} title={`${r.completed} completadas`} />}
                </div>
              </div>
              <div className="w-20 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                <span className={r.overdue > 0 ? 'text-red-600 font-semibold' : ''}>{r.open}</span> abiertas
              </div>
            </div>
          );
        })}
      </div>
      <ChartLegend
        items={[
          { label: 'Vencidas', color: OVERDUE },
          { label: 'Abiertas', color: OPEN },
          { label: 'Completadas', color: DONE },
        ]}
      />
    </div>
  );
}
