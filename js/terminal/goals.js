// Objetivos verificables de los ejercicios de terminal. Se definen en el temario (JSON)
// y se comprueban contra el estado del simulador, no contra el texto tecleado.
import { resolvePath } from './fs.js';
import { parseJson, parseFrontmatter } from './parse.js';
import { mcpServers, doctor } from './claude.js';
import { runChecks } from '../core/validate.js';
import { getPath } from '../core/util.js';

export const GOAL_TYPES = ['cwd', 'exists', 'absent', 'file', 'frontmatter', 'json', 'ran', 'mode', 'session', 'mcp', 'commits', 'clean', 'doctor'];

function expectMatches(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('exists' in expected) return expected.exists ? actual !== undefined : actual === undefined;
    if ('oneOf' in expected) return expected.oneOf.includes(actual);
    if ('includes' in expected) return Array.isArray(actual) && actual.includes(expected.includes);
    if ('pattern' in expected) return typeof actual === 'string' && new RegExp(expected.pattern, expected.flags ?? 'i').test(actual);
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function checkGoal(goal, sh) {
  const path = goal.path ? resolvePath(goal.path, sh.cwd) : null;
  switch (goal.type) {
    case 'cwd':
      return sh.cwd === resolvePath(goal.path, sh.cwd);
    case 'exists':
      return goal.kind === 'dir' ? sh.fs.isDir(path) : goal.kind === 'file' ? sh.fs.isFile(path) : sh.fs.exists(path);
    case 'absent':
      return !sh.fs.exists(path);
    case 'file': {
      const text = sh.fs.read(path);
      return text !== null && runChecks(text, goal.checks).every(r => r.passed);
    }
    case 'frontmatter': {
      const text = sh.fs.read(path);
      if (text === null) return false;
      const { data } = parseFrontmatter(text);
      if (!data) return false;
      return Object.entries(goal.expect || {}).every(([k, v]) => expectMatches(data[k], v));
    }
    case 'json': {
      const text = sh.fs.read(path);
      if (text === null) return false;
      const parsed = parseJson(text);
      if (parsed.error) return false;
      return Object.entries(goal.expect || {}).every(([k, v]) => expectMatches(getPath(parsed.value, k), v));
    }
    case 'ran':
      return sh.history.some(h => new RegExp(goal.pattern, goal.flags ?? '').test(h));
    case 'mode':
      return sh.session?.permissionMode === goal.value;
    case 'session':
      return goal.active === false ? sh.mode !== 'claude' : sh.mode === 'claude';
    case 'mcp': {
      const server = mcpServers(sh).servers.find(s => s.name === goal.name);
      if (!server) return false;
      if (goal.scope && server.scope !== goal.scope) return false;
      if (goal.transport && (server.cfg.type || 'stdio') !== goal.transport) return false;
      if (goal.url && server.cfg.url !== goal.url) return false;
      return true;
    }
    case 'commits': {
      const root = sh.repoRoot();
      if (!root) return false;
      const repo = JSON.parse(sh.fs.read(`${root === '/' ? '' : root}/.git/state.json`));
      const enough = repo.commits.length >= (goal.min ?? 1);
      return enough && (!goal.message || repo.commits.some(c => new RegExp(goal.message, 'i').test(c.msg)));
    }
    case 'clean': {
      const result = sh.git(['status'], ['status']);
      return result.lines.some(l => /árbol de trabajo está limpio/.test(l.text));
    }
    case 'doctor':
      return doctor(sh).filter(f => f.level === 'error').length === 0;
    default:
      throw new Error(`Tipo de objetivo desconocido: ${goal.type}`);
  }
}

/** Evalúa todos los objetivos y devuelve [{ ...goal, passed }]. */
export function evaluateGoals(goals, sh) {
  return goals.map(g => ({ ...g, passed: checkGoal(g, sh) }));
}
