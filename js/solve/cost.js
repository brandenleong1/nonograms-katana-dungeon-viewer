// The objective, lexicographic: the hero alive, then no objective left behind, then fewest items used, then least MP.
//
// Model (see README.md, "Cost model"):
//  - Death is infinitely bad: a policy must keep P(death) <= maxDeath (1%) on its samples; among the ones that do not,
//    the lowest P(death) wins.
//  - Objectives left behind: the ones the route walker gives up during a play-out (sim.js Walker.abandoned: stops it
//    can no longer reach, e.g. past foes a tactic ran away from). They rank before items, so no tactic can look cheap
//    by skipping an objective and the fights it would take.
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
//  - Ties after (objectives, items, MP) are broken by the shadow-priced score, then HP left, then fewer inputs.
import { learned, SKILL, AMBROSIA } from './sim.js';

/** tolerance in mean objectives abandoned / items / MP under which two policies count as tied on that criterion */
export const TOL = { abandoned: 0.02, items: 0.02, mp: 0.1 };

/**
 * shadow prices for a hero: per point of HP below half, HP above half, EP, MP below reserve, each as [items, mp].
 * MP is replenishable (puzzles; sim.js Run.topUpFor), so an MP deficit costs nothing -- unless opts.useItemsForMp
 * (the old stock model: an MP item per Z MP).
 */
export function pricesFor(h, opts = {}) {
	const X = bestRestore(h, 'X') || 20, Y = bestRestore(h, 'Y') || 20, Z = bestRestore(h, 'Z') || 0;
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

/** the most one plain item in the pack restores of field (X HP, Y EP, Z MP); never ambrosia, no buff side effects */
function bestRestore(h, field) {
	let v = 0;
	for (const e of h.f.D.c) {
		const it = e.a;
		if (e.a_() > 0 && it.a !== AMBROSIA && !it.b0 && it[field] > v && (it.a0 === 0 || it.a0 === 2)) v = it[field];
	}
	return v;
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
 * Score of one outcome { dead, end, abandoned, items, mpSpent, hp, hpM, ep, mpLeft, inputs, looked } (robust.js outcomeOf):
 * the objectives it gave up, immediate (items, MP) + the shadow of the end pools. Returns { dead, late, abandoned,
 * items, mp, s: [items + shadow, mp + shadow], hp, inputs }. A stuck encounter (input cap, no progress) counts as a
 * death. `late` is the number of
 * look-ahead fights the hero got through before dying (0: it died in the fight itself); compareExact orders deaths by it.
 */
export function scoreOutcome(o, need, prices) {
	const abandoned = o.abandoned || 0;
	if (o.dead || o.end === 'stuck' || o.end === 'error') return { dead: true, abandoned, late: o.looked || 0, items: o.items, mp: o.mpSpent, s: [Infinity, Infinity], hp: o.hp, inputs: o.inputs };
	const sh = shadow({ hp: o.hp, hpM: o.hpM, ep: o.ep, mp: o.mpLeft }, need, prices);
	return { dead: false, abandoned, items: o.items, mp: o.mpSpent, s: [o.items + sh.items, o.mpSpent + sh.mp], hp: o.hp, inputs: o.inputs };
}

/** aggregate outcome scores of one policy over samples */
export function aggregate(scores) {
	const n = scores.length;
	let dead = 0, alive = 0, items = 0, mp = 0, hp = 0, inputs = 0, abandoned = 0, abandonedSq = 0;
	let score0 = 0, score1 = 0, score0Sq = 0, score1Sq = 0;   // sums of the shadow-priced scores and of their squares
	for (const s of scores) {
		if (s.dead) { dead++; continue; }
		alive++;
		items += s.items; mp += s.mp; score0 += s.s[0]; score1 += s.s[1]; hp += s.hp || 0; inputs += s.inputs || 0;
		score0Sq += s.s[0] * s.s[0]; score1Sq += s.s[1] * s.s[1];
		abandoned += s.abandoned || 0; abandonedSq += (s.abandoned || 0) ** 2;
	}
	const a = Math.max(alive, 1);
	const mean0 = score0 / a, mean1 = score1 / a, meanAbandoned = abandoned / a;
	return {
		n, dead, pDeath: n ? dead / n : 0,
		abandoned: meanAbandoned,            // objectives given up per play-out (alive samples)
		abandonedSe: Math.sqrt(Math.max(0, abandonedSq / a - meanAbandoned * meanAbandoned) / a),
		items: items / a, mp: mp / a,        // immediate means (alive samples)
		score: [mean0, mean1],               // shadow-priced means
		se: [Math.sqrt(Math.max(0, score0Sq / a - mean0 * mean0) / a), Math.sqrt(Math.max(0, score1Sq / a - mean1 * mean1) / a)],
		hp: hp / a, inputs: inputs / a,
	};
}

/**
 * Lexicographic comparison of two aggregates: feasibility (pDeath <= maxDeath), then lower pDeath if both infeasible,
 * then objectives abandoned, then score items, then score MP (each with tolerance), then HP left, then inputs. < 0: a
 * is better.
 */
export function compareAgg(a, b, maxDeath = 0.01) {
	const fa = a.pDeath <= maxDeath, fb = b.pDeath <= maxDeath;
	if (fa !== fb) return fa ? -1 : 1;
	if (!fa && a.pDeath !== b.pDeath) return a.pDeath - b.pDeath;
	const dA = (a.abandoned || 0) - (b.abandoned || 0);
	if (Math.abs(dA) > TOL.abandoned) return dA;
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
 * allows at this n even by luck), or more objectives abandoned, or its score items above the best's, by 3 SE + margin.
 */
export function dominated(a, best, maxDeath = 0.01) {
	if (a === best) return false;
	// one-sided: P(>= dead deaths | p = maxDeath) small -> infeasible (rough: dead > n * maxDeath + 2 sqrt(n p) + 1)
	const lim = a.n * maxDeath + 2 * Math.sqrt(a.n * maxDeath) + 1;
	if (a.dead > lim && best.pDeath <= maxDeath) return true;
	if (best.pDeath > maxDeath) return false;
	if ((a.abandoned || 0) - (best.abandoned || 0) > 3 * Math.hypot(a.abandonedSe || 0, best.abandonedSe || 0) + 0.05) return true;
	const se = Math.hypot(a.se[0], best.se[0]);
	if (a.score[0] - best.score[0] > 3 * se + 0.05) return true;
	if (Math.abs(a.score[0] - best.score[0]) <= TOL.items && a.score[1] - best.score[1] > 3 * Math.hypot(a.se[1], best.se[1]) + 0.5) return true;
	return false;
}

/**
 * compare two (dead, abandoned, items, mp) totals lexicographically: < 0 when a is better (exact mode). Alive beats
 * any death. Of two deaths the later one is better (more look-ahead fights survived, then more HP at death): a line that dies in the
 * look-ahead still got through the fight being decided, which one that dies in it did not.
 */
export function compareExact(a, b) {
	if (!!a.dead !== !!b.dead) return a.dead ? 1 : -1;
	if (a.dead) return ((b.late || 0) - (a.late || 0)) || ((b.hp || 0) - (a.hp || 0));
	const dA = (a.abandoned || 0) - (b.abandoned || 0);
	if (dA !== 0) return dA;
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
