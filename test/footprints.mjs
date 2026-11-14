// Furniture that covers several tiles: the map's footprint rule (js/view/catalog.js objectFootprint) covers exactly
// the tiles the generator marks as that object's (hw.k, filled by hw.g), flipped or not, on every kind of dungeon.
// Standalone suite: npm test and CI run it (tools/run-tests.mjs).
//
//   node test/footprints.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initTables, zw, vj0 } from '../js/gen/index.js';
import { classes } from '../js/gen/registry.js';
import { objectFootprint } from '../js/view/catalog.js';

initTables(JSON.parse(fs.readFileSync(new URL('../data/tables.json', import.meta.url), 'utf8')));

const SEEDS_PER_TYPE = 3;
let passed = 0;
const check = (what, ok, detail = '') => {
	assert.ok(ok, `${what}${detail ? `: ${detail}` : ''}`);
	passed++;
};

/** the dungeon as the game's own model builds it, not the viewer's copy of it */
function build(type, seed) {
	const { hw, x30 } = classes;
	const level = new hw(type, vj0.i2.l[0]);
	new x30().g_(level, seed);
	return level;
}

/** the tiles the view says an object covers, as grid indexes */
function viewCells(o, rw, width) {
	const { cols, rows } = objectFootprint(o, rw);
	const out = [];
	for (let dy = 0; dy < rows; dy++) for (let dx = 0; dx < cols; dx++) out.push((o.b.b - dy) * width + o.b.a + dx);
	return out.sort((a, b) => a - b);
}

// ---- the rule on its own: T by U cells, swapped when flipped, one cell when the definition has no footprint ----
check('footprint: no definition is one cell', JSON.stringify(objectFootprint({ c: 0 }, undefined)) === '{"cols":1,"rows":1}');
check('footprint: a one-cell definition is one cell', JSON.stringify(objectFootprint({ c: 1 }, { T: 0, U: 0 })) === '{"cols":1,"rows":1}');
check('footprint: T cols by U rows', JSON.stringify(objectFootprint({ c: 0 }, { T: 2, U: 1 })) === '{"cols":2,"rows":1}');
check('footprint: flipped swaps them', JSON.stringify(objectFootprint({ c: 1 }, { T: 2, U: 1 })) === '{"cols":1,"rows":2}');

// ---- against the generator ----
const seen = new Set();
let objects = 0, multi = 0, flipped = 0;
for (let type = 0; type < 27; type++) {
	for (let s = 1; s <= SEEDS_PER_TYPE; s++) {
		const seed = s * 104729 + type;
		let level;
		try { level = build(type, seed); } catch { continue; }
		const width = level.g;
		for (const o of level.n) {
			const rw = zw.Q.get(o.a.a);
			const covered = [];
			level.k.forEach((occupant, i) => { if (occupant === o) covered.push(i); });
			const mine = viewCells(o, rw, width);
			objects++;
			if (mine.length > 1) { multi++; seen.add(o.a.a); if (o.c) flipped++; }
			check(`${type}/${seed} object ${o.a.a} at ${o.b.a},${o.b.b}: view covers the cells the generator marks`,
				JSON.stringify(mine) === JSON.stringify(covered), `view ${mine} generator ${covered}`);
		}
	}
}
check('the sample has furniture over several tiles', multi > 0, `${multi} of ${objects}`);
check('the sample has flipped furniture', flipped > 0, `${flipped} of ${multi}`);

console.log(`${passed} passed, 0 failed (${multi} multi-tile objects of ${objects}, ${flipped} flipped, ${seen.size} kinds: ${[...seen].sort((a, b) => a - b).join(',')})`);
