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
	const pol = makePolicy(cand.name, cand.params);
	const r = run.fightWith(pol, ctx.maxInputs);
	let end = r.end, turns = r.turns, ext = 0;
	// extension: foes engaged at the start still alive (broken away, sealed, out of reach) -> walk on and fight them with
	// the continuation policy, so a tactic is charged for what it leaves behind
	const maxExt = ctx.ext ?? 1;
	while (ext < maxExt && end === 'won' && engaged.some((m) => !m.u_() && run.fight.h.o.includes(m) && isFoe(run.fight.h, m))) {
		const ev = run.toEncounter(ctx.extWalk ?? 80);
		if (ev.ev !== 'combat') break;
		const c2 = ctx.cont || DEFAULT_DEFAULT;
		const r2 = run.fightWith(makePolicy(c2.name, c2.params), ctx.maxInputs);
		end = r2.end; turns += r2.turns; ext++;
	}
	// lookahead: the next `look` encounters with the continuation policy, so a tactic that wins cheaply now and leaves
	// the hero too weak for what follows is charged with that death (survival is never traded for items)
	let looked = 0;
	for (; looked < (ctx.look ?? 0) && end === 'won' && !run.fight.h.f.u_() && !run.fight.c.w; looked++) {
		if (run.status === 'walk') run.walker.afterEncounter();
		const ev = run.toEncounter(ctx.lookWalk ?? 1500);
		if (ev.ev !== 'combat') break;
		const c2 = ctx.cont || DEFAULT_DEFAULT;
		const r2 = run.fightWith(makePolicy(c2.name, c2.params), ctx.maxInputs);
		if (r2.end === 'dead' || r2.end === 'stuck' || r2.end === 'error') end = r2.end;
		turns += r2.turns;
	}
	const led = run.led.since(led0);
	const h = run.fight.h, P = heroOf(h);
	return {
		dead: led.dead || h.f.u_(), end, items: led.items(), byId: led.itemsById(), mpSpent: led.mp, hpLost: led.hp, epLost: led.ep,
		hp: P.hp, hpM: P.hpM, ep: P.ep, epM: P.epM, mpLeft: P.mp, inputs: led.inputs, turns, ext, looked,
	};
}

/** MP-restoring items used (bj0 Z > 0) in a byId record */
function mpItemsOf(byId) {
	let n = 0;
	for (const [id, k] of Object.entries(byId || {})) { const it = itemDef(+id); if (it && it.Z > 0) n += k; }
	return n;
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
			const run = this.resume(this.baseCk);
			run.fight.h.x.a = s.xa | 0;
			this.samples.set(s.id, { id: s.id, xa: s.xa, ck: run.checkpoint(), status: 'walk', key: null, info: null, events: [], stopCount: {} });
			this.park(run);
		}
		return { ok: samples.length, prices: this.prices, hero: this.hero0, route: this.routeInfo(base), needs: base.walker.routeNeeds(), entry: entryOut(base.fight) };
	}

	runOpts() { return runOptsFor(this.cfg.runOpts); }

	resume(ck) {
		const run = Run.resume(ck, this.dead);
		this.dead = null;
		return run;
	}

	park(run) { this.dead = run.fight; }

	routeInfo(run) {
		const w = run.walker;
		return w.legs.map((L) => ({ kind: L.kind, label: L.label, rec: L.rec ? { id: L.rec.id, x: L.rec.x, y: L.rec.y, critter: L.rec.k !== undefined } : null, at: L.at, steps: L.steps, doing: L.doing }));
	}

	/** what the coming fights need, for the rest rule's Doctor / Charge (robust: the coordinator's need levels) */
	setRestNeed(run, need) { const r = run.walker.opts.rest; if (r) r.need = need || null; }

	/** walk every sample that is not at an encounter to its next one; returns their frontier (need0: the rest rule's need before a sample's first decision) */
	advance(need0 = null) {
		const out = [];
		for (const s of this.samples.values()) {
			if (s.status === 'walk') {
				const run = this.resume(s.ck);
				this.setRestNeed(run, s.need || need0);
				const ev = run.toEncounter(this.cfg.maxWalk ?? 3000);
				if (ev.ev === 'combat') {
					const stop = ev.stop;
					const sk = stop ? `${stop.kind}:${stop.rec ? stop.rec.id + '@' + stop.rec.x + ',' + stop.rec.y : ''}` : 'start';
					const ord = s.stopCount[sk] || 0;
					s.stopCount[sk] = ord + 1;
					s.key = encounterKey(stop, ord, null);
					const h = run.fight.h;
					const needs = run.walker.routeNeeds();
					s.info = {
						stop: stop ? { kind: stop.kind, label: stop.label, rec: stop.rec ? { id: stop.rec.id, x: stop.rec.x, y: stop.rec.y } : null, at: stop.at } : null,
						enemies: h.D.filter((m) => isFoe(h, m)).map((m) => critterInfo(h, m)),
						hero: heroOf(h), needs,
					};
					s.status = 'combat';
				} else s.status = ev.ev;
				s.ck = run.checkpoint();
				s.led = run.led.clone();
				s.objLeft = run.fight.h.i_();
				this.park(run);
			}
			out.push({ id: s.id, status: s.status, key: s.key, info: s.status === 'combat' ? s.info : null });
		}
		return out;
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
			this.setRestNeed(run, ctx.restNeed);
			const o = outcomeOf(run, ctx.cands[j.c], ctx);
			const need = { hp: ctx.need?.hp ?? 0, ep: (ctx.need?.ep ?? 0) + (s.info?.needs?.ep ?? 0), mp: s.info?.needs?.mp ?? 0 };
			out.push({ id: j.id, c: j.c, u: j.u, xa: j.xa, o, sc: scoreOutcome(o, need, this.prices) });
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
			const run = this.resume(s.ck);
			if (meta.need) s.need = meta.need;
			this.setRestNeed(run, s.need);
			const o = outcomeOf(run, cand, { ext: 0, maxInputs: meta.maxInputs });
			s.events.push({ key: s.key, tactic: labelOf(cand.name, cand.params), o });
			s.status = o.dead ? 'dead' : o.end === 'stuck' || o.end === 'error' ? 'stuck' : run.fight.c.w ? 'done' : run.fight.h.C ? 'combat-again' : 'walk';
			if (s.status === 'combat-again') s.status = 'walk';   // still in combat (rare): the next advance re-keys it
			if (s.status === 'walk') run.walker.afterEncounter();
			s.ck = run.checkpoint();
			s.led = run.led.clone();
			s.objLeft = run.fight.h.i_();
			this.park(run);
			out.push({ id, o, status: s.status });
		}
		return out;
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
			// opts.mpAdd: more MP at the start (the marginal value of MP; capped at the pool's max)
			if (opts.mpAdd) { const me = run.fight.h.f; me.G_(Math.max(0, Math.min(me.E_() + opts.mpAdd, run.fight.h.e.n_()))); }
			const encs = [];
			const stopCount = {};
			let status = 'walk';
			for (let k = 0; k < (opts.maxEnc ?? 200); k++) {
				const ev = run.toEncounter(this.cfg.maxWalk ?? 3000);
				if (ev.ev !== 'combat') { status = ev.ev; break; }
				const stop = ev.stop;
				const sk = stop ? `${stop.kind}:${stop.rec ? stop.rec.id + '@' + stop.rec.x + ',' + stop.rec.y : ''}` : 'start';
				const ord = stopCount[sk] || 0;
				stopCount[sk] = ord + 1;
				const key = encounterKey(stop, ord, null);
				const h = run.fight.h;
				const enemies = h.D.filter((m) => isFoe(h, m)).map((m) => m.a.a);
				// opts.plan: the decided tactic per encounter key (the replay of a solved plan); cand for unknown keys
				const o = outcomeOf(run, (opts.plan && opts.plan[key]) || cand, { ext: 0, maxInputs: opts.maxInputs });
				// HP the fight really took: lost + what items healed (the need for item-free play)
				let healed = 0, fed = 0;
				for (const [id, n] of Object.entries(o.byId)) { const it = itemDef(+id); if (it) { healed += (it.X > 0 ? it.X : 0) * n; fed += (it.Y > 0 ? it.Y : 0) * n; } }
				encs.push({ key, hpLost: o.hpLost, hpNeed: Math.min(o.hpM, Math.max(0, o.hpLost + healed)), epLost: o.epLost, epNeed: Math.max(0, o.epLost + fed), items: o.items, mp: o.mpSpent, end: o.end, enemies });
				if (o.dead) { status = 'dead'; break; }
				if (o.end === 'stuck' || o.end === 'error') { status = 'stuck'; break; }
				if (run.fight.c.w) { status = 'done'; break; }
				run.walker.afterEncounter();
			}
			const led = run.led;
			const trim = trimTopUps(led.topUps);
			const topUps = led.topUps.map((t, i) => ({ stop: t.stop, enc: t.enc, amount: trim[i] })).filter((t) => t.amount > 0);
			out.push({ id, status, items: led.items(), byId: led.itemsById(), mp: led.mp, mpPeak: led.mpPeak, mpBy: led.mpBy, topUps, toSolve: topUps.reduce((a, t) => a + t.amount, 0), hpLost: led.hp, inputs: led.inputs, objectivesLeft: run.fight.h.i_(), encounters: encs });
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
			const trim = trimTopUps(led.topUps);
			const topUps = led.topUps.map((t, i) => ({ stop: t.stop, enc: t.enc, amount: trim[i] })).filter((t) => t.amount > 0);
			out.push({ id: s.id, status: s.status, items: led.items(), byId: led.itemsById(), mp: led.mp, mpPeak: led.mpPeak, mpBy: led.mpBy, topUps, toSolve: topUps.reduce((a, t) => a + t.amount, 0), hpLost: led.hp, inputs: led.inputs, objectivesLeft: s.objLeft ?? null, events: s.events.map((e) => ({ key: e.key, tactic: e.tactic, items: e.o.items, mp: e.o.mpSpent, hpLost: e.o.hpLost, end: e.o.end })) });
		}
		return out;
	}
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
	const N = opts.N ?? 128;
	const nMin = opts.nMin ?? 32;
	const n0 = opts.n0 ?? 16;   // (rounds also never go below 2 units per worker, so every worker has work)
	const maxDeath = opts.maxDeath ?? 0.01;
	let cands = (opts.cands || defaultCandidates('full')).map((c) => ({ name: c.name, params: { ...c.params }, needs: c.needs, late: c.late }));
	const quick = defaultCandidates('quick');
	// quality first: the budget only cuts the search with strictBudget
	const budget = opts.budgetMs ?? Infinity;
	const strict = !!opts.strictBudget && Number.isFinite(budget);
	const look = opts.look ?? 3, lookN = opts.lookN ?? 24, lookTop = opts.lookTop ?? 4;
	const runOpts = { ...(opts.runOpts || {}), ...(opts.useItemsForMp != null ? { useItemsForMp: !!opts.useItemsForMp } : {}) };
	const cfg = { hero: problem.hero, type: problem.type, seed: problem.seed, runOpts, maxWalk: opts.maxWalk, maxInputs: opts.maxInputs };
	await pool.setup(cfg);
	const W = pool.size;
	// samples, round-robin over shards
	const sid = opts.seed ?? 1;
	const samples = [];
	for (let i = 0; i < N; i++) samples.push({ id: i, xa: mix32(sid * 1000003 + i), shard: i % W });
	const owner = new Map(samples.map((s) => [s.id, s.shard]));
	const inits = await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'init', samples.filter((s) => s.shard === w).map(({ id, xa }) => ({ id, xa })))));
	const err = inits.find((r) => r && r.error);
	if (err) return { error: err.error };
	const prices = inits[0].prices, hero0 = inits[0].hero, route = inits[0].route, needs = inits[0].needs, entry = inits[0].entry;
	const progress = (p) => { if (opts.onProgress) opts.onProgress({ ms: now() - t0, ...p }); };

	const perf = { setupMs: now() - t0, scoutMs: 0, advanceMs: 0, decideMs: 0, commitMs: 0, evals: 0, commits: 0, evalCpuMs: 0 };
	// ---- scout / baseline: fixed-policy play-throughs (encounter order, HP each costs) ----
	let tp = now();
	const nScout = Math.min(opts.scout ?? 16, N);
	const scoutIds = samples.slice(0, nScout).map((s) => s.id);
	const baseCand = opts.baseline || BASELINE;
	const scout = (await byShard(pool, owner, scoutIds, (w, ids) => pool.call(w, 'playthrough', ids, baseCand, { maxInputs: opts.maxInputs }))).flat();
	const order = new Map();     // key -> mean position
	const hpLoss = new Map();    // key -> [losses]
	const epLoss = new Map();
	for (const r of scout) r.encounters.forEach((e, i) => {
		const o = order.get(e.key) || { s: 0, n: 0 };
		o.s += i / Math.max(1, r.encounters.length); o.n++;
		order.set(e.key, o);
		(hpLoss.get(e.key) || hpLoss.set(e.key, []).get(e.key)).push(e.hpNeed);
		(epLoss.get(e.key) || epLoss.set(e.key, []).get(e.key)).push(e.epNeed);
	});
	const pos = (k) => { const o = order.get(k); return o ? o.s / o.n : 0.5; };
	const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
	const keysByPos = [...order.keys()].sort((a, b) => pos(a) - pos(b));
	const globalHp = Math.max(0, ...[...hpLoss.values()].map(meanOf));
	const globalEp = Math.max(0, ...[...epLoss.values()].map(meanOf));
	/** need levels after key k: the largest expected HP (EP) loss of a later scouted encounter, x1.25 */
	const needAfter = (k) => {
		const p = order.has(k) ? pos(k) : null;
		const later = p == null ? keysByPos : keysByPos.filter((q) => pos(q) > p + 1e-9);
		if (p != null && !later.length) return { hp: 0, ep: 0 };
		const hp = later.length ? Math.max(...later.map((q) => meanOf(hpLoss.get(q)))) : globalHp;
		const ep = later.length ? Math.max(...later.map((q) => meanOf(epLoss.get(q)))) : globalEp;
		return { hp: Math.ceil(1.25 * hp), ep: Math.ceil(1.25 * ep) };
	};
	/** P(the baseline dies in a later encounter | it reached key k) over the scout */
	const riskAfter = (k) => {
		let reached = 0, died = 0;
		for (const r of scout) {
			const i = r.encounters.findIndex((e) => e.key === k);
			if (i < 0) continue;
			reached++;
			if (r.status === 'dead' && i < r.encounters.length - 1) died++;
		}
		return reached ? died / reached : 0;
	};
	/**
	 * the rest rule's repair level after key k (Doctor / Charge spend MP only where the deficit could cost an item
	 * or a death later): the largest HP (EP) any scout sample needed in a later encounter -- a high quantile, not the
	 * mean, so a repair skipped never turns into a potion in a rough sample
	 */
	const restNeedAfter = (k) => {
		const p = order.has(k) ? pos(k) : null;
		const later = p == null ? keysByPos : keysByPos.filter((q) => pos(q) > p + 1e-9);
		if (p != null && !later.length) return { hp: 0, ep: 0 };
		let hp = 0, ep = 0;
		for (const q of later) { hp = Math.max(hp, ...hpLoss.get(q)); ep = Math.max(ep, ...epLoss.get(q)); }
		return { hp: Math.ceil(hp), ep: Math.ceil(ep) };
	};
	perf.scoutMs = now() - tp;
	perf.lookMs = 0; perf.lookEvals = 0; perf.marginalMs = 0;
	progress({ phase: 'scout', scout: nScout, keys: order.size });

	// ---- the encounter loop ----
	const decisions = [];
	const decided = new Map();   // key -> decision index
	let rounds = 0;
	for (;;) {
		tp = now();
		const front = (await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'advance', restNeedAfter(null))))).flat();
		perf.advanceMs += now() - tp;
		const at = new Map();
		for (const f of front) if (f.status === 'combat') (at.get(f.key) || at.set(f.key, []).get(f.key)).push(f);
		if (!at.size) break;
		if (++rounds > 400) break;
		// the earliest key on the route (scouted order), then the biggest group
		const keys = [...at.keys()].sort((a, b) => pos(a) - pos(b) || at.get(b).length - at.get(a).length);
		const key = keys[0];
		const group = at.get(key);
		// ids are dealt round-robin to the shards: in id order, consecutive units sit on different workers (the
		// frontier itself comes shard by shard, which would put a whole round on one worker)
		const ids = group.map((f) => f.id).sort((a, b) => a - b);
		const behind = strict && now() - t0 > budget * Math.min(0.9, 0.15 + 0.75 * (decisions.length + 1) / Math.max(order.size, decisions.length + 2));
		// skill / item tactics only where the hero has what they need (any sample at this key)
		const avails = group.map((f) => f.info.avail);
		const useCands = (behind ? cands.filter((c) => quick.some((q) => q.name === c.name && JSON.stringify(q.params) === JSON.stringify(c.params))) : cands).filter((c) => usable(c, avails));
		const need = needAfter(key);
		tp = now();
		const dec = await decide(pool, owner, key, ids, useCands, need, { restNeed: restNeedAfter(key), nMin: behind ? Math.min(16, nMin) : nMin, n0, N: behind ? Math.min(N, 48) : N, maxDeath, ext: opts.ext ?? 1, maxInputs: opts.maxInputs, seed: sid, screen: opts.screen ?? Math.max(W, 4), perf, escalate: opts.escalate ?? false, zone: opts.zone ?? null });
		perf.decideMs += now() - tp;
		perf.evals += dec.evals;
		let bestIdx = dec.best;
		// survival lookahead: where the baseline dies later in the scout, the top tactics (and plain melee) are re-played on
		// this key's real samples with the next `look` encounters fought by the continuation policy; the winner by that
		// (deaths first) is kept, so an encounter never saves items by leaving the hero too weak for what follows
		const risk = riskAfter(key);
		let lookInfo = null;
		if (look > 0 && risk > 0 && !behind) {
			tp = now();
			const ranked = useCands.map((_, i) => i).filter((i) => dec.stats[i] && !dec.pruned.includes(i)).sort((a, b) => compareAgg(dec.stats[a], dec.stats[b], maxDeath));
			// (only tactics feasible on the encounter itself)
			const feas = ranked.filter((i) => dec.stats[i].pDeath <= maxDeath);
			const pick = [...new Set([...(feas.length ? feas : ranked).slice(0, lookTop), useCands.findIndex((c) => c.name === 'melee' && !Object.keys(c.params).length)].filter((i) => i >= 0))];
			const units = ids.slice(0, Math.min(ids.length, lookN)).map((id) => ({ id }));
			for (let v = 0; units.length < Math.min(lookN, 16) && v < 8; v++) for (const id of ids) if (units.length < 16) units.push({ id, xa: mix32(sid * 31337 + id * 97 + v * 7919 + hashKey(key)) });
			const jobs = [];
			units.forEach((u, k) => { for (const c of pick) jobs.push({ id: u.id, xa: u.xa, c, u: k }); });
			const res = await runJobs(pool, owner, jobs, { cands: useCands, need, restNeed: restNeedAfter(key), ext: opts.ext ?? 1, look, maxInputs: opts.maxInputs });
			const sc = new Map(pick.map((c) => [c, []]));
			for (const r of res) if (r.o) sc.get(r.c).push(r.sc);
			const ag = new Map([...sc].map(([c, v]) => [c, aggregate(v)]));
			let lb = pick[0];
			for (const c of pick) if (compareAgg(ag.get(c), ag.get(lb), maxDeath) < 0) lb = c;
			// switch only for survival: a lower P(death) beyond noise (one death in the units), else keep the encounter's winner
			const cur = ag.get(bestIdx);
			if (cur && lb !== bestIdx && ag.get(lb).dead < cur.dead && (cur.pDeath > maxDeath)) bestIdx = lb;
			lookInfo = { risk, look, n: units.length, switched: bestIdx !== dec.best, candidates: pick.map((c) => ({ label: labelOf(useCands[c].name, useCands[c].params), n: ag.get(c).n, pDeath: ag.get(c).pDeath, items: ag.get(c).items, mp: ag.get(c).mp })) };
			perf.lookMs += now() - tp;
			perf.lookEvals += jobs.length;
		}
		const best = useCands[bestIdx];
		tp = now();
		const committed = (await byShard(pool, owner, ids, (w, sub) => pool.call(w, 'commit', sub, best, { maxInputs: opts.maxInputs, need: restNeedAfter(key) }))).flat();
		perf.commitMs += now() - tp;
		perf.commits += committed.length;
		const needOf = new Map(group.map((f) => [f.id, f.info.needs]));
		const chosen = aggregate(committed.map((c) => scoreOutcome(c.o, { hp: need.hp, ep: need.ep + (needOf.get(c.id)?.ep ?? 0), mp: needOf.get(c.id)?.mp ?? 0 }, prices)));
		const realDist = { items: dist(committed.map((c) => c.o.items)), mp: dist(committed.map((c) => c.o.mpSpent)), hpLost: dist(committed.map((c) => c.o.hpLost)) };
		const info = group[0].info;
		const enemyCounts = new Map();
		for (const f of group) { const sig = f.info.enemies.map((e) => e.id).sort((a, b) => a - b).join(','); enemyCounts.set(sig, (enemyCounts.get(sig) || 0) + 1); }
		const d = {
			key, samples: ids.length, evals: dec.n, stop: info.stop, need,
			enemies: info.enemies, enemySets: [...enemyCounts].map(([s, n]) => ({ ids: s ? s.split(',').map(Number) : [], n })).sort((a, b) => b.n - a.n),
			hero: info.hero, mpBefore: dist(group.map((f) => f.info.hero.mp)),
			tactic: { name: best.name, params: best.params, label: labelOf(best.name, best.params) },
			stats: { ...chosen, dist: realDist, search: dec.stats[bestIdx] },
			candidates: useCands.map((c, i) => ({ label: labelOf(c.name, c.params), ...(dec.stats[i] || {}), pruned: dec.pruned.includes(i), same: dec.same[i] != null ? labelOf(useCands[dec.same[i]].name, useCands[dec.same[i]].params) : undefined })),
			quick: behind, escalated: !!dec.escalated, lookahead: lookInfo,
		};
		decided.set(key, decisions.length);
		decisions.push(d);
		progress({ phase: 'encounter', k: decisions.length, key, tactic: d.tactic.label, samples: ids.length });
	}

	// ---- totals ----
	const tot = (await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'totals')))).flat();
	const base = scout;
	const totals = summarizeTotals(tot, maxDeath);
	// ---- the marginal value of MP: the decided plan re-played on the scout samples with more MP at the start ----
	const marginal = [];
	const room = hero0.mpM - hero0.mp;
	const binding = totals.mpItems > 0 || totals.items.mean > 0 || totals.objectivesLeft.mean > 0 || (needs && needs.mp > hero0.mp) || totals.mpPeak.p95 > hero0.mp;
	if (runOpts.useItemsForMp && (opts.marginal ?? [20, 50]).length && room > 0 && binding && (!strict || now() - t0 < budget * 1.1)) {
		tp = now();
		const plan = {};
		for (const d of decisions) plan[d.key] = { name: d.tactic.name, params: d.tactic.params };
		const adds = [0, ...new Set((opts.marginal ?? [20, 50]).map((a) => Math.min(a, room)))];
		const rows = await Promise.all(adds.map((add) => byShard(pool, owner, scoutIds, (w, ids) => pool.call(w, 'playthrough', ids, DEFAULT_DEFAULT, { plan, mpAdd: add, maxInputs: opts.maxInputs })).then((x) => summarizeTotals(x.flat(), maxDeath))));
		const ref = rows[0];
		adds.forEach((add, i) => { if (i > 0) marginal.push({ add, mp: hero0.mp + add, n: rows[i].n, items: rows[i].items.mean, saved: ref.items.mean - rows[i].items.mean, pDeath: rows[i].pDeath, dDeath: ref.pDeath - rows[i].pDeath, objectivesLeft: rows[i].objectivesLeft.mean, mpItems: rows[i].mpItems }); });
		marginal.unshift({ add: 0, mp: hero0.mp, n: ref.n, items: ref.items.mean, saved: 0, pDeath: ref.pDeath, dDeath: 0, objectivesLeft: ref.objectivesLeft.mean, mpItems: ref.mpItems, replay: true });
		perf.marginalMs = now() - tp;
	}
	const res = {
		mode: 'robust', problem: { type: problem.type, seed: problem.seed, hero: heroSpecOut(problem.hero) }, hero: hero0, prices, route, needs, entry,
		N, decisions, totals, baseline: summarizeTotals(base, maxDeath),
		mpPlan: mpPlanOf(hero0, needs, totals, decisions, marginal, { route, tot, useItemsForMp: !!runOpts.useItemsForMp }),
		ms: now() - t0, workers: W, perf,
	};
	return res;
}

/**
 * The MP the plan needs (plan.mp in the UI plan): entry pool, the route's own costs, what the plan spends, the
 * largest drawdown below the entry pool (MP that must be on hand to never run dry, no MP items), the shortfall, MP
 * spent by cause, MP items, per-encounter pools, and the marginal value of more MP (re-plays of the plan).
 */
export function mpPlanOf(hero, needs, totals, encs, marginal, ctx = {}) {
	const need = Math.ceil(totals.mpPeak ? totals.mpPeak.p95 : 0);
	// top-ups (MP is replenishable): per route stop, how often and how much the player solves for before walking to it
	const route = ctx.route || [];
	const rows = ctx.tot || [];
	const byStop = new Map();
	for (const r of rows) for (const t of r.topUps || []) {
		const si = stopIndexOf(route, t.stop);
		const k = si == null ? -1 : si;
		const g = byStop.get(k) || byStop.set(k, { stopIndex: si, amounts: [], enc: [] }).get(k);
		g.amounts.push(t.amount);
		g.enc.push(t.enc);
	}
	const n = Math.max(1, rows.length);
	const topUps = [...byStop.values()].sort((a, b) => (a.stopIndex ?? 1e9) - (b.stopIndex ?? 1e9)).map((g) => {
		const d = dist(g.amounts);
		const encs = g.enc.slice().sort((a, b) => a - b);
		return { stopIndex: g.stopIndex, beforeEncounter: encs[(encs.length - 1) >> 1], p: g.amounts.length / n, amount: Math.ceil(d.p95), mean: d.mean, max: d.max };
	});
	const by = totals.mpBy || {};
	const name = { 20004: 'demoralize', 20005: 'charge', 20006: 'doctor', 20007: 'divine', 20002: 'smash', 20003: 'kick' };
	const spentBy = {};
	for (const [k, v] of Object.entries(by)) spentBy[name[k] || k] = Math.round(v * 10) / 10;
	return {
		start: hero.mp, max: hero.mpM, route: needs ? needs.mp : null,
		spent: totals.mp, peak: totals.mpPeak, need, short: Math.max(0, need - hero.mp), spentBy, mpItems: totals.mpItems,
		// top-ups: encounters where the pool at the start is low (p05 of the samples) against what is still ahead
		encounters: encs.map((d, i) => ({ i, mean: d.mpBefore ? d.mpBefore.mean : (d.hero ? d.hero.mp : null), low: d.mpBefore ? lowQ(d.mpBefore) : null })),
		marginal, useItemsForMp: !!ctx.useItemsForMp, topUps, toSolve: totals.toSolve || dist([0]),
	};
}

/** index of the route stop a { kind, rec, at } record walks to (the first plan; null when re-plans moved it) */
export function stopIndexOf(route, stop) {
	if (!stop || !route) return null;
	const i = route.findIndex((L) => L.kind === stop.kind && ((!L.rec && !stop.rec && (!stop.at || !L.at || (L.at.x === stop.at.x && L.at.y === stop.at.y))) || (L.rec && stop.rec && L.rec.id === stop.rec.id && L.rec.x === stop.rec.x && L.rec.y === stop.rec.y)));
	return i >= 0 ? i : null;
}
const lowQ = (d) => (d.p05 != null ? d.p05 : d.min ?? d.p50);

/** run per-shard batches of sample ids through fn(w, ids) in parallel */
async function byShard(pool, owner, ids, fn) {
	const per = new Map();
	for (const id of ids) { const w = owner.get(id); (per.get(w) || per.set(w, []).get(w)).push(id); }
	return Promise.all([...per].map(([w, sub]) => fn(w, sub)));
}

/**
 * Adaptive choice at one encounter: rounds of evaluations (n0, doubling to N) over the samples there (topped up with
 * RNG variants of them to nMin), pruning dominated candidates between rounds. Returns { best, stats, pruned, n }.
 */
async function decide(pool, owner, key, ids, cands, need, o) {
	// evaluation units: the real samples, then variants (same state, other RNG) up to nMin
	const units = ids.map((id) => ({ id }));
	for (let v = 0; units.length < Math.max(o.nMin, 0) && v < 64; v++) for (const id of ids) {
		if (units.length >= o.nMin) break;
		units.push({ id, xa: mix32(o.seed * 7919 + id * 131 + v * 1000003 + hashKey(key)) });
	}
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
	let stats = [];
	for (let round = 0; ; round++) {
		const batch = units.slice(done, n);
		const jobs = [];
		batch.forEach((u, k) => { for (const c of alive) jobs.push({ id: u.id, xa: u.xa, c, u: done + k }); });
		const res = await runJobs(pool, owner, jobs, ctx);
		evals += jobs.length;
		const take = (res) => {
			for (const r of res) if (r.ms) o.perf.evalCpuMs += r.ms;
			for (const r of res) if (r.o) {
				scores[r.c].push(r.sc);
				if (round === 0) sig[r.c][r.u] = `${r.o.dead ? 1 : 0}:${r.o.end}:${r.o.items}:${r.o.mpSpent}:${r.o.hp}:${r.o.ep}:${r.o.inputs}`;
			}
		};
		take(res);
		done = n;
		if (round === 0 && late.length) {
			const st = alive.map((i) => aggregate(scores[i]));
			let b = 0;
			for (let q = 1; q < st.length; q++) if (compareAgg(st[q], st[b], o.maxDeath) < 0) b = q;
			if (st[b].pDeath > 0 || st[b].score[0] > TOL.items || st.some((a) => a.dead > 0)) {
				escalated = true;
				const j2 = [];
				units.slice(0, done).forEach((u, k) => { for (const c of late) j2.push({ id: u.id, xa: u.xa, c, u: k }); });
				take(await runJobs(pool, owner, j2, ctx));
				evals += j2.length;
				alive = alive.concat(late);
			}
		}
		// tactics that played out identically on every first-round sample are the same tactic here: keep the first
		if (round === 0) {
			const seen = new Map();
			const keep = [];
			for (const i of alive) {
				const k = sig[i].join('|');
				if (seen.has(k)) { same[i] = seen.get(k); pruned.push(i); } else { seen.set(k, i); keep.push(i); }
			}
			alive = keep;
		}
		stats = cands.map((_, i) => (scores[i].length ? aggregate(scores[i]) : null));
		let best = alive[0];
		for (const i of alive) if (compareAgg(stats[i], stats[best], o.maxDeath) < 0) best = i;
		const keep = [];
		for (const i of alive) { if (i !== best && dominated(stats[i], stats[best], o.maxDeath)) pruned.push(i); else keep.push(i); }
		alive = keep;
		// everyone left plays as well as the best within tolerance (and as safely): more samples would not separate them
		// tied: everyone left plays as well as the best within tolerance; from the third round on, within an indifference
		// zone (o.zone: 0.06 items, 0.5 MP per encounter) -- more samples would cost more than such a difference
		const zi = round >= 2 && o.zone ? (o.zone.items ?? 0.06) : TOL.items, zm = round >= 2 && o.zone ? (o.zone.mp ?? 0.5) : TOL.mp;
		const tied = round >= 1 && alive.every((i) => i === best || (stats[i].pDeath === stats[best].pDeath && Math.abs(stats[i].score[0] - stats[best].score[0]) <= zi && Math.abs(stats[i].score[1] - stats[best].score[1]) <= zm));
		if (tied) alive = [best];
		if (done >= cap || alive.length <= 1) {
			// (the winner's reported numbers come from the commit, which plays it on every sample anyway)
			let b = alive[0];
			for (const i of alive) if (compareAgg(stats[i], stats[b], o.maxDeath) < 0) b = i;
			return { best: b, stats, pruned, same, n: done, evals };
		}
		n = round === 0 && o.screen ? Math.min(cap, Math.max(o.n0, n * 2)) : Math.min(cap, n * 2);
	}
}

async function runJobs(pool, owner, jobs, ctx) {
	const per = new Map();
	for (const j of jobs) { const w = owner.get(j.id); (per.get(w) || per.set(w, []).get(w)).push(j); }
	const parts = await Promise.all([...per].map(([w, js]) => pool.call(w, 'evaluate', js, ctx)));
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
	const ids = new Set();
	for (const r of rows) for (const id of Object.keys(r.byId || {})) ids.add(+id);
	const pack = [...ids].sort((a, b) => a - b).map((id) => {
		const d = dist(rows.map((r) => (r.byId && r.byId[id]) || 0));
		return { id, mean: d.mean, p95: d.p95, max: d.max };
	});
	const statuses = {};
	for (const r of rows) statuses[r.status] = (statuses[r.status] || 0) + 1;
	// MP: the drawdown below the entry pool (MP that must be on hand), gross spending by cause, MP items
	const mpBy = {};
	for (const r of rows) for (const [k, v] of Object.entries(r.mpBy || {})) mpBy[k] = (mpBy[k] || 0) + v / Math.max(1, rows.length);
	return {
		n: rows.length, dead: rows.filter((r) => r.status === 'dead').length, stuck: rows.filter((r) => r.status === 'stuck').length,
		pDeath: rows.length ? rows.filter((r) => r.status === 'dead').length / rows.length : 0,
		items, mp, alive, pack, statuses, objectivesLeft: dist(rows.map((r) => r.objectivesLeft ?? 0)), maxDeath,
		mpPeak: dist(rows.map((r) => r.mpPeak ?? Math.max(0, r.mp))), mpBy, mpItems: rows.reduce((a, r) => a + mpItemsOf(r.byId), 0) / Math.max(1, rows.length),
		toSolve: dist(rows.map((r) => r.toSolve || 0)),
	};
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
