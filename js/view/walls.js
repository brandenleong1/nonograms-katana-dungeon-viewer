// How each wall cell is shaped, following how the game picks its wall pieces (c30.D, the wall branch of its cell
// pass). A wall is a bar through the middle of its cell, not a full block: a centre square WALL_CORE tiles wide, plus
// an arm from it to the edge of the cell toward each neighbour the wall goes on to, where it meets that neighbour's
// arm. The edges and corners of the cell that no arm covers are floor. As a 3 × 3 grid with a wide middle:
//
//   straight      a bar through the middle          corner   an L through the centre
//   T, crossing   the arms of both corners           alone    a bar along y (see below)
//
// The game draws a straight piece along x when the wall goes on to the −x neighbour, or to the +x one and not to the
// ±y ones; a straight piece along y when it goes on to neither x neighbour; and a corner piece for each pair of
// perpendicular neighbours it goes on to (a T or a crossing is two corner pieces). So the arms are the neighbours the
// wall goes on to, except that a wall going on only along one axis runs through to both edges, and a wall going on
// nowhere is the straight piece along y.
//
// A neighbour continues the wall when it is a wall, an exit, or a doorway other than an opening in forest or cave rock
// ((b & 24) == 8, ww.w); pillars, forest and cave rock don't, and diagonal neighbours never matter. The game also needs
// the neighbour to be revealed; this map shows everything. (The game lowers walls in front of the hero's room,
// c30.O0; this map has no hero room to do that for.)
import { TILE } from './catalog.js';

export const ARM_LEFT = 1;     // an arm toward −x
export const ARM_RIGHT = 2;    // toward +x
export const ARM_UP = 4;       // toward −y
export const ARM_DOWN = 8;     // toward +y
export const OPEN_LEFT = 16;   // the −x arm's end shows: the −x neighbour isn't a wall whose arm meets it
export const OPEN_DOWN = 32;   // the +y arm's end shows

// The width of the wall bar (the centre square's side), in tiles. In the game's screenshots a wall's top is about a
// third of a tile across, and its round pillars about three quarters; 0.4 keeps the centre the widest band.
export const WALL_CORE = 0.4;

/**
 * One byte per cell (index y * w + x): the bits above for TILE.WALL cells, 0 for every other cell. Computed once per
 * level, so drawing reads one byte per wall cell.
 * @param {{ w: number, h: number, cells: ArrayLike<number> }} level  cells: [a, b] per cell (ww.a, ww.b)
 */
export function wallArms({ w, h, cells }) {
	const masks = new Uint8Array(w * h);
	const tile = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TILE.VOID : cells[2 * (y * w + x)]);
	const joins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && continuesWall(cells[2 * (y * w + x)], cells[2 * (y * w + x) + 1]);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (tile(x, y) !== TILE.WALL) continue;
			const near = { left: joins(x - 1, y), right: joins(x + 1, y), up: joins(x, y - 1), down: joins(x, y + 1) };
			masks[y * w + x] = armBits(near)
				| (tile(x - 1, y) === TILE.WALL ? 0 : OPEN_LEFT)
				| (tile(x, y + 1) === TILE.WALL ? 0 : OPEN_DOWN);
		}
	}
	return masks;
}

/**
 * The arms of a wall with these neighbours (ARM_* bits). left/right are the −x/+x neighbours, up/down the −y/+y
 * ones, true when they continue the wall.
 */
export function armBits({ left, right, up, down }) {
	const alongX = left || right, alongY = up || down;
	const onlyX = alongX && !alongY, onlyY = !alongX;   // a lone wall counts as running along y
	return (left || onlyX ? ARM_LEFT : 0) | (right || onlyX ? ARM_RIGHT : 0)
		| (up || onlyY ? ARM_UP : 0) | (down || onlyY ? ARM_DOWN : 0);
}

/** ww.w: walls, exits and doorways join walls; openings in forest or cave rock ((b & 24) == 8) don't */
function continuesWall(a, b) {
	return a === TILE.WALL || a === TILE.EXIT || (a === TILE.DOOR && (b & 24) !== 8);
}
