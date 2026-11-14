// Questlines for the "Your progress" editor (js/ui/progress-panel.js). The game lists its quests by name, and many
// quests share one ("Once Upon a Forest" is quests 27 to 41), so the editor shows one questline per name with a
// slider over its parts. Only questlines with a part that dungeon generation reads are kept (js/gen/progress-reads.js).
//
// A questline of n parts has positions 0..2n: 0 is "not started", 2k - 1 is "part k in progress" (the parts before it
// done), 2k is "part k done" (the parts after it not started) and 2n is "all done". States that aren't in that order
// (an imported save can have them) have no position; the editor then shows each part on its own.
//
//   buildQuestlines(v, names)     -> [{ key, name, parts: [{ id, number, effects }], types: { map, loot } }]
//                                    effect: { when, text, pieces, types, kind }; pieces: strings and { quest: title }
//   partStates(v, line)           -> ['done' | 'active' | 'none', ...], one per part
//   positionOf(states)            -> the position of these states, or -1
//   reachedPosition(states)       -> the furthest position a part has reached
//   statesAt(line, position)      -> the part states at a position
//   positionName(line, position)  -> "Part 3 in progress"
//   summarize(states)             -> "Parts 1–2 done · part 3 in progress · parts 4–15 not started"
//   describeTypes(types)          -> "2C, 3C, F1–F4"
//   partTitle(id, names)          -> "Once Upon a Forest, part 4"
import { npcQuests } from '../gen/progress-reads.js';
import { stateName } from '../gen/progress-spec.js';
import { typeLabel, titleCase } from '../labels.js';

/**
 * What a quest changes besides where its person stands, from the reads in js/gen/progress-reads.js. `when` is the
 * quest state the change needs; in a text, `{item:N}` is the item's name and `{quest:N}` the quest's title (shown in
 * bold). Each text starts with a capital, as it follows its "when" label ("Done: Changes some drops ...").
 */
const EFFECTS = {
	23: [{ when: 'Started', text: 'Beaten bosses of 3C, 5C, F4, and 6C drop dragon teeth', types: [8, 14, 18, 21], kind: 'loot' }],
	25: [{ when: 'In progress', text: 'Adds a second boss to 5C', types: [14], kind: 'map' }],
	27: [{ when: 'In progress', text: 'Adds a mini-boss to 2C until you beat it', types: [5], kind: 'map' }],
	30: [{ when: 'In progress', text: 'Adds mini-bosses to 3C, 4C, and 5C, each once the one before it is beaten', types: [8, 11, 14], kind: 'map' }],
	36: [{ when: 'Done', text: 'Changes some drops in F3, 6C, and 6D', types: [17, 21, 22], kind: 'loot' }],
	41: [{ when: 'Done', text: 'Takes one {item:115} off the count: with none looted (and 20 F4 dungeons cleared), a special NPC is likelier in F3 and F4', types: [17, 18], kind: 'map' }],
	45: [{ when: 'In progress', text: 'Makes one forest merchant a different person', types: [17, 18, 20], kind: 'map' }],
	46: [
		{ when: 'Started', text: 'Adds more finds to F2, F3, and F4', types: [16, 17, 18], kind: 'map' },
		{ when: 'Done', text: 'Cave bosses you haven’t beaten carry a {item:256}, and the 6C boss brings a companion', types: [19, 20, 21], kind: 'map' },
	],
	48: [{ when: 'Started', text: 'Brings merchants to the caves', types: [19, 20, 22], kind: 'map' }],
	50: [{ when: 'Done', text: 'Changes what chests in EC and ED hold', types: [25, 26], kind: 'loot' }],
	51: [{ when: 'In progress', text: 'Adds an extra boss to 6C', types: [21], kind: 'map' }],
	53: [{ when: 'Done', text: 'Some F2–F4 monsters drop soybeans', types: [16, 17, 18], kind: 'loot' }],
	62: [{ when: 'Step 3 done', text: 'The EA boss comes without its companion', types: [23], kind: 'map' }],
	63: [{ when: 'Started', text: 'The EA boss comes without its companion', types: [23], kind: 'map' }],
	66: [{ when: 'Done', text: 'Makes the tomb merchant who sells Ambrosia a different person', types: [23, 24, 25, 26], kind: 'map' }],
	70: [{ when: 'Done', text: 'Changes what sarcophagi in EC and ED hold', types: [25, 26], kind: 'loot' }],
	71: [{ when: 'Started', text: 'Changes what the EC boss drops', types: [25], kind: 'loot' }],
	73: [
		{ when: 'Started', text: 'Brings the tomb guardian to EA, EB, and EC', types: [23, 24, 25], kind: 'map' },
		{ when: 'Done', text: 'Changes what the tomb guardian drops in EA', types: [23], kind: 'loot' },
	],
	74: [{ when: 'Done', text: 'Changes what the tomb guardian drops in EB', types: [24], kind: 'loot' }],
	75: [{ when: 'Done, or step 1 done', text: 'Changes what the tomb guardian drops in EC', types: [25], kind: 'loot' }],
};

/**
 * Quests the game lists under another quest's name: id -> the quest whose name it goes under. Quest 27's own title is
 * a teaser, "Once Upon a ...", but it is chapter 1 of Once Upon a Forest: its kj0.n is 1, its kj0.q is that
 * questline's title (the game's quest journal files a quest under q when it has one), quest 28 (chapter 2) can only
 * start once it is done, and the wiki calls it Chapter I. test/questlines.mjs checks this against the game's data.
 */
export const LISTED_UNDER = { 27: 28 };

const STATE_TEXT = { none: 'not started', active: 'in progress', done: 'done' };
const WHEN_ORDER = ['Not started', 'Started', 'In progress', 'Step', 'Done'];

export function buildQuestlines(v, names) {
	const groups = groupByName(v, names);
	const context = { v, names, people: new Map(npcQuests(v).map((q) => [q.id, q])), titles: partTitles(groups) };
	context.unlocks = unlocksByQuest(context);
	const lines = [];
	for (const [name, ids] of groups) {
		const parts = ids.map((id, i) => ({ id, number: i + 1, effects: partEffects(id, context) }));
		if (!parts.some((p) => p.effects.length)) continue;
		lines.push({ key: ids[0], name, parts, types: lineTypes(parts) });
	}
	return lines;
}

/** "Once Upon a Forest, part 4" for quest 30; just the name for a questline of one quest. */
export function partTitle(id, names) {
	const name = questName(id, names);
	const ids = Object.keys(names.quests || {}).map(Number).filter((q) => questName(q, names) === name).sort((a, b) => a - b);
	return ids.length > 1 ? `${name}, part ${ids.indexOf(id) + 1}` : name;
}

export function partStates(v, line) {
	return line.parts.map((p) => stateName(v.Y0_(p.id).j0));
}

export function positionOf(states) {
	const position = reachedPosition(states);
	return statesAt({ parts: states }, position).every((s, i) => s === states[i]) ? position : -1;
}

/** The furthest position any part has reached: where a slider stands for states that have no position. */
export function reachedPosition(states) {
	return Math.max(0, ...states.map((s, i) => (s === 'done' ? 2 * i + 2 : s === 'active' ? 2 * i + 1 : 0)));
}

export function statesAt(line, position) {
	return line.parts.map((_, i) => (position >= 2 * i + 2 ? 'done' : position === 2 * i + 1 ? 'active' : 'none'));
}

export function positionName(line, position) {
	const n = line.parts.length;
	if (position <= 0) return 'Not started';
	if (position >= 2 * n) return n === 1 ? 'Done' : `All ${n} parts done`;
	const part = Math.ceil(position / 2);
	return `Part ${part} ${position % 2 ? 'in progress' : 'done'}`;
}

export function summarize(states) {
	const runs = [];
	states.forEach((s, i) => {
		const last = runs[runs.length - 1];
		if (last && last.state === s) last.to = i + 1;
		else runs.push({ state: s, from: i + 1, to: i + 1 });
	});
	const text = runs.map((r) => `${r.from === r.to ? `part ${r.from}` : `parts ${r.from}–${r.to}`} ${STATE_TEXT[r.state]}`).join(' · ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dungeon labels, with runs of neighbours in one family joined: [5, 8, 15, 16, 17, 18] -> "2C, 3C, F1–F4". */
export function describeTypes(types) {
	const sorted = [...new Set(types)].sort((a, b) => a - b);
	const runs = [];
	for (const t of sorted) {
		const last = runs[runs.length - 1];
		if (last && t === last.to + 1 && sameFamily(t, last.to) && t >= 15) last.to = t;
		else runs.push({ from: t, to: t });
	}
	return runs.map((r) => (r.from === r.to ? typeLabel(r.from) : r.to === r.from + 1 ? `${typeLabel(r.from)}, ${typeLabel(r.to)}` : `${typeLabel(r.from)}–${typeLabel(r.to)}`)).join(', ');
}

// ---- building the questlines -----------------------------------------------------------------------------------

/** Quest ids by name, in the game's id order (the order of the parts). */
function groupByName(v, names) {
	const byName = new Map();
	for (const q of v.s) {
		if (q == null) continue;
		const name = questName(q.a, names);
		if (!byName.has(name)) byName.set(name, []);
		byName.get(name).push(q.a);
	}
	return byName;
}

/** id -> "Name, part k" (or "Name" for a questline of one quest). */
function partTitles(groups) {
	const titles = new Map();
	for (const [name, ids] of groups) ids.forEach((id, i) => titles.set(id, ids.length > 1 ? `${name}, part ${i + 1}` : name));
	return titles;
}

/**
 * For each quest, the quest people it lets appear: { requirement, quest, type } where quest (with a person) can start
 * in type once this quest meets the requirement (the start conditions jj0 F / H / G: started, step done, done).
 */
function unlocksByQuest({ v, people }) {
	const out = new Map();
	const add = (id, entry) => {
		if (!out.has(id)) out.set(id, []);
		out.get(id).push(entry);
	};
	for (const person of people.values()) {
		if (person.offered < 0) continue;
		const q = v.Y0_(person.id);
		for (const c of [q.H, q.I, q.J, q.K]) {
			if (!c) continue;
			if (c.F) add(c.F, { requirement: 'Started', quest: person.id, type: person.offered });
			if (c.H) add(c.H, { requirement: `Step ${c.I + 1} done`, quest: person.id, type: person.offered });
			if (c.G) add(c.G, { requirement: 'Done', quest: person.id, type: person.offered });
		}
	}
	return out;
}

/** Everything one quest changes in dungeons: its person, the people it lets appear, and its other effects. */
function partEffects(id, { v, names, people, unlocks, titles }) {
	const effects = [];
	const person = people.get(id);
	if (person && person.offered >= 0) effects.push({ when: 'Not started', text: `Its NPC offers it in ${typeLabel(person.offered)}, once it can start`, types: [person.offered], kind: 'map' });
	const at = person ? activeTypes(v.Y0_(id)) : [];
	if (at.length) effects.push({ when: 'In progress', text: `Its NPC is in ${describeTypes(at)}${at.length > 1 ? ' (one at a time)' : ''}`, types: at, kind: 'map' });
	// the next parts of the same questline starting is what the slider's order already says
	const otherLines = (unlocks.get(id) || []).filter((u) => lineName(titles.get(u.quest)) !== lineName(titles.get(id)));
	for (const u of otherLines) {
		effects.push({ when: u.requirement, text: `Unlocks {quest:${u.quest}} (${describeTypes([u.type])})`, types: [u.type], kind: 'map' });
	}
	effects.push(...(EFFECTS[id] || []));
	return effects.sort((a, b) => whenRank(a.when) - whenRank(b.when)).map((e) => withNames(e, { names, titles }));
}

function whenRank(when) {
	const i = WHEN_ORDER.findIndex((w) => when.startsWith(w));
	return i < 0 ? WHEN_ORDER.length : i;
}

function lineName(title) {
	return title.replace(/, part \d+$/, '');
}

/** Where an active quest's person can stand: its level L, levels M, or its per-dungeon steps (c0). */
function activeTypes(q) {
	const types = new Set();
	if (q.L >= 0) types.add(q.L);
	if (q.M) for (const t of q.M) types.add(t);
	if (q.c0 && q.b0) for (const step of q.b0) if (step.Q >= 0) types.add(step.Q);
	return [...types].filter((t) => t < 27).sort((a, b) => a - b);
}

function lineTypes(parts) {
	const map = new Set();
	const loot = new Set();
	for (const e of parts.flatMap((p) => p.effects)) for (const t of e.types) (e.kind === 'loot' ? loot : map).add(t);
	return { map: [...map].sort((a, b) => a - b), loot: [...loot].filter((t) => !map.has(t)).sort((a, b) => a - b) };
}

/** The name a quest is listed under (LISTED_UNDER), from data/names.json, in title case. */
function questName(id, names) {
	const listed = LISTED_UNDER[id] ?? id;
	return titleCase((names.quests && names.quests[listed]) || `Quest ${listed}`);
}

/** An effect with its {item:N} and {quest:N} filled in: as plain text, and as pieces (strings and { quest: title }). */
function withNames(effect, { names, titles }) {
	const pieces = [];
	let from = 0;
	for (const m of effect.text.matchAll(/\{(item|quest):(\d+)\}/g)) {
		pieces.push(effect.text.slice(from, m.index));
		const id = Number(m[2]);
		pieces.push(m[1] === 'quest' ? { quest: titles.get(id) || partTitle(id, names) } : (names.items && names.items[id]) || `item ${id}`);
		from = m.index + m[0].length;
	}
	pieces.push(effect.text.slice(from));
	const words = joinWords(pieces);
	return { ...effect, text: words.map((p) => (typeof p === 'string' ? p : p.quest)).join(''), pieces: words };
}

/** Neighbouring strings joined and empty ones dropped, so pieces alternate between words and quest titles. */
function joinWords(pieces) {
	const out = [];
	for (const p of pieces) {
		if (p === '') continue;
		if (typeof p === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += p;
		else out.push(p);
	}
	return out;
}

function sameFamily(a, b) {
	const family = (t) => (t >= 23 ? 3 : t >= 19 ? 2 : t >= 15 ? 1 : 0);
	return family(a) === family(b);
}
