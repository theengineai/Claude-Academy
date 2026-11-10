// Utilidades compartidas por los tests (Node 20+, sin dependencias).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCourse, CONTENT_FILES } from '../js/core/course.js';
import { Shell } from '../js/terminal/shell.js';
import { resolvePath } from '../js/terminal/fs.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

export function loadRaw() {
  return {
    course: readJson(CONTENT_FILES.course),
    missions: readJson(CONTENT_FILES.missions),
    lab: readJson(CONTENT_FILES.lab),
    modules: CONTENT_FILES.modules.map(readJson),
  };
}

export function loadCourse() {
  return buildCourse(loadRaw());
}

/** Todos los ejercicios del temario, incluidos los del laboratorio. */
export function allExercises(course) {
  const list = Object.values(course.exercises).map(e => e.exercise);
  for (const c of course.lab) list.push({ ...c.exercise, id: `${c.id}#ex` });
  return list;
}

/**
 * Ejecuta la solución de un ejercicio de terminal. "nano <ruta>" escribe el contenido
 * de solutionFiles (lo que el alumno haría en el editor) y "⇧Tab" pulsa el atajo.
 */
export function runSolution(ex) {
  const sh = new Shell({ files: ex.setup?.files || {}, cwd: ex.setup?.cwd || '~', claudeActions: ex.setup?.claudeActions || [] });
  for (const cmd of ex.solution) {
    if (cmd === '⇧Tab') { sh.shiftTab(); continue; }
    const result = sh.run(cmd);
    if (result.action?.type === 'edit') {
      const file = (ex.solutionFiles || []).find(f => resolvePath(f.path, sh.cwd) === result.action.path);
      if (!file) throw new Error(`${ex.id}: falta solutionFiles para ${result.action.path}`);
      const err = sh.saveFile(result.action.path, file.content);
      if (err) throw new Error(`${ex.id}: no se pudo guardar ${file.path}: ${err}`);
    }
  }
  return sh;
}
