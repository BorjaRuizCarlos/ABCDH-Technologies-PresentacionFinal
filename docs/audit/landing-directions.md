# Landing publica — 3 direcciones de diseno (input para DESIGN.md)

Fecha: 2026-05-26
Branch: redesign/exploration
Autor del documento: rediseno fase 2 (exploracion)
Insumos: [frontend-audit.md §1](frontend-audit.md), capturas [landing-publica-desktop.png](screenshots/landing-publica-desktop.png) y [landing-publica-mobile.png](screenshots/landing-publica-mobile.png), recorrido en vivo en `http://localhost:5173/`, [src/app/pages/Landing.tsx](../../src/app/pages/Landing.tsx), tokens actuales en [src/styles/theme.css](../../src/styles/theme.css).

## Para que sirve este documento

Tres direcciones **mutuamente excluyentes** para la Landing publica de ABCDH Project Intelligence. No es DESIGN.md — DESIGN.md sale **despues** de que el equipo elija UNA de estas tres (o pida un mezcla explicita entre dos). Cada direccion esta calibrada para sobrevivir al transplante a Dashboard/Backlog/ProjectDetail mas adelante, y al final de cada bloque se enuncia donde se rompe si se aplica al cien por cien.

Punto de partida del producto real, no del marketing:
- ABCDH es operador corporativo (energia). El comprador no es un dev — es VP de Operaciones, gerente de portafolio, jefe de PMO.
- La app interna ya tiene postura ADO-densa (sidebar 220px, density alta). Cualquier direccion que la Landing prometa, el producto debe poder cumplir cuando el usuario haga login.
- Hoy la Landing miente: KPIs hardcoded (62%, 79%, 99.9% uptime) y testimonio ficticio ("Maria Gonzalez"). La direccion elegida debe degradar elegantemente cuando esos datos se borren — o reemplazarse con material real antes de publicar.
- Brand red `#D4192C` (TM Red) es activo corporativo, no opcional. Cada direccion lo reinterpreta sin tirarlo.

## Notacion de tokens

Los tokens estan listos para `@theme inline` de Tailwind 4 en formato `H S% L%` (espacio-separado) para permitir `hsl(var(--primary) / 0.4)` en componentes. Para pegar en `theme.css` basta envolver con `hsl(...)` o usar `oklch(...)` si despues queremos uniformar percepcion.

---

# Direccion A — Memorándum

> Postura: corporativo serio. Tipografica serif-dominante (editorial). Motion casi inexistente.

## 1. Filosofia

La Landing no es una pieza de marketing — es la **portada de un memorando ejecutivo**. La autoridad del producto se demuestra escribiendo como una firma de auditoria escribe, no como una startup escribe. Quien lee siente que esta a punto de abrir un dossier confidencial de una junta directiva, no de probar un trial gratis.

## 2. A quien le habla y primeros 5 segundos

VP de Operaciones, director de PMO corporativo, comite directivo. Primer impulso al cargar la pagina: "esto se ve costoso, formal y aprobado por compliance — no es otra herramienta de tickets". Cero alegoria startup, cero stock photos, cero "join 10,000 teams". La pagina huele a papel, no a Slack.

## 3. Tipografia

| Rol | Familia | Por que ESA |
|---|---|---|
| Display / titulos H1–H2 | **Fraunces** (variable, optical-size aware, Google Fonts) | Fraunces tiene corte optico — el H1 puede usar `opsz=144, soft=0, weight=600` (contraste afilado tipo Didone, autoridad editorial) y el H3 usa `opsz=18, soft=100, weight=500` (humanista, legible a 16px). Una sola familia cubre el rango sin importar 4 archivos. Es libre y variable, asi que no toca licencias corporativas. |
| Body / prosa larga | **IBM Plex Sans** (Google Fonts) | Disenada por Mike Abbink **para** IBM como voz corporativa. Trae gravedad institucional sin caer en Helvetica generica; resuelve el riesgo de que un serif puro se vuelva ilegible en parrafos largos a 14px. |
| Tabular / cifras | **IBM Plex Mono** | Pareja oficial de Plex Sans, alturas de cifra alineadas. Da columnas de numeros que respiran como balance financiero. |

Justificacion estructural, no estetica: serif para autoridad declarativa (titulares, citas, big numbers en hero) + grotesco humanista corporativo para parrafos + mono para datos tabulares. Las tres familias estan disenadas para convivir en documentos densos (Plex es literalmente un sistema corporativo), asi que el sistema escala a Reports y ProjectDetail sin friccion tipografica.

## 4. Paleta (HSL listo para Tailwind)

```
/* Marca */
--brand:        352 70% 34%;   /* oxblood — TM Red recast como sello notarial, no como CTA */

/* Acentos */
--accent-ink:   220 32% 14%;   /* tinta — primary action color (CTAs en negro tinta, no rojo) */
--accent-gold:  40  62% 48%;   /* hoja de oro — etiqueta de status premium, dorados de borde */

/* Neutros (cream / paper) */
--paper:        38  28% 95%;   /* fondo principal — papel kettle, NO blanco puro */
--paper-deep:   36  20% 90%;   /* surface secundaria */
--rule:         220 12% 78%;   /* hairline rule, color de separadores */
--text:         220 30% 12%;   /* texto principal sobre paper */
--text-muted:   220 10% 38%;   /* secundario */
```

**Observacion sobre el brand red**: el rojo TM se conserva como `--brand`, oscurecido a oxblood. **No se usa para CTAs**. Se usa para: el sello/logo de portada, una linea vertical de marca en la tira de stats, y un underline opcional en la palabra clave del H1. Esto resuelve el patron transversal #4 del audit (rojo usado para 6 roles distintos) — aqui rojo = marca y solo marca; CTA = tinta sobre dorado.

## 5. Motion philosophy

**Tesis**: un documento impreso que tomo prestada apenas la cantidad minima de movimiento que el web le concede.

| Que se anima | Como | Cuanto |
|---|---|---|
| Cifras grandes del hero (4 stats) | Count-up de 0 al valor final | 1.2s, easing `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo lento), una sola vez al entrar a viewport |
| Hairlines de separacion | Trazo de izquierda a derecha al entrar a viewport | 600ms, lineal, una sola vez |
| Hover en links | Underline gold dibujado de izquierda a derecha | 180ms `ease-out` |

**Lo que NO se anima jamas**:
- El layout. Nada se reordena al scroll, nada salta posicion.
- Imagenes / mockups. No flotan, no parallax, no tilt-on-hover.
- Cursor. Cursor por defecto del sistema, siempre.
- Color. Ningun fade entre hue (los hover cambian opacidad o underline, no hue).
- Easing rebote, spring, bounce — ninguno. El documento no rebota.

**Reduced motion**: count-ups se reemplazan por el valor final directamente. Trazos de hairline aparecen instantaneos.

## 6. Estructura de secciones

8 secciones, ordenadas como secciones de un memorando ejecutivo:

1. **Portada** (hero) — Titulo serif a 5–6rem, una linea de subtitulo grotesco, sello oxblood arriba a la izquierda. Sin mockup decorativo. **Sin imagen**. Ocupa el viewport completo.
2. **Resumen ejecutivo** — Parrafo en columna de 60ch describiendo el problema que el portafolio corporativo enfrenta. Lenguaje de board paper, no de pitch deck. Sin viñetas.
3. **Indicadores** — 3 cifras tabulares grandes (Plex Mono) en columnas con hairlines verticales tipo balance. Reemplazo del actual "stats inventadas" — aqui van datos **reales y atribuibles** (e.g., "12 dependencias bajo gestion", "8 portafolios activos") o se omite la seccion si no hay datos validos.
4. **Capacidades** — Lista numerada I, II, III, IV (numerales romanos en oxblood) — NO grid de cards. Cada capacidad es 1 H3 serif + 2 lineas de Plex Sans + 1 cita corta de la doc tecnica entrecomillada.
5. **Metodologia** — "Como se opera" (sustituye al "Comienza en 3 pasos"). Linea de tiempo horizontal con 3 hitos, tipografia tabular.
6. **Caso documentado** — UN solo caso, con nombre completo de empresa, fecha y cifra. Si no existe ahora, la seccion se borra hasta que exista — **prohibido testimonio inventado**.
7. **Acceso** — CTA negra tinta sobre paper. Una sola accion: "Acceder a la plataforma". Sin secundaria. Sin "demo".
8. **Pie** — Razon social completa, RFC/equivalente, contacto formal. Mas detallado que el actual.

Orden justificado: el ejecutivo lee de arriba hacia abajo igual que un brief — diagnostico → cifras → solucion → metodo → evidencia → accion. Las cards de feature en grid de 6 (formato startup) violan ese flujo.

## 7. Referencias publicas

- **press.stripe.com** — Stripe Press. Libros sobre crema, serif (Tiempos Headline en su caso), zero ornamentacion. Calibracion ideal de "autoridad calida".
- **brunswickgroup.com** — firma de comunicacion corporativa. Editorial restraint absoluto, fotografia minima, tipografia y aire haciendo todo el trabajo.
- **ft.com** (cualquier articulo largo) — Financial Times. Densidad informativa alta sobre crema; serif para titulares, sans para body; cero motion gratuito.

## 8. Riesgos al aplicar a Dashboard / Backlog / ProjectDetail

- **Dashboard**: KPIs con tipografia serif a 12px se vuelven dificiles de escanear cuando hay 6 cards en fila. Solucion futura: serif solo en el numero, label en Plex Sans uppercase. Si no se respeta, Dashboard se sentira "lento" a 200ms de paint.
- **Backlog**: la fila de tareas espera densidad ADO. Si los row headers se sirven en Fraunces, la tabla se siente ceremonial y el usuario tarda mas en escanear. Backlog necesita estar **explicitamente exento** de serif en filas de datos.
- **ProjectDetail**: la pantalla mas densa de la app (audit §6) mezcla Timeline + ProjectTasksWorkspace + GitHubReposView. Direccion A funciona en el header de proyecto y en los KPICard, pero los listings interiores deben caer a Plex Sans/Mono — sin esa regla la pantalla se siente como un anuario corporativo y no como herramienta operativa.
- **Risk transversal**: el paper cream (`38 28% 95%`) compite con `--background` light del theme actual. Si Dashboard se queda en gris GitHub mientras Landing es cream, la marca tiene dos backgrounds — hay que decidir si todo el producto migra a cream o si Landing es un universo aparte. **Decision para DESIGN.md.**

---

# Direccion B — Caja Negra

> Postura: utilitario / industrial. Tipografica mono-dominante. Motion en tiempo real, no narrativo.

## 1. Filosofia

La Landing es una **mirilla a la sala de control**. No vende — muestra. El visitante ve la consola viva del producto: numeros que tickean, eventos que entran, cursores parpadeando. Si te interesa, abres la puerta (login). Si no, ya viste de que va. Estetica de cabina, no de boutique.

## 2. A quien le habla y primeros 5 segundos

Ingeniero de operaciones, jefe de turno, project manager con backstage tecnico (alguien que ya uso Jira y Linear y tiene opinion). En los primeros 5 segundos: "esto se siente como Datadog o Linear, no como Asana". Reaccion deseada: respeto inmediato por la densidad, **no** sensacion de "que bonito". Si la persona viene buscando bonito, esta no es para ella — y eso es deliberado.

## 3. Tipografia

| Rol | Familia | Por que ESA |
|---|---|---|
| Display / titulos / labels / numerica | **Berkeley Mono** (paid, US Graphics; fallback libre: **JetBrains Mono**) | Mono con DNA Bauhaus — cuadrada, geometrica, sin guiños retro de terminal. Carga ingenieril sin parecer Hacker News. Una sola familia para titulares + KPI + console output mantiene la cabina coherente. |
| Body / prosa larga (descripciones, parrafos) | **Söhne Buch** (paid, Klim Type; fallback libre: **Söhne Buch** no es libre — fallback **Inter Tight** solo si presupuesto cero) | Söhne es neo-grotesque humanista — evita que el body suene robotico cuando el resto es mono. Da humanidad sin romper la postura industrial. |

**Por que NO Söhne para todo**: si la prosa fuera tambien grotesco el visitante leeria "otra landing de SaaS"; el mono dominante es la firma. **Por que NO mono para todo**: parrafos largos en mono cansan a 2 lineas; el grotesco descansa el ojo en las descripciones.

Reglas:
- Mono = todo lo que parece dato: numero, label, tag, codigo, ruta, timestamp, ID, status.
- Grotesco = todo lo que parece prosa: descripcion de feature, parrafo de empresa, footer.
- Tracking: mono lleva `-1%` de tracking (compensa peso de los slabs); grotesco va default.

## 4. Paleta (HSL listo para Tailwind)

```
/* Marca */
--brand:        38 100% 56%;   /* phosphor amber — el "ON" del sistema. TM Red recast como warning, no como marca. */

/* Acentos */
--accent-on:    135 70% 50%;   /* terminal green — status OK, success, conexion viva */
--accent-warn:  0   75% 56%;   /* alert red — usado SOLO para status, no para CTA (rescata TM Red como warning) */

/* Neutros (consola oscura, casi un solo nivel) */
--void:         220 30% 4%;    /* fondo principal — casi negro, levemente azul */
--panel:        220 22% 8%;    /* card / surface */
--rail:         220 16% 12%;   /* surface elevada */
--line:         220 10% 22%;   /* borders / dividers */
--text:         210 15% 92%;   /* texto principal */
--text-dim:     220 8%  58%;   /* secundario, labels */
```

**Observacion**: rojo marca pierde su rol de CTA y se redefine como `--accent-warn` (alarma de status). El verdadero "color de la marca" es el amber phosphor — esto es una **reapropiacion del red** mas que un abandono, pero hay que conversarlo explicitamente con stakeholders de marca antes de comprometerse.

## 5. Motion philosophy

**Tesis**: la pagina respira como una consola activa, **no como un slideshow**. La motion existe porque hay datos vivos, no porque diseno decidio "animar al scroll".

| Que se anima | Como | Cuanto |
|---|---|---|
| Hero metric strip (4–5 cifras) | Tick aleatorio cada 3–6 segundos, valor cambia ±0.1–0.5, color amber flash 80ms al cambiar | Continuo, vida util de la sesion |
| Cursor de bloque tras el H1 | Parpadeo continuo, 1 Hz, color amber | Permanente |
| "Log feed" en seccion features | Lineas nuevas aparecen cada 1.5–3s desde abajo, push las viejas hacia arriba (sin transition — corte duro tipo terminal) | Continuo, max 12 lineas visibles |
| Scroll: nada | No se reveal-on-scroll. Las secciones estan ahi desde que la pagina carga. | 0ms |
| Hover en CTA / link | Cambio de bg sin transicion (`transition: none`) — corte duro tipo terminal | 0ms |

**Lo que NO se anima jamas**:
- Cards no flotan, no escalan, no tienen shadow-hover.
- Scroll no dispara nada — el scroll es para leer, no para descubrir.
- Easing curvas — las animaciones de tick son **lineales** o cortes. Las maquinas no hacen ease-out.
- Modal o accordion con bounce — todo abre y cierra instantaneo.
- Tipografia no se anima (no count-up, no letter-by-letter reveal). El numero ya esta ahi o ya tickeo.

**Reduced motion**: el tick de metricas se detiene; el cursor deja de parpadear; el log feed muestra estado fijo (las ultimas 12 lineas).

## 6. Estructura de secciones

6 secciones, leidas como una sesion de terminal:

1. **`> ./status`** (hero) — Strip horizontal con 4 metricas tickeando + H1 grande mono ("Plataforma de operacion de portafolio.") + cursor parpadeando + CTA mono inline (`[ Acceder → ]`). Sin imagen, sin mockup decorativo.
2. **`> ./live`** — Log feed: lineas reales del producto (`[14:32:01] task#4821 moved Backlog → Sprint 14`, `[14:32:04] push event abcdh/repo by @arojas`). Se requiere endpoint que sirva log redactado/sanitizado o **fixture sintetica claramente etiquetada como demo**. (Atencion a no leakear data real de tenants.)
3. **`> ./capabilities`** — 6 bloques apilados verticalmente, no en grid. Cada uno: label mono + 1 frase grotesco + un mini-diagrama ASCII real (no decorativo). Apilado porque el grid de 3 cards romperia la lectura tipo consola.
4. **`> ./architecture`** — 1 diagrama unico, render lineal en SVG (cajas y flechas, mono labels), de como flujen los datos desde GitHub → Tasks → Reports.
5. **`> ./auth.login`** (CTA) — Bloque negro con borde amber. Una sola accion. Mensaje en estilo prompt: `> credentials_required. proceed?`.
6. **Footer** — Linea unica horizontal: `abcdh-tech / project-intelligence-platform / v[git_sha] / © 2026`.

Orden justificado: una sesion de terminal lee de arriba hacia abajo y cada bloque resuelve una pregunta operativa (`que esta pasando ahora? → que sabe hacer? → como lo hace? → quiero entrar`). Las 3 secciones intermedias del Landing actual (stats inventadas, features grid, 3 pasos, testimonio) se colapsan en 3 secciones operacionales.

## 7. Referencias publicas

- **linear.app** (especialmente las paginas /features) — densidad mono-grotesco, hero con strip de metricas vivas, restraint en motion.
- **vercel.com/observability** — phosphor accent sobre near-black, log feed real, diagrama lineal de arquitectura.
- **railway.app** — mono dominante, "log de deploys" visible, postura industrial.

## 8. Riesgos al aplicar a Dashboard / Backlog / ProjectDetail

- **Dashboard**: KPIs en mono a 18–24px con cifras grandes funciona bien — Dashboard es practicamente lo que esta direccion ya muestra. Riesgo bajo. PERO: el log feed permanente del Landing no se traduce — Dashboard necesita densidad jerarquica (KPI > paneles > listas), no una sola corriente continua. Hay que decidir cuanto del lenguaje "consola viva" pasa al producto y cuanto se queda como artefacto unico del Landing.
- **Backlog**: la fila de tareas en mono es agradable los primeros 5 minutos y luego empieza a cansar. Mono debe quedarse en labels/IDs/tags; los titulos de tarea quedan en grotesco.
- **ProjectDetail**: la pantalla mas densa de la app. Mono everywhere = ilegible. Direccion B funciona si y solo si se enuncia la regla "mono para datos / grotesco para prosa" — pero esa regla es dificil de auditar a futuro. Riesgo medio.
- **Riesgo de marca**: TM Red deja de ser el color marca y se vuelve `accent-warn`. Si el equipo de comunicacion / marca no firma esto explicitamente, hay un conflicto de identidad corporativa permanente. **Esto es decision politica, no de diseno.**
- **Riesgo de tema claro**: phosphor amber sobre cream no funciona. Direccion B asume dark mode unico o requiere repaleta completa para light theme — lo cual contradice el `ThemeContext` existente. Decidir antes de DESIGN.md si Landing es dark-only.

---

# Direccion C — Atlas Industrial

> Postura: expresivo / editorial. Tipografica display-serif con contrapesos. Motion narrativo, scroll-protagonista.

## 1. Filosofia

La Landing es un **atlas industrial impreso a gran escala**. Cada seccion es una plancha de un libro de planos de operacion: diagramas dibujados, numeros grandes, bloques de color flat tipo cartelera modernista. El producto no es "una app" — es **infraestructura de gestion** que se ilustra como se ilustraria un sistema electrico o una refineria en un manual tecnico.

## 2. A quien le habla y primeros 5 segundos

Director de portafolio que disfruta de un buen reporte impreso, jefe de PMO que tiene libros de Pentagram en su oficina, comprador que necesita justificar la compra de software "serio" pero quiere algo con caracter visual. En 5 segundos: "esto se ve como un proyecto de diseno, no como software empresarial generico". Diferencial frente a SAP/Oracle: caracter visual sin perder el tono industrial-pesado.

## 3. Tipografia

| Rol | Familia | Por que ESA |
|---|---|---|
| Display / portadas / H1 monumentales | **PP Editorial Old** (paid, Pangram Pangram; fallback libre: **Bodoni Moda** variable de Google Fonts) | Editorial Old tiene serifs rotos / con textura letterpress — no es Didone perfectamente limpia. Eso le da ASPECTO de "imprenta industrial vieja" que es lo que el atlas pide. Bodoni Moda como fallback respeta el contraste alto pero es mas pulido. |
| Body / prosa | **PP Neue Montreal** (paid; fallback libre: **Outfit** variable de Google Fonts) | Geometrico neutro — es el contrapeso. Sin Neue Montreal el serif vuela solo y la pagina se vuelve museo. Con el geometrico, las dos voces dialogan: una clasica (titulo) y una moderna (texto). |
| Tecnico / captions / metadatos | **PP Fraktion Mono** (paid; fallback libre: **DM Mono** de Google Fonts) | Mono con personalidad — slabs ligeros, no terminal. Se usa para labels de diagramas, escala de blueprints, anotaciones tecnicas. |

Justificacion: tres voces distintas, una para cada nivel de informacion (monumental / leible / tecnico). El atlas industrial historico hacia exactamente esto — tipos de plomo grandes para portadas, romanos para texto, sans condensados para etiquetas de planos.

## 4. Paleta (HSL listo para Tailwind)

```
/* Marca */
--brand:         8 55% 44%;    /* brick / barro cocido — TM Red recast a tono mate, posterizado */

/* Acentos */
--accent-blue:  204 78% 36%;   /* azul de blueprint — usado en diagramas, no en CTA */
--accent-ochre:  36 78% 52%;   /* ocre industrial — highlight grafico, separador, bloque flat */

/* Neutros (paper + ink) */
--paper:         40 28% 92%;   /* cream sin blanquear */
--paper-deep:    34 18% 84%;   /* kraft mas saturado */
--ink:          220 30% 12%;   /* tinta principal */
--graphite:     220 14% 28%;   /* texto secundario */
--rule:         220 8%  60%;   /* lineas de plano, separadores */
```

**Observacion**: brick recast la marca a un rojo terroso, no chillon. Las CTAs son INK sobre OCHRE — bloques flat enormes (no botones discretos). Brand brick aparece como bloques de color en composiciones tipo carteleria modernista, no como tinte de botones.

## 5. Motion philosophy

**Tesis**: la pagina se **dibuja sola** mientras el visitante hace scroll, como si alguien fuera pintando el atlas a mano frente a el. Motion narrativo, larga duracion, easing generoso, **una sola vez** por seccion.

| Que se anima | Como | Cuanto |
|---|---|---|
| Diagramas SVG (lineas y flechas) | `stroke-dasharray` se traza al entrar al viewport | 1.4s por diagrama, easing `cubic-bezier(0.65, 0, 0.35, 1)` (in-out-cubic) |
| Bloques de color flat (carteleria) | Wipe horizontal o vertical desde un borde, no fade | 700ms, easing `cubic-bezier(0.16, 1, 0.3, 1)` |
| Numerales grandes (H1 con cifra) | Aparicion vertical staggered letra-por-letra, desplazamiento 16px | 80ms por letra, total max 600ms, easing `cubic-bezier(0.22, 1, 0.36, 1)` |
| Cursor sobre bloques de color | Cambia a un crosshair custom (16x16) | Instantaneo |
| Hover sobre diagramas | Highlight de un nodo (color de ocre), labels relacionadas en blueprint blue | 200ms `ease-out` |

**Lo que NO se anima jamas**:
- Imagenes/fotografias — no las hay; toda visual es vectorial dibujada.
- Bounce, spring, elastic — incompatibles con la postura tecnica.
- Parallax — el atlas es plano, no 3D.
- Hero "video de fondo" — vetado por completo.
- Tipografia con efectos de gradiente o glow.

**Reduced motion**: los `stroke-dasharray` se sirven completos (sin trazo animado), las letras del H1 aparecen estaticas, los wipes se sustituyen por estado final directo. Las composiciones siguen funcionando porque la estatica es el caso base.

## 6. Estructura de secciones

7 secciones, leidas como spreads (paginas dobles) de un libro impreso:

1. **Portada** — H1 monumental en Editorial Old (cifra grande tipo "ONE" o palabra clave + numero), bloque brick a un lado, sello en mono fraccional ("VOL. 01 / ABCDH"). Sin mockup, sin imagen — la composicion tipografica ES la portada.
2. **Indice** — Lista numerada I–VI de capacidades, con paginacion al lado derecho (tipo libro). El visitante entiende: esto se lee como un libro.
3. **Plancha 01 — Que es un portafolio** — Diagrama lineal grande dibujado en SVG (proyectos → sprints → tareas → riesgo). Captions en Fraktion Mono. Pedagogica antes que comercial.
4. **Plancha 02 — Como se opera** — Composicion split: izquierda bloques flat de carteleria modernista con las 6 capacidades (no cards — bloques de color con la palabra clave gigante encima), derecha texto extendido en Neue Montreal explicando.
5. **Plancha 03 — Caso documentado** — Tipografia editorial larga (1 pagina completa de texto en Neue Montreal con citas en Editorial Old). UN solo caso real (no testimonio inventado). Si no existe, **se elimina la plancha hasta que exista**.
6. **Colofon** — Linea de detalles tecnicos en Fraktion Mono ("Construido sobre Django, React, Postgres / Hospedado en Railway / Cliente: ABCDH Technologies"). Equivalente al colofon de un libro impreso.
7. **Acceso** — CTA en bloque ocre full-bleed con tipografia ink grande. Una sola accion. La otra accion ("iniciar sesion") va en mono pequeno en el footer.

Orden justificado: un atlas se lee linealmente pero **invita a hojear**. El indice permite saltar; las planchas son autoconclusivas (puedes parar despues de la 3 y entender el producto). Esta es la inversa del Landing actual que asume lectura completa.

## 7. Referencias publicas

- **mubi.com** — editorial cinematografico. Display serif + neutros calidos + composicion de bloques flat. Mismo lenguaje, distinto dominio.
- **read.cv** — perfiles tipo libro impreso, cards-como-paginas, tipografia editorial con restraint.
- **Pentagram annual reports** (pentagram.com — secciones case studies, especialmente las de New York City branding) — composicion atlas, bloques de color, tipografia monumental.

## 8. Riesgos al aplicar a Dashboard / Backlog / ProjectDetail

- **Dashboard**: H1 con Editorial Old a 96px en cada pantalla = ridiculo. Los display serifs **no se traducen** a header de Dashboard — el display serif debe quedarse en Landing y portadas de Reports. Riesgo alto si se intenta uniformar.
- **Backlog**: las composiciones de bloques flat tipo carteleria **no caben** en una tabla densa de tareas. El lenguaje grafico de Landing es de portada de libro, no de hoja interior. Backlog necesita lenguaje propio (probablemente mas cercano a la direccion B).
- **ProjectDetail**: el riesgo es que el equipo se enamore del atlas y empiece a meter diagramas SVG decorativos en una pantalla que ya tiene 8 zonas funcionales. **Direccion C requiere disciplina** — esta postura es para Landing y para Reports/PDF export; no se replica a fondo en producto.
- **Riesgo de motion**: scroll-traced reveals son hermosos en Landing y **dolorosos** en producto. Si un usuario abre Dashboard 30 veces al dia y cada vez se traza una linea, lo van a odiar para el dia 3. Motion narrativo se queda **estrictamente en Landing**.
- **Riesgo de licencias**: PP Editorial Old / Neue Montreal / Fraktion Mono son de pago. Hay que comprar o conmutar a los fallbacks libres. Si no se compra el set Pangram, la direccion pierde un 30% de su caracter — Bodoni Moda + Outfit + DM Mono funcionan pero son mas predecibles.
- **Riesgo de produccion**: los diagramas SVG dibujados requieren un disenador con habilidad ilustrativa. No es un trabajo de developer copy-pasteando lucide icons. **Esto cambia quien hace el Landing.**

---

# Comparacion rapida

| Dimension | A — Memorándum | B — Caja Negra | C — Atlas Industrial |
|---|---|---|---|
| Categoria tipografica dominante | Serif (Fraunces) + sans corporativo | Mono (Berkeley) + grotesco humanista | Display serif (Editorial Old) + geometrico + mono |
| Postura general | Sobrio / institucional | Utilitario / industrial | Expresivo / editorial |
| Brand red TM se vuelve... | Sello notarial (no CTA) | `accent-warn` (status) | Bloque brick mate |
| CTA color | Tinta negra sobre paper | Negro con borde amber | Bloque ocre full-bleed |
| Background base | Cream paper light | Near-black void dark | Cream paper light |
| Motion principal | Count-up unico + hairline draw | Tick continuo + log feed vivo | Scroll-traced + wipes + letter stagger |
| Reveal-on-scroll | NO | NO | SI (es la base) |
| Cursor custom | NO | NO (corte duro) | SI (crosshair sobre diagramas) |
| Producto interior necesita... | Excepcion explicita para tablas densas | Regla mono/grotesco bien auditada | Disciplina para no contagiar Dashboard |
| Riesgo de marca con stakeholders | Bajo (red preservado como sello) | Alto (red ya no es marca) | Medio (red existe pero como bloque) |
| Costo tipografico | $0 (todo Google Fonts) | Berkeley Mono ~$80 ; Söhne ~$400 | Pangram trio ~$300 ; o $0 con fallbacks |
| Quien lo produce | Devs + copy editor | Devs solos | Devs + ilustrador / disenador |

---

# Lo que NO esta resuelto aqui

Esto es input para DESIGN.md, no DESIGN.md. Lo siguiente queda pendiente para la fase de decision:

1. **Eleccion de UNA direccion** (o una mezcla explicita, ej. "B en Landing pero C en Reports").
2. **Naming comercial**. "PI Platform" vs "Project Intelligence" vs "Project Intelligence Platform" — el audit §6.6 lo enuncio como deuda. Las 3 direcciones asumen que el nombre se cierra **antes** de aplicar.
3. **Dark/light tema en Landing**. A y C son cream/light; B es dark-only. Si el resto del producto sigue siendo dual (`ThemeContext`), Landing puede quedar fuera o forzar tema. Decision pendiente.
4. **Politica de datos reales en Landing**. Las tres direcciones prohiben numeros inventados y testimonios ficticios. Para publicar, ABCDH tiene que aportar (a) cifras reales atribuibles o (b) aceptar borrar las secciones.
5. **Licencias tipograficas**. Si el presupuesto no permite tipografias de pago, las tres direcciones tienen fallback libre — pero el fallback baja el nivel de caracter en B y C considerablemente. Decision presupuestal antes de DESIGN.md.
