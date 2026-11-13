// Screenshots of the site for reviewing UI changes: the map in every theme and dungeon family, window sizes from a
// phone to a big screen, rooms zoomed in, clicks and the hover tooltip, the map layers, the panels, finished solver
// plans, and the popups. The screenshot bot (.github/workflows/screenshots.yml) takes them for main and for a pull
// request, and posts the ones that look different on the PR. Run it yourself to check a change.
//
//   node tools/screenshots.mjs --out DIR                      every view of this checkout
//   node tools/screenshots.mjs --before DIR2 --out DIR        and of DIR2 (e.g. a main worktree); keeps the views
//                                                             that look different
//   node tools/screenshots.mjs --list                         the views, by group
//   --only GROUP,NAME,...   only these views: a group (`popup`), a name prefix (`map-3c`) or a full name
//   --after DIR3            shoot another checkout instead of this one
//   --jobs N                pages open at once (default 3)
//   -v                      print how long each view took
//
// DIR gets NAME.before.png / NAME.after.png and manifest.json:
//   { views: [{ name, status: 'changed' | 'added' | 'same' | 'shot', changedPixels }] }
// 'added' is a view DIR2 can't show (e.g. it clicks a button only this checkout has). `--before .` shoots this
// checkout twice: every view should come out 'same' (docs/testing.md#screenshots).
//
// Every view uses a new game (no save; progress only through the Progress popup's own controls) and fixed dungeon
// labels, and the same code gives the same pixels on every run: the steps wait for what they changed, never for a
// fixed time, the page is painted afresh before each shot, and wall-clock times are masked. Needs Playwright
// (tools/chromium.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { launchChromium } from './chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SIZES = {
	phone: { width: 390, height: 844 },
	phoneLandscape: { width: 844, height: 390 },
	narrow: { width: 640, height: 1100 },
	tablet: { width: 820, height: 1180 },
	laptop: { width: 1280, height: 800 },
	wide: { width: 1600, height: 900 },
	full: { width: 1920, height: 1080 },   // wide enough for all four columns, solver included
	big: { width: 2560, height: 1440 },
	tall: { width: 1600, height: 1500 },   // popups show more of themselves
};

/** in lib/utils' order: a view's theme is its index, set through the themeID cookie */
const THEMES = ['light', 'dark', 'dark-high-contrast', 'sepia'];

const LABELS = {
	'3c': '3C-172582050',
	f1: 'F1-1026320547',
	'6a': '6A-123456789',
	eb: 'EB-1325623421',
	nonogram: '5C-1094827726',   // a floor nonogram, for the puzzle solutions layer
	small: '1A-1429008869',      // 12 fights: quick to solve
};

const WHAT_IF = '#solve-controls .seg-btn[data-k="heroSrc"][data-v="manual"]';
const EXACT = '#solve-controls .seg-btn[data-k="mode"][data-v="exact"]';

/** the hardware threads every view reports: the solver's worker count, and so its plans, follow it (js/ui/budgets.js) */
const HARDWARE_THREADS = 4;

/** the trusted half's limits (tools/screenshot-comment.mjs) */
const LIMITS = { views: 60, pngBytes: 3 * 1024 * 1024, totalBytes: 40 * 1024 * 1024, name: /^[a-z0-9][a-z0-9-]{0,47}$/ };

/** A pixel counts as changed when a channel moves by more than this; a view when more than MIN_PIXELS do. */
const CHANNEL_TOLERANCE = 24;
const MIN_PIXELS = 20;

const SOLVE_TIMEOUT_MS = 300000;

// ---- the views -------------------------------------------------------------------------------------------------------

/**
 * Each view: name (its group is the part before the first dash), label, theme, size, and steps run in order once the
 * page is ready. The comment lists them in this order.
 */
const VIEWS = [
	// map: the default view in every theme, and every dungeon family in light and dark (their palettes differ)
	...THEMES.map((theme) => view(`map-3c-${theme}`, { theme })),
	...['f1', '6a', 'eb'].flatMap((family) => ['light', 'dark'].map((theme) => view(`map-${family}-${theme}`, { label: LABELS[family], theme }))),

	// size: the default view in other windows (1600 × 900 is map-3c-light)
	view('size-phone', { size: SIZES.phone }),
	view('size-phone-landscape', { size: SIZES.phoneLandscape }),
	view('size-narrow', { size: SIZES.narrow }),
	view('size-tablet', { size: SIZES.tablet }),
	view('size-laptop', { size: SIZES.laptop }),
	view('size-full', { size: SIZES.full }),
	view('size-big', { size: SIZES.big }),

	// zoom: one room of each family, close enough to see the sprites
	view('zoom-3c', { steps: [zoomTo({ critter: 267 }, 1.6)] }),
	view('zoom-f1', { label: LABELS.f1, steps: [zoomTo({ critter: 299 }, 1.6)] }),
	view('zoom-6a', { label: LABELS['6a'], steps: [zoomTo({ critter: 378 }, 1.6)] }),
	view('zoom-eb', { label: LABELS.eb, steps: [zoomTo({ critter: 624 }, 1.6)] }),
	view('zoom-6a-dark', { label: LABELS['6a'], theme: 'dark', steps: [zoomTo({ critter: 378 }, 1.6)] }),
	view('zoom-eb-dark', { label: LABELS.eb, theme: 'dark', steps: [zoomTo({ critter: 624 }, 1.6)] }),

	// select: a click on the map or a list, what the Selected panel says and what the map highlights
	view('select-monster', { steps: [clickOnMap({ critter: 259 })] }),
	view('select-object', { steps: [clickOnMap({ object: 40 })] }),   // a ladder: lines to its hatch
	view('select-boss', { steps: [clickOnMap({ critter: 267 })] }),
	view('select-npc', { steps: [clickOnMap({ critter: 401 })] }),
	view('select-familiar', { steps: [clickOnMap({ critter: 190 })] }),
	view('select-route-stop', { steps: [click('#route-info .row >> nth=3'), ...Array(4).fill(click('#zoom-in-btn'))] }),

	// hover: the mouse resting on a monster, its outline and the tooltip
	view('hover-tooltip', { steps: [hoverOnMap({ critter: 225 })] }),

	// layers: every map layer and option on, and the tall walls
	view('layers-all', { steps: [turnOnLayers()] }),
	view('layers-all-zoom', { label: LABELS.nonogram, steps: [turnOnLayers(), zoomTo({ cell: { x: 14, y: 67 } }, 0.9)] }),
	view('layers-all-dark', { theme: 'dark', steps: [turnOnLayers()] }),
	view('layers-tall-walls', { steps: [click('#walls-btn'), zoomTo({ critter: 267 }, 1.2)] }),

	// lists: the Objectives and Route lists scrolled half way, so both edges fade
	view('lists-scrolled', { steps: [scrollToMiddle('#objective-list'), scrollToMiddle('#route-info')] }),
	view('lists-scrolled-dark', { theme: 'dark', steps: [scrollToMiddle('#objective-list'), scrollToMiddle('#route-info')] }),

	// solver: its settings with a What-if hero in both modes, then a finished plan of each on a small dungeon
	view('solver-robust-whatif', { size: SIZES.full, steps: [click(WHAT_IF)] }),
	view('solver-exact-whatif', { size: SIZES.full, steps: [click(EXACT), click(WHAT_IF)] }),
	// the plan's first fight selected (its foes on the map), with the list back at the plan's totals
	view('solver-robust-plan', { label: LABELS.small, size: SIZES.full, steps: [click(WHAT_IF), solve(), click('#plan-list .enc-head >> nth=0'), scrollToTop('#solve-scroll')] }),
	view('solver-exact-script', { label: LABELS.small, size: SIZES.full, steps: [click(EXACT), click(WHAT_IF), solve(), playScriptMidFight(2)] }),

	// popup: each popup in light and dark, and some in sepia and dark high contrast; Progress in a taller window
	...['help', 'hero', 'progress', 'settings'].flatMap((popup) => ['light', 'dark'].map((theme) => view(`popup-${popup}-${theme}`, { theme, size: popupSize(popup), steps: openPopup(popup) }))),
	view('popup-help-sepia', { theme: 'sepia', steps: openPopup('help') }),
	view('popup-progress-sepia', { theme: 'sepia', size: SIZES.tall, steps: openPopup('progress') }),
	view('popup-hero-dark-high-contrast', { theme: 'dark-high-contrast', steps: openPopup('hero') }),
	view('popup-progress-dark-high-contrast', { theme: 'dark-high-contrast', size: SIZES.tall, steps: openPopup('progress') }),
	view('popup-progress-narrow', { size: SIZES.narrow, steps: openPopup('progress') }),
	view('popup-progress-phone', { size: SIZES.phone, steps: openPopup('progress') }),
	// part 3 of Once Upon a Forest in progress brings 3C's mini-boss (test/questlines.mjs); the map then says so
	view('popup-progress-edited', { size: SIZES.tall, steps: [...openPopup('progress'), chooseQuestPosition('Once Upon a Forest', 5)] }),
	view('popup-progress-edited-map', { steps: [...openPopup('progress'), chooseQuestPosition('Once Upon a Forest', 5), closePopup('progress')] }),
];

function view(name, { label = LABELS['3c'], theme = 'light', size = SIZES.wide, steps = [] } = {}) {
	return { name, group: name.split('-')[0], label, theme, size, steps };
}

function popupSize(popup) {
	return popup === 'progress' ? SIZES.tall : SIZES.wide;
}

// ---- steps: each returns what a view runs, (page) => Promise -----------------------------------------------------------

/** Centre the map on a target (findOnMap) at `scale` (1 = 1:1). */
function zoomTo(target, scale) {
	return async (page) => {
		const cell = await findOnMap(page, target);
		await page.evaluate(({ cell, scale }) => window.nkd.view.focus(cell.x, cell.y, scale), { cell, scale });
	};
}

/** Zoom in on a creature or object, click it, then move the mouse off the map (no hover outline or tooltip). */
function clickOnMap(target) {
	return async (page) => {
		await zoomTo(target, 1.2)(page);
		const point = await cellOnPage(page, await findOnMap(page, target));
		await page.mouse.click(point.x, point.y);
		await page.mouse.move(1, 1);
	};
}

/** Zoom in on a creature or object and rest the mouse on it: the hover outline and the tooltip. */
function hoverOnMap(target) {
	return async (page) => {
		await zoomTo(target, 1.2)(page);
		const point = await cellOnPage(page, await findOnMap(page, target));
		await page.mouse.move(point.x, point.y);
	};
}

/** Click a page element (a Playwright selector), then move the mouse away so it doesn't show its hover look. */
function click(selector) {
	return async (page) => {
		await page.click(selector);
		await page.mouse.move(0, 0);
	};
}

/** Tick every Show on map box that is off. */
function turnOnLayers() {
	return async (page) => {
		const rows = page.locator('#layer-list .layer-row:has(.checkbox:not(.selected))');
		for (let n = await rows.count(); n > 0; n--) await rows.first().click();
	};
}

/** Scroll a list back to its top. */
function scrollToTop(selector) {
	return (page) => page.$eval(selector, (box) => { box.scrollTop = 0; });
}

/** Scroll a list half way down. */
function scrollToMiddle(selector) {
	return (page) => page.$eval(selector, (box) => { box.scrollTop = Math.round((box.scrollHeight - box.clientHeight) / 2); });
}

/** Press Solve and wait for the plan (the shot masks how long it took). */
function solve() {
	const step = async (page) => {
		await page.click('#solve-run');
		await page.waitForFunction(() => window.nkd.solve.result && !window.nkd.solve.running, null, { timeout: SOLVE_TIMEOUT_MS });
	};
	step.slow = true;
	return step;
}

/** Exact plans: move the script player half way through fight `n` (1-based) with its slider. */
function playScriptMidFight(n) {
	return (page) => page.evaluate((i) => {
		const fight = window.nkd.solve.result.plan.encounters.filter((e) => e.script)[i - 1];
		const slider = document.querySelector('#pl-range');
		slider.value = String(Math.floor((fight.script.from + fight.script.to) / 2));
		slider.dispatchEvent(new Event('input'));
	}, n);
}

/** The steps that open a popup with its own button (Help through lib/utils, which has no button for it here). */
function openPopup(which) {
	const open = {
		help: (page) => page.evaluate(() => Popup.popup(document.querySelector('#popup-help'))),
		hero: click('#hero-open-btn'),
		progress: click('#progress-open-btn'),
		settings: click('#settings'),
	}[which];
	const steps = [open, waitForPopup(which)];
	// the questline cards fold their parts away: unfold the first, to show what each part changes
	if (which === 'progress') steps.push(click('#progress-body details.pg-parts summary >> nth=0'));
	return steps;
}

function waitForPopup(which) {
	return (page) => page.waitForFunction((id) => {
		const popup = document.querySelector(id);
		return popup.style.opacity === '1' && popup.parentNode.style.opacity === '1';
	}, `#popup-${which}`);
}

/** Close a popup the way a player does, by clicking beside it, and wait until it is gone. */
function closePopup(which) {
	return async (page) => {
		await page.mouse.click(5, 5);
		await page.waitForFunction((id) => document.querySelector(id).parentNode.style.opacity === '0', `#popup-${which}`);
	};
}

/** Your progress: set how far you are in a questline with its "Where are you?" list (position: 2 per part). */
function chooseQuestPosition(questline, position) {
	return async (page) => {
		const card = page.locator('#progress-body .pg-line', { has: page.locator('.pg-line-name', { hasText: questline }) });
		await card.locator('select[data-where]').selectOption(String(position));
		await page.waitForFunction(() => document.querySelector('#label-status .basis-custom'));
	};
}

// ---- running -----------------------------------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const views = args.only ? VIEWS.filter((v) => args.only.some((o) => matches(v, o))) : VIEWS;
checkViews(VIEWS);
if (args.list) {
	listViews(views);
	process.exit(0);
}
if (!views.length) fail(`no view matches --only ${args.only.join(',')} (see --list)`);
fs.mkdirSync(args.out, { recursive: true });

const started = Date.now();
const browser = await launchChromium();
try {
	const shots = await shootTrees(browser, { before: args.before, after: args.after, views, jobs: args.jobs });
	const manifest = { views: [] };
	for (const v of views) manifest.views.push(await record(browser, { view: v, before: shots.before?.get(v.name), after: shots.after.get(v.name) }));
	fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
	checkSizes(manifest, shots);
	const changed = manifest.views.filter((v) => v.status === 'changed' || v.status === 'added');
	const took = `${Math.round((Date.now() - started) / 1000)} s, ${megabytes(sumBytes(shots.after.values()))} MB of images`;
	console.log(args.before ? `${changed.length} of ${views.length} views look different (${took})` : `${views.length} views shot (${took})`);
} finally {
	await browser.close();
}

/**
 * Every view of both checkouts, `jobs` pages at a time: { after, before }, each a Map name -> PNG bytes. The solves
 * go first, so the quick views fill the gaps. A view the before checkout can't show is left out of its map (record()
 * calls it added); one this checkout can't show stops the run.
 */
async function shootTrees(browser, { before, after, views, jobs }) {
	const servers = { after: await serveStatic(after), before: before ? await serveStatic(before) : null };
	const shots = { after: new Map(), before: before ? new Map() : null };
	const queue = [];
	for (const tree of ['after', 'before']) {
		if (!servers[tree]) continue;
		const base = `http://127.0.0.1:${servers[tree].address().port}`;
		for (const v of views) queue.push({ tree, base, view: v });
	}
	queue.sort((a, b) => isSlow(b.view) - isSlow(a.view));
	try {
		await runAll(queue, jobs, async ({ tree, base, view: v }) => {
			const t0 = Date.now();
			try {
				shots[tree].set(v.name, await shoot(browser, base, v));
				if (args.verbose) console.log(`${v.name} (${tree}): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
			} catch (e) {
				if (tree === 'after') throw new Error(`${v.name}: ${e.message}`);
				console.log(`${v.name}: not on the before checkout (${e.message.split('\n')[0]})`);
			}
		});
	} finally {
		for (const server of Object.values(servers)) server?.close();
	}
	return shots;
}

/** `--only` entries: a view's name, else a group or name prefix (`map-3c-dark` is one view, `map-3c` four). */
function matches(v, entry) {
	if (VIEWS.some((other) => other.name === entry)) return v.name === entry;
	return v.name.startsWith(`${entry}-`);
}

function isSlow(v) {
	return v.steps.some((step) => step.slow) ? 1 : 0;
}

/** Run `task` on every item, at most `limit` at once. */
async function runAll(items, limit, task) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await task(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** One view: a fresh page with its theme, size and dungeon, its steps, then the screenshot. */
async function shoot(browser, base, v) {
	const context = await browser.newContext({ viewport: v.size, deviceScaleFactor: 1 });
	await context.addCookies([{ name: 'themeID', value: String(THEMES.indexOf(v.theme)), url: base }]);
	await context.addInitScript((threads) => Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => threads }), HARDWARE_THREADS);
	const page = await context.newPage();
	try {
		await openDungeon(page, `${base}/index.html#${v.label}`);
		for (const step of v.steps) {
			await step(page);
			await settle(page);
		}
		await markWallTimes(page);
		await repaintAll(page);
		return await page.screenshot({ mask: [page.locator('.nk-shot-mask')], maskColor: '#9a9a9a' });
	} finally {
		await context.close();
	}
}

/** Load the page and wait until the dungeon is drawn with the site's font, with every fade turned off. */
async function openDungeon(page, url) {
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.nkd && window.nkd.state.level && [...document.fonts].some((f) => f.family.includes('Proxima Nova') && f.status === 'loaded'), null, { timeout: 60000 });
	// the themes fade colours over 0.5 s (lib/utils transition.css), and popups fade in over 1 s (lib/utils Animate):
	// a shot mid-fade differs from run to run
	await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }' });
	await page.evaluate(() => { if (typeof Animate !== 'undefined') Animate.DEFAULT_PARAMS.runTime = 0; });
	await settle(page);
}

/** Fonts loaded and two frames drawn: the map redraws on the next animation frame. */
async function settle(page) {
	await page.evaluate(() => document.fonts.ready);
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/**
 * Paint the whole page afresh. Chromium repaints only what changed, and where a change cuts through a rounded corner
 * the edge pixels can come out a shade different from a full paint, depending on which frames the change landed in.
 */
async function repaintAll(page) {
	await page.evaluate(() => { document.documentElement.style.visibility = 'hidden'; });
	await settle(page);
	await page.evaluate(() => { document.documentElement.style.visibility = ''; });
	await settle(page);
}

/**
 * Put the solver's wall-clock times ("Done in 8.1 s.", "· 8.1 s") in boxes the screenshot masks, all one width (a time
 * with more digits would otherwise move the text after it).
 */
function markWallTimes(page) {
	return page.evaluate(() => {
		const time = /(\d+(?:\.\d+)? s\b)/;
		const maskBox = (text) => {
			const box = document.createElement('span');
			box.className = 'nk-shot-mask';
			box.style.cssText = 'display: inline-block; width: 3.5em; overflow: hidden; white-space: nowrap; vertical-align: top;';
			box.textContent = text;
			return box;
		};
		for (const root of document.querySelectorAll('#solve-status, #solve-result')) {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			const timed = [];
			for (let node = walker.nextNode(); node; node = walker.nextNode()) if (time.test(node.data)) timed.push(node);
			// split() with a capture group: the times are the odd parts
			for (const node of timed) node.replaceWith(...node.data.split(time).map((part, i) => (i % 2 ? maskBox(part) : part)));
		}
	});
}

/** A target's cell: `{ critter: id }` / `{ object: id }` (the first on the map with that id), or `{ cell: { x, y } }`. */
async function findOnMap(page, target) {
	if (target.cell) return target.cell;
	const cell = await page.evaluate(({ critter, object }) => {
		const level = window.nkd.state.level;
		const found = critter != null ? level.critters.find((c) => c.id === critter) : level.objects.find((o) => o.id === object);
		return found ? { x: found.x, y: found.y } : null;
	}, target);
	if (!cell) throw new Error(`nothing on the map matches ${JSON.stringify(target)}`);
	return cell;
}

/** Where a map cell is drawn on the page (CSS px). */
function cellOnPage(page, cell) {
	return page.evaluate(({ x, y }) => {
		const map = window.nkd.view;
		const box = map.canvas.getBoundingClientRect();
		const [sx, sy] = map.project(x, y);
		return { x: box.left + sx, y: box.top + sy };
	}, cell);
}

// ---- comparing -----------------------------------------------------------------------------------------------------------

/** Write a view's images (when they matter) and return its manifest entry. */
async function record(browser, { view: v, before, after }) {
	const write = (suffix, png) => fs.writeFileSync(path.join(args.out, `${v.name}.${suffix}.png`), png);
	if (!before) {
		write('after', after);
		return { name: v.name, status: args.before ? 'added' : 'shot' };
	}
	const changedPixels = await countChangedPixels(browser, before, after);
	if (changedPixels <= MIN_PIXELS) return { name: v.name, status: 'same', changedPixels };
	write('before', before);
	write('after', after);
	return { name: v.name, status: 'changed', changedPixels };
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

// ---- checks and options --------------------------------------------------------------------------------------------------

/** Names the comment workflow accepts, each once, and no more views than it takes. */
function checkViews(list) {
	const bad = list.filter((v) => !LIMITS.name.test(v.name)).map((v) => v.name);
	if (bad.length) fail(`view names must match ${LIMITS.name}: ${bad.join(', ')}`);
	const seen = new Set();
	for (const v of list) {
		if (seen.has(v.name)) fail(`two views are called ${v.name}`);
		seen.add(v.name);
	}
	if (list.length > LIMITS.views) fail(`${list.length} views: the comment workflow takes at most ${LIMITS.views}`);
}

/**
 * Stop when an image, or the images written, are more than the comment workflow takes. Warn when they would be if
 * every view changed: it then gets both sides of each.
 */
function checkSizes(manifest, shots) {
	for (const [side, pngs] of Object.entries(shots)) {
		for (const [name, png] of pngs || []) {
			if (png.length > LIMITS.pngBytes) fail(`${name} (${side}): ${megabytes(png.length)} MB, more than the ${megabytes(LIMITS.pngBytes)} MB the comment workflow takes per image`);
		}
	}
	const written = manifest.views.flatMap((v) => ['before', 'after'].map((side) => path.join(args.out, `${v.name}.${side}.png`))).filter((file) => fs.existsSync(file));
	const total = written.reduce((n, file) => n + fs.statSync(file).size, 0);
	if (total > LIMITS.totalBytes) fail(`${megabytes(total)} MB of images, more than the ${megabytes(LIMITS.totalBytes)} MB the comment workflow takes`);
	const worst = 2 * sumBytes(shots.after.values());
	if (worst > LIMITS.totalBytes) console.warn(`warning: if every view changed, the comment workflow would get ${megabytes(worst)} MB of images, more than the ${megabytes(LIMITS.totalBytes)} MB it takes`);
}

function sumBytes(pngs) {
	let n = 0;
	for (const png of pngs) n += png.length;
	return n;
}

function megabytes(bytes) {
	return (bytes / 1024 / 1024).toFixed(1);
}

function listViews(list) {
	let group = null;
	for (const v of list) {
		if (v.group !== group) console.log(`${group === null ? '' : '\n'}${v.group}`);
		group = v.group;
		console.log(`  ${v.name.padEnd(36)} ${v.label.padEnd(14)} ${v.theme.padEnd(19)} ${v.size.width}×${v.size.height}`);
	}
	console.log(`\n${list.length} views`);
}

function parseArgs(argv) {
	const value = (flag) => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : null;
	};
	const list = argv.includes('--list');
	const out = value('--out');
	if (!out && !list) {
		console.error('usage: node tools/screenshots.mjs --out DIR [--before DIR] [--after DIR] [--only group,name,...] [--jobs N] | --list');
		process.exit(2);
	}
	return {
		list,
		out: out && path.resolve(out),
		before: value('--before') && path.resolve(value('--before')),
		after: path.resolve(value('--after') || ROOT),
		only: value('--only') ? value('--only').split(',') : null,
		jobs: Math.max(1, Number(value('--jobs')) || 3),
		verbose: argv.includes('-v'),
	};
}

function fail(message) {
	console.error(`error: ${message}`);
	process.exit(2);
}
