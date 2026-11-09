# Claude Code Academy

Aplicación web progresiva (PWA) para aprender **Claude Code** de nivel L2 a L5 con sesiones cortas desde el iPhone: microlecciones, terminal simulada, misiones evaluables, evaluaciones por módulo, repaso espaciado y gamificación.

- **Sin servidor, sin cuentas, sin APIs de IA, sin claves.** HTML, CSS y JavaScript (módulos ES) servidos como archivos estáticos.
- **Funciona sin conexión** tras la primera carga (Service Worker con precaché de todo).
- **Progreso local** en el dispositivo (`localStorage`), con copia de seguridad exportable.
- Proyecto educativo independiente, sin relación oficial con Anthropic.

Guías rápidas:
- [Publicar gratis en GitHub Pages](docs/PUBLICAR.md)
- [Instalar en el iPhone](docs/INSTALAR_IPHONE.md)
- [Fuentes y verificación del contenido](docs/FUENTES.md)
- [Qué se ha verificado y cómo](docs/VERIFICACION.md)

## Probarla en tu ordenador

```bash
python3 -m http.server 4173
# abre http://localhost:4173
```

No abras `index.html` con doble clic (`file://`): los módulos JavaScript y el Service Worker necesitan HTTP.

## Qué incluye

| | |
|---|---|
| Módulos | 6, con evaluación final cada uno (aprobado: 75 %) |
| Microlecciones | 19 (el módulo 1 empieza con «La terminal desde cero»), con tarjetas visuales y ejercicios intercalados |
| Formatos de ejercicio | opción única/decisión, selección múltiple, ordenar, emparejar, completar, encontrar el error, editor con criterios y terminal con objetivos |
| Misiones | 12, incluido el proyecto final integrador |
| Laboratorio | Terminal libre persistente + 8 retos |
| Gamificación | XP por precisión, rangos, nivel de dominio L2→L5, racha diaria, objetivo diario, 16 logros, mapa con desbloqueos |
| Aprendizaje adaptativo | Dominio por competencia (8) basado en aciertos, repaso espaciado (cajas de Leitner) y recomendaciones |

## Estructura

```text
claude-academy/
├── index.html               Entrada, metadatos iOS y PWA
├── manifest.webmanifest     Instalación (rutas relativas)
├── sw.js                    Service Worker: precaché y modo offline
├── css/                     tokens (colores), base, componentes y pantallas
├── icons/                   icon.svg + PNG generados (scripts/make-icons.cjs)
├── content/                 TEMARIO EN JSON (lo que más editarás)
│   ├── course.json          niveles, competencias y conceptos
│   ├── modules/m1…m6.json   lecciones y evaluación de cada módulo
│   ├── missions.json        misiones y proyecto final
│   └── lab.json             retos del laboratorio
├── js/
│   ├── app.js               arranque, rutas (#/...) y contexto
│   ├── core/                lógica pura y testeable: estado, progreso, repaso, logros, validación
│   ├── terminal/            simulador: sistema de archivos, shell, Claude Code y objetivos
│   ├── exercises/render.js  interfaz de los 8 tipos de ejercicio
│   ├── ui/                  utilidades de DOM, iconos, efectos, bloques y terminal visual
│   └── views/               pantallas: inicio, academia, laboratorio, misiones, perfil y actividades
├── tests/                   tests de Node y recorrido de navegador
└── docs/                    guías y verificación
```

## Mantenimiento y ampliación

### Añadir o editar una lección
1. Abre `content/modules/mX.json` y añade un objeto en `lessons` con `id` único (p. ej. `l2-4`), `title`, `summary`, `minutes`, `objectives` y `steps`.
2. `steps` mezcla **tarjetas** (`"type": "card"`) y **ejercicios**. Cada ejercicio necesita `id` único, `type`, `concept` (uno de `course.json`), `prompt` y `explain`.
3. Ejecuta `npm test`: comprueba IDs, conceptos, respuestas, y que cada solución funciona.
4. Añade el archivo nuevo a `sw.js` solo si creas un **archivo** nuevo (no hace falta al editar uno existente).

> No cambies el `id` de algo ya publicado: el progreso guardado lo referencia.

### Bloques de las tarjetas
`text` (markdown mínimo: `**negrita**`, `` `código` ``, listas `- `), `code`, `flow` (diagrama paso a paso animado), `compare` (dos columnas), `tree` (árbol de archivos), `callout` (`tip`, `warn`, `finance`, `info`), `reveal` (pregunta y respuesta oculta), `chat` (conversación de ejemplo) y `video`.

### Vídeos propios (preparado, sin vídeos inventados)
```json
{ "type": "video", "src": "media/plan-mode.mp4", "poster": "media/plan-mode.jpg",
  "captions": "media/plan-mode.vtt", "title": "Modo plan en 90 segundos",
  "fallback": [ { "type": "flow", "steps": [ … ] } ] }
```
Sin `src`, se muestra `fallback`. Para que el vídeo funcione offline, añade sus archivos a `ASSETS` en `sw.js` (ojo: los vídeos pesan; valora dejarlos solo online).

### Tipos de ejercicio (campos)
| Tipo | Campos |
|---|---|
| `choice` | `options: [{ text, correct?, feedback? }]` (una correcta), `context?` para decisiones |
| `multi` | `options: [{ text, correct? , feedback? }]` |
| `order` | `items` en el orden correcto (se barajan solos) |
| `match` | `pairs: [[izquierda, derecha], …]` |
| `fill` | `template` con `{{0}}`, `blanks: [{ options, answer }]` o `[{ accept: [...] }]`; `code: false` para texto normal |
| `spot` | `lines`, `faulty` (índices desde 0), `notes { índice: explicación }`, `fixed`, `file` |
| `editor` | `file`, `starter`, `solution`, `checks: [{ label, pattern, flags?, negate?, json?, hint? }]` |
| `terminal` | `setup { cwd, files }`, `goals`, `solution` (comandos), `solutionFiles` (contenido para `nano`), `suggestions`, `intro` |

Objetivos de terminal (`goals`): `cwd`, `exists`, `absent`, `file` (regex sobre el contenido), `frontmatter`, `json` (rutas con puntos), `ran` (regex sobre el historial), `mode`, `session`, `mcp`, `commits`, `clean` y `doctor`. Todos llevan `label` y, opcionalmente, `hint`.

### Ampliar el simulador
- Comandos de shell: `js/terminal/shell.js` (`exec`).
- CLI y sesión de Claude Code: `js/terminal/claude.js`. Mantén la regla: **reproducir la forma documentada y decir siempre que es una simulación**. Nada se ejecuta de verdad.
- Nuevos tipos de objetivo: `js/terminal/goals.js` (y `GOAL_TYPES`).

### Progreso y versiones
- Clave `cca.state` en `localStorage`, con `version`. Si cambias su forma, sube `STATE_VERSION` y añade una migración en `js/core/state.js`.
- Al importar una copia, la XP se **recalcula** a partir de las actividades registradas.
- En cada despliegue el workflow cambia la versión de caché de `sw.js` (usa el commit), así el iPhone descarga la nueva versión en segundo plano y la aplica al volver a abrir la app.

### Revisar el contenido técnico
Claude Code evoluciona rápido. Antes de cada edición importante revisa `docs/FUENTES.md`, contrasta comandos con <https://code.claude.com/docs> y actualiza la fecha `docsCheckedAt` de `content/course.json`.

## Tests

```bash
npm test                         # motor, temario (ejecuta cada solución en el simulador) y PWA
python3 -m http.server 4173   # en otra terminal, desde esta carpeta
BASE_URL=http://127.0.0.1:4173/ npm run test:e2e         # recorrido en navegador
FULL=1 BASE_URL=http://127.0.0.1:4173/ npm run test:e2e  # recorrido íntegro hasta L5
```

El recorrido de navegador necesita Playwright y Chromium en tu entorno de desarrollo (no en producción). Ver resultados en [docs/VERIFICACION.md](docs/VERIFICACION.md).

## Privacidad
No hay telemetría, cookies de seguimiento ni llamadas de red salvo la descarga de la propia app. Todo el contenido usa datos ficticios. No añadas datos reales de clientes, extractos ni credenciales al temario: el repositorio es compartible.
