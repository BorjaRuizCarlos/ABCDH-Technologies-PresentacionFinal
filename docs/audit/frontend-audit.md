# Auditoria visual frontend — Fase 1 (Pre-Rediseno)

Fecha: 2026-05-25
Branch: redesign/exploration
Tester: admin de pruebas (`prueba@prueba.com`, system_role=1)
Backend: Railway compartido. Estado de datos en el momento de auditoria: la cuenta admin tiene **0 proyectos** asignados; todas las pantallas dependientes de proyectos se vieron en estado vacio.
Viewports: desktop 1440x900, mobile 390x844.
Capturas: [docs/audit/screenshots/](screenshots/)
Cobertura por rol: solo admin (no existe usuario comun con credenciales validas — confirmado en chat).

> Esta auditoria solo describe lo que existe hoy y por que duele. **No** propone soluciones — eso lo aborda el rediseno en [DESIGN.md](../../DESIGN.md) y [redesign-plan.md](../redesign-plan.md) cuando existan.

---

## 1. Landing — `/` (publica)

Capturas: [landing-publica-desktop.png](screenshots/landing-publica-desktop.png) · [landing-publica-mobile.png](screenshots/landing-publica-mobile.png)
Codigo: [src/app/pages/Landing.tsx](../../src/app/pages/Landing.tsx)

- **Proposito real**: marketing/landing comercial corporativo. CTA repetido "Acceder a la plataforma" + "Iniciar sesion". Tema oscuro forzado por la pagina (no respeta `ThemeContext`).
- **Hooks de datos**: ninguno. 100% estatica con strings y `features[]` definidos en el archivo.
- **Componentes principales**: nada del sistema UI propio; usa `<Link>` de react-router y iconos lucide directos. **No** consume `src/app/components/ui/`.
- **MUI/shadcn**: no aplica.
- **Jerarquia visual**: hero -> mockup decorativo con KPIs falsos (62%, 79%, 3, -1.2%) -> 4 stats inventadas (99.9% uptime, 150+ proyectos, 40% reduccion, 4.8/5) -> 6 feature cards -> "Comienza en 3 pasos" -> testimonial fake ("Maria Gonzalez, VP de Operaciones") -> CTA final -> footer.
- **Problemas concretos**:
  - Datos completamente inventados ("99.9% uptime", "150+ proyectos gestionados", testimonio con persona ficticia, mockup con metricas hardcoded). Riesgo de confianza con clientes y de auditoria si esta pagina queda publica.
  - Tema fijo dark con color hex literal (`bg-[#010409]`), no tokens. Si despues queremos modo claro o re-marca, se cambia archivo por archivo.
  - El mockup decorativo del "dashboard" no coincide en absoluto con el dashboard real de la app (que se ve vacio en la realidad). Es publicidad sin respaldo del producto.
  - Microcopy mezcla "Project Intelligence" (logo, footer) con "PI Platform" (resto de la app). Dos nombres comerciales para el mismo producto.
  - "← Volver al inicio" en Login lleva a Landing — esperable, pero refuerza que Landing es la home publica unica.
- **Estados no capturados**: no aplica (no hay estados dinamicos).

## 2. Login — `/login` (publica)

Capturas: [login-publica-desktop.png](screenshots/login-publica-desktop.png) · [login-publica-mobile.png](screenshots/login-publica-mobile.png)
Codigo: [src/app/pages/Login.tsx](../../src/app/pages/Login.tsx)

- **Proposito real**: autenticacion por email + password. Disparo de `useAuth().login()` y redirect a `/dashboard`.
- **Hooks de datos**: ninguno propio. `useAuth()` + `toast` (sonner).
- **Componentes principales**: `LoadingButton`, inputs raw con Tailwind, no Radix/shadcn.
- **MUI/shadcn**: no.
- **Jerarquia visual**: split 2-paneles en desktop (>=lg). Panel izquierdo dark con branding + 3 mini-features. Panel derecho form. En mobile el panel izquierdo se oculta correctamente con `hidden lg:flex`.
- **Problemas concretos**:
  - Color hex hardcoded `bg-[#010409]`, `border-[#21262D]` (paleta tipo GitHub). No usa tokens del theme.
  - Link "¿Olvidaste tu contrasena?" apunta a `href="#"` (no implementado). Promesa rota visual.
  - El input email exige formato email valido (el backend regresa `Introduzca una direccion de correo electronico valida.`). El usuario comun de pruebas en `CLAUDE.local.md` esta dado como `usuario`, que no pasa esa validacion del backend — la app no muestra hint de formato en el placeholder mas alla de "usuario@abcdhtechnologies.com".
  - Toast errors visibles solo en region `Notifications alt+T` sin pista visual cerca del campo que fallo.
- **Estados no capturados**: form con errores de validacion / submit fallido (no envie nada por restriccion de datos).

## 3. NotFound — `*` (semi-publica)

Capturas: [notfound-publica-desktop.png](screenshots/notfound-publica-desktop.png) · [notfound-publica-mobile.png](screenshots/notfound-publica-mobile.png) · [notfound-admin-desktop.png](screenshots/notfound-admin-desktop.png)
Codigo: [src/app/pages/NotFound.tsx](../../src/app/pages/NotFound.tsx)

- **Proposito real**: pagina 404 generica con boton a Dashboard / volver atras.
- **Hooks de datos**: `useLocation` para mostrar la ruta fallida.
- **Componentes principales**: `motion` (motion/react) para fade-in, iconos lucide. UI primitivos crudos.
- **Jerarquia visual**: icono + 404 grande + subtitulo + ruta en `<code>` + 2 botones (primary rojo + secundario).
- **Problemas concretos**:
  - **Critico de routing**: `*` esta fuera de `AppLayout`. Si un usuario autenticado teclea una URL invalida, NotFound se renderiza **sin Sidebar ni Topbar** (ver [notfound-admin-desktop.png](screenshots/notfound-admin-desktop.png)). Visualmente se siente como un logout, aunque el usuario sigue autenticado. Es desorientador.
  - Boton "Ir al Dashboard" siempre apunta a `/dashboard`. Si el usuario no esta logueado, ese link lo manda al AppLayout que redirige a `/` — flujo correcto pero confuso visualmente porque el boton implica acceso directo.
- **Estados no capturados**: ninguno relevante.

## 4. Dashboard — `/dashboard` (autenticada)

Capturas: [dashboard-admin-desktop.png](screenshots/dashboard-admin-desktop.png) · [dashboard-admin-mobile.png](screenshots/dashboard-admin-mobile.png)
Codigo: [src/app/pages/Dashboard.tsx](../../src/app/pages/Dashboard.tsx)

- **Proposito real**: vista resumen post-login. KPIs globales + paneles de salud, vencimientos, proyectos, tareas pendientes y actividad git.
- **Hooks de datos**: `useApiBoards`, `useApiProjectMembers`, `useApiProjects`, `useApiTasks`, `useApiTaskAssignments`, `useApiTaskWarnings`, `useApiGithubPushes`. Siete fetches en paralelo al montar.
- **Componentes principales**: `CommandBar`, `Recharts` (`PieChart`/`Pie`), iconos lucide, `motion/react`. No usa `KPICard` primitivo (lo reimplementa inline).
- **MUI/shadcn**: visualmente Tailwind crudo. KPIs hechos con div+border-t coloreado, no por un primitivo del sistema.
- **Jerarquia visual**: barra de KPIs (6 cards: Proyectos, Tareas, Completadas, Pendientes, Vencidas, Warnings) con borde superior coloreado por categoria -> "Hola, admin" suelto a la derecha del bloque de botones -> 2 paneles 50/50 (Salud Portafolio con Pie + Proximas a Vencer) -> Mis Proyectos full-width -> 2 paneles 50/50 (Tareas Pendientes + Actividad Git).
- **Problemas concretos**:
  - Mapeo de colores de estados/healths usa hex literales mezclados con clases tailwind: `'bg-emerald-500' | 'bg-amber-500' | 'bg-red-500'` (HEALTH_*) y simultaneamente `'#64748b' | '#0ea5e9' | '#f59e0b' | '#8b5cf6' | '#22c55e' | '#ef4444' | '#14b8a6'` en `taskStatusColor` para el grafico. Dos sistemas de color para el mismo dominio (salud/estado de tareas).
  - "Hola, admin" como texto suelto a la derecha del row donde esta el boton "Actualizar". Sin afinidad visual a nada — no es header de la pagina (eso lo pone Topbar) ni accion.
  - 6 KPI cards sin etiqueta de tendencia ni comparativo. Color del border-top no se mapea a un significado documentado.
  - Empty states heterogeneos: "Sin proyectos." centrado / "Sin tareas proximas a vencer. Estas al dia." con icono check verde / "No tienes proyectos asignados." / "Sin tareas pendientes." / "Sin push events recientes." — cinco voces distintas para "vacio".
  - Bottom-half (Mis Tareas Pendientes / Actividad Git) repite secciones de otras paginas (Backlog, GitHub) — alta probabilidad de duplicacion de logica entre Dashboard y esas paginas.
  - **Mobile (390x844)**: el sidebar de 220px se mantiene siempre visible — ocupa >55% del ancho. El contenido principal aplasta los KPIs a un grid 2-col mas angosto y aparece scroll horizontal (ver [dashboard-admin-mobile.png](screenshots/dashboard-admin-mobile.png), la barra inferior). No hay drawer/hamburger.
- **Estados no capturados**: dashboard con datos reales (proyectos, tareas, push events). El admin de pruebas tiene 0 proyectos en Railway, asi que esta auditoria es 100% empty-state. Hay que volver a auditar Dashboard cuando haya seed data.

## 5. Proyectos — `/projects` (autenticada)

Capturas: [projects-admin-desktop.png](screenshots/projects-admin-desktop.png) · [projects-admin-mobile.png](screenshots/projects-admin-mobile.png)
Codigo: [src/app/pages/Projects.tsx](../../src/app/pages/Projects.tsx)

- **Proposito real**: tabla/grid de proyectos con filtro por estado, busqueda, ordenamiento, vista tabla o tarjetas, y boton "Nuevo Proyecto" (gated por rol: admin/user/project_manager).
- **Hooks de datos**: `useApiProjects`, `useApiProjectMembers`, `useApiTasks`, `useApiBoards`. Servicios directos: `projectsService.create`, `usersService.search`.
- **Componentes principales**: `StatusBadge`, `DatePickerField`, `ProgressBar`. Modal de creacion (no abierto en esta auditoria). Toggle vista grid/list. Boton "Nuevo Proyecto" rojo CTA.
- **MUI/shadcn**: visible solo Tailwind + lucide.
- **Jerarquia visual (estado vacio)**: titulo "Proyectos" + subtitulo descriptivo + search + selector sort + toggle vista + boton crear -> chip "Todos 0" -> tabla con headers (Proyecto / Estado / Progreso / Salud / Fecha Fin / Tiempo rest.) -> "Sin proyectos para mostrar / No hay proyectos con los filtros actuales."
- **Problemas concretos**:
  - El screenshot desktop alcanzo el spinner antes del empty state final aunque se espero 3s — la pagina dispara ~7 fetches al montar y el primer paint util tarda > 3s sobre Railway. **Loading state es un spinner generico centrado**, no un esqueleto que mantenga la silueta de la tabla. Choca con el `ProjectsSkeleton` que ya existe (se ve solo durante el lazy import del bundle, no durante el fetch).
  - Mobile: igual que dashboard — sidebar fijo aplasta el contenido, el header de filtros + boton "Nuevo Proyecto" colapsa de forma desordenada.
  - "Todos 0" como chip es ambiguo — parece tab/filter pero no se ve activable.
  - Search placeholder truncado en mobile: "Buscar por proyecto, estado o descrip" (corte literal en pantalla).
- **Estados no capturados**: lista con proyectos reales, vista "tarjetas", modal de creacion, filtros activos.

## 6. ProjectDetail — `/projects/:id` (autenticada)

**No auditada por falta de datos seed**: la cuenta admin de pruebas tiene 0 proyectos asignados en Railway. Sin un `id_project` valido, la ruta requiere un proyecto preexistente y la consigna prohibe crearlo.

Notas del codigo ([src/app/pages/ProjectDetail.tsx](../../src/app/pages/ProjectDetail.tsx)) que conviene tener presentes para cuando exista seed:
- Mezcla `ADOTabs` (estilo Azure DevOps), `Timeline`, `ProjectTasksWorkspace`, `GitHubReposView`, `CodeReviewPanel`, `AvatarGroup`, `KPICard`, `AssignResponsibleModal`, `AddMemberModal`. Es la pantalla mas densa de la app.
- Es la unica pantalla que aplica capability flags reales (`getProjectCapabilities`) sobre el project role del usuario.
- Endpoint chatty: project + boards + members + users + tasks + roles + sprints en paralelo.
- Es candidata #1 a evaluar consistencia de primitivos cuando arranque la migracion: si aqui conviven 4 estilos visuales distintos, el rediseno tiene que decidir cual gana.

**Pendiente**: re-auditar esta pantalla cuando exista un proyecto seed o el usuario provea credenciales con membresia.

## 7. Backlog — `/backlog` (autenticada, oculto a stakeholder)

Capturas: [backlog-admin-desktop.png](screenshots/backlog-admin-desktop.png) · [backlog-admin-mobile.png](screenshots/backlog-admin-mobile.png)
Codigo: [src/app/pages/Backlog.tsx](../../src/app/pages/Backlog.tsx)

- **Proposito real**: ver tareas sin sprint asignado, filtradas por proyecto y por tags. Crear tags por proyecto inline.
- **Hooks de datos**: `useApiProjects`, `useApiTasks`, `useApiTags`. Service directo `tasksService.createTag`.
- **Componentes principales**: `TagColorPicker` (sliders HSL + hex), selector nativo `<select>`, input texto crudo.
- **Jerarquia visual**: shell con header (titulo + selector "Todos los proyectos" + input "Nuevo tag..." + sliders Tono/Saturacion/Brillo + boton "Crear tag") -> mensaje "Sin tags — selecciona un proyecto para ver sus tags." -> area inferior con spinner suelto centrado.
- **Problemas concretos**:
  - El `TagColorPicker` (3 sliders HSL + hex visible) esta **incrustado en el header del shell siempre visible**, no en un popover/dialog. Ocupa mucho espacio visual incluso si el usuario no quiere crear un tag.
  - El spinner inferior es un `<Loader2>` suelto sin texto ni esqueleto, mientras la cabecera ya esta cargada — UI hibrida donde una parte parece lista y otra parece esperando.
  - "Sin tags — selecciona un proyecto" usa em-dash y minusculas inconsistentes con el resto de mensajes empty ("Sin proyectos." con punto, capitalizado).
  - Mobile: el header de 4 controles + sliders no se reordena. Se rompe el flujo en pantallas angostas.
  - Una de las pocas paginas que **no** tiene `<CommandBar>` en el topbar (a diferencia de Dashboard/Projects/Alerts/Reports). Inconsistencia.
- **Estados no capturados**: vista con proyecto seleccionado y tareas reales; flujo de crear tag.

## 8. Reports — `/reports` (autenticada, admin + project_manager)

Capturas: [reports-admin-desktop.png](screenshots/reports-admin-desktop.png) · [reports-admin-mobile.png](screenshots/reports-admin-mobile.png)
Codigo: [src/app/pages/Reports.tsx](../../src/app/pages/Reports.tsx), [src/app/utils/reportExport.ts](../../src/app/utils/reportExport.ts)

- **Proposito real**: reportes ejecutivos con KPI cards, area charts (recharts) y export PDF/XLSX.
- **Hooks de datos**: `useApiProjects`, `useApiTasks`, `useApiTaskWarnings`, `useApiBoards`.
- **Componentes principales**: `CommandBar`, `ReportExportDialog`, recharts (AreaChart/Area/XAxis/YAxis/CartesianGrid/Tooltip).
- **Problema critico — esta ruta no renderiza nada**:
  - Vite responde 500 sobre `src/app/utils/reportExport.ts` con `Failed to resolve import "jspdf"`. Tambien importa `jspdf-autotable` y `xlsx`. **Ninguna de las tres dependencias esta declarada en `package.json`**. (Verificado pidiendo el modulo al dev server: `curl http://localhost:5173/src/app/utils/reportExport.ts` -> 500 Internal Server Error.)
  - El lazy import dispara el `ErrorBoundary` del router. La captura desktop muestra una pantalla en blanco gris (background sin contenido) — el ErrorBoundary fallback aparentemente esta vacio o invisible sobre fondo claro.
  - 5 errores en consola: `TypeError: Failed to fetch dynamically imported module: .../Reports.tsx` -> stack del ErrorBoundary.
- **Otros problemas (del codigo, no capturados visualmente porque no renderiza)**:
  - `statusBadge` y `statusFromHealthMix` declaran 3 niveles ("healthy", "attention", "risk") con colores `red-500/amber-500/emerald-500` raw — no usa tokens semanticos.
  - Importa de utilidades de salud (`computeProjectProgress`, `getProjectHealth`) que tambien existen en Dashboard y Projects — bien que esten centralizados, pero los renderers de color no usan la misma fuente.
- **Estados no capturados**: la pagina entera. Hay que arreglar el bundle antes de auditar visualmente.

## 9. Alerts — `/alerts` (autenticada, admin + project_manager)

Capturas: [alerts-admin-desktop.png](screenshots/alerts-admin-desktop.png) · [alerts-admin-mobile.png](screenshots/alerts-admin-mobile.png)
Codigo: [src/app/pages/Alerts.tsx](../../src/app/pages/Alerts.tsx)

- **Proposito real**: listar warnings de tareas (overdue, asignaciones rotas, etc.) con filtros de severidad y busqueda.
- **Hooks de datos**: `useApiBoards`, `useApiProjectMembers`, `useApiRoles`, `useApiTaskWarnings`, `useApiTasks`.
- **Componentes principales**: `CommandBar`, `StatusBadge`. Iconos lucide. Service directo: `tasksService` (para resolver warning).
- **Jerarquia visual (capturada)**: topbar -> area completa vacia mostrando solo `Cargando alertas...` con spinner.
- **Problemas concretos**:
  - Tras 3s de espera la pagina **no** salio del estado loading en la captura desktop. La sucesion de fetches no termino. Es una pagina pesada en data joins (warnings cruzados con tasks, boards, members y roles). Loading state es solo "Cargando alertas..." centrado verticalmente, sin esqueleto.
  - Mobile: lo mismo. La pagina se queda en spinner y la cabecera filtros no llega a pintarse. Para el usuario es indistinguible de un crash.
  - No hay timeout / mensaje de "tarda mas de lo normal" / boton de reintento.
- **Estados no capturados**: lista con warnings reales, filtros activos, dialog de resolucion.

## 10. CreateUsers — `/users` (autenticada, solo admin)

Capturas: [users-admin-desktop.png](screenshots/users-admin-desktop.png) · [users-admin-mobile.png](screenshots/users-admin-mobile.png)
Codigo: [src/app/pages/CreateUsers.tsx](../../src/app/pages/CreateUsers.tsx)

- **Proposito real**: ABM de usuarios del sistema. CRUD via `usersService`.
- **Hooks de datos**: `useAuth` + estado local con `usersService.list()`. **No** usa los hooks `useApi*` del resto de la app — pattern divergente.
- **Componentes principales**: search input, boton filtro popover, lista paginada de cards, modal de creacion + modal de edicion (no abiertos por restriccion).
- **Jerarquia visual**: header "Gestion de Usuarios" + boton "+ Nuevo Usuario" -> search bar full-width + boton "Filtrar" -> contenedor "Usuarios (1)" con UNA card del propio admin (badge rojo "Tu" + email + chip "Admin") -> pager Anterior / 1 / Siguiente.
- **Problemas concretos**:
  - El boton "Filtrar" no parece abrir un dropdown desde la captura — el popover esta controlado por `showFilterPopup` state, no es un Radix Popover. Otra inconsistencia mas con el sistema de UI.
  - Pager visible incluso con un solo resultado en una sola pagina. UX innecesario.
  - Chip "Tu" rojo brillante junto al nombre — color marca usado para senalizacion (you-are-here), conflictua con CTAs principales que tambien son rojos.
  - Mobile: card de usuario respeta su layout, pero el sidebar fijo aplasta como en el resto.
  - El controllador hace `if (currentUser?.role === 'admin') loadAllUsers()` (linea 53) — si un no-admin entra a la URL, la pagina renderiza el shell vacio sin mensaje de "no autorizado", solo "Gestion de Usuarios — 0 total". **No es un gate real**, es un gate visual.
- **Estados no capturados**: lista con varios usuarios, filtros activos, modal crear/editar.

## 11. Profile — `/profile` (autenticada, todos)

Capturas: [profile-admin-desktop.png](screenshots/profile-admin-desktop.png) · [profile-admin-mobile.png](screenshots/profile-admin-mobile.png)
Codigo: [src/app/pages/Profile.tsx](../../src/app/pages/Profile.tsx)

- **Proposito real**: ver/editar datos del usuario logueado, cambiar contrasena, listar proyectos donde es miembro, toggle de tema, conectar GitHub.
- **Hooks de datos**: `useAuth`, `useTheme`, `useApiProjects`, `useApiProjectMembers`.
- **Componentes principales**: `StatusBadge`, `GitHubConnectSection`. Inputs en modo readonly con highlight de borde izquierdo rojo.
- **Jerarquia visual**: 2 columnas 2/3 + 1/3.
  - Izquierda: card "Informacion Personal" (avatar + Nombre/Correo/Rol) + boton "Editar" + card "Mis Proyectos" (placeholders grises sin animacion).
  - Derecha: card "Preferencias" (toggle Tema Oscuro), card "Seguridad" (boton Cambiar contrasena), card "GitHub" (estado conectado/no conectado + Iniciar sesion + Instalar App).
- **Problemas concretos**:
  - "Mis Proyectos" muestra tres bloques grises **sin nada** — parecen skeletons pero estaticos. En realidad esta vacio por la falta de proyectos del admin. Sin texto "no tienes proyectos" — solo cajas vacias. Confunde estado vacio con estado cargando.
  - El borde rojo lateral grueso de la card de info personal es el unico elemento con esa decoracion en toda la app — visualmente fuera de tono con cards de cualquier otra pagina.
  - Card "GitHub" tiene microcopy en monospace `ABCDH-Technologies` mezclado con texto descriptivo — leak del nombre tecnico de la organizacion.
  - "Tema Oscuro" toggle en Profile **y** "Configuracion" en el sidebar tambien lleva a settings de tema/notificaciones. Dos puntos de entrada para tematicas relacionadas, sin claridad de cual manda.
  - Mobile: 2 columnas se apilan, pero el sidebar permanente sigue robando el ~55% del ancho, asi que las cards quedan estrechisimas (ver mobile capture).
- **Estados no capturados**: modo editando, modal de seguridad/cambio de contrasena, dialogo de conexion GitHub.

## 12. Settings — `/settings` (autenticada, todos)

Capturas: [settings-admin-desktop.png](screenshots/settings-admin-desktop.png) · [settings-admin-mobile.png](screenshots/settings-admin-mobile.png)
Codigo: [src/app/pages/Settings.tsx](../../src/app/pages/Settings.tsx)

- **Proposito real**: configurar preferencias del usuario (notificaciones, email, seguridad, integraciones). Mucho del estado vive en `localStorage` bajo `pip_settings`.
- **Hooks de datos**: ninguno via `useApi*`. Estado local + localStorage.
- **Componentes principales**: `CommandBar`, `ToggleRow` ad-hoc dentro del archivo, `SectionHeader` ad-hoc. Sin Radix/shadcn primitivos.
- **Jerarquia visual**: boton "Guardar cambios" pegado arriba a la izquierda -> bloques apilados con icon-pill + titulo + descripcion + filas de toggle: Notificaciones (4 toggles) -> Notificaciones por Email (3 toggles + input "tu@correo.com" + boton "Enviar prueba") -> Seguridad (3 filas: Cambiar contrasena con "hace 45 dias", 2FA "No configurada", Sesiones activas) -> mas abajo (no capturado totalmente en desktop) probablemente integraciones.
- **Problemas concretos**:
  - **Leak tecnico**: justo debajo del boton "Enviar prueba" se muestra al usuario final el texto `Endpoint: POST /api/notifications/test-email`. Eso es UI de debug en producto.
  - "Cambiar contrasena - Ultima actualizacion: hace 45 dias" es **hardcoded** (no hay endpoint para password last-changed). Promesa falsa.
  - "2FA - No configurada" + "Sesiones activas - Ver y gestionar dispositivos" tambien parecen placeholders sin backend real detras (`Settings.tsx` no usa `useApi*`). Funcionalidad simulada.
  - Toggle pill rojo (color marca) usado para on/off — refuerza el problema de overuse del rojo.
  - "Guardar cambios" siempre visible arriba a la izquierda, sin estado "sin cambios pendientes" — siempre actionable aunque no haya nada que guardar.
  - Mobile: el patron de "icon-pill + bloque de toggles" no respira en pantallas angostas (sidebar fijo) y los toggles quedan pegados al borde derecho.
- **Estados no capturados**: estado con cambios pendientes, post-guardado.

## 13. GitHub callback — `/github` (autenticada, callback OAuth)

Capturas: [github-callback-admin-desktop.png](screenshots/github-callback-admin-desktop.png) · [github-callback-admin-mobile.png](screenshots/github-callback-admin-mobile.png)
Codigo: [src/app/pages/GitHub.tsx](../../src/app/pages/GitHub.tsx) (default export `GitHubCallback`)

- **Proposito real**: recibir el callback OAuth de GitHub (`?code=...&state=...`), llamar `githubService.completeOAuth` y redirigir a Dashboard.
- **Hooks de datos**: `useEffect` -> `githubService.completeOAuth`. Sin hooks `useApi*`.
- **Componentes principales**: card centrada con icono lucide Github + estado (processing/success/error/invalid).
- **Jerarquia visual**: la captura cae naturalmente en estado **"Callback invalido / No se encontraron los parametros de autorizacion esperados."** porque navegue directamente a `/github` sin OAuth params. Render dentro de AppLayout (sidebar + topbar visibles).
- **Problemas concretos**:
  - Que `/github` sea una ruta de top-level del menu interno es engano semantico — solo es un callback. **No deberia ser navegable directamente**. El sidebar la oculta correctamente, pero un usuario que escriba la URL llega y ve "callback invalido" en una shell completa.
  - Mensajes empotrados en componente: `"Callback invalido"`, `"Cuenta conectada"`, `"Error de autorizacion"`, `"Procesando..."`. Iconos: check verde / X roja / spinner. Mezcla de tonos OK pero el card es minimal y queda muy chico contra el viewport (mucho espacio en blanco alrededor).
  - Topbar muestra titulo "github" en minusculas (probablemente derivado del path crudo `location.pathname` o de routes config). El resto de la app muestra titulos capitalizados.
- **Estados no capturados**: estados `processing` y `success` (requieren flujo OAuth real con GitHub).

---

## Patrones transversales

1. **Sidebar fijo no-responsive**. Componente: [src/app/components/Sidebar.tsx](../../src/app/components/Sidebar.tsx). En 390x844 ocupa 220px (≈56% del viewport). Hay collapse manual a 48px, persistido en localStorage, pero no se autocolapsa por viewport y no hay drawer/hamburger. **Toda pantalla autenticada se ve igual de rota en mobile**.

2. **Topbar fixed con CommandBar**: la mayoria de pantallas incluyen `<CommandBar>` (Buscar Ctrl+K). Excepcion: Backlog. Inconsistencia.

3. **Mezcla de sistemas de color**:
   - Tailwind tokens semanticos (`text-success`, `bg-warning`, `text-destructive`) en Projects y algunos componentes.
   - Tailwind raw color scale (`bg-red-500`, `text-amber-600`, `bg-emerald-500`) en Dashboard, Reports, healthbadges.
   - Hex literales (`#0ea5e9`, `#f59e0b`, `#22c55e`, `#010409`, `#21262D`, `#56697f`) en Dashboard taskStatusColor, Login background, Backlog tag default.
   - Resultado: el mismo dominio (estados de salud / tareas) renderiza colores ligeramente distintos segun la pagina.

4. **Color de marca rojo usado para multiples roles semanticos**: CTA primario (Nuevo Proyecto), accion destructiva (Cambiar contrasena), badge "you-are-here" (chip "Tu" en Users), border-active de inputs en Profile, toggles on en Settings, sidebar active state. No hay una jerarquia visual entre primario, destructivo y neutro — todo es "rojo marca".

5. **Empty / loading / error states heterogeneos**:
   - Empty: "Sin proyectos." (con punto), "No tienes proyectos asignados." (con punto), "Sin tags — selecciona un proyecto" (em-dash), placeholders grises sin texto (Profile/Mis Proyectos), "Sin proyectos para mostrar / No hay proyectos con los filtros actuales." (dos lineas).
   - Loading: `PageSkeletons` definidos pero solo cubren el lazy import del bundle. Despues del bundle, cada pagina hace `Cargando alertas...`, `Loader2` suelto, o spinner generico. Algunos paneles ya pintados conviven con spinners de sus subcomponentes (Projects, Backlog).
   - Error: ErrorBoundary captura crashes pero el fallback es visualmente invisible (caso Reports). Errores de API se muestran solo como toasts sonner sin afectar el shell.

6. **Microcopy en dos idiomas y dos estilos**:
   - UI copy en espanol (cumple CLAUDE.md), pero `console.log`, `console.error` y mensajes tecnicos en ingles.
   - "Crear Usuarios" (verbo + objeto) convive con "Reportes" / "Alertas" (sustantivos). Naming inconsistente del sidebar.
   - "PI Platform" (sidebar brand) vs "Project Intelligence" (Landing + Login brand) vs "Project Intelligence Platform" (`<title>` del HTML). Tres versiones del nombre comercial.

7. **Capabilities gating mixto entre router y componente**:
   - El router (`src/app/routes.tsx`) **solo** valida autenticacion (via AppLayout), no rol.
   - El sidebar (`Sidebar.tsx`) filtra entradas por system role.
   - Cada pagina sensible (CreateUsers, Profile) chequea rol internamente para invocar fetches.
   - Resultado: cualquier usuario logueado puede pegar `/users` y ver el shell vacio sin verguenza. No hay un guard centralizado.

8. **Mezcla de utilidades visuales entre paginas**:
   - `computeProjectProgress`, `getProjectHealth`, `formatProjectDate` se importan en Dashboard, Projects, ProjectDetail, Reports, Profile — funcionalmente OK, pero cada pagina renderiza los resultados con widgets distintos (KPICard inline vs `KPICard` componente vs barra inline vs progress ring).

9. **Forms con inputs raw vs primitivos**: Login y Register usan inputs Tailwind crudos. CreateUsers idem. Settings usa `ToggleRow` ad-hoc. Profile reusa estilo de Login. Backlog usa `<select>` nativo. No hay primitivos consistentes `<Input>` `<Select>` `<Toggle>` aplicados sistematicamente, aunque CLAUDE.md menciona que `src/app/components/ui/` es la base.

10. **Pagina huerfana**: `src/app/pages/Register.tsx` existe y funcional (consume `useAuth().register`), pero **no esta registrada en el router**. Codigo muerto / dead route.

---

## Deuda critica para el rediseno

Ordenada por bloqueo / sangrado:

1. **`/reports` esta caida en `main`**. `reportExport.ts` importa `jspdf`, `jspdf-autotable` y `xlsx` que no estan en `package.json`. Vite responde 500, la pagina se cae al ErrorBoundary y el fallback parece blanco. Tres roles afectados (admin, project_manager). Antes de cualquier rediseno visual, hay que decidir: instalar las deps que faltan o quitar el import. **Bloquea cualquier auditoria visual real de Reports.**

2. **Mobile completamente no soportado en cualquier ruta autenticada**. El sidebar fijo de 220px convierte 390x844 en una pantalla inutilizable, con scroll horizontal forzado. No hay drawer, no hay autocollapse, no hay breakpoint. La marca "Plataforma corporativa" choca con que en un telefono no se puede usar.

3. **Routing de autorizacion incompleto**. El gate por rol vive solo en el sidebar (filtrado visual). Cualquier user logueado puede ir a `/users`, `/reports`, `/alerts` por URL. Las paginas internas mitigan parcialmente con `if user?.role === 'admin'`. Riesgo de fuga si alguna pagina nueva olvida el check.

4. **NotFound autenticado se renderiza sin layout**. La ruta `*` esta fuera de `AppLayout`. Para un usuario logueado un typo en la URL parece logout. Hay que decidir si NotFound entra al layout (con sidebar visible) o queda como esta.

5. **Tres sistemas de color simultaneos** (tokens semanticos, scale Tailwind, hex literales) y un solo color marca con multiples roles semanticos. **Esto es lo primero que tiene que congelar `DESIGN.md`** antes de tocar cualquier pantalla.

6. **Estados empty/loading/error sin sistema**. La cosecha de mensajes empty muestra cinco voces distintas. Loading mezcla `PageSkeletons` (bundle), `Cargando ...` (data), spinner suelto (subpanel). Sin un sistema, cada pagina migrada en el rediseno reinventara su lenguaje.

7. **Naming comercial fragmentado**. PI Platform / Project Intelligence / Project Intelligence Platform — el rediseno tiene que cerrar una decision aqui.

8. **Microcopy hardcoded y promesas rotas**: "Ultima actualizacion: hace 45 dias", `Endpoint: POST /api/notifications/test-email`, link "¿Olvidaste tu contrasena?" -> `href="#"`, testimonio de "Maria Gonzalez" en Landing. Antes de presentar este producto, cada uno de estos textos hardcoded debe rastrearse y reemplazarse o eliminarse.

9. **Codigo muerto**: `Register.tsx` no esta en el router. Cualquier mantenimiento del flujo de auth tropieza con esa pagina y supone que funciona, pero ningun link la alcanza.

10. **Dashboard depende de 7 fetches paralelos en cold start**. En Railway eso son varios segundos antes del primer paint util. Aunque hay skeleton, los KPIs muestran ceros mientras llega la data (no se distingue "cargando" de "no tienes datos"). El rediseno tiene que decidir si Dashboard se reduce, se pre-procesa server-side, o se aceptan los multiples roundtrips.

---

## Cobertura pendiente para auditar despues

Pantallas / estados que esta fase 1 NO cubrio y que conviene cerrar antes de bajar al detalle de tokens en fase 2:

- `/projects/:id` (ProjectDetail): la pantalla mas densa de la app. Requiere un proyecto seed o credenciales con membresia.
- Vista "tarjetas" de `/projects`, filtros activos, modal de creacion.
- Cualquier pantalla con datos reales (KPIs reales, listas no vacias, charts con series). Toda esta auditoria es empty-state.
- Modales: `AssignResponsibleModal`, `AddMemberModal`, `ReportExportDialog`, edicion de usuario, cambio de password.
- TaskDetailPanel y ProjectTasksWorkspace en estado interactivo.
- Modal de session expirada (5s countdown documentado en CLAUDE.md, no disparado en esta sesion).
- Diferencias por rol distintas a admin (`user`, `stakeholder`, `project_manager`). Pendiente hasta tener credenciales validas o seed para otros roles.
- `/github` en estados `processing` y `success` reales (requiere flujo OAuth completo).

Cuando exista DESIGN.md y se decidan tokens/primitivos, esta auditoria sigue siendo el baseline para diff antes/despues.
