// Reglas de progreso: XP, niveles, racha, desbloqueos, dominio y recomendaciones.
// Todo se calcula a partir del estado y del temario; no hay "progreso por abrir pantallas".
import { localDay, addDays } from './util.js';
import { recordConcept, dueConcepts } from './srs.js';

export const PASS_EXAM = 0.75;
export const XP = {
  lessonBase: 10,      // por completar una lección
  lessonAccuracy: 20,  // proporcional a aciertos a la primera
  examPass: 60,
  examPerfect: 20,
  reviewCorrect: 3,
  labChallenge: 15,
};

// ---------- Niveles ----------

/** XP acumulada necesaria para alcanzar el rango n (rango 1 = 0 XP). */
export function xpForRank(n) {
  return 30 * n * (n - 1);
}

export function rankInfo(xp) {
  let rank = 1;
  while (xp >= xpForRank(rank + 1)) rank++;
  const from = xpForRank(rank);
  const to = xpForRank(rank + 1);
  return { rank, from, to, progress: (xp - from) / (to - from) };
}

/** Nivel de dominio de Claude Code (L2→L5), basado en evaluaciones superadas. */
export function masteryLevel(state, course) {
  const passed = id => Boolean(state.exams[id]?.passed);
  const [m1, m2, m3, m4, m5, m6] = course.modules.map(m => m.id);
  const finalDone = Boolean(state.missions[finalMission(course)?.id]?.completedAt);
  if ([m1, m2, m3, m4, m5, m6].every(passed) && finalDone) return 'L5';
  if ([m1, m2, m3, m4].every(passed)) return 'L4';
  if ([m1, m2].every(passed)) return 'L3';
  return 'L2';
}

export function finalMission(course) {
  return course.missions.find(m => m.final);
}

// ---------- Racha y objetivo diario ----------

export function addXp(state, amount, today = localDay()) {
  if (amount <= 0) return 0;
  state.xp += amount;
  state.daily[today] = (state.daily[today] || 0) + amount;
  return amount;
}

/** Marca actividad del día aunque no haya XP (p. ej. repetir una lección ya perfecta). */
export function touchDay(state, today = localDay()) {
  if (!(today in state.daily)) state.daily[today] = 0;
}

/** Días consecutivos con actividad. Si hoy aún no hay actividad, la racha de ayer sigue viva. */
export function streak(state, today = localDay()) {
  let day = today;
  if (!(day in state.daily)) day = addDays(day, -1);
  let n = 0;
  while (day in state.daily) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(state) {
  const days = Object.keys(state.daily).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function todayXp(state, today = localDay()) {
  return state.daily[today] || 0;
}

// ---------- Desbloqueos ----------

export function isModuleUnlocked(state, course, moduleId) {
  const idx = course.modules.findIndex(m => m.id === moduleId);
  if (idx <= 0) return idx === 0;
  return Boolean(state.exams[course.modules[idx - 1].id]?.passed);
}

export function isLessonUnlocked(state, course, lessonId) {
  const lesson = course.lessonById[lessonId];
  if (!lesson || !isModuleUnlocked(state, course, lesson.moduleId)) return false;
  const mod = course.moduleById[lesson.moduleId];
  const i = mod.lessons.findIndex(l => l.id === lessonId);
  return i === 0 || Boolean(state.lessons[mod.lessons[i - 1].id]?.completedAt);
}

export function isExamUnlocked(state, course, moduleId) {
  const mod = course.moduleById[moduleId];
  return isModuleUnlocked(state, course, moduleId) && mod.lessons.every(l => state.lessons[l.id]?.completedAt);
}

export function isMissionUnlocked(state, course, missionId) {
  const m = course.missionById[missionId];
  if (!m) return false;
  if (m.final) return course.modules.every(mod => state.exams[mod.id]?.passed);
  return isModuleUnlocked(state, course, m.module) && (m.requires || []).every(id => state.lessons[id]?.completedAt);
}

export function isLabUnlocked(state, course, challenge) {
  return (challenge.requires || []).every(id => state.lessons[id]?.completedAt);
}

// ---------- Registro de respuestas ----------

/** Registra una respuesta (primer intento cuenta para dominio y repaso). */
export function recordAnswer(state, exercise, correct, today = localDay()) {
  state.stats.answers += 1;
  if (correct) state.stats.correct += 1;
  recordConcept(state, exercise.concept, correct, today);
  if (!correct) {
    const prev = state.mistakes[exercise.id];
    state.mistakes[exercise.id] = { count: (prev?.count || 0) + 1, last: today };
  }
}

/** En repaso, acertar elimina el error registrado. */
export function clearMistake(state, exerciseId) {
  delete state.mistakes[exerciseId];
}

// ---------- Finalización de actividades ----------

function stars(accuracy) {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.7) return 2;
  return 1;
}

/** XP de una lección según precisión a la primera. Repetir solo suma la mejora. */
export function lessonXp(accuracy) {
  return XP.lessonBase + Math.round(XP.lessonAccuracy * accuracy);
}

export function completeLesson(state, lessonId, accuracy, today = localDay()) {
  const prev = state.lessons[lessonId];
  const earned = lessonXp(accuracy);
  const gained = Math.max(0, earned - (prev?.xpEarned || 0));
  state.lessons[lessonId] = {
    best: Math.max(prev?.best || 0, accuracy),
    stars: Math.max(prev?.stars || 0, stars(accuracy)),
    xpEarned: Math.max(prev?.xpEarned || 0, earned),
    completedAt: prev?.completedAt || new Date().toISOString(),
    attempts: (prev?.attempts || 0) + 1,
  };
  if (accuracy === 1) state.stats.perfect += 1;
  touchDay(state, today);
  return { gained: addXp(state, gained, today), stars: stars(accuracy), firstTime: !prev };
}

export function missionXp(mission, accuracy) {
  return Math.round(mission.xp * (0.5 + 0.5 * accuracy));
}

export function completeMission(state, mission, accuracy, today = localDay()) {
  const prev = state.missions[mission.id];
  const earned = missionXp(mission, accuracy);
  const gained = Math.max(0, earned - (prev?.xpEarned || 0));
  state.missions[mission.id] = {
    best: Math.max(prev?.best || 0, accuracy),
    xpEarned: Math.max(prev?.xpEarned || 0, earned),
    completedAt: prev?.completedAt || new Date().toISOString(),
    attempts: (prev?.attempts || 0) + 1,
  };
  touchDay(state, today);
  return { gained: addXp(state, gained, today), firstTime: !prev };
}

export function examXp(score) {
  if (score < PASS_EXAM) return 0;
  return XP.examPass + (score === 1 ? XP.examPerfect : 0);
}

export function completeExam(state, moduleId, score, today = localDay()) {
  const prev = state.exams[moduleId];
  const passed = score >= PASS_EXAM;
  const earned = examXp(score);
  const gained = Math.max(0, earned - (prev?.xpEarned || 0));
  state.exams[moduleId] = {
    best: Math.max(prev?.best || 0, score),
    passed: Boolean(prev?.passed || passed),
    xpEarned: Math.max(prev?.xpEarned || 0, earned),
    attempts: (prev?.attempts || 0) + 1,
  };
  touchDay(state, today);
  return { gained: addXp(state, gained, today), passed };
}

export function completeLab(state, challengeId, today = localDay()) {
  const first = !state.lab[challengeId];
  if (first) state.lab[challengeId] = { completedAt: new Date().toISOString() };
  touchDay(state, today);
  return { gained: first ? addXp(state, XP.labChallenge, today) : 0, firstTime: first };
}

export function rewardReview(state, correctCount, today = localDay()) {
  state.stats.reviews += 1;
  touchDay(state, today);
  return addXp(state, correctCount * XP.reviewCorrect, today);
}

/** XP verificable a partir de los registros (se usa al importar copias). */
export function recomputeXp(state) {
  const sum = obj => Object.values(obj || {}).reduce((acc, v) => acc + (v.xpEarned || 0), 0);
  const lab = Object.keys(state.lab || {}).length * XP.labChallenge;
  const daily = Object.values(state.daily || {}).reduce((a, b) => a + b, 0);
  const verified = sum(state.lessons) + sum(state.missions) + sum(state.exams) + lab;
  // El repaso no deja registro por actividad: se acepta la parte de XP diaria que lo explica, con límite.
  const reviewXp = Math.max(0, Math.min(daily - verified, (state.stats?.reviews || 0) * 8 * XP.reviewCorrect));
  return verified + reviewXp;
}

// ---------- Dominio por competencia ----------

/** Conceptos que trabaja cada competencia. */
export function conceptsByCompetency(course) {
  const map = Object.fromEntries(course.competencies.map(c => [c.id, []]));
  for (const c of Object.values(course.concepts)) map[c.competency]?.push(c.id);
  return map;
}

/** Porcentaje 0..100 de dominio real: media del dominio de los conceptos (no vistos = 0). */
export function competencyMastery(state, course) {
  const byComp = conceptsByCompetency(course);
  return course.competencies.map(comp => {
    const ids = byComp[comp.id];
    const total = ids.reduce((acc, id) => acc + (state.concepts[id]?.score || 0), 0);
    const seen = ids.filter(id => state.concepts[id]).length;
    return { ...comp, mastery: ids.length ? Math.round((total / ids.length) * 100) : 0, seen, total: ids.length };
  });
}

export function overallMastery(state, course) {
  const list = competencyMastery(state, course);
  return Math.round(list.reduce((a, c) => a + c.mastery, 0) / list.length);
}

/** Avance de un módulo: lecciones + misiones + examen completados. */
export function moduleProgress(state, course, moduleId) {
  const mod = course.moduleById[moduleId];
  const missions = course.missions.filter(m => m.module === moduleId && !m.final);
  const items = [
    ...mod.lessons.map(l => Boolean(state.lessons[l.id]?.completedAt)),
    ...missions.map(m => Boolean(state.missions[m.id]?.completedAt)),
    Boolean(state.exams[moduleId]?.passed),
  ];
  return { done: items.filter(Boolean).length, total: items.length };
}

// ---------- Siguiente paso y recomendaciones ----------

/** Siguiente actividad del camino principal. */
export function nextStep(state, course) {
  for (const mod of course.modules) {
    if (!isModuleUnlocked(state, course, mod.id)) break;
    const lesson = mod.lessons.find(l => !state.lessons[l.id]?.completedAt);
    if (lesson) return { kind: 'lesson', id: lesson.id, title: lesson.title, module: mod, route: `#/lesson/${lesson.id}` };
    if (!state.exams[mod.id]?.passed) return { kind: 'exam', id: mod.id, title: `Evaluación: ${mod.title}`, module: mod, route: `#/exam/${mod.id}` };
  }
  const final = finalMission(course);
  if (final && !state.missions[final.id]?.completedAt && isMissionUnlocked(state, course, final.id)) {
    return { kind: 'mission', id: final.id, title: final.title, route: `#/mission/${final.id}` };
  }
  return null;
}

export function recommendations(state, course, today = localDay()) {
  const recs = [];
  const due = dueConcepts(state, today).length;
  const mistakes = Object.keys(state.mistakes).length;
  if (due + mistakes >= 3) {
    recs.push({ kind: 'review', title: 'Repaso inteligente', why: `${due} conceptos para repasar hoy y ${mistakes} errores pendientes.`, route: '#/review' });
  }
  const next = nextStep(state, course);
  if (next) recs.push({ kind: next.kind, title: next.title, why: next.kind === 'exam' ? 'Superarla desbloquea el siguiente módulo.' : 'Es la siguiente pieza de tu ruta.', route: next.route });

  const mission = course.missions.find(m => !m.final && !state.missions[m.id]?.completedAt && isMissionUnlocked(state, course, m.id));
  if (mission) recs.push({ kind: 'mission', title: mission.title, why: 'Aplica lo aprendido en un caso práctico.', route: `#/mission/${mission.id}` });

  const weakest = competencyMastery(state, course).filter(c => c.seen > 0 && c.mastery < 60).sort((a, b) => a.mastery - b.mastery)[0];
  if (weakest) {
    const weakConcept = Object.values(course.concepts)
      .filter(c => c.competency === weakest.id && state.concepts[c.id])
      .sort((a, b) => state.concepts[a.id].score - state.concepts[b.id].score)[0];
    const lesson = weakConcept && course.lessons.find(l => l.exercises.some(ex => ex.concept === weakConcept.id));
    if (lesson) recs.push({ kind: 'lesson', title: `Refuerza: ${lesson.title}`, why: `Tu dominio en ${weakest.title} es del ${weakest.mastery}%.`, route: `#/lesson/${lesson.id}` });
  }
  return recs.slice(0, 3);
}
