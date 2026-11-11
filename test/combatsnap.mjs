// Method snapshot test for the combat engine, against the oracle's fight-mode snapshots (FightHarness --snap).
//
//   O=../nonograms-katana/tools/oracle
//   $O/run.sh fightgen 8 172582050 12345 auto - /tmp/f.json --kit --level 10 --fuzz 200 --snap 'c30.e(' test/oracle/c-e 30
//   NK_TRACE_CLASSES=c30,hw $O/run.sh fightgen ... --snap 'hw.t(' test/oracle/c-hwt 50
//   node test/combatsnap.mjs [-v] [--ignore=f1,f2] [--save=guild.dat|zip] <snapdir>...
//
// For every <n>-entry.json / <n>-exit.json pair (recursively): fresh static tables, revive the entry state
// [self, args, hw] (one graph, so identity is kept), put headless stand-ins in for the opaque view / context
// (c30.e, c30.d), call self[name + '_'](...args) (static methods: the class's, e.g. c30.q0_), then deep-compare
// [self, return value, hw] with the exit state (js/gen/compare.js), and the number of hw.x draws with the oracle's
// (exit nx - entry nx). c30's render-only lists / counters are ignored (DEFAULT_IGNORE; add more with --ignore).
// Fight-mode (save) snapshots need --save: the profile vj0.i2 is not in the snapshot (only the hero nw is).
import fs from 'node:fs';
import path from 'node:path';
import { initTables, classes, zw, vj0 } from '../js/gen/index.js';
import '../js/combat/all.js';
import { revive } from '../js/gen/revive.js';
import { compare } from '../js/gen/compare.js';
import { tables } from '../js/gen/statics.js';
import { resetStatics, applyStatics } from '../js/combat/setup.js';
import { Context, DungameView } from '../js/combat/input.js';
import { watchRng } from '../js/combat/record.js';
import { errText } from '../js/combat/driver.js';
import { importSave } from '../js/save/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
initTables(tablesJson);

// c30 fields only the renderer uses: floating texts / flashes / sprite pick list / render caches and their
// counters, and the sprite-size scratch point Y0 (A0 rewrites it from the floating-text list)
const DEFAULT_IGNORE = ['C0', 'D0', 'I0', 'J0', 'Q0', 'R0', 'S0', 'T0', 'U0', 'V0', 'Y0'];

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const ignore = DEFAULT_IGNORE.concat((args.find((a) => a.startsWith('--ignore=')) || '--ignore=').slice(9).split(',').filter(Boolean));
const savePath = (args.find((a) => a.startsWith('--save=')) || '').slice(7) || null;
const dirs = args.filter((a) => !a.startsWith('-'));
if (!dirs.length) {
	console.error('usage: node test/combatsnap.mjs [-v] [--ignore=f1,f2] [--save=FILE] <snapdir>...');
	process.exit(2);
}
const saveBytes = savePath ? fs.readFileSync(savePath) : null;

function pairs(dir) {
	const out = [];
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		if (fs.statSync(p).isDirectory()) out.push(...pairs(p));
		else if (name.endsWith('-entry.json')) out.push([p, p.replace(/-entry\.json$/, '-exit.json')]);
	}
	return out.sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
}

/** headless stand-ins for what the oracle wrote as opaque strings (put back by unpatch before comparing) */
const patched = [];
function patchOpaque(v) {
	if (v instanceof classes.c30) {
		patched.push([v, v.d, v.e]);
		if (typeof v.d === 'string' || v.d == null) v.d = new Context();
		if (typeof v.e === 'string' || v.e == null) {
			v.e = new DungameView();
			v.e.u = v;
			v.e.a = v.d;
		}
	}
}
function unpatch() {
	for (const [v, d, e] of patched) { v.d = d; v.e = e; }
	patched.length = 0;
}

/** static holder for a snapshot class name: a class (c30.q0_) or a static namespace (zw.o_) */
const statics = { zw, vj0 };

let pass = 0, fail = 0, skip = 0;
for (const dir of dirs) {
	for (const [entryPath, exitPath] of pairs(dir)) {
		const label = path.relative(process.cwd(), entryPath);
		if (!fs.existsSync(exitPath)) { skip++; if (verbose) console.log(`SKIP ${label} (no exit: the method threw)`); continue; }
		const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
		const exit = JSON.parse(fs.readFileSync(exitPath, 'utf8'));
		resetStatics(tablesJson);
		if (saveBytes) {
			const imp = await importSave(saveBytes);
			vj0.i2 = imp.vj0;
			vj0.i2.K0 = null;
		}
		const name = entry.method.slice(0, entry.method.indexOf('(')) + '_';
		const isVoid = entry.method.endsWith(')V');
		let diffs;
		try {
			const [self, callArgs, hw] = revive(entry.state, tables);
			const level = hw || (self && self.a instanceof classes.hw ? self.a : null);
			if (level) applyStatics(level);
			patchOpaque(self);
			for (const a of callArgs || []) patchOpaque(a);
			let draws = 0;
			if (level) watchRng(level.x, () => { draws++; });
			const holder = self != null ? self : classes[entry.class] || statics[entry.class];
			if (holder == null || typeof holder[name] !== 'function') throw new Error(`${entry.class}.${name} is not ported`);
			const ret = holder[name](...(callArgs || []));
			unpatch();
			const [eSelf, eRet, eHw] = revive(exit.state, tables);
			const got = [self, isVoid ? null : ret === undefined ? null : ret];
			const want = [eSelf, isVoid ? null : eRet];
			if (eHw !== undefined) { got.push(level); want.push(eHw); }
			diffs = compare(got, want, { ignore });
			if (entry.nx != null && exit.nx != null && draws !== exit.nx - entry.nx) diffs.push(`hw.x draws: js ${draws}, oracle ${exit.nx - entry.nx}`);
		} catch (e) {
			diffs = [`threw ${verbose ? e.stack : errText(e)}`];
		}
		patched.length = 0;
		if (diffs.length) {
			fail++;
			console.log(`FAIL ${label} ${entry.class}.${entry.method}`);
			for (const d of diffs.slice(0, verbose ? 30 : 6)) console.log('     ' + d.replace(/^\$\[0\]/, 'self').replace(/^\$\[1\]/, 'ret').replace(/^\$\[2\]/, 'hw'));
		} else {
			pass++;
			if (verbose) console.log(`ok   ${label}`);
		}
	}
}
console.log(`${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
