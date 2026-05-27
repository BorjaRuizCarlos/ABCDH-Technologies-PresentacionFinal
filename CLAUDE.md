# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository scope

Despite the README describing a full Django + PostgreSQL stack, **this repo contains only the React frontend**. The Django backend is un repo separado, desplegado en Railway. Por defecto la app habla con `https://abcdhtechnologiesbackend-production-f379.up.railway.app/api` via el proxy de Vite en dev. No existe Django local en este flujo de trabajo — todo dev apunta a Railway.

UI copy and user-facing strings are in **Spanish**. Match that when adding UI text.

## Commands

| Task | Command |
|------|---------|
| Dev server (Vite, with `/api` proxy) | `npm run dev` |
| Type-check + production build | `npm run build` |
| Preview built bundle | `npm run preview` |
| Serve `dist/` (used by Railway/`PORT`) | `npm start` |
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Run a single test file | `npx vitest run src/__tests__/components/StatusBadge.test.tsx` |
| Run tests matching a name | `npx vitest run -t "renders default label"` |

There is no lint script. Type errors fail `npm run build` (it runs `tsc` first). `tsconfig.json` enables `strict`, `noUnusedLocals`, and `noUnusedParameters` — unused imports/vars will break the build.

## API proxy behavior (important)

[vite.config.ts](vite.config.ts) does two things that are easy to miss:

1. In **dev mode** it overrides `import.meta.env.VITE_API_TARGET` to the literal string `/api` regardless of what's in `.env`. All API calls go through Vite's proxy at `/api`, which forwards to the bare backend origin (the `/api` suffix is stripped from `VITE_API_TARGET` to compute the proxy target). This sidesteps CORS in development.
2. In **production builds** the original `VITE_API_TARGET` value is baked in and requests go directly to that URL.

So when changing API base behavior, edit both the `define` block and the `server.proxy` block, and remember that the `.env` value is only consulted at build time for production.

## Architecture

### Bootstrap chain

[src/main.tsx](src/main.tsx) → [src/app/App.tsx](src/app/App.tsx) wraps the whole tree in this order:

```
ErrorBoundary > ThemeProvider > AuthProvider > RouterProvider + Toaster
```

The router ([src/app/routes.tsx](src/app/routes.tsx)) eagerly loads only `Landing`, `Login`, `NotFound`. Every authenticated page is `React.lazy`-imported and rendered through a Suspense fallback (`PageSkeletons`). Authenticated routes nest under `AppLayout`, which short-circuits to `/` when `useAuth().isAuthenticated` is false. **New authenticated pages must be added under that `AppLayout` children array, not as siblings.**

### Auth + token lifecycle

[src/services/api.ts](src/services/api.ts) is the single fetch wrapper used by every service. Behavior worth knowing before touching it:

- Tokens live in `localStorage` under `pip_access_token` / `pip_refresh_token` (`tokenStore`).
- On a 401, it calls `tryRefresh()` once, retries the original request, and only then surfaces the error.
- It distinguishes a *retryable* 401 from a *hard* session-expiry. When the backend returns 401 / 403 / 400 with a `detail` mentioning `token` and `expir`/`venc` (Spanish), `handleResponse` clears tokens and dispatches a global `pip:auth-session-expired` event (constant `AUTH_SESSION_EXPIRED_EVENT`).
- [src/app/context/AuthContext.tsx](src/app/context/AuthContext.tsx) listens for that event, logs the user out, and shows a 5-second countdown modal before redirecting to `/`. Don't replace this flow with route-level redirects — pages don't know whether they're mid-fetch when the token dies.

User state is also persisted to `localStorage` under `pip_user` so the UI restores instantly on reload before any API roundtrip.

### Services layer

`src/services/` is a thin, typed wrapper around the REST API. Pattern: one file per resource (`projects.service.ts`, `tasks.service.ts`, `users.service.ts`, `github.service.ts`, `auth.service.ts`), each exporting an object of typed methods that call `api.get/post/patch/delete`. Re-exported from [src/services/index.ts](src/services/index.ts) — **import services via the barrel, not the individual files**, so the surface stays consistent.

`types.ts` mirrors the Django model shapes (`ApiProject`, `ApiTask`, `ApiUserAccount`, `ApiBoard`, `ApiBoardColumn`, `ApiSprint`, `ApiMilestone`, `ApiTag`, `ApiRole`, `ApiProjectMember`, `ApiTaskStatus`, `ApiTaskPriority`, `ApiTaskAssignment`, `ApiTaskWarning`, `ApiActivityLog`, `ApiGithubPushEvent`, …). Field names and casing (e.g., `id_project`, `id_user`, `system_role`) come straight from the backend — preserve them. When the backend adds a field, update `types.ts` first so the rest of the type system pulls it through.

### Data fetching pattern

There is no React Query / SWR — components use the bespoke hooks in [src/app/hooks/useProjectData.ts](src/app/hooks/useProjectData.ts) (`useApiProjects`, `useApiTasks`, etc.). Each returns `{ data, loading, error, refetch }`, handles `cancelled` flags on unmount, and uses an internal `tick` counter for `refetch`. Follow that shape for new hooks rather than rolling a different one.

### Roles & permissions

There are two distinct role concepts:

1. **System roles** (org-wide) — numeric IDs `1=admin`, `2=user`, `3=stakeholder`, `4=project_manager`. Mapping lives in [src/app/utils/roles.ts](src/app/utils/roles.ts) (`mapUserRole`, `SYSTEM_ROLE_OPTIONS`). The backend returns both `system_role` (id) and `system_role_name` (string, sometimes localized to Spanish like `administrador`/`usuario`) — `mapUserRole` handles both.
2. **Project roles** (per-project membership) — Project Manager / Product Owner / Scrum Master / Developer / Stakeholder. Resolved by name-matching against `ApiRole` rows in [src/app/utils/projectPermissions.ts](src/app/utils/projectPermissions.ts), which exports `ProjectCapabilities` flags (`canManageProject`, `canManageTasks`, `canCreateRepos`, …). **Use those capability flags in components, not raw role-name string comparisons** — name matching is normalized once there and handles accents/aliases.

### UI component layers

- [src/app/components/ui/](src/app/components/ui/) — shadcn-style primitives wrapping Radix UI. Treat these as the base; don't add more primitive abstractions on top.
- [src/app/components/](src/app/components/) — feature-level composite components (`Sidebar`, `Topbar`, `CommandPalette`, `ProjectTasksWorkspace`, `TaskDetailPanel`, `Timeline`, etc.).
- MUI (`@mui/material`) is also in the dependency tree and used in places — prefer the existing Radix/shadcn + Tailwind primitives for new work to avoid further mixing.

Styling: Tailwind 4 via `@tailwindcss/vite`. Semantic color tokens (`bg-background`, `border-border`, `text-foreground`, `bg-card`, `text-warning`, etc.) are defined in [src/styles/theme.css](src/styles/theme.css) and switch with the theme — prefer them over raw color utilities.

### Path alias

`@/*` resolves to `./src/*` (configured in both `tsconfig.json` and `vite.config.ts`). Most existing files use relative imports (`../../services`) rather than `@/services` — match the style of the file you're editing.

## Testing

Vitest + jsdom + React Testing Library. Global config is in the `test` block of [vite.config.ts](vite.config.ts); the setup file ([src/test/setup.ts](src/test/setup.ts)) just pulls in `@testing-library/jest-dom`. Tests live in `src/__tests__/` mirroring the source tree (`components/`, `services/`, `utils/`). `globals: true` is on, so `describe`/`it`/`expect` don't need to be imported (though existing tests do import them explicitly).

## Rediseno UI/UX en curso

Hay un esfuerzo activo de rediseno completo del frontend. El estado y los entregables viven en `docs/`:

- `docs/audit/screenshots/` (gitignored) — capturas pre-rediseno de cada pantalla en desktop y mobile. Source of truth visual del estado actual.
- `docs/frontend-audit.md` — inventario y diagnostico por pantalla. Generado en fase 1.
- `DESIGN.md` (raiz) — direccion estetica acordada: tipografia, paleta, motion, principios. Cuando exista, es ley para cualquier cambio de UI.
- `docs/redesign-plan.md` — plan por fases (tokens, primitivos, layouts, migracion de pantallas). Define el orden.

Reglas mientras el rediseno este en curso:

- No rediseno ad-hoc. Si una pantalla no esta en la fase actual del `redesign-plan.md`, no la toques visualmente aunque pidas "mejorar Dashboard".
- Cambios visuales arrancan SIEMPRE por `src/app/components/ui/` (primitivos) o `src/styles/theme.css` (tokens), no por la pagina.
- Migracion de pantallas: una rama por pantalla (`redesign/<nombre-pantalla>`), nunca multiples pantallas en el mismo PR.
- Antes de migrar una pantalla, releer su seccion en `frontend-audit.md` y confirmar que el primitivo/token que necesita ya este en main.
- Mantener MUI funcionando hasta que todas las pantallas migren. No mezclar primitivos nuevos con MUI en la misma vista.

## Reglas de trabajo

- No renombrar variables, funciones ni componentes existentes durante mantenimiento o features. En el rediseno, los reemplazos siguen el plan documentado en redesign-plan.md, nunca son decision en caliente.
- No agregar sufijos como _mejorado, _v2, _new, _fixed. Si necesitas convivencia temporal de dos versiones, ponlas en carpetas distintas y documenta el motivo en el PR.
- Prioriza tecnologias actuales y verifica que las librerias propuestas no tengan CVEs conocidos antes de proponerlas (revisa GitHub Advisories o `npm audit`).
- Codigo mantenible: evita condicionales con multiples condiciones encadenadas. Extrae a funciones con nombre.
- Considera seguridad en cada cambio: validacion de entrada, manejo de tokens, XSS en renderizado de strings del backend, dependencias.
- Cuando muestres solo el fragmento modificado, usa el formato con marcadores // <--- Inicia Modificacion ---> y // <--- Termina Modificacion --->.
- UI copy en espanol. Mensajes de error tecnicos en consola pueden quedar en ingles.

## Auth de la app

- La app requiere login. Las rutas protegidas estan envueltas por AuthContext y se redirigen a `/` cuando `useAuth().isAuthenticated` es false.
- Tokens en localStorage bajo `pip_access_token` / `pip_refresh_token`.
- Credenciales de desarrollo: ver `CLAUDE.local.md` (gitignored). Si el archivo no existe o las credenciales no funcionan, pidelas en chat — no crees cuentas nuevas ni intentes adivinar.
- Hay dos conceptos de rol: system role (1-4) y project role (PM/PO/SM/Dev/Stakeholder). Usa siempre las capability flags de `projectPermissions.ts`, nunca compares nombres de rol directamente.