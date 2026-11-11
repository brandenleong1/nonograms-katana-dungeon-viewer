// x30 room graph and corridors: j (Bowyer-Watson Delaunay over room centres, 32-bit float),
// c0 (Prim spanning tree from a random room, plus a share of the shortest leftover edges as loops),
// m0 (integer distance between room centres), d (A* corridors on the half-resolution grid, with
// river bridges and cave streams), j0 (forest / cave corridor widening).
// Source: decompiled/vineflower/x30.java j (~10782), c0 (~7997), m0 (~11524), d (~8100), j0 (~11003).
// Checked against smali: j's duplicate-edge removal (JADX loops forever there), d's path tracing and
// cave-stream state (both decompiles garble the register reuse), j0's final test (JADX has `fN != 3`,
// smali and Vineflower `fN == 3`).
import { install } from './index.js';
import { imul, idiv, iabs, f32, TreeSet, sortList, get, removeAt } from '../jrt.js';
import {
	Util$Point, sw, v30, zz, a00, r30, xz, ol, z53, d2, m53, fg2, lz0, k93, ci, GenStuckException,
} from '../model.js';

const FLOAT_MAX = 3.4028234663852886e38;   // Float.MAX_VALUE
const EPS = f32(9.536743e-7);              // 0x35800000

install({
	/** void j(): Delaunay triangulation of the first `o` room centres into the room graph B. */
	j_() {
		const rooms = this.n;
		const nAll = rooms.length;
		const B = new r30();
		B.a = [];
		for (let i = 0; i < nAll; i++) B.a.push(new TreeSet());
		this.B = B;
		const N = this.o;
		const pts = new Array(N);
		for (let i = 0; i < this.o; i++) {
			const r = get(rooms, i);
			const x = r.a, w = r.c, y = r.b;
			pts[i] = new zz(f32(f32(w * 0.5) + x), f32(f32(r.d * 0.5) + y));
		}

		let tris;
		if (N < 3) {
			tris = null;
		} else {
			const order = new Array(N);
			const last = (N - 1) | 0;
			for (let i = last; i >= 0; i--) order[i] = i;
			const byX = new xz(pts);
			sortList(order, (p, q) => byX.compare_(p, q));

			let minX = FLOAT_MAX, maxX = -FLOAT_MAX, maxY = -FLOAT_MAX, minY = FLOAT_MAX;
			for (let i = 0; i < N; i++) {
				const p = pts[i];
				const x = p.a;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				const y = p.b;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
			const size = Math.max(f32(maxX - minX), f32(maxY - minY));
			const midX = f32(f32(maxX + minX) / 2);
			const midY = f32(f32(maxY + minY) / 2);
			const big = f32(2 * size);
			const low = f32(midY - size);
			const sup = [new zz(f32(midX - big), low), new zz(midX, f32(midY + big)), new zz(f32(midX + big), low)];
			const V = new Array(N + 3);
			for (let i = 0; i < N; i++) V[i] = pts[i];
			V[N] = sup[0];
			const n1 = (N + 1) | 0;
			V[n1] = sup[1];
			const n2 = (N + 2) | 0;
			V[n2] = sup[2];

			const open = [];
			open.push(m53.d_(V, N, n1, n2));
			const closed = [];
			const edges = [];
			for (let k = last; k >= 0; k--) {
				const c = order[k];
				for (let t = open.length - 1; t >= 0; t--) {
					const tri = get(open, t);
					const p = V[c];
					const dx = f32(p.a - tri.d);
					if (dx > 0 && f32(dx * dx) > tri.f) {
						// circumcircle entirely left of the sweep: final
						closed.push(tri);
						removeAt(open, t);
					} else {
						const dy = f32(p.b - tri.e);
						if (!(f32(f32(f32(dy * dy) + f32(dx * dx)) - tri.f) > EPS)) {
							edges.push(tri.a, tri.b, tri.b, tri.c, tri.c, tri.a);
							removeAt(open, t);
						}
					}
				}

				// drop edges shared by two removed triangles
				let j = edges.length;
				while (j >= 2) {
					const i1 = (j - 1) | 0;
					const b = get(edges, i1);
					j = (j - 2) | 0;
					const a = get(edges, j);
					let kk = j;
					let k1 = -1;
					let found = false;
					while (kk >= 2) {
						k1 = (kk - 1) | 0;
						const d = get(edges, k1);
						kk = (kk - 2) | 0;
						const e = get(edges, kk);
						if ((a === e && b === d) || (a === d && b === e)) {
							found = true;
							break;
						}
					}
					if (found) {
						removeAt(edges, i1);
						removeAt(edges, j);
						removeAt(edges, k1);
						removeAt(edges, kk);
						if (j >= edges.length) j = edges.length;
					}
				}

				let s = edges.length;
				while (s >= 2) {
					const v = get(edges, (s - 1) | 0);
					s = (s - 2) | 0;
					open.push(m53.d_(V, get(edges, s), v, c));
				}
				edges.length = 0;
			}

			for (let t = open.length - 1; t >= 0; t--) closed.push(get(open, t));
			tris = [];
			for (let t = closed.length - 1; t >= 0; t--) {
				const y = get(closed, t);
				const a = y.a;
				if (a < N) {
					const b = y.b;
					if (b < N) {
						const c = y.c;
						if (c < N) {
							const o = new a00();
							o.a = a;
							o.b = b;
							o.c = c;
							tris.push(o);
						}
					}
				}
			}
		}

		if (tris !== null) {
			for (let t = tris.length - 1; t >= 0; t--) {
				const o = get(tris, t);
				const a = o.a, b = o.b, c = o.c;
				this.B.a_(a, b);
				this.B.a_(b, c);
				this.B.a_(a, c);
			}
		}
	},

	/** void c0(): replace B with a minimum spanning tree (Prim from a random room) plus some loop edges. */
	c0_() {
		const n = this.o;
		const adj = [];
		for (let i = 0; i < n; i++) adj.push(new TreeSet());
		for (let i = 0; i < this.o; i++) {
			for (const j of get(this.B.a, i)) {
				if (i < j) {
					get(adj, i).add(j);
					get(adj, j).add(i);
				}
			}
		}
		const sets = this.B.a;
		for (let i = 0; i < sets.length; i++) get(sets, i).clear();

		const tree = new TreeSet();
		const extra = [];
		tree.add(this.e.h_(this.o));
		const cand = [];
		const asc = new ol(3);
		const byWeight = (x, y) => asc.compare_(x, y);
		for (let go = true; go; cand.length = 0) {
			for (const u of tree) {
				for (const v of get(adj, u)) cand.push(new v30(u, v, this.m0_(u, v)));
			}
			if (cand.length !== 0) {
				sortList(cand, byWeight);
				const best = cand[0];
				const v = best.b;
				tree.add(v);
				this.B.a_(best.a, v);
				const nb = get(adj, v);
				// Java iterates with Iterator.remove(); jrt's TreeSet iterates over a snapshot
				for (const w of nb) {
					if (tree.contains(w)) {
						nb.remove(w);
						if (w !== v) get(adj, w).remove(v);
						const s = this.B.a;
						if (!get(s, v).contains(w) && !get(s, w).contains(v)) extra.push(new v30(v, w, this.m0_(v, w)));
					}
				}
				if (tree.size() !== this.o) continue;
			}
			go = false;
		}

		sortList(extra, byWeight);
		const cnt = idiv(imul(extra.length, this.a.g), 10000);
		for (let i = 0; i < cnt; i++) {
			const lo = idiv(imul(extra.length, 2), 10);
			const k = (this.e.h_(idiv(imul(extra.length, 4), 10)) + lo) | 0;
			if (k < 0 || k >= extra.length) break;
			const ed = extra[k];
			if (this.c.E) {
				const rooms = this.n;
				if ((get(rooms, ed.a).r || get(rooms, ed.b).r) && this.e.h_(100) < 80) continue;
			}
			this.B.a_(ed.a, ed.b);
			removeAt(extra, k);
		}
	},

	/** int m0(i, j): integer sqrt of the squared centre distance of rooms i and j, scaled by 100. */
	m0_(i, j) {
		const rooms = this.n;
		const A = get(rooms, i);
		const B = get(rooms, j);
		const dx = imul((idiv(B.c, 2) + B.a - (idiv(A.c, 2) + A.a)) | 0, 100);
		const dy = imul((idiv(B.d, 2) + B.b - (idiv(A.d, 2) + A.b)) | 0, 100);
		const s = (imul(dy, dy) + imul(dx, dx)) | 0;
		const T = k93.b;
		let r;
		if (s >= 65536) {
			if (s >= 16777216) {
				if (s >= 268435456) {
					if (s >= 1073741824) r = T[s >> 24] << 8;
					else r = T[s >> 22] << 7;
				} else if (s >= 67108864) {
					r = T[s >> 20] << 6;
				} else {
					r = T[s >> 18] << 5;
				}
				r = (idiv(s, r) + r + 1) >> 1;
				r = (idiv(s, r) + r + 1) >> 1;
				return imul(r, r) > s ? (r - 1) | 0 : r;
			}
			if (s >= 1048576) {
				if (s >= 4194304) r = T[s >> 16] << 4;
				else r = T[s >> 14] << 3;
			} else if (s >= 262144) {
				r = T[s >> 12] << 2;
			} else {
				r = T[s >> 10] << 1;
			}
			r = (idiv(s, r) + r + 1) >> 1;
			return imul(r, r) > s ? (r - 1) | 0 : r;
		} else if (s >= 256) {
			if (s >= 4096) {
				if (s >= 16384) r = T[s >> 8];
				else r = T[s >> 6] >> 1;
			} else if (s >= 1024) {
				r = T[s >> 4] >> 2;
			} else {
				r = T[s >> 2] >> 3;
			}
			r = (r + 1) | 0;
			return imul(r, r) > s ? (r - 1) | 0 : r;
		}
		if (s >= 0) return T[s] >> 4;
		ci.j_('sqrt of negative int');
		return 0;
	},

	/**
	 * void d(): carve a corridor for every graph edge, longest first, by A* on the odd-cell grid.
	 * Paired river halves get bridge cells (b = 8); in caves, the first long straight corridor
	 * stretch of an edge may become a stream (b = 18 / 19) with cover points (x30.b).
	 */
	d_() {
		this.G = 0;
		const edges = [];
		for (let i = 0; i < this.B.a.length; i++) {
			for (const j of get(this.B.a, i)) {
				if (i < j) edges.push(new v30(i, j, this.m0_(i, j)));
			}
		}
		const desc = new ol(4);
		sortList(edges, (x, y) => desc.compare_(x, y));
		const grid = new Int32Array(imul(idiv(this.i, 2), idiv(this.h, 2)));
		const heap = new d2(new ol(2));
		const seen = new Map();   // TreeMap<Integer, sw>; only get / put / clear are used
		const rooms = this.n;
		const ne = edges.length;

		for (let e = 0; e < ne; e++) {
			const ed = get(edges, e);
			const A = get(rooms, ed.a);
			const B = get(rooms, ed.b);
			const W2 = idiv(this.h, 2);
			const from = new Util$Point(idiv((idiv(A.c, 2) + A.a - 1) | 0, 2), idiv((idiv(A.d, 2) + A.b - 1) | 0, 2));
			const to = new Util$Point(idiv((idiv(B.c, 2) + B.a - 1) | 0, 2), idiv((idiv(B.d, 2) + B.b - 1) | 0, 2));

			// step costs from the current cells (0 = impassable)
			for (let y = 0; ((imul(y, 2) + 1) | 0) < this.i; y++) {
				const y2 = imul(y, 2);
				const r1 = (y2 + 1) | 0;
				for (let x = 0; ((imul(x, 2) + 1) | 0) < this.h; x++) {
					const x2 = imul(x, 2);
					const W = this.h;
					const gi = (imul(y, W2) + x) | 0;
					const g = this.g;
					const cell = g[lz0.h_(r1, W, x2, 1)];
					const a = cell.a;
					if (a === 2) {
						grid[gi] = 1000;
					} else if (a === 1) {
						grid[gi] = fg2.a0_(cell.b, 1, 2, 11, 8, 18, 19) ? 2 : 9;
					} else if (a === 0) {
						grid[gi] = 10;
					} else if (a === 127) {
						grid[gi] = 0;
					} else if (a === 4) {
						if (g[lz0.h_(y2, W, x2, 1)].c_() || this.g[(imul(r1, this.h) + x2) | 0].c_()) grid[gi] = 2;
						else grid[gi] = 0;
					} else {
						grid[gi] = 100;
					}
				}
			}

			heap.k_();
			seen.clear();
			const start = new sw(from.a, from.b);
			heap.b_(start);
			seen.set(from.a | (from.b << 16), start);
			const q = new Util$Point();
			let cur;
			for (;;) {
				// d2 poll, inlined in the game
				let size = heap.b;
				let obj = null;
				if (size !== 0) {
					const arr = heap.c;
					obj = arr[0];
					size = (size - 1) | 0;
					heap.b = size;
					const moved = arr[size];
					arr[size] = null;
					if (size !== 0) heap.q_(0, moved);
				}
				cur = obj;
				if (cur === null) break;
				const cy = cur.b;
				const cx = cur.a;
				if (cx === to.a && cy === to.b) break;
				for (let dir = 0; dir < 4; dir++) {
					q.a = cx;
					q.b = cy;
					q.b_(dir);
					const qx = q.a;
					if (qx >= 0 && qx < idiv((this.h - 1) | 0, 2)) {
						const qy = q.b;
						if (qy >= 0 && qy < idiv((this.i - 1) | 0, 2)) {
							const w = grid[(imul(qy, W2) + qx) | 0];
							if (w !== 0) {
								let cost = (cur.c + w) | 0;
								if (dir !== cur.f && cur !== start) cost = (cost + 1) | 0;
								const key = (qy << 16) | qx;
								const old = seen.get(key);
								if (old === undefined || old === null || cost < old.c) {
									const nn = new sw(q.a, q.b);
									nn.c = cost;
									nn.e = cur;
									nn.f = dir;
									const est = (q.d_(to) + cost) | 0;
									nn.d = est;
									if (q.a !== to.a && q.b !== to.b) nn.d = (est + 1) | 0;
									seen.set(key, nn);
									heap.p_(new z53(13, nn));
									heap.b_(nn);
								}
							}
						}
					}
				}
			}

			if (cur === null) {
				throw new GenStuckException(true, `no room connection ${A.a},${A.b}-${B.a},${B.b} - ${this.d}`);
			}

			const tv = A.v;
			const vert = tv === 7 || tv === 9;
			const pw = this.c;
			// the two halves of one river-split room: corridor cells next to the river become bridges
			const pair = !pw.E && !pw.F && !pw.G && A.f && B.f && tv === B.v
				&& (vert || tv === 6 || tv === 8)
				&& iabs((A.e - B.e) | 0) === 1
				&& (vert ? A.a === B.a : A.b === B.b);
			let cave = this.c.F && !pair && this.G < this.a.t;
			let sx = -1, sy = -1;   // start of the current straight stretch (cave streams)

			let node = cur;
			while (node !== null && node.e !== null) {
				q.a = (imul(node.a, 2) + 1) | 0;
				q.b = (imul(node.b, 2) + 1) | 0;
				for (let step = 0; ; step++) {
					const y = q.b;
					const W = this.h;
					const x = q.a;
					const idx = (imul(y, W) + x) | 0;
					const g = this.g;
					const cell = g[idx];
					if (cell.a === 2) {
						cell.A_(1);
					} else {
						let bridge = false;
						if (pair) {
							if (vert) {
								const ra = A.a;
								if ((x === ra - 2 || x === ra + A.c + 1)
									&& !g[(imul((y - 1) | 0, W) + x) | 0].h_()
									&& !this.g[(imul((q.b + 1) | 0, this.h) + q.a) | 0].h_()) {
									bridge = true;
								}
							} else {
								const rb = A.b;
								if ((y === rb - 2 || y === rb + A.d + 1)
									&& !g[(idx - 1) | 0].h_()
									&& !this.g[(imul(q.b, this.h) + q.a + 1) | 0].h_()) {
									bridge = true;
								}
							}
						}
						if (cell.a === 0 || (bridge && cell.f_())) {
							cell.a = 1;
							cell.b = bridge ? 8 : 1;
							this.m[idx] = -1;
						}
					}

					if (cave) {
						if (sx === -1) {
							if (this.m[idx] === -1 && cell.a === 1) {
								sx = q.a;
								sy = q.b;
							}
						} else if ((sx !== q.a && sy !== q.b) || cell.o_(true)) {
							cave = false;
						} else if (this.m[idx] !== -1 || cell.a !== 1) {
							const len = (Math.max(iabs((q.a - sx) | 0), iabs((q.b - sy) | 0)) - 2) | 0;
							if (len >= 7) {
								const t = this.e.h_(100) < 50 ? 19 : 18;
								const qa = q.a;
								const ddx = qa > sx ? 1 : qa < sx ? -1 : 0;
								const qb = q.b;
								const ddy = qb > sy ? 1 : qb < sy ? -1 : 0;
								let px = sx, py = sy;
								for (let k = 0; k < len; k++) {
									px = (px + ddx) | 0;
									py = (py + ddy) | 0;
									const c = this.g[(imul(this.h, py) + px) | 0];
									c.a = 1;
									c.b = t;
								}
								this.b_((sx + ddx) | 0, (sy + ddy) | 0, ddx, ddy, len, false);
								this.G++;
							}
							cave = false;
						}
					}

					if (step === 1) break;
					const f = node.f;
					if (f === 0) q.a = (q.a + 1) | 0;
					else if (f === 1) q.a = (q.a - 1) | 0;
					else if (f === 2) q.b = (q.b + 1) | 0;
					else if (f === 3) q.b = (q.b - 1) | 0;
				}
				node = node.e;
			}
		}
	},

	/** void j0(): forest / cave: void cells with floor on one side and void on the other become floor. */
	j0_() {
		const n = idiv(imul(this.k, this.l), 2);
		for (let t = 0; t < n; t++) {
			const x = (this.e.h_((this.k - 2) | 0) + 1) | 0;
			const y = (this.e.h_((this.l - 2) | 0) + 1) | 0;
			const W = this.h;
			const idx = (imul(y, W) + x) | 0;
			const g = this.g;
			const cell = g[idx];
			if (cell.a === 0 && this.b.k[idx] == null) {
				// v* = void cells, f* = plain floor (1/1) cells, per side (each side counts its two corners)
				let vN = 0, fN = 0, vS = 0, fS = 0, vW = 0, fW = 0, vE = 0, fE = 0;
				let c = g[(idx - W) | 0];
				if (c.a === 0) vN = 1;
				else if (c.f_()) fN = 1;
				c = this.g[(this.h + idx) | 0];
				if (c.a === 0) vS = 1;
				else if (c.f_()) fS = 1;
				c = this.g[(idx - 1) | 0];
				if (c.a === 0) vW = 1;
				else if (c.f_()) fW = 1;
				c = this.g[(idx + 1) | 0];
				if (c.a === 0) vE = 1;
				else if (c.f_()) fE = 1;
				c = this.g[(idx - this.h - 1) | 0];
				if (c.a === 0) { vN++; vW++; } else if (c.f_()) { fN++; fW++; }
				c = this.g[(idx - this.h + 1) | 0];
				if (c.a === 0) { vN++; vE++; } else if (c.f_()) { fN++; fE++; }
				c = this.g[(this.h + idx - 1) | 0];
				if (c.a === 0) { vS++; vW++; } else if (c.f_()) { fS++; fW++; }
				c = this.g[(idx + this.h + 1) | 0];
				if (c.a === 0) { vS++; vE++; } else if (c.f_()) { fS++; fE++; }
				if ((fN === 3 && vS === 3) || (fS === 3 && vN === 3) || (fW === 3 && vE === 3) || (fE === 3 && vW === 3)) {
					cell.a = 1;
					cell.b = 1;
				}
			}
		}
	},
});
