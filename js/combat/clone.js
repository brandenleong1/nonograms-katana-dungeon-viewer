// Fight state cloning for search: snapshot(fight) -> state, restore(state) -> fight (a new, independent Fight).
//
//   import { snapshot, restore } from './clone.js';
//   const s = snapshot(fight);          // ~0.3-0.5 ms (lean fight); the fight keeps running
//   ...                                 // play on, branch, set up other fights of the same tables
//   const f2 = restore(s);              // a new Fight at exactly the snapshot point; s can be restored again
//   const f3 = restore(s, f2);          // same, refilling a fight that is no longer needed (fewer allocations)
//   (driver.js: fight.snapshot(), fight.clone(), restoreFight(); fight.step(input) for lean play)
//
// A state is immutable once made; unchanged parts (cell arrays, typed arrays, pin records) are shared between
// states. Its form differs from the live graph where that saves work: hw.j as one int per cell (PackedCells),
// long mostly-null arrays (hw.k) as index / value lists (SparseArray).
//
// A state holds a copy of every object the engine can read later:
//   - the fight graph: hw (cells j, occupants k, regions l, marks m, objects n, critters o, turn order D, the
//     pending action F/G/H/J/K, companions p, spider q/r, RNG states w/x, ...), c30 (all rules fields, tap path z,
//     selection V/W/X, target a0, O, ...), the DungameView stand-in and its hook (pending dialog Runnables),
//     the toolbar stand-in, the Fight's scalars (st, index, cap, error), and the Recorder when there is one
//     (serials, delta baselines, draw counters; its RNG watchers are re-installed on the copies);
//   - the static objects play writes in place ("pins"), saved field by field and written back in place on
//     restore so that every table reference stays valid: the profile vj0.i2 (own fields, N statistics, S0 pets,
//     R0 bestiary counters, the quests kj0 of s/k, every hero of l with its arrays and pets, the item stock K),
//     the monster
//     templates zw.c(190..199), zw.w, zw.z, the ki0 table vj0.A1 and the wi0 offers vj0.R1 (+ x0); and which
//     profile is vj0.i2 (fight mode installs the imported one).
// Everything else reachable from the static tables is immutable and shared, never copied. Identity and aliasing
// are kept within a state (one memo per copy: c30.i === hw.j, c30.a === hw, critters in hw.o / hw.k / hw.D /
// aw.l, the hero nw shared by hw.e / mw.y, template f0 === companion cw, ...).
//
// Statics are global, so only one fight is live at a time: restore() installs the state's statics, and the
// fight it returns is the live one; the fight that was live before must not be stepped afterwards (restore
// its own snapshot to switch back). States stay valid across resetStatics() as long as the tables object is
// the same (resetStatics keeps it; a full re-revive does not and makes older states unrestorable).
//
// Also here: the pristine-statics record used by setup.js resetStatics (in-place reset instead of re-reviving
// tables.json), and the generated-dungeon cache used by setupGen.
import { tables, zw, vj0 as V } from '../gen/statics.js';
import { classes } from '../gen/registry.js';

// ---------------------------------------------------------------------------------------------------------------
// Graph copier. One op (snapshot / restore / cache) at a time: M = memo (source -> copy), SH = shared objects.

let M = new Map();
let SH = null;
let SAVE = true;   // direction of the op: live -> state (pack cells, sparse arrays, reuse) or state -> live
const memoSet = (s, o) => { M.set(s, o); };

// Canonical index (per op): the copied level's object list hw.n and critter list hw.o, looked up by position
// (qw.b -> cell -> list index) instead of the memo. Covers the ~300 qw / aw that hw.k, hw.D, aw.l, ... point
// at, which are most of the memo's work otherwise. Anything not found there (removed critters, ...) uses the memo.
let CN = null, CO = null, CC = null, POSN = null, POSO = null, CW = 0, CH = 0;
let CJ = -1;   // canonical slot of the object being constructed (set right before new F, read by reg)

/** set up the index for level h (a live hw, or a state's copy of one); null clears it */
function canon(h) {
	CN = CO = CC = null;
	if (h === null || typeof h !== 'object' || !Array.isArray(h.n) || !Array.isArray(h.o) || !(h.g > 0) || !(h.h > 0)) return;
	const n = (h.g * h.h) | 0;
	if (POSN === null || POSN.length !== n) { POSN = new Int32Array(n); POSO = new Int32Array(n); }
	POSN.fill(-1);
	POSO.fill(-1);
	CW = h.g; CH = h.h;
	CN = h.n; CO = h.o;
	const place = (list, pos) => {
		for (let i = 0; i < list.length; i++) {
			const o = list[i];
			const p = o !== null && typeof o === 'object' ? o.b : null;
			if (p === null || typeof p !== 'object') continue;
			const x = p.a, y = p.b;
			if (x >= 0 && y >= 0 && x < CW && y < CH) { const idx = y * CW + x; if (pos[idx] === -1) pos[idx] = i; }
		}
	};
	place(CN, POSN);
	place(CO, POSO);
	CC = new Array(CN.length + CO.length);
}

/** slot of o in the canonical lists, or -1 */
function canonSlot(o) {
	if (CC === null) return -1;
	const p = o.b;
	if (p === null || typeof p !== 'object') return -1;
	const x = p.a, y = p.b;
	if (!(x >= 0 && y >= 0 && x < CW && y < CH)) return -1;
	const idx = y * CW + x;
	let j = POSO[idx];
	if (j >= 0 && CO[j] === o) return CN.length + j;
	j = POSN[idx];
	if (j >= 0 && CN[j] === o) return j;
	return -1;
}

/** register the copy of s (canonical slot CJ, else the memo) before its fields are copied (cycles) */
const reg = (s, o) => {
	if (CJ >= 0) { CC[CJ] = o; CJ = -1; } else M.set(s, o);
};
const D = { on: false, owned: null };   // debug: field lists checked on every copy; owned objects seen once

/** Debug mode (tests): every copy is checked against its class field list, and owned objects for aliasing. */
export function setCloneDebug(on) { D.on = !!on; }

function fnErr(s, k) {
	throw new Error(`clone: ${s.constructor && s.constructor.name}.${k} holds a function (closures cannot be copied)`);
}

// Class field lists. A copier is generated per class from the fields of its first instance (debug mode checks
// every copy against it). The memo (source -> copy, for identity) and the shared-set lookup are the main cost
// of a copy (a Map set is ~0.2 us here), so the lists carry what is known about each field:
/**
 * Classes whose instances are never aliased inside a fight (one reference each; debug mode checks it): copied
 * without the memo (hw.j alone holds ~5000 ww). Util$Point is not here: hw.L aliases critter positions.
 */
const OWNED = new Set(['ww', 'kh0', 'cq', 'cj0', 'e01']);
/** Classes whose instances only exist in a fight (never static): no shared-set lookup (debug mode checks it). */
const FIGHT_ONLY = new Set(['qw', 'aw', 'mw', 'hw', 'c30', 'DungameView', 'FightHook', 'ToolbarItem', 'fw', 't20', 't93', 'u20', 'v20', 'w20']);
/**
 * Field kinds (by class, inherited by subclasses; anything else is a plain reference copied through cp):
 *   shared  the value is a static table object or a pin (kept as is; debug mode checks it): qw.a = its type
 *   point   the object's own Util$Point (copied by value, no memo); another field referencing the same Point
 *           (hw.L = a critter's b, ...) goes through cp, and the owner's copy is repointed to that copy at the
 *           end of the op (resolvePoints)
 *   kh0     the object's own kh0 counter (by value)
 */
const FIELD_KINDS = {
	qw: { a: 'shared', b: 'point' },
	aw: { j: 'kh0', n: 'kh0' },
	mw: { z: 'kh0', C: 'kh0', y: 'shared' },
	c30: { P0: 'point', X0: 'point', Y0: 'point', Z0: 'point', a1: 'point', b1: 'point', c1: 'point' },
};

function kindOf(C, k) {
	for (let c = C; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
		const t = FIELD_KINDS[c.javaName || c.name];
		if (t && t[k]) return t[k];
	}
	return null;
}

function classIn(set, C) {
	return set.has(C.javaName || C.name) && classes[C.javaName || C.name] === C;
}

let PT = null, KH = null, QW = null;   // classes.Util$Point / kh0 / qw (resolved at the first op)
const PENDING = [];   // [source Point, copy] of Points copied through cp (non-owner references)

/** Points referenced from a non-owner field: make the owner's copy use the same copy (identity kept). */
function resolvePoints() {
	const n = PENDING.length;
	if (n === 0) return;
	const byPt = new Map(PENDING);
	const p0 = PENDING[0][0], c0 = PENDING[0][1];
	const look = n === 1 ? (b) => (b === p0 ? c0 : undefined) : (b) => byPt.get(b);
	const found = D.on ? new Set() : null;
	for (const [k, c] of M) {
		if (k instanceof QW) {
			const copy = look(k.b);
			if (copy !== undefined) { c.b = copy; if (found) found.add(k.b); }
		}
	}
	if (CC !== null) {
		const nn = CN.length;
		for (let j = 0; j < CC.length; j++) {
			const c = CC[j];
			if (c === undefined) continue;
			const k = j < nn ? CN[j] : CO[j - nn];
			const copy = look(k.b);
			if (copy !== undefined) { c.b = copy; if (found) found.add(k.b); }
		}
	}
	if (D.on) for (const [src] of PENDING) if (D.owned.has(src) && !found.has(src)) throw new Error('clone: a Point is shared by an owner field (not qw.b) and another field');
	PENDING.length = 0;
}

function sharedCheck(s, k) {
	const v = s[k];
	if (v !== null && typeof v === 'object' && !SH.has(v)) throw new Error(`clone: ${s.constructor.name}.${k} is not a static object`);
}

function owned(s) {
	if (D.owned.has(s)) throw new Error(`clone: owned ${s.constructor.name} is aliased`);
	D.owned.add(s);
}

let WW = null;   // classes.ww (resolved at the first op)

/** copy of v (object, not null): memo hit, shared, or a new copy */
function cp(v) {
	const C = v.constructor;
	if (C === WW) {
		// ww: grid cell (a, b); never static, never aliased
		const o = new WW();
		o.a = v.a;
		o.b = v.b;
		if (D.on) { owned(v); checkKeys(v, ['a', 'b'], 'ww'); }
		return o;
	}
	if (C === Array) {
		const r = M.get(v);
		if (r !== undefined) return r;
		if (SH.has(v)) return v;
		const n = v.length;
		if (SAVE && n >= 64) {
			const x0 = v[0];
			if (x0 !== null && typeof x0 === 'object' && x0.constructor === WW) {
				const p = packCells(v);
				if (p !== null) { M.set(v, p); return p; }
			} else {
				let used = 0;
				for (let i = 0; i < n; i++) if (v[i] !== null) used++;
				if (used * 8 < n) return sparse(v, used);
			}
		}
		const a = v.slice();
		M.set(v, a);
		for (let i = 0; i < n; i++) {
			const x = a[i];
			if (typeof x === 'object' && x !== null) a[i] = cp(x);
			else if (typeof x === 'function') fnErr(v, i);
		}
		return a;
	}
	let k = KC.get(C);
	if (k === undefined) k = learn(C, v);
	return k(v);
}

const val = (x) => (typeof x === 'object' && x !== null ? cp(x) : x);

/**
 * A state's form of an array of ww cells (hw.j, aliased by c30.i): one int per cell (a << 16 | b & 0xffff).
 * Saves ~5000 objects per state; restoring builds the ww objects again (or refills a dead fight's, see restore).
 * Immutable once made, so states share one when the cells did not change (SRC below).
 */
class PackedCells {
	constructor(d) { this.d = d; }
}

/**
 * SRC: live big array (cells, typed arrays) -> the immutable state form it was last made from or saved to. A
 * snapshot whose array still equals it reuses that form (a compare instead of an allocation).
 */
let SRC = new WeakMap();

function cellsEqual(v, d) {
	const n = v.length;
	if (n !== d.length) return false;
	for (let i = 0; i < n; i++) {
		const w = v[i];
		if (((w.a << 16) | (w.b & 0xffff)) !== d[i]) return false;
	}
	return true;
}

function packCells(v) {
	const n = v.length;
	for (let i = 0; i < n; i++) {
		const w = v[i];
		if (w === null || typeof w !== 'object' || w.constructor !== WW) return null;
		const a = w.a, b = w.b;
		if (((a << 16) >> 16) !== a || ((b << 16) >> 16) !== b) return null;
		if (D.on) { owned(w); checkKeys(w, ['a', 'b'], 'ww'); }
	}
	const prev = SRC.get(v);
	if (prev !== undefined && prev.constructor === PackedCells && cellsEqual(v, prev.d)) return prev;
	const d = new Int32Array(n);
	for (let i = 0; i < n; i++) {
		const w = v[i];
		d[i] = (w.a << 16) | (w.b & 0xffff);
	}
	const p = new PackedCells(d);
	SRC.set(v, p);
	return p;
}

function unpackCells(p) {
	const d = p.d;
	const n = d.length;
	const a = [];
	for (let i = 0; i < n; i++) {
		const w = new WW();
		const x = d[i];
		w.a = x >> 16;
		w.b = (x << 16) >> 16;
		a.push(w);
	}
	M.set(p, a);
	SRC.set(a, p);
	return a;
}

/** refill a dead fight's cell array from p (same length) */
function refillCells(a, p) {
	const d = p.d;
	for (let i = 0; i < d.length; i++) {
		const w = a[i];
		const x = d[i];
		w.a = x >> 16;
		w.b = (x << 16) >> 16;
	}
	SRC.set(a, p);
}

function typedEqual(a, b) {
	const n = a.length;
	if (n !== b.length) return false;
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
	return true;
}

/** A state's form of a long, mostly-null array (hw.k occupants): length, indices and values. */
class SparseArray {
	constructor(n, idx, vals) { this.n = n; this.idx = idx; this.vals = vals; }
}

function sparse(v, used) {
	const idx = new Int32Array(used);
	const vals = new Array(used);
	const s = new SparseArray(v.length, idx, vals);
	M.set(v, s);
	for (let i = 0, j = 0, n = v.length; i < n; i++) {
		const x = v[i];
		if (x === null) continue;
		idx[j] = i;
		vals[j++] = typeof x === 'object' ? cp(x) : typeof x === 'function' ? fnErr(v, i) : x;
	}
	return s;
}

function unsparse(s) {
	const a = new Array(s.n).fill(null);
	M.set(s, a);
	const { idx, vals } = s;
	for (let j = 0; j < idx.length; j++) {
		const x = vals[j];
		a[idx[j]] = typeof x === 'object' && x !== null ? cp(x) : x;
	}
	return a;
}

/** per-constructor copy functions */
const KC = new Map();

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const prop = (k) => (IDENT.test(k) ? '.' + k : '[' + JSON.stringify(k) + ']');
const fname = (C) => ((C && C.name && IDENT.test(C.name) ? C.name : 'Obj') + '$copy');

/** generated code for "this.k = copy of s.k" over a class's key list (field kinds: FIELD_KINDS) */
function fieldCode(C, keys, dst, src) {
	const out = [];
	for (const k of keys) {
		const p = prop(k);
		const q = JSON.stringify(k);
		const kind = kindOf(C, k);
		if (kind === 'shared') {
			out.push(`${dst}${p} = ${src}${p}; if (D.on) sharedCheck(${src}, ${q});`);
		} else if (kind === 'point') {
			out.push(`v = ${src}${p}; ${dst}${p} = v !== null && typeof v === 'object' && v.constructor === PT ? (D.on && owned(v), new PT(v.a, v.b)) : typeof v === 'object' && v !== null ? cp(v) : v;`);
		} else if (kind === 'kh0') {
			out.push(`v = ${src}${p}; if (v !== null && typeof v === 'object' && v.constructor === KH) { if (D.on) owned(v); w = new KH(v.a, false); w.b = v.b; ${dst}${p} = w; } else ${dst}${p} = typeof v === 'object' && v !== null ? cp(v) : v;`);
		} else {
			out.push(`v = ${src}${p}; ${dst}${p} = typeof v === 'object' ? (v === null ? null : cp(v)) : typeof v === 'function' ? fnErr(${src}, ${q}) : v;`);
		}
	}
	return out.join('\n');
}

/** classes whose shape their constructor fixes (field lists not checked per copy outside debug mode) */
const TRUSTED = new Set(['qw', 'aw', 'mw']);

function sameKeys(s, keys) {
	const ks = Object.keys(s);
	if (ks.length !== keys.length) return false;
	for (let i = 0; i < ks.length; i++) if (ks[i] !== keys[i]) return false;
	return true;
}

/** generic copy of a class instance whose fields differ from its class's list (field kinds not applied) */
function slowCopy(s, own) {
	const o = Object.create(Object.getPrototypeOf(s));
	if (own) { if (D.on) owned(s); } else M.set(s, o);
	for (const k of Object.keys(s)) {
		const v = s[k];
		if (typeof v === 'function') fnErr(s, k);
		o[k] = val(v);
	}
	return o;
}

function checkKeys(s, keys, what) {
	const ks = Object.keys(s);
	if (ks.length !== keys.length || ks.some((k, i) => k !== keys[i])) {
		throw new Error(`clone: ${what} has fields [${ks}] but its field list is [${keys}]`);
	}
}

/** memo hit / shared / f(s) */
const memoized = (f) => (s) => {
	const r = M.get(s);
	if (r !== undefined) return r;
	if (SH.has(s)) return s;
	return f(s);
};

function plainCopy(s) {
	const o = Object.create(Object.getPrototypeOf(s));
	M.set(s, o);
	for (const k of Object.keys(s)) {
		const v = s[k];
		if (typeof v === 'function') fnErr(s, k);
		o[k] = val(v);
	}
	return o;
}

function mapCopy(s) {
	const m = new Map();
	M.set(s, m);
	for (const [k, x] of s) m.set(val(k), val(x));
	return m;
}

function typedCopy(s) {
	if (SAVE && s.length >= 64) {
		const prev = SRC.get(s);
		if (prev !== undefined && prev.constructor === s.constructor && typedEqual(s, prev)) {
			M.set(s, prev);
			return prev;
		}
	}
	const a = s.slice();
	M.set(s, a);
	if (s.length >= 64) SRC.set(SAVE ? s : a, SAVE ? a : s);
	return a;
}

/** Hand-written copiers (owned leaves built with their own constructors: same V8 maps as engine objects). */
const CUSTOM = {
	// a Point reached through a plain reference: memo, and maybe the copy of some qw's own b (resolvePoints)
	Util$Point: (C) => memoized((s) => {
		const o = new C(s.a, s.b);
		M.set(s, o);
		PENDING.push([s, o]);
		if (D.on) checkKeys(s, ['a', 'b'], 'Util$Point');
		return o;
	}),
	kh0: (C) => (s) => {
		if (SH.has(s)) return s;
		const o = new C(s.a, false);
		o.b = s.b;
		if (D.on) { owned(s); checkKeys(s, ['a', 'b'], 'kh0'); }
		return o;
	},
	// e01: only the state; own h_/g_ are the Recorder's draw watchers (re-installed by restore)
	e01: (C) => (s) => {
		if (SH.has(s)) return s;
		const o = new C(s.a);
		if (D.on) {
			owned(s);
			for (const k of Object.keys(s)) if (k !== 'a' && !(typeof s[k] === 'function' && (k === 'h_' || k === 'g_'))) throw new Error(`clone: e01.${k}`);
		}
		return o;
	},
};

function learn(C, s) {
	let k;
	if (typeof s === 'function') k = (x) => fnErr(x, '(self)');
	else if (ArrayBuffer.isView(s)) k = memoized(typedCopy);
	else if (C === Map) k = memoized(mapCopy);
	else if (C === Object || C === undefined || C === null || Object.getPrototypeOf(s) === null) k = memoized(plainCopy);
	else if (s instanceof Error) k = (x) => x;
	else if (C === PackedCells) k = memoized(unpackCells);
	else if (C === SparseArray) k = memoized(unsparse);
	else if (CUSTOM[C.name] && classes[C.javaName || C.name] === C) k = CUSTOM[C.name](C);
	else {
		const keys = Object.keys(s);
		const own = classIn(OWNED, C);
		const local = classIn(FIGHT_ONLY, C);
		const canonical = classIn(TRUSTED, C);   // qw / aw / mw: may sit in hw.n / hw.o
		const code = `return function ${fname(C)}(s) {\n${own ? 'if (D.on) owned(s);' : canonical ? 'reg(s, this);' : 'memoSet(s, this);'}\nlet v, w;\n${fieldCode(C, keys, 'this', 's')}\nif (D.on && trusted) check(s, keys, name);\n};`;
		const F = new Function('memoSet', 'reg', 'cp', 'fnErr', 'check', 'keys', 'name', 'D', 'owned', 'sharedCheck', 'PT', 'KH', 'trusted', code)(
			memoSet, reg, cp, fnErr, checkKeys, keys, C.name, D, owned, sharedCheck, PT, KH, classIn(TRUSTED, C));
		F.prototype = C.prototype;
		// instances of most classes are checked against the field list (a different shape, e.g. another
		// constructor's field order, is copied generically); the hot ones are trusted (debug mode checks them)
		const make = classIn(TRUSTED, C) ? (x) => new F(x) : (x) => (sameKeys(x, keys) ? new F(x) : slowCopy(x, own));
		if (own) k = (x) => (SH.has(x) ? x : make(x));
		else if (canonical) {
			k = (x) => {
				const j = canonSlot(x);
				if (j >= 0) {
					const r = CC[j];
					if (r !== undefined) return r;
					if (D.on && M.has(x)) throw new Error(`clone: canonical ${C.name} also in the memo`);
					CJ = j;
					return new F(x);
				}
				const r = M.get(x);
				if (r !== undefined) return r;
				if (D.on && SH.has(x)) throw new Error(`clone: a ${C.name} is static`);
				CJ = -1;
				return new F(x);
			};
		} else if (local) {
			k = (x) => {
				const r = M.get(x);
				if (r !== undefined) return r;
				if (D.on && SH.has(x)) throw new Error(`clone: a ${C.name} is static`);
				return make(x);
			};
		} else k = memoized(make);
	}
	KC.set(C, k);
	return k;
}

function begin(shared, save) {
	if (SH !== null) throw new Error('clone: nested copy');
	SH = shared;
	SAVE = save;
	if (WW === null) {
		WW = classes.ww || null;
		PT = classes.Util$Point;
		KH = classes.kh0;
		QW = classes.qw;
	}
	D.owned = D.on ? new Set() : null;
	PENDING.length = 0;
}

/** finish an op: fix Point aliases, drop the memo */
function finish() {
	resolvePoints();
}

function end() {
	PENDING.length = 0;
	if (M.size) M = new Map();
	SH = null;
	D.owned = null;
	CN = CO = CC = null;
	CJ = -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Static layout: which static objects are immutable (shared) and which are pins (saved / written back in place).

const TEMPLATE_IDS = [190, 191, 192, 193, 194, 195, 196, 197, 198, 199];

/** Table objects (not the profile) that setup, the save loader or play write in place. */
function tablePinList() {
	const out = [];
	for (const id of TEMPLATE_IDS) {
		const t = zw.R && zw.R.get(id);
		if (t) out.push(t);
	}
	if (zw.w) out.push(zw.w);
	if (zw.z) out.push(zw.z);
	if (V.A1) for (const t of V.A1) if (t && typeof t === 'object') out.push(t);
	if (V.R1) {
		for (const w of V.R1) {
			if (!w || typeof w !== 'object') continue;
			out.push(w);
			if (w.x0 && typeof w.x0 === 'object') out.push(w.x0);
		}
	}
	return out;
}

function children(v, f) {
	if (ArrayBuffer.isView(v)) return;
	if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) f(v[i]); return; }
	if (v instanceof Map) { for (const [k, x] of v) { f(k); f(x); } return; }
	for (const k of Object.keys(v)) f(v[k]);
}

/** add to `into` every object reachable from root, not entering `stop` (nor objects already in `into`) */
function reach(root, into, stop) {
	const st = [root];
	while (st.length) {
		const v = st.pop();
		if (v === null || typeof v !== 'object' || into.has(v) || stop.has(v)) continue;
		into.add(v);
		children(v, (x) => { if (x !== null && typeof x === 'object') st.push(x); });
	}
}

/**
 * Table layout of the current tables: TAB = everything reachable from the table roots except the profile,
 * not entering the table pins; plus the pins' own children when `pristine` (no fight attached yet).
 */
function tableLayout(pristine) {
	const pins = tablePinList();
	const pinSet = new Set(pins);
	const tab = new Set();
	for (const r of Object.keys(tables.roots)) if (r !== 'vj0.i2') reach(tables.roots[r], tab, pinSet);
	if (pristine) for (const p of pins) children(p, (x) => reach(x, tab, pinSet));
	return { tables, pins, pinSet, tab, pristine };
}

let TL = null;

function tableLayoutNow() {
	if (TL === null || TL.tables !== tables) TL = tableLayout(false);
	return TL;
}

/**
 * Profile objects play writes in place: P itself, N (statistics) and below, S0, R0, every hero (l) and below, quests,
 * and the item stock K and below (dungeon entry, js/combat/entry.js, takes the fee, MP and pack out of K).
 */
function profilePinList(P, tl) {
	const pins = new Set([P]);
	const deep = (x) => {
		const st = [x];
		while (st.length) {
			const v = st.pop();
			if (v === null || typeof v !== 'object' || pins.has(v) || tl.tab.has(v) || tl.pinSet.has(v)) continue;
			pins.add(v);
			children(v, (y) => { if (y !== null && typeof y === 'object') st.push(y); });
		}
	};
	deep(P.N);
	deep(P.S0);
	deep(P.R0);
	deep(P.l);
	deep(P.K);
	for (const list of [P.s, P.k]) if (list) for (const q of list) if (q && typeof q === 'object' && !tl.tab.has(q)) pins.add(q);
	if (tl.tab.has(P.N) || (P.l && P.l.some((h) => h && tl.tab.has(h)))) throw new Error('clone: profile parts are static tables');
	return pins;
}

const LAYOUTS = new WeakMap();   // profile -> layout

/**
 * The layout for profile P: pins (table + profile, with their savers / loaders) and the shared set (TAB, the
 * pins themselves, and the rest of the profile, which play never writes). P.K0 (the saved dungeon) is skipped.
 */
function layoutFor(P) {
	const tl = tableLayoutNow();
	let L = LAYOUTS.get(P);
	if (L !== undefined && L.tl === tl) return L;
	const ppins = profilePinList(P, tl);
	const shared = new Set(tl.tab);
	for (const p of tl.pins) shared.add(p);
	for (const p of ppins) shared.add(p);
	// the profile's immutable rest: reachable from the pins' children (quest definitions, ...) but not K0
	const stop = new Set([...tl.tab, ...tl.pinSet]);
	const prof = new Set();
	for (const p of ppins) {
		if (p === P) {
			for (const k of Object.keys(P)) if (k !== 'K0') { const x = P[k]; if (x !== null && typeof x === 'object' && !ppins.has(x)) reach(x, prof, stop); }
		} else if (!Array.isArray(p) && !ArrayBuffer.isView(p) && p.constructor && p.constructor.name === 'kj0') {
			children(p, (x) => { if (x !== null && typeof x === 'object' && !ppins.has(x)) reach(x, prof, stop); });
		}
	}
	for (const o of prof) if (!ppins.has(o)) shared.add(o);
	const pins = [...tl.pins, ...ppins];
	L = { tl, profile: P, pins, shared, io: pins.map(pinIO), last: pins.map(() => null) };
	LAYOUTS.set(P, L);
	return L;
}

// Pin records. io.save(o) -> record (array of field values, objects copied with cp); io.same(o, r): every field
// of o is identical to r's; io.put(o, r) writes r's values as they are; io.load(o, r) writes copies of them.
// A record is "pure" when it holds no copies (only primitives and shared objects): then it can be shared by
// later states while the pin is unchanged, and restoring it is a compare (+ plain writes when it differs).
const PIN_IO = new Map();   // key list -> io

function pinIO(o) {
	if (ArrayBuffer.isView(o)) return TYPED_IO;
	if (Array.isArray(o)) return ARRAY_IO;
	if (o instanceof Map) throw new Error('clone: Map pins are not supported');
	const keys = Object.keys(o);
	const key = keys.join('\u0001');
	let io = PIN_IO.get(key);
	if (io === undefined) {
		const save = [], load = [], put = [], same = [];
		keys.forEach((k, i) => {
			const p = prop(k);
			save.push(`v = o${p}; r[${i}] = typeof v === 'object' ? (v === null ? null : cp(v)) : typeof v === 'function' ? fnErr(o, ${JSON.stringify(k)}) : v;`);
			load.push(`v = r[${i}]; o${p} = typeof v === 'object' && v !== null ? cp(v) : v;`);
			put.push(`o${p} = r[${i}];`);
			same.push(`o${p} === r[${i}]`);
		});
		io = new Function('cp', 'fnErr', 'check', 'keys', 'D', `return {
			save(o) { if (D.on) check(o, keys, 'pin ' + (o.constructor && o.constructor.name)); const r = new Array(${keys.length}); let v;\n${save.join('\n')}\nreturn r; },
			load(o, r) { let v;\n${load.join('\n')}\n},
			put(o, r) {\n${put.join('\n')}\n},
			same(o, r) { return ${same.join(' && ') || 'true'}; },
		};`)(cp, fnErr, checkKeys, keys, D);
		PIN_IO.set(key, io);
	}
	return io;
}

const TYPED_IO = {
	save: (o) => o.slice(),
	load: (o, r) => { o.set(r); },
	put: (o, r) => { o.set(r); },
	same(o, r) {
		const n = o.length;
		if (n !== r.length) return false;
		for (let i = 0; i < n; i++) if (o[i] !== r[i] && !(o[i] !== o[i] && r[i] !== r[i])) return false;
		return true;
	},
};

const ARRAY_IO = {
	save(o) {
		const r = o.slice();
		for (let i = 0; i < r.length; i++) { const x = r[i]; if (typeof x === 'object' && x !== null) r[i] = cp(x); }
		return r;
	},
	load(o, r) {
		const n = r.length;
		o.length = n;
		for (let i = 0; i < n; i++) { const x = r[i]; o[i] = typeof x === 'object' && x !== null ? cp(x) : x; }
	},
	put(o, r) {
		const n = r.length;
		o.length = n;
		for (let i = 0; i < n; i++) o[i] = r[i];
	},
	same(o, r) {
		const n = o.length;
		if (n !== r.length) return false;
		for (let i = 0; i < n; i++) if (o[i] !== r[i]) return false;
		return true;
	},
};

/** records of all pins: { recs, pure (Uint8Array) }; reuses the layout's last pure record of an unchanged pin */
function savePins(L) {
	const { pins, io, last } = L;
	const n = pins.length;
	const recs = new Array(n);
	const pure = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const o = pins[i], f = io[i];
		const c = last[i];
		if (c !== null && f.same(o, c)) {
			if (D.on) f.save(o);
			recs[i] = c;
			pure[i] = 1;
			continue;
		}
		const r = f.save(o);
		recs[i] = r;
		if (f.same(o, r)) {
			pure[i] = 1;
			last[i] = r;
		} else last[i] = null;
	}
	return { recs, pure };
}

function loadPins(L, st) {
	const { pins, io } = L;
	const { recs, pure } = st;
	for (let i = 0; i < pins.length; i++) {
		const o = pins[i], f = io[i], r = recs[i];
		if (pure[i] === 1) {
			if (!f.same(o, r)) f.put(o, r);
		} else f.load(o, r);
	}
	// the live pins now equal these records: pure ones are reusable by the next save
	const { last } = L;
	for (let i = 0; i < pins.length; i++) last[i] = pure[i] === 1 ? recs[i] : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Fight snapshot / restore

/** Fight fields that are immutable after setup (shared by states); every other object field (h, c, dgv, tb, ...)
 * is copied; hook is dgv.hook again; rec (the Recorder) is copied separately. */
const FIGHT_SHARED = new Set(['meta', 'heroStats', 'init', 'error']);
const FIGHT_GRAPH = ['h', 'c', 'dgv', 'tb'];   // (stateSize)

/** A fight state (opaque). */
export class FightState {}

/**
 * snapshot(fight[, { record }]) -> state. record: false drops the Recorder (the restored fight is lean).
 * Valid between inputs (and inside, as long as no JS closure is pending).
 */
export function snapshot(fight, opts = {}) {
	const L = layoutFor(V.i2);
	begin(L.shared, true);
	try {
		canon(fight.h);
		const s = new FightState();
		s.tables = tables;
		s.layout = L;
		s.statics = savePins(L);
		s.proto = Object.getPrototypeOf(fight);
		s.fields = {};
		for (const k of Object.keys(fight)) {
			if (k === 'hook' || k === 'rec') continue;
			const v = fight[k];
			s.fields[k] = !FIGHT_SHARED.has(k) && v !== null && typeof v === 'object' ? cp(v) : v;
		}
		s.rec = fight.rec && opts.record !== false ? copyRec(fight.rec) : null;
		s.lean = !s.rec;
		finish();
		return s;
	} finally {
		end();
	}
}

/** seed the memo with a dead fight's big arrays, refilled from the state (restore's `into`) */
function reuse(s, into) {
	const sh = s.fields.h, sc = s.fields.c, ih = into.h, ic = into.c;
	if (!sh || !ih || ih === sh) return;
	const j = sh.j;
	if (j instanceof PackedCells && Array.isArray(ih.j) && ih.j.length === j.d.length && ih.j.every((w) => w !== null && typeof w === 'object' && w.constructor === WW)) {
		refillCells(ih.j, j);
		M.set(j, ih.j);
	}
	const typed = (src, dst) => {
		if (ArrayBuffer.isView(src) && ArrayBuffer.isView(dst) && src !== dst && src.constructor === dst.constructor && src.length === dst.length && !SH.has(src) && !M.has(src)) {
			dst.set(src);
			M.set(src, dst);
			SRC.set(dst, src);
		}
	};
	typed(sh.l, ih.l);
	typed(sh.m, ih.m);
	if (sc && ic) typed(sc.k, ic.k);
}

function copyRec(rec) {
	const o = {};
	for (const k of Object.keys(rec)) {
		if (k === 'f') continue;
		const v = rec[k];
		o[k] = v !== null && typeof v === 'object' ? cp(v) : v;
	}
	return { proto: Object.getPrototypeOf(rec), fields: o };
}

/**
 * restore(state[, into]) -> a new Fight at the snapshot point, made the live fight (the state's statics
 * installed). The state is unchanged and can be restored again.
 * into: a fight of the same dungeon that is no longer needed (e.g. the branch just explored); its big arrays
 * (the ~5000 cell objects hw.j, hw.l, hw.m, c30.k) are refilled and reused instead of allocated. `into` must
 * not be used afterwards.
 */
export function restore(s, into = null) {
	if (!(s instanceof FightState)) throw new Error('restore: not a FightState');
	if (s.tables !== tables) throw new Error('restore: the state belongs to other static tables (initTables / a full resetStatics ran since)');
	const L = s.layout;
	V.i2 = L.profile;
	begin(L.shared, false);
	try {
		canon(s.fields.h);
		if (into !== null) reuse(s, into);
		loadPins(L, s.statics);
		const f = Object.create(s.proto);
		for (const k of Object.keys(s.fields)) {
			const v = s.fields[k];
			f[k] = !FIGHT_SHARED.has(k) && v !== null && typeof v === 'object' ? cp(v) : v;
		}
		f.hook = f.dgv.hook;
		if (s.rec) {
			const r = Object.create(s.rec.proto);
			r.f = f;
			for (const k of Object.keys(s.rec.fields)) {
				const v = s.rec.fields[k];
				r[k] = v !== null && typeof v === 'object' ? cp(v) : v;
			}
			r.watch();
			f.rec = r;
		} else f.rec = null;
		finish();
		return f;
	} finally {
		end();
	}
}

/** fight.clone(): restore(snapshot(fight)): a copy that becomes the live fight (do not step the original after). */
export function cloneFight(fight, opts) {
	return restore(snapshot(fight, opts));
}

/** Size of a state: { objects, pins } (objects in the fight graph copy, statics records). */
export function stateSize(s) {
	const seen = new Set();
	const st = [];
	for (const k of FIGHT_GRAPH) if (s.fields[k]) st.push(s.fields[k]);
	while (st.length) {
		const v = st.pop();
		if (v === null || typeof v !== 'object' || seen.has(v) || s.layout.shared.has(v)) continue;
		seen.add(v);
		children(v, (x) => { if (x !== null && typeof x === 'object') st.push(x); });
	}
	return { objects: seen.size, pins: s.layout.pins.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Fast-mode tables. revive() builds class instances with Object.create + keyed stores, which leaves every object
// with more than a dozen fields in V8 dictionary mode (all bw monster templates, rw object types, xw cell types
// zw.u, pw configs, bj0 items, the quests, vj0.i2, ...): each read of such a field is a hash lookup, and the
// engine reads them everywhere (A*: occupant type t.a / t.l / t.u, zw.u[cell.a].m / .o). fastTables() rebuilds
// every table object with a generated constructor (named stores: fast properties, one map per class), keeps
// prototypes, own keys and their order, and repoints every reference (roots, namespaces, arrays, Maps, fields).
// Run it right after initTables, before anything holds table objects (resetStatics does).

const FAST = new Map();   // proto + keys -> constructor

function fastCtor(proto, keys) {
	const key = keys.join('\u0001');
	let byProto = FAST.get(proto);
	if (byProto === undefined) FAST.set(proto, (byProto = new Map()));
	let F = byProto.get(key);
	if (F === undefined) {
		const body = keys.map((k) => `this${prop(k)} = s${prop(k)};`).join('\n');
		F = new Function(`return function Fast(s) {\n${body}\n};`)();
		F.prototype = proto;
		byProto.set(key, F);
	}
	return F;
}

/** Rebuild the current tables' objects in V8 fast mode (identity changes; see above). Returns the count. */
export function fastTables(ns) {
	const roots = tables.roots;
	const map = new Map();
	const seen = new Set();
	const st = Object.values(roots);
	const objs = [];
	while (st.length) {
		const v = st.pop();
		if (v === null || typeof v !== 'object' || seen.has(v)) continue;
		seen.add(v);
		if (ArrayBuffer.isView(v)) continue;
		if (v instanceof Map) { for (const [k, x] of v) { st.push(k); st.push(x); } continue; }
		if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) st.push(v[i]); continue; }
		objs.push(v);
		for (const k of Object.keys(v)) st.push(v[k]);
	}
	for (const o of objs) {
		const names = Object.getOwnPropertyNames(o);
		const keys = Object.keys(o);
		if (names.length !== keys.length || Object.getOwnPropertySymbols(o).length) continue;
		if (keys.some((k) => { const d = Object.getOwnPropertyDescriptor(o, k); return !('value' in d) || !d.writable || !d.configurable; })) continue;
		if (!Object.isExtensible(o)) continue;
		const F = fastCtor(Object.getPrototypeOf(o), keys);
		map.set(o, new F(o));
	}
	const fix = (x) => (x !== null && typeof x === 'object' ? map.get(x) ?? x : x);
	for (const v of seen) {
		if (ArrayBuffer.isView(v)) continue;
		if (v instanceof Map) {
			let keyMoved = false;
			for (const k of v.keys()) if (map.has(k)) keyMoved = true;
			if (keyMoved) {
				const e = [...v].map(([k, x]) => [fix(k), fix(x)]);
				v.clear();
				for (const [k, x] of e) v.set(k, x);
			} else for (const [k, x] of v) { const y = fix(x); if (y !== x) v.set(k, y); }
			continue;
		}
		const t = map.get(v) ?? v;
		if (Array.isArray(t)) { for (let i = 0; i < t.length; i++) { const x = t[i]; const y = fix(x); if (y !== x) t[i] = y; } continue; }
		for (const k of Object.keys(t)) { const x = t[k]; const y = fix(x); if (y !== x) t[k] = y; }
	}
	for (const r of Object.keys(roots)) {
		roots[r] = fix(roots[r]);
		const [cls, field] = r.split('.');
		if (ns && ns[cls]) ns[cls][field] = roots[r];
	}
	return map.size;
}

// ---------------------------------------------------------------------------------------------------------------
// Pristine statics (setup.js resetStatics) and the generated-dungeon cache (setup.js setupGen)

let PRISTINE = null;   // { tables, key, layout, recs }
/**
 * The live statics equal the pristine ones: the pristine profile is vj0.i2 and every pin equals its pristine
 * record (a compare, ~10 us; so edits made after resetStatics, e.g. setupGen's spec.quests, are seen).
 */
export function staticsPristine() {
	if (PRISTINE === null || PRISTINE.tables !== tables || V.i2 !== PRISTINE.layout.profile) return false;
	const L = PRISTINE.layout;
	const { recs, pure } = PRISTINE.recs;
	for (let i = 0; i < L.pins.length; i++) if (pure[i] !== 1 || !L.io[i].same(L.pins[i], recs[i])) return false;
	return true;
}

/** Record the current (just revived) statics as pristine; key identifies the tables JSON. */
export function capturePristine(key) {
	TL = tableLayout(true);
	const L = layoutFor(V.i2);
	begin(L.shared, true);
	try {
		PRISTINE = { tables, key, layout: L, recs: savePins(L) };
	} finally {
		end();
	}
	GEN.clear();
}

/** Put the pristine statics back in place (false when there is no pristine record for these tables / key). */
export function restorePristine(key) {
	if (PRISTINE === null || PRISTINE.tables !== tables || PRISTINE.key !== key) return false;
	const L = PRISTINE.layout;
	V.i2 = L.profile;
	begin(L.shared, false);
	try {
		loadPins(L, PRISTINE.recs);
	} finally {
		end();
	}
	return true;
}

const GEN = new Map();   // "type:seed" -> { h, recs } | { error }
let genCap = 32;

/** Generated-dungeon cache size (entries, LRU; 0 disables). */
export function setGenCacheSize(n) {
	genCap = Math.max(0, n | 0);
	while (GEN.size > genCap) GEN.delete(GEN.keys().next().value);
}

/**
 * hw for (type, seed): gen() on a miss (it builds and generates the level from the pristine statics), else a
 * copy of the cached result with the statics it wrote put back. Only cached when the statics are pristine.
 */
export function generateCached(type, seed, gen) {
	if (genCap === 0 || !staticsPristine()) return gen();
	const key = type + ':' + seed;
	const L = PRISTINE.layout;
	let e = GEN.get(key);
	if (e !== undefined) {
		GEN.delete(key);
		GEN.set(key, e);
		if (e.error) throw e.error;
		begin(L.shared, false);
		try {
			canon(e.h);
			loadPins(L, e.recs);
			const h = cp(e.h);
			finish();
			return h;
		} finally {
			end();
		}
	}
	let h;
	try {
		h = gen();
	} catch (err) {
		GEN.set(key, { error: err });
		if (GEN.size > genCap) GEN.delete(GEN.keys().next().value);
		throw err;
	}
	begin(L.shared, true);
	try {
		canon(h);
		e = { recs: savePins(L), h: cp(h) };
		finish();
	} finally {
		end();
	}
	GEN.set(key, e);
	if (GEN.size > genCap) GEN.delete(GEN.keys().next().value);
	return h;
}

// ---------------------------------------------------------------------------------------------------------------
// Profile statics (js/combat/entry.js): the pristine record and the generated-dungeon cache, for another profile

/**
 * Record the live statics with profile P as vj0.i2: the table pins and P's pins, as they are now. A token for
 * restoreStatics / generateCachedIn (dungeon entry keeps one per imported profile's working copy).
 */
export function captureStatics(P) {
	const L = layoutFor(P);
	begin(L.shared, true);
	try {
		return { tables, layout: L, recs: savePins(L), gen: new Map() };
	} finally {
		end();
	}
}

/** Put a captureStatics record back in place and install its profile as vj0.i2. */
export function restoreStatics(tok) {
	if (tok.tables !== tables) throw new Error('clone: statics record of other tables (re-import the profile)');
	const L = tok.layout;
	V.i2 = L.profile;
	begin(L.shared, false);
	try {
		loadPins(L, tok.recs);
	} finally {
		end();
	}
}

/**
 * generateCached for a captureStatics token: hw for `key` (the caller's statics before gen() must be a function of
 * the token and key: restoreStatics(tok), then edits determined by key). A hit puts back the statics gen() wrote.
 */
export function generateCachedIn(tok, key, gen) {
	if (genCap === 0) return gen();
	const L = tok.layout;
	const G = tok.gen;
	let e = G.get(key);
	if (e !== undefined) {
		G.delete(key);
		G.set(key, e);
		if (e.error) throw e.error;
		begin(L.shared, false);
		try {
			canon(e.h);
			loadPins(L, e.recs);
			const h = cp(e.h);
			finish();
			return h;
		} finally {
			end();
		}
	}
	let h;
	try {
		h = gen();
	} catch (err) {
		G.set(key, { error: err });
		if (G.size > genCap) G.delete(G.keys().next().value);
		throw err;
	}
	begin(L.shared, true);
	try {
		canon(h);
		e = { recs: savePins(L), h: cp(h) };
		finish();
	} finally {
		end();
	}
	G.set(key, e);
	if (G.size > genCap) G.delete(G.keys().next().value);
	return h;
}

/** The live shared set and pins (tests / diagnostics). */
export function liveLayout() {
	const L = layoutFor(V.i2);
	return { shared: L.shared, pins: L.pins, pristine: L.tl.pristine };
}
