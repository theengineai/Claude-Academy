// Recorrido completo en un navegador real (Playwright + Chromium) emulando un iPhone.
// Requisitos: un servidor estático sirviendo la carpeta (p. ej. `python3 -m http.server 4173`
// desde la raíz del repositorio) y Playwright instalado en el entorno de desarrollo.
// Uso: BASE_URL=http://127.0.0.1:4173/ node tests/e2e.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const ROOT = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const modules = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(m => read(`content/modules/${m}.json`));
const missions = read('content/missions.json');
const lab = read('content/lab.json');

// Índice de ejercicios por id para responder correctamente.
const EX = {};
for (const m of modules) {
  for (const l of m.lessons) for (const s of l.steps) if (s.id) EX[s.id] = s;
  for (const s of m.exam.extra) EX[s.id] = s;
}
for (const m of missions) for (const s of m.steps) EX[s.id] = s;
for (const c of lab) EX[`${c.id}#ex`] = { ...c.exercise, id: `${c.id}#ex` };

const plain = s => String(s).replace(/\*\*/g, '').replace(/`/g, '').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2').trim();
const log = (...a) => console.log('  ·', ...a);
const exact = s => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

async function answer(page, ex, { wrong = false } = {}) {
  const root = page.locator(`[data-ex-id="${ex.id}"]`);
  switch (ex.type) {
    case 'choice': {
      const opt = wrong ? ex.options.find(o => !o.correct) : ex.options.find(o => o.correct);
      await root.locator('.option').filter({ has: page.locator('.opt-text', { hasText: exact(plain(opt.text)) }) }).click();
      break;
    }
    case 'multi':
      for (const o of ex.options.filter(o => o.correct)) {
        await root.locator('.option').filter({ has: page.locator('.opt-text', { hasText: exact(plain(o.text)) }) }).click();
      }
      break;
    case 'order':
      for (let target = 0; target < ex.items.length; target++) {
        for (let guard = 0; guard < 10; guard++) {
          const texts = await root.locator('.order-text').allTextContents();
          const at = texts.findIndex(t => t.trim() === plain(ex.items[target]));
          if (at === target) break;
          await root.locator('.order-item').nth(at).getByRole('button', { name: 'Subir' }).click();
        }
      }
      break;
    case 'match': {
      const lefts = root.locator('.match-col').first().locator('.match-item');
      for (let i = 0; i < ex.pairs.length; i++) {
        const left = lefts.nth(i);
        if (!(await left.getAttribute('class')).includes('active')) await left.click();
        await root.locator('.match-col').nth(1).locator('.match-item', { hasText: exact(plain(ex.pairs[i][1])) }).click();
      }
      break;
    }
    case 'fill': {
      const slots = root.locator('.slot, .slot-input');
      for (let i = 0; i < ex.blanks.length; i++) {
        const b = ex.blanks[i];
        if (b.options) {
          await slots.nth(i).click();
          await root.locator('.fill-options .chip', { hasText: new RegExp(`^${b.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
        } else {
          await slots.nth(i).fill(b.accept[0]);
        }
      }
      break;
    }
    case 'spot':
      for (const i of ex.faulty) await root.locator('.spot-line').nth(i).click();
      break;
    case 'editor':
      await root.locator('textarea').fill(ex.solution);
      break;
    case 'terminal': {
      const input = root.locator('.term-input');
      for (const cmd of ex.solution) {
        if (cmd === '⇧Tab') { await root.locator('.term-key', { hasText: '⇧Tab' }).click(); continue; }
        await input.fill(cmd);
        await input.press('Enter');
        if (/^(nano|!nano)\s/.test(cmd)) {
          const editor = page.locator('.editor');
          await editor.waitFor();
          const target = cmd.split(/\s+/).pop();
          const file = ex.solutionFiles.find(f => f.path === target || f.path.endsWith(`/${target.replace(/^\.\//, '')}`));
          assert.ok(file, `${ex.id}: sin solutionFiles para ${target}`);
          await page.locator('.editor-area').fill(file.content);
          await page.getByRole('button', { name: 'Guardar' }).click();
          await editor.waitFor({ state: 'detached' });
        }
      }
      break;
    }
    default:
      throw new Error(`tipo sin driver: ${ex.type}`);
  }
}

/** Completa la actividad abierta respondiendo bien (o mal la primera vez si se indica). */
async function playActivity(page, { failFirst = null } = {}) {
  const failed = new Set();
  for (let step = 0; step < 80; step++) {
    if (await page.locator('.results').count()) return;
    const exEl = page.locator('.act-step [data-ex-id]');
    if (await exEl.count()) {
      const id = await exEl.getAttribute('data-ex-id');
      const ex = EX[id];
      assert.ok(ex, `ejercicio desconocido en pantalla: ${id}`);
      const wrong = failFirst === id && !failed.has(id) && ex.type === 'choice';
      try {
        await answer(page, ex, { wrong });
        if (wrong) failed.add(id);
        await page.locator('.act-foot .btn-primary').click({ timeout: 5000 });
      } catch (e) {
        throw new Error(`[${id} · ${ex.type}] ${e.message.split('\n')[0]}`);
      }
      const fb = page.locator('.feedback');
      await fb.waitFor();
      const ok = (await fb.getAttribute('class')).includes('ok');
      if (!wrong) assert.ok(ok, `respuesta correcta rechazada: ${id}: ${await fb.textContent()}`);
      await fb.locator('.btn').last().click();
    } else {
      await page.locator('.act-foot .btn-primary').click();
    }
    await page.waitForTimeout(30);
  }
  throw new Error('la actividad no terminó');
}

async function finishResults(page) {
  await page.locator('.results').waitFor();
  const xp = await page.locator('.results .stat-big').first().textContent();
  await page.locator('.act-foot .btn-primary').click();
  // «Siguiente» puede abrir directamente la próxima lección: basta con que desaparezcan los resultados.
  await page.locator('.results').waitFor({ state: 'detached' });
  await openRoute(page, '#/home');
  return xp;
}

async function openRoute(page, route) {
  await page.evaluate(r => { location.hash = r; }, route);
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('1. Carga inicial y pantallas');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.hero').waitFor();
  for (const tab of ['Academia', 'Laboratorio', 'Misiones', 'Perfil', 'Inicio']) {
    await page.locator('.tabbar .tab', { hasText: tab }).click();
    await page.locator('.page').waitFor();
  }
  log('5 pestañas navegables');

  console.log('2. Lección 1.1 con un fallo intencionado (se repite al final)');
  await openRoute(page, '#/lesson/l1-1');
  await playActivity(page, { failFirst: 'm1l1e1' });
  const xp1 = await finishResults(page);
  log('XP ganada en la lección:', xp1);
  const state1 = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
  assert.ok(state1.xp > 0 && state1.xp < 30, 'XP proporcional a la precisión');
  assert.ok(state1.mistakes.m1l1e1, 'el error queda registrado para repaso');

  console.log('3. Persistencia tras recargar');
  await page.reload({ waitUntil: 'networkidle' });
  const pill = await page.locator('.pill-xp').textContent();
  assert.equal(Number(pill.replace(/\D/g, '')), state1.xp);
  log('XP tras recargar:', pill.trim());

  console.log('3b. Volver atrás y continuar donde lo dejé');
  await openRoute(page, '#/lesson/l1-t');
  await page.locator('.act-foot .btn-primary').click(); // tarjeta 1 → pregunta
  await answer(page, EX.m1l0e1);
  await page.locator('.act-foot .btn-primary').click();
  await page.locator('.feedback .btn').last().click(); // → tarjeta 2
  const cardTitle = (await page.locator('.card-title').textContent()).trim();
  await page.locator('.act-head .back').click();
  await page.locator('.feedback.review').waitFor(); // pregunta respondida en modo repaso
  assert.equal(await page.locator('.review-tag').count(), 1);
  await page.locator('.act-head .back').click();
  assert.equal(await page.locator('.act-head .back').isHidden(), true, 'en el primer paso no hay «Atrás»');
  await page.locator('.act-foot .btn-primary').click();
  await page.locator('.act-foot .btn-primary').click();
  assert.equal((await page.locator('.card-title').textContent()).trim(), cardTitle, 'se vuelve hacia delante hasta donde iba');
  await page.locator('.act-head .close').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')).inProgress['lesson:l1-t']);
  assert.equal(saved.furthest, 2, 'avance guardado al salir');
  await page.reload({ waitUntil: 'networkidle' });
  await openRoute(page, '#/lesson/l1-t');
  await page.getByRole('button', { name: 'Continuar donde lo dejé' }).click();
  assert.equal((await page.locator('.card-title').textContent()).trim(), cardTitle, 'reanuda en el mismo paso tras cerrar la app');
  await page.locator('.act-head .close').click();
  log('atrás, modo repaso y reanudación correctos');

  console.log('4. Lecciones de terminal (l1-t, l1-2, l1-3) y evaluación del módulo 1');
  for (const id of ['l1-t', 'l1-2', 'l1-3']) {
    await openRoute(page, `#/lesson/${id}`);
    await playActivity(page);
    await finishResults(page);
  }
  await openRoute(page, '#/exam/m1');
  await playActivity(page);
  await page.locator('.results').waitFor();
  assert.match(await page.locator('.results h2').textContent(), /superada/);
  await finishResults(page);
  const state2 = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
  assert.ok(state2.exams.m1.passed, 'evaluación superada');
  log('módulo 2 desbloqueado');

  console.log('5. Bloqueos: una lección cerrada no se abre');
  await openRoute(page, '#/lesson/l3-1');
  assert.equal(await page.locator('.activity').count(), 0, 'l3-1 debe estar bloqueada');

  console.log('6. Misiones 1 y 2');
  for (const id of ['ms01', 'ms02']) {
    await openRoute(page, `#/mission/${id}`);
    await playActivity(page);
    await finishResults(page);
  }
  const state3 = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
  assert.ok(state3.missions.ms01.completedAt && state3.missions.ms02.completedAt);
  log('XP total:', state3.xp);

  console.log('7. Repaso inteligente con el error registrado');
  await openRoute(page, '#/review');
  await page.locator('[data-ex-id="m1l1e1"]').waitFor();
  await playActivity(page);
  await finishResults(page);
  const state4 = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
  assert.ok(!state4.mistakes.m1l1e1, 'el error se elimina al acertarlo en repaso');

  console.log('8. Laboratorio: comandos y persistencia del sistema de archivos');
  await openRoute(page, '#/lab');
  const term = page.locator('.term-input').first();
  for (const cmd of ['cd cierre-mensual', 'mkdir notas', 'echo "pendiente: revisar IVA" > notas/hoy.txt']) {
    await term.fill(cmd);
    await term.press('Enter');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await openRoute(page, '#/lab');
  await page.locator('.term-input').first().fill('cat notas/hoy.txt');
  await page.locator('.term-input').first().press('Enter');
  await page.locator('.tl', { hasText: 'pendiente: revisar IVA' }).waitFor();
  log('el archivo creado sigue ahí tras recargar');

  console.log('9. Reto de laboratorio');
  await openRoute(page, '#/challenge/lab-explorar');
  await playActivity(page);
  await finishResults(page);

  console.log('10. Funcionamiento sin conexión');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'networkidle' }); // asegura que el SW controla la página
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.hero, .page').first().waitFor();
  await openRoute(page, '#/lesson/l2-1');
  await page.locator('.card-title').first().waitFor();
  await page.locator('.act-head .close').click();
  await openRoute(page, '#/academy');
  await page.locator('.module').first().waitFor();
  log('app, temario y lecciones disponibles offline');
  await context.setOffline(false);

  console.log('11. Logros, perfil y reinicio');
  await openRoute(page, '#/profile');
  assert.ok(await page.locator('.ach.got').count() >= 2, 'logros desbloqueados');
  await page.getByRole('button', { name: 'Reiniciar todo el progreso' }).click();
  await page.locator('.sheet .btn-danger').click();
  await page.waitForTimeout(300);
  await page.locator('.sheet .btn-danger').click();
  await page.waitForTimeout(400);
  const state5 = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
  assert.equal(state5.xp, 0, 'progreso reiniciado');

  if (process.env.FULL) {
    console.log('12. Recorrido íntegro: todas las lecciones, evaluaciones, misiones y proyecto final');
    for (const mod of modules) {
      for (const l of mod.lessons) {
        await openRoute(page, `#/lesson/${l.id}`);
        await playActivity(page);
        await finishResults(page);
      }
      await openRoute(page, `#/exam/${mod.id}`);
      await playActivity(page);
      await finishResults(page);
      for (const m of missions.filter(x => x.module === mod.id && !x.final)) {
        await openRoute(page, `#/mission/${m.id}`);
        await playActivity(page);
        await finishResults(page);
      }
      log(`módulo ${mod.id} completo`);
    }
    await openRoute(page, '#/mission/ms12');
    await playActivity(page);
    await finishResults(page);
    for (const c of lab) {
      await openRoute(page, `#/challenge/${c.id}`);
      await playActivity(page);
      await finishResults(page);
    }
    await openRoute(page, '#/profile');
    assert.equal((await page.locator('.level-badge.big').textContent()).trim(), 'L5');
    const final = await page.evaluate(() => JSON.parse(localStorage.getItem('cca.state')));
    log(`nivel L5 · XP ${final.xp} · logros ${Object.keys(final.achievements).length}`);
    await page.screenshot({ path: path.join(ROOT, 'docs/screenshots/perfil-l5.png') });
  }

  assert.deepEqual(errors, [], 'sin errores de JavaScript');
  console.log('\nOK: recorrido completo superado sin errores.');
  await browser.close();
})().catch(async e => {
  console.error('\nFALLO:', e.message);
  process.exit(1);
});
