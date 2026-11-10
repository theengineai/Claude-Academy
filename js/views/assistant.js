// Ventana de dudas tipo chat. No usa IA: responde con el glosario preparado (content/glossary.json).
import { h, clear, mdEl } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/fx.js';
import { ask, suggestions, byId } from '../core/assistant.js';

const WELCOME = '¡Hola! Pregúntame cualquier duda del curso: *¿qué es el shell?*, *¿qué es datos/?*, *¿para qué sirve /compact?*…\n\n' +
  'Aviso: **no soy una IA**. Respondo con las explicaciones que lleva preparadas la academia; si no tengo algo, puedes guardar tu duda.';

export function openAssistant(ctx, { lessonId = null } = {}) {
  if (document.querySelector('.assistant')) return;
  const { state, course } = ctx;
  const entries = course.glossary || [];
  const log = h('div', { class: 'as-log', role: 'log', 'aria-live': 'polite' });
  const input = h('input', { class: 'term-input as-input', type: 'text', placeholder: 'Escribe tu duda…', autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Tu duda' });
  const chips = h('div', { class: 'as-chips' });
  const root = h('div', { class: 'assistant', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Asistente de dudas' });

  const close = () => { root.remove(); document.body.classList.remove('in-assistant'); };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const bot = (...kids) => { const b = h('div', { class: 'as-msg bot' }, ...kids); log.append(b); scroll(); return b; };
  const user = text => { log.append(h('div', { class: 'as-msg me' }, text)); scroll(); };
  const chip = (label, fn) => h('button', { class: 'chip', type: 'button', onclick: fn }, label);

  function lessonLinks(entry) {
    const titles = (entry.lessons || []).map(id => course.lessonById?.[id]).filter(Boolean).slice(0, 2);
    if (!titles.length) return null;
    return h('div', { class: 'as-lessons muted small' }, 'Se explica en: ', ...titles.flatMap((l, i) => [i ? ' · ' : '',
      h('a', { href: `#/lesson/${l.id}`, onclick: () => close() }, l.title)]));
  }

  function answerCard(entry, { extra = false } = {}) {
    const body = h('div', { class: 'as-card' },
      h('strong', { class: 'as-term' }, entry.term),
      mdEl(entry.short, 'md'),
      entry.long ? mdEl(entry.long, 'md as-long') : null,
      entry.example ? mdEl(entry.example, 'as-example md') : null,
      lessonLinks(entry));
    const rel = (entry.related || []).map(id => byId(entries, id)).filter(Boolean).slice(0, 4);
    const m = bot(body);
    if (rel.length && !extra) m.append(h('div', { class: 'as-chips' }, h('span', { class: 'muted small' }, 'Relacionado:'), ...rel.map(r => chip(r.term, () => { user(r.term); answerCard(r, { extra: true }); }))));
    return m;
  }

  function saveDoubt(text) {
    state.doubts = [...(state.doubts || []), { text, at: new Date().toISOString().slice(0, 10) }].slice(-100);
    ctx.commit();
    toast('Duda guardada', { iconName: 'check' });
  }

  function respond(text) {
    const res = ask(entries, text);
    if (res.confidence === 'none') {
      const m = bot(mdEl('No tengo eso todavía. Prueba con otras palabras o toca una de las dudas frecuentes.', 'md'),
        h('div', { class: 'as-chips' },
          chip('Guardar mi duda', () => { saveDoubt(text); }),
          ...suggestions(entries, lessonId, 3).map(e => chip(e.term, () => { user(e.term); answerCard(e); }))));
      return m;
    }
    const [top, ...rest] = res.results;
    if (res.confidence === 'maybe') {
      bot(mdEl('No estoy seguro. ¿Te refieres a alguna de estas?', 'md'),
        h('div', { class: 'as-chips' }, ...res.results.map(r => chip(r.entry.term, () => { user(r.entry.term); answerCard(r.entry); }))));
      return;
    }
    answerCard(top.entry);
    const shown = new Set([top.entry.id, ...(top.entry.related || [])]);
    const more = rest.filter(r => r.score >= 80 && !shown.has(r.entry.id)).slice(0, 3);
    if (more.length) log.lastChild.append(h('div', { class: 'as-chips' }, h('span', { class: 'muted small' }, 'Quizá también:'), ...more.map(r => chip(r.entry.term, () => { user(r.entry.term); answerCard(r.entry, { extra: true }); }))));
  }

  function send(text) {
    const t = String(text ?? input.value).trim();
    input.value = '';
    if (!t) return;
    user(t);
    respond(t);
  }

  function paintChips() {
    clear(chips);
    for (const e of suggestions(entries, lessonId, 6)) chips.append(chip(e.term, () => send(e.term)));
  }

  async function copyDoubts() {
    const list = (state.doubts || []).map(d => `- ${d.text}`).join('\n');
    if (!list) { toast('No tienes dudas guardadas', { iconName: 'info' }); return; }
    try { await navigator.clipboard.writeText(`Dudas para añadir al glosario:\n${list}`); toast('Copiadas', { iconName: 'check' }); }
    catch { toast('No se pudo copiar', { iconName: 'warn' }); }
  }

  root.append(
    h('header', { class: 'as-head' },
      icon('chat', { size: 20 }), h('strong', { class: 'grow' }, 'Preguntar una duda'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: copyDoubts }, 'Mis dudas'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    log,
    chips,
    h('form', { class: 'as-form', onsubmit: e => { e.preventDefault(); send(); } }, input,
      h('button', { class: 'term-send', type: 'submit', 'aria-label': 'Enviar duda' }, 'Enviar')));
  document.body.append(root);
  document.body.classList.add('in-assistant');
  bot(mdEl(WELCOME, 'md'));
  paintChips();
  setTimeout(() => input.focus({ preventScroll: true }), 60);
  return close;
}
