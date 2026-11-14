// Browser smoke test: serve the site on loopback, load a dungeon of every family in every theme in headless
// Chromium, check the Help popup shows the game version and credits the wiki for the names, the Selected panel names a
// monster, a boss, a chest with its contents and a stuck door (with its energy cost), plus detailed tooltips; open the Your hero
// and Your progress popups, and fail on any page error or console error.
//
// Also: a bare page load shows "No Dungeon Loaded" (a darker map, the panels saying there is nothing) in every theme;
// the confirm popup an import asks first (Cancel, Escape and focus); and, when the maintainer's synthetic saves are
// there (~/.cache/nk-oracle/save, or NK_SAVE_DIR), importing them: no question on an empty page, the save's dungeon
// shown, a question over a dungeon, Cancel keeping everything, Import clearing it and a reload keeping the save.
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
	if (haveSavedDungeonFiles()) {
		failures += await checkImportingSaves(browser, base);
		checked++;
	} else {
		console.log(`skipped the save import checks: ${SAVED_DUNGEON.file} or ${TOWN_SAVE} not found (maintainer-only oracle data)`);
	}
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
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(m.text()); });
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

/** Print a failure and return 1, or return 0. */
function report(what, errors) {
	if (!errors.length) return 0;
	console.log(`FAIL ${what}:\n  ${[...new Set(errors)].join('\n  ')}`);
	return 1;
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
