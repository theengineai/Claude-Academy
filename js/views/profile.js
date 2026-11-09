// Perfil: estadísticas, competencias, logros, ajustes, copias de seguridad e instalación.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmSheet, toast, sheet } from '../ui/fx.js';
import { formatNumber } from '../core/util.js';
import { exportState, importState, defaultState } from '../core/state.js';
import { ACHIEVEMENTS } from '../core/achievements.js';
import {
  streak, bestStreak, rankInfo, masteryLevel, competencyMastery, overallMastery, recomputeXp,
} from '../core/progress.js';

export function renderProfile(page, ctx) {
  const { course, state } = ctx;
  const level = masteryLevel(state, course);
  const levelInfo = course.levels.find(l => l.id === level);
  const rank = rankInfo(state.xp);
  const lessonsDone = Object.values(state.lessons).filter(l => l.completedAt).length;
  const missionsDone = Object.values(state.missions).filter(m => m.completedAt).length;
  const examsPassed = Object.values(state.exams).filter(e => e.passed).length;
  const accuracy = state.stats.answers ? Math.round((state.stats.correct / state.stats.answers) * 100) : 0;

  page.append(h('header', { class: 'profile-head' },
    h('div', { class: 'level-badge big' }, level),
    h('div', {},
      h('span', { class: 'kicker' }, 'Nivel de dominio'),
      h('h1', {}, levelInfo?.title || level),
      h('p', { class: 'small muted' }, levelInfo?.description || ''))));

  const stat = (value, label, iconName) => h('div', { class: 'tile' }, icon(iconName, { size: 18 }), h('strong', {}, value), h('span', {}, label));
  page.append(h('section', { class: 'tiles' },
    stat(formatNumber(state.xp), `XP · rango ${rank.rank}`, 'bolt'),
    stat(String(streak(state)), `racha (mejor ${bestStreak(state)})`, 'flame'),
    stat(`${lessonsDone}/${course.lessons.length}`, 'lecciones', 'book'),
    stat(`${missionsDone}/${course.missions.length}`, 'misiones', 'flag'),
    stat(`${examsPassed}/${course.modules.length}`, 'evaluaciones', 'trophy'),
    stat(`${accuracy}%`, 'precisión global', 'target')));

  // Competencias
  const comps = competencyMastery(state, course);
  page.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Dominio por competencia'), h('span', { class: 'small muted' }, `${overallMastery(state, course)}% global`)),
    h('p', { class: 'small muted' }, 'Se calcula con tus respuestas: sube al acertar y baja al fallar. Los conceptos no practicados cuentan como 0.'),
    h('div', { class: 'competencies' }, comps.map(c => h('div', { class: 'comp' },
      h('div', { class: 'comp-row' }, h('span', {}, c.title),
        h('span', {}, h('span', { class: 'small muted' }, `${c.seen}/${c.total} conceptos · `), h('strong', {}, `${c.mastery}%`))),
      h('div', { class: 'bar thin' }, h('div', { class: `bar-fill ${c.mastery >= 75 ? 'good' : c.mastery >= 40 ? 'mid' : 'low'}`, style: { width: `${c.mastery}%` } })))))));

  // Logros
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
  page.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Logros'), h('span', { class: 'small muted' }, `${unlocked}/${ACHIEVEMENTS.length}`)),
    h('div', { class: 'achievements' }, ACHIEVEMENTS.map(a => {
      const got = state.achievements[a.id];
      return h('button', {
        class: `ach ${got ? 'got' : ''}`, type: 'button',
        onclick: () => toast(`${a.title}: ${a.desc}${got ? ' (conseguido)' : ''}`, { iconName: a.icon }),
      }, h('span', { class: 'ach-icon' }, icon(got ? a.icon : 'lock', { size: 22 })), h('span', { class: 'ach-name' }, a.title));
    }))));

  // Ajustes
  const goalSelect = h('select', { 'aria-label': 'Objetivo diario', onchange: e => { state.settings.dailyGoal = Number(e.target.value); ctx.commit(); toast('Objetivo actualizado', { iconName: 'target' }); } },
    [20, 30, 50, 80].map(v => h('option', { value: v, selected: state.settings.dailyGoal === v }, `${v} XP al día`)));
  const themeSelect = h('select', { 'aria-label': 'Tema', onchange: e => { state.settings.theme = e.target.value; ctx.commit(); ctx.applySettings(); } },
    [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => h('option', { value: v, selected: state.settings.theme === v }, l)));
  const motion = h('input', { type: 'checkbox', role: 'switch', checked: state.settings.reducedMotion, onchange: e => { state.settings.reducedMotion = e.target.checked; ctx.commit(); ctx.applySettings(); } });
  page.append(h('section', { class: 'card settings' },
    h('h2', {}, 'Ajustes'),
    h('label', { class: 'setting' }, h('span', {}, 'Objetivo diario'), goalSelect),
    h('label', { class: 'setting' }, h('span', {}, 'Tema'), themeSelect),
    h('label', { class: 'setting' }, h('span', {}, 'Reducir animaciones'), motion)));

  // Datos
  page.append(h('section', { class: 'card' },
    h('h2', {}, 'Tus datos'),
    h('p', { class: 'small muted' }, 'El progreso se guarda solo en este dispositivo y navegador. No hay cuentas, servidores ni seguimiento. Exporta una copia de vez en cuando.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => downloadBackup(state) }, icon('download', { size: 18 }), 'Descargar copia (.json)'),
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => copyBackup(state) }, icon('copy', { size: 18 }), 'Copiar copia al portapapeles'),
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => importDialog(ctx) }, icon('upload', { size: 18 }), 'Restaurar una copia'),
      h('button', { class: 'btn btn-danger-ghost btn-block', type: 'button', onclick: () => resetProgress(ctx) }, icon('trash', { size: 18 }), 'Reiniciar todo el progreso'))));

  // Instalación
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  page.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Instalar en el iPhone'), standalone ? h('span', { class: 'pill ok' }, icon('check', { size: 14 }), 'Instalada') : null),
    h('ol', { class: 'steps-list' },
      h('li', {}, 'Abre esta página en Safari (no en modo privado).'),
      h('li', {}, 'Pulsa Compartir (cuadrado con flecha hacia arriba).'),
      h('li', {}, 'Elige «Añadir a pantalla de inicio» (en iOS recientes puede estar en «Más»).'),
      h('li', {}, 'Confirma con «Añadir» y abre Code Academy desde su icono.')),
    h('p', { class: 'small muted' }, `Funciona sin conexión después de la primera carga completa. ${navigator.serviceWorker?.controller ? 'Contenido offline listo en este dispositivo.' : 'El contenido offline se preparará al recargar con conexión.'}`)));

  page.append(h('section', { class: 'card about' },
    h('h2', {}, 'Acerca de'),
    h('p', { class: 'small muted' }, 'Proyecto educativo independiente, sin relación oficial con Anthropic. Los comandos y conceptos se han contrastado con la documentación oficial de Claude Code (code.claude.com/docs), que puede cambiar: consúltala ante cualquier duda.'),
    h('p', { class: 'small muted' }, 'El simulador reproduce la forma de los comandos; no usa IA ni ejecuta nada real.')));
}

function downloadBackup(state) {
  const blob = new Blob([exportState(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `claude-code-academy-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Copia generada', { iconName: 'download' });
}

async function copyBackup(state) {
  try {
    await navigator.clipboard.writeText(exportState(state));
    toast('Copia en el portapapeles. Guárdala en Notas o Archivos.', { iconName: 'copy' });
  } catch {
    toast('No se pudo copiar. Usa la descarga.', { iconName: 'warn', kind: 'error' });
  }
}

function importDialog(ctx) {
  const area = h('textarea', { class: 'import-area', placeholder: 'Pega aquí el contenido de tu copia (.json)…', spellcheck: 'false' });
  const file = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'file-input', onchange: async e => {
      const f = e.target.files?.[0];
      if (f) area.value = await f.text();
    },
  });
  const close = sheet(h('div', { class: 'stack' },
    h('h3', {}, 'Restaurar copia'),
    h('p', { class: 'small muted' }, 'Sustituirá el progreso actual. La XP se recalcula a partir de las actividades registradas.'),
    h('label', { class: 'btn btn-soft btn-block' }, icon('upload', { size: 18 }), 'Elegir archivo', file),
    area,
    h('button', {
      class: 'btn btn-primary btn-block', type: 'button', onclick: () => {
        const result = importState(area.value, recomputeXp);
        if (!result.ok) { toast(result.errors.join(' '), { kind: 'error', iconName: 'warn', duration: 4000 }); return; }
        Object.keys(ctx.state).forEach(k => delete ctx.state[k]);
        Object.assign(ctx.state, result.state);
        ctx.commit();
        ctx.applySettings();
        close();
        ctx.refresh();
        toast('Progreso restaurado', { iconName: 'check' });
      },
    }, 'Restaurar')), { label: 'Restaurar copia' });
}

async function resetProgress(ctx) {
  const first = await confirmSheet({ title: '¿Reiniciar el progreso?', body: 'Se borrarán XP, racha, lecciones, misiones, logros y el laboratorio. Te recomendamos descargar una copia antes.', confirm: 'Continuar', danger: true });
  if (!first) return;
  const second = await confirmSheet({ title: 'Confirmación final', body: 'Esta acción no se puede deshacer.', confirm: 'Borrar todo', danger: true });
  if (!second) return;
  const fresh = defaultState();
  Object.keys(ctx.state).forEach(k => delete ctx.state[k]);
  Object.assign(ctx.state, fresh);
  ctx.commit();
  ctx.applySettings();
  ctx.go('#/home');
  toast('Progreso reiniciado', { iconName: 'refresh' });
}
