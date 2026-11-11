// "Your hero" panel (M7): import the game's export (Settings -> export: NonogramsKatana.zip, or a bare guild.dat),
// show the heroes, the selected one's stats / skills / equipment, the pack it would take into the dungeon on screen
// (js/combat/entry.js entryPack: the game's own entry rules) and a progress summary. While "use my progress" is on,
// the map is generated with the imported profile as vj0.i2 (quest NPCs, bosses beaten and mini-boss quests change
// what a label builds).
//
// Privacy: the file is parsed here (js/save, js/combat/entry.js); nothing is uploaded. guild.dat (a few KB) is kept
// in sessionStorage so a reload keeps it, until the tab is closed or "Forget" is pressed.
//
// Your progress (js/ui/progress-panel.js): edits on top of the base (the imported save while "use my progress" is on,
// else a new game), kept in localStorage. effectiveProfile() is what maps and the solver are built with.
import { typeLabel } from './labels.js';
import { withProgress, freshProfile, readProgress, diffProgress } from './gen/progress-spec.js';
import { ProgressEdits, ProgressPanel, BASIS_TEXT } from './ui/progress-panel.js';

const KEY_SAVE = 'nkd-save';          // base64 guild.dat
const KEY_HERO = 'nkd-hero';          // chosen hero index
const KEY_USE = 'nkd-use-profile';    // '1' / '0'

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function toB64(u8) {
	let s = '';
	for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
	return btoa(s);
}
function fromB64(b) {
	const s = atob(b);
	const u8 = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
	return u8;
}

function awayText(ms) {
	const m = Math.round(ms / 60000);
	if (m < 60) return `${m} min`;
	const h = Math.floor(m / 60);
	return h < 48 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
}

const STAT_ROWS = [['hp', 'Health'], ['ep', 'Energy'], ['mp', 'Mental power'], ['atk', 'Attack'], ['def', 'Defence'], ['ap', 'Action points']];
const SLOTS = ['Weapon', 'Armour', 'Shield', 'Ring'];

export class HeroPanel {
	/**
	 * opts: { getType() -> current dungeon type, onChange() -> called when the profile in use changes }
	 */
	constructor(opts) {
		this.opts = opts;
		this.profile = null;     // imported vj0
		this.info = null;        // { savedAt, notes, inDungeon, file }
		this.guild = null;       // the guild.dat bytes (the solver re-imports them in its workers)
		this.dungeon = null;     // the dungeon in progress: { type, seed, kind: 'hw' | 'ew' } | null
		this.hero = 0;
		this.use = sessionStorage.getItem(KEY_USE) !== '0';
		this.names = null;
		this.mods = null;
		this.error = null;
		this.edits = new ProgressEdits();
		this._eff = null;        // effectiveProfile() cache
		this.progressPanel = new ProgressPanel({
			hero: this,
			getType: () => opts.getType(),
			getLabel: () => (opts.getLabel ? opts.getLabel() : typeLabel(opts.getType())),
		});
	}

	async modules() {
		if (!this.mods) {
			const [save, zip, entry, names, statics] = await Promise.all([
				import('./save/index.js'), import('./save/zip.js'), import('./combat/entry.js'),
				fetch('data/names.json').then((r) => r.json()).catch(() => ({})),
				import('./gen/statics.js'),
			]);
			this.mods = { save, zip, entry, statics };
			this.names = names;
		}
		return this.mods;
	}

	/** The imported profile while "use my progress" is on (null: the base is a new game). */
	activeProfile() {
		return this.use && this.profile ? this.profile : null;
	}

	/** The profile the progress edits sit on: the imported save while "use my progress" is on, else a new game. */
	baseProfile() {
		return this.activeProfile() || freshProfile();
	}

	/**
	 * The profile maps and the solver are built with: the base plus the "Your progress" edits.
	 * { vj0, basis: 'new' | 'save' | 'custom', text ('New game' / 'Your progress' / 'Custom progress'), key (changes
	 * exactly when what generation reads changes), changes (number of edited values) }
	 */
	effectiveProfile() {
		const base = this.baseProfile();
		const ek = JSON.stringify(this.edits.o);
		if (this._eff && this._eff.base === base && this._eff.ek === ek) return this._eff.r;
		let spec = this.edits.empty() ? null : this.edits.spec(base);
		let vj0;
		try {
			vj0 = spec ? withProgress(base, spec) : base;
		} catch (e) {
			// edits this game data cannot take (stored by another version): drop them
			console.warn('progress edits dropped:', e);
			this.edits.clear();
			spec = null;
			vj0 = base;
		}
		const read = readProgress(vj0);
		const custom = spec != null && Object.keys(diffProgress(readProgress(base), read)).length > 0;
		const basis = custom ? 'custom' : base === freshProfile() ? 'new' : 'save';
		const key = `${basis}:${hash(JSON.stringify(read))}`;
		const r = { vj0, basis, text: BASIS_TEXT[basis], key, changes: custom ? this.edits.count() : 0 };
		this._eff = { base, ek, r };
		return r;
	}

	/**
	 * Progress for the solver's workers, as plain data (an imported profile does not survive postMessage):
	 * over === 'save': the edits to put on the imported save (null when the map's progress is the save's own);
	 * over === 'new': the map's whole progress as edits on a new game (null when it is a new game).
	 */
	solverProgress(over) {
		const eff = this.effectiveProfile();
		const from = over === 'save' ? this.profile : freshProfile();
		if (!from) return null;
		const d = diffProgress(readProgress(from), readProgress(eff.vj0));
		return Object.keys(d).length ? d : null;
	}

	/** The solver's hero spec for the imported hero: guild bytes, or { guild, progress } when the map's progress differs. */
	solverProfile() {
		if (!this.profile) return null;
		const progress = this.solverProgress('save');
		return { bytes: progress ? { guild: this.guild, progress } : this.guild, hero: this.hero, premium: false, name: (this.info && this.info.file) || 'guild.dat' };
	}

	/** The progress edits changed: regenerate the map, refresh the badge and the open editor. */
	progressChanged() {
		this._eff = null;
		this.renderStatus();
		this.opts.onChange();
		this.renderProgress();
	}

	/** Forget the edits; base 'save' (use the imported save) or 'new'. */
	resetEdits(base) {
		this.edits.clear();
		const use = base === 'save' && !!this.profile;
		if (use !== this.use) this.setUse(use);
		else this.progressChanged();
	}

	openProgress() {
		this.renderProgress(true);
		if (typeof Popup !== 'undefined') Popup.popup($('#popup-progress'));
	}

	/** Re-render the Your progress popup while it is shown (or when force). */
	renderProgress(force = false) {
		const pop = $('#popup-progress');
		if (!pop) return;
		const shown = pop.parentNode && pop.parentNode.classList.contains('popup-bounding') ? pop.parentNode.style.opacity != 0 : true;
		if (!force && !shown) return;
		this.progressPanel.render().catch((e) => console.error('progress panel:', e));
	}

	/** Wire the page: buttons, file picker, drag and drop anywhere on the page. */
	bind() {
		const open = () => this.open();
		$('#hero-open-btn').onclick = open;
		const pb = $('#progress-open-btn');
		if (pb) pb.onclick = () => this.openProgress();
		$('#hero-pick').onclick = () => $('#hero-file').click();
		$('#hero-file').onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.importFile(f); };
		$('#hero-use').onclick = () => this.setUse(!this.use);
		$('#hero-forget').onclick = () => this.forget();
		const drop = $('#hero-drop');
		const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
		window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.add('over'); });
		window.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || e.target === drop) drop.classList.remove('over'); });
		window.addEventListener('drop', (e) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			drop.classList.remove('over');
			const f = e.dataTransfer.files && e.dataTransfer.files[0];
			if (f) this.importFile(f, { openPanel: true });
		});
	}

	open() {
		this.render();
		if (typeof Popup !== 'undefined') Popup.popup($('#popup-hero'));
	}

	/** A reload in the same tab: the guild.dat kept in sessionStorage. */
	async restore() {
		const b = sessionStorage.getItem(KEY_SAVE);
		if (!b) { this.renderStatus(); return false; }
		try {
			await this.load(fromB64(b), { file: sessionStorage.getItem(KEY_SAVE + '-name') || 'guild.dat', persist: false });
			return true;
		} catch (e) {
			console.warn('stored save could not be read again:', e);
			sessionStorage.removeItem(KEY_SAVE);
			this.renderStatus();
			return false;
		}
	}

	async importFile(file, { openPanel = false } = {}) {
		this.error = null;
		try {
			const u8 = new Uint8Array(await file.arrayBuffer());
			await this.load(u8, { file: file.name, persist: true });
			this.opts.onChange();
		} catch (e) {
			console.error(e);
			this.error = e && e.message ? e.message : String(e);
		}
		this.render();
		if (openPanel && typeof Popup !== 'undefined' && $('#popup-hero').parentNode.style.opacity == 0) Popup.popup($('#popup-hero'));
	}

	async load(u8, { file, persist }) {
		const { save, zip } = await this.modules();
		let guild = u8;
		if (zip.isZip(u8)) {
			const ex = await zip.readExport(u8);
			if (!ex.guild) throw new Error('This zip has no guild.dat. Use the file from the game\'s Settings → Export.');
			guild = ex.guild;
		}
		const r = await save.importSave(guild);
		this.profile = r.vj0;
		this.info = { savedAt: r.header.savedAt, notes: r.notes, inDungeon: r.dungeon != null, file };
		this.guild = guild;
		this.dungeon = r.dungeon ? { type: r.dungeon.b, seed: r.dungeon.a, kind: r.marker === 1 ? 'hw' : 'ew' } : null;
		const stored = parseInt(sessionStorage.getItem(KEY_HERO), 10);
		const n = r.vj0.l.length;
		this.hero = persist || !(stored >= 0 && stored < n) ? (r.vj0.H0 >= 0 && r.vj0.H0 < n ? r.vj0.H0 : 0) : stored;
		if (persist) {
			try {
				sessionStorage.setItem(KEY_SAVE, toB64(guild));
				sessionStorage.setItem(KEY_SAVE + '-name', file || 'guild.dat');
				sessionStorage.setItem(KEY_HERO, String(this.hero));
				this.use = true;
				sessionStorage.setItem(KEY_USE, '1');
			} catch (e) {
				console.warn('could not keep the save for this tab:', e);
			}
		}
		this.renderStatus();
	}

	forget() {
		for (const k of [KEY_SAVE, KEY_SAVE + '-name', KEY_HERO, KEY_USE]) sessionStorage.removeItem(k);
		this.profile = null;
		this.info = null;
		this.guild = null;
		this.dungeon = null;
		this.error = null;
		this.use = true;
		this._eff = null;
		this.render();
		this.opts.onChange();
		this.renderProgress();
	}

	setUse(on) {
		this.use = !!on;
		sessionStorage.setItem(KEY_USE, this.use ? '1' : '0');
		this._eff = null;
		this.render();
		this.opts.onChange();
		this.renderProgress();
	}

	setHero(i) {
		this.hero = i;
		sessionStorage.setItem(KEY_HERO, String(i));
		this.render();
	}

	// ---- rendering -----------------------------------------------------------------------------

	/** The left-column block: which progress the map uses. */
	renderStatus() {
		const st = $('#profile-status');
		const badge = $('#profile-badge');
		// the solver panel follows the profile, the hero choice, "use my progress" and the progress edits
		document.dispatchEvent(new CustomEvent('nkd-hero'));
		const eff = this.effectiveProfile();
		badge.textContent = eff.text;
		badge.className = 'profile-badge' + (eff.basis === 'save' ? ' on' : eff.basis === 'custom' ? ' custom' : '');
		const edits = eff.basis === 'custom' ? ` · ${eff.changes} change${eff.changes === 1 ? '' : 's'} in Your progress` : '';
		if (!this.profile) {
			st.textContent = eff.basis === 'custom'
				? `A new game with your changes shapes the map${edits}.`
				: 'Import your save, or set your progress, to see monsters and people as they are for you.';
			$('#hero-open-btn').textContent = 'Import save';
			return;
		}
		const e = this.profile.l[this.hero];
		const lvl = e ? e.g : '?';
		st.textContent = this.use
			? `Your quests and bosses shape the map · hero ${this.hero + 1}, level ${lvl}${edits}`
			: `Your save is loaded; maps use a new game${edits}.`;
		$('#hero-open-btn').textContent = 'Your hero';
	}

	render() {
		this.renderStatus();
		const body = $('#hero-body');
		const err = $('#hero-error');
		err.textContent = this.error ? `Could not read that file: ${this.error}` : '';
		err.style.display = this.error ? '' : 'none';
		$('#hero-footer').style.display = this.profile ? '' : 'none';
		$('#hero-use-box').classList.toggle('selected', this.use);
		$('#hero-drop').classList.toggle('compact', false);
		if (!this.profile || !this.mods) { body.innerHTML = ''; body.style.display = 'none'; return; }
		body.style.display = '';
		const { entry } = this.mods;
		const P = this.profile;
		const N = this.names || {};
		const base = (id) => (N.items && N.items[id]) || `item ${id}`;
		// the game's display name (bj0 name builder): name [+ suffix h] [+ " Lv f"] [+ "+" when g]
		const def = (id) => { const Z = this.mods.statics.vj0.Z1; return Z && Z.get ? Z.get(id) : null; };
		const item = (id) => {
			const b = def(id);
			let s = base(id);
			if (b && b.h) s += ` ${b.h}`;
			if (b && b.f) s += ` Lv ${b.f}${b.g ? '+' : ''}`;
			return s;
		};
		const type = this.opts.getType();
		const sheet = entry.heroSheet(P, this.hero);
		const pack = entry.entryPack(P, this.hero, { type });
		const prog = entry.progressSummary(P);

		// heroes
		const heroes = P.l.map((h, i) => {
			const sel = i === this.hero ? ' selected' : '';
			const star = i === P.H0 ? '<span class="game-pick" title="Selected in the game">★</span>' : '';
			const away = h.n > 0 ? '<span class="muted small">away</span> · ' : '';
			return `<div class="row hero-row${sel}" data-i="${i}" title="Hero index ${i}"><span>${star}Hero ${i + 1}${h.p ? ` · ${esc(h.p)}` : ''}</span><span>${away}Lv ${h.g}</span></div>`;
		}).join('');

		// sheet
		const stats = STAT_ROWS.map(([k, label]) => `<div class="stat"><span class="muted">${label}</span><b>${sheet[k]}</b></div>`).join('');
		const skills = sheet.skills.map((l, i) => [l, i]).filter(([l]) => l > 0)
			.map(([l, i]) => `<div class="row"><span>${esc((N.skills && N.skills[i]) || `Skill ${i}`)}</span><span>${l}</span></div>`).join('') || '<div class="muted">None yet.</div>';
		// as the game names it: "Sword for a hero Lv 4+"; durability left / max; ★ = incrustation
		const gear = sheet.gear.map((g, s) => {
			if (!g) return `<div class="row"><span class="muted">${SLOTS[s]}</span><span>—</span></div>`;
			const lvl = g.level ? ` <b>Lv ${g.level}${g.plus ? '+' : ''}</b>` : '';
			const dur = g.durMax ? ` <span class="muted small" title="Durability">${g.dur} / ${g.durMax}</span>` : '';
			const inc = g.enh ? ' <span title="Incrustation">★</span>' : '';
			return `<div class="row"><span class="muted">${SLOTS[s]}</span><span>${esc(base(g.id))}${lvl}${inc}${dur}</span></div>`;
		}).join('');
		const pets = sheet.pets.length
			? sheet.pets.map((u, i) => `<div class="row"><span>Companion ${i + 1}${i >= 3 ? ' <span class="muted">(not taken)</span>' : ''}</span><span>${u.foodLeft > 0 ? `${esc(item(u.food))} ×${u.foodLeft}` : '<span class="muted">no food</span>'}</span></div>`).join('')
			: '<div class="muted">None.</div>';
		const awayNote = sheet.away > 0 ? `<div class="note">Away when the save was made (about ${awayText(sheet.away)} left then).</div>` : '';

		// pack
		const packRows = pack.items.map(([id, n]) => `<div class="row" title="item ${id}"><span>${esc(item(id))}</span><span>×${n}</span></div>`).join('') || '<div class="muted">Nothing.</div>';
		const fam = pack.pets.length
			? pack.pets.map((p) => `<div class="row"><span>Familiar ${p.slot + 1} <span class="muted">(${esc(item(p.food))})</span></span><span>${p.charges} ${p.charges === 1 ? 'charge' : 'charges'}</span></div>`).join('')
			: '<div class="muted">No companion with food.</div>';
		const fee = pack.fee.length
			? `<div class="mp-line"><span class="muted">Entry fee${pack.feePaid ? '' : ' (you are short)'}</span><span>${pack.fee.map(([id, n]) => `${esc(item(id))} ×${n}`).join(', ')}</span></div>`
			: '';
		const gates = pack.gates.filter((g) => g.gate !== 'away' && g.gate !== 'busy');
		const gateNote = gates.length ? `<div class="note">${gates.map((g) => esc(g.text[0].toUpperCase() + g.text.slice(1))).join('. ')}.</div>` : '';

		// progress
		const quest = (id) => (N.quests && N.quests[id]) || `Quest ${id}`;
		const active = prog.activeQuests.length ? prog.activeQuests.map((q) => `<div>${esc(quest(q))}</div>`).join('') : '<div class="muted">None.</div>';
		const unlocked = prog.unlocked.map(typeLabel).join(' ');
		const saved = this.info && this.info.savedAt ? new Date(this.info.savedAt * 1000) : null;

		body.innerHTML = `
			<div class="hero-col">
				<div class="content-header-2">Heroes</div>
				<div class="info-box scroll-list hero-list">${heroes}</div>
				<div class="muted small">★ selected in the game. Click to look at another hero.</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Hero ${this.hero + 1} · Lv ${sheet.lvl}</div>
				${awayNote}
				<div class="stat-grid">${stats}</div>
				<div class="sub-head">Equipment</div><div class="info-box">${gear}</div>
				<div class="sub-head">Companions</div><div class="info-box">${pets}</div>
				<div class="sub-head">Skills</div><div class="info-box scroll-list skill-list">${skills}</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Pack for ${typeLabel(type)}</div>
				<div class="mp-line"><span>Mental power taken in</span><b>${pack.mp} <span class="muted">of ${sheet.mp}</span></b></div>
				<div class="muted small">From your stock of ${prog.mpStock}.</div>
				${fee}${gateNote}
				<div class="info-box scroll-list pack-list">${packRows}</div>
				<div class="sub-head">Familiars</div><div class="info-box">${fam}</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Progress</div>
				<div class="info-box">
					<div class="row"><span>Dungeon bosses</span><span>${prog.classicBosses} / 15</span></div>
					<div class="row"><span>Forest bosses</span><span>${prog.forestBosses} / 8</span></div>
					<div class="row"><span>Cave bosses</span><span>${prog.caveBosses} / 3</span></div>
					<div class="row"><span>Quests done</span><span>${prog.doneQuests}</span></div>
				</div>
				<div class="sub-head">Active quests</div><div class="info-box">${active}</div>
				<div class="sub-head">Dungeons you can enter</div><div class="info-box">${unlocked || '<span class="muted">None.</span>'}</div>
				<div class="muted small">${saved ? `Saved ${saved.toLocaleString()}` : ''}${this.info && this.info.inDungeon ? ' · inside a dungeon' : ' · in town'}${this.info && this.info.file ? ` · ${esc(this.info.file)}` : ''}</div>
			</div>`;
		for (const r of body.querySelectorAll('.hero-row')) r.onclick = () => this.setHero(+r.dataset.i);
		// keep the chosen hero in view (the list scrolls by itself; scrollIntoView would also move the popup)
		const list = body.querySelector('.hero-list');
		const sel = body.querySelector('.hero-row.selected');
		if (list && sel && (sel.offsetTop < list.scrollTop || sel.offsetTop + sel.offsetHeight > list.scrollTop + list.clientHeight)) {
			list.scrollTop = Math.max(0, sel.offsetTop - list.clientHeight / 2);
		}
		$('#hero-drop').classList.toggle('compact', true);
	}
}

/** short string hash (FNV-1a), for the progress key */
function hash(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}
