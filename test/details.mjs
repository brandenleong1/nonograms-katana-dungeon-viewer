// Added contents and item distinctions extend #52's catalog without replacing its creature names or kinds.
// Standalone suite: npm test and CI run it (tools/run-tests.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../js/gen/index.js';
import { initTables, zw, vj0 } from '../js/gen/statics.js';
import { generate } from '../js/gen/generate.js';
import * as catalog from '../js/view/catalog.js';
import { occupantHtml, mimicChance } from '../js/ui/occupant.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const names = read('../data/names.json');
initTables(read('../data/tables.json'));
const level = generate(8, 172582050);
const ctx = { level, names, profile: vj0.i2 };
const object = (rec, context = ctx) => occupantHtml({ object: rec }, context);
const creature = (rec, context = ctx) => occupantHtml({ critter: rec }, context);
assert.equal(catalog.itemName?.(113, names), 'MALU (quest)');
for (const [id, label] of [[114, 'Punched card (quest)'], [256, 'Red diamond (quest)'], [260, 'Red diamond'], [262, 'MALU'], [263, 'Punched card'], [305, 'Secret name (Eternal)'], [306, 'Secret name (Ephemeral)']]) {
	assert.equal(catalog.itemName(id, names), label);
}
for (const [id, material] of [[299, 'Alabaster'], [300, 'Basalt'], [301, 'Bronze'], [302, 'Obsidian']]) assert.ok(catalog.itemName(id, names).endsWith('(' + material + ')'));
for (const [variant, map, fragment] of [[1, 50, 53], [2, 51, 54], [3, 52, 55], [4, 90, 57]]) {
	assert.equal(catalog.itemName(map, names), 'Treasure map (' + variant + ')');
	assert.equal(catalog.itemName(fragment, names), 'Treasure map fragment (map ' + variant + ')');
}
assert.equal(catalog.itemName(9999, { items: { 9999: 'Fallback' } }), 'Fallback');
assert.equal(catalog.itemName(9999), 'item 9999');
assert.match(object(level.objects.find((o) => o.x === 33 && o.y === 35)), /Holds <b>Meteoric Iron<\/b>/);
assert.match(object({ id: 37, g: 0 }), /Holds <b>Treasure<\/b>/);
assert.doesNotMatch(object({ id: 37, g: -1 }), /Holds/);
assert.match(object({ id: 37, g: 128 }), /Holds <b>Meteoric Iron<\/b>/);
assert.doesNotMatch(object({ id: 37, g: 128, e: 1 }), /Holds/);
assert.match(object({ id: 37, g: 128, e: 1 }), /Already collected or used/);
assert.doesNotMatch(object({ id: 21, g: -1, f: 1 }), /mental power to open/);
assert.match(object({ id: 124, g: 0 }), /Holds <b>Papyrus [(]plant[)]<\/b>/);
assert.match(object({ id: 3 }), /20% chance of a hidden creature; it carries these contents/);
assert.doesNotMatch(object({ id: 3, e: 1 }), /chance/);
assert.match(object({ id: 54 }), /50% chance of a Garganbee/);
assert.match(object({ id: 95 }), /Restores 10 energy and lights your torch/);
assert.doesNotMatch(object({ id: 95, e: 1 }), /Restores 10 energy/);
for (const id of [3, 26, 104, 105, 106, 94]) assert.equal(mimicChance({ id }, zw.M[0]), 20);
assert.equal(mimicChance({ id: 2 }, zw.M[0]), 0);
assert.equal(mimicChance({ id: 2 }, zw.M[15]), 8);
assert.equal(mimicChance({ id: 2 }, zw.M[19]), 8);
assert.equal(mimicChance({ id: 2 }, zw.M[23]), 0);
assert.equal(mimicChance({ id: 4 }, zw.M[0]), 0);
assert.equal(catalog.objectName({ id: 5 }), 'Knight statue');
assert.equal(catalog.objectName({ id: 12 }), 'Three barrels');
assert.equal(catalog.objectName({ id: 107 }), 'Group of woven baskets');
assert.equal(catalog.objectName({ id: 89 }), 'Furnishing');
assert.equal(catalog.objectName({ id: 28 }, 'Forest'), 'Tree stump door');
assert.equal(catalog.objectName({ id: 32, h: 1201 }, 'Cave'), 'Railroad switch');
assert.equal(catalog.critterName({ id: 643 }), 'Merytsah');
const boss = level.critters.find((c) => c.x === 43 && c.y === 10);
assert.match(creature(boss), /Bone Dragon/);
assert.match(creature(boss), /HP <b>85<\/b> · damage <b>9<\/b> · defence <b>5<\/b>/);
assert.match(creature(boss), /Drops <b>Emerald tablet shard<\/b> and <b>Bone<\/b>/);
assert.match(creature({ id: 424, k: 0, h: 1001 }), /Punched card [(]quest[)]/);
assert.match(creature({ id: 626, k: 2 }, { ...ctx, level: { type: 26 } }), /Drops/);
for (const pet of level.critters.filter((c) => c.id >= 190 && c.id <= 193)) {
	assert.match(creature(pet), /Looks like/);
	assert.match(creature(pet), /Tame it with Taming level/);
}
const before = JSON.stringify(level);
for (const rec of level.objects) object(rec);
for (const rec of level.critters) creature(rec);
assert.equal(JSON.stringify(level), before);
console.log('Contents, mimic rules, item distinctions and retained catalog behavior passed.');
