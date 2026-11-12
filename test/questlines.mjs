// The questlines of the "Your progress" editor (js/ui/questlines.js): every quest the generator reads is on a slider,
// every slider position round-trips through a real profile, and a position changes the dungeons it says it does.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/questlines.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables } from '../js/gen/index.js';
import { freshProfile, withProgress } from '../js/gen/progress-spec.js';
import { npcQuests, explain } from '../js/gen/progress-reads.js';
import { buildQuestlines, partStates, positionOf, statesAt, positionName, summarize, describeTypes, partTitle } from '../js/ui/questlines.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
initTables(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tables.json'), 'utf8')));
const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/names.json'), 'utf8'));
const fresh = freshProfile();
const lines = buildQuestlines(fresh, names);
const byName = new Map(lines.map((l) => [l.name, l]));

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

// what the questlines cover
const onASlider = new Set(lines.flatMap((l) => l.parts.map((p) => p.id)));
const missing = npcQuests(fresh).map((q) => q.id).filter((id) => !onASlider.has(id));
check('every quest with a person is on a slider', !missing.length, `missing ${missing.join(', ')}`);
for (const id of [23, 25, 27, 30, 46, 48, 51, 62, 63, 66, 73, 74, 75]) check(`quest ${id} (read directly) is on a slider`, onASlider.has(id));
check('Once Upon a Forest has 14 parts', byName.get('Once Upon a Forest')?.parts.length === 14);
check("Pharaoh's Lost Tomb has 12 parts", byName.get("Pharaoh's Lost Tomb")?.parts.length === 12);
check('questlines that change no dungeon are left out', !byName.has('Puzzle of the Day') && !byName.has('Build the Guild'));
check('every questline changes some dungeon', lines.every((l) => l.types.map.length + l.types.loot.length > 0));

// positions: the states at each position, through a real profile and back
for (const line of lines) {
	for (let pos = 0; pos <= 2 * line.parts.length; pos++) {
		const want = statesAt(line, pos);
		const quests = Object.fromEntries(line.parts.map((p, i) => [p.id, want[i]]));
		const got = partStates(withProgress(fresh, { quests }), line);
		check(`${line.name} at ${pos}`, positionOf(got) === pos && got.join() === want.join(), `${positionName(line, pos)} read back as ${got.join(' ')}`);
	}
}
check('parts out of order have no position', positionOf(['done', 'none', 'active']) === -1);

// a position does what its card says: part 3 of Once Upon a Forest in progress brings 3C's mini-boss
const forest = byName.get('Once Upon a Forest');
const at = (pos) => withProgress(fresh, { quests: Object.fromEntries(forest.parts.map((p, i) => [p.id, statesAt(forest, pos)[i]])), I0: 1 << 28 });
check('Once Upon a Forest part 3 in progress: a mini-boss in 3C', explain(at(5), 8).some((r) => r.kind === 'mini'));
check('Once Upon a Forest part 3 done: no mini-boss in 3C', !explain(at(6), 8).some((r) => r.kind === 'mini'));
check('the card lists 3C for it', forest.types.map.includes(8));

// words
check('summary', summarize(['done', 'done', 'active', 'none']) === 'Parts 1–2 done · part 3 in progress · part 4 not started', summarize(['done', 'done', 'active', 'none']));
check('position names', positionName(forest, 0) === 'Not started' && positionName(forest, 5) === 'Part 3 in progress' && positionName(forest, 6) === 'Part 3 done' && positionName(forest, 28) === 'All 14 parts done');
check('dungeon lists', describeTypes([5, 8, 15, 16, 17, 18, 23, 24]) === '2C, 3C, F1–F4, EA, EB', describeTypes([5, 8, 15, 16, 17, 18, 23, 24]));
check('part titles', partTitle(30, names) === 'Once Upon a Forest, part 3' && partTitle(23, names) === 'Dragon teeth');

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
