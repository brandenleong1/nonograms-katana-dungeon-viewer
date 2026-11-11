// End-to-end combat check: the JS engine (js/combat) against oracle fight files (tools/oracle FightHarness).
//
//   node test/combat.mjs [options] [file.json | dir]...      default dir: ~/.cache/nk-oracle/fights
//     --types=0,8      only these dungeon types
//     --only=REGEX     only files whose name matches
//     --init           compare the setup header and the init record only
//     --all            keep going after a file's first divergence (default: stop at the first per file)
//     --max=N          stop after N failing files
//     -v               show passing files and more context
//     -q               summary only
//
// Per file: build the JS fight from the file's header (specOf), compare the header (start / tele / level / gear /
// kit / heroStats / type / seed / rng0) and `init`, then apply `inputs` one by one and compare each step record.
// The first divergence prints the input index, the differing fields, and this input's hw.x draws: the oracle's
// [bound, value(, Java caller)] next to the JS ones with JS callers. Fight-mode (save) files find their save
// through index.json next to them (written by test/make-fights.sh), else <dir>/saves/<save>; profile files
// (fightgen --profile) their profile the same way, else by name in $NK_SAVE, ../nonograms-katana/saves, the synthetic
// saves (~/.cache/nk-oracle/save/synth, save/prof/synth).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initTables } from '../js/gen/index.js';
import '../js/combat/all.js';
import { newFight, specOf, errText } from '../js/combat/driver.js';
import { resetStatics } from '../js/combat/setup.js';
import { importSave } from '../js/save/index.js';
import { newFightFromProfile } from '../js/combat/entry.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
initTables(tablesJson);

const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const verbose = args.includes('-v');
const quiet = args.includes('-q');
const initOnly = args.includes('--init');
const keepGoing = args.includes('--all');
const types = opt('types') ? new Set(opt('types').split(',').map(Number)) : null;
const only = opt('only') ? new RegExp(opt('only')) : null;
const maxFail = opt('max') ? +opt('max') : Infinity;
const inputs = args.filter((a) => !a.startsWith('-'));
if (!inputs.length) inputs.push(path.join(os.homedir(), '.cache/nk-oracle/fights'));

const files = [];
for (const p of inputs) {
	if (fs.statSync(p).isDirectory()) {
		for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.json') && f !== 'index.json') files.push(path.join(p, f));
	} else files.push(p);
}
const indexes = new Map();
function indexFor(file) {
	const d = path.dirname(file);
	if (!indexes.has(d)) {
		const p = path.join(d, 'index.json');
		indexes.set(d, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
	}
	return indexes.get(d);
}

/** a --profile file's save: index.json, else <dir>/saves/, $NK_SAVE, ../nonograms-katana/saves/, the synthetic saves */
function profilePath(file, ix, name) {
	const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
	const cands = [ix && ix.save, path.join(path.dirname(file), 'saves', name),
		process.env.NK_SAVE && path.basename(process.env.NK_SAVE) === name ? process.env.NK_SAVE : null,
		path.join(RE, 'saves', name), path.join(os.homedir(), '.cache/nk-oracle/save/synth', name),
		path.join(os.homedir(), '.cache/nk-oracle/save/prof/synth', name)];
	const p = cands.find((c) => c && fs.existsSync(c));
	if (!p) throw new Error(`profile save ${name} not found`);
	return p;
}

// ---- comparison ------------------------------------------------------------------------------
const stripCallers = (rng) => (rng && rng.d ? { ...rng, d: rng.d.map((d) => [d[0], d[1]]) } : rng);
/** differing top-level fields of two records (JSON-equal per field); err texts compare by presence only */
function diffRecord(js, or) {
	const keys = [...new Set([...Object.keys(or), ...Object.keys(js)])];
	const out = [];
	for (const k of keys) {
		let a = js[k], e = or[k];
		if (k === 'err') { if ((a == null) !== (e == null)) out.push(k); continue; }
		if (k === 'rng') { a = stripCallers(a); e = stripCallers(e); }
		if (JSON.stringify(a) !== JSON.stringify(e)) out.push(k);
	}
	return out;
}

const show = (v) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 400 ? s.slice(0, 400) + '…' : s; };

function fieldDetail(k, js, or) {
	const a = js[k], e = or[k];
	const lines = [];
	if (k === 'hero' && a && e) {
		for (const h of Object.keys({ ...e, ...a })) {
			if (JSON.stringify(a[h]) !== JSON.stringify(e[h])) lines.push(`hero.${h}: js ${show(a[h])}  oracle ${show(e[h])}`);
		}
	} else if ((k === 'cr' || k === 'obj') && Array.isArray(a) && Array.isArray(e)) {
		const byS = (l) => new Map(l.map((r) => [r[0], r]));
		const ma = byS(a), me = byS(e);
		for (const s of new Set([...me.keys(), ...ma.keys()])) {
			const x = ma.get(s), y = me.get(s);
			if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${k} #${s}: js ${show(x)}  oracle ${show(y)}`);
			if (lines.length > 8) break;
		}
	} else if (k === 'rng' && a && e) {
		for (const r of ['x', 'w', 'nx', 'nw']) if (a[r] !== e[r]) lines.push(`rng.${r}: js ${a[r]}  oracle ${e[r]}`);
	} else lines.push(`${k}: js ${show(a)}  oracle ${show(e)}`);
	return lines;
}

function drawsReport(jsRec, orRec, jsCallers) {
	const od = (orRec.rng && orRec.rng.d) || null;
	const jd = (jsRec.rng && jsRec.rng.d) || null;
	if (!od && !jd) return [];
	const n = Math.max(od ? od.length : 0, jd ? jd.length : 0);
	const lines = [`draws (oracle | js): ${od ? od.length : '?'} | ${jd ? jd.length : '?'}`];
	let firstDiff = -1;
	for (let i = 0; i < n; i++) {
		const o = od && od[i], j = jd && jd[i];
		const same = o && j && o[0] === j[0] && o[1] === j[1];
		if (!same && firstDiff < 0) firstDiff = i;
	}
	const from = verbose ? 0 : Math.max(0, (firstDiff < 0 ? n : firstDiff) - 4);
	const to = verbose ? n : Math.min(n, (firstDiff < 0 ? n : firstDiff) + 6);
	for (let i = from; i < to; i++) {
		const o = od && od[i], j = jd && jd[i];
		const same = o && j && o[0] === j[0] && o[1] === j[1];
		const os = o ? `[${o[0]},${o[1]}] ${o[2] || ''}` : '-';
		const js = j ? `[${j[0]},${j[1]}] ${jsCallers[i] || ''}` : '-';
		lines.push(`  ${same ? ' ' : '*'}${String(i).padStart(4)}  ${os.padEnd(28)} | ${js}`);
	}
	if (to < n) lines.push(`  … ${n - to} more`);
	return lines;
}

// ---- run -------------------------------------------------------------------------------------
let pass = 0, fail = 0, skipped = 0, stepsOk = 0, stepsTotal = 0;
const reasons = new Map();
const t0 = Date.now();
for (const file of files) {
	if (fail >= maxFail) break;
	const name = path.basename(file, '.json');
	if (only && !only.test(name)) continue;
	const or = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (types && !types.has(or.type)) continue;
	if (or.error) { skipped++; if (verbose) console.log(`SKIP ${name}: oracle setup error ${or.error}`); continue; }
	resetStatics(tablesJson);
	const spec = specOf(or);
	const msgs = [];
	let ok = true;
	let fight;
	try {
		if (spec.mode === 'fight') {
			const ix = indexFor(file)[name];
			const savePath = (ix && ix.save) || path.join(path.dirname(file), 'saves', or.save);
			const imported = await importSave(fs.readFileSync(savePath));
			spec.imported = imported;
		}
		if (spec.profile) {
			// fightgen --profile: the profile save from index.json (make-fights), else found by name
			const ix = indexFor(file)[name];
			spec.vj0 = (await importSave(fs.readFileSync(profilePath(file, ix, or.profile)))).vj0;
			fight = newFightFromProfile(spec, { callers: true });
		} else fight = newFight(spec, { callers: true });
	} catch (e) {
		fight = { error: `setup threw ${errText(e)}`, stack: e.stack };
	}
	if (fight.error) {
		ok = false;
		msgs.push(`setup: ${fight.error}`);
		if (verbose && fight.stack) msgs.push(fight.stack);
		reasons.set('setup: ' + fight.error.split(' (')[0].slice(0, 80), (reasons.get('setup: ' + fight.error.split(' (')[0].slice(0, 80)) || 0) + 1);
	} else {
		// header
		const hd = fight.header();
		for (const k of ['type', 'seed', 'start', 'tele', 'level', 'gear', 'rng0', 'run', 'trapsindif', 'hero', 'premium', 'pets']) {
			if (k in or && JSON.stringify(hd[k]) !== JSON.stringify(or[k])) { ok = false; msgs.push(`header ${k}: js ${show(hd[k])}  oracle ${show(or[k])}`); }
		}
		if (or.kit && (!hd.kit || hd.kit.mp !== or.kit.mp)) { ok = false; msgs.push(`header kit.mp: js ${hd.kit && hd.kit.mp}  oracle ${or.kit.mp}`); }
		if (or.kit2 && (!hd.kit2 || hd.kit2.mp !== or.kit2.mp)) { ok = false; msgs.push(`header kit2.mp: js ${hd.kit2 && hd.kit2.mp}  oracle ${or.kit2.mp}`); }
		if (JSON.stringify(hd.heroStats) !== JSON.stringify(or.heroStats)) { ok = false; msgs.push(`heroStats: js ${show(hd.heroStats)}  oracle ${show(or.heroStats)}`); }
		if (!ok) reasons.set('header', (reasons.get('header') || 0) + 1);
		// init
		const di = diffRecord(fight.init, or.init);
		if (di.length) {
			ok = false;
			msgs.push(`init differs: ${di.join(', ')}`);
			for (const k of di) msgs.push(...fieldDetail(k, fight.init, or.init).map((l) => '  ' + l));
			if (fight.init.err) msgs.push(`  js error: ${fight.init.err}`);
			if (verbose && fight.error) msgs.push(fight.error.stack);
			msgs.push(...drawsReport(fight.init, or.init, fight.rec.jsCallers).map((l) => '  ' + l));
			const why = fight.init.err ? 'init: ' + fight.init.err.split(' (')[0] : 'init: ' + di.join(',');
			reasons.set(why, (reasons.get(why) || 0) + 1);
		}
		// steps
		if (!initOnly && (ok || keepGoing)) {
			for (let i = 0; i < or.steps.length; i++) {
				const os = or.steps[i];
				stepsTotal++;
				const js = fight.apply(or.inputs[i]);
				const d = diffRecord(js, os);
				if (!d.length) { stepsOk++; continue; }
				ok = false;
				msgs.push(`step ${i} ${JSON.stringify(os.in)}: ${d.join(', ')}   (oracle r=${os.r}${os.why ? ' why=' + os.why : ''} st=${os.st}; js r=${js.r}${js.why ? ' why=' + js.why : ''} st=${js.st})`);
				for (const k of d) msgs.push(...fieldDetail(k, js, os).map((l) => '  ' + l));
				if (js.err) msgs.push(`  js error: ${js.err}`);
				if (verbose && fight.error) msgs.push(fight.error.stack);
				msgs.push(...drawsReport(js, os, fight.rec.jsCallers).map((l) => '  ' + l));
				if (i > 0 && verbose) msgs.push(`  previous input: ${JSON.stringify(or.inputs[i - 1])}`);
				const why = js.err ? js.err.split(' (')[0] : 'step: ' + d.join(',');
				reasons.set(why, (reasons.get(why) || 0) + 1);
				if (!keepGoing || js.err) break;
			}
		}
	}
	if (ok) {
		pass++;
		if (verbose) console.log(`ok   ${name} (${or.steps.length} steps)`);
	} else {
		fail++;
		if (!quiet) {
			console.log(`FAIL ${name}  [${(or.mode === 'fight' ? 'fight ' + or.save : `${or.type} ${or.seed} ${or.at}`)}]`);
			for (const m of msgs.slice(0, verbose ? 200 : 40)) console.log('     ' + m);
		}
	}
}
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}${initOnly ? ' (init only)' : `; steps ${stepsOk}/${stepsTotal} matched before the first divergence`} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (reasons.size) {
	console.log('first divergence by reason:');
	for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
process.exit(fail ? 1 : 0);
