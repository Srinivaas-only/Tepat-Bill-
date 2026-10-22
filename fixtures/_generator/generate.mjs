// Renders the synthetic demo documents to PNG and writes their expected extraction JSON
// (same shape as shared/core/extract.ts ExtractedDoc) with TRUE box_2d taken from the rendered layout.
// Run: node fixtures/_generator/generate.mjs   (needs Playwright + Chromium; not needed on Replit)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS } from './docs.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(OUT, 'docs'), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const d of DOCS) {
  const page = await browser.newPage({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1 });
  await page.setContent(d.html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const shot = page.locator('#doc');
  await shot.screenshot({ path: join(OUT, 'docs', `${d.file}.png`) });
  const { w, h, rows } = await page.evaluate(() => {
    const root = document.querySelector('#doc').getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-line]')].map(el => {
      // getBoundingClientRect of a rotated parent child returns the axis-aligned box, which is what box_2d means
      const r = el.getBoundingClientRect();
      return { i: Number(el.getAttribute('data-line')), y0: r.top - root.top, x0: r.left - root.left, y1: r.bottom - root.top, x1: r.right - root.left };
    });
    return { w: root.width, h: root.height, rows };
  });
  const norm = (v, max) => Math.max(0, Math.min(1000, Math.round((v / max) * 1000)));
  const expected = structuredClone(d.expected);
  for (const r of rows) {
    const line = expected.lines[r.i];
    if (line) line.box_2d = [norm(r.y0, h), norm(r.x0, w), norm(r.y1, h), norm(r.x1, w)];
  }
  writeFileSync(join(OUT, 'docs', `${d.file}.expected.json`), JSON.stringify(expected, null, 2) + '\n');
  console.log(`${d.file}.png  ${Math.round(w)}x${Math.round(h)}  lines=${expected.lines.length}`);
  await page.close();
}
await browser.close();
