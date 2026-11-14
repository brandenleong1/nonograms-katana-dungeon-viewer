// Exact mode: the combat RNG state is known (a seeded fightgen, or an in-dungeon save, which stores hw.x.a), so every
// play-out is deterministic. One trajectory through the dungeon; at each encounter:
//   1. every candidate tactic (policies.js) is played out from the encounter start; the best (cost.js, exact compare)
//      is the incumbent, the next best few are the rollout policies;
//   2. receding-horizon search (rollout algorithm): at each hero input of the encounter, the candidate inputs (what
//      each rollout policy would do, plus primitives: wait, steps, hit / smash / kick / unseal adjacent foes, potion,
//      Charge, spider placements, approach) are each applied and played out to the end of the encounter by every
//      rollout policy; the input whose best play-out is best is committed. The incumbent's own next input is always a
//      candidate with its own play-out, so the result is never worse than the best tactic alone.
//   3. the committed inputs are the script; the walker's route inputs between encounters are recorded too.
// Output: a replayable input script from the setup (driver.js newFight + fight.step), checked by replaying it in the
// JS engine (and, by tools/solve.mjs --oracle, in the JVM oracle: run.sh fightgen ... inputs.json + test/combat.mjs).
//
//   const res = await solveExact({ hero, type, seed, xseed }, { pool, budgetMs });
//   res.inputs (script), res.encounters[k] = { key, stop, enemies, tactic, searched, decisions, cost }, res.totals
//
// Workers (pool.js) each hold the same trajectory (re-setup from the problem + the committed inputs, synced) and play
// out (input, policy) jobs from it.
import { Run, Walker, trimTopUps, mpOk, heroSpecOut, heroOf, isFoe, critterInfo, foesOf, packHas, canSkill, free, SKILL, SPIDER, DIR4, bestItem, makeFight, structuredCloneLite, manh, cheb, encounterKey } from './sim.js';
import { makePolicy, labelOf, candidates as defaultCandidates, availOf, usable, BASELINE } from './policies.js';
import { pricesFor, scoreOutcome, compareExact, dist } from './cost.js';
import { outcomeOf, entryOut, mpPlanOf, runOptsFor, stopIndexOf, routeLegs, stopOut, countVisit, realNeedOf, mpItemsOf, setRestNeed } from './robust.js';
import { LookCache } from './lookcache.js';
import { newFight } from '../combat/driver.js';

/**
 * problem.saveBytes (the raw guild.dat / export zip bytes) -> problem.save (js/save importSave result). An imported
 * save is an object graph that does not survive postMessage, so workers get the bytes and import them themselves
 * (after resetStatics). Returns the problem (unchanged without saveBytes).
 */
export async function resolveSave(problem, fresh = false) {
	if (!problem || !problem.saveBytes || (problem.save && !fresh)) return problem;
	const { importSave } = await import('../save/index.js');
	return { ...problem, save: await importSave(problem.saveBytes) };
}

/** problem without the imported save when its bytes are there (safe to post to a worker) */
export function portableProblem(problem) {
	if (!problem || !problem.saveBytes || !problem.save) return problem;
	const { save, ...rest } = problem;
	void save;
	return rest;
}

/** a fight for an exact problem: { hero, type, seed, xseed, at } (fightgen) or { save: importSave result, hero } */
export function exactFight(problem) {
	if (problem.save) {
		const spec = { mode: 'fight', imported: problem.save, save: problem.saveName || 'guild.dat' };
		for (const k of ['level', 'gear', 'kit', 'kit2', 'skills', 'pets']) if (problem.hero && problem.hero[k] != null) spec[k] = problem.hero[k];
		return newFight(spec, { lean: true });
	}
	return makeFight(problem.hero, { type: problem.type, seed: problem.seed, xseed: problem.xseed, at: problem.at || 'start' });
}

function runOptsOf(o = {}) { return runOptsFor(o, { log: true }); }

// ---------------------------------------------------------------------------------------------------------------
// Worker side: the trajectory copy and play-outs

export class ExactWorker {
	/** cfg: { problem, runOpts, lookCache: false turns the look-ahead cache off, verifyLookCache: check every hit } */
	constructor(cfg) {
		this.cfg = cfg;
		this.dead = null;
		this.look = { walks: 0, hits: 0, mismatches: 0 };   // look-ahead walks made / reused (lookcache.js), over all batches
	}

	init() {
		const f = exactFight(this.cfg.problem);
		if (!f || f.error) return { error: f ? f.error : 'no fight' };
		const run = new Run(f, runOptsOf(this.cfg.runOpts));
		void run.walker;
		this.prices = pricesFor(f.h, { useItemsForMp: !!(this.cfg.runOpts || {}).useItemsForMp });
		this.ck = run.checkpoint();
		this.n = 0;
		return { ok: true, prices: this.prices, hero: heroOf(f.h) };
	}

	resume() { const r = Run.resume(this.ck, this.dead); this.dead = null; return r; }

	/** apply the committed inputs [from, ...] (same order as the main trajectory); walker: the main's frozen walker */
	sync(inputs, walker = null, tops = []) {
		const run = this.resume();
		// the main trajectory's MP top-ups, at the same input positions (they are no engine input)
		const topAt = (i) => { for (const t of tops) if (t.at === i) run.fight.h.f.G_(t.mp); };
		for (let k = 0; k < inputs.length; k++) { topAt(this.n + k); run.apply(inputs[k]); }
		topAt(this.n + inputs.length);
		this.n += inputs.length;
		if (walker) run._walker = Walker.thaw(walker, run.fight, run.opts.walker || {});
		this.ck = run.checkpoint();
		this.dead = run.fight;
		return { n: this.n, x: run.fight.h.x.a };
	}

	/**
	 * jobs: [{ inp (null: none), c (policy index) }]; ctx: { cands, need, ext }. Plays inp then policy c to the end of the
	 * encounter (+ extension) from the synced state; the outcome counts from before inp.
	 */
	evaluate(jobs, ctx) {
		const out = [];
		const lookCache = this.cfg.lookCache === false ? null : new LookCache({ from: this.ck.log.length, verify: !!this.cfg.verifyLookCache, stats: this.look });
		const options = { ext: ctx.ext ?? 1, look: ctx.look ?? 0, maxInputs: ctx.maxInputs, lookCache };
		for (const j of jobs) {
			const run = this.resume();
			setRestNeed(run, ctx.restNeed);
			const led0 = run.led.clone();
			const bad = j.inp ? !tryInput(run, j.inp) : false;
			let o = null;
			if (!bad) {
				o = outcomeOf(run, ctx.cands[j.c], options);
				countFromBefore(o, run.led.since(led0));
			}
			out.push({ j, bad, o, sc: o ? scoreOutcome(o, ctx.need, this.prices) : null });
			this.dead = run.fight;
		}
		return out;
	}

	/** the look-ahead walks this worker made and reused so far: { walks, hits, mismatches } */
	lookStats() { return { ...this.look }; }
}

/** apply a searched input; false when the engine rejects it or it changes nothing */
function tryInput(run, inp) {
	const { r, changed } = run.apply(inp);
	if (r.rej || !changed) return false;
	clearStraySelection(run, inp);
	return true;
}

/** an input that leaves something selected (other than an item or skill waiting for its target) is cancelled */
function clearStraySelection(run, inp) {
	if (run.fight.selId() !== 0 && !(inp.t === 'item' || inp.t === 'skill')) run.apply({ t: 'cancel' });
}

/** a play-out's costs counted from before the candidate input (led: the ledger since then) */
function countFromBefore(o, led) {
	o.items = led.items(); o.byId = led.itemsById(); o.mpSpent = led.mp; o.hpLost = led.hp; o.epLost = led.ep; o.inputs = led.inputs;
	o.dead = o.dead || led.dead;
}

// ---------------------------------------------------------------------------------------------------------------
// Candidate inputs at a hero turn

/** primitive candidates + what the rollout policies would do now (deduplicated, legal-looking) */
export function candidateInputs(fight, pols) {
	const h = fight.h, me = h.f;
	const found = new InputSet();
	for (const p of pols) {
		const pol = makePolicy(p.name, p.params);
		pol.begin(fight);
		found.add(pol.next(fight));
	}
	if (!h.C) return found.list();
	found.add({ t: 'wait' });
	const foes = foesOf(h).filter((m) => manh(m.b, me.b) <= 12);
	for (const [dx, dy] of DIR4) if (free(h, me.b.a + dx, me.b.b + dy)) found.add({ t: 'step', dx, dy });
	for (const m of foes) addFoeInputs(found, h, m);
	addSkillAndPotionInputs(found, h, foes);
	// items: the policies' own picks (area items at the best cluster, net, hook)
	if (foes.length >= 2 || foes.some((m) => m.w > 0)) addThrowInputs(found, fight);
	if (h.q == null && packHas(h, SPIDER)) addSpiderInputs(found, fight, foes);
	return found.list();
}

/** inputs in the order found, without duplicates (the first of equal inputs is kept) */
class InputSet {
	constructor() { this.byKey = new Map(); }
	add(inp) {
		if (!inp) return;
		const k = JSON.stringify(inp);
		if (!this.byKey.has(k)) this.byKey.set(k, inp);
	}
	list() { return [...this.byKey.values()]; }
}

/** a foe next to the hero: unseal it, or hit / smash it; one up to 8 away: walk at it (tap) */
function addFoeInputs(found, h, m) {
	const d = manh(m.b, h.f.b);
	const seal = m.i_(h.e);
	if (d === 1 && seal > 0) {
		if (m.d && mpOk(h, seal)) found.add({ t: 'unseal', x: m.b.a, y: m.b.b });
		return;
	}
	if (d === 1) {
		found.add({ t: 'tap', x: m.b.a, y: m.b.b });
		if (canSkill(h, SKILL.SMASH)) found.add({ t: 'skill', id: SKILL.SMASH, x: m.b.a, y: m.b.b });
		return;
	}
	if (d <= 8 && seal <= 0) found.add({ t: 'tap', x: m.b.a, y: m.b.b });
}

/** Round kick, a healing item, Charge, Demoralize and Divine protection, where they can help now */
function addSkillAndPotionInputs(found, h, foes) {
	const me = h.f;
	if (foes.some((m) => manh(m.b, me.b) === 1) && canSkill(h, SKILL.KICK)) found.add({ t: 'skill', id: SKILL.KICK });
	const hp = me.j.v_(), hpM = me.q_();
	if (hp < hpM) { const id = bestItem(h, 'hp', hpM - hp, true); if (id) found.add({ t: 'potion', id }); }
	if (me.z.v_() < me.D_() - 9 && canSkill(h, SKILL.CHARGE)) found.add({ t: 'skill', id: SKILL.CHARGE });
	// Demoralize with foes in its 4-box, Divine protection while the once-per-level flag is free
	if (canSkill(h, SKILL.DEMORALIZE) && foes.some((m) => cheb(m.b, me.b) <= 4 && m.r <= 0)) found.add({ t: 'skill', id: SKILL.DEMORALIZE });
	if (canSkill(h, SKILL.DIVINE) && !me.s_(32768) && !me.s_(8)) found.add({ t: 'skill', id: SKILL.DIVINE });
}

/** the throws a melee policy would pick: area items, the net, the hooks */
function addThrowInputs(found, fight) {
	const h = fight.h;
	const probe = makePolicy('melee', {});
	probe.begin(fight);
	const ctx = probe.context(fight);
	for (const id of [144, 206, 118, 294]) if (packHas(h, id)) found.add(probe.areaThrow(fight, ctx, id));
	if (packHas(h, 174)) found.add(probe.netThrow(fight, ctx));
	for (const id of [209, 303]) if (packHas(h, id)) found.add(probe.hookThrow(fight, ctx, id));
}

/** the Mechanical spider next to up to 3 unsealed foes: the first free, visible cell in throwing range beside each */
function addSpiderInputs(found, fight, foes) {
	const h = fight.h;
	let n = 0;
	for (const m of foes) {
		if (n >= 3 || m.i_(h.e) > 0) continue;
		const cell = spiderCellBeside(fight, m);
		if (!cell) continue;
		found.add({ t: 'item', id: SPIDER, x: cell.x, y: cell.y });
		n++;
	}
}

function spiderCellBeside(fight, m) {
	const h = fight.h, me = h.f;
	for (const [dx, dy] of DIR4) {
		const x = m.b.a + dx, y = m.b.b + dy;
		if (free(h, x, y) && Math.max(Math.abs(x - me.b.a), Math.abs(y - me.b.b)) <= h.e.h[3] + 3 && fight.c.j[y * h.g + x] > 0) return { x, y };
	}
	return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Inline pool for exact mode

export class InlineExactPool {
	constructor(n = 1) { this.n = n; this.w = []; }
	get size() { return this.n; }
	async setupExact(cfg) {
		this.w = [];
		for (let i = 0; i < this.n; i++) this.w.push(new ExactWorker({ ...cfg, problem: await resolveSave(portableProblem(cfg.problem), true) }));
		return Promise.all(this.w.map((w) => w.init()));
	}
	async call(i, method, ...args) { return this.w[i][method](...args); }
	async close() {}
}

// ---------------------------------------------------------------------------------------------------------------
// Coordinator

/**
 * solveExact(problem, opts) -> result (plain data).
 * problem: { hero, type, seed, xseed, at? } or { save, hero? }
 * opts: { pool (InlineExactPool / WorkerPool), cands, rollouts: rollout policies per decision (5), maxDecisions per
 *         encounter (100), budgetMs: expected wall time (progress only, unless strictBudget: then the search stops when
 *         behind), look: encounters played after each play-out by the continuation policy (1: survival), ext,
 *         useItemsForMp, runOpts, onProgress }
 */
export async function solveExact(problem, opts = {}) {
	const t0 = now();
	// a fight from a save consumes its import (setup.js setupSave installs it and clears K0): the main trajectory and
	// every worker need their own, so a save comes as bytes
	if (problem.save && !problem.saveBytes) return { error: 'exact mode from a save needs problem.saveBytes (the guild.dat / export zip bytes): every fight imports its own copy' };
	problem = await resolveSave(problem, true);
	const pool = opts.pool || new InlineExactPool(1);
	const budget = opts.budgetMs ?? Infinity;
	const search = {
		opts, t0, budget,
		cands: (opts.cands || defaultCandidates('full')).map((c) => ({ name: c.name, params: { ...c.params }, needs: c.needs })),
		K: opts.rollouts ?? 5,
		strict: !!opts.strictBudget && Number.isFinite(budget),
		runOpts: { ...(opts.runOpts || {}), ...(opts.useItemsForMp != null ? { useItemsForMp: !!opts.useItemsForMp } : {}) },
		run: null, workers: new TrajectoryWorkers(pool), scoutNeeds: null, decisions: 0, jobs: 0,
	};
	const { runOpts } = search;
	const inits = await pool.setupExact({ problem: portableProblem(problem), runOpts, lookCache: opts.lookCache, verifyLookCache: opts.verifyLookCache });
	const bad = inits.find((r) => r && r.error);
	if (bad) return { error: bad.error };
	// the main trajectory (inline)
	const f = exactFight(problem);
	if (!f || f.error) return { error: f ? f.error : 'no fight' };
	const start = new Run(f, runOptsOf(runOpts));
	const prices = pricesFor(f.h, { useItemsForMp: !!runOpts.useItemsForMp });
	const hero0 = heroOf(f.h);
	const needs0 = start.walker.routeNeeds();
	// scout: the baseline from the start, for the need levels -- what the later fights cost in HP / EP (the shadow
	// prices' need, and how far the rest rule's Doctor / Charge repair: MP only where it buys something)
	const ck0 = start.checkpoint();
	search.scoutNeeds = scoutNeedsOf(Run.resume(ck0), opts.maxInputs);
	const run = search.run = Run.resume(ck0);
	const route = routeLegs(run.walker);
	const encounters = [];
	const stopCount = {};
	for (let e = 0; e < 300; e++) {
		setRestNeed(run, needFrom(search.scoutNeeds, e));
		const ev = run.toEncounter();
		if (ev.ev !== 'combat') break;
		await search.workers.sync(run, { walker: true });
		const key = encounterKey(ev.stop, countVisit(stopCount, ev.stop));
		const enc = await solveEncounter(search, { e, key, stop: ev.stop });
		encounters.push(enc);
		if (opts.onProgress) opts.onProgress({ phase: 'encounter', k: encounters.length, key: enc.key, tactic: enc.tactic.label, searched: enc.searched, ms: now() - t0 });
		if (run.fight.h.f.u_() || run.fight.c.w) break;
		run.walker.afterEncounter();
	}
	// finish the walk (the exit; no fight ahead: no Doctor / Charge)
	setRestNeed(run, needFrom(search.scoutNeeds, encounters.length));
	if (!run.fight.h.f.u_() && !run.fight.c.w) run.toEncounter();
	const h = run.fight.h;
	const led = run.led;
	const tops = topUpsOf(led, route, encounters);
	return {
		mode: 'exact', problem: { type: problem.type, seed: problem.seed, xseed: problem.xseed, at: problem.at || 'start', hero: heroSpecOut(problem.hero) }, hero: hero0, prices, route, needs: needs0, entry: entryOut(f),
		inputs: run.log.slice(), encounters,
		// MP top-ups (no engine input: the player solves puzzles; at = the script position before which to have it)
		topUps: tops,
		totals: { items: led.items(), byId: led.itemsById(), mp: led.mp, hpLost: led.hp, dead: h.f.u_(), end: run.fight.c.w, objectivesLeft: h.i_(), inputs: run.log.length, final: heroOf(h) },
		search: { decisions: search.decisions, jobs: search.jobs, rollouts: search.K },
		mpPlan: exactMpPlan({ hero: hero0, needs: needs0, led, encounters, topUps: tops, route, useItemsForMp: !!runOpts.useItemsForMp }),
		ms: now() - t0, workers: pool.size,
	};
}

/** the baseline played from the start, encounter by encounter: the HP / EP each fight really needs */
function scoutNeedsOf(run, maxInputs) {
	const needs = [];
	for (let k = 0; k < 300; k++) {
		const ev = run.toEncounter();
		if (ev.ev !== 'combat') break;
		const o = outcomeOf(run, BASELINE, { ext: 0, maxInputs });
		needs.push(realNeedOf(o));
		if (o.dead || o.end === 'stuck' || o.end === 'error' || run.fight.c.w) break;
		run.walker.afterEncounter();
	}
	return needs;
}

/** need levels for the fights from encounter e on: 1.25 x the largest scouted HP (EP) need among them */
function needFrom(scoutNeeds, e) {
	let hp = 0, ep = 0;
	for (let k = e; k < scoutNeeds.length; k++) { hp = Math.max(hp, scoutNeeds[k].hp); ep = Math.max(ep, scoutNeeds[k].ep); }
	return { hp: Math.ceil(1.25 * hp), ep: Math.ceil(1.25 * ep) };
}

/**
 * The workers' copies of the trajectory: sync them to the main one (inputs, MP top-ups and, at an encounter, the
 * walker), and play out jobs from them.
 */
class TrajectoryWorkers {
	constructor(pool) {
		this.pool = pool;
		this.synced = 0;   // inputs of the main trajectory the workers have
	}

	/** walker: also send the main's frozen walker (and a top-up just after the last input) */
	async sync(run, { walker = false } = {}) {
		const inputs = run.log.slice(this.synced);
		const tops = run.led.topUps.filter((t) => t.at >= this.synced && t.at < this.synced + inputs.length + (walker ? 1 : 0)).map((t) => ({ at: t.at, mp: t.pool + t.amount }));
		this.synced = run.log.length;
		const wk = walker ? run.walker.freeze() : null;
		await Promise.all([...Array(this.pool.size).keys()].map((w) => this.pool.call(w, 'sync', inputs, wk, tops)));
	}

	/**
	 * Jobs dealt to the workers, results back in job order, each with its index (`i`), whichever worker played it: the
	 * choice between equal play-outs must not depend on how many workers there are.
	 */
	async play(jobs, ctx) {
		const dealt = dealJobs(jobs, this.pool.size);
		const parts = await Promise.all(dealt.map((ids, w) => (ids.length ? this.pool.call(w, 'evaluate', ids.map((i) => jobs[i]), ctx) : [])));
		const results = new Array(jobs.length);
		parts.forEach((part, w) => part.forEach((r, k) => { r.i = dealt[w][k]; results[r.i] = r; }));
		return results;
	}
}

/**
 * Which jobs each of `size` workers plays (job indexes). All the jobs of one input go to the same worker: they apply
 * it and then play on with different policies, so most of them end in the same state and one worker's look-ahead
 * cache (lookcache.js) serves them all. Inputs go to the least loaded worker in turn; jobs without an input (the
 * tactics from the encounter start) are dealt one by one.
 */
function dealJobs(jobs, size) {
	const dealt = [...Array(size)].map(() => []);
	const home = new Map();   // input -> worker
	for (let i = 0; i < jobs.length; i++) {
		const input = jobs[i].inp;
		let w = input ? home.get(input) : undefined;
		if (w === undefined) {
			w = leastLoaded(dealt);
			if (input) home.set(input, w);
		}
		dealt[w].push(i);
	}
	return dealt;
}

/** the first worker with the fewest jobs */
function leastLoaded(dealt) {
	let best = 0;
	for (let w = 1; w < dealt.length; w++) if (dealt[w].length < dealt[best].length) best = w;
	return best;
}

/**
 * One encounter on the main trajectory, which stands at its start: rank every tactic, search the inputs, finish with
 * the policy that won last, and commit all of it. Returns the encounter record.
 */
async function solveEncounter(search, { e, key, stop }) {
	const { run, opts, workers } = search;
	const h = run.fight.h;
	const needs = run.walker.routeNeeds();
	const later = needFrom(search.scoutNeeds, e + 1);
	const need = { hp: opts.hpNeed ?? Math.min(heroOf(h).hpM, later.hp), ep: needs.ep + later.ep, mp: needs.mp };
	const enc = { key, stop: stopOut(stop), enemies: h.D.filter((m) => isFoe(h, m)).map((m) => critterInfo(h, m)), hero: heroOf(h), from: run.log.length };
	// skill / item tactics only where the hero has what they need
	const av = availOf(h);
	const ec = search.cands.filter((c) => usable(c, av));
	const ctx = { cands: ec, need, restNeed: later, ext: opts.ext ?? 1, look: opts.look ?? 1, maxInputs: opts.maxInputs };
	const led0 = run.led.clone();
	// 1. every tactic from the encounter start
	const base = await workers.play(ec.map((_, c) => ({ inp: null, c })), ctx);
	search.jobs += base.length;
	base.sort(compareJobs);
	const ranked = base.filter((r) => r.o).map((r) => r.j.c);
	enc.tactics = base.map((r) => ({ label: labelOf(ec[r.j.c].name, ec[r.j.c].params), dead: r.o ? r.o.dead : true, end: r.o?.end, items: r.o?.items, mp: r.o?.mpSpent, hp: r.o?.hp, score: r.sc?.s }));
	const incumbent = ec[ranked[0]];
	enc.tactic = { name: incumbent.name, params: incumbent.params, label: labelOf(incumbent.name, incumbent.params) };
	const behind = search.strict && now() - search.t0 > search.budget * 0.8;
	const maxDecisions = behind || allAlike(base) ? 0 : (opts.maxDecisions ?? 100);
	// 2. receding-horizon search over the encounter's inputs
	const found = await searchInputs(search, { ctx, base, ranked, maxDecisions });
	// the rest of the encounter: the policy whose play-out won last
	if (fightGoesOn(run)) {
		const finish = ec[found.finish];
		enc.finish = labelOf(finish.name, finish.params);
		run.fightWith(makePolicy(finish.name, finish.params), opts.maxInputs);
	}
	search.decisions += found.decisions;
	await workers.sync(run);
	recordEncounterEnd(enc, run, led0, found);
	return enc;
}

/** every tactic played out the same (items, MP, HP left, death): nothing to search */
function allAlike(base) {
	const first = base[0].o;
	return base.filter((r) => r.o).every((r) => r.o.items === first.items && r.o.mpSpent === first.mpSpent && r.o.hp === first.hp && r.o.dead === first.dead);
}

/**
 * The rollout search: at each hero input of the encounter, the candidate inputs are each applied and played out to
 * the end of the encounter by every rollout policy (the best few tactics); the input whose best play-out is best is
 * committed. The play-outs and the trajectory use the same encounter loop (Run.fightWith), so a policy finishing the
 * encounter does exactly what its play-out predicted. Returns { decisions, improved, best: the winning play-out,
 * finish: the index of the policy whose play-out won last }.
 */
async function searchInputs(search, { ctx, base, ranked, maxDecisions }) {
	const { run, workers } = search;
	const rollIdx = ranked.slice(0, search.K);
	const roll = rollIdx.map((c) => ctx.cands[c]);
	let decisions = 0, improved = 0;
	let best = base[0], finish = ranked[0];
	while (decisions < maxDecisions && (!search.strict || now() - search.t0 < search.budget)) {
		if (!fightGoesOn(run)) break;
		const cs = candidateInputs(run.fight, roll);
		if (cs.length <= 1) break;
		const jobs = [];
		for (const ci of cs) for (const c of rollIdx) jobs.push({ inp: ci, c });
		const res = await workers.play(jobs, ctx);
		search.jobs += res.length;
		decisions++;
		const good = res.filter((r) => !r.bad && r.o).sort(compareJobs);
		if (!good.length) break;
		if (comparePlayouts(good[0], best) < 0) improved++;
		best = good[0];
		finish = best.j.c;
		run.apply(best.j.inp);
		clearStraySelection(run, best.j.inp);
		await workers.sync(run);
	}
	return { decisions, improved, best, finish };
}

/** the hero is in a fight that is not over, and the engine takes input */
function fightGoesOn(run) {
	const h = run.fight.h;
	return h.C && !h.f.u_() && !run.fight.c.w && run.ready();
}

/** the encounter's script slice, what the search predicted, and what it cost on the trajectory */
function recordEncounterEnd(enc, run, led0, found) {
	const { best } = found;
	enc.to = run.log.length;
	enc.inputs = run.log.slice(enc.from, enc.to);
	enc.searched = found.decisions;
	enc.improved = found.improved;
	enc.predicted = best.o ? { items: best.o.items, mp: best.o.mpSpent, hp: best.o.hp, dead: best.o.dead } : null;
	enc.after = heroOf(run.fight.h);
	const lc = run.led.since(led0);
	enc.cost = { items: lc.items(), byId: lc.itemsById(), mp: lc.mp, hpLost: lc.hp, epLost: lc.ep, dead: run.fight.h.f.u_() };
}

/** play-outs by the exact objective (no outcome last), then fewer inputs; 0: equal */
function comparePlayouts(a, b) {
	if (!a.o !== !b.o) return a.o ? -1 : 1;
	if (!a.o) return 0;
	return compareExact(a.sc, b.sc) || (a.o.inputs - b.o.inputs);
}

/** comparePlayouts, equal ones by job index: a total order within a batch, the same whichever worker played what */
function compareJobs(a, b) {
	return comparePlayouts(a, b) || (a.i - b.i);
}

/** the trajectory's MP top-ups, trimmed to what the player has to solve for, each with its stop and encounter */
function topUpsOf(led, route, encounters) {
	const tr = trimTopUps(led.topUps);
	// the encounter a top-up comes before: the first one whose inputs start at or after it (a top-up at a fight's
	// first hero input belongs to that fight); a mid-fight top-up belongs to the encounter it happens in
	const encAt = (at) => { const k = encounters.findIndex((e) => e.from >= at || (e.to != null && at < e.to)); return k >= 0 ? k : null; };
	return led.topUps.map((t, i) => ({ at: t.at, stop: t.stop, stopIndex: stopIndexOf(route, t.stop), beforeEncounter: encAt(t.at), fight: !!t.fight, amount: tr[i], filled: t.amount, pool: t.pool })).filter((t) => t.amount > 0);
}

/** mpPlanOf for the one trajectory: its spending, peak and top-ups as one-sample distributions */
function exactMpPlan({ hero, needs, led, encounters, topUps, route, useItemsForMp }) {
	const totals = { mp: dist([led.mp]), mpPeak: dist([led.mpPeak]), mpBy: led.mpBy, toSolve: dist([topUps.reduce((a, t) => a + t.amount, 0)]), mpItems: mpItemsOf(led.itemsById()) };
	return mpPlanOf(hero, needs, totals, encounters.map((e) => ({ mpBefore: dist([e.hero.mp]) })), [], { route, tot: [{ topUps }], useItemsForMp });
}

/**
 * Replay a script from the setup in the JS engine: { items, byId, mp, hpLost, dead, end, objectivesLeft, final, rej }
 * (rej: inputs the engine rejected -- an exact script has none it did not have while searching).
 */
export function replayScript(problem, inputs, topUps = []) {
	const f = exactFight(problem);
	if (!f || f.error) return { error: f ? f.error : 'no fight' };
	const run = new Run(f, { walker: {} });
	let rej = 0;
	// MP top-ups: the player adds `amount` MP before input `at` (capped at max MP, as in the game)
	const top = (i) => { for (const t of topUps) if (t.at === i) { const me = run.fight.h.f; me.G_(Math.min(me.E_() + t.amount, run.fight.h.e.n_())); } };
	for (let i = 0; i < inputs.length; i++) {
		if (!run.ready()) break;
		top(i);
		const { r } = run.apply(inputs[i]);
		if (r.rej) rej++;
	}
	const h = run.fight.h, led = run.led;
	return { items: led.items(), byId: led.itemsById(), mp: led.mp, hpLost: led.hp, dead: h.f.u_(), end: run.fight.c.w, objectivesLeft: h.i_(), final: heroOf(h), rej, x: h.x.a, st: run.fight.st };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export { structuredCloneLite };
