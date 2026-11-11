// Evaluate the solver against the baseline (plain melee at every encounter, same samples, same route walker, same
// between-fight rest rule) over dungeons of every family and hero strengths.
//
//   node tools/solve-eval.mjs [--set=small|tiers|full] [--types=2,8,15] [--seeds=1] [--heroes=t1,t3] [--stretch]
//                             [--N=24] [--workers=N] [--budget=S] [--quick] [--useItemsForMp] [--out=FILE] [-v]
//     heroes   t1..t5 (HEROES): level 6 / 10 / 15 / 19 gear 1-4 with --kit, full MP, 4 MP potions; t5 level 21 gear 4
//              --kit2. Each dungeon gets the hero of its tier (types 0-2 t1, 3-5 t2, 6-8 t3, 9-11 t4, 12+ t5) and, with
//              --stretch, the one below it (where tactics matter most)
//     seeds    dungeon seeds per type, from the generator batch ~/.cache/nk-oracle/fx7 (else fixed ones)
// Prints one row per (dungeon, hero) and the totals: items and MP saved, death rates, objectives left.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { formatLabel } from '../js/labels.js';
import { solveRobust, InlinePool } from '../js/solve/robust.js';
import { WorkerPool, defaultSize } from '../js/solve/pool.js';
import { candidates } from '../js/solve/policies.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(here, '../data/tables.json');
// Heroes by dungeon tier (the fresh profile tops out at level 21): kit (5 healing potions, spider x2, kunai, grenades,
// nets, hooks, ambrosia), full MP (the player tops it up from the global stock at entry; a short pool fails the
// route, not the tactics) and 4 MP potions (217); the top tier gets --kit2 (a large pack).
const BASE = { kit: true, mp: 999, items: [[217, 4]] };
export const HEROES = {
	t1: { level: 6, gear: 1, ...BASE },
	t2: { level: 10, gear: 2, ...BASE },
	t3: { level: 15, gear: 3, ...BASE },
	t4: { level: 19, gear: 4, ...BASE },
	t5: { level: 21, gear: 4, kit2: true },
};
const tierHero = (t) => (t <= 2 ? 't1' : t <= 5 ? 't2' : t <= 8 ? 't3' : t <= 11 ? 't4' : 't5');
const below = { t5: 't4', t4: 't3', t3: 't2', t2: 't1', t1: null };
const SETS = { small: [1, 4, 7, 10, 15, 16], tiers: [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17], full: [...Array(27).keys()] };

function seedsFor(type, n) {
	const dir = path.join(os.homedir(), '.cache/nk-oracle/fx7');
	try {
		const list = fs.readdirSync(dir).filter((f) => f.startsWith(`${type}-`)).map((f) => +f.slice(String(type).length + 1, -5)).sort((a, b) => a - b);
		if (list.length) { const out = []; for (let k = 0; k < n; k++) out.push(list[(5 + 7 * k) % list.length]); return out; }
	} catch { /* no batch */ }
	return [172582050 + type * 1000 + 1].slice(0, n);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const args = process.argv.slice(2);
	const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
	const types = opt('types') ? opt('types').split(',').map(Number) : SETS[opt('set', 'small')];
	const nSeeds = +opt('seeds', 1);
	const N = +opt('N', 24);
	const nw = opt('workers') != null ? +opt('workers') : await defaultSize();
	const budgetMs = +opt('budget', 60) * 1000;
	const verbose = args.includes('-v');
	const tablesJson = JSON.parse(fs.readFileSync(tablesPath, 'utf8'));
	resetStatics(tablesJson);
	const pool = nw > 0 ? await WorkerPool.create({ size: nw, tables: { path: tablesPath } }) : new InlinePool(1);
	const cands = args.includes('--quick') ? candidates('quick') : candidates('full');
	const rows = [];
	const f2 = (x) => (x == null ? '-' : (Math.round(x * 100) / 100).toFixed(2));
	console.log(`${types.length} types x ${nSeeds} seeds, N=${N}, ${nw} workers; baseline = plain melee every encounter (same samples)`);
	console.log('dungeon            hero    enc | items solver  base  saved | MP solver   base  saved | P(death) solver base | obj left s/b | s');
	for (const type of types) {
		for (const seed of seedsFor(type, nSeeds)) {
			const hs = opt('heroes') ? opt('heroes').split(',') : [tierHero(type), args.includes('--stretch') ? below[tierHero(type)] : null].filter(Boolean);
			for (const hn of hs) {
				const hero = HEROES[hn];
				const t = performance.now();
				const res = await solveRobust({ hero, type, seed }, { pool, N, nMin: Math.min(16, N), n0: Math.max(8, 2 * pool.size), scout: N, budgetMs, cands, seed: 7, useItemsForMp: args.includes('--useItemsForMp') });
				const s = (performance.now() - t) / 1000;
				if (res.error) { console.log(`${formatLabel(type, seed)} ${hn}: error ${res.error}`); continue; }
				const a = res.totals, b = res.baseline;
				const row = { label: formatLabel(type, seed), type, seed, hero: hn, enc: res.decisions.length, items: a.items.mean, itemsP95: a.items.p95, mp: a.mp.mean, pDeath: a.pDeath, obj: a.objectivesLeft.mean,
					bItems: b.items.mean, bItemsP95: b.items.p95, bMp: b.mp.mean, bDeath: b.pDeath, bObj: b.objectivesLeft.mean, s,
					toSolve: res.mpPlan ? res.mpPlan.toSolve.mean : 0, bToSolve: b.toSolve ? b.toSolve.mean : 0, perf: res.perf,
					tactics: res.decisions.reduce((m, d) => { m[d.tactic.name] = (m[d.tactic.name] || 0) + 1; return m; }, {}) };
				rows.push(row);
				console.log(`${row.label.padEnd(18)} ${hn.padEnd(7)} ${String(row.enc).padStart(3)} | ${f2(row.items).padStart(6)} ${f2(row.bItems).padStart(6)} ${f2(row.bItems - row.items).padStart(6)} | ${f2(row.mp).padStart(7)} ${f2(row.bMp).padStart(7)} ${f2(row.bMp - row.mp).padStart(7)} | ${f2(row.pDeath).padStart(6)} ${f2(row.bDeath).padStart(6)} | ${f2(row.obj)}/${f2(row.bObj)} | ${s.toFixed(0)}`
					+ ` | solve ${f2(row.toSolve)}/${f2(row.bToSolve)}` + (verbose ? `  ${JSON.stringify(row.tactics)}` : ''));
			}
		}
	}
	await pool.close();
	const mean = (k) => rows.reduce((x, r) => x + r[k], 0) / Math.max(1, rows.length);
	const tac = {};
	for (const r of rows) for (const [k, v] of Object.entries(r.tactics)) tac[k] = (tac[k] || 0) + v;
	console.log(`\n${rows.length} runs: items/dungeon solver ${f2(mean('items'))} vs baseline ${f2(mean('bItems'))} (saved ${f2(mean('bItems') - mean('items'))});`
		+ ` MP solver ${f2(mean('mp'))} vs ${f2(mean('bMp'))} (saved ${f2(mean('bMp') - mean('mp'))}); P(death) ${f2(mean('pDeath'))} vs ${f2(mean('bDeath'))};`
		+ ` objectives left ${f2(mean('obj'))} vs ${f2(mean('bObj'))}; MP to solve for ${f2(mean('toSolve'))} vs ${f2(mean('bToSolve'))}; ${f2(mean('s'))} s per solve`);
	console.log(`tactics chosen: ${JSON.stringify(tac)}`);
	if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(rows, null, 1));
}
