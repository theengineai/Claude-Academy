// Bloques de contenido de las microlecciones. Cada bloque del JSON tiene un "type".
// Para añadir vídeos propios en el futuro: { "type": "video", "src": "media/x.mp4", "poster": "...",
// "captions": "media/x.vtt", "fallback": [bloques] }. Sin "src" se muestra el fallback.
import { h, md, mdEl } from './dom.js';
import { icon } from './icons.js';

const renderers = {
  text: b => h('div', { class: 'blk blk-text' }, b.title ? h('h3', {}, b.title) : null, mdEl(b.body)),

  code: b => h('figure', { class: 'blk blk-code' },
    h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, b.lang || 'texto'), b.file ? h('span', { class: 'code-file' }, b.file) : null),
    h('pre', {}, h('code', {}, b.code)),
    b.caption ? h('figcaption', { html: md(b.caption) }) : null),

  // Diagrama de flujo animado paso a paso.
  flow: b => {
    const steps = b.steps.map((s, i) => h('li', { class: 'flow-step', style: { '--i': i } },
      h('span', { class: 'flow-num' }, String(i + 1)),
      h('div', {}, h('strong', {}, s.title), s.text ? h('p', { html: md(s.text).replace(/^<p>|<\/p>$/g, '') }) : null)));
    return h('div', { class: 'blk blk-flow' }, b.title ? h('h3', {}, b.title) : null, h('ol', { class: 'flow' }, steps));
  },

  compare: b => h('div', { class: 'blk blk-compare' },
    b.title ? h('h3', {}, b.title) : null,
    h('div', { class: 'compare' }, ...[b.left, b.right].map((side, i) => h('div', { class: `compare-col ${i ? 'good' : 'bad'}` },
      h('div', { class: 'compare-head' }, icon(side.icon || (i ? 'check' : 'x'), { size: 16 }), side.title),
      h('ul', {}, side.items.map(item => h('li', { html: md(item).replace(/^<p>|<\/p>$/g, '') }))))))),

  tree: b => h('div', { class: 'blk blk-tree' }, b.title ? h('h3', {}, b.title) : null,
    h('pre', { class: 'tree' }, b.lines.map(l => {
      const [path, note] = l.split('  # ');
      return h('div', {}, h('span', {}, path), note ? h('span', { class: 'tree-note' }, `  # ${note}`) : null);
    }))),

  callout: b => h('div', { class: `blk callout callout-${b.tone || 'tip'}` },
    icon({ tip: 'bulb', warn: 'warn', finance: 'money', info: 'info' }[b.tone || 'tip'], { size: 20 }),
    h('div', {}, b.title ? h('strong', {}, b.title) : null, mdEl(b.body))),

  // Tarjeta para pensar antes de ver la respuesta.
  reveal: b => {
    const answer = h('div', { class: 'reveal-answer', hidden: true }, mdEl(b.answer));
    const btn = h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => { answer.hidden = false; btn.remove(); } }, icon('eye', { size: 16 }), 'Ver respuesta');
    return h('div', { class: 'blk blk-reveal' }, h('p', { class: 'reveal-q' }, b.question), btn, answer);
  },

  // Chat de ejemplo: cómo se ve una interacción en Claude Code.
  chat: b => h('div', { class: 'blk blk-chat' }, b.title ? h('h3', {}, b.title) : null,
    ...b.messages.map(m => h('div', { class: `msg msg-${m.role}` }, h('span', { class: 'msg-role' }, m.role === 'user' ? 'Tú' : m.role === 'claude' ? 'Claude' : 'Sistema'), mdEl(m.text)))),

  video: b => (b.src
    ? h('figure', { class: 'blk blk-video' },
      h('video', { controls: true, playsinline: true, preload: 'metadata', poster: b.poster || null, src: b.src },
        b.captions ? h('track', { kind: 'captions', srclang: 'es', src: b.captions, default: true }) : null),
      b.title ? h('figcaption', {}, b.title) : null)
    : h('div', { class: 'blk' }, (b.fallback || []).map(renderBlock))),
};

export function renderBlock(block) {
  const r = renderers[block.type];
  if (!r) return h('div', { class: 'blk muted' }, `Bloque no soportado: ${block.type}`);
  return r(block);
}

export const BLOCK_TYPES = Object.keys(renderers);
