// Robust mode: the dungeon label only (combat RNG hw.x unknown -- it is seeded from the clock at entry). Monte Carlo
// over random hw.x: N sample play-throughs walk the route together; at each encounter the candidate tactics are
// played from every sample's state (common random numbers: each candidate sees the same RNG state), the best one by
// the lexicographic objective (cost.js) is kept for that encounter, and the samples carry on from its outcome.
//
// e01 (js/gen/rng.js) draws only from the low 15 bits of its state, so hw.x has 32768 effective states; a sample is
// a uniform draw of them (any 32-bit value) at the dungeon start, which is the label's distribution exactly.
//
//   const res = await solveRobust({ hero, type, seed }, { pool, N: 128, budgetMs: 20000 });
//   // res.decisions[k] = { key, stop, enemies, tactic, stats, candidates }, res.totals = { items, mp, death, pack }
//
// The work runs in Shards (sample owners). A Shard is the same object inline (no workers) or behind a worker
// (worker.js / pool.js); the coordinator only sends plain data and gets plain data back.
import { Run, RestRule, encounterKey, heroOf, isFoe, critterInfo, Ledger, heroSpecOut, trimTopUps } from './sim.js';
import { makePolicy, labelOf, candidates as defaultCandidates, BASELINE, availOf, usable } from './policies.js';
import { pricesFor, scoreOutcome, aggregate, compareAgg, dominated, dist, TOL } from './cost.js';
import { vj0 } from '../gen/statics.js';

const itemDef = (id) => vj0.Z1.get(id) ?? null;

/** a profile fight's entry (js/combat/entry.js fight.entry) as plain data: gates, fee, MP taken, pack */
export function entryOut(fight) {
	const e = fight && fight.entry;
	if (!e) return null;
	return { hero: e.hero, gates: e.gates, fee: e.fee, feePaid: e.feePaid, mp: e.mp, fam: e.fam, items: e.items };
}

const DEFAULT_DEFAULT = { name: 'melee', params: { smash: 'finish' } };   // the continuation policy of extensions

/**
 * Run options from the solver's runOpts { recovery, rest, useItemsForMp, topUp }: MP is replenishable by default --
 * the hero is topped up before any input that needs it (sim.js Run.topUpFor), no item ever buys MP, and Doctor / Charge need no
 * MP reserve. useItemsForMp: the old stock model (no top-ups, MP items may refill the pool, MP kept for the route).
 */
export function runOptsFor(o = {}, extra = {}) {
	const rest = o.rest;
	const stock = !!o.useItemsForMp;
	const rr = rest === false ? null : new RestRule(stock ? { mpReserve: 'route', mpItems: true, ...(rest || {}) } : { mpReserve: 0, epLow: 'auto', ...(rest || {}) });
	const topUp = stock || o.topUp === false ? null : { reserve: 30, ...(o.topUp || {}) };
	return { walker: { recovery: o.recovery !== false, rest: rr }, topUp, ...extra };
}

/** splitmix-ish 32-bit hash for deterministic sample RNG states */
export function mix32(x) {
	x = (x ^ 0x9e3779b9) | 0;
	x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
	x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
	return (x ^ (x >>> 16)) | 0;
}

/** play a candidate from a resumed run; returns the outcome (plain data) */
export function outcomeOf(run, cand, ctx = {}) {
	const h0 = run.fight.h;
	const led0 = run.led.clone();
	const engaged = h0.D.filter((m) => isFoe(h0, m));
	const fought = run.fightWith(makePolicy(cand.name, cand.params), ctx.maxInputs);
	const play = { engaged, end: fought.end, turns: fought.turns, ext: 0, looked: 0 };
	fightLeftovers(run, play, ctx);
	lookAhead(run, play, ctx);
	return outcomeRecord(run, led0, play);
}

/**
 * Extension: foes engaged at the start still alive (broken away, sealed, out of reach) -> walk on and fight them with
 * the continuation policy, so a tactic is charged for what it leaves behind.
 */
function fightLeftovers(run, play, ctx) {
	const maxExt = ctx.ext ?? 1;
	while (play.ext < maxExt && play.end === 'won' && someStillEngaged(run, play.engaged)) {
		const ev = run.toEncounter(ctx.extWalk ?? 80);
		if (ev.ev !== 'combat') break;
		const r = fightOn(run, ctx);
		play.end = r.end;
		play.turns += r.turns;
		play.ext++;
	}
}

/**
 * Lookahead: the next `look` encounters with the continuation policy, so a tactic that wins cheaply now and leaves
 * the hero too weak for what follows is charged with that death (survival is never traded for items).
 */
function lookAhead(run, play, ctx) {
	while (play.looked < (ctx.look ?? 0) && play.end === 'won' && !run.fight.h.f.u_() && !run.fight.c.w) {
		if (run.status === 'walk') run.walker.afterEncounter();
		const ev = run.toEncounter(ctx.lookWalk ?? 1500);
		if (ev.ev !== 'combat') break;
		const r = fightOn(run, ctx);
		if (r.end === 'dead' || r.end === 'stuck' || r.end === 'error') play.end = r.end;
		play.turns += r.turns;
		play.looked++;
	}
}

function someStillEngaged(run, engaged) {
	return engaged.some((m) => !m.u_() && run.fight.h.o.includes(m) && isFoe(run.fight.h, m));
}

/** fight the current encounter with the continuation policy */
function fightOn(run, ctx) {
	const c = ctx.cont || DEFAULT_DEFAULT;
	return run.fightWith(makePolicy(c.name, c.params), ctx.maxInputs);
}

/** what a play-out cost, counted from led0 (the ledger before it), and where it left the hero */
function outcomeRecord(run, led0, play) {
	const led = run.led.since(led0);
	const h = run.fight.h, P = heroOf(h);
	return {
		dead: led.dead || h.f.u_(), end: play.end, items: led.items(), byId: led.itemsById(), mpSpent: led.mp, hpLost: led.hp, epLost: led.ep,
		hp: P.hp, hpM: P.hpM, ep: P.ep, epM: P.epM, mpLeft: P.mp, inputs: led.inputs, turns: play.turns, ext: play.ext, looked: play.looked,
	};
}

/** MP-restoring items used (bj0 Z > 0) in a byId record */
export function mpItemsOf(byId) {
	let n = 0;
	for (const [id, k] of Object.entries(byId || {})) { const it = itemDef(+id); if (it && it.Z > 0) n += k; }
	return n;
}

/** HP and EP a fight really took: what was lost plus what items healed or fed (the need for item-free play) */
export function realNeedOf(o) {
	let healed = 0, fed = 0;
	for (const [id, n] of Object.entries(o.byId)) {
		const it = itemDef(+id);
		if (!it) continue;
		healed += (it.X > 0 ? it.X : 0) * n;
		fed += (it.Y > 0 ? it.Y : 0) * n;
	}
	return { hp: Math.min(o.hpM, Math.max(0, o.hpLost + healed)), ep: Math.max(0, o.epLost + fed) };
}

/** the walker's route as plain data */
export function routeLegs(walker) {
	return walker.legs.map((L) => ({ kind: L.kind, label: L.label, rec: L.rec ? { id: L.rec.id, x: L.rec.x, y: L.rec.y, critter: L.rec.k !== undefined } : null, at: L.at, steps: L.steps, doing: L.doing }));
}

/** a walker stop (the route leg an encounter happened on) as plain data */
export function stopOut(stop) {
	if (!stop) return null;
	return { kind: stop.kind, label: stop.label, rec: stop.rec ? { id: stop.rec.id, x: stop.rec.x, y: stop.rec.y } : null, at: stop.at };
}

/** the key encounters are counted under per stop (the stop's kind and target; 'start' before the first stop) */
export function stopCountKey(stop) {
	if (!stop) return 'start';
	return `${stop.kind}:${stop.rec ? stop.rec.id + '@' + stop.rec.x + ',' + stop.rec.y : ''}`;
}

/** count one more encounter at the stop in stopCount; returns how many came before it there */
export function countVisit(stopCount, stop) {
	const sk = stopCountKey(stop);
	const ord = stopCount[sk] || 0;
	stopCount[sk] = ord + 1;
	return ord;
}

/** the need levels the rest rule's Doctor / Charge repair to while walking the run on */
export function setRestNeed(run, need) {
	const r = run.walker.opts.rest;
	if (r) r.need = need || null;
}

/** where a play-through stands after a fight: dead, stuck, done (the dungeon is finished) or walking on */
function statusAfter(o, fight) {
	if (o.dead) return 'dead';
	if (o.end === 'stuck' || o.end === 'error') return 'stuck';
	if (fight.c.w) return 'done';
	// (still in combat, rare: it walks on too, and the next advance re-keys the encounter)
	return 'walk';
}

/** a sample's ledger as plain totals, with the MP top-ups trimmed to what the player really has to solve for */
function ledgerSummary(led) {
	const trim = trimTopUps(led.topUps);
	const topUps = led.topUps.map((t, i) => ({ stop: t.stop, enc: t.enc, amount: trim[i] })).filter((t) => t.amount > 0);
	return { items: led.items(), byId: led.itemsById(), mp: led.mp, mpPeak: led.mpPeak, mpBy: led.mpBy, topUps, toSolve: topUps.reduce((a, t) => a + t.amount, 0), hpLost: led.hp, inputs: led.inputs };
}

// ---------------------------------------------------------------------------------------------------------------
// Shard: owns a set of samples (their checkpoints); all methods take and return plain data

export class Shard {
	/**
	 * cfg: { hero, type, seed, runOpts: { walker: { recovery, rest } }, maxInputs, maxWalk }. Statics must be reset by
	 * the caller (resetStatics) before init.
	 */
	constructor(cfg) {
		this.cfg = cfg;
		this.samples = new Map();   // id -> { ck, status, key, info, events, stopCount }
		this.dead = null;           // a Fight to refill on resume
	}

	init(samples) {
		const { hero, type, seed } = this.cfg;
		const base = Run.start(hero, { type, seed, xseed: 1, at: 'start' }, this.runOpts());
		if (base.error) return { error: base.error };
		void base.walker;   // plan once, shared by every sample
		this.baseCk = base.checkpoint();
		this.prices = pricesFor(base.fight.h, { useItemsForMp: !!(this.cfg.runOpts || {}).useItemsForMp });
		this.hero0 = heroOf(base.fight.h);
		for (const s of samples) {
			this.samples.set(s.id, { id: s.id, xa: s.xa, ck: this.startCk(s), status: 'walk', key: null, info: null, events: [], stopCount: {} });
		}
		return { ok: samples.length, prices: this.prices, hero: this.hero0, route: routeLegs(base.walker), needs: base.walker.routeNeeds(), entry: entryOut(base.fight) };
	}

	runOpts() { return runOptsFor(this.cfg.runOpts); }

	resume(ck) {
		const run = Run.resume(ck, this.dead);
		this.dead = null;
		return run;
	}

	park(run) { this.dead = run.fight; }

	/** walk every sample that is not at an encounter to its next one; returns their frontier (need0: the rest rule's need before a sample's first decision) */
	advance(need0 = null) {
		const out = [];
		for (const s of this.samples.values()) {
			if (s.status === 'walk') this.walkToEncounter(s, need0);
			out.push({ id: s.id, status: s.status, key: s.key, info: s.status === 'combat' ? s.info : null });
		}
		return out;
	}

	/** walk one sample on to its next encounter (or the end of its walk) */
	walkToEncounter(s, need0) {
		const run = this.resume(s.ck);
		setRestNeed(run, s.need || need0);
		const ev = run.toEncounter(this.cfg.maxWalk ?? 3000);
		if (ev.ev === 'combat') this.meetEncounter(s, run, ev.stop);
		else s.status = ev.ev;
		s.ck = run.checkpoint();
		s.led = run.led.clone();
		s.objLeft = run.fight.h.i_();
		this.park(run);
	}

	/** a sample arrived at an encounter on the way to stop: key it and record what it faces */
	meetEncounter(s, run, stop) {
		s.key = encounterKey(stop, countVisit(s.stopCount, stop));
		const h = run.fight.h;
		const needs = run.walker.routeNeeds();
		s.info = { stop: stopOut(stop), enemies: h.D.filter((m) => isFoe(h, m)).map((m) => critterInfo(h, m)), hero: heroOf(h), needs };
		s.status = 'combat';
	}

	/**
	 * jobs: [{ id, xa?, c }] (c: index into ctx.cands); ctx: { cands, need: { hp, ep, mp? }, ext, maxInputs }. Each job
	 * resumes the sample's encounter start (xa: an RNG variant), plays candidate c (+ extension) and scores it.
	 */
	evaluate(jobs, ctx) {
		const t = now();
		const out = [];
		for (const j of jobs) {
			const s = this.samples.get(j.id);
			if (!s || s.status !== 'combat') { out.push({ id: j.id, c: j.c, u: j.u, xa: j.xa, o: null }); continue; }
			const run = this.resume(s.ck);
			if (j.xa != null) run.fight.h.x.a = j.xa | 0;
			setRestNeed(run, ctx.restNeed);
			const o = outcomeOf(run, ctx.cands[j.c], ctx);
			out.push({ id: j.id, c: j.c, u: j.u, xa: j.xa, o, sc: scoreOutcome(o, sampleNeed(ctx.need, s.info?.needs), this.prices) });
			this.park(run);
		}
		if (out.length) out[0].ms = now() - t;
		return out;
	}

	/** commit candidate cand at the samples' current encounter (no extension); they wait at the next walk */
	commit(ids, cand, meta = {}) {
		const out = [];
		for (const id of ids) {
			const s = this.samples.get(id);
			if (!s || s.status !== 'combat') continue;
			out.push({ id, ...this.commitSample(s, cand, meta) });
		}
		return out;
	}

	/** play cand at a sample's encounter for good; returns { o, status } */
	commitSample(s, cand, meta) {
		const run = this.resume(s.ck);
		if (meta.need) s.need = meta.need;
		setRestNeed(run, s.need);
		const o = outcomeOf(run, cand, { ext: 0, maxInputs: meta.maxInputs });
		s.events.push({ key: s.key, tactic: labelOf(cand.name, cand.params), o });
		s.status = statusAfter(o, run.fight);
		if (s.status === 'walk') run.walker.afterEncounter();
		s.ck = run.checkpoint();
		s.led = run.led.clone();
		s.objLeft = run.fight.h.i_();
		this.park(run);
		return { o, status: s.status };
	}

	/**
	 * Play whole dungeons from the samples' starts with one fixed policy at every encounter (the baseline / scout):
	 * per sample { status, items, byId, mp, encounters: [{ key, hpLost, epLost, items, mp, enemies }] }. Samples are
	 * not changed.
	 */
	playthrough(ids, cand, opts = {}) {
		const out = [];
		for (const id of ids) {
			const s = this.samples.get(id);
			if (!s) continue;
			const run = this.resume(opts.fromStart === false ? s.ck : this.startCk(s));
			// opts.mpAdd: more MP at the start (the marginal value of MP)
			if (opts.mpAdd) addStartMp(run, opts.mpAdd);
			const { status, encounters } = playEncounters(run, cand, { ...opts, maxWalk: this.cfg.maxWalk ?? 3000 });
			out.push({ id, status, ...ledgerSummary(run.led), objectivesLeft: run.fight.h.i_(), encounters });
			this.park(run);
		}
		return out;
	}

	/** a sample's dungeon-start checkpoint (base + its RNG state) */
	startCk(s) {
		const run = this.resume(this.baseCk);
		run.fight.h.x.a = s.xa | 0;
		const ck = run.checkpoint();
		this.park(run);
		return ck;
	}

	/** per-sample totals: { id, status, items, byId, mp, hpLost, objectivesLeft, events } */
	totals() {
		const out = [];
		for (const s of this.samples.values()) {
			const led = s.led || new Ledger();
			const events = s.events.map((e) => ({ key: e.key, tactic: e.tactic, items: e.o.items, mp: e.o.mpSpent, hpLost: e.o.hpLost, end: e.o.end }));
			out.push({ id: s.id, status: s.status, ...ledgerSummary(led), objectivesLeft: s.objLeft ?? null, events });
		}
		return out;
	}
}

/** the need a sample's play-out is scored against: the fights ahead plus what its own route still needs */
function sampleNeed(need, routeNeeds) {
	return { hp: need?.hp ?? 0, ep: (need?.ep ?? 0) + (routeNeeds?.ep ?? 0), mp: routeNeeds?.mp ?? 0 };
}

/** add MP at the start, capped at the pool's max */
function addStartMp(run, add) {
	const me = run.fight.h.f;
	me.G_(Math.max(0, Math.min(me.E_() + add, run.fight.h.e.n_())));
}

/**
 * Fight every encounter on the route with cand (or opts.plan's tactic for its key) until the run ends or
 * opts.maxEnc encounters; returns { status, encounters: per encounter what it cost }.
 */
function playEncounters(run, cand, opts) {
	const encounters = [];
	const stopCount = {};
	for (let k = 0; k < (opts.maxEnc ?? 200); k++) {
		const ev = run.toEncounter(opts.maxWalk);
		if (ev.ev !== 'combat') return { status: ev.ev, encounters };
		const key = encounterKey(ev.stop, countVisit(stopCount, ev.stop));
		const h = run.fight.h;
		const enemies = h.D.filter((m) => isFoe(h, m)).map((m) => m.a.a);
		// opts.plan: the decided tactic per encounter key (the replay of a solved plan); cand for unknown keys
		const o = outcomeOf(run, (opts.plan && opts.plan[key]) || cand, { ext: 0, maxInputs: opts.maxInputs });
		const real = realNeedOf(o);
		encounters.push({ key, hpLost: o.hpLost, hpNeed: real.hp, epLost: o.epLost, epNeed: real.ep, items: o.items, mp: o.mpSpent, end: o.end, enemies });
		const status = statusAfter(o, run.fight);
		if (status !== 'walk') return { status, encounters };
		run.walker.afterEncounter();
	}
	return { status: 'walk', encounters };
}


// ---------------------------------------------------------------------------------------------------------------
// Inline pool (no workers): the coordinator's view of shards

export class InlinePool {
	constructor(n = 1) { this.n = n; this.shards = []; }
	get size() { return this.n; }
	async setup(cfg) { this.shards = []; for (let i = 0; i < this.n; i++) this.shards.push(new Shard(cfg)); return this.shards.map(() => ({ ok: true })); }
	async call(i, method, ...args) { return this.shards[i][method](...args); }
	async close() {}
}

// ---------------------------------------------------------------------------------------------------------------
// Coordinator

/**
 * solveRobust(problem, opts) -> result (plain data; plan.js turns it into the UI plan).
 * problem: { hero, type, seed }
 * opts: { pool (InlinePool / pool.js WorkerPool; default inline), N: samples (128), nMin: per-decision minimum incl. RNG
 *         variants (32), n0: first round per candidate (16), cands: [{ name, params }], maxDeath: 0.01, ext: 1,
 *         scout: samples for the baseline / need pass (16), budgetMs: the expected wall time (progress only, unless
 *         strictBudget: then fewer samples, quick candidates and no lookahead when behind), seed: sample seed,
 *         escalate: core candidates first (false: every candidate everywhere -- quality first), zone: { items, mp }
 *         indifference zone from the third round (null: off), look / lookN / lookTop: the survival lookahead (3 / 24 / 4),
 *         useItemsForMp, runOpts: { recovery, rest }, onProgress(info) }
 */
export async function solveRobust(problem, opts = {}) {
	const t0 = now();
	const pool = opts.pool || new InlinePool(1);
	const settings = robustSettings(opts);
	const { N, maxDeath, runOpts } = settings;
	await pool.setup({ hero: problem.hero, type: problem.type, seed: problem.seed, runOpts, maxWalk: opts.maxWalk, maxInputs: opts.maxInputs });
	const W = pool.size;
	const samples = dealSamples(N, settings.seed, W);
	const owner = new Map(samples.map((s) => [s.id, s.shard]));
	const inits = await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'init', samples.filter((s) => s.shard === w).map(({ id, xa }) => ({ id, xa })))));
	const err = inits.find((r) => r && r.error);
	if (err) return { error: err.error };
	const { prices, hero: hero0, route, needs, entry } = inits[0];
	const progress = (p) => { if (opts.onProgress) opts.onProgress({ ms: now() - t0, ...p }); };

	const perf = { setupMs: now() - t0, scoutMs: 0, advanceMs: 0, decideMs: 0, commitMs: 0, evals: 0, commits: 0, evalCpuMs: 0 };
	const search = { pool, owner, W, opts, settings, perf, t0, prices, scout: null };
	let tp = now();
	const nScout = Math.min(opts.scout ?? 16, N);
	const scoutIds = samples.slice(0, nScout).map((s) => s.id);
	const scoutRows = (await byShard(search, scoutIds, (w, ids) => pool.call(w, 'playthrough', ids, opts.baseline || BASELINE, { maxInputs: opts.maxInputs }))).flat();
	search.scout = new ScoutProfile(scoutRows);
	perf.scoutMs = now() - tp;
	perf.lookMs = 0; perf.lookEvals = 0; perf.marginalMs = 0;
	progress({ phase: 'scout', scout: nScout, keys: search.scout.order.size });

	const decisions = [];
	for (let round = 0; ; round++) {
		tp = now();
		const front = (await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'advance', search.scout.restNeedAfter(null))))).flat();
		perf.advanceMs += now() - tp;
		const waiting = groupByEncounter(front);
		if (!waiting.size || round >= 400) break;
		const key = nextEncounterKey(waiting, search.scout);
		const d = await settleEncounter(search, key, waiting.get(key), decisions.length);
		decisions.push(d);
		progress({ phase: 'encounter', k: decisions.length, key, tactic: d.tactic.label, samples: d.samples });
	}

	const tot = (await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'totals')))).flat();
	const totals = summarizeTotals(tot, maxDeath);
	let marginal = [];
	if (shouldPriceMp(search, totals, needs, hero0)) {
		tp = now();
		marginal = await marginalMpValue(search, decisions, hero0, scoutIds);
		perf.marginalMs = now() - tp;
	}
	const res = {
		mode: 'robust', problem: { type: problem.type, seed: problem.seed, hero: heroSpecOut(problem.hero) }, hero: hero0, prices, route, needs, entry,
		N, decisions, totals, baseline: summarizeTotals(scoutRows, maxDeath),
		mpPlan: mpPlanOf(hero0, needs, totals, decisions, marginal, { route, tot, useItemsForMp: !!runOpts.useItemsForMp }),
		ms: now() - t0, workers: W, perf,
	};
	return res;
}

/** solveRobust's options with their defaults */
function robustSettings(opts) {
	// quality first: the budget only cuts the search with strictBudget
	const budget = opts.budgetMs ?? Infinity;
	return {
		N: opts.N ?? 128,
		nMin: opts.nMin ?? 32,
		n0: opts.n0 ?? 16,   // (rounds also never go below 2 units per worker, so every worker has work)
		maxDeath: opts.maxDeath ?? 0.01,
		cands: (opts.cands || defaultCandidates('full')).map((c) => ({ name: c.name, params: { ...c.params }, needs: c.needs, late: c.late })),
		quick: defaultCandidates('quick'),
		budget,
		strict: !!opts.strictBudget && Number.isFinite(budget),
		look: opts.look ?? 3, lookN: opts.lookN ?? 24, lookTop: opts.lookTop ?? 4,
		seed: opts.seed ?? 1,
		runOpts: { ...(opts.runOpts || {}), ...(opts.useItemsForMp != null ? { useItemsForMp: !!opts.useItemsForMp } : {}) },
	};
}

/** N samples with their dungeon-start RNG states, dealt round-robin over W shards */
function dealSamples(N, seed, W) {
	const samples = [];
	for (let i = 0; i < N; i++) samples.push({ id: i, xa: mix32(seed * 1000003 + i), shard: i % W });
	return samples;
}

/**
 * What the scout (fixed-policy play-throughs from the start) says about the encounters: their order on the route, the
 * HP / EP each costs, and where the baseline dies.
 */
class ScoutProfile {
	constructor(rows) {
		this.rows = rows;
		this.order = new Map();     // key -> { s: sum of relative positions, n }
		this.hpLoss = new Map();    // key -> [losses]
		this.epLoss = new Map();
		for (const r of rows) r.encounters.forEach((e, i) => this.add(e, i / Math.max(1, r.encounters.length)));
		this.keysByPos = [...this.order.keys()].sort((a, b) => this.pos(a) - this.pos(b));
		this.globalHp = Math.max(0, ...[...this.hpLoss.values()].map(meanOf));
		this.globalEp = Math.max(0, ...[...this.epLoss.values()].map(meanOf));
	}

	add(e, relPos) {
		const o = this.order.get(e.key) || { s: 0, n: 0 };
		o.s += relPos; o.n++;
		this.order.set(e.key, o);
		(this.hpLoss.get(e.key) || this.hpLoss.set(e.key, []).get(e.key)).push(e.hpNeed);
		(this.epLoss.get(e.key) || this.epLoss.set(e.key, []).get(e.key)).push(e.epNeed);
	}

	/** a key's mean relative position on the route (0.5 for keys the scout never met) */
	pos(k) {
		const o = this.order.get(k);
		return o ? o.s / o.n : 0.5;
	}

	/** the scouted keys after k (all of them for a key the scout never met) */
	keysAfter(k) {
		if (!this.order.has(k)) return this.keysByPos;
		const p = this.pos(k);
		return this.keysByPos.filter((q) => this.pos(q) > p + 1e-9);
	}

	/** need levels after key k: the largest expected HP (EP) loss of a later scouted encounter, x1.25 */
	needAfter(k) {
		const later = this.keysAfter(k);
		if (this.order.has(k) && !later.length) return { hp: 0, ep: 0 };
		const hp = later.length ? Math.max(...later.map((q) => meanOf(this.hpLoss.get(q)))) : this.globalHp;
		const ep = later.length ? Math.max(...later.map((q) => meanOf(this.epLoss.get(q)))) : this.globalEp;
		return { hp: Math.ceil(1.25 * hp), ep: Math.ceil(1.25 * ep) };
	}

	/**
	 * the rest rule's repair level after key k (Doctor / Charge spend MP only where the deficit could cost an item
	 * or a death later): the largest HP (EP) any scout sample needed in a later encounter -- a high quantile, not the
	 * mean, so a repair skipped never turns into a potion in a rough sample
	 */
	restNeedAfter(k) {
		const later = this.keysAfter(k);
		if (this.order.has(k) && !later.length) return { hp: 0, ep: 0 };
		let hp = 0, ep = 0;
		for (const q of later) { hp = Math.max(hp, ...this.hpLoss.get(q)); ep = Math.max(ep, ...this.epLoss.get(q)); }
		return { hp: Math.ceil(hp), ep: Math.ceil(ep) };
	}

	/** P(the baseline dies in a later encounter | it reached key k) */
	riskAfter(k) {
		let reached = 0, died = 0;
		for (const r of this.rows) {
			const i = r.encounters.findIndex((e) => e.key === k);
			if (i < 0) continue;
			reached++;
			if (r.status === 'dead' && i < r.encounters.length - 1) died++;
		}
		return reached ? died / reached : 0;
	}
}

const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** the frontier's samples that wait at an encounter, by encounter key */
function groupByEncounter(front) {
	const at = new Map();
	for (const f of front) if (f.status === 'combat') (at.get(f.key) || at.set(f.key, []).get(f.key)).push(f);
	return at;
}

/** the encounter to settle next: the earliest key on the route (scouted order), then the biggest group */
function nextEncounterKey(waiting, scout) {
	return [...waiting.keys()].sort((a, b) => scout.pos(a) - scout.pos(b) || waiting.get(b).length - waiting.get(a).length)[0];
}

/** choose the tactic for one encounter, check it for survival, commit it on its samples; returns the decision record */
async function settleEncounter(search, key, group, nDecided) {
	const { pool, opts, settings, perf, scout } = search;
	// ids are dealt round-robin to the shards: in id order, consecutive units sit on different workers (the
	// frontier itself comes shard by shard, which would put a whole round on one worker)
	const ids = group.map((f) => f.id).sort((a, b) => a - b);
	const behind = isBehind(search, nDecided);
	const cands = encounterCandidates(settings, group, behind);
	const enc = { key, ids, cands, need: scout.needAfter(key) };
	let tp = now();
	const dec = await decide(search, enc, decideOptions(search, key, behind));
	perf.decideMs += now() - tp;
	perf.evals += dec.evals;
	const checked = behind ? { best: dec.best, info: null } : await survivalLookahead(search, enc, dec);
	const best = cands[checked.best];
	tp = now();
	const committed = (await byShard(search, ids, (w, sub) => pool.call(w, 'commit', sub, best, { maxInputs: opts.maxInputs, need: scout.restNeedAfter(key) }))).flat();
	perf.commitMs += now() - tp;
	perf.commits += committed.length;
	return decisionRecord({ enc, group, dec, best: checked.best, committed, prices: search.prices, quick: behind, lookahead: checked.info });
}

/** with strictBudget: behind the budget's schedule for the decisions so far (then fewer samples, quick candidates) */
function isBehind(search, nDecided) {
	const { settings, t0, scout } = search;
	return settings.strict && now() - t0 > settings.budget * Math.min(0.9, 0.15 + 0.75 * (nDecided + 1) / Math.max(scout.order.size, nDecided + 2));
}

/** the candidates tried at an encounter: skill / item tactics only where the hero has what they need (any sample) */
function encounterCandidates(settings, group, behind) {
	const avails = group.map((f) => f.info.avail);
	const { cands, quick } = settings;
	const offered = behind ? cands.filter((c) => quick.some((q) => q.name === c.name && JSON.stringify(q.params) === JSON.stringify(c.params))) : cands;
	return offered.filter((c) => usable(c, avails));
}

function decideOptions(search, key, behind) {
	const { opts, settings, perf, scout, W } = search;
	const { nMin, n0, N, maxDeath, seed } = settings;
	return {
		restNeed: scout.restNeedAfter(key), nMin: behind ? Math.min(16, nMin) : nMin, n0, N: behind ? Math.min(N, 48) : N, maxDeath,
		ext: opts.ext ?? 1, maxInputs: opts.maxInputs, seed, screen: opts.screen ?? Math.max(W, 4), perf, escalate: opts.escalate ?? false, zone: opts.zone ?? null,
	};
}

/**
 * Survival lookahead: where the baseline dies later in the scout, the top tactics (and plain melee) are re-played on
 * this key's real samples with the next `look` encounters fought by the continuation policy; the winner by that
 * (deaths first) is kept, so an encounter never saves items by leaving the hero too weak for what follows.
 * Returns { best: the candidate index kept, info: what the lookahead saw (null when it did not run) }.
 */
async function survivalLookahead(search, enc, dec) {
	const { opts, settings, perf, scout } = search;
	const { look, lookN, lookTop, maxDeath, seed } = settings;
	const risk = scout.riskAfter(enc.key);
	if (!(look > 0 && risk > 0)) return { best: dec.best, info: null };
	const tp = now();
	const pick = lookaheadCandidates(enc.cands, dec, lookTop, maxDeath);
	const units = lookaheadUnits(enc, lookN, seed);
	const jobs = jobsFor(units, pick, 0);
	const res = await runJobs(search, jobs, { cands: enc.cands, need: enc.need, restNeed: scout.restNeedAfter(enc.key), ext: opts.ext ?? 1, look, maxInputs: opts.maxInputs });
	const ag = aggregateByCandidate(pick, res);
	const leader = bestBy(pick, (c) => ag.get(c), maxDeath);
	// switch only for survival: a lower P(death) beyond noise (one death in the units), else keep the encounter's winner
	const cur = ag.get(dec.best);
	const best = cur && leader !== dec.best && ag.get(leader).dead < cur.dead && (cur.pDeath > maxDeath) ? leader : dec.best;
	const info = { risk, look, n: units.length, switched: best !== dec.best, candidates: pick.map((c) => ({ label: labelOf(enc.cands[c].name, enc.cands[c].params), n: ag.get(c).n, pDeath: ag.get(c).pDeath, items: ag.get(c).items, mp: ag.get(c).mp })) };
	perf.lookMs += now() - tp;
	perf.lookEvals += jobs.length;
	return { best, info };
}

/** the lookahead's candidates: the top ones on the encounter itself (feasible ones if any), and plain melee */
function lookaheadCandidates(cands, dec, lookTop, maxDeath) {
	const ranked = cands.map((_, i) => i).filter((i) => dec.stats[i] && !dec.pruned.includes(i)).sort((a, b) => compareAgg(dec.stats[a], dec.stats[b], maxDeath));
	const feasible = ranked.filter((i) => dec.stats[i].pDeath <= maxDeath);
	const plainMelee = cands.findIndex((c) => c.name === 'melee' && !Object.keys(c.params).length);
	return [...new Set([...(feasible.length ? feasible : ranked).slice(0, lookTop), plainMelee].filter((i) => i >= 0))];
}

/** the lookahead's units: up to lookN real samples, topped up to 16 with RNG variants of them */
function lookaheadUnits(enc, lookN, seed) {
	const { ids, key } = enc;
	const units = ids.slice(0, Math.min(ids.length, lookN)).map((id) => ({ id }));
	for (let v = 0; units.length < Math.min(lookN, 16) && v < 8; v++) {
		for (const id of ids) if (units.length < 16) units.push({ id, xa: mix32(seed * 31337 + id * 97 + v * 7919 + hashKey(key)) });
	}
	return units;
}

/** per candidate, the aggregate of its scored results */
function aggregateByCandidate(cands, res) {
	const scores = new Map(cands.map((c) => [c, []]));
	for (const r of res) if (r.o) scores.get(r.c).push(r.sc);
	return new Map([...scores].map(([c, v]) => [c, aggregate(v)]));
}

/** the decision record of a committed encounter (plain data; plan.js reads it) */
function decisionRecord({ enc, group, dec, best, committed, prices, quick, lookahead }) {
	const { key, ids, cands, need } = enc;
	const tactic = cands[best];
	const needOf = new Map(group.map((f) => [f.id, f.info.needs]));
	const chosen = aggregate(committed.map((c) => scoreOutcome(c.o, { hp: need.hp, ep: need.ep + (needOf.get(c.id)?.ep ?? 0), mp: needOf.get(c.id)?.mp ?? 0 }, prices)));
	const realDist = { items: dist(committed.map((c) => c.o.items)), mp: dist(committed.map((c) => c.o.mpSpent)), hpLost: dist(committed.map((c) => c.o.hpLost)) };
	const info = group[0].info;
	return {
		key, samples: ids.length, evals: dec.n, stop: info.stop, need,
		enemies: info.enemies, enemySets: enemySetsOf(group),
		hero: info.hero, mpBefore: dist(group.map((f) => f.info.hero.mp)),
		tactic: { name: tactic.name, params: tactic.params, label: labelOf(tactic.name, tactic.params) },
		stats: { ...chosen, dist: realDist, search: dec.stats[best] },
		candidates: cands.map((c, i) => ({ label: labelOf(c.name, c.params), ...(dec.stats[i] || {}), pruned: dec.pruned.includes(i), same: dec.same[i] != null ? labelOf(cands[dec.same[i]].name, cands[dec.same[i]].params) : undefined })),
		quick, escalated: !!dec.escalated, lookahead,
	};
}

/** the distinct enemy sets the samples met at an encounter, most common first */
function enemySetsOf(group) {
	const counts = new Map();
	for (const f of group) { const sig = f.info.enemies.map((e) => e.id).sort((a, b) => a - b).join(','); counts.set(sig, (counts.get(sig) || 0) + 1); }
	return [...counts].map(([s, n]) => ({ ids: s ? s.split(',').map(Number) : [], n })).sort((a, b) => b.n - a.n);
}

/** the stock model only: price more MP where MP, items or objectives still bind (and, with strictBudget, time is left) */
function shouldPriceMp(search, totals, needs, hero0) {
	const { opts, settings, t0 } = search;
	const room = hero0.mpM - hero0.mp;
	const binding = totals.mpItems > 0 || totals.items.mean > 0 || totals.objectivesLeft.mean > 0 || (needs && needs.mp > hero0.mp) || totals.mpPeak.p95 > hero0.mp;
	return !!(settings.runOpts.useItemsForMp && (opts.marginal ?? [20, 50]).length && room > 0 && binding && (!settings.strict || now() - t0 < settings.budget * 1.1));
}

/** the marginal value of MP: the decided plan re-played on the scout samples with more MP at the start */
async function marginalMpValue(search, decisions, hero0, scoutIds) {
	const { pool, opts, settings } = search;
	const room = hero0.mpM - hero0.mp;
	const plan = {};
	for (const d of decisions) plan[d.key] = { name: d.tactic.name, params: d.tactic.params };
	const adds = [0, ...new Set((opts.marginal ?? [20, 50]).map((a) => Math.min(a, room)))];
	const rows = await Promise.all(adds.map((add) => byShard(search, scoutIds, (w, ids) => pool.call(w, 'playthrough', ids, DEFAULT_DEFAULT, { plan, mpAdd: add, maxInputs: opts.maxInputs })).then((x) => summarizeTotals(x.flat(), settings.maxDeath))));
	const ref = rows[0];
	const more = adds.slice(1).map((add, k) => {
		const row = rows[k + 1];
		return { add, mp: hero0.mp + add, n: row.n, items: row.items.mean, saved: ref.items.mean - row.items.mean, pDeath: row.pDeath, dDeath: ref.pDeath - row.pDeath, objectivesLeft: row.objectivesLeft.mean, mpItems: row.mpItems };
	});
	return [{ add: 0, mp: hero0.mp, n: ref.n, items: ref.items.mean, saved: 0, pDeath: ref.pDeath, dDeath: 0, objectivesLeft: ref.objectivesLeft.mean, mpItems: ref.mpItems, replay: true }, ...more];
}

const SKILL_WORDS = { 20004: 'demoralize', 20005: 'charge', 20006: 'doctor', 20007: 'divine', 20002: 'smash', 20003: 'kick' };

/**
 * The MP the plan needs (plan.mp in the UI plan): entry pool, the route's own costs, what the plan spends, the
 * largest drawdown below the entry pool (MP that must be on hand to never run dry, no MP items), the shortfall, MP
 * spent by cause, MP items, per-encounter pools, and the marginal value of more MP (re-plays of the plan).
 */
export function mpPlanOf(hero, needs, totals, encs, marginal, ctx = {}) {
	const need = Math.ceil(totals.mpPeak ? totals.mpPeak.p95 : 0);
	const topUps = topUpsByStop(ctx.route || [], ctx.tot || []);
	const spentBy = {};
	for (const [k, v] of Object.entries(totals.mpBy || {})) spentBy[SKILL_WORDS[k] || k] = Math.round(v * 10) / 10;
	return {
		start: hero.mp, max: hero.mpM, route: needs ? needs.mp : null,
		spent: totals.mp, peak: totals.mpPeak, need, short: Math.max(0, need - hero.mp), spentBy, mpItems: totals.mpItems,
		// top-ups: encounters where the pool at the start is low (p05 of the samples) against what is still ahead
		encounters: encs.map((d, i) => ({ i, mean: d.mpBefore ? d.mpBefore.mean : (d.hero ? d.hero.mp : null), low: d.mpBefore ? lowQ(d.mpBefore) : null })),
		marginal, useItemsForMp: !!ctx.useItemsForMp, topUps, toSolve: totals.toSolve || dist([0]),
	};
}

/** top-ups (MP is replenishable): per route stop, how often and how much the player solves for before walking to it */
function topUpsByStop(route, rows) {
	const byStop = new Map();
	for (const r of rows) {
		for (const t of r.topUps || []) {
			const si = stopIndexOf(route, t.stop);
			const k = si == null ? -1 : si;
			const g = byStop.get(k) || byStop.set(k, { stopIndex: si, amounts: [], enc: [] }).get(k);
			g.amounts.push(t.amount);
			g.enc.push(t.enc);
		}
	}
	const n = Math.max(1, rows.length);
	return [...byStop.values()].sort((a, b) => (a.stopIndex ?? 1e9) - (b.stopIndex ?? 1e9)).map((g) => {
		const d = dist(g.amounts);
		const encs = g.enc.slice().sort((a, b) => a - b);
		return { stopIndex: g.stopIndex, beforeEncounter: encs[(encs.length - 1) >> 1], p: g.amounts.length / n, amount: Math.ceil(d.p95), mean: d.mean, max: d.max };
	});
}

/** index of the route stop a { kind, rec, at } record walks to (the first plan; null when re-plans moved it) */
export function stopIndexOf(route, stop) {
	if (!stop || !route) return null;
	const i = route.findIndex((L) => legMatches(L, stop));
	return i >= 0 ? i : null;
}

/** a route leg is the stop: same kind, and the same target, or (no target) the same place when both have one */
function legMatches(leg, stop) {
	if (leg.kind !== stop.kind) return false;
	if (leg.rec && stop.rec) return leg.rec.id === stop.rec.id && leg.rec.x === stop.rec.x && leg.rec.y === stop.rec.y;
	if (leg.rec || stop.rec) return false;
	return !stop.at || !leg.at || (leg.at.x === stop.at.x && leg.at.y === stop.at.y);
}
const lowQ = (d) => (d.p05 != null ? d.p05 : d.min ?? d.p50);

/** run per-shard batches of sample ids through fn(w, ids) in parallel (shards: { owner: id -> shard }) */
async function byShard(shards, ids, fn) {
	const per = new Map();
	for (const id of ids) { const w = shards.owner.get(id); (per.get(w) || per.set(w, []).get(w)).push(id); }
	return Promise.all([...per].map(([w, sub]) => fn(w, sub)));
}

/**
 * Adaptive choice at one encounter enc { key, ids, cands, need }: rounds of evaluations (n0, doubling to N) over the
 * samples there (topped up with RNG variants of them to nMin), pruning dominated candidates between rounds.
 * Returns { best, stats, pruned, same, n, evals }.
 */
async function decide(shards, enc, o) {
	const { cands, need } = enc;
	const units = evaluationUnits(enc, o);
	const cap = Math.min(units.length, Math.max(o.N, o.nMin));
	const scores = cands.map(() => []);
	const sig = cands.map(() => []);    // per unit outcome fingerprints (first round), for duplicate tactics
	// escalation: the `late` candidates (rarer variants, skill / item tactics) join only where the core ones leave
	// something to save -- a death, an item, or items in the shadow price -- after the screening round
	const late = cands.map((c, i) => (c.late && o.escalate ? i : -1)).filter((i) => i >= 0);
	let alive = cands.map((_, i) => i).filter((i) => !late.includes(i));
	let escalated = false;
	const pruned = [];
	const same = {};                    // candidate -> the identical one kept
	let done = 0, n = Math.min(o.screen || o.n0, cap);
	let evals = 0;
	const ctx = { cands, need, ext: o.ext, maxInputs: o.maxInputs, restNeed: o.restNeed || need };
	for (let round = 0; ; round++) {
		const jobs = jobsFor(units.slice(done, n), alive, done);
		const res = await runJobs(shards, jobs, ctx);
		evals += jobs.length;
		recordScores(res, scores, o.perf);
		if (round === 0) recordSignatures(res, sig);
		done = n;
		if (round === 0 && late.length && leavesSomethingToSave(alive, scores, o.maxDeath)) {
			escalated = true;
			const lateJobs = jobsFor(units.slice(0, done), late, 0);
			const lateRes = await runJobs(shards, lateJobs, ctx);
			recordScores(lateRes, scores, o.perf);
			recordSignatures(lateRes, sig);
			evals += lateJobs.length;
			alive = alive.concat(late);
		}
		if (round === 0) {
			const dupes = duplicateTactics(alive, sig);
			for (const [i, kept] of dupes) { same[i] = kept; pruned.push(i); }
			alive = alive.filter((i) => !dupes.has(i));
		}
		const stats = cands.map((_, i) => (scores[i].length ? aggregate(scores[i]) : null));
		const statOf = (i) => stats[i];
		const best = bestBy(alive, statOf, o.maxDeath);
		const beaten = alive.filter((i) => i !== best && dominated(stats[i], stats[best], o.maxDeath));
		pruned.push(...beaten);
		alive = alive.filter((i) => !beaten.includes(i));
		if (round >= 1 && allTied(alive, best, stats, tieZone(round, o.zone))) alive = [best];
		if (done >= cap || alive.length <= 1) {
			// (the winner's reported numbers come from the commit, which plays it on every sample anyway)
			return { best: bestBy(alive, statOf, o.maxDeath), stats, pruned, same, n: done, evals, escalated };
		}
		n = round === 0 && o.screen ? Math.min(cap, Math.max(o.n0, n * 2)) : Math.min(cap, n * 2);
	}
}

/** evaluation units: the encounter's real samples, then variants (same state, other RNG) up to nMin */
function evaluationUnits(enc, o) {
	const { ids, key } = enc;
	const units = ids.map((id) => ({ id }));
	for (let v = 0; units.length < Math.max(o.nMin, 0) && v < 64; v++) {
		for (const id of ids) {
			if (units.length >= o.nMin) break;
			units.push({ id, xa: mix32(o.seed * 7919 + id * 131 + v * 1000003 + hashKey(key)) });
		}
	}
	return units;
}

/** one job per (unit, candidate); u numbers the units from `first` */
function jobsFor(units, cands, first) {
	const jobs = [];
	units.forEach((u, k) => { for (const c of cands) jobs.push({ id: u.id, xa: u.xa, c, u: first + k }); });
	return jobs;
}

function recordScores(res, scores, perf) {
	for (const r of res) if (r.ms) perf.evalCpuMs += r.ms;
	for (const r of res) if (r.o) scores[r.c].push(r.sc);
}

function recordSignatures(res, sig) {
	for (const r of res) if (r.o) sig[r.c][r.u] = `${r.o.dead ? 1 : 0}:${r.o.end}:${r.o.items}:${r.o.mpSpent}:${r.o.hp}:${r.o.ep}:${r.o.inputs}`;
}

/** the best of the core candidates leaves a death or an item to save: worth trying the late ones */
function leavesSomethingToSave(alive, scores, maxDeath) {
	const st = alive.map((i) => aggregate(scores[i]));
	const b = bestBy(st.map((_, q) => q), (q) => st[q], maxDeath);
	return st[b].pDeath > 0 || st[b].score[0] > TOL.items || st.some((a) => a.dead > 0);
}

/** tactics that played out identically on every first-round sample are the same tactic here: dupe -> the first one */
function duplicateTactics(alive, sig) {
	const seen = new Map();
	const dupes = new Map();
	for (const i of alive) {
		const k = sig[i].join('|');
		if (seen.has(k)) dupes.set(i, seen.get(k)); else seen.set(k, i);
	}
	return dupes;
}

/** the best candidate index by compareAgg (the first one on ties) */
function bestBy(indices, statOf, maxDeath) {
	let best = indices[0];
	for (const i of indices) if (compareAgg(statOf(i), statOf(best), maxDeath) < 0) best = i;
	return best;
}

/**
 * The tolerance within which candidates tie: TOL, and from the third round on the indifference zone (zone: 0.06 items,
 * 0.5 MP per encounter) -- more samples would cost more than such a difference.
 */
function tieZone(round, zone) {
	if (round >= 2 && zone) return { items: zone.items ?? 0.06, mp: zone.mp ?? 0.5 };
	return { items: TOL.items, mp: TOL.mp };
}

/** everyone left plays as well as the best within the zone (and as safely): more samples would not separate them */
function allTied(alive, best, stats, zone) {
	const b = stats[best];
	return alive.every((i) => i === best || (stats[i].pDeath === b.pDeath && Math.abs(stats[i].score[0] - b.score[0]) <= zone.items && Math.abs(stats[i].score[1] - b.score[1]) <= zone.mp));
}

/** evaluate jobs on the shards that own their samples (shards: { pool, owner }) */
async function runJobs(shards, jobs, ctx) {
	const per = new Map();
	for (const j of jobs) { const w = shards.owner.get(j.id); (per.get(w) || per.set(w, []).get(w)).push(j); }
	const parts = await Promise.all([...per].map(([w, js]) => shards.pool.call(w, 'evaluate', js, ctx)));
	return parts.flat();
}

function hashKey(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }

/** whole-dungeon distributions over samples: items, MP, deaths, per-item usage (mean, p95) */
export function summarizeTotals(rows, maxDeath = 0.01) {
	const ok = rows.filter((r) => r.status !== 'dead' && r.status !== 'stuck');
	// over every sample (a death's items count up to the death); `alive` the same over the survivors only
	const items = dist(rows.map((r) => r.items));
	const mp = dist(rows.map((r) => r.mp));
	const alive = { items: dist(ok.map((r) => r.items)), mp: dist(ok.map((r) => r.mp)) };
	const statuses = {};
	for (const r of rows) statuses[r.status] = (statuses[r.status] || 0) + 1;
	return {
		n: rows.length, dead: rows.filter((r) => r.status === 'dead').length, stuck: rows.filter((r) => r.status === 'stuck').length,
		pDeath: rows.length ? rows.filter((r) => r.status === 'dead').length / rows.length : 0,
		items, mp, alive, pack: itemUsage(rows), statuses, objectivesLeft: dist(rows.map((r) => r.objectivesLeft ?? 0)), maxDeath,
		// MP: the drawdown below the entry pool (MP that must be on hand), gross spending by cause, MP items
		mpPeak: dist(rows.map((r) => r.mpPeak ?? Math.max(0, r.mp))), mpBy: meanMpByCause(rows), mpItems: rows.reduce((a, r) => a + mpItemsOf(r.byId), 0) / Math.max(1, rows.length),
		toSolve: dist(rows.map((r) => r.toSolve || 0)),
	};
}

/** per item used in any sample: its use per sample (mean, p95, max), by item id */
function itemUsage(rows) {
	const ids = new Set();
	for (const r of rows) for (const id of Object.keys(r.byId || {})) ids.add(+id);
	return [...ids].sort((a, b) => a - b).map((id) => {
		const d = dist(rows.map((r) => (r.byId && r.byId[id]) || 0));
		return { id, mean: d.mean, p95: d.p95, max: d.max };
	});
}

/** gross MP spent per sample, by cause */
function meanMpByCause(rows) {
	const mpBy = {};
	for (const r of rows) for (const [k, v] of Object.entries(r.mpBy || {})) mpBy[k] = (mpBy[k] || 0) + v / Math.max(1, rows.length);
	return mpBy;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
