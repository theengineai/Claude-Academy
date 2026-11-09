// Validadores de ejercicios. Cada uno devuelve { ok, detail } con información
// suficiente para dar feedback específico (qué falló y por qué).
import { normalize } from './util.js';

function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every(x => sb.has(x));
}

/** Comprueba un texto contra reglas regex con nombre. Útil para editores (CLAUDE.md, SKILL.md, JSON...). */
export function runChecks(text, checks) {
  return checks.map(check => {
    let passed;
    if (check.json) {
      passed = isValidJson(text);
    } else {
      const re = new RegExp(check.pattern, check.flags ?? 'im');
      passed = re.test(text);
      if (check.negate) passed = !passed;
    }
    return { ...check, passed };
  });
}

export function isValidJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

export function validate(ex, answer) {
  switch (ex.type) {
    case 'choice': {
      const option = ex.options[answer];
      return { ok: Boolean(option && option.correct), detail: { chosen: answer, feedback: option?.feedback } };
    }
    case 'multi': {
      const correct = ex.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
      const chosen = Array.isArray(answer) ? answer : [];
      return {
        ok: sameSet(chosen, correct),
        detail: {
          missed: correct.filter(i => !chosen.includes(i)),
          extra: chosen.filter(i => !correct.includes(i)),
        },
      };
    }
    case 'order': {
      // answer = índices originales en el orden elegido por el alumno.
      const seq = Array.isArray(answer) ? answer : [];
      const inPlace = seq.filter((v, i) => v === i).length;
      return { ok: seq.length === ex.items.length && inPlace === ex.items.length, detail: { inPlace, total: ex.items.length } };
    }
    case 'match': {
      // answer[i] = índice de la columna derecha emparejado con el elemento izquierdo i.
      const seq = Array.isArray(answer) ? answer : [];
      const wrong = ex.pairs.map((_, i) => i).filter(i => seq[i] !== i);
      return { ok: wrong.length === 0, detail: { wrong } };
    }
    case 'fill': {
      const values = Array.isArray(answer) ? answer : [];
      const results = ex.blanks.map((blank, i) => {
        const value = values[i];
        if (blank.options) return value === blank.answer;
        return (blank.accept || []).some(a => normalize(a) === normalize(value));
      });
      return { ok: results.every(Boolean), detail: { results } };
    }
    case 'spot': {
      const chosen = Array.isArray(answer) ? answer : [];
      return {
        ok: sameSet(chosen, ex.faulty),
        detail: {
          missed: ex.faulty.filter(i => !chosen.includes(i)),
          extra: chosen.filter(i => !ex.faulty.includes(i)),
        },
      };
    }
    case 'editor': {
      const results = runChecks(String(answer ?? ''), ex.checks);
      return { ok: results.every(r => r.passed), detail: { results } };
    }
    default:
      throw new Error(`Tipo de ejercicio sin validador: ${ex.type}`);
  }
}

/** Texto de feedback específico para un resultado incorrecto. */
export function explainFailure(ex, result) {
  const d = result.detail || {};
  switch (ex.type) {
    case 'choice': return d.feedback || '';
    case 'multi': {
      const parts = [];
      if (d.missed?.length) parts.push(`Te ha faltado marcar ${d.missed.length === 1 ? 'una opción correcta' : `${d.missed.length} opciones correctas`}.`);
      if (d.extra?.length) parts.push(`Has marcado ${d.extra.length === 1 ? 'una opción que no aplica' : `${d.extra.length} opciones que no aplican`}.`);
      return parts.join(' ');
    }
    case 'order': return `${d.inPlace} de ${d.total} pasos están en su posición.`;
    case 'match': return `${d.wrong.length} ${d.wrong.length === 1 ? 'pareja no es correcta' : 'parejas no son correctas'}.`;
    case 'fill': {
      const bad = d.results.map((ok, i) => (ok ? null : i + 1)).filter(Boolean);
      return `Revisa ${bad.length === 1 ? 'el hueco' : 'los huecos'} ${bad.join(', ')}.`;
    }
    case 'spot': {
      const parts = [];
      if (d.missed?.length) parts.push(`Quedan ${d.missed.length} ${d.missed.length === 1 ? 'línea defectuosa' : 'líneas defectuosas'} sin señalar.`);
      if (d.extra?.length) parts.push(`${d.extra.length === 1 ? 'Una línea marcada es correcta' : `${d.extra.length} líneas marcadas son correctas`}.`);
      return parts.join(' ');
    }
    case 'editor': {
      const failed = d.results.filter(r => !r.passed);
      return failed.map(r => `• ${r.label}${r.hint ? ` — ${r.hint}` : ''}`).join('\n');
    }
    default: return '';
  }
}
