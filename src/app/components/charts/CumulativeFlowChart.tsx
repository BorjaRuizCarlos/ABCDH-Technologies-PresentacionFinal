import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CfdPoint } from '../../utils/dashboardMetrics';
import { ChartTooltip, ChartLegend, axisProps, GRID_STROKE, EmptyChart } from './chartUtils';

interface Props {
  data: CfdPoint[];
  height?: number;
}

/**
 * Cumulative Flow Diagram. The top edge is total scope over time; the amber band
 * is work-in-progress (created but not done). A widening amber band = arrivals
 * outpacing completions, i.e. a bottleneck forming.
 */
export function CumulativeFlowChart({ data, height = 220 }: Props) {
  if (data.length === 0) {
    return <EmptyChart message="Sin historial suficiente para el flujo acumulado." />;
  }

  const doneColor = '#1A7F37';
  const pendColor = '#f59e0b';

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="cfdDone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={doneColor} stopOpacity={0.5} />
              <stop offset="100%" stopColor={doneColor} stopOpacity={0.15} />
            </linearGradient>
            <linearGradient id="cfdPend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pendColor} stopOpacity={0.45} />
              <stop offset="100%" stopColor={pendColor} stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} allowDecimals={false} width={28} />
          <Tooltip content={<ChartTooltip unit=" tareas" />} />
          <Area
            type="monotone" dataKey="done" name="Completadas" stackId="1"
            stroke={doneColor} strokeWidth={1.5} fill="url(#cfdDone)" isAnimationActive={false}
          />
          <Area
            type="monotone" dataKey="pending" name="Pendientes (WIP)" stackId="1"
            stroke={pendColor} strokeWidth={1.5} fill="url(#cfdPend)" isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: 'Completadas (acumulado)', color: doneColor },
          { label: 'Pendientes / WIP', color: pendColor },
        ]}
      />
    </div>
  );
}
