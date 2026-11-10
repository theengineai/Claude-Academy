// Renderizadores de ejercicios. Cada uno devuelve un controlador común:
// { el, isReady(), check() -> { ok, message }, lock(result), solution() -> Node|null, onChange(fn) }
import { h, md, mdEl, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { shuffle } from '../core/util.js';
import { validate, explainFailure, runChecks } from '../core/validate.js';
import { Shell } from '../terminal/shell.js';
import { evaluateGoals } from '../terminal/goals.js';
import { createTerminal } from '../ui/terminal-view.js';

const LETTERS = 'ABCDEFGH';

function header(ex) {
  const kinds = {
    choice: ex.context ? 'Decisión' : 'Pregunta', multi: 'Selección múltiple', order: 'Ordena', match: 'Empareja',
    fill: 'Completa', spot: 'Encuentra el error', editor: 'Edita', terminal: 'Terminal',
  };
  return h('div', { class: 'ex-head' },
    h('span', { class: 'ex-kind' }, kinds[ex.type]),
    h('h2', { class: 'ex-prompt', html: md(ex.prompt).replace(/^<p>|<\/p>$/g, '') }),
    ex.context ? h('div', { class: 'ex-context' }, icon('info', { size: 18 }), mdEl(ex.context)) : null,
  );
}

function controller(ex, el, { isReady, getAnswer, lock, solution }) {
  const listeners = [];
  return {
    el,
    exercise: ex,
    isReady,
    onChange: fn => listeners.push(fn),
    changed: () => listeners.forEach(fn => fn()),
    check() {
      const result = validate(ex, getAnswer());
      return { ok: result.ok, message: result.ok ? '' : explainFailure(ex, result), result };
    },
    lock: lock || (() => {}),
    solution: solution || (() => null),
  };
}

// ---------- Opción única / decisión ----------
function choice(ex) {
  let selected = null;
  const order = ex.shuffle === false ? ex.options.map((_, i) => i) : shuffle(ex.options.map((_, i) => i));
  const buttons = [];
  const list = h('div', { class: 'options', role: 'radiogroup' });
  order.forEach((idx, pos) => {
    const btn = h('button', {
      class: 'option', type: 'button', role: 'radio', 'aria-checked': 'false',
      onclick: () => { selected = idx; buttons.forEach(b => { b.classList.toggle('selected', b === btn); b.setAttribute('aria-checked', String(b === btn)); }); ctrl.changed(); },
    }, h('span', { class: 'opt-key' }, LETTERS[pos]), h('span', { class: 'opt-text', html: md(ex.options[idx].text).replace(/^<p>|<\/p>$/g, '') }));
    btn.dataset.idx = idx;
    buttons.push(btn);
    list.append(btn);
  });
  const el = h('div', { class: 'ex' }, header(ex), list);
  const ctrl = controller(ex, el, {
    isReady: () => selected !== null,
    getAnswer: () => selected,
    lock: () => buttons.forEach(b => {
      b.disabled = true;
      const opt = ex.options[Number(b.dataset.idx)];
      if (opt.correct) b.classList.add('right');
      else if (Number(b.dataset.idx) === selected) b.classList.add('wrong');
    }),
  });
  return ctrl;
}

// ---------- Selección múltiple ----------
function multi(ex) {
  const selected = new Set();
  const order = shuffle(ex.options.map((_, i) => i));
  const buttons = [];
  const list = h('div', { class: 'options' });
  order.forEach(idx => {
    const btn = h('button', {
      class: 'option option-check', type: 'button', role: 'checkbox', 'aria-checked': 'false',
      onclick: () => {
        selected.has(idx) ? selected.delete(idx) : selected.add(idx);
        btn.classList.toggle('selected', selected.has(idx));
        btn.setAttribute('aria-checked', String(selected.has(idx)));
        ctrl.changed();
      },
    }, h('span', { class: 'opt-box' }, icon('check', { size: 16 })), h('span', { class: 'opt-text', html: md(ex.options[idx].text).replace(/^<p>|<\/p>$/g, '') }));
    btn.dataset.idx = idx;
    buttons.push(btn);
    list.append(btn);
  });
  const el = h('div', { class: 'ex' }, header(ex), h('p', { class: 'ex-help' }, 'Marca todas las opciones correctas.'), list);
  const ctrl = controller(ex, el, {
    isReady: () => selected.size > 0,
    getAnswer: () => [...selected],
    lock: () => buttons.forEach(b => {
      b.disabled = true;
      const i = Number(b.dataset.idx);
      if (ex.options[i].correct) b.classList.add(selected.has(i) ? 'right' : 'missed');
      else if (selected.has(i)) b.classList.add('wrong');
    }),
  });
  return ctrl;
}

// ---------- Ordenar ----------
function order(ex) {
  let seq = shuffle(ex.items.map((_, i) => i));
  const list = h('ol', { class: 'order-list' });
  let locked = false;
  const render = () => {
    clear(list);
    seq.forEach((idx, pos) => {
      const move = d => { if (locked) return; const j = pos + d; if (j < 0 || j >= seq.length) return; [seq[pos], seq[j]] = [seq[j], seq[pos]]; render(); ctrl.changed(); };
      list.append(h('li', { class: 'order-item', dataset: { idx } },
        h('span', { class: 'order-pos' }, String(pos + 1)),
        h('span', { class: 'order-text', html: md(ex.items[idx]).replace(/^<p>|<\/p>$/g, '') }),
        h('span', { class: 'order-btns' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Subir', disabled: pos === 0 || locked, onclick: () => move(-1) }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bajar', disabled: pos === seq.length - 1 || locked, onclick: () => move(1) }, '↓'))));
    });
  };
  render();
  const el = h('div', { class: 'ex' }, header(ex), h('p', { class: 'ex-help' }, 'Usa las flechas para colocar cada paso en su sitio.'), list);
  const ctrl = controller(ex, el, {
    isReady: () => true,
    getAnswer: () => seq,
    lock: () => { locked = true; render(); [...list.children].forEach((li, pos) => li.classList.add(seq[pos] === pos ? 'right' : 'wrong')); },
    solution: () => h('ol', { class: 'solution-list' }, ex.items.map(i => h('li', { html: md(i).replace(/^<p>|<\/p>$/g, '') }))),
  });
  return ctrl;
}

// ---------- Emparejar ----------
function match(ex) {
  const n = ex.pairs.length;
  const rightOrder = shuffle(ex.pairs.map((_, i) => i));
  const assign = Array(n).fill(null); // assign[left] = right
  let activeLeft = null;
  const leftBtns = [];
  const rightBtns = [];
  const paint = () => {
    leftBtns.forEach((b, i) => {
      b.classList.toggle('active', activeLeft === i);
      b.dataset.pair = assign[i] === null ? '' : String(i % 6);
    });
    rightBtns.forEach(b => {
      const r = Number(b.dataset.idx);
      const left = assign.indexOf(r);
      b.dataset.pair = left === -1 ? '' : String(left % 6);
    });
  };
  const leftCol = h('div', { class: 'match-col' });
  const rightCol = h('div', { class: 'match-col' });
  ex.pairs.forEach(([left], i) => {
    const b = h('button', { class: 'match-item', type: 'button', onclick: () => { activeLeft = activeLeft === i ? null : i; if (assign[i] !== null) { assign[i] = null; ctrl.changed(); } paint(); } }, h('span', { html: md(left).replace(/^<p>|<\/p>$/g, '') }));
    leftBtns.push(b);
    leftCol.append(b);
  });
  rightOrder.forEach(r => {
    const b = h('button', {
      class: 'match-item', type: 'button',
      onclick: () => {
        const owner = assign.indexOf(r);
        if (activeLeft === null) { if (owner !== -1) { assign[owner] = null; paint(); ctrl.changed(); } return; }
        if (owner !== -1) assign[owner] = null;
        assign[activeLeft] = r;
        activeLeft = assign.findIndex(a => a === null);
        if (activeLeft === -1) activeLeft = null;
        paint();
        ctrl.changed();
      },
    }, h('span', { html: md(ex.pairs[r][1]).replace(/^<p>|<\/p>$/g, '') }));
    b.dataset.idx = r;
    rightBtns.push(b);
    rightCol.append(b);
  });
  activeLeft = 0;
  paint();
  const el = h('div', { class: 'ex' }, header(ex), h('p', { class: 'ex-help' }, 'Toca un elemento de la izquierda y después su pareja.'), h('div', { class: 'match' }, leftCol, rightCol));
  const ctrl = controller(ex, el, {
    isReady: () => assign.every(a => a !== null),
    getAnswer: () => assign,
    lock: () => {
      [...leftBtns, ...rightBtns].forEach(b => { b.disabled = true; });
      leftBtns.forEach((b, i) => b.classList.add(assign[i] === i ? 'right' : 'wrong'));
    },
    solution: () => h('ul', { class: 'solution-list' }, ex.pairs.map(([a, b]) => h('li', { html: `${md(a).replace(/^<p>|<\/p>$/g, '')} → ${md(b).replace(/^<p>|<\/p>$/g, '')}` }))),
  });
  return ctrl;
}

// ---------- Completar huecos ----------
function fill(ex) {
  const values = ex.blanks.map(() => null);
  let active = 0;
  const slots = [];
  const optionsBar = h('div', { class: 'fill-options' });
  const parts = ex.template.split(/(\{\{\d+\}\})/);
  const code = h(ex.code === false ? 'p' : 'pre', { class: ex.code === false ? 'fill-text' : 'fill-code' });
  for (const part of parts) {
    const m = /^\{\{(\d+)\}\}$/.exec(part);
    if (!m) { code.append(part); continue; }
    const i = Number(m[1]);
    const blank = ex.blanks[i];
    if (blank.options) {
      const slot = h('button', { class: 'slot', type: 'button', onclick: () => { active = i; paint(); } }, '   ');
      slots[i] = slot;
      code.append(slot);
    } else {
      const input = h('input', {
        class: 'slot-input', type: 'text', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
        size: Math.max(6, (blank.accept?.[0] || '').length + 1), 'aria-label': `Hueco ${i + 1}`,
        oninput: e => { values[i] = e.target.value; ctrl.changed(); },
      });
      slots[i] = input;
      code.append(input);
    }
  }
  const optionOrder = ex.blanks.map(b => (b.options ? shuffle(b.options) : null));
  function paint() {
    slots.forEach((s, i) => {
      if (!ex.blanks[i].options) return;
      s.textContent = values[i] ?? '·····';
      s.classList.toggle('active', i === active);
      s.classList.toggle('filled', values[i] !== null);
    });
    clear(optionsBar);
    const blank = ex.blanks[active];
    if (blank?.options) {
      optionsBar.append(h('span', { class: 'fill-label' }, `Hueco ${active + 1}:`));
      optionOrder[active].forEach(opt => optionsBar.append(h('button', {
        class: `chip chip-lg ${values[active] === opt ? 'selected' : ''}`, type: 'button',
        onclick: () => {
          values[active] = opt;
          const next = ex.blanks.findIndex((b, j) => b.options && values[j] === null);
          if (next !== -1) active = next;
          paint();
          ctrl.changed();
        },
      }, opt)));
    }
  }
  active = ex.blanks.findIndex(b => b.options);
  if (active === -1) active = 0;
  paint();
  const el = h('div', { class: 'ex' }, header(ex), code, optionsBar);
  const ctrl = controller(ex, el, {
    isReady: () => values.every(v => v !== null && String(v).trim() !== ''),
    getAnswer: () => values,
    lock: result => {
      optionsBar.remove();
      slots.forEach((s, i) => { s.disabled = true; s.classList.add(result.detail.results[i] ? 'right' : 'wrong'); });
    },
    solution: () => h('pre', { class: 'fill-code' }, ex.template.replace(/\{\{(\d+)\}\}/g, (_, i) => ex.blanks[i].answer ?? ex.blanks[i].accept[0])),
  });
  ctrl.check = function check() {
    const result = validate(ex, values);
    return { ok: result.ok, message: result.ok ? '' : explainFailure(ex, result), result };
  };
  return ctrl;
}

// ---------- Encontrar líneas defectuosas ----------
function spot(ex) {
  const selected = new Set();
  const rows = ex.lines.map((text, i) => {
    const row = h('button', {
      class: 'spot-line', type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        selected.has(i) ? selected.delete(i) : selected.add(i);
        row.classList.toggle('selected', selected.has(i));
        row.setAttribute('aria-pressed', String(selected.has(i)));
        ctrl.changed();
      },
    }, h('span', { class: 'ln' }, String(i + 1)), h('code', {}, text || ' '));
    return row;
  });
  const el = h('div', { class: 'ex' }, header(ex),
    h('p', { class: 'ex-help' }, `Toca las líneas que contienen un error${ex.file ? ` en ${ex.file}` : ''}.`),
    h('div', { class: 'spot' }, rows));
  const ctrl = controller(ex, el, {
    isReady: () => selected.size > 0,
    getAnswer: () => [...selected],
    lock: () => rows.forEach((r, i) => {
      r.disabled = true;
      if (ex.faulty.includes(i)) {
        r.classList.add(selected.has(i) ? 'right' : 'missed');
        if (ex.notes?.[i]) r.after(h('div', { class: 'spot-note' }, icon('bulb', { size: 14 }), ex.notes[i]));
      } else if (selected.has(i)) r.classList.add('wrong');
    }),
    solution: () => (ex.fixed ? h('div', {}, h('p', { class: 'muted small' }, 'Versión corregida:'), h('pre', { class: 'code-solution' }, ex.fixed)) : null),
  });
  return ctrl;
}

// ---------- Editor con criterios ----------
function editor(ex) {
  const area = h('textarea', { class: 'editor-inline', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', rows: String(ex.rows || 9), 'aria-label': ex.file || 'Editor' });
  area.value = ex.starter || '';
  const criteria = h('ul', { class: 'criteria' });
  const paint = () => {
    clear(criteria);
    for (const r of runChecks(area.value, ex.checks)) criteria.append(h('li', { class: r.passed ? 'ok' : '' }, icon(r.passed ? 'check' : 'target', { size: 15 }), r.label));
  };
  area.addEventListener('input', () => { paint(); ctrl.changed(); });
  paint();
  const el = h('div', { class: 'ex' }, header(ex),
    h('div', { class: 'editor-file' }, icon('edit', { size: 15 }), ex.file || 'archivo'),
    area,
    h('div', { class: 'criteria-box' }, h('span', { class: 'small muted' }, 'Criterios de aceptación'), criteria));
  const ctrl = controller(ex, el, {
    isReady: () => area.value.trim().length > 0,
    getAnswer: () => area.value,
    lock: () => { area.readOnly = true; },
    solution: () => h('pre', { class: 'code-solution' }, ex.solution),
  });
  return ctrl;
}

// ---------- Terminal con objetivos ----------
function terminal(ex, ctx) {
  const shell = new Shell({ files: ex.setup?.files || {}, cwd: ex.setup?.cwd || '~', claudeActions: ex.setup?.claudeActions || [] });
  const goalsList = h('ul', { class: 'goals' });
  const paint = () => {
    clear(goalsList);
    for (const g of evaluateGoals(ex.goals, shell)) {
      goalsList.append(h('li', { class: g.passed ? 'ok' : '' }, icon(g.passed ? 'check' : 'target', { size: 15 }), h('span', {}, g.label)));
    }
  };
  const term = createTerminal({
    shell,
    suggestions: ex.suggestions || { shell: ['ls', 'pwd', 'help'], session: ['/help', '/exit'] },
    intro: ex.intro ? ex.intro.map(t => ({ text: t, kind: 'dim' })) : [{ text: 'Escribe help para ver los comandos disponibles.', kind: 'dim' }],
    onRun: () => { ctx?.onCommand?.(); paint(); ctrl.changed(); },
    compact: true,
  });
  paint();
  const el = h('div', { class: 'ex ex-terminal' }, header(ex),
    h('div', { class: 'goals-box' }, h('span', { class: 'small muted' }, 'Objetivos'), goalsList),
    term.el);
  const ctrl = {
    el, exercise: ex, shell,
    isReady: () => true,
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    changed() { this.listeners.forEach(fn => fn()); },
    check() {
      term.flush(); // un comando escrito y no enviado cuenta como enviado
      const results = evaluateGoals(ex.goals, shell);
      const failed = results.filter(r => !r.passed);
      return { ok: failed.length === 0, message: failed.map(f => `• ${f.label}${f.hint ? ` — ${f.hint}` : ''}`).join('\n'), result: { results } };
    },
    lock() {},
    solution: () => h('div', {},
      h('p', { class: 'muted small' }, 'Una solución posible:'),
      h('pre', { class: 'code-solution' }, ex.solution.join('\n')),
      ...(ex.solutionFiles || []).map(f => h('div', {},
        h('p', { class: 'muted small' }, `Contenido de ${f.path} en el editor:`),
        h('pre', { class: 'code-solution' }, f.content)))),
    focus: () => term.focus(),
  };
  return ctrl;
}

const RENDERERS = { choice, multi, order, match, fill, spot, editor, terminal };

export function renderExercise(ex, ctx) {
  const r = RENDERERS[ex.type];
  if (!r) throw new Error(`Tipo de ejercicio desconocido: ${ex.type}`);
  const ctrl = r(ex, ctx);
  ctrl.el.dataset.exId = ex.id;
  return ctrl;
}
