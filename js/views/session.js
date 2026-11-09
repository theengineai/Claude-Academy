// Motor de actividad a pantalla completa: lecciones, misiones, evaluaciones, repaso y retos del laboratorio.
import { h, clear, mdEl } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderBlock } from '../ui/blocks.js';
import { confetti, countUp, confirmSheet } from '../ui/fx.js';
import { renderExercise } from '../exercises/render.js';
import { isExercise } from '../core/course.js';

const COPY = {
  lesson: { check: 'Comprobar' },
  mission: { check: 'Comprobar' },
  exam: { check: 'Responder' },
  review: { check: 'Comprobar' },
  lab: { check: 'Comprobar objetivos' },
};

/**
 * @param ctx      contexto de la app ({ state, recordAnswer, clearMistake, onCommand, go })
 * @param options  { kind, title, steps, retryInPlace, requeueWrong, onFinish(summary) -> resultado, exitRoute }
 */
export function runSession(ctx, options) {
  const { kind, title, steps, exitRoute = '#/academy' } = options;
  const retryInPlace = options.retryInPlace ?? (kind === 'mission' || kind === 'lab');
  const requeueWrong = options.requeueWrong ?? (kind === 'lesson' || kind === 'review');
  const queue = steps.map(step => ({ step, retry: false }));
  const firstTry = new Map();
  let pos = 0;

  const root = h('div', { class: 'activity', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const bar = h('div', { class: 'progress-fill' });
  const counter = h('span', { class: 'act-counter' });
  const body = h('main', { class: 'act-body' });
  const footer = h('footer', { class: 'act-foot' });
  root.append(
    h('header', { class: 'act-head' },
      h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Salir', onclick: exit }, icon('x')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progreso' }, bar),
      counter),
    body, footer);
  document.body.append(root);
  document.body.classList.add('in-activity');

  async function exit() {
    const started = pos > 0 || firstTry.size > 0;
    if (started && !(await confirmSheet({ title: '¿Salir de la actividad?', body: 'El avance de esta sesión no se guardará.', confirm: 'Salir', cancel: 'Seguir aquí' }))) return;
    close(exitRoute);
  }

  function close(route) {
    root.classList.add('out');
    document.body.classList.remove('in-activity');
    setTimeout(() => root.remove(), 220);
    ctx.go(route);
  }

  function paintProgress() {
    const done = Math.min(pos, queue.length);
    bar.style.width = `${(done / queue.length) * 100}%`;
    counter.textContent = `${Math.min(pos + 1, queue.length)}/${queue.length}`;
  }

  function show() {
    paintProgress();
    clear(body);
    clear(footer);
    body.scrollTop = 0;
    if (pos >= queue.length) return finish();
    const { step, retry } = queue[pos];
    const wrap = h('div', { class: 'act-step enter' });
    body.append(wrap);
    if (!isExercise(step)) return showCard(step, wrap);
    return showExercise(step, wrap, retry);
  }

  function showCard(step, wrap) {
    wrap.append(h('article', { class: 'card-lesson' },
      step.kicker ? h('span', { class: 'kicker' }, step.kicker) : null,
      step.title ? h('h2', { class: 'card-title' }, step.title) : null,
      ...(step.blocks || []).map(renderBlock)));
    footer.append(h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { pos++; show(); } }, 'Continuar', icon('arrow', { size: 18 })));
  }

  function showExercise(ex, wrap, isRetry) {
    const ctrl = renderExercise(ex, ctx);
    if (isRetry) wrap.append(h('div', { class: 'retry-tag' }, icon('refresh', { size: 14 }), 'Otra oportunidad'));
    wrap.append(ctrl.el);
    let fails = 0;
    const checkBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !ctrl.isReady() }, COPY[kind].check);
    const hintBtn = ex.hint ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { hintBtn.replaceWith(h('div', { class: 'hint' }, icon('bulb', { size: 16 }), mdEl(ex.hint))); } }, icon('bulb', { size: 16 }), 'Pista') : null;
    ctrl.onChange(() => { checkBtn.disabled = !ctrl.isReady(); });
    footer.append(h('div', { class: 'foot-row' }, hintBtn, checkBtn));
    setTimeout(() => ctrl.focus?.(), 60);

    checkBtn.addEventListener('click', () => {
      const res = ctrl.check();
      const first = !firstTry.has(ex.id);
      if (first) {
        firstTry.set(ex.id, res.ok);
        ctx.recordAnswer(ex, res.ok);
      } else if (!res.ok && !retryInPlace) {
        ctx.recordMistake?.(ex);
      }
      if (res.ok && kind === 'review') ctx.clearMistake(ex.id);

      if (!res.ok && retryInPlace) {
        fails++;
        feedback(false, res.message, ex, {
          retry: true,
          solution: fails >= 2 ? ctrl.solution() : null,
          onRetry: () => { clear(footer); footer.append(h('div', { class: 'foot-row' }, hintBtn?.isConnected ? hintBtn : null, checkBtn)); },
        });
        return;
      }
      ctrl.lock(res.result);
      if (!res.ok && requeueWrong && queue.filter(q => q.step === ex).length < 3) queue.push({ step: ex, retry: true });
      feedback(res.ok, res.message, ex, { solution: res.ok ? null : ctrl.solution() });
    });
  }

  function feedback(ok, message, ex, { retry = false, solution = null, onRetry } = {}) {
    clear(footer);
    const panel = h('div', { class: `feedback ${ok ? 'ok' : 'bad'}`, role: 'alert' },
      h('div', { class: 'fb-head' }, icon(ok ? 'check' : 'x', { size: 22 }), h('strong', {}, ok ? pick(['¡Correcto!', '¡Bien visto!', '¡Exacto!']) : retry ? 'Todavía no' : 'No es correcto')),
      !ok && message ? h('div', { class: 'fb-msg' }, message) : null,
      ex.explain && (ok || !retry) ? mdEl(ex.explain, 'md fb-explain') : null,
      solution ? h('details', { class: 'fb-solution', open: !retry }, h('summary', {}, 'Ver solución'), solution) : null,
      retry
        ? h('button', { class: 'btn btn-block btn-bad', type: 'button', onclick: onRetry }, 'Intentar de nuevo')
        : h('button', { class: `btn btn-block ${ok ? 'btn-ok' : 'btn-bad'}`, type: 'button', onclick: () => { pos++; show(); } }, 'Continuar'));
    footer.append(panel);
    panel.querySelector('button:last-of-type')?.focus({ preventScroll: true });
  }

  function finish() {
    const exercises = queue.filter(q => isExercise(q.step) && !q.retry).map(q => q.step);
    const correct = exercises.filter(ex => firstTry.get(ex.id)).length;
    const accuracy = exercises.length ? correct / exercises.length : 1;
    const outcome = options.onFinish({ accuracy, correct, total: exercises.length }) || {};
    clear(footer);
    bar.style.width = '100%';
    const success = outcome.passed !== false;
    if (success) confetti();
    const xpEl = h('strong', { class: 'stat-big' }, '0');
    body.append(h('div', { class: 'results enter' },
      h('div', { class: `results-badge ${success ? '' : 'fail'}` }, icon(outcome.icon || (success ? 'trophy' : 'refresh'), { size: 44 })),
      h('h2', {}, outcome.title || '¡Completado!'),
      outcome.subtitle ? h('p', { class: 'muted' }, outcome.subtitle) : null,
      h('div', { class: 'results-stats' },
        h('div', { class: 'tile' }, xpEl, h('span', {}, 'XP ganada')),
        h('div', { class: 'tile' }, h('strong', { class: 'stat-big' }, `${Math.round(accuracy * 100)}%`), h('span', {}, 'a la primera')),
        outcome.stars ? h('div', { class: 'tile' }, h('strong', { class: 'stars' }, [1, 2, 3].map(i => icon('star', { size: 22, cls: i <= outcome.stars ? 'on' : '' }))), h('span', {}, 'estrellas')) : null),
      outcome.note ? h('div', { class: 'callout callout-info' }, icon('info', { size: 18 }), h('div', {}, outcome.note)) : null,
      (outcome.achievements || []).length ? h('div', { class: 'new-achievements' },
        h('span', { class: 'kicker' }, 'Logro desbloqueado'),
        ...(outcome.achievements.map(a => h('div', { class: 'ach-row' }, icon(a.icon, { size: 20 }), h('div', {}, h('strong', {}, a.title), h('p', { class: 'small muted' }, a.desc)))))) : null));
    countUp(xpEl, outcome.gained || 0, { prefix: '+' });
    footer.append(h('div', { class: 'foot-row' },
      outcome.retryRoute ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close(outcome.retryRoute) }, 'Repetir') : null,
      h('button', { class: 'btn btn-primary grow', type: 'button', onclick: () => close(outcome.nextRoute || exitRoute) }, outcome.nextLabel || 'Continuar')));
  }

  show();
  return { close };
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
