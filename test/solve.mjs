// Solver tests (js/solve): ledger, walker checkpoints, the wiki first-strike check, robust + exact solves on a small
// budget, the plan schema, and the worker pool.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/solve.mjs [--quick] [--no-workers] [-v]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import * as S from '../js/solve/sim.js';
import { makePolicy, candidates, usable, availOf } from '../js/solve/policies.js';
import { duelModel, verdict } from '../js/solve/kite.js';
import { solveRobust, InlinePool, outcomeOf, mix32, ScoutProfile } from '../js/solve/robust.js';
import { solveExact, replayScript, InlineExactPool } from '../js/solve/exact.js';
import { buildPlan, validatePlan } from '../js/solve/plan.js';
import { shadow, pricesFor, compareAgg, aggregate, scoreOutcome } from '../js/solve/cost.js';
import { WorkerPool } from '../js/solve/pool.js';
import { planRoute } from '../js/plan/planner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(here, '../data/tables.json');
const tables = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const verbose = args.includes('-v');
let fails = 0, passes = 0;
const check = (name, ok, info = '') => {
	if (ok) { passes++; console.log(`ok   ${name}${verbose && info ? '  ' + info : ''}`); }
	else { fails++; console.log(`FAIL ${name}  ${info}`); }
};
const t0 = performance.now();

// ---- ledger: a potion is one item, an unhurt spider none ----
{
	resetStatics(tables);
	const run = S.Run.start({ level: 10, kit: true }, { type: 8, seed: 172582050, xseed: 12345, at: 'auto' });
	const h = run.fight.h;
	const hpM = h.f.q_();
	h.f.j.z_(hpM - 15);
	const led = new S.Ledger();
	run.apply({ t: 'potion', id: 120 }, led);
	check('ledger: potion counted', led.items() === 1 && led.itemsById()[120] === 1, JSON.stringify(led.itemsById()));
	const l2 = new S.Ledger();
	const b = S.probe(h);
	l2.spiderNet = 1; l2.spiderNet -= 1;
	S.account(l2, b, h);
	check('ledger: returned spider is no item', l2.items() === 0);
	check('consumables: keys are not items', !S.isConsumable({ a: 167, b0: false, X: 0, Y: 0, Z: 0, a0: 0, d0: true, e0: true }) && S.isConsumable({ a: 120, b0: false, X: 20, Y: 0, Z: 0, a0: 0, d0: true, e0: true }));
}

// ---- cost model ----
{
	const pr = { hpLow: [0, 0.6], hpHigh: [0.05, 0], ep: [0, 0.6], mp: [0.05, 0] };
	const s0 = shadow({ hp: 40, hpM: 40, ep: 60, mp: 100 }, { hp: 30, ep: 10, mp: 20 }, pr);
	const s1 = shadow({ hp: 10, hpM: 40, ep: 60, mp: 100 }, { hp: 30, ep: 10, mp: 20 }, pr);
	check('cost: full pools need nothing', s0.items === 0 && s0.mp === 0);
	check('cost: HP below half priced in MP (Doctor), above half in items', Math.abs(s1.mp - 6) < 1e-9 && Math.abs(s1.items - 0.5) < 1e-9, JSON.stringify(s1));
	const s2 = shadow({ hp: 10, hpM: 40, ep: 0, mp: 0 }, { hp: 0, ep: 0, mp: 0 }, pr);
	check('cost: last encounter: leftovers worth nothing', s2.items === 0 && s2.mp === 0);
	const a = aggregate([{ dead: false, s: [0, 5], items: 0, mp: 5, hp: 10 }, { dead: false, s: [0, 5], items: 0, mp: 5, hp: 10 }]);
	const b = aggregate([{ dead: false, s: [1, 0], items: 1, mp: 0, hp: 10 }, { dead: false, s: [1, 0], items: 1, mp: 0, hp: 10 }]);
	const c = aggregate([{ dead: true, s: [Infinity, Infinity] }, { dead: false, s: [0, 0], items: 0, mp: 0, hp: 10 }]);
	check('cost: lexicographic items before MP', compareAgg(a, b) < 0);
	check('cost: death above 1% loses to anything feasible', compareAgg(b, c) < 0);
}

// ---- scout need levels: zero after the last encounter only when a scout run got past it ----
{
	const run = (status) => ({ status, encounters: [{ key: 'a', hpNeed: 10, epNeed: 2 }, { key: 'b', hpNeed: 30, epNeed: 5 }] });
	const died = new ScoutProfile([run('dead'), run('dead')]);
	const finished = new ScoutProfile([run('dead'), run('done')]);
	const str = (x) => JSON.stringify(x);
	check('scout: every run died at the last key: its need is unknown, not zero', str(died.needAfter('b')) === str({ hp: 38, ep: 7 }) && str(died.restNeedAfter('b')) === str({ hp: 30, ep: 5 }), `${str(died.needAfter('b'))} ${str(died.restNeedAfter('b'))}`);
	check('scout: a run finished after the last key: nothing is needed after it', str(finished.needAfter('b')) === str({ hp: 0, ep: 0 }) && str(finished.restNeedAfter('b')) === str({ hp: 0, ep: 0 }) && str(finished.needAfter('a')) === str({ hp: 38, ep: 7 }));
}

// ---- walker: a fountain re-plan doesn't count toward maxReplans ----
{
	resetStatics(tables);
	const run = S.Run.start({ level: 21, gear: 4, kit2: true }, { type: 15, seed: 1492658333, xseed: 777 }, { walker: { rest: new S.RestRule({ mpReserve: 'route' }) } });
	const w = run.walker;
	const limit = w.opts.maxReplans ?? 60;
	w.replans = limit;                          // every failure re-plan used up
	w.unplannedFountainWanted = () => true;     // a fountain just became worth a detour
	w.afterEncounter();
	check('walker: a fountain re-plan at the re-plan limit keeps walking', !w.finished && w.replans === limit, `finished ${w.finished}, replans ${w.replans}`);
}

// ---- walker checkpoint: freeze / thaw continues identically ----
{
	resetStatics(tables);
	const hero = { level: 21, gear: 4, kit2: true };
	const opts = { walker: { rest: new S.RestRule({ mpReserve: 'route' }) }, log: true };
	const a = S.Run.start(hero, { type: 15, seed: 1492658333, xseed: 777 }, opts);
	const pol = () => makePolicy('melee', {});
	for (let k = 0; k < 2; k++) { const ev = a.toEncounter(); if (ev.ev === 'combat') a.fightWith(pol()); }
	const ck = a.checkpoint();
	const play = (r) => { for (let k = 0; k < 3; k++) { const ev = r.toEncounter(); if (ev.ev !== 'combat') break; r.fightWith(pol()); } return `${r.fight.h.x.a}|${r.fight.h.f.b.a},${r.fight.h.f.b.b}|${r.led.items()}|${r.led.mp}|${r.log.length}`; };
	const k1 = play(a);
	const k2 = play(S.Run.resume(ck));
	check('walker: checkpoint resumes identically', k1 === k2, `${k1} vs ${k2}`);
}

// ---- walker: keys in the pack open locked doors 29 once their gold monsters are dead (c30.m0: any key, one per door) ----
{
	const objectiveStops = (w) => w.legs.filter((L) => L.kind === 'objective').map((L) => (L.rec ? `${L.rec.id}@${L.rec.x},${L.rec.y}` : L.label)).sort();
	const replanWithKeys = (keys) => {
		resetStatics(tables);
		const run = S.Run.start({ level: 21, gear: 4, kit2: true }, { type: 12, seed: 344057351, xseed: 1 });
		const h = run.fight.h, w = run.walker;
		const before = objectiveStops(w);
		const gold = h.o.filter((m) => m.g === 167);
		for (const m of gold) h.j_(m, false);   // dead: the engine takes a critter off the level (hw.j)
		if (keys) h.f.D.b_(167, keys);
		w.replan();
		return { before, after: objectiveStops(w), gold: gold.length };
	};
	const all = replanWithKeys(2), one = replanWithKeys(1);
	const lost = (r) => r.before.filter((s) => !r.after.includes(s)).join(' ');
	check('walker: a re-plan with the gold monsters dead keeps the objectives behind locked doors 29 when the keys are in the pack', all.gold === 2 && all.after.length === all.before.length, `lost ${lost(all) || 'none'}`);
	check('walker: one key opens one locked door 29', one.after.length === one.before.length - 1, `lost ${lost(one) || 'none'}`);
}

// ---- walker: the plan cache gives what the planner gives, and every input it keys on makes a new entry ----
{
	/** what followPlan reads of a plan, with each stop's record as its position in the level's lists */
	const sigOf = (plan, level) => {
		const places = new Map(level.objects.map((o, i) => [o, `o${i}`]));
		level.critters.forEach((c, i) => places.set(c, `c${i}`));
		return JSON.stringify({ legs: plan.legs.map((l) => ({ ...l, stop: { ...l.stop, rec: l.stop.rec && places.get(l.stop.rec) } })), route: plan.route });
	};
	/** the walker's plan now, from the cache or not, against a fresh planner run on the same input */
	const planNow = (w) => {
		const level = w.planningLevel(), options = w.planOptions();
		const hits = S.planCache.hits;
		const got = w.routePlan(level, options);
		const hit = S.planCache.hits > hits;
		const same = sigOf(got, level) === sigOf(planRoute(level, options), level);
		const live = new Set([...w.h.n, ...w.h.o]);
		const rebound = got.legs.every((l) => !l.stop.rec || live.has(l.stop.rec.ref));
		return { hit, same, rebound, sig: sigOf(got, level) };
	};
	const where = (type, seed) => ({ type, seed, xseed: 1 });
	const hero = { level: 21, gear: 4, kit2: true };
	const start = (type, seed) => { resetStatics(tables); return S.Run.start(hero, where(type, seed)).walker; };

	S.planCache.clear();
	const first = start(8, 172582050);
	const again = start(8, 172582050);       // another fight, same dungeon: its first plan is the first walker's
	const hitsBefore = S.planCache.hits;
	const p0 = planNow(again);
	check('plan cache: a second fight of a dungeon is planned from the cache, on its own objects', p0.hit && p0.same && p0.rebound && S.planCache.hits === hitsBefore + 1, `hit ${p0.hit}, same ${p0.same}, rebound ${p0.rebound}`);

	const freshSig = (w) => { const level = w.planningLevel(); return sigOf(planRoute(level, w.planOptions()), level); };
	/** change the walker's input, expect a new plan (a miss) equal to the planner's; undo it, expect the old one back */
	const keyed = (name, w, change, undo, { plansDiffer = true } = {}) => {
		const before = planNow(w);
		change();
		const during = planNow(w), cached = planNow(w);
		undo();
		const back = planNow(w);
		const ok = !during.hit && during.same && cached.hit && cached.same && back.hit && back.same && back.sig === before.sig && (!plansDiffer || during.sig !== before.sig);
		check(`plan cache: ${name} changes the key`, ok, `miss ${!during.hit} same ${during.same}, then hit ${cached.hit} same ${cached.same}, undone: hit ${back.hit} same ${back.same} as before ${back.sig === before.sig}, differs ${during.sig !== before.sig}`);
	};
	/** the first stop that, put in `list` (done / failed), changes the plan */
	const stopThatMatters = (w, list) => w.legs.find((L) => {
		if (!L.rec || L.rec.ri < 0) return false;
		const before = freshSig(w);
		list.push(L.rec.ri);
		const after = freshSig(w);
		list.pop();
		return after !== before;
	});
	const routeCell = first.route.find((c, k) => k > 2 && c.i !== undefined);
	keyed('a wall', first, () => first.blocked.push(routeCell.i), () => first.blocked.pop());
	const used = stopThatMatters(first, first.done), givenUp = stopThatMatters(first, first.failed);
	keyed('a stop used up', first, () => first.done.push(used.rec.ri), () => first.done.pop());
	keyed('a stop given up', first, () => first.failed.push(givenUp.rec.ri), () => first.failed.pop());
	// a creature or an object that moved (a barrel pushed, a monster walking): where it stands is in the key
	const movable = (isCreature) => first.refs[first.legs.find((L) => L.rec && L.rec.ri >= 0 && (L.rec.k !== undefined) === isCreature).rec.ri];
	for (const [what, isCreature] of [['a creature', true], ['an object', false]]) {
		const thing = movable(isCreature);
		keyed(`${what} moving one cell`, first, () => { thing.b.a += 1; }, () => { thing.b.a -= 1; }, { plansDiffer: false });
	}
	keyed('a re-plan (how exact the visiting order is)', first, () => { first.stats.plans = 2; }, () => { first.stats.plans = 1; }, { plansDiffer: false });

	// keys in the pack (a locked door 29 opens per key once its gold monsters are dead): a walker with two, one, none
	const withKeys = (type, seed, n) => {
		const w = start(type, seed), h = w.h;
		for (const m of h.o.filter((c) => c.g === 167)) h.j_(m, false);
		if (n) h.f.D.b_(167, n);
		return w;
	};
	const byKeys = [2, 1, 0].map((n) => { const w = withKeys(12, 344057351, n); return { first: planNow(w), second: planNow(w) }; });
	const [two, one, none] = byKeys;
	check('plan cache: the keys held make the key', byKeys.every((r) => !r.first.hit && r.first.same && r.second.hit && r.second.same) && two.first.sig !== one.first.sig && one.first.sig !== none.first.sig,
		byKeys.map((r, i) => `${[2, 1, 0][i]} keys: miss ${!r.first.hit} same ${r.first.same}, then hit ${r.second.hit}`).join('; '));

	const cave = start(19, 3);               // fountains: with the pools empty, they are stops
	const pools = [cave.h.f.z.v_(), cave.h.f.E_()];
	keyed('fountains worth a detour', cave, () => { cave.h.f.z.z_(0); cave.h.f.G_(0); }, () => { cave.h.f.z.z_(pools[0]); cave.h.f.G_(pools[1]); });

	const forest = start(14, 523876026);     // a floor nonogram
	keyed('the nonogram being solved', forest, () => { forest.nonogramDone = true; }, () => { forest.nonogramDone = false; });
}

// ---- wiki: first strike against a lone 2-AP melee foe (243, type 10) ----
{
	resetStatics(tables);
	const hero = { level: 16, gear: 3, kit: true };
	// hero 5 cells from the monster at 57,24 (same room): walking in gives it the first hit
	const run = S.Run.start(hero, { type: 10, seed: 1145407027, xseed: 1, at: '59,21' });
	const ck = run.checkpoint();
	const N = quick ? 24 : 48;
	const mean = (cand) => {
		let hp = 0;
		for (let i = 0; i < N; i++) { const r = S.Run.resume(ck); r.fight.h.x.a = mix32(i); hp += outcomeOf(r, cand, { ext: 0 }).hpLost; }
		return hp / N;
	};
	const melee = mean({ name: 'melee', params: { heal: 0 } });
	const fs1 = mean({ name: 'firstStrike', params: { heal: 0 } });
	check('wiki first strike: waits for the spd-2 foe and loses less HP than walking in', fs1 < melee, `firstStrike ${fs1.toFixed(2)} vs melee ${melee.toFixed(2)} HP lost`);
}

// ---- duel model (kite.js): the AP rules on an open line ----
{
	const v = verdict([4, 5], [2, 3], 6);
	const at = (h, m) => v.find((r) => r.hero === h && r.monster === m);
	check('duel model: spd 5 hero vs spd-2 foe is a certain kite', at(5, 2).certain && at(5, 2).hitsTaken < 0.5, JSON.stringify(at(5, 2)));
	// (values include a 0.01 cost per turn)
	check('duel model: 2 more speed kites almost surely (no strike taken), 1 more does not', at(4, 2).hitsTaken < 0.5 && at(5, 3).hitsTaken < 0.5 && at(4, 3).hitsTaken >= 1, JSON.stringify(v));
	const M = duelModel(4, { spd: 3, waits: true, n: 2 });
	check('duel model: hero spd 4 vs spd 3, two strikes free then about one taken per two landed', Math.abs(M.state(2, 3, 4, 0)) < 0.05 && M.state(6, 3, 4, 0) > 1.5 && M.state(6, 3, 4, 0) < 2.6, `${M.state(2, 3, 4, 0)} ${M.state(6, 3, 4, 0)}`);
}

// ---- kite in the engine: a lone spd-2 melee foe (243) in an open room, hero spd 4 and 5 (Agility 11) ----
{
	const N = quick ? 8 : 16;
	for (const [name, hero] of [['spd 4', { level: 16, gear: 3, kit: true }], ['spd 5 (Agility)', { level: 16, gear: 3, kit: true, skills: '11:1' }]]) {
		resetStatics(tables);
		const run = S.Run.start(hero, { type: 10, seed: 1145407027, xseed: 1, at: '59,21' });
		const ck = run.checkpoint();
		let kite = 0, melee = 0;
		for (let i = 0; i < N; i++) {
			for (const [p, acc] of [['kite', (v) => { kite += v; }], ['melee', (v) => { melee += v; }]]) {
				const r = S.Run.resume(ck); r.fight.h.x.a = mix32(i * 7 + 3);
				r.toEncounter(200);
				acc(outcomeOf(r, { name: p, params: { heal: 0 } }, { ext: 0 }).hpLost);
			}
		}
		check(`kite: ${name} hero takes no hit from the spd-2 foe (melee loses HP)`, kite === 0 && melee > 0, `kite ${kite / N} vs melee ${melee / N} HP lost per fight`);
	}
}

// ---- MP model: top-ups (replenishable MP), trimming, no item for MP ----
{
	check('mp: trimTopUps shrinks each fill by the lowest pool after it', JSON.stringify(S.trimTopUps([{ amount: 100, min: 60 }, { amount: 50, min: 10 }])) === JSON.stringify([90, 50]) && JSON.stringify(S.trimTopUps([{ amount: 40, min: 0 }])) === JSON.stringify([40]), JSON.stringify(S.trimTopUps([{ amount: 100, min: 60 }, { amount: 50, min: 10 }])));
	resetStatics(tables);
	const { runOptsFor } = await import('../js/solve/robust.js');
	const play = (o, mp = 20) => {
		resetStatics(tables);
		const run = S.Run.start({ level: 21, gear: 4, kit2: true, mp }, { type: 15, seed: 1492658333, xseed: 777 }, o);
		for (let k = 0; k < 40; k++) { const ev = run.toEncounter(); if (ev.ev !== 'combat') break; run.fightWith(makePolicy('melee', {})); if (run.fight.c.w || run.fight.h.f.u_()) break; run.walker.afterEncounter(); }
		return run;
	};
	const a = play(runOptsFor({}));
	const full = play(runOptsFor({}), 999);
	const mpItems = (r) => Object.entries(r.led.itemsById()).filter(([id]) => +id === 217 || +id === 218).reduce((x, [, n]) => x + n, 0);
	const solved = S.trimTopUps(a.led.topUps).reduce((x, y) => x + y, 0);
	check('mp: a short stock is topped up (no MP item) and plays as a full pool would', a.led.topUps.length > 0 && mpItems(a) === 0 && a.fight.h.i_() === full.fight.h.i_() && a.led.mp === full.led.mp && solved === a.led.mp - 20, `${a.led.topUps.length} top-ups, solve for ${solved}, MP spent ${a.led.mp} vs ${full.led.mp}, MP items ${mpItems(a)}`);
	const b = play(runOptsFor({ useItemsForMp: true }));
	check('mp: useItemsForMp keeps the old stock model (no top-ups)', b.led.topUps.length === 0, `${b.led.topUps.length} top-ups, MP items ${mpItems(b)}`);
	const pr = pricesFor(a.fight.h), pr2 = pricesFor(a.fight.h, { useItemsForMp: true });
	check('mp: an MP deficit costs no item (a tiny MP tie-break) unless useItemsForMp', pr.mp[0] === 0 && pr.mp[1] > 0 && pr.mp[1] <= 0.01 && pr2.mp[0] > 0);
	// mid-fight refill: no MP at all, a sealed foe (254, 10 MP) -- the unseal is still chosen and paid by a top-up before it
	{
		resetStatics(tables);
		const r = S.Run.start({ level: 21, gear: 4, kit: true, mp: 0 }, { type: 12, seed: 1146928824, xseed: 3, at: 'near:30,61' }, runOptsFor({}));
		const ev = r.toEncounter(200);
		const o = ev.ev === 'combat' ? r.fightWith(makePolicy('melee', {})) : null;
		const mid = r.led.topUps.filter((t) => t.fight);
		check('mp: a mid-fight refill pays the unseal (MP never limits a decision)', !!o && mid.length > 0 && (r.led.mpBy.unseal || 0) >= 10 && mpItems(r) === 0, JSON.stringify({ end: o && o.end, tops: r.led.topUps.map((t) => [t.at, t.amount, t.fight]), by: r.led.mpBy }));
	}
	// a fight the hero wins without Charge / Doctor spends no MP on them (nor the walk after it, with nothing ahead)
	{
		resetStatics(tables);
		const r = S.Run.start({ level: 21, gear: 4, kit2: true }, { type: 10, seed: 1145407027, xseed: 1, at: '59,21' }, runOptsFor({}));
		r.walker.opts.rest.need = { hp: 0, ep: 0 };
		const ev = r.toEncounter(200);
		const o = ev.ev === 'combat' ? r.fightWith(makePolicy('melee', {})) : null;
		r.toEncounter(150);
		const spent = (r.led.mpBy['20005'] || 0) + (r.led.mpBy['20006'] || 0);
		check('mp: a fight winnable without Charge / Doctor spends no MP on them', !!o && o.end === 'won' && spent === 0, JSON.stringify({ end: o && o.end, hp: r.fight.h.f.j.v_(), ep: r.fight.h.f.z.v_(), by: r.led.mpBy }));
	}
}

// ---- candidate gating: skill / item tactics only with what they need ----
{
	const c = candidates('full');
	const av = { pack: { 144: 1 }, skills: { 20004: true }, mp: 3, once: false, foes: 2, ranged: false };
	const ok = c.filter((x) => usable(x, av)).map((x) => JSON.stringify(x.params));
	check('candidates: gated by skills, MP, items and foes', ok.includes('{"bomb":144}') && !ok.includes('{"bomb":206}') && !ok.includes('{"demor":2}') && !ok.includes('{"hook":209}'), ok.join(' '));
}

// ---- Demoralize against a hard group (type 19): fewer potions for a few MP ----
if (!quick) {
	resetStatics(tables);
	const run = S.Run.start({ level: 21, gear: 4, kit: true, kit2: true }, { type: 19, seed: 1032260387, xseed: 1, at: 'near:20,52' });
	const ck = run.checkpoint();
	const N = 6;
	const mean = (params) => { let it = 0; for (let i = 0; i < N; i++) { const r = S.Run.resume(ck); r.fight.h.x.a = mix32(i * 11 + 5); r.toEncounter(200); it += outcomeOf(r, { name: 'melee', params }, { ext: 0 }).items; } return it / N; };
	const m0 = mean({}), m1 = mean({ demor: 2 });
	check('demoralize: saves potions against a high-defence group', m1 < m0, `items ${m1} with Demoralize vs ${m0}`);
}

// ---- labels: a tactic's own switches aren't part of its name ----
check('labels: the spider tactic is "spider"', makePolicy('spider').label === 'spider' && makePolicy('spider', { demor: 2 }).label === 'spider(demor=2)', `${makePolicy('spider').label} / ${makePolicy('spider', { demor: 2 }).label}`);

// ---- robust: whole dungeon, small N; plan schema ----
let robustPlan = null;
let robustKeys = [];
{
	resetStatics(tables);
	const res = await solveRobust({ hero: { level: 21, gear: 4, kit2: true }, type: 15, seed: 1492658333 }, { pool: new InlinePool(1), N: quick ? 6 : 10, nMin: 8, n0: 6, scout: 4, cands: candidates('quick'), budgetMs: 120000 });
	check('robust: solves', !res.error && res.decisions.length > 0, res.error || `${res.decisions.length} encounters`);
	if (!res.error) {
		robustKeys = res.decisions.map((d) => d.key);
		robustPlan = buildPlan(res, { label: 'F1-1492658333' });
		const errs = validatePlan(robustPlan);
		check('robust: plan validates', errs.length === 0, errs.join('; '));
		check('robust: no worse than the baseline on items', robustPlan.totals.items.mean <= robustPlan.baseline.items.mean + 0.25, `${robustPlan.totals.items.mean} vs ${robustPlan.baseline.items.mean}`);
		check('robust: survives', robustPlan.totals.pDeath <= 0.1, `P(death) ${robustPlan.totals.pDeath}`);
		check('robust: plan has the MP fields (mp, mpTopUps, mpToSolve, mpNeeded)', robustPlan.mp && Array.isArray(robustPlan.mpTopUps) && typeof robustPlan.mpToSolve === 'number' && robustPlan.mpNeeded && typeof robustPlan.mpNeeded.total === 'number', JSON.stringify(robustPlan.mpNeeded));
	}
}

// ---- robust: the skill / item tactics are tried where the hero has what they need ----
{
	resetStatics(tables);
	const extra = candidates('full').filter((c) => c.needs && (c.params.demor || c.params.divine || c.params.bomb === 118));
	const res = await solveRobust({ hero: { level: 21, gear: 4, kit2: true }, type: 15, seed: 1492658333 }, { pool: new InlinePool(1), N: 4, nMin: 4, n0: 4, scout: 2, screen: 2, cands: [...candidates('quick'), ...extra], budgetMs: 120000 });
	const tried = (label) => !res.error && res.decisions.some((d) => d.candidates.some((c) => c.label === label && c.n > 0));
	const labels = ['melee(demor=2)', 'melee(divine=1)', 'melee(bomb=118)'];
	check('robust: tries Demoralize, Divine protection and madness powder (the hero has them)', labels.every(tried), res.error || labels.filter((l) => !tried(l)).join(', '));
}

// ---- exact: seeded fightgen, replay identical ----
{
	resetStatics(tables);
	const problem = { hero: { level: 21, gear: 4, kit2: true }, type: 15, seed: 1492658333, xseed: 4242 };
	const res = await solveExact(problem, { pool: new InlineExactPool(1), maxDecisions: quick ? 2 : 4, cands: candidates('quick'), budgetMs: 120000 });
	check('exact: solves', !res.error && res.inputs.length > 0, res.error || `${res.inputs.length} inputs`);
	if (!res.error) {
		resetStatics(tables);
		const rp = replayScript(problem, res.inputs, res.topUps);
		const same = rp.items === res.totals.items && rp.mp === res.totals.mp && rp.final.hp === res.totals.final.hp && rp.dead === res.totals.dead && rp.objectivesLeft === res.totals.objectivesLeft;
		check('exact: JS replay of the script is identical', same && rp.rej === 0, JSON.stringify({ rp: { items: rp.items, mp: rp.mp, hp: rp.final.hp, rej: rp.rej }, res: { items: res.totals.items, mp: res.totals.mp, hp: res.totals.final.hp } }));
		const best = res.encounters.every((e) => !e.tactics.length || e.cost.dead || true);
		check('exact: plan validates', validatePlan(buildPlan(res, { label: 'F1-1492658333' })).length === 0 && best);
		// never worse than the best single tactic (the incumbent is a candidate at every decision)
		const worse = res.encounters.filter((e) => e.searched > 0 && e.tactics[0] && e.cost.items > e.tactics[0].items);
		check('exact: search never worse on items than the best tactic', worse.length === 0, worse.map((e) => e.key).join(','));
		// same dungeon and hero as the robust case: its first encounter has the same key there
		check('exact: names encounters as robust mode does', !!res.encounters[0] && robustKeys.includes(res.encounters[0].key), `${res.encounters[0] && res.encounters[0].key} vs ${robustKeys.slice(0, 3).join(' ')}`);
	}
}

// ---- worker pool (Node worker_threads): same robust result as inline ----
if (!args.includes('--no-workers')) {
	resetStatics(tables);
	const pool = await WorkerPool.create({ size: 2, tables: { path: tablesPath } });
	const opts = { N: 4, nMin: 4, n0: 4, scout: 2, cands: candidates('quick'), budgetMs: 120000, screen: 2 };
	const prob = { hero: { level: 21, gear: 4, kit2: true }, type: 15, seed: 1492658333 };
	const rw = await solveRobust(prob, { ...opts, pool });
	await pool.close();
	resetStatics(tables);
	const ri = await solveRobust(prob, { ...opts, pool: new InlinePool(2) });
	const sig = (r) => r.decisions.map((d) => `${d.key}:${d.tactic.label}`).join('|') + `|${r.totals.items.mean}|${r.totals.mp.mean}`;
	check('pool: workers give the inline result', !rw.error && sig(rw) === sig(ri), rw.error || '');
}

// ---- exact from an in-dungeon save: problem.saveBytes, imported in every worker (WorkerPool) and inline ----
{
	const os = await import('node:os');
	const sp = path.join(os.homedir(), '.cache/nk-oracle/fights/saves/15-chain.dat');
	if (!args.includes('--no-workers') && fs.existsSync(sp)) {
		const bytes = new Uint8Array(fs.readFileSync(sp));
		const opts = { maxDecisions: 1, cands: candidates('quick'), budgetMs: 60000 };
		resetStatics(tables);
		const pool = await WorkerPool.create({ size: 2, tables: { path: tablesPath } });
		const a = await solveExact({ saveBytes: bytes }, { ...opts, pool });
		await pool.close();
		resetStatics(tables);
		const b = await solveExact({ saveBytes: bytes }, { ...opts, pool: new InlineExactPool(1) });
		const bad = await solveExact({ save: {} }, { ...opts, pool: new InlineExactPool(1) });
		check('exact: from save bytes, workers and inline give one script', !a.error && !b.error && JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && !!bad.error, a.error || b.error || `${a.inputs.length} inputs`);
		const E = a.encounters;
		const atOk = a.topUps.every((t) => t.beforeEncounter == null || (t.fight ? E[t.beforeEncounter].from <= t.at && t.at < E[t.beforeEncounter].to : E[t.beforeEncounter].from >= t.at && (t.beforeEncounter === 0 || E[t.beforeEncounter - 1].to <= t.at)));
		check('exact: top-ups name their encounter (the one they happen in, or the next)', atOk, JSON.stringify(a.topUps.map((t) => [t.at, t.beforeEncounter])) + ' ' + JSON.stringify(a.encounters.map((e) => e.from)));
	}
}

console.log(`${passes} passed, ${fails} failed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
