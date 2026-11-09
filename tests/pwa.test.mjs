// Comprobaciones de la PWA: precaché completo, manifest, iconos y recursos sin dependencias externas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, readJson } from './helpers.mjs';
import { BLOCK_TYPES_LIST } from './block-types.mjs';

const RUNTIME_DIRS = ['css', 'js', 'content', 'icons'];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

test('el Service Worker precachea todos los recursos de ejecución', () => {
  const runtime = RUNTIME_DIRS.flatMap(d => walk(join(ROOT, d))).map(p => `./${relative(ROOT, p).split('\\').join('/')}`);
  for (const file of runtime) assert.ok(assets.includes(file), `falta en sw.js: ${file}`);
  for (const file of ['./', './index.html', './manifest.webmanifest']) assert.ok(assets.includes(file));
  for (const a of assets.filter(a => a !== './')) assert.ok(existsSync(join(ROOT, a)), `no existe: ${a}`);
});

test('manifest instalable con iconos existentes', () => {
  const m = readJson('manifest.webmanifest');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url.startsWith('./'), true, 'rutas relativas para GitHub Pages');
  assert.equal(m.scope, './');
  for (const size of ['192x192', '512x512']) assert.ok(m.icons.some(i => i.sizes === size), size);
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(join(ROOT, i.src)), i.src);
});

test('index.html preparado para iOS y sin recursos externos', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="manifest"/);
  assert.ok(!/(src|href)="(https?:)?\/\//.test(html), 'sin CDN ni recursos externos');
  for (const file of walk(join(ROOT, 'js')).concat(walk(join(ROOT, 'css')))) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/(import\s.*from\s+['"]https?:|url\(\s*['"]?https?:|fetch\(\s*['"]https?:)/.test(text), `recurso externo en ${relative(ROOT, file)}`);
  }
  assert.ok(existsSync(join(ROOT, 'icons/apple-touch-icon.png')));
});

test('los módulos JS importan archivos existentes', () => {
  for (const file of walk(join(ROOT, 'js'))) {
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(/from\s+'(\.[^']+)'/g)) {
      assert.ok(existsSync(join(file, '..', spec)), `${relative(ROOT, file)} importa ${spec}`);
    }
  }
});

test('la lista de tipos de bloque coincide con el renderizador', () => {
  const blocks = readFileSync(join(ROOT, 'js/ui/blocks.js'), 'utf8');
  const body = blocks.slice(blocks.indexOf('const renderers'), blocks.indexOf('export function renderBlock'));
  const names = [...body.matchAll(/^  (\w+): /gm)].map(m => m[1]);
  assert.deepEqual(names.sort(), [...BLOCK_TYPES_LIST].sort());
});
