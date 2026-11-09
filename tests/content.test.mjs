// Integridad del temario: estructura, cantidades mínimas y que cada ejercicio tenga solución válida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCourse, allExercises, runSolution } from './helpers.mjs';
import { EXERCISE_TYPES, isExercise } from '../js/core/course.js';
import { validate, runChecks } from '../js/core/validate.js';
import { evaluateGoals, GOAL_TYPES } from '../js/terminal/goals.js';
import { Shell } from '../js/terminal/shell.js';
import { BLOCK_TYPES_LIST } from './block-types.mjs';

const course = loadCourse();
const exercises = allExercises(course);

test('cantidades mínimas del programa', () => {
  assert.equal(course.modules.length, 6, '6 módulos');
  assert.ok(course.lessons.length >= 18, '18+ microlecciones');
  assert.ok(course.missions.length >= 12, '12+ misiones');
  assert.equal(course.missions.filter(m => m.final).length, 1, 'un proyecto final');
  for (const mod of course.modules) {
    assert.equal(mod.lessons.length, 3, `${mod.id}: 3 lecciones`);
    assert.ok((mod.exam.extra || []).length >= 3, `${mod.id}: preguntas propias de evaluación`);
    assert.ok(course.missions.some(m => m.module === mod.id), `${mod.id}: tiene misiones`);
  }
});

test('IDs únicos y conceptos existentes', () => {
  const ids = new Set();
  for (const ex of exercises) {
    assert.ok(ex.id, 'ejercicio sin id');
    assert.ok(!ids.has(ex.id), `id duplicado: ${ex.id}`);
    ids.add(ex.id);
    assert.ok(EXERCISE_TYPES.includes(ex.type), `${ex.id}: tipo ${ex.type}`);
    assert.ok(course.concepts[ex.concept], `${ex.id}: concepto inexistente ${ex.concept}`);
    assert.ok(ex.prompt && ex.prompt.length > 5, `${ex.id}: sin enunciado`);
    assert.ok(ex.explain && ex.explain.length > 10, `${ex.id}: sin explicación`);
  }
  const lessonIds = new Set(course.lessons.map(l => l.id));
  assert.equal(lessonIds.size, course.lessons.length, 'lecciones con id único');
  for (const m of course.missions) for (const r of m.requires) assert.ok(lessonIds.has(r), `${m.id}: requiere ${r}`);
  for (const c of course.lab) for (const r of c.requires) assert.ok(lessonIds.has(r), `${c.id}: requiere ${r}`);
});

test('cada competencia tiene conceptos practicados en ejercicios', () => {
  const used = new Set(exercises.map(e => e.concept));
  for (const comp of course.competencies) {
    const concepts = Object.values(course.concepts).filter(c => c.competency === comp.id);
    assert.ok(concepts.length >= 3, `${comp.id}: pocos conceptos`);
  }
  for (const c of Object.values(course.concepts)) assert.ok(used.has(c.id), `concepto sin ejercicios: ${c.id}`);
});

test('cada lección combina explicación y práctica', () => {
  for (const l of course.lessons) {
    const cards = l.steps.filter(s => !isExercise(s));
    assert.ok(cards.length >= 2, `${l.id}: al menos 2 tarjetas`);
    assert.ok(l.exercises.length >= 4, `${l.id}: al menos 4 ejercicios`);
    assert.ok(new Set(l.exercises.map(e => e.type)).size >= 3, `${l.id}: al menos 3 formatos distintos`);
    for (const card of cards) for (const b of card.blocks) assert.ok(BLOCK_TYPES_LIST.includes(b.type), `${l.id}: bloque ${b.type}`);
    assert.ok(l.objectives?.length, `${l.id}: objetivos`);
  }
});

test('las respuestas correctas validan y las incorrectas no', () => {
  for (const ex of exercises) {
    switch (ex.type) {
      case 'choice': {
        const correct = ex.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
        assert.equal(correct.length, 1, `${ex.id}: una sola correcta`);
        assert.ok(validate(ex, correct[0]).ok, ex.id);
        const wrong = ex.options.findIndex(o => !o.correct);
        assert.ok(!validate(ex, wrong).ok, ex.id);
        break;
      }
      case 'multi': {
        const correct = ex.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
        assert.ok(correct.length >= 1 && correct.length < ex.options.length, `${ex.id}: correctas e incorrectas`);
        assert.ok(validate(ex, correct).ok, ex.id);
        assert.ok(!validate(ex, correct.slice(1)).ok || correct.length === 1, ex.id);
        break;
      }
      case 'order':
        assert.ok(ex.items.length >= 3, ex.id);
        assert.ok(validate(ex, ex.items.map((_, i) => i)).ok, ex.id);
        assert.ok(!validate(ex, ex.items.map((_, i) => i).reverse()).ok, ex.id);
        break;
      case 'match':
        assert.ok(ex.pairs.length >= 3, ex.id);
        assert.ok(validate(ex, ex.pairs.map((_, i) => i)).ok, ex.id);
        break;
      case 'fill': {
        const slots = (ex.template.match(/\{\{\d+\}\}/g) || []).map(s => Number(s.slice(2, -2)));
        for (const i of slots) assert.ok(ex.blanks[i], `${ex.id}: hueco ${i} sin definir`);
        assert.equal(new Set(slots).size, ex.blanks.length, `${ex.id}: huecos y blanks coinciden`);
        for (const b of ex.blanks) if (b.options) assert.ok(b.options.includes(b.answer), `${ex.id}: respuesta entre opciones`);
        const answers = ex.blanks.map(b => b.answer ?? b.accept[0]);
        assert.ok(validate(ex, answers).ok, ex.id);
        break;
      }
      case 'spot':
        assert.ok(ex.faulty.length >= 1 && ex.faulty.every(i => i >= 0 && i < ex.lines.length), `${ex.id}: índices`);
        assert.ok(validate(ex, ex.faulty).ok, ex.id);
        assert.ok(!validate(ex, [...ex.faulty, ex.lines.findIndex((_, i) => !ex.faulty.includes(i))]).ok, ex.id);
        break;
      case 'editor':
        assert.ok(validate(ex, ex.solution).ok, `${ex.id}: la solución no supera los criterios: ${runChecks(ex.solution, ex.checks).filter(r => !r.passed).map(r => r.label).join(', ')}`);
        assert.ok(!validate(ex, ex.starter).ok, `${ex.id}: el texto inicial no debería aprobar`);
        break;
      case 'terminal':
        break;
      default:
        assert.fail(`tipo sin test: ${ex.type}`);
    }
  }
});

test('los ejercicios de terminal: el estado inicial no aprueba y la solución sí', () => {
  for (const ex of exercises.filter(e => e.type === 'terminal')) {
    for (const g of ex.goals) {
      assert.ok(GOAL_TYPES.includes(g.type), `${ex.id}: objetivo ${g.type}`);
      assert.ok(g.label, `${ex.id}: objetivo sin etiqueta`);
    }
    const initial = new Shell({ files: ex.setup?.files || {}, cwd: ex.setup?.cwd || '~' });
    assert.ok(evaluateGoals(ex.goals, initial).some(g => !g.passed), `${ex.id}: aprueba sin hacer nada`);
    const sh = runSolution(ex);
    const failed = evaluateGoals(ex.goals, sh).filter(g => !g.passed);
    assert.deepEqual(failed.map(f => f.label), [], `${ex.id}: la solución no cumple todos los objetivos`);
  }
});

test('misiones: pasos con título y recompensa', () => {
  for (const m of course.missions) {
    assert.ok(m.steps.length >= 3, `${m.id}: al menos 3 pasos`);
    assert.ok(m.xp > 0 && m.brief && m.scenario && m.summary, `${m.id}: campos`);
    for (const s of m.steps) assert.ok(s.title, `${m.id}/${s.id}: título del paso`);
  }
});

test('las evaluaciones tienen suficientes preguntas', () => {
  for (const mod of course.modules) {
    const pool = mod.lessons.flatMap(l => l.exercises).filter(e => e.type !== 'terminal' && e.type !== 'editor').length + mod.exam.extra.length;
    assert.ok(pool >= mod.exam.size, `${mod.id}: banco ${pool} < ${mod.exam.size}`);
  }
});

test('sin datos sensibles reales en el contenido', () => {
  const text = JSON.stringify(loadCourse());
  assert.ok(!/ES\d{22}/.test(text), 'sin IBAN');
  assert.ok(!/\b\d{8}[A-HJ-NP-TV-Z]\b/.test(text), 'sin DNI');
  assert.ok(!/sk-ant-/.test(text), 'sin claves de API');
});
