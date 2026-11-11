// x30 room placement: Z (rivers, arena, main room loop, basements), Y / X (pick and claim a room
// rectangle), q0 / A (room shapes), b0 (water features), y0 / z0 / h (pool edges and liquid code),
// i0, l, k0, r, c, b (small helpers).
// Source: decompiled/vineflower/x30.java Z (~6897), Y (~6858), X (~6809), q0 (~11951), A (~2277),
// b0 (~7733), y0 (~13097), z0 (~13205), h (~10033), i0 (~10778), l (~11437), k0 (~11420),
// r (~12251), c (~7978), b (~7710).
// Checked against smali where the decompiles are garbled: Z's river and arena passes (both mangle
// the booleans), A's 6/7/8/9 split (JADX has `!F && !r` for the forest-crossing flag; smali and
// Vineflower have `F && !r`), b0's type-12 cross (JADX garbles the edge test).
import { install } from './index.js';
import { imul, idiv, irem, get } from '../jrt.js';
import { xs, zw } from '../statics.js';
import { u30, qw, Util$Point, fg2, lz0, al2 } from '../model.js';

install({
	/** void Z(): place all rooms (river crossings, arena, main loop, basements). */
	Z_() {
		this.F = 0;
		const sz = this.a;
		let made = 0;   // rooms made by the river / arena passes

		if (sz.h && sz.j > 0) {
			// River maps: n rivers across the long axis, one of them maybe the boss river.
			const n = this.e.i_(sz.i, sz.j);
			let flip = this.e.h_(2) === 0;
			const span = idiv(this.u ? this.k : this.l, (n + 1) | 0);
			const across = this.u ? this.l : this.k;
			const mid = idiv(imul(across, 2), 3) | 1;
			let boss;
			if (this.c.f === 0) boss = -1;
			else if (this.v) boss = idiv(n, 2);
			else boss = (n - 1 - idiv(n, 2)) | 0;
			const cnt = boss !== -1 ? (n - 1) | 0 : n;
			let pond = -1;
			if (cnt >= 1) {
				let pct;
				if (cnt === 1) pct = 60;
				else if (cnt <= 2) pct = 66;
				else if (cnt <= 3) pct = 70;
				else if (cnt <= 4) pct = 90;
				else pct = 100;
				if (this.e.h_(100) < pct) {
					for (let t = 0; t < 10; t++) {
						const r = this.e.h_(n);
						if (r !== boss) { pond = r; break; }
					}
				}
			}

			for (let i = 0; i < n; i++) {
				const pos = imul((i + 1) | 0, span) | 1;
				const isBoss = i === boss;
				let wide = false;
				if (i === pond) {
					// 9x9 pond room straddling this river
					const r = this.i0_(6);
					let x, y;
					if (this.u) {
						x = (pos - 4) | 0;
						y = flip ? (this.l - 9 - r) | 0 : r;
					} else {
						x = flip ? (this.k - 9 - r) | 0 : r;
						y = (pos - 4) | 0;
					}
					const room = this.X_(true, x, y, 9, 9);
					if (room !== null) {
						this.A_(room, this.u ? 8 : 9, 2);
						made++;
						wide = true;
					}
				}
				const limit = isBoss || wide ? (across - 1) | 0 : mid;
				const w = wide ? 2 : 1;
				for (let j = 0; j <= limit; j++) {
					if (isBoss && j === mid) {
						// boss river stops here: remember the gap
						const u = this.u;
						const px = u ? pos : flip ? j : (this.k - j - 1) | 0;
						const py = u ? (flip ? j : (this.l - j - 1) | 0) : pos;
						this.t = new Util$Point(px, py);
					} else {
						for (let d = -w; d <= w; d++) {
							let idx;
							if (this.u) {
								idx = lz0.h_(flip ? j : (this.l - j - 1) | 0, this.h, pos, d);
							} else {
								idx = ((flip ? j : (this.k - j - 1) | 0) + imul((pos + d) | 0, this.h)) | 0;
							}
							const c = this.g[idx];
							if (c.a === 0) {
								if (wide && d >= -1 && d <= 1) {
									c.a = 4;
									c.b = 4;
								} else {
									c.a = 127;
								}
							}
						}
					}
				}
				flip = !flip;
			}
		}

		const rooms = this.n;
		if (this.a.n) {
			// Arena (level 22): three rooms on the centre lane, gates at both ends.
			const u0 = this.u;
			this.H = ((u0 ? this.k : this.l) - 2) | 0;
			this.I = idiv(u0 ? this.l : this.k, 2) & -2;
			const len = u0 ? this.k : this.l;
			const off = u0 ? this.h : 1;
			const marks = [];
			marks.push(2);
			marks.push((this.H - 1) | 0);
			const z10 = this.e.h_(100) < 50;
			const z11 = !z10 && this.e.h_(100) < 50;
			const z12 = this.e.h_(100) < 50;
			const r6 = this.e.h_(6);
			const ci = idiv(r6, 2);
			let si = irem(r6, 2);
			if (si >= ci) si++;
			for (let i = 0; i < 3; i++) {
				const center = i === ci;
				const z14 = z10 && i === si;
				let w, hh;
				if (center) w = 11;
				else if (z14) w = this.u ? 11 : 7;
				else w = !this.u && (i === si ? z11 : z12) ? 11 : 7;
				if (center) hh = 11;
				else if (z14) hh = this.u ? 7 : 11;
				else hh = this.u && (i === si ? z11 : z12) ? 11 : 7;
				const p = idiv(imul(len, (i + 1) | 0), 4) & -2;
				let cx, cy;
				if (this.u) { cx = p; cy = this.I; } else { cx = this.I; cy = p; }
				const x = ((cx - idiv(w, 2)) | 0) | 1;
				const y = ((cy - idiv(hh, 2)) | 0) | 1;
				marks.push(((this.u ? x : y) - 4) | 0);
				marks.push(((this.u ? x : y) + 3 + (this.u ? w : hh)) | 0);
				const room = this.X_(false, x, y, w, hh);
				if (!center && i === si) {
					room.r = true;
					room.x = 4;
				}
				this.A_(room, center ? (this.u ? 8 : 9) : 1, 26);
				if (z14) this.A_(room, 13, room.w);
				room.z = 6;
				made++;
			}
			// the lane itself
			for (let i = 0; i < ((this.H + 2) | 0); i++) {
				const idx = this.u ? (imul(this.I, this.h) + i) | 0 : (imul(this.h, i) + this.I) | 0;
				if (i !== 0 && i !== ((this.H + 1) | 0)) {
					let j = (idx + off) | 0;
					let c = this.g[j];
					let ri = this.m[j];
					let b = ri !== -1 && get(rooms, ri).f ? 19 : 18;
					c.a = 1;
					c.b = b;
					j = (idx - off) | 0;
					c = this.g[j];
					ri = this.m[j];
					b = ri !== -1 && get(rooms, ri).f ? 19 : 18;
					c.a = 1;
					c.b = b;
					ri = this.m[idx];
					const room = ri !== -1 ? get(rooms, ri) : null;
					c = this.g[idx];
					if (room === null) b = 1;
					else if (room.f) b = 2;
					else b = room.v === 13 ? 4 : 3;
					c.a = 1;
					c.b = b;
				} else {
					const g = this.g;
					let c = g[(idx + off) | 0];
					c.a = 5;
					c.b = 5;
					c = g[(idx - off) | 0];
					c.a = 5;
					c.b = 5;
					g[idx].A_(2);
					const q = new qw(zw.Q.get(52));
					const u = this.u;
					const pt = q.b;
					pt.a = u ? i : this.I;
					pt.b = u ? this.I : i;
					q.c = !u;
					if (i === 0) this.w = q;
					else this.x = q;
				}
			}
			const W = this.h;
			const nb = [-1, 1, -W | 0, W];
			for (let k = 0, n = marks.length; k < n; k++) {
				let v = marks[k];
				const u = this.u;
				const x = u ? v : this.I;
				if (u) v = this.I;
				const base = (imul(this.h, v) + x) | 0;
				this.b.M_(32, x, v, !u).h = 1201;
				for (let d = 0; d < 4; d++) {
					const c = this.g[(nb[d] + base) | 0];
					c.a = 1;
					c.b = -110;
				}
			}
			this.J = marks.slice();
		}

		// Main room loop.
		const pw = this.c;
		const outdoor = pw.E || pw.F;
		const maxOpen = outdoor ? Math.min((this.e.h_(3) + idiv(this.a.c, 7)) | 0, idiv(this.a.c, 5)) : 0;
		const minIdx = outdoor ? idiv(this.a.c, 2) : 0;
		let placed = made;
		let tries = 0;
		let open = 0;
		for (;;) {
			const s = this.a;
			if ((tries >= s.e && placed >= s.c) || placed >= s.d || tries >= s.f) break;
			const room = this.Y_(false);
			if (room !== null) {
				if (outdoor && placed >= minIdx && open < maxOpen && (!this.a.h || this.l_(room))) {
					room.r = true;
					open++;
				}
				this.q0_(room);
				placed++;
				if (room.w === 17 && !room.r) this.F++;
			}
			tries++;
		}

		// Basements (s30.r > 0): extra rooms in the band beyond k / l.
		this.o = rooms.length;
		const s = this.a;
		if (s.r > 0 && s.q > 0) {
			let want = this.e.i_(s.p, s.q);
			if (this.c.E) want = Math.min(want, (open + this.F) | 0);
			let got = 0;
			for (let t = 0; t < 30 && got < want; t++) {
				const room = this.Y_(true);
				if (room !== null) {
					room.o = true;
					if (!this.c.F) room.r = true;
					room.A = 1;
					room.z = 1;
					this.q0_(room);
					got++;
				}
			}
		}
	},

	/** u30 Y(boolean basement): random odd-sized room (area 15..99) at a random odd position. */
	Y_(basement) {
		let w, hh;
		for (;;) {
			w = (this.i0_(10) + 2) | 0;
			hh = (this.i0_(10) + 2) | 0;
			const area = imul(w, hh);
			if (area >= 15 && area <= 99) break;
		}
		let x, y;
		if (basement) {
			const k = this.k;
			if (this.u) {
				x = (this.i0_((this.a.r - 1 - w) | 0) + k + 1) | 0;
				y = this.i0_((this.l - hh) | 0);
			} else {
				x = this.i0_((k - w) | 0);
				y = (this.l + 1 + this.i0_((this.a.r - 1 - hh) | 0)) | 0;
			}
		} else {
			x = this.i0_((this.k - w) | 0);
			y = this.i0_((this.l - hh) | 0);
		}
		return this.X_(true, x, y, w, hh);
	},

	/** u30 X(boolean walled, x, y, w, h): claim an empty rectangle as a new room (null if blocked). */
	X_(walled, x, y, w, hh) {
		if (x >= 0) {
			const x1 = (x + w) | 0;
			if (x1 <= this.h && y >= 0) {
				const y1 = (y + hh) | 0;
				if (y1 <= this.i) {
					for (let yy = y; yy < y1; yy++) {
						for (let xx = x; xx < x1; xx++) {
							if (this.g[(imul(this.h, yy) + xx) | 0].a !== 0) return null;
						}
					}
					if (walled) {
						const g = this.g;
						const W = this.h;
						let r = (imul((y - 1) | 0, W) + x) | 0;
						if (g[(r - 1) | 0].a !== 0 || g[(r + w) | 0].a !== 0) return null;
						r = (imul(W, y1) + x) | 0;
						if (g[(r - 1) | 0].a !== 0 || g[(r + w) | 0].a !== 0) return null;
					}
					const rooms = this.n;
					const id = rooms.length;
					for (let yy = y; yy < y1; yy++) {
						for (let xx = x; xx < x1; xx++) {
							const k = (imul(this.h, yy) + xx) | 0;
							this.g[k].A_(1);
							this.m[k] = id;
						}
					}
					const room = new u30(x, y, w, hh, id);
					rooms.push(room);
					return room;
				}
			}
		}
		return null;
	},

	/** void q0(u30): pick a room shape (u30.v) and theme for a freshly placed room. */
	q0_(room) {
		const pw = this.c;
		if (pw.F) {
			if (room.c >= 9 && room.d >= 9) {
				const v = this.e.h_(235);
				if (v < 15) {
					this.A_(room, 1, 0);
				} else if (v < 30) {
					this.A_(room, 2, 0);
				} else if (v < 45) {
					this.A_(room, 3, 0);
				} else if (v < 60) {
					this.A_(room, 4, 0);
				} else if (v < 100) {
					if (!room.r && !room.o) {
						let t;
						if (v < 70) t = 6;
						else if (v < 80) t = 7;
						else if (v < 90) t = 8;
						else t = 9;
						this.A_(room, t, 2);
					}
				} else if (v < 115) {
					if (!room.r && !room.o) this.A_(room, 10, 0);
				} else if (v < 130) {
					if (!room.r) this.A_(room, 11, 0);
				} else if (v < 145) {
					if (room.c === room.d && !room.r) this.A_(room, 12, 0);
				} else if (v < 165) {
					const c = room.c;
					if ((c >= 11 && room.d < 11) || (room.d >= 11 && c < 11)) {
						const r = room.r;
						if (r || this.F < this.a.o) this.A_(room, 13, r ? 0 : 17);
					}
				} else if (v < 195) {
					this.A_(room, (this.e.h_(4) + 14) | 0, 0);
				} else if (v < 210) {
					this.A_(room, 5, 0);
				}
				if (room.v === 0 && !room.r) {
					this.A_(room, 18, 0);
					return;
				}
			} else if (room.c >= 7 && room.d >= 7) {
				const v = this.e.h_(100);
				if (v < 55) {
					if (!room.r) this.A_(room, 18, 0);
				} else if (v < 80) {
					this.A_(room, 1, 0);
				}
				if (fg2.W_(room.v, 0, 1) && (room.c >= 11 || room.d >= 11) && (room.r || this.F < this.a.o) && this.e.h_(100) < 70) {
					this.A_(room, 13, room.r ? 0 : 17);
					return;
				}
			}
		} else if (pw.E && !room.r) {
			if (room.c >= 9 && room.d >= 9) {
				const v = this.e.h_(240);
				if (v < 55) { this.A_(room, 18, 0); return; }
				if (v < 80) { this.A_(room, 1, 0); return; }
				if (v < 100) { this.A_(room, 2, 0); return; }
				if (v < 130) { this.A_(room, 3, 0); return; }
				if (v < 170) {
					if (!this.a.h || this.l_(room)) {
						// river crossing: next to the boss-river gap the split follows the river
						let t = 8;
						const p = this.t;
						if (this.a.h && p !== null) {
							let near;
							if (this.u) {
								const x = p.a, rx = room.a;
								near = !(x <= rx - 5 || x >= rx + room.c + 5);
							} else {
								const y = p.b, ry = room.b;
								near = !(y <= ry - 5 || y >= ry + room.d + 5);
							}
							if (near) t = this.u ? 8 : 9;
							else if (v >= 150) t = 9;
						} else if (v >= 150) {
							t = 9;
						}
						this.A_(room, t, 2);
						return;
					}
				} else {
					if (v < 220) {
						this.A_(room, (this.e.h_(4) + 14) | 0, 0);
						return;
					}
					const c = room.c;
					if (((c >= 11 && room.d < 11) || (room.d >= 11 && c < 11)) && this.F < this.a.o) {
						this.A_(room, 13, 17);
						return;
					}
				}
			} else if (room.c >= 7 && room.d >= 7) {
				const v = this.e.h_(100);
				if (v < 55) this.A_(room, 18, 0);
				else if (v < 80) this.A_(room, 1, 0);
				if (fg2.W_(room.v, 0, 1) && (room.c >= 11 || room.d >= 11) && this.F < this.a.o) {
					this.A_(room, 13, 17);
					return;
				}
			}
		} else if (room.c >= 9 && room.d >= 9) {
			const v = this.e.h_(235);
			if (v < 15) { this.A_(room, 1, 0); return; }
			if (v < 30) { this.A_(room, 2, 0); return; }
			if (v < 45) { this.A_(room, 3, 0); return; }
			if (v < 60) {
				const p = this.c;
				if (!p.E || room.o) {
					let theme = 0;
					if (p.G) {
						const w = xs.P[29];
						if (this.b.b >= w.g) {
							const lim = w.h;
							const used = this.p;
							if ((lim === 0 || used[29] < lim) && this.e.h_(100) < 80) {
								used[29]++;
								theme = 29;
							}
						}
					}
					this.A_(room, 4, theme);
				}
				return;
			}
			if (v < 100) {
				const p = this.c;
				if (!p.h && !p.E && !room.o) {
					let t;
					if (v < 70) t = 6;
					else if (v < 80) t = 7;
					else if (v < 90) t = 8;
					else t = 9;
					this.A_(room, t, 2);
				}
				return;
			}
			if (v < 115) {
				const p = this.c;
				if (!p.h && !p.E && !room.o) this.A_(room, 10, 3);
				return;
			}
			if (v < 130) {
				const p = this.c;
				if (!p.h && (!p.E || room.o)) this.A_(room, 11, 3);
				return;
			}
			if (v < 145) {
				const p = this.c;
				if (!p.h && room.c === room.d && (!p.E || room.o)) this.A_(room, 12, 3);
				return;
			}
			if (v < 160) {
				if (room.c === room.d && (!this.c.E || room.o)) this.A_(room, 12, 0);
				return;
			}
			if (v < 180) {
				const c = room.c;
				if ((c >= 11 && room.d < 11) || (room.d >= 11 && c < 11)) this.A_(room, 13, 0);
				return;
			}
			if (v < 200) {
				this.A_(room, (this.e.h_(4) + 14) | 0, 0);
				return;
			}
			if (v < 215) this.A_(room, 5, 0);
		} else if (room.c >= 7 && room.d >= 7) {
			if (this.e.h_(100) < 50) this.A_(room, 1, 0);
			if ((room.c >= 11 || room.d >= 11) && this.e.h_(100) < 50) this.A_(room, 13, 0);
		}
	},

	/**
	 * void A(u30, int shape, int theme): apply a room shape. 1 / 18 corner pillars, 2 / 3 cut corners,
	 * 6..9 split by a river (adds the twin half as a new room; 8 / 9 with a bridge), 14..17 a cut
	 * quarter. Shapes 4, 5, 10..13 only record v / w here; b0 builds their water later.
	 */
	A_(room, type, theme) {
		const split = fg2.Y_(type, 6, 8, 7, 9);
		room.v = type;
		room.w = theme;
		let twin = null;
		if (split) {
			const rooms = this.n;
			twin = new u30(room.a, room.b, room.c, room.d, rooms.length);
			rooms.push(twin);
			twin.f = true;
			room.f = true;
			twin.v = type;
			twin.w = theme;
			twin.r = room.r;
		}

		if (type === 1) {
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					this.g[(imul((room.c - 1) | 0, j) + imul((imul((room.d - 1) | 0, i) + room.b) | 0, this.h) + room.a) | 0].A_(2);
				}
			}
		} else if (type === 18) {
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 2; l++) {
							if (i === k || j === l) {
								this.g[(imul((room.c - 2) | 0, j) + imul((imul((room.d - 2) | 0, i) + room.b + k) | 0, this.h) + room.a + l) | 0].A_(2);
							}
						}
					}
				}
			}
		} else if (type === 2) {
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 2; l++) {
							const idx = (imul((room.c - 2) | 0, j) + imul((imul((room.d - 2) | 0, i) + room.b + k) | 0, this.h) + room.a + l) | 0;
							this.g[idx].A_(0);
							this.m[idx] = -1;
						}
					}
				}
			}
		} else if (type === 3) {
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 4; j++) {
					for (let k = 0; k < 2; k++) {
						const idx = (imul((room.c - 2) | 0, i) + imul((room.b + j) | 0, this.h) + room.a + k) | 0;
						this.g[idx].A_(0);
						this.m[idx] = -1;
					}
				}
			}
		} else if (fg2.Y_(type, 6, 8, 7, 9)) {
			// river through the room: 6 / 8 vertical, 7 / 9 horizontal; 8 / 9 have a bridge
			const bridged = fg2.W_(type, 8, 9);
			const pw = this.c;
			let dx = 0, dy = 0;
			if ((pw.E || pw.F || pw.G) && bridged) {
				if (room.w === 26) {
					const s = this.f.h_(2) < 1 ? 1 : -1;
					if (this.u) { dx = 0; dy = s; } else { dx = s; dy = 0; }
					room.D = new Util$Point((idiv(room.c, 2) + room.a + dx) | 0, (idiv(room.d, 2) + room.b + dy) | 0);
				} else if (this.e.h_(100) < (pw.F ? 66 : 75)) {
					room.D = new Util$Point((idiv(room.c, 2) + room.a) | 0, (idiv(room.d, 2) + room.b) | 0);
				}
			}
			const p = this.c;
			const cave = p.F && !room.r;
			let water;
			if (cave) water = 2;
			else if (p.E) water = 4;
			else if (p.C) water = 3;
			else water = p.D;
			let bridge;
			if (cave) bridge = 19;
			else if (p.C) bridge = 11;
			else bridge = 2;
			if (cave && bridged) {
				if (type === 8) {
					const y = (idiv(room.d, 2) + room.b) | 0;
					for (let x = room.a; x < room.a + room.c; x++) {
						const c = this.g[(imul(this.h, y) + x) | 0];
						c.a = 1;
						c.b = 18;
					}
				} else {
					const x = (idiv(room.c, 2) + room.a) | 0;
					for (let y = room.b; y < room.b + room.d; y++) {
						const c = this.g[(imul(this.h, y) + x) | 0];
						c.a = 1;
						c.b = 18;
					}
				}
			}
			if (fg2.W_(type, 6, 8)) {
				const half = idiv(room.c, 2);
				const mid = (idiv(room.d, 2) + room.b) | 0;
				for (let y = room.b; y < room.b + room.d; y++) {
					for (let x = (room.a + half - 1) | 0; x < room.a + half + 2; x++) {
						const c = this.g[(imul(this.h, y) + x) | 0];
						if (type === 8 && y === mid) {
							c.a = 1;
							c.b = bridge;
						} else {
							c.a = 4;
							c.b = water;
						}
					}
				}
				const oc = twin.c;
				room.c = (half - 1) | 0;
				twin.c = (oc - half - 2) | 0;
				twin.a = (oc - twin.c + twin.a) | 0;
				if ((cave && bridged && room.D == null) || room.w === 26) {
					const y = (mid - dy) | 0;
					room.E = new Util$Point((this.e.h_(room.c) + room.a - dx) | 0, y);
					twin.E = new Util$Point((this.e.h_(twin.c) + twin.a - dx) | 0, y);
				}
			} else {
				const half = idiv(room.d, 2);
				const midx = (idiv(room.c, 2) + room.a) | 0;
				for (let y = (room.b + half - 1) | 0; y < room.b + half + 2; y++) {
					for (let x = room.a; x < room.a + room.c; x++) {
						const c = this.g[(imul(this.h, y) + x) | 0];
						if (type === 9 && x === midx) {
							c.a = 1;
							c.b = bridge;
						} else {
							c.a = 4;
							c.b = water;
						}
					}
				}
				const od = twin.d;
				room.d = (half - 1) | 0;
				twin.d = (od - half - 2) | 0;
				twin.b = (od - twin.d + twin.b) | 0;
				if ((cave && bridged && room.D == null) || room.w === 26) {
					const x = (midx - dx) | 0;
					room.E = new Util$Point(x, (this.e.h_(room.d) + room.b - dy) | 0);
					twin.E = new Util$Point(x, (this.e.h_(twin.d) + twin.b - dy) | 0);
				}
			}
		} else if (type >= 14 && type <= 17) {
			// cut one quarter (rounded up to even): 14 top-left, 15 top-right, 16 bottom-left, 17 bottom-right
			const c = room.c, d = room.d;
			let qw_ = idiv(c, 2);
			let qh = idiv(d, 2);
			if ((qw_ & 1) === 1) qw_++;
			if ((qh & 1) === 1) qh++;
			const ox = type === 15 || type === 17 ? (c - qw_) | 0 : 0;
			const oy = type === 16 || type === 17 ? (d - qh) | 0 : 0;
			for (let y = 0; y < qh; y++) {
				for (let x = 0; x < qw_; x++) {
					const idx = al2.h_(imul((room.b + oy + y) | 0, this.h), room.a, ox, x);
					this.g[idx].A_(0);
					this.m[idx] = -1;
				}
			}
		}

		if (twin !== null) {
			for (let y = twin.b; y < twin.b + twin.d; y++) {
				for (let x = twin.a; x < twin.a + twin.c; x++) {
					this.m[(imul(this.h, y) + x) | 0] = twin.e;
				}
			}
		}
	},

	/** void b0(): water features for shapes 10 (moat), 11 (corner pools), 12 (cross), 4 (pool), 5 (lake), 13 (pillars). */
	b0_() {
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; ) {
			const r = get(rooms, i);
			i++;
			const v = r.v;
			if (v === 10) {
				const t = this.h_(r.w);
				for (let x = r.a; x < r.a + r.c; x++) {
					if (!this.g[(imul((r.b - 1) | 0, this.h) + x) | 0].j_()) {
						const c = this.g[(imul(r.b, this.h) + x) | 0];
						c.a = 4;
						c.b = t;
					}
					if (!this.g[(imul((r.b + r.d) | 0, this.h) + x) | 0].j_()) {
						const c = this.g[(imul((r.b + r.d - 1) | 0, this.h) + x) | 0];
						c.a = 4;
						c.b = t;
					}
				}
				for (let y = r.b; y < r.b + r.d; y++) {
					if (!this.g[(imul(this.h, y) + r.a - 1) | 0].j_()) {
						const c = this.g[(imul(this.h, y) + r.a) | 0];
						c.a = 4;
						c.b = t;
					}
					if (!this.g[(imul(this.h, y) + r.a + r.c) | 0].j_()) {
						const c = this.g[(imul(this.h, y) + r.a + r.c - 1) | 0];
						c.a = 4;
						c.b = t;
					}
				}
				this.z0_(r.a, r.b, -1, -1);
				this.z0_((r.a + r.c - 1) | 0, r.b, 1, -1);
				this.z0_(r.a, (r.b + r.d - 1) | 0, -1, 1);
				this.z0_((r.a + r.c - 1) | 0, (r.b + r.d - 1) | 0, 1, 1);
			} else if (v === 11) {
				const t = this.h_(r.w);
				this.y0_(r, -1, 0, t);
				this.y0_(r, 0, -1, t);
				this.y0_(r, 1, 0, t);
				this.y0_(r, 0, 1, t);
			} else if (v === 12) {
				// water cross through the centre, floor kept where the arm meets an open edge
				const hc = idiv(r.c, 2);
				const hd = idiv(r.d, 2);
				const t = this.h_(r.w);
				let floor;
				if (r.w !== 3) floor = this.c.C ? 11 : 2;
				else floor = 1;
				for (let x = 0; x < r.c; x++) {
					if (x < hc - 1 || x > hc + 1) {
						const row = (imul((r.b + hd) | 0, this.h) + r.a) | 0;
						const idx = (row + x) | 0;
						if (x !== 0 || !this.g[(row - 1) | 0].j_()) {
							const c = r.c;
							if (x !== c - 1 || !this.g[(imul((r.b + hd) | 0, this.h) + r.a + c) | 0].j_()) {
								const cell = this.g[idx];
								cell.a = 4;
								cell.b = t;
								continue;
							}
						}
						if (this.g[idx].h_()) this.g[idx].b = floor;
					}
				}
				for (let y = 0; y < r.d; y++) {
					if (y < hd - 1 || y > hd + 1) {
						const b = r.b, W = this.h, a = r.a;
						const idx = (imul((b + y) | 0, W) + a + hc) | 0;
						if (y !== 0 || !this.g[(imul((b - 1) | 0, W) + a + hc) | 0].j_()) {
							const d = r.d;
							if (y !== d - 1 || !this.g[(imul((r.b + d) | 0, this.h) + r.a + hc) | 0].j_()) {
								const cell = this.g[idx];
								cell.a = 4;
								cell.b = t;
								continue;
							}
						}
						if (this.g[idx].h_()) this.g[idx].b = floor;
					}
				}
				const cx = (idiv(r.c, 2) + r.a) | 0;
				const cy = (idiv(r.d, 2) + r.b) | 0;
				for (let d = -1; d < 2; d++) {
					const idx = lz0.h_(cy, this.h, cx, d);
					if (this.g[idx].h_()) this.g[idx].b = floor;
				}
				for (let d = -1; d < 2; d++) {
					const idx = (imul((cy + d) | 0, this.h) + cx) | 0;
					if (this.g[idx].h_()) this.g[idx].b = floor;
				}
			} else if (v === 4) {
				const p = this.c;
				let t;
				if (p.E || p.G) t = 4;
				else if (p.C) t = 3;
				else t = p.D;
				for (let y = (r.b + 3) | 0; y < r.b + r.d - 3; y++) {
					for (let x = (r.a + 3) | 0; x < r.a + r.c - 3; x++) {
						const c = this.g[(imul(this.h, y) + x) | 0];
						c.a = 4;
						c.b = t;
					}
				}
			} else if (v === 5) {
				// lake with a ragged rim (cosmetic stream decides the rim cells, corners stay dry)
				const y0 = (r.b + 2) | 0;
				const y1 = (r.b + r.d - 3) | 0;
				const x0 = (r.a + 2) | 0;
				const x1 = (r.a + r.c - 3) | 0;
				for (let y = y0; y <= y1; y++) {
					for (let x = x0; x <= x1; x++) {
						if ((y !== y0 && y !== y1 && x !== x0 && x !== x1)
							|| (((y !== y0 && y !== y1) || (x !== x0 && x !== x1)) && this.f.h_(100) < 40)) {
							const c = this.g[(imul(this.h, y) + x) | 0];
							c.a = 4;
							c.b = 2;
						}
					}
				}
			} else if (v === 13) {
				// pillar rows (type 6 cells) along the long axis; egypt may space them by 2
				const G = this.c.G;
				const step = G && this.e.h_(100) < 50 ? 2 : 3;
				const style = G ? 1 : 0;
				if (r.c <= r.d) {
					for (let k = 2; k < r.d - 2; k = (k + step) | 0) {
						const c = r.c;
						const g = this.g;
						const b = r.b;
						if (c >= 9) {
							const row = (imul((b + k) | 0, this.h) + r.a) | 0;
							let cell = g[(row + 2) | 0];
							cell.a = 6;
							cell.b = style;
							cell = g[(row + c - 3) | 0];
							cell.a = 6;
							cell.b = style;
						} else {
							const cell = g[(imul((b + k) | 0, this.h) + r.a + 3) | 0];
							cell.a = 6;
							cell.b = style;
						}
					}
				} else {
					for (let k = 2; k < r.c - 2; k = (k + step) | 0) {
						const d = r.d;
						const g = this.g;
						const b = r.b;
						if (d >= 9) {
							const W = this.h, a = r.a;
							let cell = g[(imul((b + 2) | 0, W) + a + k) | 0];
							cell.a = 6;
							cell.b = style;
							cell = g[(imul((b + d - 3) | 0, W) + a + k) | 0];
							cell.a = 6;
							cell.b = style;
						} else {
							const cell = g[(imul((b + 3) | 0, this.h) + r.a + k) | 0];
							cell.a = 6;
							cell.b = style;
						}
					}
				}
			}
		}
	},

	/** void y0(u30, dx, dy, byte liquid): corner pool on side (dx, dy), unless that side is open. */
	y0_(r, dx, dy, t) {
		const a = r.a;
		let x0, x1, y0, y1;
		if (dx === -1) x0 = 0;
		else if (dx === 1) x0 = (r.c - 2) | 0;
		else x0 = 3;
		x0 = (x0 + a) | 0;
		if (dx === -1) x1 = 2;
		else {
			x1 = r.c;
			if (dx !== 1) x1 = (x1 - 3) | 0;
		}
		x1 = (x1 + a) | 0;
		const b = r.b;
		if (dy === -1) y0 = 0;
		else if (dy === 1) y0 = (r.d - 2) | 0;
		else y0 = 3;
		y0 = (y0 + b) | 0;
		if (dy === -1) y1 = 2;
		else {
			y1 = r.d;
			if (dy !== 1) y1 = (y1 - 3) | 0;
		}
		y1 = (y1 + b) | 0;
		if (dx === 0) {
			const row = dy === -1 ? (b - 1) | 0 : (b + r.d) | 0;
			for (let x = x0; x < x1; x++) {
				if (this.g[(imul(this.h, row) + x) | 0].j_()) return;
			}
		} else {
			const col = dx === -1 ? (a - 1) | 0 : (a + r.c) | 0;
			for (let y = y0; y < y1; y++) {
				if (this.g[(imul(this.h, y) + col) | 0].j_()) return;
			}
		}
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				const c = this.g[(imul(this.h, y) + x) | 0];
				c.a = 4;
				c.b = t;
			}
		}
	},

	/** void z0(x, y, dx, dy): moat corner: if a neighbour outside is open, floor the corner and its two edge cells. */
	z0_(x, y, dx, dy) {
		if (this.g[(imul((y + dy) | 0, this.h) + x) | 0].j_() || this.g[lz0.h_(y, this.h, x, dx)].j_()) {
			const g = this.g;
			const W = this.h;
			const i = (imul(y, W) + x) | 0;
			let c = g[i];
			c.a = 1;
			c.b = 0;
			c = g[(i - dx) | 0];
			c.a = 1;
			c.b = 0;
			c = g[(imul((y - dy) | 0, W) + x) | 0];
			c.a = 1;
			c.b = 0;
		}
	},

	/** byte h(int theme): liquid code for pools. */
	h_(theme) {
		const pw = this.c;
		if (theme === 3) return pw.G ? pw.D : 1;
		return pw.C ? 3 : pw.D;
	},

	/** int i0(int n): random odd number in [1, n). */
	i0_(n) {
		return n <= 2 ? 1 : (imul(this.e.h_(idiv(n, 2)), 2) + 1) | 0;
	},

	/** boolean l(u30): room keeps a margin of s30.k from both ends of the long axis. */
	l_(room) {
		if (this.u) {
			const x = room.a;
			const m = this.a.k;
			if (x >= m && x + room.c < this.k - m) return true;
		} else {
			const y = room.b;
			const m = this.a.k;
			if (y >= m && y + room.d < this.l - m) return true;
		}
		return false;
	},

	/** boolean k0(Util$Point p, dx, dy, n): walk p up to n steps; true at the first non-void cell (p is moved). */
	k0_(p, dx, dy, n) {
		for (let i = 0; i < n; i++) {
			const y = p.b;
			const x = p.a;
			if (this.g[(imul(this.h, y) + x) | 0].a !== 0) return true;
			p.a = (x + dx) | 0;
			p.b = (y + dy) | 0;
		}
		return false;
	},

	/** boolean r(wall, floor, vertical): a one-cell wall between two plain room floors can become a door. */
	r_(w, f, dir) {
		if (this.m[f] !== -1 && this.g[f].h_()) {
			const g = this.g;
			if (g[w].a === 2) {
				if (dir !== 0) {
					const W = this.h;
					if (g[(w + W) | 0].a === 2
						&& g[(w - W) | 0].a === 2
						&& g[(W + f) | 0].h_()
						&& this.g[(f - this.h) | 0].h_()
						&& this.g[(imul(this.h, 2) + f) | 0].i_()
						&& this.g[(f - imul(this.h, 2)) | 0].i_()) {
						return true;
					}
				} else if (g[(w + 1) | 0].a === 2
					&& g[(w - 1) | 0].a === 2
					&& g[(f + 1) | 0].h_()
					&& this.g[(f - 1) | 0].h_()
					&& this.g[(f + 2) | 0].i_()
					&& this.g[(f - 2) | 0].i_()) {
					return true;
				}
			}
		}
		return false;
	},

	/** void c(x, y, dx, dy, len): arena lane: 12..17 bushes (9/17) on the line outside rooms. */
	c_(x, y, dx, dy, len) {
		const want = this.e.i_(12, 17);
		let got = 0;
		for (let t = 0; got < want && t < imul(len, 2); t++) {
			const k = this.e.i_(3, (len - 4) | 0);
			const idx = (imul((imul(k, dy) + y) | 0, this.h) + imul(k, dx) + x) | 0;
			if (this.g[idx].o_(false)) {
				if (this.m[idx] === -1) {
					const c = this.g[idx];
					c.a = 9;
					c.b = 17;
				}
				got++;
			}
		}
	},

	/** void b(x, y, dx, dy, len, many): collect 5..7 (many) or 1..2 cover points on a line into x30.C. */
	b_(x, y, dx, dy, len, many) {
		const e = this.e;
		const want = many ? e.i_(5, 7) : e.i_(1, 2);
		let got = 0;
		for (let t = 0; got < want && t < 25; t++) {
			const k = this.e.i_(1, (len - 2) | 0);
			const px = (imul(k, dx) + x) | 0;
			const py = (imul(k, dy) + y) | 0;
			if (this.g[(imul(this.h, py) + px) | 0].o_(false)) {
				this.C.push(new Util$Point(px, py));
				got++;
			}
		}
	},
});
