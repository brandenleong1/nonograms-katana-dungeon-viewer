// Save import check: js/save importSave() vs the game's own loader (oracle `loadsave` golden JSON).
//
//   node test/save.mjs [-v] [--oracle]
//
//   --oracle   (re)build the goldens first with ../nonograms-katana/tools/oracle/run.sh:
//              savegen (synthetic saves written by the game's vj0.n2: town, mid-dungeon hw for several dungeon
//              families, autonomous ew), then loadsave on each of them and on the user's export.
//
// Inputs (all outside this repo; nothing derived from the user's save is ever written here):
//   NK_SAVE      the user's export zip  (default ../nonograms-katana/saves/NonogramsKatana.zip, skipped if absent)
//   NK_SAVE_DIR  goldens + synthetic saves (default ~/.cache/nk-oracle/save)
//   NK_RE        RE project with tools/oracle (default ../nonograms-katana)
//
// Per save: vj0 deep-compared field by field with the golden (clock fields O/P/S/T excepted), plus the static
// tables the loader writes (ki0 A1[].g, the wi0 offer vj0.Y, monster templates bw 190..199). When the save
// holds a dungeon (hw), it is also regenerated from its label (type, seed) with the imported profile as vj0.i2
// and the layout is compared with the saved one; differences there are reported, not failed (play changes it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initTables, vj0 as V, zw } from '../js/gen/index.js';
import { revive } from '../js/gen/revive.js';
import { compare } from '../js/gen/compare.js';
import { generate } from '../js/gen/generate.js';
import { importSave } from '../js/save/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
const SAVE = process.env.NK_SAVE || path.join(RE, 'saves/NonogramsKatana.zip');
const WORK = process.env.NK_SAVE_DIR || path.join(os.homedir(), '.cache/nk-oracle/save');
const RUN = path.join(RE, 'tools/oracle/run.sh');
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const tablesJson = fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8');

// synthetic saves: [kind, dungeon type, seed]
const SYNTH = [
	['town', 0, 1],
	['hw', 0, 4242], ['hw', 8, 172582050], ['hw', 14, 99], ['hw', 15, 12345], ['hw', 18, 31337],
	['hw', 19, 2024], ['hw', 22, 5150], ['hw', 23, 777], ['hw', 26, 8080],
	['ew', 3, 777],
];

if (args.includes('--oracle')) {
	const synth = path.join(WORK, 'synth');
	fs.mkdirSync(synth, { recursive: true });
	const run = (...a) => execFileSync(RUN, a, { stdio: ['ignore', 'ignore', 'inherit'] });
	for (const [k, t, s] of SYNTH) {
		run('savegen', k, String(t), String(s), synth);
		const f = path.join(synth, `${k}-${t}-${s}.dat`);
		run('loadsave', f, f.replace(/\.dat$/, '.json'));
	}
	if (fs.existsSync(SAVE)) run('loadsave', SAVE, path.join(WORK, 'user.json'));
}

const cases = [];
if (fs.existsSync(SAVE) && fs.existsSync(path.join(WORK, 'user.json'))) cases.push({ name: 'user export', save: SAVE, golden: path.join(WORK, 'user.json') });
else console.log(`(user save: ${fs.existsSync(SAVE) ? 'no golden, run with --oracle' : 'not found'}; skipped)`);
const synthDir = path.join(WORK, 'synth');
if (fs.existsSync(synthDir)) {
	for (const f of fs.readdirSync(synthDir).sort()) {
		if (!f.endsWith('.dat')) continue;
		const g = path.join(synthDir, f.replace(/\.dat$/, '.json'));
		if (fs.existsSync(g)) cases.push({ name: f.replace(/\.dat$/, ''), save: path.join(synthDir, f), golden: g });
	}
}
if (!cases.length) {
	console.log(`no saves with goldens in ${WORK}; run: node test/save.mjs --oracle`);
	process.exit(1);
}

/** follow a compare() path ($.a[3].h, $.o{12}) */
function at(root, p) {
	let cur = root;
	const re = /\[(\d+)\]|\{([^}]*)\}|\.([A-Za-z0-9$_]+)/g;
	let t;
	while ((t = re.exec(p.slice(1)))) {
		if (cur == null) return undefined;
		if (t[1] !== undefined) cur = cur[+t[1]];
		else if (t[2] !== undefined) cur = cur.get(Number.isNaN(+t[2]) ? t[2] : +t[2]);
		else cur = cur[t[3]];
	}
	return cur;
}

/**
 * compare(), except that an "identity differs" on an array is accepted when the contents are equal:
 * data/tables.json keeps game-object identity but not array identity (Snap's compact table form), so arrays the
 * game shares between objects (e.g. ni0.h upgrade lists) are separate copies in the fresh profile.
 */
function deepDiff(actual, expected) {
	const raw = compare(actual, expected, { limit: 1000 });
	const out = [];
	let relaxed = 0;
	for (const d of raw) {
		const m = /^(\S+): identity differs/.exec(d);
		if (m) {
			const a = at(actual, m[1]), e = at(expected, m[1]);
			if ((Array.isArray(e) || ArrayBuffer.isView(e)) && compare(a, e, { limit: 1 }).length === 0) { relaxed++; continue; }
		}
		out.push(d);
	}
	return { diffs: out, relaxed };
}

const key = (o) => `${o.a.a}@${o.b.a},${o.b.b}`;
function layoutDiff(saved, gen) {
	const out = [];
	if (gen.w !== saved.g || gen.h !== saved.h) return [`size ${gen.w}x${gen.h} != saved ${saved.g}x${saved.h}`];
	let cells = 0;
	for (let i = 0; i < saved.i; i++) if (gen.cells[2 * i] !== saved.j[i].a || gen.cells[2 * i + 1] !== saved.j[i].b) cells++;
	out.push(`cells ${cells}/${saved.i} differ`);
	const multiset = (list) => { const m = new Map(); for (const k of list) m.set(k, (m.get(k) || 0) + 1); return m; };
	const minus = (a, b) => { const r = []; for (const [k, n] of a) for (let i = (b.get(k) || 0); i < n; i++) r.push(k); return r; };
	for (const [what, sv, gv] of [
		['objects', saved.n.map(key), gen.objects.map((o) => `${o.id}@${o.x},${o.y}`)],
		['critters', saved.o.map(key), gen.critters.map((o) => `${o.id}@${o.x},${o.y}`)],
	]) {
		const s = multiset(sv), g = multiset(gv);
		const onlyS = minus(s, g), onlyG = minus(g, s);
		out.push(`${what} saved ${sv.length} / generated ${gv.length}`
			+ (onlyS.length ? `; only saved: ${onlyS.slice(0, 6).join(' ')}${onlyS.length > 6 ? ` (+${onlyS.length - 6})` : ''}` : '')
			+ (onlyG.length ? `; only generated: ${onlyG.slice(0, 6).join(' ')}${onlyG.length > 6 ? ` (+${onlyG.length - 6})` : ''}` : ''));
	}
	if (gen.y !== saved.y) out.push(`objectives y ${gen.y} != saved ${saved.y}`);
	return out;
}

let pass = 0, fail = 0;
for (const c of cases) {
	const tables = initTables(JSON.parse(tablesJson));   // fresh statics per save: the loader writes some
	const gold = JSON.parse(fs.readFileSync(c.golden, 'utf8'));
	const problems = [];
	let res;
	try {
		res = await importSave(fs.readFileSync(c.save));
	} catch (e) {
		problems.push(`import threw: ${verbose ? e.stack : e.message}`);
	}
	let relaxed = 0;
	if (res) {
		const E = revive(gold.vj0, tables);
		const A = res.vj0;
		for (const k of ['O', 'P', 'S', 'T']) A[k] = E[k];     // wall clock / boot clock at load time
		for (const k of ['X', 'D0']) {                        // longs: BigInt here, JSON numbers in the golden
			if (BigInt(Math.round(Number(E[k]))) !== BigInt(A[k]) && Number.isSafeInteger(E[k])) problems.push(`${k}: ${A[k]} != ${E[k]}`);
			A[k] = E[k];
		}
		const d = deepDiff(A, E);
		relaxed = d.relaxed;
		problems.push(...d.diffs.map((x) => 'vj0' + x.slice(1)));
		const st = gold.statics;
		const a1 = V.A1.map((t) => t.g);
		if (JSON.stringify(a1) !== JSON.stringify(st.A1g)) problems.push('statics: vj0.A1[].g differ');
		if (st.Y == null ? A.Y != null : compare(A.Y, revive(st.Y)).length) problems.push('statics: vj0.Y differs');
		for (let id = 190; id < 200; id++) {
			const dd = compare(zw.c_(id), revive(st.bw[id]), { limit: 3 });
			if (dd.length) problems.push(`statics: bw ${id}: ${dd.join('; ')}`);
		}
		if (JSON.stringify(res.header.ints) !== JSON.stringify(gold.header)) problems.push('header ints differ');
	}
	const ok = problems.length === 0;
	if (ok) pass++; else fail++;
	const dn = res?.dungeon;
	const what = !res ? '' : res.marker === 0 ? 'no dungeon' : res.marker === 1 ? `hw ${dn.b}-${dn.a} ${dn.g}x${dn.h}` : `ew ${dn.b}-${dn.a}`;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: ${what}${relaxed ? ` (${relaxed} shared arrays compared by value)` : ''}`);
	for (const p of problems.slice(0, verbose ? 60 : 8)) console.log('     ' + p);
	if (res?.notes.length) for (const n of res.notes) console.log('     note: ' + n);
	if (res && res.marker === 1) {
		const prev = V.i2;
		V.i2 = res.vj0;
		try {
			const gen = generate(dn.b, dn.a);
			for (const l of layoutDiff(dn, gen)) console.log('     regen: ' + l);
		} catch (e) {
			console.log('     regen: threw ' + e.message);
		} finally {
			V.i2 = prev;
		}
	}
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
