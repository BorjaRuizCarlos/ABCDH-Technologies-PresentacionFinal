import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  GitBranch,
  ListChecks,
  FileText,
  BellRing,
  ArrowRight,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../components/ui/utils';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Landing YEMODA — pieza de marca de Tech Mahindra. Aqui el TM Red es PROTAGONISTA
// (excepcion deliberada a la regla de "rojo reservado" del producto, ver DESIGN.md §3.3/§8).
// Sin datos inventados: el panel de hero es una "vista de producto · datos de ejemplo" etiquetada.

const YEAR = 2026;
const VERSION = 'v0.1.0';

/** Reveal on scroll con respeto a prefers-reduced-motion (DESIGN.md §5). */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '-60px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-500 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none',
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid size-8 place-items-center rounded-md bg-brand font-mono text-[13px] font-semibold tracking-tight text-brand-foreground',
        className,
      )}
    >
      tm
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={toggleTheme}
      className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={cn('size-2 rounded-full', color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-foreground">{value}</span>
    </li>
  );
}

function HealthDonut() {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = 0.72; // ilustrativo
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0" role="img" aria-label="Salud del portafolio (ejemplo)">
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" stroke="currentColor" className="text-border" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        stroke="currentColor"
        className="text-brand"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="42" textAnchor="middle" dominantBaseline="central" className="fill-foreground font-mono text-[15px] font-medium">
        24
      </text>
    </svg>
  );
}

function ProductPreview() {
  const tiles = [
    { l: 'PROYECTOS', v: '24' },
    { l: 'EN RIESGO', v: '3' },
    { l: 'A TIEMPO', v: '87%' },
  ];
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-e3">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-3">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <span className="ml-3 font-mono text-[11px] text-muted-foreground">project-intelligence · dashboard</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            {tiles.map((k) => (
              <div key={k.l} className="rounded-lg border border-border bg-surface-secondary/50 px-3 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{k.l}</p>
                <p className="mt-1 font-mono text-xl font-medium tabular-nums text-foreground">{k.v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-surface-secondary/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Salud del portafolio</p>
              <p className="font-mono text-[10px] text-muted-foreground">24 total</p>
            </div>
            <div className="mt-3 flex items-center gap-5">
              <HealthDonut />
              <ul className="flex-1 space-y-1.5">
                <LegendRow color="bg-success" label="Saludables" value="18" />
                <LegendRow color="bg-warning" label="En riesgo" value="3" />
                <LegendRow color="bg-brand" label="Críticos" value="3" />
              </ul>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">Vista del producto · datos de ejemplo</p>
    </div>
  );
}

const CAPABILITIES = [
  { icon: GitBranch, title: 'Integración con GitHub', desc: 'Push events, repos y actividad del equipo, vinculados a cada tarea y proyecto.' },
  { icon: ListChecks, title: 'Sprints y Backlog', desc: 'Planeación ágil con tableros, sprints y un backlog priorizado por tu PMO.' },
  { icon: FileText, title: 'Reportes ejecutivos', desc: 'Exporta a PDF y Excel reportes listos para presentar a la dirección.' },
  { icon: BellRing, title: 'Alertas tempranas', desc: 'Detecta riesgos, retrasos y vencimientos antes de que escalen.' },
];

const STEPS = [
  { n: '01', t: 'Conecta', d: 'Vincula tus repositorios de GitHub y a tu equipo.' },
  { n: '02', t: 'Organiza', d: 'Crea proyectos, sprints y tareas con roles y permisos.' },
  { n: '03', t: 'Mide', d: 'Monitorea salud, alertas y reportes en tiempo real.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
      >
        Saltar al contenido
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight text-foreground">Tech Mahindra</span>
              <span className="text-[11px] text-muted-foreground">Project Intelligence</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="#capacidades" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              Capacidades
            </a>
            <ThemeToggle />
            <Button asChild variant="primary-brand">
              <Link to="/login">Acceder</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="contenido">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1fr_1.05fr] lg:py-28">
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-brand">Tech Mahindra · Project Intelligence</p>
              <h1 className="mt-5 text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-foreground">
                Inteligencia para{' '}
                <span className="relative whitespace-nowrap text-brand">
                  operar
                  <span aria-hidden className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-brand/30" />
                </span>{' '}
                tu portafolio de proyectos.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Centraliza proyectos, sprints, actividad de GitHub, alertas y reportes ejecutivos en una sola plataforma.
                Desarrollada por ABCDH Technologies para Tech Mahindra.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary-brand" size="lg">
                  <Link to="/login">
                    Acceder a la plataforma <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="#capacidades">Conocer capacidades</a>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-border bg-surface-secondary/50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand" /> Desarrollado por <strong className="font-medium text-foreground">ABCDH Technologies</strong>
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span>
              para <strong className="font-medium text-foreground">Tech Mahindra</strong>
            </span>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capacidades" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-brand">Capacidades</p>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
                Todo lo que tu PMO necesita, en un solo lugar.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {CAPABILITIES.map((cap, i) => {
                const Icon = cap.icon;
                return (
                  <Reveal key={cap.title} delay={i * 60}>
                    <article className="group h-full rounded-xl border border-border bg-card p-6 transition-all duration-200 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                      <span className="grid size-10 place-items-center rounded-lg bg-brand/10 text-brand">
                        <Icon className="size-5" />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold text-foreground">{cap.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cap.desc}</p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-surface-secondary/40">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <Reveal>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-brand">Cómo funciona</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
                De GitHub a la dirección, en tres pasos.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 80}>
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-3xl font-semibold tabular-nums text-brand">{s.n}</span>
                    <span className="h-px w-10 bg-brand/40" />
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{s.t}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band — rojo protagonista */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <div className="overflow-hidden rounded-2xl bg-brand px-8 py-14 text-center sm:px-16">
                <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.02em] text-brand-foreground sm:text-4xl">
                  Listo para operar tu portafolio con claridad.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-brand-foreground/80">
                  Accede a la plataforma de Project Intelligence de Tech Mahindra.
                </p>
                <div className="mt-8 flex justify-center">
                  <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
                    <Link to="/login">
                      Acceder ahora <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">Tech Mahindra</span>
              <span className="text-xs text-muted-foreground">Project Intelligence Platform · Desarrollado por ABCDH Technologies para Tech Mahindra</span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="#capacidades" className="transition-colors hover:text-foreground">Capacidades</a>
            <Link to="/login" className="transition-colors hover:text-foreground">Acceder</Link>
            <span className="font-mono">© {YEAR} · {VERSION}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
