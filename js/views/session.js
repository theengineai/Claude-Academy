// Motor de actividad a pantalla completa: lecciones, misiones, evaluaciones, repaso y retos del laboratorio.
// - «Atrás» permite volver a pasos anteriores: las tarjetas se ven igual y las preguntas ya
//   respondidas se muestran en modo repaso (resultado, explicación y solución, sin poder cambiarlas).
// - Con `resumeKey`, el avance se guarda al salir y se puede continuar más tarde.
import { h, clear, md, mdEl } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderBlock } from '../ui/blocks.js';
import { confetti, countUp, confirmSheet, toast } from '../ui/fx.js';
import { renderExercise } from '../exercises/render.js';
import { isExercise } from '../core/course.js';

const COPY = {
  lesson: { check: 'Comprobar' },
  mission: { check: 'Comprobar' },
  exam: { check: 'Responder' },
  review: { check: 'Comprobar' },
  lab: { check: 'Comprobar objetivos' },
};

/** Avance guardado de una actividad (o null). Se usa también para mostrar «paso X de Y» fuera. */
export function savedProgress(state, key, sig = null) {
  const s = state.inProgress?.[key];
  if (sig && s?.sig && s.sig !== sig) return null; // el contenido cambió: no se mezcla
  return s && Array.isArray(s.queue) && s.furthest > 0 && s.furthest < s.queue.length ? s : null;
}

/**
 * @param ctx      contexto de la app ({ state, recordAnswer, clearMistake, onCommand, go, commit })
 * @param options  { kind, title, steps, retryInPlace, requeueWrong, onFinish(summary) -> resultado,
 *                   exitRoute, resumeKey?, meta? }
 */
export function runSession(ctx, options) {
  const { kind, title, steps, exitRoute = '#/academy', resumeKey = null, meta = null } = options;
  const retryInPlace = options.retryInPlace ?? (kind === 'mission' || kind === 'lab');
  const requeueWrong = options.requeueWrong ?? (kind === 'lesson' || kind === 'review');

  // queue: posiciones de la sesión, cada una apunta a un paso de `steps` (índice i).
  let queue = steps.map((_, i) => ({ i, retry: false }));
  let pos = 0;            // paso que se está viendo
  let furthest = 0;       // paso más avanzado alcanzado
  let firstTry = new Map();
  let answers = {};       // posición -> { ok } de preguntas ya cerradas

  const root = h('div', { class: 'activity', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const bar = h('div', { class: 'progress-fill' });
  const counter = h('span', { class: 'act-counter' });
  const body = h('main', { class: 'act-body' });
  const footer = h('footer', { class: 'act-foot' });
  const backBtn = h('button', { class: 'icon-btn back', type: 'button', 'aria-label': 'Paso anterior', onclick: back }, icon('back'));
  root.append(
    h('header', { class: 'act-head' },
      h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Salir', onclick: exit }, icon('x')),
      backBtn,
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progreso' }, bar),
      counter),
    body, footer);
  document.body.append(root);
  document.body.classList.add('in-activity');

  // ---------- Guardado del avance ----------
  function started() {
    return furthest > 0 || firstTry.size > 0;
  }

  function persist() {
    if (!resumeKey) return;
    ctx.state.inProgress = ctx.state.inProgress || {};
    if (!started()) delete ctx.state.inProgress[resumeKey];
    else {
      ctx.state.inProgress[resumeKey] = {
        queue, furthest, answers, meta, sig: options.sig || null,
        firstTry: [...firstTry],
        savedAt: new Date().toISOString(),
      };
    }
    ctx.commit();
  }

  function clearSaved() {
    if (resumeKey && ctx.state.inProgress?.[resumeKey]) {
      delete ctx.state.inProgress[resumeKey];
      ctx.commit();
    }
  }

  function restore(saved) {
    queue = saved.queue.filter(q => Number.isInteger(q.i) && q.i >= 0 && q.i < steps.length);
    furthest = Math.min(saved.furthest, queue.length - 1);
    pos = furthest;
    firstTry = new Map(saved.firstTry || []);
    answers = { ...(saved.answers || {}) };
  }

  async function exit() {
    if (resumeKey) {
      persist();
      close(exitRoute);
      if (started()) toast('Avance guardado: podrás continuar donde lo dejaste.', { iconName: 'check' });
      return;
    }
    if (started() && !(await confirmSheet({ title: '¿Salir de la actividad?', body: 'Este repaso es corto y no se guarda a medias.', confirm: 'Salir', cancel: 'Seguir aquí' }))) return;
    close(exitRoute);
  }

  function close(route) {
    root.classList.add('out');
    document.body.classList.remove('in-activity');
    setTimeout(() => root.remove(), 220);
    ctx.go(route);
  }

  // ---------- Navegación ----------
  function paintProgress() {
    bar.style.width = `${(Math.min(furthest, queue.length) / queue.length) * 100}%`;
    counter.textContent = `${Math.min(pos + 1, queue.length)}/${queue.length}`;
    backBtn.hidden = pos === 0 || pos >= queue.length;
  }

  function next() {
    pos++;
    if (pos > furthest) furthest = pos;
    persist();
    show();
  }

  function back() {
    if (pos === 0) return;
    pos--;
    show();
  }

  function show() {
    paintProgress();
    clear(body);
    clear(footer);
    body.scrollTop = 0;
    if (pos >= queue.length) return finish();
    const { i, retry } = queue[pos];
    const step = steps[i];
    const wrap = h('div', { class: 'act-step enter' });
    body.append(wrap);
    if (pos < furthest) wrap.append(h('div', { class: 'review-tag' }, icon('eye', { size: 14 }), 'Repasando un paso anterior'));
    if (!isExercise(step)) return showCard(step, wrap);
    if (answers[pos]) return showAnswered(step, wrap, answers[pos]);
    return showExercise(step, wrap, retry);
  }

  function goForwardButton(label = 'Continuar') {
    return h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: next }, label, icon('arrow', { size: 18 }));
  }

  function showCard(step, wrap) {
    wrap.append(h('article', { class: 'card-lesson' },
      step.kicker ? h('span', { class: 'kicker' }, step.kicker) : null,
      step.title ? h('h2', { class: 'card-title' }, step.title) : null,
      ...(step.blocks || []).map(renderBlock)));
    footer.append(goForwardButton());
  }

  /** Pregunta ya respondida: se ve el resultado, la explicación y la solución, sin poder cambiarla. */
  function showAnswered(ex, wrap, ans) {
    if (ex.type === 'choice' || ex.type === 'multi') {
      const ctrl = renderExercise(ex, ctx);
      ctrl.el.classList.add('ex-review');
      ctrl.lock({ detail: {} });
      // En repaso, las opciones correctas se marcan en verde sólido.
      ctrl.el.querySelectorAll('.missed').forEach(el => el.classList.replace('missed', 'right'));
      wrap.append(ctrl.el, h('p', { class: 'small muted' }, 'En verde, la respuesta correcta.'));
    } else {
      wrap.append(h('div', { class: 'ex ex-review' },
        h('h2', { class: 'ex-prompt', html: md(ex.prompt).replace(/^<p>|<\/p>$/g, '') })));
      const ctrl = renderExercise(ex, ctx);
      const sol = ctrl.solution();
      if (sol) wrap.append(h('div', { class: 'review-solution' }, h('span', { class: 'small muted' }, 'Solución'), sol));
    }
    footer.append(h('div', { class: `feedback ${ans.ok ? 'ok' : 'bad'} review` },
      h('div', { class: 'fb-head' }, icon(ans.ok ? 'check' : 'x', { size: 20 }), h('strong', {}, ans.ok ? 'La acertaste a la primera' : 'Esta te costó: repasa la explicación')),
      ex.explain ? mdEl(ex.explain, 'md fb-explain') : null,
      goForwardButton()));
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
        persist();
        feedback(false, res.message, ex, {
          retry: true,
          solution: fails >= 2 ? ctrl.solution() : null,
          onRetry: () => { clear(footer); footer.append(h('div', { class: 'foot-row' }, hintBtn?.isConnected ? hintBtn : null, checkBtn)); },
        });
        return;
      }
      ctrl.lock(res.result);
      const stepIndex = queue[pos].i;
      if (!res.ok && requeueWrong && queue.filter(q => q.i === stepIndex).length < 3) queue.push({ i: stepIndex, retry: true });
      answers[pos] = { ok: firstTry.get(ex.id) === true };
      persist();
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
        : h('button', { class: `btn btn-block ${ok ? 'btn-ok' : 'btn-bad'}`, type: 'button', onclick: next }, 'Continuar'));
    footer.append(panel);
    panel.querySelector('button:last-of-type')?.focus({ preventScroll: true });
  }

  function finish() {
    clearSaved();
    const exercises = queue.filter(q => !q.retry).map(q => steps[q.i]).filter(isExercise);
    const correct = exercises.filter(ex => firstTry.get(ex.id)).length;
    const accuracy = exercises.length ? correct / exercises.length : 1;
    const outcome = options.onFinish({ accuracy, correct, total: exercises.length }) || {};
    clear(footer);
    bar.style.width = '100%';
    backBtn.hidden = true;
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

  // ---------- Inicio: ¿continuar o empezar de nuevo? ----------
  const saved = resumeKey ? savedProgress(ctx.state, resumeKey, options.sig) : null;
  if (saved) {
    paintProgress();
    backBtn.hidden = true;
    counter.textContent = '';
    body.append(h('div', { class: 'act-step enter' }, h('article', { class: 'card-lesson resume-card' },
      h('span', { class: 'kicker' }, 'Lo tienes a medias'),
      h('h2', { class: 'card-title' }, title),
      h('p', { class: 'muted' }, `Ibas por el paso ${saved.furthest + 1} de ${saved.queue.length}. Tus respuestas anteriores se mantienen.`))));
    footer.append(h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { restore(saved); show(); } }, icon('play', { size: 18 }), 'Continuar donde lo dejé'),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { clearSaved(); show(); } }, 'Empezar de nuevo')));
  } else {
    show();
  }
  return { close };
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
