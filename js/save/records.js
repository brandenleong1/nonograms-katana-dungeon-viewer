// Readers for the save's per-record encodings, ported from the game's loader with Java field names:
//   cq.m (item lists), nw.u (guild hero: XP, 18 skill levels, 4 equipment slots + enhancement bit, boosters,
//   pets), uw(DataInputStream, boolean, int) (hired companion / pet), kj0.A (quest state bytes), pj0.j / i
//   (obfuscated statistics), ni0 bits the building loop calls (n0, w, t, z, D, p0), mi0.a, bz3.
// Sources: decompiled/vineflower/{cq,nw,uw,kj0,pj0,ni0}.java, JADX {cj0,mi0,bz3,jh1,sj0}.java.
// Methods end in `_` (PORTING.md); they are merged into the classes from js/gen only when absent.
import { b8, imul, idiv, f2i } from '../gen/jrt.js';
import { classes } from '../gen/registry.js';
import { zw, vj0 as V } from '../gen/statics.js';
import { cq, cj0, nw, uw, ni0, pj0, cw, fg2, kh0, mh2 } from '../gen/model.js';
import { kj0, vj0 } from '../gen/progress.js';

const obf = (v, key) => {
	v ^= key;
	return ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
};
const unobf = (b, key) => ((((b & 252645135) << 4) | ((b & -252645136) >>> 4)) ^ key);

/** vj0.Z1.get(id): bj0 item by id (null if absent) */
export const item = (id) => {
	const r = V.Z1.get(id);
	return r === undefined ? null : r;
};

// ---------------------------------------------------------------------------------------------
// cj0 / cq

/** new cj0(count, bj0) */
export function newCj0(count, it) {
	const e = Object.create(cj0.prototype);
	e.a = it;
	e.b = obf(count, 6896781);
	e.c = false;
	return e;
}

const def = (proto, name, fn) => { if (!proto[name]) proto[name] = fn; };

/** void cj0.b(int): store count */
def(cj0.prototype, 'b_', function b_(n) { this.b = obf(n, 6896781); });

/** void cq.h(): clear */
def(cq.prototype, 'h_', function h_() { this.c.length = 0; });

/** cj0 cq.b(int id, int n): add n of id (merges into an existing entry, else c()) */
def(cq.prototype, 'b_', function b_(id, n) {
	if (n <= 0) return null;
	const list = this.c;
	for (let i = 0; i < list.length; i++) {
		const e = list[i];
		if (e.a.a === id) {
			e.b_((e.a_() + n) | 0);
			return e;
		}
	}
	return this.c_(id, n);
});

/** cj0 cq.c(int id, int n): insert a new entry before the first with larger sort key (T if b, else bj0.b) */
def(cq.prototype, 'c_', function c_(id, n) {
	const list = this.c;
	const it = item(id);
	if (it == null) return null;
	let at = -1;
	for (let i = 0; i < list.length; i++) {
		const o = list[i].a;
		if (this.b ? o.T > it.T : o.b > it.b) { at = i; break; }
	}
	const e = newCj0(n, it);
	if (at === -1) list.push(e); else list.splice(at, 0, e);
	return e;
});

/** boolean cq.q(int id, int n): remove n of id if at least n are held */
def(cq.prototype, 'q_', function q_(id, n) {
	const list = this.c;
	if (n > 0) {
		for (let i = 0; i < list.length; i++) {
			const e = list[i];
			if (e.a.a === id) {
				if (e.a_() >= n) {
					e.b_((e.a_() - n) | 0);
					if (e.a_() === 0) list.splice(list.indexOf(e), 1);
					return true;
				}
				break;
			}
		}
	}
	return false;
});

/** int cq.i(): checksum over (id, count) pairs (header int 9 is K.i() ^ L.i()) */
def(cq.prototype, 'i_', function i_() {
	let h = 0;
	for (const e of this.c) h = imul((e.a_() + imul((h + e.a.a + 101) | 0, 13) + 101) | 0, 13);
	return h;
});

/**
 * void cq.m(DataInputStream, boolean skipCurrency): clear, then {id, count} pairs until id 0. Encoding flags:
 * bit 1 = compact (e0 id, f0 count), else bit 0 = short id + f0 count, else int id + int count. With
 * skipCurrency, items 3 and 5 are dropped (they live elsewhere).
 */
def(cq.prototype, 'm_', function m_(r, skip) {
	this.h_();
	const fl = r.readInt();
	const s = (fl & 1) !== 0;
	const c = (fl & 2) !== 0;
	for (;;) {
		const id = c ? r.e0() : s ? r.readUShort() : r.readInt();
		if (id === 0) return;
		const n = s ? r.f0() : r.readInt();
		const it = item(id);
		if (it != null && (!skip || !fg2.W_(it.a, 5, 3))) this.b_(id, n);
	}
});

// ---------------------------------------------------------------------------------------------
// kj0 / pj0 / yw small setters

/** void kj0.A(int): unpack j0 | k0 << 8 | l0 << 16 | m0 << 24 (signed bytes) */
def(kj0.prototype, 'A_', function A_(v) {
	this.j0 = b8(v & 0xff);
	this.k0 = b8((v >>> 8) & 0xff);
	this.l0 = b8((v >>> 16) & 0xff);
	this.m0 = b8((v >>> 24) & 0xff);
});
/** kj0.A on table objects that are not kj0 instances (wi0 in vj0.R1 revives as a plain object) */
export const kj0A = (k, v) => kj0.prototype.A_.call(k, v);

/** void pj0.j(int i, int v): store counter t[i] */
def(pj0.prototype, 'j_', function j_(i, v) { if (i < 27) this.t[i] = obf(v, 23673997); });
/** void pj0.i(int v): store s */
def(pj0.prototype, 'i_', function i_(v) { this.s = obf(v, 23673997); });
/** int pj0.e(): decoded s */
def(pj0.prototype, 'e_', function e_() { return unobf(this.s, 23673997); });

// ---------------------------------------------------------------------------------------------
// vj0 helpers the loader calls

def(vj0.prototype, 't2_', function t2_(i, z) { this.N0 = z ? (1 << i) | this.N0 : ~(1 << i) & this.N0; });
def(vj0.prototype, 'K1_', function K1_(i) { return (this.N0 & (1 << i)) !== 0; });
/** void s2(int): gold A, clamped to Z0 = e1(1000) */
def(vj0.prototype, 's2_', function s2_(v) { this.A = obf(fg2.q_(v, 0, 499500000), 14072090); });
def(vj0.prototype, 'v0_', function v0_() { return unobf(this.A, 14072090); });
def(vj0.prototype, 'r2_', function r2_(v) { this.x0 = obf(v, 14072090); });
def(vj0.prototype, 'h0_', function h0_() { return unobf(this.x0, 14072090); });
/** int i0(bj0): capacity o (+10 with building 20 step 4) */
def(vj0.prototype, 'i0_', function i0_(it) { return this.o[20].h0_(4) ? (it.o + 10) | 0 : it.o; });
/** nw u0(): selected hero (H0, reset to 0 when out of range), null when H0 < 0 */
def(vj0.prototype, 'u0_', function u0_() {
	let h = this.H0;
	if (h >= this.l.length) { h = 0; this.H0 = 0; }
	return h < 0 ? null : this.l[h];
});
/** void E2(): Y0 = sum of ri0 p * i (with p, i > 0) */
def(vj0.prototype, 'E2_', function E2_() {
	this.Y0 = 0;
	for (const r of this.m) if (r.p > 0 && r.i > 0) this.Y0 = (this.Y0 + imul(r.p, r.i)) | 0;
});

/** static int oj0.j(int xp) / vj0.h1: level for xp (1000-step triangle) */
export function lvl1000(v) {
	const s = f2i(Math.sqrt(mh2.f_(v, 1000, 8, 1)) / 2.0 + 0.5);
	if (v < tri1000(s)) return (s - 1) | 0;
	const s1 = (s + 1) | 0;
	return v >= tri1000(s1) ? s1 : s;
}
/** static int oj0.l(int) / vj0.k1 / vj0.e1: xp for level */
export const tri1000 = (n) => imul(idiv(imul((n - 1) | 0, n), 2), 1000);
/** oj0.j(v) for v < 0 is 0 */
export const oj0j = (v) => (v < 0 ? 0 : lvl1000(v));

// ---------------------------------------------------------------------------------------------
// nw: guild hero

/** void nw.w(int xp): store XP (clamped to the level cap) and level g */
def(nw.prototype, 'w_', function w_(xp) {
	let v = xp;
	if (xp !== 0) v = fg2.q_(xp, 0, nw.q_(V.i2.t1_(26) ? 500 : 21));
	this.f = obf(v, 14072090);
	this.g = nw.h_(v);
});

/** void nw.c(): reset (XP 0, skills to zw.r[].i, empty slots, no pets) */
def(nw.prototype, 'c_', function c_() {
	this.w_(0);
	for (let i = 0; i < this.h.length; i++) this.h[i] = zw.r[i].i;
	for (let i = 0; i < 4; i++) { this.i[i] = null; this.j[i] = 0; this.k[i] = 0; }
	this.l.length = 0;
	this.m.length = 0;
	this.n = 0;
	this.o = 0;
	this.p = null;
});

/** void nw.u(DataInputStream, int version) */
def(nw.prototype, 'u_', function u_(r, ver) {
	this.c_();
	const fl = r.readShort();
	if ((fl & 1) !== 0) {
		let xp = r.readInt();
		if (ver < 18 && xp === 325000) xp = (xp - 1) | 0;
		this.w_(xp);
		const h = this.h;
		const n = ver < 14 ? 12 : ver < 27 ? 17 : h.length;
		for (let i = 0; i < n; i++) h[i] = r.readByte();
		if (ver < 14) r.readInt(); else r.readByte();
		for (let k = 0; k < 4; k++) {
			const b = r.readByte();
			const n2 = b & 127;
			if (n2 > 0) {
				this.i[k] = item(r.readUShort());
				this.j[k] = n2;
				this.k[k] = (b & 128) !== 0 ? 1 : 0;
			}
		}
		r.readInt();
		r.readInt();
	}
	if ((fl & 2) !== 0) {
		const n = r.readUShort();
		for (let i = 0; i < n; i++) this.m.push(r.readUShort());
	}
	const v = r.readInt();
	this.n = 268435455 & v;
	this.o = (v >>> 28) & 15;
	if ((fl & 8) !== 0) this.p = r.g0();
	if ((fl & 4) !== 0) {
		const n = r.readUByte();
		for (let i = 0; i < n; i++) this.l.push(readUw(r, true, ver));
	}
});

// ---------------------------------------------------------------------------------------------
// uw: hired companion / pet

/** new uw(DataInputStream, boolean long, int version) */
export function readUw(r, long, ver) {
	const u = Object.create(uw.prototype);
	u.e = new cw(0, 0, 0, 0, 0);
	u.f = new cw(0, 0, 0, 0, 0);
	u.i = new kh0(14, false);
	u.g = 0; u.h = 0; u.j = 0; u.k = 0; u.l = null; u.m = null;
	const fl = r.readByte();
	const a = zw.c_(r.e0());
	u.a = a;
	u.c = r.readInt();
	u.d = r.readUByte();
	u.b = (fl & 4) !== 0 ? zw.c_(r.e0()) : a;
	u.e.a = r.readUByte();
	u.e.b = r.readUByte();
	u.e.c = r.readUByte();
	u.e.d = r.readUByte();
	u.g = r.readInt();
	r.readInt();
	if ((fl & 1) !== 0) u.h = r.readUByte();
	if ((fl & 2) !== 0) u.m = r.g0();
	if (ver < 27 && a.O_(1024)) u.g |= 1024;
	if (long) {
		u.l_(r.readInt());
		r.readInt();
		const k = r.readByte();
		u.k = k;
		if (k > 0) u.l = item(r.readUShort());
	} else {
		u.l_(u.d === 0 ? 0 : uw.g_((u.d + 1) | 0));
	}
	return u;
}

// ---------------------------------------------------------------------------------------------
// ni0 (building / quest line) bits used by the building loop

/** void p0(): clear the running order */
def(ni0.prototype, 'p0_', function p0_() {
	this.J0 = 0; this.K0 = 0; this.H0 = 0; this.I0 = null; this.L0 = 0; this.M0 = 0; this.Q0 = 0;
});

/** void n0(boolean): pick the current recipe set E[0] (G once step H is done, else F); recurse into C */
def(ni0.prototype, 'n0_', function n0_(z) {
	if (this.F != null) {
		const base = this.D == null ? this : this.D;
		const want = base.h0_(this.H) ? this.G : this.F;
		const e = this.E;
		if (e[0] !== want) {
			e[0] = want;
			if (z) this.p0_();
		}
	}
	if (this.C != null) this.C.n0_(z);
});

/** tj0 D(int): upgrade g[i - 1] */
def(ni0.prototype, 'D_', function D_(i) {
	const g = this.g;
	return g != null && i > 0 && i <= g.length ? g[i - 1] : null;
});

/** mi0 w(int): upgrade i (> 0), else the build step e[B0] */
def(ni0.prototype, 'w_', function w_(i) {
	if (i !== 0) return this.D_(i);
	const e = this.e;
	if (e != null && this.B0 < e.length) return e[this.B0];
	return null;
});

/** mi0 t(): what is being built (D0 present) */
def(ni0.prototype, 't_', function t_() { return this.D0 == null ? null : this.w_(this.G0); });

/** hj0 z(int): recipe with id b */
def(ni0.prototype, 'z_', function z_(id) {
	const e = this.E;
	if (e != null && id !== 0) for (const h of e) if (h.b === id) return h;
	return null;
});

/** jh1.a(): decoded amount */
export const jh1a = (j) => j.c ^ 375066;

/** new bz3(int n): R8-merged class, case 12 = Integer[] of obfuscated amounts */
export function newBz3(n) {
	return { $class: 'bz3', a: 12, b: new Array(n).fill(null) };
}
/** bz3.x(int): decoded amount i */
export const bz3x = (z, i) => (z.b[i] == null ? 0 : unobf(z.b[i], 57228461));

/** int mi0.a(bz3, int[]): build progress in ms-per-1000 terms: a * 1000 * min(delivered, needed) / needed */
export function mi0a(m, z, extra) {
	const t = m.a;
	if (t === 0) return 0;
	let need = 0;
	if (m.b != null) for (const j of m.b) need = (need + jh1a(j)) | 0;
	let got = 0;
	if (z != null) for (let i = 0; i < z.b.length; i++) got = (got + bz3x(z, i)) | 0;
	if (extra != null) for (const x of extra) got = (got + x) | 0;
	if (got > need) got = need;
	if (need === 0) throw new Error('mi0.a: division by zero (ArithmeticException in the game)');
	return Number(BigInt.asIntN(32, (BigInt(t) * 1000n * BigInt(got)) / BigInt(need)));
}

/** new sj0(int a) */
export const newSj0 = (a) => ({ $class: 'sj0', a, b: 0, c: 0 });

export { obf, unobf };

// keep the registry aware of the classes we construct (they come from js/gen)
for (const c of [cq, cj0, nw, uw, ni0, pj0, kj0]) if (!classes[c.javaName || c.name]) throw new Error('save: model class missing ' + c.name);
