// Asistente de dudas SIN IA: busca en el glosario preparado (content/glossary.json).
// Puro y testeable: no toca el DOM. Normaliza, tolera erratas y devuelve el nivel de confianza.

const STOP = new Set(('que qué es son la el los las un una unos unas de del en y o a al como cómo para por cual cuál cuales ' +
  'significa significan sirve sirven hago hacer se me mi mis lo le con sin esto esta este eso ese hay puedo puede ' +
  'quiero necesito explicame explica dime sobre mas muy ya no si porque cuando donde cuanto tengo tiene tienen ser hace hacen usar uso').split(/\s+/).map(strip));

function strip(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function stem(w) {
  if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Texto en minúsculas, sin acentos ni signos, con palabras en forma simple. */
export function tokens(text) {
  return (strip(text).match(/[a-z0-9ñ]+/g) || []).map(stem);
}
const content = toks => toks.filter(t => !STOP.has(t));

export function lev(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

function keysOf(entry) {
  return [entry.term, ...(entry.aliases || [])].map(raw => {
    const toks = tokens(raw);
    return { raw: strip(raw).trim(), toks, phrase: ` ${toks.join(' ')} `, words: content(toks) };
  }).filter(k => k.toks.length || k.raw);
}

function scoreEntry(entry, q) {
  let best = 0;
  const qPhrase = ` ${q.toks.join(' ')} `;
  for (const k of keysOf(entry)) {
    let s = 0;
    if (!k.toks.length) {
      // Solo símbolos (|, @, ~): coincide si aparecen tal cual.
      if (k.raw && q.raw.includes(k.raw)) s = 90;
    } else if (q.toks.join(' ') === k.toks.join(' ')) {
      s = 200;
    } else if (k.toks.length === 1 && k.toks[0].length < 2) {
      s = 0; // una letra suelta (-p, -c) solo vale si es la consulta completa
    } else if (qPhrase.includes(k.phrase)) {
      s = 100 + k.toks.length * 6 + Math.min(k.phrase.length, 24) / 4;
    } else if (k.words.length >= 2 && k.words.every(w => q.words.includes(w))) {
      s = 84 + k.words.length;
    } else if (k.words.length === 1 && k.words[0].length >= 4) {
      for (const w of q.words) {
        if (w.length < 4) continue;
        const d = lev(w, k.words[0]);
        const lim = k.words[0].length >= 8 ? 2 : 1;
        if (d <= lim) s = Math.max(s, 72 - d * 4);
      }
    }
    best = Math.max(best, s);
  }
  if (best < 50 && q.words.length >= 1) {
    // Coincidencia parcial: palabras de la pregunta presentes en el título o la definición.
    const hay = new Set(content([...tokens(entry.term), ...(entry.aliases || []).flatMap(tokens)]));
    const hit = q.words.filter(w => hay.has(w)).length;
    if (hit >= 2) best = Math.max(best, 52 + hit);
    else if (hit === 1 && q.words.length === 1 && q.words[0].length >= 5) best = Math.max(best, 50);
  }
  const exactTerm = best && strip(entry.term).trim() === q.raw.trim() ? 5 : 0; // desempata «.claude/» frente a «claude»
  return best + exactTerm + (entry.popular && best ? 0.5 : 0);
}

/**
 * Busca una duda. Devuelve { confidence: 'confident'|'likely'|'maybe'|'none', results: [{ entry, score }] }.
 */
export function ask(entries, text) {
  const q = { raw: strip(text), toks: tokens(text) };
  q.words = content(q.toks);
  if (!q.toks.length && !q.raw.trim()) return { confidence: 'none', results: [] };
  const scored = entries.map(entry => ({ entry, score: scoreEntry(entry, q) }))
    .filter(r => r.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const top = scored[0]?.score || 0;
  const confidence = top >= 100 ? 'confident' : top >= 80 ? 'likely' : top >= 50 ? 'maybe' : 'none';
  return { confidence, results: scored };
}

/** Sugerencias según la lección abierta; si no hay, las dudas más populares. */
export function suggestions(entries, lessonId = null, limit = 6) {
  const byLesson = lessonId ? entries.filter(e => (e.lessons || []).includes(lessonId)) : [];
  const popular = entries.filter(e => e.popular);
  const seen = new Set();
  return [...byLesson, ...popular].filter(e => !seen.has(e.id) && seen.add(e.id)).slice(0, limit);
}

export const byId = (entries, id) => entries.find(e => e.id === id) || null;
