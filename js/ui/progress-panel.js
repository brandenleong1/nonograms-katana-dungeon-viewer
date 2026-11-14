// "Your progress": the player progress maps are built with, editable. For players without a save (set what you
// have done) and for what-ifs on top of an imported save. Only what dungeon generation reads is shown
// (js/gen/progress-reads.js): questlines with a slider each (js/ui/questlines.js), then bosses beaten and the
// items, buildings, and counts generation checks. The edits are overrides (absolute values per quest / bit / count) on top of the base, which is the
// new game or the imported save ("Use my progress for maps"); they are kept in localStorage (the save itself stays
// in sessionStorage, js/hero.js). Three buttons write the same overrides for everything at once: all quests done,
// all bosses beaten, or both (markQuestsDone, markBossesBeaten).
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
		this.notice = '';           // what the last "mark ... done" button did, until the next change
	}

	async render() {
		await this.loadNames();
		const box = document.querySelector('#progress-body');
		if (!box) return;
		const V = this.opts.hero.effectiveProfile().vj0;
		const type = this.opts.getType();
		if (!this.lines) this.lines = buildQuestlines(V, this.names);
		const focused = focusSelector(box);
		box.innerHTML = `${this.toolbarHtml()}${this.markHtml()}${this.previewHtml(V, type)}
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
		const choices = [['new', 'New game', 'Build on a new game'], ['save', 'Your save', hasSave ? 'Build on your imported save' : 'Import your save first (Your hero)']];
		const seg = `<div class="seg" role="radiogroup" aria-label="Using">${choices.map(([v, t, ti]) =>
			`<div class="button-positive-2 seg-btn${v === base ? ' selected' : ''}${v === 'save' && !hasSave ? ' disabled' : ''}" role="radio" aria-checked="${v === base}" tabindex="0" data-base="${v}" title="${esc(ti)}">${t}</div>`).join('')}</div>`;
		const count = nEdits ? `<span class="profile-badge custom">${nEdits} change${nEdits === 1 ? '' : 's'}</span>` : '<span class="muted small">No changes</span>';
		return `<div class="pg-toolbar">
			<span class="muted">Using</span>${seg}
			<span class="pg-count">${count}</span>
			<div class="button-positive-2 pg-reset${nEdits ? '' : ' disabled'}" role="button" tabindex="0" aria-disabled="${!nEdits}" data-clear title="Forget every change; keep using ${base === 'save' ? 'your save' : 'a new game'}">Clear changes</div>
		</div>`;
	}

	/** The "mark ... done" buttons, what the last one did, and what they leave alone. */
	markHtml() {
		const buttons = MARK_BUTTONS.map((b) =>
			`<div class="button-positive-2 pg-mark-btn" role="button" tabindex="0" data-mark="${b.key}" title="${esc(b.title)}">${b.text}</div>`).join('');
		const result = this.notice ? `<div class="pg-mark-result" role="status">${esc(this.notice)}</div>` : '';
		return `<div class="pg-mark">
			<div class="pg-mark-buttons" role="group" aria-label="Mark as done">${buttons}</div>
			${result}
			<div class="pg-help">Items, buildings, and counts stay as you set them. Quests normally need some bosses beaten first, so “Mark everything done” sets both.</div>
		</div>`;
	}

	previewHtml(V, type) {
		const lines = explain(V, type).map((r) => this.reasonHtml(r)).filter(Boolean);
		if (!explain(V, type).some((r) => r.kind === 'npc')) lines.unshift('No quest NPC.');
		const label = this.opts.getLabel() || typeLabel(type);
		return `<div class="pg-preview"><div class="solve-card-head">In ${esc(label)}</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
	}

	/** One line of the preview: why the current dungeon has (or lacks) a quest NPC, boss, guardian or merchants. */
	reasonHtml(r) {
		const quest = (id) => this.questHtml(id);
		if (r.kind === 'npc') {
			const p = r.person;
			const where = p && p.where === 'boss room' ? ' in the boss room' : p && p.where === 'entrance' ? ' at the entrance' : '';
			const extra = p && p.refs.length ? ` with ${p.refs.length} more ${p.refs.length === 1 ? 'person' : 'people'}` : '';
			const wagon = p && p.wagon ? ' and a wagon' : '';
			return `Quest NPC${p && p.npc ? ` <span class="muted">#${p.npc}</span>` : ''}${where}${extra}${wagon}, because ${quest(r.quest)} ${r.active ? 'is in progress' : 'can start here'}.`;
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

	// ---- the other progress: quest NPCs by dungeon, bosses, counts ----------------------------------------------------

	/** Each dungeon's quest NPC now (x30.O's pick), in the rows the game lists its dungeons in; ← here marks this one. */
	peopleHtml(V, type) {
		const rows = DUNGEON_ROWS.map((types) =>
			`<div class="pg-pick-row" role="group" aria-label="${typeLabel(types[0])} to ${typeLabel(types[types.length - 1])}">${types.map((t) => this.pickHtml(V, t, { here: t === type })).join('')}</div>`).join('');
		return `<div class="pg-section"><div class="content-header-2">Quest NPCs by dungeon</div>
			<div class="pg-help">Each dungeon has at most one quest NPC. With this progress, this is who you'll meet in each: one who gives you a quest, or one a quest in progress sends you to. If several quests qualify, the game picks one by its own fixed order. “← here” marks the dungeon on the map.</div>
			<div class="pg-picks">${rows}</div>
		</div>`;
	}

	/** One dungeon of the grid: its label, then who you meet there (or nobody). */
	pickHtml(V, t, { here }) {
		const p = questAt(V, t);
		const who = p ? `${this.questHtml(p.q.a)} <span class="muted">${p.active ? 'in progress' : 'can start'}</span>` : '<span class="muted">nobody</span>';
		const mark = here ? '<span class="pg-here" role="img" aria-label="this dungeon, the one on the map" title="The dungeon on the map">← here</span>' : '';
		const attrs = `${here ? ' aria-current="location"' : ''}${p ? ` title="quest ${p.q.a}"` : ''}`;
		return `<div class="pg-pick${here ? ' pg-cur' : ''}"${attrs}><div class="pg-pick-head"><b>${typeLabel(t)}</b>${mark}</div><div>${who}</div></div>`;
	}

	/** A quest's title in bold, as every quest name in the panel's sentences is shown. */
	questHtml(id) {
		return `<b>${esc(partTitle(id, this.names))}</b>`;
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
			<div class="pg-help">The 2C mini-boss appears while ${this.questHtml(27)} is in progress. Those of 3C, 4C, and 5C appear while ${this.questHtml(30)} is, each once the one before it is beaten. Each stays until you beat it.</div>
			<div class="pg-grid">${minis}</div>
		</div>`;
	}

	/** Items, building levels, and counters generation reads, each group with where the game shows it. */
	countsHtml(V) {
		const item = (id) => (this.names.items && this.names.items[id]) || `item ${id}`;
		const building = (id) => (this.names.buildings && this.names.buildings[id]) || `building ${id}`;
		const levels = [...buildingsQuestsNeed(V)].sort((a, b) => a[0] - b[0]).map(([id, need]) =>
			this.numHtml({ key: `bld:${id}`, label: `${building(id)} level`, value: V.o[id].B0, path: ['buildings', id, 'B0'], max: 99, note: `quests need ${need}` })).join('');
		const group = (title, where) => `<div class="sub-head">${title}</div><div class="pg-help">${where}</div>`;
		return `<div class="pg-section"><div class="content-header-2">Items, buildings, and counts</div>
			${group('Items', IN_GAME.items)}
			${this.numHtml({ key: 'item:114', label: item(114), value: V.L0_(114), path: ['items', 114], max: 99, noteHtml: `${this.questHtml(38)}: its NPC is in F1, one dungeon further per card (up to F4)` })}
			${this.checkHtml({ key: 'item:256', label: `Own a ${item(256)}`, on: V.L0_(256) > 0, path: ['items', 256], title: 'Changes only the 6C extra boss’s drop' })}
			${this.numHtml({ key: 'item:305', label: item(305), value: V.L0_(305), path: ['items', 305], max: 99, note: '2 or more: the tomb guardian drops something else' })}
			${group('Buildings', IN_GAME.buildings)}
			${levels}
			${this.checkHtml({ key: 'bstep:4:1', label: `${building(4)}: ${SHOP_TECHNOLOGY_2} researched`, on: V.o[4].h0_(2), path: ['buildings', 4, 'C0', 1], title: 'More finds in F3 and F4' })}
			${group('Counts', IN_GAME.counts)}
			${this.numHtml({ key: 'stat:b:115', label: `${item(115)} looted`, value: V.N.b.j_(115), path: ['stats', 'b', 115], max: 999, note: 'none (and 20 F4 dungeons cleared): a special NPC is likelier in F3 and F4' })}
			${this.numHtml({ key: 'stat:f:18', label: 'F4 dungeons cleared', value: V.N.f_(18), path: ['stats', 'f', 18], max: 9999 })}
			${this.numHtml({ key: 'stat:x', label: 'Persons rescued', value: V.N.x | 0, path: ['stats', 'x'], max: 9999, note: '3 or more: in 3B–4C, F3, EB, and EC a lost adventurer may be a fake (12%) that turns into a monster' })}
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

	/** A number field; its note is plain text (note) or already-escaped HTML (noteHtml). */
	numHtml({ key, label, value, path, max, note = '', noteHtml = esc(note) }) {
		const mark = this.changed(path) ? CHANGED_MARK : '';
		return `<div class="pg-num"><span>${esc(label)}${mark}</span><input type="number" min="0" max="${max}" step="1" value="${value}" data-n="${key}" aria-label="${esc(label)}">${noteHtml ? `<div class="pg-note">${noteHtml}</div>` : ''}</div>`;
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
		for (const el of box.querySelectorAll('[data-base]')) act(el, () => { if (el.dataset.base === 'save' && !H.profile) return; this.notice = ''; H.setUse(el.dataset.base === 'save'); });
		for (const el of box.querySelectorAll('[data-clear]')) act(el, () => { if (!H.edits.count()) return; this.notice = ''; H.resetEdits(H.use && H.profile ? 'save' : 'new'); });
		for (const el of box.querySelectorAll('[data-mark]')) act(el, () => this.mark(el.dataset.mark));
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

	/** One of the "mark ... done" buttons (MARK_BUTTONS): the same overrides the sliders and ticks write, for everything at once. */
	mark(which) {
		const marks = {
			quests: (o, V) => markedText({ quests: markQuestsDone(o, V, this.lines) }),
			bosses: (o, V) => markedText({ bosses: markBossesBeaten(o, V) }),
			all: (o, V) => markedText({ quests: markQuestsDone(o, V, this.lines), bosses: markBossesBeaten(o, V) }),
		};
		this.edit(marks[which]);
	}

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

	/**
	 * Run change(overrides, effective profile), drop overrides equal to the base, keep them, and regenerate. A change
	 * may return a sentence saying what it did; it stays under the "mark ... done" buttons until the next change.
	 */
	edit(change) {
		const H = this.opts.hero;
		const said = change(H.edits.o, H.effectiveProfile().vj0);
		this.notice = typeof said === 'string' ? said : '';
		H.edits.normalize(H.baseProfile());
		H.edits.save();
		H.progressChanged();
	}
}

const CHANGED_MARK = ' <span class="pg-changed" title="Changed from the base">●</span>';
const FOCUS_KEYS = ['bar', 'where', 'c', 'n', 'base', 'clear', 'mark'];

/**
 * The dungeons in the rows the game lists them in (its Statistics, kl0.J0): tombs, forest, floors 1 to 5, and caves.
 * Every dungeon is shown, with "nobody" where no quest NPC can be.
 */
const DUNGEON_ROWS = [[23, 24, 25, 26], [15, 16, 17, 18], [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [19, 20, 21, 22]];

/**
 * Where the game shows the values of "Items, buildings, and counts", by group, in its own words: the Adventurers Guild
 * page has the Warehouse and Depository grids (vj0.K and vj0.L: generation counts both), the Territory map whose
 * buildings open a window with "Level N" and Technologies (ni0.B0, C0), and the Other section with Statistics (pj0: the
 * "Loot!" list N.b, the Dungeon list N.f per dungeon, and Persons rescued N.x). From the game's layout guild.xml and kl0.J0.
 */
const IN_GAME = {
	items: 'In the game: Adventurers Guild → Warehouse (and Depository).',
	buildings: 'In the game: Adventurers Guild → Territory, tap a building: its level and Technologies.',
	counts: 'In the game: Adventurers Guild → Other → Statistics.',
};

/** The Shop's second technology (ni0 4, tj0 2), the step generation reads; data/names.json has no technology names. */
const SHOP_TECHNOLOGY_2 = 'Glass recycling';

/** The "mark ... done" buttons, in order: what `mark(key)` does, its label and a plain-words title. */
const MARK_BUTTONS = [
	{ key: 'quests', text: 'Mark all quests done', title: 'Move every questline to its end, all parts done. Bosses, items, buildings, and counts stay as they are.' },
	{ key: 'bosses', text: 'Mark all bosses beaten', title: 'Mark every boss and mini-boss as beaten. Quests, items, buildings, and counts stay as they are.' },
	{ key: 'all', text: 'Mark everything done', title: 'Move every questline to its end and mark every boss beaten. Items, buildings, and counts stay as they are.' },
];

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

/**
 * "Mark all quests done": every questline gets all its parts done, whatever it was at. Questlines already done are
 * left as they are. Writes overrides into o; returns { changed, already } in questlines.
 *
 * None has to stay behind: the game's start conditions (jj0.c) only ask for more progress (a quest started, a step
 * done, a quest done, a boss count, a building level) and finishing a quest takes nothing from another, so no
 * questlines exclude each other.
 */
export function markQuestsDone(o, V, lines) {
	const todo = lines.filter((line) => !partStates(V, line).every((state) => state === 'done'));
	for (const line of todo) for (const part of line.parts) writeQuestState(o, V.Y0_(part.id), 'done');
	return { changed: todo.length, already: lines.length - todo.length };
}

/**
 * "Mark all bosses beaten": every boss and mini-boss of the Bosses beaten list, that is the J0 bits (classic, forest,
 * caves) and the 2C–5C mini-boss flags in I0. Bosses already beaten are left as they are. Returns { changed, already }
 * in bosses.
 */
export function markBossesBeaten(o, V) {
	const flags = [...bossBits().map((b) => ['J0', b.bit]), ...MINI.map((m) => ['I0', m.bit])];
	const todo = flags.filter(([field, bit]) => !((V[field] >>> bit) & 1));
	for (const [field, bit] of todo) (o[field] = o[field] || {})[bit] = 1;
	return { changed: todo.length, already: flags.length - todo.length };
}

/**
 * The one-line result of a "mark ... done" button, from what markQuestsDone and markBossesBeaten returned (either may
 * be missing): "16 questlines moved to done. 30 bosses marked beaten."
 */
export function markedText({ quests, bosses }) {
	const results = [
		quests && { ...quests, one: 'questline', many: 'questlines', did: 'moved to done', was: 'done' },
		bosses && { ...bosses, one: 'boss', many: 'bosses', did: 'marked beaten', was: 'beaten' },
	].filter(Boolean);
	if (results.length > 1 && results.every((r) => !r.changed)) return 'Everything was already done.';
	return results.map(resultText).join(' ');
}

function resultText({ changed, already, one, many, did, was }) {
	const noun = (n) => (n === 1 ? one : many);
	if (!changed) return `All ${already} ${many} were already ${was}.`;
	const rest = already ? `; ${already} ${already === 1 ? 'was' : 'were'} already ${was}` : '';
	return `${changed} ${noun(changed)} ${did}${rest}.`;
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
	return `<ul class="pg-effects">${effects.map((e) => `<li><span class="pg-when">${esc(e.when)}:</span> ${piecesHtml(e.pieces)}</li>`).join('')}</ul>`;
}

/** An effect's words (js/ui/questlines.js pieces), escaped, with each quest title in bold. */
function piecesHtml(pieces) {
	return pieces.map((p) => (typeof p === 'string' ? esc(p) : `<b>${esc(p.quest)}</b>`)).join('');
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
