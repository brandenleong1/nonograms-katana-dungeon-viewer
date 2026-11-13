// Which parts of each wall cell are wall, following how the game draws walls (c30.D, the wall branch of its cell
// pass). The game doesn't draw a wall cell as one block: it picks wall pieces by which of the four neighbours continue
// the wall (a straight piece along x or y, a corner piece per pair of perpendicular neighbours, a T or a crossing as
// two corner pieces), and each piece fills part of the cell. As a 2 × 2 grid of quarters:
//
//   back quarter  (+x, −y; the top of the diamond on screen): always wall. The cell's run along x and its run
//                 along y meet here.
//   left quarter  (−x, −y): wall when the wall goes on to the −x neighbour, or when it only runs along x
//                 (a +x neighbour and no ±y neighbours).
//   right quarter (+x, +y): wall when the wall goes on to the +y neighbour, or when it has no ±x neighbour (it runs
//                 only along y, or stands alone).
//   front quarter (−x, +y; the bottom of the diamond): never wall. The floor shows there.
//
// So a straight wall is the back half of its cell and a corner or a T fills one, two or three quarters. A neighbour
// continues the wall when it is a wall, an exit, or a doorway other than an opening in forest or cave rock
// ((b & 24) == 8, ww.w); diagonal neighbours never matter. The game also needs the neighbour to be revealed; this map
// shows everything.
//
// The game draws a wall cell's floor only when the three cells in front of it (−x, +y and the corner between) are
// revealed, or when one of the two beside it is forest. That is what puts the open quarter at the front: the floor
// in front of a room's back walls widens the room by half a cell, and walls facing the unexplored outside get no
// floor. Here "revealed" means "not solid rock". (The game also lowers walls that stand in front of the hero's room,
// c30.O0; this map has no hero position to do that for.)
import { TILE } from './catalog.js';

export const WALL_LEFT = 1;     // the left quarter is wall
export const WALL_RIGHT = 2;    // the right quarter is wall
export const OPEN_LEFT = 4;     // the left quarter's −x side doesn't touch the next wall (its face shows)
export const OPEN_RIGHT = 8;    // the right quarter's +y side doesn't touch the next wall
export const FLOOR_SHOWS = 16;  // the floor shows in the open quarters

/**
 * One byte per cell (index y * w + x): the bits above for TILE.WALL cells, 0 for every other cell. Computed once per
 * level, so drawing reads one byte per wall cell.
 * @param {{ w: number, h: number, cells: ArrayLike<number> }} level  cells: [a, b] per cell (ww.a, ww.b)
 */
export function wallQuarters({ w, h, cells }) {
	const masks = new Uint8Array(w * h);
	const tile = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TILE.VOID : cells[2 * (y * w + x)]);
	const joins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && continuesWall(cells[2 * (y * w + x)], cells[2 * (y * w + x) + 1]);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (tile(x, y) !== TILE.WALL) continue;
			const near = { left: joins(x - 1, y), right: joins(x + 1, y), up: joins(x, y - 1), down: joins(x, y + 1) };
			masks[y * w + x] = quarterBits(near)
				| (tile(x - 1, y) === TILE.WALL ? 0 : OPEN_LEFT)
				| (tile(x, y + 1) === TILE.WALL ? 0 : OPEN_RIGHT)
				| (floorShows(tile, x, y) ? FLOOR_SHOWS : 0);
		}
	}
	return masks;
}

/**
 * The quarters a wall with these neighbours fills (WALL_LEFT, WALL_RIGHT; the back quarter always). left/right are
 * the −x/+x neighbours, up/down the −y/+y ones, true when they continue the wall.
 */
export function quarterBits({ left, right, up, down }) {
	const leftQuarter = left || (right && !up && !down);
	const rightQuarter = down || (!left && !right);
	return (leftQuarter ? WALL_LEFT : 0) | (rightQuarter ? WALL_RIGHT : 0);
}

/** ww.w: walls, exits and doorways join walls; openings in forest or cave rock ((b & 24) == 8) don't */
function continuesWall(a, b) {
	return a === TILE.WALL || a === TILE.EXIT || (a === TILE.DOOR && (b & 24) !== 8);
}

function floorShows(tile, x, y) {
	const forest = (t) => t === TILE.OUTWALL || t === TILE.OUTDOOR || t === TILE.BUSH;
	if (forest(tile(x - 1, y)) || forest(tile(x, y + 1))) return true;
	return tile(x - 1, y) !== TILE.VOID && tile(x, y + 1) !== TILE.VOID && tile(x - 1, y + 1) !== TILE.VOID;
}
