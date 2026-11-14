// Browser smoke test: serve the site on loopback, load a dungeon of every family in every theme in headless
// Chromium, check the Help popup shows the game version and credits the wiki for the names, the Selected panel names a
// monster, a boss, a chest with its contents and a stuck door (with its energy cost), plus detailed tooltips; open the Your hero
// and Your progress popups, and fail on any page error or console error. On 3C-172582050 the Progress popup's mark
// buttons are used too: they move every slider to its end, the map says "Custom progress", and Reset undoes them.
//
// Also: a bare page load shows "No Dungeon Loaded" (a darker map, the panels saying there is nothing) in every theme;
// the confirm popup an import asks first (Cancel, Escape and focus); and, when the maintainer's synthetic saves are
// there (~/.cache/nk-oracle/save, or NK_SAVE_DIR), importing them: no question on an empty page, the save's dungeon
// shown, a question over a dungeon, Cancel keeping everything, Import clearing it and a reload keeping the save.
// On a phone: the tabs, a tap on the map, Help's close button, a pan and a pinch by touch,
// and the tooltip a finger or pen shows where it touches.
//
//   node test/smoke.mjs [-v]
//
// Needs Playwright (not a dependency of the site): `npm i --no-save playwright && npx playwright install chromium`.
// Elsewhere, point NK_PLAYWRIGHT at a playwright(-core) module and NK_CHROMIUM at a Chromium binary.
// Needs the lib/utils submodule (`git submodule update --init`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../tools/static-server.mjs';
import { launchChromium } from '../tools/chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = ['3C-172582050', 'F1-1026320547', '6A-123456789', 'EB-1325623421'];
const THEMES = ['Light', 'Dark', 'Dark High Contrast', 'Sepia'];
// 3C-172582050: what the Selected panel and the map tooltip must say about some cells (names from data/catalog.json)
const NAMED = {
	label: '3C-172582050',
	cells: [
		{ x: 9, y: 48, says: [/Brick door/, /Breaking it costs \d+ energy/] },               // object 28, a stuck door
		{ x: 38, y: 56, says: [/Orc shieldman/, /HP 17 · damage 7 · defence 5/] },           // monster 259
		{ x: 43, y: 10, says: [/Bone Dragon/, /Drops Emerald tablet shard/, /Name: Nonograms Katana Wiki/], tooltipSays: [/HP 85/, /Drops Emerald tablet shard/] },   // the boss, 267
		{ x: 33, y: 35, says: [/Purple chest/, /Holds Meteoric Iron/], tooltipSays: [/Holds Meteoric Iron/] },
	],
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const PANELS = { dungeon: '#panel-dungeon', info: '#panel-info', route: '#panel-route', solver: '#solve-section' };
const HERO_ID = 180;
const GAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-version.json'), 'utf8'));
const verbose = process.argv.includes('-v');
// the maintainer's synthetic saves (docs/testing.md): 3C-172582050 in progress, and a hero in town
const SAVE_DIR = path.join(process.env.NK_SAVE_DIR || path.join(os.homedir(), '.cache/nk-oracle/save'), 'synth');
const SAVED_DUNGEON = { file: path.join(SAVE_DIR, 'hw-8-172582050.dat'), label: '3C-172582050' };
const TOWN_SAVE = path.join(SAVE_DIR, 'town-0-1.dat');
const OTHER_LABEL = 'F1-1026320547';
const NO_FADES = '*, *::before, *::after { transition: none !important; }';   // lib/utils fades colours over 0.5 s

if (!fs.existsSync(path.join(ROOT, 'lib/utils/themes'))) fail('lib/utils is empty: run `git submodule update --init`.');

const browser = await launchChromium();
const server = await serveStatic(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
let failures = 0;
let checked = 0;
try {
	for (const [themeId, theme] of THEMES.entries()) {
		for (const label of LABELS) {
			failures += await checkPage(browser, base, label, themeId, theme);
			checked++;
		}
	}
	for (const [themeId, theme] of THEMES.entries()) {
		failures += await checkNoDungeonView(browser, base, themeId, theme);
		checked++;
	}
	failures += await checkConfirmPopup(browser, base);
	checked++;
	failures += await checkScriptPlayer(browser, base);
	checked++;
	if (haveSavedDungeonFiles()) {
		failures += await checkImportingSaves(browser, base);
		checked++;
	} else {
		console.log(`skipped the save import checks: ${SAVED_DUNGEON.file} or ${TOWN_SAVE} not found (maintainer-only oracle data)`);
	}
	failures += await checkPhone(browser, base);
	checked++;
} finally {
	await browser.close();
	server.close();
}
console.log(failures ? `${failures} failed` : `${checked} passed, 0 failed`);
process.exit(failures ? 1 : 0);

/** A new browser context (cookie: the theme) and page that collects page errors and console errors. */
async function openPage(browser, base, themeId) {
	const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	await context.addCookies([{ name: 'themeID', value: String(themeId), url: base }]);
	const page = await context.newPage();
	const errors = collectErrors(page);
	return { context, page, errors };
}

/** One page load: the map renders, both popups open, and nothing logs an error. Returns 1 on failure. */
async function checkPage(browser, base, label, themeId, theme) {
	const { context, page, errors } = await openPage(browser, base, themeId);
	try {
		await page.goto(`${base}/index.html#${label}`);
		await page.waitForFunction(() => window.nkd && window.nkd.state.level && window.nkd.solve, null, { timeout: 60000 });
		await page.waitForFunction(() => document.querySelector('#game-version b'), null, { timeout: 15000 }).catch(() => {});
		const shown = await page.evaluate(() => {
			const { level } = window.nkd.state;
			const help = document.querySelector('#popup-help')?.textContent || '';
			return { creatures: level.critters.length, objects: level.objects.length, version: document.querySelector('#game-version')?.textContent || '', credit: /names: Nonograms\s+Katana Wiki community, CC\s+BY-SA 3\.0/.test(help) };
		});
		if (!(shown.creatures > 0 && shown.objects > 0)) errors.push(`empty level: ${JSON.stringify(shown)}`);
		if (!shown.version.includes(GAME.versionName)) errors.push(`Help popup doesn't show game version ${GAME.versionName}: "${shown.version}"`);
		if (!shown.credit) errors.push('Help popup doesn\'t credit the Nonograms Katana Wiki for the names');
		if (label === NAMED.label) errors.push(...await namedCellErrors(page));
		if (label === NAMED.label) errors.push(...await markAllErrors(page));
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
	return report(`${theme} ${label}`, errors);
}

/**
 * A phone (390 × 844, touch): the tabs show one panel at a time and the page doesn't scroll; a tap on a creature
 * selects it and shows Info (only puts a dot on Info while the Solver is open); Help opens full screen and its close
 * button closes it; a pan, a pinch, and the finger left down after a pinch move and zoom the map. Returns 1 on failure.
 */
async function checkPhone(browser, base) {
	const context = await browser.newContext(PHONE);
	const page = await context.newPage();
	const errors = collectErrors(page);
	try {
		await page.goto(`${base}/index.html#${LABELS[0]}`);
		await page.waitForFunction(() => window.nkd && window.nkd.state.level && window.nkd.solve, null, { timeout: 60000 });
		// the tap and popup checks need working tabs; the gestures don't
		const input = await inputDevices(page, context);
		const tabErrors = await tabProblems(page);
		errors.push(...tabErrors);
		if (!tabErrors.length) errors.push(...await tapProblems(page));
		if (!tabErrors.length) errors.push(...await popupProblems(page));
		const touched = await touchTooltipProblems(page, input);   // with the Solver tab the tap checks leave open
		errors.push(...touched.problems);
		errors.push(...await gestureProblems(page, input));
		if (verbose) console.log(`  phone              ${LABELS[0].padEnd(14)} tabs, tap, touch tooltip (up ${touched.shownAfterMs} ms after the finger, ${touched.dragErrorPx} px from its cell in a drag), pan, pinch, popup`);
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	return report('phone', errors);
}

/** each tab shows its panel only, the arrow keys move along the tabs, a reload keeps the tab, and nothing scrolls */
async function tabProblems(page) {
	if (!(await page.isVisible('#sheet-tabs'))) return ['no tabs at phone size'];
	const problems = [];
	for (const name of Object.keys(PANELS)) {
		await page.tap(`#tab-${name}`);
		const shown = await shownPanels(page);
		if (shown.join() !== name) problems.push(`the ${name} tab shows: ${shown.join(', ') || 'no panel'}`);
	}
	await page.focus('#tab-solver');
	await page.keyboard.press('ArrowRight');
	if ((await shownPanels(page)).join() !== 'dungeon') problems.push('→ on the last tab does not go round to the first');
	await page.tap('#tab-route');
	await page.reload();
	await page.waitForFunction(() => window.nkd && window.nkd.state.level, null, { timeout: 60000 });
	if ((await shownPanels(page)).join() !== 'route') problems.push('a reload does not keep the tab');
	const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
	if (overflow.x > 0 || overflow.y > 0) problems.push(`the page scrolls: ${overflow.x} px sideways, ${overflow.y} px down`);
	return problems;
}

/** the sheet's panels on screen, with their tabs marked selected */
function shownPanels(page) {
	return page.evaluate((panels) => Object.keys(panels).filter((name) => {
		const onScreen = document.querySelector(panels[name]).getClientRects().length > 0;
		return onScreen && document.querySelector(`#tab-${name}`).getAttribute('aria-selected') === 'true';
	}), PANELS);
}

/** a finger's tap on a creature selects it and shows Info; with the Solver open, Info only gets its dot */
async function tapProblems(page) {
	const problems = [];
	await page.tap('#tab-dungeon');
	const creature = await zoomOnCreature(page);
	await page.touchscreen.tap(creature.x, creature.y);
	const said = await page.evaluate(() => document.querySelector('#selected-info').textContent);
	if (!said.includes(`#${creature.id}`)) problems.push(`a tap on creature #${creature.id} selects: "${said.slice(0, 60)}"`);
	if ((await shownPanels(page)).join() !== 'info') problems.push('a tap on the map does not show the Info tab');
	await page.tap('#tab-solver');
	await page.touchscreen.tap(creature.x, creature.y);
	const flagged = await page.evaluate(() => document.querySelector('#tab-info').classList.contains('flagged'));
	if ((await shownPanels(page)).join() !== 'solver' || !flagged) problems.push('a tap on the map with the Solver open does not just put a dot on Info');
	return problems;
}

/** Help fills the screen and its close button closes it (there is no backdrop left to tap) */
async function popupProblems(page) {
	await page.waitForFunction(() => document.querySelector('#help').onclick, null, { timeout: 15000 });
	await page.tap('#help');
	await page.waitForFunction(() => +document.querySelector('#popup-help').parentNode.style.opacity > 0.5, null, { timeout: 5000 }).catch(() => null);   // it fades in
	const open = await popupState(page, '#popup-help');
	if (!(open.shown && open.fills)) return [`Help on a phone: ${JSON.stringify(open)}`];
	await page.tap('#popup-help .popup-close');
	const closed = await page.waitForFunction(() => document.querySelector('#popup-help').parentNode.style.pointerEvents === 'none', null, { timeout: 5000 }).catch(() => null);
	return closed ? [] : ['the close button does not close Help'];
}

function popupState(page, selector) {
	return page.evaluate((sel) => {
		const popup = document.querySelector(sel);
		const r = popup.getBoundingClientRect();
		return { shown: +popup.parentNode.style.opacity > 0.5, fills: r.width === innerWidth && r.height === innerHeight };
	}, selector);
}

/** zoom the map in on the first creature that isn't the hero: its id and where it is on the page */
function zoomOnCreature(page) {
	return page.evaluate((heroId) => {
		const { view, state } = window.nkd;
		const creature = state.level.critters.find((c) => c.id !== heroId);
		view.focus(creature.x, creature.y, 1.5);
		const [sx, sy] = view.project(creature.x, creature.y);
		const r = view.canvas.getBoundingClientRect();
		return { id: creature.id, x: r.left + sx, y: r.top + sy };
	}, HERO_ID);
}

/** real input events (CDP): `touch(type, ...points)` for fingers, `pen(type, x, y)` for a pen (down or hovering) */
async function inputDevices(page, context) {
	const cdp = await context.newCDPSession(page);
	return {
		touch: (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }),
		pen: (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'pen' }),
	};
}

/**
 * A touch is a hover and a click at once. The tooltip the mouse would show comes up the instant a finger or pen goes
 * down (the same element, class, font and width as the mouse's), the thing is selected on lifting, and the tooltip
 * stays with the touched cell: it moves with the map when that is dragged or zoomed, waits while the cell is off the
 * map, and stays after the finger lifts, until the next touch, a turned phone, a tab switch, a key or a hidden tab
 * takes it away. Returns the problems found, how long after the finger the tooltip came up, and how far (px) it
 * strayed from its cell in a drag.
 */
async function touchTooltipProblems(page, { touch, pen }) {
	const [door, creature, , chest] = NAMED.cells;
	await watchTooltip(page);
	const problems = [];
	const times = {};
	for (const cell of [creature, chest, door]) problems.push(...await tapShowsTooltip(page, touch, cell, times));
	problems.push(...await tapOnFloor(page, touch));
	problems.push(...await tapNearEdges(page, touch, creature));
	problems.push(...await nextTouchMovesIt(page, touch, creature, chest));
	problems.push(...await dragCarriesIt(page, touch, creature, { times, says: (text) => creature.says[0].test(text) }));
	problems.push(...await dragCarriesIt(page, touch, await emptyFloor(page), { times, says: (text) => text.startsWith('Floor') }));
	problems.push(...await pinchKeepsIt(page, touch, creature));
	problems.push(...await waitsWhileOffTheMap(page, touch, creature));
	problems.push(...await staysOnItsSideInASlowDrag(page, touch, creature));
	problems.push(...await otherThingsTakeItAway(page, touch, creature));
	problems.push(...await tapOnTheDungeonTabKeepsIt(page, touch, creature));
	problems.push(...await penTouch(page, pen, creature));
	const scrolled = await page.evaluate(() => scrollX + scrollY);
	if (scrolled) problems.push(`touching the map scrolled the page by ${scrolled} px`);
	return { problems: problems.map((problem) => `touch tooltip: ${problem}`), shownAfterMs: times.shownAfterMs, dragErrorPx: times.dragErrorPx };
}

/** a tap names what is under it at once, above the finger, as the mouse's tooltip does, and it stays after lifting */
async function tapShowsTooltip(page, touch, cell, times) {
	await page.keyboard.press('Shift');   // a key takes away the tooltip an earlier tap left
	const finger = await placeCell(page, cell);
	await takeTooltipLog(page);
	await touch('touchStart', { ...finger, id: 0 });
	const shown = await tooltipState(page);
	await touch('touchEnd');
	const after = await tooltipState(page);
	const log = await takeTooltipLog(page);
	const said = await page.evaluate(() => document.querySelector('#selected-info').textContent);
	const problems = [];
	if (!shown.visible) problems.push(`a touch on ${cell.says[0]} shows no tooltip at once`);
	else if (!cell.says[0].test(shown.text) || !shown.text.includes(`${cell.x},${cell.y}`)) problems.push(`a touch on ${cell.says[0]} shows "${shown.text.slice(0, 60)}"`);
	else problems.push(...await misplaced(page, shown, finger), ...sameAsMouse(shown));
	if (shown.visible && shown.rect.bottom > finger.y - 20) problems.push(`the tooltip is not above a touch in the middle of the map: ${JSON.stringify(shown.rect)}, finger ${finger.y}`);
	if (!after.visible || after.text !== shown.text) problems.push(`the tooltip on ${cell.says[0]} does not stay after the finger lifts`);
	if (!cell.says[0].test(said)) problems.push(`a tap on ${cell.says[0]} selects: "${said.slice(0, 60)}"`);
	const delay = tooltipDelay(log);
	if (!(delay >= 0 && delay < 50)) problems.push(`the tooltip came up ${delay} ms after the finger, not at once`);
	times.shownAfterMs = Math.max(times.shownAfterMs ?? 0, Math.round(delay));
	return problems;
}

/** the plain floor is named as the mouse names it, and a tap there selects it */
async function tapOnFloor(page, touch) {
	const empty = await emptyFloor(page);
	if (!empty) return ['no empty floor tile to touch'];
	const finger = await placeCell(page, empty);
	await touch('touchStart', { ...finger, id: 0 });
	await touch('touchEnd');
	const shown = await tooltipState(page);
	const said = await page.evaluate(() => document.querySelector('#selected-info').textContent);
	const problems = [];
	if (shown.text !== empty.name || !shown.visible) problems.push(`a tap on the floor shows "${shown.text}", as the mouse would show "${empty.name}"`);
	if (!said.includes(`${empty.x},${empty.y}`)) problems.push(`a tap on the empty tile ${empty.x},${empty.y} selects: "${said.slice(0, 60)}"`);
	return problems;
}

/** touching near each edge of the map the tooltip still fits in it, beside or below the finger where there is no room above */
async function tapNearEdges(page, touch, cell) {
	const edges = { top: { fy: 0.08 }, bottom: { fy: 0.92 }, left: { fx: 0.05 }, right: { fx: 0.95 } };
	const problems = [];
	for (const [edge, where] of Object.entries(edges)) {
		const finger = await placeCell(page, cell, where);
		await touch('touchStart', { ...finger, id: 0 });
		const shown = await tooltipState(page);
		await touch('touchEnd');
		if (!shown.visible) problems.push(`a touch near the ${edge} edge shows no tooltip`);
		else problems.push(...(await misplaced(page, shown, finger)).map((problem) => `near the ${edge} edge: ${problem}`));
	}
	return problems;
}

/** the next touch moves the tooltip to what is under it, or takes it away when it is on nothing */
async function nextTouchMovesIt(page, touch, first, second) {
	const problems = [];
	let finger = await placeCell(page, first);
	await touch('touchStart', { ...finger, id: 0 });
	await touch('touchEnd');
	finger = await placeCell(page, second);
	await touch('touchStart', { ...finger, id: 0 });
	const moved = await tooltipState(page);
	await touch('touchEnd');
	if (!moved.visible || !second.says[0].test(moved.text) || first.says[0].test(moved.text)) problems.push(`a second touch on ${second.says[0]} shows "${moved.text.slice(0, 60)}"`);

	const outside = await page.evaluate(() => {
		const { view } = window.nkd;
		view.ox += 100000;   // far from the dungeon
		view.redraw();
		const rect = view.canvas.getBoundingClientRect();
		return { x: Math.round(rect.left + view.cssW / 2), y: Math.round(rect.top + view.cssH / 2) };
	});
	await touch('touchStart', { ...outside, id: 0 });
	const gone = await tooltipState(page);
	await touch('touchEnd');
	if (gone.visible) problems.push(`a touch on nothing leaves the tooltip: "${gone.text.slice(0, 60)}"`);
	return problems;
}

/** the first plain floor tile, with the text the mouse's tooltip shows for it */
function emptyFloor(page) {
	return page.evaluate(async () => {
		const { view, state } = window.nkd;
		const { TILE, tileName } = await import('/js/view/catalog.js');
		const { w, h, cells } = state.level;
		for (let y = 1; y < h - 1; y++) {
			for (let x = 1; x < w - 1; x++) {
				const i = y * w + x;
				if (cells[2 * i] === TILE.FLOOR && !view.objAt.has(i) && !view.critAt.has(i)) return { x, y, name: `${tileName(cells[2 * i], cells[2 * i + 1])} · ${x},${y}` };
			}
		}
		return null;
	});
}

/**
 * Dragging the map from a touched cell: the tooltip stays up, moves exactly as far as the map in every frame sampled
 * (a 40 px right, 25 px down drag), and is still there, in the same place, after the finger lifts.
 */
async function dragCarriesIt(page, touch, cell, { times, says }) {
	const problems = [];
	await page.keyboard.press('Shift');
	const finger = await placeCell(page, cell, { fx: 0.4 });   // room to slide to the right
	await touch('touchStart', { ...finger, id: 0 });
	const start = await tooltipState(page);
	if (!start.visible || !says(start.text)) return [`a touch to drag from shows "${start.text.slice(0, 40)}"`];
	let strayed = 0;
	for (let k = 1; k <= 5; k++) {
		await touch('touchMove', { x: finger.x + 8 * k, y: finger.y + 5 * k, id: 0 });
		await nextFrames(page);
		const frame = await tooltipState(page);
		if (!frame.visible || frame.text !== start.text) problems.push(`the tooltip is ${frame.visible ? 'changed' : 'gone'} ${k} moves into a drag`);
		strayed = Math.max(strayed, Math.abs(frame.rect.left - start.rect.left - 8 * k), Math.abs(frame.rect.top - start.rect.top - 5 * k));
	}
	const dragged = await tooltipState(page);
	await touch('touchEnd');
	await nextFrames(page);
	const after = await tooltipState(page);
	if (strayed > 2) problems.push(`the tooltip strayed ${strayed} px from where the drag put its cell`);
	times.dragErrorPx = Math.max(times.dragErrorPx ?? 0, Math.round(strayed * 10) / 10);
	if (!after.visible || Math.abs(after.rect.left - dragged.rect.left) > 1 || Math.abs(after.rect.top - dragged.rect.top) > 1) problems.push('the tooltip moves or goes when the finger lifts after a drag');
	return problems;
}

/** a pinch keeps the tooltip and it follows its cell as the map zooms */
async function pinchKeepsIt(page, touch, cell) {
	const problems = [];
	await page.keyboard.press('Shift');
	const finger = await placeCell(page, cell);
	await touch('touchStart', { ...finger, id: 0 });
	const before = await tooltipState(page);
	const cellBefore = await cellClientPoint(page, cell);
	const zoomBefore = (await mapPlacement(page)).scale;
	await touch('touchStart', { ...finger, id: 0 }, { x: finger.x + 60, y: finger.y, id: 1 });
	if (!(await tooltipState(page)).visible) problems.push('a second finger takes the tooltip away');
	for (let k = 1; k <= 4; k++) {
		await touch('touchMove', { ...finger, id: 0 }, { x: finger.x + 60 + 10 * k, y: finger.y, id: 1 });
		await nextFrames(page);
	}
	const after = await tooltipState(page);
	const cellAfter = await cellClientPoint(page, cell);
	await touch('touchEnd');
	if ((await mapPlacement(page)).scale <= zoomBefore) problems.push('a pinch no longer zooms the map');
	if (!after.visible) problems.push('a pinch takes the tooltip away');
	const off = Math.max(Math.abs(after.rect.left - before.rect.left - (cellAfter.x - cellBefore.x)), Math.abs(after.rect.top - before.rect.top - (cellAfter.y - cellBefore.y)));
	if (off > 2) problems.push(`after a pinch the tooltip is ${off} px from where its cell moved it`);
	return problems;
}

/** the tooltip waits while its cell is off the map, and is back, in place, when the cell returns */
async function waitsWhileOffTheMap(page, touch, cell) {
	const problems = [];
	await page.keyboard.press('Shift');
	const finger = await placeCell(page, cell);
	await touch('touchStart', { ...finger, id: 0 });
	await touch('touchEnd');
	const before = await tooltipState(page);
	const shift = (dx) => page.evaluate((dx) => { const { view } = window.nkd; view.ox += dx; view.redraw(); return view.pressUp; }, dx);
	const stillActive = await shift(1500);
	await nextFrames(page);
	if ((await tooltipState(page)).visible) problems.push('the tooltip stays on the page when its cell has left the map');
	if (!stillActive) problems.push('the tooltip is dismissed, not kept, when its cell leaves the map');
	await shift(-1500);
	await nextFrames(page);
	const back = await tooltipState(page);
	if (!back.visible || Math.abs(back.rect.left - before.rect.left) > 1 || Math.abs(back.rect.top - before.rect.top) > 1) problems.push('the tooltip does not come back in place when its cell does');
	return problems;
}

/** dragging slowly 110 px up the map and back, and 200 px along it, the tooltip changes side at most once and never flips back */
async function staysOnItsSideInASlowDrag(page, touch, cell) {
	const problems = [];
	const sidesOver = async (where, steps) => {
		await page.keyboard.press('Shift');
		const finger = await placeCell(page, cell, where);
		await touch('touchStart', { ...finger, id: 0 });
		const sides = [];
		for (const [dx, dy] of steps) {
			await touch('touchMove', { x: finger.x + dx, y: finger.y + dy, id: 0 });
			await nextFrames(page);
			const tooltip = await tooltipState(page);
			if (!tooltip.visible) sides.push('gone');
			else sides.push(sideOf(tooltip.rect, await cellClientPoint(page, cell)));
		}
		await touch('touchEnd');
		return sides.filter((side, k) => side !== sides[k - 1]);
	};
	const up = Array.from({ length: 14 }, (_, k) => [0, -8 * (k + 1)]);
	const down = Array.from({ length: 14 }, (_, k) => [0, -112 + 8 * (k + 1)]);
	const vertical = await sidesOver({ fy: 0.33 }, [...up, ...down]);
	if (vertical.length > 2 || vertical.includes('gone') || (vertical.length === 2 && vertical[0] !== 'above')) problems.push(`over a slow drag up and back the tooltip went ${vertical.join(' → ')}`);
	const along = await sidesOver({ fx: 0.15 }, Array.from({ length: 20 }, (_, k) => [10 * (k + 1), 0]));
	if (along.join() !== 'above') problems.push(`over a slow 200 px drag along the map the tooltip went ${along.join(' → ')}`);
	return problems;
}

/** which side of the cell point the tooltip is on */
function sideOf(rect, point) {
	if (rect.bottom <= point.y) return 'above';
	if (rect.top >= point.y) return 'below';
	return rect.left >= point.x ? 'right' : 'left';
}

/** where a cell's centre is on the page now */
function cellClientPoint(page, { x, y }) {
	return page.evaluate(({ x, y }) => {
		const { view } = window.nkd;
		const [sx, sy] = view.project(x, y);
		const rect = view.canvas.getBoundingClientRect();
		return { x: rect.left + sx, y: rect.top + sy };
	}, { x, y });
}

/** two animation frames: the tooltip is placed from the map's draw, which follows an input by one */
function nextFrames(page) {
	return page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** a cancelled touch, a turned phone, a tab tapped, a key and a hidden tab each take the tooltip away */
async function otherThingsTakeItAway(page, touch, cell) {
	const problems = [];
	const raise = async () => {
		const finger = await placeCell(page, cell);
		await touch('touchStart', { ...finger, id: 0 });
		return finger;
	};
	const expectAway = async (what) => { if ((await tooltipState(page)).visible) problems.push(`${what} leaves the tooltip up`); };

	await raise();
	await touch('touchCancel');
	await expectAway('a cancelled touch');

	await raise();
	await touch('touchEnd');
	await page.setViewportSize({ width: PHONE.viewport.height, height: PHONE.viewport.width });
	await page.waitForTimeout(300);
	await expectAway('turning the phone');
	await page.setViewportSize(PHONE.viewport);
	await page.waitForTimeout(300);

	await raise();
	await touch('touchEnd');
	await page.tap('#tab-route');
	await expectAway('switching to another tab');

	await raise();
	await touch('touchEnd');
	await page.keyboard.press('Shift');
	await expectAway('a key');

	await raise();
	await touch('touchEnd');
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { value: true, configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
		delete document.hidden;
	});
	await expectAway('a hidden tab');
	return problems;
}

/** a tap that itself switches to the Info tab keeps the tooltip it showed */
async function tapOnTheDungeonTabKeepsIt(page, touch, cell) {
	await page.tap('#tab-dungeon');
	const finger = await placeCell(page, cell);
	await touch('touchStart', { ...finger, id: 0 });
	await touch('touchEnd');
	const problems = [];
	if ((await shownPanels(page)).join() !== 'info') problems.push('a tap on the map from the Dungeon tab does not show Info');
	if (!(await tooltipState(page)).visible) problems.push('the tab switch a tap causes takes its tooltip away');
	return problems;
}

/** a pen above the screen hovers nothing; touching, it shows the tooltip at once, as a finger does, and it stays */
async function penTouch(page, pen, cell) {
	const problems = [];
	await page.keyboard.press('Shift');
	const point = await placeCell(page, cell);
	await pen('mouseMoved', point.x, point.y);
	await page.waitForTimeout(100);
	if ((await tooltipState(page)).visible) problems.push('a pen hovering shows a tooltip');
	await pen('mousePressed', point.x, point.y);
	const shown = await tooltipState(page);
	await pen('mouseReleased', point.x, point.y);
	if (!shown.visible || !cell.says[0].test(shown.text)) problems.push(`a pen touching ${cell.says[0]} shows "${shown.text.slice(0, 60)}"`);
	if (!(await tooltipState(page)).visible) problems.push('the tooltip does not stay after the pen lifts');
	await page.keyboard.press('Shift');
	return problems;
}

/** the cell {x, y} at the fraction fx, fy of the map (the middle by default), zoomed in: where a finger on it goes */
function placeCell(page, { x, y }, { fx = 0.5, fy = 0.5 } = {}) {
	return page.evaluate(({ x, y, fx, fy }) => {
		const { view } = window.nkd;
		view.focus(x, y, 1.5);
		const [sx, sy] = view.project(x, y);
		view.ox += view.cssW * fx - sx;
		view.oy += view.cssH * fy - sy;
		view.redraw();
		const rect = view.canvas.getBoundingClientRect();
		return { x: Math.round(rect.left + view.cssW * fx), y: Math.round(rect.top + view.cssH * fy) };
	}, { x, y, fx, fy });
}

function tooltipState(page) {
	return page.evaluate(() => {
		const tooltip = document.querySelector('#tooltip');
		const { left, top, right, bottom } = tooltip.getBoundingClientRect();
		const style = getComputedStyle(tooltip);
		return {
			visible: style.display !== 'none', text: tooltip.textContent, rect: { left, top, right, bottom },
			className: tooltip.className, inlineSize: tooltip.style.maxWidth + tooltip.style.fontSize,
			fontSize: parseFloat(style.fontSize), bodyFontSize: parseFloat(getComputedStyle(document.body).fontSize),
		};
	});
}

/** the touch tooltip is the mouse's tooltip: no variant class or size of its own, the stylesheet's font and width */
function sameAsMouse({ className, inlineSize, fontSize, bodyFontSize }) {
	const problems = [];
	if (className) problems.push(`the tooltip has the class "${className}"`);
	if (inlineSize) problems.push(`the tooltip has its own size "${inlineSize}"`);
	if (Math.abs(fontSize - 0.8 * bodyFontSize) > 0.1) problems.push(`the tooltip font is ${fontSize} px, not 80% of ${bodyFontSize}`);
	return problems;
}

/** what is wrong with where the tooltip is: not inside the map, or over the finger */
async function misplaced(page, { rect }, finger) {
	const map = await page.evaluate(() => { const r = window.nkd.view.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
	const problems = [];
	if (rect.left < map.left || rect.right > map.right || rect.top < map.top || rect.bottom > map.bottom) problems.push(`the tooltip ${JSON.stringify(rect)} is not inside the map ${JSON.stringify(map)}`);
	const overFinger = rect.left < finger.x + 20 && rect.right > finger.x - 20 && rect.top < finger.y + 20 && rect.bottom > finger.y - 20;
	if (overFinger) problems.push(`the tooltip is over the finger at ${finger.x}, ${finger.y}: ${JSON.stringify(rect)}`);
	return problems;
}

/** records when the tooltip comes and goes, and when a finger goes down on the map, with the page's own clock */
function watchTooltip(page) {
	return page.evaluate(() => {
		const tooltip = document.querySelector('#tooltip');
		const shown = () => getComputedStyle(tooltip).display !== 'none';
		let last = shown();
		window.tooltipLog = [];
		window.nkd.view.canvas.addEventListener('pointerdown', () => window.tooltipLog.push({ what: 'down', at: performance.now() }), true);
		new MutationObserver(() => {
			if (shown() === last) return;
			last = shown();
			window.tooltipLog.push({ what: last ? 'shown' : 'hidden', at: performance.now() });
		}).observe(tooltip, { attributes: true, attributeFilter: ['style'] });
	});
}

function takeTooltipLog(page) {
	return page.evaluate(() => window.tooltipLog.splice(0));
}

/** ms from the first finger down to the tooltip coming up */
function tooltipDelay(log) {
	const down = log.find((entry) => entry.what === 'down');
	const shown = log.find((entry) => entry.what === 'shown');
	return down && shown ? shown.at - down.at : NaN;
}

/** real touch events (CDP): a pan moves the map with the finger, a pinch to twice the spread zooms ×2, and the finger left down after it pans on */
async function gestureProblems(page, { touch }) {
	// Earlier tooltip checks zoom in; leave room for this test to double the zoom without hitting the limit.
	await page.evaluate(() => { window.nkd.view.scale = 1; window.nkd.view.redraw(); });
	const { x, y } = await page.evaluate(() => { const r = window.nkd.view.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
	const problems = [];

	let start = await mapPlacement(page);
	await touch('touchStart', { x, y, id: 0 });
	for (let k = 1; k <= 6; k++) await touch('touchMove', { x: x + 10 * k, y: y + 5 * k, id: 0 });
	await touch('touchEnd');
	let moved = movement(start, await mapPlacement(page));
	if (moved.dx !== 60 || moved.dy !== 30) problems.push(`a 60, 30 px pan moved the map ${moved.dx}, ${moved.dy} px`);

	start = await mapPlacement(page);
	await touch('touchStart', { x: x - 40, y, id: 0 });
	await touch('touchStart', { x: x - 40, y, id: 0 }, { x: x + 40, y, id: 1 });
	for (let k = 1; k <= 8; k++) await touch('touchMove', { x: x - 40 - 5 * k, y, id: 0 }, { x: x + 40 + 5 * k, y, id: 1 });
	await nextFrames(page);   // Chromium may deliver the last pointer move on the next frame
	moved = movement(start, await mapPlacement(page));
	if (Math.abs(moved.zoom - 2) > 0.01) problems.push(`pinching to twice the spread zoomed ×${moved.zoom.toFixed(2)}`);

	await touch('touchEnd', { x: x + 80, y, id: 1 });
	start = await mapPlacement(page);
	for (let k = 1; k <= 5; k++) await touch('touchMove', { x: x - 80 + 10 * k, y, id: 0 });
	await touch('touchEnd');
	moved = movement(start, await mapPlacement(page));
	if (moved.dx !== 50 || moved.dy !== 0) problems.push(`after a pinch, the finger left down moved the map ${moved.dx}, ${moved.dy} px, not 50, 0`);
	return problems;
}

function mapPlacement(page) {
	return page.evaluate(() => ({ ox: window.nkd.view.ox, oy: window.nkd.view.oy, scale: window.nkd.view.scale }));
}

function movement(from, to) {
	return { dx: Math.round(to.ox - from.ox), dy: Math.round(to.oy - from.oy), zoom: to.scale / from.scale };
}

/** page errors and console errors (not a missing favicon), as they happen */
function collectErrors(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
	return errors;
}

/** Select and hover each NAMED cell: the Selected panel must say all of its `says`, the tooltip its name and requested details. */
async function namedCellErrors(page) {
	const errors = [];
	for (const { x, y, says, tooltipSays = [says[0]] } of NAMED.cells) {
		const shown = await page.evaluate(({ x, y }) => {
			const { view } = window.nkd;
			view.onSelect(view.describe(x, y));
			view.onHover(view.describe(x, y));
			return { selected: document.querySelector('#selected-info').textContent, tooltip: document.querySelector('#tooltip').textContent };
		}, { x, y });
		if (!says.every((re) => re.test(shown.selected))) errors.push(`Selected panel at ${x},${y}: "${shown.selected.slice(0, 120)}"`);
		if (!tooltipSays.every((re) => re.test(shown.tooltip))) errors.push(`tooltip at ${x},${y}: "${shown.tooltip}"`);
	}
	return errors;
}

// ---- no dungeon, and importing a save ----------------------------------------------------------------------

/** A bare page load: "No Dungeon Loaded" on a darker map, panels that say so, controls that do nothing, no errors. */
async function checkNoDungeonView(browser, base, themeId, theme) {
	const { context, page, errors } = await openPage(browser, base, themeId);
	try {
		await page.goto(`${base}/index.html`);
		await waitForPage(page);
		await page.addStyleTag({ content: NO_FADES });
		const empty = await page.evaluate(noDungeonFacts);
		errors.push(...noDungeonProblems(empty));
		await pokeEmptyPage(page);
		await page.fill('#label-input', LABELS[0]);   // typing a label still works from here
		await page.click('#show-btn');
		await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 30000 });
		const shown = await page.evaluate(noDungeonFacts);
		if (shown.overlayShown) errors.push('"No Dungeon Loaded" stays over a dungeon');
		if (!(luminance(empty.mapColor) < luminance(shown.mapColor) || (themeId === 2 && luminance(empty.mapColor) === 0))) errors.push(`the empty map (${empty.mapColor}) is not darker than the map with a dungeon (${shown.mapColor})`);
		if (verbose) console.log(`  ${theme.padEnd(18)} no dungeon: map ${empty.mapColor} (with a dungeon ${shown.mapColor})`);
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	return report(`${theme} no dungeon`, errors);
}

/**
 * The page is wired up and its theme applied. init.js adds the theme stylesheet (#theme-css) on its own schedule, and
 * the map follows it (js/app.js followPageTheme): on a slow machine a check that reads colours before it would see the
 * fallback theme.
 */
async function waitForPage(page) {
	await page.waitForFunction(() => window.nkd && window.nkd.solve && window.nkd.state.hero && document.querySelector('#theme-css'), null, { timeout: 60000 });
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** What the page shows about having no dungeon: the state, the overlay, the panels and the View buttons. */
function noDungeonFacts() {
	const text = (selector) => document.querySelector(selector).innerText.replace(/\s+/g, ' ').trim();
	const overlay = document.querySelector('#map-empty');
	return {
		level: window.nkd.state.level,
		overlayShown: getComputedStyle(overlay).display !== 'none',
		overlayText: overlay.innerText.replace(/\s+/g, ' ').trim(),
		mapColor: getComputedStyle(document.querySelector('#map')).backgroundColor,
		selected: text('#selected-info'),
		objectives: text('#objective-list'),
		route: text('#route-info'),
		status: text('#label-status'),
		solver: text('#solve-result'),
		viewButtons: ['#zoom-in-btn', '#zoom-out-btn', '#fit-btn', '#hero-btn'].map((id) => document.querySelector(id).getAttribute('aria-disabled')),
		hash: location.hash,
		input: document.querySelector('#label-input').value,
	};
}

function noDungeonProblems(facts) {
	const problems = [];
	if (facts.level !== null) problems.push('state.level is not null on a bare page load');
	if (!facts.overlayShown || !/No Dungeon Loaded/.test(facts.overlayText)) problems.push(`no "No Dungeon Loaded" overlay: "${facts.overlayText}"`);
	for (const [panel, text] of [['Selected', facts.selected], ['Objectives', facts.objectives], ['Route', facts.route], ['status line', facts.status], ['solver', facts.solver]]) {
		if (!/no dungeon/i.test(text)) problems.push(`${panel} does not say there is no dungeon: "${text}"`);
	}
	if (facts.viewButtons.some((disabled) => disabled !== 'true')) problems.push('a View button that needs a dungeon is not disabled');
	if (facts.hash || facts.input) problems.push(`the label box or the URL still names a dungeon: "${facts.input}" "${facts.hash}"`);
	return problems;
}

/** Everything a visitor can do on the empty page: hover and drag the map, press keys, click the buttons and layers. */
async function pokeEmptyPage(page) {
	const box = await page.locator('#map').boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
	await page.mouse.up();
	await page.mouse.wheel(0, -200);
	for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'Home', 'End', ' ']) await page.keyboard.press(key);
	// force: Playwright would otherwise wait for the aria-disabled buttons to be enabled
	for (const id of ['#zoom-in-btn', '#zoom-out-btn', '#fit-btn', '#hero-btn', '#walls-btn']) await page.click(id, { force: true });
	await page.click('#layer-list .layer-row >> nth=0');   // Show on map still toggles
	await page.click('#layer-list .layer-row >> nth=0');
	await page.click('#solve-run', { force: true });
	await page.evaluate(() => window.nkd.state.hero.open());
	await page.waitForTimeout(600);
	await page.evaluate(() => window.nkd.state.hero.openProgress());
	await page.waitForTimeout(900);
}

/** [r, g, b] brightness of a CSS "rgb(r, g, b)" colour */
function luminance(color) {
	const [r, g, b] = color.match(/\d+/g).map(Number);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The popup an import asks first: what it says, where the focus is, Tab, Escape and the buttons. */
async function checkConfirmPopup(browser, base) {
	const { context, page, errors } = await openPage(browser, base, 0);
	try {
		await page.goto(`${base}/index.html#${LABELS[0]}`);
		await waitForPage(page);
		await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 60000 });
		const ask = () => page.evaluate(() => {
			window.__done = undefined;
			window.nkd.state.hero.opts.confirmImport({ replacesSave: true }).then((yes) => { window.__done = yes; });
		});
		const answer = async () => {
			await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 15000 });
			return page.evaluate(() => window.__done);
		};
		await ask();
		await waitPopupShown(page);
		const dialog = await page.evaluate(() => ({
			role: document.querySelector('#popup-confirm').getAttribute('role'),
			title: document.querySelector('#confirm-title').textContent,
			text: document.querySelector('#confirm-text').textContent,
			focus: document.activeElement && document.activeElement.id,
			buttons: [...document.querySelectorAll('#confirm-cancel, #confirm-ok')].map((b) => b.textContent),
		}));
		if (dialog.role !== 'alertdialog') errors.push(`the confirm popup is not an alert dialog: ${dialog.role}`);
		if (dialog.text !== 'Importing a save clears the existing dungeon and save. Import and continue?') errors.push(`confirm text: "${dialog.text}"`);
		if (dialog.focus !== 'confirm-cancel') errors.push(`the focus starts on "${dialog.focus}", not Cancel`);
		if (dialog.buttons.join('|') !== 'Cancel|Import') errors.push(`buttons: ${dialog.buttons}`);
		for (let i = 0; i < 5; i++) await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
		if (!await page.evaluate(() => document.querySelector('#popup-confirm').contains(document.activeElement))) errors.push('Tab left the confirm popup');
		await page.keyboard.press('Escape');
		await waitPopupGone(page);
		if (await answer() !== false) errors.push('Escape did not answer no');
		await ask();
		await waitPopupShown(page);
		await page.click('#confirm-ok');
		await waitPopupGone(page);
		if (await answer() !== true) errors.push('Import did not answer yes');
		await ask();
		await waitPopupShown(page);
		await page.click('#confirm-cancel');
		await waitPopupGone(page);
		if (await answer() !== false) errors.push('Cancel did not answer no');
		await ask();
		await waitPopupShown(page);
		await page.waitForFunction(() => document.querySelector('#popup-confirm').parentNode.onclick, null, { timeout: 15000 });   // Popup listens once it has faded in
		await page.mouse.click(4, 4);   // outside the box, on the dimmed page
		await waitPopupGone(page);
		if (await answer() !== false) errors.push('a click outside the box did not answer no');
		if (!await page.evaluate(() => document.querySelector('#popup-confirm').inert)) errors.push('the closed confirm popup can still take the focus');
		if (!await page.evaluate(() => window.nkd.state.level)) errors.push('the dungeon went away');
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	return report('confirm popup', errors);
}

function waitPopupShown(page) {
	return page.waitForFunction(() => Number(document.querySelector('#popup-confirm').parentNode.style.opacity) > 0.99, null, { timeout: 15000 });
}

/** faded out and closed (a question can be asked again) */
function waitPopupGone(page) {
	return page.waitForFunction(() => Number(document.querySelector('#popup-confirm').parentNode.style.opacity) === 0 && document.querySelector('#popup-confirm').inert, null, { timeout: 15000 });
}

function haveSavedDungeonFiles() {
	return fs.existsSync(SAVED_DUNGEON.file) && fs.existsSync(TOWN_SAVE);
}

/**
 * Importing the synthetic saves, as a player does: onto an empty page (no question, the save's dungeon appears), over
 * a dungeon (a question; Cancel changes nothing; Import clears to "No Dungeon Loaded" for a save made in town) and
 * with a reload in between.
 */
async function checkImportingSaves(browser, base) {
	const { context, page, errors } = await openPage(browser, base, 0);
	const inDungeon = path.basename(SAVED_DUNGEON.file);
	try {
		await page.goto(`${base}/index.html`);
		await waitForPage(page);
		await page.waitForFunction(() => document.querySelector('#map-section.no-dungeon'), null, { timeout: 30000 });
		await importFile(page, SAVED_DUNGEON.file);
		await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 30000 });
		let now = await importedFacts(page);
		if (await popupSeen(page)) errors.push('an import onto an empty page asked a question');
		if (now.shown !== SAVED_DUNGEON.label || now.hash !== `#${SAVED_DUNGEON.label}`) errors.push(`the save's dungeon is not shown: "${now.shown}" ${now.hash}`);
		if (!/from your save/.test(now.status)) errors.push(`the status line does not say it is the save's dungeon: "${now.status}"`);
		if (!now.targetsSave) errors.push(`the solver does not say it solves ${SAVED_DUNGEON.label} with the saved hero: "${now.target}"`);
		errors.push(...await importOverADungeonErrors(page, inDungeon));
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	return report('importing saves', errors);
}

/** Another dungeon on screen with a plan: the town save asks first; Cancel changes nothing; Import clears everything. */
async function importOverADungeonErrors(page, inDungeon) {
	const errors = [];
	await page.fill('#label-input', OTHER_LABEL);
	await page.click('#show-btn');
	await page.waitForFunction((label) => window.nkd.state.level && document.querySelector('#label-input').value === label, OTHER_LABEL, { timeout: 30000 });
	await solveSmall(page);
	await importFile(page, TOWN_SAVE);
	await waitPopupShown(page);
	if (!/^Importing a save clears the existing dungeon and save\. Import and continue\?$/.test(await page.textContent('#confirm-text'))) errors.push('the question does not say the dungeon and save are cleared');
	if ((await importedFacts(page)).file !== inDungeon) errors.push('the save was replaced before the answer');
	await page.click('#confirm-cancel');
	await waitPopupGone(page);
	let now = await importedFacts(page);
	if (now.file !== inDungeon || now.shown !== OTHER_LABEL || !now.hasPlan || now.hash !== `#${OTHER_LABEL}`) errors.push(`Cancel changed something: ${JSON.stringify(now)}`);
	await importFile(page, TOWN_SAVE);
	await waitPopupShown(page);
	await page.click('#confirm-ok');
	await waitPopupGone(page);
	await page.waitForFunction(() => !window.nkd.state.level, null, { timeout: 30000 });
	now = await importedFacts(page);
	if (now.file !== path.basename(TOWN_SAVE) || now.shown !== null || now.hasPlan || now.hash !== '') errors.push(`Import left something behind: ${JSON.stringify(now)}`);
	if (!/not inside a dungeon/.test(now.status) || !now.overlay) errors.push(`the page does not say the save is in town: "${now.status}"`);
	await page.reload();
	await waitForPage(page);
	await page.waitForTimeout(1500);
	now = await importedFacts(page);
	if (now.file !== path.basename(TOWN_SAVE) || now.shown !== null || !now.overlay) errors.push(`a reload brought something back: ${JSON.stringify(now)}`);
	await importFile(page, SAVED_DUNGEON.file);   // an empty page again: no question
	await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 30000 });
	await page.evaluate(() => history.replaceState(null, '', location.pathname));
	await page.reload();   // a bare URL: the kept save's dungeon
	await waitForPage(page);
	await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 30000 });
	now = await importedFacts(page);
	if (now.shown !== SAVED_DUNGEON.label) errors.push(`a reload does not show the kept save's dungeon: "${now.shown}"`);
	return errors;
}

/** A small robust solve (a what-if hero, Normal search), so a plan is on screen. */
async function solveSmall(page) {
	await page.evaluate(() => {
		const panel = window.nkd.solve;
		Object.assign(panel.cfg, { mode: 'robust', heroSrc: 'manual', budget: 'normal' });
		return panel.run();
	});
	if (!await page.evaluate(() => !!window.nkd.solve.result)) throw new Error('the small solve made no plan');
}

function importFile(page, file) {
	return page.setInputFiles('#hero-file', file);
}

function popupSeen(page) {
	return page.evaluate(() => Number(document.querySelector('#popup-confirm').parentNode.style.opacity) > 0);
}

async function importedFacts(page) {
	return page.evaluate(async () => {
		const { formatLabel } = await import('/js/labels.js');
		const { state, solve } = window.nkd;
		const target = (document.querySelector('#solve-target') || {}).innerText || '';
		return {
			shown: state.level ? formatLabel(state.type, state.seed) : null,
			hash: location.hash,
			file: state.hero.info && state.hero.info.file,
			hasPlan: !!solve.result,
			overlay: getComputedStyle(document.querySelector('#map-empty')).display !== 'none',
			status: document.querySelector('#label-status').innerText.replace(/\s+/g, ' ').trim(),
			target: target.replace(/\s+/g, ' ').trim(),
			targetsSave: /from your save/.test(target),
		};
	});
}

/**
 * The exact-mode script player's Play / Pause button takes a press that lasts across a step: the player redraws every
 * 450 ms while playing, and a press must not be lost when that happens (it used to swap the button's icon each step).
 */
async function checkScriptPlayer(browser, base) {
	const { context, page, errors } = await openPage(browser, base, 0);
	const playing = () => page.evaluate(() => !!window.nkd.solve.playing);
	try {
		await page.goto(`${base}/index.html#1A-1429008869`);   // 12 fights: quick to solve
		await waitForPage(page);
		await page.waitForFunction(() => window.nkd.state.level, null, { timeout: 60000 });
		await page.click('#solve-controls .seg-btn[data-k="mode"][data-v="exact"]');
		await page.click('#solve-controls .seg-btn[data-k="heroSrc"][data-v="manual"]');
		await page.click('#solve-run');
		await page.waitForFunction(() => window.nkd.solve.result && !window.nkd.solve.running && document.querySelector('#pl-play'), null, { timeout: 300000 });
		const button = await page.locator('#pl-play').boundingBox();
		const press = async (ms) => {
			await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
			await page.mouse.down();
			await page.waitForTimeout(ms);
			await page.mouse.up();
			await page.waitForTimeout(100);
		};
		for (let round = 0; round < 3; round++) {
			await press(60);
			if (!await playing()) { errors.push(`round ${round + 1}: Play did not start the script`); break; }
			await press(600);   // longer than a step
			if (await playing()) { errors.push(`round ${round + 1}: a press held across a step did not pause`); break; }
		}
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await context.close();
	}
	return report('script player', errors);
}

/** Print a failure and return 1, or return 0. */
function report(what, errors) {
	if (!errors.length) return 0;
	console.log(`FAIL ${what}:\n  ${[...new Set(errors)].join('\n  ')}`);
	return 1;
}

/**
 * The Your progress popup's "mark done" buttons, used the way a player does: open it with its button, click, close it by
 * clicking beside it. Quests: every questline slider ends at its end, the map's badge changes to custom progress and the
 * button keeps the keyboard focus. Bosses, by the keyboard: every box ticked. Reset puts the new game back.
 */
async function markAllErrors(page) {
	const errors = [];
	const state = () => page.evaluate(() => {
		const lines = [...document.querySelectorAll('#progress-body .pg-line')];
		const atEnd = (line) => {
			const bar = line.querySelector('.pg-bar');
			if (bar) return bar.getAttribute('aria-valuenow') === bar.getAttribute('aria-valuemax');
			return !!line.querySelector('.pg-seg .seg-btn.selected[data-st="done"]');
		};
		const boxes = [...document.querySelectorAll('#progress-body .pg-grid .pg-check')];
		return {
			lines: lines.length,
			atEnd: lines.filter(atEnd).length,
			beaten: boxes.filter((b) => b.getAttribute('aria-checked') === 'true').length,
			boxes: boxes.length,
			badge: document.querySelector('.map-basis b')?.textContent,
			changes: document.querySelector('#progress-body .pg-count')?.textContent.trim(),
			result: document.querySelector('#progress-body .pg-mark-result')?.textContent,
			focus: document.activeElement?.dataset?.mark,
		};
	});
	const waitForBadge = (text) => page.waitForFunction((t) => document.querySelector('.map-basis b')?.textContent === t, text, { timeout: 15000 });
	try {
		await page.click('#progress-open-btn');
		await page.waitForFunction(() => {
			const popup = document.querySelector('#popup-progress');
			return popup.style.opacity === '1' && popup.parentNode.style.opacity === '1' && popup.querySelector('.pg-mark-btn');
		}, null, { timeout: 15000 });
		errors.push(...await progressTextErrors(page));
		const start = await state();
		if (start.badge !== 'New game' || start.atEnd !== 0 || start.beaten !== 0) errors.push(`progress popup should start as a new game: ${JSON.stringify(start)}`);
		await page.click('#progress-body .pg-mark-btn[data-mark="quests"]');
		await waitForBadge('Custom progress');
		const quests = await state();
		if (quests.atEnd !== quests.lines || quests.lines < 10) errors.push(`mark all quests done: ${quests.atEnd} of ${quests.lines} sliders at their end`);
		if (quests.beaten !== 0) errors.push('mark all quests done also marked bosses beaten');
		if (!/questlines moved to done/.test(quests.result || '')) errors.push(`mark all quests done: no result line (${quests.result})`);
		if (quests.focus !== 'quests') errors.push('the mark button lost the keyboard focus when the popup redrew');
		await page.focus('#progress-body .pg-mark-btn[data-mark="bosses"]');
		await page.keyboard.press('Enter');
		await page.waitForFunction(() => document.querySelector('#progress-body .pg-grid .pg-check[aria-checked="true"]'));
		const bosses = await state();
		if (bosses.beaten !== bosses.boxes || bosses.boxes < 20) errors.push(`mark all bosses beaten, by keyboard: ${bosses.beaten} of ${bosses.boxes} boxes ticked`);
		if (bosses.atEnd !== bosses.lines) errors.push('mark all bosses beaten moved a slider');
		await page.click('#progress-body .pg-reset[data-clear]');
		await waitForBadge('New game');
		const reset = await state();
		if (reset.atEnd !== 0 || reset.beaten !== 0 || /change/.test(reset.changes) && !/No changes/.test(reset.changes)) errors.push(`Clear changes did not undo the marks: ${JSON.stringify(reset)}`);
		if (!(await page.$('#progress-body .pg-reset[data-clear].disabled'))) errors.push('Clear changes is not disabled with no changes');
		await page.mouse.click(5, 5);
		await page.waitForFunction(() => document.querySelector('#popup-progress').parentNode.style.opacity === '0', null, { timeout: 15000 });
	} catch (e) {
		errors.push(`mark buttons: ${e.message.split('\n')[0]}`);
	}
	return errors;
}

/**
 * What the Your progress popup says, on 3C: no quest name with the game's teaser ellipsis ("Once Upon a ..." is part 1 of
 * Once Upon a Forest), unlocks as "Unlocks <b>quest</b> (dungeon)", the NPC grid with every dungeon in the game's rows
 * and "← here" on 3C, and where the game shows the items, buildings, and counts.
 */
async function progressTextErrors(page) {
	const shown = await page.evaluate(() => {
		const body = document.querySelector('#progress-body');
		const unlock = [...body.querySelectorAll('.pg-effects li')].find((li) => li.textContent.includes('Unlocks Magic Beans (4A)'));
		const rows = [...body.querySelectorAll('.pg-picks .pg-pick-row')];
		const here = body.querySelectorAll('.pg-pick.pg-cur');
		const marker = here[0]?.querySelector('.pg-here');
		return {
			ellipsis: (body.textContent.match(/[^.\s]*\s?(\.\.\.|…)/g) || []).slice(0, 3),
			unlockBold: unlock ? [...unlock.querySelectorAll('b')].map((b) => b.textContent) : null,
			rows: rows.map((r) => [...r.querySelectorAll('.pg-pick-head b')].map((b) => b.textContent).join(' ')),
			here: [here.length, here[0]?.querySelector('.pg-pick-head b')?.textContent, marker?.textContent, marker?.getAttribute('aria-label'), here[0]?.getAttribute('aria-current')],
			inGame: [...body.querySelectorAll('.pg-help')].filter((h) => h.textContent.startsWith('In the game:')).length,
			heading: [...body.querySelectorAll('.content-header-2')].some((h) => h.textContent === 'Items, buildings, and counts'),
		};
	});
	const errors = [];
	const ROWS = ['EA EB EC ED', 'F1 F2 F3 F4', '1A 1B 1C', '2A 2B 2C', '3A 3B 3C', '4A 4B 4C', '5A 5B 5C', '6A 6B 6C 6D'];
	if (shown.ellipsis.length) errors.push(`progress popup shows an ellipsis: ${shown.ellipsis.join(' | ')}`);
	if (JSON.stringify(shown.unlockBold) !== '["Magic Beans"]') errors.push(`"Unlocks Magic Beans (4A)" without the name in bold: ${JSON.stringify(shown.unlockBold)}`);
	if (shown.rows.join(' / ') !== ROWS.join(' / ')) errors.push(`quest NPC grid rows: ${shown.rows.join(' / ')}`);
	if (shown.here.join() !== '1,3C,← here,this dungeon, the one on the map,location') errors.push(`quest NPC grid "here" mark: ${shown.here.join()}`);
	if (shown.inGame !== 3 || !shown.heading) errors.push(`items, buildings, and counts: ${shown.inGame} "In the game:" notes, heading ${shown.heading}`);
	return errors;
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
