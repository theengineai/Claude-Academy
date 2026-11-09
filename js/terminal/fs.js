// Sistema de archivos ficticio en memoria. Nunca toca archivos reales.

export const HOME = '/home/alumno';

export function resolvePath(input, cwd = HOME) {
  let p = String(input ?? '').trim();
  if (p === '' ) p = '.';
  if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
  const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export function dirname(path) {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

export function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Muestra una ruta abreviando el home como ~. */
export function displayPath(path) {
  if (path === HOME) return '~';
  return path.startsWith(HOME + '/') ? '~' + path.slice(HOME.length) : path;
}

export class VirtualFS {
  /** entries: { ruta: contenido } — una ruta que termina en "/" (o contenido null) crea un directorio. */
  constructor(entries = {}) {
    this.nodes = new Map([['/', { type: 'dir' }]]);
    for (const [rawPath, content] of Object.entries(entries)) {
      const path = resolvePath(rawPath, '/');
      if (content === null || rawPath.endsWith('/')) this.mkdir(path, { parents: true });
      else {
        this.mkdir(dirname(path), { parents: true });
        this.write(path, content);
      }
    }
  }

  exists(p) { return this.nodes.has(p); }
  isDir(p) { return this.nodes.get(p)?.type === 'dir'; }
  isFile(p) { return this.nodes.get(p)?.type === 'file'; }
  read(p) { return this.isFile(p) ? this.nodes.get(p).content : null; }

  /** Escribe un archivo. Devuelve un mensaje de error o null. */
  write(p, content) {
    if (this.isDir(p)) return 'es un directorio';
    if (!this.isDir(dirname(p))) return 'no existe el directorio padre';
    this.nodes.set(p, { type: 'file', content: String(content) });
    return null;
  }

  mkdir(p, { parents = false } = {}) {
    if (this.isFile(p)) return 'ya existe un archivo con ese nombre';
    if (this.isDir(p)) return parents ? null : 'el directorio ya existe';
    if (!this.isDir(dirname(p))) {
      if (!parents) return 'no existe el directorio padre (usa -p)';
      const err = this.mkdir(dirname(p), { parents: true });
      if (err) return err;
    }
    this.nodes.set(p, { type: 'dir' });
    return null;
  }

  /** Hijos directos de un directorio: [{ name, type }]. */
  list(dir) {
    const prefix = dir === '/' ? '/' : dir + '/';
    const out = [];
    for (const [path, node] of this.nodes) {
      if (path !== dir && path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
        out.push({ name: path.slice(prefix.length), type: node.type, path });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Todas las rutas de archivo bajo un directorio (recursivo). */
  walk(dir) {
    const prefix = dir === '/' ? '/' : dir + '/';
    return [...this.nodes.entries()]
      .filter(([path, node]) => node.type === 'file' && path.startsWith(prefix))
      .map(([path]) => path)
      .sort();
  }

  remove(p, { recursive = false } = {}) {
    if (!this.exists(p) || p === '/') return 'no existe';
    if (this.isDir(p)) {
      const children = this.list(p);
      if (children.length && !recursive) return 'es un directorio (usa -r)';
      for (const path of [...this.nodes.keys()]) if (path.startsWith(p + '/')) this.nodes.delete(path);
    }
    this.nodes.delete(p);
    return null;
  }

  move(from, to) {
    if (!this.exists(from)) return 'no existe el origen';
    if (this.isDir(to)) to = `${to}/${basename(from)}`;
    if (!this.isDir(dirname(to))) return 'no existe el directorio de destino';
    for (const [path, node] of [...this.nodes.entries()]) {
      if (path === from || path.startsWith(from + '/')) {
        this.nodes.delete(path);
        this.nodes.set(to + path.slice(from.length), node);
      }
    }
    return null;
  }

  toJSON() {
    return [...this.nodes.entries()];
  }

  static fromJSON(data) {
    const fs = new VirtualFS();
    fs.nodes = new Map(data);
    return fs;
  }
}
