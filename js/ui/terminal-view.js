// Componente visual de terminal: salida, entrada, historial, atajos táctiles y editor de archivos.
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { displayPath } from '../terminal/fs.js';

export function createTerminal({ shell, suggestions = [], intro = [], onRun, compact = false }) {
  const output = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
  const promptEl = h('span', { class: 'term-prompt' });
  const input = h('input', {
    class: 'term-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Comando',
  });
  const modeBtn = h('button', { class: 'term-key', type: 'button', title: 'Shift+Tab: cambiar modo de permisos', onclick: () => { exec(null, 'shift-tab'); input.focus(); } }, '⇧Tab');
  const upBtn = h('button', { class: 'term-key', type: 'button', 'aria-label': 'Comando anterior', onclick: () => { recall(-1); input.focus(); } }, '↑');
  const chips = h('div', { class: 'term-chips' });
  let histIndex = null;

  const el = h('div', { class: `term ${compact ? 'term-compact' : ''}` },
    h('div', { class: 'term-bar' },
      h('span', { class: 'dot r' }), h('span', { class: 'dot y' }), h('span', { class: 'dot g' }),
      h('span', { class: 'term-title' }, 'terminal simulada'),
    ),
    output,
    h('form', { class: 'term-form', onsubmit: e => { e.preventDefault(); exec(input.value); } }, promptEl, input),
    h('div', { class: 'term-tools' }, upBtn, modeBtn, chips),
  );
  el.addEventListener('click', e => { if (e.target === output || e.target === el) input.focus({ preventScroll: true }); });

  function write(lines) {
    for (const l of lines) output.append(h('div', { class: `tl tl-${l.kind || 'out'}` }, l.text));
    output.scrollTop = output.scrollHeight;
  }

  function refreshPrompt() {
    promptEl.textContent = shell.prompt();
    el.classList.toggle('in-session', shell.mode === 'claude');
    modeBtn.hidden = shell.mode !== 'claude';
    const list = shell.mode === 'claude' ? (suggestions.session || ['/help', '/context', '/memory', '/exit']) : (suggestions.shell || suggestions);
    clear(chips);
    for (const s of (Array.isArray(list) ? list : [])) {
      // Un atajo que termina en espacio se escribe para completarlo; si no, se ejecuta directamente.
      chips.append(h('button', {
        class: 'chip', type: 'button',
        onclick: () => { if (s.endsWith(' ')) { input.value = s; input.focus(); } else exec(s); },
      }, s.trim()));
    }
  }

  function exec(value, special) {
    let result;
    let shown;
    if (special === 'shift-tab') {
      result = shell.shiftTab();
      shown = '⇧Tab';
    } else {
      const text = String(value ?? '').trim();
      input.value = '';
      histIndex = null;
      if (!text) return;
      shown = text;
      result = shell.run(text);
    }
    if (!special) output.append(h('div', { class: 'tl tl-cmd' }, h('span', { class: 'tl-p' }, `${lastPrompt} `), shown));
    if (result.action?.type === 'clear') clear(output);
    write(result.lines || []);
    lastPrompt = shell.prompt();
    refreshPrompt();
    if (result.action?.type === 'edit') openEditor(result.action.path);
    onRun?.(result, shown);
  }

  function recall(dir) {
    const hist = shell.history;
    if (!hist.length) return;
    histIndex = histIndex === null ? hist.length - 1 : Math.max(0, Math.min(hist.length - 1, histIndex + (dir < 0 ? -1 : 1)));
    input.value = hist[histIndex];
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); recall(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); recall(1); }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); exec(null, 'shift-tab'); }
  });

  function openEditor(path) {
    const existing = shell.fs.read(path);
    const area = h('textarea', { class: 'editor-area', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', 'aria-label': `Contenido de ${displayPath(path)}` });
    area.value = existing ?? '';
    const close = () => { overlay.classList.add('out'); setTimeout(() => overlay.remove(), 200); input.focus({ preventScroll: true }); };
    const overlay = h('div', { class: 'editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor' },
      h('div', { class: 'editor-head' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: close }, 'Cancelar'),
        h('div', { class: 'editor-name' }, icon('edit', { size: 16 }), displayPath(path), existing === null ? h('span', { class: 'pill' }, 'nuevo') : null),
        h('button', {
          class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
            const err = shell.saveFile(path, area.value.endsWith('\n') || !area.value ? area.value : area.value + '\n');
            write([{ text: err ? `No se pudo guardar: ${err}` : `Guardado ${displayPath(path)} (${area.value.split('\n').length} líneas)`, kind: err ? 'err' : 'ok' }]);
            close();
            onRun?.({ lines: [], saved: path }, `nano ${displayPath(path)}`);
          },
        }, 'Guardar'),
      ),
      area,
      h('div', { class: 'editor-foot muted' }, 'Editor del simulador · el archivo solo existe en esta academia'),
    );
    document.body.append(overlay);
    setTimeout(() => area.focus(), 50);
  }

  let lastPrompt = shell.prompt();
  write(intro);
  refreshPrompt();
  return { el, write, focus: () => input.focus({ preventScroll: true }), exec, refresh: refreshPrompt, shell };
}
