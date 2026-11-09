// Intérprete de shell simulado. Solo manipula el sistema de archivos ficticio:
// nunca ejecuta procesos reales ni se conecta a Internet ni a Claude.
import { VirtualFS, HOME, resolvePath, dirname, basename, displayPath } from './fs.js';
import { tokenize } from './parse.js';
import { runClaude, runSessionInput, cycleMode } from './claude.js';

const BASE_FILES = {
  [`${HOME}/`]: null,
  [`${HOME}/.claude/`]: null,
  '/tmp/': null,
};

const line = (text, kind = 'out') => ({ text, kind });

export class Shell {
  /**
   * @param {object} opts
   * @param {object} [opts.files]  { ruta: contenido } adicionales (ruta con "/" final = directorio)
   * @param {string} [opts.cwd]    directorio inicial (admite ~)
   * @param {object} [opts.snapshot] estado serializado (toJSON) para restaurar
   */
  constructor({ files = {}, cwd = '~', snapshot = null } = {}) {
    if (snapshot) {
      this.fs = VirtualFS.fromJSON(snapshot.fs);
      this.cwd = snapshot.cwd;
      this.history = snapshot.history || [];
      this.sessions = snapshot.sessions || [];
    } else {
      this.fs = new VirtualFS({ ...BASE_FILES, ...files });
      this.cwd = resolvePath(cwd, HOME);
      if (!this.fs.isDir(this.cwd)) this.fs.mkdir(this.cwd, { parents: true });
      this.history = [];
      this.sessions = [];
    }
    this.mode = 'shell';
    this.session = null;
  }

  toJSON() {
    return { fs: this.fs.toJSON(), cwd: this.cwd, history: this.history.slice(-200), sessions: this.sessions.slice(-10) };
  }

  prompt() {
    if (this.mode === 'claude') {
      const icons = { default: '', acceptEdits: '⏵⏵ ', plan: '⏸ ', auto: '⏵⏵ ', bypassPermissions: '⚠ ', dontAsk: '' };
      return `${icons[this.session.permissionMode] || ''}>`;
    }
    return `alumno@academy ${displayPath(this.cwd)} $`;
  }

  resolve(p) {
    return resolvePath(p, this.cwd);
  }

  /** Ejecuta una línea. Devuelve { lines: [{text, kind}], action? }. */
  run(input) {
    const text = String(input ?? '').trim();
    if (!text) return { lines: [] };
    this.history.push(text);
    if (this.mode === 'claude') return runSessionInput(this, text);
    return this.runShell(text);
  }

  /** Atajo de teclado Shift+Tab: cambia el modo de permisos dentro de una sesión. */
  shiftTab() {
    return cycleMode(this);
  }

  runShell(text, stdin = null) {
    const parsed = tokenize(text);
    if (parsed.error) return { lines: [line(`bash: error de sintaxis: ${parsed.error}`, 'err')] };
    const tokens = parsed.tokens;

    // Tubería: solo se admite "comando | claude -p ...".
    const pipeAt = tokens.findIndex(t => t.op === '|');
    if (pipeAt >= 0) {
      const left = tokens.slice(0, pipeAt);
      const right = tokens.slice(pipeAt + 1);
      if (right[0] !== 'claude') return { lines: [line('Este simulador solo admite tuberías hacia claude -p (p. ej. cat datos.csv | claude -p "resume").', 'err')] };
      const leftResult = this.exec(left.filter(t => typeof t === 'string'));
      const out = leftResult.lines.filter(l => l.kind !== 'err').map(l => l.text).join('\n');
      if (leftResult.lines.some(l => l.kind === 'err')) return leftResult;
      return runClaude(this, right.slice(1).filter(t => typeof t === 'string'), out);
    }

    // Redirección > y >>
    const redirAt = tokens.findIndex(t => t.op === '>' || t.op === '>>');
    if (redirAt >= 0) {
      const target = tokens[redirAt + 1];
      if (typeof target !== 'string') return { lines: [line('bash: error de sintaxis cerca de la redirección', 'err')] };
      const result = this.exec(tokens.slice(0, redirAt));
      const errors = result.lines.filter(l => l.kind === 'err');
      if (errors.length) return result;
      const path = this.resolve(target);
      const content = result.lines.map(l => l.text).join('\n') + '\n';
      const append = tokens[redirAt].op === '>>';
      const err = this.fs.write(path, (append ? (this.fs.read(path) || '') : '') + content);
      if (err) return { lines: [line(`bash: ${target}: ${err}`, 'err')] };
      return { lines: [] };
    }
    return this.exec(tokens);
  }

  exec(tokens) {
    const [cmd, ...args] = tokens;
    const flags = args.filter(a => /^-[a-zA-Z]+$/.test(a)).join('');
    const params = args.filter(a => !/^-[a-zA-Z]+$/.test(a));
    const err = msg => ({ lines: [line(msg, 'err')] });
    const ok = (...texts) => ({ lines: texts.flat().map(t => (typeof t === 'string' ? line(t) : t)) });

    switch (cmd) {
      case 'help':
        return ok([
          'Comandos del simulador (no se ejecuta nada real):',
          '  pwd · ls [-a] [-l] [ruta] · cd [ruta] · tree [ruta] · cat archivo',
          '  mkdir [-p] ruta · touch archivo · rm [-r] ruta · mv origen destino',
          '  echo "texto" [> archivo | >> archivo] · nano archivo (abre el editor)',
          '  git init | status | add | commit -m "msg" | log | diff',
          '  claude · claude "petición" · claude -p "petición" · claude -c · claude -r nombre',
          '  claude --permission-mode plan · claude mcp add|list|get|remove · claude doctor',
          '  history · clear',
        ]);
      case 'pwd':
        return ok(this.cwd);
      case 'whoami':
        return ok('alumno');
      case 'cd': {
        const target = this.resolve(params[0] ?? '~');
        if (!this.fs.exists(target)) return err(`cd: ${params[0]}: No existe el archivo o el directorio`);
        if (!this.fs.isDir(target)) return err(`cd: ${params[0]}: No es un directorio`);
        this.cwd = target;
        return { lines: [] };
      }
      case 'ls': {
        const target = this.resolve(params[0] ?? '.');
        if (!this.fs.exists(target)) return err(`ls: no se puede acceder a '${params[0]}': No existe el archivo o el directorio`);
        if (this.fs.isFile(target)) return ok(basename(target));
        const showHidden = flags.includes('a');
        const entries = this.fs.list(target).filter(e => showHidden || !e.name.startsWith('.'));
        if (!entries.length) return { lines: [] };
        if (flags.includes('l')) {
          return ok(entries.map(e => (e.type === 'dir'
            ? line(`drwxr-xr-x  ${e.name}/`, 'dir')
            : line(`-rw-r--r--  ${e.name}  (${(this.fs.read(e.path) || '').length} bytes)`))));
        }
        return { lines: [line(entries.map(e => (e.type === 'dir' ? `${e.name}/` : e.name)).join('   '), 'out')] };
      }
      case 'tree': {
        const root = this.resolve(params[0] ?? '.');
        if (!this.fs.isDir(root)) return err(`tree: ${params[0]}: no es un directorio`);
        const out = [displayPath(root)];
        const walk = (dir, prefix) => {
          const entries = this.fs.list(dir).filter(e => e.name !== '.git');
          entries.forEach((e, i) => {
            const last = i === entries.length - 1;
            out.push(`${prefix}${last ? '└── ' : '├── '}${e.name}${e.type === 'dir' ? '/' : ''}`);
            if (e.type === 'dir') walk(e.path, prefix + (last ? '    ' : '│   '));
          });
        };
        walk(root, '');
        return ok(out);
      }
      case 'cat': {
        if (!params.length) return err('cat: falta el nombre del archivo');
        const lines = [];
        for (const p of params) {
          const path = this.resolve(p);
          if (this.fs.isDir(path)) return err(`cat: ${p}: Es un directorio`);
          const content = this.fs.read(path);
          if (content === null) return err(`cat: ${p}: No existe el archivo o el directorio`);
          lines.push(...content.replace(/\n$/, '').split('\n').map(t => line(t)));
        }
        return { lines };
      }
      case 'mkdir': {
        if (!params.length) return err('mkdir: falta un operando');
        for (const p of params) {
          const e = this.fs.mkdir(this.resolve(p), { parents: flags.includes('p') });
          if (e) return err(`mkdir: no se puede crear '${p}': ${e}`);
        }
        return { lines: [] };
      }
      case 'touch': {
        if (!params.length) return err('touch: falta un operando');
        for (const p of params) {
          const path = this.resolve(p);
          if (!this.fs.exists(path)) {
            const e = this.fs.write(path, '');
            if (e) return err(`touch: no se puede crear '${p}': ${e}`);
          }
        }
        return { lines: [] };
      }
      case 'rm': {
        if (!params.length) return err('rm: falta un operando');
        for (const p of params) {
          const e = this.fs.remove(this.resolve(p), { recursive: flags.includes('r') });
          if (e) return err(`rm: no se puede borrar '${p}': ${e}`);
        }
        return { lines: [] };
      }
      case 'mv': {
        if (params.length !== 2) return err('mv: uso: mv origen destino');
        const e = this.fs.move(this.resolve(params[0]), this.resolve(params[1]));
        return e ? err(`mv: ${e}`) : { lines: [] };
      }
      case 'echo':
        return ok(args.join(' ').replace(/\\n/g, '\n').split('\n'));
      case 'nano':
      case 'vim':
      case 'edit': {
        if (!params[0]) return err(`${cmd}: indica el archivo que quieres editar`);
        const path = this.resolve(params[0]);
        if (this.fs.isDir(path)) return err(`${cmd}: ${params[0]} es un directorio`);
        if (!this.fs.isDir(dirname(path))) return err(`${cmd}: no existe el directorio ${displayPath(dirname(path))} (créalo con mkdir -p)`);
        return { lines: [], action: { type: 'edit', path } };
      }
      case 'history':
        return ok(this.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`));
      case 'clear':
        return { lines: [], action: { type: 'clear' } };
      case 'git':
        return this.git(params, args);
      case 'claude':
        return runClaude(this, args);
      case 'exit':
        return ok('Estás en el shell del simulador. Para salir de una sesión de Claude usa /exit.');
      default:
        if (cmd?.startsWith('/')) return err(`bash: ${cmd}: los comandos con / se escriben dentro de una sesión de Claude Code. Inicia una con: claude`);
        return err(`bash: ${cmd}: orden no encontrada en este simulador. Escribe help para ver los comandos disponibles.`);
    }
  }

  /** Guarda un archivo desde el editor visual. */
  saveFile(path, content) {
    return this.fs.write(path, content);
  }

  // ---------- Git simplificado ----------

  repoRoot(from = this.cwd) {
    let dir = from;
    while (true) {
      if (this.fs.isFile(`${dir === '/' ? '' : dir}/.git/state.json`)) return dir;
      if (dir === '/') return null;
      dir = dirname(dir);
    }
  }

  git(params, args) {
    const sub = params[0];
    const err = msg => ({ lines: [line(msg, 'err')] });
    const ok = texts => ({ lines: texts.map(t => (typeof t === 'string' ? line(t) : t)) });
    if (sub === 'init') {
      if (this.repoRoot()) return ok([`Repositorio Git ya inicializado en ${displayPath(this.repoRoot())}/.git/`]);
      this.fs.mkdir(`${this.cwd}/.git`, { parents: true });
      this.fs.write(`${this.cwd}/.git/state.json`, JSON.stringify({ commits: [], staged: {} }));
      return ok([`Inicializado repositorio Git vacío en ${displayPath(this.cwd)}/.git/`]);
    }
    const root = this.repoRoot();
    if (!root) return err('fatal: no es un repositorio git (ni ninguno de los directorios superiores). Usa git init.');
    const statePath = `${root}/.git/state.json`;
    const repo = JSON.parse(this.fs.read(statePath));
    const save = () => this.fs.write(statePath, JSON.stringify(repo));
    const prefix = root === '/' ? '/' : root + '/';
    const current = Object.fromEntries(this.fs.walk(root).filter(p => !p.startsWith(prefix + '.git/')).map(p => [p.slice(prefix.length), this.fs.read(p)]));
    const committed = repo.commits.at(-1)?.files || {};
    const changed = [...new Set([...Object.keys(current), ...Object.keys(committed)])]
      .filter(f => current[f] !== committed[f])
      .sort();

    switch (sub) {
      case 'status': {
        const staged = changed.filter(f => f in repo.staged && repo.staged[f] === (current[f] ?? null));
        const unstaged = changed.filter(f => !staged.includes(f));
        if (!changed.length) return ok([`En la rama main`, repo.commits.length ? 'nada para hacer commit, el árbol de trabajo está limpio' : 'No hay commits todavía; nada para hacer commit']);
        const label = f => (!(f in committed) ? 'nuevo:      ' : !(f in current) ? 'borrado:    ' : 'modificado: ');
        const out = ['En la rama main'];
        if (staged.length) out.push('Cambios a confirmar:', ...staged.map(f => line(`        ${label(f)}${f}`, 'ok')));
        if (unstaged.length) out.push('Cambios no preparados (usa git add):', ...unstaged.map(f => line(`        ${label(f)}${f}`, 'err')));
        return ok(out);
      }
      case 'add': {
        const targets = params.slice(1);
        if (!targets.length) return err('Nada especificado, nada agregado. ¿Querías decir git add . ?');
        const all = targets.some(t => t === '.' || t === '-A' || t === '--all') || args.includes('-A');
        let n = 0;
        for (const f of changed) {
          const abs = prefix + f;
          if (all || targets.some(t => { const p = this.resolve(t); return abs === p || abs.startsWith(p + '/'); })) {
            repo.staged[f] = current[f] ?? null;
            n++;
          }
        }
        save();
        return n ? { lines: [] } : err('No hay cambios que coincidan con esa ruta.');
      }
      case 'commit': {
        const mi = args.indexOf('-m');
        const msg = mi >= 0 ? args[mi + 1] : null;
        if (!msg) return err('Usa git commit -m "mensaje": un mensaje claro explica el porqué del cambio.');
        const stagedFiles = Object.keys(repo.staged);
        if (!stagedFiles.length) return err('nada agregado al commit (usa git add para preparar cambios)');
        const files = { ...committed };
        for (const f of stagedFiles) {
          if (repo.staged[f] === null) delete files[f];
          else files[f] = repo.staged[f];
        }
        const id = Math.abs([...msg + repo.commits.length].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(16).padStart(7, '0').slice(0, 7);
        repo.commits.push({ id, msg, files });
        repo.staged = {};
        save();
        return ok([`[main ${id}] ${msg}`, ` ${stagedFiles.length} archivo(s) cambiado(s)`]);
      }
      case 'log':
        if (!repo.commits.length) return err('fatal: la rama main no tiene commits todavía');
        return ok([...repo.commits].reverse().map(c => line(`${c.id} ${c.msg}`, 'out')));
      case 'diff': {
        const out = [];
        for (const f of changed.filter(f => !(f in repo.staged))) {
          out.push(line(`--- a/${f}`, 'dim'), line(`+++ b/${f}`, 'dim'));
          const before = (committed[f] ?? '').split('\n');
          const after = (current[f] ?? '').split('\n');
          before.filter(l => l && !after.includes(l)).forEach(l => out.push(line(`-${l}`, 'err')));
          after.filter(l => l && !before.includes(l)).forEach(l => out.push(line(`+${l}`, 'ok')));
        }
        return { lines: out };
      }
      default:
        return err(`git: '${sub ?? ''}' no está simulado. Disponibles: init, status, add, commit, log, diff.`);
    }
  }
}
