// Walls (js/view/walls.js): which arms of its centre bar each wall cell gets, checked against the game's own choice of
// wall pieces (c30.D) on every neighbour combination, plus what joins a wall and which arm ends show, on small
// hand-made maps.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/walls.mjs
import { wallArms, armBits, ARM_LEFT, ARM_RIGHT, ARM_UP, ARM_DOWN, OPEN_LEFT, OPEN_DOWN } from '../js/view/walls.js';
import { TILE } from '../js/view/catalog.js';

const ARMS = ARM_LEFT | ARM_RIGHT | ARM_UP | ARM_DOWN;
const ARM_OF = { left: ARM_LEFT, right: ARM_RIGHT, up: ARM_UP, down: ARM_DOWN };

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

// ---- the arm rule, on all 16 neighbour combinations: the arms of the pieces the game draws ------------------------
for (let n = 0; n < 16; n++) {
	const near = { left: !!(n & 1), right: !!(n & 2), up: !!(n & 4), down: !!(n & 8) };
	const expected = armsOf(gamePieces(near));
	check(`neighbours ${describe(near)}`, armBits(near) === expected, `got ${bits(armBits(near))}, game pieces give ${bits(expected)}`);
}

// ---- small maps: . rock, f floor, # wall, d doorway, o opening in forest or cave rock, e exit, t forest, p pillar --
{
	const map = parse([
		'......',
		'.####d',
		'.ffff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('a wall run is a bar along x', (at(2, 1) & ARMS) === (ARM_LEFT | ARM_RIGHT), bits(at(2, 1)));
	check('inside a run the -x end is hidden', !(at(2, 1) & OPEN_LEFT), bits(at(2, 1)));
	check('a run facing a room shows its +y end', !!(at(2, 1) & OPEN_DOWN), bits(at(2, 1)));
	check('the end of a run still reaches both edges', (at(1, 1) & ARMS) === (ARM_LEFT | ARM_RIGHT), bits(at(1, 1)));
	check('the end of a run shows its -x end', !!(at(1, 1) & OPEN_LEFT), bits(at(1, 1)));
	check('a doorway continues the wall', (at(4, 1) & ARMS) === (ARM_LEFT | ARM_RIGHT), bits(at(4, 1)));
	check('cells that are not walls get no bits', map.masks.every((m, i) => map.cells[2 * i] === TILE.WALL || m === 0));
}
{
	const map = parse([
		'.....',
		'.#o#.',
		'.fff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('an opening in forest or cave rock does not continue the wall', (at(1, 1) & ARMS) === (ARM_UP | ARM_DOWN), bits(at(1, 1)));
}
{
	const map = parse([
		'.....',
		'.#e#.',
		'.#ff.',
		'.#ff.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('an exit continues the wall', (at(3, 1) & ARMS) === (ARM_LEFT | ARM_RIGHT), bits(at(3, 1)));
	check('a corner is an L toward its two neighbours', (at(1, 1) & ARMS) === (ARM_RIGHT | ARM_DOWN), bits(at(1, 1)));
	check('a wall run along y is a bar along y', (at(1, 2) & ARMS) === (ARM_UP | ARM_DOWN), bits(at(1, 2)));
	check('inside a run along y the +y end is hidden', !(at(1, 2) & OPEN_DOWN), bits(at(1, 2)));
}
{
	const map = parse([
		'.....',
		'.p#t.',
		'..t..',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('pillars and forest do not continue a wall', (at(2, 1) & ARMS) === (ARM_UP | ARM_DOWN), bits(at(2, 1)));
}
{
	const map = parse([
		'.#.',
		'###',
		'.#.',
	]);
	const at = (x, y) => map.masks[y * map.w + x];
	check('a crossing has all four arms', (at(1, 1) & ARMS) === ARMS, bits(at(1, 1)));
	check('a T has the arms of its three neighbours', (parse(['...', '###', '.#.']).masks[4] & ARMS) === (ARM_LEFT | ARM_RIGHT | ARM_DOWN));
	check('a lone wall is the bar along y', (parse(['...', '.#.', '...']).masks[4] & ARMS) === (ARM_UP | ARM_DOWN));
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

/**
 * The pieces the game draws for a wall cell (c30.D), each named by the two sides it reaches: a corner piece for each
 * pair of perpendicular neighbours that continue the wall (the +x/+y and -x/-y corners only when not all four do),
 * else one straight piece, along x when there is a -x neighbour or a +x one without a +y one, otherwise along y.
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

/** every piece is the centre square with an arm to each side it reaches */
function armsOf(pieces) {
	let arms = 0;
	for (const sides of pieces) for (const side of sides) arms |= ARM_OF[side];
	return arms;
}

function parse(rows) {
	const codes = { '.': [TILE.VOID, 0], f: [TILE.FLOOR, 0], '#': [TILE.WALL, 0], d: [TILE.DOOR, 0], o: [TILE.DOOR, 8], e: [TILE.EXIT, 0], t: [TILE.OUTWALL, 0], p: [TILE.PILLAR, 0] };
	const h = rows.length, w = rows[0].length;
	const cells = rows.flatMap((row) => [...row].flatMap((c) => codes[c]));
	return { w, h, cells, masks: wallArms({ w, h, cells }) };
}

function describe(near) {
	return Object.entries(near).filter(([, on]) => on).map(([side]) => side).join('+') || 'none';
}

function bits(m) {
	return [[ARM_LEFT, 'left'], [ARM_RIGHT, 'right'], [ARM_UP, 'up'], [ARM_DOWN, 'down'], [OPEN_LEFT, 'open-left'], [OPEN_DOWN, 'open-down']]
		.filter(([bit]) => m & bit).map(([, name]) => name).join(' ') || 'none';
}
