// Analizadores pequeños usados por el simulador: tokens de shell, frontmatter YAML y JSON tolerante.

/** Divide una línea en tokens respetando comillas. Los operadores |, > y >> se devuelven como { op }. */
export function tokenize(line) {
  const tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const push = () => { if (has) { tokens.push(cur); cur = ''; has = false; } };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && (next === '"' || next === '\\')) { cur += next; i++; }
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === '\\' && next !== undefined) { cur += next; i++; has = true; continue; }
    if (/\s/.test(ch)) { push(); continue; }
    if (ch === '|') { push(); tokens.push({ op: '|' }); continue; }
    if (ch === '>') {
      push();
      if (next === '>') { tokens.push({ op: '>>' }); i++; } else tokens.push({ op: '>' });
      continue;
    }
    cur += ch;
    has = true;
  }
  if (quote) return { error: 'comillas sin cerrar' };
  push();
  return { tokens };
}

/** Lee el frontmatter YAML sencillo (clave: valor) de un archivo Markdown. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text ?? ''));
  if (!m) return { data: null, body: String(text ?? '') };
  const data = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      let value = kv[2].trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      data[kv[1]] = value;
      lastKey = kv[1];
    } else if (lastKey && /^\s+-\s+/.test(line)) {
      const item = line.replace(/^\s+-\s+/, '').trim();
      data[lastKey] = Array.isArray(data[lastKey]) ? [...data[lastKey], item] : (data[lastKey] ? [data[lastKey], item] : [item]);
    }
  }
  return { data, body: String(text).slice(m[0].length) };
}

export function parseJson(text) {
  try { return { value: JSON.parse(text) }; } catch (e) { return { error: e.message }; }
}
