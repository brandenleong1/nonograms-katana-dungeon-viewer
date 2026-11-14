// Player-progress queries the dungeon generator makes: vj0 (player state, revived as vj0.i2 from
// data/tables.json = the game's fresh player), kj0 / hi0 (quests), jj0 (quest step conditions), plus the
// small player-state holders (mj0, oj0, yw, ri0). cq, cj0, pj0 and ni0 live in model.js; the methods
// they need beyond the model's are merged into those classes below.
// Only methods reachable from x30 and the classes model.js ports are ported. Methods end in `_`
// (vj0 has fields named L0, Y0, N, ... next to methods of the same name, see PORTING.md).
// Sources: decompiled/vineflower/{vj0,kj0,jj0,ni0,pj0,cq}.java; hi0 only exists in JADX
// (decompiled/sources/defpackage/hi0.java).
//
// Imports: never ./index.js (top-level await would deadlock the module graph).
import { register, classes } from './registry.js';
import { at } from './jrt.js';
import { zw, vj0 as V } from './statics.js';
import { cq, pj0, ni0 } from './model.js';

/** Java long value of a field (snapshots carry longs as JSON numbers; callers may set a BigInt). */
const toLong = (x) => (typeof x === 'bigint' ? BigInt.asIntN(64, x) : BigInt(x));
/**
 * Java `(1L << b & mask) != 0L` (shift masked to 6 bits like the JVM).
 * Speed: vj0.t1 is asked for every damage roll, stat and dungeon build, and the mask (vj0.X) almost never changes, so the
 * two int32 halves of the last mask are kept and the test is a shift and an AND on one of them. Same answer for every
 * mask the BigInt form answers for (bits 0..63 of the long, whatever its sign or size); a mask that isn't a number or
 * a BigInt, and one BigInt() rejects (NaN, 1.5), take the BigInt form and throw as before.
 */
let maskKept, maskLo = 0, maskHi = 0;
const longBit = (b, mask) => {
	const k = b & 63;
	if (typeof mask !== 'number' && typeof mask !== 'bigint') return ((1n << BigInt(k)) & toLong(mask)) !== 0n;
	if (mask !== maskKept) {
		const v = toLong(mask);
		maskLo = Number(BigInt.asIntN(32, v));
		maskHi = Number(BigInt.asIntN(32, v >> 32n));
		maskKept = mask;
	}
	return ((k < 32 ? maskLo >>> k : maskHi >>> (k - 32)) & 1) !== 0;
};

// zw.s(int): forest dungeon types 15..18
if (!zw.s_) zw.s_ = (t) => t >= 15 && t < 19;

// ---------------------------------------------------------------------------------------------
// vj0: player state. Fields used by the generator (fresh values in data/tables.json):
//   k  kj0[] quest list (iteration order for x30.O)     s  kj0[] quests by id (Y0)
//   J0 int   bits 0..14 classic floor bosses beaten (G1), 15..22 forest bosses (J1), 23..25 cave (y1)
//   I0 int   bits 28..31 forest quest-line flags (I1 for type 15..18 -> bit type+13)
//   X  long  bit set read by t1 (nw HP/XP perks, p30 templates)
//   K, L cq  item lists (L0 = count in both, P1 = owned)
//   N  pj0   statistics (N.b cq, N.f(18), N.x, N.n, N.p)
//   o  ni0[] quest lines by id (B0 step, C0 done bits, e steps)
//   j, i mj0[] (q, h);  g uj0[] (o);  m ri0[] (i);  B int;  Y wi0 (o0);  Y0 int (nw.n bonus)

export class vj0 {
	/** boolean E1(int type): minor-boss level (type x*3+2, x in 1..4) whose quest is active and not done */
	E1_(t) {
		if (t >= 0 && t < 15 && t % 3 === 2) {
			const x = (t / 3) | 0;
			if (x >= 1 && x <= 4) {
				if (this.I1_((x + 14) | 0)) return false;
				if (x === 1) {
					if (!this.Y0_(27).x_()) return false;
				} else {
					if (!this.Y0_(30).x_()) return false;
					if (!this.I1_((x + 13) | 0)) return false;
				}
				return true;
			}
		}
		return false;
	}

	/** boolean G1(int type): classic floor boss of this type beaten (J0 bit type); true outside 0..14 */
	G1_(t) {
		return t < 0 || t >= 15 ? true : (this.J0 & (1 << t)) !== 0;
	}

	/** boolean I1(int type): forest flag for type 15..18 (I0 bit type+13) */
	I1_(t) {
		return !zw.s_(t) ? false : (this.I0 & (1 << ((t + 13) | 0))) !== 0;
	}

	/** boolean J1(int type, boolean second): forest boss beaten (J0 bit 15 + (type-15)*2 + second) */
	J1_(t, z) {
		if (zw.s_(t)) {
			const b = (((t - 15) | 0) * 2 + (z ? 1 : 0)) | 0;
			if (b < 8 && (this.J0 & (1 << ((b + 15) | 0))) === 0) return false;
		}
		return true;
	}

	/** int L0(int id): item count in K + L */
	L0_(id) {
		const a = this.K.j_(id);
		return (this.L.j_(id) + a) | 0;
	}

	/** boolean P1(int id): item owned in K or L */
	P1_(id) {
		return this.K.k_(id) || this.L.k_(id);
	}

	/** int S(): classic floor bosses beaten (J0 bits 0..14) */
	S_() {
		let n = 0;
		for (let i = 0; i < 15; i++) if ((this.J0 & (1 << i)) !== 0) n = (n + 1) | 0;
		return n;
	}

	/** boolean V1(int id): item owned, or the item the pending wi0 Y refers to */
	V1_(id) {
		if (!this.P1_(id)) {
			const y = this.Y;
			if (y == null || y.o0 !== id) return false;
		}
		return true;
	}

	/** kj0 Y0(int id): quest by id (null past the end) */
	Y0_(id) {
		const s = this.s;
		return id < s.length ? at(s, id) : null;
	}

	/** int p0(): sum of j[].q */
	p0_() {
		const j = this.j;
		let n = 0;
		for (let i = 0; i < j.length; i++) n = (n + j[i].q) | 0;
		return n;
	}

	/** int q0(): needs the static d1 table and Q0() (ni0.z / li0.f); no generator-reachable quest uses it */
	q0_() {
		throw new Error('vj0.q0 is not ported (not reachable from the generator)');
	}

	/** boolean t1(int bit): X has bit set (long) */
	t1_(b) {
		return longBit(b, this.X);
	}

	/** boolean y1(int type): cave boss beaten (J0 bit type+4 for types 19..21); true otherwise */
	y1_(t) {
		return t < 19 || t >= 22 ? true : (this.J0 & (1 << ((t + 4) | 0))) !== 0;
	}
}
vj0.javaName = 'vj0';

// ---------------------------------------------------------------------------------------------
// kj0: quest. j0 state byte (bit 7 done, bit 4 active), k0 step bits; B/L/M trigger levels, G mode,
// H..K start conditions, b0 steps (jj0), c0 per-level steps, X/Y referral NPCs, C/O/U/R NPCs, E wagon.

export class kj0 {
	/** int j(): quest-line progress (o[h].B0); overridden by hi0 */
	j_() {
		const h = this.h;
		if (h !== 0) {
			const line = V.i2.o[h];
			if (line != null) return line.B0;
		}
		return 0;
	}

	/** int k(): quest-line length; overridden by hi0 */
	k_() {
		const h = this.h;
		if (h !== 0) {
			const line = V.i2.o[h];
			if (line != null) {
				const e = line.e;
				if (e == null) return 1;
				return e.length;
			}
		}
		return 0;
	}

	/** jj0 m(int type): current step that happens on this dungeon type (c0 quests) */
	m_(t) {
		if (this.c0 && t !== -1) {
			for (const s of this.b0) {
				if (s.Q === t && !s.d_(this) && (s.U || !s.c_(this, 0n))) return s;
			}
		}
		return null;
	}

	/** int o(): packed state bytes */
	o_() {
		return ((this.m0 & 0xff) << 24) | (this.j0 & 0xff) | ((this.k0 & 0xff) << 8) | ((this.l0 & 0xff) << 16);
	}

	/** boolean p(long mask): all required steps done */
	p_(mask) {
		const b0 = this.b0;
		if (b0 != null) {
			for (let i = 0; i < b0.length; i++) {
				const s = b0[i];
				if (s.b && !s.c_(this, mask)) return false;
			}
			if (this.d0 != null) {
				const f = this.f0;
				if (f !== -1 && !this.w_(f)) return false;
			}
			return true;
		}
		return false;
	}

	/** boolean q(): done */
	q_() {
		return (this.j0 & 128) !== 0;
	}

	/** boolean r(int v): last step's v equals v */
	r_(v) {
		if (v !== 0) {
			const b0 = this.b0;
			if (b0 != null && b0.length > 0 && b0[b0.length - 1].v === v) return true;
		}
		return false;
	}

	/**
	 * boolean s(int mode, int type): quest has its NPC / boss drop on this dungeon type.
	 * mode -1: x30.O quest pick; 0: boss drop (x30.n0); 1: second NPC.
	 */
	s_(mode, t) {
		if (this.c0 && t !== -1 && (mode === 0 || mode === -1) && this.x_()) {
			for (const s of this.b0) {
				if (s.Q === t && !s.d_(this) && (s.U || !s.c_(this, 0n))) return true;
			}
		}
		if (t !== -1) {
			if (this.L !== t) {
				const M = this.M;
				if (M == null || t !== at(M, Math.min(this.j_(), (this.M.length - 1) | 0))) return false;
			}
			if ((mode === 0 || (mode === -1 && (this.S === 0 || this.U !== 0)) || (mode === 1 && this.S !== 0))
				&& (!this.V || this.b0[0].c_(this, 0n)) && this.x_()) return true;
		}
		return false;
	}

	/** boolean t(int mode, int type, boolean start): quest can be started on this dungeon type */
	t_(mode, t, start) {
		if (t !== -1 && this.B === t && (mode === 0 || (mode === -1 && this.G === 0) || (mode === 1 && this.G !== 0)) && !this.v_()) {
			let s = this.H;
			if (s == null || s.c_(this, 0n)) {
				s = this.I;
				if (s == null || s.c_(this, 0n)) {
					s = this.J;
					if (s == null || s.c_(this, 0n)) {
						s = this.K;
						if (s == null || s.c_(this, 0n)) {
							// the generator always passes start = false; D() (start the quest) mutates state and is
							// added by js/combat/actions.js (the NPC talk in c30.R0)
							if (start) this.D_();
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	/** boolean u(jj0 s): some step's i points at s */
	u_(s) {
		const b0 = this.b0;
		if (b0 != null) {
			for (let i = 0; i < b0.length; i++) {
				const k = b0[i].i;
				if (k !== -1 && this.b0[k] === s) return true;
			}
		}
		return false;
	}

	/** boolean v(): done or active (j0 & 144) */
	v_() {
		return (this.j0 & 144) !== 0;
	}

	/** boolean w(int i): step bit i (k0) */
	w_(i) {
		return (this.k0 & (1 << i)) !== 0;
	}

	/** boolean x(): active and not done */
	x_() {
		const j = this.j0;
		return (j & 128) === 0 && (j & 16) !== 0;
	}
}
kj0.javaName = 'kj0';

/** hi0 extends kj0: quests whose progress counts bosses / items instead of a quest line (n0 selects). */
export class hi0 extends kj0 {
	/** int j() */
	j_() {
		switch (this.n0) {
			case 0:
				return V.i2.S_();
			case 1: {
				const st = V.i2;
				let n = 0;
				for (let i = 0; i < 8; i++) if ((st.J0 & (1 << (i + 15))) !== 0) n = (n + 1) | 0;
				return n;
			}
			case 2:
				return V.i2.L0_(114);
			default:
				return V.i2.o[30].B0;
		}
	}

	/** int k() */
	k_() {
		switch (this.n0) {
			case 0: return 15;
			case 1: return 8;
			case 2: return 4;
			default: return V.i2.o[30].e.length;
		}
	}
}
hi0.javaName = 'hi0';

// ---------------------------------------------------------------------------------------------
// jj0: quest step / condition. c() tests the first non-default selector field.

export class jj0 {
	/** boolean c(kj0 quest, long mask): condition met */
	c_(q, mask) {
		if (this.g !== -1) return q.w_(this.g);
		if (this.p !== 0) return V.i2.P1_(this.p);
		const m = this.m;
		if (m !== 0) {
			const line = V.i2.o[this.l];
			let need = m;
			if (m < 0) need = line.e.length;
			if (line.B0 >= need) return true;
		} else if (this.o !== 0) {
			const line = V.i2.o[this.o];
			if ((line.B0 === 0 && line.j0_()) || line.B0 > 0) return true;
		} else if (this.r > 0) {
			if (V.i2.B >= this.r) return true;
		} else if (this.s > 0) {
			if (V.i2.q0_() >= this.s) return true;
		} else if (this.w !== 0) {
			const st = V.i2;
			const ok = st.V1_(this.w);
			if (ok) return ok;
			if (this.v === 0) return ok;
			jj0.item_(this.v);
		} else if (this.v !== 0) {
			jj0.item_(this.v);
		} else if (this.z > 0) {
			if (V.i2.i[this.y].q >= this.z) return true;
		} else {
			if (this.F !== 0) return V.i2.Y0_(this.F).v_();
			if (this.H !== 0) {
				const k = V.i2.Y0_(this.H);
				if (k.v_() && k.w_(this.I)) return true;
			} else {
				if (this.G !== 0) return V.i2.Y0_(this.G).q_();
				const D = this.D;
				if (D !== -1) {
					const E = this.E;
					if (E === 28) {
						if (D !== -2) {
							if (D >= 0) {
								const st = V.i2;
								if (D < st.g.length) {
									const p = st.N.p;
									const k = D * 2;
									if (p[k] > 0 || p[k + 1] > 0) return true;
								}
							}
						} else {
							const g = V.i2.g;
							let free = 0;
							for (let i = 0; i < g.length; i++) if (g[i].o === -1) free = (free + 1) | 0;
							const p = V.i2.N.p;
							let n = 0;
							for (let i = 0; i < p.length; i += 2) {
								if (V.i2.g[(i / 2) | 0].o === -1 && (p[i] > 0 || p[i + 1] > 0)) n = (n + 1) | 0;
							}
							if (n >= free) return true;
						}
					} else if (E === 18) {
						if (D !== -2) {
							if (D >= 0) {
								const nn = V.i2.N.n;
								if (D < nn.length && nn[D] > 0) return true;
							}
						} else {
							const nn = V.i2.N.n;
							let n = 0;
							for (let i = 0; i < nn.length; i++) if (nn[i] > 0) n = (n + 1) | 0;
							if (n >= V.i2.N.n.length) return true;
						}
					}
				} else {
					const J = this.J;
					if (J === 0) {
						if (this.L !== -1) return V.i2.G1_(this.L);
						if (this.N !== 0) return V.i2.o[this.N].h0_(this.O);
						if (this.P) return q.q_();
					} else if (J === 1) {
						if (V.i2.S_() >= this.K) return true;
					} else if (J === 2) {
						const st = V.i2;
						let n = 0;
						for (let i = 0; i < 8; i++) if ((st.J0 & (1 << (i + 15))) !== 0) n = (n + 1) | 0;
						if (n >= this.K) return true;
					} else if (J === 3) {
						const st = V.i2;
						let n = 0;
						for (let i = 0; i < 4; i++) if ((st.I0 & (1 << (i + 28))) !== 0) n = (n + 1) | 0;
						if (n >= this.K) return true;
					} else if (J !== 4) {
						if (J === 5 && V.i2.p0_() >= this.K) return true;
					} else {
						const st = V.i2;
						let n = 0;
						for (let i = 0; i < 3; i++) if ((st.J0 & (1 << (i + 23))) !== 0) n = (n + 1) | 0;
						if (n >= this.K) return true;
					}
				}
			}
		}
		return false;
	}

	/** Item-quest branch: `vj0.Z1.get(v).R.b` (static item table, not exported); unreachable from the generator. */
	static item_(v) {
		throw new Error(`jj0.c item condition (vj0.Z1[${v}]) is not ported (not reachable from the generator)`);
	}

	/** boolean d(kj0 quest): step not available yet (line not started, prerequisite step open, or bit k unset) */
	d_(q) {
		const h = this.h;
		if (h === 0 || V.i2.o[h].B0 !== 0) {
			const i = this.i;
			if (i !== -1) {
				if (this.j) {
					for (let k = 0; k <= this.i; k++) if (!q.b0[k].c_(q, 0n)) return true;
				} else if (!q.b0[i].c_(q, 0n)) {
					return true;
				}
			}
			const k = this.k;
			if (k === -1 || q.w_(k)) return false;
		}
		return true;
	}
}
jj0.javaName = 'jj0';

// Plain player-state holders (fields only as far as the generator is concerned).
/** mj0: perk / upgrade line (q level, h per-level bonus). */
export class mj0 {}
/** oj0: shop / production entry. */
export class oj0 {}
/** yw: small int record (vj0.i0, vj0.m0). */
export class yw {}
/** ri0: resource line (i count; o30.d tests m[v].i >= 1). */
export class ri0 {}

register(vj0, kj0, hi0, jj0, mj0, oj0, yw, ri0);

// ---------------------------------------------------------------------------------------------
// Methods merged into the model's cq / pj0 / ni0 (model/progress-bits.js).

if (!cq.prototype.k_) {
	/** boolean k(int id): list has item id */
	cq.prototype.k_ = function k_(id) {
		const list = this.c;
		const n = list.length;
		for (let i = 0; i < n; i++) if (list[i].a.a === id) return true;
		return false;
	};
}

if (!ni0.prototype.h0_) {
	/** boolean h0(int step): step (1-based) of this line is done */
	ni0.prototype.h0_ = function h0_(step) {
		const g = this.g;
		return g != null && step > 0 && step <= g.length && (this.C0 & (1 << (step - 1))) !== 0;
	};
}

if (!ni0.prototype.j0_) {
	/** boolean j0(): t() != null (mi0 timer); only jj0 'o' conditions (kj0.x, not reachable) use it */
	ni0.prototype.j0_ = function j0_() {
		throw new Error('ni0.j0 is not ported (not reachable from the generator)');
	};
}

if (!pj0.prototype.f_) {
	/** int f(int i): decoded counter t[i] (0 for i >= 27) */
	pj0.prototype.f_ = function f_(i) {
		if (i >= 27) return 0;
		const v = this.t[i];
		return (((v & 252645135) << 4) | ((-252645136 & v) >>> 4)) ^ 23673997;
	};
}

// Keep the model's classes registered (they register only if absent).
for (const c of [cq, pj0, ni0]) if (!classes[c.javaName || c.name]) register(c);
