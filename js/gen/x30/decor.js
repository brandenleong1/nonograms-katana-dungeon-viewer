// x30 decoration: p0 (room themes), o0 (floor themes), y (boardwalk / floor cross patterns),
// h0 / g0 / f0 (wall decoration), T / U (decoration objects from xs.X / Y / Z / a0).
// Source: decompiled/vineflower/x30.java p0 (~11822), o0 (~11697), y (~12991), h0 (~10042),
// g0 (~9876), f0 (~8755), T (~6462), U (~6516). o0, g0 and h0 were checked against smali where the
// JADX output differs (JADX drops a condition in o0 and garbles g0's 9/11 branch).
import { install } from './index.js';
import { b8, imul, idiv, get } from '../jrt.js';
import { xs, vj0 } from '../statics.js';
import { classes } from '../registry.js';
import { fg2 } from '../model.js';

install({
	/** void p0(boolean special): pick room themes (u30.w) from xs.Q (special pass) or the per-world table. */
	p0_(first) {
		if (this.c.E && first) return;
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; ) {
			const r = get(rooms, i);
			i++;
			if (first && !r.a_(true)) continue;
			if (r.w !== 0 || r.g || r.f || fg2.X_(r.v, 10, 11, 12)) continue;
			let tbl;
			if (first) {
				tbl = xs.Q;
			} else {
				const pw = this.c;
				if (pw.G) tbl = xs.W;
				else if (pw.E) tbl = r.r ? xs.T : xs.S;
				else if (pw.F) tbl = r.r ? xs.V : xs.U;
				else tbl = xs.R;
			}
			const t = tbl.b_(this.e);
			if (t == null) continue;
			const th = t.i;
			const lvl = this.b.b;
			if (lvl < t.m) continue;
			const cnt = this.p;
			const used = cnt[th];
			if (used >= t.l) continue;
			const j = t.j;
			if (j !== 0 && (r.c < j || r.d < j)) continue;
			const k = t.k;
			if (k !== 0 && r.y < k) continue;
			r.w = th;
			cnt[th] = (used + 1) | 0;
			const sub = t.t;
			if (sub != null && lvl >= sub.m && cnt[sub.i] < sub.l) {
				if (this.e.h_(100) < t.t.c) {
					const s = t.t.i;
					r.w = s;
					cnt[s] = (cnt[s] + 1) | 0;
				}
			}
		}
	},

	/** void o0(): floor theme u30.x per room (cosmetic stream f). */
	o0_() {
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; ) {
			const r = get(rooms, i);
			i++;
			if (r.x !== 0) continue;
			const w = r.w;
			const P = xs.P[w];
			const pw = this.c;
			if (pw.H) {
				if (P.e !== 0) r.x = P.e;
				continue;
			}
			const f = this.f;
			if (pw.G) {
				pick: {
					if (w !== 1) {
						let v = P.e;
						if (v !== 0) {
							if (P.f !== 0) v = P.f;
							r.x = v;
							break pick;
						}
						const k = f.h_(130);
						if (k >= 20) {
							if (k < 32) {
								if (!r.g) r.x = 23;
							} else if (k < 44 && !r.g) {
								r.x = 22;
							}
							break pick;
						}
					}
					if (!r.g && !r.f && !fg2.Z_(r.v, 10, 11, 12, 4, 5)) r.x = 24;
				}
				if (r.x === 0) r.x = 20;
			} else if ((pw.E || pw.F) && !r.r && P.e === 0) {
				if (pw.F) this.y_(r, true);
				r.x = this.c.E ? 14 : 17;
			} else {
				if (w === 1 && r.b_()) {
					r.x = 4;
				} else {
					const v = P.e;
					if (v !== 0) {
						r.x = v;
					} else {
						const k = f.h_(130);
						if (k < 20) {
							if (!r.g && !fg2.Z_(r.v, 10, 11, 12, 4, 5)) r.x = 4;
						} else if (k < 30) {
							if (!r.g && r.w !== 4 && (fg2.W_(r.v, 0, 5) || (!this.c.C && fg2.X_(r.v, 4, 7, 6)))) r.x = 3;
						} else if (k < 40 && !r.g) {
							r.x = 5;
						}
					}
				}
				if (this.y_(r, false)) r.x = 8;
			}
		}
	},

	/**
	 * boolean y(u30 room, boolean boardwalk): in a 7..10 square-ish plain room, mark a centre cross, a
	 * horizontal or a vertical strip of floor cells b = 8 (boardwalk: b = 18 plus x30.b along it).
	 */
	y_(r, z) {
		if (r.x === 0 && !r.g && !r.f && fg2.W_(r.v, 0, 1)) {
			let mark = 8;
			if (!fg2.X_(r.w, 4, 8, 26)) {
				const c = r.c;
				if (c >= 7) {
					const d = r.d;
					if (d >= 7 && c < 11 && d < 11) {
						if (this.g[(idiv(c, 2) + imul((idiv(d, 2) + r.b) | 0, this.h) + r.a) | 0].h_()) {
							const k = this.f.h_(100);
							if (k < 50) {
								let cross, horiz, vert;
								if (k < 20) {
									if (z) return false;
									vert = false;
									horiz = 0;
									cross = true;
								} else if (k < 35) {
									cross = false;
									vert = false;
									horiz = 1;
								} else {
									cross = false;
									horiz = 0;
									vert = true;
								}
								if (z) mark = 18;
								let x0;
								if (cross) x0 = (idiv(r.c, 2) - 1) | 0;
								else if (horiz !== 0) x0 = 0;
								else x0 = idiv(r.c, 2);
								let y0 = 0;
								if (cross) y0 = (idiv(r.d, 2) - 1) | 0;
								else if (!vert) y0 = idiv(r.d, 2);
								let x1;
								if (cross) x1 = (x0 + 3) | 0;
								else if (horiz !== 0) x1 = r.c;
								else x1 = (x0 + 1) | 0;
								let y1;
								if (cross) y1 = (y0 + 3) | 0;
								else if (vert) y1 = r.d;
								else y1 = (y0 + 1) | 0;
								for (let yy = y0; yy < y1; yy++) {
									for (let xx = x0; xx < x1; xx++) {
										const j = (imul((r.b + yy) | 0, this.h) + r.a + xx) | 0;
										if (this.g[j].h_() && this.m[j] === r.e) this.g[j].b = mark;
									}
								}
								if (z) this.b_((r.a + x0) | 0, (r.b + y0) | 0, horiz, horiz ^ 1, horiz !== 0 ? r.c : r.d, false);
								return true;
							}
						}
					}
				}
			}
		}
		return false;
	},

	/**
	 * void h0(): wall decoration. Room-top / room-right wall marks (3, egypt 23), then wall decor g0 along
	 * horizontal and vertical wall runs, tree-edge f0 on outdoor borders, and corner styles 12 / 16 / 17.
	 */
	h0_() {
		const mark = this.c.G ? 23 : 3;
		const rooms = this.n;
		const n = rooms.length;
		let f = this.f;
		for (let i = 0; i < n; ) {
			f = this.f;
			const r = get(rooms, i);
			i++;
			const pw = this.c;
			if ((pw.E || pw.F) && !r.r) continue;
			if (pw.G && r.g) continue;
			if (fg2.X_(r.w, 2, 13, 14)) continue;
			if (r.b_()) continue;
			if (r.c < 5 || r.d < 5) continue;
			const k = f.h_(100);
			if (k >= 60) continue;
			if (k < 30) {
				const j = (imul((r.b - 1) | 0, this.h) + r.a + idiv(r.c, 2)) | 0;
				if (!this.g[j].v_()) continue;
				const g = this.g;
				if (g[(j - 1) | 0].a !== 2 || g[(j + 1) | 0].a !== 2) continue;
				const b = (this.h + j) | 0;
				if (g[b].a !== 1 || g[(b - 1) | 0].a !== 1 || g[(b + 1) | 0].a !== 1) continue;
				g[j].b = mark;
			} else {
				const j = (imul((idiv(r.d, 2) + r.b) | 0, this.h) + r.a + r.c) | 0;
				if (!this.g[j].v_()) continue;
				const g = this.g;
				const W = this.h;
				const up = (j - W) | 0;
				if (g[up].a !== 2) continue;
				const dn = (W + j) | 0;
				if (g[dn].a !== 2) continue;
				if (g[(j - 1) | 0].a !== 1 || g[(up - 1) | 0].a !== 1 || g[(dn - 1) | 0].a !== 1) continue;
				g[j].b = mark;
			}
		}

		// horizontal wall runs (decor faces down); a cell that is not tree-edge skips its neighbour too
		for (let y = 0; y < this.i - 1; y++) {
			for (let x = 2; x < this.h - 2; ) {
				const j = (imul(this.h, y) + x) | 0;
				const isWall = this.g[j].v_();
				const g = this.g;
				if (isWall) {
					if (g[(j - 1) | 0].v_() && this.g[(j + 1) | 0].v_() && this.g[(j - 2) | 0].x_() && this.g[(j + 2) | 0].x_()
						&& this.g[(this.h + j) | 0].k_() && this.g[(this.h + j - 1) | 0].k_() && this.g[(this.h + j + 1) | 0].k_()) {
						this.g0_(j, (this.h + j) | 0, 1);
						x = (x + 2) | 0;
					}
				} else if (!g[j].q_()) {
					x = (x + 1) | 0;
				} else if (this.g[(j - 1) | 0].q_() && this.g[(j + 1) | 0].q_() && this.g[(this.h + j) | 0].g_()
					&& this.g[(this.h + j - 1) | 0].g_() && this.g[(this.h + j + 1) | 0].g_()) {
					this.f0_(j, (this.h + j) | 0);
					x = (x + 2) | 0;
				}
				x = (x + 1) | 0;
			}
		}

		// vertical wall runs (decor faces left)
		for (let x = 1; x < this.h; x++) {
			for (let y = 2; y < this.i - 2; ) {
				const j = (imul(this.h, y) + x) | 0;
				const isWall = this.g[j].v_();
				const g = this.g;
				if (isWall) {
					if (g[(j - this.h) | 0].v_() && this.g[(this.h + j) | 0].v_() && this.g[(j - imul(this.h, 2)) | 0].x_()
						&& this.g[(imul(this.h, 2) + j) | 0].x_() && this.g[(j - 1) | 0].k_() && this.g[(j - this.h - 1) | 0].k_()
						&& this.g[(this.h + j - 1) | 0].k_()) {
						this.g0_(j, (j - 1) | 0, this.h);
						y = (y + 2) | 0;
					}
				} else if (!g[j].q_()) {
					y = (y + 1) | 0;
				} else if (this.g[(j - this.h) | 0].q_() && this.g[(this.h + j) | 0].q_() && this.g[(j - 1) | 0].g_()
					&& this.g[(j - this.h - 1) | 0].g_() && this.g[(this.h + j - 1) | 0].g_()) {
					this.f0_(j, (j - 1) | 0);
					y = (y + 2) | 0;
				}
				y = (y + 1) | 0;
			}
		}

		// wall corners: 12 next to an inner corner (x30.v), 16 / 17 corner pieces, tree-edge b |= 16
		for (let x = 1; x < this.h; x++) {
			for (let y = 0; y < this.i - 1; y++) {
				const W = this.h;
				const j = (imul(y, W) + x) | 0;
				const g = this.g;
				const c = g[j];
				if (c.a === 2) {
					const L = (j - 1) | 0;
					if ((x < W - 1 && y > 0 && g[(j + 1) | 0].a === 2 && g[(j - W) | 0].a === 2 && this.v_((j + 1 - W) | 0))
						|| (this.g[L].a === 2 && this.g[(j + this.h) | 0].a === 2 && this.v_((this.h + L) | 0))
						|| (y > 0 && this.g[L].a === 2 && this.g[(j - this.h) | 0].a === 2 && this.v_((L - this.h) | 0))
						|| (x < this.h - 1 && this.g[(j + 1) | 0].a === 2 && this.g[(j + this.h) | 0].a === 2 && this.v_((j + 1 + this.h) | 0))) {
						this.g[j].b = 12;
						continue;
					}
					if (this.g[L].v_() && this.g[(this.h + j) | 0].v_() && this.g[(this.h + j - 1) | 0].k_()) {
						if (this.c.G) continue;
						if (x >= 2 && this.g[(j - 2) | 0].r_(2, 7)) continue;
						if (y < this.i - 2 && this.g[(imul(this.h, 2) + j) | 0].r_(2, 7)) continue;
						if (f.h_(100) < 40) this.g[j].b = 16;
						continue;
					}
					const W2 = this.h;
					if (x < W2 - 1 && y > 0) {
						const g2 = this.g;
						if (g2[(j + 1) | 0].a === 2 && g2[(j - W2) | 0].a === 2 && g2[L].l_()
							&& this.g[(this.h + j) | 0].l_() && this.g[(this.h + j - 1) | 0].l_() && f.h_(100) < 35) {
							this.g[j].b = 17;
						}
					}
				} else if (c.q_() && this.g[(j - 1) | 0].q_() && this.g[(this.h + j) | 0].q_() && this.g[(this.h + j - 1) | 0].k_()
					&& f.h_(100) < 15) {
					const cc = this.g[j];
					cc.b = b8(cc.b | 16);
				}
			}
		}
	},

	/**
	 * void g0(int cell, int floor, int step): wall decor b for `cell` from the theme of the room owning
	 * `floor` (xs.P[w].o / .p weights), sometimes copied to the wall cells at cell -/+ step.
	 */
	g0_(cell, below, step) {
		let r = null;
		const ri = this.m[below];
		if (ri >= 0) {
			const rooms = this.n;
			if (ri < rooms.length) r = get(rooms, ri);
		}
		const w = r != null ? r.w : 0;
		const P = xs.P;
		const f = this.f;
		let v;
		if (r != null && r.g) {
			v = 1;
		} else if (this.c.E && (r == null || !r.r)) {
			v = b8(P[19].o.b_(f));
		} else if (w !== 0) {
			if (r.b_()) {
				v = 12;
			} else if (w === 2 && this.c.C && !this.c.G) {
				v = f.h_(100) < 50 ? 9 : 11;
			} else {
				const t = P[w];
				let y = t.o;
				if (y != null) {
					if (this.b.c.G && t.p != null) y = t.p;
					v = b8(y.b_(f));
				} else {
					v = -1;
				}
			}
		} else {
			v = -1;
		}

		if (v === -1) {
			const pw = this.c;
			let k = 0;
			if (pw.G) k = 27;
			else if (pw.E && (r == null || !r.o)) k = 18;
			v = b8(P[k].o.b_(f));
		}
		if (v === 0) return;

		this.g[cell].b = v;
		if (fg2.X_(v, 9, 24, 15)) {
			if (!this.c.G) {
				if (f.h_(3) === 0) this.g[(cell - step) | 0].b = v;
				if (f.h_(3) === 0) this.g[(cell + step) | 0].b = v;
			} else {
				const k = f.h_(3);
				if (k === 0 || k === 2) this.g[(cell - step) | 0].b = v;
				if (k === 1 || k === 2) this.g[(cell + step) | 0].b = v;
			}
		} else if (v === 12) {
			if (w === 1) {
				const g = this.g;
				g[(cell - step) | 0].b = v;
				g[(cell + step) | 0].b = v;
			}
		} else if (fg2.Z_(v, 18, 19, 20, 21, 22)) {
			const k = f.h_(3);
			if (k === 0 || k === 2) {
				const c = this.g[(cell - step) | 0];
				let nb;
				do {
					nb = b8(f.h_(5) + 18);
				} while (nb === v);
				c.b = nb;
			}
			if (k === 1 || k === 2) {
				const c = this.g[(cell + step) | 0];
				let nb;
				do {
					nb = b8(f.h_(5) + 18);
				} while (nb === v);
				c.b = nb;
			}
		}
	},

	/** void f0(int cell, int floor): tree-edge cell: low 5 bits of b = 1 (always next to a g-room, else 60%). */
	f0_(cell, below) {
		let r = null;
		const ri = this.m[below];
		if (ri >= 0) {
			const rooms = this.n;
			if (ri < rooms.length) r = get(rooms, ri);
		}
		let v = r != null && r.g ? 1 : -1;
		if (v === -1) v = this.f.h_(100) < 60 ? 1 : 0;
		if (v !== 0) {
			const c = this.g[cell];
			c.b = b8((c.b & -32) | v);
		}
	},

	/** void T(): decoration objects per room from xs.X (classic), Y (forest), Z (cave), a0 (egypt). */
	T_() {
		for (let i = 0; ; i++) {
			const rooms = this.n;
			if (i >= rooms.length) return;
			const r = get(rooms, i);
			if (r.g || xs.P[r.w].i) continue;
			const pw = this.c;
			let tbl;
			if (pw.G) tbl = xs.a0;
			else if (pw.F && !r.r) tbl = xs.Z;
			else if (pw.E && !r.r) tbl = xs.Y;
			else tbl = xs.X;
			for (let k = 0, n = tbl.length; k < n; k++) {
				const t = tbl[k];
				const lvl = this.b.b;
				let min;
				if (this.c.E && t.n !== 0) min = t.n;
				else min = t.m;
				if (lvl < min) continue;
				if (t.o !== 0 && !vj0.i2.Y0_(t.o).v_()) continue;
				if (t.p !== 0 && !vj0.i2.o[t.p].h0_(t.q)) continue;
				this.U_(r, t, null, false);
			}
		}
	},

	/**
	 * void U(u30 room, t30 entry, Util$Point near, boolean adjacent): place one decoration entry (a choice
	 * node recurses into a child; follow-ups t.v are placed next to object t.u when placed).
	 */
	U_(r, t, pt, z) {
		const ti = t.i;
		const cnt = t.a;
		const w = r.w;
		if (!(ti === w || (ti === 0 && !xs.P[w].j))) return;
		const ex = t.y;
		if (ex != null && w !== 0) {
			for (let k = 0, n = ex.length; k < n; k++) if (ex[k] === r.w) return;
		}
		const j = t.j;
		if (j !== 0 && !(r.c >= j && r.d >= j)) return;
		const kk = t.k;
		if (kk !== 0 && r.y < kk) return;
		if (t.s != null) {
			const c = t.b_(this.e);
			if (c != null) this.U_(r, c, null, false);
			return;
		}
		if (t.x) {
			pt = new classes['Util$Point']();
			const ra = r.a;
			pt.a = ra;
			const rc = r.c;
			if (rc >= 5) pt.a = (this.e.h_((rc - 4) | 0) + 2 + ra) | 0;
			const rb = r.b;
			pt.b = rb;
			const rd = r.d;
			if (rd >= 5) pt.b = (this.e.h_((rd - 4) | 0) + 2 + rb) | 0;
			z = false;
		}
		const n = t.d ? cnt : Math.max(idiv(imul(r.y, cnt), 25), 1);
		for (let k = 0; k < n; k++) {
			const id = t.r.b_(this.e);
			if (id === 0) continue;
			const o = this.R_(r, id, t.h, t.e, !t.f, t.g, pt, z, false);
			if (o != null) {
				const u = t.u;
				if (u !== 0 && id === u) {
					const near = t.w;
					this.U_(r, t.v, near ? o.b : null, near);
				}
			}
		}
	},
});
