// What things are: their names, how the map draws them, and tile names. Ids are the game's object (rw, zw.Q) and
// creature (bw, zw.R) ids. data/catalog.json is the table of them: each id's name (from the Nonograms Katana Wiki, or
// our own words) and its kind, which picks the look below.

// kind -> layer, colour, glyph
export const KINDS = {
	chest:     { layer: 'loot',      color: '#f5c542', glyph: '▣', label: 'Treasure chest' },
	page:      { layer: 'loot',      color: '#e8e0c8', glyph: '≡', label: 'Ancient page' },
	container: { layer: 'loot',      color: '#c9a36b', glyph: '▫', label: 'Container' },
	breakable: { layer: 'decor',     color: '#9a8466', glyph: '·', label: 'Breakable' },
	ore:       { layer: 'loot',      color: '#b0c4de', glyph: '◆', label: 'Resource node' },
	mpdoor:    { layer: 'doors',     color: '#6fa8ff', glyph: '✦', label: 'Sealed door (mental power)' },
	stuckdoor: { layer: 'doors',     color: '#c08a4a', glyph: '▮', label: 'Stuck door (energy to break)' },
	lockdoor:  { layer: 'doors',     color: '#ffb347', glyph: '⚿', label: 'Locked door (key from a gold monster)' },
	gate:      { layer: 'doors',     color: '#d0d0d0', glyph: '#', label: 'Gate (opened by its lever)' },
	lever:     { layer: 'doors',     color: '#ffe047', glyph: '⚲', label: 'Lever / key (opens its gate)' },
	puzzledoor:{ layer: 'doors',     color: '#ce47ff', glyph: '▦', label: 'Puzzle door (floor nonogram)' },
	barreldoor:{ layer: 'doors',     color: '#ce47ff', glyph: '◎', label: 'Puzzle door (barrels on plates)' },
	bossgate:  { layer: 'doors',     color: '#ff4747', glyph: '⛩', label: 'Boss gate' },
	ladder:    { layer: 'links',     color: '#47f3ff', glyph: '⇅', label: 'Ladder' },
	hatch:     { layer: 'links',     color: '#47f3ff', glyph: '⊙', label: 'Hatch' },
	portal:    { layer: 'links',     color: '#8247ff', glyph: '◉', label: 'Portal' },
	teleport:  { layer: 'links',     color: '#8247ff', glyph: '✧', label: 'Teleporter' },
	barrel:    { layer: 'puzzles',   color: '#a0522d', glyph: '●', label: 'Barrel (push onto plates)' },
	trap:      { layer: 'traps',     color: '#ff4747', glyph: '✕', label: 'Trap' },
	fountain:  { layer: 'loot',      color: '#47ffb3', glyph: '♨', label: 'Fountain' },
	special:   { layer: 'loot',      color: '#ff9cf5', glyph: '✺', label: 'Cauldron' },
	// the tombs' goddess statue: using it once gives 10 energy and lights the hero's torch, widening sight from 6 to 10
	// tiles (actions.js activate, T0_)
	torchstatue: { layer: 'loot',    color: '#ffb84d', glyph: '♆', label: 'Torch statue (+10 energy, lights your torch)' },
	// caves: a cart on the rails (boardwalk tiles); whoever rides it, hero or monster, has +4 defence (aw.k, flag 512)
	minecart:  { layer: 'decor',     color: '#8c919c', glyph: '⊔', label: 'Mine cart (+4 defence for its rider)' },
	marker:    { layer: 'decor',     color: '#888888', glyph: '·', label: 'Marker' },
	decor:     { layer: 'decor',     color: '#777777', glyph: '·', label: 'Furnishing' },
	hero:      { layer: 'always',    color: '#4f9ef8', glyph: '★', label: 'You (start)' },
	monster:   { layer: 'monsters',  color: '#ff6b6b', glyph: '●', label: 'Monster' },
	goldmonster: { layer: 'monsters', color: '#e6b422', glyph: '⚿', label: 'Gold monster (carries the door key)' },
	boss:      { layer: 'monsters',  color: '#ff2020', glyph: '☠', label: 'Boss' },
	miniboss:  { layer: 'monsters',  color: '#ff7a20', glyph: '☠', label: 'Mini-boss' },
	unique:    { layer: 'monsters',  color: '#ffd700', glyph: '♛', label: 'Unique monster' },
	npc:       { layer: 'monsters',  color: '#b9ff47', glyph: '☺', label: 'NPC' },
	familiar:  { layer: 'monsters',  color: '#cfd8e3', glyph: '♞', label: 'Wild familiar' },
	shapeshifter: { layer: 'monsters', color: '#ff4d4d', glyph: '◆', label: 'Shapeshifter' },
	spider:    { layer: 'monsters',  color: '#47f3ff', glyph: '✱', label: 'Mechanical spider (yours)' },
};

const CATALOG = await loadCatalog();

/** data/catalog.json: fetched in the browser, read from disk in Node (tests and tools) */
async function loadCatalog() {
	const url = new URL('../../data/catalog.json', import.meta.url);
	if (url.protocol === 'file:') {
		const fs = await import('node:fs');
		return JSON.parse(fs.readFileSync(url, 'utf8'));
	}
	const response = await fetch(url);
	if (!response.ok) throw new Error(`data/catalog.json: HTTP ${response.status}`);
	return response.json();
}

/** Classify a placed object. rw = its definition from zw.Q (may be undefined). */
export function objectKind(obj, rw) {
	const entry = CATALOG.objects[obj.id];
	if (entry) return entry.kind;
	return rw && rw.t ? 'chest' : 'decor';
}

/** Classify a creature: its species' kind (data/catalog.json), then what this one is tagged with. bw = its zw.R record. */
export function critterKind(cr, bw) {
	const base = speciesKind(cr.id, bw);
	if (base === 'hero' || base === 'spider' || base === 'familiar') return base;   // familiars: critters 190..193
	if (cr.h === 1101 || cr.h === 1103) return 'boss';
	if (cr.h === 1100) return 'miniboss';
	// shapeshifters look like people but fight when you talk to them (c30, the NPC talk branch): species with bw.N0
	// (quests 41 and 57), and wandering merchants tagged 1000 instead of 1001 (x30.P: 12% on 3B-4C, F3, EB and EC once
	// you have traded 3 times), which vanish and leave a monster (284; 350 in the forest; 649 in the tombs)
	if (cr.k === 0 || cr.k === 1) return base === 'shapeshifter' || cr.h === 1000 ? 'shapeshifter' : 'npc';
	if (cr.g === 167) return 'goldmonster';   // drops key 167 for the locked door
	if (base === 'unique' || base === 'boss') return base;
	return 'monster';
}

/** A species' kind before its tags; a species missing from the catalog falls back to its zw.R flags. */
function speciesKind(id, bw) {
	const entry = CATALOG.creatures[id];
	if (entry) return entry.kind;
	if (bw && bw.N0) return 'shapeshifter';
	if (bw && bw.l0) return 'unique';
	if (bw && bw.m0) return 'boss';
	return 'monster';
}

/** The game's familiar rank colours (zw.f): white, blue, yellow and purple for ranks 0 to 3. */
export const RANK_COLORS = ['#ffffff', '#72c1ff', '#f6cd5d', '#ae95ff'];

/** A wild familiar's rank (0..3), or null when the level doesn't list its companions (the sample fixtures). */
export function familiarRank(level, cr) {
	const companion = level?.companions?.[cr.id - 190];
	return companion ? companion.rank : null;
}

/** A creature sprite's variant: a monster's species (its colour), a wild familiar's rank (its colour). */
export function critterVariant(kind, cr, level) {
	if (kind === 'monster') return String(cr.id);
	if (kind === 'familiar') return String(familiarRank(level, cr) ?? '');
	return '';
}

/** The colour of a creature's dot when zoomed out: a familiar's rank colour, else its kind's. */
export function critterColor(kind, variant) {
	return kind === 'familiar' && RANK_COLORS[variant] ? RANK_COLORS[variant] : KINDS[kind].color;
}

/** A creature's name, e.g. "Cobra"; null for a species the catalog doesn't know. */
export function critterName(cr) {
	const entry = CATALOG.creatures[cr.id];
	return entry ? entry.name : null;
}

/**
 * An object's name in a dungeon family ('Dungeon', 'Forest', 'Cave' or 'Tomb', js/labels.js family), e.g. "Purple
 * chest"; some objects are called something else in some families or with a tag ("Railroad switch"). Null if unknown.
 */
export function objectName(obj, family) {
	const entry = CATALOG.objects[obj.id];
	if (!entry) return null;
	return entry.byTag?.[obj.h] ?? entry.byFamily?.[family] ?? entry.name;
}

/** Where a creature's or an object's name comes from: 'wiki' (the Nonograms Katana Wiki), 'ours', or null if unknown. */
export function critterNameSource(cr) {
	return CATALOG.creatures[cr.id]?.source ?? null;
}

export function objectNameSource(obj) {
	return CATALOG.objects[obj.id]?.source ?? null;
}

/** The catalog entries themselves, keyed by id: { creatures, objects } (tests and tools). */
export function catalogEntries() {
	return { creatures: CATALOG.creatures, objects: CATALOG.objects };
}

/** Objects that link to a partner, and how partners are matched. */
export function linkGroup(obj) {
	switch (obj.id) {
		case 40: case 38: case 39: case 74: return 'ladder';
		case 88: case 126: return 'portal';   // hw.q pairs 88 and 126 by h
		case 32: case 33: return obj.h === 1201 ? null : 'gate';
		default: return null;
	}
}

// Tile types (ww.a) and how to draw them.
export const TILE = {
	VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, LIQUID: 4, EXIT: 5, PILLAR: 6, OUTWALL: 7, OUTDOOR: 8, BUSH: 9, PATCH: 10,
};

export function tileName(a, b) {
	switch (a) {
		case 0: return 'Rock';
		case 1: {
			const f = b & 31;
			if (isPressurePlate(a, b)) return 'Pressure plate';
			if (f === 12) return 'Puzzle floor (nonogram)';
			if (f === 1) return 'Corridor';
			if (f === 2 || f === 11) return 'Bridge';
			if (f === 18 || f === 19) return 'Boardwalk';
			return 'Floor';
		}
		case 2: return 'Wall';
		case 3: return 'Doorway';
		case 4: return 'Water';
		case 5: return (b & 15) === 2 || (b & 15) === 3 ? 'Exit (needs key)' : 'Stairs (entrance / exit)';
		case 6: return 'Pillar';
		case 7: return 'Thick forest / rock';
		case 8: return 'Overgrown doorway';
		case 9: return 'Undergrowth';
		case 10: return 'Flowers';
		default: return `Tile ${a}`;
	}
}

/** Hidden trap on a floor tile: (b & 0x60) == 0x20. */
export const isHiddenTrap = (a, b) => a === 1 && (b & 0x60) === 0x20 && (b & 31) !== 12;

/** Pressure plate (barrel puzzles): floor code 44 in the low six bits. */
export const isPressurePlate = (a, b) => a === 1 && (b & 63) === 44;
