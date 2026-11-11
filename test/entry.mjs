// Dungeon entry check (js/combat/entry.js) on the oracle's profile fights (fightgen --profile, category `profile`):
//
//   node test/entry.mjs [-v] [file.json | dir]...      default: ~/.cache/nk-oracle/fights/pf-*.json
//
// Per file: entryPack(vj0, hero, { type, premium }) (the dry run the UI shows) equals the pack, MP and familiar
// charges the game's PageDungeon.C gave the hero (oracle init record: hero.inv / mp / fam; files with --pets add
// companions before entry, --kit / --kit2 add to the pack after it: those are compared through newFightFromProfile
// only); newFightFromProfile's fight.entry agrees with the oracle; the imported profile's own objects are unchanged
// by both and by 20 inputs of play (deep fingerprint; the static tables it shares, e.g. the companion templates its
// pets point at, are play's and resetStatics puts them back); a second
// newFightFromProfile on the same profile (working copy restored, generation cached) gives the same init record;
// and the oracle-accepted setups have no gate other than away / busy / dungeon (those the oracle's setup clears).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../js/combat/all.js';
import { specOf } from '../js/combat/driver.js';
import { resetStatics } from '../js/combat/setup.js';
import { entryPack, newFightFromProfile } from '../js/combat/entry.js';
import { importSave } from '../js/save/index.js';
import { tables } from '../js/gen/statics.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
const args = process.argv.slice(2);
const verbose = args.includes('-v');
let inputs = args.filter((a) => !a.startsWith('-'));
const fightsDir = path.join(os.homedir(), '.cache/nk-oracle/fights');
if (!inputs.length) inputs = [fightsDir];
const files = [];
for (const p of inputs) {
	if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p).sort()) { if (/^pf-.*\.json$/.test(f) || (p !== fightsDir && f.endsWith('.json') && f !== 'index.json')) files.push(path.join(p, f)); }
	else files.push(p);
}
const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
function savePath(file, name, base) {
	const ixp = path.join(path.dirname(file), 'index.json');
	const ix = fs.existsSync(ixp) ? JSON.parse(fs.readFileSync(ixp, 'utf8'))[name] : null;
	const c = [ix && ix.save, path.join(path.dirname(file), 'saves', base), process.env.NK_SAVE && path.basename(process.env.NK_SAVE) === base ? process.env.NK_SAVE : null,
		path.join(RE, 'saves', base), path.join(os.homedir(), '.cache/nk-oracle/save/synth', base), path.join(os.homedir(), '.cache/nk-oracle/save/prof/synth', base)];
	return c.find((x) => x && fs.existsSync(x));
}

/** the static table objects (every root but the fresh profile): shared with an imported profile, reset by resetStatics */
function tableSet() {
	const set = new Set();
	const st = Object.keys(tables.roots).filter((r) => r !== 'vj0.i2').map((r) => tables.roots[r]);
	while (st.length) {
		const v = st.pop();
		if (v === null || typeof v !== 'object' || set.has(v)) continue;
		set.add(v);
		if (ArrayBuffer.isView(v)) continue;
		if (v instanceof Map) { for (const x of v.values()) st.push(x); continue; }
		for (const k of Object.keys(v)) st.push(v[k]);
	}
	return set;
}

/** deep fingerprint of a profile's own objects (objects by first path, cycles as @path; static tables by reference) */
function fp(root) {
	const out = [];
	const seen = new Map();
	if (!TAB) TAB = tableSet();
	const st = [[root, '$']];
	while (st.length) {
		const [v, p] = st.pop();
		if (v === null || typeof v !== 'object') { out.push(p + '=' + (typeof v === 'bigint' ? v + 'n' : String(v))); continue; }
		if (seen.has(v)) { out.push(p + '=@' + seen.get(v)); continue; }
		if (TAB.has(v)) { out.push(p + '=<table>'); continue; }
		seen.set(v, p);
		if (ArrayBuffer.isView(v)) { out.push(p + '=' + Array.from(v).join(',')); continue; }
		if (v instanceof Map) { let i = 0; for (const [k, x] of v) st.push([x, `${p}{${String(k)}#${i++}}`]); continue; }
		for (const k of Object.keys(v)) st.push([v[k], p + '.' + k]);
	}
	return out.join('\n');
}

let TAB = null;
const stripRng = (r) => JSON.stringify(r, (k, x) => (k === 'd' && Array.isArray(x) ? x.map((d) => [d[0], d[1]]) : x));

let pass = 0, fail = 0, skipped = 0;
for (const file of files) {
	const name = path.basename(file, '.json');
	const or = JSON.parse(fs.readFileSync(file, 'utf8'));
	if (or.error || or.profile == null) { skipped++; if (verbose) console.log(`skip ${name}: ${or.error || 'not a profile fight'}`); continue; }
	const msgs = [];
	resetStatics(tablesJson);
	const sp = savePath(file, name, or.profile);
	if (!sp) { skipped++; console.log(`skip ${name}: profile ${or.profile} not found`); continue; }
	const v = (await importSave(fs.readFileSync(sp))).vj0;
	const before = fp(v);
	const want = { items: or.init.hero.inv, mp: or.init.hero.mp, fam: or.init.hero.fam };
	const spec = specOf(or);
	spec.vj0 = v;
	if (!or.pets && !spec.kit && !spec.kit2) {
		const p = entryPack(v, or.hero, { type: or.type, premium: !!or.premium });
		const got = { items: p.items, mp: p.mp, fam: p.fam };
		if (JSON.stringify(got) !== JSON.stringify(want)) msgs.push(`entryPack ${JSON.stringify(got)}\n       oracle    ${JSON.stringify(want)}`);
		const extra = p.gates.filter((g) => !['away', 'busy', 'dungeon'].includes(g.gate));
		if (extra.length) msgs.push(`gates the oracle passed: ${extra.map((g) => g.gate).join(',')}`);
		if (fp(v) !== before) msgs.push('entryPack changed the profile');
	}
	const f = newFightFromProfile(spec);
	if (f.error) msgs.push(`newFightFromProfile: ${f.error}`);
	else {
		if (stripRng(f.init) !== stripRng(or.init)) msgs.push('init record differs from the oracle (see test/combat.mjs)');
		const e = f.entry;
		if (JSON.stringify({ items: e.items, mp: e.mp, fam: e.fam }) !== JSON.stringify(want) && !spec.kit && !spec.kit2) msgs.push(`fight.entry ${JSON.stringify({ items: e.items, mp: e.mp, fam: e.fam })}`);
		for (let i = 0; i < Math.min(20, or.inputs.length); i++) f.step(or.inputs[i]);
		if (fp(v) !== before) msgs.push('newFightFromProfile (and play) changed the profile');
		resetStatics(tablesJson);
		const g = newFightFromProfile(spec);
		if (g.error || stripRng(g.init) !== stripRng(or.init)) msgs.push(`second newFightFromProfile differs${g.error ? ': ' + g.error : ''}`);
	}
	if (msgs.length) { fail++; console.log(`FAIL ${name}\n     ${msgs.join('\n     ')}`); }
	else { pass++; if (verbose) console.log(`ok   ${name}  hero ${or.hero} type ${or.type}: mp ${want.mp}, fam ${want.fam}, ${want.items.length} pack entries`); }
}
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
