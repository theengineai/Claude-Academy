// Simulación educativa de Claude Code dentro del laboratorio.
// No hay IA ni red: reproduce la FORMA de los comandos (flags, ámbitos, archivos que se leen
// y escriben) según la documentación oficial, y lo deja claro en cada salida.
import { HOME, dirname, displayPath, basename } from './fs.js';
import { parseFrontmatter, parseJson } from './parse.js';

const line = (text, kind = 'out') => ({ text, kind });
const SIM = '(simulación: aquí no hay IA real)';

export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];
const MODE_LABEL = {
  default: 'Manual (default): pide permiso para editar, ejecutar comandos o usar la red',
  acceptEdits: 'acceptEdits: edita archivos del directorio sin preguntar; otros comandos siguen pidiendo permiso',
  plan: 'plan: lee e investiga; no edita hasta que apruebes el plan',
  auto: 'auto: un clasificador revisa cada acción antes de ejecutarla',
  dontAsk: 'dontAsk: deniega todo lo que requeriría permiso (pensado para CI)',
  bypassPermissions: 'bypassPermissions: sin comprobaciones — solo en contenedores o VMs aisladas',
};
const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'];

// ---------- Descubrimiento de configuración (memoria, skills, agentes, settings, MCP) ----------

function ancestors(path) {
  const out = [];
  let dir = path;
  while (true) {
    out.unshift(dir);
    if (dir === '/') break;
    dir = dirname(dir);
  }
  return out;
}
const join = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

export function memoryFiles(sh) {
  const files = [];
  if (sh.fs.isFile(`${HOME}/.claude/CLAUDE.md`)) files.push(`${HOME}/.claude/CLAUDE.md`);
  for (const dir of ancestors(sh.cwd)) {
    for (const name of ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md']) {
      const p = join(dir, name);
      if (sh.fs.isFile(p)) files.push(p);
    }
  }
  const rulesDir = join(sh.cwd, '.claude/rules');
  if (sh.fs.isDir(rulesDir)) files.push(...sh.fs.walk(rulesDir).filter(p => p.endsWith('.md')));
  return files;
}

function readMarkdownDefs(sh, dirs, kind) {
  const defs = [];
  for (const { dir, scope } of dirs) {
    if (!sh.fs.isDir(dir)) continue;
    if (kind === 'skill') {
      for (const entry of sh.fs.list(dir).filter(e => e.type === 'dir')) {
        const file = `${entry.path}/SKILL.md`;
        if (!sh.fs.isFile(file)) continue;
        const { data, body } = parseFrontmatter(sh.fs.read(file));
        defs.push({ name: data?.name || entry.name, data, body, file, scope });
      }
    } else {
      for (const file of sh.fs.walk(dir).filter(p => p.endsWith('.md'))) {
        const { data, body } = parseFrontmatter(sh.fs.read(file));
        defs.push({ name: data?.name || basename(file).replace(/\.md$/, ''), data, body, file, scope });
      }
    }
  }
  return defs;
}

export function skills(sh) {
  const dirs = [{ dir: `${HOME}/.claude/skills`, scope: 'personal' }];
  for (const dir of ancestors(sh.cwd).reverse()) dirs.push({ dir: join(dir, '.claude/skills'), scope: 'proyecto' });
  const commands = readMarkdownDefs(sh, [{ dir: join(sh.cwd, '.claude/commands'), scope: 'comando' }], 'agent');
  // Personal tiene prioridad sobre proyecto: nos quedamos con la primera aparición de cada nombre.
  const seen = new Set();
  return [...readMarkdownDefs(sh, dirs, 'skill'), ...commands].filter(s => (seen.has(s.name) ? false : seen.add(s.name)));
}

export function agents(sh) {
  return readMarkdownDefs(sh, [
    { dir: join(sh.cwd, '.claude/agents'), scope: 'proyecto' },
    { dir: `${HOME}/.claude/agents`, scope: 'personal' },
  ], 'agent');
}

export function settingsFiles(sh) {
  return [
    { path: `${HOME}/.claude/settings.json`, scope: 'usuario' },
    { path: join(sh.cwd, '.claude/settings.json'), scope: 'proyecto' },
    { path: join(sh.cwd, '.claude/settings.local.json'), scope: 'local' },
  ].filter(f => sh.fs.isFile(f.path)).map(f => {
    const parsed = parseJson(sh.fs.read(f.path));
    return { ...f, value: parsed.value, error: parsed.error };
  });
}

function readJsonFile(sh, path, fallback) {
  if (!sh.fs.isFile(path)) return { value: fallback };
  return parseJson(sh.fs.read(path));
}

/** Servidores MCP de los tres ámbitos con su origen. */
export function mcpServers(sh) {
  const out = [];
  const global = readJsonFile(sh, `${HOME}/.claude.json`, {});
  const project = readJsonFile(sh, join(sh.cwd, '.mcp.json'), { mcpServers: {} });
  const local = global.value?.projects?.[sh.cwd]?.mcpServers || {};
  for (const [name, cfg] of Object.entries(local)) out.push({ name, cfg, scope: 'local' });
  for (const [name, cfg] of Object.entries(project.value?.mcpServers || {})) out.push({ name, cfg, scope: 'project' });
  for (const [name, cfg] of Object.entries(global.value?.mcpServers || {})) out.push({ name, cfg, scope: 'user' });
  return { servers: out, errors: [global.error && '~/.claude.json', project.error && '.mcp.json'].filter(Boolean) };
}

// ---------- Diagnóstico (claude doctor / /doctor) ----------

export function doctor(sh) {
  const findings = [];
  for (const f of settingsFiles(sh)) {
    if (f.error) findings.push({ level: 'error', text: `Settings Error: ${displayPath(f.path)} no es JSON válido (¿coma final o comentario //?).` });
    else {
      const p = f.value.permissions || {};
      for (const key of ['allow', 'ask', 'deny']) {
        if (p[key] !== undefined && !Array.isArray(p[key])) findings.push({ level: 'error', text: `${displayPath(f.path)}: permissions.${key} debe ser una lista.` });
      }
      if (f.value.permissions?.defaultMode && !PERMISSION_MODES.concat('manual').includes(f.value.permissions.defaultMode)) {
        findings.push({ level: 'error', text: `${displayPath(f.path)}: defaultMode "${f.value.permissions.defaultMode}" no existe.` });
      }
      if (f.scope !== 'usuario' && ['auto', 'bypassPermissions'].includes(f.value.permissions?.defaultMode)) {
        findings.push({ level: 'warn', text: `${displayPath(f.path)}: defaultMode "${f.value.permissions.defaultMode}" no tiene efecto en archivos de proyecto; ponlo en ~/.claude/settings.json.` });
      }
    }
  }
  const mcpPath = join(sh.cwd, '.mcp.json');
  if (sh.fs.isFile(mcpPath)) {
    const parsed = parseJson(sh.fs.read(mcpPath));
    if (parsed.error) findings.push({ level: 'error', text: '.mcp.json no es JSON válido.' });
    else {
      for (const [name, cfg] of Object.entries(parsed.value.mcpServers || {})) {
        if (cfg.url && !cfg.type) findings.push({ level: 'error', text: `.mcp.json → "${name}": tiene url pero no type; se leería como stdio y se rechaza.` });
        const headers = JSON.stringify(cfg.headers || {}) + JSON.stringify(cfg.env || {});
        if (/(Bearer\s+(?!\$\{)[A-Za-z0-9._-]{8,})|(sk-[A-Za-z0-9]{8,})/.test(headers)) {
          findings.push({ level: 'error', text: `.mcp.json → "${name}": contiene un secreto literal. Usa \${VARIABLE} y no lo subas al repositorio.` });
        }
      }
    }
  }
  for (const file of memoryFiles(sh)) {
    const n = sh.fs.read(file).split('\n').length;
    if (n > 200) findings.push({ level: 'warn', text: `${displayPath(file)} tiene ${n} líneas: la guía recomienda menos de 200; mueve detalle a .claude/rules/ o a imports @.` });
  }
  for (const s of skills(sh)) {
    if (!s.data) findings.push({ level: 'warn', text: `${displayPath(s.file)} no tiene frontmatter (--- ... ---).` });
    else if (!s.data.description) findings.push({ level: 'warn', text: `Skill "${s.name}": sin description, Claude no sabrá cuándo usarla.` });
  }
  for (const a of agents(sh)) {
    if (!a.data?.name || !a.data?.description) findings.push({ level: 'error', text: `Subagente ${displayPath(a.file)}: name y description son obligatorios.` });
  }
  return findings;
}

function doctorLines(sh) {
  const findings = doctor(sh);
  const out = [line(`Diagnóstico de configuración ${SIM}`, 'dim')];
  if (!findings.length) out.push(line('✓ No se han encontrado problemas en settings, MCP, memoria, skills ni subagentes.', 'ok'));
  for (const f of findings) out.push(line(`${f.level === 'error' ? '✗' : '!'} ${f.text}`, f.level === 'error' ? 'err' : 'warn'));
  return out;
}

// ---------- CLI: claude [...] ----------

const FLAGS_WITH_VALUE = new Set(['--model', '--permission-mode', '--output-format', '--allowedTools', '--allowed-tools',
  '--disallowedTools', '--disallowed-tools', '--add-dir', '--append-system-prompt', '--max-turns', '-n', '--name',
  '--agent', '--agents', '--mcp-config', '--settings', '--json-schema']);
const BOOL_FLAGS = new Set(['-p', '--print', '-c', '--continue', '--verbose', '--bare', '--dangerously-skip-permissions', '-v', '--version', '-h', '--help']);

export function runClaude(sh, args, stdin = null) {
  if (args[0] === 'mcp') return mcpCommand(sh, args.slice(1));
  if (args[0] === 'doctor') return { lines: doctorLines(sh) };
  if (args[0] === 'update') return { lines: [line(`Claude Code ya está actualizado ${SIM}.`, 'dim')] };

  const opts = { prompt: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-r' || a === '--resume') {
      opts.resume = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
    } else if (a === '-w' || a === '--worktree') {
      opts.worktree = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
    } else if (FLAGS_WITH_VALUE.has(a)) {
      if (args[i + 1] === undefined) return { lines: [line(`error: option '${a}' argument missing`, 'err')] };
      opts[a] = args[++i];
    } else if (BOOL_FLAGS.has(a)) {
      opts[a] = true;
    } else if (a.startsWith('-')) {
      return { lines: [line(`error: unknown option '${a}'`, 'err'), line('Consulta claude --help para ver las opciones simuladas.', 'dim')] };
    } else {
      opts.prompt.push(a);
    }
  }

  if (opts['-v'] || opts['--version']) return { lines: [line('claude-academy-sim 1.0 (simulador educativo, no es una versión de Claude Code)')] };
  if (opts['-h'] || opts['--help']) {
    return {
      lines: [
        'Uso: claude [opciones] [petición]',
        '  claude                     sesión interactiva',
        '  claude "petición"          sesión interactiva con una primera petición',
        '  claude -p "petición"       modo no interactivo (imprime y sale)',
        '  claude -c                  continúa la conversación más reciente de este directorio',
        '  claude -r <nombre|id>      reanuda una sesión concreta',
        '  --permission-mode <modo>   default · acceptEdits · plan · auto · dontAsk · bypassPermissions',
        '  --model <alias|id>         sonnet · opus · haiku · fable o un ID completo',
        '  --allowedTools "Read,Edit,Bash(git diff *)"   herramientas sin pedir permiso',
        '  --output-format text|json|stream-json  (con -p)',
        '  -n, --name <nombre>        nombre de la sesión · --add-dir <ruta> · --bare',
        '  claude mcp add|list|get|remove · claude doctor',
      ].map(t => line(t)),
    };
  }

  let mode = opts['--permission-mode'] || 'default';
  if (mode === 'manual') mode = 'default';
  if (opts['--dangerously-skip-permissions']) mode = 'bypassPermissions';
  if (!PERMISSION_MODES.includes(mode)) {
    return { lines: [line(`error: argument '${opts['--permission-mode']}' is invalid. Allowed choices are default, acceptEdits, plan, auto, dontAsk, bypassPermissions (o manual).`, 'err')] };
  }
  if (opts['--output-format'] && !['text', 'json', 'stream-json'].includes(opts['--output-format'])) {
    return { lines: [line(`error: --output-format debe ser text, json o stream-json`, 'err')] };
  }
  if (opts['--add-dir'] && !sh.fs.isDir(sh.resolve(opts['--add-dir']))) {
    return { lines: [line(`error: el directorio ${opts['--add-dir']} no existe`, 'err')] };
  }

  const prompt = opts.prompt.join(' ');
  const print = opts['-p'] || opts['--print'];

  if (print) {
    if (!prompt && !stdin) return { lines: [line('error: -p necesita una petición (o datos por stdin).', 'err')] };
    const notes = [];
    if (stdin) notes.push(`stdin recibido: ${stdin.split('\n').length} líneas`);
    if (opts['--allowedTools'] || opts['--allowed-tools']) notes.push(`herramientas preaprobadas: ${opts['--allowedTools'] || opts['--allowed-tools']}`);
    if (opts['--bare']) notes.push('modo --bare: no carga CLAUDE.md, hooks, skills ni MCP del proyecto');
    else if (memoryFiles(sh).length) notes.push(`memoria cargada: ${memoryFiles(sh).map(displayPath).join(', ')}`);
    if (opts['--max-turns']) notes.push(`máximo de turnos: ${opts['--max-turns']}`);
    notes.push(`modo de permisos: ${mode}`);
    const answer = `[Respuesta de ejemplo] Claude procesaría: «${prompt || 'datos de stdin'}» y terminaría.`;
    if (opts['--output-format'] === 'json') {
      return {
        lines: [
          line(JSON.stringify({ type: 'result', subtype: 'success', result: answer, session_id: `sim-${sh.history.length}` }, null, 2)),
          line(`Campos simplificados ${SIM}. ${notes.join(' · ')}`, 'dim'),
        ],
      };
    }
    return { lines: [line(answer), line(`${notes.join(' · ')} ${SIM}`, 'dim')] };
  }

  let resumed = null;
  if (opts['-c'] || opts['--continue']) {
    resumed = [...sh.sessions].reverse().find(s => s.cwd === sh.cwd);
    if (!resumed) return { lines: [line('No conversation found to continue', 'err')] };
  } else if (opts.resume) {
    if (opts.resume === true) {
      if (!sh.sessions.length) return { lines: [line('No hay sesiones anteriores que reanudar.', 'err')] };
      return { lines: [line('Sesiones disponibles (usa claude -r <nombre>):'), ...sh.sessions.map(s => line(`  ${s.name}  · ${displayPath(s.cwd)}`))] };
    }
    resumed = sh.sessions.find(s => s.name === opts.resume || s.id === opts.resume);
    if (!resumed) return { lines: [line(`No se encuentra la sesión "${opts.resume}".`, 'err')] };
  }
  return startSession(sh, { mode, model: opts['--model'], name: opts['-n'] || opts['--name'], prompt, resumed, worktree: opts.worktree });
}

function startSession(sh, { mode, model, name, prompt, resumed, worktree }) {
  if (model && !MODEL_ALIASES.includes(model) && !/^claude-[a-z0-9.-]+$/.test(model)) {
    return { lines: [line(`error: modelo "${model}" no reconocido. Usa un alias (sonnet, opus, haiku, fable) o un ID claude-...`, 'err')] };
  }
  const memory = memoryFiles(sh);
  const sk = skills(sh);
  const ag = agents(sh);
  const { servers } = mcpServers(sh);
  sh.mode = 'claude';
  sh.session = resumed
    ? { ...resumed, permissionMode: mode }
    : {
      id: `s${sh.sessions.length + 1}`,
      name: name || `sesion-${sh.sessions.length + 1}`,
      cwd: sh.cwd,
      permissionMode: mode,
      model: model || 'predeterminado',
      turns: 0,
      tokens: 0,
      compactions: 0,
    };
  const out = [
    line('✻ Claude Code — simulador de la academia', 'claude'),
    line(`  ${resumed ? `Reanudando "${sh.session.name}"` : `Sesión "${sh.session.name}"`} en ${displayPath(sh.cwd)}${worktree ? ` · worktree ${worktree === true ? '(nombre automático)' : worktree}` : ''}`, 'dim'),
    line(`  Modo: ${mode} · Modelo: ${sh.session.model}`, 'dim'),
    line(memory.length ? `  Memoria cargada: ${memory.map(displayPath).join(', ')}` : '  Sin CLAUDE.md en este proyecto: prueba /init', memory.length ? 'dim' : 'warn'),
    line(`  Skills: ${sk.length} · Subagentes: ${ag.length} · Servidores MCP: ${servers.length}`, 'dim'),
  ];
  for (const f of settingsFiles(sh).filter(f => f.error)) out.push(line(`  ⚠ Settings Error en ${displayPath(f.path)}: JSON no válido. Ejecuta /doctor.`, 'err'));
  out.push(line('  /help para ver comandos · /exit para salir · botón ⇧Tab para cambiar de modo', 'dim'));
  if (prompt) out.push(...answerPrompt(sh, prompt).lines);
  return { lines: out };
}

// ---------- Dentro de la sesión ----------

export function cycleMode(sh) {
  if (sh.mode !== 'claude') return { lines: [line('⇧Tab cambia el modo de permisos dentro de una sesión de Claude. Arranca una con: claude', 'dim')] };
  const order = ['default', 'acceptEdits', 'plan'];
  if (sh.session.bypassEnabled || sh.session.permissionMode === 'bypassPermissions') { sh.session.bypassEnabled = true; order.push('bypassPermissions'); }
  order.push('auto');
  const i = order.indexOf(sh.session.permissionMode);
  sh.session.permissionMode = order[(i + 1) % order.length];
  return { lines: [line(`Modo → ${MODE_LABEL[sh.session.permissionMode]}`, 'claude')], mode: sh.session.permissionMode };
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function answerPrompt(sh, text) {
  const s = sh.session;
  s.turns += 1;
  let tokens = estimateTokens(text) + 300;
  const out = [];
  const mentions = [...text.matchAll(/@([\w./~-]+)/g)].map(m => m[1]);
  for (const m of mentions) {
    const agent = agents(sh).find(a => a.name === m || `agent-${a.name}` === m);
    if (agent) { out.push(line(`→ Delegaría en el subagente "${agent.name}" (contexto propio · herramientas: ${agent.data?.tools || 'heredadas'}).`, 'claude')); continue; }
    const path = sh.resolve(m);
    if (sh.fs.isFile(path)) {
      const content = sh.fs.read(path);
      tokens += estimateTokens(content);
      out.push(line(`→ @${m} añadido al contexto (${content.split('\n').length} líneas, ~${estimateTokens(content)} tokens).`, 'claude'));
    } else if (sh.fs.isDir(path)) {
      out.push(line(`→ @${m}: se añade el listado del directorio, no el contenido de cada archivo.`, 'claude'));
    } else {
      out.push(line(`→ @${m}: no existe esa ruta.`, 'warn'));
    }
  }
  const named = agents(sh).find(a => new RegExp(`subagente\\s+${a.name}|subagent\\s+${a.name}`, 'i').test(text));
  if (named) out.push(line(`→ Delegaría en el subagente "${named.name}": trabaja con su propio contexto y devuelve un resumen.`, 'claude'));
  const behaviour = {
    default: 'Investigaría y te pediría permiso antes de editar archivos o ejecutar comandos.',
    acceptEdits: 'Editaría archivos del proyecto sin preguntar; los comandos de shell seguirían pidiendo permiso. Revisa después con git diff.',
    plan: '⏸ Modo plan: leería e investigaría y te presentaría un plan. No tocaría archivos hasta que lo apruebes.',
    auto: 'Un clasificador revisaría cada acción; bloquearía las que excedan tu petición (p. ej. un push forzado).',
    dontAsk: 'Solo usaría herramientas preaprobadas; cualquier otra acción quedaría denegada.',
    bypassPermissions: '⚠ Ejecutaría todo sin preguntar. Solo es aceptable en un contenedor aislado.',
  };
  out.push(line(behaviour[s.permissionMode], 'claude'));
  out.push(line(`${SIM} · contexto acumulado ~${(s.tokens += tokens).toLocaleString('es-ES')} tokens`, 'dim'));
  return { lines: out };
}

function substituteArguments(body, rawArgs) {
  const parts = rawArgs.match(/"[^"]*"|\S+/g)?.map(p => p.replace(/^"|"$/g, '')) || [];
  let used = false;
  let text = body.replace(/\$ARGUMENTS\[(\d+)\]|\$ARGUMENTS|\$(\d+)/g, (m, i1, i2) => {
    used = true;
    if (m === '$ARGUMENTS') return rawArgs;
    return parts[Number(i1 ?? i2)] ?? '';
  });
  if (!used && rawArgs) text += `\n\nARGUMENTS: ${rawArgs}`;
  return text.replace(/!`([^`]+)`/g, (_, cmd) => `[salida de: ${cmd}]`);
}

export function runSessionInput(sh, text) {
  const s = sh.session;
  if (text.startsWith('!')) {
    const result = sh.runShell(text.slice(1).trim());
    return { lines: [line(`! ${text.slice(1).trim()}`, 'dim'), ...result.lines], action: result.action };
  }
  if (!text.startsWith('/')) return answerPrompt(sh, text);

  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ');
  const out = (...lines) => ({ lines: lines.flat() });

  switch (cmd) {
    case '/help':
      return out([
        'Comandos simulados dentro de la sesión:',
        '  /init /memory /context /compact [foco] /clear /model [alias] /plan [tarea]',
        '  /permissions /hooks /mcp /agents /skills /doctor /status /usage /resume /rewind /exit',
        '  /<skill> [argumentos] ejecuta una skill · !comando ejecuta en el shell · @archivo lo añade al contexto',
        '  Botón ⇧Tab: default → acceptEdits → plan → auto',
      ].map(t => line(t)));
    case '/exit':
    case '/quit':
      sh.sessions = sh.sessions.filter(x => x.id !== s.id).concat({ ...s });
      sh.mode = 'shell';
      sh.session = null;
      return out(line('Sesión cerrada. Puedes continuarla con claude -c o claude -r <nombre>.', 'dim'));
    case '/clear':
      s.tokens = 0;
      s.turns = 0;
      return out(line('Conversación nueva con el contexto vacío. CLAUDE.md se vuelve a cargar al inicio.', 'claude'));
    case '/compact': {
      const before = s.tokens;
      s.tokens = Math.round(s.tokens * 0.2);
      s.compactions += 1;
      return out(
        line(`Conversación resumida: ~${before.toLocaleString('es-ES')} → ~${s.tokens.toLocaleString('es-ES')} tokens${arg ? ` · foco: «${arg}»` : ''}.`, 'claude'),
        line('Las decisiones importantes deben vivir en archivos (CLAUDE.md, notas), no solo en la conversación.', 'dim'),
      );
    }
    case '/context': {
      const mem = memoryFiles(sh).reduce((a, f) => a + estimateTokens(sh.fs.read(f)), 0);
      const sk = skills(sh).reduce((a, x) => a + estimateTokens(x.data?.description || ''), 0);
      const mcp = mcpServers(sh).servers.length * 1500;
      const total = 12000 + mem + sk + mcp + s.tokens;
      const width = 24;
      const filled = Math.min(width, Math.max(1, Math.round((total / 200000) * width)));
      return out(
        line(`Uso de contexto (estimación didáctica, ventana de ejemplo de 200k)`, 'dim'),
        line(`${'█'.repeat(filled)}${'░'.repeat(width - filled)}  ~${Math.round(total / 1000)}k / 200k`, 'claude'),
        line(`  Sistema y herramientas: ~12k (fijo en el simulador)`),
        line(`  Memoria (CLAUDE.md, reglas): ~${mem.toLocaleString('es-ES')}`),
        line(`  Skills (solo descripciones): ~${sk.toLocaleString('es-ES')}`),
        line(`  Herramientas MCP: ~${mcp.toLocaleString('es-ES')}`),
        line(`  Conversación: ~${s.tokens.toLocaleString('es-ES')}`),
      );
    }
    case '/init': {
      const path = join(sh.cwd, 'CLAUDE.md');
      if (sh.fs.isFile(path)) return out(line('Ya existe CLAUDE.md: /init propondría mejoras en lugar de sobrescribirlo.', 'claude'));
      const dirs = sh.fs.list(sh.cwd).filter(e => e.type === 'dir' && !e.name.startsWith('.')).map(e => `- ${e.name}/: (describe su contenido)`);
      const template = ['# Proyecto', '', '## Estructura', ...(dirs.length ? dirs : ['- (sin carpetas todavía)']), '', '## Comandos', '- (cómo se ejecutan las pruebas o validaciones)', '', '## Reglas', '- (convenciones y límites que Claude debe respetar)', ''].join('\n');
      sh.fs.write(path, template);
      return out(line('CLAUDE.md creado con una estructura inicial. En la herramienta real Claude analiza el proyecto; revisa y completa siempre el resultado.', 'claude'), line(`Edítalo con: !nano CLAUDE.md ${SIM}`, 'dim'));
    }
    case '/memory': {
      const files = memoryFiles(sh);
      return out(line('Archivos de memoria cargados en esta sesión:', 'claude'), ...(files.length ? files.map(f => line(`  ${displayPath(f)}`)) : [line('  (ninguno)')]),
        line('Para editar uno desde aquí: !nano <ruta>', 'dim'));
    }
    case '/model':
      if (!arg) return out(line(`Modelo actual: ${s.model}. Alias: sonnet, opus, haiku, fable.`, 'claude'));
      if (!MODEL_ALIASES.includes(arg) && !/^claude-[a-z0-9.-]+$/.test(arg)) return out(line(`Modelo "${arg}" no reconocido.`, 'err'));
      s.model = arg;
      return out(line(`Modelo cambiado a ${arg} (también queda como predeterminado para nuevas sesiones).`, 'claude'));
    case '/plan':
      s.permissionMode = 'plan';
      return arg ? { lines: [line('⏸ Modo plan activado.', 'claude'), ...answerPrompt(sh, arg).lines], mode: 'plan' } : { lines: [line('⏸ Modo plan activado.', 'claude')], mode: 'plan' };
    case '/permissions': {
      const files = settingsFiles(sh);
      if (!files.length) return out(line('Sin reglas: no hay settings.json en usuario ni proyecto.', 'claude'));
      const lines = [line('Reglas de permisos (deny > ask > allow):', 'claude')];
      for (const f of files) {
        if (f.error) { lines.push(line(`  ${displayPath(f.path)}: JSON no válido`, 'err')); continue; }
        for (const key of ['deny', 'ask', 'allow']) {
          for (const rule of f.value.permissions?.[key] || []) lines.push(line(`  ${key.padEnd(5)} ${rule}  · ${f.scope}`, key === 'deny' ? 'err' : key === 'ask' ? 'warn' : 'ok'));
        }
      }
      return out(lines);
    }
    case '/hooks': {
      const lines = [line('Hooks configurados:', 'claude')];
      for (const f of settingsFiles(sh).filter(f => !f.error)) {
        for (const [event, groups] of Object.entries(f.value.hooks || {})) {
          for (const g of groups) for (const h of g.hooks || []) lines.push(line(`  ${event} [${g.matcher || '*'}] → ${h.command || h.type}  · ${f.scope}`));
        }
      }
      if (lines.length === 1) lines.push(line('  (ninguno)'));
      return out(lines);
    }
    case '/mcp': {
      const { servers, errors } = mcpServers(sh);
      return out(line('Servidores MCP (ninguno se conecta de verdad en el simulador):', 'claude'),
        ...(servers.length ? servers.map(x => line(`  ${x.name} · ${x.cfg.type || 'stdio'} · ámbito ${x.scope}`)) : [line('  (ninguno) — añade uno desde el shell con claude mcp add')]),
        ...errors.map(e => line(`  ⚠ ${e} no es JSON válido`, 'err')));
    }
    case '/agents': {
      const list = agents(sh);
      return out(line('Pide a Claude que cree un subagente o edita .claude/agents/ y ~/.claude/agents/ directamente.', 'claude'),
        ...(list.length ? list.map(a => line(`  ${a.name} (${a.scope}) — ${a.data?.description || 'sin description'} · tools: ${a.data?.tools || 'heredadas'}`)) : [line('  (sin subagentes personalizados)')]));
    }
    case '/skills': {
      const list = skills(sh);
      return out(line('Skills disponibles:', 'claude'),
        ...(list.length ? list.map(x => line(`  /${x.name} (${x.scope}) — ${x.data?.description || 'sin description'}${x.data?.['disable-model-invocation'] === true ? ' · solo manual' : ''}`)) : [line('  (ninguna)')]));
    }
    case '/doctor':
      return out(doctorLines(sh));
    case '/status':
      return out(line(`Sesión ${s.name} · modo ${s.permissionMode} · modelo ${s.model} · ${displayPath(sh.cwd)}`, 'claude'),
        line(`Setting sources: ${settingsFiles(sh).map(f => f.scope).join(', ') || 'ninguno'}`, 'dim'));
    case '/usage':
    case '/cost':
      return out(line(`Turnos: ${s.turns} · contexto ~${s.tokens.toLocaleString('es-ES')} tokens. Sin coste real ${SIM}.`, 'claude'));
    case '/resume':
      return out(line('Sesiones guardadas:', 'claude'), ...(sh.sessions.length ? sh.sessions.map(x => line(`  ${x.name} · ${displayPath(x.cwd)}`)) : [line('  (ninguna todavía)')]));
    case '/rewind':
      return out(line('Abriría el menú de checkpoints (también con Esc Esc). Puede restaurar código, conversación o ambos.', 'claude'),
        line('Ojo: solo revierte ediciones hechas con las herramientas de archivos; los cambios de comandos Bash no se rastrean. Usa Git como red de seguridad.', 'dim'));
    default: {
      const name = cmd.slice(1);
      const skill = skills(sh).find(x => x.name === name);
      if (!skill) return out(line(`Comando desconocido: ${cmd}. Escribe /help.`, 'err'));
      const expanded = substituteArguments(skill.body.trim(), arg);
      s.turns += 1;
      s.tokens += estimateTokens(expanded);
      return out(
        line(`Skill "${skill.name}" (${skill.scope}) cargada. Instrucciones que recibiría Claude:`, 'claude'),
        ...expanded.split('\n').map(t => line(`  │ ${t}`, 'dim')),
        line(`${SIM}`, 'dim'),
      );
    }
  }
}

// ---------- claude mcp ----------

function mcpCommand(sh, args) {
  const [sub, ...rest] = args;
  const err = t => ({ lines: [line(t, 'err')] });
  const configPath = `${HOME}/.claude.json`;
  const projectPath = join(sh.cwd, '.mcp.json');

  const load = path => {
    const r = readJsonFile(sh, path, {});
    return r.error ? null : r.value;
  };

  if (sub === 'add') {
    let transport = 'stdio';
    let scope = 'local';
    const env = {};
    const headers = {};
    const positional = [];
    let command = null;
    const warnings = [];
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--') { command = rest.slice(i + 1); break; }
      if (a === '--transport' || a === '-t') { transport = rest[++i]; continue; }
      if (a === '--scope' || a === '-s') { scope = rest[++i]; continue; }
      if (a === '--header' || a === '-H') {
        const h = rest[++i] || '';
        const idx = h.indexOf(':');
        if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        continue;
      }
      if (a === '--env' || a === '-e') {
        // --env es voraz: consume todos los KEY=valor que siguen.
        while (rest[i + 1] && !rest[i + 1].startsWith('-') && rest[i + 1].includes('=')) {
          const [k, ...v] = rest[++i].split('=');
          env[k] = v.join('=');
        }
        continue;
      }
      if (a.startsWith('-')) return err(`error: unknown option '${a}'`);
      positional.push(a);
    }
    if (!['stdio', 'http', 'sse'].includes(transport)) return err(`error: transporte "${transport}" no válido (stdio, http o sse). Para WebSocket se usa claude mcp add-json.`);
    if (!['local', 'project', 'user'].includes(scope)) return err(`error: ámbito "${scope}" no válido (local, project o user).`);
    const [name, url] = positional;
    if (!name) return err("error: missing required argument 'name'");
    let cfg;
    if (transport === 'stdio') {
      if (!command?.length) {
        if (url && /^https?:\/\//.test(url)) return err(`Sin --transport, el servidor se trata como stdio y "${url}" se interpretaría como un comando local. Para un servidor remoto usa --transport http.`);
        return err('error: falta el comando del servidor. Sintaxis: claude mcp add [opciones] <nombre> -- <comando> [args...]');
      }
      cfg = { type: 'stdio', command: command[0], args: command.slice(1), env };
    } else {
      if (!url) return err(`error: el transporte ${transport} necesita una URL: claude mcp add --transport ${transport} <nombre> <url>`);
      if (!/^https?:\/\//.test(url)) return err(`error: "${url}" no es una URL http(s) válida.`);
      if (transport === 'sse') warnings.push('SSE está obsoleto: usa --transport http si el servidor lo admite.');
      cfg = { type: transport, url, ...(Object.keys(headers).length ? { headers } : {}) };
    }
    const secretLike = Object.values({ ...env, ...headers }).some(v => /(Bearer\s+(?!\$\{)\S{8,})|^(?!\$\{)[A-Za-z0-9_-]{20,}$|sk-/.test(v));
    if (secretLike && scope === 'project') warnings.push('⚠ Vas a guardar un secreto en .mcp.json, que se comparte en el repositorio. Usa ${VARIABLE} en su lugar.');

    if (scope === 'project') {
      const data = load(projectPath) || { mcpServers: {} };
      data.mcpServers = data.mcpServers || {};
      data.mcpServers[name] = cfg;
      sh.fs.write(projectPath, JSON.stringify(data, null, 2) + '\n');
    } else {
      const data = load(configPath) || {};
      if (scope === 'user') {
        data.mcpServers = { ...(data.mcpServers || {}), [name]: cfg };
      } else {
        data.projects = data.projects || {};
        data.projects[sh.cwd] = data.projects[sh.cwd] || {};
        data.projects[sh.cwd].mcpServers = { ...(data.projects[sh.cwd].mcpServers || {}), [name]: cfg };
      }
      sh.fs.write(configPath, JSON.stringify(data, null, 2) + '\n');
    }
    const where = scope === 'project' ? '.mcp.json (compartido con el equipo)' : scope === 'user' ? '~/.claude.json (todos tus proyectos)' : '~/.claude.json (solo este proyecto, solo tú)';
    return {
      lines: [
        line(`Servidor MCP "${name}" (${transport}) añadido al ámbito ${scope} → ${where}`, 'ok'),
        ...warnings.map(w => line(w, 'warn')),
        line(`Siguiente paso real: /mcp para comprobar estado y autenticar ${SIM}`, 'dim'),
      ],
    };
  }

  if (sub === 'list') {
    const { servers, errors } = mcpServers(sh);
    if (!servers.length) return { lines: [line('No MCP servers configured. Use `claude mcp add` to add a server.'), ...errors.map(e => line(`⚠ ${e} no es JSON válido`, 'err'))] };
    return { lines: [...servers.map(x => line(`${x.name}: ${x.cfg.url || [x.cfg.command, ...(x.cfg.args || [])].join(' ')} (${(x.cfg.type || 'stdio').toUpperCase()}) · ${x.scope} · sin conexión (simulado)`)), ...errors.map(e => line(`⚠ ${e} no es JSON válido`, 'err'))] };
  }
  if (sub === 'get') {
    const x = mcpServers(sh).servers.find(s => s.name === rest[0]);
    if (!x) return err(`No MCP server found with name: ${rest[0]}`);
    return { lines: [line(`${x.name} · ámbito ${x.scope}`), ...JSON.stringify(x.cfg, null, 2).split('\n').map(t => line(t))] };
  }
  if (sub === 'remove') {
    const name = rest.find(a => !a.startsWith('-'));
    const si = rest.findIndex(a => a === '-s' || a === '--scope');
    const wanted = si >= 0 ? rest[si + 1] : null;
    const x = mcpServers(sh).servers.find(s => s.name === name && (!wanted || s.scope === wanted));
    if (!x) return err(`No MCP server found with name: ${name}`);
    if (x.scope === 'project') {
      const data = load(projectPath);
      delete data.mcpServers[name];
      sh.fs.write(projectPath, JSON.stringify(data, null, 2) + '\n');
    } else {
      const data = load(configPath);
      if (x.scope === 'user') delete data.mcpServers[name];
      else delete data.projects[sh.cwd].mcpServers[name];
      sh.fs.write(configPath, JSON.stringify(data, null, 2) + '\n');
    }
    return { lines: [line(`Servidor "${name}" eliminado del ámbito ${x.scope}.`, 'ok')] };
  }
  return err('Uso: claude mcp add | list | get <nombre> | remove <nombre> [-s ámbito]');
}
