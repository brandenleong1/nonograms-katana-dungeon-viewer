// State cloning check (js/combat/clone.js): snapshot / restore against uninterrupted replays of corpus fights.
//
//   node test/clone.mjs [options] [file.json | dir]...      default dir: ~/.cache/nk-oracle/fights
//     --all          every corpus file (default: a sample, about 1 in 3 per type plus every save / scenario file)
//     --types=0,8    only these dungeon types        --only=REGEX   only files whose name matches
//     --ks=N         snapshot points per fight (default 6)          --seed=S   random branches' seed
//     --no-fp        skip the deep fingerprints (fight graph and every static object) at snapshot vs restore
//     --no-debug     clone.js without its debug checks (field lists, owned objects, shared fields)
//     -v             per-file lines
//
// Per file (fight files whose JS replay matches the oracle; others are skipped and listed):
//   run A   apply every input with records; snapshot at k points spread over the fight: 0 (right after init),
//           the first combat step, while a skill/item is selected, while an action is pending (hw.F/G/H, tap
//           path), right after a dialog, and random ones. Run A's records must still equal the oracle's (a
//           snapshot does not disturb the fight).
//   per k   (1) restore, replay k..end: records equal run A's.
//           (2) restore, play a random input sequence (a branch), restore again, replay k..: equal.
//           (3) restore into the dead branch fight (reused arrays), replay: equal.
//           (4) lean: snapshot without the Recorder, restore, step(): statuses agree with run A's records.
//           (5) fingerprints: the restored fight graph (identity structure included) and every static object
//               (tables, profile, pins) equal those at the snapshot.
//   cross   a state of the previous file, restored after this file ran (other dungeon, statics reset since).
//   statics after each file, resetStatics (in-place) gives statics identical to the pristine ones.
// Also: newFight twice on the same spec (the generated-dungeon cache) gives identical init records. Profile fights
// (fightgen --profile, js/combat/entry.js) the same way, through newFightFromProfile (twice on one imported profile:
// its working copy restored, the profile's gen cache).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../js/combat/all.js';
import { newFight, specOf, errText } from '../js/combat/driver.js';
import { resetStatics } from '../js/combat/setup.js';
import { snapshot, restore, setCloneDebug, liveLayout } from '../js/combat/clone.js';
import { tables, vj0 as V, zw, xs } from '../js/gen/statics.js';
import { importSave } from '../js/save/index.js';
import { newFightFromProfile } from '../js/combat/entry.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));

const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const verbose = args.includes('-v');
const all = args.includes('--all');
const doFp = !args.includes('--no-fp');
const types = opt('types') ? new Set(opt('types').split(',').map(Number)) : null;
const only = opt('only') ? new RegExp(opt('only')) : null;
const nks = +(opt('ks') ?? 6);
let seed = +(opt('seed') ?? 12345);
setCloneDebug(!args.includes('--no-debug'));

const inputs = args.filter((a) => !a.startsWith('-'));
if (!inputs.length) inputs.push(path.join(os.homedir(), '.cache/nk-oracle/fights'));
let files = [];
for (const p of inputs) {
	if (fs.statSync(p).isDirectory()) {
		for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.json') && f !== 'index.json') files.push(path.join(p, f));
	} else files.push(p);
}
if (!all && inputs.length === 1 && fs.statSync(inputs[0]).isDirectory()) {
	// sample: every save / scenario file, and 1 in 3 of the others (rotating through the categories)
	let i = 0;
	files = files.filter((f) => { const b = path.basename(f); return /^(save|sc)-/.test(b) || /^\d+-(chain-a|start|boss)/.test(b) || i++ % 3 === 0; });
}
const indexes = new Map();
function indexFor(file) {
	const d = path.dirname(file);
	if (!indexes.has(d)) {
		const p = path.join(d, 'index.json');
		indexes.set(d, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
	}
	return indexes.get(d);
}

// ---- helpers ----------------------------------------------------------------------------------
let rs = seed >>> 0;
const rnd = (n) => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return (rs >>> 8) % n; };

/** a random input near the hero (the vocabulary of ORACLE.md) */
function randomInput(fight) {
	const f = fight.h.f;
	const x = f.b.a, y = f.b.b;
	const near = () => ({ x: x + rnd(7) - 3, y: y + rnd(7) - 3 });
	switch (rnd(10)) {
		case 0: case 1: case 2: { const d = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1]][rnd(6)]; return { t: 'step', dx: d[0], dy: d[1] }; }
		case 3: return { t: 'tap', ...near() };
		case 4: return { t: 'wait' };
		case 5: return { t: 'skill', id: 20002 + rnd(6), ...(rnd(2) ? near() : {}) };
		case 6: return { t: 'item', id: [143, 144, 168, 174, 209][rnd(5)], ...near() };
		case 7: return { t: 'potion', id: 120 };
		case 8: return { t: 'cancel' };
		default: return { t: 'unseal', ...near() };
	}
}

/** a record as the oracle comparison sees it (test/combat.mjs diffRecord): fields in key order, err by presence */
const canon = (r) => {
	const o = {};
	for (const k of Object.keys(r).sort()) {
		let v = r[k];
		if (k === 'err') v = v != null;
		if (k === 'rng' && v && v.d) v = { ...v, d: v.d.map((d) => [d[0], d[1]]) };
		o[k] = v;
	}
	return JSON.stringify(o);
};

const stripRec = (r) => {
	const o = { ...r };
	if (o.err) o.err = 'err';
	return JSON.stringify(o);
};

/** deep fingerprint: path -> value; objects named by first-visit path, later references "@path"; `named` objects by name */
function fingerprint(roots, named = null) {
	const out = [];
	const seen = new Map();
	const st = [];
	for (const [p, v] of Object.entries(roots).reverse()) st.push([v, p]);
	while (st.length) {
		const [v, p] = st.pop();
		if (v === null || v === undefined || typeof v !== 'object') { out.push(p + '=' + (typeof v === 'function' ? 'fn' : typeof v === 'bigint' ? v + 'n' : typeof v === 'number' && Object.is(v, -0) ? '-0' : String(v))); continue; }
		if (named) { const n = named.get(v); if (n !== undefined) { out.push(p + '=$' + n); continue; } }
		const s = seen.get(v);
		if (s !== undefined) { out.push(p + '=@' + s); continue; }
		seen.set(v, p);
		const cn = v.constructor ? v.constructor.name : 'null';
		if (ArrayBuffer.isView(v)) { out.push(p + '=<' + cn + '>' + Array.from(v).join(',')); continue; }
		out.push(p + '=<' + cn + '>' + (Array.isArray(v) ? v.length : ''));
		if (v instanceof Map) {
			const ch = [];
			let i = 0;
			for (const [k, x] of v) { ch.push([k, `${p}{#${i}}k`]); ch.push([x, `${p}{#${i}}`]); i++; }
			for (const c of ch.reverse()) st.push(c);
			continue;
		}
		const ks = Object.keys(v);
		for (let i = ks.length - 1; i >= 0; i--) {
			const k = ks[i];
			if (cn === 'Recorder' && k === 'f') continue;
			st.push([v[k], p + '.' + k]);
		}
	}
	return out;
}

function staticRoots() {
	const r = {};
	for (const k of Object.keys(tables.roots)) {
		const [c, f] = k.split('.');
		const ns = c === 'zw' ? zw : c === 'x30' ? xs : c === 'vj0' ? V : null;
		r[k] = ns ? ns[f] : tables.roots[k];
	}
	r.profile = V.i2;
	return r;
}

/** static objects named by their path (so fight fingerprints compare references to them by name) */
function staticNames() {
	const fp = new Map();
	const st = Object.entries(staticRoots()).map(([p, v]) => [v, p]);
	while (st.length) {
		const [v, p] = st.pop();
		if (v === null || typeof v !== 'object' || fp.has(v)) continue;
		fp.set(v, p);
		if (ArrayBuffer.isView(v)) continue;
		if (v instanceof Map) { let i = 0; for (const [k, x] of v) { st.push([k, `${p}{#${i}}k`]); st.push([x, `${p}{${i++}}`]); } continue; }
		for (const k of Object.keys(v)) st.push([v[k], p + '.' + k]);
	}
	// only the shared ones (pins and tables); fight objects hanging off pins are walked as part of the fight
	const { shared } = liveLayout();
	for (const o of [...fp.keys()]) if (!shared.has(o)) fp.delete(o);
	return fp;
}

const fightFp = (fight) => fingerprint({ h: fight.h, c: fight.c, dgv: fight.dgv, tb: fight.tb, rec: fight.rec, st: fight.st, index: fight.index }, staticNames());
const staticsFp = () => fingerprint(staticRoots());

function fpDiff(a, b, max = 6) {
	const out = [];
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n && out.length < max; i++) if (a[i] !== b[i]) out.push(`${a[i] ?? '-'}  |  ${b[i] ?? '-'}`);
	return out;
}

/** the save of a fight-mode or --profile file: index.json, else <dir>/saves/, ../nonograms-katana/saves, the synthetic saves */
function savePathOf(file, name, base) {
	const ix = indexFor(file)[name];
	const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
	const cands = [ix && ix.save, path.join(path.dirname(file), 'saves', base), path.join(RE, 'saves', base),
		path.join(os.homedir(), '.cache/nk-oracle/save/synth', base), path.join(os.homedir(), '.cache/nk-oracle/save/prof/synth', base)];
	return cands.find((c) => c && fs.existsSync(c)) || cands[1];
}

/** import what the spec needs (fight mode: spec.imported; profile: spec.vj0) */
async function loadFor(spec, file, name, or) {
	if (spec.mode === 'fight') spec.imported = await importSave(fs.readFileSync(savePathOf(file, name, or.save)));
	else if (spec.profile) spec.vj0 = (await importSave(fs.readFileSync(savePathOf(file, name, or.profile)))).vj0;
}

const makeFight = (spec, opts) => (spec.profile ? newFightFromProfile(spec, opts) : newFight(spec, opts));

/** the k points of a fight: see the header */
function pickKs(file, recs) {
	const n = file.inputs.length;
	const ks = new Set([0]);
	const steps = recs;
	const first = (pred) => { for (let i = 0; i < steps.length; i++) if (pred(steps[i], i)) return i + 1; return -1; };
	const add = (k) => { if (k >= 0 && k < n) ks.add(k); };
	add(first((s) => s.C === 1));
	add(first((s, i) => i > 2 && s.C === 1));
	add(first((s) => s.sel !== 0));
	add(first((s) => s.hero && (s.hero.F !== -1 || s.hero.path > 0)));
	add(first((s) => s.dlg > 0));
	add(first((s) => s.r === 'rejected'));
	while (ks.size < nks && ks.size < n) ks.add(rnd(n));
	return [...ks].sort((a, b) => a - b).slice(0, Math.max(nks, 6));
}

// ---- run --------------------------------------------------------------------------------------
let pass = 0, fail = 0, skipped = 0, checks = 0;
const skippedNames = [];
const t0 = Date.now();
resetStatics(tablesJson, { full: true });
const pristineFp = staticsFp();
let carry = null;   // { state, rest, name } from the previous file (cross-fight restore)

for (const file of files) {
	const name = path.basename(file, '.json');
	if (only && !only.test(name)) continue;
	const or = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (types && !types.has(or.type)) continue;
	if (or.error) { skipped++; continue; }
	const msgs = [];
	const bad = (m) => { msgs.push(m); };
	resetStatics(tablesJson);
	const spec = specOf(or);
	let fight;
	try {
		await loadFor(spec, file, name, or);
		fight = makeFight(spec);
	} catch (e) {
		bad(`setup threw ${errText(e)}`);
	}
	if (fight && fight.error) bad(`setup: ${fight.error}`);
	if (msgs.length) { fail++; console.log(`FAIL ${name}\n     ${msgs.join('\n     ')}`); continue; }

	// run A
	const n = or.inputs.length;
	const R = [];
	const keyRecs = [];
	let matchesOracle = canon(fight.init) === canon(or.init);
	for (let i = 0; i < n; i++) {
		const r = fight.apply(or.inputs[i]);
		R.push(stripRec(r));
		keyRecs.push(r);
		if (matchesOracle && canon(r) !== canon(or.steps[i])) matchesOracle = false;
	}
	if (!matchesOracle) { skipped++; skippedNames.push(name); if (verbose) console.log(`SKIP ${name}: JS replay differs from the oracle`); continue; }
	const ks = pickKs(or, keyRecs);

	// run A again, snapshotting at every k (must not disturb it), with fingerprints
	resetStatics(tablesJson);
	await loadFor(spec, file, name, or);
	fight = makeFight(spec);
	const snaps = new Map();
	for (let i = 0; i <= n; i++) {
		if (ks.includes(i)) {
			const s = snapshot(fight);
			const lean = snapshot(fight, { record: false });
			snaps.set(i, { s, lean, fp: doFp ? fightFp(fight) : null, sfp: doFp ? staticsFp() : null });
		}
		if (i === n) break;
		const r = stripRec(fight.apply(or.inputs[i]));
		if (r !== R[i]) { bad(`run A with snapshots differs at input ${i}`); break; }
	}

	const replay = (f, k, end, tag) => {
		for (let i = k; i < end; i++) {
			const r = stripRec(f.apply(or.inputs[i]));
			checks++;
			if (r !== R[i]) { bad(`${tag}: k=${k} input ${i} ${JSON.stringify(or.inputs[i])}\n       got  ${r.slice(0, 300)}\n       want ${R[i].slice(0, 300)}`); return false; }
		}
		return true;
	};

	let dead = null;
	for (const k of ks) {
		const { s, lean, fp, sfp } = snaps.get(k);
		// (1) restore, replay to the end
		let f = restore(s);
		if (doFp) {
			const a = fightFp(f);
			checks++;
			if (a.join('\n') !== fp.join('\n')) bad(`fingerprint of the restored fight differs at k=${k}:\n       ${fpDiff(fp, a).join('\n       ')}`);
			const b = staticsFp();
			checks++;
			if (b.join('\n') !== sfp.join('\n')) bad(`statics after restore differ at k=${k}:\n       ${fpDiff(sfp, b).join('\n       ')}`);
		}
		replay(f, k, n, 'restore');
		// (2) branch: random inputs, then restore and replay
		f = restore(s);
		const m = 5 + rnd(25);
		for (let j = 0; j < m; j++) {
			if (!(f.st === 'in' || f.st === 'idle' || f.st === 'cap')) break;
			f.step(randomInput(f));
		}
		dead = f;
		const f2 = restore(s);
		replay(f2, k, Math.min(n, k + 60), 'branch');
		// (3) restore into the dead branch fight
		const f3 = restore(s, dead);
		dead = null;
		replay(f3, k, Math.min(n, k + 60), 'into');
		// (4) lean
		const fl = restore(lean);
		for (let i = k; i < Math.min(n, k + 60); i++) {
			const st = fl.step(or.inputs[i]);
			const want = keyRecs[i];
			checks++;
			const same = st.st === want.st && (st.rej != null) === (want.r === 'rejected') && st.hp === want.hero.hp && st.ep === want.hero.ep &&
				st.mp === want.hero.mp && +st.dead === want.dead && +st.end === want.end && +st.C === want.C;
			if (!same) { bad(`lean: k=${k} input ${i}: ${JSON.stringify(st)} vs st=${want.st} r=${want.r} hp=${want.hero.hp} ep=${want.hero.ep} mp=${want.hero.mp} dead=${want.dead} end=${want.end} C=${want.C}`); break; }
		}
	}

	// cross-fight: the previous file's state, restored now
	if (carry) {
		const f = restore(carry.state);
		for (let i = 0; i < carry.rest.length; i++) {
			const r = stripRec(f.apply(carry.inputs[i]));
			checks++;
			if (r !== carry.rest[i]) { bad(`cross: state of ${carry.name} restored after this file differs at its input ${carry.k + i}`); break; }
		}
	}
	const kc = ks[Math.floor(ks.length / 2)];
	carry = { state: snaps.get(kc).s, rest: R.slice(kc, kc + 30), inputs: or.inputs.slice(kc, kc + 30), name, k: kc };

	// generated-dungeon cache: same spec twice
	if (spec.mode !== 'fight') {
		resetStatics(tablesJson);
		const a = makeFight(spec, { lean: false });
		resetStatics(tablesJson);
		const b = makeFight(spec, { lean: false });
		checks++;
		if (JSON.stringify(a.init) !== JSON.stringify(b.init) || JSON.stringify(a.header()) !== JSON.stringify(b.header())) bad('gen cache: second setup differs');
	}

	// in-place statics reset
	resetStatics(tablesJson);
	if (doFp) {
		const p = staticsFp();
		checks++;
		if (p.join('\n') !== pristineFp.join('\n')) bad(`resetStatics left statics different from pristine:\n       ${fpDiff(pristineFp, p).join('\n       ')}`);
	}

	if (msgs.length) {
		fail++;
		console.log(`FAIL ${name} (ks ${ks.join(',')})`);
		for (const m of msgs.slice(0, 12)) console.log('     ' + m);
	} else {
		pass++;
		if (verbose) console.log(`ok   ${name} (${n} inputs, ks ${ks.join(',')})`);
	}
}
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped${skippedNames.length ? ` (JS != oracle: ${skippedNames.join(' ')})` : ''}; ${checks} checks (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fail ? 1 : 0);
