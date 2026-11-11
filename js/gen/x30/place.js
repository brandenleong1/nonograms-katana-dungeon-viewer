// x30 object placement: R (place one object in a room), i (floor spot search), k (does an object
// there block a passage), S (chests and pw.t specials), C (pages / loot containers), D (rare 85/86/87).
// Source: decompiled/vineflower/x30.java R (~5918), i (~10398), k (~11175), S (~6189), C (~2580),
// D (~2631). R, i and k were checked against smali (both decompiles mangle their register reuse);
// variable names in k follow the smali registers because the bit-fields have no clean meaning.
import { install, x30 } from './index.js';
import { imul, idiv, irem, iabs, get, removeAt } from '../jrt.js';
import { xs, zw, vj0 } from '../statics.js';
import { classes } from '../registry.js';
import { fg2, lz0 } from '../model.js';

install({
	/**
	 * qw R(u30 room, int id, int margin, boolean wall, boolean strict, boolean many, Util$Point near,
	 *      boolean adjacent, boolean noDoorsNear)
	 * Place object `id` in `room`: on the top or right wall when `wall`, else via i(). Returns the qw or null.
	 */
	R_(u, id, margin, wall, z2, z3, pt, z4, z5) {
		const rw = zw.Q.get(id);
		let flip;
		if (!rw.f || wall) flip = false;
		else flip = this.f.h_(2) === 0;

		let jw = null;
		if (wall) {
			const multi = rw.r_();
			tries: for (let t = 0; t < 7; t++) {
				let r = this.e.h_((u.c + u.d) | 0);
				let top;
				if (r >= u.c) {
					r = (r - u.c) | 0;
					top = 0;
				} else {
					top = 1;
				}
				let x = u.a, y = u.b;
				if (top !== 0) {
					x = (x + r) | 0;
				} else {
					x = (x + (u.c - 1)) | 0;
					y = (y + r) | 0;
				}
				// walk inward (down from the top edge, left from the right edge) to the first room floor cell
				for (;;) {
					const idx = (imul(this.h, y) + x) | 0;
					if (this.m[idx] === u.e && !fg2.W_(this.g[idx].a, 2, 7)) break;
					if (top !== 0) {
						y = (y + 1) | 0;
						if (y >= ((u.b + u.d - 1) | 0)) continue tries;
					} else {
						x = (x - 1) | 0;
						if (x <= ((u.a + 1) | 0)) continue tries;
					}
				}
				const ofs = top !== 0 ? 0 : -1;
				if (!this.g[(imul((y - top) | 0, this.h) + x - ofs) | 0].y_()) continue;
				if (!this.p_(x, y, true, true)) continue;
				const fl = (top ^ 1) !== 0;
				let w, hh; // smali v8 (extent along x), v3 (extent along y)
				if (multi) {
					if (top !== 0) {
						let k = 1;
						for (; k < (top === 0 ? rw.U : rw.T); k++) {
							if (!this.g[lz0.h_((y - 1) | 0, this.h, x, k)].y_()) continue tries;
						}
						w = k;
						hh = 1;
					} else {
						let k = 1;
						for (; k < (top === 0 ? rw.T : rw.U); k++) {
							if (!this.g[lz0.h_((y - k) | 0, this.h, x, 1)].y_()) continue tries;
						}
						hh = k;
						w = 1;
					}
				} else {
					hh = 1;
					w = 1;
				}
				if (top !== 0) {
					const W = this.h;
					if (((x + w) | 0) >= W) continue;
					const g = this.g;
					if (g[lz0.h_(y, W, x, w)].a === 1 && g[(imul((y - 1) | 0, W) + x + w) | 0].a === 1) continue;
				} else {
					let j = (y - hh) | 0;
					if (j < 0) continue;
					const g = this.g;
					j = (imul(j, this.h) + x) | 0;
					if (g[j].a === 1 && g[(j + 1) | 0].a === 1) continue;
				}
				if (multi) {
					if (top !== 0) y = (y + ((top === 0 ? rw.T : rw.U) - 1)) | 0;
					else x = (x - ((top === 0 ? rw.U : rw.T) - 1)) | 0;
					for (let a = 0; a < (top === 0 ? rw.T : rw.U); a++) {
						for (let b = 0; b < (top === 0 ? rw.U : rw.T); b++) {
							if (!this.p_((x + b) | 0, (y - a) | 0, true, true)) continue tries;
						}
					}
				}
				if (!this.k_(x, y, rw, fl)) continue;
				if (rw.Q) {
					if (multi) {
						const dx = ((top === 0 ? rw.U : rw.T) - 1) | 0;
						const dy = ((top === 0 ? rw.T : rw.U) - 1) | 0;
						if (this.g[(imul((y - dy - 1) | 0, this.h) + x + dx + 1) | 0].t_()) continue;
					} else if (this.g[lz0.h_((y - 1) | 0, this.h, x, 1)].t_()) {
						continue;
					}
				}
				jw = new classes.jw(x, y, fl);
				break;
			}
		} else {
			jw = this.i_(u, z2, margin, z3, rw, flip, pt, z4, z5);
		}

		if (jw == null) return null;
		const hw = this.b;
		const o = new classes.qw(rw);
		const p = o.b;
		p.a = jw.a;
		p.b = jw.b;
		o.c = jw.c;
		hw.g_(o, true);
		return o;
	},

	/**
	 * jw i(u30 room, boolean strict, int margin, boolean many, rw type, boolean flip, Util$Point near,
	 *      boolean adjacent, boolean noDoorsNear)
	 * Random floor spot search (7 or 50 tries). `near` + `adjacent`: a 4-neighbour of near; `near` alone:
	 * growing 3/5/7/9 boxes around near for the first 40 tries, then anywhere in the (inset) room.
	 */
	i_(u, z2, margin, many, rw, flip, pt, z4, z5) {
		let x0 = u.a, y0 = u.b, w = u.c, hgt = u.d;
		if (margin > 0) {
			const mx = Math.min(margin, idiv((w - 1) | 0, 2));
			const my = Math.min(margin, idiv((u.d - 1) | 0, 2));
			x0 = (x0 + mx) | 0;
			y0 = (y0 + my) | 0;
			w = (w - imul(mx, 2)) | 0;
			hgt = (hgt - imul(my, 2)) | 0;
		}
		const multi = rw != null && rw.r_();
		const n = many ? 50 : 7;

		search: for (let t = 0; t < n; t++) {
			let x, y;
			if (pt != null && z4) {
				const px = pt.a;
				y = pt.b;
				const r = this.e.h_(4);
				const d = (r & 1) !== 0 ? 1 : -1;
				if ((r & 2) !== 0) {
					x = (px + d) | 0;
				} else {
					y = (y + d) | 0;
					x = px;
				}
			} else if (pt != null && t < 40) {
				let s;
				if (t < 10) s = 3;
				else if (t < 20) s = 5;
				else if (t < 30) s = 7;
				else s = 9;
				const half = idiv(s, 2);
				x = (this.e.h_(s) + pt.a - half) | 0;
				y = (this.e.h_(s) + pt.b - half) | 0;
				if (x < x0 || y < y0 || x >= ((x0 + w) | 0) || y >= ((y0 + hgt) | 0)) continue;
			} else {
				x = (this.e.h_(w) + x0) | 0;
				y = (this.e.h_(hgt) + y0) | 0;
			}

			const idx = (imul(this.h, y) + x) | 0;
			if (this.m[idx] !== u.e) continue;
			if (!this.p_(x, y, true, z2)) continue;
			if (rw != null) {
				if (rw.P !== 0) {
					if ((rw.P & 2) !== 0) {
						const j = (idx + 1) | 0;
						if (!this.g[j].h_() || this.b.k[j] != null) continue;
						const up = (idx - this.h) | 0;
						if (!this.g[up].h_() || this.b.k[(idx - this.h) | 0] != null) continue;
					}
					if ((rw.P & 1) !== 0) {
						const j = (idx - 1) | 0;
						if (!this.g[j].h_() || this.b.k[j] != null) continue;
						const dn = (idx + this.h) | 0;
						if (!this.g[dn].h_() || this.b.k[(idx + this.h) | 0] != null) continue;
					}
				}
				if (rw.R) {
					if (!this.g[(imul((y - 1) | 0, this.h) + x) | 0].m_()) continue;
					if (!this.g[lz0.h_(y, this.h, x, 1)].m_()) continue;
				}
			}

			if (multi) {
				for (let a = 0; a < (flip ? rw.T : rw.U); a++) {
					for (let b = 0; b < (flip ? rw.U : rw.T); b++) {
						if (a === 0 && b === 0) continue;
						const yy = (y - a) | 0;
						if (!this.p_((x + b) | 0, yy, true, z2)) continue search;
						const P = rw.P;
						if (P !== 0) {
							const j = lz0.h_(yy, this.h, x, b);
							if ((P & 2) !== 0) {
								if (!this.g[(j + 1) | 0].h_() || this.b.k[(j + 1) | 0] != null) continue search;
								if (!this.g[(j - this.h) | 0].h_() || this.b.k[(j - this.h) | 0] != null) continue search;
							}
							if ((rw.P & 1) !== 0) {
								if (!this.g[(j - 1) | 0].h_() || this.b.k[(j - 1) | 0] != null) continue search;
								if (!this.g[(this.h + j) | 0].h_() || this.b.k[(j + this.h) | 0] != null) continue search;
							}
						}
					}
				}
			}

			if (rw != null && rw.u) {
				const g = this.g;
				if (g[(idx - 1) | 0].d_()) continue;
				if (g[(idx + 1) | 0].d_()) continue;
				if (g[(idx - this.h) | 0].d_()) continue;
				if (g[(idx + this.h) | 0].d_()) continue;
				if (g[(idx - this.h - 1) | 0].d_()) continue;
				if (g[(idx - this.h + 1) | 0].d_()) continue;
				if (g[(idx + this.h - 1) | 0].d_()) continue;
				if (g[(idx + this.h + 1) | 0].d_()) continue;
			}

			if (z5) {
				const j0 = (imul(this.h, y) + x) | 0;
				const m2 = rw != null && rw.r_();
				const ow = m2 ? (flip ? rw.U : rw.T) : 1;
				const dh = m2 ? imul(flip ? rw.T : rw.U, this.h) : this.h;
				const top = (j0 - dh) | 0;
				if (this.n_((top - 1) | 0)) continue;
				if (this.n_((top + ow) | 0)) continue;
				if (this.n_((j0 + this.h - 1) | 0)) continue;
				if (this.n_((j0 + this.h + ow) | 0)) continue;
				if (m2) {
					const nw = flip ? rw.U : rw.T;
					for (let k = 0; k < nw; k++) {
						if (this.n_((top + k) | 0)) continue search;
						if (this.n_((j0 + this.h + k) | 0)) continue search;
					}
					const nh = flip ? rw.T : rw.U;
					for (let k = 0; k < nh; k++) {
						if (this.n_((j0 - imul(this.h, k) - 1) | 0)) continue search;
						if (this.n_((j0 - imul(this.h, k) + ow) | 0)) continue search;
					}
				} else {
					if (this.n_((j0 - this.h) | 0)) continue;
					if (this.n_((j0 + this.h) | 0)) continue;
					if (this.n_((j0 - 1) | 0)) continue;
					if (this.n_((j0 + 1) | 0)) continue;
				}
			}

			if (!z2 || this.k_(x, y, rw, flip)) return new classes.jw(x, y, flip);
		}
		return null;
	},

	/**
	 * boolean k(int x, int y, rw type, boolean flip)
	 * Would an object at (x, y) (anchor bottom-left, extending up/right) cut a passage? Collects the
	 * blocked state (hw.u) of the ring around the footprint into four 3-bit masks and rejects shapes
	 * that split it. Ported from smali: register names v5, v8, v9, v10, v11 kept.
	 */
	k_(x, y, rw, flip) {
		const hw = this.b;
		const idx = (imul(this.h, y) + x) | 0;
		const multi = rw != null && rw.r_();
		const w = multi ? (flip ? rw.U : rw.T) : 1;
		const dh = multi ? imul(flip ? rw.T : rw.U, this.h) : this.h;
		const top = (idx - dh) | 0;
		const tl = hw.u_((top - 1) | 0) ? 1 : 0;
		let v8 = tl, v9, v10, v11;
		if (hw.u_((top + w) | 0)) {
			v9 = tl | 4;
			v10 = 1;
		} else {
			v10 = 0;
			v9 = tl;
		}
		if (hw.u_((this.h + idx - 1) | 0)) {
			v8 = tl | 4;
			v11 = 1;
		} else {
			v11 = 0;
		}
		if (hw.u_((this.h + idx + w) | 0)) {
			v10 |= 4;
			v11 |= 4;
		}

		let v5;
		if (multi) {
			v5 = v8 | 2;
			v8 = v10 | 2;
			v9 = v9 | 2;
			v10 = v11 | 2;
			const nw = flip ? rw.U : rw.T;
			for (let k = 0; k < nw; k++) {
				if (hw.u_((top + k) | 0)) {
					v5 |= 1;
					v8 |= 1;
					if (nw > 1) v9 |= k === 0 ? 1 : 4;
				} else {
					v9 &= -3;
				}
				if (hw.u_((this.h + idx + k) | 0)) {
					v5 |= 4;
					v8 |= 4;
					if (nw > 1) v10 |= k === 0 ? 1 : 4;
				} else {
					v10 &= -3;
				}
			}
			const nh = flip ? rw.T : rw.U;
			for (let k = 0; k < nh; k++) {
				if (hw.u_((idx - imul(this.h, k) - 1) | 0)) {
					v9 |= 1;
					v10 |= 1;
					if (nh > 1) v5 |= k === 0 ? 4 : 1;
				} else {
					v5 &= -3;
				}
				if (hw.u_((idx - imul(this.h, k) + w) | 0)) {
					v9 |= 4;
					v10 |= 4;
					if (nh > 1) v8 |= k === 0 ? 4 : 1;
				} else {
					v8 &= -3;
				}
			}
		} else {
			if (hw.u_((idx - this.h) | 0)) {
				v8 |= 1;
				v10 |= 1;
				v9 |= 2;
			}
			let v1;
			if (hw.u_((this.h + idx) | 0)) {
				v8 |= 4;
				v1 = v10 | 4;
				v11 |= 2;
			} else {
				v1 = v10;
			}
			if (hw.u_((idx - 1) | 0)) {
				v9 |= 1;
				v10 = v11 | 1;
				v5 = v8 | 2;
			} else {
				v5 = v8;
				v10 = v11;
			}
			if (hw.u_((idx + 1) | 0)) {
				v9 |= 4;
				v10 |= 4;
				v8 = v1 | 2;
			} else {
				v8 = v1;
			}
		}

		if (v5 === 5 || v8 === 5 || v9 === 5 || v10 === 5) return false;
		if (v9 === 1 && v10 === 4) return false;
		if (v9 === 4 && v10 === 1) return false;
		if (v5 === 7 && v8 === 7 && v9 === 7 && v10 === 7) return false;
		return true;
	},

	/** void S(): chests (21, egypt 94) plus, outdoors, pages 55 and loot 15/110; then pw.t specials. */
	S_() {
		const pw = this.c;
		const outdoor = pw.E || pw.F;
		const chest = pw.G ? 94 : 21;
		const A = this.A;
		const rooms = this.n;
		if (outdoor) {
			const n = rooms.length;
			for (let i = 0; i < n; ) {
				const r = get(rooms, i);
				i++;
				if (!r.r && r.w !== 17) continue;
				if (fg2.W_(r.w, 13, 14) || r.o || r === this.z || A.includes(r)) continue;
				A.push(r);
			}
		}

		let total, list;
		if (outdoor) {
			list = [];
			let c = this.c;
			if (c.t != null) {
				for (let i = 0; i < this.c.t.length; i++) list.push(chest);
				c = this.c;
			}
			if (c.n > 0) {
				const k = this.e.i_(c.m, c.n);
				for (let i = 0; i < k; i++) list.push(55);
			}
			c = this.c;
			if (c.l > 0) {
				const k = this.e.i_(c.k, c.l);
				for (let i = 0; i < k; i++) list.push(this.c.G ? 110 : 15);
			}
			c = this.c;
			if (c.j > 0) {
				const k = this.e.i_(c.i, c.j);
				for (let i = 0; i < k; i++) list.push(chest);
			}
			total = list.length;
		} else {
			const c = this.c;
			total = c.j <= 0 ? 0 : this.e.i_(c.i, c.j);
			list = null;
		}
		if (total <= 0) return;

		const placed = [];
		const nr = rooms.length;
		const maxTries = imul(nr, 15);
		const half = idiv(imul(nr, 30), 3);
		let ai = 0;     // next index into this.A
		let k = 0;      // objects placed
		let keep = -1;  // index of the chest in room z (placed on the first try), gets the first special
		for (let t = 0; t < maxTries; t++) {
			let r;
			if (t === 0 && this.z != null) {
				r = this.z;
			} else if (ai < A.length) {
				r = get(A, ai);
				ai++;
			} else {
				r = get(rooms, this.e.h_(rooms.length));
				if (r.g || r.j || r.k) continue;
				if (fg2.W_(r.w, 13, 14)) continue;
				if (this.c.G && fg2.X_(r.w, 4, 29, 28)) continue;
				if (t >= half) {
					// any room once half the tries are used
				} else if (!r.a_(true)) {
					continue;
				}
			}
			const id = list === null ? chest : get(list, k);
			const o = this.R_(r, id, 0, false, true, true, null, false, false);
			if (o == null) continue;
			if (id === chest) {
				placed.push(o);
				r.j = true;
				if (t === 0 && r === this.z) keep = 0;
			} else {
				r.k = true;
			}
			k++;
			if (k >= total) break;
		}

		if (this.c.t != null) {
			let sel = keep;
			for (let i = 0; i < this.c.t.length && placed.length !== 0; i++) {
				const zv = this.c.t[i];
				let v = zv.a;
				const b = zv.b;
				if (b !== 0 && !vj0.i2.Y0_(b).q_()) {
					v = zv.c;
					if (v === 0) continue;
				}
				let idx, next;
				if (sel !== -1) {
					next = -1;
					idx = sel;
				} else {
					idx = this.e.h_(placed.length);
					next = sel;
				}
				get(placed, idx).g = v;
				removeAt(placed, idx);
				sel = next;
			}
		}

		for (let i = 0, n = placed.length; i < n; i++) {
			const o = placed[i];
			if (o.a.a === 21 && o.g === 37) {
				o.a = zw.Q.get(37);
				o.g = 0;
			}
		}

		if (!outdoor) {
			this.C_(true);
			this.C_(false);
		}
	},

	/** void C(boolean pages): pw.m..n pages (55) or pw.k..l loot (15, egypt 110) in random free rooms. */
	C_(z) {
		const pw = this.c;
		const lo = z ? pw.m : pw.k;
		const hi = z ? pw.n : pw.l;
		if (hi <= 0) return;
		const want = this.e.i_(lo, hi);
		if (want <= 0) return;
		let id;
		if (z) id = 55;
		else id = this.c.G ? 110 : 15;
		const rooms = this.n;
		const n2 = imul(rooms.length, 2);
		for (let t = 0, k = 0; t < n2; t++) {
			const r = get(rooms, this.e.h_(rooms.length));
			if (r.g || r.j || r.k || fg2.W_(r.w, 13, 14)) continue;
			if (this.R_(r, id, 0, false, true, true, null, false, false) == null) continue;
			r.k = true;
			k++;
			if (k >= want) return;
		}
	},

	/** void D(): with chance pw.x%, one rare object 85/86/87 in a plain room away from the boss room q. */
	D_() {
		if (!(this.b.c.x > 0 && this.e.h_(100) < this.b.c.x)) return;
		const r3 = this.e.h_(3);
		let id;
		if (r3 === 0) id = 85;
		else if (r3 === 1) id = 86;
		else id = 87;
		const q = this.q;
		const qa = q.a, qhc = idiv(q.c, 2), qb = q.b, qhd = idiv(q.d, 2);
		let dx = (idiv(this.k, 2) - 5) | 0;
		let dy = (idiv(this.l, 2) - 5) | 0;
		for (let t = 0; t < 100; t++) {
			const rooms = this.n;
			const r = get(rooms, this.e.h_(rooms.length));
			const w = xs.P[r.w];
			if (x30.u_(r) || r.n || w.m || w.j || w.i || w.k) continue;
			if (t !== 0 && irem(t, 40) === 0) {
				dx = idiv(imul(dx, 75), 100);
				dy = idiv(imul(dy, 75), 100);
			}
			if (this.a.r <= 0 || !r.o) {
				if (iabs((qhc + qa - ((idiv(r.c, 2) + r.a) | 0)) | 0) < dx
					&& iabs((qhd + qb - ((idiv(r.d, 2) + r.b) | 0)) | 0) < dy) continue;
			}
			if (this.R_(r, id, 1, false, true, true, null, false, false) != null) return;
		}
	},
});
