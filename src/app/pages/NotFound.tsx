import { Link, useLocation } from 'react-router';
import { ArrowLeft, Home, MapPinOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function NotFound() {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mb-4"
        >
          <MapPinOff className="w-6 h-6 text-muted-foreground mx-auto" />
        </motion.div>

        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="text-6xl font-semibold text-foreground mb-2 tabular-nums tracking-[-0.02em]"
        >
          404
        </motion.h1>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-lg font-semibold text-foreground mb-2">Página no encontrada</h2>
          <p className="text-sm text-muted-foreground mb-1">
            La ruta <code className="px-1.5 py-0.5 bg-muted rounded-sm text-xs font-mono">{location.pathname}</code> no existe.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Verifica la URL o regresa a una sección disponible.
          </p>
        </motion.div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center gap-3"
        >
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="w-4 h-4" />
            Ir al Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-secondary hover:bg-accent text-foreground rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver atrás
          </button>
        </motion.div>
      </div>
    </div>
  );
}
