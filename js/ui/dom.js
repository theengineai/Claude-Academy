// Ayudas mínimas para construir DOM sin frameworks.

/** h('div', { class: 'x', onclick }, ...hijos) — los hijos pueden ser texto, nodos, arrays o null. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') {
      // setProperty admite variables CSS (--x); Object.assign no.
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Markdown mínimo y seguro: **negrita**, *cursiva*, `código`, listas "- " y saltos de línea. */
export function md(text) {
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const blocks = [];
  let list = null;
  for (const raw of String(text ?? '').split('\n')) {
    const item = /^\s*[-•]\s+(.*)$/.exec(raw);
    if (item) {
      if (!list) { list = []; blocks.push(list); }
      list.push(`<li>${inline(item[1])}</li>`);
    } else {
      list = null;
      if (raw.trim()) blocks.push(`<p>${inline(raw)}</p>`);
    }
  }
  return blocks.map(b => (Array.isArray(b) ? `<ul>${b.join('')}</ul>` : b)).join('');
}

export function mdEl(text, cls = 'md') {
  return h('div', { class: cls, html: md(text) });
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}
