// "Your hero" panel (M7): import the game's export (Settings -> export: NonogramsKatana.zip, or a bare guild.dat),
// show the heroes, the selected one's stats / skills / equipment, the pack it would take into the dungeon on screen
// (js/combat/entry.js entryPack: the game's own entry rules) and a progress summary. While "use my progress" is on,
// the map is generated with the imported profile as vj0.i2 (quest NPCs, bosses beaten and mini-boss quests change
// what a label builds).
//
// Privacy: the file is parsed here (js/save, js/combat/entry.js); nothing is uploaded. guild.dat (a few KB) is kept
// in sessionStorage so a reload keeps it, until the tab is closed or "Forget" is pressed.
//
// An import never leaves anything of the previous save or solve on screen: the page (js/app.js) is asked to confirm
// when it shows a dungeon or a plan, and once the new save has read it shows that save's dungeon in progress, or none.
//
// Your progress (js/ui/progress-panel.js): edits on top of the base (the imported save while "use my progress" is on,
// else a new game), kept in localStorage. effectiveProfile() is what maps and the solver are built with.
import { typeLabel, titleCase } from './labels.js';
import { withProgress, freshProfile, readProgress, diffProgress } from './gen/progress-spec.js';
import { ProgressEdits, ProgressPanel, BASIS_TEXT } from './ui/progress-panel.js';

const KEY_SAVE = 'nkd-save';          // base64 guild.dat
const KEY_HERO = 'nkd-hero';          // chosen hero index
const KEY_USE = 'nkd-use-profile';    // '1' / '0'
const KEY_SAVE_NAME = KEY_SAVE + '-name';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const STAT_ROWS = [['hp', 'Health'], ['ep', 'Energy'], ['mp', 'Mental power'], ['atk', 'Attack'], ['def', 'Defence'], ['ap', 'Action points']];
const SLOTS = ['Weapon', 'Armour', 'Shield', 'Ring'];

/** Whether this tab holds an imported save (it is read again on load). */
export function hasKeptSave() {
	return sessionStorage.getItem(KEY_SAVE) != null;
}

export class HeroPanel {
	/**
	 * opts: { getType() -> type of the dungeon shown, getLabel() -> its label ('' when none), hasDungeon(),
	 *         onChange() -> the profile in use changed (rebuild the map),
	 *         confirmImport({ replacesSave }) -> Promise<boolean>: asks first when an import would wipe the screen,
	 *         onImported(dungeon) -> Promise: the save was read; wipe the screen and show the save's dungeon in progress
	 *           ({ type, seed, kind }), or none (null),
	 *         onForgotten() -> the save was forgotten: drop what was made from it }
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
		if (this.mods) return this.mods;
		const [save, zip, envelope, entry, names, statics] = await Promise.all([
			import('./save/index.js'), import('./save/zip.js'), import('./save/envelope.js'), import('./combat/entry.js'),
			fetch('data/names.json').then((r) => r.json()).catch(() => ({})),
			import('./gen/statics.js'),
		]);
		this.mods = { save, zip, envelope, entry, statics };
		this.names = names;
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
		const changes = diffProgress(readProgress(from), readProgress(eff.vj0));
		return Object.keys(changes).length ? changes : null;
	}

	/** The solver's hero spec for the imported hero: guild bytes, or { guild, progress } when the map's progress differs. */
	solverProfile() {
		if (!this.profile) return null;
		const progress = this.solverProgress('save');
		return {
			bytes: progress ? { guild: this.guild, progress } : this.guild,
			hero: this.hero,
			premium: false,
			name: (this.info && this.info.file) || 'guild.dat',
		};
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
		$('#hero-open-btn').onclick = () => this.open();
		const progressButton = $('#progress-open-btn');
		if (progressButton) progressButton.onclick = () => this.openProgress();
		$('#hero-pick').onclick = () => $('#hero-file').click();
		$('#hero-file').onchange = (e) => {
			const file = e.target.files && e.target.files[0];
			e.target.value = '';
			if (file) this.importFile(file);
		};
		$('#hero-use').onclick = () => this.setUse(!this.use);
		$('#hero-forget').onclick = () => this.forgetWithFade();
		this.bindFileDrop();
	}

	/** A save dropped anywhere on the page is imported, and the Your hero popup opens. */
	bindFileDrop() {
		const drop = $('#hero-drop');
		window.addEventListener('dragover', (e) => {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			drop.classList.add('over');
		});
		window.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || e.target === drop) drop.classList.remove('over'); });
		window.addEventListener('drop', (e) => {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			drop.classList.remove('over');
			const file = e.dataTransfer.files && e.dataTransfer.files[0];
			if (file) this.importFile(file, { openPanel: true });
		});
	}

	open() {
		this.render();
		this.showPopup();
	}

	showPopup() {
		if (typeof Popup !== 'undefined') Popup.popup($('#popup-hero'));
	}

	/** A reload in the same tab: the guild.dat kept in sessionStorage. The page decides what to show (js/app.js). */
	async restore() {
		const stored = sessionStorage.getItem(KEY_SAVE);
		if (!stored) {
			this.renderStatus();
			return false;
		}
		try {
			this.adopt(await this.readSave(fromB64(stored)), { file: sessionStorage.getItem(KEY_SAVE_NAME) || 'guild.dat', persist: false });
			return true;
		} catch (e) {
			console.warn('stored save could not be read again:', e);
			sessionStorage.removeItem(KEY_SAVE);
			this.renderStatus();
			return false;
		}
	}

	/**
	 * Import a file the player chose or dropped. A file that cannot be read is refused before anything is asked or
	 * changed; if the page shows something the import would wipe, the player confirms first (Cancel changes nothing).
	 */
	async importFile(file, { openPanel = false } = {}) {
		this.error = null;
		const popupWasOpen = isPopupShown($('#popup-hero'));
		let imported = false;
		try {
			const guild = await this.readableGuild(new Uint8Array(await file.arrayBuffer()));
			if (await this.opts.confirmImport({ replacesSave: !!this.profile })) {
				await this.replaceSave(guild, file.name);
				imported = true;
			}
		} catch (e) {
			console.error(e);
			this.error = e && e.message ? e.message : String(e);
		}
		this.render();
		// the confirm popup closed the Your hero one: bring it back, and open it for a dropped file that was used
		if (popupWasOpen || (openPanel && (imported || this.error))) this.showPopup();
	}

	/** The guild.dat in a file (zip or bare), checked to decode. Throws a message for the player when it does not. */
	async readableGuild(bytes) {
		const { zip, envelope } = await this.modules();
		const guild = await guildBytes(bytes, zip);
		await envelope.decodeGuild(guild);
		return guild;
	}

	/** Make a new save the one in use, then have the page show its dungeon in progress, or none. */
	async replaceSave(guild, file) {
		this.adopt(await this.readSave(guild), { file, persist: true });
		await this.opts.onImported(this.dungeon);
	}

	/** Parse a guild.dat. Changes nothing of the one in use: if it throws, the screen and the old save stay. */
	async readSave(guild) {
		const { save } = await this.modules();
		return { guild, imported: await save.importSave(guild) };
	}

	/**
	 * Take a parsed save into use and show its heroes. `persist`: a new import, kept for this tab and used for maps;
	 * else a reload of the kept one, which keeps the hero picked earlier.
	 */
	adopt({ guild, imported }, { file, persist }) {
		this.profile = imported.vj0;
		this.info = { savedAt: imported.header.savedAt, notes: imported.notes, inDungeon: imported.dungeon != null, file };
		this.guild = guild;
		this.dungeon = imported.dungeon ? { type: imported.dungeon.b, seed: imported.dungeon.a, kind: imported.marker === 1 ? 'hw' : 'ew' } : null;
		const pickedBefore = parseInt(sessionStorage.getItem(KEY_HERO), 10);
		this.hero = heroToShow(imported.vj0, persist ? -1 : pickedBefore);
		if (persist) this.keepForTab(guild, file);
		this._eff = null;
		this.renderStatus();
	}

	/** Keep the save in sessionStorage for reloads of this tab, and turn on "use my progress". */
	keepForTab(guild, file) {
		try {
			sessionStorage.setItem(KEY_SAVE, toB64(guild));
			sessionStorage.setItem(KEY_SAVE_NAME, file || 'guild.dat');
			sessionStorage.setItem(KEY_HERO, String(this.hero));
			this.use = true;
			sessionStorage.setItem(KEY_USE, '1');
		} catch (e) {
			console.warn('could not keep the save for this tab:', e);
		}
	}

	/**
	 * Forget with the same fade an import has (it closes and reopens this popup around its question): the popup fades
	 * out, the save goes, and it fades back in showing the import box, not a sudden swap of its contents.
	 */
	async forgetWithFade() {
		const popup = $('#popup-hero');
		const open = isPopupShown(popup);
		if (open && typeof Animate !== 'undefined' && typeof UP !== 'undefined') {
			await Animate.animateGroup([[popup.parentNode, Animate.fadeOut, {}], [popup, Animate.fadeOut, { shiftTo: UP }]]);
		}
		this.forget();
		if (open) this.showPopup();
	}

	/** Not an import: the map stays (rebuilt as a new game), but what was made from the save goes (the page says so). */
	forget() {
		for (const key of [KEY_SAVE, KEY_SAVE_NAME, KEY_HERO, KEY_USE]) sessionStorage.removeItem(key);
		this.profile = null;
		this.info = null;
		this.guild = null;
		this.dungeon = null;
		this.error = null;
		this.use = true;
		this.opts.onForgotten();
		this.profileInUseChanged();
	}

	setUse(on) {
		this.use = !!on;
		sessionStorage.setItem(KEY_USE, this.use ? '1' : '0');
		this.profileInUseChanged();
	}

	/** The save or "use my progress" changed: re-render, rebuild the map, refresh the open progress editor. */
	profileInUseChanged() {
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
		const status = $('#profile-status');
		// the solver panel follows the profile, the hero choice, "use my progress" and the progress edits
		document.dispatchEvent(new CustomEvent('nkd-hero'));
		const mapProfile = this.effectiveProfile();
		status.textContent = this.statusText(mapProfile);
		$('#hero-open-btn').textContent = this.profile ? 'Your hero' : 'Import save';
	}

	/** @param {{ basis: string, changes: number }} mapProfile effectiveProfile() */
	statusText(mapProfile) {
		const custom = mapProfile.basis === 'custom';
		const edits = custom ? ` · ${mapProfile.changes} change${mapProfile.changes === 1 ? '' : 's'} in Your progress` : '';
		if (!this.profile) {
			return custom
				? `A new game with your changes shapes the map${edits}.`
				: 'Import your save, or set your progress, to see monsters and people as they are for you.';
		}
		if (!this.use) return `Your save is loaded; maps use a new game${edits}.`;
		const hero = this.profile.l[this.hero];
		return `Your quests and bosses shape the map · hero ${this.hero + 1}, level ${hero ? hero.g : '?'}${edits}`;
	}

	/** The Your hero popup: the file error, and once a save is read, its heroes, the chosen hero's pack and progress. */
	render() {
		this.renderStatus();
		this.renderPopupFrame();
		const body = $('#hero-body');
		if (!this.profile || !this.mods) {
			body.innerHTML = '';
			body.style.display = 'none';
			return;
		}
		body.style.display = '';
		body.innerHTML = this.heroBodyHtml();
		for (const row of body.querySelectorAll('.hero-row')) row.onclick = () => this.setHero(+row.dataset.i);
		keepChosenHeroInView(body);
		$('#hero-drop').classList.toggle('compact', true);
	}

	renderPopupFrame() {
		const error = $('#hero-error');
		error.textContent = this.error ? `Could not read that file: ${this.error}` : '';
		error.style.display = this.error ? '' : 'none';
		$('#hero-footer').style.display = this.profile ? '' : 'none';
		$('#hero-use-box').classList.toggle('selected', this.use);
		$('#hero-drop').classList.toggle('compact', false);
	}

	heroBodyHtml() {
		const { entry } = this.mods;
		const profile = this.profile;
		const type = this.opts.getType();
		const sheet = entry.heroSheet(profile, this.hero);
		const pack = entry.entryPack(profile, this.hero, { type });
		const progress = entry.progressSummary(profile);
		const names = new DisplayNames(this.names, this.mods.statics.vj0.Z1);
		return `
			<div class="hero-col">
				<div class="content-header-2">Heroes</div>
				<div class="info-box scroll-list hero-list">${heroListHtml(profile, this.hero)}</div>
				<div class="muted small">★ selected in the game. Click to look at another hero.</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Hero ${this.hero + 1} · Lv ${sheet.lvl}</div>
				${awayNoteHtml(sheet)}
				<div class="stat-grid">${statsHtml(sheet)}</div>
				<div class="sub-head">Equipment</div><div class="info-box">${gearHtml(sheet, names)}</div>
				<div class="sub-head">Companions</div><div class="info-box">${companionsHtml(sheet, names)}</div>
				<div class="sub-head">Skills</div><div class="info-box scroll-list skill-list">${skillsHtml(sheet, names)}</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Pack for ${typeLabel(type)}</div>
				${this.opts.hasDungeon() ? '' : `<div class="muted small">No dungeon is shown, so this is the pack for ${typeLabel(type)}.</div>`}
				<div class="mp-line"><span>Mental power taken in</span><b>${pack.mp} <span class="muted">of ${sheet.mp}</span></b></div>
				<div class="muted small">From your stock of ${progress.mpStock}.</div>
				${feeHtml(pack, names)}${gateNoteHtml(pack)}
				<div class="info-box scroll-list pack-list">${packItemsHtml(pack, names)}</div>
				<div class="sub-head">Familiars</div><div class="info-box">${familiarsHtml(pack, names)}</div>
			</div>
			<div class="hero-col">
				<div class="content-header-2">Progress</div>
				<div class="info-box">
					<div class="row"><span>Dungeon bosses</span><span>${progress.classicBosses} / 15</span></div>
					<div class="row"><span>Forest bosses</span><span>${progress.forestBosses} / 8</span></div>
					<div class="row"><span>Cave bosses</span><span>${progress.caveBosses} / 3</span></div>
					<div class="row"><span>Quests done</span><span>${progress.doneQuests}</span></div>
				</div>
				<div class="sub-head">Active quests</div><div class="info-box">${activeQuestsHtml(progress, names)}</div>
				<div class="sub-head">Dungeons you can enter</div><div class="info-box">${unlockedHtml(progress)}</div>
				<div class="muted small">${saveLineHtml(this.info)}</div>
			</div>`;
	}
}

/** Display names: data/names.json, and items as the game names them. */
class DisplayNames {
	/**
	 * @param {object} names data/names.json ({ items, skills, quests }), or null
	 * @param {Map} itemDefs the game's item definitions (vj0.Z1)
	 */
	constructor(names, itemDefs) {
		this.names = names || {};
		this.itemDefs = itemDefs;
	}

	item(id) {
		return (this.names.items && this.names.items[id]) || `item ${id}`;
	}

	/** The game's display name (bj0 name builder): name [+ suffix h] [+ " Lv f"] [+ "+" when g]. */
	fullItem(id) {
		const def = this.itemDefs && this.itemDefs.get ? this.itemDefs.get(id) : null;
		let name = this.item(id);
		if (def && def.h) name += ` ${def.h}`;
		if (def && def.f) name += ` Lv ${def.f}${def.g ? '+' : ''}`;
		return name;
	}

	skill(index) {
		return (this.names.skills && this.names.skills[index]) || `Skill ${index}`;
	}

	quest(id) {
		return titleCase((this.names.quests && this.names.quests[id]) || `Quest ${id}`);
	}
}

// ---- the Your hero popup's sections ----------------------------------------------------------

function heroListHtml(profile, chosen) {
	return profile.l.map((hero, i) => {
		const selected = i === chosen ? ' selected' : '';
		const star = i === profile.H0 ? '<span class="game-pick" title="Selected in the game">★</span>' : '';
		const away = hero.n > 0 ? '<span class="muted small">away</span> · ' : '';
		return `<div class="row hero-row${selected}" data-i="${i}" title="Hero index ${i}"><span>${star}Hero ${i + 1}${hero.p ? ` · ${esc(hero.p)}` : ''}</span><span>${away}Lv ${hero.g}</span></div>`;
	}).join('');
}

function awayNoteHtml(sheet) {
	return sheet.away > 0 ? `<div class="note">Away when the save was made (about ${awayText(sheet.away)} left then).</div>` : '';
}

function statsHtml(sheet) {
	return STAT_ROWS.map(([key, label]) => `<div class="stat"><span class="muted">${label}</span><b>${sheet[key]}</b></div>`).join('');
}

// as the game names it: "Sword for a hero Lv 4+"; durability left / max; ★ = incrustation
function gearHtml(sheet, names) {
	return sheet.gear.map((g, slot) => {
		if (!g) return `<div class="row"><span class="muted">${SLOTS[slot]}</span><span>—</span></div>`;
		const lvl = g.level ? ` <b>Lv ${g.level}${g.plus ? '+' : ''}</b>` : '';
		const dur = g.durMax ? ` <span class="muted small" title="Durability">${g.dur} / ${g.durMax}</span>` : '';
		const inc = g.enh ? ' <span title="Incrustation">★</span>' : '';
		return `<div class="row"><span class="muted">${SLOTS[slot]}</span><span>${esc(names.item(g.id))}${lvl}${inc}${dur}</span></div>`;
	}).join('');
}

function companionsHtml(sheet, names) {
	if (!sheet.pets.length) return '<div class="muted">None.</div>';
	return sheet.pets.map((pet, i) => {
		const notTaken = i >= 3 ? ' <span class="muted">(not taken)</span>' : '';
		const food = pet.foodLeft > 0 ? `${esc(names.fullItem(pet.food))} ×${pet.foodLeft}` : '<span class="muted">no food</span>';
		return `<div class="row"><span>Companion ${i + 1}${notTaken}</span><span>${food}</span></div>`;
	}).join('');
}

function skillsHtml(sheet, names) {
	const learned = sheet.skills.map((level, index) => [level, index]).filter(([level]) => level > 0);
	return learned.map(([level, index]) => `<div class="row"><span>${esc(names.skill(index))}</span><span>${level}</span></div>`).join('') || '<div class="muted">None yet.</div>';
}

function feeHtml(pack, names) {
	if (!pack.fee.length) return '';
	return `<div class="mp-line"><span class="muted">Entry fee${pack.feePaid ? '' : ' (you are short)'}</span><span>${pack.fee.map(([id, n]) => `${esc(names.fullItem(id))} ×${n}`).join(', ')}</span></div>`;
}

/** Why the pack differs from the usual one (the hero being away or busy is shown elsewhere). */
function gateNoteHtml(pack) {
	const gates = pack.gates.filter((g) => g.gate !== 'away' && g.gate !== 'busy');
	return gates.length ? `<div class="note">${gates.map((g) => esc(g.text[0].toUpperCase() + g.text.slice(1))).join('. ')}.</div>` : '';
}

function packItemsHtml(pack, names) {
	return pack.items.map(([id, n]) => `<div class="row" title="item ${id}"><span>${esc(names.fullItem(id))}</span><span>×${n}</span></div>`).join('') || '<div class="muted">Nothing.</div>';
}

function familiarsHtml(pack, names) {
	if (!pack.pets.length) return '<div class="muted">No companion with food.</div>';
	return pack.pets.map((p) => `<div class="row"><span>Familiar ${p.slot + 1} <span class="muted">(${esc(names.fullItem(p.food))})</span></span><span>${p.charges} ${p.charges === 1 ? 'charge' : 'charges'}</span></div>`).join('');
}

function activeQuestsHtml(progress, names) {
	if (!progress.activeQuests.length) return '<div class="muted">None.</div>';
	return progress.activeQuests.map((id) => `<div>${esc(names.quest(id))}</div>`).join('');
}

function unlockedHtml(progress) {
	return progress.unlocked.map(typeLabel).join(' ') || '<span class="muted">None.</span>';
}

/** When the save was made, where the hero was, and the file name. */
function saveLineHtml(info) {
	const saved = info && info.savedAt ? new Date(info.savedAt * 1000) : null;
	return `${saved ? `Saved ${saved.toLocaleString()}` : ''}${info && info.inDungeon ? ' · inside a dungeon' : ' · in town'}${info && info.file ? ` · ${esc(info.file)}` : ''}`;
}

// keep the chosen hero in view (the list scrolls by itself; scrollIntoView would also move the popup)
function keepChosenHeroInView(body) {
	const list = body.querySelector('.hero-list');
	const chosen = body.querySelector('.hero-row.selected');
	if (!list || !chosen) return;
	if (chosen.offsetTop < list.scrollTop || chosen.offsetTop + chosen.offsetHeight > list.scrollTop + list.clientHeight) {
		list.scrollTop = Math.max(0, chosen.offsetTop - list.clientHeight / 2);
	}
}

// ---- reading and keeping a save ------------------------------------------------------------

/** The guild.dat in a file: the file itself, or the one in the game's export zip. */
async function guildBytes(bytes, zip) {
	if (!zip.isZip(bytes)) return bytes;
	const exported = await zip.readExport(bytes);
	if (!exported.guild) throw new Error('This zip has no guild.dat. Use the file from the game\'s Settings → Export.');
	return exported.guild;
}

/** The hero to show: `pickedBefore` if the save has it, else the one selected in the game. */
function heroToShow(profile, pickedBefore) {
	const n = profile.l.length;
	if (pickedBefore >= 0 && pickedBefore < n) return pickedBefore;
	return profile.H0 >= 0 && profile.H0 < n ? profile.H0 : 0;
}

/** A lib/utils popup that is on screen (its backdrop is not faded out). */
function isPopupShown(popup) {
	return !!popup.parentNode && Number(popup.parentNode.style.opacity) > 0;
}

function carriesFiles(e) {
	return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}

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

/** short string hash (FNV-1a), for the progress key */
function hash(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}
