// Phase test against oracle snapshots.
//
//   node test/snaptest.mjs <dir>...      dir = snapbatch output (…/<type>-<seed>/) or its parent
//
// For every <n>-entry.json / <n>-exit.json pair: revive [self, args] from the entry state, call
// self[method](...args) with the JS port, and deep-compare self with the oracle's exit state.
import fs from 'node:fs';
import path from 'node:path';
import { initTables } from '../js/gen/index.js';
import { revive } from '../js/gen/revive.js';
import { compare } from '../js/gen/compare.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tables = initTables(JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8')));

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const ignore = (args.find((a) => a.startsWith('--ignore=')) || '--ignore=').slice(9).split(',').filter(Boolean);
const dirs = args.filter((a) => !a.startsWith('-'));
if (!dirs.length) {
	console.error('usage: node test/snaptest.mjs [-v] [--ignore=f1,f2] <snapdir>...');
	process.exit(2);
}

function pairs(dir) {
	const out = [];
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		if (fs.statSync(p).isDirectory()) out.push(...pairs(p));
		else if (name.endsWith('-entry.json')) out.push([p, p.replace(/-entry\.json$/, '-exit.json')]);
	}
	return out.sort();
}

let pass = 0, fail = 0;
for (const dir of dirs) {
	for (const [entryPath, exitPath] of pairs(dir)) {
		const label = path.relative(process.cwd(), entryPath);
		const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
		if (!fs.existsSync(exitPath)) { console.log(`SKIP ${label} (no exit: method threw)`); continue; }
		const exit = JSON.parse(fs.readFileSync(exitPath, 'utf8'));
		const [self, callArgs] = revive(entry.state, tables);
		const name = entry.method.slice(0, entry.method.indexOf('(')) + '_';   // ported methods end in _
		let diffs;
		try {
			if (typeof self[name] !== 'function') throw new Error(`${self.constructor.name}.${name} is not ported`);
			self[name](...callArgs);
			const [expected] = revive(exit.state, tables);
			diffs = compare(self, expected, { ignore });
		} catch (e) {
			diffs = [`threw ${verbose ? e.stack : e.message}`];
		}
		if (diffs.length) {
			fail++;
			console.log(`FAIL ${label} ${entry.method}`);
			for (const d of diffs.slice(0, verbose ? 20 : 5)) console.log('     ' + d);
		} else {
			pass++;
			if (verbose) console.log(`ok   ${label}`);
		}
	}
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
