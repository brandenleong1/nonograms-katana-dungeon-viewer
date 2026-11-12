// Solver host (M7), loaded by the worker entry js/ui/solve-host.js. It runs the solver's coordinator (js/solve
// robust / exact) off the page's main thread, owns the solver's worker pool (nested module workers, js/solve/pool.js
// through js/ui/pool-worker.js) and replays exact scripts into per-input frames for the script player. It has its
// own engine statics, so nothing here touches the viewer's generator state (vj0.i2, zw.*) on the main thread. The
// page talks to it through js/ui/solve-client.js; cancel terminates this worker, which also ends its pool.
//
// Protocol: { id, cmd, args } -> { id, progress } ... then { id, result } | { id, error }
//   init   { tablesUrl, namesUrl }                     load data/tables.json + names (once)
//   solve  job (solve-client.js buildJob)              -> { plan, frames?, acts?, timings }
//   replay { problem, inputs, topUps? }                 -> { frames, acts, replay }
import '../combat/all.js';
import { resetStatics } from '../combat/setup.js';
import { zw } from '../gen/statics.js';
import { Util$Point } from '../gen/model.js';
import { WorkerPool } from '../solve/pool.js';
import { solveRobust } from '../solve/robust.js';
import { solveExact, exactFight, replayScript } from '../solve/exact.js';
import { buildPlan, validatePlan } from '../solve/plan.js';
import { candidates } from '../solve/policies.js';
import { loadEntry, resolveProfile, heroSpecOut, heroOf, isFoe, sealOf, packFlat, Run } from '../solve/sim.js';
import { importSave } from '../save/index.js';
import { formatLabel } from '../labels.js';
import { BUDGETS } from './budgets.js';

let tablesJson = null;
let tablesUrl = null;
let names = {};
let pool = null;
let poolKey = '';

const now = () => performance.now();

async function init({ tablesUrl: tu, namesUrl }) {
	if (tablesJson) return { ok: true };
	tablesUrl = tu;
	const [t, n] = await Promise.all([
		fetch(tu).then((r) => { if (!r.ok) throw new Error(`tables: HTTP ${r.status}`); return r.json(); }),
		fetch(namesUrl).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
	]);
	tablesJson = t;
	names = n || {};
	resetStatics(tablesJson);
	await loadEntry();
	return { ok: true };
}

/** the pool, kept warm between solves of the same kind (an in-dungeon save needs the adapter worker) */
async function getPool({ size, forSave }, progress) {
	const key = `${size}|${forSave ? 'save' : 'std'}`;
	if (pool && poolKey === key) return { pool, startMs: 0 };
	if (pool) { await pool.close(); pool = null; }
	progress({ phase: 'workers', workers: size });
	const t = now();
	// js/ui/pool-worker.js: the browser entry for js/solve/worker.js (or the save adapter js/ui/solve-worker.js)
	pool = await WorkerPool.create({ size, tables: { url: tablesUrl }, workerUrl: new URL(forSave ? './pool-worker.js?save=1' : './pool-worker.js', import.meta.url) });
	poolKey = key;
	return { pool, startMs: now() - t };
}

/**
 * Exact mode from an in-dungeon save: the coordinator follows the trajectory with the imported save (problem.save),
 * while each pool worker re-imports it from its bytes (an imported save is an object graph that does not survive
 * postMessage, and setupSave consumes vj0.K0). Same interface as WorkerPool for solveExact.
 */
class SavePool {
	constructor(inner, bytes, name) { this.inner = inner; this.bytes = bytes; this.name = name; }
	get size() { return this.inner.size; }
	setupExact(cfg) {
		const { save, ...problem } = cfg.problem;
		void save;
		return this.inner.setupExact({ ...cfg, problem: { ...problem, saveBytes: this.bytes, saveName: this.name } });
	}
	setup(cfg) { return this.inner.setup(cfg); }
	call(i, method, ...args) { return this.inner.call(i, method, ...args); }
	async close() {}
}

/** a save's guild.dat imported fresh (after resetStatics: the loader writes statics a fight needs) */
async function freshSave(bytes) {
	const imp = await importSave(bytes);
	if (!imp.dungeon) throw new Error('This save holds no dungeon in progress.');
	if (imp.marker !== 1) throw new Error('The dungeon in this save is an autonomous run (no combat to solve).');
	return imp;
}

async function solve(job, progress) {
	const t0 = now();
	const B = BUDGETS[job.mode][job.budget] || BUDGETS[job.mode].normal;
	const prog = (p) => progress({ ...p, ms: now() - t0, budgetMs: B.budgetMs });
	resetStatics(tablesJson);
	const { pool, startMs } = await getPool({ size: job.workers, forSave: isSaveJob(job) }, prog);
	prog({ phase: 'setup' });
	const opts = { budget: B, cands: candidates(B.cands), onProgress: prog };
	const tSolve = now();
	const { res, problem, hero } = job.mode === 'robust' ? await solveRobustJob(job, pool, opts) : await solveExactJob(job, pool, opts);
	const solveMs = now() - tSolve;
	if (res.error) throw new Error(res.error);
	const out = { timings: { startMs, solveMs } };
	let replay = null;
	if (job.mode === 'exact') {
		prog({ phase: 'replay' });
		const tr = now();
		const script = await checkScript(problem, job, res);
		replay = script.replay;
		out.frames = script.frames;
		out.acts = script.acts;
		out.framesMatch = script.framesMatch;
		out.timings.replayMs = now() - tr;
	}
	out.plan = planFor(res, { job, hero, replay });
	out.timings.totalMs = now() - t0;
	return out;
}

/** exact mode from an in-dungeon save: its own dungeon and dice */
function isSaveJob(job) {
	return job.mode === 'exact' && !!job.saveBytes;
}

/** MP rule: puzzles refill MP, so by default the solver may not spend items on MP (js/solve: useItemsForMp) */
function mpOptions(job) {
	return { useItemsForMp: !!job.useItemsForMp, runOpts: { useItemsForMp: !!job.useItemsForMp } };
}

/** robust: Monte Carlo over the unknown dice, from the label and the hero spec */
async function solveRobustJob(job, pool, { budget, cands, onProgress }) {
	const hero = job.hero || {};
	const problem = { hero, type: job.type, seed: job.seed };
	const res = await solveRobust(problem, { pool, N: budget.N, nMin: budget.nMin, n0: Math.max(12, 2 * pool.size), budgetMs: budget.budgetMs, cands, seed: job.sampleSeed ?? 1, onProgress, ...mpOptions(job) });
	return { res, problem, hero };
}

/** exact: known dice, from an in-dungeon save (its own dungeon) or from the label with an xseed */
async function solveExactJob(job, pool, { budget, cands, onProgress }) {
	resetStatics(tablesJson);
	const hero = await resolveProfile(job.hero || {});
	const opts = { budgetMs: budget.budgetMs, cands, maxDecisions: budget.maxDecisions, onProgress, ...mpOptions(job) };
	if (!isSaveJob(job)) {
		const problem = { hero, type: job.type, seed: job.seed, xseed: job.xseed | 0, at: 'start' };
		return { res: await solveExact(problem, { pool, ...opts }), problem, hero };
	}
	const imp = await freshSave(job.saveBytes);
	const problem = { save: imp, saveName: job.saveName || 'guild.dat', hero, type: imp.dungeon.b, seed: imp.dungeon.a, at: 'save' };
	return { res: await solveExact(problem, { pool: new SavePool(pool, job.saveBytes, job.saveName), ...opts }), problem, hero };
}

/**
 * Exact mode: replay the script in a fresh engine (it must end where the solver's run did) and record its frames for
 * the script player. { replay, frames, acts, framesMatch }
 */
async function checkScript(problem, job, res) {
	const ups = scriptTopUps(res);
	const replay = replayScript(await replayProblem(problem, job), res.inputs, ups);
	replay.matches = !replay.error && replay.items === res.totals.items && replay.mp === res.totals.mp && replay.dead === res.totals.dead && replay.final.hp === res.totals.final.hp && replay.objectivesLeft === res.totals.objectivesLeft;
	// a script with top-up steps of its own carries its top-ups already
	const hasSteps = res.inputs.some((inp) => TOPUP.test(String(inp.t)));
	const rec = recordScript(await replayProblem(problem, job), res.inputs, hasSteps ? [] : ups);
	// the frames must end where the solver's own replay does (else the player says so)
	const last = rec.frames[rec.frames.length - 1].hero, fin = replay.final || res.totals.final;
	const framesMatch = !!fin && last.hp === fin.hp && last.mp === fin.mp && last.x === fin.x && last.y === fin.y;
	return { replay, frames: rec.frames, acts: rec.acts, framesMatch };
}

/**
 * MP top-ups (res.topUps [{ at, amount }]: the player solves puzzles for `amount` MP before input `at`), replayed as
 * tools/solve.mjs does; an older solver without them gives []
 */
function scriptTopUps(res) {
	return (res.topUps || []).map((u) => ({ at: u.at ?? u.atInput, amount: u.amount ?? u.mp })).filter((u) => Number.isInteger(u.at) && u.amount > 0);
}

/** the plan for the page (js/solve/plan.js); a save's plan is labelled with the save's own dungeon */
function planFor(res, { job, hero, replay }) {
	const label = isSaveJob(job) || !job.label ? formatLabel(res.problem.type, res.problem.seed) : job.label;
	const plan = buildPlan(res, { label, names: names.items || {}, heroSpec: heroSpecOut(hero), replay });
	if (isSaveJob(job)) plan.dungeon.at = 'save';
	const errs = validatePlan(plan);
	if (errs.length) plan.uiProblems = errs;
	return plan;
}

/** a problem the script can be replayed from (fresh statics; a save is re-imported, since a setup consumes it) */
async function replayProblem(problem, job) {
	resetStatics(tablesJson);
	if (problem.save) return { ...problem, save: await freshSave(job.saveBytes) };
	return problem;
}

/** the script's frames, recorded on a fight set up from a replayable problem */
function recordScript(replayable, inputs, topups) {
	const f = exactFight(replayable);
	if (!f || f.error) throw new Error(`replay: ${f ? f.error : 'no fight'}`);
	return recordFrames(f, inputs, topups);
}

// ---------------------------------------------------------------------------------------------------------------
// Frames: the state after every input, for the script player (positions, pools, foes, what each input did)

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];   // nav.js t_ path codes

/** critters other than the hero: flat [id, x, y, hp, hpM, flags, g, h, k] per critter (flags: 1 foe, 2 engaged, 4 sealed, 8 objective, 16 ally) */
function crittersOf(h) {
	const out = [];
	const D = new Set(h.D);
	for (const m of h.o) {
		if (m === h.f || m.u_()) continue;
		const foe = isFoe(h, m);
		const seal = foe ? sealOf(h, m) : 0;
		const flags = (foe ? 1 : 0) | (D.has(m) ? 2 : 0) | (seal > 0 ? 4 : 0) | (m.a.t ? 8 : 0) | (!foe ? 16 : 0);
		out.push(m.a.a, m.b.a, m.b.b, m.j.v_(), m.q_(), flags, m.g | 0, m.h | 0, m.k | 0);
	}
	return out;
}

function frameOf(h) {
	return { hero: heroOf(h), C: h.C ? 1 : 0, cr: crittersOf(h) };
}

function objectAt(h, x, y) {
	for (const o of h.n) if (o.b.a === x && o.b.b === y && !o.f) return o;
	for (const o of h.n) if (o.b.a === x && o.b.b === y) return o;
	return null;
}

/** what is at a cell before the input: { kind: 'critter' | 'object', id, ... } | null */
function targetAt(h, x, y) {
	if (x == null || y == null || x < 0 || y < 0 || x >= h.g || y >= h.h) return null;
	for (const m of h.o) {
		if (m === h.f || m.u_() || m.b.a !== x || m.b.b !== y) continue;
		return { kind: 'critter', id: m.a.a, g: m.g | 0, h: m.h | 0, k: m.k | 0, foe: isFoe(h, m), hp: m.j.v_(), hpM: m.q_(), seal: isFoe(h, m) ? sealOf(h, m) : 0 };
	}
	const o = objectAt(h, x, y);
	if (o) return { kind: 'object', id: o.a.a, x, y };
	return null;
}

function packMap(h) {
	const flat = packFlat(h);
	const m = new Map();
	for (let i = 0; i < flat.length; i += 2) m.set(flat[i], (m.get(flat[i]) || 0) + flat[i + 1]);
	return m;
}

/** the tap path from the hero to (x, y) as cells (nav.js t_: directions from the target back to the start) */
function tapCells(h, x, y) {
	const dirs = [];
	h.t_(h.f.b, new Util$Point(x, y), dirs, 45, 45, -1, false, 0);
	const cells = [];
	let cx = h.f.b.a, cy = h.f.b.b;
	for (let i = dirs.length - 1; i >= 0; i--) {
		const d = DIRS[dirs[i]];
		if (!d) break;
		cx += d[0]; cy += d[1];
		cells.push([cx, cy]);
	}
	return cells;
}

// the engine's input vocabulary (driver.js applyInput); anything else in a script is a solver step, e.g. an MP top-up
const ENGINE_INPUTS = new Set(['tap', 'step', 'wait', 'unseal', 'skill', 'item', 'potion', 'cancel']);
const TOPUP = /^(mp|topup|topUp|mpTopUp|puzzle|puzzles)$/;
const topupAmount = (inp) => Number(inp.mp ?? inp.amount ?? inp.n ?? 0) | 0;

/**
 * Replay a script input by input through the solver's own Run.apply (as exact.js replayScript does, so solver steps
 * it adds to scripts replay the same way) and record a frame after each. A top-up step the engine rejects is applied
 * here: in a dungeon, puzzle MP goes straight to the hero, up to its max.
 */
function recordFrames(fight, inputs, topups = []) {
	const run = new Run(fight, { walker: {} });
	const h = fight.h;
	const frames = [frameOf(h)];
	const acts = [];
	const upAt = new Map(topups.map((u) => [u.at, u.amount]));
	for (let i = 0; i < inputs.length; i++) {
		const act = recordInput(fight, run, { i, inp: inputs[i], topUp: upAt.get(i) });
		acts.push(act);
		frames.push(frameOf(h));
		if (act.dead || act.end) break;
	}
	// after a death or the dungeon's end the engine doesn't apply the rest of the script either
	const stopped = acts[acts.length - 1];
	for (let j = acts.length; j < inputs.length; j++) {
		acts.push({ i: j, inp: inputs[j], from: stopped.to, to: stopped.to, rej: 'engine ' + fight.st, d: { hp: 0, ep: 0, mp: 0 } });
		frames.push(frames[frames.length - 1]);
	}
	return { frames, acts };
}

/** apply input i and describe it for the player: what was at its cell, what it changed, the cells walked */
function recordInput(fight, run, { i, inp, topUp }) {
	const h = fight.h;
	// a plan-level top-up before this input: puzzle MP straight to the hero (up to max)
	const topupBefore = topUp > 0 ? addPuzzleMp(h, topUp) : 0;
	const act = actBefore(h, inp, i);
	if (topupBefore) act.topupBefore = topupBefore;
	const before = stateBefore(h, inp, act.from);
	if (fight.hook && fight.hook.msgs) fight.hook.msgs.length = 0;
	const { r } = run.apply(inp);
	act.rej = r.rej || null;
	act.st = r.st;
	if (!ENGINE_INPUTS.has(String(inp.t))) applySolverStep(act, h, before.pools.mp);
	describeOutcome(act, fight, before);
	return act;
}

/** puzzle MP straight to the hero, up to its max; returns the MP it got */
function addPuzzleMp(h, amount) {
	const me = h.f;
	const m0 = me.E_();
	me.G_(Math.min(m0 + amount, h.e.n_()));
	return me.E_() - m0;
}

/** the cell an input aims at: a step's neighbour, else the input's own x, y (none for most non-cell inputs) */
function inputCell(inp, from) {
	if (inp.t === 'step') return { x: from.x + (inp.dx | 0), y: from.y + (inp.dy | 0) };
	return { x: inp.x, y: inp.y };
}

/** the act as the input finds the hero: { i, inp, from, C, target, ap, skill? } */
function actBefore(h, inp, i) {
	const me = h.f;
	const from = { x: me.b.a, y: me.b.b };
	const cell = inputCell(inp, from);
	const act = { i, inp, from, C: h.C ? 1 : 0, target: cell.x != null ? targetAt(h, cell.x, cell.y) : null, ap: me.n.v_() };
	if (inp.t === 'skill') { const sk = zw.q.get(inp.id); act.skill = sk ? sk.o : null; }
	return act;
}

/** what describeOutcome compares against: the tap path, the hero's pools, the pack and the living foes */
function stateBefore(h, inp, from) {
	const me = h.f;
	const cell = inputCell(inp, from);
	const path = (inp.t === 'tap' || inp.t === 'step') ? tapCells(h, cell.x, cell.y) : null;
	const pools = { hp: me.j.v_(), ep: me.z.v_(), mp: me.E_() };
	const pack = packMap(h);
	const foes = h.o.filter((m) => m !== h.f && isFoe(h, m));
	return { path, pools, pack, foes };
}

/** a solver step the engine has no input for; a top-up step it rejects is applied here */
function applySolverStep(act, h, mp0) {
	const me = h.f;
	if (TOPUP.test(String(act.inp.t))) {
		if (act.rej && me.E_() === mp0) { me.G_(Math.min(mp0 + topupAmount(act.inp), h.e.n_())); act.rej = null; }
		act.topup = me.E_() - mp0;
	}
	act.solverStep = 1;
}

/** the input's effects on act: pool deltas, items used and got, kills, where the hero ends, messages, cells walked */
function describeOutcome(act, fight, before) {
	const h = fight.h;
	const me = h.f;
	act.d = { hp: me.j.v_() - before.pools.hp, ep: me.z.v_() - before.pools.ep, mp: me.E_() - before.pools.mp };
	Object.assign(act, packChange(before.pack, packMap(h)));
	const killed = before.foes.filter((m) => m.u_()).map((m) => ({ id: m.a.a, x: m.b.a, y: m.b.b }));
	if (killed.length) act.killed = killed;
	act.to = { x: me.b.a, y: me.b.b };
	act.C1 = h.C ? 1 : 0;
	act.dead = me.u_() ? 1 : 0;
	act.end = fight.c.w ? 1 : 0;
	if (fight.hook && fight.hook.msgs && fight.hook.msgs.length) act.msg = fight.hook.msgs.slice(0, 4).map(String);
	Object.assign(act, walked(before.path, act.from, act.to));
}

/** { used?, got? }: [id, n] items that left and came into the pack */
function packChange(before, after) {
	const used = [];
	const got = [];
	for (const [id, n] of before) { const n1 = after.get(id) || 0; if (n1 < n) used.push([id, n - n1]); }
	for (const [id, n1] of after) { const n = before.get(id) || 0; if (n1 > n) got.push([id, n1 - n]); }
	const change = {};
	if (used.length) change.used = used;
	if (got.length) change.got = got;
	return change;
}

/** { path?, jump? }: the cells walked; a ladder / portal / hatch is a jump (the end is not on the path) */
function walked(path, from, to) {
	if (to.x === from.x && to.y === from.y) return {};
	if (!path) return { jump: 1 };
	const k = path.findIndex(([x, y]) => x === to.x && y === to.y);
	return k >= 0 ? { path: path.slice(0, k + 1) } : { path, jump: 1 };
}

// ---------------------------------------------------------------------------------------------------------------

async function replay({ problem: p, inputs, topUps = [], saveBytes, saveName }) {
	resetStatics(tablesJson);
	const hero = await resolveProfile(p.hero || {});
	const problem = { ...p, hero };
	const job = { saveBytes, saveName };
	if (saveBytes) problem.save = true;
	const rp = await replayProblem(problem, job);
	const check = replayScript(rp, inputs, topUps);
	const rec = recordScript(await replayProblem(problem, job), inputs, topUps);
	return { ...rec, replay: check };
}

self.onmessage = async (e) => {
	const { id, cmd, args } = e.data || {};
	const progress = (p) => self.postMessage({ id, progress: p });
	try {
		let result;
		if (cmd === 'init') result = await init(args);
		else if (cmd === 'solve') result = await solve(args, progress);
		else if (cmd === 'replay') result = await replay(args);
		else throw new Error(`solve-host: no command ${cmd}`);
		self.postMessage({ id, result });
	} catch (err) {
		self.postMessage({ id, error: String((err && err.message) || err), stack: String((err && err.stack) || '') });
	}
};
