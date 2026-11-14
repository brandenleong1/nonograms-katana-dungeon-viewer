// Exact mode's look-ahead: how a death after the fight being decided ranks against dying in it, and that exact mode
// does not let the plain-melee continuation veto lines. Unit cases on constructed scores, one encounter of a generated
// dungeon (a what-if hero at low HP) and one exact solve of a generated dungeon.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/exact-look-ahead.mjs [--quick] [-v]     (--quick skips the whole solve, about 20 s)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { parseLabel } from '../js/labels.js';
import * as S from '../js/solve/sim.js';
import { outcomeOf } from '../js/solve/robust.js';
import { candidates, usable, availOf } from '../js/solve/policies.js';
import { pricesFor, scoreOutcome, compareExact, aggregate } from '../js/solve/cost.js';
import { solveExact, InlineExactPool } from '../js/solve/exact.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
const verbose = process.argv.includes('-v');
const quick = process.argv.includes('--quick');
let fails = 0, passes = 0;
const check = (name, ok, info = '') => {
	if (ok) { passes++; console.log(`ok   ${name}${verbose && info ? '  ' + info : ''}`); }
	else { fails++; console.log(`FAIL ${name}  ${info}`); }
};
const SOLVE_DECISIONS = 3;
const t0 = performance.now();

// ---- the order: alive, then dying later (deeper first), then dying in the fight itself ----
{
	const alive = { dead: false, s: [3, 9], hp: 1, inputs: 9 };
	const dies2 = { dead: true, late: 2, s: [Infinity, Infinity], hp: -1, inputs: 9 };
	const dies1 = { dead: true, late: 1, s: [Infinity, Infinity], hp: 0, inputs: 9 };
	const dies1Hurt = { dead: true, late: 1, s: [Infinity, Infinity], hp: -4, inputs: 9 };
	const diesNow = { dead: true, late: 0, s: [Infinity, Infinity], hp: 0, inputs: 9 };
	const order = [diesNow, dies1Hurt, dies1, alive, dies2].sort(compareExact);
	const want = [alive, dies2, dies1, dies1Hurt, diesNow];
	check('compareExact: alive, then dies later (deeper first, then HP at death), then dies now', order.every((x, i) => x === want[i]), order.map((x) => want.indexOf(x)).join());
	check('compareExact: an alive line with a high cost still beats any death', compareExact({ dead: false, s: [9, 99], hp: 1, inputs: 1 }, dies2) < 0);
	check('compareExact: two lines that die the same way tie on the order', compareExact(dies1, { ...dies1 }) === 0);
	check('compareExact: surviving beats completing objectives in a line that dies', compareExact({ ...alive, abandoned: 2 }, { ...dies2, abandoned: 0 }) < 0);
	check('compareExact: a later death beats an earlier one even with more objectives abandoned', compareExact({ ...dies2, abandoned: 2 }, { ...diesNow, abandoned: 0 }) < 0);
	check('compareExact: among survivors completing objectives beats saving items', compareExact({ ...alive, abandoned: 0 }, { ...alive, abandoned: 1, s: [0, 0] }) < 0);
}

// ---- one fight: every tactic dies in the look-ahead, some survive the fight; the ranking must pick one of those ----
const HERO = { level: 9, gear: 0, items: [[120, 5], [168, 1], [206, 2], [174, 2]] };
const WHERE = { ...parseLabel('2A-200300400'), xseed: 12345 };
{
	resetStatics(tables);
	const run0 = S.Run.start(HERO, { ...WHERE, at: 'start' });
	const ev = run0.toEncounter();
	check('fight: the first encounter starts', !run0.error && ev.ev === 'combat');
	const ck = run0.checkpoint();
	const h0 = run0.fight.h;
	const cands = candidates('quick').filter((c) => usable(c, availOf(h0)));
	const prices = pricesFor(h0, {});
	const hpM = h0.f.q_();
	// scoreOutcome marks a death in the look-ahead with how deep it was; robust mode still counts it as a death
	const none = { hp: 0, ep: 0, mp: 0 };
	const dead = { dead: true, end: 'dead', items: 1, mpSpent: 2, hp: 0, hpM, ep: 5, mpLeft: 9, inputs: 7 };
	const dies0 = scoreOutcome({ ...dead, looked: 0 }, none, prices), dies2 = scoreOutcome({ ...dead, looked: 2 }, none, prices);
	check('scoreOutcome: deaths retain abandoned objectives', scoreOutcome({ ...dead, looked: 2, abandoned: 3 }, none, prices).abandoned === 3);
	check('scoreOutcome: dies in the fight -> late 0, dies in the 2nd look-ahead fight -> late 2', dies0.dead && dies2.dead && dies0.late === 0 && dies2.late === 2, JSON.stringify([dies0.late, dies2.late]));
	const ag = aggregate([dies2, { dead: false, items: 0, mp: 0, s: [0, 0], hp: 5, inputs: 3 }]);
	check('robust: a death in the look-ahead is still one death of two in P(death)', ag.dead === 1 && ag.pDeath === 0.5);
	// the hero enters the fight hurt, as it would after earlier fights: 10 of its HP left
	const play = (look) => cands.map((c) => {
		const run = S.Run.resume(ck);
		run.fight.h.f.j.z_(10);
		const o = outcomeOf(run, c, { ext: 1, look });
		return { c, o, sc: scoreOutcome(o, { hp: hpM, ep: 0, mp: 0 }, prices) };
	});
	const rank = (list) => [...list].sort((a, b) => compareExact(a.sc, b.sc) || (a.o.inputs - b.o.inputs));
	const without = play(0), withLook = play(1);
	check('fight: without the look-ahead some tactics survive it', without.some((p) => !p.sc.dead), `${without.filter((p) => !p.sc.dead).length} of ${without.length}`);
	check('fight: with the look-ahead every tactic dies (the plain-melee continuation loses the next fight)', withLook.every((p) => p.sc.dead));
	const best = rank(withLook)[0];
	const nowCount = withLook.filter((p) => p.sc.dead && !p.o.looked).length;
	check('fight: some tactic dies in the fight itself, so there is a bad pick to avoid', nowCount > 0, `${nowCount} of ${withLook.length}`);
	check('fight: the best-ranked tactic survives the fight (dies only in the look-ahead)', best.o.looked > 0, `${best.c.name} looked ${best.o.looked}`);
	check('fight: no tactic that dies in the fight ranks above one that survives it', rank(withLook).findIndex((p) => !p.o.looked) > rank(withLook).findLastIndex((p) => p.o.looked > 0));
}

// ---- a whole solve: the default exact solve of a generated dungeon survives it (on main it died in fight 7 of 15) ----
if (!quick) {
	resetStatics(tables);
	const problem = { hero: HERO, ...WHERE, at: 'start' };
	const res = await solveExact(problem, { pool: new InlineExactPool(1), maxDecisions: SOLVE_DECISIONS, cands: candidates('quick'), budgetMs: 120000 });
	check('solve: exact mode solves the dungeon', !res.error, res.error || `${res.encounters.length} fights`);
	if (!res.error) {
		check('solve: the default solve keeps the hero alive to the end', !res.totals.dead && res.totals.objectivesLeft === 0, `dead ${res.totals.dead}, ${res.totals.objectivesLeft} objectives left, ${res.encounters.length} fights`);
	}
}

console.log(`${passes} passed, ${fails} failed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
