// A new, independent vj0 to load a save into: a deep copy of the fresh player in data/tables.json
// (vj0.i2 as built by vj0.<clinit>), sharing everything that also hangs off the static tables (items
// vj0.c1, monster types zw.*, ...), then vj0.C(false) as the loader runs it before reading.
//
// Only the parts of C(false) that change a pristine <clinit> profile are applied (verified against the oracle:
// `SaveHarness fresh` with and without C). Everything else C resets is already at its reset value in a copy.
import { TreeSet } from '../gen/jrt.js';
import { tables, vj0 as V } from '../gen/statics.js';
import { e01 } from '../gen/rng.js';

let staticSet = null;

/** Objects reachable from the static tables (every root except the fresh player). */
function statics() {
	if (staticSet && staticSet.tables === tables) return staticSet.set;
	const set = new Set();
	const walk = (v) => {
		if (v === null || typeof v !== 'object' || set.has(v)) return;
		if (ArrayBuffer.isView(v)) return;
		set.add(v);
		if (Array.isArray(v)) { for (const x of v) walk(x); return; }
		if (v instanceof Map) { for (const x of v.values()) walk(x); return; }
		if (v instanceof TreeSet) return;
		for (const k of Object.keys(v)) walk(v[k]);
	};
	for (const root of Object.keys(tables.roots)) if (root !== 'vj0.i2') walk(tables.roots[root]);
	staticSet = { tables, set };
	return set;
}

/** Deep copy keeping class prototypes, typed arrays, sharing and cycles; static-table objects are shared. */
export function cloneGraph(root, shared = statics()) {
	const done = new Map();
	const copy = (v) => {
		if (v === null || typeof v !== 'object') return v;
		if (shared.has(v)) return v;
		const seen = done.get(v);
		if (seen) return seen;
		if (ArrayBuffer.isView(v)) { const c = v.slice(); done.set(v, c); return c; }
		if (Array.isArray(v)) {
			const c = new Array(v.length);
			done.set(v, c);
			for (let i = 0; i < v.length; i++) c[i] = copy(v[i]);
			return c;
		}
		if (v instanceof Map) {
			const c = new Map();
			done.set(v, c);
			for (const [k, x] of v) c.set(k, copy(x));
			return c;
		}
		if (v instanceof TreeSet) {
			const c = new TreeSet();
			done.set(v, c);
			for (const x of v.toArray()) c.add(x);
			return c;
		}
		const c = Object.create(Object.getPrototypeOf(v));
		done.set(v, c);
		for (const k of Object.keys(v)) c[k] = copy(v[k]);
		return c;
	};
	return copy(root);
}

const enc = (v, key) => {
	v ^= key;
	return ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
};

/**
 * vj0.C(false) on a pristine copy. Non-deterministic inputs: x (UApp.X0.j.nextInt(), the save overwrites it),
 * y / O / P (clock; the save overwrites y, O / P stay as now). kj0.C(0, null) only draws UApp.X0.j for quests
 * with j && f.length > 1; there it takes 0 (see `randomQuests`).
 */
export function resetLikeC(v, now = Date.now()) {
	v.r0 = false;
	v.y = Math.floor(now / 1000) | 0;
	v.z = 0;
	do { v.x = (Math.random() * 4294967296) | 0; } while (v.x === 0);
	v.A = enc(0, 14072090);                     // s2(0)
	v.B = 1; v.U = 0; v.C = 0; v.F = 1;
	for (const k of v.k) {
		k.m0 = 0; k.l0 = 0; k.k0 = 0; k.j0 = 0;   // kj0.y()
		if (k.i) kj0C(k, 0);
	}
	for (const t of V.A1 || []) t.g = t.f;    // static ki0 table: A1[].g = f
	v.Y = null; v.Z = 0; v.X = 0;
	v.x0 = enc(0, 14072090);                    // r2(0)
	v.H0 = -1;
	v.K0 = null;
	v.T0 = -1;
	v.U0.z_(0);
	v.V0 = 0; v.X0 = 0; v.W0 = 0;
	v.O = now;
	v.P = 0;
	// F2(): W0 = min(p0() * 3 + 24, 48) h; X0 = 0 while U0 is 0
	v.W0 = Math.min((v.p0_() * 3 + 24) | 0, 48) * 3600000;
	v.X0 = 0;
	return v;
}

/** Quests whose kj0.C(0, null) would draw from UApp.X0.j (their m0 after a load is random in the game). */
export function randomQuests(v) {
	return v.k.filter((k) => k.i && k.j && k.f && k.f.length > 1).map((k) => k.a);
}

/** kj0.C(int, e01): start the quest at step l0 = n (variant m0 random when j, else n when in range) */
export function kj0C(k, n, rng = null) {
	k.j0 = ((k.j0 & -129) | 16) << 24 >> 24;
	k.k0 = 0;
	const b = n << 24 >> 24;
	k.l0 = b;
	let m = 0;
	if (k.j) {
		if (k.f.length > 1) m = rng instanceof e01 ? rng.h_(k.f.length) : 0;
	} else if (b < k.f.length) {
		m = b;
	}
	k.m0 = m << 24 >> 24;
}

/** A fresh profile ready for a2(): copy of vj0.i2 + C(false). */
export function freshGuild(now) {
	const v = cloneGraph(V.i2);
	return resetLikeC(v, now);
}
