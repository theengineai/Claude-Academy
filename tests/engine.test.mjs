// Tests del motor: progreso, XP, racha, desbloqueos, repaso, persistencia, validadores y terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCourse } from './helpers.mjs';
import { defaultState, loadState, saveState, exportState, importState, STORAGE_KEY } from '../js/core/state.js';
import * as P from '../js/core/progress.js';
import { recordConcept, dueConcepts, buildReviewQueue } from '../js/core/srs.js';
import { checkAchievements } from '../js/core/achievements.js';
import { validate, explainFailure } from '../js/core/validate.js';
import { normalize, addDays, shuffle, seededRandom } from '../js/core/util.js';
import { Shell } from '../js/terminal/shell.js';
import { evaluateGoals } from '../js/terminal/goals.js';
import { tokenize, parseFrontmatter } from '../js/terminal/parse.js';

const course = loadCourse();
const memoryStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('XP: completar una lección suma XP y repetir solo suma la mejora', () => {
  const s = defaultState();
  const r1 = P.completeLesson(s, 'l1-1', 0.5, '2026-11-01');
  assert.equal(r1.gained, P.lessonXp(0.5));
  const r2 = P.completeLesson(s, 'l1-1', 0.5, '2026-11-01');
  assert.equal(r2.gained, 0, 'repetir igual no suma');
  const r3 = P.completeLesson(s, 'l1-1', 1, '2026-11-02');
  assert.equal(r3.gained, P.lessonXp(1) - P.lessonXp(0.5), 'solo la mejora');
  assert.equal(s.xp, P.lessonXp(1));
  assert.equal(s.lessons['l1-1'].stars, 3);
});

test('progreso depende del aprendizaje: suspender un examen no desbloquea el módulo', () => {
  const s = defaultState();
  for (const l of course.modules[0].lessons) P.completeLesson(s, l.id, 1);
  assert.ok(P.isExamUnlocked(s, course, 'm1'));
  assert.ok(!P.isModuleUnlocked(s, course, 'm2'));
  const fail = P.completeExam(s, 'm1', 0.5);
  assert.equal(fail.passed, false);
  assert.equal(fail.gained, 0);
  assert.ok(!P.isModuleUnlocked(s, course, 'm2'));
  const pass = P.completeExam(s, 'm1', 0.75);
  assert.equal(pass.passed, true);
  assert.ok(P.isModuleUnlocked(s, course, 'm2'));
  assert.ok(P.isLessonUnlocked(s, course, 'l2-1'));
  assert.ok(!P.isLessonUnlocked(s, course, 'l2-2'), 'las lecciones se desbloquean en orden');
});

test('desbloqueo secuencial de lecciones y misiones', () => {
  const s = defaultState();
  assert.ok(P.isLessonUnlocked(s, course, 'l1-1'));
  assert.ok(!P.isLessonUnlocked(s, course, 'l1-2'));
  assert.ok(!P.isMissionUnlocked(s, course, 'ms01'));
  P.completeLesson(s, 'l1-1', 1);
  P.completeLesson(s, 'l1-2', 1);
  assert.ok(P.isMissionUnlocked(s, course, 'ms01'));
  assert.ok(!P.isMissionUnlocked(s, course, 'ms12'), 'proyecto final bloqueado');
});

test('niveles L2 → L5 y rangos de XP', () => {
  const s = defaultState();
  assert.equal(P.masteryLevel(s, course), 'L2');
  for (const m of course.modules.slice(0, 2)) s.exams[m.id] = { passed: true };
  assert.equal(P.masteryLevel(s, course), 'L3');
  for (const m of course.modules.slice(0, 4)) s.exams[m.id] = { passed: true };
  assert.equal(P.masteryLevel(s, course), 'L4');
  for (const m of course.modules) s.exams[m.id] = { passed: true };
  assert.equal(P.masteryLevel(s, course), 'L4', 'L5 exige también el proyecto final');
  s.missions.ms12 = { completedAt: 'x' };
  assert.equal(P.masteryLevel(s, course), 'L5');
  assert.equal(P.rankInfo(0).rank, 1);
  assert.equal(P.rankInfo(60).rank, 2);
  assert.ok(P.rankInfo(100).progress > 0 && P.rankInfo(100).progress < 1);
});

test('racha: días consecutivos y tolerancia hasta el final del día', () => {
  const s = defaultState();
  for (const d of ['2026-11-05', '2026-11-06', '2026-11-07']) P.touchDay(s, d);
  assert.equal(P.streak(s, '2026-11-07'), 3);
  assert.equal(P.streak(s, '2026-11-08'), 3, 'hoy aún sin actividad: la racha sigue');
  assert.equal(P.streak(s, '2026-11-09'), 0, 'un día sin actividad la rompe');
  P.touchDay(s, '2026-11-01');
  assert.equal(P.bestStreak(s), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('repaso espaciado: fallar programa repaso hoy; acertar lo espacia', () => {
  const s = defaultState();
  recordConcept(s, 'ctx.claude-md', false, '2026-11-01');
  assert.equal(s.concepts['ctx.claude-md'].due, '2026-11-01');
  assert.deepEqual(dueConcepts(s, '2026-11-01'), ['ctx.claude-md']);
  recordConcept(s, 'ctx.claude-md', true, '2026-11-01');
  recordConcept(s, 'ctx.claude-md', true, '2026-11-02');
  assert.ok(s.concepts['ctx.claude-md'].due > '2026-11-02');
  assert.ok(s.concepts['ctx.claude-md'].score > 0.3);
});

test('repaso inteligente: prioriza errores y solo usa lecciones vistas', () => {
  const s = defaultState();
  P.completeLesson(s, 'l1-1', 0.5);
  const ex = course.exercises.m1l1e1.exercise;
  P.recordAnswer(s, ex, false);
  const queue = buildReviewQueue(s, course);
  assert.equal(queue[0].id, 'm1l1e1');
  assert.ok(queue.every(e => course.exercises[e.id].source.id === 'l1-1'));
  P.clearMistake(s, 'm1l1e1');
  assert.ok(!s.mistakes.m1l1e1);
});

test('dominio por competencia refleja aciertos y fallos', () => {
  const s = defaultState();
  const before = P.competencyMastery(s, course).find(c => c.id === 'contexto').mastery;
  assert.equal(before, 0);
  for (const c of Object.values(course.concepts).filter(c => c.competency === 'contexto')) recordConcept(s, c.id, true);
  const after = P.competencyMastery(s, course).find(c => c.id === 'contexto').mastery;
  assert.equal(after, 70);
  for (const c of Object.values(course.concepts).filter(c => c.competency === 'contexto')) recordConcept(s, c.id, false);
  assert.ok(P.competencyMastery(s, course).find(c => c.id === 'contexto').mastery < after);
});

test('recomendaciones y siguiente paso', () => {
  const s = defaultState();
  assert.equal(P.nextStep(s, course).id, 'l1-1');
  for (const l of course.modules[0].lessons) P.completeLesson(s, l.id, 1);
  assert.equal(P.nextStep(s, course).kind, 'exam');
  const recs = P.recommendations(s, course);
  assert.ok(recs.some(r => r.kind === 'exam'));
  assert.ok(recs.some(r => r.kind === 'mission'));
});

test('logros se desbloquean por hechos reales', () => {
  const s = defaultState();
  assert.deepEqual(checkAchievements(s, course), []);
  P.completeLesson(s, 'l1-1', 1);
  const got = checkAchievements(s, course).map(a => a.id);
  assert.ok(got.includes('first-lesson') && got.includes('perfect'));
  assert.deepEqual(checkAchievements(s, course), [], 'no se repiten');
});

test('persistencia: guardar, recargar, exportar e importar', () => {
  const storage = memoryStorage();
  const s = defaultState();
  P.completeLesson(s, 'l1-1', 1);
  assert.ok(saveState(storage, s));
  const loaded = loadState(storage);
  assert.equal(loaded.xp, s.xp);
  assert.ok(loaded.lessons['l1-1'].completedAt);

  storage.setItem(STORAGE_KEY, '{roto');
  assert.equal(loadState(storage).xp, 0, 'datos corruptos → estado nuevo');

  const exported = exportState(s);
  const tampered = JSON.parse(exported);
  tampered.state.xp = 999999;
  const imported = importState(JSON.stringify(tampered), P.recomputeXp);
  assert.ok(imported.ok);
  assert.equal(imported.state.xp, s.xp, 'la XP se recalcula, no se acepta la de la copia');
  assert.equal(importState('no json', P.recomputeXp).ok, false);
  assert.equal(importState('{"version":99}', P.recomputeXp).ok, false);
});

test('validadores y feedback específico', () => {
  const multi = { type: 'multi', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }] };
  assert.ok(validate(multi, [1, 0]).ok);
  const r = validate(multi, [0, 2]);
  assert.ok(!r.ok);
  assert.match(explainFailure(multi, r), /faltado/);
  assert.match(explainFailure(multi, r), /no aplica/);
  const fill = { type: 'fill', blanks: [{ accept: ['plan'] }] };
  assert.ok(validate(fill, ['  PLAN ']).ok);
  const editor = { type: 'editor', checks: [{ label: 'JSON', json: true }, { label: 'sin X', pattern: 'X', negate: true }] };
  assert.ok(validate(editor, '{"a":1}').ok);
  assert.ok(!validate(editor, '{"a":1,}').ok);
  assert.equal(normalize('  Árbol   "limpio" '), 'arbol limpio');
  const shuffled = shuffle([1, 2, 3, 4], seededRandom(1));
  assert.notDeepEqual(shuffled, [1, 2, 3, 4]);
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4]);
});

test('terminal: navegación, archivos y errores simulados', () => {
  const sh = new Shell({ files: { '~/p/a.txt': 'hola\n', '~/p/sub/': null }, cwd: '~' });
  assert.equal(sh.run('pwd').lines[0].text, '/home/alumno');
  sh.run('cd p');
  assert.equal(sh.cwd, '/home/alumno/p');
  assert.match(sh.run('ls').lines[0].text, /a\.txt/);
  assert.equal(sh.run('cat a.txt').lines[0].text, 'hola');
  assert.equal(sh.run('cat nada.txt').lines[0].kind, 'err');
  assert.equal(sh.run('mkdir x/y').lines[0].kind, 'err', 'sin -p falla');
  sh.run('mkdir -p x/y');
  assert.ok(sh.fs.isDir('/home/alumno/p/x/y'));
  sh.run('echo "uno dos" > x/y/n.txt');
  assert.equal(sh.fs.read('/home/alumno/p/x/y/n.txt'), 'uno dos\n');
  assert.equal(sh.run('rm sub').lines.length, 0);
  assert.equal(sh.run('/init').lines[0].kind, 'err', 'comandos / fuera de sesión');
  assert.equal(sh.run('nano a.txt').action.type, 'edit');
  assert.equal(sh.run('sudo rm -rf /').lines[0].kind, 'err');
  assert.ok(sh.fs.exists('/home/alumno'), 'no ejecuta nada real');
});

test('terminal: sesión de Claude, modos y comandos /', () => {
  const sh = new Shell({ files: { '~/p/CLAUDE.md': '# P\n' }, cwd: '~/p' });
  sh.run('claude --permission-mode plan');
  assert.equal(sh.mode, 'claude');
  assert.equal(sh.session.permissionMode, 'plan');
  sh.shiftTab();
  assert.equal(sh.session.permissionMode, 'auto');
  sh.shiftTab();
  assert.equal(sh.session.permissionMode, 'default');
  sh.shiftTab();
  assert.equal(sh.session.permissionMode, 'acceptEdits');
  assert.match(sh.run('/memory').lines.map(l => l.text).join('\n'), /CLAUDE\.md/);
  assert.match(sh.run('/context').lines[1].text, /200k/);
  sh.run('/exit');
  assert.equal(sh.mode, 'shell');
  assert.equal(sh.run('claude --permission-mode yolo').lines[0].kind, 'err');
  assert.equal(sh.run('claude --frobnicate').lines[0].kind, 'err');
  sh.run('claude -c');
  assert.equal(sh.mode, 'claude', 'continúa la sesión anterior');
});

test('terminal: claude mcp add valida transporte, ámbito y sintaxis', () => {
  const sh = new Shell({ cwd: '~/p', files: { '~/p/': null } });
  assert.equal(sh.run('claude mcp add docs https://x.ejemplo.com/mcp').lines[0].kind, 'err', 'sin --transport');
  assert.equal(sh.run('claude mcp add --transport http').lines[0].kind, 'err', 'sin nombre');
  assert.equal(sh.run('claude mcp add --transport ftp a b').lines[0].kind, 'err');
  sh.run('claude mcp add --transport http --scope project docs https://x.ejemplo.com/mcp');
  sh.run('claude mcp add --env KEY=1 --transport stdio --scope user hojas -- npx -y servidor');
  const goals = evaluateGoals([
    { type: 'mcp', name: 'docs', scope: 'project', transport: 'http' },
    { type: 'mcp', name: 'hojas', scope: 'user', transport: 'stdio' },
    { type: 'json', path: '.mcp.json', expect: { 'mcpServers.docs.url': 'https://x.ejemplo.com/mcp' } },
  ], sh);
  assert.ok(goals.every(g => g.passed));
  sh.run('claude mcp remove docs');
  assert.ok(!evaluateGoals([{ type: 'mcp', name: 'docs' }], sh)[0].passed);
});

test('terminal: skills con argumentos y diagnóstico', () => {
  const sh = new Shell({ cwd: '~/p', files: { '~/p/.claude/skills/cierre/SKILL.md': '---\nname: cierre\ndescription: Prepara el cierre\n---\nCierre de $ARGUMENTS ($0)\n', '~/p/.claude/settings.json': '{ "permissions": { "allow": [], } }' } });
  assert.ok(sh.run('claude doctor').lines.some(l => /Settings Error/.test(l.text)));
  sh.run('claude');
  const out = sh.run('/cierre 2026-10').lines.map(l => l.text).join('\n');
  assert.match(out, /Cierre de 2026-10 \(2026-10\)/);
  assert.equal(parseFrontmatter('---\nname: a\nx: true\n---\nbody').data.x, true);
  assert.deepEqual(tokenize('echo "a b" > f').tokens, ['echo', 'a b', { op: '>' }, 'f']);
});

test('terminal: el estado del laboratorio se serializa y restaura', () => {
  const sh = new Shell({ cwd: '~' });
  sh.run('mkdir -p demo');
  sh.run('cd demo');
  const copy = new Shell({ snapshot: JSON.parse(JSON.stringify(sh.toJSON())) });
  assert.equal(copy.cwd, '/home/alumno/demo');
  assert.ok(copy.fs.isDir('/home/alumno/demo'));
});
