// Table classes. Their instances normally come from data/tables.json (revived onto these prototypes),
// so most constructors here only matter for completeness; the methods are what x30 calls at run time.
import { register } from '../registry.js';
import { vj0 } from '../statics.js';
import { wg2 } from './runtime.js';

/** Set Java default values: init(o, 'a b c', 0) */
export function init(o, names, value) {
	for (const n of names.split(' ')) o[n] = value;
}

/** rw: object/critter type (zw.Q / zw.E). */
export class rw {
	/** (IIZZ)V */
	constructor(a, b, V, f) {
		init(this, 'A E F G I J K O Q R S W X c0 e g h i j l m n o p q r s t u', false);
		init(this, 'B C D H L M N P T U Y Z a0 b0 k v w y z', 0);
		this.c = Math.fround(0.9);
		this.d = 1;
		this.x = null;
		this.a = a;
		this.b = b;
		this.V = V;
		this.f = f;
	}

	A_(a, b) { this.M = a; this.N = b; }
	B_(a, b) { this.H = a; this.I = b; }
	C_(a, b, c) { this.D = a; this.h = b; this.E = c; }
	D_(f) { this.c = Math.fround(f); return this; }
	E_() { this.O = true; }
	a_() { this.s = true; }
	b_() { this.r = true; }
	/** void c(int, int): footprint w x h (bytes) */
	c_(w, h) {
		if (w > 0 && h > 0 && (w !== 1 || h !== 1)) {
			this.T = (w << 24) >> 24;
			this.U = (h << 24) >> 24;
		}
	}
	d_() { this.g = true; this.l = true; }
	e_() { this.g = true; this.l = true; this.m = true; }
	f_() { this.F = true; }
	g_() { this.J = true; }
	h_(k) { this.g = true; this.i = true; this.k = k; }
	i_() { this.j = true; }
	j_() { this.K = true; }
	k_(w) { this.w = w; return this; }
	l_(s) { this.x = s; return this; }
	m_(a, b, c) { this.Y = a; this.Z = b; this.a0 = c; return this; }
	n_() { this.g = true; this.n = true; }
	o_(w) { this.g = true; this.n = true; this.w = w; }
	p_(q) { this.g = true; this.p = true; this.q = q; }
	q_() { this.e = true; }
	/** boolean r(): multi-tile object (footprint set) */
	r_() { return this.T !== 0; }
	s_() { return this.l && !this.m; }
	t_() { this.W = true; }
	u_() { this.t = true; }
	v_(w) { this.o_(w); this.o = true; }
	w_() { this.g = true; }
	x_() { this.g = true; this.u = true; }
	y_(v) { this.v = v; return this; }
}

/** cw: stat block (hp, dmg, def, spd, extra). */
export class cw {
	/** (IIIII)V | (IIILcw;)V */
	constructor(a, b, c, d, e) {
		if (d instanceof cw) {
			this.a = (d.a + a) | 0;
			this.b = (d.b + b) | 0;
			this.c = (d.c + c) | 0;
			this.d = d.d;
			this.e = d.e;
		} else {
			this.a = a;
			this.b = b;
			this.c = c;
			this.d = d;
			this.e = e;
		}
	}
}

/** bw extends rw: monster / critter type (zw.R, zw.J). */
export class bw extends rw {
	/** (IIIIIII)V | (IILcw;)V */
	constructor(a, b, c, d, e, f, g) {
		super(a, b, true, false);
		init(this, 'A0 B0 C0 D0 E0 H0 I0 J0 K0 L0 O0 P0 Q0 R0 g0 h0 i0 j0 n0 o0 p0 q0 t0 v0 w0 x0 y0 z0', 0);
		init(this, 'G0 M0 N0 k0 l0 m0', false);
		this.F0 = 0;
		this.e0 = null;
		this.f0 = null;
		this.r0 = -1;
		this.s0 = -1;
		this.u0 = -1;
		this.g = true;
		this.d0 = c instanceof cw ? new cw(c.a, c.b, c.c, c.d, c.e) : new cw(c, d, e, f, g);
	}

	F_(v) { this.q0 |= v; }
	G_(v) { this.v = v; this.l0 = true; this.t = true; }
	H_() { this.v = 30; this.l0 = true; }
	I_(v) { this.w = v; }
	J_(a, b, c) { this.m_(a, b, c); }
	/** int K(): progress-dependent value (quest I0 done ? J0 : H0) */
	K_() {
		const q = this.I0;
		return q !== 0 && vj0.i2.Y0_(q).x_() ? this.J0 : this.H0;
	}
	/** cw L(int tier): stats for the given tier */
	L_(tier) {
		const f = this.f0;
		if (f != null) return f;
		const e = this.e0;
		return e != null && tier > 0 ? e[Math.min(tier, e.length) - 1] : this.d0;
	}
	M_() { this.c = Math.fround(0.55); this.h0 = 30; this.i0 = 80; }
	N_(a, b, c) { this.z0 = a; this.A0 = b; this.B0 = c; }
	/** boolean O(int): flag test on q0 */
	O_(m) { return (this.q0 & m) !== 0; }
	P_(v) { const s = this.d0; s.c = (s.c + v) | 0; if (s.c < 0) wg2.h_('mDef'); }
	Q_(v) { const s = this.d0; s.b = (s.b + v) | 0; if (s.b < 1) wg2.h_('mDmg'); }
	R_(v) { const s = this.d0; s.a = (s.a + v) | 0; if (s.a < 5) wg2.h_('mHp'); }
	S_(v) { const s = this.d0; s.d = (s.d + v) | 0; if (s.d < 2) wg2.h_('mSpd'); }
	T_(a, b, c, d) {
		const s = this.d0;
		s.a = (s.a + a) | 0;
		s.b = (s.b + b) | 0;
		s.c = (s.c + c) | 0;
		s.d = (s.d + d) | 0;
		if (s.a < 5 || s.b < 1 || s.c < 0 || s.d < 2) wg2.h_('mStt');
	}
	U_(v) { this.d0.e = (this.d0.e + v) | 0; }
	V_(a, b) { this.P0 = a; this.Q0 = b; }
	W_() { this.N0 = true; }
	X_() { this.G0 = true; }
	Y_(v) { if (this.o0 === 0) this.p0 = v; }
	Z_(v) { this.v = v; }
	a0_(a, b) { this.x0 = a; this.y0 = b; }
	b0_() { this.q0 |= 1; }
	c0_(a, b, c) { this.r0 = a; this.s0 = b; this.t0 = c; }
	d0_(f) { this.c = Math.fround(f); }
	e0_(a, b) { this.C0 = a; this.D0 = b; }
	f0_(a, b) { this.p0 = a; this.o0 = b; }
	g0_(tier, tiers) {
		this.e0 = new Array(tiers.length - 1).fill(null);
		const base = tiers[tier - 1];
		for (let i = 0; i < this.e0.length;) {
			const n = i + 1;
			const d = this.d0;
			if (n < tier) {
				this.e0[i] = d;
			} else {
				const t = tiers[n];
				this.e0[i] = new cw(
					(d.a + t.a - base.a) | 0, (d.b + t.b - base.b) | 0, (d.c + t.c - base.c) | 0,
					(d.d + t.d - base.d) | 0, (d.e + t.e - base.e) | 0,
				);
			}
			i = n;
		}
	}
	h0_(tiers) { this.g0_(1, tiers); }
}

/** jh1: obfuscated-int pair (a = kind, b, c = value ^ 375066). */
export class jh1 {
	/** (I)V | (II)V | (III)V */
	constructor(x, y, z) {
		if (arguments.length === 1) { this.a = 6; this.b = 2; this.c = x; }
		else if (arguments.length === 2) { this.a = 4; this.b = x; this.c = 375066 ^ y; }
		else { this.a = x; this.b = y; this.c = z; }
	}

	/** int a() */
	a_() { return this.c ^ 375066; }
}

/** vw extends jh1 */
export class vw extends jh1 {
	constructor(a, b) {
		super(a, b);
		this.e = 0;
		this.f = 0;
	}

	/** int b(boolean) */
	b_(z) {
		const v = this.a_();
		if (z && this.e > 0) return Math.max((v - this.e) | 0, 0);
		return v;
	}
}

/** jw: (a = id, b = count, c = flag) */
export class jw {
	/** ()V | (I)V | (II)V | (IIZ)V | (IZ)V */
	constructor(a, b, c) {
		if (arguments.length === 0) { this.a = 621; this.b = 1; this.c = true; return; }
		this.a = a;
		this.b = 0;
		this.c = false;
		if (arguments.length === 2) {
			if (typeof b === 'boolean') this.c = b; else this.b = b;
		} else if (arguments.length === 3) {
			this.b = b;
			this.c = c;
		}
	}
}

/** zv */
export class zv {
	/** ()V | (I)V | (II)V | (IIII)V */
	constructor(a, b, c, d) {
		this.a = 0; this.b = 0; this.c = 0;
		if (arguments.length === 1) this.a = a;
		else if (arguments.length === 2) { this.a = a; this.b = b; this.c = b; }
		else if (arguments.length === 4) {
			this.a = a; this.b = b;
			this.c = d === 6 ? c : Math.trunc(c * 1.5);
		}
	}
}

/** dw: loot table entry (a = weight, b = item, c = min level, d = alt item, e = max level, f = quest). */
export class dw {
	/** (II)V | (III)V | (IIII)V */
	constructor(a, b, c, d) {
		this.a = a;
		this.b = b;
		this.c = c === undefined ? 0 : c;
		this.d = d === undefined ? -1 : d;
		this.e = -1;
		this.f = 0;
	}
}

/** xv: cell-type base */
export class xv {
	constructor() {
		init(this, 'a b c d e f g h', 0);
		this.i = false;
	}
}

/** xw extends xv: cell type (zw.u[ww.a]); booleans j..s are walkability/flood flags. */
export class xw extends xv {
	/** (IIZZZ)V */
	constructor(a, b, j, k, l) {
		super();
		this.c = -1; this.d = -1; this.e = -1; this.f = -1; this.g = -1; this.h = -1;
		this.j = j; this.k = k; this.l = l;
		init(this, 'm n o p q r s', false);
		this.t = null;
		this.u = 0;
		this.v = 0;
		this.a = a;
		this.b = b;
	}

	d_(u, v, t) { this.u = u; this.v = v; this.t = t; }
	e_() { this.e = 3075; this.f = 3076; }
	f_() { this.s = true; }
}

/** tw: (a enabled, b flag bit, c min level, d min rank) */
export class tw {
	constructor() {
		this.a = false; this.b = 0; this.c = 0; this.d = 0;
	}
}

/** ow, kw, lw, yv: data-only table classes. */
export class ow {}
export class kw {}
export class lw {}
export class yv {}

/** gw: hw.v slot (allied summon). */
export class gw {
	constructor() {
		this.a = null; this.b = 0; this.c = null; this.d = null; this.e = 0;
		this.f = false; this.g = false; this.h = false;
	}
}

/** pw: dungeon type config (zw.M[type], zw.N). */
export class pw {
	/** (IIIIIII)V */
	constructor(a, b, c, d, g, e, r) {
		init(this, 'A D M N O Q R f i j k l m n o p q s x', 0);
		init(this, 'C E F G H J K L h w', false);
		init(this, 'B I P S t u v', null);
		this.y = 148;
		this.z = 264;
		this.M = -1;
		this.N = -1;
		this.a = a; this.b = b; this.c = c; this.d = d; this.g = g; this.e = e;
		if (r < 5) wg2.h_('invalid door ep');
		this.r = r;
	}

	a_(x, y, z) { this.x = x; this.y = y; this.z = z; }
	b_() { this.H = true; }
	c_(a, z) { this.B = new jw(a, z); }
	d_(w, t) { this.w = w; this.t = t; }
	e_(m, n) { this.m = m; this.n = n; }
	f_(q, r) { this.Q = q; this.R = r; }
	g_() { this.C = true; }
	h_(i, j, k, l) { this.i = i; this.j = j; this.k = k; this.l = l; }
	i_() { this.h = true; }
	j_(arr, o) { this.O = o; this.P = new y83(arr); }
	k_(k) { this.J = true; this.K = k; }
	l_(o, p, q) { this.o = o; this.p = p; this.q = q; }
}

/**
 * y83 (case 8 of an R8-merged class): weighted pairs [w0, v0, w1, v1, ...]; b = total weight.
 */
export class y83 {
	/** ([I)V */
	constructor(arr) {
		this.a = 8;
		this.b = 0;
		if ((arr.length & 1) !== 0) wg2.h_('PrbPairs: odd size');
		this.c = arr;
		for (let i = 0; i < arr.length; i += 2) {
			const w = arr[i];
			if (w <= 0) wg2.h_('PrbPairs: bad prbW');
			this.b = (this.b + w) | 0;
		}
	}

	/** int b(e01): weighted pick (no RNG draw for a single pair) */
	b_(rng) {
		const v = this.c;
		if (v.length === 2) return v[1];
		let r = rng.h_(this.b);
		let i = 0;
		for (; i < v.length - 2; i += 2) {
			const w = v[i];
			if (r < w) return v[i + 1];
			r = (r - w) | 0;
		}
		return v[i + 1];
	}
}

/** t30: weighted choice tree / room template. */
export class t30 {
	/** (II)V | (IIZ[I)V | (IZ[I)V | (I[Lt30;)V */
	constructor(x, y, z, w) {
		init(this, 'a b c h i j k m n o p q u', 0);
		init(this, 'd e f g w x', false);
		this.l = 2147483647;
		this.r = null; this.s = null; this.t = null; this.v = null; this.y = null;
		if (typeof y === 'boolean') { // (IZ[I)V
			this.a = x; this.g = y; this.r = new y83(z);
		} else if (Array.isArray(y)) { // (I[Lt30;)V
			this.b = x; this.s = y;
		} else if (typeof z === 'boolean') { // (IIZ[I)V
			this.i = x; this.a = y; this.g = z; this.r = new y83(w);
		} else { // (II)V
			this.c = x; this.i = y;
		}
	}

	a_() { this.f = true; }

	/** t30 b(e01): weighted pick of a child (b = weight of "none"); null when "none" is drawn */
	b_(rng) {
		const s = this.s;
		if (s == null) return null;
		const none = this.b;
		let total = none;
		for (let i = 0; i < s.length; i++) total = (total + s[i].c) | 0;
		let r = rng.h_(total);
		if (none > 0) {
			if (r < none) return null;
			r = (r - none) | 0;
		}
		let i = 0;
		for (; i < s.length - 1; i++) {
			const t = s[i];
			if (r < t.c) return t;
			r = (r - t.c) | 0;
		}
		return s[i];
	}

	c_() { this.e = true; }
	d_() { this.d = true; }
}

/** q30: room feature entry (table data). */
export class q30 {
	/** (IIB)V | (IIBB)V | (IIBBII)V */
	constructor(a, b, c, d = 0, e = 0, f = 0) {
		this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
	}
}

/** o30: room door/feature slot with unlock conditions. */
export class o30 {
	/** (III)V | (IIIZ)V | (ZIIII)V */
	constructor(x, y, z, w, v) {
		init(this, 'e f g h', 0);
		this.i = -1;
		this.j = false;
		this.k = -1;
		if (typeof x === 'boolean') {
			this.a = y; this.b = z; this.c = w; this.d = x; this.e = v;
		} else {
			this.a = x; this.b = y; this.c = z; this.d = w === undefined ? false : w;
		}
	}

	a_(k, v) { this.k = k; this.e = (k << 7) | 16384 | v; }
	b_(k, v) { this.k = k; this.e = (k << 7) | 16384 | v | 64; }
	c_() { this.j = true; }

	/** boolean d(): unlock conditions met for the current player */
	d_() {
		let v = this.f;
		if (v === 0 || vj0.i2.o[22].h0_(v)) {
			v = this.g;
			if (v === 0 || vj0.i2.Y0_(v).v_()) {
				v = this.h;
				if (v === 0 || vj0.i2.Y0_(v).q_()) {
					v = this.i;
					if (v === -1 || vj0.i2.m[v].i >= 1) return true;
				}
			}
		}
		return false;
	}
}

/** p30: special-room template (x30.c0). */
export class p30 {
	/** (IIIIIII[Lo30;)V */
	constructor(a, b, c, d, e, f, g, i) {
		this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f; this.g = g;
		this.h = null;
		this.i = i;
		this.j = null; this.k = null;
		this.l = false;
		this.m = 0;
		this.n = -1;
		this.o = 0; this.p = 0;
		init(this, 'q r s t u', false);
		this.v = null;
		this.w = 0;
	}

	a_() { this.q = true; }

	/** boolean b(): template unlocked for the current player */
	b_() {
		let v = this.m;
		if (v === 0 || vj0.i2.o[22].h0_(v)) {
			v = this.n;
			if (v === -1 || vj0.i2.t1_(v)) {
				v = this.o;
				if (v === 0 || vj0.i2.Y0_(v).v_()) {
					v = this.p;
					if (v === 0 || vj0.i2.Y0_(v).q_()) return true;
				}
			}
		}
		return false;
	}

	c_() { this.u = true; }
	d_() { this.s = true; }
	e_() { this.r = true; }
	f_(t) { this.v = t; this.w = 10003; }
	g_() { this.l = true; }
}

/** w30: room-type config (x30.P). */
export class w30 {
	/** (II)V */
	constructor(a, e) {
		init(this, 'b c d f g h', 0);
		init(this, 'i j k l m n', false);
		this.o = null;
		this.p = null;
		this.a = a;
		this.e = e;
	}

	a_() { this.k = true; }
	b_() { this.n = true; }
	c_() { this.j = true; }
	d_(c, d) { this.c = c; this.d = d; }
	e_(...v) { this.o = new y83(v); }
	f_(...v) { this.p = new y83(v); }
}

/** s30: dungeon size config (x30.O). */
export class s30 {
	/** (IIIIII)V */
	constructor(a, b, c, d, e, f) {
		this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
		this.g = 1000;
		this.h = false;
		init(this, 'i j k l m r s', 0);
		this.n = false;
		this.o = 3; this.p = 2; this.q = 2; this.t = 4;
	}

	a_(p, q, r, s) { this.p = p; this.q = q; this.r = r; this.s = s; }
	b_(i, j) { this.h = true; this.i = i; this.j = j; this.k = 11; this.l = 13; this.m = 17; }
	c_() { this.n = true; }
}

/**
 * kh0 (case 14 of an R8-merged class): an int stored obfuscated as a boxed Integer in b
 * (null = 0). Encode: x ^= 57228461, then swap nibbles within each byte.
 */
export class kh0 {
	/** (IZ)V */
	constructor(a, _z) {
		this.a = a;
		this.b = null;
	}

	/** int v(): decoded value */
	v_() {
		const b = this.b;
		if (b == null) return 0;
		return (((b & 252645135) << 4) | ((b & -252645136) >>> 4)) ^ 57228461;
	}

	/** void z(int): store encoded */
	z_(v) {
		v ^= 57228461;
		this.b = ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
	}
}

/**
 * s8 (case 13 of an R8-merged class): loot table. b = dw[] (normal), c = dw[] (pw.E variant),
 * d = dw[] (pw.F variant). x30 calls it as an instance: zw.C.u_(hw.w, hw.b, pw).
 */
export class s8 {
	/** int u(e01, int level, pw): weighted loot roll on rng; 0 = nothing */
	u_(rng, lvl, cfg) {
		let t;
		if (!((cfg.F && (t = this.d) != null) || (cfg.E && (t = this.c) != null))) t = this.b;
		let total = 0;
		for (let i = 0; i < t.length; i++) {
			const e = t[i];
			const hi = e.e;
			if ((hi === -1 || lvl <= hi) && (e.d !== -1 || (lvl >= e.c && (e.f === 0 || vj0.i2.Y0_(e.f).q_())))) {
				total = (total + e.a) | 0;
			}
		}
		if (total !== 0) {
			let r = rng.h_(total);
			for (let i = 0; i < t.length; i++) {
				const e = t[i];
				const hi = e.e;
				const alt = e.d;
				if (hi === -1 || lvl <= hi) {
					const ok = lvl >= e.c && (e.f === 0 || vj0.i2.Y0_(e.f).q_());
					if (ok || alt !== -1) {
						const w = e.a;
						if (r < w) return ok ? e.b : alt;
						r = (r - w) | 0;
					}
				}
			}
		}
		return 0;
	}
}

register(rw, cw, bw, jh1, vw, jw, zv, dw, xv, xw, tw, ow, kw, lw, yv, gw, pw, y83, t30, q30, o30, p30, w30, s30, kh0, s8);
