// Duel model: one hero against one melee monster, with the engine's exact AP rules, on an open line. Its value
// function drives the `kite` policy (policies.js), which plays it out on the real grid.
//
// AP rules (js/combat):
//  - new turn AP = min(left + spd, spd + 1) (turn.js c30.o0; bw flag 8192: spd + 1). Wait (20001) ends the turn and
//    keeps what is left, up to that cap.
//  - an action needs AP >= 1 and may borrow: melee costs 3 (hero and monster), a step costs 1 (move.js m0 n = 1).
//  - monster turn (turn.js S0 AI tail): every step of it, adjacent (Manhattan 1) -> strike (3 AP); else the waiting
//    move (ai.js c30.p): spd 2..4, no flag 8192, AP == n = min(spd - 1, 2) and the path is exactly n + 1 long -> with
//    67% (h(100) >= 33) it ends its turn instead of arriving with no AP; else one step along its path. AP <= 0 ends
//    the turn (c30.k).
// So a monster strikes in its turn iff its path to the hero is shorter than its AP at the start of that turn, and it
// arrives next to the hero without striking iff the path is exactly AP + 1 long (or it waits one cell short).
//
// State at the start of a hero turn: (d = the monster's path length to the hero, 1 = adjacent; H = hero AP after the
// refill; m = the monster's AP left from its last turn). The hero plays a turn: any mix of steps toward / away (1 AP),
// strikes when adjacent (3 AP, AP >= 1), ending by wait or at AP <= 0. V[k](d, H, m) is the least expected number of
// monster strikes the hero takes before landing k more strikes (the monster's turn is chance: its waiting move), plus
// a small cost per turn. On the open line the hero can always step away; the policy checks the grid.
//
//   const M = duelModel(heroSpd, { spd, waits })   // cached per (hero spd, monster spd, waits)
//   M.state(k, d, H, m)                            // V[k] at the start of a hero turn
//   M.value(k, dEnd, hEnd, att, m)                 // the expected strikes taken after a hero turn that ends with the
//                                                  // monster at path length dEnd, hEnd AP left, att strikes landed
//   M.risk(dEnd, m)                                // P(strike) in the monster turn right after such an end
//   M.safe(d, H, m)                                // a plan exists that takes no strike with certainty (adversarial)

import { zw } from '../gen/statics.js';
import { Util$Point } from '../gen/model.js';
import { mpOk } from './sim.js';

export const WAIT_P = 0.67;   // c30.p: x.h(100) >= 33
const TURN_COST = 0.01;       // per hero turn: among equal risks, kill sooner (100 turns ~ one strike taken)
export const DMAX = 14;

/** monster spd / waiting move of a critter (aw): { spd, waits, n } */
export function monsterKind(m) {
	const t = m.a;
	const fast = t.O_(8192);
	const spd = m.r_() + (fast ? 1 : 0);
	const base = m.r_();
	return { spd, waits: !fast && base <= 4 && base !== 1, n: Math.min(base - 1, 2) };
}

/**
 * The monster's turn from path length d with m AP left (open line, a lone hero): the outcomes
 * [{ p, hits, d, m }] (m: its AP left at the end of the turn).
 */
export function monsterTurn(d, m, kind) {
	const outcomes = [];
	let dist = d, ap = Math.min(m + kind.spd, kind.spd + 1), p = 1, hits = 0;
	for (;;) {
		if (ap <= 0) {
			outcomes.push({ p, hits, d: dist, m: ap });
			return outcomes;
		}
		if (dist === 1) { hits++; ap -= 3; continue; }
		if (kind.waits && ap === kind.n && dist === kind.n + 1) {
			outcomes.push({ p: p * WAIT_P, hits, d: dist, m: ap });
			p *= 1 - WAIT_P;
		}
		dist--; ap--;
	}
}

const CACHE = new Map();

/** the duel model for a hero speed and a monster kind (cached) */
export function duelModel(heroSpd, kind, Kmax = 10) {
	const cacheKey = `${heroSpd}|${kind.spd}|${kind.waits ? kind.n : '-'}|${Kmax}`;
	let model = CACHE.get(cacheKey);
	if (!model) {
		model = buildModel(heroSpd, kind, Kmax);
		CACHE.set(cacheKey, model);
	}
	return model;
}

/**
 * Verdict table: for hero speeds x monster speeds, the expected strikes taken per k strikes landed from a standing
 * start at distance 3 (both fresh), and whether kiting is certain. For README / tests.
 */
export function verdict(heroSpds = [4, 5, 6], monSpds = [1, 2, 3, 4], k = 4) {
	const rows = [];
	for (const heroSpd of heroSpds) for (const monSpd of monSpds) rows.push(verdictRow(heroSpd, monSpd, k));
	return rows;
}

function verdictRow(heroSpd, monSpd, k) {
	const kind = { spd: monSpd, waits: monSpd >= 2 && monSpd <= 4, n: Math.min(monSpd - 1, 2) };
	const model = duelModel(heroSpd, kind);
	let bestStart = Infinity;
	for (let d = 2; d <= 8; d++) bestStart = Math.min(bestStart, model.state(k, d, heroSpd, 0));
	return {
		hero: heroSpd,
		monster: monSpd,
		hitsTaken: round3(model.state(k, 3, heroSpd, 0)),
		bestStart: round3(bestStart),
		certain: model.safe(3, heroSpd, 0) || model.safe(4, heroSpd, 0) || model.safe(5, heroSpd, 0),
	};
}

const round3 = (x) => Math.round(x * 1000) / 1000;

function buildModel(heroSpd, kind, Kmax) {
	const states = new DuelStates(heroSpd, kind);
	const options = turnOptions(states);
	const { values, iters } = strikeValues(options, Kmax);
	let safeStates = null;   // computed on first use
	const clampK = (k) => Math.max(1, Math.min(k, Kmax));
	const indexOf = (d, H, m) => states.index(clampDist(d), states.clampH(H), states.clampM(m));
	return {
		heroSpd, kind, Kmax, iters,
		/** expected strikes taken from a hero-turn start state (k strikes still to land) */
		state(k, d, H, m) { return values[clampK(k)][indexOf(d, H, m)]; },
		/** a hero turn ending at monster path length dEnd with hEnd AP left and att strikes landed (of k to go) */
		value(k, dEnd, hEnd, att, m) {
			return optionValue(values, clampK(k), { att, outs: states.outcomes(clampDist(dEnd), hEnd, states.clampM(m)) });
		},
		/** P(strike) in the monster turn after such an end (immediate risk only) */
		risk(dEnd, m) {
			let p = 0;
			for (const o of states.monsterTurnFrom(clampDist(dEnd), states.clampM(m))) if (o.hits > 0) p += o.p;
			return p;
		},
		/** the state is in the certain-kite set (no strike ever, strikes landed infinitely often) */
		safe(d, H, m) {
			if (!safeStates) safeStates = certainKiteSet(options);
			return !!safeStates[indexOf(d, H, m)];
		},
	};
}

const clampDist = (d) => Math.min(Math.max(d, 1), DMAX);

/**
 * The states at the start of a hero turn, (d, H, m) -> a flat index: d 1..DMAX, hero AP H and monster AP m from -2
 * (borrowed) up to spd + 1. Caches the monster's turns.
 */
class DuelStates {
	constructor(heroSpd, kind) {
		this.heroSpd = heroSpd;
		this.kind = kind;
		this.hLo = -2;
		this.hHi = heroSpd + 1;
		this.mLo = -2;
		this.mHi = kind.spd + 1;
		this.nH = this.hHi - this.hLo + 1;
		this.nM = this.mHi - this.mLo + 1;
		this.size = DMAX * this.nH * this.nM;
		this.turns = new Map();
	}

	index(d, H, m) { return ((d - 1) * this.nH + (H - this.hLo)) * this.nM + (m - this.mLo); }

	clampH(H) { return Math.max(this.hLo, Math.min(this.hHi, H)); }

	clampM(m) { return Math.max(this.mLo, Math.min(this.mHi, m)); }

	/** monsterTurn(d, m), cached */
	monsterTurnFrom(d, m) {
		const turnKey = d * 64 + (m - this.mLo);
		let outcomes = this.turns.get(turnKey);
		if (!outcomes) {
			outcomes = monsterTurn(d, m, this.kind);
			this.turns.set(turnKey, outcomes);
		}
		return outcomes;
	}

	/** the monster's turn after a hero turn that ends at (dEnd, hEnd), monster AP m: flat [p, hits, next state, ...] */
	outcomes(dEnd, hEnd, m) {
		const nextH = this.clampH(Math.min(hEnd + this.heroSpd, this.heroSpd + 1));
		const flat = [];
		for (const o of this.monsterTurnFrom(dEnd, m)) flat.push(o.p, o.hits, this.index(o.d, nextH, this.clampM(o.m)));
		return flat;
	}
}

/** per state: the hero's turn options (the same for every k), each { att, outs } with outs from states.outcomes */
function turnOptions(states) {
	const options = new Array(states.size);
	for (let d = 1; d <= DMAX; d++) for (let H = states.hLo; H <= states.hHi; H++) for (let m = states.mLo; m <= states.mHi; m++) {
		options[states.index(d, H, m)] = heroTurnEnds(d, H).map((e) => ({ att: e.att, outs: states.outcomes(e.d, e.H, m) }));
	}
	return options;
}

/**
 * The ends of a hero turn from (d0, H0): each reachable (path length, strikes landed) with the most AP left (more AP is
 * never worse: wait discards it). [{ d, att, H }]
 */
function heroTurnEnds(d0, H0) {
	if (H0 <= 0) return [{ d: d0, att: 0, H: H0 }];   // the engine skips the hero's turn (c30.k)
	const mostAp = new Map();
	const seen = new Set();
	const stack = [[d0, H0, 0]];
	while (stack.length) {
		const [d, H, att] = stack.pop();
		const seenKey = (d * 64 + H + 8) * 4 + att;
		if (seen.has(seenKey)) continue;
		seen.add(seenKey);
		const endKey = d * 4 + att;
		if (!mostAp.has(endKey) || mostAp.get(endKey) < H) mostAp.set(endKey, H);
		if (H <= 0) continue;
		if (d === 1 && att < 2) stack.push([d, H - 3, att + 1]);
		if (d < DMAX) stack.push([d + 1, H - 1, att]);
		if (d > 1) stack.push([d - 1, H - 1, att]);
	}
	return [...mostAp].map(([endKey, H]) => ({ d: endKey >> 2, att: endKey & 3, H }));
}

/** V[0..Kmax] (V[0] = 0) by value iteration; iters: the sweeps each k took to converge */
function strikeValues(options, Kmax) {
	const values = [new Float64Array(options.length)];
	const iters = [];
	for (let k = 1; k <= Kmax; k++) {
		// value iteration from above (every policy that strikes when adjacent is proper: at most 3 monster strikes per
		// hero turn), so stalling loops cannot hold the values down
		values.push(new Float64Array(options.length).fill(3 * k + 1));
		let sweeps = 0;
		while (sweeps < 500 && sweep(values, k, options) >= 1e-6) sweeps++;
		iters.push(sweeps);
	}
	return { values, iters };
}

/** one in-place sweep of V[k] over every state; returns the largest change */
function sweep(values, k, options) {
	const Vk = values[k];
	let delta = 0;
	for (let i = 0; i < Vk.length; i++) {
		const stateOptions = options[i];
		let best = Infinity;
		for (let j = 0; j < stateOptions.length; j++) {
			const v = optionValue(values, k, stateOptions[j]);
			if (v < best) best = v;
		}
		const change = best - Vk[i];
		if (change > delta) delta = change;
		else if (-change > delta) delta = -change;
		Vk[i] = best;
	}
	return delta;
}

/** expected strikes taken after a turn option, k strikes still to land (an option that lands none reads V[k] itself) */
function optionValue(values, k, option) {
	if (option.att >= k) return 0;
	const next = values[k - option.att];
	const outs = option.outs;
	let v = TURN_COST;
	for (let j = 0; j < outs.length; j += 3) v += outs[j] * (outs[j + 1] + next[outs[j + 2]]);
	return v;
}

/**
 * Certain kiting (adversarial monster): the greatest set of states with a no-strike plan forever that also lands a
 * strike infinitely often (a Büchi game), as a Uint8Array over the states.
 */
function certainKiteSet(options) {
	const strikeFree = options.map((stateOptions) => stateOptions.filter(takesNoStrike).map((o) => ({ att: o.att, next: o.outs.filter((_, j) => j % 3 === 2) })));
	let safe = new Uint8Array(options.length).fill(1), nSafe = options.length;
	for (;;) {
		const { states, count } = strikeAttractor(strikeFree, safe);
		if (count === nSafe) return safe;
		safe = states;
		nSafe = count;
	}
}

function takesNoStrike(option) {
	for (let j = 1; j < option.outs.length; j += 3) if (option.outs[j] > 0) return false;
	return true;
}

/** the states that can force, taking no strike, a turn that lands a strike and ends in `target` */
function strikeAttractor(strikeFree, target) {
	const states = new Uint8Array(strikeFree.length);
	let count = 0, grew = true;
	while (grew) {
		grew = false;
		for (let i = 0; i < states.length; i++) {
			if (states[i] || !strikeFree[i].some((o) => o.next.every((q) => (o.att > 0 ? target[q] : states[q])))) continue;
			states[i] = 1;
			count++;
			grew = true;
		}
	}
	return { states, count };
}

// ---------------------------------------------------------------------------------------------------------------
// The duel on the grid: the hero's turn as (approach, strike(s), end cell) plans, valued by the model with the
// monster's real path length to each end cell.

const D4 = [[-1, 0], [0, -1], [1, 0], [0, 1]];

/** a lone foe the duel model describes: melee, no leap (2) / charge (4) / summons, not held or netted, and sealed only
 * if the seal is revealed and payable */
export function duelable(h, m) {
	const t = m.a;
	if (m.w > 0 || t.O_(2) || t.O_(4) || t.M0 || (t.C0 !== 0 && m.x > 0)) return false;
	if (m.s > 0 || m.t > 0 || m.q > 0) return false;
	// a seal (aw.i MP) is part of the duel when it is revealed and payable (the unseal costs 4 AP: kite.js plans it)
	const seal = m.i_(h.e);
	if (seal > 0 && (!m.d || !mpOk(h, seal) || (m.a.m0 && !m.s_(16384)))) return false;
	return true;
}

/**
 * The duel input now (hero's turn in combat, a lone duelable foe): { inp, plan } or null. k: strikes still needed.
 * freeFn(x, y): the cell is free to stand on (sim.js free). opts.room: weight of the open-space tie-breaker.
 */
export function duelInput(fight, foe, k, freeFn, opts = {}) {
	const ap = fight.h.f.n.v_();
	if (ap < 1) return null;
	const turn = new DuelTurn(fight, foe, { k, ap, freeFn });
	turn.considerNoStrike(opts.sealCost ?? 0.3);
	if (turn.sealed) turn.considerUnseal();
	else turn.considerStrikes();
	const best = turn.bestPlan(opts.room ?? 0.003);
	if (!best) return null;
	return { inp: firstInput(best, foe, fight.h), plan: best, model: turn.model, foe };
}

/**
 * Path lengths (steps) of the monster's hw.t path to every cell as a target, with the hero's cell vacated (where the
 * hero would stand instead): a Dijkstra on hw.t's step costs (plain 100, liquid 90, mine carts 85, doors 300 / 500,
 * same-team critters 1500; other occupants and unrevealed cells block), turn penalties left out. Returns Int16Array
 * (-1 = no path within maxSteps).
 */
export function monsterSteps(h, foe, maxSteps = 20) {
	const g = h.g, n = g * h.h;
	const cost = new Int32Array(n).fill(0x3fffffff);
	const steps = new Int16Array(n).fill(-1);
	const best = new Int16Array(n).fill(-1);   // as a target: steps of the cheapest path ending there
	const bestCost = new Int32Array(n).fill(0x3fffffff);
	const s0 = foe.b.b * g + foe.b.a;
	cost[s0] = 0; steps[s0] = 0;
	const heap = [[0, s0]];
	while (heap.length) {
		const [c, u] = heapPop(heap);
		if (c !== cost[u]) continue;
		const su = steps[u];
		if (su >= maxSteps) continue;
		const ux = u % g, uy = (u / g) | 0;
		for (const [dx, dy] of D4) {
			const x = ux + dx, y = uy + dy;
			if (x < 0 || y < 0 || x >= g || y >= h.h) continue;
			const v = y * g + x;
			// as a target (the hero would stand there): 100, whatever the cell
			if (c + 100 < bestCost[v] || (c + 100 === bestCost[v] && su + 1 < best[v])) { bestCost[v] = c + 100; best[v] = su + 1; }
			const pc = passCost(h, foe, v);
			if (pc === 0) continue;
			const nc = c + pc;
			if (nc < cost[v]) { cost[v] = nc; steps[v] = su + 1; heapPush(heap, nc, v); }
		}
	}
	return best;
}

/** hw.t's cost for the foe to pass through a cell (0 = blocked), with the hero's cell vacated */
function passCost(h, foe, cell) {
	if (h.m[cell] <= 0) return 0;
	const heroCell = h.f.b.b * h.g + h.f.b.a;
	const occupant = cell === heroCell ? null : h.k[cell];
	if (occupant != null) return occupantCost(occupant, foe.k);
	const tile = h.j[cell];
	if (tile.a === 10 && (tile.b & 32) === 0) return 500;
	if (tile.o_(false)) return 90;
	const xt = zw.u[tile.a];
	return xt.m || (xt.o && (tile.b & 32) !== 0) ? 100 : 0;
}

function occupantCost(occupant, team) {
	const t = occupant.a;
	if (t.a === 84) return 85;
	if (t.l || t.u) return t.l ? 500 : 300;
	if (occupant.e_() && occupant.k === team) return 1500;
	return 0;
}

/** binary min-heap of [cost, cell] pairs */
function heapPush(heap, cost, cell) {
	heap.push([cost, cell]);
	let j = heap.length - 1;
	while (j > 0) {
		const parent = (j - 1) >> 1;
		if (heap[parent][0] <= heap[j][0]) break;
		[heap[parent], heap[j]] = [heap[j], heap[parent]];
		j = parent;
	}
}

function heapPop(heap) {
	const top = heap[0];
	const last = heap.pop();
	if (!heap.length) return top;
	heap[0] = last;
	let j = 0;
	for (;;) {
		const l = 2 * j + 1, r = l + 1;
		let smallest = j;
		if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
		if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
		if (smallest === j) break;
		[heap[smallest], heap[j]] = [heap[j], heap[smallest]];
		j = smallest;
	}
	return top;
}

/**
 * One hero turn of the duel: every plan (approach, unseal or strike(s), end cell) valued by the model with the
 * monster's real path length to the end cell. A plan that lands the last strike needed goes straight to `best`; the
 * rest collect in `cands` for bestPlan().
 */
class DuelTurn {
	constructor(fight, foe, { k, ap, freeFn }) {
		const h = fight.h, me = h.f;
		this.fight = fight;
		this.h = h;
		this.foe = foe;
		this.k = k;
		this.ap = ap;
		this.model = duelModel(me.r_(), monsterKind(foe));
		this.foeAp = foe.n.v_();
		this.monsterDist = monsterSteps(h, foe);
		this.heroCell = me.b.b * h.g + me.b.a;
		this.foeCell = foe.b.b * h.g + foe.b.a;
		this.reach = heroSteps(fight, this.heroCell, { depth: ap, canStand: freeFn });
		// once the hero has moved, the cell it started on is free too
		this.canStandAfterMove = (x, y) => y * h.g + x === this.heroCell || freeFn(x, y);
		this.roomDepth = Math.min(me.r_(), 6);
		this.roomCache = new Map();
		this.others = otherHostiles(h, foe);
		this.sealed = foe.i_(h.e) > 0;
		this.cands = [];
		this.best = null;
	}

	/** a. no strike: end anywhere within the AP (a sealed foe: the unseal is still to come, at sealCost) */
	considerNoStrike(sealCost) {
		const { reach, heroCell } = this;
		const extra = this.sealed ? sealCost : 0;
		for (const v of reach.list) {
			const first = v === heroCell ? 'wait' : firstStep(reach, v);
			this.consider({ endCell: v, hEnd: this.ap - reach.dist[v], att: 0, first }, extra);
		}
	}

	/**
	 * The seal: unseal (4 AP, may borrow) from next to it, or from 2..3 in line of sight with Tactical gaze (h.e.h[7]),
	 * then end the turn anywhere the AP left reaches.
	 */
	considerUnseal() {
		const { reach } = this;
		const point = new Util$Point();
		for (const u of reach.list) {
			const stepsThere = reach.dist[u];
			if (this.ap - stepsThere < 1 || !this.canUnsealFrom(u, point)) continue;
			const first = u === this.heroCell ? 'unseal' : firstStep(reach, u);
			const apLeft = this.ap - stepsThere - 4;
			this.consider({ endCell: u, hEnd: apLeft, att: 0, first });
			if (apLeft >= 1) this.considerStepsAfter(u, apLeft, { att: 0, first });
		}
	}

	/** b. strike from a cell next to the foe, once or twice, then step on with the AP left */
	considerStrikes() {
		const { h, foe, reach, k } = this;
		for (const [dx, dy] of D4) {
			const ax = foe.b.a + dx, ay = foe.b.b + dy;
			if (ax < 0 || ay < 0 || ax >= h.g || ay >= h.h) continue;
			const a = ay * h.g + ax;
			const stepsThere = reach.dist[a];
			if (stepsThere < 0 || this.ap - stepsThere < 1) continue;
			const first = a === this.heroCell ? 'strike' : firstStep(reach, a);
			const apLeft = this.ap - stepsThere - 3;
			if (k <= 1) {
				this.considerFinish({ endCell: a, hEnd: apLeft, att: 1, first }, stepsThere);
				continue;
			}
			this.consider({ endCell: a, hEnd: apLeft, att: 1, first });
			if (apLeft < 1) continue;
			if (k <= 2) this.considerFinish({ endCell: a, hEnd: apLeft - 3, att: 2, first }, stepsThere);
			else this.consider({ endCell: a, hEnd: apLeft - 3, att: 2, first });
			this.considerStepsAfter(a, apLeft, { att: 1, first });
		}
	}

	/** the unseal reaches the foe from cell: next to it, or with Tactical gaze in line of sight within 3 */
	canUnsealFrom(cell, point) {
		const { h, foe } = this;
		const x = cell % h.g, y = (cell / h.g) | 0;
		if (Math.abs(x - foe.b.a) + Math.abs(y - foe.b.b) === 1) return true;
		const gaze = h.e.h[7] >= 1;
		if (!gaze) return false;
		point.a = x; point.b = y;
		return !!h.O_(3, 1, point, foe.b);
	}

	/** after acting on cell `from` with apLeft AP to spare: end the turn on any other cell that AP reaches */
	considerStepsAfter(from, apLeft, { att, first }) {
		const after = heroSteps(this.fight, from, { depth: apLeft, canStand: this.canStandAfterMove });
		for (const v of after.list) if (v !== from) this.consider({ endCell: v, hEnd: apLeft - after.dist[v], att, first });
	}

	/** a plan for the turn: its model value (+ extra), plus a penalty for ending near other hostile critters */
	consider(end, extra = 0) {
		const d = end.endCell === this.foeCell ? -1 : this.monsterDist[end.endCell];
		if (d < 1) return;
		let v = this.model.value(this.k, d, end.hEnd, end.att, this.foeAp) + extra;
		if (end.att < this.k) v += this.crowding(end.endCell);
		this.cands.push({ v, endCell: end.endCell, hEnd: end.hEnd, att: end.att, first: end.first, d });
	}

	/** a plan that lands the last strike needed: beats every other plan, the fewer steps first the better */
	considerFinish(end, stepsThere) {
		const v = -1 + 0.001 * stepsThere;
		if (this.best == null || v < this.best.v) this.best = { v, endCell: end.endCell, hEnd: end.hEnd, att: end.att, first: end.first, d: 1 };
	}

	/** the best plan; among the candidates near the lowest value, more open space past the end cell wins */
	bestPlan(room) {
		let best = this.best;
		if (!this.cands.length) return best;
		let lo = Infinity;
		for (const q of this.cands) if (q.v < lo) lo = q.v;
		for (const q of this.cands) {
			if (q.v > lo + room * this.roomDepth + 1e-9) continue;
			const v = q.att >= this.k ? q.v : q.v - room * this.openSpace(q.endCell);
			if (best == null || v < best.v - 1e-9) best = { ...q, v };
		}
		return best;
	}

	/**
	 * Open space past an end cell: how much further from the monster the hero could still get within its speed (in a
	 * corner or a dead end this is small, and next turn's retreat would fail). Memoised per cell.
	 */
	openSpace(cell) {
		let room = this.roomCache.get(cell);
		if (room !== undefined) return room;
		room = 0;
		const d0 = this.monsterDist[cell];
		if (d0 >= 0) {
			const around = heroSteps(this.fight, cell, { depth: this.roomDepth, canStand: this.canStandAfterMove });
			for (const v of around.list) if (this.monsterDist[v] - d0 > room) room = this.monsterDist[v] - d0;
		}
		room = Math.min(room, this.roomDepth);
		this.roomCache.set(cell, room);
		return room;
	}

	/** other hostile critters: their in-combat aggro box is 12 (turn.js S0), so keep away from them */
	crowding(cell) {
		const x = cell % this.h.g, y = (cell / this.h.g) | 0;
		let penalty = 0;
		for (const o of this.others) {
			const dd = Math.max(Math.abs(o.b.a - x), Math.abs(o.b.b - y));
			if (dd <= 13) penalty += 0.004 * (14 - dd);
		}
		return penalty;
	}
}

/** hostile critters other than the duel foe within 18 cells (Chebyshev) of the hero */
function otherHostiles(h, foe) {
	const me = h.f;
	const others = [];
	for (const o of h.o) {
		if (o === foe || o === me || o.u_() || !zw.o_(me.k, o.k)) continue;
		if (Math.max(Math.abs(o.b.a - me.b.a), Math.abs(o.b.b - me.b.b)) <= 18) others.push(o);
	}
	return others;
}

/**
 * BFS of the hero's own steps (visible cells canStand(x, y) allows) from cell `from` up to depth:
 * { dist (Int8Array, -1), prev, list (cells in BFS order, `from` first) }
 */
function heroSteps(fight, from, { depth, canStand }) {
	const h = fight.h, g = h.g, n = g * h.h;
	const dist = new Int8Array(n).fill(-1);
	const prev = new Int32Array(n).fill(-1);
	dist[from] = 0;
	const queue = [from];
	for (let qi = 0; qi < queue.length; qi++) {
		const u = queue[qi];
		if (dist[u] >= depth) continue;
		const ux = u % g, uy = (u / g) | 0;
		for (const [dx, dy] of D4) {
			const x = ux + dx, y = uy + dy;
			const v = y * g + x;
			if (x < 0 || y < 0 || x >= g || y >= h.h || dist[v] >= 0) continue;
			if (fight.c.j[v] <= 0 || !canStand(x, y)) continue;
			dist[v] = dist[u] + 1;
			prev[v] = u;
			queue.push(v);
		}
	}
	return { dist, prev, list: queue };
}

/** the first cell on the BFS path to `to` (null when `to` is where the BFS started) */
function firstStep(bfs, to) {
	const from = bfs.list[0];
	if (to === from) return null;
	let u = to;
	while (bfs.prev[u] !== from && bfs.prev[u] >= 0) u = bfs.prev[u];
	return u;
}

/** the input that starts a plan: a step toward its first cell, or the action where the hero stands */
function firstInput(plan, foe, h) {
	const first = plan.first;
	if (first === 'strike') return { t: 'tap', x: foe.b.a, y: foe.b.b };
	if (first === 'unseal') return { t: 'unseal', x: foe.b.a, y: foe.b.b };
	if (first === 'wait' || first == null) return { t: 'wait' };
	return { t: 'step', dx: (first % h.g) - h.f.b.a, dy: ((first / h.g) | 0) - h.f.b.b };
}
