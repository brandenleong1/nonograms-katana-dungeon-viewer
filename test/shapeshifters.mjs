// Shapeshifters: NPCs whose species has bw.N0, which the game turns into a monster when you talk to them (c30, the NPC
// talk branch). Quest 41 (Once Upon a Forest, epilogue) puts eight of them on F2; the map must not show them as NPCs.
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

// a new game: the wandering NPC on 3B-209753775 (species 400) is an ordinary NPC
vj0.i2 = fresh;
const wanderer = kindsOf(generate(7, 209753775)).find(([id]) => id === 400);
check('3B-209753775\'s wandering NPC 400 is an NPC', wanderer && wanderer[1] === 'npc', wanderer && wanderer[1]);

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
