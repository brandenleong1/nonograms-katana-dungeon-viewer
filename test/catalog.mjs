// data/catalog.json, the table of what every creature and object is: every species and object the generator places
// has an entry, every entry has a name and a kind the map can draw, and js/view/catalog.js classifies every id exactly
// as it did before the table existed (MAIN_* below, a frozen copy of that code), so the map looks the same, except
// where that code was wrong (KIND_FIXES). Also the level's wild familiars (level.companions) and mine-cart riders.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables, vj0, zw } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { freshProfile, withProgress } from '../js/gen/progress-spec.js';
import { toggles } from '../js/gen/progress-reads.js';
import { formatLabel } from '../js/labels.js';
import { KINDS, objectKind, critterKind, critterName, objectName, familiarRank, catalogEntries } from '../js/view/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
initTables(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tables.json'), 'utf8')));
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const { creatures, objects } = catalogEntries();

const SEEDS_PER_TYPE = 4;
const SOURCES = new Set(['wiki', 'ours']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const FAMILIES = new Set(['Dungeon', 'Forest', 'Cave', 'Tomb']);
// critter tags (qw.h) that change a creature's kind or name: bosses, mini-bosses, lost adventurers, quest people
const TAGS = [0, 41, 1000, 1001, 1002, 1004, 1005, 1007, 1100, 1101, 1103, 2041];
// the kinds that changed on purpose: object 84 is the caves' mine cart (a creature that steps in rides it along the
// rails with +4 defence: c30 movement, aw.k flag 512), which the old code drew as reeds ('cover')
const KIND_FIXES = new Map([[84, { was: 'cover', now: 'minecart' }]]);

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

function main() {
	checkHeader();
	checkEntries('creature', creatures);
	checkEntries('object', objects);
	checkTablesCovered();
	const sample = generatedSample();
	checkSampleCovered(sample);
	checkKindsUnchanged(sample);
	checkFamiliars(sample);
	checkCartRiders(sample);
	checkNames();

	for (const f of failures.slice(0, 40)) console.log(`FAIL ${f}`);
	if (failures.length > 40) console.log(`… ${failures.length - 40} more`);
	console.log(`${passed} passed, ${failures.length} failed (${sample.levels} dungeons, ${new Set(sample.critters.map((c) => c.id)).size} species sampled)`);
	process.exit(failures.length ? 1 : 0);
}

// ---- the file ----------------------------------------------------------------------------------------------------

/** the attribution the CC BY-SA licence asks for */
function checkHeader() {
	const about = raw.about || {};
	check('header names the wiki as the source', /nonograms-katana\.fandom\.com/.test(about.source || ''));
	check('header has a retrieval date', /^\d{4}-\d\d-\d\d$/.test(about.retrieved || ''), about.retrieved);
	check('header gives the licence', /CC BY-SA 3\.0/.test(about.licence || ''));
}

function checkEntries(what, entries) {
	for (const [id, e] of Object.entries(entries)) {
		check(`${what} ${id} has a name`, typeof e.name === 'string' && e.name.trim() !== '', JSON.stringify(e));
		check(`${what} ${id} has a kind the map draws`, e.kind in KINDS, e.kind);
		check(`${what} ${id} says where its name comes from`, SOURCES.has(e.source), e.source);
		if ('confidence' in e) check(`${what} ${id} confidence`, CONFIDENCE.has(e.confidence), e.confidence);
		if (e.byFamily) check(`${what} ${id} byFamily names families`, Object.keys(e.byFamily).every((f) => FAMILIES.has(f)), Object.keys(e.byFamily).join());
	}
}

function checkTablesCovered() {
	const missingCreatures = [...zw.R.keys()].filter((id) => !creatures[id]);
	const missingObjects = [...zw.Q.keys()].filter((id) => !objects[id]);
	check('every species in zw.R has an entry', !missingCreatures.length, missingCreatures.join());
	check('every object in zw.Q has an entry', !missingObjects.length, missingObjects.join());
}

// ---- generated dungeons ------------------------------------------------------------------------------------------

/**
 * Creatures and objects from dungeons the generator builds: SEEDS_PER_TYPE seeds of every type on a new game, and one
 * seed of each type a progress state changes (js/gen/progress-reads.js toggles: quests, mini-bosses, extra bosses;
 * not the random combinations, which only repeat those reads).
 */
function generatedSample() {
	const fresh = freshProfile();
	const out = { critters: [], objects: [], levels: 0, withFamiliars: [], withRiders: [] };
	const add = (profile, type, seed) => {
		vj0.i2 = profile;
		let level;
		try { level = generate(type, seed); } catch { return; }
		out.levels++;
		const label = formatLabel(type, seed);
		for (const c of level.critters) out.critters.push({ ...c, label });
		for (const o of level.objects) out.objects.push({ ...o, label, type });
		if (level.companions.length) out.withFamiliars.push(level);
		if (level.cartRiders.length) out.withRiders.push(level);
	};
	for (let type = 0; type < 27; type++) for (let s = 1; s <= SEEDS_PER_TYPE; s++) add(fresh, type, s * 104729 + type);
	for (const [i, t] of toggles(fresh).entries()) {
		if (t.name.startsWith('random')) continue;
		let profile;
		try { profile = withProgress(fresh, t.progress); } catch { continue; }
		for (const type of t.types) add(profile, type, i * 7919 + type + 1);
	}
	vj0.i2 = fresh;
	return out;
}

function checkSampleCovered(sample) {
	const missing = new Set();
	for (const c of sample.critters) if (!creatures[c.id]) missing.add(`creature ${c.id} (${c.label})`);
	for (const o of sample.objects) if (!objects[o.id]) missing.add(`object ${o.id} (${o.label})`);
	check(`every creature and object in ${sample.levels} generated dungeons has an entry`, !missing.size, [...missing].slice(0, 10).join(', '));
	const species = new Set(sample.critters.map((c) => c.id));
	check('the sample places at least 250 species (a smaller one would prove little)', species.size >= 250, String(species.size));
}

/** Every id, in every tag the generator gives, and every creature and object of the sample; KIND_FIXES are the
 * documented exceptions, and have to have changed. */
function checkKindsUnchanged(sample) {
	const bad = [];
	for (const id of [...zw.Q.keys(), ...range(0, 140)]) {
		const rw = zw.Q.get(id);
		if (objectKind({ id }, rw) !== expectedObjectKind({ id }, rw)) bad.push(`object ${id}`);
	}
	for (const [id, { was, now }] of KIND_FIXES) {
		check(`object ${id}'s kind changed on purpose from ${was} to ${now}`, MAIN_objectKind({ id }, zw.Q.get(id)) === was && objectKind({ id }, zw.Q.get(id)) === now);
	}
	for (const id of [...zw.R.keys(), 0, 999]) {
		const bw = zw.R.get(id);
		for (const h of TAGS) for (const k of [0, 1, 2]) for (const g of [0, 167]) {
			const cr = { id, h, k, g };
			if (critterKind(cr, bw) !== MAIN_critterKind(cr, bw)) bad.push(`creature ${id} h=${h} k=${k} g=${g}`);
		}
	}
	for (const c of sample.critters) if (critterKind(c, zw.R.get(c.id)) !== MAIN_critterKind(c, zw.R.get(c.id))) bad.push(`creature ${c.id} in ${c.label}`);
	for (const o of sample.objects) if (objectKind(o, zw.Q.get(o.id)) !== expectedObjectKind(o, zw.Q.get(o.id))) bad.push(`object ${o.id} in ${o.label}`);
	check('every id is classified as before the catalog existed (but for KIND_FIXES)', !bad.length, bad.slice(0, 10).join(', '));
}

function expectedObjectKind(obj, rw) {
	return KIND_FIXES.get(obj.id)?.now ?? MAIN_objectKind(obj, rw);
}

/** level.cartRiders are creatures of the level, in caves only (where the mine carts are) */
function checkCartRiders(sample) {
	const carts = sample.objects.filter((o) => o.id === 84);
	check('mine carts are only in caves (6A-6D)', carts.length > 0 && carts.every((o) => o.type >= 19 && o.type <= 22), String(carts.length));
	check('the sample has creatures starting in a mine cart', sample.withRiders.length > 0);
	let bad = 0;
	for (const level of sample.withRiders) {
		if (level.type < 19 || level.type > 22) bad++;
		for (const p of level.cartRiders) if (!level.critters.some((c) => c.x === p.x && c.y === p.y)) bad++;
	}
	check('every mine-cart rider is a creature in a cave', !bad, `${bad} in ${sample.withRiders.length} dungeons`);
}

/** level.companions[i] is the wild familiar critter 190 + i: it is drawn as a familiar, looks like a named monster
 * and has a rank (js/view/catalog.js familiarRank) */
function checkFamiliars(sample) {
	check('the sample has wild familiars', sample.withFamiliars.length > 0);
	let bad = 0;
	for (const level of sample.withFamiliars) {
		const pets = level.critters.filter((c) => c.id >= 190 && c.id < 194);
		if (pets.length !== level.companions.length) bad++;
		for (const c of pets) if (critterKind(c, zw.R.get(c.id)) !== 'familiar' || familiarRank(level, c) === null) bad++;
		for (const f of level.companions) if (!critterName({ id: f.id })) bad++;
	}
	check('every wild familiar has a look and a rank', !bad, `${bad} of ${sample.withFamiliars.length} dungeons`);
}

/** a few names players know, as the wiki gives them (issue #28) */
function checkNames() {
	const objectNamed = (id, name, family = 'Dungeon', h = 0) => check(`object ${id} is "${name}" in the ${family}`, objectName({ id, h }, family) === name, objectName({ id, h }, family));
	objectNamed(21, 'Purple chest');
	objectNamed(37, 'Golden chest');
	objectNamed(94, 'Black sarcophagus', 'Tomb');
	objectNamed(28, 'Brick door');
	objectNamed(28, 'Tree stump door', 'Forest');
	objectNamed(32, 'Railroad switch', 'Cave', 1201);
	objectNamed(84, 'Mine cart', 'Cave');
	const creatureNamed = (id, name) => check(`creature ${id} is "${name}"`, critterName({ id }) === name, critterName({ id }));
	creatureNamed(201, 'Scorpion');      // 1A-1C, first in the bestiary
	creatureNamed(267, 'Bone Dragon');   // the 3C boss
	creatureNamed(620, 'Anubis');
	creatureNamed(414, 'Dark Lady');
}

function range(from, to) {
	return Array.from({ length: to - from }, (_, i) => from + i);
}

// ---- js/view/catalog.js before data/catalog.json (frozen; the map must keep drawing every id like this) ---------
// as on main at b273cfa: with the shapeshifter kind (#43) and the wild familiar kind for critters 190..193 (#42)

const MAIN_OBJECT_KIND = new Map();
for (const [kind, ids] of Object.entries({
	chest: [21, 37, 94], page: [15, 55, 110], container: [2, 7, 34, 41, 42, 43, 44, 61, 62, 66, 67, 68, 69, 70, 102, 122],
	breakable: [3, 4, 26, 104, 105, 106, 12, 13, 20, 107, 108, 109, 121], ore: [49, 50, 51, 63, 64, 65], mpdoor: [27],
	stuckdoor: [28, 73], lockdoor: [29], gate: [33], lever: [32], puzzledoor: [35], barreldoor: [60], bossgate: [53],
	ladder: [40], hatch: [38, 39, 74], portal: [88], teleport: [126], barrel: [59], trap: [30], fountain: [48, 58, 124, 54],
	special: [85, 86, 87], torchstatue: [95], cover: [84], marker: [52],
})) for (const id of ids) MAIN_OBJECT_KIND.set(id, kind);

function MAIN_objectKind(obj, rw) {
	const k = MAIN_OBJECT_KIND.get(obj.id);
	if (k) return k;
	if (rw && rw.t) return 'chest';
	return 'decor';
}

function MAIN_critterKind(cr, bw) {
	if (cr.id === 180) return 'hero';
	if (cr.id === 199) return 'spider';
	if (cr.id >= 190 && cr.id < 194) return 'familiar';
	if (cr.h === 1101 || cr.h === 1103) return 'boss';
	if (cr.h === 1100) return 'miniboss';
	if (cr.k === 0 || cr.k === 1) return (bw && bw.N0) || cr.h === 1000 ? 'shapeshifter' : 'npc';
	if (cr.g === 167) return 'goldmonster';
	if (bw && bw.l0) return 'unique';
	if (bw && bw.m0) return 'boss';
	return 'monster';
}

main();
