// Estado persistente del alumno. Solo vive en el dispositivo (localStorage).
// Cambia STATE_VERSION y añade una migración si modificas la forma del estado.

export const STORAGE_KEY = 'cca.state';
export const STATE_VERSION = 1;

export function defaultState(now = new Date()) {
  return {
    version: STATE_VERSION,
    createdAt: now.toISOString(),
    xp: 0,
    daily: {},          // { 'AAAA-MM-DD': xp ganada ese día }
    lessons: {},        // { lessonId: { best, stars, xpEarned, completedAt, attempts } }
    missions: {},       // { missionId: { best, xpEarned, completedAt, attempts } }
    exams: {},          // { moduleId: { best, passed, xpEarned, attempts } }
    lab: {},            // { challengeId: { completedAt } }
    concepts: {},       // { conceptId: { score, box, due, seen, correct } }
    mistakes: {},       // { exerciseId: { count, last } }
    achievements: {},   // { achievementId: fechaISO }
    stats: { answers: 0, correct: 0, commands: 0, reviews: 0, perfect: 0 },
    settings: { dailyGoal: 30, reducedMotion: false, theme: 'auto' },
    sandbox: null,      // sistema de archivos del laboratorio libre (serializado)
    inProgress: {},     // { 'lesson:l1-2': avance guardado de una actividad a medias }
    lastRoute: null,
  };
}

const MIGRATIONS = {
  // Ejemplo para futuras versiones:
  // 2: state => ({ ...state, nuevoCampo: [] }),
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Comprueba la forma mínima de un estado. Devuelve una lista de errores (vacía si es válido). */
export function validateState(s) {
  const errors = [];
  if (!isPlainObject(s)) return ['El contenido no es un objeto JSON.'];
  if (!Number.isInteger(s.version) || s.version < 1 || s.version > STATE_VERSION) errors.push('Versión de progreso desconocida.');
  if (!Number.isFinite(s.xp) || s.xp < 0) errors.push('XP no válida.');
  for (const key of ['daily', 'lessons', 'missions', 'exams', 'concepts', 'mistakes', 'achievements']) {
    if (!isPlainObject(s[key])) errors.push(`Falta la sección "${key}".`);
  }
  return errors;
}

/** Aplica migraciones y completa campos nuevos con valores por defecto. */
export function migrate(raw) {
  let s = { ...raw };
  for (let v = (s.version || 1) + 1; v <= STATE_VERSION; v++) {
    if (MIGRATIONS[v]) s = MIGRATIONS[v](s);
    s.version = v;
  }
  const base = defaultState();
  return {
    ...base,
    ...s,
    stats: { ...base.stats, ...(s.stats || {}) },
    settings: { ...base.settings, ...(s.settings || {}) },
    lab: isPlainObject(s.lab) ? s.lab : {},
    inProgress: isPlainObject(s.inProgress) ? s.inProgress : {},
  };
}

export function loadState(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return defaultState();
    const parsed = JSON.parse(text);
    if (validateState(parsed).length) return defaultState();
    return migrate(parsed);
  } catch {
    return defaultState();
  }
}

/** Guarda el estado. Devuelve false si el almacenamiento no está disponible (p. ej. modo privado). */
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state) {
  return JSON.stringify({ app: 'claude-code-academy', exportedAt: new Date().toISOString(), state }, null, 2);
}

/** Importa una copia. Recalcula la XP a partir de los logros reales para no aceptar valores inventados. */
export function importState(text, recomputeXp) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ['El archivo no es JSON válido.'] }; }
  const candidate = parsed && parsed.app === 'claude-code-academy' ? parsed.state : parsed;
  const errors = validateState(candidate);
  if (errors.length) return { ok: false, errors };
  const state = migrate(candidate);
  if (recomputeXp) state.xp = recomputeXp(state);
  return { ok: true, state };
}
