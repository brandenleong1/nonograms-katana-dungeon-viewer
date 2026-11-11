// x30 entrance, exits, doors and the two puzzle rooms: H (entrance tile + hero spawn), r0 (boss exit on
// river maps), w0 (corridor walk to a room, used for the minor boss), G / x (doors around a room),
// v0 / u0 (find the door between a room's last door and a neighbour), V (nonogram room), W (barrel room),
// w (register a locked room), v (cell inside a locked / puzzle room), statics t, u (room is reserved).
// Source: decompiled/vineflower/x30.java. H, x and u0 were ported from smali (both decompiles reuse
// registers across unrelated values there); the rest match Vineflower and were checked against smali.
import { install, x30 } from './index.js';
import { b8, imul, idiv, irem, get } from '../jrt.js';
import { xs, zw } from '../statics.js';
import { fg2, lz0, n30, wg2, qw, Util$Point } from '../model.js';

install({
	/**
	 * void H(): pick the entry room, the entrance tile (ww 5) and the hero's spawn next to it.
	 * River maps (s30.h) start from a map edge and walk inwards (k0) to a room; other maps pick a small
	 * random room and put the entrance in its top or right wall.
	 */
	H_() {
		const rooms = this.n;
		if (this.c.H) {
			const r = get(rooms, 0);
			this.q = r;
			const p = this.b.f.b;
			p.a = (r.a + xs.b0.a) | 0;
			p.b = (r.b + xs.b0.b) | 0;
			return;
		}
		let ex = 0, ey = 0; // entrance tile (smali v15, v16)
		if (this.a.h) {
			let dir = this.e.h_(3);
			sides: for (let k = 0; k < 3; k++) {
				let p, q;
				if (dir === 0) { p = this.v ? 1 : -1; q = 0; }
				else if (dir === 1) { p = 0; q = 1; }
				else if (dir === 2) { p = 0; q = -1; }
				else { p = 0; q = 0; }
				const u = this.u;
				const dx = u ? p : q; // Vineflower var13
				const dy = u ? q : p; // var14
				let sx, sy;
				if (dir === 0) {
					if (this.v) { sx = 0; sy = 0; }
					else if (u) { sx = (this.k - 1) | 0; sy = 0; }
					else { sx = 0; sy = (this.l - 1) | 0; }
				} else {
					if (this.v) { sx = 0; sy = 0; }
					else {
						const d = (this.a.l + 6) | 0;
						if (u) { sx = (this.k - d) | 0; sy = 0; } else { sx = 0; sy = (this.l - d) | 0; }
					}
					if (dir === 2) {
						if (u) sy = (this.l - 1) | 0; else sx = (this.k - 1) | 0;
					}
				}
				const span = idiv(dx !== 0 ? this.k : this.l, dir === 0 ? 3 : 2);
				const pt = new Util$Point();
				for (let t = 0; t < 60; t++) {
					let off;
					if (dir === 0) off = this.e.h_(((this.u ? this.l : this.k) - 6) | 0);
					else off = this.e.h_(this.a.l);
					off = (off + 3) | 0;
					pt.a = sx;
					pt.b = sy;
					if (dx === 0) pt.a = (off + sx) | 0; else pt.b = (off + sy) | 0;
					if (!this.k0_(pt, dx, dy, span)) continue;
					ex = pt.a;
					ey = pt.b;
					const W = this.h;
					const ny = (ey + dy) | 0;
					const ni = lz0.h_(ny, W, ex, dx);
					if (!this.r_((imul(ey, W) + ex) | 0, ni, dx)) continue;
					const room = get(rooms, this.m[ni]);
					if (room.f || room.o) continue;
					const pw = this.c;
					if ((pw.E || pw.F) && (room.r || room.w === 17)) continue;
					const area = imul(room.c, room.d);
					if (t < 15 ? area > 25 : t < 25 && area > 35) continue;
					this.q = room;
					const hero = this.b.f;
					const hx = (ex + dx) | 0;
					hero.b.a = hx;
					hero.b.b = ny;
					hero.a_(dx, dy);
					const w = new qw(zw.Q.get(52));
					this.w = w;
					w.b.a = hx;
					w.b.b = ny;
					if (dx !== 0) w.b.b = (ny - 1) | 0; else w.b.a = (hx + 1) | 0;
					w.c = dy === 0;
					break sides;
				}
				dir = irem((dir + 1) | 0, 3);
			}
		} else {
			search: for (let tries = 0; tries < 60; tries++) {
				const room = get(rooms, this.e.h_(this.o));
				if (room.f || room.o) continue;
				const pw = this.c;
				if ((pw.E || pw.F) && (room.r || room.w === 17)) continue;
				const area = imul(room.c, room.d);
				if (tries < 15 ? area > 25 : tries < 25 && area > 35) continue;
				if (pw.F && tries < 25) {
					// cave: no river room two cells beyond the left / right / top / bottom walls
					let dy = room.b - 2 >= 0 ? -2 : 0;
					let end = room.d;
					if (room.b + room.d + 1 < this.i) end = (room.d + 2) | 0;
					for (; dy < end; dy += 2) {
						if (room.a - 2 >= 0) {
							const ri = this.m[(imul(room.b + dy, this.h) + room.a - 2) | 0];
							if (ri !== -1 && get(rooms, ri).r) continue search;
						}
						if (room.a + room.c + 1 < this.h) {
							const ri = this.m[(imul(room.b + dy, this.h) + room.a + room.c + 1) | 0];
							if (ri !== -1 && get(rooms, ri).r) continue search;
						}
					}
					for (let dx = 0; dx < room.c; dx += 2) {
						const y0 = (room.b - 2) | 0;
						if (y0 >= 0) {
							const ri = this.m[(imul(y0, this.h) + room.a + dx) | 0];
							if (ri !== -1 && get(rooms, ri).r) continue search;
						}
						const y1 = (room.b + room.d + 1) | 0;
						if (y1 < this.i) {
							const ri = this.m[(imul(y1, this.h) + room.a + dx) | 0];
							if (ri !== -1 && get(rooms, ri).r) continue search;
						}
					}
				}
				// 16 tries (15..0); a hit on the last try (t == 0) does not count
				let t = 15;
				for (; t >= 0; t--) {
					const side = this.e.h_(2);
					const off = (this.e.h_(((side === 0 ? room.c : room.d) - 2) | 0) + 1) | 0;
					const g = this.g;
					if (side === 0) {
						// top wall
						const x = (room.a + off) | 0;
						const by = room.b;
						const y = (by - 1) | 0;
						ex = x;
						ey = y;
						const W = this.h;
						const i0 = (imul(y, W) + x) | 0;
						if (g[i0].a === 2 && g[i0 - 1].a === 2 && g[i0 + 1].a === 2 && g[imul(W, by) + x].h_()) {
							let ok = y === 0;
							if (!ok) {
								const y2 = (by - 2) | 0;
								ok = fg2.W_(this.g[imul(this.h, y2) + x].a, 0, 2)
									&& fg2.W_(this.g[imul(this.h, y2) + x - 1].a, 0, 2)
									&& fg2.W_(this.g[lz0.h_(y2, this.h, x, 1)].a, 0, 2);
							}
							if (ok) {
								const hero = this.b.f;
								hero.b.a = x;
								hero.b.b = by;
								hero.c = false;
								break;
							}
						}
					} else {
						// right wall
						const x = (room.a + room.c) | 0;
						const y = (room.b + off) | 0;
						ex = x;
						ey = y;
						const W = this.h;
						const i0 = (imul(y, W) + x) | 0;
						if (g[i0].a === 2 && g[imul(y - 1, W) + x].a === 2 && g[imul(y + 1, W) + x].a === 2 && g[i0 - 1].h_()) {
							const W2 = this.h;
							if (x === W2 - 1
								|| (fg2.W_(this.g[lz0.h_(y, W2, x, 1)].a, 0, 2)
									&& fg2.W_(this.g[lz0.h_(y - 1, this.h, x, 1)].a, 0, 2)
									&& fg2.W_(this.g[lz0.h_(y + 1, this.h, x, 1)].a, 0, 2))) {
								const hero = this.b.f;
								hero.b.a = (x - 1) | 0;
								hero.b.b = y;
								hero.c = true;
								break;
							}
						}
					}
				}
				if (t > 0) {
					this.q = room;
					break;
				}
			}
		}
		const q = this.q;
		if (q !== null && q !== undefined) {
			q.g = true;
			const c = this.g[(imul(ey, this.h) + ex) | 0];
			const pw = this.c;
			let code;
			if (pw.E) code = 1;
			else if (pw.F) code = 4;
			else if (pw.G) code = 6;
			else code = 0;
			c.a = 5;
			c.b = code;
		} else {
			n30.c_(1, 'no space for entry');
		}
	},

	/** void r0(): river maps: exit tile (ww 5/2) on the far edge, walking inwards to a big enough room. */
	r0_() {
		const bw = zw.c_(this.c.e);
		const big = bw.x0 === 0 && bw.C0 === 0 ? 25 : 35;
		const sgn = this.v ? -1 : 1;
		const dx = this.u ? sgn : 0;
		const dy = this.u ? 0 : sgn;
		let sx, sy;
		if (this.v) {
			if (this.u) { sx = (this.k - 1) | 0; sy = 0; }
			else { sy = (this.l - 1) | 0; sx = 0; }
		} else {
			sx = 0;
			sy = 0;
		}
		const span = idiv(dx !== 0 ? this.k : this.l, 3);
		const pt = new Util$Point();
		let room;
		for (let t = 0; ; t++) {
			if (t >= 170) {
				n30.c_(1, 'no place for exit');
				return;
			}
			const off = (this.e.h_(((this.u ? this.l : this.k) - 6) | 0) + 3) | 0;
			pt.a = sx;
			pt.b = sy;
			if (dx === 0) pt.a = (off + sx) | 0; else pt.b = (off + sy) | 0;
			if (!this.k0_(pt, dx, dy, span)) continue;
			const W = this.h;
			const i0 = (imul(pt.b, W) + pt.a) | 0;
			const i1 = (imul((pt.b + dy) | 0, W) + pt.a + dx) | 0;
			if (!this.r_(i0, i1, dx)) continue;
			const r = get(this.n, this.m[i1]);
			if (r.r) continue;
			if (x30.t_(r, false)) continue;
			if (t > 90 || imul(r.c, r.d) >= (t <= 60 ? big : 25)) {
				room = r;
				break;
			}
		}
		this.r = room;
		room.h = true;
		const c = this.g[(imul(pt.b, this.h) + pt.a) | 0];
		c.a = 5;
		c.b = 2;
		const m = new qw(zw.Q.get(52));
		this.x = m;
		const mx = (pt.a + dx) | 0;
		m.b.a = mx;
		const my = (pt.b + dy) | 0;
		m.b.b = my;
		if (dx !== 0) m.b.b = (my + dx) | 0; else m.b.a = (mx + dy) | 0;
		m.c = dy === 0;
	},

	/**
	 * u30 w0(int x, int y, int dx, int dy, int turns): walk from (x, y) over floor / doors for up to 8 cells
	 * until a non-reserved room of area >= 25; at a dead end, branch into side openings (`turns` deep).
	 */
	w0_(x, y, dx, dy, turns) {
		for (let k = 0; k < 8; k++) {
			const nx = (x + dx) | 0;
			const ny = (y + dy) | 0;
			if (nx <= 0 || ny <= 0) break;
			const W = this.h;
			if (nx >= W - 1 || ny >= this.i - 1) break;
			const idx = (imul(W, ny) + nx) | 0;
			if (!fg2.W_(this.g[idx].a, 1, 3)) break;
			const ri = this.m[idx];
			if (ri !== -1) {
				const r = get(this.n, ri);
				if (!x30.t_(r, true) && imul(r.c, r.d) >= 25) return r;
				break;
			}
			if (!fg2.W_(this.g[lz0.h_((ny + dy) | 0, this.h, nx, dx)].a, 1, 3)) {
				if (turns > 0) {
					const px = dx === 0 ? 1 : 0;
					const py = dy === 0 ? 1 : 0;
					const g = this.g;
					const W2 = this.h;
					const c1 = g[lz0.h_((ny + py) | 0, W2, nx, px)];
					const c2 = g[(imul((ny - py) | 0, W2) + nx - px) | 0];
					if (c1.a !== 2 || c2.a !== 2) {
						const e1 = c1.e_();
						const e2 = c2.e_();
						if (e1 || e2) {
							const s = dx === 0 ? 1 : 0;
							if (e1) {
								const r = this.w0_(nx, ny, s, s ^ 1, (turns - 1) | 0);
								if (r !== null) return r;
							}
							if (e2) {
								const r = this.w0_(nx, ny, s !== 0 ? -1 : 0, s !== 0 ? 0 : -1, (turns - 1) | 0);
								if (r !== null) return r;
							}
						}
					}
				}
				break;
			}
			x = nx;
			y = ny;
		}
		return null;
	},

	/**
	 * void G(u30 room): doors around a room. Rectangular shapes (v in 0,4,5,10,11,12) try every cell of the
	 * surrounding ring; other shapes try every cell of the bounding box with neighbour checks (x's z5).
	 */
	G_(r) {
		const rect = fg2.a0_(r.v, 0, 4, 5, 10, 11, 12);
		const b = r.b;
		const d = r.d;
		if (rect) {
			const top = (b - 1) | 0;
			const bottom = (b + d) | 0;
			let x = r.a;
			let right;
			for (;;) {
				const a = r.a;
				right = (a + r.c) | 0;
				if (x >= right) break;
				this.x_(r, x, top, false, false);
				this.x_(r, x, bottom, false, false);
				x = (x + 1) | 0;
			}
			const left = (r.a - 1) | 0;
			for (let y = r.b; y < r.b + r.d; y = (y + 1) | 0) {
				this.x_(r, left, y, true, false);
				this.x_(r, right, y, true, false);
			}
		} else {
			const y1 = Math.min((b + d) | 0, (this.i - 2) | 0);
			const x1 = Math.min((r.a + r.c) | 0, (this.h - 2) | 0);
			for (let y = Math.max((r.b - 1) | 0, 1); y <= y1; y = (y + 1) | 0) {
				for (let x = Math.max((r.a - 1) | 0, 1); x <= x1; x = (x + 1) | 0) {
					this.x_(r, x, y, false, true);
				}
			}
		}
	},

	/**
	 * void x(u30 room, int x, int y, boolean horizontal, boolean probe): try to make a door at (x, y).
	 * room may be null (arena lanes). With probe, the door orientation comes from which side touches the
	 * room's floor. Counts doors in room.z / room.A and remembers the last one in room.B / room.C.
	 */
	x_(r, x, y, horiz, probe) {
		const idx = (imul(this.h, y) + x) | 0;
		const c = this.g[idx];
		let hz;
		if (r === null || r === undefined) {
			r = null;
			if (!c.d_()) return;
			hz = horiz;
		} else {
			const re = r.e;
			if (!c.d_()) {
				const a = c.a;
				if (a === 3) {
					r.z = (r.z + 1) | 0;
					r.A = (r.A + 1) | 0;
					r.B = x;
					r.C = y;
					if (this.c.H) {
						const o = this.b.k[(imul(this.h, y) + x) | 0];
						if ((o === null || o === undefined) && !r.H.b_()) this.b.M_(73, x, y, false);
					}
					return;
				}
				if (a === 1 && fg2.Z_(c.b, 2, 11, 8, 18, 19)) r.z = (r.z + 1) | 0;
				return;
			}
			if (probe) {
				hz = (this.g[idx - 1].h_() && this.m[idx - 1] === re) || (this.g[idx + 1].h_() && this.m[idx + 1] === re);
				if (!hz) {
					if (!(this.g[idx - this.h].h_() && this.m[idx - this.h] === re)) {
						if (!this.g[idx + this.h].h_()) return;
						if (this.m[idx + this.h] !== re) return;
					}
				}
			} else {
				hz = horiz;
			}
			r.z = (r.z + 1) | 0;
		}

		const g = this.g;
		if (g[idx - 1].a !== 3 && g[idx + 1].a !== 3) {
			const W = this.h;
			const up = (idx - W) | 0;
			const down = (idx + W) | 0;
			if (g[up].a !== 3 && g[down].a !== 3) {
				const pw = this.c;
				let ok = pw.E || pw.H;
				if (!ok) {
					let blocked;
					if (hz) {
						blocked = (x >= 2 && g[idx - 2].a === 3) || (x < W - 2 && g[idx + 2].a === 3);
					} else {
						blocked = (y >= 2 && g[idx - imul(W, 2)].a === 3) || (y < this.i - 2 && g[imul(W, 2) + idx].a === 3);
					}
					if (!blocked) {
						blocked = g[up - 1].a === 3 || g[up + 1].a === 3 || g[down - 1].a === 3 || g[down + 1].a === 3;
					}
					ok = !blocked || (pw.F && this.m_(x, y));
				}
				if (ok) {
					if (r !== null) {
						r.A = (r.A + 1) | 0;
						r.B = x;
						r.C = y;
					}
					c.A_(3);
					if (r !== null && this.c.H) {
						if (!r.H.b_()) this.b.M_(73, x, y, false);
						return;
					}
					if (r !== null && r.g) return;
					if (this.c.E && !this.m_(x, y)) {
						if (this.e.h_(100) < 10) {
							this.b.M_(28, x, y, false);
							c.b = 3;
						}
						return;
					}
					const roll = this.e.h_(100);
					if (roll < 25) {
						this.b.M_(27, x, y, false);
						c.b = 1;
						return;
					}
					if (!this.c.E && roll < 40) {
						this.b.M_(28, x, y, false);
						if (this.c.F && !this.m_(x, y)) c.b = 4;
					}
					return;
				}
			}
		}
		const pw = this.c;
		if (!pw.E && !pw.F && !pw.H) c.b = b8(c.b | -128);
	},

	/**
	 * boolean v0(int x, int y, int room, boolean strict, Util$Point out, boolean carve): find the door into
	 * `room` starting at the door (x, y): directly adjacent, else along a short corridor (u0, 4 directions).
	 */
	v0_(x, y, ri, strict, out, carve) {
		const W = this.h;
		const idx = (imul(y, W) + x) | 0;
		const m = this.m;
		if (m[idx - 1] === ri || m[idx + W] === ri) {
			out.a = x;
			out.b = y;
			return true;
		}
		if (!strict && (m[idx + 1] === ri || m[idx - W] === ri)) {
			out.a = x;
			out.b = y;
			return true;
		}
		return this.u0_(x, y, 0, 1, ri, false, strict, out, carve)
			|| this.u0_(x, y, -1, 0, ri, false, strict, out, carve)
			|| this.u0_(x, y, 1, 0, ri, strict, strict, out, carve)
			|| this.u0_(x, y, 0, -1, ri, strict, strict, out, carve);
	},

	/**
	 * boolean u0(int x, int y, int dx, int dy, int room, boolean needTurn, boolean strict, Util$Point out,
	 * boolean carve): follow a 1-wide corridor from (x, y) for up to 8 cells (one turn allowed) to a door
	 * whose far side is `room`. With carve, the walked cells are cleared to void.
	 */
	u0_(x, y, dx, dy, ri, needTurn, strict, out, carve) {
		let px = dx === 0 ? 1 : 0;
		let py = dy === 0 ? 1 : 0;
		let turned = false;
		for (let k = 0; k < 8; k++) {
			x = (x + dx) | 0;
			y = (y + dy) | 0;
			if (x <= 0 || y <= 0) return false;
			const W = this.h;
			if (x >= W - 1 || y >= this.i - 1) return false;
			const idx = (imul(y, W) + x) | 0;
			const m = this.m;
			if (m[idx] !== -1) return false;
			const c = this.g[idx];
			if (c.a === 3) {
				if (needTurn && !turned) return false;
				if (m[(imul((dy + y) | 0, W) + x + dx) | 0] !== ri) return false;
				out.a = x;
				out.b = y;
				return true;
			}
			if (!c.d_()) return false;
			const g = this.g;
			const W2 = this.h;
			const c1 = g[lz0.h_((y + py) | 0, W2, x, px)];
			const c2 = g[(imul((y - py) | 0, W2) + x - px) | 0];
			if (c1.a !== 2 || c2.a !== 2) {
				if (turned) return false;
				if (g[(imul((dy + y) | 0, W2) + x + dx) | 0].a !== 2) return false;
				const e1 = c1.e_();
				const e2 = c2.e_();
				if (e1 && e2) return false;
				if (!e1 && !e2) return false;
				if (strict) {
					if (e1 && px === 1) return false;
					if (e2 && py === 1) return false;
				}
				const s = dx === 0 ? 1 : 0;
				let ndx, ndy;
				if (e1) {
					ndx = s;
					ndy = s ^ 1;
				} else {
					ndx = s !== 0 ? -1 : 0;
					ndy = s !== 0 ? 0 : -1;
				}
				px = ndx === 0 ? 1 : 0;
				py = ndy === 0 ? 1 : 0;
				dx = ndx;
				dy = ndy;
				turned = true;
			}
			if (carve) {
				const cc = this.g[idx];
				cc.a = 0;
				cc.b = 0;
				const o = this.b.k[idx];
				if (o !== null && o !== undefined) this.b.j_(o, false);
			}
		}
		return false;
	},

	/**
	 * void V(): nonogram room. A big neighbour of a dead-end room becomes theme 13 with a 9x9 floor block
	 * (code 12); the door into the dead end gets object 35 and the dead end is locked behind it.
	 */
	V_() {
		if (!this.c.w) return;
		const pt = new Util$Point();
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; i++) {
			const room = get(rooms, i);
			if (room.n || room.o) continue;
			if (!room.c_(true)) continue;
			for (const j of get(this.B.a, room.e)) {
				const nb = get(rooms, j);
				if (nb.g || nb.o || nb.h || nb.i || nb.f || nb.w === 26) continue;
				if (nb.c < 9 || nb.d < 9) continue;
				if (!fg2.b0_(nb.v, 0, 4, 5, 10, 11, 12, 13) && !(nb.v === 1 && (nb.c >= 11 || nb.d >= 11))) continue;
				if (!this.v0_(room.B, room.C, j, false, pt, false)) continue;
				const idx = (imul(pt.b, this.h) + pt.a) | 0;
				const c = this.g[idx];
				if (c.a !== 3) {
					wg2.h_('invalid last door');
					return;
				}
				c.b = 0;
				const hw = this.b;
				const o = hw.k[idx];
				if (o !== null && o !== undefined) hw.j_(o, false);
				this.b.M_(35, pt.a, pt.b, false);
				room.n = true;
				room.x = this.c.G ? 25 : 9;
				this.z = room;
				this.b.A = this.e.h_(zw.O.length);
				if (!fg2.W_(nb.v, 0, 1)) nb.v = 0;
				nb.w = 13;
				const ox = idiv((nb.c - 9) | 0, 2);
				const oy = idiv((nb.d - 9) | 0, 2);
				for (let y = (nb.b + oy) | 0; y < nb.b + oy + 9; y = (y + 1) | 0) {
					for (let x = (nb.a + ox) | 0; x < nb.a + ox + 9; x = (x + 1) | 0) {
						const cc = this.g[(imul(this.h, y) + x) | 0];
						cc.a = 1;
						cc.b = 12;
					}
				}
				return;
			}
		}
	},

	/**
	 * void W(): barrel puzzle room (level >= 4, zw.h(level) == 1, 80%). A neighbour of a dead-end room becomes
	 * theme 14 with a 7x7 zw.P pattern (-1 = floor 44 + one barrel 59 each, > 0 = object); door object 60.
	 */
	W_() {
		const lvl = this.b.b;
		if (lvl < 4) return;
		if (zw.h_(lvl) !== 1) return;
		if (this.e.h_(100) < 20) return;
		const pt = new Util$Point();
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; i++) {
			const room = get(rooms, i);
			if (room.n || room.o) continue;
			if (!room.c_(true)) continue;
			for (const j of get(this.B.a, room.e)) {
				const nb = get(rooms, j);
				if (nb.g || nb.o || nb.h || nb.i || nb.f) continue;
				if (fg2.W_(nb.w, 13, 26)) continue;
				if (nb.c < 7 || nb.d < 7) continue;
				if (!fg2.b0_(nb.v, 0, 4, 5, 10, 11, 12, 13) && !(nb.v === 1 && (nb.c >= 9 || nb.d >= 9))) continue;
				if (!this.v0_(room.B, room.C, j, false, pt, false)) continue;
				const idx = (imul(pt.b, this.h) + pt.a) | 0;
				const c = this.g[idx];
				if (c.a !== 3) {
					wg2.h_('invalid last door');
					return;
				}
				c.b = 0;
				const hw = this.b;
				const o = hw.k[idx];
				if (o !== null && o !== undefined) hw.j_(o, false);
				this.b.M_(60, pt.a, pt.b, false);
				room.n = true;
				room.x = this.c.G ? 25 : 9;
				if (this.z === null || this.z === undefined) this.z = room;
				else this.w_(room);
				if (!fg2.W_(nb.v, 0, 1)) nb.v = 0;
				nb.w = 14;
				const pat = zw.P[this.e.h_(zw.P.length)];
				const ox = idiv((nb.c - 7) | 0, 2);
				const oy = idiv((nb.d - 7) | 0, 2);
				let barrels = 0;
				for (let r = 0; r < 7; r++) {
					for (let col = 0; col < 7; col++) {
						const y = (nb.b + oy + r) | 0;
						const x = (nb.a + ox + col) | 0;
						const v = pat[r * 7 + col];
						if (v === -1) {
							const cc = this.g[(imul(y, this.h) + x) | 0];
							cc.a = 1;
							cc.b = 44;
							barrels++;
						} else if (v > 0) {
							let id = v;
							if (this.b.c.G) {
								if (v === 8) id = 101;
								else if (v === 10) id = 111;
								else if (v === 22) id = 119;
							}
							const flip = zw.Q.get(id).f && this.f.h_(2) === 0;
							this.b.M_(id, x, y, flip);
						}
					}
				}
				for (let k = 0; k < barrels; k++) {
					const q = this.R_(nb, 59, 0, false, false, true, null, false, false);
					if (q === null || q === undefined) {
						n30.c_(0, 'no place for barrel');
						break;
					}
					q.h = 1;
				}
				return;
			}
		}
	},

	/** void w(u30 room): add a locked room to A (except theme 11 rooms); throws if already registered. */
	w_(r) {
		if (r.w === 11) return;
		if (r !== this.z && !this.A.includes(r)) {
			this.A.push(r);
			return;
		}
		wg2.h_('wlr already added');
	},

	/** boolean v(int cell): floor/water cell of a locked room or of a theme 13 / 11 room. */
	v_(i) {
		if (this.g[i].k_()) {
			const ri = this.m[i];
			if (ri !== -1) {
				const r = get(this.n, ri);
				if (r.n || fg2.W_(r.w, 13, 11)) return true;
			}
		}
		return false;
	},
}, {
	/** static boolean t(u30 room, boolean z): room is reserved (entry, exit, special, …). */
	t_(r, z) {
		return r.l || r.g || r.i || r.f || r.o || (z && r.p) || xs.P[r.w].k;
	},

	/** static boolean u(u30 room) */
	u_(r) {
		return r.g || r.f || r.l || xs.P[r.w].n;
	},
});
