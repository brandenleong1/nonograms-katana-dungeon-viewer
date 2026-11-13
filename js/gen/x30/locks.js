// x30 locks and links: M (key 32 + locked door 33), I (ladder 40 + hatch 38/39 into an isolated room),
// J (basements on split maps), K (ladders behind gates), a0 (portal pair 88), l0 / e0 (cleanup around
// ladders and the 52 entry / exit markers), and the cell predicates s, q, p, o, n, m plus z (tree cell).
// Source: decompiled/vineflower/x30.java. I and M were ported from smali (Vineflower and JADX both
// garble their register reuse); J, K, a0 match Vineflower and were checked against smali.
import { install, x30 } from './index.js';
import { imul, idiv, irem, iabs, get } from '../jrt.js';
import { xs } from '../statics.js';
import { fg2, lz0, n30, wg2, jw, Util$Point } from '../model.js';

const isNull = (o) => o === null || o === undefined;

install({
	/**
	 * void M(): locked doors. For a dead-end room whose last door leads (v0) into neighbour nb, put key 32
	 * in a third room next to nb and lock the door (33). One lock (two on egypt maps, pw.G).
	 */
	M_() {
		this.D = 0;
		if (this.b.b < 4) return;
		const max = this.c.G ? 2 : 1;
		const pt = new Util$Point();
		const rooms = this.n;
		const n = rooms.length;
		next: for (let i = 0; i < n; i++) {
			const room = get(rooms, i);
			const re = room.e;
			if (room.n || room.o) continue;
			if (!room.c_(true)) continue;
			for (const ni of get(this.B.a, re)) {
				const nb = get(rooms, ni);
				if (nb.g || nb.o || nb.w === 13) continue;
				if (!this.v0_(room.B, room.C, ni, true, pt, false)) continue;
				const around = get(this.B.a, ni);
				if (around.size() < 3) continue;
				for (const ti of around) {
					if (ti === re) continue;
					const third = get(rooms, ti);
					if (third.g) continue;
					if (fg2.X_(third.w, 13, 14, 26)) continue;
					if (this.D > 0 && third.n) continue;
					if (!third.a_(false)) {
						// a corridor-like third room (<= 2 doors, <= 2 links) still works if one of its other
						// neighbours is a dead end
						const te = third.e;
						const nbe = nb.e;
						if (get(rooms, te).z > 2) continue;
						const links = get(this.B.a, te);
						if (links.size() > 2) continue;
						let found = false;
						for (const fi of links) {
							const f = get(rooms, fi);
							if (fi === nbe || fi === re || f.g) continue;
							if (f.a_(false)) {
								found = true;
								break;
							}
						}
						if (!found) continue;
					}
					const key = this.R_(third, 32, 0, false, true, true, null, false, false);
					if (isNull(key)) continue;
					const idx = (imul(pt.b, this.h) + pt.a) | 0;
					if (this.g[idx].a !== 3) {
						wg2.h_('invalid last door');
						return;
					}
					const hw = this.b;
					const o = hw.k[idx];
					if (!isNull(o)) hw.j_(o, false);
					const door = this.b.M_(33, pt.a, pt.b, false);
					const c = this.g[idx];
					const egypt = this.c.G;
					c.b = egypt ? 6 : 0;
					room.n = true;
					room.x = egypt ? 25 : 9;
					this.w_(room);
					const d = (this.D + 1) | 0;
					this.D = d;
					key.h = d;
					door.h = d;
					if (d >= max) return;
					continue next;
				}
			}
		}
	},

	/**
	 * boolean I(u30 a, u30 b, Util$Point door, boolean force): ladder 40 on a wall of one room and hatch
	 * 38/39 in the other, linking them; b becomes isolated (o) and a is marked as host (q). With `door`,
	 * b's corridor from its last door is removed. On gated maps (y) the first link also gets b's exit tile.
	 */
	I_(r1, r2, door, force) {
		const first = this.y && this.E === 0;
		const swap = !first && (force || this.e.h_(100) < 70);
		const host = swap ? r1 : r2; // gets the hatch
		const lad = swap ? r2 : r1;  // gets the ladder

		let spot = null;
		tries: for (let t = 0; t < 40; t++) {
			let off = this.e.h_((lad.c + lad.d) | 0);
			const lc = lad.c;
			let top;
			if (off >= lc) {
				off = (off - lc) | 0;
				top = false;
			} else {
				top = true;
			}
			let x = lad.a;
			let y = lad.b;
			if (top) x = (x + off) | 0;
			else {
				x = (x + lc - 1) | 0;
				y = (y + off) | 0;
			}
			// walk down from the top row (or left from the right column) to the first floor cell
			for (;;) {
				const W = this.h;
				const idx = (imul(y, W) + x) | 0;
				if (this.m[idx] === lad.e && this.g[idx].a !== 2) {
					const g = this.g;
					const wx = top ? x : (x + 1) | 0;
					const wy = top ? (y - 1) | 0 : y;
					const wi = (imul(wy, W) + wx) | 0;
					if (g[wi].a !== 2 || !isNull(this.b.k[wi])) continue tries;
					let horiz = false;
					if (wy < this.i - 1 && g[W + wi].h_()) {
						const k = this.b.k;
						const W2 = this.h;
						if (isNull(k[wi + W2]) && wx > 0) {
							const g2 = this.g;
							if (g2[wi - 1].a === 2 && isNull(k[wi - 1]) && wx < W2 - 1
								&& g2[wi + 1].a === 2 && isNull(k[wi + 1])) horiz = true;
						}
					}
					let vert = false;
					if (wx > 0 && this.g[wi - 1].h_()) {
						const k = this.b.k;
						if (isNull(k[wi - 1]) && wy > 0) {
							const g2 = this.g;
							const W2 = this.h;
							if (g2[wi - W2].a === 2 && isNull(k[wi - W2]) && wy < this.i - 1
								&& g2[W2 + wi].a === 2 && isNull(k[W2 + wi])) vert = true;
						}
					}
					if (!horiz && !vert) continue tries;
					if (horiz && vert) continue tries;
					const W3 = this.h;
					const clear = vert
						? this.s_((wi - W3 - 1) | 0, 0, true) && this.s_((this.h + wi - 1) | 0, 0, true)
						: this.s_((W3 + wi - 1) | 0, 0, true) && this.s_((wi + this.h + 1) | 0, 0, true);
					if (!clear) continue tries;
					spot = new jw(wx, wy, vert);
					break tries;
				}
				if (top) {
					y = (y + 1) | 0;
					if (y >= lad.b + lad.d - 1) continue tries;
				} else {
					x = (x - 1) | 0;
					if (x <= lad.a + 1) continue tries;
				}
			}
		}
		if (spot === null) return false;

		const flip = spot.c;
		const id = swap && this.e.h_(100) < 25 ? 39 : 38;
		const hatch = this.R_(host, id, 0, false, true, true, null, false, false);
		if (isNull(hatch)) return false;
		const ladder = this.b.M_(40, spot.a, spot.b, flip);
		hatch.c = flip;
		const e = (this.E + 1) | 0;
		this.E = e;
		ladder.h = e;
		hatch.h = e;

		if (door !== null && door !== undefined) {
			const W = this.h;
			const di = (imul(door.b, W) + door.a) | 0;
			const li = (imul(W, r2.C) + r2.B) | 0;
			if (this.g[di].a !== 3) {
				wg2.h_('invalid last door');
				return false;
			}
			if (li !== di) {
				// remove the corridor between b's last door and `door`, then the walls left floating
				this.v0_(r2.B, r2.C, r1.e, false, new Util$Point(), true);
				let x0 = (Math.min(r2.B, door.a) - 1) | 0;
				let y0 = (Math.min(r2.C, door.b) - 1) | 0;
				let x1 = (Math.max(r2.B, door.a) + 1) | 0;
				let y1 = (Math.max(r2.C, door.b) + 1) | 0;
				if (x0 < 0) x0 = 0;
				if (x1 >= this.h) x1 = (this.h - 1) | 0;
				if (y0 < 0) y0 = 0;
				if (y1 >= this.i) y1 = (this.i - 1) | 0;
				for (let y = y0; y <= y1; y = (y + 1) | 0) {
					for (let x = x0; x <= x1; x = (x + 1) | 0) {
						const W2 = this.h;
						const idx = (imul(y, W2) + x) | 0;
						const g = this.g;
						const c = g[idx];
						if (c.a !== 2 || !isNull(this.b.k[idx])) continue;
						const l = x === 0 || g[idx - 1].a === 0 ? -1 : 0;
						const r = x === W2 - 1 || g[idx + 1].a === 0 ? 1 : 0;
						const u = y === 0 || g[idx - W2].a === 0 ? -1 : 0;
						const H = this.i;
						const d = y === H - 1 || g[idx + W2].a === 0 ? 1 : 0;
						if (!((l !== 0 && r !== 0) || (u !== 0 && d !== 0))) {
							if (l + r === 0 || u + d === 0) continue;
							const nx = (x - l - r) | 0;
							const ny = (y - u - d) | 0;
							if (nx >= 0 && nx < W2 && ny >= 0 && ny < H && g[(imul(ny, W2) + nx) | 0].a !== 0) continue;
						}
						c.a = 0;
						c.b = 0;
					}
				}
			}
			const dc = this.g[di];
			dc.a = 2;
			dc.b = 0;
			const hw = this.b;
			const o = hw.k[di];
			if (!isNull(o)) hw.j_(o, false);
			if (li !== di) {
				const lc2 = this.g[li];
				lc2.a = 2;
				lc2.b = 0;
				const hw2 = this.b;
				const o2 = hw2.k[li];
				if (!isNull(o2)) hw2.j_(o2, false);
			}
			r2.C = 0;
			r2.B = 0;
		}
		r2.o = true;
		r1.q = true;
		this.w_(r2);
		if (!first) return true;

		// gated map, first link: exit tile (5/3) in b's top or right wall; 16 tries, a hit on try 0 fails
		let t = 15;
		let ex = 0, ey = 0, side = 0;
		for (; t >= 0; t--) {
			side = this.e.h_(2);
			const off = (this.e.h_(((side === 0 ? r2.c : r2.d) - 2) | 0) + 1) | 0;
			const a = r2.a;
			const b = r2.b;
			if (side === 0) {
				const x = (off + a) | 0;
				const y = (b - 1) | 0;
				ex = x;
				ey = y;
				const g = this.g;
				const W = this.h;
				const i0 = (imul(y, W) + x) | 0;
				if (g[i0].a !== 2 || g[i0 - 1].a !== 2 || g[i0 + 1].a !== 2) continue;
				if (!g[imul(W, b) + x].h_()) continue;
				if (!this.g[(imul(this.h, b) + x - 1) | 0].h_()) continue;
				if (!this.g[lz0.h_(b, this.h, x, 1)].h_()) continue;
				const k = this.b.k;
				const W2 = this.h;
				const fi = (imul(b, W2) + x) | 0;
				if (!isNull(k[fi]) || !isNull(k[fi - 1]) || !isNull(k[fi + 1])) continue;
				if (y === 0) break;
				const g2 = this.g;
				const ui = (imul((b - 2) | 0, W2) + x) | 0;
				if (g2[ui].a === 0 && g2[ui - 1].a === 0 && g2[ui + 1].a === 0) break;
			} else {
				const x = (a + r2.c) | 0;
				const y = (off + b) | 0;
				ex = x;
				ey = y;
				const g = this.g;
				const W = this.h;
				const i0 = (imul(y, W) + x) | 0;
				if (g[i0].a !== 2) continue;
				const yu = (y - 1) | 0;
				if (g[(imul(yu, W) + x) | 0].a !== 2) continue;
				const yd = (y + 1) | 0;
				if (g[(imul(W, yd) + x) | 0].a !== 2) continue;
				if (!g[i0 - 1].h_()) continue;
				if (!this.g[(imul(this.h, yu) + x - 1) | 0].h_()) continue;
				if (!this.g[(imul(this.h, yd) + x - 1) | 0].h_()) continue;
				const k = this.b.k;
				const W2 = this.h;
				const ci = (imul(y, W2) + x) | 0;
				const ui = (imul(yu, W2) + x) | 0;
				const di2 = (imul(yd, W2) + x) | 0;
				if (!isNull(k[ci - 1]) || !isNull(k[ui - 1]) || !isNull(k[di2 - 1])) continue;
				if (x === W2 - 1) break;
				const g2 = this.g;
				if (g2[ci + 1].a === 0 && g2[ui + 1].a === 0 && g2[di2 + 1].a === 0) break;
			}
		}
		if (t > 0) {
			r2.i = true;
			const W = this.h;
			const idx = (imul(ey, W) + ex) | 0;
			const g = this.g;
			const c = g[idx];
			c.a = 5;
			c.b = 3;
			const step = side === 0 ? 1 : W;
			const c1 = g[idx - step];
			c1.a = 2;
			c1.b = 12;
			const c2 = g[idx + step];
			c2.a = 2;
			c2.b = 12;
			return true;
		}
		n30.c_(1, 'no place for exit');
		return false;
	},

	/**
	 * void J(): split maps (s30.r > 0): every room past index o (the basement half) is linked by I to a
	 * random host room of the main half; with s30.s % the second basement hangs off the first one.
	 */
	J_() {
		this.E = 0;
		const rooms = this.n;
		const cnt = (rooms.length - this.o) | 0;
		if (cnt <= 0) return;
		const hosts = [];
		for (let i = 0; i < this.o; i++) {
			const r = get(rooms, i);
			if (this.c.E) {
				if (r.r || r.w === 17) hosts.push(r);
			} else if (r.v !== 10) {
				hosts.push(r);
			}
		}
		let chain = false;
		if (cnt >= 3) {
			const s = this.a.s;
			if (s > 0 && (s >= 100 || this.e.h_(100) < this.a.s)) chain = true;
		}
		for (let k = 0; k < cnt; k++) {
			const base = get(rooms, (this.o + k) | 0);
			if (chain && k === 1) {
				chain = false;
				if (this.I_(get(rooms, this.o), base, null, true)) continue;
			}
			for (let t = 0; t < 40; t++) {
				const host = get(hosts, this.e.h_(hosts.length));
				if (host.q || host.g || fg2.W_(host.w, 13, 14)) continue;
				if (this.I_(host, base, null, this.c.E || chain)) break;
			}
		}
		if (this.E < cnt) n30.c_(1, 'isolated basements');
	},

	/**
	 * void K(): ladders behind gates (level >= 4, s30.q of them): a dead-end room's last door is closed and
	 * the room is reached by a ladder (I) from its neighbour instead.
	 */
	K_() {
		this.E = 0;
		if (this.b.b < 4) return;
		if (this.a.q <= 0) return;
		const pt = new Util$Point();
		const rooms = this.n;
		const n = rooms.length;
		done: for (let i = 0; i < n; i++) {
			const room = get(rooms, i);
			if (room.n || room.h || room.v === 10) continue;
			if (!room.c_(true)) continue;
			for (const j of get(this.B.a, room.e)) {
				const nb = get(rooms, j);
				if (nb.q || nb.g || fg2.W_(nb.w, 13, 14) || nb.v === 10) continue;
				if (!this.v0_(room.B, room.C, j, false, pt, false)) continue;
				if (!this.I_(nb, room, pt, false)) continue;
				if (this.E >= this.a.q) break done;
				break;
			}
		}
		if (this.y && this.E === 0) n30.c_(0, 'no ladder for gate (ok expected)');
	},

	/**
	 * void a0(): portal pair 88 (pw.A %) between two plain rooms far from the entry room and from each other;
	 * the distance limits shrink to 75% every 40 tries (entry) and at try 100 (pair).
	 */
	a0_() {
		if (this.c.A <= 0) return;
		if (this.e.h_(100) >= this.c.A) return;
		const q = this.q;
		const cx = (idiv(q.c, 2) + q.a) | 0;
		const cy = (idiv(q.d, 2) + q.b) | 0;
		// s30's constant field (5) in all four
		let r1 = (idiv(this.k, 2) - 5) | 0;
		let r2 = (idiv(this.l, 2) - 5) | 0;
		let r3 = (idiv(this.k, 2) - 5) | 0;
		let r4 = (idiv(this.l, 2) - 5) | 0;
		let near = 0;
		let first = null;
		for (let it = 0; it < 200; it++) {
			const rooms = this.n;
			const room = get(rooms, this.e.h_(rooms.length));
			const w30 = xs.P[room.w];
			if (first !== null && room === first) continue;
			if (room.o || x30.u_(room) || room.p || room.q || room.n) continue;
			if (w30.m || w30.j || w30.i || w30.k) continue;
			const w = room.w;
			if (w === 5 || w === 6 || w === 12 || w === 15 || w === 16 || w === 20 || w === 21 || w === 22
				|| w === 23 || w === 26 || w === 28 || w === 29) continue;
			if (room.c < 4 || room.d < 4) continue;
			if (room.c_(true)) continue;
			if (it !== 0 && irem(it, 40) === 0) {
				r1 = idiv(imul(r1, 75), 100);
				r2 = idiv(imul(r2, 75), 100);
			}
			if (it === 100) {
				r3 = idiv(imul(r3, 75), 100);
				r4 = idiv(imul(r4, 75), 100);
			}
			const rx = (idiv(room.c, 2) + room.a) | 0;
			const ry = (idiv(room.d, 2) + room.b) | 0;
			if (iabs((cx - rx) | 0) < r1 && iabs((cy - ry) | 0) < r2) continue;
			if (first === null) {
				first = room;
				continue;
			}
			const fx = (idiv(first.c, 2) + first.a) | 0;
			const fy = (idiv(first.d, 2) + first.b) | 0;
			if (iabs((fx - rx) | 0) < r3 && iabs((fy - ry) | 0) < r4) {
				near++;
				if (near <= 15) continue;
				near = 0;
				first = null;
				continue;
			}
			const p1 = this.R_(first, 88, 1, false, true, true, null, false, false);
			if (!isNull(p1)) {
				const p2 = this.R_(room, 88, 1, false, true, true, null, false, false);
				if (!isNull(p2)) {
					p2.c = true;
					p1.h = 1;
					p2.h = 1;
					first.p = true;
					room.p = true;
					return;
				}
				this.b.j_(p1, false);
			}
			near = 0;
			first = null;
		}
	},

	/** void l0(): reset the three wall cells around every ladder (40) to plain wall (ww.a()). */
	l0_() {
		const objs = this.b.n;
		const n = objs.length;
		for (let i = 0; i < n; i++) {
			const o = get(objs, i);
			if (o.a.a !== 40) continue;
			const p = o.b;
			const idx = (imul(p.b, this.h) + p.a) | 0;
			this.g[idx].a_();
			const flip = o.c;
			const g = this.g;
			if (flip) {
				g[idx - this.h].a_();
				this.g[this.h + idx].a_();
				this.g[idx - this.h - 1].a_();
			} else {
				g[idx - 1].a_();
				this.g[idx + 1].a_();
				this.g[idx + this.h + 1].a_();
			}
		}
	},

	/** void e0(qw marker): place an entry / exit marker (52) if its cell is free (arena: always, on floor 17). */
	e0_(o) {
		if (o === null || o === undefined) return;
		const p = o.b;
		if (this.a.n || (this.b.A_(p.a, p.b) && this.k_(p.a, p.b, null, false))) {
			if (this.a.n) {
				const c = this.g[(imul(p.b, this.h) + p.a) | 0];
				c.a = 1;
				c.b = 17;
			}
			this.b.g_(o, true);
		}
	},

	/**
	 * boolean s(int cell, int side, boolean strict): neighbour cell is not a door / water / entrance and,
	 * when strict, holds no blocking object and is no barrel floor; its object does not face `side`.
	 */
	s_(i, side, strict) {
		if (fg2.X_(this.g[i].a, 3, 8, 5)) return false;
		if (strict) {
			const o = this.b.k[i];
			if ((!isNull(o) && o.a.O) || this.g[i].n_()) return false;
		}
		if (side === 0) return true;
		const o = this.b.k[i];
		return isNull(o) || (o.a.P & side) === 0;
	},

	/** boolean q(int cell): walls (ww.z) on exactly the left+right or the top+bottom sides. */
	q_(i) {
		let mask = this.g[i - 1].z_() ? 1 : 0;
		if (this.g[i + 1].z_()) mask |= 2;
		if (this.g[i - this.h].z_()) mask |= 4;
		if (this.g[i + this.h].z_()) mask |= 8;
		return mask === 3 || mask === 12;
	},

	/** boolean p(int x, int y, boolean plain, boolean strict): free floor cell with all 8 neighbours ok (s). */
	p_(x, y, plain, strict) {
		const i = (imul(y, this.h) + x) | 0;
		const g = this.g;
		return (plain ? g[i].h_() : g[i].a === 1)
			&& isNull(this.b.k[i])
			&& this.s_((i - this.h) | 0, 1, strict)
			&& this.s_((this.h + i) | 0, 2, strict)
			&& this.s_((i - 1) | 0, 2, strict)
			&& this.s_((i + 1) | 0, 1, strict)
			&& this.s_((i - this.h - 1) | 0, 0, strict)
			&& this.s_((this.h + i - 1) | 0, 0, strict)
			&& this.s_((i - this.h + 1) | 0, 0, strict)
			&& this.s_((i + this.h + 1) | 0, 0, strict);
	},

	/**
	 * boolean o(int cell): plain floor (not ww.d) with no object and no wall-like / facing object in the
	 * four neighbours.
	 */
	o_(i) {
		const c = this.g[i];
		if (c.a !== 1 || c.d_()) return false;
		const k = this.b.k;
		if (!isNull(k[i])) return false;
		let o = k[i - 1];
		if (!isNull(o) && (o.a.W || (o.a.P & 2) !== 0)) return false;
		o = k[i + 1];
		if (!isNull(o) && (o.a.W || (o.a.P & 1) !== 0)) return false;
		const W = this.h;
		o = k[i - W];
		if (!isNull(o) && (o.a.W || (o.a.P & 1) !== 0)) return false;
		o = k[i + W];
		if (isNull(o)) return true;
		return !o.a.W && (o.a.P & 2) === 0;
	},

	/** boolean n(int cell): the cell's object is a creature (qw.e), or rw.l / rw.u, or a mine cart (84). */
	n_(i) {
		const o = this.b.k[i];
		if (!isNull(o)) {
			if (o.e_()) return true;
			const t = o.a;
			if (t.l || t.u || t.a === 84) return true;
		}
		return false;
	},

	/** boolean m(int x, int y): the cell, or (outside rooms) one of its 8 neighbours, belongs to a river room. */
	m_(x, y) {
		const ri = this.m[(imul(this.h, y) + x) | 0];
		const rooms = this.n;
		if (ri !== -1) return get(rooms, ri).r;
		for (let yy = y > 0 ? (y - 1) | 0 : y; yy < this.i && yy <= y + 1; yy = (yy + 1) | 0) {
			const row = imul(this.h, yy);
			for (let xx = x > 0 ? (x - 1) | 0 : x; xx < this.h && xx <= x + 1; xx = (xx + 1) | 0) {
				if (xx === x && yy === y) continue;
				const rj = this.m[(row + xx) | 0];
				if (rj !== -1 && get(rooms, rj).r) return true;
			}
		}
		return false;
	},

	/** void z(u30 room, int x, int y, byte mark): forest room border cell becomes a tree (7, mark). */
	z_(r, x, y, mark) {
		const idx = (imul(this.h, y) + x) | 0;
		if (this.m[idx] === r.e && this.p_(x, y, true, true) && this.k_(x, y, null, false)) {
			const c = this.g[idx];
			c.a = 7;
			c.b = mark;
		}
	},
});
