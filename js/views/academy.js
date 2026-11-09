// Mapa visual de módulos y lecciones con bloqueo progresivo.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sheet } from '../ui/fx.js';
import { savedProgress } from './session.js';
import {
  isModuleUnlocked, isLessonUnlocked, isExamUnlocked, isMissionUnlocked, moduleProgress, PASS_EXAM,
} from '../core/progress.js';

const OFFSETS = [0, 1, 0, -1];

export function renderAcademy(page, ctx) {
  const { course, state } = ctx;
  page.append(h('header', { class: 'page-head' },
    h('span', { class: 'kicker' }, 'Tu ruta'), h('h1', {}, 'Academia'),
    h('p', { class: 'muted' }, 'Seis módulos de L2 a L5. Supera la evaluación de cada módulo para abrir el siguiente.')));

  course.modules.forEach(mod => {
    const unlocked = isModuleUnlocked(state, course, mod.id);
    const prog = moduleProgress(state, course, mod.id);
    const section = h('section', { class: `module ${unlocked ? '' : 'locked'}`, style: { '--mod': mod.color } });
    section.append(h('div', { class: 'module-head' },
      h('div', { class: 'module-icon' }, icon(unlocked ? mod.icon : 'lock', { size: 24 })),
      h('div', { class: 'grow' },
        h('span', { class: 'kicker' }, `Módulo ${mod.index} · ${mod.level}`),
        h('h2', {}, mod.title),
        h('p', { class: 'small muted' }, mod.subtitle)),
      h('div', { class: 'module-count' }, `${prog.done}/${prog.total}`)));
    section.append(h('div', { class: 'bar thin' }, h('div', { class: 'bar-fill', style: { width: `${(prog.done / prog.total) * 100}%` } })));

    const path = h('div', { class: 'path' });
    const nodes = [
      ...mod.lessons.map(l => ({ kind: 'lesson', item: l })),
      { kind: 'exam', item: mod },
    ];
    nodes.forEach((node, i) => {
      let done, open, label, iconName, stars = 0;
      if (node.kind === 'lesson') {
        const rec = state.lessons[node.item.id];
        done = Boolean(rec?.completedAt);
        open = isLessonUnlocked(state, course, node.item.id);
        label = node.item.title;
        iconName = done ? 'check' : open ? 'book' : 'lock';
        stars = rec?.stars || 0;
      } else {
        const rec = state.exams[mod.id];
        done = Boolean(rec?.passed);
        open = isExamUnlocked(state, course, mod.id);
        label = 'Evaluación';
        iconName = done ? 'trophy' : open ? 'trophy' : 'lock';
      }
      const current = open && !done;
      const btn = h('button', {
        class: `node ${node.kind} ${done ? 'done' : ''} ${current ? 'current' : ''} ${open ? '' : 'locked'}`,
        type: 'button', style: { '--x': OFFSETS[i % OFFSETS.length] },
        'aria-label': `${label}${done ? ', completado' : open ? '' : ', bloqueado'}`,
        onclick: () => showNode(ctx, node, { done, open }),
      },
      h('span', { class: 'node-circle' }, icon(iconName, { size: 26 })),
      stars ? h('span', { class: 'node-stars' }, [1, 2, 3].map(n => icon('star', { size: 12, cls: n <= stars ? 'on' : '' }))) : null,
      h('span', { class: 'node-label' }, label));
      path.append(btn);
    });
    section.append(path);

    const missions = course.missions.filter(m => m.module === mod.id && !m.final);
    if (missions.length) {
      section.append(h('div', { class: 'module-missions' },
        h('span', { class: 'small muted' }, 'Misiones del módulo'),
        h('div', { class: 'chips' }, missions.map(m => {
          const done = Boolean(state.missions[m.id]?.completedAt);
          const open = isMissionUnlocked(state, course, m.id);
          return h('a', { class: `chip mission-chip ${done ? 'done' : ''} ${open ? '' : 'locked'}`, href: open ? `#/mission/${m.id}` : '#/missions' },
            icon(done ? 'check' : open ? 'flag' : 'lock', { size: 14 }), m.title);
        }))));
    }
    page.append(section);
  });

  const final = course.missions.find(m => m.final);
  if (final) {
    const open = isMissionUnlocked(state, course, final.id);
    const done = Boolean(state.missions[final.id]?.completedAt);
    page.append(h('a', { class: `card final-card ${open ? '' : 'locked'}`, href: open ? `#/mission/${final.id}` : '#/missions' },
      icon(done ? 'crown' : open ? 'flag' : 'lock', { size: 30 }),
      h('div', {}, h('span', { class: 'kicker' }, 'Proyecto final integrador'), h('strong', {}, final.title),
        h('span', { class: 'small muted' }, open ? final.summary : 'Se desbloquea al superar las seis evaluaciones.'))));
  }
}

function showNode(ctx, node, { done, open }) {
  const { course, state } = ctx;
  if (node.kind === 'lesson') {
    const l = node.item;
    const rec = state.lessons[l.id];
    const partial = savedProgress(state, `lesson:${l.id}`);
    sheet(h('div', { class: 'node-sheet' },
      h('span', { class: 'kicker' }, `Lección ${l.moduleIndex}.${l.index} · ${l.minutes} min`),
      h('h3', {}, l.title),
      h('p', { class: 'muted' }, l.summary),
      h('ul', { class: 'goals' }, (l.objectives || []).map(o => h('li', {}, icon('target', { size: 15 }), o))),
      rec ? h('p', { class: 'small muted' }, `Mejor resultado: ${Math.round(rec.best * 100)}% a la primera`) : null,
      open
        ? h('a', { class: 'btn btn-primary btn-block', href: `#/lesson/${l.id}` }, partial ? `Continuar (paso ${partial.furthest + 1} de ${partial.queue.length})` : done ? 'Repetir lección' : 'Empezar lección')
        : h('p', { class: 'locked-note' }, icon('lock', { size: 16 }), 'Completa la lección anterior para desbloquearla.')), { label: l.title });
  } else {
    const mod = node.item;
    const rec = state.exams[mod.id];
    const partial = savedProgress(state, `exam:${mod.id}`);
    sheet(h('div', { class: 'node-sheet' },
      h('span', { class: 'kicker' }, `Módulo ${mod.index}`),
      h('h3', {}, `Evaluación: ${mod.title}`),
      h('p', { class: 'muted' }, `${mod.exam.size || 8} preguntas. Aprobado: ${Math.round(PASS_EXAM * 100)}%.`),
      rec ? h('p', { class: 'small muted' }, `Mejor nota: ${Math.round(rec.best * 100)}%${rec.passed ? ' · superada' : ''}`) : null,
      open
        ? h('a', { class: 'btn btn-primary btn-block', href: `#/exam/${mod.id}` }, partial ? `Continuar (paso ${partial.furthest + 1} de ${partial.queue.length})` : done ? 'Repetir evaluación' : 'Empezar evaluación')
        : h('p', { class: 'locked-note' }, icon('lock', { size: 16 }), 'Completa las tres lecciones del módulo para desbloquearla.')), { label: 'Evaluación' });
  }
}
