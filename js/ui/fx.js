// Microinteracciones: avisos, confeti, contadores y hojas inferiores.
import { h } from './dom.js';
import { icon } from './icons.js';

export function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduced'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function toast(message, { kind = 'info', iconName = 'info', duration = 2600 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${kind}` }, icon(iconName, { size: 18 }), h('span', {}, message));
  host.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, duration);
}

/** Confeti ligero con canvas. Se omite si el usuario pide menos movimiento. */
export function confetti() {
  if (reducedMotion()) return;
  const canvas = h('canvas', { class: 'confetti' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#C96442', '#E4A47C', '#4F8A5B', '#D9A43B', '#F2E8DA', '#6E8FB3'];
  const parts = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 12 - 4,
    r: Math.random() * 6 + 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = now => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (now - start < 2200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Anima un número desde 0 hasta value. */
export function countUp(el, value, { duration = 900, prefix = '', suffix = '' } = {}) {
  if (reducedMotion() || value === 0) { el.textContent = `${prefix}${value}${suffix}`; return; }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${prefix}${Math.round(value * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Hoja inferior modal. Devuelve una función para cerrarla. */
export function sheet(content, { onClose, label = 'Detalle' } = {}) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, h('div', { class: 'sheet-handle' }), content);
  const close = () => {
    backdrop.classList.add('out');
    panel.classList.add('out');
    setTimeout(() => { backdrop.remove(); panel.remove(); onClose?.(); }, 220);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop, panel);
  panel.querySelector('button, [tabindex]')?.focus({ preventScroll: true });
  return close;
}

/** Confirmación con hoja inferior. Resuelve true/false. */
export function confirmSheet({ title, body, confirm = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    const close = sheet(h('div', { class: 'confirm' },
      h('h3', {}, title),
      body ? h('p', { class: 'muted' }, body) : null,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn btn-ghost grow', onclick: () => close() }, cancel),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'} grow`, onclick: () => { result = true; close(); } }, confirm)),
    ), { onClose: () => resolve(result), label: title });
  });
}

/** Anillo de progreso SVG. */
export function ring(progress, { size = 56, stroke = 6, cls = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const wrap = h('div', { class: `ring ${cls}`, style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  return wrap;
}
