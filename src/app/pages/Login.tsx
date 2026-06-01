import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, Mail, ArrowRight, BarChart3, Bell, Brain } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoadingButton } from '../components/LoadingButton';
import { toast } from 'sonner';

const FEATURES = [
  { icon: <BarChart3 className="w-3.5 h-3.5" />, title: 'KPIs en tiempo real', desc: 'Métricas de avance y presupuesto actualizadas' },
  { icon: <Bell className="w-3.5 h-3.5" />, title: 'Alertas tempranas', desc: 'Notificaciones inteligentes de riesgos' },
  { icon: <Brain className="w-3.5 h-3.5" />, title: 'Análisis predictivo', desc: 'Predicción de retrasos y desviaciones presupuestales' },
];

function BrandMark() {
  return (
    <span className="inline-grid size-8 place-items-center rounded-md bg-brand font-mono text-[13px] font-semibold tracking-tight text-brand-foreground" aria-hidden>
      tm
    </span>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Por favor completa todos los campos');
      return;
    }
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('¡Bienvenido a Project Intelligence!');
      navigate('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      console.error(`[Login] Error:`, err);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel — brand (riel oscuro cálido YEMODA) */}
      <div className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar p-10 lg:flex lg:w-[420px] xl:w-[480px]">
        <div>
          <Link to="/" className="mb-14 flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-foreground">Tech Mahindra</span>
              <span className="text-[11px] text-sidebar-muted">Project Intelligence</span>
            </span>
          </Link>

          <h2 className="mb-3 text-[26px] font-semibold leading-snug tracking-[-0.02em] text-sidebar-foreground">
            Gestión inteligente de<br />
            <span className="text-brand">proyectos en tiempo real</span>
          </h2>
          <p className="mb-10 max-w-sm text-sm leading-relaxed text-sidebar-muted">
            Centraliza, monitorea y analiza el estado de tu portafolio. La plataforma corporativa
            que ejecutivos y equipos necesitan.
          </p>

          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand/15 text-brand">
                  {f.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-sidebar-foreground">{f.title}</p>
                  <p className="mt-0.5 text-[11px] text-sidebar-muted">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-sidebar-muted">© {new Date().getFullYear()} · Desarrollado por ABCDH Technologies para Tech Mahindra</p>
      </div>

      {/* Right Panel — Form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <BrandMark />
              <span className="text-sm font-semibold text-foreground">Tech Mahindra</span>
            </Link>
          </div>

          <div className="mb-7">
            <h1 className="mb-1 text-xl font-semibold tracking-[-0.01em] text-foreground">Iniciar sesión</h1>
            <p className="text-sm text-muted-foreground">Accede a tu panel de gestión de proyectos</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@abcdhtechnologies.com"
                  className="w-full rounded-md border border-input bg-input-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-input bg-input-background py-2 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="size-3.5 rounded-sm border-input accent-primary" />
                <span className="text-xs text-muted-foreground">Recordarme</span>
              </label>
              <a href="#" className="text-xs font-medium text-primary hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* Submit */}
            <LoadingButton
              type="submit"
              loading={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all [transition-timing-function:var(--ease-out)] hover:bg-primary-hover active:scale-[0.99]"
            >
              Iniciar sesión
              <ArrowRight className="size-3.5" />
            </LoadingButton>
          </form>

          <div className="mt-5 text-center">
            <Link to="/" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
