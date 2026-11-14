// Questlines for the "Your progress" editor (js/ui/progress-panel.js). The game lists its quests by name, and many
// quests share one ("Once Upon a Forest" is quests 28 to 41), so the editor shows one questline per name with a
// slider over its parts. Only questlines with a part that dungeon generation reads are kept (js/gen/progress-reads.js).
//
// A questline of n parts has positions 0..2n: 0 is "not started", 2k - 1 is "part k in progress" (the parts before it
// done), 2k is "part k done" (the parts after it not started) and 2n is "all done". States that aren't in that order
// (an imported save can have them) have no position; the editor then shows each part on its own.
//
//   buildQuestlines(v, names)     -> [{ key, name, parts: [{ id, number, effects }], types: { map, loot } }]
//   partStates(v, line)           -> ['done' | 'active' | 'none', ...], one per part
//   positionOf(states)            -> the position of these states, or -1
//   reachedPosition(states)       -> the furthest position a part has reached
//   statesAt(line, position)      -> the part states at a position
//   positionName(line, position)  -> "Part 3 in progress"
//   summarize(states)             -> "Parts 1–2 done · part 3 in progress · parts 4–14 not started"
//   describeTypes(types)          -> "2C, 3C, F1–F4"
//   partTitle(id, names)          -> "Once Upon a Forest, part 3"
import { npcQuests } from '../gen/progress-reads.js';
import { stateName } from '../gen/progress-spec.js';
import { typeLabel } from '../labels.js';

/**
 * What a quest changes besides where its person stands, from the reads in js/gen/progress-reads.js. `when` is the
 * quest state the change needs; `{item:N}` in a text is the item's name.
 */
const EFFECTS = {
	23: [{ when: 'Started', text: 'beaten bosses of 3C, 5C, F4, and 6C drop dragon teeth', types: [8, 14, 18, 21], kind: 'loot' }],
	25: [{ when: 'In progress', text: 'a second boss waits in 5C', types: [14], kind: 'map' }],
	27: [{ when: 'In progress', text: 'a mini-boss guards 2C until you beat it', types: [5], kind: 'map' }],
	30: [{ when: 'In progress', text: 'mini-bosses guard 3C, 4C, and 5C, each once the one before it is beaten', types: [8, 11, 14], kind: 'map' }],
	36: [{ when: 'Done', text: 'some drops in F3, 6C, and 6D change', types: [17, 21, 22], kind: 'loot' }],
	41: [{ when: 'Done', text: 'one {item:115} no longer counts: with none (and 20 F4 dungeons cleared) a special NPC is likelier in F3 and F4', types: [17, 18], kind: 'map' }],
	45: [{ when: 'In progress', text: 'one forest merchant is a different person', types: [17, 18, 20], kind: 'map' }],
	46: [
		{ when: 'Started', text: 'more finds in F2, F3, and F4', types: [16, 17, 18], kind: 'map' },
		{ when: 'Done', text: 'cave bosses you haven’t beaten carry a {item:256}, and the 6C boss brings a companion', types: [19, 20, 21], kind: 'map' },
	],
	48: [{ when: 'Started', text: 'merchants appear in caves', types: [19, 20, 22], kind: 'map' }],
	50: [{ when: 'Done', text: 'chests in EC and ED hold something else', types: [25, 26], kind: 'loot' }],
	51: [{ when: 'In progress', text: 'an extra boss waits in 6C', types: [21], kind: 'map' }],
	53: [{ when: 'Done', text: 'some F2–F4 monsters drop soybeans', types: [16, 17, 18], kind: 'loot' }],
	62: [{ when: 'Step 3 done', text: 'the EA boss comes without its companion', types: [23], kind: 'map' }],
	63: [{ when: 'Started', text: 'the EA boss comes without its companion', types: [23], kind: 'map' }],
	66: [{ when: 'Done', text: 'a tomb merchant who sells Ambrosia is a different person', types: [23, 24, 25, 26], kind: 'map' }],
	70: [{ when: 'Done', text: 'sarcophagi in EC and ED hold something else', types: [25, 26], kind: 'loot' }],
	71: [{ when: 'Started', text: 'the EC boss drops something else', types: [25], kind: 'loot' }],
	73: [
		{ when: 'Started', text: 'the tomb guardian appears in EA, EB, and EC', types: [23, 24, 25], kind: 'map' },
		{ when: 'Done', text: 'the tomb guardian in EA drops something else', types: [23], kind: 'loot' },
	],
	74: [{ when: 'Done', text: 'the tomb guardian in EB drops something else', types: [24], kind: 'loot' }],
	75: [{ when: 'Done, or step 1 done', text: 'the tomb guardian in EC drops something else', types: [25], kind: 'loot' }],
};

const STATE_TEXT = { none: 'not started', active: 'in progress', done: 'done' };
const WHEN_ORDER = ['Not started', 'Started', 'In progress', 'Step', 'Done'];

export function buildQuestlines(v, names) {
	const groups = groupByName(v, names.quests || {});
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

/** "Once Upon a Forest, part 3" for quest 30; just the name for a questline of one quest. */
export function partTitle(id, names) {
	const quests = names.quests || {};
	const name = questName(id, names);
	const ids = Object.keys(quests).map(Number).filter((q) => quests[q] === name).sort((a, b) => a - b);
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
function groupByName(v, questNames) {
	const byName = new Map();
	for (const q of v.s) {
		if (q == null) continue;
		const name = questNames[q.a] || `Quest ${q.a}`;
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
	if (person && person.offered >= 0) effects.push({ when: 'Not started', text: `its NPC offers it in ${typeLabel(person.offered)}, once it can start`, types: [person.offered], kind: 'map' });
	const at = person ? activeTypes(v.Y0_(id)) : [];
	if (at.length) effects.push({ when: 'In progress', text: `its NPC is in ${describeTypes(at)}${at.length > 1 ? ' (one at a time)' : ''}`, types: at, kind: 'map' });
	// the next parts of the same questline starting is what the slider's order already says
	const otherLines = (unlocks.get(id) || []).filter((u) => lineName(titles.get(u.quest)) !== lineName(titles.get(id)));
	for (const u of otherLines) {
		effects.push({ when: u.requirement, text: `lets ${titles.get(u.quest)} start in ${typeLabel(u.type)}`, types: [u.type], kind: 'map' });
	}
	for (const e of EFFECTS[id] || []) effects.push({ ...e, text: withItemNames(e.text, names) });
	return effects.sort((a, b) => whenRank(a.when) - whenRank(b.when));
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

function questName(id, names) {
	return (names.quests && names.quests[id]) || `Quest ${id}`;
}

function withItemNames(text, names) {
	return text.replace(/\{item:(\d+)\}/g, (_, id) => (names.items && names.items[id]) || `item ${id}`);
}

function sameFamily(a, b) {
	const family = (t) => (t >= 23 ? 3 : t >= 19 ? 2 : t >= 15 ? 1 : 0);
	return family(a) === family(b);
}
