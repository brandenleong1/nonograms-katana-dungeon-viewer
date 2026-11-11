// "Your progress": the player progress maps are built with, editable. For players without a save (set what you
// have done) and for what-ifs on top of an imported save. Only what dungeon generation reads is shown
// (js/gen/progress-reads.js), grouped by what it changes: the map (people, bosses, merchants, decorations) or
// only the loot. The edits are overrides (absolute values per quest / bit / count) on top of the base, which is the
// new game or the imported save ("Use my progress for maps"); they are kept in localStorage (the save itself stays
// in sessionStorage, js/hero.js).
//
//   const edits = new ProgressEdits();       // localStorage 'nkd-progress'
//   edits.spec(base) -> progress spec (js/gen/progress-spec.js) that puts the overrides on profile `base`
//   new ProgressPanel({ hero, getType, getLabel, onChange }).render()   (the #popup-progress body)
import { stateName, readProgress } from '../gen/progress-spec.js';
import { npcQuests, questAt, questPerson, explain, bossBits, MINI } from '../gen/progress-reads.js';
import { typeLabel } from '../labels.js';

const KEY = 'nkd-progress';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typeList = (ts) => ts.map(typeLabel).join(', ');

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
	 * opts: { hero (HeroPanel: baseProfile(), effectiveProfile(), edits, use, profile, setUse(on), resetEdits(base)),
	 *         getType(), getLabel(), onChange() }
	 */
	constructor(opts) {
		this.opts = opts;
		this.names = null;
	}

	async loadNames() {
		if (!this.names) this.names = await fetch('data/names.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
		return this.names;
	}

	// ---- names -------------------------------------------------------------------------------------------------
	/** "Once Upon a Forest 3" (quests sharing a name get their part number), title "quest 30" */
	questName(id) {
		const N = (this.names && this.names.quests) || {};
		const name = N[id] || `Quest ${id}`;
		if (!this._parts) {
			this._parts = {};
			const by = {};
			for (const [k, v] of Object.entries(N)) (by[v] = by[v] || []).push(+k);
			for (const ids of Object.values(by)) if (ids.length > 1) ids.sort((a, b) => a - b).forEach((q, i) => { this._parts[q] = i + 1; });
		}
		return this._parts[id] ? `${name} ${this._parts[id]}` : name;
	}
	itemName(id) { return (this.names && this.names.items && this.names.items[id]) || `item ${id}`; }
	buildingName(id) { return (this.names && this.names.buildings && this.names.buildings[id]) || `building ${id}`; }

	// ---- controls ----------------------------------------------------------------------------------------------
	changed(path) {
		const o = this.opts.hero.edits.o;
		let x = o;
		for (const k of path) { if (x == null || typeof x !== 'object') return false; x = x[k]; }
		return x !== undefined;
	}
	mark(path) { return this.changed(path) ? ' <span class="pg-changed" title="Changed from the base">●</span>' : ''; }

	questRow(V, id, note = '') {
		const q = V.Y0_(id);
		if (!q) return '';
		const st = stateName(q.j0);
		const opts = [['none', 'Not started'], ['active', 'Active'], ['done', 'Done']];
		const seg = `<div class="seg pg-seg" role="radiogroup" aria-label="${esc(this.questName(id))}">${opts.map(([v, t]) =>
			`<div class="button-positive-2 seg-btn${v === st ? ' selected' : ''}" role="radio" aria-checked="${v === st}" tabindex="0" data-q="${id}" data-st="${v}">${t}</div>`).join('')}</div>`;
		const steps = STEP_QUESTS[id] ? `<div class="pg-steps">${STEP_QUESTS[id].map((b) => this.check(`q:${id}:${b}`, `step ${b + 1}`, ((q.k0 & 255) >> b) & 1, ['quests', id])).join('')}</div>` : '';
		return `<div class="pg-row"><div class="pg-head"><span class="pg-name" title="quest ${id}">${esc(this.questName(id))}${this.mark(['quests', id])}</span>${seg}</div>${note ? `<div class="pg-note">${note}</div>` : ''}${steps}</div>`;
	}

	check(key, label, on, path, title = '') {
		return `<div class="layer-row pg-check" role="checkbox" tabindex="0" aria-checked="${!!on}" data-c="${key}"${title ? ` title="${esc(title)}"` : ''}><div class="checkbox${on ? ' selected' : ''}"></div><span>${esc(label)}${path ? this.mark(path) : ''}</span></div>`;
	}

	num(key, label, value, path, max = 999, note = '') {
		return `<div class="pg-num"><span>${esc(label)}${this.mark(path)}</span><input type="number" min="0" max="${max}" step="1" value="${value}" data-n="${key}" aria-label="${esc(label)}">${note ? `<div class="pg-note">${note}</div>` : ''}</div>`;
	}

	// ---- edits -------------------------------------------------------------------------------------------------
	/** apply one control change to the overrides (relative to the base), then regenerate */
	set(kind, key, value) {
		const H = this.opts.hero;
		const base = H.baseProfile();
		const o = H.edits.o;
		const V = H.effectiveProfile().vj0;
		if (kind === 'q') {
			// state: keep the quest's other j0 bits and its steps
			const q = V.Y0_(+key);
			const bits = { none: 0, active: 16, done: 128 }[value];
			const j0 = ((q.j0 & 255) & ~144) | bits;
			(o.quests = o.quests || {})[key] = [j0, q.k0 & 255];
		} else if (kind === 'c') {
			const [k, a, b] = key.split(':');
			if (k === 'q') {
				const q = V.Y0_(+a);
				const k0 = value ? (q.k0 & 255) | (1 << b) : (q.k0 & 255) & ~(1 << b);
				(o.quests = o.quests || {})[a] = [q.j0 & 255, k0];
			} else if (k === 'J0' || k === 'I0') {
				(o[k] = o[k] || {})[a] = value ? 1 : 0;
			} else if (k === 'item') {
				(o.items = o.items || {})[a] = value ? 1 : 0;
			} else if (k === 'bstep') {
				const bo = (o.buildings = o.buildings || {});
				const x = (bo[a] = bo[a] || {});
				(x.C0 = x.C0 || {})[b] = value ? 1 : 0;
			}
		} else if (kind === 'n') {
			const n = Math.max(0, Math.min(9999, Math.round(Number(value) || 0)));
			const [k, a, b] = key.split(':');
			if (k === 'item') (o.items = o.items || {})[a] = n;
			else if (k === 'bld') { const bo = (o.buildings = o.buildings || {}); (bo[a] = bo[a] || {}).B0 = n; }
			else if (k === 'stat') {
				const st = (o.stats = o.stats || {});
				if (a === 'x') st.x = n;
				else (st[a] = st[a] || {})[b] = n;
			}
		}
		H.edits.normalize(base);
		H.edits.save();
		H.progressChanged();
	}

	// ---- render ------------------------------------------------------------------------------------------------
	async render() {
		await this.loadNames();
		const box = document.querySelector('#progress-body');
		if (!box) return;
		const H = this.opts.hero;
		const eff = H.effectiveProfile();
		const V = eff.vj0;
		const type = this.opts.getType();
		const label = this.opts.getLabel();
		const hasSave = !!H.profile;
		const base = H.use && hasSave ? 'save' : 'new';
		const nEdits = H.edits.count();

		// toolbar
		const seg = `<div class="seg" role="radiogroup" aria-label="Start from">${[['new', 'New game', 'Start from a new game'], ['save', 'Your save', hasSave ? 'Start from your imported save' : 'Import your save first (Your hero)']].map(([v, t, ti]) =>
			`<div class="button-positive-2 seg-btn${v === base ? ' selected' : ''}${v === 'save' && !hasSave ? ' disabled' : ''}" role="radio" aria-checked="${v === base}" tabindex="0" data-base="${v}" title="${esc(ti)}">${t}</div>`).join('')}</div>`;
		const toolbar = `<div class="pg-toolbar">
			<span class="muted">Start from</span>${seg}
			<div class="button-positive-2 pg-reset" data-reset="new" title="Forget every change and use a new game">Reset to new game</div>
			${hasSave ? '<div class="button-positive-2 pg-reset" data-reset="save" title="Forget every change and use your save">Reset to my save</div>' : ''}
			<span class="pg-count">${nEdits ? `<span class="profile-badge custom">${nEdits} change${nEdits === 1 ? '' : 's'}</span>` : '<span class="muted small">No changes</span>'}</span>
		</div>`;

		// preview for the current label
		const preview = this.previewHtml(V, type, label);

		// changes the map
		const npcs = npcQuests(V);
		const fam = (t) => (t >= 23 ? 3 : t >= 19 ? 2 : t >= 15 ? 1 : 0);
		const FAM = ['Dungeons 1A–5C', 'Forest F1–F4', 'Caves 6A–6D', 'Tombs EA–ED'];
		const picks = [];
		for (let t = 0; t < 27; t++) {
			if (!npcs.some((q) => q.types.includes(t))) continue;
			const p = questAt(V, t);
			const cur = t === type ? ' pg-cur' : '';
			picks.push(`<div class="pg-pick${cur}" title="${p ? `quest ${p.q.a}` : ''}"><b>${typeLabel(t)}</b> <span>${p ? `${esc(this.questName(p.q.a))} <span class="muted">${p.active ? 'active' : 'can start'}</span>` : '<span class="muted">nobody</span>'}</span></div>`);
		}
		const groups = [[], [], [], []];
		for (const q of npcs) {
			const qq = V.Y0_(q.id);
			const offer = q.offered >= 0 ? `can start in ${typeLabel(q.offered)}` : '';
			const activeAt = [...new Set([...(qq.L >= 0 ? [qq.L] : []), ...(qq.M ? Array.from(qq.M) : []), ...(qq.c0 ? qq.b0.filter((s) => s.Q >= 0).map((s) => s.Q) : [])])];
			const where = [offer, activeAt.length ? `while active: ${typeList(activeAt)}` : ''].filter(Boolean).join(' · ');
			groups[fam(Math.min(...q.types))].push(this.questRow(V, q.id, esc(where)));
		}
		const npcIds = new Set(npcs.map((q) => q.id));
		const prereq = new Set();
		const bld = new Map();
		for (const q of V.k) {
			if (!npcIds.has(q.a)) continue;
			for (const c of [q.H, q.I, q.J, q.K]) {
				if (!c) continue;
				for (const r of [c.F, c.H, c.G]) if (r && !npcIds.has(r)) prereq.add(r);
				if (c.m !== 0 && c.l) bld.set(c.l, Math.max(bld.get(c.l) || 0, c.m < 0 ? V.o[c.l].e.length : c.m));
			}
		}
		const prereqRows = [...prereq].sort((a, b) => a - b).map((id) => this.questRow(V, id)).join('');
		const bldRows = [...bld].sort((a, b) => a[0] - b[0]).map(([id, need]) => this.num(`bld:${id}`, `${this.buildingName(id)} level`, V.o[id].B0, ['buildings', id, 'B0'], 99, `quests need ${need}`)).join('');
		const npcSection = `<div class="pg-section"><div class="content-header-2">Quest people</div>
			<div class="pg-help">A dungeon gets the person of the first quest (in the game's order) that is active there or can start there. Who each dungeon gets now:</div>
			<div class="pg-picks">${picks.join('')}</div>
			${groups.map((g, i) => (g.length ? `<div class="sub-head">${FAM[i]}</div>${g.join('')}` : '')).join('')}
			${prereqRows ? `<div class="sub-head">Quests that let these start</div>${prereqRows}` : ''}
			<div class="sub-head">Also checked</div>
			${bldRows}
			${this.num('item:114', `${this.itemName(114)} (item 114)`, V.L0_(114), ['items', 114], 99, 'sets where quest 38’s person is: F1 + the count, up to F4')}
		</div>`;

		// bosses beaten
		const bb = bossBits();
		const bossGrid = (fam0, label) => {
			const rows = bb.filter((b) => fam(b.type) === fam0).map((b) => this.check(`J0:${b.bit}`, `${typeLabel(b.type)}${b.minor ? ' mini' : ''}`, (V.J0 >>> b.bit) & 1, ['J0', b.bit], `J0 bit ${b.bit}`)).join('');
			return `<div class="sub-head">${label}</div><div class="pg-grid">${rows}</div>`;
		};
		const bossSection = `<div class="pg-section"><div class="content-header-2">Bosses beaten</div>
			<div class="pg-help">Until you beat it, the boss of 1C brings a companion (and in 6C with quest 46 done). Otherwise a boss you have not beaten only carries a different drop.</div>
			${bossGrid(0, 'Dungeons')}${bossGrid(1, 'Forest (boss and mini-boss)')}${bossGrid(2, 'Caves')}
			<div class="sub-head">Tombs</div>
			<div class="pg-help">The EA boss brings a companion until step 3 of ${esc(this.questName(62))} or ${esc(this.questName(63))} starts.</div>
			${this.questRow(V, 62)}${this.questRow(V, 63)}
		</div>`;

		// mini-bosses
		const miniSection = `<div class="pg-section"><div class="content-header-2">Mini-bosses</div>
			<div class="pg-help">A mini-boss guards 2C while quest 27 is active, and 3C, 4C, 5C while quest 30 is active and the mini-boss before it is beaten.</div>
			${this.questRow(V, 27, 'mini-boss in 2C')}${this.questRow(V, 30, 'mini-bosses in 3C–5C')}
			<div class="sub-head">Mini-boss beaten</div><div class="pg-grid">${MINI.map((m) => this.check(`I0:${m.bit}`, typeLabel(m.type), (V.I0 >>> m.bit) & 1, ['I0', m.bit], `I0 bit ${m.bit}`)).join('')}</div>
		</div>`;

		// extra bosses / unique
		const extraSection = `<div class="pg-section"><div class="content-header-2">Extra bosses</div>
			${this.questRow(V, 25, 'active: a second boss in 5C')}
			${this.questRow(V, 51, 'active: an extra boss in 6C')}
			${this.check('item:256', `Own ${this.itemName(256)} (item 256)`, V.L0_(256) > 0, ['items', 256], 'Changes only the 6C extra boss’s drop')}
			${this.questRow(V, 73, 'started: the tomb guardian in EA–EC')}
		</div>`;

		// merchants
		const merchSection = `<div class="pg-section"><div class="content-header-2">Merchants</div>
			${this.questRow(V, 48, 'started: caves get merchants')}
			${this.questRow(V, 45, 'active: one forest merchant changes')}
			${this.questRow(V, 66, 'done: a tomb merchant selling Ambrosia becomes another person')}
			${this.questRow(V, 41, 'done: one pot of gold does not count')}
			${this.num('stat:b:115', 'Pots of gold found', V.N.b.j_(115), ['stats', 'b', 115], 999, 'none (and 20 F4 dungeons cleared): a special person is likelier in F3 / F4')}
			${this.num('stat:f:18', 'F4 dungeons cleared', V.N.f_(18), ['stats', 'f', 18], 9999)}
			${this.num('stat:x', 'Trades with merchants', V.N.x | 0, ['stats', 'x'], 9999, '3 or more: one more dice roll in 3A–4B, F3, EB, EC')}
		</div>`;

		const decorSection = `<div class="pg-section"><div class="content-header-2">Forest finds</div>
			${this.questRow(V, 46, 'started: more finds in F2–F4 (done: also the 6C boss companion)')}
			${this.check('bstep:4:1', `${this.buildingName(4)}: step 2 done`, V.o[4].h0_(2), ['buildings', 4, 'C0', 1], 'More finds in F3 and F4')}
		</div>`;

		// changes only loot
		const lootSection = `<div class="pg-group">Changes only loot</div><div class="pg-section">
			<div class="pg-help">These change what bosses, chests and monsters drop, not the map (beaten bosses too, above).</div>
			${this.questRow(V, 23, 'started: beaten bosses of 3C, 5C, F4 (and 6C) drop dragon teeth')}
			${this.questRow(V, 36, 'done: other drops in F3 / 6C / 6D')}
			${this.questRow(V, 71, 'started: other drop from the EC boss')}
			${this.questRow(V, 53, 'done: some F2–F4 monsters drop soybeans')}
			${this.questRow(V, 50, 'done: other chest content in EC / ED')}
			${this.questRow(V, 70, 'done: other sarcophagus loot in EC / ED')}
			${this.questRow(V, 74, 'done: the tomb guardian drops something else')}
			${this.questRow(V, 75, 'done or step 1: the tomb guardian drops something else')}
			${this.num('item:305', `${this.itemName(305)} (item 305)`, V.L0_(305), ['items', 305], 99, '2 or more: the tomb guardian drops something else')}
		</div>`;

		box.innerHTML = `${toolbar}${preview}
			<div class="pg-cols">
				<div class="pg-col"><div class="pg-group">Changes the map</div>${npcSection}</div>
				<div class="pg-col"><div class="pg-group">&nbsp;</div>${bossSection}${miniSection}${extraSection}</div>
				<div class="pg-col"><div class="pg-group">&nbsp;</div>${merchSection}${decorSection}${lootSection}</div>
			</div>`;
		this.wire(box);
	}

	previewHtml(V, type, label) {
		const R = explain(V, type);
		const lines = [];
		for (const r of R) {
			if (r.kind === 'npc') {
				const p = r.person;
				const where = p && p.where === 'boss room' ? ' in the boss room' : p && p.where === 'entrance' ? ' at the entrance' : '';
				const extra = p && p.refs.length ? ` with ${p.refs.length} more ${p.refs.length === 1 ? 'person' : 'people'}` : '';
				const wagon = p && p.wagon ? ' and a wagon' : '';
				lines.push(`Quest person${p && p.npc ? ` <span class="muted">#${p.npc}</span>` : ''}${where}${extra}${wagon}, because <b>${esc(this.questName(r.quest))}</b> ${r.active ? 'is active' : 'can start here'}.`);
			} else if (r.kind === 'mini') lines.push(`A mini-boss, because <b>${esc(this.questName(r.quest))}</b> is active and this mini-boss is not beaten.`);
			else if (r.kind === 'boss2') lines.push(`A second boss <span class="muted">#${r.boss}</span>, because <b>${esc(this.questName(r.quest))}</b> is active.`);
			else if (r.kind === 'companion') lines.push(r.on ? `The boss brings a companion <span class="muted">#${r.companion}</span> (boss not beaten).` : 'The boss comes without its companion.');
			else if (r.kind === 'unique') lines.push(r.on ? `The tomb guardian is here, because <b>${esc(this.questName(73))}</b> has started.` : `No tomb guardian: <b>${esc(this.questName(73))}</b> has not started.`);
			else if (r.kind === 'merchant') lines.push(r.on ? 'Merchants can appear.' : `No merchants: <b>${esc(this.questName(48))}</b> has not started.`);
		}
		if (!R.some((r) => r.kind === 'npc')) lines.unshift('No quest person.');
		return `<div class="pg-preview"><div class="solve-card-head">In ${esc(label || typeLabel(type))}</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
	}

	wire(box) {
		const H = this.opts.hero;
		const act = (el, fn) => {
			el.onclick = fn;
			el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
		};
		for (const el of box.querySelectorAll('[data-q][data-st]')) act(el, () => this.set('q', el.dataset.q, el.dataset.st));
		for (const el of box.querySelectorAll('[data-c]')) act(el, () => this.set('c', el.dataset.c, el.getAttribute('aria-checked') !== 'true'));
		for (const el of box.querySelectorAll('input[data-n]')) el.onchange = () => this.set('n', el.dataset.n, el.value);
		for (const el of box.querySelectorAll('[data-base]')) act(el, () => { if (el.dataset.base === 'save' && !H.profile) return; H.setUse(el.dataset.base === 'save'); });
		for (const el of box.querySelectorAll('[data-reset]')) act(el, () => H.resetEdits(el.dataset.reset));
	}
}

/** "custom" when the overrides change something, else "save" / "new" */
export function basisOf(hero) {
	if (!hero) return 'new';
	if (!hero.edits.empty()) return 'custom';
	return hero.use && hero.profile ? 'save' : 'new';
}

export const BASIS_TEXT = { new: 'New game', save: 'Your progress', custom: 'Custom progress' };

export { readProgress };
