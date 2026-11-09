// Genera los iconos PNG a partir de icons/icon.svg con el Chromium de Playwright.
// Uso: node scripts/make-icons.cjs   (solo hace falta al cambiar el diseño del icono)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  // iOS no admite transparencia en el icono de inicio: fondo crema y esquinas que recorta el sistema.
  { file: 'apple-touch-icon.png', size: 180, pad: 0, bg: '#C96442', square: true },
  // Maskable: el contenido debe caber en el 80 % central.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12, bg: '#C96442', square: true },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const t of targets) {
    const inner = Math.round(t.size * (1 - t.pad * 2));
    const art = t.square ? svg.replace(/rx="112"/, 'rx="0"') : svg;
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(`<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
      <div style="width:${inner}px;height:${inner}px">${art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await page.screenshot({ path: path.join(root, 'icons', t.file), omitBackground: t.bg === 'transparent' });
    console.log('ok', t.file);
  }
  await browser.close();
})();
