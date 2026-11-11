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
//   M.value(k, dEnd, hEnd, att, m)                 // the expected strikes taken after a hero turn that ends with the
//                                                  // monster at path length dEnd, hEnd AP left, att strikes landed
//   M.kiteable(k, d, H, m)                         // a plan exists that takes no strike with certainty (adversarial)

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
	const out = [];
	const s = kind.spd;
	const go = (d, M, p, hits) => {
		for (;;) {
			if (M <= 0) { out.push({ p, hits, d, m: M }); return; }
			if (d === 1) { hits++; M -= 3; continue; }
			if (kind.waits && M === kind.n && d === kind.n + 1) {
				out.push({ p: p * WAIT_P, hits, d, m: M });
				p *= 1 - WAIT_P;
			}
			d--; M--;
		}
	};
	go(d, Math.min(m + s, s + 1), 1, 0);
	return out;
}

const CACHE = new Map();

/** the duel model for a hero speed and a monster kind (cached) */
export function duelModel(heroSpd, kind, Kmax = 10) {
	const ck = `${heroSpd}|${kind.spd}|${kind.waits ? kind.n : '-'}|${Kmax}`;
	let M = CACHE.get(ck);
	if (!M) { M = build(heroSpd, kind, Kmax); CACHE.set(ck, M); }
	return M;
}

function build(sh, kind, Kmax) {
	const s = kind.spd;
	const Hlo = -2, Hhi = sh + 1, mlo = -2, mhi = s + 1;
	const nH = Hhi - Hlo + 1, nm = mhi - mlo + 1;
	const clampH = (H) => Math.max(Hlo, Math.min(Hhi, H));
	const clampM = (m) => Math.max(mlo, Math.min(mhi, m));
	const clampD = (d) => Math.min(Math.max(d, 1), DMAX);
	const idx = (d, H, m) => ((d - 1) * nH + (H - Hlo)) * nm + (m - mlo);
	const N = DMAX * nH * nm;
	// monster turns by (d, m)
	const mt = new Map();
	const mturn = (d, m) => { const k = d * 64 + (m - mlo); let v = mt.get(k); if (!v) { v = monsterTurn(d, m, kind); mt.set(k, v); } return v; };
	// hero turn ends from (d, H): (dEnd, att) -> the most AP left (more AP is never worse: wait discards it)
	const heroEnds = (d0, H0) => {
		if (H0 <= 0) return [{ d: d0, att: 0, H: H0 }];   // the engine skips the hero's turn (c30.k)
		const best = new Map();
		const seen = new Set();
		const stack = [[d0, H0, 0]];
		while (stack.length) {
			const [d, H, att] = stack.pop();
			const sk = (d * 64 + H + 8) * 4 + att;
			if (seen.has(sk)) continue;
			seen.add(sk);
			const bk = d * 4 + att;
			if (!best.has(bk) || best.get(bk) < H) best.set(bk, H);
			if (H <= 0) continue;
			if (d === 1 && att < 2) stack.push([d, H - 3, att + 1]);
			if (d < DMAX) stack.push([d + 1, H - 1, att]);
			if (d > 1) stack.push([d - 1, H - 1, att]);
		}
		return [...best].map(([bk, H]) => ({ d: bk >> 2, att: bk & 3, H }));
	};
	/** the outcomes of a hero turn end e against monster AP m: flat [p, hits, next state index, ...] */
	const outsOf = (dEnd, hEnd, m) => {
		const H2 = clampH(Math.min(hEnd + sh, sh + 1));
		const a = [];
		for (const o of mturn(dEnd, m)) a.push(o.p, o.hits, idx(o.d, H2, clampM(o.m)));
		return a;
	};
	// per state: its options (k-independent), as flat arrays
	const OPT = new Array(N);
	for (let d = 1; d <= DMAX; d++) for (let H = Hlo; H <= Hhi; H++) for (let m = mlo; m <= mhi; m++) {
		OPT[idx(d, H, m)] = heroEnds(d, H).map((e) => ({ att: e.att, outs: outsOf(e.d, e.H, m) }));
	}
	const V = [new Float64Array(N)];
	const ITERS = [];
	const evalOpt = (k, o, Vk) => {
		if (o.att >= k) return 0;
		const Vn = o.att === 0 ? Vk : V[k - o.att];
		const a = o.outs;
		let v = TURN_COST;
		for (let j = 0; j < a.length; j += 3) v += a[j] * (a[j + 1] + Vn[a[j + 2]]);
		return v;
	};
	for (let k = 1; k <= Kmax; k++) {
		// value iteration from above (every policy that strikes when adjacent is proper: at most 3 monster strikes per
		// hero turn), so stalling loops cannot hold the values down
		const Vk = new Float64Array(N).fill(3 * k + 1);
		let iters = 0;
		for (let it = 0; it < 500; it++, iters++) {
			let delta = 0;
			for (let i = 0; i < N; i++) {
				const os = OPT[i];
				let best = Infinity;
				for (let q = 0; q < os.length; q++) { const v = evalOpt(k, os[q], Vk); if (v < best) best = v; }
				const dv = best - Vk[i];
				if (dv > delta) delta = dv; else if (-dv > delta) delta = -dv;
				Vk[i] = best;
			}
			if (delta < 1e-6) break;
		}
		ITERS.push(iters);
		V.push(Vk);
	}
	// certain kiting (adversarial monster): the greatest set of states with a no-strike plan forever that also lands
	// a strike infinitely often (Büchi game); computed on first use
	let Z = null;
	const safeSet = () => {
		const opts = new Array(N);
		for (let i = 0; i < N; i++) opts[i] = OPT[i].filter((o) => { for (let j = 1; j < o.outs.length; j += 3) if (o.outs[j] > 0) return false; return true; }).map((o) => ({ att: o.att, next: o.outs.filter((_, j) => j % 3 === 2) }));
		let Zs = new Uint8Array(N).fill(1), nz = N;
		for (;;) {
			const Y = new Uint8Array(N);
			let ny = 0;
			for (;;) {
				let grew = false;
				for (let i = 0; i < N; i++) if (!Y[i] && opts[i].some((o) => o.next.every((q) => (o.att > 0 ? Zs[q] : Y[q])))) { Y[i] = 1; ny++; grew = true; }
				if (!grew) break;
			}
			if (ny === nz) break;
			Zs = Y; nz = ny;
		}
		return Zs;
	};
	const kk = (k) => Math.max(1, Math.min(k, Kmax));
	return {
		heroSpd: sh, kind, Kmax, iters: ITERS,
		/** expected strikes taken from a hero-turn start state (k strikes still to land) */
		state(k, d, H, m) { return V[kk(k)][idx(clampD(d), clampH(H), clampM(m))]; },
		/** a hero turn ending at monster path length dEnd with hEnd AP left and att strikes landed (of k to go) */
		value(k, dEnd, hEnd, att, m) { return evalOpt(kk(k), { att, outs: outsOf(clampD(dEnd), hEnd, clampM(m)) }, V[kk(k)]); },
		/** P(strike) in the monster turn after such an end (immediate risk only) */
		risk(dEnd, m) { let p = 0; for (const o of mturn(clampD(dEnd), clampM(m))) if (o.hits > 0) p += o.p; return p; },
		/** the state is in the certain-kite set (no strike ever, strikes landed infinitely often) */
		safe(d, H, m) { if (!Z) Z = safeSet(); return !!Z[idx(clampD(d), clampH(H), clampM(m))]; },
	};
}

/**
 * Verdict table: for hero speeds x monster speeds, the expected strikes taken per k strikes landed from a standing
 * start at distance 3 (both fresh), and whether kiting is certain. For README / tests.
 */
export function verdict(heroSpds = [4, 5, 6], monSpds = [1, 2, 3, 4], k = 4) {
	const rows = [];
	for (const sh of heroSpds) for (const s of monSpds) {
		const kind = { spd: s, waits: s >= 2 && s <= 4, n: Math.min(s - 1, 2) };
		const M = duelModel(sh, kind);
		let best = Infinity;
		for (let d = 2; d <= 8; d++) best = Math.min(best, M.state(k, d, sh, 0));
		rows.push({ hero: sh, monster: s, hitsTaken: Math.round(M.state(k, 3, sh, 0) * 1000) / 1000, bestStart: Math.round(best * 1000) / 1000, certain: M.safe(3, sh, 0) || M.safe(4, sh, 0) || M.safe(5, sh, 0) });
	}
	return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// The duel on the grid: the hero's turn as (approach, strike(s), end cell) plans, valued by the model with the
// monster's real path length to each end cell.

const D4 = [[-1, 0], [0, -1], [1, 0], [0, 1]];

/** a lone foe the duel model describes: melee, no leap (2) / charge (4) / summons, not sealed, held or netted */
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
 * Path lengths (steps) of the monster's hw.t path to every cell as a target, with the hero's cell vacated (where the
 * hero would stand instead): a Dijkstra on hw.t's step costs (plain 100, liquid 90, reeds 85, doors 300 / 500,
 * same-team critters 1500; other occupants and unrevealed cells block), turn penalties left out. Returns Int16Array
 * (-1 = no path within maxSteps).
 */
export function monsterSteps(h, foe, maxSteps = 20) {
	const g = h.g, n = g * h.h;
	const heroIdx = h.f.b.b * g + h.f.b.a;
	const cost = new Int32Array(n).fill(0x3fffffff);
	const steps = new Int16Array(n).fill(-1);
	const best = new Int16Array(n).fill(-1);   // as a target: steps of the cheapest path ending there
	const bestCost = new Int32Array(n).fill(0x3fffffff);
	const team = foe.k;
	const passCost = (idx) => {
		if (h.m[idx] <= 0) return 0;
		const occ = idx === heroIdx ? null : h.k[idx];
		if (occ != null) {
			const t = occ.a;
			if (t.a === 84) return 85;
			if (t.l || t.u) return t.l ? 500 : 300;
			if (occ.e_() && occ.k === team) return 1500;
			return 0;
		}
		const cell = h.j[idx];
		if (cell.a === 10 && (cell.b & 32) === 0) return 500;
		if (cell.o_(false)) return 90;
		const xt = zw.u[cell.a];
		return xt.m || (xt.o && (cell.b & 32) !== 0) ? 100 : 0;
	};
	const s0 = foe.b.b * g + foe.b.a;
	cost[s0] = 0; steps[s0] = 0;
	// small binary heap of [cost, idx]
	const heap = [[0, s0]];
	const push = (c, i) => { heap.push([c, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
	const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let s = j; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === j) break; [heap[s], heap[j]] = [heap[j], heap[s]]; j = s; } } return top; };
	while (heap.length) {
		const [c, u] = pop();
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
			const pc = passCost(v);
			if (pc === 0) continue;
			const nc = c + pc;
			if (nc < cost[v]) { cost[v] = nc; steps[v] = su + 1; push(nc, v); }
		}
	}
	return best;
}

/** BFS of the hero's own steps (free, visible cells) from cell s up to depth: { dist (Int8Array, -1), prev } */
function heroSteps(h, c, s, depth, freeFn) {
	const g = h.g, n = g * h.h;
	const dist = new Int8Array(n).fill(-1);
	const prev = new Int32Array(n).fill(-1);
	dist[s] = 0;
	const q = [s];
	for (let qi = 0; qi < q.length; qi++) {
		const u = q[qi];
		if (dist[u] >= depth) continue;
		const ux = u % g, uy = (u / g) | 0;
		for (const [dx, dy] of D4) {
			const x = ux + dx, y = uy + dy;
			const v = y * g + x;
			if (x < 0 || y < 0 || x >= g || y >= h.h || dist[v] >= 0) continue;
			if (c.j[v] <= 0 || !freeFn(x, y)) continue;
			dist[v] = dist[u] + 1;
			prev[v] = u;
			q.push(v);
		}
	}
	return { dist, prev, list: q };
}

/**
 * The duel input now (hero's turn in combat, a lone duelable foe): { inp, plan } or null. k: strikes still needed.
 * freeFn(x, y): the cell is free to stand on (sim.js free). opts.room: weight of the open-space tie-breaker.
 */
export function duelInput(fight, foe, k, freeFn, opts = {}) {
	const h = fight.h, c = fight.c, me = h.f;
	const g = h.g;
	const H = me.n.v_();
	if (H < 1) return null;
	const kind = monsterKind(foe);
	const model = duelModel(me.r_(), kind);
	const m = foe.n.v_();
	const dm = monsterSteps(h, foe);
	const s = me.b.b * g + me.b.a;
	const fIdx = foe.b.b * g + foe.b.a;
	const hb = heroSteps(h, c, s, H, freeFn);
	const room = opts.room ?? 0.003;
	// open space past an end cell: how much further from the monster the hero could still get within its speed (in
	// a corner or a dead end this is small, and next turn's retreat would fail)
	const depth = Math.min(me.r_(), 6);
	const roomCache = new Map();
	const roomOf = (cell) => {
		let r = roomCache.get(cell);
		if (r !== undefined) return r;
		const d0 = dm[cell];
		r = 0;
		if (d0 >= 0) {
			const b = heroSteps(h, c, cell, depth, (x, y) => (y * g + x === s ? true : freeFn(x, y)));
			for (const v of b.list) if (dm[v] - d0 > r) r = dm[v] - d0;
		}
		r = Math.min(r, depth);
		roomCache.set(cell, r);
		return r;
	};
	// other hostile critters: their in-combat aggro box is 12 (turn.js S0): keep away from them
	const others = [];
	for (const o of h.o) if (o !== foe && o !== me && !o.u_() && zw.o_(me.k, o.k)) { const dd = Math.max(Math.abs(o.b.a - me.b.a), Math.abs(o.b.b - me.b.b)); if (dd <= 18) others.push(o); }
	const near = (cell) => {
		let p = 0;
		const x = cell % g, y = (cell / g) | 0;
		for (const o of others) { const dd = Math.max(Math.abs(o.b.a - x), Math.abs(o.b.b - y)); if (dd <= 13) p += 0.004 * (14 - dd); }
		return p;
	};
	// candidates by the model (+ the other-monster penalty); the open-space tie-breaker only among the near-best
	const cands = [];
	let best = null;
	const consider = (endCell, hEnd, att, first, extra = 0) => {
		const d = endCell === fIdx ? -1 : dm[endCell];
		if (d < 1) return;
		let v = model.value(k, d, hEnd, att, m) + extra;
		if (att < k) v += near(endCell);
		cands.push({ v, endCell, hEnd, att, first, d });
	};
	const firstStep = (bfs, to) => { let u = to; if (u === s) return null; while (bfs.prev[u] !== s && bfs.prev[u] >= 0) u = bfs.prev[u]; return u; };
	// a. no strike: end anywhere within H steps (a sealed foe: the unseal is still to come)
	const sealed = foe.i_(h.e) > 0;
	const sealCost = sealed ? (opts.sealCost ?? 0.3) : 0;
	for (const v of hb.list) consider(v, H - hb.dist[v], 0, v === s ? 'wait' : firstStep(hb, v), sealCost);
	if (sealed) {
		// unseal (4 AP, may borrow) from next to it, or from 2..3 in line of sight with Tactical gaze (h.e.h[7]), then
		// end the turn anywhere the AP left reaches
		const gaze = h.e.h[7] >= 1;
		const P = new Util$Point();
		for (const u of hb.list) {
			const s1 = hb.dist[u];
			if (H - s1 < 1) continue;
			const ux = u % g, uy = (u / g) | 0;
			const md = Math.abs(ux - foe.b.a) + Math.abs(uy - foe.b.b);
			if (md !== 1) { if (!gaze) continue; P.a = ux; P.b = uy; if (!h.O_(3, 1, P, foe.b)) continue; }
			const first = u === s ? 'unseal' : firstStep(hb, u);
			const H1 = H - s1 - 4;
			consider(u, H1, 0, first);
			if (H1 >= 1) {
				const b2 = heroSteps(h, c, u, H1, (x, y) => (y * g + x === s ? true : freeFn(x, y)));
				for (const v of b2.list) if (v !== u) consider(v, H1 - b2.dist[v], 0, first);
			}
		}
	}
	// b. strike from a cell next to the foe
	for (const [dx, dy] of sealed ? [] : D4) {
		const ax = foe.b.a + dx, ay = foe.b.b + dy;
		if (ax < 0 || ay < 0 || ax >= g || ay >= h.h) continue;
		const a = ay * g + ax;
		const s1 = hb.dist[a];
		if (s1 < 0 || H - s1 < 1) continue;
		const first = a === s ? 'strike' : firstStep(hb, a);
		const H1 = H - s1 - 3;
		if (k <= 1) { const v = -1 + 0.001 * s1; if (best == null || v < best.v) best = { v, endCell: a, hEnd: H1, att: 1, first, d: 1 }; continue; }
		consider(a, H1, 1, first);
		if (H1 >= 1) {
			if (k <= 2) { const v = -1 + 0.001 * s1; if (best == null || v < best.v) best = { v, endCell: a, hEnd: H1 - 3, att: 2, first, d: 1 }; }
			else consider(a, H1 - 3, 2, first);
			const b2 = heroSteps(h, c, a, H1, (x, y) => (y * g + x === s ? true : freeFn(x, y)));
			for (const v of b2.list) if (v !== a) consider(v, H1 - b2.dist[v], 1, first);
		}
	}
	if (cands.length) {
		let lo = Infinity;
		for (const q of cands) if (q.v < lo) lo = q.v;
		for (const q of cands) {
			if (q.v > lo + room * depth + 1e-9) continue;
			const v = q.att >= k ? q.v : q.v - room * roomOf(q.endCell);
			if (best == null || v < best.v - 1e-9) best = { ...q, v };
		}
	}
	if (!best) return null;
	let inp;
	if (best.first === 'wait') inp = { t: 'wait' };
	else if (best.first === 'strike') inp = { t: 'tap', x: foe.b.a, y: foe.b.b };
	else if (best.first === 'unseal') inp = { t: 'unseal', x: foe.b.a, y: foe.b.b };
	else if (best.first == null) inp = { t: 'wait' };
	else inp = { t: 'step', dx: (best.first % g) - me.b.a, dy: ((best.first / g) | 0) - me.b.b };
	return { inp, plan: best, model, foe };
}
