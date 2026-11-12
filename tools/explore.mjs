// Exploration policy: play whole dungeons with the JS combat engine (js/combat) to generate oracle inputs that reach
// the code paths the corpus fuzz never does (levers, fountains, shrines, chests, mimics, NPCs, stuck / sealed doors,
// ladders, portals, the floor nonogram, barrel puzzles, the stairs, boss fights with every kit item), then replay them
// through the JVM oracle (run.sh fightgen ... <inputs.json>, no --fuzz) and diff with test/combat.mjs.
//
//   node tools/explore.mjs [--types=0-26|8,15] [--seeds=3] [--from=K] [--targets] [--only=RE] [--list] [--max=N]
//                          [--out=DIR] [--oracle] [--trace] [--cells] [--jobs=N] [--reuse] [--nokit2] [--chaos=P] [--pseed=S]
//                          [--name=P] [-v]
//     --types    dungeon types (default all 27); --seeds: seeds per type (from the generator batch ~/.cache/nk-oracle/fx7),
//                --from=K: start at variant K (the corpus uses 0-3)
//     --targets  the targeted runs instead (targetSpecs: near:x,y of creatures with each ability / boss / NPC kind)
//     --max      input cap per run (default 1500, targeted 600)
//     --out      where to write <name>.inputs.json (default /tmp/nk-explore); with --oracle also <name>.json (the oracle
//                fight file, --draws or --trace, + --cells: tile deltas / visibility hashes), then node test/combat.mjs
//                on all of them
//     --nokit2   whole-dungeon runs without the larger kit (oracle --kit2, js/combat/setup.js KIT2_ITEMS); by default
//                variants 0-2 of a type use it and variant 3 plays with --kit only and --trapsindif 0
//     --name=P   name prefix (default "x"); --only=RE filters by name; --list prints the oracle command lines
//     --reuse    keep existing <name>.inputs.json in --out (only run the oracle / compare)
//     --chaos=P  replace a fraction P of the policy's inputs by random ones (taps, items, skills at random cells)
//   Library: explore(spec, opts) -> { inputs, stats }, exploreSpecs / targetSpecs, setupOf(spec), oracleArgs(spec, ...)
//   (test/make-fights.mjs uses them for the `explore` / `explore-target` corpus categories).
//
// The hero is strong (--level 21 --gear 4 --kit [--kit2]). Out of combat the policy walks the route planner's stops
// (js/plan/planner.js, plus extra stops: everything that opens or is used, levers, fountains, shrines, mimic-able
// smashables, NPCs, bosses): it taps route cells ahead (the game's own tap path, hw.t: 45 steps over revealed cells),
// bumps what blocks the route (doors, traps, ladders / hatches / portals), bumps each stop's target, re-plans the floor
// nonogram's dips from the floor's state and steps them cell by cell, solves barrel puzzles (pushes and hw.N swaps,
// one box at a time, depth-first), and finally steps onto the stairs. In combat it mixes, from a seeded LCG: melee the
// nearest hostile, unseal, skills, thrown / area items with their targeting rules, the spider, familiars, net, hook,
// bait, the secret name, potions when low, wait, and stepping away. Inputs that are rejected or change nothing count
// as a stall: the waypoint is retried, then its leg is given up and the route re-planned (at most 100 times), so the
// policy never hangs. Targeted runs first bump the creature they start next to.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initTables, zw } from '../js/gen/index.js';
import '../js/combat/all.js';
import { newFight, errText } from '../js/combat/driver.js';
import { resetStatics } from '../js/combat/setup.js';
import { planRoute } from '../js/plan/planner.js';
import { Util$Point } from '../js/gen/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tablesJson = JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8'));
initTables(tablesJson);

// ---- small helpers -------------------------------------------------------------------------------
class Lcg {
	constructor(s) { this.s = (s | 0) ^ 0x5deece6; }
	next(n) { this.s = (Math.imul(this.s, 1103515245) + 12345) | 0; return ((this.s >>> 8) % n + n) % n; }
	pick(a) { return a[this.next(a.length)]; }
	chance(p) { return this.next(1000) < p * 1000; }
}

const DIR4 = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const TELEPORTS = new Set([38, 39, 40, 74, 88, 126]);
// extra stops besides the planner's objectives: everything that opens (rw.i: chests, containers) or is used (rw.n:
// pages, ore, pickups 54 / 94 / 124), levers 32 (all, not only those a gate needs), fountains 48 / 58 / 95, shrines
// 85-87, the examine object 93, and the smashables that may be mimics (3, 26, 104-106); other smashables (rw.l) by
// chance (SMASH_P per object)
const EXTRA_OBJ = new Set([32, 48, 58, 85, 86, 87, 93, 95, 3, 26, 104, 105, 106]);
const SMASH_P = 0.25;
let extrasReady = false;
function initExtras() {
	if (extrasReady) return;
	extrasReady = true;
	for (const [id, r] of zw.Q) if (r.i || r.n) EXTRA_OBJ.add(id);
}

/** The planner's level format (js/gen/generate.js toLevel) from the live hw. */
export function levelOf(h) {
	const n = h.j.length;
	const cells = new Array(2 * n);
	for (let i = 0; i < n; i++) { cells[2 * i] = h.j[i].a; cells[2 * i + 1] = h.j[i].b; }
	const bit = (v) => (v ? 1 : 0);
	const obj = (q) => ({ id: q.a.a, x: q.b.a, y: q.b.b, c: bit(q.c), d: bit(q.d), e: bit(q.e), f: bit(q.f), g: q.g, h: q.h, ref: q });
	return {
		type: h.b, seed: h.a, w: h.g, h: h.h, a: h.a, y: h.y, A: h.A, cells,
		objects: h.n.map(obj),
		critters: h.o.map((c) => ({ ...obj(c), k: c.k, x: c.b.a, y: c.b.b })),
	};
}

// ---- the policy ------------------------------------------------------------------------------------
export class Policy {
	constructor(fight, seed, opts = {}) {
		this.f = fight;
		this.h = fight.h;
		this.c = fight.c;
		this.r = new Lcg(seed);
		this.opts = opts;
		this.route = [];       // [{ i: cell, exact? } | { jump } | { bump: 'obj' | 'cr', rec } | { exit } | { walkDone }], each with its leg
		this.cur = 0;
		this.stall = 0;        // consecutive inputs without progress
		this.tries = new Map();   // route index -> attempts
		this.lastKey = '';
		this.exitTries = 0;
		this.finished = false;
		this.done = new Set();    // stop targets bumped (qw refs)
		this.failed = new Set();  // stop targets given up
		this.replans = 0;
		this.nonogramDone = false;
		this.blocked = new Set();  // route cells that would not open (walls for the next plan)
		this.jumpFrom = null;
		this.smash = new Map();     // smashable qw -> visit it?
		this.stats = { plans: 0, skips: 0, bumps: 0, combatInputs: 0, walkInputs: 0, stops: 0 };
		this.plan();
		// targeted runs: bump the creature the setup started next to (near:x,y) before the route
		const at = /^near:(\d+),(\d+)$/.exec(opts.at || '');
		if (at) {
			const tgt = this.h.o.find((c) => c.b.a === +at[1] && c.b.b === +at[2]);
			if (tgt) this.route.unshift({ bump: 'cr', rec: { ref: tgt, k: tgt.k }, leg: { stop: { kind: 'target', rec: null } } });
		}
	}

	cellIdx(x, y) { return y * this.h.g + x; }

	plan() {
		const h = this.h;
		const level = levelOf(h);
		this.stats.plans++;
		for (const i of this.blocked) level.cells[2 * i] = 0;
		// stops already done or given up are left out (objects as used, critters dropped)
		for (const o of level.objects) if (this.done.has(o.ref) || this.failed.has(o.ref)) o.e = 1;
		level.critters = level.critters.filter((c) => c.id === 180 || !(this.done.has(c.ref) || this.failed.has(c.ref)) || c.k !== 0);
		const npcIds = new Set(level.critters.filter((c) => c.k === 0 && c.h !== 0 && c.id !== 180).map((c) => c.id));
		initExtras();
		// smashables: a per-object coin (kept across replans); those not picked are marked used for the planner
		for (const o of level.objects) {
			const r = zw.Q.get(o.id);
			if (!r || !r.l || EXTRA_OBJ.has(o.id)) continue;
			if (!this.smash.has(o.ref)) this.smash.set(o.ref, this.r.chance(SMASH_P));
			if (!this.smash.get(o.ref)) o.e = 1;
		}
		const rw = (id) => {
			const d = zw.Q.get(id) ?? zw.R.get(id) ?? null;
			if (d == null) return undefined;
			const isCr = !zw.Q.has(id);
			const extra = isCr ? npcIds.has(id) : EXTRA_OBJ.has(id) || !!d.l;
			if (extra && !d.t) { const e = Object.create(d); e.t = true; return e; }
			return d;
		};
		const heldKeys = h.f.D.c.reduce((k, e) => (e.a.a === 167 ? k + e.a_() : k), 0);   // keys open doors 29 (c30.m0)
		let plan;
		try {
			plan = planRoute(level, { rw, pwOf: (t) => zw.M[t], patterns: this.nonogramDone ? null : zw.O, tiles: zw.u, endAtExit: true, heldKeys });
		} catch (e) {
			this.route = [];
			this.planError = errText(e);
			return;
		}
		const out = [];
		for (const leg of plan.legs) {
			const s = leg.stop;
			const exactFrom = s.walk ? leg.to - s.walk.length + 1 : Infinity;
			const first = out.length;
			for (let k = leg.from + 1; k <= leg.to; k++) {
				const p = plan.route[k];
				if (p.jump) { out.push({ jump: true, leg }); continue; }
				out.push({ i: this.cellIdx(p.x, p.y), exact: k >= exactFrom, leg });
			}
			// the stop's target
			if (s.kind === 'exit') out.push({ exit: true, leg });
			else if (s.kind === 'barrels') out.push({ barrels: true, leg });
			else if (s.rec && s.rec.ref && !s.walk) out.push({ bump: s.rec.k !== undefined ? 'cr' : 'obj', rec: s.rec, leg });
			else if (s.walk) out.push({ walkDone: true, leg });
			if (s.walk) { const k = out.findIndex((w, j) => j >= first && w.exact); if (k >= 0) out[k].walkStart = true; }
			leg.first = first;
			leg.last = out.length - 1;
		}
		this.route = out;
		this.cur = 0;
	}

	/** give up the current leg: its stop is not retried; replan from here */
	failLeg(why) {
		this.stats.skips++;
		const w = this.route[this.cur];
		if (this.opts.verbose) console.error(`  fail leg at ${this.cur} (${why}) ${w && w.leg.stop.kind}`);
		if (w && w.leg.stop.rec && w.leg.stop.rec.ref) this.failed.add(w.leg.stop.rec.ref);
		if (w && w.leg.stop.walk) this.nonogramDone = true;
		if (w && w.leg.stop.kind === 'exit') { this.finished = true; return; }
		this.replan();
	}

	replan() {
		if (++this.replans > 100) { this.finished = true; return; }
		this.tries.clear();
		this.stall = 0;
		this.jumpFrom = null;
		this.plan();
	}

	/** steps of the game's own tap path from the hero to cell i (0 = none); hw.t only uses static scratch */
	pathLen(i) {
		const h = this.h;
		const to = new Util$Point(i % h.g, (i / h.g) | 0);
		const tmp = [];
		h.t_(h.f.b, to, tmp, 45, 45, -1, false, 0);
		return tmp.length;
	}

	heroCell() { const p = this.h.f.b; return p.b * this.h.g + p.a; }

	adjacent(i, j) {
		const g = this.h.g;
		return Math.abs((i % g) - (j % g)) + Math.abs(((i / g) | 0) - ((j / g) | 0)) === 1;
	}

	tapCell(i) { return { t: 'tap', x: i % this.h.g, y: (i / this.h.g) | 0 }; }

	stepTo(i) {
		const p = this.h.f.b, g = this.h.g;
		const dx = Math.sign((i % g) - p.a), dy = Math.sign(((i / g) | 0) - p.b);
		if (dx !== 0 && dy !== 0) return this.r.next(2) ? { t: 'step', dx, dy: 0 } : { t: 'step', dx: 0, dy };
		if (dx === 0 && dy === 0) return null;
		return { t: 'step', dx, dy };
	}

	selId() { return this.f.selId(); }

	hostiles() {
		const h = this.h, me = h.f;
		const out = [];
		for (const m of h.o) {
			if (m === me || m.u_() || !zw.o_(me.k, m.k)) continue;
			out.push(m);
		}
		return out;
	}

	nearest(list) {
		const p = this.h.f.b;
		let best = null, bd = Infinity;
		for (const m of list) {
			const d = Math.max(Math.abs(m.b.a - p.a), Math.abs(m.b.b - p.b));
			if (d < bd) { bd = d; best = m; }
		}
		return best ? { m: best, d: bd } : null;
	}

	has(id) { return this.h.f.D.c.some((e) => e.a.a === id); }

	/** the next input, or null when done */
	next() {
		if (this.finished) return null;
		const h = this.h, c = this.c;
		if (c.w || h.f.u_()) return null;
		if (this.opts.chaos && this.r.chance(this.opts.chaos)) return this.chaos();
		if (h.C) { this.stats.combatInputs++; return this.combat(); }
		this.stats.walkInputs++;
		if (this.selId() !== 0) return { t: 'cancel' };
		// keep the pools up between fights: energy for doors / undergrowth, HP for the next fight
		const me = h.f;
		if (!this.restTried) {
			if (me.z.v_() * 4 < me.D_() && this.has(121)) { this.restTried = true; return { t: 'potion', id: 121 }; }
			if (me.j.v_() * 2 < me.q_()) {
				for (const id of [219, 218, 120, 122]) if (this.has(id)) { this.restTried = true; return { t: 'potion', id }; }
			}
		}
		this.restTried = false;
		for (let guard = 0; guard < 200; guard++) {
			const r = this.walk();
			if (r !== undefined) return r;
			if (this.finished) return null;
		}
		this.finished = true;
		return null;
	}

	/** after applying: progress bookkeeping */
	observe(inp, rec) {
		const key = `${this.heroCell()}|${this.cur}|${rec.rng.nx}|${this.h.n.length}|${this.h.o.length}|${this.h.C}`;
		if (rec.r === 'ok' && key !== this.lastKey) this.stall = 0;
		else this.stall++;
		this.lastKey = key;
		if (this.pendingBump && rec.r === 'ok') this.done.add(this.pendingBump);
		this.pendingBump = null;
	}

	/** one waypoint decision: an input, or undefined after moving the cursor (call again) */
	walk() {
		const h = this.h;
		if (this.cur >= this.route.length) {
			if (h.i_() > 0 && this.route.length && this.replans < 100) { this.replan(); return undefined; }
			this.finished = true;
			return null;
		}
		const w0 = this.route[this.cur];
		if (this.stall > 8) { this.failLeg('stall'); return undefined; }
		const H = this.heroCell();
		// progress: the hero stands on a route cell ahead (up to the next bump / jump)
		for (let k = this.cur; k < Math.min(this.route.length, this.cur + 60); k++) {
			const q = this.route[k];
			if (q.jump || q.bump || q.exit || q.walkDone || q.barrels) break;
			if (q.exact) {
				// exact walks (the floor nonogram) advance one cell at a time: cells repeat along the dips
				if (k === this.cur && q.i === H) this.cur = k + 1;
				break;
			}
			if (q.i === H) this.cur = k + 1;
		}
		if (this.cur !== this.route.indexOf(w0)) return undefined;
		const w = w0;
		const tk = this.cur;
		const tries = (this.tries.get(tk) || 0) + 1;
		this.tries.set(tk, tries);
		if (tries > 14) { this.failLeg('tries'); return undefined; }

		if (w.walkDone) { this.nonogramDone = true; this.cur++; return undefined; }
		if (w.barrels) return this.barrels(H, tries);
		if (w.exact && this.cur > 0 && this.route[this.cur - 1].walkStart && !w.leg.rewalked) {
			// on the puzzle's corner: re-plan the dips from the floor's current state (the way in may have
			// toggled cells, a fight may have interrupted)
			w.leg.rewalked = true;
			const walk = this.nonogramDips();
			let end = this.cur;
			while (end < this.route.length && this.route[end].exact) end++;
			this.route.splice(this.cur, end - this.cur, ...walk.map((i) => ({ i, exact: true, leg: w.leg })));
			this.tries.clear();
			return undefined;
		}
		if (w.exit) {
			// step onto an adjacent stairs tile (type 5)
			for (const [dx, dy] of DIR4) {
				const x = h.f.b.a + dx, y = h.f.b.b + dy;
				if (x < 0 || y < 0 || x >= h.g || y >= h.h) continue;
				if (h.j[y * h.g + x].a === 5) {
					if (++this.exitTries > 3) { this.finished = true; return null; }
					return { t: 'step', dx, dy };
				}
			}
			this.failLeg('no stairs');
			return undefined;
		}
		if (w.bump) {
			const live = w.rec.ref;
			const gone = w.bump === 'obj' ? !h.n.includes(live) : !h.o.includes(live) || live.u_();
			if (gone || this.done.has(live)) { this.stats.stops++; this.cur++; return undefined; }
			if (tries > 6) { this.failLeg('bump tries'); return undefined; }
			this.stats.bumps++;
			const tgt = this.footNear(live);
			if (this.adjacent(H, tgt) || w.bump === 'cr' || tries > 3) this.pendingBump = this.adjacent(H, tgt) ? live : null;
			return this.tapCell(tgt);
		}
		if (w.jump) {
			const land = this.route[this.cur + 1];
			if (this.jumpFrom != null && H !== this.jumpFrom) { this.jumpFrom = null; this.cur++; return undefined; }   // went through
			if (land && land.i === H) { this.cur += 2; return undefined; }
			if (land && land.i !== undefined && this.pathLen(land.i) > 0) { this.cur++; return undefined; }   // no need to
			const t = this.teleportNear(H);
			if (t == null || tries > 4) {
				const prev = this.route[this.cur - 1];
				if (t == null && prev && prev.i !== undefined && prev.i !== H && tries <= 4 && this.pathLen(prev.i) > 0) return this.tapCell(prev.i);
				this.failLeg('no teleport');
				return undefined;
			}
			this.stats.bumps++;
			this.jumpFrom = H;
			return this.tapCell(t);
		}
		const i = w.i;
		const o = h.k[i];
		if (o != null && o !== h.f && !(o.a.a === 84) && this.adjacent(H, i)) {
			// something on the route cell: bump it
			if (tries > 6) { this.blocked.add(i); this.failLeg('blocked'); return undefined; }
			this.stats.bumps++;
			return this.tapCell(i);
		}
		if (w.exact) {
			if (this.adjacent(H, i)) return this.stepTo(i);
			if (H !== i) {
				if (this.pathLen(i) > 0) return this.tapCell(i);
				const s = this.stepTo(i);
				if (s) return s;
				this.failLeg('exact');
				return undefined;
			}
		}
		// tap a route cell ahead: the furthest plain one (no object, no jump / bump / exact) the game can path to
		let last = this.cur;
		for (let k = this.cur; k < Math.min(this.route.length, this.cur + 30); k++) {
			const q = this.route[k];
			if (q.jump || q.bump || q.exit || q.exact || q.walkDone || q.barrels) break;
			const oo = h.k[q.i];
			if (oo != null && oo !== h.f && oo.a.a !== 84) break;
			last = k;
		}
		const cands = [];
		for (let k = last; k >= this.cur; k--) cands.push(k);
		if (this.r.chance(0.15) && cands.length > 1) cands.unshift(cands[this.r.next(cands.length)]);
		for (const k of cands.slice(0, 12)) {
			const ci = this.route[k].i;
			if (ci === H) continue;
			if (this.adjacent(H, ci) && this.r.chance(0.5)) return this.stepTo(ci);
			if (this.pathLen(ci) > 0) return this.tapCell(ci);
		}
		const s = this.stepTo(i);
		if (s) return s;
		this.failLeg('unreachable');
		return undefined;
	}

	/** the floor nonogram (c30.u0): dips from the corner at(2,2) that toggle exactly the cells that differ */
	nonogramDips() {
		const h = this.h, c = this.c, g = h.g;
		const pat = zw.O[h.A];
		const at = (gx, gy) => (c.w0 + gy) * g + (c.v0 + gx);
		const fills = [];
		for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
			const set = (h.j[at(q + 3, r + 3)].b & -128) !== 0;
			if (set !== (pat[(r + 3) * 8 + q + 3] !== 0)) fills.push([q, r]);
		}
		const walk = [];
		let cur = [2, 2];
		const moveBorder = (tx, ty) => {
			while (cur[0] !== tx || cur[1] !== ty) {
				if (cur[1] === 2 && ty === 2) cur = [cur[0] + Math.sign(tx - cur[0]), 2];
				else if (cur[0] === 2 && tx === 2) cur = [2, cur[1] + Math.sign(ty - cur[1])];
				else if (cur[1] === 2) cur = [cur[0] + Math.sign(2 - cur[0]), 2];
				else cur = [2, cur[1] + Math.sign(2 - cur[1])];
				walk.push(at(cur[0], cur[1]));
			}
		};
		const dips = fills.map(([q, r]) => (r <= q ? { side: 'top', bx: q + 3, by: 2, depth: r + 1 } : { side: 'left', bx: 2, by: r + 3, depth: q + 1 }));
		dips.sort((a, b) => (a.side === b.side ? (a.side === 'top' ? a.bx - b.bx : a.by - b.by) : a.side === 'top' ? -1 : 1));
		for (const d of dips) {
			moveBorder(d.bx, d.by);
			const path = [];
			for (let k = 1; k <= d.depth; k++) path.push(d.side === 'top' ? at(d.bx, 2 + k) : at(2 + k, d.by));
			walk.push(...path, ...path.slice(0, -1).reverse(), at(d.bx, d.by));
		}
		return walk;
	}

	/** barrel puzzle (m0 push, door 60 at c30.u0): solve once, then walk + push; undefined = cursor moved */
	barrels(H, tries) {
		const h = this.h, c = this.c, g = h.g;
		if (c.u0 === 0 || h.k[c.u0] == null) { this.cur++; return undefined; }
		if (!this.pushes) {
			this.pushes = this.solveBarrels() || [];
			this.pushAt = 0;
			if (this.opts.verbose) console.error(`  barrels: ${this.pushes.length} pushes`);
		}
		if (this.pushAt >= this.pushes.length || tries > 200) { this.pushes = null; this.cur++; return undefined; }
		const p = this.pushes[this.pushAt];
		if (H === p.from) {
			const o = h.k[p.from + p.d[0] + p.d[1] * g];
			if (o == null || !o.a.u) { this.pushes = null; this.cur++; return undefined; }   // not as planned
			this.pushAt++;
			return { t: 'step', dx: p.d[0], dy: p.d[1] };
		}
		if (this.adjacent(H, p.from)) return this.stepTo(p.from);
		if (this.pathLen(p.from) > 0) return this.tapCell(p.from);
		this.pushes = null;
		this.cur++;
		return undefined;
	}

	/** pushes [{ from: hero cell, d: [dx, dy] }] that put pushables on every plate near the barrel door, or null */
	solveBarrels() {
		const h = this.h, c = this.c, g = h.g;
		const dx0 = c.u0 % g, dy0 = (c.u0 / g) | 0;
		const near = (i) => Math.max(Math.abs((i % g) - dx0), Math.abs(((i / g) | 0) - dy0)) <= 12;
		const plates = [];
		for (let i = 0; i < h.j.length; i++) if (h.j[i].n_() && near(i)) plates.push(i);
		const boxes = [];
		for (const o of h.n) { const i = o.b.b * g + o.b.a; if (o.a.u && near(i)) boxes.push(i); }
		const open = plates.filter((p) => !boxes.includes(p));
		const loose = boxes.filter((b) => !plates.includes(b));
		if (!open.length || loose.length < open.length || loose.length > 6) return null;
		const H0 = this.heroCell();
		const floor = (i, occ) => !occ.has(i) && (h.z_(i % g, (i / g) | 0) || i === H0 || boxes.includes(i)) && c.j[i] > 0;
		const reach = (from, occ) => {
			const seen = new Set([from]);
			const q = [from];
			while (q.length) {
				const u = q.pop();
				for (const [dx, dy] of DIR4) {
					const v = u + dx + dy * g;
					if (!seen.has(v) && floor(v, occ) && near(v)) { seen.add(v); q.push(v); }
				}
			}
			return seen;
		};
		// one box at a time (BFS over box cell x hero cell), the others fixed
		const one = (box, goal, hero, occ) => {
			const key = (b, p) => b * h.j.length + p;
			const prev = new Map([[key(box, hero), null]]);
			const q = [[box, hero]];
			while (q.length) {
				const [b, p] = q.shift();
				if (b === goal) {
					const out = [];
					for (let k = key(b, p); prev.get(k); k = prev.get(k).k) out.push(prev.get(k).push);
					return { pushes: out.reverse(), hero: p };
				}
				const occ2 = new Set(occ); occ2.add(b);
				const r = reach(p, occ2);
				for (const [dx, dy] of DIR4) {
					// bumping a pushable from `from` pushes it to `to`; when it cannot move, hero and pushable swap (hw.N)
					const from = b - dx - dy * g, to = b + dx + dy * g;
					if (!r.has(from)) continue;
					const nb = floor(to, occ2) && near(to) ? to : from;
					const k = key(nb, b);
					if (prev.has(k)) continue;
					prev.set(k, { k: key(b, p), push: { from, d: [dx, dy] } });
					q.push([nb, b]);
				}
				if (prev.size > 200000) return null;
			}
			return null;
		};
		// depth-first over (box, plate) choices, nearest pairs first, with a budget of single-box searches
		let budget = 600;
		const dist = (a, b) => Math.abs((a % g) - (b % g)) + Math.abs(((a / g) | 0) - ((b / g) | 0));
		const dfs = (loose, open, placed, hero) => {
			if (!open.length) return [];
			const pairs = [];
			for (const b of loose) for (const pl of open) pairs.push([dist(b, pl), b, pl]);
			pairs.sort((x, y) => x[0] - y[0]);
			for (const [, b, pl] of pairs) {
				if (--budget < 0) return null;
				const occ = new Set([...placed, ...loose.filter((x) => x !== b)]);
				const r = one(b, pl, hero, occ);
				if (!r) continue;
				const rest = dfs(loose.filter((x) => x !== b), open.filter((x) => x !== pl), new Set([...placed, pl]), r.hero);
				if (rest) return [...r.pushes, ...rest];
			}
			return null;
		};
		return dfs(loose, open, new Set(boxes.filter((b) => plates.includes(b))), H0);
	}

	footNear(o) {
		const h = this.h;
		const rt = o.a;
		const T = rt.T || 1, U = rt.U || 1;
		const th = o.c ? T : U, tw = o.c ? U : T;
		const H = this.heroCell();
		let best = o.b.b * h.g + o.b.a, bd = Infinity;
		if (o.e_()) return best;
		for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
			const x = o.b.a + dx, y = o.b.b - dy;
			if (x < 0 || y < 0 || x >= h.g || y >= h.h) continue;
			const i = y * h.g + x;
			const d = Math.abs(x - h.f.b.a) + Math.abs(y - h.f.b.b);
			if (d < bd || (d === bd && this.adjacent(H, i))) { bd = d; best = i; }
		}
		return best;
	}

	teleportNear(H) {
		const h = this.h, g = h.g;
		const hx = H % g, hy = (H / g) | 0;
		for (const o of h.n) {
			if (!TELEPORTS.has(o.a.a)) continue;
			const rt = o.a;
			const T = rt.T || 1, U = rt.U || 1;
			const th = o.c ? T : U, tw = o.c ? U : T;
			for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
				const x = o.b.a + dx, y = o.b.b - dy;
				if (Math.abs(x - hx) + Math.abs(y - hy) === 1) return y * g + x;
			}
		}
		return null;
	}

	/** --chaos: a random input near the hero (any tap, any owned item or learned skill at any cell, wait, cancel) */
	chaos() {
		const h = this.h, me = h.f, r = this.r, p = me.b;
		const cell = () => ({ x: Math.max(0, Math.min(h.g - 1, p.a + r.next(13) - 6)), y: Math.max(0, Math.min(h.h - 1, p.b + r.next(13) - 6)) });
		const k = r.next(10);
		if (k < 4) return { t: 'tap', ...cell() };
		if (k < 5) return { t: 'wait' };
		if (k < 6) return { t: 'cancel' };
		if (k < 8) {
			const inv = me.D.c.map((e) => e.a.a).filter((id) => id !== 173 && id !== 185 && (id < 237 || id > 239));
			if (inv.length) { const id = r.pick(inv); return r.chance(0.7) ? { t: 'item', id, ...cell() } : { t: 'potion', id }; }
		}
		const sk = [20001, 20002, 20003, 20004, 20005, 20006, 20007];
		return { t: 'skill', id: r.pick(sk), ...cell() };
	}

	// ---- combat ----
	combat() {
		const h = this.h, me = h.f, r = this.r, c = this.c;
		const foes = this.hostiles();
		const nn = this.nearest(foes);
		const sel = this.selId();
		if (sel !== 0) return { t: 'cancel' };
		const hp = me.j.v_(), hpM = me.q_();
		if (hp * 2 < hpM && r.chance(0.75)) {
			for (const id of [122, 120]) if (this.has(id)) return { t: 'potion', id };
		}
		if (!nn) return r.chance(0.5) ? { t: 'wait' } : this.randomStep();
		const m = nn.m;
		const at = (q) => ({ x: q.b.a, y: q.b.b });
		const P = me.b;
		const cheb = (q) => Math.max(Math.abs(q.b.a - P.a), Math.abs(q.b.b - P.b));
		const seen = (q) => c.j[q.b.b * h.g + q.b.a] > 0;
		const range = (h.e.h[3] + 3) | 0;
		const inRange = foes.filter((q) => seen(q) && cheb(q) <= range);
		const pickFoe = (pred) => { const l = inRange.filter(pred); return l.length ? r.pick(l) : null; };
		const acts = [];
		const add = (w, inp) => { if (inp && w > 0) acts.push([w, inp]); };
		add(this.stall > 3 ? 4 : 36, { t: 'tap', ...at(m) });
		const sealed = foes.filter((q) => q.d && q.i_(h.e) > 0 && cheb(q) <= 3);
		if (sealed.length) add(12, { t: 'unseal', ...at(r.pick(sealed)) });
		add(4, { t: 'wait' });
		add(3, this.stepAway(m));
		const learned = (id) => { const sk = zw.q.get(id); return sk && sk.h && (sk.o === -1 || h.e.h[sk.o] >= 1) && me.E_() >= sk.g && me.z.v_() >= sk.f; };
		if (learned(20002)) add(5, { t: 'skill', id: 20002, ...at(m) });
		if (learned(20003) && nn.d <= 1) add(4, { t: 'skill', id: 20003 });
		if (learned(20004)) add(this.opts.weights?.[20004] ?? 2, { t: 'skill', id: 20004 });
		if (learned(20005) && me.z.v_() < me.D_()) add(2, { t: 'skill', id: 20005 });
		if (learned(20006) && hp < (hpM + 1) / 2) add(4, { t: 'skill', id: 20006 });
		if (learned(20007)) add(1, { t: 'skill', id: 20007 });
		for (const e of me.D.c) {
			const it = e.a, id = it.a;
			if (id === 123 || !it.d0) continue;
			const W = this.opts.weights?.[id] ?? (it.c0 === 7 ? 8 : 3);
			if (it.b0) {
				let t = null;
				switch (it.c0) {
					case 6: case 7: { const fr = this.freeAdj(); if (fr) add(W, { t: 'item', id, x: fr[0], y: fr[1] }); continue; }
					case 1: t = pickFoe((q) => cheb(q) >= 2); break;                                   // kunai, daggers
					case 2: case 3: t = pickFoe((q) => cheb(q) >= 2); break;                           // grenades (hero not in the 3x3)
					case 4: case 11: t = pickFoe(() => true); break;                                   // flamethrower, mummy powder
					case 10: t = pickFoe((q) => q.i_(h.e) > 0); break;                                 // MP bomb: sealed critters
					case 5: t = pickFoe((q) => (cheb(q) >= 2 || q.w_()) && q.q === 0 && (!q.w_() || q.s_(2048))); break;   // net
					case 9: t = pickFoe((q) => cheb(q) >= 2 && q.q === 0 && !q.a.l0); break;           // hook, whip
					case 8: t = pickFoe((q) => q.w_() && !q.s_(2048)); if (t) add(W * 4, { t: 'item', id, ...at(t) }); continue;   // bait
					case 12: t = pickFoe((q) => q.a.m0 && !q.s_(16384)); if (t) add(W * 6, { t: 'item', id, ...at(t) }); continue; // secret name
					default: t = pickFoe(() => true);
				}
				if (t) add(W, { t: 'item', id, ...at(t) });
			} else if (it.X !== 0 || it.Y > 0 || it.Z > 0 || it.a0 !== 0 || id === 295 || id === 304) {
				if (hp < hpM || me.z.v_() < me.D_() || r.chance(0.1)) add(1, { t: 'potion', id });
			}
		}
		let tot = 0;
		for (const [w] of acts) tot += w;
		let k = r.next(tot);
		for (const [w, inp] of acts) { if (k < w) return inp; k -= w; }
		return { t: 'wait' };
	}

	freeAdj() {
		const h = this.h, p = h.f.b;
		const c = [];
		for (const [dx, dy] of DIR4) if (h.z_(p.a + dx, p.b + dy)) c.push([p.a + dx, p.b + dy]);
		return c.length ? this.r.pick(c) : null;
	}

	stepAway(m) {
		const h = this.h, p = h.f.b;
		const best = [];
		for (const [dx, dy] of DIR4) {
			if (!h.z_(p.a + dx, p.b + dy)) continue;
			const d = Math.max(Math.abs(p.a + dx - m.b.a), Math.abs(p.b + dy - m.b.b));
			best.push([d, dx, dy]);
		}
		if (!best.length) return null;
		best.sort((a, b) => b[0] - a[0]);
		return { t: 'step', dx: best[0][1], dy: best[0][2] };
	}

	randomStep() {
		const [dx, dy] = this.r.pick(DIR4);
		return { t: 'step', dx, dy };
	}
}

/** Generate one run's inputs with the JS engine: spec as exploreSpecs / targetSpecs; returns { inputs, stats } or { error }. */
export function explore(spec, opts = {}) {
	resetStatics(tablesJson);
	const fight = newFight(setupOf(spec));
	if (fight.error) return { error: fight.error };
	const pol = new Policy(fight, opts.pseed ?? 1, { ...opts, at: spec.at, weights: spec.weights });
	const inputs = [];
	const max = opts.max ?? 1500;
	const t0 = Date.now();
	let last = fight.init;
	const rs = { ok: 0, noop: 0, rejected: 0 };
	while (inputs.length < max) {
		let inp;
		try { inp = pol.next(); } catch (e) { last = { st: 'policy', err: errText(e), stack: e.stack }; break; }
		if (!inp) break;
		const rec = fight.apply(inp);
		inputs.push(inp);
		rs[rec.r]++;
		pol.observe(inp, rec);
		last = rec;
		if (rec.st === 'end' || rec.st === 'err' || rec.st === 'dlg') break;
	}
	const h = fight.h;
	return {
		inputs,
		stats: { ...pol.stats, ...rs, n: inputs.length, st: last.st, err: last.err, objectivesLeft: h.i_(), dead: h.f.u_(),
			route: pol.route.length, cur: pol.cur, ms: Date.now() - t0, planError: pol.planError },
	};
}

// ---- CLI -------------------------------------------------------------------------------------------
function seedsByType(dir) {
	const by = new Map();
	for (const f of fs.readdirSync(dir).sort()) {
		const m = /^(\d+)-(\d+)\.json$/.exec(f);
		if (!m) continue;
		if (!by.has(+m[1])) by.set(+m[1], []);
		by.get(+m[1]).push(+m[2]);
	}
	return by;
}

/** the fight setup of a spec (driver.newFight fields): strong hero, optional --kit2 / --quests / --trapsindif */
export function setupOf(s) {
	const o = { mode: 'fightgen', type: s.type, seed: s.seed, xseed: s.xseed, at: s.at ?? 'start', level: 21, gear: 4, kit: true };
	if (s.kit2) o.kit2 = true;
	if (s.quests) o.quests = s.quests;
	if (s.trapsindif != null) o.trapsindif = s.trapsindif;
	if (s.pets) o.pets = s.pets;
	if (s.skills) o.skills = s.skills;
	return o;
}

/**
 * Whole-dungeon runs: `seeds` per type. Variant k = 3 plays without --kit2 and with --trapsindif 0 (no traps
 * indifference skill, pref off: traps trigger), the others with --kit2.
 */
export function exploreSpecs({ types, seeds = 3, from = 0, seedDir, kit2 = true, prefix = 'x', max = 1500 }) {
	const by = seedsByType(seedDir);
	const out = [];
	for (const t of types) {
		const list = by.get(t) || [];
		for (let k = from; k < from + seeds && k < list.length; k++) {
			const seed = list[(11 + 3 * k) % list.length];
			const xseed = (Math.imul(seed, 31) + 1000 * t + k) & 0x3fffffff;
			const sp = { name: `${prefix}-${t}-${k}`, type: t, seed, xseed, kit2, pseed: 1 + 97 * t + k, max };
			if (k % 4 === 3) { sp.kit2 = false; sp.trapsindif = 0; }
			out.push(sp);
		}
	}
	return out;
}

/**
 * Targeted runs (`near:x,y` of one creature, then the same policy): one or two creatures per monster ability bit
 * (bw.q0), summoners (C0), transformers (E0), invincible bosses (m0, with the secret name 306 of --kit2), NPC kinds
 * (qw.h 1001 prisoner, 1004, 1005, 1007, quest NPCs), allies (k 1), and the HP-threshold boss 621 (K0), which the
 * generator only places in types 23-25 while quest 73 is active (--quests 73). Instances come from the generator
 * batch (seedDir) dumps, first by type then seed.
 */
export function targetSpecs({ seedDir, prefix = 'xt', max = 600 }) {
	const inst = new Map();   // creature id -> [{type, seed, x, y, k, h}]
	for (const f of fs.readdirSync(seedDir).sort()) {
		if (!/^\d+-\d+\.json$/.test(f)) continue;
		const l = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
		if (l.error) continue;
		for (const c of l.critters) {
			if (c.id === 180) continue;
			if (!inst.has(c.id)) inst.set(c.id, []);
			inst.get(c.id).push({ type: l.type, seed: l.seed, x: c.x, y: c.y, k: c.k, h: c.h });
		}
	}
	const out = [];
	const used = new Set();
	const add = (tag, id, n = 1, pick = () => true) => {
		const list = (inst.get(id) || []).filter(pick);
		for (let j = 0, got = 0; j < list.length && got < n; j++) {
			const a = list[(j * 7) % list.length];
			const key = `${a.type}:${a.seed}:${a.x}:${a.y}`;
			if (used.has(key)) continue;
			used.add(key);
			got++;
			out.push({ name: `${prefix}-${tag}-${id}-${got - 1}`, type: a.type, seed: a.seed, xseed: (Math.imul(a.seed, 17) + id) & 0x3fffffff,
				at: `near:${a.x},${a.y}`, kit2: true, pseed: 7 + id * 13 + got, max });
		}
	};
	const ids = [...zw.R.keys()].filter((id) => inst.has(id));
	for (let b = 0; b < 15; b++) {
		const m = 1 << b;
		const with_ = ids.filter((id) => (zw.R.get(id).q0 & m) !== 0);
		for (const id of with_.slice(0, 2)) add(`q${m}`, id);
		if (with_.length > 2) add(`q${m}`, with_[with_.length - 1]);
	}
	for (const id of ids.filter((id) => zw.R.get(id).C0).slice(0, 3)) add('C0', id);
	for (const id of ids.filter((id) => zw.R.get(id).E0)) add('E0', id);
	for (const id of ids.filter((id) => zw.R.get(id).m0)) add('m0', id);
	for (const id of ids.filter((id) => zw.R.get(id).M0)) add('M0', id);
	for (const tag of [1001, 1004, 1005, 1007, 42, 27, 24]) {
		const id = ids.find((i) => inst.get(i).some((a) => a.h === tag && a.k === 0));
		if (id != null) add(`npc${tag}`, id, 2, (a) => a.h === tag);
	}
	// quest NPCs with their quest active (16) or done (128): the generator places them by quest state, so find them
	// in a JS generation of the same seed
	for (const tag of [42, 27, 24]) {
		const a = [...inst.values()].flat().find((x) => x.h === tag && x.k === 0);
		if (!a) continue;
		for (const bits of [16, 128]) {
			const quests = `${tag}:${bits}`;
			resetStatics(tablesJson);
			const f = newFight({ mode: 'fightgen', type: a.type, seed: a.seed, xseed: 1, at: 'start', quests });
			const npc = f.error ? null : f.h.o.find((c) => c.k === 0 && c.h === tag) || f.h.o.find((c) => c.k === 0 && c.h !== 0 && c !== f.h.f);
			if (npc) out.push({ name: `${prefix}-quest${tag}-${bits}`, type: a.type, seed: a.seed, xseed: (a.seed * 11 + tag + bits) & 0x3fffffff, at: `near:${npc.b.a},${npc.b.b}`, kit2: true, quests, pseed: tag * 3 + bits, max });
		}
	}
	const ally = ids.find((i) => inst.get(i).some((a) => a.k === 1));
	if (ally != null) add('ally', ally, 2, (a) => a.k === 1);
	// catching a pet: next to the pet species 190 / 191, demoralize (20004) and the net (174) weighted up, so a netted
	// demoralised one is bumped (c30.f(21) -> R0 catch, c30.a(uw))
	for (const id of [190, 191]) add('catch', id, 2);
	for (const id of [190, 191]) add('bait', id, 1);
	for (const x of out) if (x.name.includes('-catch-')) x.weights = { 20004: 20, 174: 30 };
	for (const x of out) if (x.name.includes('-bait-')) x.weights = { 235: 40, 236: 40 };
	// bait with taming 0 (--skills 15:0): pets the guild cannot keep give the taming toast (vj0.d0)
	for (const id of [190, 191]) add('bait0', id, 1);
	for (const x of out) if (x.name.includes('-bait0-')) { x.weights = { 235: 40, 236: 40 }; x.skills = '15:0'; }
	// familiars 225-227 (--pets): three companions of the pet species 190-193 with food, whole runs on a few types
	const PETS = '190:5:1:236:3,191:11:2:235:2,192:23:3:252:2';
	for (const t of [2, 10, 18, 23]) {
		const seed = [...new Set([...inst.values()].flat().filter((a) => a.type === t).map((a) => a.seed))].sort()[2];
		if (seed != null) out.push({ name: `${prefix}-pets-${t}`, type: t, seed, xseed: (seed * 3 + 225) & 0x3fffffff, at: 'auto', kit2: true, pets: PETS, pseed: 225 + t, max });
	}
	// the invincible bosses (m0: 620 / 624 / 625) with their quest (73 / 74 / 75) done: zw.n(type) is false, so the
	// secret name (306) works on them (DungameView tap, item kind 12)
	for (const t of [23, 24, 25]) {
		const seeds = [...new Set([...inst.values()].flat().filter((a) => a.type === t).map((a) => a.seed))].sort();
		const quests = `${50 + t}:128`;
		for (const seed of seeds.slice(3, 5)) {
			resetStatics(tablesJson);
			const f = newFight({ mode: 'fightgen', type: t, seed, xseed: 1, at: 'start', quests });
			const b = f.error ? null : f.h.o.find((c) => c.a.m0);
			if (b) out.push({ name: `${prefix}-m0q-${b.a.a}-${seed % 1000}`, type: t, seed, xseed: (seed * 7 + t) & 0x3fffffff, at: `near:${b.b.a},${b.b.b}`, kit2: true, quests, pseed: 306 + t, max, weights: { 306: 40 } });
		}
	}
	// K0: boss 621 with quest 73 active (placed by the generator; the positions come from a JS generation)
	for (const t of [23, 24, 25]) {
		const seeds = [...inst.values()].flat().filter((a) => a.type === t).map((a) => a.seed);
		const seed = [...new Set(seeds)].sort()[1];
		if (seed == null) continue;
		resetStatics(tablesJson);
		const f = newFight({ mode: 'fightgen', type: t, seed, xseed: 1, at: 'start', quests: '73' });
		const b = f.error ? null : f.h.o.find((c) => c.a.K0 > 0);
		if (b) out.push({ name: `${prefix}-K0-621-${t}`, type: t, seed, xseed: (seed * 5 + t) & 0x3fffffff, at: `near:${b.b.a},${b.b.b}`, kit2: true, quests: '73', pseed: 621 + t, max });
	}
	return out;
}

/** oracle argv (fightgen) of a spec, with the inputs file (and the output file, else run.sh's [out] slot is left out) */
export function oracleArgs(s, inputsFile, outFile, extra = ['--draws']) {
	const a = ['fightgen', String(s.type), String(s.seed), String(s.xseed), s.at ?? 'start', inputsFile];
	if (outFile) a.push(outFile);
	a.push('--level', '21', '--gear', '4', '--kit');
	if (s.kit2) a.push('--kit2');
	if (s.quests) a.push('--quests', s.quests);
	if (s.trapsindif != null) a.push('--trapsindif', String(s.trapsindif));
	if (s.pets) a.push('--pets', s.pets);
	if (s.skills) a.push('--skills', s.skills);
	return a.concat(extra);
}

function parseTypes(v) {
	if (!v) return [...Array(27).keys()];
	const out = [];
	for (const p of v.split(',')) {
		const m = /^(\d+)-(\d+)$/.exec(p);
		if (m) for (let t = +m[1]; t <= +m[2]; t++) out.push(t);
		else out.push(+p);
	}
	return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const args = process.argv.slice(2);
	const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
	const verbose = args.includes('-v');
	const OUT = opt('out', '/tmp/nk-explore');
	const RE = process.env.NK_RE || path.resolve(here, '../../nonograms-katana');
	const RUN = path.join(RE, 'tools/oracle/run.sh');
	const seedDir = opt('seedDir', path.join(os.homedir(), '.cache/nk-oracle/fx7'));
	let specs = args.includes('--targets')
		? targetSpecs({ seedDir, max: +opt('max', 600) })
		: exploreSpecs({ types: parseTypes(opt('types')), seeds: +opt('seeds', 3), from: +opt('from', 0), seedDir, kit2: !args.includes('--nokit2'), prefix: opt('name', 'x'), max: +opt('max', 1500) });
	if (opt('only')) specs = specs.filter((s) => new RegExp(opt('only')).test(s.name));
	if (args.includes('--list')) { for (const s of specs) console.log(s.name.padEnd(22), oracleArgs(s, '<in>').join(' ')); process.exit(0); }
	const pseed = opt('pseed', null);
	fs.mkdirSync(OUT, { recursive: true });
	const oracle = args.includes('--oracle');
	const jobs = +opt('jobs', Math.max(1, Math.min(6, os.cpus().length >> 1)));
	const runs = [];
	for (const s of specs) {
		const inFile0 = path.join(OUT, `${s.name}.inputs.json`);
		if (args.includes('--reuse') && fs.existsSync(inFile0)) { runs.push({ s, inFile: inFile0 }); continue; }
		const r = explore(s, { pseed: pseed != null ? +pseed : s.pseed, max: s.max, verbose, chaos: +opt('chaos', 0) });
		if (r.error) { console.log(`${s.name}: setup error ${r.error}`); continue; }
		const inFile = path.join(OUT, `${s.name}.inputs.json`);
		fs.writeFileSync(inFile, JSON.stringify(r.inputs));
		const st = r.stats;
		console.log(`${s.name.padEnd(9)} t${s.type} ${s.seed}: ${st.n} inputs (ok ${st.ok} noop ${st.noop} rej ${st.rejected}; combat ${st.combatInputs}) st=${st.st}`
			+ ` obj left ${st.objectivesLeft} dead ${st.dead ? 1 : 0} route ${st.cur}/${st.route} skips ${st.skips} ${st.ms}ms${st.err ? ' ERR ' + st.err : ''}${st.planError ? ' PLAN ' + st.planError : ''}`);
		runs.push({ s, inFile });
	}
	if (oracle) {
		let i = 0, failed = 0;
		const outs = [];
		const t0 = Date.now();
		await new Promise((done) => {
			let running = 0;
			const pump = () => {
				if (i >= runs.length && running === 0) return done();
				while (running < jobs && i < runs.length) {
					const { s, inFile } = runs[i++];
					running++;
					const outFile = path.join(OUT, `${s.name}.json`);
					const p = spawn(RUN, oracleArgs(s, inFile, outFile, [args.includes('--trace') ? '--trace' : '--draws', ...(args.includes('--cells') ? ['--cells'] : [])]), { stdio: ['ignore', 'ignore', 'pipe'] });
					let err = '';
					p.stderr.on('data', (d) => { err += d; });
					p.on('close', (code) => {
						running--;
						if (code !== 0) { failed++; console.log(`${s.name}: oracle exit ${code}: ${err.trim().split('\n').pop()}`); }
						else outs.push(outFile);
						pump();
					});
				}
			};
			pump();
		});
		console.log(`oracle: ${outs.length} runs (${failed} failed) in ${((Date.now() - t0) / 1000) | 0}s; comparing`);
		if (!outs.length) process.exit(1);
		const q = spawn('node', [path.join(here, '../test/combat.mjs'), ...outs.sort()], { stdio: 'inherit' });
		await new Promise((r) => q.on('close', r));
	}
}
