// Shapeshifters: people the game turns into a monster when you talk to them (c30, the NPC talk branch). Two kinds:
// NPCs whose species has bw.N0 (quest 41, Once Upon a Forest's epilogue, puts eight on F2), and wandering merchants the
// generator tags 1000 instead of 1001 (x30.P: a 12% roll on 3B-4C, F3, EB and EC once you have traded 3 times).
// The map must not show either as an NPC.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/shapeshifters.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables, vj0, zw } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { freshProfile, withProgress } from '../js/gen/progress-spec.js';
import { critterKind } from '../js/view/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
initTables(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tables.json'), 'utf8')));

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};
const kindsOf = (level) => level.critters.map((c) => [c.id, critterKind(c, zw.R.get(c.id))]);

// F2-866130635 with quest 41 active: the quest's own character 434 and its seven lookalikes 435..441
const fresh = freshProfile();
vj0.i2 = withProgress(fresh, { quests: { 41: 'active' } });
const quest = kindsOf(generate(16, 866130635));
const shifters = quest.filter(([, k]) => k === 'shapeshifter').map(([id]) => id).sort((a, b) => a - b);
check('F2-866130635 with quest 41 shows eight shapeshifters, 434..441', shifters.join() === '434,435,436,437,438,439,440,441', shifters.join());
check('none of them is shown as an NPC', !quest.some(([id, k]) => id >= 434 && id <= 441 && k === 'npc'));

// 3 trades with merchants: 3B-1063934245's wandering merchant (species 405 at 10,51) is a fake, tagged 1000
vj0.i2 = withProgress(fresh, { stats: { x: 3 } });
const fake = generate(7, 1063934245).critters.find((c) => c.k === 0 && c.x === 10 && c.y === 51);
check('3B-1063934245 after 3 trades: the merchant at 10,51 is tagged 1000', fake && fake.id === 405 && fake.h === 1000, fake && `${fake.id} h=${fake.h}`);
check('3B-1063934245 after 3 trades: that merchant is a shapeshifter', fake && critterKind(fake, zw.R.get(fake.id)) === 'shapeshifter');

// a new game: the wandering NPC on 3B-209753775 (species 400) is an ordinary NPC
vj0.i2 = fresh;
const wanderer = kindsOf(generate(7, 209753775)).find(([id]) => id === 400);
check('3B-209753775\'s wandering NPC 400 is an NPC', wanderer && wanderer[1] === 'npc', wanderer && wanderer[1]);

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
