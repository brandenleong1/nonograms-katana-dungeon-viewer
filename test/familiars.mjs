// Wild familiars on the map: the generator lists each one's look and rank (critter 190 + i is companion i), and the
// view draws it in the game's colour for that rank (zw.f).
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/familiars.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables, zw } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { RANK_COLORS, critterKind, critterVariant, critterColor, familiarRank } from '../js/view/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
initTables(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tables.json'), 'utf8')));

let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

const argbHex = (v) => '#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0');
check('RANK_COLORS are the game\'s rank colours (zw.f)', JSON.stringify(RANK_COLORS) === JSON.stringify(Array.from(zw.f, argbHex)),
	`${RANK_COLORS} vs ${Array.from(zw.f, argbHex)}`);

// F4-781269547: two wild familiars, ranks 3 and 2
const level = generate(18, 781269547);
check('F4-781269547 lists its two companions', JSON.stringify(level.companions) === JSON.stringify([{ id: 312, rank: 3 }, { id: 291, rank: 2 }]),
	JSON.stringify(level.companions));
const familiars = level.critters.filter((c) => critterKind(c, zw.R.get(c.id)) === 'familiar');
check('F4-781269547 has familiars 190 and 191 on the map', familiars.map((c) => c.id).join() === '190,191', familiars.map((c) => c.id).join());
const first = familiars.find((c) => c.id === 190);
check('familiar 190 is rank 3', first && familiarRank(level, first) === 3);
check('familiar 190 is drawn purple', first && critterColor('familiar', critterVariant('familiar', first, level)) === '#ae95ff');

// a level without companions (the sample fixtures) still draws a familiar, in the plain familiar colour
check('an unknown rank falls back to the familiar colour', critterColor('familiar', critterVariant('familiar', { id: 190 }, { critters: [] })) === '#cfd8e3');

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
