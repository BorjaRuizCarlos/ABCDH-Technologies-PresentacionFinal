import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DistSlice } from '../../utils/dashboardMetrics';
import { DonutTooltip, EmptyChart } from './chartUtils';

interface Props {
  data: DistSlice[];
  total: number;
  centerLabel?: string;
  size?: number;
}

/** Task-status donut with a controlled tooltip and an inline legend with %. */
export function TaskStatusDonut({ data, total, centerLabel = 'tareas', size = 168 }: Props) {
  if (data.length === 0 || total === 0) {
    return <EmptyChart message="Sin tareas para mostrar." />;
  }

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={size * 0.3} outerRadius={size * 0.46}
              dataKey="value" nameKey="label"
              paddingAngle={3} stroke="var(--card)" strokeWidth={2}
            >
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[24px] font-bold text-foreground leading-none tabular-nums">{total}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">{centerLabel}</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.key}>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-foreground truncate">{d.label}</span>
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {d.value} <span className="text-muted-foreground/60">· {pct}%</span>
                </span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
