import type { DistSlice } from '../../utils/dashboardMetrics';
import { EmptyChart } from './chartUtils';

interface Props {
  data: DistSlice[];
  emptyMessage?: string;
}

/** Compact labelled horizontal bars for a categorical distribution. */
export function DistributionBars({ data, emptyMessage = 'Sin datos.' }: Props) {
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={d.key} className="flex items-center gap-2.5">
            <div className="w-24 shrink-0 text-[11px] text-foreground truncate" title={d.label}>{d.label}</div>
            <div className="flex-1 min-w-0 h-3.5 bg-secondary rounded-[3px] overflow-hidden">
              <div
                className="h-full rounded-[3px]"
                style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
              />
            </div>
            <div className="w-16 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
              {d.value} · {pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
