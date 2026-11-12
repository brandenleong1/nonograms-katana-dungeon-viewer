// Screenshots of the site's main views: the map in every theme and dungeon family, the popups, and a narrow window.
// The screenshot bot (.github/workflows/screenshots.yml) takes them for main and for a pull request, and posts the
// ones that look different on the PR. Run it yourself to check a layout change.
//
//   node tools/screenshots.mjs --out DIR                      every view of this checkout
//   node tools/screenshots.mjs --before DIR2 --out DIR        and of DIR2 (e.g. a main worktree); keeps the views
//                                                             that look different
//   add --after DIR3 to shoot another checkout instead of this one, --only name,name to shoot a few views
//
// DIR gets NAME.before.png / NAME.after.png and manifest.json:
//   { views: [{ name, status: 'changed' | 'added' | 'same' | 'shot', changedPixels }] }
// Every view uses a new game (no save, no progress edits) and fixed dungeon labels. Needs Playwright (tools/chromium.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { launchChromium } from './chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDE = { width: 1600, height: 900 };
const TALL = { width: 1600, height: 1500 };   // popups show more of themselves
const NARROW = { width: 640, height: 1100 };
const THEMES = ['light', 'dark', 'dark-high-contrast', 'sepia'];
const MAP_3C = '3C-172582050';

/** name, dungeon label, theme id, viewport, and the popup to open. */
const VIEWS = [
	...THEMES.map((theme, id) => ({ name: `map-3c-${theme}`, label: MAP_3C, theme: id, size: WIDE })),
	{ name: 'map-f1-light', label: 'F1-1026320547', theme: 0, size: WIDE },
	{ name: 'map-6a-light', label: '6A-123456789', theme: 0, size: WIDE },
	{ name: 'map-eb-light', label: 'EB-1325623421', theme: 0, size: WIDE },
	{ name: 'help-light', label: MAP_3C, theme: 0, size: WIDE, open: 'help' },
	{ name: 'hero-light', label: MAP_3C, theme: 0, size: TALL, open: 'hero' },
	{ name: 'progress-light', label: MAP_3C, theme: 0, size: TALL, open: 'progress' },
	{ name: 'progress-dark', label: MAP_3C, theme: 1, size: TALL, open: 'progress' },
	{ name: 'map-3c-narrow', label: MAP_3C, theme: 0, size: NARROW },
	{ name: 'progress-narrow', label: MAP_3C, theme: 0, size: NARROW, open: 'progress' },
];

/** A pixel counts as changed when a channel moves by more than this; a view when more than MIN_PIXELS do. */
const CHANNEL_TOLERANCE = 24;
const MIN_PIXELS = 20;

const args = parseArgs(process.argv.slice(2));
const views = args.only ? VIEWS.filter((v) => args.only.includes(v.name)) : VIEWS;
fs.mkdirSync(args.out, { recursive: true });

const browser = await launchChromium();
try {
	const after = await shootTree(browser, args.after, views);
	const before = args.before ? await shootTree(browser, args.before, views) : null;
	const manifest = { views: [] };
	for (const view of views) manifest.views.push(await record(browser, { view, before: before?.get(view.name), after: after.get(view.name) }));
	fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
	const changed = manifest.views.filter((v) => v.status === 'changed' || v.status === 'added');
	console.log(before ? `${changed.length} of ${views.length} views look different` : `${views.length} views shot`);
} finally {
	await browser.close();
}

/** Every view of one checkout: name -> PNG bytes. */
async function shootTree(browser, root, list) {
	const server = await serveStatic(root);
	const base = `http://127.0.0.1:${server.address().port}`;
	const shots = new Map();
	try {
		for (const view of list) shots.set(view.name, await shoot(browser, base, view));
	} finally {
		server.close();
	}
	return shots;
}

async function shoot(browser, base, view) {
	const context = await browser.newContext({ viewport: view.size, deviceScaleFactor: 1 });
	await context.addCookies([{ name: 'themeID', value: String(view.theme), url: base }]);
	const page = await context.newPage();
	try {
		await page.goto(`${base}/index.html#${view.label}`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => window.nkd && window.nkd.state.level, null, { timeout: 60000 });
		// the themes fade colours over 0.5 s (lib/utils transition.css); a shot mid-fade differs from run to run
		await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }' });
		if (view.open) await openPopup(page, view.open);
		await settle(page);
		return await page.screenshot();
	} finally {
		await context.close();
	}
}

async function openPopup(page, which) {
	await page.evaluate((w) => {
		if (w === 'help') Popup.popup(document.querySelector('#popup-help'));
		if (w === 'hero') window.nkd.state.hero.open();
		if (w === 'progress') window.nkd.state.hero.openProgress();
	}, which);
}

/** Fonts loaded, two frames drawn, the popup's fade-in (lib/utils Animate) over. */
async function settle(page) {
	await page.evaluate(() => document.fonts.ready);
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
	await page.waitForTimeout(900);
}

/** Write a view's images (when they matter) and return its manifest entry. */
async function record(browser, { view, before, after }) {
	const write = (suffix, png) => fs.writeFileSync(path.join(args.out, `${view.name}.${suffix}.png`), png);
	if (!before) {
		write('after', after);
		return { name: view.name, status: args.before ? 'added' : 'shot' };
	}
	const changedPixels = await countChangedPixels(browser, before, after);
	if (changedPixels <= MIN_PIXELS) return { name: view.name, status: 'same', changedPixels };
	write('before', before);
	write('after', after);
	return { name: view.name, status: 'changed', changedPixels };
}

/** Pixels that differ between two PNGs (every pixel when the sizes differ), compared on a canvas in the browser. */
async function countChangedPixels(browser, a, b) {
	if (a.equals(b)) return 0;
	const page = await browser.newPage();
	try {
		return await page.evaluate(async ({ a64, b64, tolerance }) => {
			const load = async (b64png) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64png}`)).blob());
			const [ia, ib] = await Promise.all([load(a64), load(b64)]);
			if (ia.width !== ib.width || ia.height !== ib.height) return Math.max(ia.width * ia.height, ib.width * ib.height);
			const pixels = (img) => {
				const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
				c.drawImage(img, 0, 0);
				return c.getImageData(0, 0, img.width, img.height).data;
			};
			const pa = pixels(ia);
			const pb = pixels(ib);
			let n = 0;
			for (let i = 0; i < pa.length; i += 4) {
				if (Math.abs(pa[i] - pb[i]) > tolerance || Math.abs(pa[i + 1] - pb[i + 1]) > tolerance || Math.abs(pa[i + 2] - pb[i + 2]) > tolerance) n++;
			}
			return n;
		}, { a64: a.toString('base64'), b64: b.toString('base64'), tolerance: CHANNEL_TOLERANCE });
	} finally {
		await page.close();
	}
}

function parseArgs(argv) {
	const value = (flag) => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : null;
	};
	const out = value('--out');
	if (!out) {
		console.error('usage: node tools/screenshots.mjs --out DIR [--before DIR] [--after DIR] [--only name,...]');
		process.exit(2);
	}
	return {
		out: path.resolve(out),
		before: value('--before') && path.resolve(value('--before')),
		after: path.resolve(value('--after') || ROOT),
		only: value('--only') ? value('--only').split(',') : null,
	};
}
