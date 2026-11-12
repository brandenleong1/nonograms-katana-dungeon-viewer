// The route planner (js/plan/planner.js): its cached path searches answer for the source and gate mask they were asked
// for. In dungeons with seven or more gates, 5C-523876026 among them, cache keys used to collide.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/planner.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables, zw } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';
import { planRoute } from '../js/plan/planner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
initTables(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tables.json'), 'utf8')));

const OPTIONS = { rw: (id) => zw.Q.get(id), bw: (id) => zw.R.get(id), pwOf: (t) => zw.M[t], patterns: zw.O, tiles: zw.u };
let passed = 0;
const failures = [];
const check = (what, ok, detail = '') => {
	if (ok) passed++;
	else failures.push(`${what}${detail ? `: ${detail}` : ''}`);
};

// 5C-523876026: seven gates, so masks reach 64 and more
const plan = planRoute(generate(14, 523876026), OPTIONS);
const { bfs, gates, start } = plan.debug;
check('5C-523876026 has seven or more gates', gates.length >= 7, `${gates.length}`);

// the old key src * 64 + mask made (start + 1, 0) and (start, 64) the same entry
bfs(start + 1, 0);
check('a search with mask 64 starts at its own source', bfs(start, 64).dist[start] === 0, `distance ${bfs(start, 64).dist[start]}`);

// every source is at distance 0 from itself, for every mask, whatever was searched before
const masks = [0, 1, 63, 64, 65, 127, (1 << gates.length) - 1];
const sources = [start, start + 1, start - 1, start + plan.legs.length];
for (const mask of masks) for (const src of sources) bfs(src, mask);
for (const mask of masks) {
	for (const src of sources) check(`source ${src}, mask ${mask}`, bfs(src, mask).dist[src] === 0, `distance ${bfs(src, mask).dist[src]}`);
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
