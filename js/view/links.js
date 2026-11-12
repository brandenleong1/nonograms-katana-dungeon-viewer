// Paired objects: ladder 40 <-> hatch 38/39 (town 74), portal 88 <-> 88, teleporter 126 <-> 126,
// lever 32 <-> gate 33. Pairs share qw.h (h = 1201 marks arena checkpoint keys, which have no gate).
import { linkGroup } from './catalog.js';

export const LINK_COLORS = { ladder: '#47f3ff', portal: '#ce47ff', teleport: '#ce47ff', gate: '#ffe047' };

export function partners(level, obj) {
	const g = linkGroup(obj);
	if (!g || !obj.h) return [];
	return level.objects.filter((o) => o !== obj && linkGroup(o) === g && o.h === obj.h);
}

export function allLinks(level) {
	const out = [];
	const done = new Set();
	for (const o of level.objects) {
		if (done.has(o)) continue;
		for (const p of partners(level, o)) {
			if (done.has(p)) continue;
			out.push([o, p, LINK_COLORS[linkGroup(o)]]);
		}
		done.add(o);
	}
	return out;
}

/**
 * Floor nonogram (c30.u0): 8x8 block whose top-left is the first cell (row-major) with floor code 12.
 * Rows/cols 0..2 hold clues; the inner 5x5 (offset 3..7) must match pattern zw.O[hw.A] (-1 = filled).
 */
export function floorNonogram(level, patterns) {
	const corner = nonogramCorner(level);
	if (!corner) return null;
	const { x0, y0 } = corner;
	const pat = patterns[level.A];
	const out = [];
	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			const v = pat[r * 8 + c];
			const inGrid = r >= 3 && c >= 3;
			if (inGrid && v !== 0) out.push([x0 + c, y0 + r, 'fill']);
			else if (!inGrid && v > 0) out.push([x0 + c, y0 + r, 'clue', String(v)]);
		}
	}
	return { x0, y0, cells: out };
}

/** the first cell (row-major) with floor code 12, or null when the level has no floor nonogram */
function nonogramCorner({ w, h, cells }) {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (cells[2 * i] === 1 && (cells[2 * i + 1] & 63) === 12) return { x0: x, y0: y };
		}
	}
	return null;
}
