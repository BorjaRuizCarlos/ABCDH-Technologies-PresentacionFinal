# Inventario de Rutas — Fase 1 (Pre-Rediseno)

Fecha: 2026-05-25
Branch: redesign/exploration
Fuente: src/app/routes.tsx, src/app/components/AppLayout.tsx, src/app/components/Sidebar.tsx

## Tabla maestra

| # | Ruta | Componente | Carga | Acceso | Gate visual en Sidebar | Roles esperados |
|---|------|-----------|-------|--------|------------------------|-----------------|
| 1 | `/` | `Landing` | eager | publica | no aplica (no hay layout) | cualquiera |
| 2 | `/login` | `Login` | eager | publica | no aplica | cualquiera |
| 3 | `/dashboard` | `Dashboard` | lazy (DashboardSkeleton) | autenticada | siempre visible (sin restriccion de rol) | admin, user, stakeholder, project_manager |
| 4 | `/projects` | `Projects` | lazy (ProjectsSkeleton) | autenticada | siempre visible | admin, user, stakeholder, project_manager |
| 5 | `/projects/:id` | `ProjectDetail` | lazy (GenericPageSkeleton) | autenticada | no aparece en sidebar (deep link desde Projects) | mismos del proyecto |
| 6 | `/backlog` | `Backlog` | lazy (BacklogSkeleton) | autenticada | restringida en sidebar a `['admin','user','project_manager']` (stakeholder no la ve) | admin, user, project_manager |
| 7 | `/profile` | `Profile` | lazy (GenericPageSkeleton) | autenticada | siempre visible | todos |
| 8 | `/settings` | `Settings` | lazy (GenericPageSkeleton) | autenticada | restringida en sidebar a `['admin','project_manager','user','stakeholder']` (= todos) | todos |
| 9 | `/reports` | `Reports` | lazy (GenericPageSkeleton) | autenticada | restringida en sidebar a `['admin','project_manager']` | admin, project_manager |
| 10 | `/alerts` | `Alerts` | lazy (GenericPageSkeleton) | autenticada | restringida en sidebar a `['admin','project_manager']` | admin, project_manager |
| 11 | `/users` | `CreateUsers` | lazy (GenericPageSkeleton) | autenticada | restringida en sidebar a `['admin']` | admin |
| 12 | `/github` | `GitHub` (`GitHubCallback`) | lazy (GenericPageSkeleton) | autenticada | no aparece en sidebar (es callback OAuth) | autenticados con OAuth pendiente |
| 13 | `*` (NotFound) | `NotFound` | eager | publica si no logueado, autenticada solo si la ruta no matchea ningun hijo | no aplica | cualquiera |

## Notas de auth y enrutamiento

- AppLayout (src/app/components/AppLayout.tsx) es el unico gate de auth real: si `useAuth().isAuthenticated` es false redirige a `/` con `Navigate replace`. No hay guard por rol en el router — el filtrado por rol vive solo en el `<Sidebar>`.
- Las rutas autenticadas son `children` del `path: '/'` con `element: <AppLayout />`. Cualquier ruta nueva autenticada debe entrar en ese arreglo.
- No existe ruta `/register` registrada en el router. El archivo `src/app/pages/Register.tsx` existe y referencia `useAuth().register`, pero solo es accesible si se importa manualmente. **Conclusion: pantalla huerfana / no auditable via navegador.**
- `/github` es el callback OAuth de GitHub (default export `GitHubCallback`). Solo se renderiza util tras un flujo OAuth de GitHub. Su valor visual es tres estados transitorios (processing/success/error/invalid). Se puede capturar el estado de error/invalid navegando sin `code`+`state`.
- NotFound se sirve por la ruta `*` fuera de `AppLayout`, asi que **NotFound no tiene Sidebar ni Topbar** aunque el usuario este logueado. (Caso particular del router actual.)

## Mapeo de gate por rol (segun `Sidebar.navItems`)

`UserRole` posibles: `admin`, `user`, `stakeholder`, `project_manager` (definidos en AuthContext).

| Ruta | admin | user | stakeholder | project_manager |
|------|:-----:|:----:|:-----------:|:---------------:|
| /dashboard | si | si | si | si |
| /projects | si | si | si | si |
| /projects/:id | si* | si* | si* | si* |
| /backlog | si | si | **NO** | si |
| /profile | si | si | si | si |
| /settings | si | si | si | si |
| /reports | si | NO | NO | si |
| /alerts | si | NO | NO | si |
| /users | si | NO | NO | NO |
| /github | si | si | si | si (acceso por callback OAuth, no menu) |

(*) `/projects/:id` ademas filtra capacidades internas via `getProjectCapabilities` (project role, no system role).

## Diferencia importante: gate de Sidebar vs gate real

El router **no** restringe rutas autenticadas por rol. Cualquier usuario logueado puede escribir `/users` en la URL y el componente `CreateUsers` se renderiza — la unica defensa es que `CreateUsers` revisa `currentUser?.role === 'admin'` antes de llamar `loadAllUsers`. Mismo patron sospechado en Reports/Alerts. Esto debe quedar anotado en el frontend-audit como deuda.

## Plan de captura (orden de recorrido)

1. **Publicas (sin login)**: `/`, `/login`, ruta inexistente para `NotFound`.
2. **Admin** (`prueba@prueba.com`): `/dashboard`, `/projects`, `/projects/:id` (primer proyecto existente), `/backlog`, `/reports`, `/alerts`, `/users`, `/profile`, `/settings`, `/github`, NotFound dentro de AppLayout.
3. **User comun** (`usuario` / `password`): `/dashboard`, `/projects`, `/backlog`, `/profile`, `/settings`, intento a `/reports`, `/alerts`, `/users` para evidenciar que el router no bloquea aunque el sidebar oculte.

Viewports por captura: desktop 1440x900 y mobile 390x844.
Naming: `[ruta-slug]-[rol]-[viewport].png` en `docs/audit/screenshots/`.
