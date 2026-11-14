// UI glue: label input -> level -> isometric view, layers, selection info, objectives, route.
import { showGameVersion } from './game-version.js';
import { parseLabel, formatLabel, typeLabel, family } from './labels.js';
import { IsoView } from './view/iso.js';
import { KINDS, objectKind, critterKind, tileName, linkGroup } from './view/catalog.js';
import { partners, allLinks, floorNonogram, LINK_COLORS } from './view/links.js';
import { occupantHtml, occupantName } from './ui/occupant.js';
import { initTables, zw, vj0 as V } from './gen/statics.js';
import { planRoute, objectives as gameObjectives } from './plan/planner.js';
import { HeroPanel, hasKeptSave } from './hero.js';
import { SolvePanel } from './ui/solve-panel.js';
import { confirmPopup } from './ui/confirm-popup.js';

const $ = (s) => document.querySelector(s);

const LAYERS = [
	{ id: 'monsters', label: 'Monsters and people', color: KINDS.monster.color, on: true },
	{ id: 'loot', label: 'Chests, pages, fountains', color: KINDS.chest.color, on: true },
	{ id: 'doors', label: 'Doors, gates, levers', color: KINDS.lockdoor.color, on: true },
	{ id: 'links', label: 'Ladders, hatches, portals', color: KINDS.ladder.color, on: true },
	{ id: 'alllinks', label: 'Lines between linked pairs', color: LINK_COLORS.ladder, on: false },
	{ id: 'puzzles', label: 'Puzzle rooms', color: KINDS.puzzledoor.color, on: true },
	{ id: 'solutions', label: 'Puzzle solutions', color: KINDS.puzzledoor.color, on: false, spoiler: true },
	{ id: 'traps', label: 'Hidden traps', color: KINDS.trap.color, on: false, spoiler: true },
	{ id: 'decor', label: 'Furnishings', color: KINDS.decor.color, on: false },
	{ id: 'route', label: 'Route', color: '#4f9ef8', on: true },
	{ id: 'endexit', label: 'Route ends at the stairs', color: '#ffd84a', on: false, option: true },
];

// how many steps one point of energy / mental power is worth when choosing a path
const EFFORT = {
	steps: { epCost: 0.2, mpCost: 0.2 },
	balanced: { epCost: 3, mpCost: 3 },
	save: { epCost: 12, mpCost: 12 },
};

const MAP_BG = { light: '#ece9e2', sepia: '#e6dbc3', dark: '#0b0b0d', contrast: '#000000' };
// the map with no dungeon on it: a little darker than MAP_BG, and the colour of the words over it (the dark themes
// have little room to go darker: Dark High Contrast is pure black already)
const MAP_EMPTY = {
	light: { bg: '#d9d5cb', text: '#2b2a27' },
	sepia: { bg: '#d3c5a6', text: '#3a2a12' },
	dark: { bg: '#050506', text: '#d6d6dc' },
	contrast: { bg: '#000000', text: '#ffffff' },
};
const SELECT_HINT = 'Click a tile, object or monster.';
const NO_DUNGEON = {
	status: 'No dungeon is shown. Type a label above, or import a save made inside a dungeon.',
	notInDungeon: 'This save is not inside a dungeon, so no dungeon is shown. Type a label above to look at one.',
	select: 'Nothing to select: no dungeon is shown.',
	list: 'No dungeon is shown.',
};
// the View buttons that need a dungeon on the map (the solver and tall-walls buttons work without one)
const MAP_VIEW_BUTTONS = ['#zoom-in-btn', '#zoom-out-btn', '#fit-btn', '#hero-btn'];
const HERO_ID = 180;
const EXIT_LOCK_LOOK = { color: KINDS.lockdoor.color, glyph: '⚿', label: 'Unlock the exit (mini-boss key)' };
const PUZZLE_STOP_LOOK = { glyph: '▦', color: KINDS.puzzledoor.color };

/**
 * The page's state, shared with the solver panel and exposed as `window.nkd.state`: the dungeon shown (level, type,
 * seed) and its route (plan), the generator (null: only the sample fixtures), the new-game profile (fresh), the
 * Your hero and solver panels, and the item, skill and quest names (data/names.json). `level` is null while no
 * dungeon is shown ("No Dungeon Loaded"); `type` then stays the last one shown (the hero panel's pack uses it).
 */
const state = { level: null, type: 8, seed: 0, generator: null, fresh: null, hero: null, plan: null, solve: null, names: {} };

/** The map (IsoView). main() makes it before anything else runs. */
let view;

async function main() {
	view = createMapView();
	const layersOn = savedLayers();
	renderLayerList(layersOn);
	view.setLayers(layersOn);
	window.nkd = { view, state, show };   // console/debug handle
	followPageTheme();
	if (location.hash.length <= 1 && !hasKeptSave()) setNoDungeonView(true);   // nothing to wait for

	await loadGameData();
	showGameVersion($('#game-version'));

	// Your hero: the imported save (kept in this tab's sessionStorage) and whether maps use it
	state.hero = createHeroPanel();
	state.hero.bind();
	if (state.generator) await state.hero.restore();

	// Solver column (js/ui/solve-panel.js): solves run in a module worker with its own pool
	const names = await loadNames();
	state.names = names;
	state.solve = new SolvePanel({ view, state, names, root: $('#solve-section'), show: (label) => show(label) });
	state.solve.bind();
	window.nkd.solve = state.solve;
	bindSolverToggle();

	bindLabelControls();
	bindMapButtons();
	bindEffortSelect();
	window.addEventListener('hashchange', () => show(labelInHash()));

	showStartView();
}

/** The first view: the URL's label; else the dungeon in the save kept in this tab; else "No Dungeon Loaded". */
async function showStartView() {
	const saved = state.hero.dungeon;
	if (location.hash.length <= 1 && !saved) return clearDungeon();
	await show(location.hash.length > 1 ? labelInHash() : formatLabel(saved.type, saved.seed));
	if (!state.level) showNoDungeon();   // the label did not build: the status line says why
}

// ---- page setup --------------------------------------------------------------------------

/** The map, with a tooltip that follows the mouse and names what is under it. */
function createMapView() {
	const tooltip = $('#tooltip');
	const mapView = new IsoView($('#map'), {
		onHover: (cell) => showTooltip(tooltip, cell),
		onSelect: showSelection,
	});
	$('#map').addEventListener('mousemove', (e) => {
		tooltip.style.left = `${Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8))}px`;
		tooltip.style.top = `${Math.max(8, Math.min(e.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8))}px`;
	});
	return mapView;
}

function showTooltip(tooltip, cell) {
	if (!cell) {
		tooltip.style.display = 'none';
		return;
	}
	const occupied = cell.critter || cell.object;
	tooltip.textContent = occupied ? `${tooltipSummary(cell)} · ${cell.x},${cell.y}` : `${tileName(cell.a, cell.b)} · ${cell.x},${cell.y}`;
	tooltip.style.display = 'block';
}

/** Reuse the Selected panel's details, with plain text and without its attribution line. */
function tooltipSummary(cell) {
	const summary = document.createElement('div');
	summary.innerHTML = occupantHtml(cell, { level: state.level, names: state.names, profile: V.i2 });
	summary.querySelector('.wiki-credit')?.remove();
	return Array.from(summary.children, (line) => line.textContent).join(' — ');
}

/** The ids of the map layers that are on: the player's last choice (localStorage), else the defaults. */
function savedLayers() {
	const saved = JSON.parse(localStorage.getItem('nkd-layers') || 'null');
	return new Set(saved || LAYERS.filter((l) => l.on).map((l) => l.id));
}

/** The Show on map checkboxes; clicking one edits `layersOn` in place. */
function renderLayerList(layersOn) {
	const box = $('#layer-list');
	for (const layer of LAYERS) box.append(layerRow(layer, layersOn));
}

function layerRow(layer, layersOn) {
	const row = document.createElement('div');
	row.className = 'layer-row';
	const checkbox = document.createElement('div');
	checkbox.className = 'checkbox' + (layersOn.has(layer.id) ? ' selected' : '');
	row.append(checkbox);
	const label = document.createElement('span');
	label.innerHTML = `<span class="swatch" style="background:${layer.color}"></span> ${layer.label}${layer.spoiler ? ' <span class="spoiler">(spoiler)</span>' : ''}`;
	row.append(label);
	row.onclick = () => {
		if (checkbox.classList.toggle('selected')) layersOn.add(layer.id);
		else layersOn.delete(layer.id);
		layersChanged(layer, layersOn);
	};
	return row;
}

function layersChanged(layer, layersOn) {
	localStorage.setItem('nkd-layers', JSON.stringify([...layersOn]));
	view.setLayers(layersOn);
	view.setLinks(baseLinks(), view.highlights);
	if (layer.id === 'endexit' && state.level) renderRoute(state.level);
}

/** Follow the page theme (lib/utils swaps the #theme-css stylesheet): light/sepia vs dark palettes. */
function followPageTheme() {
	applyPageTheme();
	new MutationObserver(applyPageTheme).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
}

function applyPageTheme() {
	const theme = pageTheme();
	$('#map').style.setProperty('--map_bg', MAP_BG[theme]);
	$('#map-section').style.setProperty('--map_bg_empty', MAP_EMPTY[theme].bg);
	$('#map-section').style.setProperty('--map_fg_empty', MAP_EMPTY[theme].text);
	const mapTheme = theme === 'light' || theme === 'sepia' ? 'light' : 'dark';
	const changed = mapTheme !== view.theme;
	view.setTheme(mapTheme);
	if (changed && state.solve) state.solve.onTheme();
}

/** 'light' | 'sepia' | 'contrast' | 'dark', from the theme stylesheet's file name. */
function pageTheme() {
	const href = document.querySelector('#theme-css')?.getAttribute('href') || '';
	return /sepia/.test(href) ? 'sepia' : /light/.test(href) ? 'light' : /high_contrast/.test(href) ? 'contrast' : 'dark';
}

/** The game tables, the generator (if it loads) and the new-game profile. */
async function loadGameData() {
	const [tablesJson, generator] = await Promise.all([
		fetch('data/tables.json').then((r) => r.json()),
		loadGenerator(),
	]);
	initTables(tablesJson);
	state.generator = generator;
	state.fresh = V.i2;   // the new-game profile
}

async function loadGenerator() {
	try {
		return await import('./gen/generate.js');
	} catch (e) {
		console.info('generator not available yet; using test fixtures', e.message);
		return null;
	}
}

/** Display names for items, skills and quests (data/names.json); empty if it can't be read. */
function loadNames() {
	return fetch('data/names.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
}

function createHeroPanel() {
	return new HeroPanel({
		getType: () => state.type,
		getLabel: () => (state.level ? formatLabel(state.type, state.seed) : ''),
		hasDungeon: () => !!state.level,
		onChange: rebuildMap,
		confirmImport,
		onImported: showImportedSave,
		onForgotten: saveForgotten,
	});
}

/** The progress the map is built with changed: build the dungeon shown again. */
function rebuildMap() {
	if (state.level) show(formatLabel(state.type, state.seed));
}

/** The button that shows and hides the solver column (remembered in localStorage). */
function bindSolverToggle() {
	const button = $('#solver-btn');
	setSolverShown(localStorage.getItem('nkd-solver') !== '0');
	button.onclick = () => setSolverShown(document.body.classList.contains('solver-hidden'));
	button.onkeydown = (e) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		button.onclick();
	};
}

function setSolverShown(on) {
	const button = $('#solver-btn');
	document.body.classList.toggle('solver-hidden', !on);
	button.classList.toggle('off', !on);
	button.setAttribute('aria-pressed', String(on));
	localStorage.setItem('nkd-solver', on ? '1' : '0');
}

function bindLabelControls() {
	$('#show-btn').onclick = () => show($('#label-input').value);
	$('#label-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') show(e.target.value); });
	$('#random-btn').onclick = showRandomLabel;
}

async function showRandomLabel() {
	if (state.generator?.randomLabel) {
		show(state.generator.randomLabel(state.type));
		return;
	}
	const response = await fetch('test/fixtures/index.json');
	const labels = response.ok ? await response.json() : [];
	if (labels.length) show(labels[Math.floor(Math.random() * labels.length)]);
}

function bindMapButtons() {
	const withDungeon = (action) => () => { if (state.level) action(); };
	$('#zoom-in-btn').onclick = withDungeon(() => view.zoomAt(1.4, view.cssW / 2, view.cssH / 2));
	$('#zoom-out-btn').onclick = withDungeon(() => view.zoomAt(1 / 1.4, view.cssW / 2, view.cssH / 2));
	$('#fit-btn').onclick = withDungeon(() => view.fit());
	$('#hero-btn').onclick = withDungeon(centerOnHero);
	$('#walls-btn').onclick = toggleWallHeight;
}

/** Zoom in to at least 1:1 and centre on the hero. */
function centerOnHero() {
	const hero = state.level?.critters.find((c) => c.id === HERO_ID);
	if (!hero) return;
	view.zoomAt(Math.max(1, view.scale) / view.scale, view.cssW / 2, view.cssH / 2);
	view.centerOn(hero.x, hero.y);
}

function toggleWallHeight() {
	view.wallHeight = view.wallHeight > 20 ? 14 : 34;
	view.redraw();
}

/** The Energy & mental power choice for the route (remembered in localStorage). */
function bindEffortSelect() {
	const select = $('#effort-select');
	select.value = localStorage.getItem('nkd-effort') || 'balanced';
	select.onchange = () => {
		localStorage.setItem('nkd-effort', select.value);
		if (state.level) renderRoute(state.level);
	};
}

function labelInHash() {
	return decodeURIComponent(location.hash.slice(1));
}

// ---- showing a dungeon -------------------------------------------------------------------

/** Show the dungeon a label names (typed, or from the URL or a panel). Problems go to the status line. */
async function show(text) {
	const status = $('#label-status');
	status.classList.remove('error');
	let label;
	try {
		label = parseLabel(text);
	} catch (e) {
		showStatusError(status, e);
		return;
	}
	status.textContent = 'Building…';
	try {
		const level = await makeLevel(label);
		setCurrentLevel(level, label);
		drawLevel(level, label.type);
		status.innerHTML = levelStatusHtml(level, label.type);
		refreshPanelsForLevel();
	} catch (e) {
		console.error(e);
		showStatusError(status, e);
	}
}

function showStatusError(status, error) {
	status.textContent = error.message;
	status.classList.add('error');
}

/**
 * The level a label builds with the map's progress, or its sample fixture when there is no generator.
 * @param {{ type: number, seed: number }} label
 */
async function makeLevel(label) {
	// the player state the generator queries (vj0.i2): the imported profile while "use my progress" is on, plus the
	// edits in Your progress (js/hero.js effectiveProfile)
	const mapProfile = state.hero ? state.hero.effectiveProfile() : null;
	V.i2 = mapProfile ? mapProfile.vj0 : state.fresh;
	if (!state.generator) return fixtureLevel(label);
	try {
		return state.generator.generate(label.type, label.seed);
	} catch (e) {
		if (mapProfile && mapProfile.basis !== 'new') throw new Error(unbuildableText(mapProfile.basis));
		console.warn('generator failed, trying sample fixtures:', e);
	}
	return fixtureLevel(label);
}

function unbuildableText(basis) {
	return basis === 'custom'
		? 'This label does not build with the progress set in Your progress (the game would not have shown it). Reset or change it to see the dungeon.'
		: 'This label does not build with your progress (the game would not have shown it to you). Turn off "Use my progress" in Your hero to see it as a new game.';
}

/** @param {{ type: number, seed: number }} label */
async function fixtureLevel({ type, seed }) {
	const response = await fetch(`test/fixtures/${type}-${seed}.json`);
	if (!response.ok) throw new Error('This build can only show the sample dungeons in test/fixtures/ for now.');
	const level = await response.json();
	if (level.error) throw new Error(`The game could not build this dungeon (${level.error}).`);
	return level;
}

/** Make `level` the page's dungeon: the state, the label box and the URL. */
function setCurrentLevel(level, label) {
	state.level = level;
	state.type = label.type;
	state.seed = label.seed;
	const labelText = formatLabel(label.type, label.seed);
	$('#label-input').value = labelText;
	history.replaceState(null, '', `#${labelText}`);
	setNoDungeonView(false);
}

/**
 * Show no dungeon: the dark "No Dungeon Loaded" map, and the panels that list the dungeon say there is nothing. The
 * label box and the URL's hash are emptied, so a reload does not bring the old dungeon back.
 */
function clearDungeon(statusText = NO_DUNGEON.status) {
	showNoDungeon();
	const status = $('#label-status');
	status.classList.remove('error');
	status.textContent = statusText;
}

function showNoDungeon() {
	state.level = null;
	state.seed = 0;
	state.plan = null;
	view.clearLevel();
	setNoDungeonView(true);
	$('#label-input').value = '';
	history.replaceState(null, '', location.pathname + location.search);
	$('#selected-info').textContent = NO_DUNGEON.select;
	$('#objective-count').textContent = '';
	$('#objective-list').textContent = NO_DUNGEON.list;
	$('#route-info').textContent = NO_DUNGEON.list;
	refreshPanelsForLevel();
}

/** The map's "No Dungeon Loaded" look, and the View buttons that need a dungeon switched off with it. */
function setNoDungeonView(on) {
	$('#map-section').classList.toggle('no-dungeon', on);
	for (const id of MAP_VIEW_BUTTONS) {
		$(id).classList.toggle('disabled', on);
		$(id).setAttribute('aria-disabled', String(on));
	}
}

function drawLevel(level, type) {
	view.setLevel(level, { family: family(type), rw: objectDef, bw: critterDef });
	view.setPuzzle(floorNonogram(level, zw.O));
	view.setLinks(baseLinks(), []);
	renderObjectives(level);
	renderRoute(level);
	$('#selected-info').textContent = SELECT_HINT;
}

/** The status under the label: size and counts, then (a line of its own) the progress the map is built with. */
function levelStatusHtml(level, type) {
	const mapProfile = state.hero ? state.hero.effectiveProfile() : null;
	const basis = mapProfile ? mapProfile.basis : 'new';
	const text = mapProfile ? mapProfile.text : 'New game';
	return `${typeLabel(type)} · ${level.w}×${level.h} · ${level.objects.length} objects · ${level.critters.length} creatures` +
		`<div class="map-basis basis-${basis}" title="The progress this map is built with (Your hero, Progress)">Built with: <b>${text}</b></div>` +
		(showsSavedDungeon() ? '<div class="map-basis basis-save">Your dungeon in progress, <b>from your save</b></div>' : '');
}

/** Whether the dungeon on the map is the one the imported save is inside. */
function showsSavedDungeon() {
	const saved = state.hero && state.hero.profile && state.hero.dungeon;
	return !!saved && !!state.level && saved.type === state.type && saved.seed === state.seed;
}

/** The Your hero popups and the solver follow the dungeon shown. */
function refreshPanelsForLevel() {
	if (state.hero && state.hero.profile) state.hero.render();
	if (state.hero) state.hero.renderProgress();
	if (state.solve) state.solve.onLevel();
}

// ---- importing and forgetting a save -----------------------------------------------------

/** What an import would wipe: the dungeon on the map, the solver's plan, a solve under way. */
function whatIsOnScreen() {
	return { dungeon: !!state.level, plan: !!(state.solve && state.solve.result), solving: !!(state.solve && state.solve.running) };
}

/** Ask before an import wipes something on screen (js/hero.js importFile). Nothing on screen: no question. */
async function confirmImport({ replacesSave }) {
	const onScreen = whatIsOnScreen();
	if (!onScreen.dungeon && !onScreen.plan && !onScreen.solving) return true;
	return confirmPopup({ title: 'Import a save?', text: wipeWarning(replacesSave), confirmLabel: 'Import' });
}

/** The question: the dungeon (with its plan and any solve) goes, and so does the save imported before, if there is one. */
function wipeWarning(replacesSave) {
	return `Importing a save clears the existing dungeon${replacesSave ? ' and save' : ''}. Import and continue?`;
}

/**
 * A new save was read (js/hero.js): nothing from before stays on screen. Show the dungeon the save is inside, or the
 * "No Dungeon Loaded" view (whose text says why). The scene change is the message: no toast.
 * @param {{ type: number, seed: number, kind: string } | null} dungeon the save's dungeon in progress
 */
async function showImportedSave(dungeon) {
	if (state.solve) state.solve.reset();
	if (!dungeon) {
		clearDungeon(NO_DUNGEON.notInDungeon);
		return;
	}
	showNoDungeon();   // should the dungeon not build, the old one must not stay on the map
	const label = formatLabel(dungeon.type, dungeon.seed);
	await show(label);
}

/** The save was forgotten (js/hero.js): the map stays; the plan made from the save goes. Say what happened. */
function saveForgotten() {
	if (state.solve) state.solve.dropWhatCameFromSave();
	if (!state.level) $('#label-status').textContent = NO_DUNGEON.status;   // not "this save is not inside a dungeon"
	toast('Save removed. Dungeons are generated as new games.');
}

/** A short message at the bottom of the page (lib/utils Popup), in the middle: the View buttons stay clear. */
function toast(text) {
	if (typeof Popup !== 'undefined') Popup.toastPopup(text, DOWN, 4500);
}

// ---- selection ---------------------------------------------------------------------------

/** The Selected panel and the link highlights for a clicked cell (null: nothing selected). */
function showSelection(cell) {
	const box = $('#selected-info');
	if (!cell) {
		box.textContent = state.level ? SELECT_HINT : NO_DUNGEON.select;
		view.setLinks(baseLinks(), []);
		return;
	}
	box.innerHTML = cellHtml(cell);
	for (const a of box.querySelectorAll('a[data-x]')) a.onclick = () => view.centerOn(+a.dataset.x, +a.dataset.y);
	highlightPartners(cell.object);
}

/** Lines from an object to the ones it links to (a ladder to its hatch, ...), on top of the linked-pairs layer. */
function highlightPartners(object) {
	const linked = object ? partners(state.level, object) : [];
	const color = object ? LINK_COLORS[linkGroup(object)] : null;
	view.setLinks(
		[...baseLinks(), ...linked.map((p) => [object, p, color])],
		linked.map((p) => ({ x: p.x, y: p.y, color })),
	);
}

function baseLinks() {
	return state.level && view.layers.has('alllinks') ? allLinks(state.level) : [];
}

function cellHtml(cell) {
	const occupied = cell.critter || cell.object;
	const occupantPart = occupied ? occupantHtml(cell, { level: state.level, names: state.names, profile: V.i2 }) : '';
	return `${occupantPart}<div class="muted">${tileName(cell.a, cell.b)} · ${cell.x},${cell.y}</div>`;
}

// ---- objectives --------------------------------------------------------------------------

function renderObjectives(level) {
	const list = objectives(level);
	$('#objective-count').textContent = `(${list.length})`;
	const box = $('#objective-list');
	box.innerHTML = '';
	for (const objective of list) box.append(objectiveRow(objective));
	if (!list.length) box.textContent = 'None found.';
}

/** The dungeon's objectives by the game's own rule (hw.i, shared with the planner), each with how it is drawn. */
function objectives(level) {
	return gameObjectives(level, { rw: objectDef, bw: critterDef, pw: zw.M[level.type] }).map(objectiveEntry);
}

function objectiveEntry(objective) {
	if (objective.kind === 'exitlock') {
		const { x, y } = objective.at;
		return { rec: { id: -1, x, y, exitlock: true }, look: EXIT_LOCK_LOOK, name: EXIT_LOCK_LOOK.label };
	}
	const kind = objective.kind === 'critter' ? critterKindOf(objective.rec) : objectKindOf(objective.rec);
	return { rec: objective.rec, look: KINDS[kind], name: recName(objective.rec) };
}

function objectiveRow({ rec, look, name }) {
	const row = document.createElement('div');
	row.className = 'row';
	row.innerHTML = `<span><span class="glyph" style="color:${look.color}">${look.glyph}</span>${esc(name)}</span><span class="muted">${rec.x},${rec.y}</span>`;
	row.onclick = () => {
		view.centerOn(rec.x, rec.y);
		view.selected = rec;
		showSelection(view.describe(rec.x, rec.y));
	};
	return row;
}

// ---- route -------------------------------------------------------------------------------

/** Plan the route through every objective; draw it and list its stops in the Route panel. */
function renderRoute(level) {
	const box = $('#route-info');
	let plan;
	try {
		plan = planRoute(level, routeOptions());
	} catch (e) {
		console.error(e);
		box.textContent = `Could not plan a route: ${e.message}`;
		view.setRoute(null);
		return;
	}
	state.plan = plan;
	view.setRoute(plan.route);
	box.innerHTML = '';
	box.append(routeSummary(plan));
	for (const warning of plan.warnings) {
		const note = document.createElement('div');
		note.className = 'muted';
		note.textContent = warning;
		box.append(note);
	}
	renderLegs(box, plan);
}

function routeOptions() {
	const effort = EFFORT[$('#effort-select').value] || EFFORT.balanced;
	return { rw: objectDef, bw: critterDef, pwOf: (t) => zw.M[t], patterns: zw.O, tiles: zw.u, endAtExit: view.layers.has('endexit'), tombQuestDone: !zw.n_(state.level.type), ...effort };
}

function routeSummary(plan) {
	const head = document.createElement('div');
	head.innerHTML = `<b>${plan.legs.length}</b> stops · <b>${plan.steps}</b> steps` +
		`<div class="muted">About ${plan.mp} mental power and ${plan.ep} energy for seals and stuck doors${plan.exact ? '' : ' · order found by search (not proven shortest)'}.</div>` +
		(plan.unreachable.length ? `<div style="color:var(--color_red)">${plan.unreachable.length} objective(s) could not be reached.</div>` : '') +
		(plan.unknownGates.length ? `<div class="muted">${plan.unknownGates.length} door(s) with an unknown opener were left shut.</div>` : '');
	return head;
}

/** One row per stop; clicking one shows that leg of the route on the map. */
function renderLegs(box, plan) {
	plan.legs.forEach((leg, n) => {
		const row = legRow(leg, n);
		row.onclick = () => {
			view.setRoute(plan.route, leg);
			view.centerOn(leg.at.x, leg.at.y);
			outlineOnly(box, row);
		};
		box.append(row);
	});
}

function legRow(leg, n) {
	const row = document.createElement('div');
	row.className = 'row';
	const look = leg.stop.rec ? KINDS[stopKind(leg.stop.rec)] : PUZZLE_STOP_LOOK;
	const tasks = leg.doing.map(taskText);
	const tasksHtml = tasks.length ? `<div class="muted sub">${tasks.map((t) => `↳ ${t}`).join('<br>')}</div>` : '';
	row.innerHTML = `<span><span class="muted">${n + 1}.</span> <span class="glyph" style="color:${look.color}">${look.glyph}</span>${stopLabel(leg.stop)}</span><span class="muted">+${leg.steps}</span>${tasksHtml}`;
	if (tasks.length) row.title = tasks.join('\n');
	return row;
}

/** Something to do on the way to a stop, e.g. "Break stuck door (9 energy) at 12,53". */
function taskText(task) {
	return `${task.text}${task.ep ? ` (${task.ep} energy)` : ''}${task.mp ? ` (${task.mp} mental power)` : ''} at ${task.at.x},${task.at.y}`;
}

function outlineOnly(box, row) {
	for (const r of box.querySelectorAll('.row')) r.style.outline = '';
	row.style.outline = '1px solid var(--color_btn)';
}

function stopLabel(stop) {
	return stop.label || esc(recName(stop.rec));
}

// ---- what things are ---------------------------------------------------------------------

/** The game's definition of an object (its rw record, zw.Q). */
function objectDef(id) {
	return zw.Q?.get(id);
}

/** The game's definition of a creature (its bw record, zw.R). */
function critterDef(id) {
	return zw.R?.get(id);
}

function objectKindOf(rec) {
	return objectKind(rec, objectDef(rec.id));
}

function critterKindOf(rec) {
	return critterKind(rec, critterDef(rec.id));
}

/** Planner stops hold either a creature (it has a `k`) or an object. */
function stopKind(rec) {
	return rec.k !== undefined ? critterKindOf(rec) : objectKindOf(rec);
}

/** What the Objectives and Route lists call a stop: its name (data/catalog.json), e.g. "Purple chest" or "Bone Dragon". */
function recName(rec) {
	return occupantName(rec.k !== undefined ? { critter: rec } : { object: rec }, state.level);
}

function esc(text) {
	return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

main();
