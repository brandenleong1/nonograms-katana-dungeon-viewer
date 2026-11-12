// "Your progress": the player progress maps are built with, editable. For players without a save (set what you
// have done) and for what-ifs on top of an imported save. Only what dungeon generation reads is shown
// (js/gen/progress-reads.js): questlines with a slider each (js/ui/questlines.js), then bosses beaten and the
// items, buildings and counts generation checks. The edits are overrides (absolute values per quest / bit / count) on top of the base, which is the
// new game or the imported save ("Use my progress for maps"); they are kept in localStorage (the save itself stays
// in sessionStorage, js/hero.js).
//
//   const edits = new ProgressEdits();       // localStorage 'nkd-progress'
//   edits.spec(base) -> progress spec (js/gen/progress-spec.js) that puts the overrides on profile `base`
//   new ProgressPanel({ hero, getType, getLabel }).render()   (the #popup-progress body)
import { readProgress } from '../gen/progress-spec.js';
import { npcQuests, questAt, explain, bossBits, MINI } from '../gen/progress-reads.js';
import { typeLabel } from '../labels.js';
import { buildQuestlines, partStates, positionOf, reachedPosition, statesAt, positionName, summarize, describeTypes, partTitle } from './questlines.js';

const KEY = 'nkd-progress';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** quests whose step bits (kj0.k0) the generator reads: bits shown as "step n" (bit n-1) */
const STEP_QUESTS = { 62: [2], 75: [0], 53: [0, 1, 2], 55: [0, 1, 2, 3, 4, 5, 6, 7, 8], 57: [0, 1], 70: [0, 1] };

// ---------------------------------------------------------------------------------------------------------------
// Overrides

/**
 * The user's progress edits: { quests: { id: [j0, k0] }, J0: { bit: 0|1 }, I0: { bit: 0|1 }, items: { id: n },
 * buildings: { id: { B0?, C0?: { bit: 0|1 } } }, stats: { x?, f?: { i: n }, b?: { id: n } } }. Absolute values, so
 * they mean the same on any base; bits are per bit so they sit on top of the base's other bits.
 */
export class ProgressEdits {
	constructor(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
		this.storage = storage;
		this.o = {};
		try {
			const x = storage && JSON.parse(storage.getItem(KEY) || 'null');
			if (x && x.v === 1 && x.o && typeof x.o === 'object') this.o = x.o;
		} catch { /* unreadable: start empty */ }
	}

	save() {
		if (!this.storage) return;
		try {
			if (this.empty()) this.storage.removeItem(KEY);
			else this.storage.setItem(KEY, JSON.stringify({ v: 1, o: this.o }));
		} catch (e) { console.warn('could not keep the progress edits:', e); }
	}

	empty() { return Object.keys(this.o).length === 0; }
	clear() { this.o = {}; this.save(); }

	/** the progress spec that puts these overrides on profile base */
	spec(base) {
		const o = this.o;
		const s = {};
		if (o.quests) s.quests = { ...o.quests };
		for (const f of ['J0', 'I0']) {
			if (!o[f]) continue;
			let v = base[f] | 0;
			for (const [b, on] of Object.entries(o[f])) v = on ? v | (1 << b) : v & ~(1 << b);
			s[f] = v | 0;
		}
		if (o.items) s.items = { ...o.items };
		if (o.buildings) {
			s.buildings = {};
			for (const [id, x] of Object.entries(o.buildings)) {
				const b = base.o[id];
				if (!b) continue;
				let c0 = b.C0 | 0;
				for (const [bit, on] of Object.entries(x.C0 || {})) c0 = on ? c0 | (1 << bit) : c0 & ~(1 << bit);
				s.buildings[id] = [x.B0 ?? b.B0, c0];
			}
		}
		if (o.stats) s.stats = JSON.parse(JSON.stringify(o.stats));
		return s;
	}

	/** drop overrides that equal base's values (so "custom" means "differs from the base") */
	normalize(base) {
		const o = this.o;
		const drop = (obj, k) => { delete obj[k]; };
		if (o.quests) for (const [id, [j0, k0]] of Object.entries(o.quests)) { const q = base.Y0_(+id); if (!q || ((q.j0 & 255) === j0 && (q.k0 & 255) === k0)) drop(o.quests, id); }
		for (const f of ['J0', 'I0']) if (o[f]) for (const [b, on] of Object.entries(o[f])) if (((base[f] >>> b) & 1) === (on ? 1 : 0)) drop(o[f], b);
		if (o.items) for (const [id, n] of Object.entries(o.items)) if (base.L0_(+id) === n) drop(o.items, id);
		if (o.buildings) {
			for (const [id, x] of Object.entries(o.buildings)) {
				const b = base.o[id];
				if (!b) { drop(o.buildings, id); continue; }
				if (x.B0 != null && x.B0 === b.B0) delete x.B0;
				if (x.C0) { for (const [bit, on] of Object.entries(x.C0)) if (((b.C0 >>> bit) & 1) === (on ? 1 : 0)) delete x.C0[bit]; if (!Object.keys(x.C0).length) delete x.C0; }
				if (!Object.keys(x).length) drop(o.buildings, id);
			}
		}
		if (o.stats) {
			const st = o.stats;
			if (st.x != null && st.x === (base.N.x | 0)) delete st.x;
			if (st.f) { for (const [i, n] of Object.entries(st.f)) if (base.N.f_(+i) === n) delete st.f[i]; if (!Object.keys(st.f).length) delete st.f; }
			if (st.b) { for (const [i, n] of Object.entries(st.b)) if (base.N.b.j_(+i) === n) delete st.b[i]; if (!Object.keys(st.b).length) delete st.b; }
		}
		for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k];
	}

	/** number of overridden values */
	count() {
		let n = 0;
		const walk = (x) => { for (const v of Object.values(x)) { if (v && typeof v === 'object' && !Array.isArray(v)) walk(v); else n++; } };
		walk(this.o);
		return n;
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Panel

export class ProgressPanel {
	/**
	 * opts: { hero (HeroPanel: baseProfile(), effectiveProfile(), edits, use, profile, setUse(on), resetEdits(base),
	 *         progressChanged()), getType(), getLabel() }
	 */
	constructor(opts) {
		this.opts = opts;
		this.names = null;
		this.lines = null;          // questlines (js/ui/questlines.js), built once the names are loaded
		this.openParts = new Set(); // questlines whose part list is unfolded, kept across re-renders
	}

	async render() {
		await this.loadNames();
		const box = document.querySelector('#progress-body');
		if (!box) return;
		const V = this.opts.hero.effectiveProfile().vj0;
		const type = this.opts.getType();
		if (!this.lines) this.lines = buildQuestlines(V, this.names);
		const focused = focusSelector(box);
		box.innerHTML = `${this.toolbarHtml()}${this.previewHtml(V, type)}
			<div class="pg-cols">
				<div class="pg-col pg-col-wide">${this.questlinesHtml(V, type)}</div>
				<div class="pg-col">${this.peopleHtml(V, type)}${this.bossesHtml(V)}${this.countsHtml(V)}</div>
			</div>`;
		this.wire(box);
		if (focused) box.querySelector(focused)?.focus();
	}

	async loadNames() {
		if (!this.names) this.names = await fetch('data/names.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
		return this.names;
	}

	// ---- top: where the progress starts from, and what it does to the current dungeon ---------------------------

	toolbarHtml() {
		const H = this.opts.hero;
		const hasSave = !!H.profile;
		const base = H.use && hasSave ? 'save' : 'new';
		const nEdits = H.edits.count();
		const choices = [['new', 'New game', 'Start from a new game'], ['save', 'Your save', hasSave ? 'Start from your imported save' : 'Import your save first (Your hero)']];
		const seg = `<div class="seg" role="radiogroup" aria-label="Start from">${choices.map(([v, t, ti]) =>
			`<div class="button-positive-2 seg-btn${v === base ? ' selected' : ''}${v === 'save' && !hasSave ? ' disabled' : ''}" role="radio" aria-checked="${v === base}" tabindex="0" data-base="${v}" title="${esc(ti)}">${t}</div>`).join('')}</div>`;
		const count = nEdits ? `<span class="profile-badge custom">${nEdits} change${nEdits === 1 ? '' : 's'}</span>` : '<span class="muted small">No changes</span>';
		return `<div class="pg-toolbar">
			<span class="muted">Start from</span>${seg}
			<div class="button-positive-2 pg-reset" data-reset="new" title="Forget every change and use a new game">Reset to new game</div>
			${hasSave ? '<div class="button-positive-2 pg-reset" data-reset="save" title="Forget every change and use your save">Reset to my save</div>' : ''}
			<span class="pg-count">${count}</span>
		</div>`;
	}

	previewHtml(V, type) {
		const lines = explain(V, type).map((r) => this.reasonHtml(r)).filter(Boolean);
		if (!explain(V, type).some((r) => r.kind === 'npc')) lines.unshift('No quest person.');
		const label = this.opts.getLabel() || typeLabel(type);
		return `<div class="pg-preview"><div class="solve-card-head">In ${esc(label)}</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
	}

	/** One line of the preview: why the current dungeon has (or lacks) a quest person, boss, guardian or merchants. */
	reasonHtml(r) {
		const quest = (id) => `<b>${esc(partTitle(id, this.names))}</b>`;
		if (r.kind === 'npc') {
			const p = r.person;
			const where = p && p.where === 'boss room' ? ' in the boss room' : p && p.where === 'entrance' ? ' at the entrance' : '';
			const extra = p && p.refs.length ? ` with ${p.refs.length} more ${p.refs.length === 1 ? 'person' : 'people'}` : '';
			const wagon = p && p.wagon ? ' and a wagon' : '';
			return `Quest person${p && p.npc ? ` <span class="muted">#${p.npc}</span>` : ''}${where}${extra}${wagon}, because ${quest(r.quest)} ${r.active ? 'is in progress' : 'can start here'}.`;
		}
		if (r.kind === 'mini') return `A mini-boss, because ${quest(r.quest)} is in progress and this mini-boss is not beaten.`;
		if (r.kind === 'boss2') return `A second boss <span class="muted">#${r.boss}</span>, because ${quest(r.quest)} is in progress.`;
		if (r.kind === 'companion') return r.on ? `The boss brings a companion <span class="muted">#${r.companion}</span> (boss not beaten).` : 'The boss comes without its companion.';
		if (r.kind === 'unique') return r.on ? `The tomb guardian is here, because ${quest(73)} has started.` : `No tomb guardian: ${quest(73)} has not started.`;
		if (r.kind === 'merchant') return r.on ? 'Merchants can appear.' : `No merchants: ${quest(48)} has not started.`;
		return '';
	}

	// ---- questlines ----------------------------------------------------------------------------------------------

	/** The questline cards: those that change the current dungeon first. */
	questlinesHtml(V, type) {
		const changesHere = (line) => line.types.map.includes(type) || line.types.loot.includes(type);
		const here = this.lines.filter(changesHere);
		const others = this.lines.filter((line) => !changesHere(line));
		const group = (title, lines) => (lines.length ? `<div class="sub-head">${title}</div><div class="pg-lines">${lines.map((l) => this.lineHtml(V, l)).join('')}</div>` : '');
		return `<div class="pg-group">Questlines</div>
			<div class="pg-help">Set how far you are in each questline: click a part, or pick from the list. Only questlines that change dungeons are here.</div>
			${group(`Change ${esc(typeLabel(type))}`, here)}${group(here.length ? 'Other questlines' : 'All questlines', others)}`;
	}

	lineHtml(V, line) {
		const states = partStates(V, line);
		const changed = line.parts.some((p) => this.changed(['quests', p.id]));
		const head = `<div class="pg-line-head"><span class="pg-line-name">${esc(line.name)}${changed ? CHANGED_MARK : ''}</span>${line.parts.length > 1 ? `<span class="pg-line-count">${line.parts.length} parts</span>` : ''}</div>`;
		const body = line.parts.length === 1 ? this.singlePartHtml(V, line.parts[0], states[0]) : this.multiPartHtml(V, line, states);
		return `<div class="pg-line">${head}<div class="pg-line-where">${esc(whereText(line.types))}</div>${body}</div>`;
	}

	singlePartHtml(V, part, state) {
		return `${this.stateSegHtml(part, state)}${effectsHtml(part.effects)}${this.subStepsHtml(V, part)}`;
	}

	multiPartHtml(V, line, states) {
		const position = positionOf(states);
		const open = this.openParts.has(line.key) ? ' open' : '';
		return `${this.barHtml(line, states, position)}
			<div class="pg-line-sum">${esc(summarize(states))}</div>
			${this.positionSelectHtml(line, position)}
			<details class="pg-parts" data-parts="${line.key}"${open}><summary>What each part changes</summary>
				<ol>${line.parts.map((p, i) => this.partHtml(V, p, states[i])).join('')}</ol>
			</details>`;
	}

	/** The slider: one segment per part, coloured done / in progress / not started. */
	barHtml(line, states, position) {
		const reached = position >= 0 ? position : reachedPosition(states);
		const segs = line.parts.map((p, i) => {
			const next = states[i] === 'active' ? 'mark it done' : 'set it in progress';
			return `<div class="pg-bar-seg ${states[i]}" data-line="${line.key}" data-part="${i}" title="Part ${p.number}: ${STATE_TEXT[states[i]]}. Click to ${next}.">${p.number}</div>`;
		}).join('');
		return `<div class="pg-bar" role="slider" tabindex="0" data-bar="${line.key}" aria-label="${esc(line.name)}: how far you are"
			aria-valuemin="0" aria-valuemax="${2 * line.parts.length}" aria-valuenow="${reached}" aria-valuetext="${esc(position >= 0 ? positionName(line, position) : summarize(states))}">${segs}</div>`;
	}

	positionSelectHtml(line, position) {
		const options = Array.from({ length: 2 * line.parts.length + 1 }, (_, pos) =>
			`<option value="${pos}"${pos === position ? ' selected' : ''}>${esc(positionName(line, pos))}</option>`);
		if (position < 0) options.unshift('<option value="-1" selected disabled>Parts out of order: see below</option>');
		return `<label class="pg-where"><span>Where are you?</span><select data-where="${line.key}">${options.join('')}</select></label>`;
	}

	partHtml(V, part, state) {
		return `<li class="pg-part ${state}">
			<div class="pg-part-head"><span class="pg-part-name" title="quest ${part.id}">Part ${part.number}</span>${this.stateSegHtml(part, state)}</div>
			${effectsHtml(part.effects)}${this.subStepsHtml(V, part)}
		</li>`;
	}

	/** Not started / In progress / Done for one quest. */
	stateSegHtml(part, state) {
		const choices = [['none', 'Not started'], ['active', 'In progress'], ['done', 'Done']];
		return `<div class="seg pg-seg" role="radiogroup" aria-label="${esc(partTitle(part.id, this.names))}">${choices.map(([v, t]) =>
			`<div class="button-positive-2 seg-btn${v === state ? ' selected' : ''}" role="radio" aria-checked="${v === state}" tabindex="0" data-q="${part.id}" data-st="${v}">${t}</div>`).join('')}</div>`;
	}

	/** The step bits (kj0.k0) generation reads for this quest, as checkboxes. */
	subStepsHtml(V, part) {
		const bits = STEP_QUESTS[part.id];
		if (!bits) return '';
		const k0 = V.Y0_(part.id).k0 & 255;
		return `<div class="pg-steps">${bits.map((b) => this.checkHtml({ key: `q:${part.id}:${b}`, label: `step ${b + 1} done`, on: (k0 >> b) & 1 })).join('')}</div>`;
	}

	// ---- the other progress: quest people now, bosses, counts ----------------------------------------------------

	/** Who each dungeon gets now (x30.O's pick), for the dungeons any quest person can be in. */
	peopleHtml(V, type) {
		const npcs = npcQuests(V);
		const picks = [];
		for (let t = 0; t < 27; t++) {
			if (!npcs.some((q) => q.types.includes(t))) continue;
			const p = questAt(V, t);
			const who = p ? `${esc(partTitle(p.q.a, this.names))} <span class="muted">${p.active ? 'in progress' : 'can start'}</span>` : '<span class="muted">nobody</span>';
			picks.push(`<div class="pg-pick${t === type ? ' pg-cur' : ''}"${p ? ` title="quest ${p.q.a}"` : ''}><b>${typeLabel(t)}</b> <span>${who}</span></div>`);
		}
		return `<div class="pg-section"><div class="content-header-2">Quest people now</div>
			<div class="pg-help">A dungeon gets the person of the first quest (in the game's order) that is in progress there or can start there.</div>
			<div class="pg-picks">${picks.join('')}</div>
		</div>`;
	}

	bossesHtml(V) {
		const fam = (t) => (t >= 23 ? 3 : t >= 19 ? 2 : t >= 15 ? 1 : 0);
		const bits = bossBits();
		const grid = (family, title) => {
			const boxes = bits.filter((b) => fam(b.type) === family).map((b) =>
				this.checkHtml({ key: `J0:${b.bit}`, label: `${typeLabel(b.type)}${b.minor ? ' mini' : ''}`, on: (V.J0 >>> b.bit) & 1, path: ['J0', b.bit], title: `J0 bit ${b.bit}` })).join('');
			return `<div class="sub-head">${title}</div><div class="pg-grid">${boxes}</div>`;
		};
		const minis = MINI.map((m) => this.checkHtml({ key: `I0:${m.bit}`, label: typeLabel(m.type), on: (V.I0 >>> m.bit) & 1, path: ['I0', m.bit], title: `I0 bit ${m.bit}` })).join('');
		return `<div class="pg-section"><div class="content-header-2">Bosses beaten</div>
			<div class="pg-help">Until you beat it, the boss of 1C brings a companion; so can the bosses of 6C and EA, depending on questlines. Otherwise a boss you haven't beaten only carries a different drop.</div>
			${grid(0, 'Dungeons')}${grid(1, 'Forest (boss and mini-boss)')}${grid(2, 'Caves')}
			<div class="sub-head">Mini-bosses of 2C–5C</div>
			<div class="pg-help">They appear while ${esc(partTitle(27, this.names))} or ${esc(partTitle(30, this.names))} is in progress, until you beat them.</div>
			<div class="pg-grid">${minis}</div>
		</div>`;
	}

	countsHtml(V) {
		const item = (id) => (this.names.items && this.names.items[id]) || `item ${id}`;
		const building = (id) => (this.names.buildings && this.names.buildings[id]) || `building ${id}`;
		const levels = [...buildingsQuestsNeed(V)].sort((a, b) => a[0] - b[0]).map(([id, need]) =>
			this.numHtml({ key: `bld:${id}`, label: `${building(id)} level`, value: V.o[id].B0, path: ['buildings', id, 'B0'], max: 99, note: `quests need ${need}` })).join('');
		return `<div class="pg-section"><div class="content-header-2">Items, buildings and counts</div>
			${this.numHtml({ key: 'item:114', label: item(114), value: V.L0_(114), path: ['items', 114], max: 99, note: `${partTitle(38, this.names)}: its person is in F1, one dungeon further per card (up to F4)` })}
			${this.checkHtml({ key: 'item:256', label: `Own a ${item(256)}`, on: V.L0_(256) > 0, path: ['items', 256], title: 'Changes only the 6C extra boss’s drop' })}
			${this.numHtml({ key: 'item:305', label: item(305), value: V.L0_(305), path: ['items', 305], max: 99, note: '2 or more: the tomb guardian drops something else' })}
			${levels}
			${this.checkHtml({ key: 'bstep:4:1', label: `${building(4)}: step 2 done`, on: V.o[4].h0_(2), path: ['buildings', 4, 'C0', 1], title: 'More finds in F3 and F4' })}
			${this.numHtml({ key: 'stat:b:115', label: `${item(115)}s found`, value: V.N.b.j_(115), path: ['stats', 'b', 115], max: 999, note: 'none (and 20 F4 dungeons cleared): a special person is likelier in F3 and F4' })}
			${this.numHtml({ key: 'stat:f:18', label: 'F4 dungeons cleared', value: V.N.f_(18), path: ['stats', 'f', 18], max: 9999 })}
			${this.numHtml({ key: 'stat:x', label: 'Trades with merchants', value: V.N.x | 0, path: ['stats', 'x'], max: 9999, note: '3 or more: one more dice roll in 3A–4B, F3, EB and EC' })}
		</div>`;
	}

	// ---- controls --------------------------------------------------------------------------------------------------

	/** Whether the edits override the value at path (e.g. ['quests', 30]). */
	changed(path) {
		let x = this.opts.hero.edits.o;
		for (const k of path) {
			if (x == null || typeof x !== 'object') return false;
			x = x[k];
		}
		return x !== undefined;
	}

	checkHtml({ key, label, on, path, title = '' }) {
		const mark = path && this.changed(path) ? CHANGED_MARK : '';
		return `<div class="layer-row pg-check" role="checkbox" tabindex="0" aria-checked="${!!on}" data-c="${key}"${title ? ` title="${esc(title)}"` : ''}><div class="checkbox${on ? ' selected' : ''}"></div><span>${esc(label)}${mark}</span></div>`;
	}

	numHtml({ key, label, value, path, max, note = '' }) {
		const mark = this.changed(path) ? CHANGED_MARK : '';
		return `<div class="pg-num"><span>${esc(label)}${mark}</span><input type="number" min="0" max="${max}" step="1" value="${value}" data-n="${key}" aria-label="${esc(label)}">${note ? `<div class="pg-note">${esc(note)}</div>` : ''}</div>`;
	}

	wire(box) {
		const H = this.opts.hero;
		const act = (el, fn) => {
			el.onclick = fn;
			el.onkeydown = (e) => {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				fn();
			};
		};
		for (const el of box.querySelectorAll('[data-q][data-st]')) act(el, () => this.setQuest(+el.dataset.q, el.dataset.st));
		for (const el of box.querySelectorAll('[data-c]')) act(el, () => this.setCheck(el.dataset.c, el.getAttribute('aria-checked') !== 'true'));
		for (const el of box.querySelectorAll('input[data-n]')) el.onchange = () => this.setNumber(el.dataset.n, el.value);
		for (const el of box.querySelectorAll('.pg-bar-seg')) el.onclick = () => this.clickPart(+el.dataset.line, +el.dataset.part);
		for (const el of box.querySelectorAll('[data-bar]')) el.onkeydown = (e) => this.slideByKey(e, +el.dataset.bar);
		for (const el of box.querySelectorAll('select[data-where]')) el.onchange = () => this.setPosition(+el.dataset.where, +el.value);
		for (const el of box.querySelectorAll('details[data-parts]')) el.ontoggle = () => this.rememberOpen(+el.dataset.parts, el.open);
		for (const el of box.querySelectorAll('[data-base]')) act(el, () => { if (el.dataset.base === 'save' && !H.profile) return; H.setUse(el.dataset.base === 'save'); });
		for (const el of box.querySelectorAll('[data-reset]')) act(el, () => H.resetEdits(el.dataset.reset));
	}

	rememberOpen(key, open) {
		if (open) this.openParts.add(key);
		else this.openParts.delete(key);
	}

	/** Arrow keys move one position, Page Up / Down a whole part, Home / End to the ends. */
	slideByKey(e, key) {
		const line = this.lineByKey(key);
		const states = partStates(this.opts.hero.effectiveProfile().vj0, line);
		const now = reachedPosition(states);
		const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 2, PageDown: -2 };
		const to = e.key === 'Home' ? 0 : e.key === 'End' ? 2 * line.parts.length : steps[e.key] != null ? now + steps[e.key] : null;
		if (to == null) return;
		e.preventDefault();
		this.setPosition(key, Math.max(0, Math.min(2 * line.parts.length, to)));
	}

	/** Clicking a part sets it in progress (the parts before it done); clicking it again marks it done. */
	clickPart(key, index) {
		const line = this.lineByKey(key);
		const states = partStates(this.opts.hero.effectiveProfile().vj0, line);
		const inProgressHere = positionOf(states) === 2 * index + 1;
		this.setPosition(key, inProgressHere ? 2 * index + 2 : 2 * index + 1);
	}

	lineByKey(key) {
		return this.lines.find((l) => l.key === key);
	}

	// ---- edits: each control change becomes an override on the base, then the map is rebuilt ----------------------

	setPosition(key, position) {
		const line = this.lineByKey(key);
		if (!line || position < 0) return;
		const states = statesAt(line, position);
		this.edit((o, V) => line.parts.forEach((p, i) => writeQuestState(o, V.Y0_(p.id), states[i])));
	}

	setQuest(id, state) {
		this.edit((o, V) => writeQuestState(o, V.Y0_(id), state));
	}

	setCheck(key, on) {
		const [kind, a, b] = key.split(':');
		this.edit((o, V) => {
			if (kind === 'q') {
				const q = V.Y0_(+a);
				const k0 = on ? (q.k0 & 255) | (1 << b) : (q.k0 & 255) & ~(1 << b);
				(o.quests = o.quests || {})[a] = [q.j0 & 255, k0];
			} else if (kind === 'J0' || kind === 'I0') {
				(o[kind] = o[kind] || {})[a] = on ? 1 : 0;
			} else if (kind === 'item') {
				(o.items = o.items || {})[a] = on ? 1 : 0;
			} else if (kind === 'bstep') {
				const building = ((o.buildings = o.buildings || {})[a] = o.buildings[a] || {});
				(building.C0 = building.C0 || {})[b] = on ? 1 : 0;
			}
		});
	}

	setNumber(key, value) {
		const n = Math.max(0, Math.min(9999, Math.round(Number(value) || 0)));
		const [kind, a, b] = key.split(':');
		this.edit((o) => {
			if (kind === 'item') (o.items = o.items || {})[a] = n;
			else if (kind === 'bld') ((o.buildings = o.buildings || {})[a] = o.buildings[a] || {}).B0 = n;
			else if (kind === 'stat' && a === 'x') (o.stats = o.stats || {}).x = n;
			else if (kind === 'stat') (((o.stats = o.stats || {})[a] = o.stats[a] || {}))[b] = n;
		});
	}

	/** Run change(overrides, effective profile), drop overrides equal to the base, keep them, and regenerate. */
	edit(change) {
		const H = this.opts.hero;
		change(H.edits.o, H.effectiveProfile().vj0);
		H.edits.normalize(H.baseProfile());
		H.edits.save();
		H.progressChanged();
	}
}

const CHANGED_MARK = ' <span class="pg-changed" title="Changed from the base">●</span>';
const FOCUS_KEYS = ['bar', 'where', 'c', 'n', 'base', 'reset'];

/** A selector that finds the focused control again after the panel is re-rendered (or null). */
function focusSelector(box) {
	const el = document.activeElement;
	if (!el || !box.contains(el)) return null;
	if (el.dataset.q) return `[data-q="${el.dataset.q}"][data-st="${el.dataset.st}"]`;
	const key = FOCUS_KEYS.find((k) => el.dataset[k] != null);
	return key ? `[data-${key}="${el.dataset[key]}"]` : null;
}
const STATE_TEXT = { none: 'not started', active: 'in progress', done: 'done' };

/** Set a quest to none / active / done, keeping its other j0 bits and its step bits. */
function writeQuestState(o, q, state) {
	const bits = { none: 0, active: 16, done: 128 }[state];
	(o.quests = o.quests || {})[q.a] = [((q.j0 & 255) & ~144) | bits, q.k0 & 255];
}

/** "Map: 2C, F1–F4 · drops: 6C" */
function whereText(types) {
	const parts = [];
	if (types.map.length) parts.push(`Map: ${describeTypes(types.map)}`);
	if (types.loot.length) parts.push(`${parts.length ? 'drops' : 'Drops'}: ${describeTypes(types.loot)}`);
	return parts.join(' · ');
}

function effectsHtml(effects) {
	if (!effects.length) return '<div class="pg-note">Changes no dungeon.</div>';
	return `<ul class="pg-effects">${effects.map((e) => `<li><span class="pg-when">${esc(e.when)}:</span> ${esc(e.text)}</li>`).join('')}</ul>`;
}

/** Building levels the quest people's start conditions check: id -> the highest level any of them needs. */
function buildingsQuestsNeed(V) {
	const npcIds = new Set(npcQuests(V).map((q) => q.id));
	const need = new Map();
	for (const q of V.k) {
		if (!npcIds.has(q.a)) continue;
		for (const c of [q.H, q.I, q.J, q.K]) {
			if (c && c.m !== 0 && c.l) need.set(c.l, Math.max(need.get(c.l) || 0, c.m < 0 ? V.o[c.l].e.length : c.m));
		}
	}
	return need;
}

/** "custom" when the overrides change something, else "save" / "new" */
export function basisOf(hero) {
	if (!hero) return 'new';
	if (!hero.edits.empty()) return 'custom';
	return hero.use && hero.profile ? 'save' : 'new';
}

export const BASIS_TEXT = { new: 'New game', save: 'Your progress', custom: 'Custom progress' };

export { readProgress };
