// Solver panel (M7): the "Solver" column next to the route panel.
//   controls  mode (robust / exact), budget (fast / normal / thorough), hero (your imported hero, or a what-if spec),
//             exact source (the save's dungeon in progress, or an xseed experiment), Solve / Cancel, progress + ETA
//   plan view totals (items, MP, death risk, pack), "mental power to solve for" (puzzle MP and where to top up),
//             warnings, then the route stops with their encounters (enemy sprites, tactic in plain words, expected
//             costs, "compare tactics")
//   map       fight pins on the route; a selected fight shows its foes and the hero's cell; exact mode replays the
//             script step by step (creatures where the engine has them, HP bars, the instruction as a callout, the
//             walked trail)
// The solve runs in js/ui/solve-host.js (a module worker with its own pool), so the page stays responsive.
import { formatLabel, typeLabel, family } from '../labels.js';
import { KINDS, critterKind, critterVariant, objectKind, critterName as catalogName, objectName, itemName } from '../view/catalog.js';
import { drawSprite } from '../view/sprites.js';
import { zw, vj0 as V } from '../gen/statics.js';
import { SolveClient, CancelError } from './solve-client.js';
import { BUDGETS, BUDGET_LABELS, workerCount } from './budgets.js';

/**
 * The solver's options in players' words: a short hover title, and for Mode and Search a description of the chosen
 * option in a box under their rows (hover text is slow and never shows on phones). The time is shown next to Solve.
 */
const OPTION_HELP = {
	mode: {
		robust: {
			title: 'Random dice: plays each fight many times',
			desc: 'the game rolls truly random dice once you enter, so it plays each fight many times with random rolls '
				+ 'and picks the tactic that does best on average.',
		},
		exact: {
			title: 'Plan from a save made in the dungeon: a tap-by-tap script',
			desc: 'plans from a save made inside this dungeon (Settings → Export while in it), which holds the dice: you '
				+ 'get a tap-by-tap script. One different tap changes every roll after it.',
		},
	},
	heroSrc: {
		profile: { title: 'The hero picked in Your hero, with its own gear, skills, pack, and mental power' },
		manual: { title: 'A made-up hero: choose a level, gear, and kit' },
	},
	exactSrc: {
		save: { title: 'Play on from the state in your save, with the game\'s own dice' },
		xseed: { title: 'This label with a made-up dice seed' },
	},
};

/** the help for a search depth in this mode: how many runs (robust) or moves per fight (exact) it tries */
function searchHelp(mode, depth) {
	const b = BUDGETS[mode][depth];
	if (mode === 'exact') {
		const more = { normal: 'Good for a first look.', thorough: 'Finds a better line more often.', exhaustive: 'The deepest search, and the slowest.' }[depth] || '';
		return { title: `Searches up to ${b.maxDecisions} moves per fight`, desc: `beyond every tactic, searches up to ${b.maxDecisions} of your moves per fight. ${more}` };
	}
	const more = { normal: 'Good for a first look.', thorough: 'Steadier numbers.', exhaustive: 'The most reliable numbers, and the slowest.' }[depth] || '';
	return { title: `Plays the dungeon ${b.N} times`, desc: `plays the dungeon ${b.N} times, testing each fight's tactic on at least ${b.nMin} rolls. ${more}` };
}
import { instruction, effects, tacticWords, topUpText, pct, num } from './words.js';

const SOLVER_INTRO = 'The solver plays this dungeon in the game\'s own combat engine and picks, fight by fight, the tactic that, without dying, leaves no objective undone, then uses the fewest items, then the least mental power.';
const NO_DUNGEON_INTRO = 'No dungeon is shown. Type a label, or import a save made inside a dungeon, and the solver can plan it.';
const KEY = 'nkd-solve';
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEFAULTS = { mode: 'robust', budget: 'normal', heroSrc: 'profile', manual: { level: 21, gear: 4, kit: 'kit2', skills: '', mp: '' }, xseed: 12345, exactSrc: 'save', useItemsForMp: false };
const KIT_TEXT = {
	none: 'No kit: only what a new-game hero carries',
	// js/combat/setup.js KIT_ITEMS / KIT2_ITEMS
	kit: 'Basic kit: 5 healing potions, 2 Mechanical spiders, 5 kunai, 3 Greek grenades, 2 nets, 2 grappling hooks, 1 Ambrosia; 60 mental power; basic skills',
	kit2: 'Full kit: healing, energy, and mental-power potions, 2 Ambrosia, grenades, flamethrowers, golden kunai, food, and more; full mental power; most skills',
};
const GEAR_TEXT = ['Tier 1 (starter)', 'Tier 2', 'Tier 3', 'Tier 4 (best)'];
const SKILL_NAMES_FALLBACK = { 20001: 'Wait', 20002: 'Smashing blow', 20003: 'Round kick', 20004: 'Demoralization', 20005: 'Charge of motivation', 20006: 'Doctor', 20007: 'Divine protection' };
const PIN = { death: '#e5484d', items: '#e8833a', mp: '#4f6ff8', free: '#2f9e5b', topup: '#8a5cf6' };
const sumBy = (xs, f) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const upAmount = (u) => Number(u.amount ?? u.mp ?? 0) || 0;
const isActivateKey = (e) => e.key === 'Enter' || e.key === ' ';

const ICONS = {
	first: "<path d='M6 5v14M18 6l-8 6 8 6z'/>",
	back: "<path d='M15 6l-7 6 7 6z'/>",
	play: "<path d='M8 5l11 7-11 7z'/>",
	pause: "<path d='M8 5v14M16 5v14'/>",
	fwd: "<path d='M9 6l7 6-7 6z'/>",
	last: "<path d='M18 5v14M6 6l8 6-8 6z'/>",
	solver: "<path d='M6 18l12-12M14 6h4v4M7 7l3 3M4 14l6 6'/>",
};
export const svgIcon = (name, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SPRITE_R = { monster: 10, goldmonster: 10.5, miniboss: 12.5, boss: 15, unique: 12.5, npc: 11, spider: 12, hero: 12 };

export class SolvePanel {
	/**
	 * opts: { view (IsoView), state (app state: level, type, seed, hero), show(label) (switch the viewer),
	 *         names (data/names.json), root (#solve-section) }
	 */
	constructor(opts) {
		this.opts = opts;
		this.view = opts.view;
		this.state = opts.state;
		this.names = opts.names || {};
		this.root = opts.root;
		this.client = new SolveClient({ tablesUrl: new URL('data/tables.json', location.href).href, namesUrl: new URL('data/names.json', location.href).href });
		this.cfg = loadSettings();
		this.running = null;
		this.result = null;
		this.sel = null;
		this.pos = 0;
		this.playing = null;
		this.status = '';
		this.epoch = 0;   // counts resets: a run that started before one must not go on
	}

	save() { localStorage.setItem(KEY, JSON.stringify(this.cfg)); }

	bind() {
		this.renderControls();
		this.renderResult();
		document.addEventListener('nkd-hero', () => this.queueHeroRender());
		document.addEventListener('keydown', (e) => this.onKey(e));
	}

	/** a hero change fires several nkd-hero events in a row: re-render once, after the last */
	queueHeroRender() {
		if (this._heroQueued) return;
		this._heroQueued = true;
		queueMicrotask(() => {
			this._heroQueued = false;
			this.renderControls();
			this.renderResult();
		});
	}

	// ---- names ----------------------------------------------------------------------------------------------
	item(id) { return itemName(id, this.names); }
	skill(index, id) { return (index != null && index >= 0 && this.names.skills && this.names.skills[index]) || SKILL_NAMES_FALLBACK[id] || `skill ${id}`; }
	/** an object's name in the dungeon shown (data/catalog.json), e.g. "purple chest"; its kind if it has none */
	objectLabel(id) { return this.objectTitle(id).toLowerCase(); }
	objectTitle(id) {
		const type = this.state.level ? this.state.level.type : this.state.type;
		return objectName({ id }, family(type)) ?? KINDS[objectKind({ id }, zw.Q?.get(id))].label;
	}
	critterKindOf(rec) { return critterKind(rec, zw.R?.get(rec.id)); }
	/** a creature's name (data/catalog.json), e.g. "Gnoll shaman"; its kind and id if it has none */
	critterName(kind, id) {
		if (kind === 'spider') return 'your Mechanical spider';
		if (kind === 'hero') return 'you';
		const name = catalogName({ id });
		if (name) return name;
		const base = { monster: 'Monster', goldmonster: 'Gold monster', miniboss: 'Mini-boss', boss: 'Boss', unique: 'Unique monster', familiar: 'Wild familiar', npc: 'Person', shapeshifter: 'Shapeshifter' }[kind] || 'Creature';
		return `${base} ${id}`;
	}
	/** a plan enemy -> its sprite kind (matched to the level's creature of that id nearest to it) */
	enemyKind(e) {
		const match = nearestCritter(this.state.level, e);
		if (match) return this.critterKindOf(match);
		return this.critterKindOf({ id: e.id, g: 0, h: e.boss ? 1101 : 0, k: 2 });
	}
	/** a creature's sprite on a small canvas, for the plan list and the player */
	critterIcon(kind, id, size) {
		return spriteIcon(kind, { variant: spriteVariant(kind, id, this.state.level), size, theme: this.view.theme });
	}
	wordsCtx() {
		return {
			item: (id) => this.item(id),
			skill: (i, id) => this.skill(i, id),
			object: (id) => this.objectLabel(id),
			critter: (t) => this.critterName(this.critterKindOf(t.g != null ? t : { id: t.id, g: 0, h: 0, k: 2 }), t.id),
		};
	}

	// ---- controls ----------------------------------------------------------------------------------------------
	heroPanel() { return this.state.hero; }
	saveDungeon() { const H = this.heroPanel(); return H && H.profile && H.dungeon && H.dungeon.kind === 'hw' ? H.dungeon : null; }
	useSave() { return this.cfg.mode === 'exact' && this.cfg.exactSrc === 'save' && !!this.saveDungeon(); }

	profileInfo() {
		const H = this.heroPanel();
		if (!H || !H.profile || !H.mods) return null;
		try {
			const { entry } = H.mods;
			const P = H.profile;
			const sheet = entry.heroSheet(P, H.hero);
			const pack = entry.entryPack(P, H.hero, { type: this.state.type });
			const prog = entry.progressSummary(P);
			const gates = pack.gates.filter((g) => g.gate !== 'away' && g.gate !== 'busy');
			return { index: H.hero, lvl: sheet.lvl, mpMax: sheet.mp, mpIn: pack.mp, stock: prog.mpStock, gates, file: H.info && H.info.file };
		} catch (e) {
			console.warn('hero info:', e);
			return null;
		}
	}

	seg(key, options, label) {
		const cur = this.cfg[key];
		return `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, text, title]) =>
			`<div class="button-positive-2 seg-btn${v === cur ? ' selected' : ''}" role="radio" aria-checked="${v === cur}" tabindex="0" data-k="${key}" data-v="${v}" title="${esc(title || '')}">${esc(text)}</div>`).join('')}</div>`;
	}

	renderControls() {
		const box = $('#solve-controls', this.root);
		if (!box) return;
		const compact = this.result && !this.controlsOpen;
		box.innerHTML = compact ? this.compactControlsHtml() : this.controlsHtml();
		this.bindControls(box);
		this.renderRunState();
	}

	/** once there is a result: the settings in one line, with a Change link */
	compactControlsHtml() {
		const c = this.cfg;
		const exact = c.mode === 'exact';
		const xseed = exact && !this.useSave() ? ` · xseed ${esc(c.xseed)}` : '';
		return `<div class="solve-compact"><span>${exact ? 'Exact' : 'Robust'} · ${BUDGET_LABELS[c.budget]} · ${this.targetWords()}${xseed}${c.useItemsForMp ? ' · items for MP' : ''}</span> <a id="solve-expand" role="button" tabindex="0">Change</a></div>${this.runRowHtml()}`;
	}

	/** the dungeon and the hero a Solve would use, in one line for the compact settings */
	targetWords() {
		if (this.useSave()) return `${esc(this.saveDungeonLabel())}, your save's dungeon in progress`;
		const dungeon = this.state.level ? formatLabel(this.state.type, this.state.seed) : 'no dungeon';
		return `${esc(dungeon)} · ${esc(this.heroWords())}`;
	}

	heroWords() {
		if (this.cfg.heroSrc !== 'profile') return heroSpecText(this.heroSpec());
		const pi = this.profileInfo();
		return pi ? `your hero ${pi.index + 1} (Lv ${pi.lvl})` : 'your hero';
	}

	saveDungeonLabel() {
		const sd = this.saveDungeon();
		return sd ? formatLabel(sd.type, sd.seed) : '';
	}

	/**
	 * What a Solve would use right now, so no plan is ever mistaken for another save's or dungeon's: the dungeon and where
	 * it starts, and the hero. Exact mode on the save's dungeon plays that dungeon on from the save; every other solve
	 * plays the dungeon on the map from its entrance.
	 */
	solveTargetHtml() {
		const { dungeon, hero } = this.solveTarget();
		return `<div class="solve-note solve-target" id="solve-target"><div><span class="muted">Solves</span> ${dungeon}</div><div><span class="muted">With</span> ${hero}</div></div>`;
	}

	solveTarget() {
		if (this.useSave()) return this.saveTarget();
		return { dungeon: this.mapDungeonWords(), hero: this.heroSourceWords() };
	}

	saveTarget() {
		const label = this.saveDungeonLabel();
		const onMap = this.state.level && formatLabel(this.state.type, this.state.seed) === label;
		return {
			dungeon: `<b>${esc(label)}</b>, your save's dungeon, played on from where your save stands${onMap ? '' : ' (shown on the map first)'}`,
			hero: 'the hero in your save, its pack, mental power and dice',
		};
	}

	/** the map's dungeon as the target of a robust or experiment solve */
	mapDungeonWords() {
		if (!this.state.level) return 'nothing yet: type a label, or import a save made inside a dungeon';
		const label = formatLabel(this.state.type, this.state.seed);
		const ownSave = this.saveDungeonLabel() === label || this.heroDungeonLabel() === label;
		return `<b>${esc(label)}</b>, the dungeon on the map${ownSave ? ' (your save\'s dungeon)' : ''}, from its entrance`;
	}

	heroSourceWords() {
		if (this.cfg.heroSrc !== 'profile') return esc(heroSpecText(this.heroSpec()));
		const pi = this.profileInfo();
		return pi ? `hero ${pi.index + 1} (Lv ${pi.lvl}) from your save` : 'no hero yet: import your save, or use What-if';
	}

	/** the label of the dungeon the imported save is inside, of any kind ('' when it is in town or there is no save) */
	heroDungeonLabel() {
		const H = this.heroPanel();
		return H && H.profile && H.dungeon ? formatLabel(H.dungeon.type, H.dungeon.seed) : '';
	}

	controlsHtml() {
		const c = this.cfg;
		const exact = c.mode === 'exact';
		const useSave = this.useSave();
		return `
			<div class="solve-row"><span class="solve-key">Mode</span>${this.seg('mode', [['robust', 'Robust', OPTION_HELP.mode.robust.title], ['exact', 'Exact', OPTION_HELP.mode.exact.title]], 'Solver mode')}</div>
			<div class="solve-row"><span class="solve-key">Search</span>${this.seg('budget', Object.entries(BUDGET_LABELS).map(([k, t]) => [k, t, searchHelp(c.mode, k).title]), 'Search depth')}</div>
			${this.optionHelpHtml()}
			${exact ? `<div class="solve-sub">${this.exactSourceHtml()}</div>` : ''}
			${useSave ? '' : `<div class="solve-row"><span class="solve-key">Hero</span>${this.seg('heroSrc', [['profile', 'Your hero', OPTION_HELP.heroSrc.profile.title], ['manual', 'What-if', OPTION_HELP.heroSrc.manual.title]], 'Hero')}</div>`}
			<div class="solve-sub">${this.heroHtml()}</div>
			<div class="layer-row solve-check" id="sv-mpitems" role="checkbox" tabindex="0" aria-checked="${!!c.useItemsForMp}" title="Off: the plan never spends items on mental power; it asks you to solve puzzles for it instead (in a dungeon, puzzle MP goes straight to the hero, up to its max)."><div class="checkbox${c.useItemsForMp ? ' selected' : ''}"></div><span>Use items for mental power</span></div>
			${this.solveTargetHtml()}
			${this.runRowHtml()}
			${this.result ? '<div class="small"><a id="solve-collapse" role="button" tabindex="0">Hide these settings</a></div>' : ''}`;
	}

	/** where exact mode's dice come from: the save's dungeon in progress, or a made-up xseed */
	exactSourceHtml() {
		const c = this.cfg;
		const sd = this.saveDungeon();
		const xseedRow = `<div class="solve-line"><label for="sv-xseed">Dice seed (xseed)</label> <input type="number" id="sv-xseed" value="${esc(c.xseed)}" /></div>`;
		const why = sd ? '' : this.noSaveDungeonText();
		if (!sd) return `${why ? `<div class="solve-note">${why}</div>` : ''}${xseedRow}${this.xseedNote()}`;
		const label = formatLabel(sd.type, sd.seed);
		return `${this.seg('exactSrc', [['save', 'Saved dungeon', OPTION_HELP.exactSrc.save.title], ['xseed', 'Experiment', OPTION_HELP.exactSrc.xseed.title]], 'Exact source')}
					${c.exactSrc === 'save' ? `<div class="solve-line">Your save is inside <b>${label}</b>; the solver plays on from there with the game's own dice.</div>` : xseedRow + this.xseedNote()}`;
	}

	/** why exact mode can't use the imported save's own dice ('' with no save imported) */
	noSaveDungeonText() {
		const H = this.heroPanel();
		if (!(H && H.profile)) return '';   // no save yet: the mode's description says where the dice come from
		if (H.dungeon && H.dungeon.kind === 'ew') return 'Your save holds an autonomous run (the hero is exploring alone), which has no fight to solve.';
		return 'Your save was made in town: no dungeon is in progress, so the dice (the combat RNG state) are not in it. Enter the dungeon in the game, export again (Settings → Export), and import that file to solve your real run.';
	}

	/** the hero settings: your imported hero, or the what-if fields (the save's own hero has none: see solveTargetHtml) */
	heroHtml() {
		if (this.useSave()) return '';
		if (this.cfg.heroSrc === 'profile') return this.profileHeroHtml();
		return this.manualHeroHtml();
	}

	profileHeroHtml() {
		const pi = this.profileInfo();
		if (!pi) return `<div class="solve-note">No save imported yet. <a id="solve-import">Import your save</a> to solve with your own hero, or use <a id="solve-whatif">What-if</a>.</div>`;
		const gates = pi.gates.filter((g) => g.gate !== 'dungeon');
		return `<div class="solve-line">Hero ${pi.index + 1} · level ${pi.lvl} · enters with <b>${pi.mpIn}</b> mental power <span class="muted">(stock ${pi.stock}, max ${pi.mpMax})</span></div>
					<div class="solve-line small muted"><a id="solve-pick-hero">Choose another hero</a> in Your hero.</div>
					${pi.gates.length > gates.length ? this.alreadyInDungeonNote() : ''}
					${gates.length ? `<div class="solve-note warn">${gates.map((g) => esc(g.text[0].toUpperCase() + g.text.slice(1))).join('. ')}. The solver plays the run anyway.</div>` : ''}`;
	}

	/** the save's hero is inside a dungeon: a robust or experiment solve starts a run from an entrance, which is not that run */
	alreadyInDungeonNote() {
		const playOn = this.saveDungeon() ? ' Exact mode with Saved dungeon plays that run on from where your save stands.' : '';
		return `<div class="solve-note">Your save is already inside <b>${esc(this.heroDungeonLabel())}</b>.${playOn} This solve starts the dungeon on the map from its entrance.</div>`;
	}

	manualHeroHtml() {
		const m = this.cfg.manual;
		return `<div class="manual-grid">
				<label for="sv-level">Level</label><input type="number" id="sv-level" min="1" max="99" value="${esc(m.level)}" />
				<label for="sv-gear">Gear</label><select id="sv-gear" class="button-positive-2">${GEAR_TEXT.map((t, i) => `<option value="${i + 1}"${+m.gear === i + 1 ? ' selected' : ''}>${t}</option>`).join('')}</select>
				<label for="sv-kit">Kit</label><select id="sv-kit" class="button-positive-2" title="${esc((KIT_TEXT[m.kit] || ''))}">${['kit2', 'kit', 'none'].map((k) => `<option value="${k}"${m.kit === k ? ' selected' : ''}>${{ kit2: 'Full kit', kit: 'Basic kit', none: 'None' }[k]}</option>`).join('')}</select>
				<label for="sv-skills">Skills</label><input type="text" id="sv-skills" placeholder="from the kit" spellcheck="false" value="${esc(m.skills)}" title="${esc(this.skillsHelp())}" />
				<label for="sv-mp">Start MP</label><input type="number" id="sv-mp" min="0" placeholder="from the kit" value="${esc(m.mp)}" />
			</div>
			<div class="small muted" id="sv-kit-text">${esc((KIT_TEXT[m.kit] || ''))}</div>`;
	}

	/** Solve / Cancel, the time estimate (or why it can't run), the progress bar and the status line */
	runRowHtml() {
		const est = this.estimateText(BUDGETS[this.cfg.mode][this.cfg.budget].budgetMs, workerCount(this.cfg.mode));
		const canRun = this.canRun();
		return `<div class="solve-run">
				<div class="button-positive-2${canRun.ok ? '' : ' disabled'}" id="solve-run" role="button" tabindex="0" aria-disabled="${!canRun.ok}" title="${esc(canRun.why || 'Solve this dungeon')}">${this.result ? 'Solve again' : 'Solve'}</div>
				<div class="button-positive-2" id="solve-cancel" role="button" tabindex="0" style="display: none;">Cancel</div>
				<span class="small muted" id="solve-eta">${esc(canRun.ok ? est : canRun.why)}</span>
			</div>
			<div class="solve-progress" id="solve-progress" style="display: none;" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="bar"><div class="fill"></div></div></div>
			<div class="small solve-status" id="solve-status" aria-live="polite">${esc(this.status)}</div>`;
	}

	/** wire the controls just rendered into box (each handler re-renders them) */
	bindControls(box) {
		onActivate($('#solve-expand', box), () => { this.controlsOpen = true; this.renderControls(); });
		onActivate($('#solve-collapse', box), () => { this.controlsOpen = false; this.renderControls(); });
		onActivate($('#sv-mpitems', box), () => this.setOption('useItemsForMp', !this.cfg.useItemsForMp));
		for (const b of box.querySelectorAll('.seg-btn')) onActivate(b, () => this.setOption(b.dataset.k, b.dataset.v));
		this.bindManualInputs(box);
		const H = this.heroPanel();
		const pickHeroLink = $('#solve-pick-hero', box); if (pickHeroLink) pickHeroLink.onclick = () => H.open();
		const importLink = $('#solve-import', box); if (importLink) importLink.onclick = () => H.open();
		const whatIfLink = $('#solve-whatif', box); if (whatIfLink) whatIfLink.onclick = () => this.setOption('heroSrc', 'manual');
		onActivate($('#solve-run', box), () => this.run());
		onActivate($('#solve-cancel', box), () => this.cancel());
	}

	setOption(key, value) {
		this.cfg[key] = value;
		this.save();
		this.renderControls();
	}

	/** The box under the Search row: what the chosen Mode and Search depth do. Both rows sit above it, so pressing a
	 * button never moves the buttons. */
	optionHelpHtml() {
		const c = this.cfg;
		const mode = OPTION_HELP.mode[c.mode];
		const depth = BUDGETS[c.mode][c.budget] ? searchHelp(c.mode, c.budget) : null;
		const line = (name, help) => `<div><b>${esc(name)}:</b> ${esc(help.desc)}</div>`;
		return `<div class="solve-note solve-help" id="solve-help">${mode ? line(c.mode === 'exact' ? 'Exact' : 'Robust', mode) : ''}${depth ? line(BUDGET_LABELS[c.budget], depth) : ''}</div>`;
	}

	/** typing in a field saves the settings without re-rendering (that would drop the focus) */
	bindManualInputs(box) {
		const bindInput = (id, f) => { const el = $(id, box); if (el) el.onchange = el.oninput = () => { f(el.value); this.save(); }; };
		bindInput('#sv-level', (v) => { this.cfg.manual.level = v; });
		bindInput('#sv-gear', (v) => { this.cfg.manual.gear = +v; });
		bindInput('#sv-kit', (v) => { this.cfg.manual.kit = v; const t = $('#sv-kit-text', box); if (t) t.textContent = (KIT_TEXT[v] || ''); });
		bindInput('#sv-skills', (v) => { this.cfg.manual.skills = v; });
		bindInput('#sv-mp', (v) => { this.cfg.manual.mp = v; });
		bindInput('#sv-xseed', (v) => { this.cfg.xseed = v; });
	}

	skillsHelp() {
		const s = this.names.skills || {};
		return 'Skill levels as index:level, comma separated (they replace the kit\'s), e.g. 1:3,5:2. ' + Object.entries(s).map(([i, n]) => `${i} ${n}`).join(', ');
	}

	xseedNote() {
		return '<div class="small muted">The game seeds the dice from the clock when you enter, so an xseed script will not match a real run. Use it to see what exact play looks like.</div>';
	}

	estimateText(budgetMs, W) {
		const start = this.client.warm ? '' : ', plus a few seconds to start';
		return `Takes about ${durText(budgetMs)}${start} · ${W} worker${W === 1 ? '' : 's'}`;
	}

	canRun() {
		if (this.running) return { ok: false, why: 'Solving…' };
		if (!this.state.level && !this.useSave()) return { ok: false, why: 'Show a dungeon first.' };
		if (this.useSave()) return { ok: true };
		if (this.cfg.heroSrc === 'profile' && !(this.heroPanel() && this.heroPanel().profile)) return { ok: false, why: 'Import your save, or use a What-if hero.' };
		if (this.cfg.heroSrc === 'manual') {
			const sk = String(this.cfg.manual.skills || '').trim();
			if (sk && !/^\d+:\d+(\s*,\s*\d+:\d+)*$/.test(sk)) return { ok: false, why: 'Skills: use index:level pairs, e.g. 1:3,5:2.' };
			const lv = Number(this.cfg.manual.level);
			if (!(lv >= 1 && lv <= 99)) return { ok: false, why: 'Level: 1 to 99.' };
		}
		if (this.cfg.mode === 'exact' && !this.useSave() && !Number.isFinite(Number(this.cfg.xseed))) return { ok: false, why: 'Enter a dice seed (any whole number).' };
		return { ok: true };
	}

	heroSpec() {
		const H = this.heroPanel();
		// the map's progress (js/hero.js effectiveProfile): the imported hero gets the save plus the Your progress edits
		// ({ guild, progress } bytes, importSave applies them), a what-if hero the whole progress as a spec on a new game
		if (this.cfg.heroSrc === 'profile') {
			if (H.solverProfile) return { profile: H.solverProfile() };
			return { profile: { bytes: H.guild, hero: H.hero, premium: false, name: (H.info && H.info.file) || 'guild.dat' } };
		}
		const m = this.cfg.manual;
		const spec = { level: clamp(Math.round(Number(m.level) || 1), 1, 99), gear: clamp(Number(m.gear) || 1, 1, 4) };
		const progress = H && H.solverProgress ? H.solverProgress('new') : null;
		if (progress) spec.quests = progress;
		if (m.kit === 'kit') spec.kit = true;
		if (m.kit === 'kit2') spec.kit2 = true;
		const sk = String(m.skills || '').replace(/\s+/g, '');
		if (sk) spec.skills = sk;
		if (m.mp !== '' && m.mp != null && Number.isFinite(Number(m.mp))) spec.mp = Math.max(0, Math.round(Number(m.mp)));
		return spec;
	}

	buildJob() {
		const c = this.cfg;
		const job = { mode: c.mode, budget: c.budget, workers: workerCount(c.mode), useItemsForMp: !!c.useItemsForMp };
		if (this.useSave()) {
			const H = this.heroPanel();
			const sd = this.saveDungeon();
			Object.assign(job, { saveBytes: H.guild, saveName: (H.info && H.info.file) || 'guild.dat', hero: {}, type: sd.type, seed: sd.seed, label: formatLabel(sd.type, sd.seed) });
			return job;
		}
		const H = this.heroPanel();
		const eff = H && H.effectiveProfile ? H.effectiveProfile() : null;
		Object.assign(job, { type: this.state.type, seed: this.state.seed, label: formatLabel(this.state.type, this.state.seed), hero: this.heroSpec(), basis: eff ? { key: eff.key, text: eff.text, basis: eff.basis } : null });
		if (c.mode === 'exact') job.xseed = Math.trunc(Number(c.xseed)) | 0;
		return job;
	}

	// ---- running ---------------------------------------------------------------------------------------------------
	async run() {
		const ok = this.canRun();
		if (!ok.ok) { this.status = ok.why; this.renderControls(); return; }
		const job = this.buildJob();
		const epoch = this.epoch;
		if (this.useSave()) await this.showSaveDungeon(job.label);
		if (epoch !== this.epoch) return;   // reset meanwhile (a new save came in): this request is out of date
		this.stopPlay();
		this.running = { t0: performance.now(), job, budgetMs: BUDGETS[job.mode][job.budget].budgetMs, prog: null, warm: this.client.warm };
		this.status = this.running.warm ? 'Starting…' : 'Starting the solver…';
		this.renderControls();
		this.timer = setInterval(() => this.renderProgress(), 400);
		try {
			const r = await this.client.solve(job, (p) => this.onSolveProgress(p));
			const wallMs = performance.now() - this.running.t0;
			this.status = `Done in ${num(wallMs / 1000, 1)} s.`;
			this.setResult({ ...r, job: { ...job, saveBytes: undefined, hero: stripBytes(job.hero) }, wallMs });
			console.info('solve', job.mode, job.budget, job.label, `wall ${Math.round(wallMs)} ms`, r.timings);
		} catch (e) {
			if (e instanceof CancelError) this.status = 'Cancelled.';
			else { console.error(e); this.status = `The solver failed: ${e.message}`; }
		} finally {
			clearInterval(this.timer);
			this.running = null;
			this.renderControls();
		}
	}

	/** the save's own dungeon: show it (with the player's progress) before solving it */
	async showSaveDungeon(label) {
		const H = this.heroPanel();
		if (!H.use) H.setUse(true);
		if (formatLabel(this.state.type, this.state.seed) !== label) await this.opts.show(label);
	}

	onSolveProgress(p) {
		if (!this.running) return;
		this.running.prog = p;
		// robust mode's scout counts the fights to decide: the share decided drives the bar from then on
		if (p.phase === 'scout') this.running.keys = p.keys;
		this.renderProgress();
	}

	cancel() {
		if (!this.running) return;
		this.client.cancel();
	}

	renderRunState() {
		const run = $('#solve-run', this.root), cancel = $('#solve-cancel', this.root), bar = $('#solve-progress', this.root);
		if (!run) return;
		const on = !!this.running;
		run.style.display = on ? 'none' : '';
		cancel.style.display = on ? '' : 'none';
		bar.style.display = on ? '' : 'none';
		if (on) this.renderProgress();
	}

	renderProgress() {
		const R = this.running;
		if (!R) return;
		const p = R.prog || {};
		const { text, frac } = phaseText(p, R);
		const elapsed = (performance.now() - R.t0) / 1000;
		const clock = { solving: p.ms != null ? p.ms / 1000 : elapsed, budget: R.budgetMs / 1000 };
		const bar = $('#solve-progress', this.root);
		if (bar) {
			const fill = progressFill(p, frac, clock);
			bar.querySelector('.fill').style.width = `${Math.round(fill * 100)}%`;
			bar.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
		}
		const st = $('#solve-status', this.root);
		if (st) st.textContent = `${text} · ${Math.round(elapsed)} s${etaText(p, frac, clock)}`;
	}

	// ---- results -----------------------------------------------------------------------------------------------------
	setResult(r) {
		this.result = r;
		this.controlsOpen = false;
		this.sel = null;
		this.pos = 0;
		const plan = r.plan;
		if (plan.mode === 'exact' && r.frames) Object.assign(r, walkedTrail(r.frames[0].hero, r.acts));
		this.renderResult();
		this.applyMap();
		if (plan.mode === 'exact' && r.frames) {
			const h = r.frames[0].hero;
			this.view.focus(h.x, h.y, Math.max(this.view.scale, 0.8));
		}
	}

	/** Start over, as when the page has a new save: no plan, nothing selected or playing, a running solve cancelled. */
	reset() {
		this.epoch++;
		this.cancel();
		this.stopPlay();
		this.result = null;
		this.sel = null;
		this.pos = 0;
		this.status = '';
		this.controlsOpen = false;
		this.view.clearSolveOverlay();
		this.renderControls();
		this.renderResult();
	}

	/** The save was forgotten: drop the plan and the solve that came from it (its hero or dungeon). True if there was one. */
	dropWhatCameFromSave() {
		const plan = this.result && this.result.plan;
		const fromSave = (plan && planUsesProfile(plan)) || (this.running && jobUsesSave(this.running.job));
		if (fromSave) this.reset();
		return !!fromSave;
	}

	stale() {
		const p = this.result && this.result.plan;
		return !!p && !!this.state.level && (this.state.type !== p.dungeon.type || this.state.seed !== p.dungeon.seed);
	}

	/** the app showed another level: redraw the overlay (setLevel cleared it) */
	onLevel() {
		this.renderControls();
		this.renderResult();
		this.applyMap();
	}

	onTheme() { this.renderResult(); }

	/**
	 * Mental power to solve for (puzzles refill MP; in a dungeon it goes straight to the hero, up to max MP).
	 * From the solver's plan.mpToSolve / plan.mpTopUps [{ stopIndex, beforeEncounter?, amount }] when present, else
	 * the interim plan.mpNeeded / plan.mp, else the route's needs against the hero's MP. All optional.
	 */
	mpInfo(plan) {
		const topUps = planTopUps(plan);
		const needed = plan.mpNeeded && typeof plan.mpNeeded === 'object' ? plan.mpNeeded : null;
		const mpObj = plan.mp && typeof plan.mp === 'object' && !Array.isArray(plan.mp) ? plan.mp : null;
		const route = plan.route && plan.route.needs ? plan.route.needs.mp : needed ? needed.route : null;
		const need = (needed && needed.total) ?? (mpObj && mpObj.need) ?? route ?? 0;
		const start = (needed && needed.start) ?? (mpObj && mpObj.start) ?? (plan.hero ? plan.hero.mp : null);
		const max = (mpObj && mpObj.max) ?? (plan.hero ? plan.hero.mpM : null);
		const toSolve = mpShortfall(plan, topUps, { needed, need, start });
		const potions = (plan.pack || []).filter((p) => isMpPotion(p.id) && p.bring > 0);
		const value = (plan.warnings || []).find((w) => w.kind === 'mpValue');
		return { toSolve: Math.max(0, Math.round(toSolve)), topUps, need, route, start, max, potions, value: value ? value.text : null, fromSolver: typeof plan.mpToSolve === 'number' || topUps.length > 0 };
	}

	/** where each top-up goes in the plan list: before an encounter, or at a stop */
	topUpPlaces(plan) {
		const byEnc = new Map(), byStop = new Map(), other = [];
		for (const u of this.mpInfo(plan).topUps) {
			const stop = u.stopIndex ?? u.stop;
			if (u.beforeEncounter != null && plan.encounters[u.beforeEncounter]) pushTo(byEnc, u.beforeEncounter, u);
			else if (stop != null && plan.stops[stop]) pushTo(byStop, stop, u);
			else other.push(u);
		}
		return { byEnc, byStop, other };
	}

	renderResult() {
		const box = $('#solve-result', this.root);
		if (!box) return;
		const r = this.result;
		if (!r) {
			box.innerHTML = `<div class="small muted solve-empty">${this.state.level ? SOLVER_INTRO : NO_DUNGEON_INTRO}</div>`;
			return;
		}
		const plan = r.plan;
		const label = plan.dungeon.label || formatLabel(plan.dungeon.type, plan.dungeon.seed);
		if (this.stale()) {
			box.innerHTML = `<div class="solve-note">The last plan is for <b>${esc(label)}</b>. <a id="solve-back">Show that dungeon</a> to see it.</div>`;
			$('#solve-back', box).onclick = () => this.opts.show(label);
			return;
		}
		const player = plan.mode === 'exact' && r.frames;
		const cards = [this.summaryCardHtml(r, label), this.basisNoteHtml(r), this.mpCardHtml(r), warningsHtml(plan), routeHeadHtml()];
		box.innerHTML = `${player ? '<div class="player" id="solve-player"></div>' : ''}<div class="solve-scroll" id="solve-scroll">${cards.join('')}</div>`;
		const basisLink = $('#solve-basis', box);
		if (basisLink) basisLink.onclick = () => this.heroPanel().setUse(planUsesProfile(plan));
		$('#solve-export', box).onclick = () => this.exportPlan();
		this.renderPlanList($('#plan-list', box), plan);
		if (player) this.renderPlayer();
	}

	/** the totals (items, MP, death risk, objectives left), what to bring, and how the plan was solved */
	summaryCardHtml(r, label) {
		const plan = r.plan;
		const T = plan.totals || {};
		const exact = plan.mode === 'exact';
		const deathText = exact ? (T.pDeath ? 'dies' : 'survives') : pct(T.pDeath);
		const left = exact ? T.objectivesLeft : T.objectivesLeft ? T.objectivesLeft.mean : 0;
		const firstDeath = exact && T.pDeath ? plan.encounters.find((e) => e.expected && e.expected.pDeath) : null;
		return `<div class="solve-card">
			<div class="solve-card-head">${exact ? 'Exact' : 'Robust'} plan · ${esc(label)}</div>
			<div class="sum-grid">
				<div class="stat" title="Consumables used: potions, food, thrown items; a spider that comes back is free"><span class="muted">Items</span><b>${num(T.items && T.items.mean)}</b>${!exact && T.items ? `<span class="small muted">p95 ${T.items.p95}</span>` : ''}</div>
				<div class="stat" title="Mental power spent (net: fountains count back)"><span class="muted">Mental power</span><b>${num(T.mp && T.mp.mean, 0)}</b>${!exact && T.mp ? `<span class="small muted">p95 ${T.mp.p95}</span>` : ''}</div>
				<div class="stat${(exact ? T.pDeath : T.pDeath > (plan.objective?.maxDeath ?? 0.01)) ? ' bad' : ''}" title="${exact ? 'This exact run' : 'Share of the simulated runs in which the hero dies'}"><span class="muted">${exact ? 'Hero' : 'Death risk'}</span><b>${deathText}</b></div>
				<div class="stat${left > 0 ? ' warnc' : ''}"><span class="muted">Objectives left</span><b>${num(left)}</b></div>
			</div>
			${this.packLineHtml(plan)}
			${firstDeath ? `<div class="solve-line bad-text">The hero dies in fight ${firstDeath.i + 1}.</div>` : ''}
			${plan.baseline ? `<div class="small muted">Plain melee everywhere: ${num(plan.baseline.items.mean)} items, ${num(plan.baseline.mp.mean, 0)} MP, death ${pct(plan.baseline.pDeath)}.</div>` : ''}
			<div class="small muted">${solvedHowText(r)}</div>
		</div>`;
	}

	/** "Bring: 2× Potion of healing (rarely: …)": the items the plan uses in most runs, and the ones it rarely needs */
	packLineHtml(plan) {
		const bring = (plan.pack || []).filter((p) => p.bring > 0);
		const rare = (plan.pack || []).filter((p) => !(p.bring > 0) && p.mean > 0);
		const itemName = (p) => esc(p.name || this.item(p.id));
		return `<div class="solve-line"><span class="muted">${plan.mode === 'exact' ? 'Uses' : 'Bring'}:</span> ${bring.length ? bring.map((p) => `${p.bring}× ${itemName(p)}`).join(', ') : 'nothing'}${rare.length ? ` <span class="muted small">(rarely: ${rare.map((p) => `${itemName(p)} ${num(p.mean, 2)}/run`).join(', ')})</span>` : ''}</div>`;
	}

	/**
	 * The progress the plan was made with (job.basis: js/hero.js effectiveProfile) against the one the map is drawn
	 * with: a note when they differ, since monsters and people can differ.
	 */
	basisNoteHtml(r) {
		const plan = r.plan;
		const H = this.heroPanel();
		const mapEff = H && H.effectiveProfile ? H.effectiveProfile() : null;
		const planBasis = r.job && r.job.basis;
		if (planBasis && mapEff && plan.dungeon.at !== 'save') {
			if (planBasis.key === mapEff.key) return '';
			return `<div class="solve-note">The map is drawn with ${esc(mapEff.text.toLowerCase())}, the plan was made with ${esc(planBasis.text.toLowerCase())}${planBasis.basis === mapEff.basis ? ' (changed since)' : ''}: monsters and people can differ. Solve again to plan for this map.</div>`;
		}
		const planProfile = planUsesProfile(plan);
		const mapProfile = !!(H && H.activeProfile());
		if (planProfile === mapProfile) return '';
		return `<div class="solve-note">The map is drawn ${mapProfile ? 'with your progress' : 'as a new game'}, the plan was made ${planProfile ? 'with your progress' : 'as a new game'}: monsters and people can differ. <a id="solve-basis">Draw the map ${planProfile ? 'with your progress' : 'as a new game'}</a>.</div>`;
	}

	/** mental power to solve for (neutral: puzzles always refill MP), or nothing when the run needs none */
	mpCardHtml(r) {
		const mp = this.mpInfo(r.plan);
		if (!(mp.toSolve > 0 || mp.need > 0)) return '';
		return `<div class="solve-card mp-card">
				<div class="solve-card-head">Mental power to solve for <span class="badge-info">${mp.toSolve > 0 ? `${mp.toSolve} MP` : 'none'}</span></div>
				${this.mpLines(r, mp).map((a) => `<div class="solve-line">${a}</div>`).join('')}
			</div>`;
	}

	mpLines(r, mp) {
		const plan = r.plan;
		const isProfile = !!(plan.heroSpec && plan.heroSpec.profile);
		const itemsForMp = !!(r.job && r.job.useItemsForMp);
		const lines = [];
		lines.push(mp.toSolve > 0
			? `Solve puzzles for about <b>${mp.toSolve}</b> mental power during this run. In a dungeon, puzzle MP goes straight to the hero, up to its max${mp.max != null ? ` (${mp.max})` : ''}.`
			: 'The hero\'s mental power covers this run: no puzzles needed.');
		if (mp.topUps.length) lines.push(`<ul class="topup-list">${mp.topUps.map((u) => `<li>${esc(topUpText(u, plan))}</li>`).join('')}</ul>`);
		else if (mp.toSolve > 0) lines.push('<span class="muted">Top up before the seals, sealed doors, and chests on the route (the stops list shows them).</span>');
		const spend = mp.route != null && mp.route !== mp.need ? `This run spends about ${mp.need} MP (the route's seals, sealed doors, and chests: ${mp.route})` : `The route's seals, sealed doors, and chests take about ${mp.need} MP`;
		lines.push(`<span class="small muted">${spend}${mp.start != null ? `; the hero starts with ${mp.start}${isProfile ? ' (from your stock)' : ''}` : ''}.${isProfile ? ' Puzzles solved in town before you go raise the stock the game hands the hero at entry.' : ''}</span>`);
		if (itemsForMp && mp.potions.length) lines.push(`<span class="small muted">With "Use items for mental power" on, the plan also uses ${mp.potions.map((p) => `${p.bring}× ${esc(p.name || this.item(p.id))}`).join(', ')}.</span>`);
		if (mp.value) lines.push(`<span class="small muted">${esc(mp.value)}</span>`);
		return lines;
	}

	renderPlanList(list, plan) {
		const encs = plan.encounters || [];
		const { byEnc, byStop } = this.topUpPlaces(plan);
		list.innerHTML = '';
		for (const it of planListOrder(plan)) {
			if (it.stop != null) {
				list.append(this.stopRow(plan.stops[it.stop]));
				for (const u of byStop.get(it.stop) || []) list.append(this.topUpRow(plan, u));
			} else {
				for (const u of byEnc.get(it.enc) || []) list.append(this.topUpRow(plan, u));
				list.append(this.encCard(plan, encs[it.enc]));
			}
		}
	}

	topUpRow(plan, u) {
		const row = buttonDiv('topup-row');
		const e = u.beforeEncounter != null ? plan.encounters[u.beforeEncounter] : null;
		row.innerHTML = `<span class="tag mp">MP</span> Solve puzzles for <b>${upAmount(u)}</b> mental power${e ? ` ${u.fight ? 'during' : 'before'} fight ${e.i + 1}` : ' here'}`;
		onActivate(row, () => this.showTopUp(plan, u));
		return row;
	}

	/** where a top-up is due: its script position, the end of the fight before it (exact), or its place on the map */
	showTopUp(plan, u) {
		const r = this.result;
		const e = u.beforeEncounter != null ? plan.encounters[u.beforeEncounter] : null;
		const s = plan.stops[u.stopIndex ?? u.stop];
		if (Number.isInteger(u.atInput) && r.frames) {
			this.setPos(u.atInput, { focus: true });
			return;
		}
		if (e && plan.mode === 'exact' && r.frames && e.script) {
			this.setPos(this.topUpPos(e), { focus: true });
			return;
		}
		const p = (e && e.where) || (s && (s.at || s.target));
		if (p) this.view.focus(p.x, p.y, Math.max(this.view.scale, 0.6));
	}

	/** exact script: where a top-up before encounter e is due (the end of the fight before it, or the start) */
	topUpPos(e) {
		const encs = this.result.plan.encounters.filter((x) => x.script && x.script.to <= e.script.from);
		return encs.length ? Math.max(...encs.map((x) => x.script.to)) : 0;
	}

	/** MP to top up at script position p: a top-up step there, a plan top-up applied before it, or one due before the next fight */
	topUpAt(p) {
		const r = this.result;
		const act = r.acts[p];
		if (act && act.topup != null) return { amount: act.topup, step: true };
		if (act && act.topupBefore) return { amount: act.topupBefore };
		if (r.acts.some((a) => a.topup != null || a.topupBefore)) return null;
		for (const u of this.mpInfo(r.plan).topUps) {
			const e = u.beforeEncounter != null ? r.plan.encounters[u.beforeEncounter] : null;
			if (!e || !e.script) continue;
			if (p >= this.topUpPos(e) && p <= e.script.from) return { amount: upAmount(u), before: e.i };
		}
		return null;
	}

	stopText(s) {
		if (s.label) return s.label;
		if (s.target) {
			if (s.target.critter) return this.critterName(this.critterKindOf({ id: s.target.id, g: 0, h: 0, k: 2 }), s.target.id);
			return this.objectTitle(s.target.id);
		}
		return { exit: 'Stairs (exit)', nonogram: 'Floor nonogram', barrels: 'Barrel puzzle' }[s.kind] || s.kind;
	}

	stopRow(s) {
		const row = buttonDiv('stop-row');
		const doing = (s.doing || []).map((d) => `↳ ${esc(d.text)}${d.mp ? ` (${d.mp} MP)` : ''}${d.ep ? ` (${d.ep} energy)` : ''}${d.at ? ` at ${d.at.x},${d.at.y}` : ''}`);
		row.innerHTML = `<div class="stop-head"><span><span class="muted">${s.i + 1}.</span> ${esc(this.stopText(s))}</span><span class="muted">+${s.steps ?? '?'} steps</span></div>${doing.length ? `<div class="small muted stop-doing">${doing.join('<br>')}</div>` : ''}`;
		onActivate(row, () => this.showStop(s));
		return row;
	}

	/** centre the map on a stop and mark its cell (it deselects any fight) */
	showStop(s) {
		const p = s.target || s.at;
		if (!p) return;
		this.sel = null;
		this.view.focus(p.x, p.y, Math.max(this.view.scale, 0.6));
		this.applyMap({ stop: s });
		this.markSelected();
	}

	pinColor(e, plan) {
		const ex = e.expected || {};
		if (ex.pDeath > (plan.objective?.maxDeath ?? 0.01)) return PIN.death;
		if (ex.items > 0.02) return PIN.items;
		if (ex.mp > 0.1) return PIN.mp;
		return PIN.free;
	}

	encCard(plan, e) {
		const card = document.createElement('div');
		card.className = 'enc' + (this.sel === e.i ? ' sel' : '');
		card.dataset.i = String(e.i);
		const head = this.encHead(plan, e);
		const tactic = encTactic(e);
		const cost = encCost(plan, e);
		card.append(head, this.encFoes(plan, e), tactic, cost);
		if (e.candidates && e.candidates.length) card.append(encCompare(plan, e));
		if (plan.mode === 'exact' && e.script) card.append(this.encPlayLink(e));
		const pick = () => this.select(e.i, { scroll: false });
		onActivate(head, pick);
		tactic.onclick = pick;
		cost.onclick = pick;
		return card;
	}

	/** the fight's pin number, its foes' sprites and where it is */
	encHead(plan, e) {
		const head = buttonDiv('enc-head');
		head.setAttribute('aria-label', `Fight ${e.i + 1}: show on the map`);
		head.innerHTML = `<span class="enc-pin" style="background:${this.pinColor(e, plan)}">${e.i + 1}</span><span class="enc-title">${e.enemies.length} ${e.enemies.length === 1 ? 'foe' : 'foes'}${e.where ? ` <span class="muted small">at ${e.where.x},${e.where.y}</span>` : ''}</span>`;
		const icons = document.createElement('span');
		icons.className = 'enc-icons';
		for (const en of e.enemies.slice(0, 6)) icons.append(this.critterIcon(this.enemyKind(en), en.id, 26));
		head.insertBefore(icons, head.children[1]);
		return head;
	}

	encFoes(plan, e) {
		const foes = document.createElement('div');
		foes.className = 'enc-foes';
		for (const en of e.enemies) foes.append(this.foeRow(en));
		if (plan.mode !== 'exact' && e.enemySets && e.enemySets.length > 1) foes.append(otherGroupsNote(e));
		return foes;
	}

	/** one foe of a fight: sprite, name, stats, and tags (sealed, throws, objective) */
	foeRow(en) {
		const k = this.enemyKind(en);
		const row = document.createElement('div');
		row.className = 'foe-row';
		row.append(this.critterIcon(k, en.id, 22));
		const t = document.createElement('span');
		t.className = 'foe-text';
		t.innerHTML = `<b>${esc(this.critterName(k, en.id))}</b> <span class="muted">${en.hp}/${en.hpM} HP · atk ${en.atk} · def ${en.def} · spd ${en.spd}</span> ${foeTags(en).join(' ')}`;
		row.append(t);
		return row;
	}

	/** exact mode: jump the script player to this fight */
	encPlayLink(e) {
		const b = document.createElement('div');
		b.className = 'small';
		b.innerHTML = `<a class="enc-play">Play this fight in the script</a> <span class="muted">(inputs ${e.script.from + 1}–${e.script.to})</span>`;
		b.querySelector('a').onclick = (ev) => { ev.stopPropagation(); this.setPos(e.script.from, { focus: true }); this.select(e.i, { scroll: false, map: false }); };
		return b;
	}

	/** select an encounter: card highlight, map overlay (foes + hero cell), centre the view */
	select(i, { scroll = true, map = true } = {}) {
		const r = this.result;
		if (!r) return;
		const e = r.plan.encounters[i];
		if (!e) return;
		this.sel = i;
		this.markSelected(scroll);
		if (r.plan.mode === 'exact' && r.frames && map) { this.setPos(e.script.from, { focus: true }); return; }
		this.applyMap();
		if (map) this.view.focusBox([e.where, ...e.enemies].filter(Boolean), { min: 0.45, max: 1.4 });
	}

	markSelected(scroll = false) {
		const list = $('#plan-list', this.root);
		const sc = $('#solve-scroll', this.root);
		if (!list) return;
		for (const c of list.querySelectorAll('.enc')) c.classList.toggle('sel', +c.dataset.i === this.sel);
		if (scroll && sc && this.sel != null) {
			const c = list.querySelector(`.enc[data-i="${this.sel}"]`);
			if (c && (c.offsetTop < sc.scrollTop || c.offsetTop + c.offsetHeight > sc.scrollTop + sc.clientHeight)) sc.scrollTop = Math.max(0, c.offsetTop - 8);
		}
	}

	// ---- map ---------------------------------------------------------------------------------------------------------
	applyMap({ stop } = {}) {
		const v = this.view;
		const r = this.result;
		if (!r || this.stale() || !this.state.level) { v.clearSolveOverlay(); return; }
		const markers = [...this.fightMarkers(), ...this.topUpMarkers()];
		if (r.plan.mode === 'exact' && r.frames) {
			v.setSolveOverlay({ markers, ...this.playerOverlay() });
			return;
		}
		const { actors, marks } = this.selectionOverlay(stop);
		v.setSolveOverlay({ markers, actors, replace: false, marks, callout: null, trail: null, hideRoute: false });
	}

	/** a numbered pin per fight, coloured by its cost; the current fight's pin is highlighted */
	fightMarkers() {
		const r = this.result;
		const plan = r.plan;
		const cur = plan.mode === 'exact' && r.frames ? this.fightAt(this.pos) : this.sel;
		return plan.encounters.filter((e) => e.where).map((e) => ({ x: e.where.x, y: e.where.y, text: String(e.i + 1), color: this.pinColor(e, plan), active: e.i === cur }));
	}

	/** an MP pin where each top-up is due: its script position, else its fight (set off the fight's pin), else its stop */
	topUpMarkers() {
		const r = this.result;
		const plan = r.plan;
		const markers = [];
		for (const u of this.mpInfo(plan).topUps) {
			const e = u.beforeEncounter != null ? plan.encounters[u.beforeEncounter] : null;
			const st = plan.stops[u.stopIndex ?? u.stop];
			const exactAt = Number.isInteger(u.atInput) && r.frames ? r.frames[u.atInput].hero : null;
			const p = exactAt || (e && e.where) || (st && (st.at || st.target));
			if (p) markers.push({ x: p.x, y: p.y, text: 'MP', color: PIN.topup, off: !exactAt && e ? 24 : 0 });
		}
		return markers;
	}

	/** robust plans: a clicked stop gets a yellow cell; a selected fight shows the hero and its foes */
	selectionOverlay(stop) {
		if (stop) {
			const p = stop.target || stop.at;
			return { actors: null, marks: [{ x: p.x, y: p.y, color: '#ffd84a', fill: true }] };
		}
		if (this.sel == null) return { actors: null, marks: [] };
		return this.fightOverlay(this.result.plan.encounters[this.sel]);
	}

	fightOverlay(e) {
		const actors = [], marks = [];
		if (e.where) {
			actors.push({ x: e.where.x, y: e.where.y, kind: 'hero', hero: true, hp: e.hero ? e.hero.hp : 0, hpM: e.hero ? e.hero.hpM : 0, bar: !!e.hero });
			marks.push({ x: e.where.x, y: e.where.y, color: '#4f9ef8', fill: true });
		}
		for (const en of e.enemies) {
			const k = this.enemyKind(en);
			actors.push({ x: en.x, y: en.y, kind: k, variant: spriteVariant(k, en.id, this.state.level), hp: en.hp, hpM: en.hpM, bar: true });
			marks.push({ x: en.x, y: en.y, color: '#e5484d' });
		}
		return { actors, marks };
	}

	// ---- script player (exact) -------------------------------------------------------------------------------------
	fightAt(p) {
		const encs = this.result ? this.result.plan.encounters : [];
		for (const e of encs) if (e.script && p >= e.script.from && p < e.script.to) return e.i;
		return null;
	}

	/** the script player's map: the hero and creatures at this step, the next input's cell, a callout and the trail */
	playerOverlay() {
		const r = this.result;
		const p = this.pos;
		const f = r.frames[p];
		const actors = [{ x: f.hero.x, y: f.hero.y, kind: 'hero', hero: true, hp: f.hero.hp, hpM: f.hero.hpM, bar: true }];
		const marks = [{ x: f.hero.x, y: f.hero.y, color: '#4f9ef8', fill: true }];
		for (const c of frameCritters(f.cr)) {
			const kind = this.critterKindOf(c);
			const foe = c.flags & 1, eng = c.flags & 2;
			actors.push({ x: c.x, y: c.y, kind, variant: spriteVariant(kind, c.id, this.state.level), hp: c.hp, hpM: c.hpM, bar: !!foe && (!!eng || c.hp < c.hpM) });
			if (foe && eng && f.C) marks.push({ x: c.x, y: c.y, color: '#e5484d', size: 0.9 });
		}
		const act = r.acts[p];
		const ins = act ? instruction(act, this.wordsCtx()) : null;
		if (ins && ins.cell) marks.push({ x: ins.cell.x, y: ins.cell.y, color: '#ffb02e', fill: 'rgba(255,176,46,0.30)', size: 1.12 });
		const callout = { x: f.hero.x, y: f.hero.y, text: ins ? this.calloutText(ins) : (r.plan.totals.pDeath ? 'The hero is dead' : 'End of the script') };
		return { actors, replace: true, marks, callout, trail: r.trail, upto: r.trailUpto[p], hideRoute: true };
	}

	/** "12. Top up 20 MP, then: Tap tile (3,4)" */
	calloutText(ins) {
		const up = this.topUpAt(this.pos);
		return `${this.pos + 1}. ${up && !up.step ? `Top up ${up.amount} MP, then: ` : ''}${ins.text}`;
	}

	setPos(p, { focus = false } = {}) {
		const r = this.result;
		if (!r || !r.frames) return;
		this.pos = clamp(p | 0, 0, r.acts.length);
		const fi = this.fightAt(this.pos);
		if (fi !== this.sel && fi != null) { this.sel = fi; this.markSelected(true); }
		this.renderPlayer();
		this.applyMap();
		const h = r.frames[this.pos].hero;
		if (focus) this.view.focus(h.x, h.y, Math.max(this.view.scale, 0.9));
		else if (!this.view.inView(h.x, h.y, 0.18)) this.view.centerOn(h.x, h.y);
	}

	step(d) { this.setPos(this.pos + d); }

	jumpFight(dir) {
		this.setPos(dir > 0 ? this.nextFightStart() : this.previousFightStart(), { focus: true });
	}

	/** the script position of the next fight's first input, or the end */
	nextFightStart() {
		const e = this.scriptedFights().find((x) => x.script.from > this.pos);
		return e ? e.script.from : this.result.acts.length;
	}

	/** the start of the current fight when inside it, else of the fight before; or the script's start */
	previousFightStart() {
		const encs = this.scriptedFights();
		const cur = this.fightAt(this.pos);
		const current = cur != null ? encs.find((x) => x.i === cur) : null;
		if (current && this.pos > current.script.from) return current.script.from;
		const before = encs.filter((x) => x.script.from < this.pos && x.i !== cur);
		const e = before[before.length - 1];
		return e ? e.script.from : 0;
	}

	scriptedFights() {
		return (this.result ? this.result.plan.encounters : []).filter((e) => e.script);
	}

	togglePlay() {
		if (this.playing) { this.stopPlay(); return; }
		if (!this.result || !this.result.frames) return;
		if (this.pos >= this.result.acts.length) this.setPos(0);
		this.playing = setInterval(() => {
			if (!this.result || !this.result.frames || this.pos >= this.result.acts.length) { this.stopPlay(); return; }
			this.step(1);
		}, 450);
		this.renderPlayer();
	}

	stopPlay() {
		if (this.playing) clearInterval(this.playing);
		this.playing = null;
		const b = $('#pl-play', this.root);
		if (b) { b.innerHTML = svgIcon('play'); b.title = 'Play (Space)'; }
	}

	renderPlayer() {
		const box = $('#solve-player', this.root);
		const r = this.result;
		if (!box || !r || !r.frames) return;
		if (!box.dataset.built) this.buildPlayer(box);
		const p = this.pos;
		const f = r.frames[p];
		const act = r.acts[p];
		const range = $('#pl-range', box);
		range.max = String(r.acts.length);
		range.value = String(p);
		$('#pl-where', box).textContent = this.playerWhereText(f);
		this.renderTopUpNotice(box, act ? this.topUpAt(p) : null);
		this.renderInstruction(box, act);
		this.renderLastInput(box);
		$('#pl-pools', box).innerHTML = poolsHtml(f);
		this.renderPlayerFoes(box, f);
		const play = $('#pl-play', box);
		play.innerHTML = svgIcon(this.playing ? 'pause' : 'play');
		play.title = this.playing ? 'Pause (Space)' : 'Play (Space)';
	}

	/** the player's fixed part: buttons, slider and the empty rows renderPlayer fills */
	buildPlayer(box) {
		box.dataset.built = '1';
		box.innerHTML = `
			<div class="player-top"><b>Script</b><span class="muted" id="pl-where"></span></div>
			<div class="player-btns">
				<div class="button-positive-2 view-btn" id="pl-first" role="button" tabindex="0" title="Previous fight (Page Up)">${svgIcon('first')}</div>
				<div class="button-positive-2 view-btn" id="pl-back" role="button" tabindex="0" title="Step back (←)">${svgIcon('back')}</div>
				<div class="button-positive-2 view-btn" id="pl-play" role="button" tabindex="0" title="Play (Space)">${svgIcon('play')}</div>
				<div class="button-positive-2 view-btn" id="pl-fwd" role="button" tabindex="0" title="Step forward (→)">${svgIcon('fwd')}</div>
				<div class="button-positive-2 view-btn" id="pl-next" role="button" tabindex="0" title="Next fight (Page Down)">${svgIcon('last')}</div>
			</div>
			<input type="range" id="pl-range" min="0" value="0" aria-label="Script step" />
			<div class="pl-topup" id="pl-topup" style="display: none;"></div>
			<div class="instr" id="pl-instr" aria-live="polite"></div>
			<div class="small muted" id="pl-prev"></div>
			<div class="pools" id="pl-pools"></div>
			<div class="pl-foes" id="pl-foes"></div>
			<div class="small muted">Keys: ← → step · Page Up / Page Down fight · Home / End · Space play</div>
			${this.result.framesMatch === false ? '<div class="solve-note warn">This replay ends elsewhere than the solver\'s run (for example a top-up it did not record in the script): positions late in the script may be off.</div>' : ''}`;
		// stopPropagation: onKey, on the document, must not act on the same key again
		const bindBtn = (id, fn) => { const b = $(id, box); b.onclick = fn; b.onkeydown = (e) => { if (isActivateKey(e)) { e.preventDefault(); e.stopPropagation(); fn(); } }; };
		bindBtn('#pl-first', () => this.jumpFight(-1));
		bindBtn('#pl-back', () => this.step(-1));
		bindBtn('#pl-play', () => this.togglePlay());
		bindBtn('#pl-fwd', () => this.step(1));
		bindBtn('#pl-next', () => this.jumpFight(1));
		const range = $('#pl-range', box);
		range.oninput = () => this.setPos(+range.value);
	}

	/** "step 12 of 238 · fight 3 of 20" */
	playerWhereText(f) {
		const fi = this.fightAt(this.pos);
		const where = fi != null ? `fight ${fi + 1} of ${this.result.plan.encounters.length}` : f.C ? 'fighting' : 'walking';
		return `step ${this.pos} of ${this.result.acts.length} · ${where}`;
	}

	/** a top-up due before this input (one the script doesn't record as a step of its own) */
	renderTopUpNotice(box, up) {
		const notice = $('#pl-topup', box);
		const due = up && !up.step;
		notice.style.display = due ? '' : 'none';
		if (due) notice.innerHTML = `<span class="tag mp">MP</span> <b>Top up mental power now:</b> solve puzzles for ${up.amount} MP${up.before != null ? ` before fight ${up.before + 1}` : ''}.`;
	}

	renderInstruction(box, act) {
		const ins = act ? instruction(act, this.wordsCtx()) : null;
		$('#pl-instr', box).innerHTML = ins
			? `<span class="muted">Now:</span> <b>${esc(ins.text)}</b>`
			: `<b>${this.result.plan.totals.pDeath ? 'The hero is dead.' : 'End of the script.'}</b>`;
	}

	/** the input before this step, and what it did */
	renderLastInput(box) {
		const row = $('#pl-prev', box);
		const prev = this.pos > 0 ? this.result.acts[this.pos - 1] : null;
		if (!prev) {
			row.textContent = 'At the dungeon start.';
			return;
		}
		const ctx = this.wordsCtx();
		const fx = effects(prev, ctx);
		row.innerHTML = `Last: ${esc(instruction(prev, ctx).text)}${fx.length ? ` → ${esc(fx.join(' · '))}` : ''}`;
	}

	renderPlayerFoes(box, f) {
		const list = $('#pl-foes', box);
		list.innerHTML = '';
		const foes = this.playerFoes(f);
		for (const fo of foes.slice(0, 4)) list.append(this.playerFoeRow(fo));
		if (!foes.length) list.innerHTML = `<div class="small muted">${f.C ? 'No foes left.' : 'No foes nearby.'}</div>`;
	}

	/** in a fight the engaged foes, else the foes within 6 steps; nearest first */
	playerFoes(f) {
		const hero = f.hero;
		const foes = [];
		for (const c of frameCritters(f.cr)) {
			if (!(c.flags & 1)) continue;
			const d = Math.abs(c.x - hero.x) + Math.abs(c.y - hero.y);
			if (f.C ? !(c.flags & 2) : d > 6) continue;
			foes.push({ id: c.id, x: c.x, y: c.y, hp: c.hp, hpM: c.hpM, flags: c.flags, kind: this.critterKindOf(c), d });
		}
		foes.sort((a, b) => a.d - b.d);
		return foes;
	}

	playerFoeRow(fo) {
		const row = document.createElement('div');
		row.className = 'foe-row';
		row.append(this.critterIcon(fo.kind, fo.id, 22));
		const t = document.createElement('span');
		t.className = 'foe-text';
		const fr = fo.hpM > 0 ? fo.hp / fo.hpM : 0;
		t.innerHTML = `${esc(this.critterName(fo.kind, fo.id))} <span class="muted small">at ${fo.x},${fo.y}${fo.flags & 4 ? ' · sealed' : ''}</span><span class="hpbar"><span style="width:${Math.round(fr * 100)}%;background:${hpColor(fr)}"></span></span><span class="small">${fo.hp}/${fo.hpM}</span>`;
		row.append(t);
		return row;
	}

	onKey(e) {
		const r = this.result;
		if (!r || !r.frames || this.stale()) return;
		// form fields keep their keys (the script slider steps by itself)
		if (isFormField(e.target)) return;
		if (popupShown()) return;
		if (this.scriptKey(e)) e.preventDefault();
	}

	/** a script player shortcut: acts on it, and says whether the key was one */
	scriptKey(e) {
		switch (e.key) {
			case 'ArrowRight': if (e.shiftKey) this.jumpFight(1); else this.step(1); return true;
			case 'ArrowLeft': if (e.shiftKey) this.jumpFight(-1); else this.step(-1); return true;
			case 'PageDown': this.jumpFight(1); return true;
			case 'PageUp': this.jumpFight(-1); return true;
			case 'Home': this.setPos(0, { focus: true }); return true;
			case 'End': this.setPos(this.result.acts.length, { focus: true }); return true;
			case ' ':
				// Space on a focused button presses that button
				if (isButton(e.target)) return false;
				this.togglePlay();
				return true;
			default: return false;
		}
	}

	exportPlan() {
		const r = this.result;
		if (!r) return;
		const blob = new Blob([JSON.stringify(r.plan, null, 1)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `plan-${r.plan.dungeon.label || r.plan.dungeon.seed}-${r.plan.mode}.json`;
		document.body.append(a);
		a.click();
		setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}
}

/** the saved settings (localStorage nkd-solve) over the defaults */
function loadSettings() {
	let saved = {};
	try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
	const cfg = { ...DEFAULTS, ...saved, manual: { ...DEFAULTS.manual, ...(saved.manual || {}) } };
	if (!(cfg.budget in BUDGET_LABELS)) cfg.budget = 'normal';   // 'fast' and other old preset names
	return cfg;
}

function stripBytes(hero) {
	if (!hero || !hero.profile) return hero;
	const { bytes, ...p } = hero.profile;
	void bytes;
	return { ...hero, profile: p };
}

function heroSpecText(s) {
	if (!s) return 'hero';
	const parts = [`level ${s.level ?? '?'}`];
	if (s.gear) parts.push(`gear ${s.gear}`);
	if (s.kit2) parts.push('full kit'); else if (s.kit) parts.push('basic kit');
	if (s.skills) parts.push(`skills ${s.skills}`);
	if (s.mp != null) parts.push(`${s.mp} MP`);
	return `what-if hero: ${parts.join(', ')}`;
}

/** a div that works as a button: focusable, role="button" (onActivate wires it) */
function buttonDiv(className) {
	const el = document.createElement('div');
	el.className = className;
	el.tabIndex = 0;
	el.setAttribute('role', 'button');
	return el;
}

/** click, Enter and Space all run fn (for elements with role="button" and the like) */
function onActivate(el, fn) {
	if (!el) return;
	el.onclick = fn;
	el.onkeydown = (e) => { if (isActivateKey(e)) { e.preventDefault(); fn(); } };
}

/** 45000 -> "45 s", 150000 -> "2.5 min" */
function durText(ms) {
	const s = Math.max(1, Math.round(ms / 1000));
	return s < 90 ? `${s} s` : `${Math.round(s / 30) / 2} min`;
}

/** the level's creature with a plan enemy's id nearest to where the plan saw it */
function nearestCritter(level, e) {
	let best = null, bestDist = Infinity;
	if (level) for (const c of level.critters) {
		if (c.id !== e.id) continue;
		const d = Math.abs(c.x - e.x) + Math.abs(c.y - e.y);
		if (d < bestDist) { bestDist = d; best = c; }
	}
	return best;
}

/** monsters are drawn per id (js/view/sprites.js variants); other kinds have one look */
function spriteVariant(kind, id, level) {
	return critterVariant(kind, { id }, level);
}

/** a creature sprite (js/view/sprites.js) on a small DOM canvas */
function spriteIcon(kind, { variant, size, theme }) {
	const c = document.createElement('canvas');
	const dpr = window.devicePixelRatio || 1;
	c.width = Math.round(size * dpr);
	c.height = Math.round(size * dpr);
	c.style.width = `${size}px`;
	c.style.height = `${size}px`;
	c.className = 'sprite-icon';
	const ctx = c.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const horned = kind === 'boss' || kind === 'miniboss' || kind === 'unique' || kind === 'goldmonster' || kind === 'hero';
	const R = size * (horned ? 0.27 : 0.34);
	const hw = R * 32 / (SPRITE_R[kind] || 10);
	drawSprite(ctx, kind, size / 2, size / 2 + 0.72 * R, hw, { theme, dpr, variant });
	return c;
}

/** the progress line's first part, and the share of the fights decided when that is known (robust, once scouted) */
function phaseText(p, running) {
	switch (p.phase) {
		case 'workers': return { text: `Starting ${p.workers} workers…`, frac: null };
		case 'setup': return { text: 'Setting up the dungeon and the route…', frac: null };
		case 'scout': return { text: `Scouting the route: ${p.keys} fights to decide…`, frac: null };
		case 'encounter': return encounterPhaseText(p, running);
		case 'replay': return { text: 'Checking the script in a fresh engine…', frac: 0.97 };
		default: return { text: running.warm ? 'Starting…' : 'Loading the engine…', frac: null };
	}
}

function encounterPhaseText(p, running) {
	if (running.job.mode === 'robust' && running.keys) {
		return { text: `Fight ${p.k} of about ${Math.max(running.keys, p.k)}: ${tacticWords(p.tactic || '')}`, frac: clamp(p.k / running.keys, 0, 1) };
	}
	return { text: `Fight ${p.k}: ${tacticWords(p.tactic || '')}${p.searched ? ` (${p.searched} inputs searched)` : ''}`, frac: null };
}

/** the bar's fill (0–1): the fights decided when known, else the solve time against the expected time */
function progressFill(p, frac, { solving, budget }) {
	if (frac != null) return 0.08 + 0.9 * frac;
	if (p.phase === 'workers' || !p.phase) return 0.04;
	return clamp(solving / budget, 0.05, 0.95);
}

/** " · about 2 min left", " · taking longer than usual", or nothing */
function etaText(p, frac, clock) {
	const left = secondsLeft(p, frac, clock);
	if (left != null) return ` · about ${durText(left * 1000)} left`;
	return clock.solving >= clock.budget ? ' · taking longer than usual' : '';
}

function secondsLeft(p, frac, { solving, budget }) {
	if (frac != null && frac > 0.05 && p.phase === 'encounter') return solving * (1 - frac) / frac;
	if (p.phase && p.phase !== 'workers' && solving < budget) return budget - solving;
	return null;
}

/**
 * The exact script's walked trail for the map: the hero's start, then every input's cells (a ladder / portal is a
 * jump). trailUpto[p] is the trail's last point walked after p inputs.
 */
function walkedTrail(start, acts) {
	const trail = [{ x: start.x, y: start.y }];
	const trailUpto = [0];
	for (const a of acts) {
		if (a.path) for (const [x, y] of a.path) trail.push({ x, y });
		if (a.jump) { trail.push({ jump: true }); trail.push({ x: a.to.x, y: a.to.y }); }
		trailUpto.push(trail.length - 1);
	}
	return { trail, trailUpto };
}

/** the plan's MP top-ups; in an exact plan the script position decides which fight a top-up comes before */
function planTopUps(plan) {
	const topUps = Array.isArray(plan.mpTopUps) ? plan.mpTopUps.filter((u) => u && upAmount(u) > 0) : [];
	if (plan.mode !== 'exact') return topUps;
	return topUps.map((u) => {
		if (!Number.isInteger(u.atInput)) return u;
		const e = plan.encounters.find((x) => x.script && x.script.from >= u.atInput);
		return { ...u, beforeEncounter: e ? e.i : null };
	});
}

/** MP to solve puzzles for: the solver's figure, else its top-ups, else the interim mpNeeded, else need − start */
function mpShortfall(plan, topUps, { needed, need, start }) {
	if (typeof plan.mpToSolve === 'number') return plan.mpToSolve;
	if (topUps.length) return sumBy(topUps, upAmount);
	if (needed && typeof needed.short === 'number') return needed.short;
	return start != null ? Math.max(0, need - start) : 0;
}

function isMpPotion(id) {
	const it = V.Z1 && V.Z1.get(id);
	return it && it.Z > 0;
}

function pushTo(map, key, value) {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/**
 * The plan list in route order, [{ stop } | { enc }]: each stop, then its encounters. An encounter on no stop goes
 * before the first stop whose encounters come after it.
 */
function planListOrder(plan) {
	const items = [];
	const done = new Set();
	const unassigned = (plan.encounters || []).filter((e) => e.stop == null).map((e) => e.i);
	const flushBefore = (limit) => {
		for (const i of unassigned) if (!done.has(i) && i < limit) { items.push({ enc: i }); done.add(i); }
	};
	for (const s of plan.stops || []) {
		const first = s.encounters && s.encounters.length ? Math.min(...s.encounters) : Infinity;
		flushBefore(first);
		items.push({ stop: s.i });
		for (const i of s.encounters || []) { if (!done.has(i)) { items.push({ enc: i }); done.add(i); } }
	}
	flushBefore(Infinity);
	return items;
}

/** the plan's warnings (other than about MP, which has its own card) and the UI's plan check */
function warningsHtml(plan) {
	const warns = (plan.warnings || []).filter((w) => !/^mp/i.test(String(w.kind || '')));
	const list = warns.length ? `<div class="solve-warns">${warns.map((w) => `<div class="solve-note warn">${esc(w.text || w.kind)}</div>`).join('')}</div>` : '';
	const problems = plan.uiProblems && plan.uiProblems.length ? `<div class="solve-note warn">Plan check: ${esc(plan.uiProblems.join(', '))}</div>` : '';
	return list + problems;
}

/** the head of the stops and fights list (renderPlanList fills #plan-list) */
function routeHeadHtml() {
	return `<div class="content-header-2 solve-sub-head">Route and fights</div>
		<div class="small muted">Pins on the map: <span class="pin-key" style="background:${PIN.free}"></span>free <span class="pin-key" style="background:${PIN.mp}"></span>costs MP <span class="pin-key" style="background:${PIN.items}"></span>uses items <span class="pin-key" style="background:${PIN.death}"></span>deadly</div>
		<div class="plan-list" id="plan-list"></div>
		<div class="small muted solve-foot"><a id="solve-export">Download the plan (JSON)</a></div>`;
}

/** "what-if hero: level 21, gear 4, full kit · 64 samples · 8 workers · 19.2 s" */
function solvedHowText(r) {
	const plan = r.plan;
	const exact = plan.mode === 'exact';
	const dice = exact ? (plan.dungeon.at === 'save' ? 'from your save' : `xseed ${plan.dungeon.xseed}`) : `${plan.perf.samples} samples`;
	const replay = exact && plan.script && plan.script.replay ? ` · script ${plan.script.replay.matches ? 'replays identically' : 'DIFFERS on replay'}` : '';
	return `${esc(planHeroText(plan))} · ${dice} · ${plan.perf.workers} workers · ${num(r.wallMs / 1000, 1)} s${replay}`;
}

function planHeroText(plan) {
	if (plan.heroSpec && plan.heroSpec.profile) return `your hero ${(plan.heroSpec.profile.hero ?? 0) + 1}`;
	if (plan.dungeon.at === 'save') return 'your hero in the dungeon';
	return heroSpecText(plan.heroSpec);
}

/** whether a solve job uses the imported save: its hero, or (exact mode) its dungeon and dice */
function jobUsesSave(job) {
	return !!job.saveBytes || !!(job.hero && job.hero.profile);
}

/** whether the plan was made with the player's progress (their hero, or their save's dungeon) */
function planUsesProfile(plan) {
	return !!(plan.heroSpec && plan.heroSpec.profile) || plan.dungeon.at === 'save';
}

function foeTags(en) {
	const tags = [];
	if (en.seal) tags.push(`<span class="tag seal" title="Pay this much mental power to unseal it before it can be hurt">sealed ${en.seal >= 1000 ? '(cannot be hurt yet)' : `${en.seal} MP`}</span>`);
	if (en.ranged) tags.push(`<span class="tag" title="Throws from range">throws ×${en.ranged}</span>`);
	if (en.objective) tags.push('<span class="tag obj" title="Counts as an objective">objective</span>');
	return tags;
}

/** robust plans: the other groups of foes met at this fight in some of the runs */
function otherGroupsNote(e) {
	const n = e.samples || e.enemySets.reduce((a, s) => a + s.n, 0);
	const other = e.enemySets.slice(1, 3).map((s) => `${s.ids.join('+') || 'none'} (${s.n} of ${n})`).join(', ');
	const d = document.createElement('div');
	d.className = 'small muted';
	d.textContent = `Other groups met here: ${other}`;
	return d;
}

function encTactic(e) {
	const tac = document.createElement('div');
	tac.className = 'enc-tactic';
	tac.innerHTML = `<b>${esc(tacticWords(e.tactic))}.</b> ${esc(e.tactic.description || '')}${e.tactic.finish && e.tactic.finish !== e.tactic.label ? ` <span class="muted">Then: ${esc(tacticWords(e.tactic.finish))}.</span>` : ''}`;
	return tac;
}

/** what the fight costs: exact, with the hero after it; robust, expected with p95s and the death risk */
function encCost(plan, e) {
	const ex = e.expected || {};
	const cost = document.createElement('div');
	cost.className = 'enc-cost';
	cost.innerHTML = plan.mode === 'exact'
		? `${costBits(ex, null)}${e.after ? ` · <span class="muted">after: ${e.after.hp} HP, ${e.after.mp} MP</span>` : ''}${ex.pDeath ? ' · <b class="bad-text">dies</b>' : ''}${e.searched ? ` <span class="muted small">· ${e.searched} inputs searched${e.improved ? `, ${e.improved} better than the tactic` : ''}</span>` : ''}`
		: `${costBits(ex, ex.p95 || {})} · death ${pct(ex.pDeath)} <span class="muted small">· ${e.samples} runs${e.quick ? ' · quick set' : ''}</span>`;
	return cost;
}

/** "Compare tactics": each candidate's death risk, items, MP, and HP left (exact) or runs (robust) */
function encCompare(plan, e) {
	const det = document.createElement('details');
	det.className = 'enc-cmp';
	const rows = e.candidates.map((c) => candidateRow(plan, e, c)).join('');
	det.innerHTML = `<summary>Compare tactics (${e.candidates.length})</summary><table class="cmp"><thead><tr><th>Tactic</th><th>Death</th><th>Items</th><th>MP</th><th>${plan.mode === 'exact' ? 'HP left' : 'Runs'}</th></tr></thead><tbody>${rows}</tbody></table>`;
	return det;
}

function candidateRow(plan, e, c) {
	const exact = plan.mode === 'exact';
	const chosen = c.label === e.tactic.label;
	const note = c.same ? `= ${tacticWords(c.same)}` : c.pruned ? 'dropped' : '';
	return `<tr class="${chosen ? 'chosen' : ''}${c.pruned || c.same ? ' muted' : ''}" title="${esc(c.label)}${note ? ` · ${esc(note)}` : ''}"><td>${chosen ? '▸ ' : ''}${esc(tacticWords(c.label))}${note ? ` <span class="small">(${esc(note)})</span>` : ''}</td><td>${exact ? (c.pDeath ? 'dies' : 'ok') : pct(c.pDeath)}</td><td>${num(c.items, 2)}</td><td>${num(c.mp, 1)}</td><td>${exact ? (c.hpLeft ?? '–') : (c.n ?? '–')}</td></tr>`;
}

/** "<b>0.2</b> items (p95 1) · <b>12</b> MP · <b>3</b> HP lost": a p95 shows where it differs from the rounded mean */
function costBits(expected, p95) {
	const q = (k) => (p95 && p95[k] != null && p95[k] !== Math.round(expected[k]) ? ` <span class="muted small">(p95 ${p95[k]})</span>` : '');
	return `<b>${num(expected.items, 2)}</b> items${q('items')} · <b>${num(expected.mp, 1)}</b> MP${q('mp')} · <b>${num(expected.hpLost, 1)}</b> HP lost${q('hpLost')}`;
}

/** a frame's creatures (solve-host-main.js crittersOf: 9 numbers each) as records */
function frameCritters(cr) {
	const out = [];
	for (let i = 0; i < cr.length; i += 9) {
		const [id, x, y, hp, hpM, flags, g, h, k] = cr.slice(i, i + 9);
		out.push({ id, x, y, hp, hpM, flags, g, h, k });
	}
	return out;
}

function poolsHtml(f) {
	const H = f.hero;
	return `<span>HP <b>${H.hp}</b>/${H.hpM}</span><span>Energy <b>${H.ep}</b>/${H.epM}</span><span>MP <b>${H.mp}</b>/${H.mpM}</span>${f.C ? `<span>AP <b>${H.ap}</b></span>` : ''}`;
}

function hpColor(frac) {
	return frac > 0.5 ? '#3ec46d' : frac > 0.25 ? '#f0b429' : '#e5484d';
}

function isFormField(t) {
	return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function isButton(t) {
	return t && t.getAttribute && t.getAttribute('role') === 'button';
}

/** a popup (lib/utils Popup) is open: the page's keys are its */
function popupShown() {
	return document.querySelector('.popup-bounding') && [...document.querySelectorAll('.popup-bounding')].some((b) => b.style.opacity && +b.style.opacity > 0);
}

export { typeLabel };
