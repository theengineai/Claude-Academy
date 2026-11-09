// Laboratorio: terminal libre persistente + retos rápidos con objetivos verificables.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmSheet, toast } from '../ui/fx.js';
import { Shell } from '../terminal/shell.js';
import { createTerminal } from '../ui/terminal-view.js';
import { runSession } from './session.js';
import { isLabUnlocked, completeLab, XP } from '../core/progress.js';

// Proyecto de ejemplo del laboratorio libre (datos ficticios).
export const SANDBOX_FILES = {
  '~/cierre-mensual/README.md': '# Cierre mensual (proyecto de práctica)\n\nScripts que consolidan ventas y gastos ficticios y generan un informe de margen.\n',
  '~/cierre-mensual/datos/ventas_2026-10.csv': 'fecha,cliente,importe_eur\n2026-10-03,Cliente A,1200.00\n2026-10-12,Cliente B,850.50\n2026-10-27,Cliente C,2310.00\n',
  '~/cierre-mensual/datos/gastos_2026-10.csv': 'fecha,concepto,importe_eur\n2026-10-05,Software,240.00\n2026-10-15,Viajes,610.20\n',
  '~/cierre-mensual/scripts/margen.py': '# Calcula el margen bruto del mes\n# margen = (ventas - gastos) / ventas\n',
  '~/cierre-mensual/informes/': null,
};

function sandboxShell(ctx) {
  try {
    if (ctx.state.sandbox) return new Shell({ snapshot: ctx.state.sandbox });
  } catch { /* copia dañada: se recrea */ }
  return new Shell({ files: SANDBOX_FILES, cwd: '~' });
}

export function renderLab(page, ctx) {
  const { course, state } = ctx;
  const shell = sandboxShell(ctx);
  page.append(h('header', { class: 'page-head' },
    h('span', { class: 'kicker' }, 'Práctica libre'), h('h1', {}, 'Laboratorio'),
    h('p', { class: 'muted' }, 'Terminal simulada con un proyecto de cierre mensual ficticio. Nada se ejecuta de verdad: equivócate sin miedo.')));

  const term = createTerminal({
    shell,
    suggestions: {
      shell: ['ls', 'cd cierre-mensual', 'tree', 'cat README.md', 'git status', 'claude', 'claude mcp list', 'nano CLAUDE.md', 'help'],
      session: ['/help', '/init', '/memory', '/context', '/skills', '/doctor', '/exit'],
    },
    intro: [
      { text: 'Bienvenido al laboratorio. Prueba: cd cierre-mensual → tree → claude → /init', kind: 'dim' },
      { text: 'Tu sistema de archivos se guarda en este dispositivo.', kind: 'dim' },
    ],
    onRun: () => {
      ctx.onCommand();
      state.sandbox = shell.toJSON();
      ctx.commit();
    },
  });
  page.append(term.el);
  page.append(h('div', { class: 'row end' },
    h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
        if (await confirmSheet({ title: '¿Reiniciar el laboratorio?', body: 'Se restaurará el proyecto de ejemplo. Tu XP y progreso no cambian.', confirm: 'Reiniciar', danger: true })) {
          state.sandbox = null;
          ctx.commit();
          ctx.refresh();
          toast('Laboratorio restaurado', { iconName: 'refresh' });
        }
      },
    }, icon('refresh', { size: 16 }), 'Reiniciar laboratorio')));

  const done = course.lab.filter(c => state.lab[c.id]).length;
  page.append(h('div', { class: 'card-head section-title' }, h('h2', {}, 'Retos rápidos'), h('span', { class: 'small muted' }, `${done}/${course.lab.length} · ${XP.labChallenge} XP cada uno`)));
  const list = h('div', { class: 'list card' });
  for (const c of course.lab) {
    const open = isLabUnlocked(state, course, c);
    const solved = Boolean(state.lab[c.id]);
    list.append(h('a', { class: `list-row ${open ? '' : 'locked'}`, href: open ? `#/challenge/${c.id}` : null },
      h('span', { class: `list-icon ${solved ? 'k-done' : 'k-lab'}` }, icon(solved ? 'check' : open ? 'flask' : 'lock', { size: 20 })),
      h('div', { class: 'grow' }, h('strong', {}, c.title), h('span', { class: 'small muted' }, open ? c.summary : `Requiere: ${(c.requires || []).map(id => course.lessonById[id]?.title).join(', ')}`)),
      open ? icon('arrow', { size: 18, cls: 'muted' }) : null));
  }
  page.append(list);
  setTimeout(() => { if (matchMedia('(min-width: 900px)').matches) term.focus(); }, 100);
}

export function openLabChallenge(ctx, id) {
  const { course, state } = ctx;
  const c = course.lab.find(x => x.id === id);
  if (!c || !isLabUnlocked(state, course, c)) return false;
  runSession(ctx, {
    kind: 'lab',
    title: c.title,
    steps: [{ ...c.exercise, id: `${c.id}#ex` }],
    exitRoute: '#/lab',
    onFinish: () => {
      const r = completeLab(state, c.id);
      const achievements = ctx.commit();
      return { icon: 'flask', title: 'Reto superado', subtitle: c.title, gained: r.gained, achievements, retryRoute: `#/challenge/${c.id}`, nextRoute: '#/lab' };
    },
  });
}
