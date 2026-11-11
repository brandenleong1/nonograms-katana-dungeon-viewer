// Level model: iw/hw (level), qw/aw/mw (objects, critters, hero), nw (guild hero), uw (hired
// companion), ww (cell), u30 (room), plus the zw static helpers x30 calls.
// Source: decompiled/vineflower/{iw,hw,qw,aw,mw,nw,uw,ww,u30,zw}.java, checked against JADX and smali.
import { register } from '../registry.js';
import { imul, idiv, f32, f2i, s16, b8, at, removeObj } from '../jrt.js';
import { e01 } from '../rng.js';
import { zw, vj0 } from '../statics.js';
import { fg2, lz0, mh2, wg2 } from './runtime.js';
import { Util$Point } from './geom.js';
import { cw, kh0 } from './tables.js';
import { cq } from './progress-bits.js';

// ---------------------------------------------------------------------------------------------
// ww: one grid cell. a = cell type (index into zw.u), b = type-specific bits.

export class ww {
	constructor() {
		this.a = 0;
		this.b = 0;
	}

	/** void A(byte): set type, clear bits */
	A_(a) { this.a = a; this.b = 0; }
	/** void B(byte, byte) */
	B_(a, b) { this.a = a; this.b = b; }
	/** void a(): normalise bits for types 2 and 7 */
	a_() {
		if (this.a === 2 && !fg2.W_(this.b, 0, 9)) {
			this.b = 0;
		} else if (this.a === 7) {
			this.b = b8(this.b & -32);
		}
	}
	/** int b() */
	b_() {
		if (this.a === 1) {
			const b = this.b;
			if ((b & 31) !== 12) return b & 96;
		}
		return 0;
	}
	c_() {
		if (this.a === 1) {
			const b = this.b;
			if (b === 2 || b === 11 || b === 18 || b === 19) return true;
		}
		return false;
	}
	d_() { return this.a === 1 && (this.b & 31) === 1; }
	e_() { return this.d_() || this.a === 3; }
	f_() { return this.a === 1 && this.b === 1; }
	g_() { return this.a === 1; }
	h_() { return this.a === 1 && this.b === 0; }
	i_() { const a = this.a; return (a === 1 && this.b === 0) || a === 2; }
	j_() { const a = this.a; return a === 1 || a === 3 || a === 5; }
	k_() { const a = this.a; return a === 1 || a === 4; }
	l_() { const a = this.a; return a === 1 || a === 4 || a === 0; }
	m_() {
		const a = this.a;
		if (a === 2 || a === 7) {
			if (a === 2) {
				const b = this.b;
				if (b === 0 || b === 7 || b === 5 || b === 11 || b === 9 || b === 24 || b === 2 || b === 13 || b === 14 || b === 15) return true;
			}
			if (a !== 7 || (this.b & 31) !== 0) return false;
		}
		return true;
	}
	n_() { return this.a === 1 && (this.b & 63) === 44; }
	o_(z) { return this.a === 1 && fg2.W_(this.b & 31, 18, 19) && (z || (this.b & -128) === 0); }
	p_() {
		if (this.a !== 1 || !fg2.W_(this.b & 31, 18, 19) || (this.b & -128) !== 0) {
			const a = this.a;
			if ((a !== 9 || (this.b & 16) === 0) && (a !== 5 || (this.b & 15) !== 5)) return false;
		}
		return true;
	}
	q_() { return this.a === 7 && this.b === 32; }
	r_(a, b) { return this.a === a && this.b === b; }
	s_(a, mask, v) { return this.a === a && (this.b & mask) === v; }
	t_() { const a = this.a; return (a === 2 && (this.b & 31) === 16) || (a === 7 && (this.b & 31) === 16); }
	u_() {
		if (this.a === 1) {
			const b = this.b;
			if ((b & 31) !== 12 && (b & 96) !== 0) return true;
		}
		return false;
	}
	v_() { return this.a === 2 && this.b === 0; }
	w_() { const a = this.a; return a === 2 || a === 5 || (a === 3 && (this.b & 24) !== 8); }
	x_() { const a = this.a; return a === 2 || a === 3 || a === 5; }
	y_() { return (this.a === 2 && fg2.a0_(this.b, 0, 7, 5, 11, 9, 24)) || (this.a === 7 && (this.b & 31) === 0); }
	z_() { const a = this.a; return a === 2 || a === 7 || a === 0; }
}

// ---------------------------------------------------------------------------------------------
// u30: room. a, b = position, c, d = size, e = template id; the rest is generator bookkeeping.

export class u30 {
	/** (IIIII)V */
	constructor(a, b, c, d, e) {
		this.A = 0; this.B = 0; this.C = 0;
		this.D = null; this.E = null;
		this.F = 0;
		this.G = null;
		this.H = null;
		this.a = a; this.b = b; this.c = c; this.d = d; this.e = e;
		this.f = false; this.g = false; this.h = false; this.i = false; this.j = false; this.k = false;
		this.l = false; this.m = false; this.n = false; this.o = false; this.p = false; this.q = false;
		this.r = false; this.s = false; this.t = false; this.u = false;
		this.v = 0; this.w = 0; this.x = 0; this.y = 0; this.z = 0;
	}

	/** boolean a(boolean) */
	a_(z) { return this.A === 1 && this.z === 1 && (z || this.B !== 0); }
	/** boolean b() */
	b_() { return fg2.W_(this.w, 1, 4) && this.v !== 13 && (this.c >= 9 || this.d >= 9); }
	/** boolean c(boolean) */
	c_(z) { return !this.g && !this.f && this.a_(z); }
}

// ---------------------------------------------------------------------------------------------
// qw: placed object. a = rw type, b = position, c = flipped/rotated, g = loot (0 none, -1 empty).

export class qw {
	/** (Lrw;)V */
	constructor(type) {
		this.a = type;
		this.b = new Util$Point();
		this.c = false;
		this.d = false;
		this.e = false;
		this.f = false;
		this.g = 0;
		this.h = 0;
	}

	/** void a(int, int): c = either coordinate negative */
	a_(x, y) { this.c = !(x >= 0 && y >= 0); }

	/** int b(): loot id */
	b_() {
		if (!this.e) {
			const g = this.g;
			if (g !== -1) {
				if (g !== 0) return g;
				return this.a.w;
			}
		}
		return 0;
	}

	/** rw c(hw) */
	c_(_hw) { return this.a; }

	/** void d(hw): on placement, roll loot from the type's loot table on hw.w */
	d_(level) {
		const t = this.a.x;
		if (t != null) this.g = t.u_(level.w, level.b, level.c);
	}

	/** boolean e(): is a critter */
	e_() { return false; }

	/** boolean f(hw): counts as an objective */
	f_(level) {
		const t = this.a;
		if (level.c.E) return t.a === 53;
		return (t.t && (!t.n || !this.e)) || (t.a === 32 && this.h === 1201 && !this.e);
	}

	/** void h() */
	h_() { this.f = true; }

	/** int i(nw) */
	i_(hero) {
		if (this.f) return 0;
		const t = this.a;
		let v = t.v;
		if (t.a === 30) v = Math.max((v - zw.a[hero.h[4]]) | 0, 1);
		return v;
	}
}

// ---------------------------------------------------------------------------------------------
// aw extends qw: critter. i = stats (cw), j = HP (kh0), k = group, p = flags.

export class aw extends qw {
	/** (Liw;Lbw;)V */
	constructor(level, type) {
		super(type);
		this.j = new kh0(14, false);
		this.k = 0;
		this.l = null;
		this.m = false;
		this.n = new kh0(14, false);
		this.o = 0; this.p = 0; this.q = 0; this.r = 0; this.s = 0; this.t = 0;
		this.u = 0; this.v = 0; this.w = 0; this.x = 0;
		this.i = type.L_(level.c.N);
	}

	A_(v) { this.j.z_(v); }
	B_(v) { this.n.z_(v); }

	/** rw c(hw) */
	c_(level) {
		if (this.s_(128)) {
			const d = level.d;
			if (d != null) return d;
		}
		return this.a;
	}

	/** void d(hw): loot roll, then HP = max HP and copy two bw fields */
	d_(level) {
		super.d_(level);
		this.A_(this.q_());
		const t = this.a;
		this.w = t.o0;
		this.x = t.D0;
	}

	e_() { return true; }
	f_(_level) { return this.a.t; }

	h_() {
		this.f = true;
		this.y_(12288);
		this.v = 0;
	}

	i_(hero) {
		let v;
		if (this.a.m0 && !this.s_(16384)) v = 100000;
		else v = super.i_(hero);
		let r = v;
		if (v === 0 && this.s_(8192)) r = 2;
		if (r > 0) {
			v = this.v;
			if (v > 0) return Math.max((r - v) | 0, 1);
		}
		return r;
	}

	k_(v, z1, z2) {
		let a = v;
		if (this.s_(256)) a = (v + 1) | 0;
		let b = a;
		if (this.s_(128)) b = (a + 2) | 0;
		let c = b;
		if (this.s_(514)) c = (b + 4) | 0;
		let d = c;
		if (this.s_(4)) d = (c + 1) | 0;
		let e = d;
		if (z2) e = Math.min(d, Math.max((d - 2) | 0, 10));
		if (this.r > 0) return idiv(imul(Math.max(100 - (z1 ? 40 : 60), 0), e), 100);
		return e;
	}

	l_(v) {
		let a = v;
		if (this.s_(256)) a = (v + 1) | 0;
		let b = a;
		if (this.s_(128)) b = (a + 2) | 0;
		let c = b;
		if (this.s_(1)) c = idiv(imul(b, 140), 100);
		return c;
	}

	m_() { return this.a; }
	n_(z) { return this.k_(this.i.c, false, z); }
	o_() { return this.l_(this.i.b); }
	p_() { return this.j.v_(); }
	/** int q(): max HP */
	q_() { return this.i.a; }
	r_() {
		const d = this.i.d;
		return this.s_(1) ? (d + 2) | 0 : d;
	}
	/** boolean s(int): flag test on p */
	s_(m) { return (this.p & m) !== 0; }
	t_() { return this.a.O_(256); }
	u_() { return this.j.v_() <= 0; }
	/** boolean v(): summon types 195..197 */
	v_() { const a = this.a.a; return a >= 195 && a < 198; }
	/** boolean w(): companion types 190..193 */
	w_() { const a = this.a.a; return a >= 190 && a < 194; }
	x_(v) { this.v = Math.min((this.v + v) | 0, 255); }
	y_(m) { this.p &= ~m; }
	/** void z(int): set flags */
	z_(m) { this.p |= m; }
}

// ---------------------------------------------------------------------------------------------
// mw extends aw: the hero avatar in the dungeon. y = guild hero (nw); A, B obfuscated ints.

const MW_KEY = 14072090;

export class mw extends aw {
	/** (Liw;)V: type is the guild hero's bw (nw.e) */
	constructor(level) {
		super(level, level.e.e);
		this.z = new kh0(14, false);
		this.A = 0;
		this.B = 0;
		this.C = new kh0(14, false);
		const inv = new cq(false);
		inv.c = [];
		inv.b = true;
		this.D = inv;
		this.E = 0;
		this.F = [];
		this.y = level.e;
		this.G_(0);
		this.F_(0);
	}

	C_() {
		const b = this.B;
		const v = (((b & 252645135) << 4) | ((b & -252645136) >>> 4)) ^ MW_KEY;
		return v >= 0 && v <= 100000 ? v : 0;
	}

	/** int D(): max MP */
	D_() {
		const v = this.y.l_();
		return this.s_(256) ? (v + 10) | 0 : v;
	}

	E_() {
		const a = this.A;
		const v = (((a & -252645136) >>> 4) | ((a & 252645135) << 4)) ^ MW_KEY;
		return v >= 0 && v <= this.y.n_() ? v : 0;
	}

	F_(v) {
		v ^= MW_KEY;
		this.B = ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
	}

	G_(v) {
		v ^= MW_KEY;
		this.A = ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
	}

	d_(level) {
		super.d_(level);
		this.z.z_(this.D_());
	}

	n_(z) { return this.k_(this.y.e_(), true, z); }

	o_() {
		const v = this.y.f_();
		return this.l_(this.E > 0 ? (v + 1) | 0 : v);
	}

	/** int q(): max HP */
	q_() {
		const v = this.y.m_();
		return this.s_(256) ? (v + 10) | 0 : v;
	}

	r_() {
		const v = this.y.p_();
		return this.s_(1) ? (v + 2) | 0 : v;
	}

	t_() {
		const it = this.y.i[2];
		return it != null && fg2.W_(it.a, 188, 255);
	}
}

// ---------------------------------------------------------------------------------------------
// nw: guild hero (vj0.i2.l[]). Only the stat getters the dungeon hero needs.

export class nw {
	/** int g(): decoded XP */
	g_() {
		const f = this.f;
		return (((f & 252645135) << 4) | ((f & -252645136) >>> 4)) ^ MW_KEY;
	}

	/** int i(boolean): level, capped at 26 when z */
	i_(z) {
		const g = this.g;
		return z ? Math.min(g, 26) : g;
	}

	/** int e(): defence */
	e_() {
		let v = (imul(this.h[9], zw.r[9].f) + this.e.d0.c) | 0;
		const it = this.i;
		if (it[1] != null) v = (v + it[1].g0) | 0;
		if (it[2] != null) v = (v + it[2].g0) | 0;
		return this.k[2] !== 0 ? (v + 1) | 0 : v;
	}

	/** int f(): damage */
	f_() {
		let v = (imul(this.h[8], zw.r[8].f) + this.e.d0.b) | 0;
		const it = this.i;
		if (it[0] != null) v = (v + it[0].g0) | 0;
		if (it[3] != null) v = (v + it[3].g0) | 0;
		if (it[1] != null && fg2.W_(it[1].a, 216, 254)) v = (v + 1) | 0;
		return this.k[0] !== 0 ? (v + 1) | 0 : v;
	}

	/** int l(): max MP */
	l_() {
		const base = (this.e.h0 + this.i_(true)) | 0;
		let v = (base - 1) | 0;
		const it = this.i;
		if (it[1] != null && fg2.W_(it[1].a, 216, 254)) v = (base + 9) | 0;
		if (it[3] != null && it[3].a === 119) v = (v + 5) | 0;
		if (it[0] != null && it[0].a === 253) v = (v + 5) | 0;
		return this.k[3] !== 0 ? (v + 5) | 0 : v;
	}

	/** int m(): max HP */
	m_() {
		const lvl = this.i_(true);
		const base = (this.e.d0.a + lvl) | 0;
		let v = (base - 1) | 0;
		const st = vj0.i2;
		if (st.t1_(29)) v = (base + 4) | 0;
		const it = this.i[1];
		if (it != null && it.a === 254) v = (v + 5) | 0;
		if (this.k[1] !== 0) v = (v + 5) | 0;
		if (lvl >= 21) {
			const m = st.j[4];
			const q = m.q;
			if (q > 0) return (imul(q, m.h) + v) | 0;
		}
		return v;
	}

	/** int n(): max XP-ish cap used by mw.E */
	n_() {
		const lvl = this.i_(true);
		let v = (imul(lvl - 1, 10) + this.e.i0) | 0;
		if (lvl === 26) {
			const extra = (Math.min(this.g, 50) - 26) | 0;
			if (extra > 0) v = (v + imul(extra, 5)) | 0;
		}
		const st = vj0.i2;
		if (st.t1_(25)) v = (v + 120) | 0;
		v = (v + st.Y0) | 0;
		if (lvl >= 21) {
			const m = st.j[5];
			const q = m.q;
			if (q > 0) return (imul(q, m.h) + v) | 0;
		}
		return v;
	}

	/** int p(): speed */
	p_() {
		return (imul(this.h[11], zw.r[11].f) + this.e.d0.d) | 0;
	}

	/** static int h(int xp): level for xp */
	static h_(xp) {
		if (xp <= 0) return 1;
		const s = f2i(Math.sqrt(mh2.f_(xp, 1000, 8, 1)) / 2.0 + 0.5);
		if (xp < nw.q_(s)) return (s - 1) | 0;
		const s1 = (s + 1) | 0;
		return xp >= nw.q_(s1) ? s1 : s;
	}

	/** static int q(int lvl): xp needed for lvl */
	static q_(lvl) {
		return imul(idiv(imul((lvl - 1) | 0, lvl), 2), 1000);
	}
}

// ---------------------------------------------------------------------------------------------
// uw: hired companion. The constructor rolls its stats and perks on its own e01(seed).

export class uw {
	/** (III)V: (bw id, seed, rank) */
	constructor(id, seed, rank) {
		const e = new cw(0, 0, 0, 0, 0);
		this.e = e;
		this.f = new cw(0, 0, 0, 0, 0);
		this.i = new kh0(14, false);
		const b = zw.c_(id);
		this.b = b;
		this.a = b;
		this.c = seed;
		this.d = rank;
		this.g = 0;
		this.h = 0;
		this.j = 0;
		this.k = 0;
		this.l = null;
		this.m = null;

		const r = new e01(seed);
		r.g_();
		const pick1 = r.h_(3);
		const pick2 = r.h_(3);
		const H = zw.H, I = zw.I;
		let loA = H.a, hiA = I.a, loB = H.b, hiB = I.b, loC = H.c, hiC = I.c;
		if (b.l0 || b.G0 || rank >= 3) {
			if (pick1 === 0) loA = idiv((loA + hiA) | 0, 2);
			else if (pick1 === 1) loB = idiv((loB + hiB) | 0, 2);
			else loC = idiv((loC + hiC) | 0, 2);
			if (pick2 === 0) hiA = (idiv(imul((hiA - loA) | 0, 80), 100) + loA) | 0;
			else if (pick2 === 1) hiB = (idiv(imul((hiB - loB) | 0, 80), 100) + loB) | 0;
			else hiC = (idiv(imul((hiC - loC) | 0, 80), 100) + loC) | 0;
		} else if (pick2 === 0) {
			hiA = idiv((hiA + loA) | 0, 2);
		} else if (pick2 === 1) {
			hiB = idiv((hiB + loB) | 0, 2);
		} else {
			hiC = idiv((hiC + loC) | 0, 2);
		}
		e.a = r.i_(loA, hiA);
		e.b = r.i_(loB, hiB);
		e.c = r.i_(loC, hiC);
		const sp = r.h_(100);
		e.d = sp >= 35 ? (sp < 75 ? 4 : 5) : 3;
		r.g_();

		this.g = 0;
		const bits = zw.j;
		for (let k = 0; k < 10; k++) {
			const m = bits[k];
			if (b.O_(m) && r.h_(100) < 75) this.g |= m;
		}
		if (b.O_(1024)) this.g |= 1024;
		let tier = 131072;
		if (b.o0 > 0 && r.h_(100) < 75) {
			if (b.p0 === 191) this.g |= 458752;
			else if (b.l0) this.g |= 196608;
			else {
				const x = r.h_(100);
				this.g |= x < 20 ? 65536 : x < 75 ? 131072 : 196608;
			}
		}
		if (r.h_(100) < 30) this.g |= 1;
		if (r.h_(100) < 22) this.g |= 1048576;
		const h5 = r.h_(100);
		if (h5 < 20) this.g |= h5 < 10 ? 128 : 256;
		if ((this.g & 458752) === 0 && r.h_(100) < 25) {
			if (r.h_(100) < 10) {
				this.g |= 458752;
			} else {
				const x = r.h_(100);
				const g = this.g;
				if (x < 20) tier = 65536;
				else if (x >= 75) tier = 196608;
				this.g = g | tier;
			}
		}
		let mask = 62;
		if ((this.g & 62) !== 0) {
			// keep only one of the set bits in 62 (chosen uniformly)
			let count = 0;
			let bit = 0;
			let rest = 62;
			while (rest !== 0) {
				const m = 1 << bit;
				if ((rest & m) !== 0) {
					if ((this.g & m) !== 0) count++;
					rest &= ~m;
				}
				bit++;
			}
			if (count > 1) {
				const keep = r.h_(count);
				let n = 0;
				bit = 0;
				while (mask !== 0) {
					const m = 1 << bit;
					if ((mask & m) !== 0) {
						const g = this.g;
						if ((g & m) !== 0) {
							if (n !== keep) this.g = g & ~m;
							n++;
						}
						mask &= ~m;
					}
					bit++;
				}
			}
		} else if (r.h_(100) < 20) {
			this.g = zw.k.b_(r) | this.g;
		}
		if ((this.g & 2560) === 0 && fg2.s_(zw.L[10], b.a) && r.h_(100) < 20) {
			this.g = zw.l.b_(r) | this.g;
		}
		for (const t of zw.m) {
			if (rank < t.c) this.g = ~t.b & this.g;
		}
		const d = this.d;
		this.l_(d === 0 ? 0 : uw.g_((d + 1) | 0));
	}

	/** int a(int): add xp, return levels gained */
	a_(v) {
		if (v <= 0) return 0;
		const k = this.i;
		const before = k.v_();
		this.l_((v + before) | 0);
		return (k.v_() - before) | 0;
	}

	/** int b(int, int): interpolate a stat by level j */
	b_(lo, hi) {
		const a = idiv((imul((hi - lo) | 0, 200) + imul(lo, 1000) + 333) | 0, 1000);
		return (idiv((idiv(imul(imul((this.j - 1) | 0, (hi - a) | 0), 1000), 20) + 333) | 0, 1000) + a) | 0;
	}

	/** void c() */
	c_() {
		const v = (this.k - 1) | 0;
		this.k = v;
		if (v <= 0) {
			this.l = null;
			this.k = 0;
		}
	}

	/** int e(boolean): max xp for the rank */
	e_(z) {
		if (z) {
			for (let i = 0; i < 3; i++) {
				if ((this.h & (1 << i)) === 0) return zw.c[i];
			}
		}
		return zw.c[this.d];
	}

	/** int f(boolean) */
	f_(z) {
		if (!z || this.j >= zw.k_(458752)) {
			const t = this.g & 458752;
			if (t !== 0) {
				if (t === 131072) return 3;
				if (t === 196608) return 5;
				return 1;
			}
		}
		return 0;
	}

	/** boolean h(int, boolean) */
	h_(m, z) {
		return (!z || this.j >= zw.k_(m)) && (this.g & m) !== 0;
	}

	/** void j(boolean): compute current stats f from base e and level j */
	j_(z) {
		const G = zw.G;
		const base = this.e;
		const a = this.b_(G.a, base.a);
		const out = this.f;
		out.a = a;
		let bonus;
		const k = this.k;
		const it = this.l;
		if (k <= 0) bonus = 0;
		else if (fg2.W_(it.a, 236, 251)) bonus = 5;
		else if (it.a === 252) bonus = 10;
		else bonus = 0;
		out.a = (bonus + a) | 0;
		if (z) return;
		out.b = this.b_(G.b, base.b);
		out.c = this.b_(G.c, base.c);
		out.d = this.b_(G.d, base.d);
	}

	/** void l(int xp) */
	l_(v) {
		if (v !== 0) v = fg2.q_(v, 0, uw.g_(this.e_(true)));
		this.i.z_(v);
		this.j = uw.d_(v);
	}

	/** static int d(int xp): level for xp */
	static d_(xp) {
		if (xp <= 0) return 1;
		const s = f2i(Math.sqrt(mh2.f_(xp, 300, 8, 1)) / 2.0 + 0.5);
		if (xp < uw.g_(s)) return (s - 1) | 0;
		const s1 = (s + 1) | 0;
		return xp >= uw.g_(s1) ? s1 : s;
	}

	/** static int g(int lvl): xp needed for lvl */
	static g_(lvl) {
		return imul(idiv(imul((lvl - 1) | 0, lvl), 2), 300);
	}

	/** static boolean i(int, bj0) */
	static i_(v, item) {
		return v > 0 && fg2.X_(item.a, 236, 251, 252);
	}
}

// ---------------------------------------------------------------------------------------------
// iw / hw: the level.

export class iw {
	/** ()V | (ILnw;)V */
	constructor(type, hero) {
		this.a = 0;
		this.b = 0;
		this.c = null;
		this.d = null;
		this.e = null;
		this.f = null;
		if (arguments.length >= 2) {
			this.e = hero;
			this.b = type;
			this.e_();
		}
	}

	a_() { return null; }
	b_() { return null; }
	c_() { return false; }

	/** void e(): resolve c = dungeon config (zw.M[b], or zw.N for the citadel) and d = its boss bw */
	e_() {
		const t = this.b;
		const cfg = t === 100 ? zw.N : zw.M[t];
		this.c = cfg;
		const id = cfg.z;
		this.d = id === 0 ? null : zw.c_(id);
	}
}

const hwR = []; // hw.R: the ArrayDeque used as the flood-fill stack (push/pop at the same end)

export class hw extends iw {
	/** (ILnw;)V */
	constructor(type, hero) {
		super(type, hero);
		this.A = 0;
		this.B = null;
		this.C = false;
		this.D = [];
		this.E = false;
		this.F = null;
		this.G = 0; this.H = 0; this.I = 0;
		this.J = null;
		this.K = [];
		this.L = null;
		this.M = null;
		this.N = null;
		this.O = null;
		this.g = 0; // width
		this.h = 0; // height
		this.i = 0; // width * height
		this.j = null; // ww[]
		this.k = null; // qw[] occupant per cell
		this.l = null; // short[] region labels
		this.m = null; // byte[]
		this.n = []; // objects
		this.o = []; // critters
		this.p = null; // uw[] hired companions
		this.q = null;
		this.r = 0;
		this.s = false;
		this.t = null;
		this.u = null;
		this.v = [null, null, null];
		this.w = new e01(); // loot stream
		this.x = new e01();
		this.y = 0;
		this.z = 0;
	}

	/** static void F(bw, uw): copy a companion's stats onto a template bw */
	static F_(t, c) {
		hw.G_(t, c.b, c.j, true);
		c.j_(false);
		t.f0 = c.f;
		t.q0 = 0;
		for (const p of zw.m) {
			if (p.a) {
				const m = p.b;
				if ((c.g & m) !== 0 && c.j >= p.d) t.q0 |= m;
			}
		}
		const v = c.f_(true);
		t.o0 = v;
		let r = 0;
		if (v !== 0) {
			if ((c.g & 458752) === 458752) r = 191;
			else {
				const p0 = c.b.p0;
				if (p0 !== 191) r = p0;
			}
		}
		t.p0 = r;
	}

	/** static void G(bw, bw, int lvl, boolean): scale size/speed of t from src by level */
	static G_(t, src, lvl, z) {
		t.b = src.b;
		let f = src.F0;
		if (f === 0) f = f32(0.9);
		t.d = f;
		if (lvl < 12) {
			if (lvl <= 4) t.d = f32(f * f32(0.67));
			else t.d = f32(fg2.H_(f32(0.67), 1, f32(f32(lvl - 4) / 8)) * f);
		}
		if (z) {
			t.O0 = 0;
			if (lvl < 12) {
				if (lvl <= 4) t.O0 = 60;
				else t.O0 = f2i(fg2.H_(60, 22, f32(f32(lvl - 4) / 8)));
			}
		}
		t.c = f32(src.c * t.d);
		t.Y = src.Y;
		t.Z = src.Z;
		t.a0 = src.a0;
		t.V = src.V;
	}

	/** boolean A(int x, int y): free cell whose type allows ... (xw.n, or xw.p with bit 32) */
	A_(x, y) {
		const i = (imul(y, this.g) + x) | 0;
		if (at(this.k, i) == null) {
			const c = this.j[i];
			const t = zw.u[c.a];
			if (t.n || (t.p && (c.b & 32) !== 0)) return true;
		}
		return false;
	}

	/** boolean B(int x, int y): left or right neighbour satisfies ww.p() */
	B_(x, y) {
		if (x <= 0 || !at(this.j, (imul(this.g, y) + x - 1) | 0).p_()) {
			const g = this.g;
			if (x >= g - 1 || !at(this.j, lz0.h_(y, g, x, 1)).p_()) return false;
		}
		return true;
	}

	b_() { return this; }
	c_() { return !this.C; }

	/** void H(): set the hero-shadow template (bw 198) stats from the guild hero */
	H_() {
		const t = this.t;
		zw.c_(198).f0 = new cw(t.m_(), t.f_(), t.e_(), t.p_(), 0);
	}

	/** void I(): set up companion templates bw 190..193 from p (uw[]) */
	I_() {
		let pool = null;
		let total = 0;
		for (let i = 0; ; i++) {
			const ps = this.p;
			if (i >= ps.length || i >= 4) return;
			const c = ps[i];
			const t = zw.c_((i + 190) | 0);
			hw.G_(t, c.b, 1, false);
			const rank = c.d;
			t.v = at(zw.d, rank);
			t.D0 = 0;
			t.C0 = 0;
			const n = Math.min(rank, 2);
			if (n > 0) {
				if (pool == null) {
					pool = [];
					for (const m of zw.J) {
						if (m.t0 !== 0) {
							const lvl = this.c.M;
							if (lvl >= m.r0 && lvl <= m.s0 && m.v <= 0) {
								pool.push(m);
								total = (total + m.t0) | 0;
							}
						}
					}
				}
				let r = imul((imul((c.c + 919) | 0, 69069) + 1) & 32767, total) >>> 15;
				for (let k = 0; k < pool.length; k++) {
					const m = pool[k];
					const w = m.t0;
					if (r < w) {
						t.C0 = m.a;
						break;
					}
					r = (r - w) | 0;
				}
				if (t.C0 !== 0) t.D0 = n;
			}
		}
	}

	/** aw K(int id, int x, int y, int group, boolean flip, boolean replaceMarker): add a critter */
	K_(id, x, y, group, flip, replace) {
		let marked = false;
		if (replace) {
			const o = at(this.k, (imul(this.g, y) + x) | 0);
			if (o != null && o.a.a === 84) {
				this.j_(o, false);
				marked = true;
			}
		}
		const c = new aw(this, zw.c_(id));
		const p = c.b;
		p.a = x;
		p.b = y;
		c.c = flip;
		c.k = group;
		if (marked) c.z_(512);
		this.f_(c, true);
		return c;
	}

	/** qw L(int x, int y): add a type-84 marker object */
	L_(x, y) {
		const o = new qw(zw.Q.get(84) ?? null);
		const p = o.b;
		p.a = x;
		p.b = y;
		o.c = this.B_(x, y);
		this.g_(o, true);
		return o;
	}

	/** qw M(int id, int x, int y, boolean flip): add an object */
	M_(id, x, y, flip) {
		const o = new qw(zw.Q.get(id) ?? null);
		const p = o.b;
		p.a = x;
		p.b = y;
		o.c = flip;
		this.g_(o, true);
		return o;
	}

	/** boolean N(aw, qw): swap positions of a critter and an object */
	N_(c, o) {
		if (!c.a.r_() && !o.a.r_()) {
			const p = c.b;
			const x = p.a, y = p.b;
			const q = o.b;
			p.a = q.a;
			p.b = q.b;
			q.a = x;
			q.b = y;
			const k = this.k;
			const g = this.g;
			k[(imul(p.b, g) + p.a) | 0] = c;
			k[(imul(y, g) + x) | 0] = o;
			return true;
		}
		return false;
	}

	/** void f(aw, boolean init): add a critter */
	f_(c, init) {
		const p = c.b;
		const i = (imul(p.b, this.g) + p.a) | 0;
		if (at(this.k, i) == null) {
			if (init) c.d_(this);
			this.o.push(c);
			this.k[i] = c;
		} else {
			wg2.h_('addCritter: tile occupied');
		}
	}

	/** void g(qw, boolean init): add an object (multi-tile objects cover T x U cells upward) */
	g_(o, init) {
		const critter = o.e_();
		const p = o.b;
		if (critter) {
			wg2.h_('addObj: critter');
			return;
		}
		if (init) o.d_(this);
		this.n.push(o);
		if (!o.a.r_()) {
			const i = (imul(p.b, this.g) + p.a) | 0;
			const k = this.k;
			if (at(k, i) == null) k[i] = o;
			else wg2.h_('addObj: tile occupied');
		} else {
			for (let r = 0; r < (o.c ? o.a.T : o.a.U); r++) {
				for (let c = 0; c < (o.c ? o.a.U : o.a.T); c++) {
					const i = (imul((p.b - r) | 0, this.g) + p.a + c) | 0;
					const k = this.k;
					if (at(k, i) != null) {
						wg2.h_('addObj: tile occupied');
						return;
					}
					k[i] = o;
				}
			}
		}
	}

	/** void h(boolean grids, boolean marks): allocate j/k/l (and m) for i = g * h cells */
	h_(grids, marks) {
		if (grids) {
			const n = this.i;
			this.j = new Array(n).fill(null);
			this.k = new Array(n).fill(null);
			this.l = new Int16Array(n);
		}
		if (marks) this.m = new Int8Array(this.i);
	}

	/** int i(): objectives left */
	i_() {
		if (this.c.H) return 0;
		let n = 0;
		const objs = this.n;
		for (let i = 0, len = objs.length; i < len; i++) if (objs[i].f_(this)) n++;
		const crit = this.o;
		for (let i = 0, len = crit.length; i < len; i++) if (crit[i].a.t) n++;
		if (this.c.E && !this.x_()) n++;
		return n;
	}

	/** void j(qw, boolean): remove an object or critter */
	j_(o, z) {
		const objective = o.f_(this);
		const p = o.b;
		if (o.a.r_()) {
			for (let r = 0; r < (o.c ? o.a.T : o.a.U); r++) {
				for (let c = 0; c < (o.c ? o.a.U : o.a.T); c++) {
					this.k[(imul((p.b - r) | 0, this.g) + p.a + c) | 0] = null;
				}
			}
		} else {
			this.k[(imul(p.b, this.g) + p.a) | 0] = null;
		}
		if (o.e_()) {
			if (this.q === o) {
				this.q = null;
				if (this.s) this.s = false;
			} else if (this.u === o) {
				this.u = null;
				this.t = null;
			} else if (o.v_()) {
				for (let i = 0; i < 3; i++) {
					const s = this.v[i];
					if (s != null && s.a === o) {
						s.a = null;
						break;
					}
				}
			}
			removeObj(this.D, o);
			const crit = this.o;
			removeObj(crit, o);
			for (let i = 0, len = crit.length; i < len; i++) {
				const c = crit[i];
				if (c.l === o) c.l = null;
			}
			if (z && o.s_(512)) {
				const q = o.b;
				this.L_(q.a, q.b);
			}
		} else {
			removeObj(this.n, o);
		}
		if (objective) this.z = (this.y - this.i_()) | 0;
	}

	/** void k(int x, int y, short label, boolean doors): flood-fill label from (x, y) */
	k_(x, y, label, doors) {
		const R = hwR;
		R.length = 0;
		let v = x | (y << 16);
		for (;;) {
			const cx = v & 65535;
			const cy = v >>> 16;
			const i = (imul(this.g, cy) + cx) | 0;
			const l = this.l;
			let fill = false;
			if (doors) {
				const cur = l[i];
				if ((cur & -1024) === 0 && zw.u[this.j[i].a].k) {
					l[i] = cur | label;
					fill = true;
				}
			} else if (l[i] === 0 && zw.u[this.j[i].a].l) {
				l[i] = label;
				fill = true;
			}
			if (fill) {
				if (cx > 0) R.push((cy << 16) | (cx - 1));
				if (cx < this.g - 1) R.push((cy << 16) | (cx + 1));
				if (cy > 0) R.push(((cy - 1) << 16) | cx);
				if (cy < this.h - 1) R.push(((cy + 1) << 16) | cx);
			}
			if (R.length === 0) return;
			v = R.pop();
		}
	}

	/** void l(boolean clear): label regions (low 10 bits) and door regions (bits 10+) */
	l_(clear) {
		if (clear) for (let i = 0; i < this.i; i++) this.l[i] = 0;
		let label = 1;
		for (let y = 0; y < this.h; y++) {
			for (let x = 0; x < this.g; x++) {
				const i = (imul(this.g, y) + x) | 0;
				if (this.l[i] === 0 && zw.u[this.j[i].a].l) {
					const cur = label;
					label = s16(label + 1);
					this.k_(x, y, cur, false);
				}
			}
		}
		label = 1;
		for (let y = 0; y < this.h; y++) {
			for (let x = 0; x < this.g; x++) {
				const i = (imul(this.g, y) + x) | 0;
				if ((this.l[i] & -1024) === 0 && zw.u[this.j[i].a].k) {
					const cur = label;
					label = s16(label + 1);
					this.k_(x, y, s16(cur << 10), true);
				}
			}
		}
	}

	/** aw p(int): critter with k == 0 and h == v */
	p_(v) {
		const crit = this.o;
		for (let i = 0, len = crit.length; i < len; i++) {
			const c = crit[i];
			if (c.k === 0 && c.h === v) return c;
		}
		return null;
	}

	/** qw q(qw): the object paired with o (switch/door, key/lock) */
	q_(o) {
		const id = o.a.a;
		if (id !== 88 && id !== 126) {
			if (id === 40) {
				const h = o.h;
				const objs = this.n;
				for (let i = 0, len = objs.length; i < len; i++) {
					const x = objs[i];
					if (fg2.W_(x.a.a, 38, 39) && x.h === h) return x;
				}
			} else if (fg2.W_(id, 38, 39)) {
				return this.r_(40, o.h);
			}
			return null;
		}
		const r = this.s_(88, o.h, o);
		return r == null ? this.s_(126, o.h, o) : r;
	}

	/** qw r(int id, int h) */
	r_(id, h) {
		const objs = this.n;
		for (let i = 0, len = objs.length; i < len; i++) {
			const x = objs[i];
			if (x.a.a === id && x.h === h) return x;
		}
		return null;
	}

	/** qw s(int id, int h, qw except) */
	s_(id, h, except) {
		const objs = this.n;
		for (let i = 0, len = objs.length; i < len; i++) {
			const x = objs[i];
			if (x !== except && x.a.a === id && x.h === h) return x;
		}
		return null;
	}

	/** boolean u(int i): cell blocked (xw.j) or occupied */
	u_(i) {
		return zw.u[this.j[i].a].j || this.k[i] != null;
	}

	/** boolean v(int x, int y, int v): neither horizontal neighbour is a type-1 cell with (b & 31) == v */
	v_(x, y, v) {
		if (x <= 0 || !at(this.j, (imul(this.g, y) + x - 1) | 0).s_(1, 31, v)) {
			const g = this.g;
			if (x >= g - 1 || !at(this.j, lz0.h_(y, g, x, 1)).s_(1, 31, v)) return true;
		}
		return false;
	}

	/** boolean w(qw): not in the level */
	w_(o) {
		const has = o.e_() ? this.o.includes(o) : this.n.includes(o);
		return !has;
	}

	/** boolean x(): some type-5 cell with (b & 15) in {2, 3} and bit 32 */
	x_() {
		for (const c of this.j) {
			if (c.a === 5 && fg2.W_(c.b & 15, 2, 3) && (c.b & 32) !== 0) return true;
		}
		return false;
	}

	/** boolean y(int x, int y) */
	y_(x, y) {
		const c = at(this.j, (imul(y, this.g) + x) | 0);
		const t = zw.u[c.a];
		return t.q || (t.r && (c.b & 32) !== 0);
	}

	/** boolean z(int x, int y): in bounds, free, and type allows (xw.m, or xw.o with bit 32) */
	z_(x, y) {
		if (x >= 0 && y >= 0) {
			const g = this.g;
			if (x < g && y < this.h) {
				const i = (imul(y, g) + x) | 0;
				if (this.k[i] == null) {
					const c = this.j[i];
					const t = zw.u[c.a];
					if (t.m || (t.o && (c.b & 32) !== 0)) return true;
				}
			}
		}
		return false;
	}
}

register(ww, u30, qw, aw, mw, nw, uw, iw, hw);

// ---------------------------------------------------------------------------------------------
// zw static methods (the static tables themselves are zw.A, zw.M, ... from data/tables.json).

/** static int a(int kind, int id): replacement item for some drops, by player progress */
zw.a_ = function a_(kind, id) {
	if (id === 621) {
		if (kind === -1) return 306;
		if (fg2.X_(kind, 23, 24, 25)) {
			if (zw.n_(kind)) {
				const st = vj0.i2;
				if (st.L0_(305) >= 2 || (kind === 25 && st.Y0_(75).w_(0))) return 288;
				return 305;
			}
			return 306;
		}
	} else {
		if (fg2.a0_(id, 267, 413, 257, 335, 381, 432) && vj0.i2.Y0_(23).v_()) return 177;
		if (fg2.W_(id, 314, 387) && vj0.i2.Y0_(36).q_()) return 214;
		if (id === 625 && vj0.i2.Y0_(71).v_()) return 315;
		if (id === 394) return 260;
		if (id === 626) return 314;
	}
	return 0;
};

/** static int b(int type): tier of a dungeon type (0..4 classic, 5..8 forest, 9 cave, 10 egypt) */
zw.b_ = function b_(t) {
	if (t < 0 || t >= 27) return 0;
	if (t >= 23) return 10;
	if (t >= 19) return 9;
	return t >= 15 ? (t - 10) | 0 : idiv(t, 3);
};

/** static bw c(int id): monster type by id (zw.R), null if absent */
zw.c_ = function c_(id) {
	const r = zw.R.get(id);
	return r === undefined ? null : r;
};

/** static int h(int type): floor within the tier (0..2 classic, 0..3 others) */
zw.h_ = function h_(t) {
	if (t < 0 || t >= 27) return 0;
	if (t >= 23) return (t - 23) | 0;
	if (t >= 19) return (t - 19) | 0;
	return t >= 15 ? (t - 15) | 0 : t % 3;
};

/** static int k(int flag): min level for a perk flag (zw.m), 1 by default */
zw.k_ = function k_(flag) {
	for (const t of zw.m) if (t.b === flag) return t.d;
	return 1;
};

/** static boolean n(int kind): egypt quest item not yet found */
zw.n_ = function n_(kind) {
	return (kind === 23 && !vj0.i2.Y0_(73).q_())
		|| (kind === 24 && !vj0.i2.Y0_(74).q_())
		|| (kind === 25 && !vj0.i2.Y0_(75).q_());
};

