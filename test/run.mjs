// End-to-end check: JS generate(type, seed) vs oracle dumps (tools/oracle `gen`/`batch` output).
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/run.mjs [dir-or-files...]      default: test/fixtures
//   node test/run.mjs --types=0,8 DIR        only some dungeon types
//
// Reports, per dungeon, the first differing cells/objects/critters and the final RNG states.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTables } from '../js/gen/index.js';
import { generate } from '../js/gen/generate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
initTables(JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8')));

const args = process.argv.slice(2);
const typesArg = args.find((a) => a.startsWith('--types='));
const types = typesArg ? new Set(typesArg.slice(8).split(',').map(Number)) : null;
const verbose = args.includes('-v');
const inputs = args.filter((a) => !a.startsWith('-'));
if (!inputs.length) inputs.push(path.join(here, 'fixtures'));

const files = [];
for (const p of inputs) {
	if (fs.statSync(p).isDirectory()) {
		for (const f of fs.readdirSync(p)) if (/^\d+-\d+\.json$/.test(f)) files.push(path.join(p, f));
	} else files.push(p);
}
files.sort();

function diffLevel(got, exp) {
	const out = [];
	for (const k of ['w', 'h', 'a', 'y', 'A']) if (got[k] !== exp[k]) out.push(`${k}: ${got[k]} != ${exp[k]}`);
	if (got.cells.length !== exp.cells.length) out.push(`cells length ${got.cells.length} != ${exp.cells.length}`);
	else {
		let n = 0;
		for (let i = 0; i < exp.cells.length; i += 2) {
			if (got.cells[i] !== exp.cells[i] || got.cells[i + 1] !== exp.cells[i + 1]) {
				const c = i / 2;
				if (n < 5) out.push(`cell ${c % exp.w},${Math.floor(c / exp.w)}: [${got.cells[i]},${got.cells[i + 1]}] != [${exp.cells[i]},${exp.cells[i + 1]}]`);
				n++;
			}
		}
		if (n > 5) out.push(`… ${n} cells differ`);
	}
	for (const key of ['objects', 'critters', 'rooms']) {
		const a = got[key], b = exp[key];
		if (a.length !== b.length) out.push(`${key}: ${a.length} != ${b.length}`);
		const n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++) {
			const ja = JSON.stringify(a[i]), jb = JSON.stringify(b[i]);
			if (ja !== jb) { out.push(`${key}[${i}]: ${ja} != ${jb}`); break; }
		}
	}
	for (const k of ['e', 'f', 'w']) if (got.rng[k] !== exp.rng[k]) out.push(`rng.${k}: ${got.rng[k]} != ${exp.rng[k]}`);
	return out;
}

let pass = 0, fail = 0, skipped = 0;
const t0 = Date.now();
for (const file of files) {
	const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (types && !types.has(exp.type)) continue;
	if (exp.error) { skipped++; continue; }
	let diffs;
	try {
		diffs = diffLevel(generate(exp.type, exp.seed), exp);
	} catch (e) {
		diffs = [`threw ${verbose ? e.stack : e.message}`];
	}
	if (diffs.length) {
		fail++;
		console.log(`FAIL ${path.basename(file)}`);
		for (const d of diffs.slice(0, verbose ? 30 : 6)) console.log('     ' + d);
	} else {
		pass++;
		if (verbose) console.log(`ok   ${path.basename(file)}`);
	}
}
console.log(`${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (oracle error)` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(fail ? 1 : 0);
