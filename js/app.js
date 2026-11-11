// UI glue: label input -> level -> isometric view, layers, selection info, objectives, route.
import { parseLabel, formatLabel, typeLabel, family } from './labels.js';
import { IsoView } from './view/iso.js';
import { KINDS, objectKind, critterKind, tileName, linkGroup } from './view/catalog.js';
import { partners, allLinks, floorNonogram, LINK_COLORS } from './view/links.js';
import { initTables, zw, vj0 as V } from './gen/statics.js';
import { planRoute, objectives as gameObjectives } from './plan/planner.js';
import { HeroPanel } from './hero.js';
import { SolvePanel } from './ui/solve-panel.js';

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

const state = { level: null, type: 8, seed: 0, generator: null, fresh: null, hero: null };

// how many steps one point of energy / mental power is worth when choosing a path
const EFFORT = {
	steps: { epCost: 0.2, mpCost: 0.2 },
	balanced: { epCost: 3, mpCost: 3 },
	save: { epCost: 12, mpCost: 12 },
};
let view;

// ---- level source ------------------------------------------------------------------------
async function loadGenerator() {
	try {
		return await import('./gen/generate.js');
	} catch (e) {
		console.info('generator not available yet; using test fixtures', e.message);
		return null;
	}
}

async function makeLevel(type, seed) {
	// the player state the generator queries (vj0.i2): the imported profile while "use my progress" is on, plus the
	// edits in Your progress (js/hero.js effectiveProfile)
	const eff = state.hero ? state.hero.effectiveProfile() : null;
	const custom = !!eff && eff.basis !== 'new';
	V.i2 = eff ? eff.vj0 : state.fresh;
	if (state.generator) {
		try {
			return state.generator.generate(type, seed);
		} catch (e) {
			if (custom) {
				throw new Error(eff.basis === 'custom'
					? 'This label does not build with the progress set in Your progress (the game would not have shown it). Reset or change it to see the dungeon.'
					: 'This label does not build with your progress (the game would not have shown it to you). Turn off "Use my progress" in Your hero to see it as a new game.');
			}
			console.warn('generator failed, trying sample fixtures:', e);
		}
	}
	const res = await fetch(`test/fixtures/${type}-${seed}.json`);
	if (!res.ok) throw new Error('This build can only show the sample dungeons in test/fixtures/ for now.');
	const level = await res.json();
	if (level.error) throw new Error(`The game could not build this dungeon (${level.error}).`);
	return level;
}

// ---- info helpers ------------------------------------------------------------------------
const rwOf = (id) => zw.Q?.get(id);
const bwOf = (id) => zw.R?.get(id);

function kindOf(rec, isCritter) {
	return isCritter ? critterKind(rec, bwOf(rec.id)) : objectKind(rec, rwOf(rec.id));
}

function objectives(level) {
	// the game's own rule (hw.i), shared with the planner
	return gameObjectives(level, { rw: rwOf, bw: bwOf, pw: zw.M[level.type] }).map((o) =>
		o.kind === 'exitlock' ? { rec: { id: -1, x: o.at.x, y: o.at.y, exitlock: true }, critter: false } : { rec: o.rec, critter: o.kind === 'critter' });
}

function describeHtml(d) {
	const parts = [];
	const rec = d.critter || d.object;
	if (rec) {
		const isC = !!d.critter;
		const kind = kindOf(rec, isC);
		const k = KINDS[kind];
		parts.push(`<div><span class="glyph" style="color:${k.color}">${k.glyph}</span><b>${k.label}</b> <span class="muted">#${rec.id}</span></div>`);
		const def = isC ? bwOf(rec.id) : rwOf(rec.id);
		if (def && def.v > 0) parts.push(`<div>Needs <b>${def.v}</b> mental power to open.</div>`);
		if (rec.id === 28 && state.level) parts.push(`<div>Breaking it costs energy.</div>`);
		if (def && def.t) parts.push(`<div class="muted">Counts as an objective.</div>`);
		const ps = isC ? [] : partners(state.level, rec);
		if (ps.length) {
			parts.push(`<div>Links to ${ps.map((p) => `<a data-x="${p.x}" data-y="${p.y}">${KINDS[kindOf(p, false)].label.toLowerCase()} at ${p.x},${p.y}</a>`).join(', ')}.</div>`);
		}
	}
	parts.push(`<div class="muted">${tileName(d.a, d.b)} · ${d.x},${d.y}</div>`);
	return parts.join('');
}

function showSelection(d) {
	const box = $('#selected-info');
	if (!d) { box.textContent = 'Click a tile, object or monster.'; view.setLinks(baseLinks(), []); return; }
	box.innerHTML = describeHtml(d);
	for (const a of box.querySelectorAll('a[data-x]')) a.onclick = () => view.centerOn(+a.dataset.x, +a.dataset.y);
	const rec = d.object;
	const ps = rec ? partners(state.level, rec) : [];
	const color = rec ? LINK_COLORS[linkGroup(rec)] : null;
	view.setLinks(
		[...baseLinks(), ...ps.map((p) => [rec, p, color])],
		ps.map((p) => ({ x: p.x, y: p.y, color })),
	);
}

function baseLinks() {
	return state.level && view.layers.has('alllinks') ? allLinks(state.level) : [];
}

function renderObjectives(level) {
	const list = objectives(level);
	$('#objective-count').textContent = `(${list.length})`;
	const box = $('#objective-list');
	box.innerHTML = '';
	for (const { rec, critter } of list) {
		const k = rec.exitlock ? { color: KINDS.lockdoor.color, glyph: '⚿', label: 'Unlock the exit (mini-boss key)' } : KINDS[kindOf(rec, critter)];
		const row = document.createElement('div');
		row.className = 'row';
		row.innerHTML = `<span><span class="glyph" style="color:${k.color}">${k.glyph}</span>${k.label}</span><span class="muted">${rec.x},${rec.y}</span>`;
		row.onclick = () => { view.centerOn(rec.x, rec.y); view.selected = rec; showSelection(view.describe(rec.x, rec.y)); };
		box.append(row);
	}
	if (!list.length) box.textContent = 'None found.';
}

function stopLabel(stop) {
	if (stop.label) return stop.label;
	const k = KINDS[kindOf(stop.rec, stop.rec.k !== undefined)];
	return `${k.label}`;
}

function renderRoute(level) {
	const box = $('#route-info');
	let plan;
	try {
		const effort = EFFORT[$('#effort-select').value] || EFFORT.balanced;
		plan = planRoute(level, { rw: rwOf, bw: bwOf, pwOf: (t) => zw.M[t], patterns: zw.O, tiles: zw.u, endAtExit: view.layers.has('endexit'), ...effort });
	} catch (e) {
		console.error(e);
		box.textContent = `Could not plan a route: ${e.message}`;
		view.setRoute(null);
		return;
	}
	state.plan = plan;
	view.setRoute(plan.route);
	box.innerHTML = '';
	const head = document.createElement('div');
	head.innerHTML = `<b>${plan.legs.length}</b> stops · <b>${plan.steps}</b> steps` +
		`<div class="muted">About ${plan.mp} mental power and ${plan.ep} energy for seals and stuck doors${plan.exact ? '' : ' · order found by search (not proven shortest)'}.</div>` +
		(plan.unreachable.length ? `<div style="color:var(--color_red)">${plan.unreachable.length} objective(s) could not be reached.</div>` : '') +
		(plan.unknownGates.length ? `<div class="muted">${plan.unknownGates.length} door(s) with an unknown opener were left shut.</div>` : '');
	box.append(head);
	plan.legs.forEach((leg, n) => {
		const row = document.createElement('div');
		row.className = 'row';
		const k = leg.stop.rec ? KINDS[kindOf(leg.stop.rec, leg.stop.rec.k !== undefined)] : { glyph: '▦', color: KINDS.puzzledoor.color };
		row.innerHTML = `<span><span class="muted">${n + 1}.</span> <span class="glyph" style="color:${k.color}">${k.glyph}</span>${stopLabel(leg.stop)}</span><span class="muted">+${leg.steps}</span>`;
		if (leg.doing.length) {
			const sub = leg.doing.map((d) => `${d.text}${d.ep ? ` (${d.ep} energy)` : ''}${d.mp ? ` (${d.mp} mental power)` : ''} at ${d.at.x},${d.at.y}`);
			row.title = sub.join('\n');
			row.innerHTML += `<div class="muted sub">${sub.map((t) => `↳ ${t}`).join('<br>')}</div>`;
		}
		row.onclick = () => {
			view.setRoute(plan.route, leg);
			view.centerOn(leg.at.x, leg.at.y);
			for (const r of box.querySelectorAll('.row')) r.style.outline = '';
			row.style.outline = '1px solid var(--color_btn)';
		};
		box.append(row);
	});
}

// ---- actions -----------------------------------------------------------------------------
async function show(text) {
	const status = $('#label-status');
	status.classList.remove('error');
	let parsed;
	try {
		parsed = parseLabel(text);
	} catch (e) {
		status.textContent = e.message;
		status.classList.add('error');
		return;
	}
	status.textContent = 'Building…';
	try {
		const level = await makeLevel(parsed.type, parsed.seed);
		state.level = level;
		state.type = parsed.type;
		state.seed = parsed.seed;
		const label = formatLabel(parsed.type, parsed.seed);
		$('#label-input').value = label;
		history.replaceState(null, '', `#${label}`);
		view.setLevel(level, { family: family(parsed.type), rw: rwOf, bw: bwOf });
		view.setPuzzle(floorNonogram(level, zw.O));
		view.setLinks(baseLinks(), []);
		renderObjectives(level);
		renderRoute(level);
		$('#selected-info').textContent = 'Click a tile, object or monster.';
		const eff = state.hero ? state.hero.effectiveProfile() : null;
		const basis = eff ? eff.basis : 'new';
		status.innerHTML = `${typeLabel(parsed.type)} · ${level.w}×${level.h} · ${level.objects.length} objects · ${level.critters.length} creatures ` +
			`<span class="profile-badge status-badge${basis === 'save' ? ' on' : basis === 'custom' ? ' custom' : ''}" title="The progress this map is built with (Your hero, Progress)">${eff ? eff.text.toLowerCase() : 'new game'}</span>`;
		if (state.hero && state.hero.profile) state.hero.render();
		if (state.hero) state.hero.renderProgress();
		if (state.solve) state.solve.onLevel();
	} catch (e) {
		console.error(e);
		status.textContent = e.message;
		status.classList.add('error');
	}
}

function buildLayerList() {
	const saved = JSON.parse(localStorage.getItem('nkd-layers') || 'null');
	const on = new Set(saved || LAYERS.filter((l) => l.on).map((l) => l.id));
	const box = $('#layer-list');
	for (const l of LAYERS) {
		const row = document.createElement('div');
		row.className = 'layer-row';
		const cb = document.createElement('div');
		cb.className = 'checkbox' + (on.has(l.id) ? ' selected' : '');
		row.append(cb);
		const label = document.createElement('span');
		label.innerHTML = `<span class="swatch" style="background:${l.color}"></span> ${l.label}${l.spoiler ? ' <span class="spoiler">(spoiler)</span>' : ''}`;
		row.append(label);
		row.onclick = () => {
			cb.classList.toggle('selected');
			if (cb.classList.contains('selected')) on.add(l.id); else on.delete(l.id);
			localStorage.setItem('nkd-layers', JSON.stringify([...on]));
			view.setLayers(on);
			view.setLinks(baseLinks(), view.highlights);
			if (l.id === 'endexit' && state.level) renderRoute(state.level);
		};
		box.append(row);
	}
	return on;
}

async function main() {
	const tooltip = $('#tooltip');
	view = new IsoView($('#map'), {
		onHover: (d) => {
			if (!d) { tooltip.style.display = 'none'; return; }
			const rec = d.critter || d.object;
			tooltip.textContent = rec ? `${KINDS[kindOf(rec, !!d.critter)].label} · ${d.x},${d.y}` : `${tileName(d.a, d.b)} · ${d.x},${d.y}`;
			tooltip.style.display = 'block';
		},
		onSelect: showSelection,
	});
	$('#map').addEventListener('mousemove', (e) => {
		tooltip.style.left = `${e.clientX + 14}px`;
		tooltip.style.top = `${e.clientY + 14}px`;
	});
	view.setLayers(buildLayerList());
	window.nkd = { view, state, show };   // console/debug handle

	// Follow the page theme (lib/utils swaps the #theme-css stylesheet): light/sepia vs dark palettes.
	const MAP_BG = { light: '#ece9e2', sepia: '#e6dbc3', dark: '#0b0b0d', contrast: '#000000' };
	const applyTheme = () => {
		const href = document.querySelector('#theme-css')?.getAttribute('href') || '';
		const name = /sepia/.test(href) ? 'sepia' : /light/.test(href) ? 'light' : /high_contrast/.test(href) ? 'contrast' : 'dark';
		$('#map').style.setProperty('--map_bg', MAP_BG[name]);
		const t = name === 'light' || name === 'sepia' ? 'light' : 'dark';
		const changed = t !== view.theme;
		view.setTheme(t);
		if (changed && state.solve) state.solve.onTheme();
	};
	applyTheme();
	new MutationObserver(applyTheme).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });

	const [tablesJson, generator] = await Promise.all([
		fetch('data/tables.json').then((r) => r.json()),
		loadGenerator(),
	]);
	initTables(tablesJson);
	state.generator = generator;
	state.fresh = V.i2;   // the new-game profile

	// Your hero: the imported save (kept in this tab's sessionStorage) and whether maps use it
	state.hero = new HeroPanel({
		getType: () => state.type,
		getLabel: () => formatLabel(state.type, state.seed),
		onChange: () => { if (state.level || state.seed) show(formatLabel(state.type, state.seed)); },
	});
	state.hero.bind();
	if (generator) await state.hero.restore();

	// Solver column (js/ui/solve-panel.js): solves run in a module worker with its own pool
	const names = await fetch('data/names.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
	state.solve = new SolvePanel({ view, state, names, root: $('#solve-section'), show: (label) => show(label) });
	state.solve.bind();
	window.nkd.solve = state.solve;
	const solverBtn = $('#solver-btn');
	const setSolverShown = (on) => {
		document.body.classList.toggle('solver-hidden', !on);
		solverBtn.classList.toggle('off', !on);
		solverBtn.setAttribute('aria-pressed', String(on));
		localStorage.setItem('nkd-solver', on ? '1' : '0');
	};
	setSolverShown(localStorage.getItem('nkd-solver') !== '0');
	solverBtn.onclick = () => setSolverShown(document.body.classList.contains('solver-hidden'));
	solverBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); solverBtn.onclick(); } };

	$('#show-btn').onclick = () => show($('#label-input').value);
	$('#label-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') show(e.target.value); });
	$('#random-btn').onclick = async () => {
		if (state.generator?.randomLabel) show(state.generator.randomLabel(state.type));
		else {
			const res = await fetch('test/fixtures/index.json');
			const list = res.ok ? await res.json() : [];
			if (list.length) show(list[Math.floor(Math.random() * list.length)]);
		}
	};
	$('#zoom-in-btn').onclick = () => view.zoomAt(1.4, view.cssW / 2, view.cssH / 2);
	$('#zoom-out-btn').onclick = () => view.zoomAt(1 / 1.4, view.cssW / 2, view.cssH / 2);
	$('#fit-btn').onclick = () => view.fit();
	$('#hero-btn').onclick = () => {
		const hero = state.level?.critters.find((c) => c.id === 180);
		if (hero) { view.zoomAt(Math.max(1, view.scale) / view.scale, view.cssW / 2, view.cssH / 2); view.centerOn(hero.x, hero.y); }
	};
	$('#walls-btn').onclick = () => { view.wallHeight = view.wallHeight > 20 ? 14 : 34; view.redraw(); };
	$('#effort-select').value = localStorage.getItem('nkd-effort') || 'balanced';
	$('#effort-select').onchange = () => {
		localStorage.setItem('nkd-effort', $('#effort-select').value);
		if (state.level) renderRoute(state.level);
	};
	window.addEventListener('hashchange', () => show(decodeURIComponent(location.hash.slice(1))));

	show(location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '3C-172582050');
}

main();
