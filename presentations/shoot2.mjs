import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
await p.getByRole('button', { name: 'Bhopal', exact: true }).click();
await p.waitForTimeout(4000);
await p.getByRole('button', { name: /Ingest broker brief/ }).click();
await p.waitForTimeout(3000);
// scroll dossier so criteria are visible
const crit = p.locator('[title="Criteria"]').first();
if (await crit.count()) { await crit.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); }
await p.screenshot({ path: 'shots/07-criteria-conflict.png' });
await p.getByRole('button', { name: 'Investigate' }).click();
await p.waitForTimeout(15000);
await p.screenshot({ path: 'shots/08-investigate-conflict.png' });
await p.getByRole('button', { name: 'PROJECT' }).click();
await p.waitForTimeout(800);
const modular = p.getByRole('button', { name: /Modular/i }).first();
await modular.click();
await p.waitForTimeout(3500);
await p.screenshot({ path: 'shots/09-modular.png' });
await b.close();
