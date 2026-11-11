// c30 movement part: bump/move dispatch (m0), stepping (l0, n0), hidden traps (Z, n), tap-path and
// floor puzzles (u0, f0), loot/XP on death (j0, b, c, U), healing (w), facing (I), the skill-7 unseal
// range check (o), tool range (d0), visibility tests (r, s, l), and the cosmetic s0 / w0 / M.
// Sources: decompiled/vineflower/c30.java (primary), JADX (fails on m0), smali c30.smali (ground truth;
// m0's register flow was mapped from smali, labels :Lnn below refer to the stripped smali listing).
import { install, extend, c30 } from './c30.js';
import { classes } from '../gen/registry.js';
import { zw, vj0 } from '../gen/statics.js';
import { fg2, lz0, al2, UApp, Util$Point } from '../gen/model.js';
import { imul, idiv, f32, f2i, b8, iabs } from '../gen/jrt.js';

// ---------------------------------------------------------------------------------------------
// Small shared helpers (static zw / fg2 methods, defined only if nobody else has).

/** static boolean zw.o(int, int): factions 1 and 2 are hostile to each other */
if (!zw.o_) {
	zw.o_ = function o_(a, b) {
		if (a === b) return false;
		let lo = a, hi = b;
		if (a > b) { hi = a; lo = b; }
		return lo === 1 && hi === 2;
	};
}
/** static boolean zw.p(int r, int c, Point, Point): Chebyshev <= r, corners cut by c */
if (!zw.p_) {
	zw.p_ = function p_(r, c, p, q) {
		const dx = iabs((p.a - q.a) | 0);
		const dy = iabs((p.b - q.b) | 0);
		return dx <= r && dy <= r && (c <= 0 || ((dx + dy) | 0) < ((imul(r, 2) + 1 - c) | 0));
	};
}
/** static float fg2.p(FFF): clamp (lo checked first) */
if (!fg2.p_) {
	fg2.p_ = function p_(v, lo, hi) {
		if (v < lo) return lo;
		return v > hi ? hi : v;
	};
}

/** Context.getString through the c30.d stub ("#<resId>" in the oracle). */
function getString(c, id) {
	const d = c.d;
	if (d == null) return '#' + id;
	if (typeof d.getString_ === 'function') return d.getString_(id);
	if (typeof d.getString === 'function') return d.getString(id);
	return '#' + id;
}

/** UApp.V(String, boolean); UApp methods return their default ("") in the oracle. */
function uappV(s, z) {
	return typeof UApp.V_ === 'function' ? UApp.V_(s, z) : '';
}

/** static fw c30.l1 (fight-mode scratch for hw.n): created lazily so the fw class can come from any part. */
function l1() {
	let f = c30.l1;
	if (f == null) {
		const Fw = classes.fw;
		f = Fw ? new Fw(0, false) : { a: 0, b: false, a_() { return this.b ? this.a : 0; } };
		c30.l1 = f;
	}
	return f;
}

/** w20: queued sound/visual event (c30.U0 pool, filled by w0). */
class w20 {
	constructor() { this.a = 0; this.b = null; this.c = 0; this.d = 0; this.e = 0; this.f = 0; }
}
if (!classes.w20) classes.w20 = w20;

// ---------------------------------------------------------------------------------------------
// Model methods these need that js/gen/model lacks.

const NW_KEY = 14072090;
const { nw, vj0: Vj0 } = classes;

// Guarded like the other parts: a helper another part (or the oracle setup) may also need is only added
// where absent. nw.w is also what the oracle's --level setup calls.
const addMissing = (cls, methods) => {
	const add = {};
	for (const [k, fn] of Object.entries(methods)) if (!(k in cls.prototype)) add[k] = fn;
	extend(cls, add);
};

if (typeof nw.j_ !== 'function') {
	/** static int j(boolean): level cap (21 until perk 26, then 26 / 500) */
	nw.j_ = function j_(z) {
		if (!vj0.i2.t1_(26)) return 21;
		return z ? 26 : 500;
	};
}
addMissing(nw, {
	/** void w(int xp): store XP (clamped to the cap) and recompute level g */
	w_(v) {
		let x = v;
		if (v !== 0) x = fg2.q_(v, 0, nw.q_(nw.j_(false)));
		const k = NW_KEY ^ x;
		this.f = ((k & 252645135) << 4) | ((-252645136 & k) >>> 4);
		this.g = nw.h_(x);
	},
});
extend(nw, {
	/** int a(int xp): add XP, return the XP actually gained (c30.b) */
	a_(v) {
		if (v <= 0) return 0;
		const before = this.g_();
		this.w_((v + before) | 0);
		return (this.g_() - before) | 0;
	},
});
addMissing(Vj0, {
	/** void a(bj0, int, boolean): collection log N.b += n when the item is a collectible of kind z (c30.U) */
	a_(item, n, z) {
		if (item.A || item.C) {
			const v = item.V > 0;
			if (z === v) this.N.b.b_(item.a, n);
		}
	},
});

// ---------------------------------------------------------------------------------------------

install({
	/**
	 * int m0(aw, int dx, int dy, int cost, boolean z, qw obj, Point pt): the bump/move dispatch.
	 * obj != null: walk through a door/ladder/passage object (pt = exit cell). Returns -1 when an action
	 * was started (or the bump consumed), 0 when nothing happened, 1 after a move.
	 */
	m0_(a, dx0, dy0, cost, z, obj, pt) {
		if (dx0 === 0 && dy0 === 0 && obj == null) return 0;
		const sx = a.b.a, sy = a.b.b;
		const srcIdx = (imul(this.g, sy) + sx) | 0;
		let tx, ty, dx, dy;
		if (obj != null) {
			const op = obj.b;
			const rt = obj.a;
			if (pt != null) {
				tx = pt.a; ty = pt.b;
				if (rt.a === 88) {
					dx = (tx - ((op.a + 1) | 0)) | 0;
					dy = (ty - ((op.b - 1) | 0)) | 0;
				} else {
					dx = (tx - op.a) | 0;
					dy = (ty - op.b) | 0;
				}
			} else if (rt.a === 88) {
				const c = obj.c;
				dx = c ? 0 : 1;
				dy = c ? -1 : 0;
				tx = (((op.a + 1) | 0) + dx) | 0;
				ty = (((op.b - 1) | 0) + dy) | 0;
			} else {
				const door = fg2.W_(rt.a, 40, 126);
				const c = obj.c;
				dx = c ? (door ? -1 : 1) : 0;
				dy = c ? 0 : (door ? 1 : -1);
				tx = (op.a + dx) | 0;
				ty = (op.b + dy) | 0;
			}
		} else {
			dx = dx0; dy = dy0;
			tx = (sx + dx0) | 0;
			ty = (sy + dy0) | 0;
		}
		if (tx < 0 || ty < 0 || tx >= this.g || ty >= this.h) return 0;
		const diag = iabs(dx) > 1 || iabs(dy) > 1 || (dx !== 0 && dy !== 0);
		const tIdx = (imul(this.g, ty) + tx) | 0;
		const cell = this.i[tIdx];
		const L = this.a;
		let tobj = L.k[tIdx];
		const path = this.z;

		// Flags at the merge point (:L192).
		let skipD = false;   // v24: already swapped (hw.N), so the hw.D target check is skipped
		let swapped = false; // v28: swapped with an ally
		let ghost = false;   // v30: 512-carry handed over (E created), or dropped below
		let pickE = false;   // v8: picked up object 84
		let pushed = false;  // v9: push branch taken
		let trap = false;    // v34: step triggers the hidden trap here

		if (obj == null) {
			const stuck = a.q > 0 || (a.t > 0 && L.E);
			let swapOk = false;   // v0 at :L155
			if (a === L.f) {
				if (!stuck) {
					if (cell.a === 5 && tobj == null) {
						if (fg2.W_(cell.b & 15, 2, 3) && (cell.b & 32) === 0) {
							a.a_(dx, dy);
							if (this.a.f.D.k_(222)) {
								cell.b = b8(cell.b | 32);
								this.W_(222, false, true);
								this.u_(a, 4, true, 300);
								const h = this.a;
								h.z = (h.y - h.i_()) | 0;
								return -1;
							}
							this.e.S_(2131231512, getString(this, 2131690598));
							return 0;
						}
						if (!this.a.C) {
							if (this.v) {
								this.K_();
								return 0;
							}
							this.e.g_(false);
							return 0;
						}
						return 0;
					}
					if (tobj == null && fg2.X_(cell.a, 8, 9, 10) && (cell.b & 32) === 0) {
						const h = this.a;
						if (h.c.H) return -1;
						h.L = new Util$Point(tx, ty);
						this.f_(18, a, null, null, true);
						return -1;
					}
					if (cell.b_() === 32) {
						if (tobj == null) {
							if (diag) {
								trap = true;
							} else {
								const t = this.Z_(tx, ty);
								if (t == null) trap = true;
								else tobj = t;
							}
						} else if (tobj.a.a === 30 && this.j0 && this.k0 && tobj.d) {
							this.a.j_(tobj, false);
							trap = true;
							tobj = null;
						}
					}
				}
				if (tobj != null && !trap) {
					const opos = tobj.b;
					if (this.a.c.H) {
						const h = tobj.h;
						if ((h & 16384) !== 0) {
							const k = (h & 16256) >>> 7;
							let v = h & 63;
							const id = tobj.a.a;
							if (id !== 33 && (!fg2.a0_(id, 32, 38, 40, 88, 126, 84) || vj0.i2.m[k].i < 1)) {
								if (k !== 127 && (tobj.h & 64) !== 0 && tobj.a.r_()) {
									const rt = tobj.a;
									const flip = tobj.c && rt.T !== rt.U;
									const ex = (tx - opos.a) | 0;
									const ey = (opos.b - ty) | 0;
									const u = flip ? ey : ex;
									const w = flip ? ex : ey;
									if (!(u >= 0 && u < rt.T && w >= 0 && w < rt.U)) return -1;
									v = lz0.h_(w, rt.T, u, v);
								}
								a.a_(dx, dy);
								// d8 / wr0 are the dialog callbacks; DungameView.R is a no-op in the oracle.
								this.e.R_(tobj.a, k, v, { javaName: 'd8', a: this, b: tobj, c: k }, { javaName: 'wr0', a: 12, b: this }, false);
								return -1;
							}
						}
					}
					if (tobj.i_(this.a.e) > 0) {
						// sealed: first bump reveals (4 AP), a later one unseals
						this.j_();
						a.a_(dx, dy);
						if (this.a.c.H) return -1;
						if (!tobj.d) {
							tobj.d = true;
							this.u_(a, 4, true, 300);
							this.m_(tobj);
							return -1;
						}
						this.f_(2, a, tobj, null, true);
						return -1;
					}
					const id = tobj.a.a;
					if (id === 28) {
						// stuck door: first bump reveals, second digs
						a.a_(dx, dy);
						if (!tobj.d) {
							tobj.d = true;
							this.u_(a, 4, true, 300);
							return -1;
						}
						const oc = this.i[(imul(opos.b, this.g) + opos.a) | 0];
						if (oc.a === 3 && fg2.W_(oc.b & 7, 3, 4) && stuck) return 0;
						this.f_(6, a, tobj, null, true);
						return -1;
					}
					if (fg2.W_(id, 29, 53)) {
						const is53 = tobj.a.a === 53;
						a.a_(dx, dy);
						const item = is53 ? 222 : 167;
						if (this.a.f.D.k_(item)) {
							this.a.j_(tobj, false);
							if (is53) cell.b = b8(cell.b | 32);
							this.W_(item, false, true);
							this.u_(a, 4, true, 300);
							return -1;
						}
						if (tobj.a.a === 29 && !tobj.d) tobj.d = true;
						const s = getString(this, 2131690598);
						this.e.S_(is53 ? 2131231512 : 2131231593, s);
						return 0;
					}
					if (tobj.e_()) {
						const c = tobj;
						const grp = c.k;
						if (grp === 1) {
							if (!stuck) {
								// swap places with an ally
								if (!this.a.N_(a, c)) return 0;
								const a512 = a.s_(512);
								const c512 = c.s_(512);
								let made = false;
								if (!(a512 && c512)
									&& ((a512 && !this.i[tIdx].o_(false)) || (c512 && !this.i[srcIdx].o_(false)))) {
									this.E = new classes.qw(zw.Q.get(84));
									const E = this.E;
									if (a512) {
										a.y_(512);
										c.z_(512);
										E.b.a = sx;
										E.b.b = sy;
										this.F = true;
										this.G = (-dx | 0) > 0 || (-dy | 0) < 0;
									} else {
										c.y_(512);
										a.z_(512);
										E.b.a = tx;
										E.b.b = ty;
										this.F = false;
										this.G = dx > 0 || dy < 0;
									}
									E.c = this.a.B_(E.b.a, E.b.b);
									made = true;
								}
								c.a_(-dx | 0, -dy | 0);
								this.C = c;
								this.D = true;
								this.u_(c, 5, false, 0);
								swapped = true;
								ghost = made;
								swapOk = true;
							}
						} else if (grp === 0) {
							const h = c.h;
							if (h === 0) return 0;
							let tgt = tobj;
							if (h >= 2000 && h <= 2999) {
								const want = (h - 2000) | 0;
								const list = this.a.o;
								const n = list.length;
								for (let i = 0; i < n; i++) {
									const o = list[i];
									if (o.h === want && o.k === 0) { tgt = o; break; }
								}
							}
							this.f_(16, a, tgt, null, true);
							return -1;
						} else if (this.a.C && zw.o_(a.k, grp)) {
							if (c.w_() && c.s_(2048) && this.a.f.F.length < 4) {
								if (c.q > 0) {
									this.f_(21, a, tobj, null, true);
									return -1;
								}
								// recruit a demoralised companion: confirm dialog (kl0 is null in the oracle)
								const text = uappV(getString(this, 2131689628), false);
								const view = this.e;
								const run = { javaName: 'vg', a: this, b: c, c: a, d: 7 };
								const kl = view.c;
								if (kl != null && kl.t_(view, true)) classes.kl0.B0_(view.b, text, 0, false, run);
								return -1;
							}
							this.f_(1, a, tobj, null, true);
							return -1;
						}
					} else {
						const rt = tobj.a;
						if (rt.l) {
							if (this.a.c.H) return -1;
							this.f_(5, a, tobj, null, true);
							return -1;
						}
						if (rt.i) {
							if (this.a.c.H) return -1;
							this.f_(3, a, tobj, null, true);
							return -1;
						}
						if (rt.n) {
							if (this.a.c.H) return -1;
							if (tobj.e) return 0;
							this.f_(rt.o ? 19 : 4, a, tobj, null, true);
							return -1;
						}
						if (fg2.X_(rt.a, 40, 88, 126) || (fg2.W_(tobj.a.a, 38, 39) && tobj.e)) {
							// doors / ladders / passages: walk through to the partner object
							if (this.a.C || stuck || tobj.h === 0) return 0;
							if (fg2.W_(tobj.a.a, 40, 126)) {
								if (tobj.c ? (dx !== 1 || dy !== 0) : (dx !== 0 || dy !== -1)) return 0;
								if (!tobj.e) tobj.e = true;
							} else if (tobj.a.a === 88 && !tobj.e) {
								tobj.e = true;
							}
							a.a_(dx, dy);
							path.length = 0;
							const dest = this.a.q_(tobj);
							if (dest == null) return 0;
							let dpos = dest.b;
							const isDoor = fg2.W_(dest.a.a, 40, 126);
							const is88 = dest.a.a === 88;
							const c = dest.c;
							const ddx = is88 ? (c ? 0 : 1) : (c ? (isDoor ? -1 : 1) : 0);
							const ddy = is88 ? (c ? -1 : 0) : (c ? 0 : (isDoor ? 1 : -1));
							let bx = dpos.a, by = dpos.b;
							if (is88) { bx = (bx + 1) | 0; by = (by - 1) | 0; }
							const nx = (ddx + bx) | 0;
							const ny = (ddy + by) | 0;
							this.P = null;
							if (!this.a.z_(nx, ny)) {
								if (isDoor) return 0;
								if (isDoor) dpos = new Util$Point(nx, ny);
								else if (is88) dpos = new Util$Point(bx, by);
								const a1 = this.a1;
								if (!this.P_(dpos, null, -1, a1)) return 0;
								this.P = new Util$Point(a1);
							}
							this.O = dest;
							this.B = a;
							const tid = tobj.a.a;
							const is40 = tid === 40;
							this.H = is40 ? 1 : dx;
							this.I = is40 ? -1 : dy;
							this.N = tid === 126 ? 0.5 : 1.0;
							this.J = 0;
							this.K = tid === 126 ? -20 : 0;
							this.Q = tid === 88 ? tobj : null;
							this.L = -1;
							this.M = 1.0;
							this.E0_(500);
							return -1;
						}
						if (rt.p) {
							if (tobj.e) return 0;
							const h = this.a;
							if (h.C && rt.q) return 0;
							if (h.c.H && !fg2.W_(rt.a, 32, 38)) return 0;
							this.f_(13, a, tobj, null, true);
							return -1;
						}
					}
				}
			} else {
				if (!stuck) {
					if (tobj == null && cell.a === 10 && (cell.b & 32) === 0) {
						L.L = new Util$Point(tx, ty);
						this.f_(18, a, null, null, false);
						return -1;
					}
					// allies trigger hidden traps too
					trap = a.k === 1 && cell.b_() === 32;
				}
				if (tobj != null && !trap && tobj.a.l) {
					this.f_(5, a, tobj, null, false);
					return -1;
				}
			}

			// :L155
			if (stuck) return 0;
			if (!swapOk && tobj != null) {
				const rt = tobj.a;
				if (rt.u) {
					// push
					if (diag) return 0;
					const px = (a.b.a + imul(dx, 2)) | 0;
					const py = (a.b.b + imul(dy, 2)) | 0;
					let pres = false;
					if (px >= 0 && py >= 0 && px < this.g && py < this.h) {
						const pIdx = (imul(py, this.g) + px) | 0;
						const pc = this.i[pIdx];
						if (a === this.a.f && pc.b_() === 32 && this.a.k[pIdx] == null && this.Z_(px, py) != null) return 0;
						const vis = this.j;
						if (vis[pIdx] > 0) {
							const pa = pc.a;
							let ok = true;
							if (pa === 3) {
								const g = this.g;
								ok = (pc.b & 32) !== 0 && vis[pIdx + 1] > 0 && vis[pIdx - 1] > 0
									&& vis[pIdx + g] > 0 && vis[pIdx - g] > 0;
							}
							if (ok) {
								if (a === this.a.f || tobj.a.a !== 59 || tobj.h !== 1 || this.u0 === 0
									|| (pa !== 3 && pa !== 8 && !pc.s_(1, -97, -127))) {
									pres = this.a.D_(px, py, tobj);
								}
							}
						}
					}
					let swap2 = false;
					if (!pres) {
						if (a.s_(512) && !this.i[tIdx].o_(false)) return 0;
						if (!this.a.N_(a, tobj)) return 0;
						swap2 = true;
					}
					// floor puzzle (ww.n cells): mark which hold a pushable, open the gate when all do
					if (cell.n_() || this.i[(imul(tobj.b.b, this.g) + tobj.b.a) | 0].n_()) {
						const ox = tobj.b.a, oy = tobj.b.b;
						const u0 = this.u0;
						if (u0 !== 0 && this.a.k[u0] != null) {
							let any = false, all = true;
							for (let yy = Math.max((oy - 8) | 0, 0); yy <= Math.min((oy + 8) | 0, (this.h - 1) | 0); yy++) {
								for (let xx = Math.max((ox - 8) | 0, 0); xx <= Math.min((ox + 8) | 0, (this.g - 1) | 0); xx++) {
									const idx = (imul(this.g, yy) + xx) | 0;
									const fc = this.i[idx];
									if (fc.n_()) {
										const o = this.a.k[idx];
										if (o != null && o.a.u) {
											fc.b = b8(fc.b | -128);
											any = true;
										} else {
											fc.b = b8(fc.b & 127);
											any = true;
											all = false;
										}
									}
								}
							}
							if (any && all) {
								const gi = this.u0;
								const gc = this.i[gi];
								gc.b = b8(gc.b | 32);
								const h = this.a;
								h.j_(h.k[gi], false);
								this.u0 = 0;
							}
						}
					}
					if (a.k === 1 && cell.b_() === 32) trap = true;
					this.C = tobj;
					this.D = !pres;
					skipD = swap2;
					pushed = true;
				} else if (rt.a === 84) {
					this.E = tobj;
					this.F = false;
					this.G = dx > 0 || dy < 0;
					this.a.j_(tobj, false);
					pickE = true;
				}
			} else {
				skipD = swapOk;
			}
		}

		// :L192
		if (!skipD && !this.a.D_(tx, ty, a)) {
			if (!pickE) return 0;
			this.E = null;
			this.a.L_(tx, ty);
			return 0;
		}
		if (a.s_(512) && !ghost) {
			let drop;
			if (cell.o_(false) || (cell.a === 9 && (cell.b & 16) !== 0 && (cell.b & 32) !== 0)) drop = diag || pickE;
			else drop = true;
			if (drop) {
				a.y_(512);
				this.a.L_(sx, sy);
				ghost = true;
			}
		}
		if (pickE) a.z_(512);
		if (obj != null) {
			const id = obj.a.a;
			if (id === 88) a.a_(dx, dy);
			else if (id === 126) a.c = obj.c;
			else a.c = !obj.c;
		} else {
			a.a_(dx, dy);
		}
		let zz;
		if (cell.a === 3) {
			if ((cell.b & 32) === 0) cell.b = b8(cell.b | 32);
			zz = true;
		} else {
			zz = z;
		}
		if (a === this.a.f) {
			if (obj != null) {
				if (!obj.e) obj.e = true;
				const old = this.l;
				const hp = this.a.f.b;
				const r = this.a.m_(hp.a, hp.b, true, true);
				this.l = !!r || !!old;
				this.m0 = null;
			}
			const fw = l1();
			fw.a = this.a.f.k;
			fw.b = false;
			if (obj != null || zz) {
				const r = this.a.n_(fw);
				this.l = !!this.l || !!r;
				if (r) path.length = 0;
			}
			const h = this.a;
			if (h.C && (obj != null || (zz && fw.b))) {
				const hero = h.f;
				if (hero.s_(128)) this.K0_(hero, null);
				hero.y_(135);
			}
			this.l_();
			if (cell.a === 1 && (cell.b & 63) === 12) this.u0_(tx, ty);
		}
		if (a.k === 1 && trap) {
			cell.b = b8(b8(cell.b & -97) | 64);
			path.length = 0;
			this.e_(14, null, a, null, null, 0);
			this.J0_(a, null);
			if (a === this.a.f) vj0.i2.g2_(true);
		}
		const h = this.a;
		if (a === h.f || h.C) {
			this.B = a;
			if (obj != null) {
				const id = obj.a.a;
				const is40 = id === 40;
				this.H = is40 ? -2 : dx;
				this.I = is40 ? 2 : dy;
				this.N = id === 126 ? 0.5 : 1.0;
				this.J = id === 126 ? -20 : 0;
				this.K = 0;
				this.M = 1.0;
			} else {
				this.H = dx;
				this.I = dy;
				this.N = 1.0;
				this.K = 0;
				this.J = 0;
				if (ghost) this.J = -22;
				if (pickE) this.K = -22;
				let m;
				if (pickE || ghost || a.s_(512)) m = 1.0;
				else m = this.A && a === this.a.f ? 0.75 : 0.5;
				this.M = m;
			}
			this.L = obj == null && !swapped && !pushed && !ghost && !pickE ? srcIdx : -1;
		}
		this.a.E = true;
		if (cost < 0) return 1;
		let n;
		if (obj != null || swapped) n = 5;
		else if (pushed) n = 2;
		else if (cost > 0) n = cost;
		else if (ghost || pickE) n = 2;
		else n = 1;
		let delay;
		if (obj != null) delay = 500;
		else if (ghost || pickE) delay = 200;
		else if (a.s_(512)) delay = 150;
		else if (this.a.C) delay = 190;
		else if (this.A && a === this.a.f) delay = 100;
		else delay = 170;
		this.u_(a, n, true, delay);
		return 1;
	},

	/** int l0(aw, int dx, int dy, int cost, boolean z): one step; camera follow when DungameView.W is false */
	l0_(a, dx, dy, cost, z) {
		const r = this.m0_(a, dx, dy, cost, z, null, null);
		if (r < 1) {
			this.z.length = 0;
			return r;
		}
		if (r === 1) {
			const hero = this.a.f;
			if (a === hero) {
				const hp = hero.b;
				const i = (imul(hp.b, this.g) + hp.a) | 0;
				let edge = false;
				if (fg2.X_(this.i[i].a, 3, 8, 9)) {
					const j = this.j;
					const g = this.g;
					if (j[i - 1] <= 1 || j[i + 1] <= 1 || j[i - g] <= 1 || j[i + g] <= 1) edge = true;
				}
				const v = this.e;
				if (v != null && !v.W) cameraFollow(this, v, edge);
				if (this.a.C) {
					this.e.k0_();
					return r;
				}
			}
		}
		return r;
	},

	/** int n0(aw): pop the next direction off the tap path z and step */
	n0_(a) {
		const z = this.z;
		if (z.length === 0) return 0;
		const dir = z.pop();
		const p = this.c1;
		p.f_(dir);
		return this.l0_(a, p.a, p.b, 0, false);
	},

	/** qw Z(int x, int y): hidden-trap detection; zw.b[skill 4]% to place a visible trap (30) at x,y */
	Z_(x, y) {
		const h = this.a;
		const chance = zw.b[h.e.h[4]];
		return h.x.h_(100) < chance ? this.a.M_(30, x, y, false) : null;
	},

	/** int o(qw): unseal mode for a sealed critter: -1 no MP, 0 melee, 1 ranged without LOS, 2 ranged */
	o_(q) {
		const crit = q.e_();
		const p = q.b;
		if (crit && q.i_(this.a.e) > 0 && q.d) {
			const h = this.a;
			if (h.e.h[7] >= 1) {
				if (h.f.E_() < q.i_(this.a.e)) return -1;
				if (!this.a.f.b.c_(p)) {
					const h2 = this.a;
					if (!h2.O_(3, 1, h2.f.b, p)) return 1;
					return 2;
				}
			}
		}
		return 0;
	},

	/** boolean d0(Point): cell inside the selected tool's range mask Y (radius Z) */
	d0_(p) {
		if (this.V) {
			const Y = this.Y;
			if (Y != null) {
				const px = p.a;
				const hp = this.a.f.b;
				const hx = hp.a;
				const r = this.Z;
				if (px >= ((hx - r) | 0) && px <= ((hx + r) | 0)) {
					const py = p.b;
					const hy = hp.b;
					if (py >= ((hy - r) | 0) && py <= ((hy + r) | 0)
						&& Y[(((px - hx) | 0) + r + imul((imul(r, 2) + 1) | 0, (((py - hy) | 0) + r) | 0)) | 0] >= 1) {
						return true;
					}
				}
			}
		}
		return false;
	},

	/** void u0(int x, int y): toggle a nonogram-floor cell; open the gate (t0) when the 5x5 pattern matches */
	u0_(x, y) {
		const t0 = this.t0;
		if (t0 !== 0 && this.a.k[t0] != null) {
			const rx = (x - this.v0) | 0;
			const ry = (y - this.w0) | 0;
			if (rx >= 3 && rx < 8 && ry >= 3 && ry < 8) {
				const c = this.i[(imul(y, this.g) + x) | 0];
				c.b = b8(c.b ^ -128);
				let ok = true;
				for (let i = 0; i < 5; i++) {
					let rowOk = ok;
					for (let j = 0; j < 5; j++) {
						const set = (this.i[al2.h_(imul((this.w0 + 3 + i) | 0, this.g), this.v0, 3, j)].b & -128) !== 0;
						const want = zw.O[this.a.A][(imul((i + 3) | 0, 8) + 3 + j) | 0] !== 0;
						if (set !== want) {
							rowOk = false;
							break;
						}
					}
					ok = rowOk;
				}
				if (ok) {
					const gi = this.t0;
					const gc = this.i[gi];
					gc.b = b8(gc.b | 32);
					const h = this.a;
					h.j_(h.k[gi], false);
					this.t0 = 0;
				}
			}
		}
	},

	/** void s0(int, int, Point, boolean): sprite offset of the moving actor (cosmetic) */
	s0_(dx, dy, p, z) {
		const d = this.c1;
		this.N0_(dx, dy, d, false);
		let t = this.e0;
		if (this.O != null) {
			if (this.Q != null) t = f32(Math.sqrt(t));
			const N = this.N;
			p.a = f2i(f32(f32(f32(d.a * t) * N) + p.a));
			const nb = f2i(f32(f32(f32(d.b * t) * N) + p.b));
			p.b = nb;
			if (z) {
				const J = this.J;
				if (J !== 0 || this.K !== 0) p.b = f2i(f32(fg2.H_(J, this.K, t) + nb));
			}
			if (this.Q != null && t > 0.5) {
				const u = f32(f32(t - 0.5) * 2);
				const s = f32(f32(Math.fround(Math.sin(u * Math.PI * 0.5)) * 40) * (this.Q.c ? 1 : -1));
				p.a = f2i(f32(s + p.a));
				p.b = f2i(f32(f32(u * 40) + p.b));
			}
		} else {
			const M = this.M;
			if (t < M) {
				const k = fg2.p_(f32(t / M), 0, 1);
				let nb;
				if (this.f1) {
					p.a = f2i(f32(f32(d.a * k) + p.a));
					nb = f2i(f32(f32(d.b * k) + p.b));
				} else {
					const w = f32(f32(1 - k) * this.N);
					p.a = f2i(f32(p.a - f32(d.a * w)));
					nb = f2i(f32(p.b - f32(d.b * w)));
				}
				p.b = nb;
				if (z) {
					const J = this.J;
					if (J !== 0 || this.K !== 0) p.b = f2i(f32(fg2.H_(J, this.K, k) + nb));
				}
			}
		}
	},

	/** void w0(int, int, int, int, int, qw): queue a sound/visual event when audible (cosmetic) */
	w0_(a, b, c, d, e, q) {
		const hero = this.a.f;
		if (hero.t > 0 && !zw.p_(1, 0, hero.b, q.b)) return;
		if (this.q) {
			const ex = (this.a.f.b.a - q.b.a) | 0;
			const ey = (this.a.f.b.b - q.b.b) | 0;
			if (((imul(ey, ey) + imul(ex, ex)) | 0) > this.t) return;
		}
		const pool = this.U0;
		let ev;
		if (this.V0 >= pool.length) {
			ev = new (classes.w20)();
			pool.push(ev);
		} else {
			ev = pool[this.V0];
		}
		ev.a = a;
		ev.b = q;
		ev.c = b;
		ev.d = c;
		ev.e = d;
		ev.f = e;
		this.V0 = (this.V0 + 1) | 0;
	},

	/**
	 * boolean f0(qw door, boolean deep): whether the room behind a door/ladder still has something
	 * (objective, unopened chest 32, closed passage) — false for rooms over 121 cells.
	 */
	f0_(o, deep) {
		const dest = this.a.q_(o);
		if (dest == null) return false;
		if (!dest.e) return true;
		let x = dest.b.a, y = dest.b.b;
		if (dest.a.a === 40) {
			if (dest.c) x = (x - 1) | 0;
			else y = (y + 1) | 0;
		}
		const room = this.a.l[(imul(this.g, y) + x) | 0] & -1024;
		let n = 0;
		for (let yy = 1; yy < ((this.h - 1) | 0); yy++) {
			for (let xx = 1; xx < ((this.g - 1) | 0); xx++) {
				if ((this.a.l[(imul(this.g, yy) + xx) | 0] & -1024) === room) {
					n = (n + 1) | 0;
					if (n > 121) return false;
				}
			}
		}
		const h = this.a;
		const want = h.l[(imul(y, this.g) + x) | 0] & -1024;
		const list = h.n;
		const size = list.length;
		for (let i = 0; i < size; i++) {
			const q = list[i];
			if (q === o || q === dest) continue;
			let qx = q.b.a, qy = q.b.b;
			if (q.a.a === 40) {
				if (q.c) qx = (qx - 1) | 0;
				else qy = (qy + 1) | 0;
			}
			const h2 = this.a;
			if ((h2.l[(imul(qy, this.g) + qx) | 0] & -1024) !== want) continue;
			if (q.f_(h2)) return true;
			const id = q.a.a;
			if (id === 32 && !q.e) return true;
			if (fg2.X_(id, 40, 38, 39)) {
				if (!q.e) return true;
				if (deep && this.f0_(q, false)) return true;
			}
		}
		return false;
	},

	/** void j0(aw, boolean xp, boolean ui): kill rewards: XP, then loot drops (once) */
	j0_(a, xp, ui) {
		if (xp) {
			const t = a.a;
			const st = a.i;
			const lvl = t.v;
			const v = (imul(lvl, lvl <= 4 ? 5 : 4) + st.e) | 0;
			if (v > 0) this.b_(v, a, ui);
		}
		if (!a.e) {
			let dropped;
			if (this.a.b === 26 && fg2.W_(a.a.a, 626, 643) && !vj0.i2.Y0_(70).q_()) {
				const id = a.a.a;
				const d1 = id === 626 ? 309 : 308;
				const d2 = id === 626 ? 307 : 311;
				this.U_(d1);
				this.z0_(a, d1, true, 0);
				this.U_(d2);
				this.z0_(a, d2, true, 1);
				dropped = true;
			} else {
				dropped = false;
				let slot = 0;
				const loot = a.b_();
				if (loot !== 0) {
					this.U_(loot);
					this.z0_(a, loot, true, 0);
					dropped = true;
					slot = 1;
				}
				const extra = a.a.g0;
				if (extra !== 0) {
					this.U_(extra);
					this.z0_(a, extra, true, slot);
					slot = (slot + 1) | 0;
					dropped = true;
				}
				if (a.a.l0 && fg2.W_(a.h, 1100, 1101)) {
					this.U_(222);
					this.z0_(a, 222, true, slot);
					dropped = true;
				}
			}
			a.e = true;
			if (dropped) {
				if (ui) {
					this.e.H_();
					return;
				}
				this.d1 = true;
			}
		}
	},

	/** void I(aw, Point): face toward a point */
	I_(a, p) {
		const pos = a.b;
		const dx = (p.a - pos.a) | 0;
		const dy = (p.b - pos.b) | 0;
		if (dx !== 0 || dy !== 0) {
			if (!pos.c_(p)) {
				const d = this.b1;
				this.N0_(dx, dy, d, false);
				a.c = d.a < 0;
			} else {
				a.a_(dx, dy);
			}
		}
	},

	/** void w(aw, int): heal up to max HP; the overflow reduces aw.u */
	w_(a, v) {
		if (v > 0) {
			const max = a.q_();
			const hp = a.j;
			if (hp.v_() < max) {
				const old = hp.v_();
				a.A_(Math.min((hp.v_() + v) | 0, max));
				const got = (hp.v_() - old) | 0;
				const rest = (v - got) | 0;
				const u = a.u;
				if (u > 0 && rest > 0) a.u = Math.max((u - rest) | 0, 0);
				this.A0_(got, -14626784, a);
			}
		}
	},

	/** void n(aw, boolean): an ally standing on a hidden trap triggers it */
	n_(a, z) {
		if (a.k === 1) {
			const c = this.i[(imul(a.b.b, this.g) + a.b.a) | 0];
			if (c.b_() === 32) {
				c.b = b8(b8(c.b & -97) | 64);
				this.e_(14, null, a, null, null, 0);
				if (z) this.J0_(a, null);
			}
		}
	},

	/** uw R(qw): hired companion record of a companion critter (types 190..) */
	R_(q) {
		return this.a.p[(q.a.a - 190) | 0];
	},

	/** void b(int xp, qw, boolean ui): give XP to the hero (and MP-ish C), then to companions */
	b_(v, q, ui) {
		if (v > 0) {
			const got = this.a.e.a_(v);
			if (got > 0) {
				const hero = this.a.f;
				hero.F_((hero.C_() + got) | 0);
				if (q != null) this.A0_(got, -8335232, q);
				if (ui) this.e.b0_(true);
				else this.e1 = true;
			}
			this.c_(v);
		}
	},

	/** void U(int id): add a picked-up item to the backpack and the collection log */
	U_(id) {
		this.a.f.D.b_(id, 1);
		vj0.i2.a_(vj0.Z1.get(id), 1, true);
	},

	/** boolean r(int idx): cell in the current room(s) g1/h1, visible, and not an unopened type-9 cell */
	r_(i) {
		const room = this.a.l[i];
		if (room !== this.g1) {
			const h1 = this.h1;
			if (h1 === 0 || room !== h1) return false;
		}
		if (this.j[i] > 0) {
			const c = this.i[i];
			if (c.a !== 9 || (c.b & 32) !== 0) return true;
		}
		return false;
	},

	/** boolean s(int idx): cell in the current room(s) g1/h1 and visible */
	s_(i) {
		const room = this.a.l[i];
		if (room !== this.g1) {
			const h1 = this.h1;
			if (h1 === 0 || room !== h1) return false;
		}
		return this.j[i] > 0;
	},

	/** void c(int xp): share XP with hired companions (amulet 236 +50%, absent companions 80%) */
	c_(v) {
		if (v > 0) {
			for (let i = 0; i < 3; i++) {
				const h = this.a;
				if (h.v[i] == null) continue;
				const u = h.e.l[i];
				const k = u.k;
				const it = u.l;
				const bonus = k > 0 && it.a === 236 ? 50 : 0;
				let x = bonus > 0 ? idiv(imul((bonus + 100) | 0, v), 100) : v;
				if (this.a.v[i].a == null) x = Math.max(idiv(imul(x, 80), 100), 1);
				if (x > 0) {
					const got = u.a_(x);
					if (got > 0) {
						const hp = this.a.v[i].d;
						hp.z_((hp.v_() + got) | 0);
						const ca = this.a.v[i].a;
						if (ca != null) this.A0_(got, -8335232, ca);
					}
				}
			}
		}
	},

	/** void l(): skill 12 (u): reveal sealed objects and doors 28/29 within 2 cells (1 while t > 0) */
	l_() {
		if (this.u) {
			const hero = this.a.f;
			const r = hero.t > 0 ? 1 : 2;
			for (let y = Math.max((hero.b.b - r) | 0, 0); y <= Math.min((this.a.f.b.b + r) | 0, (this.h - 1) | 0); y++) {
				for (let x = Math.max((this.a.f.b.a - r) | 0, 0); x <= Math.min((this.a.f.b.a + r) | 0, (this.g - 1) | 0); x++) {
					const i = (imul(this.g, y) + x) | 0;
					if (this.j[i] > 0) {
						const q = this.a.k[i];
						if (q != null && !q.e_() && !q.d) {
							if (q.i_(this.a.e) <= 0) {
								const id = q.a.a;
								if (id !== 28 && id !== 29) continue;
							}
							q.d = true;
						}
					}
				}
			}
		}
	},
}, {
	/** static int M(int v, int max, boolean fine): drawable id of a pip/bar icon (cosmetic) */
	M_(v, max, fine) {
		if (v > 0 && v < max) {
			if (fine) {
				let k;
				if (max === 3) {
					k = v === 2 ? 5 : 3;
				} else {
					const v8 = imul(v, 8);
					k = max < 8 ? Math.max(idiv(v8, max), 1) : (idiv((v8 - 1) | 0, max) + 1) | 0;
				}
				if (k <= 7) {
					switch (k) {
						case 1: return 2131231145;
						case 2: return 2131231146;
						case 3: return 2131231147;
						case 4: return 2131231148;
						case 5: return 2131231149;
						case 6: return 2131231150;
						case 7: return 2131231151;
						default: break;
					}
				}
			} else {
				let k;
				if (max === 3) k = v === 2 ? 3 : 1;
				else k = (idiv((imul(v, 4) - 1) | 0, max) + 1) | 0;
				if (k <= 3) {
					if (k === 1) return 2131231142;
					if (k === 2) return 2131231143;
					return 2131231144;
				}
			}
		}
		return 0;
	},
});

/** l0's camera-follow block (DungameView fields only; skipped when W). Float math as in smali. */
function cameraFollow(c, v, edge) {
	let u = v.u || c;
	const p0 = u.p0, q0 = u.q0;
	if (typeof v.a0_ === 'function') v.a0_();
	const w = idiv(idiv(v.I | 0, 64), 2) >= 6 && idiv(idiv(v.J | 0, 32), 2) >= 7 ? 224 : 160;
	u = v.u || c;
	const cx = u.p0, F = f32(v.F || 0);
	const sx = f32(cx * F);
	const cy = u.q0;
	const sy = f32(cy * F);
	const bw = f32(f2i(f32(w * F)));
	const bh = f2i(f32(bw * 0.75));
	const ow = f32(f2i(f32(F * 518)));
	const oh = f2i(f32(ow * 0.75));
	const r0 = u.r0, s0 = u.s0;
	let t = f32(f32(p0 * F) - r0);
	t = f32(t * t);
	let dOld = f32(f32(F * q0) - s0);
	dOld = f32(f32(dOld * dOld) + t);
	let t2 = f32(sx - r0);
	t2 = f32(t2 * t2);
	let dNew = f32(sy - s0);
	dNew = f32(f32(dNew * dNew) + t2);
	let go = edge || v.h0;
	if (!go) {
		if (dNew > dOld) {
			go = r0 < f32(sx - bw) || s0 < f32(sy - bh) || r0 > f32(bw + sx) || s0 > f32(bh + sy);
		}
		if (!go) go = r0 < f32(sx - ow) || s0 < f32(sy - oh) || r0 > f32(sx + ow) || s0 > f32(sy + oh);
	}
	if (go) {
		v.i0 = cx;
		v.j0 = cy;
		if (edge) {
			v.i0 = al2.g_(cx, p0, 1, cx);
			v.j0 = al2.g_(cy, q0, 1, cy);
		}
		v.h0 = true;
		if (v.g0 != null && typeof v.g0.forceFinished === 'function') v.g0.forceFinished(true);
	}
}
