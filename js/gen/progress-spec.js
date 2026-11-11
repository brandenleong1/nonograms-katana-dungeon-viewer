// Player progress as data: the part of the player state vj0 that dungeon generation (x30.g, qw.d / s8.u, zw.a)
// reads, in the format the oracle takes (tools/oracle Harness.java `--progress`, `progbatch`, `progress`; see
// js/combat/ORACLE.md "Generation with progress"). One spec format for both engines:
//
//   {
//     "quests":    { "<id>": [j0, k0] | "none" | "active" | "done" },   kj0.j0 (bit 4 active, bit 7 done), k0 step bits
//     "J0": int,                                   bosses beaten: bits 0..14 classic, 15..22 forest, 23..25 cave
//     "I0": int,                                   bits 28..31 forest quest-line flags (mini-boss levels, vj0.E1)
//     "B": int,                                    vj0.B (jj0 'r' conditions)
//     "X": "<long>",                               vj0.X perk bits (decimal string; hero stats only)
//     "items":     { "<id>": count },              K (stock) = count, L (warehouse) = 0; vj0.L0 / P1 read K + L
//     "buildings": { "<id>": [B0, C0] },           ni0 vj0.o[id]: level, done-step bits
//     "stats":     { "x": int, "f": { "<i>": int }, "b": { "<id>": count } },   vj0.N: x, counter f(i), list b
//     "perks":     { "<i>": q }                    vj0.j[i].q (vj0.p0 = their sum)
//   }
//
// Every key is optional; unknown keys and ids throw (as in the oracle). Quest states "none" / "active" / "done" are
// [0, 0] / [16, 0] / [128, 0] (the game's kj0.C start and vj0 completion: j0 = (j0 & ~16) | 128).
//
//   readProgress(v)            -> the full spec of a profile (quests with j0 or k0 set; SPEC_* ids)
//   applyProgress(v, spec)     -> v, edited in place
//   withProgress(base, spec)   -> an edited deep copy of base (base untouched; static tables shared)
//   diffProgress(a, b)         -> the smallest spec that turns a's reads into b's
//   freshProfile()             -> the new-game profile (data/tables.json vj0.i2)
//
// Imports: never ./index.js (top-level await would deadlock the module graph).
import { vj0 as V, tables } from './statics.js';
import { classes } from './registry.js';
import { b8 } from './jrt.js';
import { cloneGraph } from '../save/fresh.js';

/** Item ids / stat counters the generator reads: hi0 n0=2 L0(114) (quest 38's NPC level), x30.O P1(256) (quest 51's
 *  boss drop), zw.a L0(305) (egypt unique 621's drop); x30.P N.b.j(115) and N.f(18) (NPC 431's chance). Keep in sync
 *  with Harness.java SPEC_ITEMS / SPEC_STAT_ITEMS / SPEC_COUNTERS. */
export const SPEC_ITEMS = [114, 256, 305];
export const SPEC_STAT_ITEMS = [115];
export const SPEC_COUNTERS = [18];

const KEYS = new Set(['quests', 'J0', 'I0', 'B', 'X', 'items', 'buildings', 'stats', 'perks']);
const STATES = { none: [0, 0], active: [16, 0], done: [128, 0] };

const encCount = (n) => { const v = n ^ 6896781; return ((v & 252645135) << 4) | ((-252645136 & v) >>> 4); };
const encCounter = (n) => { const v = n ^ 23673997; return ((v & 252645135) << 4) | ((-252645136 & v) >>> 4); };
const toLong = (x) => BigInt.asIntN(64, typeof x === 'bigint' ? x : BigInt(x || 0));

function num(v, what) {
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`progress: ${what} is not a number: ${JSON.stringify(v)}`);
	return v | 0;
}

function id(k, what) {
	const n = Number(k);
	if (!Number.isInteger(n)) throw new Error(`progress: bad ${what} id ${JSON.stringify(k)}`);
	return n;
}

/** [j0, k0] of a quest entry (see the header). */
export function questState(v, qid = '?') {
	if (typeof v === 'string') {
		const s = STATES[v];
		if (!s) throw new Error(`progress: quest ${qid}: unknown state ${v}`);
		return s.slice();
	}
	if (Array.isArray(v)) return [num(v[0], `quest ${qid} j0`), v.length > 1 ? num(v[1], `quest ${qid} k0`) : 0];
	if (v && typeof v === 'object') {
		for (const k of Object.keys(v)) if (k !== 'j0' && k !== 'k0') throw new Error(`progress: quest ${qid}: unknown key ${k}`);
		return [v.j0 == null ? 0 : num(v.j0, 'j0'), v.k0 == null ? 0 : num(v.k0, 'k0')];
	}
	throw new Error(`progress: quest ${qid}: bad state ${JSON.stringify(v)}`);
}

/** "none" / "active" / "done" of a quest's j0 (what the generator distinguishes: kj0.x / q). */
export function stateName(j0) {
	if (j0 & 128) return 'done';
	return j0 & 16 ? 'active' : 'none';
}

/** Count n of item id in cq list (entries for id removed first; a new one inserted where cq.c puts it). */
function setCount(list, iid, n) {
	const c = list.c;
	for (let i = c.length - 1; i >= 0; i--) if (c[i].a.a === iid) c.splice(i, 1);
	if (n <= 0) return;
	const item = V.Z1 && V.Z1.get(iid);
	if (!item) throw new Error(`progress: no item ${iid}`);
	let at = -1;
	for (let i = 0; i < c.length; i++) {
		const x = c[i].a;
		if (list.b ? x.T > item.T : x.b > item.b) { at = i; break; }
	}
	const e = Object.create(classes.cj0.prototype);
	e.a = item;
	e.b = encCount(n);
	e.c = false;
	if (at === -1) c.push(e); else c.splice(at, 0, e);
}

/** Edit profile v by spec (in place). Throws on unknown keys / ids, like the oracle. */
export function applyProgress(v, spec) {
	if (!spec) return v;
	if (typeof spec !== 'object' || Array.isArray(spec)) throw new Error('progress: the spec is not an object');
	for (const key of Object.keys(spec)) {
		if (!KEYS.has(key)) throw new Error(`progress: unknown key ${key}`);
		const val = spec[key];
		switch (key) {
			case 'quests':
				for (const [k, s] of Object.entries(val)) {
					const qid = id(k, 'quest');
					const q = qid >= 0 ? v.Y0_(qid) : null;
					if (q == null) throw new Error(`progress: no quest ${qid}`);
					const [j0, k0] = questState(s, qid);
					q.j0 = b8(j0);
					q.k0 = b8(k0);
				}
				break;
			case 'J0': v.J0 = num(val, 'J0'); break;
			case 'I0': v.I0 = num(val, 'I0'); break;
			case 'B': v.B = num(val, 'B'); break;
			case 'X': {
				const x = toLong(val);
				if (toLong(v.X) !== x) v.X = x;
				break;
			}
			case 'items':
				for (const [k, n] of Object.entries(val)) {
					const iid = id(k, 'item');
					setCount(v.K, iid, num(n, `item ${iid}`));
					setCount(v.L, iid, 0);
				}
				break;
			case 'buildings':
				for (const [k, bc] of Object.entries(val)) {
					const bid = id(k, 'building');
					const o = bid >= 0 && bid < v.o.length ? v.o[bid] : null;
					if (o == null) throw new Error(`progress: no building ${bid}`);
					if (!Array.isArray(bc)) throw new Error(`progress: building ${bid}: expected [B0, C0]`);
					o.B0 = num(bc[0], `building ${bid} B0`);
					if (bc.length > 1) o.C0 = num(bc[1], `building ${bid} C0`);
				}
				break;
			case 'stats':
				for (const [k, s] of Object.entries(val)) {
					if (k === 'x') v.N.x = num(s, 'stats.x');
					else if (k === 'f') {
						for (const [i, n] of Object.entries(s)) {
							const ci = id(i, 'counter');
							if (ci < 0 || ci >= 27) throw new Error(`progress: no counter ${ci}`);
							v.N.t[ci] = encCounter(num(n, `stats.f.${ci}`));
						}
					} else if (k === 'b') {
						for (const [i, n] of Object.entries(s)) setCount(v.N.b, id(i, 'item'), num(n, `stats.b.${i}`));
					} else throw new Error(`progress: unknown stats key ${k}`);
				}
				break;
			case 'perks':
				for (const [k, q] of Object.entries(val)) {
					const pi = id(k, 'perk');
					if (pi < 0 || pi >= v.j.length) throw new Error(`progress: no perk ${pi}`);
					v.j[pi].q = num(q, `perk ${pi}`);
				}
				break;
		}
	}
	return v;
}

/** The full spec of profile v (same content and key order as the oracle's `progress` mode). */
export function readProgress(v) {
	const quests = {};
	for (let qid = 0; qid < v.s.length; qid++) {
		const q = v.s[qid];
		if (q == null || (q.j0 === 0 && q.k0 === 0)) continue;
		quests[qid] = [q.j0 & 255, q.k0 & 255];
	}
	const items = {};
	for (const i of SPEC_ITEMS) items[i] = v.L0_(i);
	const buildings = {};
	for (let b = 0; b < v.o.length; b++) if (v.o[b] != null) buildings[b] = [v.o[b].B0, v.o[b].C0];
	const f = {};
	for (const i of SPEC_COUNTERS) f[i] = v.N.f_(i);
	const b = {};
	for (const i of SPEC_STAT_ITEMS) b[i] = v.N.b.j_(i);
	const perks = {};
	for (let i = 0; i < v.j.length; i++) perks[i] = v.j[i].q;
	return { quests, J0: v.J0 | 0, I0: v.I0 | 0, B: v.B | 0, X: String(toLong(v.X)), items, buildings, stats: { x: v.N.x | 0, f, b }, perks };
}

/** The new-game profile: vj0.i2 as data/tables.json revives it (whatever vj0.i2 currently points to). */
export function freshProfile() {
	if (!tables) throw new Error('progress: call initTables(data/tables.json) first');
	return tables.roots['vj0.i2'];
}

/** A deep copy of base with spec applied (base untouched; the static tables are shared, as js/save does). */
export function withProgress(base, spec) {
	return applyProgress(cloneGraph(base), spec);
}

/**
 * The smallest spec d with readProgress(applyProgress(copy of a, d)) == readProgress(b) for what the spec covers;
 * a and b are specs (readProgress output) or profiles. Quests only in a are reset to "none".
 */
export function diffProgress(a, b) {
	const A = isProfile(a) ? readProgress(a) : a;
	const B = isProfile(b) ? readProgress(b) : b;
	const d = {};
	const quests = {};
	for (const k of new Set([...Object.keys(A.quests || {}), ...Object.keys(B.quests || {})])) {
		const x = questState(A.quests?.[k] ?? 'none', k), y = questState(B.quests?.[k] ?? 'none', k);
		if (x[0] !== y[0] || x[1] !== y[1]) quests[k] = y;
	}
	if (Object.keys(quests).length) d.quests = quests;
	for (const k of ['J0', 'I0', 'B']) if (B[k] != null && (A[k] | 0) !== (B[k] | 0)) d[k] = B[k] | 0;
	if (B.X != null && toLong(A.X ?? 0) !== toLong(B.X)) d.X = String(toLong(B.X));
	const sub = (ka, kb, eq) => {
		const out = {};
		for (const k of Object.keys(kb || {})) if (!eq((ka || {})[k], kb[k])) out[k] = kb[k];
		return Object.keys(out).length ? out : null;
	};
	const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
	const items = sub(A.items, B.items, (x, y) => (x | 0) === (y | 0));
	if (items) d.items = items;
	const bld = sub(A.buildings, B.buildings, same);
	if (bld) d.buildings = bld;
	if (B.stats) {
		const st = {};
		if (B.stats.x != null && (A.stats?.x | 0) !== (B.stats.x | 0)) st.x = B.stats.x | 0;
		const f = sub(A.stats?.f, B.stats.f, (x, y) => (x | 0) === (y | 0));
		if (f) st.f = f;
		const bb = sub(A.stats?.b, B.stats.b, (x, y) => (x | 0) === (y | 0));
		if (bb) st.b = bb;
		if (Object.keys(st).length) d.stats = st;
	}
	const perks = sub(A.perks, B.perks, (x, y) => (x | 0) === (y | 0));
	if (perks) d.perks = perks;
	return d;
}

/** spec a and b give the same reads (key order and quest-entry form ignored) */
export function sameProgress(a, b) {
	return Object.keys(diffProgress(a, b)).length === 0 && Object.keys(diffProgress(b, a)).length === 0;
}

const isProfile = (x) => x != null && typeof x.Y0_ === 'function';
