// Solve a whole dungeon (js/solve): survive, leave no objective behind, then the fewest items, then the least MP. Prints a report.
//
//   node tools/solve.mjs 3C-172582050 [--mode=robust|exact] [--hero=SPEC] [--budget=S] [--N=64] [--workers=N]
//                        [--xseed=X] [--out=plan.json] [--oracle] [--quick] [--maxDecisions=N] [--strict] [--escalate] [-v]
//     label        dungeon label (zw.g(type) + "-" + seed), or TYPE:SEED
//     --mode       robust (default; label only, Monte Carlo over the combat RNG) | exact (known RNG: --xseed, the
//                  fightgen seed of hw.x; prints a replayable input script)
//     --hero       hero spec: "level:21,gear:4,kit" | "kit2" | "mp:280" | JSON ({"level":12,"gear":2,"kit":true}).
//                  Fields: level, gear (1-4), kit, kit2, skills ("I:L,.."), mp (robust only), items ([[id,n],..])
//                  default level:21,gear:4,kit2
//     --budget     expected wall time in seconds (progress only); with --strict the search is cut to meet it
//     --N          robust samples (default 128); --nMin per-decision minimum incl. RNG variants (32)
//     --workers    worker threads (default cores - 1; 0 = inline, single thread)
//     --profile=F  the player's hero from an export zip / guild.dat (js/combat/entry.js; --heroIndex=N, --premium);
//                  --hero edits apply on top
//     --oracle     exact mode: replay the script in the JVM oracle (../nonograms-katana/tools/oracle/run.sh
//                  fightgen ...) and diff it with test/combat.mjs
//     --out        write the plan JSON (js/solve/README.md "Plan format")
//     --useItemsForMp  the old MP model: the entry MP is a stock, items may buy MP (default: MP is replenishable --
//                  the player tops the hero up by solving puzzles, reported as plan.mpTopUps / plan.mpToSolve)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { parseLabel, formatLabel } from '../js/labels.js';
import { solveRobust, InlinePool } from '../js/solve/robust.js';
import { solveExact, replayScript, InlineExactPool } from '../js/solve/exact.js';
import { WorkerPool, defaultSize } from '../js/solve/pool.js';
import { buildPlan } from '../js/solve/plan.js';
import { oracleFlags, oracleReplayable, loadEntry, resolveProfile, heroSpecOut } from '../js/solve/sim.js';
import { candidates } from '../js/solve/policies.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const tablesPath = path.join(site, 'data/tables.json');

export function parseHero(s) {
	if (!s) return { level: 21, gear: 4, kit2: true };
	if (s.trim().startsWith('{')) return JSON.parse(s);
	const h = {};
	for (const part of s.split(/[,;]/)) {
		const [k, ...v] = part.split(':');
		if (!k) continue;
		if (v.length === 0) h[k] = true;
		else if (k === 'skills') h[k] = v.join(':');
		else h[k] = Number(v.join(':'));
	}
	return h;
}

export function parseWhere(arg) {
	const m = /^(\d+):(\d+)$/.exec(arg || '');
	if (m) return { type: +m[1], seed: +m[2] };
	return parseLabel(arg);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const args = process.argv.slice(2);
	const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
	const flag = (k) => args.includes(`--${k}`);
	const pos = args.filter((a) => !a.startsWith('-'));
	if (!pos.length) { console.error('usage: node tools/solve.mjs LABEL [--mode=robust|exact] [--hero=SPEC] [--budget=S] [--N=64] [--workers=N] [--xseed=X] [--out=F] [--oracle]'); process.exit(2); }
	const where = parseWhere(pos[0]);
	const label = formatLabel(where.type, where.seed);
	const mode = opt('mode', 'robust');
	let hero = parseHero(opt('hero'));
	if (opt('profile')) {
		// the player's hero from an export / guild.dat (js/combat/entry.js); the file is only read, never copied
		const file = path.resolve(opt('profile'));
		const edits = opt('hero') ? hero : {};
		hero = { ...edits, profile: { path: file, name: path.basename(file), bytes: new Uint8Array(fs.readFileSync(file)), hero: opt('heroIndex') != null ? +opt('heroIndex') : undefined, premium: flag('premium') } };
	}
	const budgetMs = opt('budget') != null ? +opt('budget') * 1000 : Infinity;
	const strictBudget = flag('strict');
	const nw = opt('workers') != null ? +opt('workers') : await defaultSize();
	const verbose = flag('v');
	const tablesJson = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
	resetStatics(tablesJson);
	await loadEntry();
	hero = await resolveProfile(hero);
	const names = (() => { try { return JSON.parse(fs.readFileSync(path.join(site, 'data/names.json'), 'utf8')).items; } catch { return {}; } })();
	const onProgress = verbose ? (p) => console.error(`  [${(p.ms / 1000).toFixed(1)}s] ${p.phase} ${p.k ?? ''} ${p.key ?? ''} ${p.tactic ?? ''}`) : null;
	const t0 = performance.now();
	let pool = null;
	let res;
	const cands = flag('quick') ? candidates('quick') : candidates('full');
	if (mode === 'exact') {
		const xseed = +opt('xseed', 12345);
		const problem = { hero, type: where.type, seed: where.seed, xseed, at: 'start' };
		pool = nw > 0 ? await WorkerPool.create({ size: nw, tables: { path: tablesPath } }) : new InlineExactPool(1);
		res = await solveExact(problem, { pool, budgetMs, strictBudget, cands, maxDecisions: +opt('maxDecisions', 100), onProgress, useItemsForMp: flag('useItemsForMp') });
	} else {
		pool = nw > 0 ? await WorkerPool.create({ size: nw, tables: { path: tablesPath } }) : new InlinePool(1);
		res = await solveRobust({ hero, type: where.type, seed: where.seed }, { pool, N: +opt('N', 128), nMin: +opt('nMin', 32), n0: +opt('n0', Math.max(12, 2 * nw)), budgetMs, strictBudget, cands, seed: +opt('seed', 1), onProgress, useItemsForMp: flag('useItemsForMp'), escalate: flag('escalate') });
	}
	await pool.close();
	if (res.error) { console.error('error:', res.error); process.exit(1); }
	const wall = performance.now() - t0;
	let replay = null, oracle = null;
	if (mode === 'exact') {
		resetStatics(tablesJson);
		replay = replayScript({ ...res.problem, hero }, res.inputs, res.topUps);
		const same = replay.items === res.totals.items && replay.mp === res.totals.mp && replay.dead === res.totals.dead && replay.final.hp === res.totals.final.hp && replay.objectivesLeft === res.totals.objectivesLeft;
		replay.matches = same;
		if (flag('oracle')) oracle = runOracle(res, hero, label);
	}
	const plan = buildPlan(res, { label, names, heroSpec: heroSpecOut(hero), replay, oracle });
	report(plan, res, { wall, names, verbose });
	if (opt('out')) { fs.writeFileSync(opt('out'), JSON.stringify(plan, null, 1)); console.log(`plan: ${opt('out')}`); }
	if (mode === 'exact' && (!replay.matches || (oracle && !oracle.ok))) process.exit(1);
}

/** exact mode: the script through the JVM oracle (fightgen) and test/combat.mjs */
export function runOracle(res, hero, label) {
	if (!oracleReplayable(hero)) return { ok: false, skipped: 'hero spec has solver-only edits (mp / items / profile)' };
	const RE = process.env.NK_RE || path.resolve(site, '../nonograms-katana');
	const RUN = path.join(RE, 'tools/oracle/run.sh');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-solve-'));
	const inFile = path.join(dir, `${label}.inputs.json`), outFile = path.join(dir, `${label}.json`);
	// MP top-ups are no engine input (the player solves puzzles): the oracle replays the script up to the first one
	const cut = res.topUps && res.topUps.length ? res.topUps[0].at : res.inputs.length;
	if (cut === 0) { fs.rmSync(dir, { recursive: true, force: true }); return { ok: true, skipped: 'the script starts with an MP top-up (no oracle input for one); the JS replay checks it' }; }
	fs.writeFileSync(inFile, JSON.stringify(res.inputs.slice(0, cut)));
	const p = res.problem;
	const argv = ['fightgen', String(p.type), String(p.seed), String(p.xseed), p.at || 'start', inFile, outFile, ...oracleFlags(hero), '--draws'];
	const t = performance.now();
	const o = spawnSync(RUN, argv, { encoding: 'utf8' });
	if (o.status !== 0) return { ok: false, error: (o.stderr || '').trim().split('\n').pop(), argv };
	const ms = performance.now() - t;
	const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
	if (out.error || !out.steps) { fs.rmSync(dir, { recursive: true, force: true }); return { ok: false, error: `oracle: ${out.error || 'no steps'}`, argv: argv.map((a) => (a === inFile ? '<inputs.json>' : a === outFile ? '<out.json>' : a)) }; }
	const last = out.steps[out.steps.length - 1] || out.init;
	const c = spawnSync('node', [path.join(site, 'test/combat.mjs'), outFile], { encoding: 'utf8' });
	const line = (c.stdout || '').trim().split('\n').filter((l) => /passed/.test(l)).pop() || '';
	const r = {
		ok: c.status === 0 && /^1 passed, 0 failed/.test(line), combat: line, argv: argv.map((a) => (a === inFile ? '<inputs.json>' : a === outFile ? '<out.json>' : a)),
		summary: out.summary, hero: { hp: last.hero.hp, mp: last.hero.mp, ep: last.hero.ep }, end: last.end, dead: last.dead, ms: Math.round(ms),
	};
	r.prefix = cut < res.inputs.length ? { inputs: cut, of: res.inputs.length, why: 'MP top-up' } : null;
	r.matches = r.prefix ? true : r.hero.hp === res.totals.final.hp && r.hero.mp === res.totals.final.mp && !!r.dead === !!res.totals.dead;
	r.ok = r.ok && r.matches;
	fs.rmSync(dir, { recursive: true, force: true });
	return r;
}

function report(plan, res, { wall, names }) {
	const f2 = (x) => (x == null ? '-' : Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : String(x));
	const d = plan.dungeon;
	console.log(`${d.label} (type ${d.type}, seed ${d.seed}${plan.mode === 'exact' ? `, xseed ${d.xseed}` : ''}) -- ${plan.mode}; hero ${JSON.stringify(plan.heroSpec)}`);
	console.log(`  hero: HP ${plan.hero.hp}/${plan.hero.hpM} EP ${plan.hero.ep}/${plan.hero.epM} MP ${plan.hero.mp}/${plan.hero.mpM} atk ${plan.hero.atk} def ${plan.hero.def} spd ${plan.hero.spd}; route ${plan.stops.length} stops`);
	console.log('  #  stop                   enemies                         tactic                         items    mp     pD    hpLost');
	for (const e of plan.encounters) {
		const st = e.stop != null ? plan.stops[e.stop] : null;
		const where = st ? `${st.kind}${st.target ? ':' + st.target.id : ''}` : (e.key.split('#')[0]);
		const ex = e.expected || {};
		console.log(`  ${String(e.i).padStart(2)} ${where.padEnd(22)} ${e.enemies.map((x) => x.id + (x.seal ? `(${x.seal}mp)` : '')).join(',').slice(0, 31).padEnd(31)} ${e.tactic.label.slice(0, 30).padEnd(30)} ${f2(ex.items).padStart(5)} ${f2(ex.mp).padStart(6)} ${f2(ex.pDeath).padStart(6)} ${f2(ex.hpLost).padStart(7)}${plan.mode === 'exact' ? `  searched ${e.searched}${e.improved ? ` (+${e.improved})` : ''}` : `  n=${e.samples}`}`);
	}
	const t = plan.totals;
	console.log(`  totals: items mean ${f2(t.items.mean)} p95 ${t.items.p95}; MP mean ${f2(t.mp.mean)} p95 ${t.mp.p95}; P(death) ${f2(t.pDeath)}; objectives left ${plan.mode === 'robust' ? f2(t.objectivesLeft.mean) : t.objectivesLeft}${plan.mode === 'exact' ? `; finished ${t.finished}` : ''}`);
	if (plan.baseline) {
		const b = plan.baseline;
		console.log(`  baseline (${b.tactic}, ${b.n} samples): items mean ${f2(b.items.mean)} p95 ${b.items.p95}; MP mean ${f2(b.mp.mean)} p95 ${b.mp.p95}; P(death) ${f2(b.pDeath)}; objectives left ${f2(b.objectivesLeft.mean)}`);
	}
	for (const w of plan.warnings || []) console.log(`  warning: ${w.text}`);
	const bring = plan.pack.filter((p) => p.bring > 0), rare = plan.pack.filter((p) => p.bring === 0);
	console.log(`  pack: ${bring.length ? bring.map((p) => `${p.bring}x ${p.name || p.id}`).join(', ') : 'nothing needed'}${rare.length ? ` (rarely used: ${rare.map((p) => `${p.name || p.id} ${p.mean}/run`).join(', ')})` : ''}`);
	if (plan.script) {
		const r = plan.script.replay;
		console.log(`  script: ${plan.script.inputs.length} inputs; JS replay ${r && r.matches ? 'identical' : 'DIFFERS'} (rejected ${r ? r.rej : '-'})`);
		const o = plan.script.oracle;
		if (o) console.log(`  oracle: ${o.skipped ? 'skipped: ' + o.skipped : o.ok ? 'identical' : 'DIFFERS'}${o.prefix ? ` (the first ${o.prefix.inputs} of ${o.prefix.of} inputs, up to the first MP top-up)` : ''} ${o.combat || o.error || ''} ${o.hero ? `(final HP ${o.hero.hp} MP ${o.hero.mp} end ${o.end} dead ${o.dead})` : ''}`);
	}
	if (plan.mp) console.log(`  MP: enters with ${plan.mp.start}/${plan.mp.max}; route ${plan.mp.route}; spends mean ${f2(plan.mp.spent.mean)} p95 ${plan.mp.spent.p95} (${Object.entries(plan.mp.spentBy || {}).map(([k, v]) => `${k} ${v}`).join(', ')}); to solve for ${plan.mpToSolve}${plan.mpTopUps && plan.mpTopUps.length ? ': ' + plan.mpTopUps.slice(0, 8).map((t) => `${t.amount} before stop ${t.stopIndex}${t.p != null ? ` (${Math.round(t.p * 100)}%)` : ''}`).join(', ') : ''}`);
	const pf = res.perf;
	console.log(`  perf: ${(wall / 1000).toFixed(1)} s wall, ${plan.perf.workers} workers${plan.perf.samples ? `, ${plan.perf.samples} samples` : ''}${plan.perf.search ? `, ${plan.perf.search.decisions} decisions / ${plan.perf.search.jobs} play-outs` : ''}`
		+ (pf ? `; setup ${(pf.setupMs / 1000).toFixed(1)} s, scout ${(pf.scoutMs / 1000).toFixed(1)} s, walk ${(pf.advanceMs / 1000).toFixed(1)} s, decide ${(pf.decideMs / 1000).toFixed(1)} s (${pf.evals} play-outs, ${(pf.evalCpuMs / Math.max(1, pf.evals)).toFixed(1)} ms CPU each), commit ${(pf.commitMs / 1000).toFixed(1)} s (${pf.commits})${pf.lookMs ? `, lookahead ${(pf.lookMs / 1000).toFixed(1)} s (${pf.lookEvals})` : ''}${pf.marginalMs ? `, MP re-plays ${(pf.marginalMs / 1000).toFixed(1)} s` : ''}` : ''));
	void res; void names;
}
