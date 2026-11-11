// What things are, for drawing and tooltips. Ids are the game's object (rw) and creature (bw) ids;
// names are our own descriptions inferred from how the game uses each object.

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
	special:   { layer: 'loot',      color: '#ff9cf5', glyph: '✺', label: 'Shrine / cauldron' },
	cover:     { layer: 'decor',     color: '#6b8e23', glyph: '"', label: 'Reeds (cover)' },
	marker:    { layer: 'decor',     color: '#888888', glyph: '·', label: 'Marker' },
	decor:     { layer: 'decor',     color: '#777777', glyph: '·', label: 'Furnishing' },
	hero:      { layer: 'always',    color: '#4f9ef8', glyph: '★', label: 'You (start)' },
	monster:   { layer: 'monsters',  color: '#ff6b6b', glyph: '●', label: 'Monster' },
	goldmonster: { layer: 'monsters', color: '#e6b422', glyph: '⚿', label: 'Gold monster (carries the door key)' },
	boss:      { layer: 'monsters',  color: '#ff2020', glyph: '☠', label: 'Boss' },
	miniboss:  { layer: 'monsters',  color: '#ff7a20', glyph: '☠', label: 'Mini-boss' },
	unique:    { layer: 'monsters',  color: '#ffd700', glyph: '♛', label: 'Unique monster' },
	npc:       { layer: 'monsters',  color: '#b9ff47', glyph: '☺', label: 'NPC' },
	spider:    { layer: 'monsters',  color: '#47f3ff', glyph: '✱', label: 'Mechanical spider (yours)' },
};

const OBJECT_KIND = new Map();
const set = (kind, ...ids) => ids.forEach((i) => OBJECT_KIND.set(i, kind));
set('chest', 21, 37, 94);
set('page', 15, 55, 110);
set('container', 2, 7, 34, 41, 42, 43, 44, 61, 62, 66, 67, 68, 69, 70, 102, 122);
set('breakable', 3, 4, 26, 104, 105, 106, 12, 13, 20, 107, 108, 109, 121);
set('ore', 49, 50, 51, 63, 64, 65);
set('mpdoor', 27);
set('stuckdoor', 28, 73);
set('lockdoor', 29);
set('gate', 33);
set('lever', 32);
set('puzzledoor', 35);
set('barreldoor', 60);
set('bossgate', 53);
set('ladder', 40);
set('hatch', 38, 39, 74);
set('portal', 88);
set('teleport', 126);
set('barrel', 59);
set('trap', 30);
set('fountain', 48, 58, 124, 54);
set('special', 85, 86, 87, 95);
set('cover', 84);
set('marker', 52);

/** Classify a placed object. rw = its definition from zw.Q (may be undefined). */
export function objectKind(obj, rw) {
	const k = OBJECT_KIND.get(obj.id);
	if (k) return k;
	if (rw && rw.t) return 'chest';
	return 'decor';
}

/** Classify a creature. bw = its definition from zw.R (may be undefined). */
export function critterKind(cr, bw) {
	if (cr.id === 180) return 'hero';
	if (cr.id === 199) return 'spider';
	if (cr.h === 1101 || cr.h === 1103) return 'boss';
	if (cr.h === 1100) return 'miniboss';
	if (cr.k === 0 || cr.k === 1) return 'npc';
	if (cr.g === 167) return 'goldmonster';   // drops key 167 for the locked door
	if (bw && bw.l0) return 'unique';
	if (bw && bw.m0) return 'boss';
	return 'monster';
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
			if ((b & 63) === 44) return 'Pressure plate';
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
