// Arranque de la aplicación: carga el temario, el progreso y gestiona la navegación.
import { buildCourse, CONTENT_FILES } from './core/course.js';
import { loadState, saveState } from './core/state.js';
import { recordAnswer, clearMistake } from './core/progress.js';
import { checkAchievements } from './core/achievements.js';
import { h, clear } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/fx.js';
import { renderHome } from './views/home.js';
import { renderAcademy } from './views/academy.js';
import { renderLab, openLabChallenge } from './views/lab.js';
import { renderMissions, openMission } from './views/missions.js';
import { renderProfile } from './views/profile.js';
import { openLesson, openExam, openReview } from './views/activities.js';

const TABS = [
  { id: 'home', label: 'Inicio', icon: 'home', render: renderHome },
  { id: 'academy', label: 'Academia', icon: 'map', render: renderAcademy },
  { id: 'lab', label: 'Laboratorio', icon: 'terminal', render: renderLab },
  { id: 'missions', label: 'Misiones', icon: 'flag', render: renderMissions },
  { id: 'profile', label: 'Perfil', icon: 'user', render: renderProfile },
];

let storage;
try {
  storage = window.localStorage;
  storage.setItem('cca.test', '1');
  storage.removeItem('cca.test');
} catch {
  storage = null;
}

async function loadContent() {
  const get = path => fetch(path).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });
  const [course, missions, lab, ...modules] = await Promise.all([
    get(CONTENT_FILES.course), get(CONTENT_FILES.missions), get(CONTENT_FILES.lab), ...CONTENT_FILES.modules.map(get),
  ]);
  return buildCourse({ course, missions, lab, modules });
}

function applySettings(state) {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'auto';
}

async function main() {
  const app = document.getElementById('app');
  let course;
  try {
    course = await loadContent();
  } catch (error) {
    clear(app).append(h('div', { class: 'fatal' }, icon('warn', { size: 32 }), h('h2', {}, 'No se pudo cargar el temario'),
      h('p', { class: 'muted' }, 'Abre la app con conexión una vez para descargar el contenido. Después funcionará sin Internet.'),
      h('pre', { class: 'small' }, String(error.message))));
    return;
  }

  const state = storage ? loadState(storage) : loadState({ getItem: () => null });
  applySettings(state);

  const view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Navegación principal' });
  const banner = h('div', { class: 'storage-banner', hidden: Boolean(storage) }, icon('warn', { size: 16 }),
    'Tu navegador no permite guardar datos (¿modo privado?). El progreso se perderá al cerrar.');
  clear(app).append(banner, view, nav);

  const ctx = {
    course,
    state,
    storageOk: Boolean(storage),
    /** Guarda el estado y comprueba logros. Devuelve los logros nuevos. */
    commit() {
      const unlocked = checkAchievements(state, course);
      if (storage && !saveState(storage, state)) {
        banner.hidden = false;
        banner.lastChild.textContent = 'No se pudo guardar el progreso: el almacenamiento está lleno o bloqueado.';
      }
      return unlocked;
    },
    recordAnswer(ex, ok) { recordAnswer(state, ex, ok); ctx.commit(); },
    recordMistake(ex) {
      const prev = state.mistakes[ex.id];
      state.mistakes[ex.id] = { count: (prev?.count || 0) + 1, last: new Date().toISOString().slice(0, 10) };
    },
    clearMistake(id) { clearMistake(state, id); },
    onCommand() { state.stats.commands += 1; },
    applySettings: () => applySettings(state),
    go(route) {
      if (location.hash === route) render();
      else location.hash = route;
    },
    refresh: () => render(),
  };

  function paintNav(active) {
    clear(nav);
    for (const tab of TABS) {
      nav.append(h('a', {
        href: `#/${tab.id}`, class: `tab ${tab.id === active ? 'active' : ''}`,
        'aria-current': tab.id === active ? 'page' : null,
      }, icon(tab.icon, { size: 24 }), h('span', {}, tab.label)));
    }
  }

  function render() {
    const hash = location.hash || '#/home';
    const [, section = 'home', param] = hash.split('/');
    // Volver atrás con el navegador cierra una actividad abierta.
    document.querySelectorAll('.activity, .editor, .sheet, .sheet-backdrop').forEach(el => el.remove());
    document.body.classList.remove('in-activity');

    const activities = { lesson: openLesson, exam: openExam, review: openReview, mission: openMission, challenge: openLabChallenge };
    if (activities[section]) {
      const ok = activities[section](ctx, param);
      if (ok !== false) return;
      toast('Esa actividad todavía está bloqueada.', { iconName: 'lock' });
      location.replace('#/academy');
      return;
    }
    const tab = TABS.find(t => t.id === section) || TABS[0];
    paintNav(tab.id);
    clear(view);
    const page = h('div', { class: 'page enter' });
    view.append(page);
    tab.render(page, ctx);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    state.lastRoute = hash;
  }

  window.addEventListener('hashchange', render);
  render();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  // Solo es una actualización si ya había un Service Worker controlando la página.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'activated' && hadController) {
          toast('Contenido actualizado. Se aplicará al volver a abrir la app.', { iconName: 'refresh' });
        }
      });
    });
  }).catch(() => { /* sin SW la app sigue funcionando online */ });
  navigator.storage?.persist?.().catch(() => {});
}

main();
