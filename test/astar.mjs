// A* (hw.t_ in js/combat/nav.js): the search that allocates nothing per step against a copy of the one before it.
// The copy below is the old hw.t_ verbatim (a node, a predicate and a Point per push, the open list scanned on every
// push); the two must give the same cost, the same path (so the same tie-break among equal costs, i.e. the same heap
// order), the same scratch point and an emptied open list, for every start, target, limit, team, doors flag and region,
// on real mid-dungeon states: free, blocked, occupied, revealed and not.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/astar.mjs [-v]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../js/combat/all.js';
import { resetStatics } from '../js/combat/setup.js';
import { classes } from '../js/gen/registry.js';
import { zw } from '../js/gen/statics.js';
import { fg2, Util$Point, sw } from '../js/gen/model.js';
import { al1 } from '../js/combat/nav.js';
import { Run } from '../js/solve/sim.js';
import { makePolicy } from '../js/solve/policies.js';

const { hw } = classes;
const here = path.dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
const verbose = process.argv.includes('-v');

// ---- the reference: hw.t_ as it was before it stopped allocating (copied verbatim, scratch included) -----------------

const ASTAR = { n: -1, st: null, nd: null, gen: 0 };

function referenceT_(from, to, path, maxSteps, searchSteps, team, doors, region) {
	const out = path;
	if (out != null) out.length = 0;
	let v10 = from.a;
	const v9 = to.a;
	if ((v10 !== v9 || from.b !== to.b) && v9 >= 0) {
		const v11 = to.b;
		if (v11 >= 0) {
			v10 = this.g;
			if (v9 < v10 && v11 < this.h) {
				const tgt = this.k[(v11 * v10 + v9) | 0];
				const isDoor = tgt != null && fg2.W_(tgt.a.a, 40, 126);
				const dx = (to.a - from.a) | 0;
				const dy = (to.b - from.b) | 0;
				let dir;
				if (dy === 0) dir = dx === -1 ? 0 : dx === 1 ? 1 : -1;
				else if (dx === 0) dir = dy === -1 ? 2 : dy === 1 ? 3 : -1;
				else dir = -1;
				if (dir === -1 || (isDoor && (tgt.c ? dx !== 1 || dy !== 0 : dx !== 0 || dy !== -1))) {
					if (isDoor) {
						to = new Util$Point(to);
						if (tgt.c) to.a = (to.a - 1) | 0;
						else to.b = (to.b + 1) | 0;
					}
					let p4 = maxSteps;
					if (p4 <= 0) p4 = 1000;
					let lim = searchSteps;
					if (searchSteps < p4) lim = p4;
					lim = (lim + 7) | 0;
					const heap = hw.P;
					heap.k_();
					// closed set: per-cell stamp + node arrays (was the hw.Q Map; same semantics, no hashing)
					const g0 = this.g; const nc0 = (g0 * this.h) | 0; if (ASTAR.n !== nc0) { ASTAR.n = nc0; ASTAR.st = new Int32Array(nc0); ASTAR.nd = new Array(nc0).fill(null); ASTAR.gen = 0; } const gen = ++ASTAR.gen; const ST = ASTAR.st, ND = ASTAR.nd;
					const start = new sw(from.a, from.b);
					heap.b_(start);
					ST[from.b * g0 + from.a] = gen; ND[from.b * g0 + from.a] = start;
					let cur;
					for (;;) {
						let n = heap.b;
						let top;
						if (n === 0) top = null;
						else {
							const arr = heap.c;
							top = arr[0];
							heap.b = --n;
							const last = arr[n];
							arr[n] = null;
							if (n !== 0) heap.q_(0, last);
						}
						cur = top;
						if (cur == null) break;
						const cy = cur.b;
						const cx = cur.a;
						if (cx === to.a && cy === to.b) break;
						if (cur.g < lim) {
							for (let d = 0; d < 4; d++) {
								const S = hw.S;
								S.a = cx;
								S.b = cy;
								S.b_(d);
								const nx = S.a;
								if (nx < 0) continue;
								const g = this.g;
								if (nx >= g) continue;
								const ny = S.b;
								if (ny < 0 || ny >= this.h) continue;
								const idx = (ny * g + nx) | 0;
								const cell = this.j[idx];
								const occ = this.k[idx];
								let cost;
								L266: {
									L330: {
										cost = 500;
										if (occ != null) {
											const t = occ.a;
											if (t.a === 84) {
												cost = 85;
												break L266;
											}
											if (doors) {
												const l = t.l;
												if (l || t.u) {
													if (!l) cost = 300;
													break L266;
												}
											}
											if ((team === -2 && (occ.e_() || occ.a.a === 30)) || (team === -3 && occ.e_() && fg2.W_(occ.k, 1, 2))) break L330;
											if (team !== -1 && occ.e_() && occ.k === team) {
												cost = 1500;
												break L266;
											}
											if (region !== 0 && fg2.W_(cell.a, 3, 8)) {
												const sx = S.a;
												if (sx > 0 && this.l[idx - 1] === region) break L330;
												const g2 = this.g;
												if (sx < g2 - 1 && this.l[idx + 1] === region) break L330;
												const sy = S.b;
												if ((sy > 0 && this.l[idx - g2] === region) || (sy < this.h - 1 && this.l[idx + g2] === region)) break L330;
											}
										} else {
											if (doors && cell.a === 10 && (cell.b & 32) === 0) break L266;
											if (cell.o_(false)) {
												cost = 90;
												break L266;
											}
										}
										cost = 0;
										break L266;
									}
									cost = 800;
								}
								if (S.a !== to.a || S.b !== to.b) {
									L212: {
										if (occ == null) {
											const xt = zw.u[cell.a];
											if (xt.m || (xt.o && (cell.b & 32) !== 0)) break L212;
										}
										if (cost === 0) continue;
									}
									if (this.m[idx] <= 0) continue;
								}
								if (cost === 0) cost = 100;
								const c13 = (cur.c + cost) | 0;
								let nc = c13;
								if (d !== cur.f && cur !== start) nc = (c13 + 3) | 0;
								const ki = S.b * g0 + S.a; const old = ST[ki] === gen ? ND[ki] : null;
								if (old == null || nc < old.c) {
									const node = new sw(S.a, S.b);
									node.c = nc;
									node.e = cur;
									node.f = d;
									const h = (S.d_(to) + nc) | 0;
									node.d = h;
									if (S.a !== to.a && S.b !== to.b) node.d = (h + 3) | 0;
									node.g = (cur.g + 1) | 0;
									ST[ki] = gen; ND[ki] = node;
									heap.p_(new al1(10, node));
									heap.b_(node);
								}
							}
						}
					}
					const res = cur != null && cur.e != null && cur.g <= p4 ? cur.c : 0;
					let ret = res;
					if (res !== 0 && out != null) {
						let node = cur;
						let r5 = res;
						if (isDoor) {
							out.push(tgt.c ? 1 : 2);
							r5 = (res + 100) | 0;
						}
						for (;;) {
							ret = r5;
							if (node.e == null) break;
							out.push(node.f);
							node = node.e;
						}
					}
					heap.k_();
					return ret;
				}
				if (out != null) out.push(dir);
				return 1;
			}
		}
	}
	return 0;
}

// ---- the states: real dungeons, walked a few fights in, plus the same states fully revealed --------------------------

const DUNGEONS = [
	{ type: 8, seed: 172582050 },    // 3C
	{ type: 15, seed: 1026320547 },  // F1
	{ type: 0, seed: 1429008869 },   // 1A
	{ type: 19, seed: 344057351 },   // a cave
	{ type: 23, seed: 1492658333 },  // a tomb
];
const HERO = { level: 21, gear: 4, kit2: true };
const FIGHTS_WALKED = 3;
const CALLS_PER_STATE = 260;

const LIMITS = [0, 1, 5, 9, 13, 20, 26, 45, 100];
const SEARCH_LIMITS = [0, 5, 20, 26, 45];
const TEAMS = [-3, -2, -1, -1, 0, 1, 2];

/** a seeded generator, so a failure reproduces */
function mulberry32(a) {
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const totals = { calls: 0, paths: 0, costs: 0, doorTargets: 0, blockedTargets: 0, occupiedTargets: 0, unrevealedTargets: 0, withTeam: 0, withRegion: 0, states: 0 };
const failures = [];

for (const [n, where] of DUNGEONS.entries()) {
	resetStatics(tables);
	const run = Run.start(HERO, { ...where, xseed: 12345 });
	const rand = mulberry32(0x5eed + n);
	for (let walked = 0; walked <= FIGHTS_WALKED; walked++) {
		const h = run.fight.h;
		compareOnState(h, rand, `${where.type}:${where.seed} after ${walked} fights`);
		const revealed = h.m.slice();
		h.m.fill(1);
		compareOnState(h, rand, `${where.type}:${where.seed} after ${walked} fights, all revealed`);
		h.m.set(revealed);
		if (walked === FIGHTS_WALKED) break;
		const ev = run.toEncounter();
		if (ev.ev !== 'combat') break;
		run.fightWith(makePolicy('melee', {}));
	}
}

function compareOnState(h, rand, name) {
	const before = h.m.slice();
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const cell = () => new Util$Point(Math.floor(rand() * h.g), Math.floor(rand() * h.h));
	const near = (p, r) => new Util$Point(Math.max(0, Math.min(h.g - 1, p.a + Math.floor(rand() * (2 * r + 1)) - r)), Math.max(0, Math.min(h.h - 1, p.b + Math.floor(rand() * (2 * r + 1)) - r)));
	const critters = h.o.map((m) => m.b);
	const doorCells = [];
	for (let y = 0; y < h.h; y++) for (let x = 0; x < h.g; x++) {
		const o = h.k[y * h.g + x];
		if (o != null && fg2.W_(o.a.a, 40, 126)) doorCells.push(new Util$Point(x, y));
	}
	const regions = [0, 0, ...Array.from(h.l.slice(0, 400), (v) => v).filter((v) => v !== 0).slice(0, 20)];
	const hero = h.f.b;
	const starts = () => pick([() => hero, () => pick(critters), () => cell(), () => near(hero, 8)])();
	const targets = (from) => pick([() => hero, () => pick(critters), () => (doorCells.length ? pick(doorCells) : cell()), () => cell(), () => near(from, 12), () => near(from, 12), () => near(from, 1), () => new Util$Point(from.a + 1, from.b), () => new Util$Point(rand() < 0.5 ? -1 : h.g, 2)])();
	totals.states++;
	for (let i = 0; i < CALLS_PER_STATE; i++) {
		const from = starts();
		const to = targets(from);
		const args = [pick(rand() < 0.2 ? [null] : [[], [], [7, 7, 7]]), pick(LIMITS), pick(SEARCH_LIMITS), pick(TEAMS), rand() < 0.7, pick(regions)];
		const sameCall = compareCalls(h, from, to, args, name, i);
		if (!sameCall) return;
		const inside = to.a >= 0 && to.b >= 0 && to.a < h.g && to.b < h.h;
		const tgt = inside ? h.k[to.b * h.g + to.a] : null;
		if (tgt != null && fg2.W_(tgt.a.a, 40, 126)) totals.doorTargets++;
		if (tgt != null) totals.occupiedTargets++;
		if (inside && h.m[to.b * h.g + to.a] <= 0) totals.unrevealedTargets++;
		if (inside && !h.z_(to.a, to.b)) totals.blockedTargets++;
		if (args[3] >= 0) totals.withTeam++;
		if (args[5] !== 0) totals.withRegion++;
	}
	if (!h.m.every((v, k) => v === before[k])) failures.push(`${name}: a search changed the revealed cells`);
}

/** one call of each on copies of from / to / path; true when everything they leave behind is the same */
function compareCalls(h, from, to, [pathProto, maxSteps, searchSteps, team, doors, region], name, i) {
	const mk = (p) => new Util$Point(p.a, p.b);
	const fromA = mk(from), toA = mk(to), fromB = mk(from), toB = mk(to);
	const pathA = pathProto == null ? null : pathProto.slice();
	const pathB = pathProto == null ? null : pathProto.slice();
	const r1 = referenceT_.call(h, fromA, toA, pathA, maxSteps, searchSteps, team, doors, region);
	const afterRef = { sa: hw.S.a, sb: hw.S.b, heap: hw.P.b };
	const r2 = h.t_(fromB, toB, pathB, maxSteps, searchSteps, team, doors, region);
	const afterNew = { sa: hw.S.a, sb: hw.S.b, heap: hw.P.b };
	const where = `${name}, call ${i}: from ${from.a},${from.b} to ${to.a},${to.b} max ${maxSteps} search ${searchSteps} team ${team} doors ${doors} region ${region}`;
	let bad = null;
	if (r1 !== r2) bad = `cost ${r1} (old) vs ${r2}`;
	else if (pathProto != null && (pathA.length !== pathB.length || pathA.some((v, k) => v !== pathB[k]))) bad = `path [${pathA}] (old) vs [${pathB}]`;
	else if (afterRef.sa !== afterNew.sa || afterRef.sb !== afterNew.sb) bad = `scratch point ${afterRef.sa},${afterRef.sb} (old) vs ${afterNew.sa},${afterNew.sb}`;
	else if (afterNew.heap !== 0 || afterRef.heap !== 0) bad = `open list left with ${afterRef.heap} (old) / ${afterNew.heap} nodes`;
	else if (!sameXY(from, fromB) || !sameXY(to, toB) || !sameXY(from, fromA) || !sameXY(to, toA)) bad = 'a search changed from or to';
	else if (hw.P.c.slice(0, 64).some((v) => v !== null)) bad = 'open list slots not cleared';
	if (bad) {
		failures.push(`${where}: ${bad}`);
		return false;
	}
	totals.calls++;
	if (r1 !== 0) totals.costs++;
	if (pathProto != null && pathA.length > 0) totals.paths++;
	return true;
}

function sameXY(p, q) {
	return p.a === q.a && p.b === q.b;
}

// ---- report ---------------------------------------------------------------------------------------------------------

const coverage = `${totals.calls} calls on ${totals.states} states; ${totals.costs} found a way, ${totals.paths} with a path; targets: ${totals.doorTargets} doors, ${totals.occupiedTargets} occupied, ${totals.blockedTargets} blocked, ${totals.unrevealedTargets} unrevealed; ${totals.withTeam} with a team, ${totals.withRegion} with a region`;
if (verbose) console.log(coverage);
const thin = [];
if (totals.calls < 4000) thin.push('too few calls');
if (totals.paths < 1000) thin.push('too few paths');
if (totals.doorTargets < 100 || totals.occupiedTargets < 500 || totals.unrevealedTargets < 500 || totals.blockedTargets < 500) thin.push('too few door, occupied, unrevealed or blocked targets');
if (totals.withRegion < 100) thin.push('too few region searches');
if (thin.length) failures.push(`coverage: ${thin.join(', ')} (${coverage})`);

if (failures.length) {
	for (const f of failures.slice(0, 10)) console.log(`FAIL ${f}`);
	console.log(`${failures.length} failures`);
	process.exit(1);
}
console.log(`ok   hw.t_ matches the previous search on ${coverage}`);
