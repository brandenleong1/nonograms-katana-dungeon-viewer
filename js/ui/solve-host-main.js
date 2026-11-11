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
async function getPool(size, saveMode, progress) {
	const key = `${size}|${saveMode ? 'save' : 'std'}`;
	if (pool && poolKey === key) return { pool, startMs: 0 };
	if (pool) { await pool.close(); pool = null; }
	progress({ phase: 'workers', workers: size });
	const t = now();
	// js/ui/pool-worker.js: the browser entry for js/solve/worker.js (or the save adapter js/ui/solve-worker.js)
	pool = await WorkerPool.create({ size, tables: { url: tablesUrl }, workerUrl: new URL(saveMode ? './pool-worker.js?save=1' : './pool-worker.js', import.meta.url) });
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
	const saveMode = job.mode === 'exact' && !!job.saveBytes;
	const { pool: base, startMs } = await getPool(job.workers, saveMode, prog);
	prog({ phase: 'setup' });
	const cands = candidates(B.cands);
	let res, problem, hero = job.hero || {};
	const onProgress = (p) => prog(p);
	// MP rule: puzzles refill MP, so by default the solver may not spend items on MP (js/solve: useItemsForMp)
	const mpOpts = { useItemsForMp: !!job.useItemsForMp, runOpts: { useItemsForMp: !!job.useItemsForMp } };
	const tSolve = now();
	if (job.mode === 'robust') {
		problem = { hero, type: job.type, seed: job.seed };
		const W = base.size;
		res = await solveRobust(problem, { pool: base, N: B.N, nMin: B.nMin, n0: Math.max(12, 2 * W), budgetMs: B.budgetMs, cands, seed: job.sampleSeed ?? 1, onProgress, ...mpOpts });
	} else {
		resetStatics(tablesJson);
		hero = await resolveProfile(hero);
		if (saveMode) {
			const imp = await freshSave(job.saveBytes);
			problem = { save: imp, saveName: job.saveName || 'guild.dat', hero, type: imp.dungeon.b, seed: imp.dungeon.a, at: 'save' };
			res = await solveExact(problem, { pool: new SavePool(base, job.saveBytes, job.saveName), budgetMs: B.budgetMs, cands, maxDecisions: B.maxDecisions, onProgress, ...mpOpts });
		} else {
			problem = { hero, type: job.type, seed: job.seed, xseed: job.xseed | 0, at: 'start' };
			res = await solveExact(problem, { pool: base, budgetMs: B.budgetMs, cands, maxDecisions: B.maxDecisions, onProgress, ...mpOpts });
		}
	}
	const solveMs = now() - tSolve;
	if (res.error) throw new Error(res.error);
	const label = saveMode || !job.label ? formatLabel(res.problem.type, res.problem.seed) : job.label;
	let out = { timings: { startMs, solveMs } };
	let replay = null;
	if (job.mode === 'exact') {
		prog({ phase: 'replay' });
		const tr = now();
		// MP top-ups (res.topUps [{ at, amount }]: the player solves puzzles for `amount` MP before input `at`), replayed
		// as tools/solve.mjs does; an older solver without them gives []
		const ups = (res.topUps || []).map((u) => ({ at: u.at ?? u.atInput, amount: u.amount ?? u.mp })).filter((u) => Number.isInteger(u.at) && u.amount > 0);
		const rp = await replayProblem(problem, job);
		replay = replayScript(rp, res.inputs, ups);
		replay.matches = !replay.error && replay.items === res.totals.items && replay.mp === res.totals.mp && replay.dead === res.totals.dead && replay.final.hp === res.totals.final.hp && replay.objectivesLeft === res.totals.objectivesLeft;
		const hasSteps = res.inputs.some((inp) => TOPUP.test(String(inp.t)));
		const rec = await framesFor(problem, job, res.inputs, hasSteps ? [] : ups);
		out.frames = rec.frames;
		out.acts = rec.acts;
		// the frames must end where the solver's own replay does (else the player says so)
		const last = rec.frames[rec.frames.length - 1].hero, fin = replay.final || res.totals.final;
		out.framesMatch = !!fin && last.hp === fin.hp && last.mp === fin.mp && last.x === fin.x && last.y === fin.y;
		out.timings.replayMs = now() - tr;
	}
	const plan = buildPlan(res, { label, names: names.items || {}, heroSpec: heroSpecOut(hero), replay });
	if (saveMode) plan.dungeon.at = 'save';
	const errs = validatePlan(plan);
	if (errs.length) plan.uiProblems = errs;
	out.plan = plan;
	out.timings.totalMs = now() - t0;
	return out;
}

/** a problem the script can be replayed from (fresh statics; a save is re-imported, since a setup consumes it) */
async function replayProblem(problem, job) {
	resetStatics(tablesJson);
	if (problem.save) return { ...problem, save: await freshSave(job.saveBytes) };
	return problem;
}

async function framesFor(problem, job, inputs, topups = []) {
	const rp = await replayProblem(problem, job);
	const f = exactFight(rp);
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
		const inp = inputs[i];
		const me = h.f;
		// a plan-level top-up before this input: puzzle MP straight to the hero (up to max)
		const up = upAt.get(i);
		let topupBefore = 0;
		if (up > 0) { const m0 = me.E_(); me.G_(Math.min(m0 + up, h.e.n_())); topupBefore = me.E_() - m0; }
		const from = { x: me.b.a, y: me.b.b };
		const tx = inp.t === 'step' ? from.x + (inp.dx | 0) : inp.x;
		const ty = inp.t === 'step' ? from.y + (inp.dy | 0) : inp.y;
		const act = { i, inp, from, C: h.C ? 1 : 0, target: tx != null ? targetAt(h, tx, ty) : null, ap: me.n.v_() };
		if (inp.t === 'skill') { const sk = zw.q.get(inp.id); act.skill = sk ? sk.o : null; }
		if (topupBefore) act.topupBefore = topupBefore;
		const path = (inp.t === 'tap' || inp.t === 'step') ? tapCells(h, tx, ty) : null;
		const hp0 = me.j.v_(), ep0 = me.z.v_(), mp0 = me.E_();
		const pack0 = packMap(h);
		const foes0 = h.o.filter((m) => m !== h.f && isFoe(h, m));
		if (fight.hook && fight.hook.msgs) fight.hook.msgs.length = 0;
		const { r } = run.apply(inp);
		act.rej = r.rej || null;
		act.st = r.st;
		if (!ENGINE_INPUTS.has(String(inp.t))) {
			if (TOPUP.test(String(inp.t))) {
				if (act.rej && me.E_() === mp0) { me.G_(Math.min(mp0 + topupAmount(inp), h.e.n_())); act.rej = null; }
				act.topup = me.E_() - mp0;
			}
			act.solverStep = 1;
		}
		act.d = { hp: me.j.v_() - hp0, ep: me.z.v_() - ep0, mp: me.E_() - mp0 };
		const pack1 = packMap(h);
		const used = [];
		const got = [];
		for (const [id, n] of pack0) { const n1 = pack1.get(id) || 0; if (n1 < n) used.push([id, n - n1]); }
		for (const [id, n1] of pack1) { const n = pack0.get(id) || 0; if (n1 > n) got.push([id, n1 - n]); }
		if (used.length) act.used = used;
		if (got.length) act.got = got;
		const killed = foes0.filter((m) => m.u_()).map((m) => ({ id: m.a.a, x: m.b.a, y: m.b.b }));
		if (killed.length) act.killed = killed;
		act.to = { x: me.b.a, y: me.b.b };
		act.C1 = h.C ? 1 : 0;
		act.dead = me.u_() ? 1 : 0;
		act.end = fight.c.w ? 1 : 0;
		if (fight.hook && fight.hook.msgs && fight.hook.msgs.length) act.msg = fight.hook.msgs.slice(0, 4).map(String);
		// the cells walked (a ladder / portal / hatch jumps: the end is not on the path)
		if (path && (act.to.x !== from.x || act.to.y !== from.y)) {
			const k = path.findIndex(([x, y]) => x === act.to.x && y === act.to.y);
			act.path = k >= 0 ? path.slice(0, k + 1) : path;
			if (k < 0) act.jump = 1;
		} else if (act.to.x !== from.x || act.to.y !== from.y) act.jump = 1;
		acts.push(act);
		frames.push(frameOf(h));
		if (act.dead || act.end) {
			// the rest of the script (if any) is not applied by the engine either
			for (let j = i + 1; j < inputs.length; j++) { acts.push({ i: j, inp: inputs[j], from: act.to, to: act.to, rej: 'engine ' + fight.st, d: { hp: 0, ep: 0, mp: 0 } }); frames.push(frames[frames.length - 1]); }
			break;
		}
	}
	return { frames, acts };
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
	const rec = await framesFor(problem, job, inputs, topUps);
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
