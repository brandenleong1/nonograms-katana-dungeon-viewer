// Runs every standalone test suite: each file in test/ whose header has a "// Standalone suite:" line. `npm test` and
// CI (precommit, postcommit) run this, so adding a suite needs no CI change: give the new file that line. Suites that
// need the maintainer's oracle data or a browser (docs/testing.md) don't have it.
//
//   node tools/run-tests.mjs           run them all, in name order; fails if any fails
//   node tools/run-tests.mjs --list    print which files it would run
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(ROOT, 'test');
const MARKER = /^\/\/ Standalone suite:/m;

const suites = fs.readdirSync(TEST_DIR)
	.filter((f) => f.endsWith('.mjs') && MARKER.test(fs.readFileSync(path.join(TEST_DIR, f), 'utf8')))
	.sort();
if (!suites.length) {
	console.error('No standalone suites found in test/ (files with a "// Standalone suite:" line).');
	process.exit(1);
}
if (process.argv.includes('--list')) {
	for (const f of suites) console.log(`test/${f}`);
	process.exit(0);
}

const failed = [];
for (const f of suites) {
	console.log(`\n== test/${f}`);
	const run = spawnSync(process.execPath, [path.join('test', f)], { cwd: ROOT, stdio: 'inherit' });
	if (run.status !== 0) failed.push(`test/${f} (${run.status === null ? run.signal : `exit ${run.status}`})`);
}
console.log(`\n${suites.length - failed.length} of ${suites.length} suites passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
