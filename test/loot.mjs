// Standalone suite: loot indexing shares the details' item rules, without changing the dungeon.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../js/gen/index.js';
import { initTables, vj0 } from '../js/gen/statics.js';
import { generate } from '../js/gen/generate.js';
import { dungeonLoot } from '../js/ui/loot-panel.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
initTables(read('../data/tables.json'));
const level = generate(8, 172582050);
const before = JSON.stringify(level);
const ctx = { level, profile: vj0.i2, names: read('../data/names.json') };
const items = dungeonLoot(ctx);
const iron = items.find((item) => item.id === 128);
assert.equal(iron.name, 'Meteoric Iron');
assert.ok(iron.places.some((p) => p.x === 33 && p.y === 35));
for (const item of items) assert.equal(item.places.length, item.creatures + item.objects);
assert.equal(JSON.stringify(level), before);

const sample = { type: 26, objects: [{ id: 37, g: 128, x: 1, y: 1 }, { id: 37, g: 128, e: 1, x: 2, y: 2 }, { id: 37, g: -1 }], critters: [{ id: 626, k: 2, x: 3, y: 3 }] };
const loot = dungeonLoot({ ...ctx, level: sample });
assert.equal(loot.find((item) => item.id === 128).objects, 1);
for (const id of [309, 307]) assert.equal(loot.find((item) => item.id === id).creatures, 1);
assert.deepEqual(dungeonLoot({ ...ctx, level: { type: 8, objects: [], critters: [] } }), []);
console.log('Loot locations, consumed objects, boss drops and unchanged dungeon passed.');
