// Browser smoke test: serve the site on loopback, load a dungeon of every family in every theme in headless
// Chromium, open the Your hero and Your progress popups, and fail on any page error or console error.
//
//   node test/smoke.mjs [-v]
//
// Needs Playwright (not a dependency of the site): `npm i --no-save playwright && npx playwright install chromium`.
// Elsewhere, point NK_PLAYWRIGHT at a playwright(-core) module and NK_CHROMIUM at a Chromium binary.
// Needs the lib/utils submodule (`git submodule update --init`).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = ['3C-172582050', 'F1-1026320547', '6A-123456789', 'EB-1325623421'];
const THEMES = ['Light', 'Dark', 'Dark High Contrast', 'Sepia'];
const verbose = process.argv.includes('-v');

const chromium = await loadChromium();
if (!fs.existsSync(path.join(ROOT, 'lib/utils/themes'))) fail('lib/utils is empty: run `git submodule update --init`.');

const server = await serve(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.NK_CHROMIUM ? { executablePath: process.env.NK_CHROMIUM } : {});
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
		const shown = await page.evaluate(() => {
			const { level } = window.nkd.state;
			return { creatures: level.critters.length, objects: level.objects.length, theme: document.querySelector('#theme-label-2')?.textContent };
		});
		if (!(shown.creatures > 0 && shown.objects > 0)) errors.push(`empty level: ${JSON.stringify(shown)}`);
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

/** A static file server on a free loopback port. */
function serve(root) {
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
	const server = http.createServer((req, res) => {
		const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		const file = path.join(root, rel);
		if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadChromium() {
	const candidates = [process.env.NK_PLAYWRIGHT && pathToFileURL(process.env.NK_PLAYWRIGHT).href, 'playwright', 'playwright-core'].filter(Boolean);
	for (const spec of candidates) {
		try {
			return (await import(spec)).chromium;
		} catch {
			// try the next one
		}
	}
	fail('Playwright not found: `npm i --no-save playwright && npx playwright install chromium` (or set NK_PLAYWRIGHT).');
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
