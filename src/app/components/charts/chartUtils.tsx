import type { ReactNode } from 'react';

// ─── Shared chart primitives ──────────────────────────────────────────────────
// A single, controlled tooltip + card shell so every chart looks consistent and
// the hover never falls back to Recharts' raw default styling.

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** Override the title line (defaults to the category label). */
  title?: string;
  /** Hide series whose value is null/undefined (e.g. the future half of a line). */
  hideEmpty?: boolean;
  formatter?: (value: number | string, name?: string) => string;
  unit?: string;
}

/** Pass as `content={<ChartTooltip />}` to any Recharts <Tooltip>. */
export function ChartTooltip({
  active, payload, label, title, hideEmpty = true, formatter, unit,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => !hideEmpty || (p.value !== null && p.value !== undefined));
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[6px] border border-border bg-popover px-2.5 py-2 shadow-lg text-[11px] min-w-[120px]">
      <div className="font-semibold text-foreground mb-1.5">{title ?? label}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: r.color }} />
              {r.name}
            </span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatter ? formatter(r.value as number, r.name) : r.value}{unit ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tooltip tuned for single-slice donut/pie charts. */
export function DonutTooltip({ active, payload, total }: ChartTooltipProps & { total?: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0];
  const value = Number(slice.value ?? 0);
  const name = (slice.payload?.label as string) ?? slice.name ?? '';
  const color = (slice.payload?.color as string) ?? slice.color;
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <div className="rounded-[6px] border border-border bg-popover px-2.5 py-1.5 shadow-lg text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-medium text-foreground">{name}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {value} {value === 1 ? 'tarea' : 'tareas'}{pct != null ? ` · ${pct}%` : ''}
      </div>
    </div>
  );
}

// Recharts axis defaults shared across charts.
export const AXIS_TICK = { fontSize: 10, fill: 'var(--muted-foreground)' } as const;
export const axisProps = { axisLine: false, tickLine: false, tick: AXIS_TICK } as const;
export const GRID_STROKE = 'var(--border)';

// ─── Card shell ───────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, eyebrow, icon, right, className = '', children }: ChartCardProps) {
  return (
    <div className={`bg-card border border-border rounded-[8px] p-4 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{eyebrow}</div>
          )}
          <div className="flex items-center gap-1.5">
            {icon}
            <h2 className="text-[13px] font-semibold text-foreground truncate">{title}</h2>
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/** Compact legend row used under several charts. */
export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {it.dashed ? (
            <span className="w-3 border-t-2 border-dashed shrink-0" style={{ borderColor: it.color }} />
          ) : (
            <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[160px] text-[12px] text-muted-foreground text-center px-4">
      {message}
    </div>
  );
}
