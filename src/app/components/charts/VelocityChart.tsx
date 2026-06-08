import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { ThroughputResult } from '../../utils/dashboardMetrics';
import { ChartTooltip, ChartLegend, axisProps, GRID_STROKE, EmptyChart } from './chartUtils';

interface Props {
  result: ThroughputResult;
  height?: number;
  compact?: boolean;
}

/** Weekly completed-task throughput with a 4-week moving average. */
export function VelocityChart({ result, height = 200, compact = false }: Props) {
  if (result.data.length === 0 || result.bestWeek === 0) {
    return <EmptyChart message="Aún no hay tareas completadas para medir la velocidad." />;
  }

  const barColor = '#0ea5e9';
  const avgColor = '#D4192C';

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={result.data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={compact ? 2 : '18%'}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={compact ? 18 : 8} />
          <YAxis {...axisProps} allowDecimals={false} width={28} />
          <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.4 }} content={<ChartTooltip />} />
          <Bar dataKey="completed" name="Completadas" radius={[3, 3, 0, 0]} maxBarSize={compact ? 14 : 28}>
            {result.data.map((_, i) => (
              <Cell key={i} fill={barColor} fillOpacity={i === result.data.length - 1 ? 1 : 0.55} />
            ))}
          </Bar>
          <Line
            type="monotone" dataKey="avg" name="Media móvil (4 sem)" stroke={avgColor}
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {!compact && (
        <ChartLegend
          items={[
            { label: 'Completadas / semana', color: barColor },
            { label: 'Media móvil (4 sem)', color: avgColor },
          ]}
        />
      )}
    </div>
  );
}
