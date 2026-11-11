// The objective: fewest items used, then least MP, the hero alive. Lexicographic.
//
// Model (see README.md, "Cost model"):
//  - Death is infinitely bad: a policy must keep P(death) <= maxDeath (1%) on its samples; among the ones that do not,
//    the lowest P(death) wins.
//  - Items: consumables used (sim.js Ledger: per-step pack decreases; the Mechanical spider only when it was lost,
//    ambrosia when it revived us). MP: net mental power spent (fountains count back).
//  - Within one encounter the immediate (items, MP) do not see what the fight leaves behind, so a greedy per-encounter
//    choice could win cheaply by bleeding HP / EP that a later fight then pays for with potions. The leftover pools are
//    therefore converted to future (items, MP) with shadow prices from the hero's cheapest recovery for each pool:
//      HP below half:  Doctor (20006, out of combat only, below half HP): 6 MP per ~10 HP          -> 0.6 MP / HP
//                      (no Doctor: the best HP item in the pack: 1 / X items per HP)
//      HP above half:  only items heal it (Doctor needs HP below half)                              -> 1 / X items / HP
//      EP:             Charge (20005): 6 MP per 10 EP                                               -> 0.6 MP / EP
//                      (no Charge: 1 / Y items per EP of the best EP item)
//      MP:             below the route's reserve (seals, sealed doors, chests still ahead): 1 / Z items per MP of the
//                      best MP item (217: 20 MP; also when the pack has none: the potion the player would bring)
//    A deficit is only priced up to what the rest of the dungeon needs ("need" levels): HP the next fights are expected
//    to cost (scouted: the largest expected HP loss of a later encounter, x1.25), the EP and MP still to be spent on the
//    route. At the last encounter every need is 0: leftovers are worth nothing, as in the game.
//  - Ties after (items, MP) are broken by the shadow-priced score, then HP left, then fewer inputs.
import { learned, SKILL } from './sim.js';

/** tolerance in mean items / MP under which two policies count as tied on that criterion */
export const TOL = { items: 0.02, mp: 0.1 };

/**
 * shadow prices for a hero: per point of HP below half, HP above half, EP, MP below reserve, each as [items, mp].
 * MP is replenishable (puzzles; sim.js Run.topUpFor), so an MP deficit costs nothing -- unless opts.useItemsForMp
 * (the old stock model: an MP item per Z MP).
 */
export function pricesFor(h, opts = {}) {
	const best = (field) => {
		let v = 0;
		for (const e of h.f.D.c) {
			const it = e.a;
			if (e.a_() > 0 && it.a !== 123 && !it.b0 && it[field] > v && (it.a0 === 0 || it.a0 === 2)) v = it[field];
		}
		return v;
	};
	const X = best('X') || 20, Y = best('Y') || 20, Z = best('Z') || 0;
	const doctor = learned(h, SKILL.DOCTOR), charge = learned(h, SKILL.CHARGE);
	return {
		hpLow: doctor ? [0, 0.6] : [1 / X, 0],
		hpHigh: [1 / X, 0],
		ep: charge ? [0, 0.6] : [1 / Y, 0],
		// useItemsForMp: no MP item in the pack -> priced as the MP potion (217, 20 MP) the player would bring
		// replenishable MP: a tiny MP price per point below the reserve, only to break ties against needless spending --
		// never enough to outweigh an item or a death
		mp: opts.useItemsForMp ? [1 / (Z || 20), 0] : [0, 0.01],
	};
}

/**
 * The future (items, mp) a state leaves to pay: pools { hp, hpM, ep, mp } against needs { hp, ep, mp } (levels the
 * rest of the dungeon needs; 0 = nothing more to do).
 */
export function shadow(pools, need, prices) {
	let items = 0, mp = 0;
	const half = (pools.hpM + 1) >> 1;
	const add = (pr, n) => { if (n > 0) { items += pr[0] * n; mp += pr[1] * n; } };
	const hpNeed = Math.min(need.hp || 0, pools.hpM);
	if (hpNeed > 0) {
		add(prices.hpLow, Math.min(hpNeed, half) - Math.min(pools.hp, half));
		if (hpNeed > half) add(prices.hpHigh, hpNeed - Math.max(pools.hp, half));
	}
	add(prices.ep, (need.ep || 0) - pools.ep);
	// MP: the Doctor / Charge repairs above are paid in MP too, so the reserve includes them
	add(prices.mp, (need.mp || 0) + mp - pools.mp);
	return { items, mp };
}

/**
 * Score of one outcome { dead, end, items, mpSpent, hp, hpM, ep, mpLeft, inputs } (robust.js outcomeOf): immediate
 * (items, MP) + the shadow of the end pools. Returns { dead, items, mp, s: [items + shadow, mp + shadow], hp, inputs }.
 * A stuck encounter (input cap, no progress) counts as a death.
 */
export function scoreOutcome(o, need, prices) {
	if (o.dead || o.end === 'stuck' || o.end === 'error') return { dead: true, items: o.items, mp: o.mpSpent, s: [Infinity, Infinity], hp: o.hp, inputs: o.inputs };
	const sh = shadow({ hp: o.hp, hpM: o.hpM, ep: o.ep, mp: o.mpLeft }, need, prices);
	return { dead: false, items: o.items, mp: o.mpSpent, s: [o.items + sh.items, o.mpSpent + sh.mp], hp: o.hp, inputs: o.inputs };
}

/** aggregate outcome scores of one policy over samples */
export function aggregate(scores) {
	const n = scores.length;
	let dead = 0, i0 = 0, m0 = 0, s0 = 0, s1 = 0, hp = 0, inp = 0, alive = 0;
	let si = 0, si2 = 0, sm2 = 0;
	for (const s of scores) {
		if (s.dead) { dead++; continue; }
		alive++;
		i0 += s.items; m0 += s.mp; s0 += s.s[0]; s1 += s.s[1]; hp += s.hp || 0; inp += s.inputs || 0;
		si += s.s[0]; si2 += s.s[0] * s.s[0]; sm2 += s.s[1] * s.s[1];
	}
	const a = Math.max(alive, 1);
	const mean0 = s0 / a, mean1 = s1 / a;
	return {
		n, dead, pDeath: n ? dead / n : 0,
		items: i0 / a, mp: m0 / a,           // immediate means (alive samples)
		score: [mean0, mean1],               // shadow-priced means
		se: [Math.sqrt(Math.max(0, si2 / a - mean0 * mean0) / a), Math.sqrt(Math.max(0, sm2 / a - mean1 * mean1) / a)],
		hp: hp / a, inputs: inp / a,
	};
}

/**
 * Lexicographic comparison of two aggregates: feasibility (pDeath <= maxDeath), then lower pDeath if both infeasible,
 * then score items, then score MP (each with tolerance), then HP left, then inputs. < 0: a is better.
 */
export function compareAgg(a, b, maxDeath = 0.01) {
	const fa = a.pDeath <= maxDeath, fb = b.pDeath <= maxDeath;
	if (fa !== fb) return fa ? -1 : 1;
	if (!fa && a.pDeath !== b.pDeath) return a.pDeath - b.pDeath;
	const d0 = a.score[0] - b.score[0];
	if (Math.abs(d0) > TOL.items) return d0;
	const d1 = a.score[1] - b.score[1];
	if (Math.abs(d1) > TOL.mp) return d1;
	if (a.pDeath !== b.pDeath) return a.pDeath - b.pDeath;
	if (Math.abs(a.hp - b.hp) > 0.5) return b.hp - a.hp;
	return a.inputs - b.inputs;
}

/**
 * Clearly worse than the best so far (for adaptive pruning): infeasible with confidence (deaths beyond what maxDeath
 * allows at this n even by luck), or its score items above the best's by 3 SE + margin.
 */
export function dominated(a, best, maxDeath = 0.01) {
	if (a === best) return false;
	// one-sided: P(>= dead deaths | p = maxDeath) small -> infeasible (rough: dead > n * maxDeath + 2 sqrt(n p) + 1)
	const lim = a.n * maxDeath + 2 * Math.sqrt(a.n * maxDeath) + 1;
	if (a.dead > lim && best.pDeath <= maxDeath) return true;
	if (best.pDeath > maxDeath) return false;
	const se = Math.hypot(a.se[0], best.se[0]);
	if (a.score[0] - best.score[0] > 3 * se + 0.05) return true;
	if (Math.abs(a.score[0] - best.score[0]) <= TOL.items && a.score[1] - best.score[1] > 3 * Math.hypot(a.se[1], best.se[1]) + 0.5) return true;
	return false;
}

/** compare two (dead, items, mp) totals lexicographically: < 0 when a is better (exact mode) */
export function compareExact(a, b) {
	if (!!a.dead !== !!b.dead) return a.dead ? 1 : -1;
	const d0 = a.s[0] - b.s[0];
	if (Math.abs(d0) > 1e-9) return d0;
	const d1 = a.s[1] - b.s[1];
	if (Math.abs(d1) > 1e-9) return d1;
	return (b.hp || 0) - (a.hp || 0);
}

/** distribution summary: mean, p50, p95, max */
export function dist(xs) {
	if (!xs.length) return { mean: 0, p50: 0, p95: 0, max: 0, min: 0, p05: 0 };
	const s = [...xs].sort((a, b) => a - b);
	const q = (p) => s[Math.max(0, Math.min(s.length - 1, Math.ceil(p * s.length) - 1))];
	return { mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1], min: s[0], p05: q(0.05) };
}
