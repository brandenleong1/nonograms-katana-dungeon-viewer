// Route plans, remembered: the walker (js/solve/sim.js) re-plans from wherever it stands after a failure, an unsealed
// door or a fountain, and the solver reaches the same few states again and again (every sample of a robust solve walks
// the same dungeon). Planning from one costs milliseconds; this answers a state it has planned before with a lookup.
//
// A plan is a pure function of the planner's input, so the key is that input, all of it:
//   - the level the planner reads, as the walker built it: type, size, nonogram pattern, every cell, and every object
//     and creature (id, position, flags, k). Each is compared in full on a hit: the hash only picks the bucket, so a
//     collision costs a compare, never a wrong plan.
//   - the options that vary between calls, which the caller lists as `extras` (how exact the visiting order is, the
//     keys held, whether the nonogram is solved, which fountains count as stops).
//   - the game tables the options point into (zw.Q, zw.R, zw.M, zw.O, zw.u): static, but if a new set of them is
//     installed everything cached is dropped.
// An input this can't key exactly (a field that isn't an int32, or an option it doesn't know) is never cached.
//
// What is kept is what Walker.followPlan reads, `{ legs, route }`. A leg's stop names the level's object or creature
// it is about (stop.rec, a record that carries the live `ref`); the cache stores where it sits in the level's lists
// and hands back the record at that place in the asking level, so a plan made on one fight serves another. Plans
// are shared between callers and are never written.

import { zw } from '../gen/statics.js';

/** the planner options the key accounts for: planOptions() must have exactly these, or the cache is bypassed */
const KEYED_OPTIONS = ['rw', 'bw', 'pwOf', 'patterns', 'tiles', 'endAtExit', 'exactLimit', 'heldKeys'];
const OBJECT_FIELDS = ['id', 'x', 'y', 'c', 'd', 'e', 'f', 'g', 'h'];
const CRITTER_FIELDS = [...OBJECT_FIELDS, 'k'];
/** roughly what one plan weighs besides its key, per route cell and leg (the budget below is a guess, not a measure) */
const PLAN_BYTES = 200;
const DEFAULT_BUDGET = 32 * 1024 * 1024;

export class PlanCache {
	/** budget: about how many bytes of keys and plans to keep; past it the cache starts over */
	constructor(budget = DEFAULT_BUDGET) {
		this.budget = budget;
		this.hits = 0;
		this.misses = 0;
		this.clear();
	}

	clear() {
		this.byHash = new Map();   // hash -> entries sharing it
		this.bytes = 0;
		this.tables = null;
	}

	/**
	 * The key of a planner input (the walker's level, its options, and `extras`: the ints the options vary by), or
	 * null when it can't be keyed exactly.
	 */
	keyOf(level, options, extras) {
		if (!hasKeyedOptions(options)) return null;
		const ints = encode(level, extras);
		return ints === null ? null : { ints, hash: hashOf(ints) };
	}

	/** the plan cached for `key`, its stops' records those of `level`; null when there is none */
	get(key, level) {
		this.checkTables();
		const bucket = this.byHash.get(key.hash);
		if (bucket !== undefined) {
			for (const entry of bucket) {
				if (sameInts(entry.ints, key.ints)) {
					this.hits++;
					return rebind(entry, level);
				}
			}
		}
		this.misses++;
		return null;
	}

	/** remember `plan` (planRoute's result for `level`) under `key`, which `keyOf` made before planning */
	put(key, level, plan) {
		const recs = recordPlaces(plan, level);
		if (recs === null) return;
		if (this.bytes > this.budget) this.clear();
		this.checkTables();
		// the records name live objects of the fight that was planned; keep only where they sit, so a cached plan
		// doesn't hold that fight's objects
		const legs = plan.legs.map((leg, i) => (recs[i] === null ? leg : { ...leg, stop: { ...leg.stop, rec: null } }));
		const entry = { ints: key.ints, legs, route: plan.route, recs };
		let bucket = this.byHash.get(key.hash);
		if (bucket === undefined) this.byHash.set(key.hash, (bucket = []));
		bucket.push(entry);
		this.bytes += key.ints.byteLength + PLAN_BYTES * (plan.route.length + plan.legs.length);
	}

	/** the game's tables are installed once per process; drop everything if a new set appears */
	checkTables() {
		const now = [zw.Q, zw.R, zw.M, zw.O, zw.u];
		if (this.tables !== null && this.tables.every((t, i) => t === now[i])) return;
		this.clear();
		this.tables = now;
	}
}

function hasKeyedOptions(options) {
	const names = Object.keys(options);
	return names.length === KEYED_OPTIONS.length && KEYED_OPTIONS.every((k) => k in options);
}

/** the planner's input as int32s, or null if any of it isn't one */
function encode(level, extras) {
	const { cells, objects, critters } = level;
	const header = [level.type, level.w, level.h, level.A, cells.length, objects.length, critters.length, extras.length];
	const ints = new Int32Array(header.length + extras.length + cells.length + OBJECT_FIELDS.length * objects.length + CRITTER_FIELDS.length * critters.length);
	let at = 0;
	const put = (v) => {
		if ((v | 0) !== v) return false;
		ints[at++] = v;
		return true;
	};
	for (const v of header) if (!put(v)) return null;
	for (const v of extras) if (!put(v)) return null;
	// the cells are most of the input: a plain loop
	const n = cells.length;
	for (let i = 0; i < n; i++) {
		const v = cells[i];
		if ((v | 0) !== v) return null;
		ints[at++] = v;
	}
	for (const o of objects) for (const f of OBJECT_FIELDS) if (!put(o[f])) return null;
	for (const c of critters) for (const f of CRITTER_FIELDS) if (!put(c[f])) return null;
	return ints;
}

function hashOf(ints) {
	const n = ints.length;
	let h = 0x811c9dc5;
	for (let i = 0; i < n; i++) h = Math.imul(h ^ ints[i], 0x01000193);
	return h ^ (h >>> 15);
}

function sameInts(a, b) {
	const n = a.length;
	if (n !== b.length) return false;
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
	return true;
}

/**
 * Where each leg's stop record sits in the level: [list, index] (list 0 objects, 1 creatures), null for a stop about
 * nothing in the level. null for the whole plan if a record isn't in the level (it isn't safe to hand out then).
 */
function recordPlaces(plan, level) {
	const places = new Map();
	level.objects.forEach((o, i) => places.set(o, [0, i]));
	level.critters.forEach((c, i) => places.set(c, [1, i]));
	const recs = [];
	for (const leg of plan.legs) {
		const rec = leg.stop.rec;
		if (rec == null) {
			recs.push(null);
			continue;
		}
		const place = places.get(rec);
		if (place === undefined) return null;
		recs.push(place);
	}
	return recs;
}

/** a cached plan for `level`: legs about the same records, now those of `level` */
function rebind(entry, level) {
	const legs = entry.legs.map((leg, i) => {
		const place = entry.recs[i];
		if (place === null) return leg;
		const rec = (place[0] === 0 ? level.objects : level.critters)[place[1]];
		return { ...leg, stop: { ...leg.stop, rec } };
	});
	return { legs, route: entry.route };
}
