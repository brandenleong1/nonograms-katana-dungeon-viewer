// Exact mode's give-up: when every line it finds dies, the plan turns back at a point between fights, gives up the
// stops still ahead and heads for the exit, and says so (plan.gaveUp, the first warning). Generated dungeons with
// what-if heroes only: one the hero cannot finish alive, one it can (the give-up must then change nothing).
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/exact-give-up.mjs [-v]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { parseLabel } from '../js/labels.js';
import * as S from '../js/solve/sim.js';
import { candidates } from '../js/solve/policies.js';
import { solveExact, replayScript, InlineExactPool } from '../js/solve/exact.js';
import { buildPlan, validatePlan } from '../js/solve/plan.js';
// (loaded this way so that the suite reports failures instead of stopping where the module is missing)
const { TurnBack } = await import('../js/solve/giveup.js').catch(() => ({ TurnBack: null }));

const here = path.dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
const verbose = process.argv.includes('-v');
let fails = 0, passes = 0;
const check = (name, ok, info = '') => {
	if (ok) { passes++; console.log(`ok   ${name}${verbose && info ? '  ' + info : ''}`); }
	else { fails++; console.log(`FAIL ${name}  ${info}`); }
};
const t0 = performance.now();

const LABEL = '2A-200300400';
const WHERE = { ...parseLabel(LABEL), xseed: 777, at: 'start' };
const PACK = [[120, 5], [168, 1], [206, 2], [174, 2]];
// a level 9 hero without gear dies in fight 8 of this run with half the objectives done; level 21 with full gear is safe
const WEAK = { level: 9, gear: 0, items: PACK };
const STRONG = { level: 21, gear: 4, items: PACK };
const QUICK = { cands: candidates('quick'), maxDecisions: 3, budgetMs: 120000 };

async function solve(hero, opts = {}) {
	resetStatics(tables);
	const problem = { hero, ...WHERE };
	const res = await solveExact(problem, { pool: new InlineExactPool(1), ...QUICK, ...opts });
	return { res, problem };
}

// ---- the walker: giving up leaves only the stairs (no objective monster, no key or lever on the way) ----
{
	resetStatics(tables);
	const run = S.Run.start(STRONG, WHERE);
	const w = run.walker;
	const before = w.legs.length;
	const boss = w.legs.find((L) => L.rec && L.rec.k !== undefined && L.kind === 'objective');
	const abandoned = typeof w.giveUp === 'function' ? w.giveUp() : [];
	check('walker: giving up leaves only the stairs to walk to', w.legs.length === 1 && w.legs[0].kind === 'exit', w.legs.map((L) => L.kind).join(','));
	check('walker: it names every stop it gave up (the stairs aside)', abandoned.length === before - 1 && abandoned.every((s) => s.kind !== 'exit'), `${abandoned.length} of ${before}`);
	check('walker: an objective monster is given up too', !!boss && abandoned.some((s) => s.rec && s.rec.id === boss.rec.id && s.rec.critter), boss ? `monster ${boss.rec.id}` : 'no objective monster');
	const ev = run.toEncounter();
	check('walker: it stops next to the stairs, alive (the player confirms leaving)', ev.ev === 'done' && w.atExit && !run.fight.h.f.u_(), `${ev.ev} atExit ${w.atExit}`);
}

// ---- a run the hero cannot finish alive: without the give-up it dies late; with it, it goes home and says so ----
{
	const { res: dies } = await solve(WEAK, { giveUp: false });
	check('weak hero: without the give-up it dies late, with objectives done', !dies.error && dies.totals.dead && dies.encounters.length >= 5 && dies.totals.objectivesLeft < 10, dies.error || `dead ${dies.totals.dead} in fight ${dies.encounters.length}, ${dies.totals.objectivesLeft} left`);
	const { res, problem } = await solve(WEAK);
	const g = res.gaveUp;
	check('weak hero: with it the hero survives', !res.error && !res.totals.dead, res.error || `dead ${res.totals.dead}`);
	check('weak hero: the result says it gave up, after which fight and why', !!g && g.reason === 'every line dies' && g.afterFight === res.encounters.length && g.afterFight < dies.encounters.length && g.died.fight === dies.encounters.length, JSON.stringify(g && { afterFight: g.afterFight, died: g.died }));
	check('weak hero: the objectives it gave up are the ones left undone', !!g && g.abandoned.filter((s) => s.kind === 'objective').length === res.totals.objectivesLeft && res.totals.objectivesLeft >= dies.totals.objectivesLeft);
	check('weak hero: it turns back where the line it dies on went on (same script before that)', !!g && JSON.stringify(res.inputs.slice(0, g.atInput)) === JSON.stringify(dies.inputs.slice(0, g.atInput)));
	resetStatics(tables);
	const rp = replayScript(problem, res.inputs, res.topUps);
	check('weak hero: the script replays alive to the same end', !rp.error && !rp.dead && rp.rej === 0 && rp.final.x === res.totals.final.x && rp.final.y === res.totals.final.y && rp.objectivesLeft === res.totals.objectivesLeft);
	const plan = buildPlan(res, { label: LABEL });
	const errs = validatePlan(plan);
	check('weak hero: the plan validates, with plan.gaveUp', errs.length === 0 && !!plan.gaveUp && plan.gaveUp.abandoned.every((s) => s.stop == null || plan.stops[s.stop].kind === s.kind), errs.join(', '));
	const w = plan.warnings[0];
	check('weak hero: its first warning says the run can\'t be finished alive', !!w && w.kind === 'gaveUp' && /can't be finished alive/.test(w.text) && w.text.includes(`after fight ${g.afterFight}`), w && w.text);
	check('weak hero: no separate death warning (the hero lives)', !plan.warnings.some((x) => x.kind === 'death'));
	const broken = validatePlan({ ...plan, gaveUp: { ...plan.gaveUp, atInput: plan.script.inputs.length + 1 } });
	check('validatePlan: a give-up past the script\'s end is a problem', broken.some((e) => /gaveUp/.test(e)), broken.join(', '));
}

// ---- when no point gets home, the death found first stands: the same plan as without the give-up ----
{
	const { res: dies } = await solve(WEAK, { giveUp: false });
	check('no way home: the give-up module is there', !!TurnBack);
	const playOut = TurnBack ? TurnBack.prototype.playOut : null;
	// every point fails to get home
	if (TurnBack) TurnBack.prototype.playOut = function (point) { return { ...playOut.call(this, point), home: false }; };
	let res;
	try {
		({ res } = await solve(WEAK));
	} finally {
		if (TurnBack) TurnBack.prototype.playOut = playOut;
	}
	check('no way home: the hero still dies, as without the give-up, and nothing is given up', !res.error && res.totals.dead && res.gaveUp === null && !!res.search.turnBack && res.search.turnBack.points > 0, res.error || JSON.stringify(res.search.turnBack));
	check('no way home: the same script and totals as without the give-up', JSON.stringify(res.inputs) === JSON.stringify(dies.inputs) && res.encounters.length === dies.encounters.length && res.totals.items === dies.totals.items && res.totals.objectivesLeft === dies.totals.objectivesLeft);
}

// ---- a run the hero survives: the give-up never comes up, and the plan is the same without it ----
{
	const { res: a } = await solve(STRONG);
	const { res: b } = await solve(STRONG, { giveUp: false });
	check('strong hero: survives, nothing given up', !a.error && !a.totals.dead && a.gaveUp === null && !!a.search.turnBack && a.search.turnBack.points === 0, a.error || JSON.stringify(a.search.turnBack));
	check('strong hero: the same script with the give-up off', JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && a.totals.items === b.totals.items && a.totals.mp === b.totals.mp);
	check('strong hero: its plan has gaveUp null', buildPlan(a, { label: LABEL }).gaveUp === null);
}

console.log(`${passes} passed, ${fails} failed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
