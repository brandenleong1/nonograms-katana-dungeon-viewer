// Quarter walls (js/view/walls.js): which quarters of each wall cell the map fills, checked against the game's own
// choice of wall pieces (c30.D) on every neighbour combination, plus what joins a wall, which side faces show, and
// where the floor shows, on small hand-made maps.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/walls.mjs
import { wallQuarters, quarterBits, WALL_LEFT, WALL_RIGHT, OPEN_LEFT, OPEN_RIGHT, FLOOR_SHOWS } from '../js/view/walls.js';
import { TILE } from '../js/view/catalog.js';

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

// ---- the piece rule, on all 16 neighbour combinations ------------------------------------------------------------
for (let n = 0; n < 16; n++) {
	const near = { left: !!(n & 1), right: !!(n & 2), up: !!(n & 4), down: !!(n & 8) };
	const expected = quartersOf(gamePieces(near));
	check(`neighbours ${describe(near)}`, quarterBits(near) === expected, `got ${quarterBits(near)}, game pieces give ${expected}`);
}

// ---- small maps: . rock, f floor, # wall, d doorway, o opening in forest or cave rock, e exit, t forest, p pillar -----------------
{
	const map = parse([
		'......',
		'.####d',
		'.ffff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('a wall run fills its left quarters', (at(2, 1) & (WALL_LEFT | WALL_RIGHT)) === WALL_LEFT, bits(at(2, 1)));
	check('inside a run the left side is hidden', !(at(2, 1) & OPEN_LEFT), bits(at(2, 1)));
	check('a run facing a room shows its +y side', !!(at(2, 1) & OPEN_RIGHT), bits(at(2, 1)));
	check('the floor shows in front of a wall facing a room', !!(at(2, 1) & FLOOR_SHOWS), bits(at(2, 1)));
	check('the end of a run still fills its left quarter', !!(at(1, 1) & WALL_LEFT), bits(at(1, 1)));
	check('the end of a run shows its -x side', !!(at(1, 1) & OPEN_LEFT), bits(at(1, 1)));
	check('no floor where a front cell is rock', !(at(1, 1) & FLOOR_SHOWS), bits(at(1, 1)));
	check('a doorway continues the wall', (at(4, 1) & WALL_LEFT) && !(at(4, 1) & WALL_RIGHT), bits(at(4, 1)));
	check('cells that are not walls get no bits', map.masks.every((m, i) => map.cells[2 * i] === TILE.WALL || m === 0));
}
{
	const map = parse([
		'.....',
		'.#o#.',
		'.fff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('an opening in forest or cave rock does not continue the wall', at(1, 1) & WALL_RIGHT && !(at(1, 1) & WALL_LEFT), bits(at(1, 1)));
}
{
	const map = parse([
		'.....',
		'.#e#.',
		'.#ff.',
		'.#ff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('an exit continues the wall', (at(3, 1) & WALL_LEFT) !== 0, bits(at(3, 1)));
	check('a corner toward +x and +y is the back and right quarters', (at(1, 1) & (WALL_LEFT | WALL_RIGHT)) === WALL_RIGHT, bits(at(1, 1)));
	check('a wall run along y fills its right quarters', (at(1, 2) & (WALL_LEFT | WALL_RIGHT)) === WALL_RIGHT, bits(at(1, 2)));
	check('inside a run along y the +y side is hidden', !(at(1, 2) & OPEN_RIGHT), bits(at(1, 2)));
}
{
	const map = parse([
		'.....',
		'.p#t.',
		'..t..',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('pillars and forest do not continue a wall', (at(2, 1) & (WALL_LEFT | WALL_RIGHT)) === WALL_RIGHT, bits(at(2, 1)));
	check('the floor shows next to forest even with rock in front', !!(at(2, 1) & FLOOR_SHOWS), bits(at(2, 1)));
}
{
	const map = parse([
		'.#.',
		'###',
		'.#.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('a crossing fills the back, left and right quarters', (at(1, 1) & (WALL_LEFT | WALL_RIGHT)) === (WALL_LEFT | WALL_RIGHT), bits(at(1, 1)));
	check('a lone wall runs along y', (parse(['...', '.#.', '...']).masks[4] & (WALL_LEFT | WALL_RIGHT)) === WALL_RIGHT);
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

/**
 * The pieces the game draws for a wall cell (c30.D): a corner piece for each pair of perpendicular neighbours that
 * continue the wall (the +x/+y and -x/-y corners only when not all four do), else one straight piece, along x when
 * there is a -x neighbour or a +x one without a +y one, otherwise along y.
 */
function gamePieces({ left, right, up, down }) {
	const all = left && right && up && down;
	const pieces = [];
	if (right && up) pieces.push(['right', 'up']);
	if (right && down && !all) pieces.push(['right', 'down']);
	if (left && up && !all) pieces.push(['left', 'up']);
	if (left && down) pieces.push(['left', 'down']);
	if (pieces.length) return pieces;
	return [left || (right && !down) ? ['left', 'right'] : ['up', 'down']];
}

/** a piece reaching toward -x covers the left quarter, one reaching toward +y the right quarter; all the back one */
function quartersOf(pieces) {
	let bitsFilled = 0;
	for (const arms of pieces) {
		if (arms.includes('left')) bitsFilled |= WALL_LEFT;
		if (arms.includes('down')) bitsFilled |= WALL_RIGHT;
	}
	return bitsFilled;
}

function parse(rows) {
	const codes = { '.': [TILE.VOID, 0], f: [TILE.FLOOR, 0], '#': [TILE.WALL, 0], d: [TILE.DOOR, 0], o: [TILE.DOOR, 8], e: [TILE.EXIT, 0], t: [TILE.OUTWALL, 0], p: [TILE.PILLAR, 0] };
	const h = rows.length, w = rows[0].length;
	const cells = rows.flatMap((row) => [...row].flatMap((c) => codes[c]));
	return { w, h, cells, masks: wallQuarters({ w, h, cells }) };
}

function describe(near) {
	return Object.entries(near).filter(([, on]) => on).map(([side]) => side).join('+') || 'none';
}

function bits(m) {
	return [[WALL_LEFT, 'left'], [WALL_RIGHT, 'right'], [OPEN_LEFT, 'open-left'], [OPEN_RIGHT, 'open-right'], [FLOOR_SHOWS, 'floor']]
		.filter(([bit]) => m & bit).map(([, name]) => name).join(' ') || 'none';
}
