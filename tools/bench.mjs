// Engine / setup / clone benchmark for the search layer (js/combat/driver.js step, js/combat/clone.js).
//
//   node tools/bench.mjs [--files=N] [--only=REGEX] [--baseline] [--quick] [--passes=N]
//   node tools/bench.mjs --replay-only --profile=/tmp/nkprof     # CPU profile of the warm lean replay only
//   node tools/bench.mjs --top=/tmp/nkprof [--n=30]              # its self-time hotspots
//   (node --cpu-prof --cpu-prof-dir=DIR tools/bench.mjs ... profiles everything, setup included)
//
//   --baseline     the pre-clone.js setup: full tables.json revive per fight (dictionary-mode tables), no
//                  generated-dungeon cache, Recorder (RNG watchers) on every fight
//   --replay-only  only the lean replay (for profiling)
// Compare modes in separate processes (alternating runs on a loaded machine): in one process the engine's
// inline caches would see both the dictionary-mode and the fast tables.
//   --top=DIR      print the self-time hotspots of the newest .cpuprofile in DIR (and exit)
//
// Fights: the corpus ~/.cache/nk-oracle/fights (autogear / autokit / autobare files, fightgen). Times are
// wall-clock; on a loaded machine prefer the "min" columns (best batch).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

if (opt('top')) {
	const dir = opt('top');
	const f = fs.readdirSync(dir).filter((x) => x.endsWith('.cpuprofile')).map((x) => path.join(dir, x))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
	const p = JSON.parse(fs.readFileSync(f, 'utf8'));
	const byId = new Map(p.nodes.map((n) => [n.id, n]));
	const self = new Map();
	let total = 0;
	for (let i = 0; i < p.samples.length; i++) {
		const n = byId.get(p.samples[i]);
		const cf = n.callFrame;
		const dt = p.timeDeltas[i] || 0;
		const key = `${cf.functionName || '(anon)'}  ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
		self.set(key, (self.get(key) || 0) + dt);
		total += dt;
	}
	const skip = /\(idle\)|\(program\)|esm\/|node:|bootstrap|modules\//;
	const busy = [...self].filter(([k]) => !/\(idle\)/.test(k)).reduce((a, [, v]) => a + v, 0);
	console.log(`${path.basename(f)}: ${(busy / 1e3).toFixed(0)} ms busy`);
	for (const [k, us] of [...self].filter(([k]) => !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, +(opt('n') || 30))) {
		console.log(`${(us / 1e3).toFixed(1).padStart(9)} ms ${(100 * us / busy).toFixed(1).padStart(5)}%  ${k}`);
	}
	process.exit(0);
}

const baseline = args.includes('--baseline');
const quick = args.includes('--quick');
const replayOnly = args.includes('--replay-only');
if (baseline) {
	process.env.NK_FULL_RESET = '1';
	process.env.NK_SLOW_TABLES = '1';
}

const here = path.dirname(new URL(import.meta.url).pathname);
const site = path.resolve(here, '..');
await import(site + '/js/combat/all.js');
const { newFight, specOf, Fight } = await import(site + '/js/combat/driver.js');
const SU = await import(site + '/js/combat/setup.js');
const C = await import(site + '/js/combat/clone.js');
const { initTables } = await import(site + '/js/gen/statics.js');
const S = await import(site + '/js/gen/statics.js');
const { classes } = await import(site + '/js/gen/registry.js');
const { c30 } = await import(site + '/js/combat/c30.js');
if (baseline) C.setGenCacheSize(0);
/** the pre-clone.js resetStatics was a plain re-revive */
const reset = baseline ? () => initTables(tablesJson) : () => SU.resetStatics(tablesJson);

const tablesJson = JSON.parse(fs.readFileSync(site + '/data/tables.json', 'utf8'));
const dir = path.join(os.homedir(), '.cache/nk-oracle/fights');
const only = new RegExp(opt('only') || 'autogear|autokit|autobare');
const nfiles = +(opt('files') || (quick ? 40 : 120));
const files = [];
for (const f of fs.readdirSync(dir).sort()) {
	if (!f.endsWith('.json') || f === 'index.json' || !only.test(f)) continue;
	const file = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
	if (file.error || file.mode !== 'fightgen') continue;
	files.push({ name: f, file, spec: specOf(file) });
	if (files.length >= nfiles) break;
}
const ms = (t) => t.toFixed(t < 1 ? 3 : t < 10 ? 2 : 1);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const quantiles = (xs) => { const s = [...xs].sort((a, b) => a - b); return { min: s[0], med: s[s.length >> 1], mean: s.reduce((a, b) => a + b, 0) / s.length }; };
console.log(`${files.length} fights (${only}), ${baseline ? 'BASELINE (full revive, dictionary tables, no gen cache, Recorder)' : 'current'}; node ${process.version}; load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}`);

// ---- lean replay ------------------------------------------------------------------------------
function playLean(fight, file) {
	let n = 0;
	for (const inp of file.inputs) {
		const st = fight.st;
		if (!(st === 'in' || st === 'idle' || st === 'cap')) break;
		if (baseline) { if (fight.applyInput(inp) == null) fight.st = fight.settle(); }   // the pre-step() loop
		else fight.step(inp);
		n++;
	}
	return n;
}

function replayPass(countS0) {
	let inputs = 0, run = 0, s0 = 0, cpu = 0;
	const S0 = c30.prototype.S0_;
	if (countS0) c30.prototype.S0_ = function S0_() { s0++; return S0.call(this); };
	try {
		for (const { file, spec } of files) {
			reset();
			const fight = newFight(spec, { lean: !baseline });
			const c0 = process.cpuUsage();
			const t = performance.now();
			inputs += playLean(fight, file);
			run += performance.now() - t;
			const c1 = process.cpuUsage(c0);
			cpu += (c1.user + c1.system) / 1e3;
		}
	} finally {
		c30.prototype.S0_ = S0;
	}
	return { inputs, run, s0, cpu };
}

const cold = replayPass(false);
console.log(`\nlean replay   cold: ${fmt(cold.inputs)} inputs in ${ms(cold.run)} ms = ${fmt(cold.inputs / cold.run * 1e3)} inputs/s`);
let best = null;
const passes = +(opt('passes') || (quick ? 3 : 5));
// --profile=DIR: inspector CPU profile around the timed replay loops only (setup excluded)
let session = null;
if (opt('profile')) {
	const { Session } = await import('node:inspector');
	session = new Session();
	session.connect();
	const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
	await post('Profiler.enable');
	await post('Profiler.setSamplingInterval', { interval: 200 });
	session.postP = post;
}
for (let r = 0; r < passes; r++) {
	const w = replayPass(false);
	if (!best || w.run < best.run) best = w;
}
if (session) {
	// set every fight up first (lean states), then profile only their replays (restore frames: clone.js)
	const states = files.map(({ file, spec }) => { reset(); return { file, s: C.snapshot(newFight(spec, { lean: true })) }; });
	await session.postP('Profiler.start');
	for (let r = 0; r < passes; r++) for (const { file, s } of states) playLean(C.restore(s), file);
	const { profile } = await session.postP('Profiler.stop').catch(() => ({}));
	if (profile) {
		fs.mkdirSync(opt('profile'), { recursive: true });
		const f = path.join(opt('profile'), `replay-${Date.now()}.cpuprofile`);
		fs.writeFileSync(f, JSON.stringify(profile));
		console.log(`              profile: ${f}`);
	}
}
console.log(`              warm: ${fmt(best.inputs)} inputs in ${ms(best.run)} ms = ${fmt(best.inputs / best.run * 1e3)} inputs/s (best of ${passes}; process CPU ${ms(best.cpu)} ms = ${fmt(best.inputs / best.cpu * 1e3)} inputs per CPU-s)`);
const cnt = replayPass(true);
console.log(`              S0:   ${fmt(cnt.s0)} engine S0 calls; ${fmt(cnt.s0 / best.run * 1e3)} S0/s at the warm rate; ${(cnt.s0 / cnt.inputs).toFixed(2)} S0 per input`);
if (replayOnly) process.exit(0);

// record-mode replay (apply + RECORD) for reference
{
	let inputs = 0, run = 0;
	for (const { file, spec } of files.slice(0, Math.min(files.length, 60))) {
		reset();
		const fight = newFight(spec);
		const t = performance.now();
		for (const inp of file.inputs) { fight.apply(inp); inputs++; }
		run += performance.now() - t;
	}
	console.log(`record replay (apply): ${fmt(inputs / run * 1e3)} inputs/s (${files.length > 60 ? 60 : files.length} fights)`);
}

// ---- setup ------------------------------------------------------------------------------------
{
	const T = { revive: [], fast: [], reset: [], genMiss: [], genHit: [], rest: [], c30: [], fightLean: [], fightRec: [], total: [], totalHit: [] };
	const sub = files.slice(0, quick ? 15 : 40);
	for (let r = 0; r < 2; r++) {
		let t = performance.now();
		initTables(tablesJson);
		T.revive.push(performance.now() - t);
		t = performance.now();
		C.fastTables({ zw: S.zw, x30: S.xs, vj0: S.vj0 });
		T.fast.push(performance.now() - t);
	}
	if (baseline) initTables(tablesJson);
	else SU.resetStatics(tablesJson, { full: true });
	const once = (spec, rec) => {
		const t0 = performance.now();
		reset();
		const t1 = performance.now();
		const r = SU.setupGen(spec);
		const t2 = performance.now();
		const f = new Fight(r, spec, { lean: !rec });
		const t3 = performance.now();
		return { reset: t1 - t0, setup: t2 - t1, fight: t3 - t2, f };
	};
	for (const { spec } of sub) {
		// split of setupGen: generation (miss / cache hit), then the rest (FOV, teleport, edits), c30 build
		reset();
		const hero = S.vj0.i2.l[0];
		let t = performance.now();
		const h = new classes.hw(spec.type, hero);
		new classes.x30().g_(h, spec.seed);
		T.genMiss.push(performance.now() - t);
		h.x.a = spec.xseed | 0;
		t = performance.now();
		h.n_(null);
		if (spec.at === 'auto') { const c = SU.autoCell(h, null); if (c) SU.teleport(h, c[0], c[1]); }
		SU.heroEdits(h, spec, {});
		S.vj0.i2.K0 = null;
		T.rest.push(performance.now() - t);
		t = performance.now();
		SU.buildC30(h);
		T.c30.push(performance.now() - t);
		const a = once(spec, false);   // gen miss (fills the cache) + lean Fight
		T.reset.push(a.reset);
		T.total.push(a.reset + a.setup + a.fight);
		T.fightLean.push(a.fight);
		if (!baseline) {
			t = performance.now();
			reset();
			C.generateCached(spec.type, spec.seed, () => { throw new Error('cache miss'); });
			T.genHit.push(performance.now() - t);
		}
		const b = once(spec, true);    // cache hit + Recorder Fight
		T.fightRec.push(b.fight);
		const c = once(spec, false);
		T.totalHit.push(c.reset + c.setup + c.fight);
	}
	const q = (k) => { if (!T[k].length) return '      -'; const x = quantiles(T[k]); return `${ms(x.mean).padStart(7)} mean ${ms(x.med).padStart(7)} med ${ms(x.min).padStart(7)} min`; };
	console.log(`\nsetup (ms; ${sub.length} fights)`);
	console.log(`  tables.json revive (initTables)    ${q('revive')}    (once per process now; was per fight)`);
	console.log(`  fastTables (dictionary -> fast)    ${q('fast')}    (once per process)`);
	console.log(`  resetStatics, in place             ${q('reset')}`);
	console.log(`  generation x30.g (miss)            ${q('genMiss')}`);
	console.log(`  generation, cache hit              ${q('genHit')}    (incl. resetStatics)`);
	console.log(`  rest of setupGen (FOV, tele, edits)${q('rest')}`);
	console.log(`  c30 build (buildC30)               ${q('c30')}`);
	console.log(`  Fight (init settle), lean          ${q('fightLean')}`);
	console.log(`  Fight (init settle), Recorder      ${q('fightRec')}`);
	console.log(`  total: reset + setupGen + Fight    ${q('total')}    (gen miss)`);
	console.log(`  total, generation cached           ${q('totalHit')}`);
}

// ---- clone ------------------------------------------------------------------------------------
if (!baseline) {
	const sub = files.filter((_, i) => i % 3 === 0).slice(0, quick ? 6 : 15);
	const R = { snapLean: [], snapRec: [], restore: [], restoreInto: [], restoreRec: [], step: [] };
	let objs = 0, npts = 0;
	const batch = (f, reps) => {
		const t = performance.now();
		for (let i = 0; i < reps; i++) f();
		return (performance.now() - t) / reps;
	};
	const reps = quick ? 30 : 100;
	for (const { file, spec } of sub) {
		SU.resetStatics(tablesJson);
		const fight = newFight(spec);
		const n = file.inputs.length;
		const points = [0, n >> 2, n >> 1, (3 * n) >> 2].filter((k, i, a) => a.indexOf(k) === i);
		let at = 0;
		let live = fight;
		for (const k of points) {
			while (at < k && (live.st === 'in' || live.st === 'idle' || live.st === 'cap')) live.apply(file.inputs[at++]);
			const sr = C.snapshot(live);
			const sl = C.snapshot(live, { record: false });
			objs += C.stateSize(sl).objects;
			npts++;
			for (let b = 0; b < 3; b++) {
				R.snapLean.push(batch(() => C.snapshot(live, { record: false }), reps));
				R.snapRec.push(batch(() => C.snapshot(live), reps));
			}
			// restores (each makes a new live fight; restore the snapshot of `live` last to keep going)
			for (let b = 0; b < 3; b++) {
				R.restore.push(batch(() => C.restore(sl), reps));
				let dead = C.restore(sl);
				R.restoreInto.push(batch(() => { dead = C.restore(sl, dead); }, reps));
				R.restoreRec.push(batch(() => C.restore(sr), reps));
			}
			// one solver node: restore + step + snapshot
			const inp = file.inputs[Math.min(at, n - 1)];
			let dead = C.restore(sl);
			R.step.push(batch(() => { const f = C.restore(sl, dead); f.step(inp); C.snapshot(f, { record: false }); dead = f; }, reps));
			live = C.restore(sr);
		}
	}
	const q = (k) => { const x = quantiles(R[k]); return `${ms(x.mean).padStart(6)} mean ${ms(x.med).padStart(6)} med ${ms(x.min).padStart(6)} min`; };
	console.log(`\nclone (ms per op; ${npts} states of ${sub.length} fights, ~${fmt(objs / npts)} objects copied per lean state besides the packed cells)`);
	console.log(`  snapshot, lean (no Recorder)       ${q('snapLean')}`);
	console.log(`  snapshot, with Recorder            ${q('snapRec')}`);
	console.log(`  restore, lean                      ${q('restore')}`);
	console.log(`  restore into a dead fight, lean    ${q('restoreInto')}`);
	console.log(`  restore, with Recorder             ${q('restoreRec')}`);
	console.log(`  node: restore-into + step + snapshot ${q('step')}`);
}
