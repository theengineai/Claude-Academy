import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ask, suggestions } from '../js/core/assistant.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const entries = read('content/glossary.json').entries;
const course = read('content/course.json');

test('ids únicos y related válidos', () => {
  const ids = new Set(entries.map(e => e.id));
  assert.equal(ids.size, entries.length);
  for (const e of entries) for (const r of e.related || []) assert.ok(ids.has(r), `${e.id} → ${r}`);
});

test('cada término se recupera a sí mismo en primer lugar', () => {
  for (const e of entries) {
    const r = ask(entries, e.term);
    assert.equal(r.results[0]?.entry.id, e.id, `«${e.term}» devolvió ${r.results[0]?.entry.id}`);
  }
});

test('preguntas naturales y erratas', () => {
  const top = q => ask(entries, q).results[0]?.entry.id;
  assert.equal(top('¿Qué es datos/?'), 'datos');
  assert.equal(top('que es shell'), 'shell');
  assert.equal(top('qué significa claude -p'), 'claude-p');
  assert.equal(top('shel'), 'shell');
  assert.equal(top('terminl'), 'terminal');
  assert.equal(ask(entries, 'receta de paella').confidence, 'none');
  assert.equal(ask(entries, '').confidence, 'none');
});

test('todos los conceptos del curso tienen respuesta', () => {
  const covered = new Set(entries.flatMap(e => e.concepts || []));
  const all = JSON.stringify(course).match(/"id":\s*"([a-z]+\.[a-z0-9-]+)"/g).map(s => s.match(/"([^"]+)"$/)[1]);
  for (const c of new Set(all)) assert.ok(covered.has(c), `sin entrada: ${c}`);
});

test('los comandos de los bloques cmds se resuelven', () => {
  const cmds = new Set();
  for (const f of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
    const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.type === 'cmds') for (const it of o.items || []) cmds.add(it.cmd || it[0] || it); Object.values(o).forEach(walk); } };
    walk(read(`content/modules/${f}.json`));
  }
  for (const c of cmds) if (typeof c === 'string') assert.notEqual(ask(entries, c).confidence, 'none', `sin respuesta: ${c}`);
});

test('sugerencias por lección', () => {
  assert.ok(suggestions(entries, 'l1-t').length > 0);
  assert.ok(suggestions(entries, null).every(e => e.popular));
});
