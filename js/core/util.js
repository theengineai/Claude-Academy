// Utilidades puras (sin DOM): se usan en el navegador y en los tests de Node.

/** Normaliza texto para comparar respuestas escritas: minúsculas, sin tildes,
 *  sin comillas envolventes y con espacios colapsados. */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[`"'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fecha local en formato AAAA-MM-DD (la racha usa el día del dispositivo). */
export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Suma días a una fecha AAAA-MM-DD y devuelve otra fecha AAAA-MM-DD. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return localDay(date);
}

/** Diferencia en días entre dos fechas AAAA-MM-DD (b - a). */
export function daysBetween(a, b) {
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

/** Generador pseudoaleatorio determinista (mulberry32) para barajar de forma reproducible en tests. */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Baraja una copia del array. Garantiza un orden distinto del original cuando hay 2+ elementos. */
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  if (copy.length < 2) return copy;
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    if (copy.some((item, i) => item !== items[i])) return copy;
  }
  // Si el azar devolvió siempre el orden original, rotamos una posición.
  return [...items.slice(1), items[0]];
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Lee una ruta con puntos dentro de un objeto: get(obj, 'a.b.c'). */
export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('es-ES').format(n);
}
