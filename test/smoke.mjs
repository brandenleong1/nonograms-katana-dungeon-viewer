// Browser smoke test: serve the site on loopback, load a dungeon of every family in every theme in headless
// Chromium, check the Help popup shows the game version and a stuck door its energy cost, open the Your hero and Your
// progress popups, and fail on any page error or console error.
//
//   node test/smoke.mjs [-v]
//
// Needs Playwright (not a dependency of the site): `npm i --no-save playwright && npx playwright install chromium`.
// Elsewhere, point NK_PLAYWRIGHT at a playwright(-core) module and NK_CHROMIUM at a Chromium binary.
// Needs the lib/utils submodule (`git submodule update --init`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../tools/static-server.mjs';
import { launchChromium } from '../tools/chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = ['3C-172582050', 'F1-1026320547', '6A-123456789', 'EB-1325623421'];
const THEMES = ['Light', 'Dark', 'Dark High Contrast', 'Sepia'];
const STUCK_DOOR = { label: '3C-172582050', x: 9, y: 48 };   // object 28: the Selected panel gives its energy cost
const GAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-version.json'), 'utf8'));
const verbose = process.argv.includes('-v');

if (!fs.existsSync(path.join(ROOT, 'lib/utils/themes'))) fail('lib/utils is empty: run `git submodule update --init`.');

const browser = await launchChromium();
const server = await serveStatic(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
let failures = 0;
try {
	for (const [themeId, theme] of THEMES.entries()) {
		for (const label of LABELS) failures += await checkPage(browser, base, label, themeId, theme);
	}
} finally {
	await browser.close();
	server.close();
}
console.log(failures ? `${failures} failed` : `${LABELS.length * THEMES.length} passed, 0 failed`);
process.exit(failures ? 1 : 0);

/** One page load: the map renders, both popups open, and nothing logs an error. Returns 1 on failure. */
async function checkPage(browser, base, label, themeId, theme) {
	const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	await context.addCookies([{ name: 'themeID', value: String(themeId), url: base }]);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
	try {
		await page.goto(`${base}/index.html#${label}`);
		await page.waitForFunction(() => window.nkd && window.nkd.state.level && window.nkd.solve, null, { timeout: 60000 });
		await page.waitForFunction(() => document.querySelector('#game-version b'), null, { timeout: 15000 }).catch(() => {});
		const shown = await page.evaluate(() => {
			const { level } = window.nkd.state;
			return { creatures: level.critters.length, objects: level.objects.length, version: document.querySelector('#game-version')?.textContent || '' };
		});
		if (!(shown.creatures > 0 && shown.objects > 0)) errors.push(`empty level: ${JSON.stringify(shown)}`);
		if (!shown.version.includes(GAME.versionName)) errors.push(`Help popup doesn't show game version ${GAME.versionName}: "${shown.version}"`);
		if (label === STUCK_DOOR.label) {
			const said = await page.evaluate(({ x, y }) => {
				window.nkd.view.onSelect(window.nkd.view.describe(x, y));
				return document.querySelector('#selected-info').textContent;
			}, STUCK_DOOR);
			if (!/Breaking it costs \d+ energy/.test(said)) errors.push(`stuck door at ${STUCK_DOOR.x},${STUCK_DOOR.y}: "${said.slice(0, 80)}"`);
		}
		await page.evaluate(() => window.nkd.state.hero.open());
		await page.waitForTimeout(400);
		await page.evaluate(() => window.nkd.state.hero.openProgress());
		await page.waitForTimeout(800);
		if (verbose) console.log(`  ${theme.padEnd(18)} ${label.padEnd(14)} ${shown.objects} objects, ${shown.creatures} creatures`);
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	if (!errors.length) return 0;
	console.log(`FAIL ${theme} ${label}:\n  ${[...new Set(errors)].join('\n  ')}`);
	return 1;
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
