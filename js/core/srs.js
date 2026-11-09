// Repaso espaciado por concepto (sistema de cajas de Leitner) y puntuación de dominio.
import { addDays, localDay } from './util.js';

/** Días hasta el siguiente repaso según la caja (0 = repasar hoy). */
export const INTERVALS = [0, 1, 3, 7, 14, 30];

/**
 * Registra una respuesta sobre un concepto.
 * - Dominio (score 0..1): media móvil; la primera respuesta correcta vale 0,7.
 * - Caja: un acierto sube una caja; un fallo devuelve a la caja 0 (repasar hoy).
 */
export function recordConcept(state, conceptId, correct, today = localDay()) {
  if (!conceptId) return;
  const prev = state.concepts[conceptId];
  const c = prev ? { ...prev } : { score: 0, box: 0, due: today, seen: 0, correct: 0 };
  c.score = prev ? c.score * 0.6 + (correct ? 0.4 : 0) : (correct ? 0.7 : 0);
  c.score = Math.round(c.score * 1000) / 1000;
  c.box = correct ? Math.min(INTERVALS.length - 1, (prev ? c.box : 0) + 1) : 0;
  c.due = addDays(today, INTERVALS[c.box]);
  c.seen += 1;
  if (correct) c.correct += 1;
  state.concepts[conceptId] = c;
}

/** Conceptos vistos cuyo repaso vence hoy o antes, ordenados por debilidad. */
export function dueConcepts(state, today = localDay()) {
  return Object.entries(state.concepts)
    .filter(([, c]) => c.due <= today)
    .sort((a, b) => a[1].box - b[1].box || a[1].score - b[1].score)
    .map(([id]) => id);
}

/**
 * Construye una sesión de repaso: primero ejercicios fallados, después
 * ejercicios de conceptos vencidos. Solo usa ejercicios ya vistos (lecciones completadas).
 */
export function buildReviewQueue(state, course, { today = localDay(), size = 8 } = {}) {
  const seenSources = new Set(Object.keys(state.lessons));
  const eligible = Object.values(course.exercises)
    .filter(({ exercise, source }) => source.kind === 'lesson' && seenSources.has(source.id) && exercise.type !== 'terminal');

  const queue = [];
  const add = ex => { if (queue.length < size && !queue.includes(ex)) queue.push(ex); };

  const mistakes = Object.entries(state.mistakes).sort((a, b) => b[1].count - a[1].count).map(([id]) => id);
  for (const id of mistakes) {
    const entry = course.exercises[id];
    if (entry && entry.exercise.type !== 'terminal') add(entry.exercise);
  }
  for (const conceptId of dueConcepts(state, today)) {
    const candidate = eligible.find(({ exercise }) => exercise.concept === conceptId && !queue.includes(exercise));
    if (candidate) add(candidate.exercise);
  }
  return queue;
}
