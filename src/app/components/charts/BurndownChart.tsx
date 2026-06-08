import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { BurndownResult } from '../../utils/dashboardMetrics';
import { ChartTooltip, ChartLegend, axisProps, GRID_STROKE, EmptyChart } from './chartUtils';

interface Props {
  result: BurndownResult;
  height?: number;
  compact?: boolean;
}

/** Ideal vs actual remaining work, with a velocity-based projection to finish. */
export function BurndownChart({ result, height = 220, compact = false }: Props) {
  if (result.scope === 0 || result.points.length === 0) {
    return <EmptyChart message="Sin tareas en este alcance para graficar el burndown." />;
  }

  const remainingColor = '#D4192C';
  const idealColor = '#94a3b8';
  const projColor = result.onTrack ? '#1A7F37' : '#BF8700';

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={result.points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="burndownFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={remainingColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={remainingColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" {...axisProps} minTickGap={compact ? 24 : 12} />
          <YAxis {...axisProps} allowDecimals={false} width={28} />
          <Tooltip content={<ChartTooltip unit=" tareas" />} />
          {result.hasDeadline && (
            <Line
              type="linear" dataKey="ideal" name="Ideal" stroke={idealColor}
              strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone" dataKey="projected" name="Proyección" stroke={projColor}
            strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls
            isAnimationActive={false}
          />
          <Area
            type="monotone" dataKey="remaining" name="Restante" stroke={remainingColor}
            strokeWidth={2} fill="url(#burndownFill)" connectNulls={false}
            dot={false} activeDot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {!compact && (
        <ChartLegend
          items={[
            { label: 'Restante (real)', color: remainingColor },
            ...(result.hasDeadline ? [{ label: 'Ideal', color: idealColor, dashed: true }] : []),
            { label: result.onTrack ? 'Proyección · en ritmo' : 'Proyección · atrasado', color: projColor, dashed: true },
          ]}
        />
      )}
    </div>
  );
}
