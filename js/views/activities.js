// Apertura de lecciones, evaluaciones y sesiones de repaso.
import { runSession } from './session.js';
import { examPool } from '../core/course.js';
import { shuffle } from '../core/util.js';
import { buildReviewQueue } from '../core/srs.js';
import {
  isLessonUnlocked, isExamUnlocked, completeLesson, completeExam, rewardReview, nextStep, PASS_EXAM,
} from '../core/progress.js';

export function openLesson(ctx, lessonId) {
  const { course, state } = ctx;
  const lesson = course.lessonById[lessonId];
  if (!lesson || !isLessonUnlocked(state, course, lessonId)) return false;
  runSession(ctx, {
    kind: 'lesson',
    title: lesson.title,
    steps: lesson.steps,
    exitRoute: '#/academy',
    onFinish: ({ accuracy }) => {
      const r = completeLesson(state, lesson.id, accuracy);
      const achievements = ctx.commit();
      const next = nextStep(state, course);
      return {
        title: r.firstTime ? '¡Lección completada!' : 'Lección repasada',
        subtitle: lesson.title,
        gained: r.gained,
        stars: r.stars,
        achievements,
        note: accuracy < 0.7 ? 'Los conceptos que has fallado aparecerán en tu repaso inteligente.' : null,
        retryRoute: `#/lesson/${lesson.id}`,
        nextRoute: next?.route || '#/academy',
        nextLabel: next ? 'Siguiente' : 'Volver a la academia',
      };
    },
  });
}

export function openExam(ctx, moduleId) {
  const { course, state } = ctx;
  const mod = course.moduleById[moduleId];
  if (!mod || !isExamUnlocked(state, course, moduleId)) return false;
  const size = mod.exam.size || 8;
  // Las preguntas exclusivas del examen siempre entran; el resto se sortea de las lecciones.
  const extra = mod.exam.extra || [];
  const rest = shuffle(examPool(course, moduleId).filter(ex => !extra.includes(ex)));
  const questions = shuffle([...extra, ...rest].slice(0, size));
  const intro = {
    type: 'card', kicker: `Módulo ${mod.index}`, title: `Evaluación: ${mod.title}`,
    blocks: [{ type: 'text', body: `${questions.length} preguntas. Necesitas un **${Math.round(PASS_EXAM * 100)}%** para superarla${mod.index < course.modules.length ? ' y desbloquear el siguiente módulo' : ''}.\n\nCada respuesta cuenta a la primera: no hay segundas oportunidades dentro de la evaluación, pero puedes repetirla cuando quieras.` }],
  };
  runSession(ctx, {
    kind: 'exam',
    title: `Evaluación ${mod.title}`,
    steps: [intro, ...questions],
    requeueWrong: false,
    retryInPlace: false,
    exitRoute: '#/academy',
    onFinish: ({ accuracy, correct, total }) => {
      const r = completeExam(state, mod.id, accuracy);
      const achievements = ctx.commit();
      const nextMod = course.modules[mod.index];
      return {
        passed: r.passed,
        icon: r.passed ? 'trophy' : 'refresh',
        title: r.passed ? 'Evaluación superada' : 'Casi lo tienes',
        subtitle: `${correct} de ${total} correctas`,
        gained: r.gained,
        achievements,
        note: r.passed
          ? (nextMod ? `Has desbloqueado el módulo ${nextMod.index}: ${nextMod.title}.` : 'Has superado todas las evaluaciones. El proyecto final te espera en Misiones.')
          : `Necesitas un ${Math.round(PASS_EXAM * 100)}%. Repasa los conceptos fallados y vuelve a intentarlo.`,
        retryRoute: `#/exam/${mod.id}`,
        nextRoute: r.passed ? '#/academy' : '#/review',
        nextLabel: r.passed ? 'Continuar' : 'Ir al repaso',
      };
    },
  });
}

export function openReview(ctx) {
  const { course, state } = ctx;
  const queue = buildReviewQueue(state, course);
  if (!queue.length) {
    runSession(ctx, {
      kind: 'review', title: 'Repaso', exitRoute: '#/home',
      steps: [{ type: 'card', title: 'Nada que repasar ahora', blocks: [{ type: 'text', body: 'El repaso inteligente se alimenta de tus errores y de los conceptos que toca recordar según el calendario de repetición espaciada.\n\nCompleta lecciones y vuelve mañana: el sistema te propondrá justo lo que estás a punto de olvidar.' }] }],
      onFinish: () => ({ title: 'Todo al día', gained: 0, nextRoute: '#/home' }),
    });
    return;
  }
  runSession(ctx, {
    kind: 'review',
    title: 'Repaso inteligente',
    steps: queue,
    exitRoute: '#/home',
    onFinish: ({ correct, total }) => {
      const gained = rewardReview(state, correct);
      const achievements = ctx.commit();
      return {
        icon: 'refresh',
        title: 'Repaso completado',
        subtitle: `${correct} de ${total} a la primera`,
        gained,
        achievements,
        note: 'Los conceptos acertados se espacian más en el calendario; los fallados volverán pronto.',
        nextRoute: '#/home',
      };
    },
  });
}
