// Indexa el temario (archivos JSON de /content) para consultarlo de forma rápida.
// No depende del DOM: se usa igual en el navegador y en los tests.

export const CONTENT_FILES = {
  course: 'content/course.json',
  missions: 'content/missions.json',
  lab: 'content/lab.json',
  modules: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(id => `content/modules/${id}.json`),
};

export const EXERCISE_TYPES = ['choice', 'multi', 'order', 'match', 'fill', 'spot', 'editor', 'terminal'];

/** Huella de los pasos de una actividad: si cambia el contenido, un avance guardado deja de ser válido. */
export function stepsSignature(steps) {
  return steps.map(s => s.id || s.title || s.type).join('|');
}

export function isExercise(step) {
  return EXERCISE_TYPES.includes(step.type);
}

export function buildCourse(raw) {
  const { course, modules, missions, lab } = raw;
  const concepts = {};
  for (const c of course.concepts) concepts[c.id] = c;

  const lessons = [];
  const lessonById = {};
  const exercises = {};
  const register = (ex, source) => { exercises[ex.id] = { exercise: ex, source }; };

  const mods = modules.map((m, mi) => {
    const mod = { ...m, index: mi + 1 };
    mod.lessons = m.lessons.map((l, li) => {
      const lesson = { ...l, moduleId: m.id, moduleIndex: mi + 1, index: li + 1 };
      lesson.exercises = l.steps.filter(isExercise);
      lesson.exercises.forEach(ex => register(ex, { kind: 'lesson', id: l.id, moduleId: m.id }));
      lessons.push(lesson);
      lessonById[l.id] = lesson;
      return lesson;
    });
    (m.exam.extra || []).forEach(ex => register(ex, { kind: 'exam', id: m.id, moduleId: m.id }));
    return mod;
  });
  const moduleById = Object.fromEntries(mods.map(m => [m.id, m]));

  const missionList = missions.map((ms, i) => {
    ms.steps.forEach(ex => register(ex, { kind: 'mission', id: ms.id, moduleId: ms.module }));
    return { ...ms, index: i + 1 };
  });
  const missionById = Object.fromEntries(missionList.map(m => [m.id, m]));

  return {
    title: course.title,
    competencies: course.competencies,
    levels: course.levels,
    concepts,
    modules: mods,
    moduleById,
    lessons,
    lessonById,
    missions: missionList,
    missionById,
    lab,
    exercises,
  };
}

/** Banco de preguntas del examen de un módulo: ejercicios de sus lecciones + preguntas exclusivas. */
export function examPool(course, moduleId) {
  const mod = course.moduleById[moduleId];
  const fromLessons = mod.lessons.flatMap(l => l.exercises).filter(ex => ex.type !== 'terminal' && ex.type !== 'editor');
  return [...(mod.exam.extra || []), ...fromLessons];
}
