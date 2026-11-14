// The questlines of the "Your progress" editor (js/ui/questlines.js): every quest the generator reads is on a slider,
// every slider position round-trips through a real profile, and a position changes the dungeons it says it does. The
// "Mark all quests done / bosses beaten" buttons (js/ui/progress-panel.js) put every slider at its end and every boss
// beaten, keep the user's other edits, change nothing the second time, and give dungeons the generator can build.
// Quest 27 ("Once Upon a ...") is part 1 of Once Upon a Forest, as the game files it, and no text shows the ellipsis;
// effects read "Done: Unlocks <quest> (4A)", with the quest as its own piece (shown in bold).
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/questlines.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables, vj0 as V } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { freshProfile, withProgress, readProgress } from '../js/gen/progress-spec.js';
import { npcQuests, explain, bossBits, MINI } from '../js/gen/progress-reads.js';
import { buildQuestlines, partStates, positionOf, statesAt, positionName, summarize, describeTypes, partTitle, LISTED_UNDER } from '../js/ui/questlines.js';
import { ProgressEdits, markQuestsDone, markBossesBeaten, markedText } from '../js/ui/progress-panel.js';

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
check('Once Upon a Forest has 15 parts, quests 27 to 41', byName.get('Once Upon a Forest')?.parts.map((p) => p.id).join() === Array.from({ length: 15 }, (_, i) => 27 + i).join());
check('no questline is called "Once Upon a ..."', !lines.some((l) => /\.\.\.|…/.test(l.name)), lines.map((l) => l.name).join(', '));
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

// a position does what its card says: part 4 of Once Upon a Forest in progress (2C's mini-boss beaten) brings 3C's
// mini-boss, and part 1 in progress brings 2C's
const forest = byName.get('Once Upon a Forest');
const at = (pos, I0 = 1 << 28) => withProgress(fresh, { quests: Object.fromEntries(forest.parts.map((p, i) => [p.id, statesAt(forest, pos)[i]])), I0 });
check('Once Upon a Forest part 4 in progress: a mini-boss in 3C', explain(at(7), 8).some((r) => r.kind === 'mini'));
check('Once Upon a Forest part 4 done: no mini-boss in 3C', !explain(at(8), 8).some((r) => r.kind === 'mini'));
check('Once Upon a Forest part 1 in progress: a mini-boss in 2C', explain(at(1, 0), 5).some((r) => r.kind === 'mini'));
check('the card lists 2C and 3C for it', forest.types.map.includes(5) && forest.types.map.includes(8));

// quest 27 is chapter 1 of Once Upon a Forest in the game's own data: listed under quest 28's title (kj0.q = 28's kj0.c),
// chapter number kj0.n 1 where 28 is 2, and 28 can only start once 27 is done (its start condition H: quest 27 done)
for (const [id, under] of Object.entries(LISTED_UNDER).map(([a, b]) => [+a, b])) {
	const q = fresh.Y0_(id), owner = fresh.Y0_(under);
	check(`quest ${id} is filed under quest ${under}'s title`, q.q !== 0 && q.q === owner.c, `q ${q.q}, ${under}'s title ${owner.c}`);
	check(`quest ${id} is the chapter before quest ${under}`, q.n === owner.n - 1, `chapters ${q.n}, ${owner.n}`);
	check(`quest ${under} starts once quest ${id} is done`, owner.H && owner.H.G === id);
}
check('no other quest is filed under another title', fresh.k.every((q) => !q.q || q.a in LISTED_UNDER), fresh.k.filter((q) => q.q && !(q.a in LISTED_UNDER)).map((q) => q.a).join());

// no shown text has an ellipsis; effect texts start with a capital; unlocks read "Unlocks <quest> (dungeon)"
const shownTexts = lines.flatMap((l) => [l.name, ...l.parts.flatMap((p) => [partTitle(p.id, names), ...p.effects.map((e) => e.text)]),
	...Array.from({ length: 2 * l.parts.length + 1 }, (_, pos) => positionName(l, pos))]);
check('no shown text has an ellipsis', !shownTexts.some((t) => /\.\.\.|…/.test(t)), shownTexts.filter((t) => /\.\.\.|…/.test(t)).join(' | '));
const effects = lines.flatMap((l) => l.parts.flatMap((p) => p.effects.map((e) => ({ ...e, id: p.id }))));
check('every effect text starts with a capital', effects.every((e) => /^[A-Z]/.test(e.text)), effects.filter((e) => !/^[A-Z]/.test(e.text)).map((e) => e.text).join(' | '));
check('no effect says "lets"', !effects.some((e) => /\blets\b/.test(e.text)));
const unlock = effects.find((e) => e.id === 26 && e.when === 'Done' && /Magic Beans/.test(e.text));
check('The Ring of the Dark Lady done: "Unlocks Magic Beans (4A)"', unlock?.text === 'Unlocks Magic Beans (4A)', unlock?.text);
check('the quest is its own piece, to be shown in bold', JSON.stringify(unlock?.pieces) === JSON.stringify(['Unlocks ', { quest: 'Magic Beans' }, ' (4A)']), JSON.stringify(unlock?.pieces));
check('pieces say what the text says', effects.every((e) => e.pieces.map((p) => (typeof p === 'string' ? p : p.quest)).join('') === e.text));
check('items are named in the text', effects.some((e) => e.text.includes('Pot of gold')) && !effects.some((e) => /\{(item|quest):/.test(e.text)));

// "Mark all quests done" and "Mark all bosses beaten": the panel's buttons, run the way its edit() runs them
const atEnd = (v, line) => positionOf(partStates(v, line)) === 2 * line.parts.length;
const effective = (edits, base) => withProgress(base, edits.spec(base));
/** press the buttons on edits over base; what each returned */
function press(edits, base, ...buttons) {
	const v = effective(edits, base);
	const did = {};
	for (const button of buttons) {
		if (button === 'quests') did.quests = markQuestsDone(edits.o, v, lines);
		if (button === 'bosses') did.bosses = markBossesBeaten(edits.o, v);
	}
	edits.normalize(base);
	return did;
}
const J0_ALL = bossBits().reduce((bits, b) => bits | (1 << b.bit), 0);
const I0_ALL = MINI.reduce((bits, m) => bits | (1 << m.bit), 0);
const totalParts = lines.reduce((n, l) => n + l.parts.length, 0);

{
	const edits = new ProgressEdits(null);
	const did = press(edits, fresh, 'quests', 'bosses');
	const done = effective(edits, fresh);
	check('mark all: every questline moved from a new game', did.quests.changed === lines.length && did.quests.already === 0, JSON.stringify(did.quests));
	check('mark all: every slider is at its end', lines.every((l) => atEnd(done, l)), lines.filter((l) => !atEnd(done, l)).map((l) => l.name).join(', '));
	check('mark all: every part is done, none still active', lines.every((l) => l.parts.every((p) => { const q = done.Y0_(p.id); return (q.j0 & 128) && !(q.j0 & 16); })));
	check('mark all: every boss and mini-boss is beaten', done.J0 === J0_ALL && (done.I0 & I0_ALL) === I0_ALL && did.bosses.changed === bossBits().length + MINI.length, `J0 ${done.J0} I0 ${done.I0}`);
	check('mark all: the classic 15, forest 8 and cave 3 bosses', bossBits().length === 26 && J0_ALL === (1 << 26) - 1);
	check('mark all: the changes badge counts each quest and boss', edits.count() === totalParts + 30, `${edits.count()} changes`);
	check('mark all: no quest person is left anywhere', Array.from({ length: 27 }, (_, t) => t).every((t) => !explain(done, t).some((r) => r.kind === 'npc')));

	// pressing again changes nothing
	const before = JSON.stringify(edits.o);
	const again = press(edits, fresh, 'quests', 'bosses');
	check('mark all twice: nothing more to move', again.quests.changed === 0 && again.quests.already === lines.length && again.bosses.changed === 0 && again.bosses.already === 30, JSON.stringify(again));
	check('mark all twice: the edits stay the same', JSON.stringify(edits.o) === before);
	check('mark all twice: says so', markedText(again) === 'Everything was already done.', markedText(again));

	// Reset forgets them
	edits.clear();
	check('reset undoes mark all', edits.empty() && lines.every((l) => positionOf(partStates(effective(edits, fresh), l)) === 0));
}

// the buttons are separate, and keep what the user set by hand
{
	const edits = new ProgressEdits(null);
	Object.assign(edits.o, { items: { 114: 3 }, buildings: { 30: { B0: 1 } }, stats: { x: 7 }, quests: { 62: [16, 4] } });   // quest 62 in progress with step 3 done
	const beforeOther = JSON.stringify({ items: edits.o.items, buildings: edits.o.buildings, stats: edits.o.stats });
	press(edits, fresh, 'quests');
	const done = effective(edits, fresh);
	check('mark quests: bosses are not touched', done.J0 === 0 && !edits.o.J0 && !edits.o.I0);
	check('mark quests: items, buildings and counts you set stay', JSON.stringify({ items: edits.o.items, buildings: edits.o.buildings, stats: edits.o.stats }) === beforeOther);
	check('mark quests: a part you had in progress is now done, with its step ticks', (done.Y0_(62).j0 & 144) === 128 && done.Y0_(62).k0 === 4, `j0 ${done.Y0_(62).j0} k0 ${done.Y0_(62).k0}`);
	press(edits, fresh, 'bosses');
	check('mark bosses: quests are not touched', lines.every((l) => atEnd(effective(edits, fresh), l)));
	const only = new ProgressEdits(null);
	press(only, fresh, 'bosses');
	check('mark bosses: only bosses change', Object.keys(only.o).sort().join() === 'I0,J0' && lines.every((l) => positionOf(partStates(effective(only, fresh), l)) === 0));
}

// on top of a save's progress: what is done there stays, and a slider with no position goes to its end too
{
	const forest = byName.get('Once Upon a Forest');
	const save = withProgress(fresh, {
		quests: { ...Object.fromEntries(forest.parts.map((p) => [p.id, 'done'])), 30: 'none' },   // parts out of order: no position
		J0: ((1 << 15) - 1) | (1 << 20),   // the 15 classic bosses and one forest boss
	});
	check('a save with parts out of order has no position', positionOf(partStates(save, forest)) === -1);
	const edits = new ProgressEdits(null);
	const did = press(edits, save, 'quests', 'bosses');
	const done = effective(edits, save);
	check('on a save: every slider ends at its end', lines.every((l) => atEnd(done, l)));
	check('on a save: only what differed is an edit (the parts already done stay)', Object.keys(edits.o.quests).length === totalParts - (forest.parts.length - 1), `${Object.keys(edits.o.quests).length} edited of ${totalParts}`);
	check('on a save: the boss bits it had are not counted again', did.bosses.already === 16 && did.bosses.changed === 14, JSON.stringify(did.bosses));
	check('on a save: a questline already done stays out of the count', did.quests.already === 0 && did.quests.changed === lines.length);
	const full = withProgress(fresh, { quests: Object.fromEntries(lines.flatMap((l) => l.parts.map((p) => [p.id, 'done']))), J0: J0_ALL, I0: I0_ALL });
	const none = new ProgressEdits(null);
	const nothing = press(none, full, 'quests', 'bosses');
	check('on a save with everything done: no edits at all', none.empty() && nothing.quests.changed === 0 && nothing.bosses.changed === 0, JSON.stringify(none.o));
}

// the one-line result
check('result: all moved', markedText({ quests: { changed: 16, already: 0 } }) === '16 questlines moved to done.');
check('result: some already done', markedText({ quests: { changed: 12, already: 4 } }) === '12 questlines moved to done; 4 were already done.');
check('result: one left to move', markedText({ quests: { changed: 1, already: 15 } }) === '1 questline moved to done; 15 were already done.');
check('result: none to move', markedText({ quests: { changed: 0, already: 16 } }) === 'All 16 questlines were already done.');
check('result: bosses', markedText({ bosses: { changed: 12, already: 18 } }) === '12 bosses marked beaten; 18 were already beaten.');
check('result: bosses all beaten', markedText({ bosses: { changed: 0, already: 30 } }) === 'All 30 bosses were already beaten.');
check('result: both', markedText({ quests: { changed: 16, already: 0 }, bosses: { changed: 30, already: 0 } }) === '16 questlines moved to done. 30 bosses marked beaten.');
check('result: both, one already', markedText({ quests: { changed: 0, already: 16 }, bosses: { changed: 5, already: 25 } }) === 'All 16 questlines were already done. 5 bosses marked beaten; 25 were already beaten.');

// dungeons the generator builds with everything done, and what readProgress reads back (a sample of each family)
{
	const edits = new ProgressEdits(null);
	press(edits, fresh, 'quests', 'bosses');
	const done = effective(edits, fresh);
	const read = readProgress(done);
	const want = Object.fromEntries(lines.flatMap((l) => l.parts.map((p) => [p.id, [(fresh.Y0_(p.id).j0 & ~144 & 255) | 128, fresh.Y0_(p.id).k0 & 255]])));
	const got = Object.fromEntries(Object.keys(want).map((id) => [id, read.quests[id]]));
	check('everything done reads back as set (quests)', JSON.stringify(got) === JSON.stringify(want));
	check('everything done reads back as set (bosses)', read.J0 === J0_ALL && (read.I0 & I0_ALL) === I0_ALL, `J0 ${read.J0} I0 ${read.I0}`);
	const was = V.i2;
	V.i2 = done;
	try {
		for (const type of [8, 14, 17, 21, 23, 25]) {   // 3C, 5C, F3, 6C, EA, EC: the ones with most quest reads
			let error = '';
			try {
				const level = generate(type, 1000 + type);
				if (!level.objects.length || !level.critters.length) error = 'empty level';
			} catch (e) {
				error = e.message;
			}
			check(`everything done builds a dungeon (type ${type})`, !error, error);
		}
	} finally {
		V.i2 = was;
	}
}

// words
check('summary', summarize(['done', 'done', 'active', 'none']) === 'Parts 1–2 done · part 3 in progress · part 4 not started', summarize(['done', 'done', 'active', 'none']));
check('position names', positionName(forest, 0) === 'Not started' && positionName(forest, 7) === 'Part 4 in progress' && positionName(forest, 8) === 'Part 4 done' && positionName(forest, 30) === 'All 15 parts done');
check('dungeon lists', describeTypes([5, 8, 15, 16, 17, 18, 23, 24]) === '2C, 3C, F1–F4, EA, EB', describeTypes([5, 8, 15, 16, 17, 18, 23, 24]));
check('part titles', partTitle(27, names) === 'Once Upon a Forest, part 1' && partTitle(30, names) === 'Once Upon a Forest, part 4' && partTitle(41, names) === 'Once Upon a Forest, part 15' && partTitle(23, names) === 'Dragon Teeth', partTitle(27, names));

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
