// Generation under player progress: JS generate() with a progress spec (js/gen/progress-spec.js) vs the game's
// generator under the same spec (tools/oracle Harness `progbatch`), for every generation-relevant progress read
// (js/gen/progress-reads.js) toggled alone and in combinations, on all 27 dungeon types with several seeds each.
//
//   node test/progress.mjs [-v] [--oracle] [--seeds=N] [--extra=N] [--only=re] [--keep]
//
//   --oracle    (re)run the oracle for jobs whose dumps are missing or stale (6 JVMs in parallel)
//   --seeds=N   seeds per type for every job (default 3); --extra=N more seeds on the job's target types (default 5)
//   --only=re   only jobs whose name matches the regexp
//
// Per case: the full level (cells, regions, objects, critters, rooms, final RNG states e / f / w) equals the oracle's,
// or both engines fail with the same error. Per job: the oracle reads the spec back (`progress.json`) exactly as JS
// readProgress does. Each case is also compared with the new-game build of the same label in each engine and
// classed `layout` (cells, rooms, object / creature ids or positions, structure / cosmetic RNG), `item` (only drop
// ids qw.g), `tag` (only qw.h) or `loot` (only the loot stream hw.w); both engines must agree, and jobs with
// `expect` must change the layout of those types for some seed. Saves (the user's export, oracle synthetic saves)
// add their own progress as a job: readProgress(imported) applied to a new game must build exactly what the imported
// profile builds (the spec is complete for generation).
//
// Inputs / outputs (outside the repo): NK_PROG_DIR (default ~/.cache/nk-oracle/prog), NK_RE (../nonograms-katana),
// NK_SAVE (the user's export), ~/.cache/nk-oracle/fx7 (seeds; else seeds are drawn and checked with a new game).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';
import { initTables, vj0 as V, zw } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { readProgress, withProgress, freshProfile, applyProgress, sameProgress } from '../js/gen/progress-spec.js';
import { toggles } from '../js/gen/progress-reads.js';
import { importSave } from '../js/save/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
const RUN = path.join(RE, 'tools/oracle/run.sh');
const OUT = process.env.NK_PROG_DIR || path.join(os.homedir(), '.cache/nk-oracle/prog');
const SAVE = process.env.NK_SAVE || path.join(RE, 'saves/NonogramsKatana.zip');
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const verbose = args.includes('-v');
const runOracle = args.includes('--oracle');
const NSEED = +flag('seeds', 3), NEXTRA = +flag('extra', 5);
const only = flag('only', null) ? new RegExp(flag('only')) : null;
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
initTables(tablesJson);
let FRESH = freshProfile();

// ---- seeds ------------------------------------------------------------------------------------------------------
function seedsByType() {
	const fx = path.join(os.homedir(), '.cache/nk-oracle/fx7');
	const by = Array.from({ length: 27 }, () => []);
	if (fs.existsSync(fx)) {
		for (const f of fs.readdirSync(fx).sort()) {
			const m = /^(\d+)-(\d+)\.json$/.exec(f);
			if (m && +m[1] < 27) by[+m[1]].push(+m[2]);
		}
	}
	let x = 0x2545f491;
	for (let t = 0; t < 27; t++) {
		while (by[t].length < NSEED + NEXTRA) {
			x = (Math.imul(x, 1103515245) + 12345) | 0;
			const s = x & 0x7fffffff;
			V.i2 = FRESH;
			try { generate(t, s); by[t].push(s); } catch { /* a seed the game would not show */ }
		}
	}
	return by;
}
const SEEDS = seedsByType();

// ---- jobs -------------------------------------------------------------------------------------------------------
const jobs = [];
for (const t of toggles(FRESH)) {
	if (only && !only.test(t.name)) continue;
	const cases = [];
	for (let ty = 0; ty < 27; ty++) {
		const n = (t.types || []).includes(ty) ? NSEED + NEXTRA : NSEED;
		for (const s of SEEDS[ty].slice(0, n)) cases.push([ty, s]);
	}
	jobs.push({ name: t.name, progress: t.progress, expect: t.expect || {}, cases, read: t.read, base: t.base || null });
}
// saves: their progress read from the imported profile. The loader writes a few static tables (companion templates,
// vj0.A1 / R1); the tables are revived again afterwards so every job runs on pristine statics like the oracle's JVM.
const saves = [];
if (fs.existsSync(SAVE)) saves.push(['user', SAVE]);
for (const d of [path.join(os.homedir(), '.cache/nk-oracle/save/synth'), path.join(os.homedir(), '.cache/nk-oracle/save/prof/synth')]) {
	if (!fs.existsSync(d)) continue;
	for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.dat')) saves.push([`synth-${f.slice(0, -4)}`, path.join(d, f)]);
}
const saveJobs = new Map();
for (const [name, file] of saves) {
	const jn = `save-${name}`;
	if (only && !only.test(jn)) continue;
	initTables(tablesJson);
	const imp = await importSave(new Uint8Array(fs.readFileSync(file)));
	const cases = [];
	for (let ty = 0; ty < 27; ty++) for (const s of SEEDS[ty].slice(0, NSEED + 1)) cases.push([ty, s]);
	const job = { name: jn, progress: readProgress(imp.vj0), expect: {}, cases, read: 'a save\'s progress', file };
	saveJobs.set(jn, job);
	jobs.push(job);
}
initTables(tablesJson);
FRESH = freshProfile();

if (!jobs.find((j) => j.name === 'fresh')) {
	const cases = [];
	for (let ty = 0; ty < 27; ty++) for (const s of SEEDS[ty].slice(0, NSEED + NEXTRA)) cases.push([ty, s]);
	jobs.unshift({ name: 'fresh', progress: {}, expect: {}, cases, read: 'new game' });
}
// every job also needs the new-game build of its cases (layout-change classification): the `fresh` job covers them
const freshJob = jobs.find((j) => j.name === 'fresh');
{
	const have = new Set(freshJob.cases.map(([t, s]) => `${t}-${s}`));
	for (const j of jobs) for (const [t, s] of j.cases) if (!have.has(`${t}-${s}`)) { have.add(`${t}-${s}`); freshJob.cases.push([t, s]); }
}

// ---- oracle -----------------------------------------------------------------------------------------------------
const inputOf = (j) => JSON.stringify({ progress: j.progress, cases: j.cases });
const dumpOf = (j) => path.join(OUT, 'out', `${j.name}.jsonl.gz`);
const inputFile = (j) => path.join(OUT, 'out', `${j.name}.input.json`);
const stale = (j) => !fs.existsSync(dumpOf(j)) || !fs.existsSync(inputFile(j)) || fs.readFileSync(inputFile(j), 'utf8') !== inputOf(j);
if (runOracle) {
	const todo = jobs.filter(stale);
	if (todo.length) {
		fs.mkdirSync(path.join(OUT, 'out'), { recursive: true });
		const P = Math.min(6, todo.length);
		// balance by case count: the largest jobs first, each to the least loaded chunk
		const chunks = Array.from({ length: P }, () => ({ n: 0, jobs: [] }));
		for (const j of [...todo].sort((a, b) => b.cases.length - a.cases.length)) {
			const c = chunks.reduce((m, x) => (x.n < m.n ? x : m));
			c.n += j.cases.length;
			c.jobs.push(j);
		}
		const t0 = Date.now();
		await Promise.all(chunks.map((c, i) => new Promise((res, rej) => {
			const f = path.join(OUT, `jobs-${i}.json`);
			fs.writeFileSync(f, JSON.stringify(c.jobs.map((j) => ({ name: j.name, progress: j.progress, cases: j.cases }))));
			const p = spawn(RUN, ['progbatch', f, path.join(OUT, 'out')], { stdio: ['ignore', 'inherit', 'pipe'] });
			let err = '';
			p.stderr.on('data', (d) => { err += d; });
			p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`oracle chunk ${i} exited ${code}: ${err.slice(-2000)}`))));
		})));
		for (const j of todo) fs.writeFileSync(inputFile(j), inputOf(j));
		console.log(`oracle: ${todo.length} jobs, ${todo.reduce((n, j) => n + j.cases.length, 0)} dungeons in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
	}
}
const missing = jobs.filter(stale);
if (missing.length) {
	console.log(`${missing.length} job(s) have no current oracle dumps (${missing.slice(0, 5).map((j) => j.name).join(', ')}…): run with --oracle`);
	process.exit(2);
}

// ---- compare ----------------------------------------------------------------------------------------------------
const bit = (v) => (v ? 1 : 0);
function diffLevel(got, exp) {
	const out = [];
	if (!!got.error !== !!exp.error) return [`error: ${got.error || 'none'} != ${exp.error || 'none'}`];
	// the oracle names the class with its outer class (Exceptions$GenStuckException)
	const norm = (e) => String(e).replace(/^(?:\w+\$)+/, '');
	if (got.error) return norm(got.error) === norm(exp.error) ? [] : [`error text: ${got.error} != ${exp.error}`];
	for (const k of ['w', 'h', 'a', 'y', 'A']) if (got[k] !== exp[k]) out.push(`${k}: ${got[k]} != ${exp[k]}`);
	if (got.cells.length !== exp.cells.length) out.push('cells length');
	else for (let i = 0; i < exp.cells.length; i++) if (got.cells[i] !== exp.cells[i]) { out.push(`cell ${(i >> 1) % exp.w},${Math.floor((i >> 1) / exp.w)}`); break; }
	for (let i = 0; i < exp.regions.length; i++) if (got.regions[i] !== exp.regions[i]) { out.push(`region ${i}`); break; }
	for (const key of ['objects', 'critters', 'rooms']) {
		const a = got[key], b = exp[key];
		if (a.length !== b.length) out.push(`${key}: ${a.length} != ${b.length}`);
		for (let i = 0; i < Math.min(a.length, b.length); i++) {
			const ja = JSON.stringify(a[i]), jb = JSON.stringify(b[i]);
			if (ja !== jb) { out.push(`${key}[${i}]: ${ja} != ${jb}`); break; }
		}
	}
	for (const k of ['e', 'f', 'w']) if (got.rng[k] !== exp.rng[k]) out.push(`rng.${k}: ${got.rng[k]} != ${exp.rng[k]}`);
	return out;
}

/** how b differs from a (same engine, same label): 'same' | 'layout' | 'item' | 'tag' | 'loot' (most severe first) */
function changeClass(a, b) {
	if (!!a.error !== !!b.error) return 'layout';
	if (a.error) return 'same';
	if (a.w !== b.w || a.h !== b.h || a.a !== b.a || a.y !== b.y || a.A !== b.A) return 'layout';
	if (a.rng.e !== b.rng.e || a.rng.f !== b.rng.f) return 'layout';
	if (a.cells.length !== b.cells.length || a.cells.some((x, i) => x !== b.cells[i])) return 'layout';
	if (a.regions.some((x, i) => x !== b.regions[i])) return 'layout';
	if (JSON.stringify(a.rooms) !== JSON.stringify(b.rooms)) return 'layout';
	let item = false, tag = false;
	for (const key of ['objects', 'critters']) {
		const x = a[key], y = b[key];
		if (x.length !== y.length) return 'layout';
		for (let i = 0; i < x.length; i++) {
			const p = x[i], q = y[i];
			if (p.id !== q.id || p.x !== q.x || p.y !== q.y || p.c !== q.c || p.d !== q.d || p.e !== q.e || p.f !== q.f || p.k !== q.k) return 'layout';
			if (p.g !== q.g) item = true;
			if (p.h !== q.h) tag = true;
		}
	}
	if (item) return 'item';
	if (tag) return 'tag';
	return a.rng.w !== b.rng.w ? 'loot' : 'same';
}
const RANK = { same: 0, loot: 1, tag: 2, item: 3, layout: 4 };

function jsGen(profile, t, s) {
	V.i2 = profile;
	try {
		return generate(t, s);
	} catch (e) {
		return { type: t, seed: s, error: `${e.name === 'GenStuckException' || e.constructor?.name === 'GenStuckException' ? 'GenStuckException' : e.constructor?.name || 'Error'}: ${e.message}` };
	}
}

/** the oracle's dump of a job: { head: { progress } | { error }, cases: Map 't-s' -> level } */
function oracleDump(j) {
	const lines = zlib.gunzipSync(fs.readFileSync(dumpOf(j))).toString('utf8').split('\n').filter(Boolean);
	const head = JSON.parse(lines[0]);
	const cases = new Map();
	for (const l of lines.slice(1)) { const o = JSON.parse(l); cases.set(`${o.type}-${o.seed}`, o); }
	return { head, cases };
}
const freshJs = new Map(), freshOr = new Map();
// jobs other jobs are classed against (base): their levels are kept
const baseNames = new Set(jobs.filter((j) => j.base).map((j) => j.base));
const kept = new Map();   // name -> { js: Map, or: Map }
let pass = 0, fail = 0, errBoth = 0, readFail = 0, classFail = 0, expectFail = 0, saveFail = 0;
const summary = [];
const t0 = Date.now();
// the fresh job first: the baselines
const ordered = [freshJob, ...jobs.filter((j) => j !== freshJob)];
for (const j of ordered) {
	const dump = oracleDump(j);
	let profile;
	let jsErr = null;
	try { profile = withProgress(FRESH, j.progress); } catch (e) { jsErr = e.message; }
	if (dump.head.error || jsErr) {
		const oe = dump.head.error || null;
		if (!oe || !jsErr) { fail++; console.log(`FAIL ${j.name}: spec rejected by ${oe ? 'the oracle' : 'JS'} only: ${oe || jsErr}`); }
		else pass++;
		continue;
	}
	// spec read back
	const orRead = dump.head.progress;
	const jsRead = readProgress(profile);
	if (JSON.stringify(orRead) !== JSON.stringify(jsRead)) { readFail++; console.log(`FAIL ${j.name}: read-back differs\n   js ${JSON.stringify(jsRead)}\n   or ${JSON.stringify(orRead)}`); }
	const cls = { js: {}, or: {} };
	let jf = 0, worst = 'same';
	const changedTypes = new Set();
	const worstByType = {};
	for (const [t, s] of j.cases) {
		const key = `${t}-${s}`;
		const got = jsGen(profile, t, s);
		const exp = dump.cases.get(key);
		const d = diffLevel(got, exp);
		if (d.length) {
			jf++;
			if (jf <= (verbose ? 10 : 2)) console.log(`FAIL ${j.name} ${key}\n     ${d.slice(0, 6).join('\n     ')}`);
		}
		if (got.error && exp.error) errBoth++;
		if (baseNames.has(j.name)) {
			if (!kept.has(j.name)) kept.set(j.name, { js: new Map(), or: new Map() });
			kept.get(j.name).js.set(key, got);
			kept.get(j.name).or.set(key, exp);
		}
		if (d.length) { fail++; } else pass++;
		if (j === freshJob) { freshJs.set(key, got); freshOr.set(key, exp); continue; }
		// classed against the new game, or against the job's base state
		const B = j.base ? kept.get(j.base) : { js: freshJs, or: freshOr };
		if (!B || !B.js.has(key)) continue;
		const cj = changeClass(B.js.get(key), got), co = changeClass(B.or.get(key), exp);
		if (cj !== co) { classFail++; if (classFail <= 5) console.log(`FAIL ${j.name} ${key}: change class js ${cj} != oracle ${co}`); }
		cls.js[cj] = (cls.js[cj] || 0) + 1;
		if (RANK[cj] > RANK[worst]) worst = cj;
		if (cj === 'layout' && co === 'layout') changedTypes.add(t);
		if (cj === co && RANK[cj] > RANK[worstByType[t] || 'same']) worstByType[t] = cj;
	}
	const missed = Object.entries(j.expect).filter(([t, w]) => (w === 'layout' ? !changedTypes.has(+t) : w === 'item' ? worstByType[t] !== 'item' : !worstByType[t] || worstByType[t] === 'same')).map(([t, w]) => `${t} (${w})`);
	if (missed.length) { expectFail++; console.log(`FAIL ${j.name}: expected a change in types ${missed.join(', ')} (seen: ${Object.entries(worstByType).map(([t, w]) => `${t} ${w}`).join(', ') || 'none'})`); }
	if (j !== freshJob) summary.push({ name: j.name + (j.base ? ` (vs ${j.base})` : ''), worst, types: [...changedTypes], cls: cls.js, cases: j.cases.length, read: j.read });
}

// the spec is complete: each imported profile builds exactly what a new game with its spec builds
for (const j of saveJobs.values()) {
	initTables(tablesJson);
	const imp = await importSave(new Uint8Array(fs.readFileSync(j.file)));
	const viaSpec = withProgress(freshProfile(), j.progress);
	let bad = 0;
	for (const [t, s] of j.cases) {
		const dd = diffLevel(jsGen(imp.vj0, t, s), jsGen(viaSpec, t, s));
		if (dd.length && ++bad <= 3) console.log(`FAIL ${j.name} ${t}-${s}: imported profile != new game + its spec\n     ${dd.slice(0, 4).join('\n     ')}`);
	}
	saveFail += bad;
	if (verbose) console.log(`${bad ? 'FAIL' : 'ok  '} ${j.name}: imported vs new game + spec on ${j.cases.length} dungeons`);
}

// ---- report -----------------------------------------------------------------------------------------------------
const byWorst = {};
for (const s of summary) (byWorst[s.worst] = byWorst[s.worst] || []).push(s);
for (const w of ['layout', 'item', 'tag', 'loot', 'same']) {
	const l = byWorst[w] || [];
	if (!l.length) continue;
	console.log(`\n${w.toUpperCase()} (${l.length} jobs)${w === 'same' ? ': no effect on any case' : ''}`);
	for (const s of l) {
		const c = Object.entries(s.cls).filter(([k]) => k !== 'same').map(([k, n]) => `${k} ${n}`).join(', ');
		if (verbose || w !== 'same') console.log(`  ${s.name.padEnd(28)} ${c.padEnd(30)} ${s.types.length ? `layout in ${s.types.join(',')}` : ''}`);
		else if (s === l[0]) console.log(`  ${l.map((x) => x.name).join(' ')}`);
	}
}
const total = jobs.reduce((n, j) => n + j.cases.length, 0);
console.log(`\n${jobs.length} jobs, ${total} dungeons: ${pass} match the oracle, ${fail} differ (${errBoth} stuck in both); ` +
	`read-back ${readFail ? `${readFail} FAIL` : 'ok'}; change classes ${classFail ? `${classFail} FAIL` : 'agree'}; ` +
	`expected layout changes ${expectFail ? `${expectFail} FAIL` : 'ok'}; saves ${saveJobs.size ? (saveFail ? `${saveFail} FAIL` : `${saveJobs.size} specs complete`) : 'none'} ` +
	`in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fail || readFail || classFail || expectFail || saveFail ? 1 : 0);
