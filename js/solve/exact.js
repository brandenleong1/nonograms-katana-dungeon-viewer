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
import { Run, Walker, RestRule, trimTopUps, mpOk, heroSpecOut, heroOf, isFoe, critterInfo, foesOf, packHas, canSkill, free, SKILL, SPIDER, DIR4, bestItem, makeFight, structuredCloneLite } from './sim.js';
import { makePolicy, labelOf, candidates as defaultCandidates, availOf, usable, BASELINE } from './policies.js';
import { pricesFor, scoreOutcome, compareExact } from './cost.js';
import { outcomeOf, entryOut, mpPlanOf, runOptsFor, stopIndexOf } from './robust.js';
import { dist } from './cost.js';
import { vj0 } from '../gen/statics.js';
import { newFight } from '../combat/driver.js';

const key = (inp) => JSON.stringify(inp);

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
	constructor(cfg) { this.cfg = cfg; this.dead = null; }

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
		for (const j of jobs) {
			const run = this.resume();
			if (run.walker.opts.rest) run.walker.opts.rest.need = ctx.restNeed || null;
			const led0 = run.led.clone();
			let bad = false;
			if (j.inp) {
				const { r, changed } = run.apply(j.inp);
				if (r.rej || !changed) bad = true;
				if (!bad && run.fight.selId() !== 0 && !(j.inp.t === 'item' || j.inp.t === 'skill')) run.apply({ t: 'cancel' });
			}
			let o = null;
			if (!bad) {
				o = outcomeOf(run, ctx.cands[j.c], { ext: ctx.ext ?? 1, look: ctx.look ?? 0, maxInputs: ctx.maxInputs });
				// count from before the candidate input
				const led = run.led.since(led0);
				o.items = led.items(); o.byId = led.itemsById(); o.mpSpent = led.mp; o.hpLost = led.hp; o.epLost = led.ep; o.inputs = led.inputs;
				o.dead = o.dead || led.dead;
			}
			out.push({ j, bad, o, sc: o ? scoreOutcome(o, ctx.need, this.prices) : null });
			this.dead = run.fight;
		}
		return out;
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Candidate inputs at a hero turn

/** primitive candidates + what the rollout policies would do now (deduplicated, legal-looking) */
export function candidateInputs(fight, pols) {
	const h = fight.h, me = h.f;
	const out = new Map();
	const add = (inp) => { if (inp) { const k = key(inp); if (!out.has(k)) out.set(k, inp); } };
	for (const p of pols) {
		const pol = makePolicy(p.name, p.params);
		pol.begin(fight);
		add(pol.next(fight));
	}
	if (!h.C) return [...out.values()];
	add({ t: 'wait' });
	const foes = foesOf(h).filter((m) => Math.abs(m.b.a - me.b.a) + Math.abs(m.b.b - me.b.b) <= 12);
	for (const [dx, dy] of DIR4) if (free(h, me.b.a + dx, me.b.b + dy)) add({ t: 'step', dx, dy });
	for (const m of foes) {
		const d = Math.abs(m.b.a - me.b.a) + Math.abs(m.b.b - me.b.b);
		const seal = m.i_(h.e);
		if (d === 1) {
			if (seal > 0) { if (m.d && mpOk(h, seal)) add({ t: 'unseal', x: m.b.a, y: m.b.b }); continue; }
			add({ t: 'tap', x: m.b.a, y: m.b.b });
			if (canSkill(h, SKILL.SMASH)) add({ t: 'skill', id: SKILL.SMASH, x: m.b.a, y: m.b.b });
		} else if (d <= 8 && seal <= 0) add({ t: 'tap', x: m.b.a, y: m.b.b });
	}
	if (foes.some((m) => Math.abs(m.b.a - me.b.a) + Math.abs(m.b.b - me.b.b) === 1) && canSkill(h, SKILL.KICK)) add({ t: 'skill', id: SKILL.KICK });
	const hp = me.j.v_(), hpM = me.q_();
	if (hp < hpM) { const id = bestItem(h, 'hp', hpM - hp, true); if (id) add({ t: 'potion', id }); }
	if (me.z.v_() < me.D_() - 9 && canSkill(h, SKILL.CHARGE)) add({ t: 'skill', id: SKILL.CHARGE });
	// skills: Demoralize with foes in its 4-box, Divine protection while the once-per-level flag is free
	if (canSkill(h, SKILL.DEMORALIZE) && foes.some((m) => Math.max(Math.abs(m.b.a - me.b.a), Math.abs(m.b.b - me.b.b)) <= 4 && m.r <= 0)) add({ t: 'skill', id: SKILL.DEMORALIZE });
	if (canSkill(h, SKILL.DIVINE) && !me.s_(32768) && !me.s_(8)) add({ t: 'skill', id: SKILL.DIVINE });
	// items: the policies' own picks (area items at the best cluster, net, hook)
	if (foes.length >= 2 || foes.some((m) => m.w > 0)) {
		const probe = makePolicy('melee', {});
		probe.begin(fight);
		const ctx = probe.context(fight);
		for (const id of [144, 206, 118, 294]) if (packHas(h, id)) add(probe.areaThrow(fight, ctx, id));
		if (packHas(h, 174)) add(probe.netThrow(fight, ctx));
		for (const id of [209, 303]) if (packHas(h, id)) add(probe.hookThrow(fight, ctx, id));
	}
	if (h.q == null && packHas(h, SPIDER)) {
		let n = 0;
		for (const m of foes) {
			if (n >= 3 || m.i_(h.e) > 0) continue;
			for (const [dx, dy] of DIR4) {
				const x = m.b.a + dx, y = m.b.b + dy;
				if (free(h, x, y) && Math.max(Math.abs(x - me.b.a), Math.abs(y - me.b.b)) <= h.e.h[3] + 3 && fight.c.j[y * h.g + x] > 0) { add({ t: 'item', id: SPIDER, x, y }); n++; break; }
			}
		}
	}
	return [...out.values()];
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
	const cands = (opts.cands || defaultCandidates('full')).map((c) => ({ name: c.name, params: { ...c.params }, needs: c.needs }));
	const K = opts.rollouts ?? 5;
	const budget = opts.budgetMs ?? Infinity;
	const strict = !!opts.strictBudget && Number.isFinite(budget);
	const runOpts = { ...(opts.runOpts || {}), ...(opts.useItemsForMp != null ? { useItemsForMp: !!opts.useItemsForMp } : {}) };
	const cfg = { problem, runOpts };
	const inits = await pool.setupExact({ ...cfg, problem: portableProblem(problem) });
	const bad = inits.find((r) => r && r.error);
	if (bad) return { error: bad.error };
	// the main trajectory (inline)
	const f = exactFight(problem);
	if (!f || f.error) return { error: f ? f.error : 'no fight' };
	let run = new Run(f, runOptsOf(runOpts));
	const prices = pricesFor(f.h, { useItemsForMp: !!runOpts.useItemsForMp });
	const hero0 = heroOf(f.h);
	const needs0 = run.walker.routeNeeds();
	// scout: the baseline from the start, for the need levels -- what the later fights cost in HP / EP (the shadow
	// prices' need, and how far the rest rule's Doctor / Charge repair: MP only where it buys something)
	const scoutNeeds = [];
	{
		const ck0 = run.checkpoint();
		const sr = Run.resume(ck0);
		for (let k = 0; k < 300; k++) {
			const ev = sr.toEncounter();
			if (ev.ev !== 'combat') break;
			const o = outcomeOf(sr, BASELINE, { ext: 0, maxInputs: opts.maxInputs });
			let healed = 0, fed = 0;
			for (const [id, n] of Object.entries(o.byId)) { const it = vj0.Z1.get(+id); if (it) { healed += (it.X > 0 ? it.X : 0) * n; fed += (it.Y > 0 ? it.Y : 0) * n; } }
			scoutNeeds.push({ hp: Math.min(o.hpM, Math.max(0, o.hpLost + healed)), ep: Math.max(0, o.epLost + fed) });
			if (o.dead || o.end === 'stuck' || o.end === 'error' || sr.fight.c.w) break;
			sr.walker.afterEncounter();
		}
		run = Run.resume(ck0);
	}
	/** need levels for the fights from encounter e on: 1.25 x the largest scouted HP (EP) need among them */
	const needFrom = (e) => {
		let hp = 0, ep = 0;
		for (let k = e; k < scoutNeeds.length; k++) { hp = Math.max(hp, scoutNeeds[k].hp); ep = Math.max(ep, scoutNeeds[k].ep); }
		return { hp: Math.ceil(1.25 * hp), ep: Math.ceil(1.25 * ep) };
	};
	const route = run.walker.legs.map((L) => ({ kind: L.kind, label: L.label, rec: L.rec ? { id: L.rec.id, x: L.rec.x, y: L.rec.y, critter: L.rec.k !== undefined } : null, at: L.at, steps: L.steps, doing: L.doing }));
	let synced = 0;
	const W = pool.size;
	const sync = async (withWalker) => {
		const inputs = run.log.slice(synced);
		const tops = run.led.topUps.filter((t) => t.at >= synced && t.at < synced + inputs.length + (withWalker ? 1 : 0)).map((t) => ({ at: t.at, mp: t.pool + t.amount }));
		synced = run.log.length;
		const wk = withWalker ? run.walker.freeze() : null;
		await Promise.all([...Array(W).keys()].map((w) => pool.call(w, 'sync', inputs, wk, tops)));
	};
	const playJobs = async (jobs, ctx) => {
		const per = [...Array(W)].map(() => []);
		jobs.forEach((j, i) => per[i % W].push(j));
		const parts = await Promise.all(per.map((js, w) => (js.length ? pool.call(w, 'evaluate', js, ctx) : [])));
		return parts.flat();
	};
	const encounters = [];
	const stopCount = {};
	let decisionsTotal = 0, jobsTotal = 0;
	for (let e = 0; e < 300; e++) {
		if (run.walker.opts.rest) run.walker.opts.rest.need = needFrom(e);
		const ev = run.toEncounter();
		if (ev.ev !== 'combat') break;
		await sync(true);
		const h = run.fight.h;
		const stop = ev.stop;
		const sk = stop ? `${stop.kind}:${stop.rec ? stop.rec.id + '@' + stop.rec.x + ',' + stop.rec.y : ''}` : 'start';
		const ord = stopCount[sk] || 0;
		stopCount[sk] = ord + 1;
		const needs = run.walker.routeNeeds();
		const later = needFrom(e + 1);
		const need = { hp: opts.hpNeed ?? Math.min(heroOf(h).hpM, later.hp), ep: needs.ep + later.ep, mp: needs.mp };
		const enc = {
			key: `${sk}#${ord}`, stop: stop ? { kind: stop.kind, label: stop.label, rec: stop.rec ? { id: stop.rec.id, x: stop.rec.x, y: stop.rec.y } : null, at: stop.at } : null,
			enemies: h.D.filter((m) => isFoe(h, m)).map((m) => critterInfo(h, m)), hero: heroOf(h), from: run.log.length,
		};
		// skill / item tactics only where the hero has what they need
		const av = availOf(h);
		const ec = cands.filter((c) => usable(c, av));
		const ctx = { cands: ec, need, restNeed: later, ext: opts.ext ?? 1, look: opts.look ?? 1, maxInputs: opts.maxInputs };
		const led0 = run.led.clone();
		// 1. every tactic from the encounter start
		const base = await playJobs(ec.map((_, c) => ({ inp: null, c })), ctx);
		jobsTotal += base.length;
		base.sort((a, b) => cmp(a, b));
		const ranked = base.filter((r) => r.o).map((r) => r.j.c);
		const incumbent = ranked[0];
		enc.tactics = base.map((r) => ({ label: labelOf(ec[r.j.c].name, ec[r.j.c].params), dead: r.o ? r.o.dead : true, end: r.o?.end, items: r.o?.items, mp: r.o?.mpSpent, hp: r.o?.hp, score: r.sc?.s }));
		enc.tactic = { name: ec[incumbent].name, params: ec[incumbent].params, label: labelOf(ec[incumbent].name, ec[incumbent].params) };
		const trivial = base.filter((r) => r.o).every((r) => r.o.items === base[0].o.items && r.o.mpSpent === base[0].o.mpSpent && r.o.hp === base[0].o.hp && r.o.dead === base[0].o.dead);
		const behind = strict && now() - t0 > budget * 0.8;
		const roll = ranked.slice(0, K).map((c) => ec[c]);
		const rollIdx = ranked.slice(0, K);
		// 2. receding-horizon search over the encounter's inputs; the play-outs and the trajectory use the same encounter
		// loop (Run.fightWith), so a policy finishing the encounter does exactly what its play-out predicted
		let decisions = 0, improved = 0;
		let best = base[0];
		const maxDec = behind || trivial ? 0 : (opts.maxDecisions ?? 100);
		let finish = incumbent;
		while (decisions < maxDec && (!strict || now() - t0 < budget)) {
			const fh = run.fight.h;
			if (!fh.C || fh.f.u_() || run.fight.c.w || !run.ready()) break;
			const cs = candidateInputs(run.fight, roll);
			if (cs.length <= 1) break;
			const jobs = [];
			for (const ci of cs) for (const c of rollIdx) jobs.push({ inp: ci, c });
			const res = await playJobs(jobs, ctx);
			jobsTotal += res.length;
			decisions++;
			const good = res.filter((r) => !r.bad && r.o);
			good.sort((a, b) => cmp(a, b));
			if (!good.length) break;
			if (cmp(good[0], best) < 0) improved++;
			best = good[0];
			finish = good[0].j.c;
			run.apply(good[0].j.inp);
			if (run.fight.selId() !== 0 && !(good[0].j.inp.t === 'item' || good[0].j.inp.t === 'skill')) run.apply({ t: 'cancel' });
			await sync(false);
		}
		// the rest of the encounter: the policy whose play-out won last
		if (run.fight.h.C && !run.fight.h.f.u_() && !run.fight.c.w && run.ready()) {
			enc.finish = labelOf(ec[finish].name, ec[finish].params);
			run.fightWith(makePolicy(ec[finish].name, ec[finish].params), opts.maxInputs);
		}
		decisionsTotal += decisions;
		await sync(false);
		// encounter totals (from the trajectory's ledger over this encounter's inputs)
		enc.to = run.log.length;
		enc.inputs = run.log.slice(enc.from, enc.to);
		enc.searched = decisions;
		enc.improved = improved;
		enc.predicted = best.o ? { items: best.o.items, mp: best.o.mpSpent, hp: best.o.hp, dead: best.o.dead } : null;
		enc.after = heroOf(run.fight.h);
		const lc = run.led.since(led0);
		enc.cost = { items: lc.items(), byId: lc.itemsById(), mp: lc.mp, hpLost: lc.hp, epLost: lc.ep, dead: run.fight.h.f.u_() };
		encounters.push(enc);
		if (opts.onProgress) opts.onProgress({ phase: 'encounter', k: encounters.length, key: enc.key, tactic: enc.tactic.label, searched: decisions, ms: now() - t0 });
		if (run.fight.h.f.u_() || run.fight.c.w) break;
		run.walker.afterEncounter();
	}
	// finish the walk (the exit; no fight ahead: no Doctor / Charge)
	if (run.walker.opts.rest) run.walker.opts.rest.need = needFrom(encounters.length);
	if (!run.fight.h.f.u_() && !run.fight.c.w) run.toEncounter();
	const h = run.fight.h;
	const led = run.led;
	const tr = trimTopUps(led.topUps);
	// the encounter a top-up comes before: the first one whose inputs start at or after it (a top-up at a fight's
	// first hero input belongs to that fight)
	// (a mid-fight top-up belongs to the encounter it happens in)
	const encAt = (at) => { const k = encounters.findIndex((e) => e.from >= at || (e.to != null && at < e.to)); return k >= 0 ? k : null; };
	const tops = led.topUps.map((t, i) => ({ at: t.at, stop: t.stop, stopIndex: stopIndexOf(route, t.stop), beforeEncounter: encAt(t.at), fight: !!t.fight, amount: tr[i], filled: t.amount, pool: t.pool })).filter((t) => t.amount > 0);
	return {
		mode: 'exact', problem: { type: problem.type, seed: problem.seed, xseed: problem.xseed, at: problem.at || 'start', hero: heroSpecOut(problem.hero) }, hero: hero0, prices, route, needs: needs0, entry: entryOut(f),
		inputs: run.log.slice(), encounters,
		// MP top-ups (no engine input: the player solves puzzles; at = the script position before which to have it)
		topUps: tops,
		totals: { items: led.items(), byId: led.itemsById(), mp: led.mp, hpLost: led.hp, dead: h.f.u_(), end: run.fight.c.w, objectivesLeft: h.i_(), inputs: run.log.length, final: heroOf(h) },
		search: { decisions: decisionsTotal, jobs: jobsTotal, rollouts: K },
		mpPlan: mpPlanOf(hero0, needs0, { mp: dist([led.mp]), mpPeak: dist([led.mpPeak]), mpBy: led.mpBy, toSolve: dist([tops.reduce((a, t) => a + t.amount, 0)]), mpItems: Object.entries(led.itemsById()).reduce((a, [id, n]) => a + ((vj0.Z1.get(+id) || {}).Z > 0 ? n : 0), 0) }, encounters.map((e) => ({ mpBefore: dist([e.hero.mp]) })), [], { route, tot: [{ topUps: tops }], useItemsForMp: !!runOpts.useItemsForMp }),
		ms: now() - t0, workers: W,
	};

	function cmp(a, b) {
		if (!a.o) return 1;
		if (!b.o) return -1;
		return compareExact(a.sc, b.sc) || (a.o.inputs - b.o.inputs);
	}
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
