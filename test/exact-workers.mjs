// Exact mode gives the same plan whatever the number of workers, and the same one as the inline pool: the choice
// between equal play-outs follows the job's own order, not which worker played it or when it finished. And the
// look-ahead cache (lookcache.js) changes nothing: a run that walks on every cache hit anyway finds no difference.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/exact-workers.mjs [-v]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { parseLabel } from '../js/labels.js';
import { loadEntry, resolveProfile, heroSpecOut } from '../js/solve/sim.js';
import { solveExact, InlineExactPool } from '../js/solve/exact.js';
import { candidates } from '../js/solve/policies.js';
import { buildPlan } from '../js/solve/plan.js';
import { WorkerPool } from '../js/solve/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(here, '../data/tables.json');
const tables = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
const verbose = process.argv.includes('-v');
let fails = 0, passes = 0;
const check = (name, ok, info = '') => {
	if (ok) { passes++; console.log(`ok   ${name}${verbose && info ? '  ' + info : ''}`); }
	else { fails++; console.log(`FAIL ${name}  ${info}`); }
};
const t0 = performance.now();

resetStatics(tables);
await loadEntry();
const hero = await resolveProfile({ level: 21, gear: 4, kit2: true });
// the smallest fixture that shows it: 12 fights, and a few searched inputs each is enough for equal play-outs to tie
const LABEL = '1A-1429008869';
const problem = { hero, ...parseLabel(LABEL), xseed: 12345, at: 'start' };
const options = { cands: candidates('full'), maxDecisions: 1, useItemsForMp: false };

/** the plan JSON without what depends on the machine (the wall time and the worker count), and the cache's counts */
async function solved(pool, extra = {}) {
	resetStatics(tables);
	const res = await solveExact(problem, { ...options, ...extra, pool });
	const look = await pool.call(0, 'lookStats');
	await pool.close();
	if (res.error) return { plan: { error: res.error } };
	const { perf, ...plan } = buildPlan(res, { label: LABEL, names: {}, heroSpec: heroSpecOut(hero) });
	void perf;
	return { plan, look };
}

/** where two plans first differ, as a path (for the failure message) */
function firstDifference(a, b, at = '') {
	if (JSON.stringify(a) === JSON.stringify(b)) return null;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return `${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const d = firstDifference(a[k], b[k], `${at}.${k}`);
		if (d) return d;
	}
	return at;
}

const { plan: inline, look } = await solved(new InlineExactPool(1));
check('exact: the inline plan solves', !inline.error && inline.script.inputs.length > 0, inline.error || `${inline.script.inputs.length} inputs`);
check('cache: play-outs reuse look-ahead walks', look.hits > 0 && look.walks > 0, `${look.hits} reused, ${look.walks} walked`);
for (const size of [2, 4, 8]) {
	const pool = await WorkerPool.create({ size, tables: { path: tablesPath } });
	const { plan } = await solved(pool);
	const diff = plan.error ? plan.error : firstDifference(inline, plan);
	check(`exact: ${size} workers give the inline plan`, !diff, diff || '');
}
// verify mode walks on every hit anyway (so its plan is the one without the cache) and compares it with the cached walk
const { plan: verified, look: checked } = await solved(new InlineExactPool(1), { verifyLookCache: true });
check('cache: every reused walk equals a real one', checked.hits === look.hits && checked.hits > 0 && checked.mismatches === 0, `${checked.hits} checked, ${checked.mismatches} differ`);
check('cache: the plan is the one without it', !firstDifference(inline, verified), firstDifference(inline, verified) || '');

console.log(`${passes} passed, ${fails} failed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
