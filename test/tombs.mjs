// Tomb routes need Thoth's usable Secret name before a boss fight.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { zw, vj0 } from '../js/gen/statics.js';
import { applyProgress } from '../js/gen/progress-spec.js';
import { generate } from '../js/gen/generate.js';
import { planRoute, objectives } from '../js/plan/planner.js';
import { Run, packCount } from '../js/solve/sim.js';
import { makePolicy } from '../js/solve/policies.js';
import { candidateInputs } from '../js/solve/exact.js';

const tables = JSON.parse(fs.readFileSync(new URL('../data/tables.json', import.meta.url)));
const options = { rw: (id) => zw.Q.get(id), bw: (id) => zw.R.get(id), pwOf: (t) => zw.M[t], patterns: zw.O, tiles: zw.u };
const examples = [[23, 941862187], [24, 875002336], [25, 1305834018]];

for (const [type, seed] of examples) {
	for (const done of [false, true]) {
		resetStatics(tables);
		const quests = { 73: 'done', 74: 'done', 75: 'done' };
		quests[type + 50] = done ? 'done' : 'active';
		applyProgress(vj0.i2, { quests });
		const level = generate(type, seed);
		assert(!objectives(level, { ...options, pw: zw.M[type] }).some((o) => o.rec?.id === 621));
		for (const exactLimit of [0, 16]) {
			const plan = planRoute(level, { ...options, exactLimit, tombQuestDone: done });
			const boss = plan.legs.findIndex((l) => zw.R.get(l.stop.rec?.id)?.m0);
			const thoth = plan.legs.findIndex((l) => l.stop.rec?.id === 621);
			if (done) {
				assert(thoth >= 0 && boss > thoth, `${type}: Thoth before boss`);
				assert.match(plan.legs[boss].stop.label, /Use the Secret name/);
			} else {
				assert.equal(boss, -1);
				assert(plan.warnings.some((s) => s.includes(`finish part ${type - 22}`)));
			}
		}
		if (done) {
			level.critters = level.critters.filter((c) => c.id !== 621);
			const held = planRoute(level, { ...options, tombQuestDone: true, heldSecretNames: 1 });
			assert(held.legs.some((l) => zw.R.get(l.stop.rec?.id)?.m0));
			const missing = planRoute(level, { ...options, tombQuestDone: true });
			assert(!missing.legs.some((l) => zw.R.get(l.stop.rec?.id)?.m0));
			assert(missing.warnings.some((s) => s.includes('Thoth')));
		}
	}
	resetStatics(tables);
	const fresh = planRoute(generate(type, seed), options);
	assert(!fresh.legs.some((l) => zw.R.get(l.stop.rec?.id)?.m0), 'no boss fight before starting the quest');
	assert(fresh.warnings.some((s) => s.includes(`finish part ${type - 22}`)));
}

// The warning depends on the actual path before Thoth, including incidental objective visits.
for (const [seed, crosses] of [[941862187, false], [1467984938, true]]) {
	resetStatics(tables);
	applyProgress(vj0.i2, { quests: { 73: 'done', 74: 'done', 75: 'done' } });
	const level = generate(23, seed);
	for (const exactLimit of [0, 16]) {
		const plan = planRoute(level, { ...options, exactLimit, tombQuestDone: true });
		assert.equal(plan.warnings.some((s) => s.includes('evade or slow')), crosses, `${seed}: warn only on a boss-room crossing`);
	}
	const carried = planRoute(level, { ...options, tombQuestDone: true, heldSecretNames: 1 });
	assert(!carried.warnings.some((s) => s.includes('evade or slow')), 'a carried name needs no evade warning');
}

// Use an engine fight at the boss, with a synthetic completed quest and a carried name.
resetStatics(tables);
const run = Run.start({ level: 21, gear: 4, kit2: true, quests: '73:128' }, { type: 23, seed: 941862187, xseed: 1, at: '24,68' });
assert(!run.error);
const fight = run.fight;
const boss = fight.h.o.find((c) => c.a.a === 620);
const policy = makePolicy('melee', {});
policy.begin(fight);
const before = packCount(fight.h, 306);
assert.equal(run.walker.routeNeeds().invincible, 0, 'a carried name makes the boss beatable');
assert(!run.walker.legs.some((l) => l.rec?.id === 621), 'a carried name needs no Thoth detour');
assert(candidateInputs(fight, []).some((i) => i.t === 'item' && i.id === 306), 'exact search considers the name');
assert(!candidateInputs(fight, []).some((i) => i.t === 'unseal' && i.x === boss.b.a && i.y === boss.b.b), 'no impossible mental power payment');
const input = policy.secretNameInput(policy.context(fight));
assert.equal(input?.id, 306);
const context = policy.context(fight);
for (const ap of [0, -1]) {
	assert.equal(policy.secretNameInput({ ...context, pools: { ...context.pools, ap } }), null, 'no name use without action points');
}
applyProgress(vj0.i2, { quests: { 73: 'active' } });
assert.equal(policy.secretNameInput(policy.context(fight)), null, 'an unfinished quest blocks a carried name');
applyProgress(vj0.i2, { quests: { 73: 'done' } });
const bossWaypoint = { bump: 'cr', ri: run.walker.ref(boss), leg: 0 };
const walkerInput = run.walker.walkBump(bossWaypoint, run.walker.heroCell(), 1);
assert.deepEqual(walkerInput, input, 'the walker uses the carried name at its boss stop');
const result = fight.step(walkerInput);
assert.equal(result.rej, null);
assert(boss.s_(16384), 'the engine removes boss immunity');
assert.equal(packCount(fight.h, 306), before - 1);
assert.equal(policy.secretNameInput(policy.context(fight)), null, 'do not use a second name');
assert.notEqual(run.walker.walkBump(bossWaypoint, run.walker.heroCell(), 1)?.id, 306, 'the walker does not use a second name');
assert(!run.walker.legs.some((l) => l.rec?.id === 621), 'a weakened boss needs no Thoth detour');

resetStatics(tables);
const thothRun = Run.start({ level: 21, gear: 4, kit: true, quests: '73:128' }, { type: 23, seed: 941862187, xseed: 1, at: '8,6' });
const thothFight = thothRun.fight;
const thoth = thothFight.h.o.find((c) => c.a.a === 621);
assert.equal(packCount(thothFight.h, 306), 0);
assert(thothRun.walker.legs.some((l) => l.rec?.id === 621));
thoth.A_(11);
for (let k = 0; k < 3 && packCount(thothFight.h, 306) === 0; k++) {
	assert.equal(thothFight.step({ t: 'tap', x: thoth.b.a, y: thoth.b.b }).rej, null);
}
assert.equal(packCount(thothFight.h, 306), 1, 'Thoth gives a usable name on surrender');
thothRun.walker.plan();
assert(!thothRun.walker.legs.some((l) => l.rec?.id === 621), 'replanning after surrender keeps the carried name');
console.log('Tomb route and Secret name checks passed');
