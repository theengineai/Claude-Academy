// Misiones: casos prácticos evaluables y proyecto final.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { runSession, savedProgress } from './session.js';
import { stepsSignature } from '../core/course.js';
import { isMissionUnlocked, completeMission, missionXp } from '../core/progress.js';

const DIFFICULTY = { 1: 'Básica', 2: 'Intermedia', 3: 'Avanzada' };

function lockReason(ctx, m) {
  const { course, state } = ctx;
  if (m.final) return 'Supera las seis evaluaciones de módulo.';
  const missing = (m.requires || []).filter(id => !state.lessons[id]?.completedAt).map(id => course.lessonById[id]?.title);
  return missing.length ? `Completa: ${missing.join(', ')}.` : `Desbloquea el módulo ${course.moduleById[m.module].index}.`;
}

export function renderMissions(page, ctx) {
  const { course, state } = ctx;
  const done = course.missions.filter(m => state.missions[m.id]?.completedAt).length;
  page.append(h('header', { class: 'page-head' },
    h('span', { class: 'kicker' }, `${done} de ${course.missions.length} completadas`), h('h1', {}, 'Misiones'),
    h('p', { class: 'muted' }, 'Casos reales en varios pasos: configurar, escribir, decidir y depurar. Cada paso se valida y te dice exactamente qué falta.')));

  for (const mod of course.modules) {
    const list = course.missions.filter(m => m.module === mod.id);
    if (!list.length) continue;
    page.append(h('h2', { class: 'section-title' }, `Módulo ${mod.index} · ${mod.title}`));
    for (const m of list) page.append(missionCard(ctx, m));
  }
}

function missionCard(ctx, m) {
  const { course, state } = ctx;
  const rec = state.missions[m.id];
  const open = isMissionUnlocked(state, course, m.id);
  const types = [...new Set(m.steps.map(s => s.type))];
  const typeIcons = { terminal: 'terminal', editor: 'edit', spot: 'warn', choice: 'target', order: 'layers', match: 'link', fill: 'edit', multi: 'check' };
  return h('a', { class: `card mission ${open ? '' : 'locked'} ${rec ? 'done' : ''} ${m.final ? 'final' : ''}`, href: open ? `#/mission/${m.id}` : null, 'aria-disabled': open ? null : 'true' },
    h('div', { class: 'mission-top' },
      h('span', { class: 'mission-icon' }, icon(rec ? 'check' : open ? (m.final ? 'crown' : 'flag') : 'lock', { size: 22 })),
      h('div', { class: 'grow' },
        h('span', { class: 'kicker' }, `${m.final ? 'Proyecto final' : `Misión ${m.index}`} · ${DIFFICULTY[m.difficulty] || ''}`),
        h('strong', {}, m.title)),
      h('span', { class: 'pill pill-xp' }, icon('bolt', { size: 14 }), `${m.xp}`)),
    h('p', { class: 'small' }, m.summary),
    h('div', { class: 'mission-meta' },
      h('span', { class: 'small muted' }, `${m.steps.length} pasos`),
      h('span', { class: 'type-icons' }, types.map(t => icon(typeIcons[t] || 'spark', { size: 14 }))),
      rec ? h('span', { class: 'small ok-ink' }, `Mejor: ${Math.round(rec.best * 100)}% a la primera`) : null,
      savedProgress(state, `mission:${m.id}`) ? h('span', { class: 'pill pill-partial' }, 'A medias') : null),
    open ? null : h('p', { class: 'locked-note small' }, icon('lock', { size: 14 }), lockReason(ctx, m)));
}

export function openMission(ctx, missionId) {
  const { course, state } = ctx;
  const m = course.missionById[missionId];
  if (!m || !isMissionUnlocked(state, course, missionId)) return false;
  const intro = {
    type: 'card',
    kicker: m.final ? 'Proyecto final' : `Misión ${m.index}`,
    title: m.title,
    blocks: [
      { type: 'text', body: m.brief },
      { type: 'callout', tone: 'finance', title: 'Escenario', body: m.scenario },
      { type: 'text', title: 'Lo que vas a hacer', body: m.steps.map((s, i) => `- Paso ${i + 1}: ${s.title || s.prompt.replace(/\*\*|`/g, '').slice(0, 80)}`).join('\n') },
      { type: 'callout', tone: 'info', body: `Recompensa: hasta **${m.xp} XP**, según los pasos que resuelvas a la primera. Si fallas, verás qué criterio no se cumple; tras dos intentos podrás ver una solución.` },
    ],
  };
  runSession(ctx, {
    kind: 'mission',
    title: m.title,
    steps: [intro, ...m.steps],
    exitRoute: '#/missions',
    resumeKey: `mission:${m.id}`,
    sig: stepsSignature(m.steps),
    onFinish: ({ accuracy }) => {
      const r = completeMission(state, m, accuracy);
      const achievements = ctx.commit();
      return {
        icon: m.final ? 'crown' : 'flag',
        title: m.final ? '¡Proyecto final completado!' : 'Misión cumplida',
        subtitle: m.title,
        gained: r.gained,
        achievements,
        note: r.gained === 0 && !r.firstTime ? `Ya tenías ${missionXp(m, state.missions[m.id].best)} XP de esta misión: solo suma si mejoras tu resultado.` : (m.debrief || null),
        retryRoute: `#/mission/${m.id}`,
        nextRoute: '#/missions',
      };
    },
  });
}
