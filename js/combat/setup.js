// Fight setup, mirroring the oracle (tools/oracle/FightHarness.java setupGen / setupSave / heroEdits / buildC30;
// js/combat/ORACLE.md "Setup" steps 1-8):
//   fightgen: fresh profile vj0.i2, hero l[0]; new hw(type, hero); x30.g(hw, seed); hw.x.a = xseed; hw.n(null);
//             optional teleport (x,y | auto | near:x,y); hero edits; vj0.i2.K0 = null; c30 as PageDungeon builds it.
//   fight:    an imported save (js/save importSave, installed as vj0.i2) and its hw; hero edits; K0 = null; c30.
// The settle that turns this into the `init` record is driver.js.
import { classes } from '../gen/registry.js';
import { zw, xs, vj0 as V, initTables } from '../gen/statics.js';
import { imul, s16, iabs, b8 } from '../gen/jrt.js';
import '../save/records.js';          // cq.b_ (add), nw.w_ (set XP), ... (guarded model methods)
import { c30, fw, install } from './c30.js';
import { capturePristine, restorePristine, generateCached, fastTables } from './clone.js';
import { DungameView, Context } from './input.js';
import './nav.js';
import { applyProgress } from '../gen/progress-spec.js';

export const KIT_ITEMS = [[120, 5], [168, 2], [143, 5], [144, 3], [174, 2], [209, 2], [123, 1]];
// nw.h[] skill levels: 0 charge, 1 smashing blow, 2 round kick, 3 throwing, 5 doctor, 6 demoralize, 7 tactical gaze, 17 divine
export const KIT_SKILLS = [[0, 1], [1, 2], [2, 3], [3, 3], [5, 1], [6, 1], [7, 1], [17, 1]];
export const KIT_MP = 60;
// --kit2 (after --kit; FightHarness KIT2_*): the exploration kit (tools/explore.mjs). MP is filled to nw.n().
export const KIT2_ITEMS = [[120, 10], [122, 3], [121, 10], [124, 2], [123, 2], [304, 2], [217, 4], [219, 1],
	[218, 2], [292, 2], [118, 3], [206, 2], [294, 2], [285, 2], [295, 1], [235, 2], [236, 2], [306, 1], [303, 1],
	[277, 2], [291, 1]];
export const KIT2_SKILLS = [[0, 1], [1, 2], [2, 3], [3, 3], [4, 2], [5, 1], [6, 1], [7, 1], [8, 3], [9, 2],
	[10, 2], [11, 1], [12, 1], [13, 1], [14, 1], [15, 4], [17, 1]];
// --gear T: slot 0 weapon, 1 armour, 2 shield, 3 ring; tiers 1..4
export const GEAR = [[154, 155, 156, 176], [157, 158, 159, 216], [160, 161, 162, 188], [163, 164, 165, 175]];
/** Long.MAX_VALUE / 4 as a double (c30.x0: the autosave clock never comes due) */
export const NEVER = 2305843009213693951;

/**
 * Fresh static tables for a new fight (the oracle starts a new JVM per fight): setup and play write the player
 * profile (vj0.i2), zw.w[1], zw.z and monster templates (and a save import vj0.A1 / R1). The first call (or a
 * different tablesJson, or opts.full, or env NK_FULL_RESET=1) re-revives data/tables.json, rebuilds its objects
 * in V8 fast mode (clone.js fastTables; env NK_SLOW_TABLES=1 skips it) and records the pristine values of those
 * statics (clone.js "pins"); later calls put them back in place (~0.3 ms instead of a ~60-150 ms re-revive),
 * keeping the same tables objects, so clone.js states stay restorable across fights.
 */
export function resetStatics(tablesJson, opts = {}) {
	// a progress spec's edits to profile parts clone.js does not pin (buildings, perks, warehouse): undo them first
	while (UNPINNED_UNDO.length) UNPINNED_UNDO.pop()();
	const full = opts.full || (typeof process !== 'undefined' && process.env && process.env.NK_FULL_RESET === '1');
	if (!full && restorePristine(tablesJson)) return;
	initTables(tablesJson);
	if (!(typeof process !== 'undefined' && process.env && process.env.NK_SLOW_TABLES === '1')) fastTables({ zw, x30: xs, vj0: V });
	capturePristine(tablesJson);
}

/** Undo records for setupGen's progress edits outside the clone.js pins (run by the next resetStatics). */
const UNPINNED_UNDO = [];

/** Snapshot the profile parts applyProgress may write that resetStatics' pins do not cover: vj0.o (B0, C0), vj0.j (q),
 *  vj0.L's entries. */
function unpinnedUndo(st) {
	const o = st.o.map((b) => (b == null ? null : [b.B0, b.C0]));
	const j = st.j.map((m) => m.q);
	const L = st.L.c.slice();
	return () => {
		o.forEach((r, i) => { if (r) { st.o[i].B0 = r[0]; st.o[i].C0 = r[1]; } });
		j.forEach((q, i) => { st.j[i].q = q; });
		st.L.c.length = 0;
		st.L.c.push(...L);
	};
}

/** The static writes buildC30 makes besides c30 itself (also needed to replay a method snapshot). */
export function applyStatics(h) {
	const jw = h.c.B;
	zw.w[1] = jw == null ? zw.v : jw;
}

/**
 * fightgen: spec = { type, seed, xseed, at: 'start' | 'auto' | 'near:x,y' | 'x,y', quests?, level?, gear?, kit?, kit2? }
 * (quests: the oracle's "Q[:B],.." string, or a progress spec object).
 * Returns { h, c, dgv, meta } or { error, meta }. meta holds the oracle's header fields in its order.
 */
export function setupGen(spec) {
	const { type, seed, xseed } = spec;
	const at = spec.at ?? 'start';
	const meta = { mode: 'fightgen', type, seed, xseed, at };
	const st = V.i2;
	if (spec.quests && typeof spec.quests === 'object') {
		// a progress spec (js/gen/progress-spec.js: the viewer's "Your progress" for a what-if hero), applied before
		// generation; the oracle equivalent is Harness --progress (no fightgen flag)
		UNPINNED_UNDO.push(unpinnedUndo(st));
		try {
			applyProgress(st, spec.quests);
		} catch (e) {
			return { error: `quests: ${e.message}`, meta };
		}
		meta.quests = 'progress';
	} else if (spec.quests) {
		// quest state before generation (oracle --quests Q[:B],..): kj0.j0 |= B (16 active, 128 done)
		for (const q of String(spec.quests).split(',')) {
			const [id, bits] = q.split(':').map(Number);
			const k = st.Y0_(id);
			if (k == null) return { error: `quests: no quest ${id}`, meta };
			k.j0 = b8(k.j0 | (bits === undefined || Number.isNaN(bits) ? 16 : bits));
		}
		meta.quests = spec.quests;
	}
	const hero = st.l[0];
	let h;
	try {
		// cached per (type, seed) when the statics are pristine (clone.js generateCached); never with a progress spec
		// (its building / perk edits are invisible to the pristine check)
		const gen = () => {
			const lv = new classes.hw(type, hero);
			new classes.x30().g_(lv, seed);
			return lv;
		};
		h = spec.quests && typeof spec.quests === 'object' ? gen() : generateCached(type, seed, gen);
	} catch (e) {
		return { error: `gen: ${e.name || 'Error'}: ${e.message}`, meta };
	}
	h.x.a = xseed | 0;
	h.n_(null);
	meta.start = [h.f.b.a, h.f.b.b];
	if (at !== 'start') {
		let t;
		if (at === 'auto') t = autoCell(h, null);
		else if (at.startsWith('near:')) {
			const p = at.slice(5).split(',').map(Number);
			const o = h.k[p[1] * h.g + p[0]];
			if (!(o instanceof classes.aw)) return { error: `near: no critter at ${p[0]},${p[1]}`, meta };
			t = autoCell(h, o);
		} else t = at.split(',').map(Number);
		if (t == null) return { error: 'auto: no hostile critter in a room', meta };
		if (!teleport(h, t[0], t[1])) return { error: `teleport: cell ${t[0]},${t[1]} not free`, meta };
		meta.tele = t;
	}
	heroEdits(h, spec, meta);
	st.K0 = null;
	const { c, dgv } = buildC30(h);
	return { h, c, dgv, meta };
}

/**
 * fight: imported = the result of js/save importSave(bytes) (its vj0 becomes vj0.i2, as the game's loader
 * vj0.c2 replaces the profile). spec = { save (file name), level?, gear?, kit? }.
 */
export function setupSave(spec, imported) {
	const meta = { mode: 'fight', save: spec.save ?? 'guild.dat' };
	const v = imported.vj0;
	V.i2 = v;
	const k = v.K0;
	if (k == null) return { error: 'save is not in a dungeon (vj0.K0 == null)', meta };
	if (!(k instanceof classes.hw)) return { error: 'current dungeon is autonomous (ew), not hw', meta };
	const h = k;
	meta.type = h.b;
	meta.seed = h.a;
	meta.rng0 = [h.x.a, h.w.a];
	heroEdits(h, spec, meta);
	v.K0 = null;
	const { c, dgv } = buildC30(h);
	return { h, c, dgv, meta };
}

/** --level, --gear, --kit, --kit2 in this order; refill HP / EP when level or gear changed. */
export function heroEdits(h, spec, meta) {
	const e = h.e;
	const f = h.f;
	let refill = false;
	if (spec.level != null) {
		e.w_(classes.nw.q_(spec.level | 0));
		meta.level = e.g;
		refill = true;
	}
	if (spec.gear != null) {
		const t = spec.gear | 0;
		const ids = [0, 0, 0, 0];
		for (let slot = 0; slot < 4; slot++) {
			ids[slot] = GEAR[slot][t - 1];
			e.i[slot] = V.Z1.get(ids[slot]) ?? null;
		}
		meta.gear = ids;
		refill = true;
	}
	if (spec.kit) {
		for (const [i, l] of KIT_SKILLS) e.h[i] = Math.max(e.h[i], l);
		for (const [id, n] of KIT_ITEMS) f.D.b_(id, n);
		f.G_(Math.min(KIT_MP, e.n_()));
		meta.kit = { items: KIT_ITEMS, skills: KIT_SKILLS, mp: f.E_() };
	}
	if (spec.kit2) {
		for (const [i, l] of KIT2_SKILLS) e.h[i] = Math.max(e.h[i], l);
		for (const [id, n] of KIT2_ITEMS) f.D.b_(id, n);
		f.G_(e.n_());
		meta.kit2 = { items: KIT2_ITEMS, skills: KIT2_SKILLS, mp: f.E_() };
	}
	if (refill) {
		f.A_(f.q_());
		f.z.z_(f.D_());
	}
	if (spec.skills) {
		// --skills I:L,..: exact skill levels after the kits
		for (const q of String(spec.skills).split(',')) { const [i, l] = q.split(':').map(Number); e.h[i] = b8(l); }
		meta.skills = spec.skills;
	}
	if (spec.pets) pets(h, String(spec.pets), meta);
}

/**
 * --pets S:SEED:RANK:FOOD:N,.. (FightHarness.pets): companions uw(S, SEED, RANK) fed N x FOOD in the hero's nw.l, then
 * the familiar slots as PageDungeon's dungeon start: per companion with food (first 3) a gw (charges 1, +1 with uw
 * flag 1048576, +1 for food 236 / 251 / 252), uw.j(true), item 225 + i, uw.c(); mw.C = 1 / 3 / 5 for 1 / 2 / 3.
 */
export function pets(h, spec, meta) {
	const e = h.e, f = h.f;
	const { uw, gw, kh0 } = classes;
	for (const p of spec.split(',')) {
		const q = p.split(':').map(Number);
		const u = new uw(q[0], q[1], q[2]);
		if (q.length > 3) { u.l = V.Z1.get(q[3]) ?? null; u.k = q.length > 4 ? q[4] : 1; }
		e.l.push(u);
	}
	const n = Math.min(e.l.length, 3);
	let cnt = 0;
	for (let i = 0; i < n; i++) {
		const u = e.l[i];
		if (u.k <= 0) continue;
		const g = gw ? new gw() : { a: null, b: 0, c: null, d: null, e: 0, f: false, g: false, h: false };
		const ch = new kh0(14, false);
		g.c = ch;
		g.d = new kh0(14, false);
		u.j_(true);
		g.b = u.f.a;
		const base = u.h_(1048576, true) ? 2 : 1;
		const bonus = u.k > 0 && [236, 251, 252].includes(u.l.a) ? 1 : 0;
		ch.z_((bonus + base) | 0);
		g.e = u.f_(true);
		h.v[i] = g;
		f.D.b_((i + 225) | 0, 1);
		u.c_();
		cnt++;
	}
	if (cnt > 0) f.C.z_(cnt === 1 ? 1 : cnt === 2 ? 3 : 5);
	meta.pets = spec;
}

/**
 * The `auto` / `near:` target: a free cell (hw.z) in the monster's room (equal hw.l) at Chebyshev distance 3
 * (else 2, 4, 5) from it, nearest (Manhattan) to the hero, row-major first. Without `best`: the hostile, live
 * critter in a room (hw.l & 1023) nearest (Manhattan) to the hero, first in hw.o order.
 */
export function autoCell(h, best) {
	const f = h.f;
	let bd = 2147483647;
	if (best == null) {
		for (const m of h.o) {
			if (m === f || m.u_() || !zw.o_(f.k, m.k)) continue;
			if ((h.l[m.b.b * h.g + m.b.a] & 1023) === 0) continue;
			const d = iabs(m.b.a - f.b.a) + iabs(m.b.b - f.b.b);
			if (d < bd) { bd = d; best = m; }
		}
	}
	if (best == null) return null;
	const room = h.l[best.b.b * h.g + best.b.a];
	for (const r of [3, 2, 4, 5]) {
		let pick = null;
		let pd = 2147483647;
		for (let y = 0; y < h.h; y++) {
			for (let x = 0; x < h.g; x++) {
				if (Math.max(iabs(x - best.b.a), iabs(y - best.b.b)) !== r) continue;
				if (h.l[y * h.g + x] !== room || !h.z_(x, y)) continue;
				const d = iabs(x - f.b.a) + iabs(y - f.b.b);
				if (d < pd) { pd = d; pick = [x, y]; }
			}
		}
		if (pick != null) return pick;
	}
	return null;
}

/** The teleport items' sequence (DungameView.d0, items 237-239): hw.D, trap flag 512 -> marker, hw.m, hw.n. */
export function teleport(h, x, y) {
	const f = h.f;
	const ox = f.b.a, oy = f.b.b;
	if (!h.D_(x, y, f)) return false;
	if (f.s_(512)) {
		f.y_(512);
		h.L_(ox, oy);
	}
	h.m_(x, y, true, true);
	h.n_(new fw(f.k, false));
	return true;
}

/** c30 as PageDungeon's dungeon view init builds it (FightHarness.buildC30); particles are not modelled. */
export function buildC30(a) {
	const ctx = new Context();
	const dgv = new DungameView();
	const c = new c30();
	dgv.u = c;
	dgv.a = ctx;
	dgv.W = true;
	c.d = ctx;
	c.a = a;
	c.e = dgv;
	c.f = 1;
	const iB = zw.b_(a.b);
	c.b = zw.K[iB];
	c.c = V.i2.R0[iB];
	c.g = a.g;
	c.h = a.h;
	c.i = a.j;
	c.j = a.m;
	c.q = a.c.G;
	c.T0_();
	c.y0 = zw.g_(a.b, 0) + '-' + a.a;
	applyStatics(a);
	c.l = true;
	c.u = a.e.h[12] > 0;
	for (let i = 0; i < a.i; i++) {
		const o = a.k[i];
		if (o == null) continue;
		if (c.t0 === 0 && o.a.a === 35) c.t0 = i;
		if (c.u0 === 0 && o.a.a === 60) c.u0 = i;
		if (c.t0 !== 0 && c.u0 !== 0) break;
	}
	L: for (let y = 0; y < c.h; y++) {
		for (let x = 0; x < c.g; x++) {
			const w = c.i[c.g * y + x];
			if (w.a === 1 && (w.b & 63) === 12) {
				c.v0 = x;
				c.w0 = y;
				break L;
			}
		}
	}
	c.k = new Int16Array(a.i);
	let s = imul((a.a + 1001) | 0, 69069);
	for (let i = 0; i < a.i; i++) {
		s = (imul(s, 69069) + 1) | 0;
		c.k[i] = s16(s >>> 12);
	}
	c.n = true;
	c.o = a.c.E;
	c.l0 = false;
	c.i0 = true;
	c.j0 = true;
	c.k0 = a.e.h[14] > 0;
	c.x0 = NEVER;
	if (!c.v && a.i_() === 0) c.v = true;
	return { c, dgv };
}

/** heroStats of the oracle header: nw-derived stats at setup. */
export function heroStats(h) {
	const e = h.e;
	const gear = [];
	for (let i = 0; i < 4; i++) gear.push(e.i[i] == null ? 0 : e.i[i].a);
	return {
		lvl: e.g, xp: e.g_(), hp: e.m_(), ep: e.l_(), mp: e.n_(), atk: e.f_(), def: e.e_(), spd: e.p_(),
		gear, skills: Array.from(e.h),
	};
}

install({
	/** void T0(): light radius r (10 with a lantern mw.E, else 6) and the squared ranges s, t */
	T0_() {
		let r = this.a.f.E > 0 ? 10 : 6;
		this.r = r;
		const r5 = (r + 5) | 0;
		this.s = (imul(r5, r5) + 1) | 0;
		r = (r + 1) | 0;
		this.t = (imul(r, r) + 1) | 0;
	},
});
