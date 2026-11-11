// x30.g (generate one dungeon from a seed) and x30.f (retry wrapper), plus the town-only stubs.
// Source: decompiled/vineflower/x30.java `g(hw, int)` (line ~8795) and `f(hw, int)`.
// The inline passes of g() (walls, outdoor conversion, foliage, traps, final marks) live here too.
import { install, x30 } from './index.js';
import { b8, imul, idiv } from '../jrt.js';
import { xs, vj0 } from '../statics.js';
import { classes } from '../registry.js';
import { fg2, n30 } from '../model.js';

install({
	/** Retry wrapper used by the game when a seed gets stuck: seed = seed * 69069 + 1. */
	f_(hw, seed) {
		for (;;) {
			try {
				this.g_(hw, seed);
				return seed;
			} catch (e) {
				if (this.c && this.c.H) throw e;  // town: the game reports and gives up
				if (!(e && e.genStuck) && !(e instanceof Error)) throw e;
			}
			seed = (imul(seed, 69069) + 1) | 0;
		}
	},

	g_(hw, seed) {
		const { ww, mw } = classes;
		this.b = hw;
		this.c = hw.c;
		this.a = xs.O[this.c.a];
		this.d = seed;
		if (seed < 0) { seed = (-seed) | 0; this.d = seed; }

		this.e.a = seed;
		this.f.a = this.e.g_();
		this.b.w.a = this.e.g_();

		const sz = this.a;
		this.h = sz.a;
		this.i = sz.b;
		if (sz.h || sz.n) {
			if (this.e.h_(2) === 0) { this.h = sz.b; this.i = sz.a; }
			if (sz.h) this.v = this.e.h_(2) === 0;
		}
		const W = this.h, H = this.i;
		this.u = W >= H;
		hw.g = W;
		hw.h = H;
		this.j = imul(W, H);
		hw.i = this.j;
		this.k = W;
		this.l = H;
		if (sz.r > 0) {
			if (this.u) this.k = (W - sz.r) | 0; else this.l = (H - sz.r) | 0;
		}
		hw.h_(true, false);
		this.g = hw.j;
		this.m = hw.l;
		for (let i = 0; i < this.j; i++) {
			this.g[i] = new ww();
			this.m[i] = -1;
		}
		hw.n.length = 0;
		hw.o.length = 0;
		hw.f = null;
		hw.A = 0;
		hw.p = null;
		const rooms = this.n;
		rooms.length = 0;
		this.p.fill(0);
		this.B = null; this.s = null; this.r = null; this.q = null; this.t = null; this.z = null;
		this.A.length = 0;
		const cover = this.C;
		cover.length = 0;
		this.x = null;
		this.w = null;
		this.y = !this.c.H && vj0.i2.E1_(hw.b);

		if (this.c.H) {
			this.F_();
		} else {
			this.Z_();
			this.j_();
			this.c0_();
			this.d_();
			if (sz.h) {
				for (let i = 0; i < this.j; i++) if (this.g[i].a === 127) this.g[i].a = 0;
				const t = this.t;
				if (t !== null) {
					const c = this.g[imul(this.h, t.b) + t.a];
					c.a = 3;
					c.b = 2;
					hw.M_(53, t.a, t.b, false);
				}
			}
		}

		if (this.c.E || this.c.F) this.j0_();

		this.wallPass();

		hw.f = new mw(hw);
		this.H_();
		if (sz.h) this.r0_();

		if (this.c.H) {
			for (const r of rooms.slice()) if (!r.H.b_() && !r.H.u) this.G_(r);
			for (const r of rooms.slice()) if (r.H.b_() && !r.H.u) this.G_(r);
		} else {
			this.G_(this.q);
			if (sz.h && this.t !== null) this.minorBossRoom();
			if (this.c.F) {
				for (let i = 0, n = rooms.length; i < n; i++) { const r = rooms[i]; if (r.r && r !== this.q) this.G_(r); }
				for (let i = 0, n = rooms.length; i < n; i++) { const r = rooms[i]; if (!r.r && r !== this.q) this.G_(r); }
			} else {
				for (let i = 0, n = rooms.length; i < n; i++) { const r = rooms[i]; if (r !== this.q) this.G_(r); }
			}
		}

		if (sz.n) {
			// arena: doors along both side lanes
			const u = this.u ? 1 : 0, nu = u ^ 1;
			let x = u ? 1 : this.I;
			let y = u ? this.I : 1;
			for (let k = 1; k < this.H; k++) {
				this.x_(null, (x + nu * 2) | 0, (y + u * 2) | 0, this.u, false);
				this.x_(null, (x - nu * 2) | 0, (y - u * 2) | 0, this.u, false);
				x = (x + u) | 0;
				y = (y + nu) | 0;
			}
		}

		if (!this.c.E && !this.c.H) {
			this.V_();
			this.W_();
		}
		this.b0_();

		// usable floor area per room
		for (let i = 0, n = rooms.length; i < n; i++) {
			const r = rooms[i];
			if (r.v === 0) {
				r.y = imul(r.c, r.d);
			} else {
				for (let dy = 0; dy < r.d; dy++) {
					for (let dx = 0; dx < r.c; dx++) {
						const idx = imul(r.b + dy, this.h) + r.a + dx;
						if (this.g[idx].h_() && this.m[idx] === r.e) r.y = (r.y + 1) | 0;
					}
				}
			}
		}

		if (!this.c.H) {
			this.p0_(true);
			this.p0_(false);
		}
		this.o0_();
		if (!this.c.H) {
			if (!this.c.E) this.M_();
			if (sz.r > 0) this.J_(); else this.K_();
			this.a0_();
		}

		if (this.c.E || this.c.F || (this.c.H && sz.r > 0)) this.outdoorPass();

		if (this.c.H) {
			this.d0_();
		} else {
			this.h0_();
			this.l0_();
		}
		this.e0_(this.w);
		this.e0_(this.x);

		const hero = hw.f;
		const hp = hero.b;
		if (this.g[imul(hp.b, this.h) + hp.a].a !== 1) {
			n30.c_(1, 'hero wrong pos');
			return;
		}
		hero.k = 1;
		hw.f_(hero, true);

		if (sz.n) this.arenaGates();

		if (this.c.H) {
			this.E_();
		} else {
			this.S_();
			this.D_();
			this.T_();
		}

		this.coverPass();

		if (!this.c.H) this.O_();
		this.e_();
		this.trapPass();
		if (!this.c.E && !this.c.H) this.L_();
		if (this.c.E || this.c.F) this.foliagePass();

		if (this.c.E) {
			// theme-21 meadow rooms fill 70-100% with undergrowth (cosmetic stream)
			for (let i = 0, n = rooms.length; i < n; i++) {
				const r = rooms[i];
				if (r.w !== 21) continue;
				const cnt = idiv(imul(imul((this.f.h_(30) + 70) | 0, r.c), r.d), 100);
				for (let k = 0; k < cnt; k++) {
					const dx = this.f.h_(r.c);
					const dy = this.f.h_(r.d);
					const idx = imul(r.b + dy, this.h) + r.a + dx;
					if (this.m[idx] === r.e && this.o_(idx)) {
						const c = this.g[idx];
						c.a = 10;
						c.b = 0;
					}
				}
			}
		}

		if (this.c.G) {
			for (let i = 0; i < this.j; i++) this.markTomb(this.g[i]);
		} else if (this.c.H) {
			for (let i = 0, n = rooms.length; i < n; i++) {
				const r = rooms[i];
				if (!r.H || !r.H.t) continue;
				const y0 = Math.max(r.b - 1, 0), y1 = Math.min(r.b + r.d, this.i - 1);
				const x0 = Math.max(r.a - 1, 0), x1 = Math.min(r.a + r.c, this.h - 1);
				for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.markTomb(this.g[imul(this.h, y) + x]);
			}
		}

		hw.l_(true);
		hw.a = this.d;
		hw.h_(false, true);
		hw.y = hw.i_();
		if (hw.y < 4 && !this.c.H) n30.c_(1, 'not enough objectives');
	},

	// ---- inline passes of g() ------------------------------------------------------------

	/** Every void cell touching floor/water/door (8-neighbourhood) becomes wall. */
	wallPass() {
		const { h: W, i: H, g: cells, m } = this;
		const rooms = this.n;
		const pw = this.c;
		for (let y = 0; y < H; y++) {
			const ya = y > 0 ? y - 1 : y, yb = Math.min(y + 1, H - 1);
			for (let x = 0; x < W; x++) {
				const xa = x > 0 ? x - 1 : x, xb = Math.min(x + 1, W - 1);
				const idx = imul(W, y) + x;
				if (cells[idx].a !== 0) continue;
				let wall = false;
				scan: for (let yy = ya; yy <= yb; yy++) {
					for (let xx = xa; xx <= xb; xx++) {
						if (yy === y && xx === x) continue;
						const n = cells[imul(W, yy) + xx];
						if (pw.F) {
							if ((n.a === 1 && !fg2.W_(n.b & 31, 1, 19)) || fg2.W_(n.a, 4, 3)) { wall = true; break scan; }
						} else if (pw.H) {
							if (fg2.X_(n.a, 1, 4, 3)) {
								const ri = m[imul(W, yy) + xx];
								if (ri === -1 || !rooms[ri].h) { wall = true; break scan; }
							}
						} else if (fg2.X_(n.a, 1, 4, 3)) { wall = true; break scan; }
					}
				}
				if (wall) cells[idx].A_(2);
			}
		}
	},

	/** River maps: room for the minor boss beyond the boss-river gap. */
	minorBossRoom() {
		const u = this.u;
		const dx = u ? (this.v ? -1 : 1) : 0;
		const dy = u ? 0 : (this.v ? -1 : 1);
		const t = this.t;
		this.s = this.w0_(t.a, t.b, dx, dy, 2);
		if (this.s !== null) return;
		const tx = t.a, ty = t.b;
		const span = this.a.m;
		for (let tries = 0; ; ) {
			if (tries >= 170) { n30.c_(1, 'no room for minor boss'); return; }
			const along = this.e.h_(span);
			const across = (this.e.h_(imul(span, 2)) - span) | 0;
			let px, py;
			if (dx !== 0) { px = (imul(along, dx) + tx) | 0; py = (across + ty) | 0; }
			else { py = (imul(along, dy) + ty) | 0; px = (across + tx) | 0; }
			if (px >= 0 && py >= 0 && px < this.h && py < this.i) {
				tries++;
				const ri = this.m[imul(py, this.h) + px];
				if (ri !== -1) {
					const r = this.n[ri];
					if (!x30.t_(r, true) && (tries > 90 || imul(r.c, r.d) >= 25)) { this.s = r; return; }
				}
			}
		}
	},

	/** Forest / cave (and town band): walls outdoors become trees or rock; tree borders inside rooms. */
	outdoorPass() {
		const pw = this.c, W = this.h, H = this.i;
		const mark = pw.F || pw.H ? 32 : 0;
		const x0 = pw.H && this.a.r > 0 ? this.k : 0;
		for (let y = 0; y < H; y++) {
			for (let x = x0; x < W; x++) {
				const idx = imul(W, y) + x;
				const c = this.g[idx];
				if (c.a === 2) {
					if (!this.m_(x, y)) { c.a = 7; c.b = mark; }
				} else if (pw.E && c.a === 3 && !this.m_(x, y)) {
					const o = this.b.k[idx];
					if (o !== null && o !== undefined) {
						if (!fg2.W_(o.a.a, 53, 28)) throw new Error(`RuntimeException: obj in forest door: ${o.a.a}`);
					} else {
						c.A_(8);
					}
				}
			}
		}
		if (pw.H) return;
		const f = this.f;
		const rooms = this.n;
		for (let i = 0, n = rooms.length; i < n; i++) {
			const r = rooms[i];
			if (r.r || r.f || r.g || fg2.X_(r.w, 17, 14, 13) || r.c < 5 || r.d < 5) continue;
			// top edge, bottom edge, left edge, right edge; gaps of f.h(5)+1
			for (let x = (f.h_(5) + r.a) | 0; x < r.a + r.c; x = (x + f.h_(5) + 1) | 0) this.z_(r, x, r.b, mark);
			for (let x = (f.h_(5) + r.a) | 0; x < r.a + r.c; x = (x + f.h_(5) + 1) | 0) this.z_(r, x, r.b + r.d - 1, mark);
			for (let y = (f.h_(5) + r.b) | 0; y < r.b + r.d; y = (y + f.h_(5) + 1) | 0) this.z_(r, r.a, y, mark);
			for (let y = (f.h_(5) + r.b) | 0; y < r.b + r.d; y = (y + f.h_(5) + 1) | 0) this.z_(r, r.a + r.c - 1, y, mark);
		}
	},

	/** Arena (level 22): four gates of undergrowth across the lane, lane cover and spawn points. */
	arenaGates() {
		for (let k = 0; k < 4; k++) {
			const len = this.H;
			let p = (idiv(imul(len, k), 4) + idiv(len, 8) + 1 + 1) & -2;
			const gx = this.u ? p : this.I;
			const gy = this.u ? this.I : p;
			for (let d = -1; d <= 1; d++) {
				const c = this.g[imul((this.u ? d : 0) + gy, this.h) + gx + (this.u ? 0 : d)];
				c.a = 9;
				c.b = b8((d === 0 ? 0 : 16) | 1);
			}
			this.J.push((p - 3) | 0);
			this.J.push((p + 3) | 0);
		}
		const u = this.u ? 1 : 0, nu = u ^ 1;
		const ax = u ? 1 : this.I - 1, bx = u ? 1 : this.I + 1;
		const ay = u ? this.I - 1 : 1, by = u ? this.I + 1 : 1;
		this.c_(ax, ay, u, nu, this.H);
		this.c_(bx, by, u, nu, this.H);
		this.b_(ax, ay, u, nu, this.H, true);
		this.b_(bx, by, u, nu, this.H, true);
	},

	/** Cave cover points collected during corridor carving become reed objects (84). */
	coverPass() {
		const cover = this.C;
		for (let i = 0, n = cover.length; i < n; i++) {
			const p = cover[i];
			const idx = imul(p.b, this.h) + p.a;
			if (!this.g[idx].o_(false)) continue;
			const ri = this.m[idx];
			const room = ri !== -1 ? this.n[ri] : null;
			if (this.b.k[idx] !== null && this.b.k[idx] !== undefined) continue;
			if (room !== null && !this.p_(p.a, p.b, false, false)) continue;
			const q = this.b.L_(p.a, p.b);
			if (room !== null) {
				if (room.G === null || room.G === undefined) room.G = [];
				room.G.push(q);
			}
		}
	},

	/** Hidden corridor traps: pw.p..pw.q plain corridor cells away from doors and objects. */
	trapPass() {
		const pw = this.c;
		if (pw.p <= 0) return;
		const want = this.e.i_(pw.p, pw.q);
		const W = this.h;
		for (let tries = 0, placed = 0; tries < 5000; tries++) {
			const px = this.e.h_(W - 2);
			const idx = imul(this.e.h_(this.i - 2) + 1, W) + px + 1;
			const c = this.g[idx];
			if (!c.f_() || (this.b.k[idx] !== null && this.b.k[idx] !== undefined)) continue;
			const g = this.g;
			if (fg2.W_(g[idx - 1].a, 3, 8) || fg2.W_(g[idx + 1].a, 3, 8)) continue;
			if (fg2.W_(g[idx - W].a, 3, 8) || fg2.W_(g[idx + W].a, 3, 8)) continue;
			if (g[idx - 1].u_() || g[idx + 1].u_() || g[idx - W].u_() || g[idx + W].u_()) continue;
			c.b = b8(c.b | 32);
			if (++placed >= want) break;
		}
	},

	/** Forest / cave: bushes on corridors, flower patches by forest doorways, cave doors by rock. */
	foliagePass() {
		const pw = this.c, W = this.h, H = this.i, g = this.g;
		const chance = pw.E ? 18 : 29;
		const bush = pw.F ? 1 : 0;
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const idx = imul(W, y) + x;
				const c = g[idx];
				if (c.f_()) {
					if (this.b.k[idx] !== null && this.b.k[idx] !== undefined) continue;
					if (g[idx - 1].a === 3) continue;
					const right = g[idx + 1];
					if (right.a === 3) continue;
					if (g[idx - W].a !== 3 && g[idx + W].a !== 3
						&& (!pw.F || (this.m[idx] === -1 && right.m_() && g[idx - W].m_() && !g[idx - W + 1].t_() && this.q_(idx)))
						&& this.e.h_(100) < chance) {
						c.a = 9;
						c.b = bush;
					}
				} else if (pw.E && c.a === 8) {
					if (this.e.h_(100) < 40) {
						const n = this.e.i_(7, 15);
						for (let k = 0; k < n; k++) {
							const px = (this.e.h_(7) + x - 3) | 0;
							const py = (this.e.h_(7) + y - 3) | 0;
							if ((px !== x || py !== y) && px >= 1 && py >= 1 && px < W - 1 && py < H - 1) {
								const j = imul(py, W) + px;
								const ri = this.m[j];
								if (ri !== -1 && !this.n[ri].r && this.o_(j)) {
									g[j].a = 10;
									g[j].b = 0;
								}
							}
						}
					}
				} else if (pw.F && c.a === 3 && fg2.X_(c.b, 0, 1, 4)) {
					if (g[idx - 1].s_(7, 96, 32) || g[idx + 1].s_(7, 96, 32) || g[idx - W].s_(7, 96, 32) || g[idx + W].s_(7, 96, 32)) {
						c.b = b8(c.b | 8);
					}
				}
			}
		}
	},

	/** Tomb style marks: walls b|=64, plain doors b|=16. */
	markTomb(c) {
		if (c.a === 2) c.b = b8(c.b | 64);
		else if (c.a === 3 && (c.b & 24) === 0) c.b = b8(c.b | 16);
	},

	// Town (citadel, seed 0) is out of scope: never saved, fixed layout.
	F_() { throw new Error('citadel generation is not ported'); },
	E_() { throw new Error('citadel generation is not ported'); },
	d0_() { throw new Error('citadel generation is not ported'); },
});
