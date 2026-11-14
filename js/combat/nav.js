// hw navigation and visibility for the combat engine: A* (hw.t), line of sight (hw.O), moving an object (hw.D),
// field of view (hw.n / hw.o), plus the zw static helpers they need (zw.o faction test, zw.p range test, zw.g label).
// Source: decompiled/vineflower/hw.java (t 2013-2313, O 700-869, D 485-500, n 1692-1789, o 1791-1913), zw.java.
//
// Already in the model and reused here: hw.m (door-region reveal, js/save/dungeon.js, checked against hw.java
// 1575-1690), hw.E (js/save), hw.y/z/A/L/N/q/r/s (js/gen/model/level.js).
import { register, classes } from '../gen/registry.js';
import { zw } from '../gen/statics.js';
import { iabs } from '../gen/jrt.js';
import { fg2, Util$Point, sw, d2, ol } from '../gen/model.js';
import '../save/dungeon.js';             // hw.m_ / hw.E_ (guarded there so this file can rely on them)
import { extend } from './c30.js';

const { hw } = classes;

// ---------------------------------------------------------------------------------------------
// statics of hw: P (A* open heap of sw ordered by d), Q (TreeMap cell key -> best sw; only get/put/clear),
// R (ArrayDeque flood stack), S (scratch point shared by O and t)
hw.P = new d2(new ol(2));
hw.Q = new Map();
hw.R = [];
hw.S = new Util$Point();

/** al1 case 10 (te1): "sw at the same cell as b" (d2.p removes the first match) */
export class al1 {
	constructor(a, b) {
		this.a = a;
		this.b = b;
	}

	g_(o) {
		const s = this.b;
		return o.a === s.a && o.b === s.b;
	}
}
register(al1);

// ---------------------------------------------------------------------------------------------
// hw.t_ without allocation. Not the game's code: the Java allocates a node and a predicate object per push; this
// does the same search without them. Changed only for speed, and equal to the Java's result for every input:
// same nodes polled in the same order, same heap layout after every operation (so the same tie-break among equal
// costs), same cost, same path, same hw.S and empty hw.P on return. test/astar.mjs keeps a copy of the version
// before this change and checks all of that.
//   - Nodes come from a pool. They never leave one call (the path is copied out as direction codes, the heap is
//     cleared on the way out), so each call reuses the last call's objects.
//   - The heap is still hw.P, but its add / poll / sift run inline here with the ol(2) comparator (`.d`, ascending)
//     written out, and the per-push al1 predicate is gone.
//   - hw.P.p_ (remove the queued node on this cell) is scanned only when there is one. A cell holds at most one
//     queued node (pushing a better node for a cell removes the old one first), and that node is the cell's
//     current node, so "queued" is a per-cell flag: the stamp says open (queued) or closed (polled). Without a
//     queued node the scan finds nothing after walking the whole heap, which is what it did on 93% to 95% of the pushes.

/** per-call scratch, reused across calls: cell stamps and nodes (sized for the level), and the node pool */
const ASTAR = { cells: -1, stamp: null, node: null, clock: 0, pool: [], used: 0 };

/** the call's closed stamp; its open stamp is one less. Each call takes two new values, so stamps of older calls never match */
function nextStamps(cells) {
	const A = ASTAR;
	if (A.cells !== cells || A.clock >= 0x3ffffff0) {
		A.cells = cells;
		A.stamp = new Int32Array(cells);
		A.node = new Array(cells).fill(null);
		A.clock = 0;
	}
	A.clock += 2;
	A.used = 0;
	return A.clock;
}

/** a pooled sw; the caller sets every field */
function poolNode() {
	const A = ASTAR;
	if (A.used === A.pool.length) A.pool.push(new sw(0, 0));
	return A.pool[A.used++];
}

/** d2.b_ (add): append x to the heap and sift it up */
function heapAdd(heap, x) {
	const n = heap.b;
	let arr = heap.c;
	if (n >= arr.length) {
		const grown = new Array(arr.length * 2).fill(null);
		for (let i = 0; i < n; i++) grown[i] = arr[i];
		heap.c = grown;
		arr = grown;
	}
	heap.b = n + 1;
	if (n === 0) arr[0] = x;
	else siftUp(arr, n, x);
}

/** d2.p_ with al1 case 10: remove the first node standing on cell (x, y), re-sifting the node moved into its place */
function heapRemoveCell(heap, x, y) {
	const arr = heap.c;
	for (let i = 0; i < heap.b; i++) {
		const o = arr[i];
		if (o.a !== x || o.b !== y) continue;
		const last = heap.b - 1;
		heap.b = last;
		if (last === i) {
			arr[i] = null;
			return;
		}
		const moved = arr[last];
		arr[last] = null;
		siftDown(arr, last, i, moved);
		if (arr[i] === moved) siftUp(arr, i, moved);
		return;
	}
}

/** d2.q_: sift x down from k in the first `size` slots (ol(2): `.d` ascending) */
function siftDown(arr, size, k, x) {
	const half = size >>> 1;
	const xd = x.d;
	while (k < half) {
		let child = (k << 1) + 1;
		let c = arr[child];
		const right = child + 1;
		if (right < size && c.d > arr[right].d) {
			c = arr[right];
			child = right;
		}
		if (xd <= c.d) break;
		arr[k] = c;
		k = child;
	}
	arr[k] = x;
}

/** d2.r_: sift x up from k (ol(2): `.d` ascending) */
function siftUp(arr, k, x) {
	const xd = x.d;
	while (k > 0) {
		const parent = (k - 1) >>> 1;
		const e = arr[parent];
		if (xd >= e.d) break;
		arr[k] = e;
		k = parent;
	}
	arr[k] = x;
}

// ---------------------------------------------------------------------------------------------
// zw static helpers (combat)

/** static boolean o(int a, int b): factions a and b are hostile (exactly {1, 2}) */
if (!zw.o_) zw.o_ = function o_(a, b) {
	if (a === b) return false;
	let lo = a, hi = b;
	if (a > b) { hi = a; lo = b; }
	return lo === 1 && hi === 2;
};

/** static boolean p(int r, int cut, Point a, Point b): within r on both axes, and (cut > 0) Manhattan < 2r + 1 - cut */
if (!zw.p_) zw.p_ = function p_(r, cut, a, b) {
	const dx = iabs((a.a - b.a) | 0);
	const dy = iabs((a.b - b.b) | 0);
	return dx <= r && dy <= r && (cut <= 0 || ((dx + dy) | 0) < ((r * 2 + 1 - cut) | 0));
};

if (!zw.q_) zw.q_ = (t) => t >= 19 && t < 23;
if (!zw.r_) zw.r_ = (t) => t >= 23 && t < 27;

/** static String g(int type, int mode): dungeon label prefix ("3C", "F2", "6A", "EA", "CL") */
if (!zw.g_) zw.g_ = function g_(t, mode) {
	if (t === 100) return 'CL';
	if (t >= 23) return mode === 0 ? 'E' + String.fromCharCode(t + 42) : 'E';
	let row, col;
	if (t >= 19) {
		col = t - 19;
		row = 5;
	} else {
		if (t >= 15) return mode !== 3 ? 'F' + (t - 14) : 'F';
		row = (t / 3) | 0;
		col = t % 3;
	}
	const s = String(row + 1);
	return mode === 0 ? s + String.fromCharCode(col + 65) : s;
};

// ---------------------------------------------------------------------------------------------

extend(hw, {
	/** boolean D(int x, int y, qw o): move a single-tile object to a free cell (hw.z) */
	D_(x, y, o) {
		const t = o.a;
		const p = o.b;
		if (!t.r_() && (p.a !== x || p.b !== y) && this.z_(x, y)) {
			const k = this.k;
			const g = this.g;
			k[(p.b * g + p.a) | 0] = null;
			p.a = x;
			p.b = y;
			k[(y * g + x) | 0] = o;
			return true;
		}
		return false;
	},

	/**
	 * boolean O(int r, int cut, Point from, Point to): line of sight within zw.p(r, cut). Bresenham over hw.y
	 * (see-through) cells with a first sidestep around a blocked diagonal and corner checks; uses static S.
	 */
	O_(r, cut, from, to) {
		if (zw.p_(r, cut, from, to)) {
			const S = hw.S;
			let v6 = from.a;
			S.a = v6;
			let v2 = from.b;
			S.b = v2;
			const v5 = to.a;
			let sx = v6 < v5 ? 1 : -1;            // var16
			let sy = v2 < to.b ? 1 : -1;          // var20
			const adx = iabs((v5 - v6) | 0);       // var10
			const ady = iabs((to.b - S.b) | 0);    // var11
			let v8 = sy, v7 = adx, vv6 = ady, v25 = sx;
			if (adx !== 0 && ady !== 0 && adx !== ady) {
				L106: if (this.y_((S.a + sx) | 0, (S.b + sy) | 0)) {
					const v12 = S.a, v13 = S.b;
					if (adx > ady) {
						if (this.y_((v12 + sx) | 0, v13)) break L106;
						if (!this.y_(S.a, (S.b + sy) | 0)) break L106;
						S.b = (S.b + sy) | 0;
					} else {
						if (this.y_(v12, (v13 + sy) | 0)) break L106;
						if (!this.y_((S.a + sx) | 0, S.b)) break L106;
						S.a = (S.a + sx) | 0;
					}
					const a6 = S.a, a25 = to.a;
					sx = a6 < a25 ? 1 : -1;
					sy = S.b < to.b ? 1 : -1;
					v7 = iabs((a25 - a6) | 0);
					vv6 = iabs((to.b - S.b) | 0);
					v25 = sx;
					v8 = sy;
				}
			}
			const v33 = (v7 - vv6) | 0;
			let err = v33;
			for (let i = 0; i <= 0 || this.y_(S.a, S.b); i++) {
				const cx = S.a;
				if (cx === to.a && S.b === to.b) return true;
				const e2 = (err * 2) | 0;
				const mx = e2 > -vv6;
				const my = e2 < v7;
				if (mx && my) {
					const k = e2 >= v33 && !this.y_((cx + v25) | 0, S.b) ? 1 : 2;
					let k2 = k;
					if (e2 <= v33 && !this.y_(S.a, (S.b + v8) | 0)) k2 = k - 1;
					if (k2 <= 0) break;
				}
				let e = err;
				if (mx) {
					S.a = (S.a + v25) | 0;
					e = (err - vv6) | 0;
				}
				err = e;
				if (my) {
					S.b = (S.b + v8) | 0;
					err = (e + v7) | 0;
				}
			}
		}
		return false;
	},

	/**
	 * boolean n(fw): field of view from the hero (super.f): reveal its room (hw.o); on a door cell (3/8/9) also the
	 * four neighbours' rooms and the 3x3 around it. fw.b is set when a hostile of fw.a comes into view.
	 */
	n_(v) {
		if (v != null) v.b = false;
		const p = this.f.b;
		const x = p.a;
		const y = p.b;
		const r9 = this.o_(x, y, v);
		let res = r9;
		if (fg2.X_(this.j[(this.g * y + x) | 0].a, 3, 8, 9)) {
			const xm = (x - 1) | 0;
			const r11 = this.o_(xm, y, v);
			const xp = (x + 1) | 0;
			const r12 = this.o_(xp, y, v);
			const ym = (y - 1) | 0;
			const r10 = this.o_(x, ym, v);
			const yp = (y + 1) | 0;
			let acc = r9 | r11 | r12 | r10 | this.o_(x, yp, v);
			let yy = y;
			if (y > 0) yy = ym;
			for (;;) {
				res = acc;
				if (yy >= this.h || yy > yp) break;
				let xx = x > 0 ? xm : x;
				let cur = acc;
				for (;;) {
					const g = this.g;
					if (xx >= g || xx > xp) {
						yy++;
						acc = cur;
						break;
					}
					const i = (g * yy + xx) | 0;
					const m = this.m;
					let nxt = cur;
					L51: if (m[i] <= 0) {
						if ((this.l[i] & 1023) !== 0) {
							const c = this.j[i];
							nxt = cur;
							if (c.a !== 9) break L51;
							if ((c.b & 32) !== 0) break L51;
						}
						cur = true;
						m[i] = 1;
						nxt = cur;
						if (v != null && !v.b) {
							const o = this.k[i];
							if (o instanceof classes.aw && zw.o_(v.a, o.k)) v.b = true;
						}
					}
					xx++;
					cur = nxt;
				}
			}
		}
		return !!res;
	},

	/**
	 * boolean o(int x, int y, fw): reveal what is visible from (x, y). An explored-but-dim cell (-1) re-lights its
	 * door region (hw.m(x, y, false, true)); an unexplored room cell floods its room (equal hw.l), marking it and its
	 * 8-neighbourhood 1 (closed doors 9 stop the spread and are not marked unless explored).
	 */
	o_(x, y, v) {
		let any = false;
		if (x >= 0) {
			const g = this.g;
			if (x < g && y >= 0 && y < this.h) {
				let i = (g * y + x) | 0;
				const mv = this.m[i];
				if (mv <= 0) {
					if (mv === -1) return this.m_(x, y, false, true);
					const reg = this.l[i];
					if ((reg & 1023) !== 0) {
						const R = hw.R;
						R.length = 0;
						let k = x | (y << 16);
						for (;;) {
							const cx = k & 65535;
							const cy = k >>> 16;
							i = (this.g * cy + cx) | 0;
							let hit = any;
							if (this.l[i] === reg) {
								hit = any;
								L77: if (this.m[i] <= 0) {
									const c = this.j[i];
									if (c.a === 9) {
										hit = any;
										if ((c.b & 32) === 0) break L77;
									}
									for (let yy = cy > 0 ? cy - 1 : cy; yy < this.h && yy <= cy + 1; yy++) {
										for (let xx = cx > 0 ? cx - 1 : cx; ; xx++) {
											const gg = this.g;
											if (xx >= gg || xx > cx + 1) break;
											const n = (gg * yy + xx) | 0;
											const m = this.m;
											let h2 = any;
											L97: if (m[n] <= 0) {
												if ((yy !== cy || xx !== cx) && (this.l[n] & 1023) !== 0) {
													const c2 = this.j[n];
													h2 = any;
													if (c2.a !== 9) break L97;
													if ((c2.b & 32) !== 0) break L97;
												}
												m[n] = 1;
												if (v != null && !v.b) {
													const o = this.k[n];
													if (o instanceof classes.aw && zw.o_(v.a, o.k)) v.b = true;
												}
												h2 = true;
											}
											any = h2;
										}
									}
									if (cx > 0) R.push((cy << 16) | (cx - 1));
									if (cx < this.g - 1) R.push((cy << 16) | (cx + 1));
									if (cy > 0) R.push(((cy - 1) << 16) | cx);
									hit = any;
									if (cy < this.h - 1) R.push(((cy + 1) << 16) | cx);
								}
							}
							if (R.length === 0) return hit;
							k = R.pop();
							any = hit;
						}
					}
				}
			}
		}
		return false;
	},

	/**
	 * int t(Point from, Point to, ArrayList path, int maxSteps, int searchSteps, int team, boolean doors, int region):
	 * A* over revealed cells (m > 0), 4-connected. Returns the path cost (0 = none; 1 for a plain adjacent step).
	 * path (if given) gets the directions from the target back to the start (Util$Point.b codes; a door target
	 * adds its approach direction first). Costs: plain 100, liquid (ww.o) 90, marker 84 85, other team's critter
	 * 1500 (team != -1), doors (z) 500/300, blockers 800; +3 per turn; heuristic Manhattan (+3 off-axis).
	 * team -2: critters and object 30 block (800); -3: faction 1/2 critters block. region != 0: door cells
	 * next to that region block.
	 * Allocation-free (pooled nodes, inline heap, no scan of an empty queue): see "hw.t_ without allocation".
	 */
	t_(from, to, path, maxSteps, searchSteps, team, doors, region) {
		const out = path;
		if (out != null) out.length = 0;
		let v10 = from.a;
		const v9 = to.a;
		if ((v10 !== v9 || from.b !== to.b) && v9 >= 0) {
			const v11 = to.b;
			if (v11 >= 0) {
				v10 = this.g;
				if (v9 < v10 && v11 < this.h) {
					const tgt = this.k[(v11 * v10 + v9) | 0];
					const isDoor = tgt != null && fg2.W_(tgt.a.a, 40, 126);
					const dx = (to.a - from.a) | 0;
					const dy = (to.b - from.b) | 0;
					let dir;
					if (dy === 0) dir = dx === -1 ? 0 : dx === 1 ? 1 : -1;
					else if (dx === 0) dir = dy === -1 ? 2 : dy === 1 ? 3 : -1;
					else dir = -1;
					if (dir === -1 || (isDoor && (tgt.c ? dx !== 1 || dy !== 0 : dx !== 0 || dy !== -1))) {
						// the target as the search sees it: a door is approached from the side it opens to (the Java
						// copies the Point; two ints do the same without allocating)
						let tx = to.a, ty = to.b;
						if (isDoor) {
							if (tgt.c) tx = (tx - 1) | 0;
							else ty = (ty + 1) | 0;
						}
						let p4 = maxSteps;
						if (p4 <= 0) p4 = 1000;
						let lim = searchSteps;
						if (searchSteps < p4) lim = p4;
						lim = (lim + 7) | 0;
						const heap = hw.P;
						heap.k_();
						// per-cell stamp (open = queued, closed = polled) and node, instead of the hw.Q TreeMap; nodes are pooled
						const g0 = this.g;
						const H = this.h;
						const closedStamp = nextStamps((g0 * H) | 0);
						const openStamp = closedStamp - 1;
						const ST = ASTAR.stamp, ND = ASTAR.node;
						const J = this.j, K = this.k, M = this.m, REG = this.l, XT = zw.u;
						const start = poolNode();
						start.a = from.a;
						start.b = from.b;
						start.c = 0;
						start.d = 0;
						start.e = null;
						start.f = 0;
						start.g = 0;
						heapAdd(heap, start);
						const si = from.b * g0 + from.a;
						ST[si] = openStamp;
						ND[si] = start;
						let cur;
						let expanded = false, lastX = 0, lastY = 0;
						for (;;) {
							let n = heap.b;
							let top;
							if (n === 0) top = null;
							else {
								const arr = heap.c;
								top = arr[0];
								heap.b = --n;
								const last = arr[n];
								arr[n] = null;
								if (n !== 0) siftDown(arr, n, 0, last);
							}
							cur = top;
							if (cur == null) break;
							const cy = cur.b;
							const cx = cur.a;
							ST[cy * g0 + cx] = closedStamp;
							if (cx === tx && cy === ty) break;
							if (cur.g < lim) {
								expanded = true;
								lastX = cx;
								lastY = cy;
								for (let d = 0; d < 4; d++) {
									// Point.b_(d): 0 left, 1 right, 2 up, 3 down
									const nx = d === 0 ? (cx - 1) | 0 : d === 1 ? (cx + 1) | 0 : cx;
									if (nx < 0) continue;
									if (nx >= g0) continue;
									const ny = d === 2 ? (cy - 1) | 0 : d === 3 ? (cy + 1) | 0 : cy;
									if (ny < 0 || ny >= H) continue;
									const idx = (ny * g0 + nx) | 0;
									const cell = J[idx];
									const occ = K[idx];
									let cost;
									L266: {
										L330: {
											cost = 500;
											if (occ != null) {
												const t = occ.a;
												if (t.a === 84) {
													cost = 85;
													break L266;
												}
												if (doors) {
													const l = t.l;
													if (l || t.u) {
														if (!l) cost = 300;
														break L266;
													}
												}
												if ((team === -2 && (occ.e_() || occ.a.a === 30)) || (team === -3 && occ.e_() && fg2.W_(occ.k, 1, 2))) break L330;
												if (team !== -1 && occ.e_() && occ.k === team) {
													cost = 1500;
													break L266;
												}
												if (region !== 0 && fg2.W_(cell.a, 3, 8)) {
													if (nx > 0 && REG[idx - 1] === region) break L330;
													if (nx < g0 - 1 && REG[idx + 1] === region) break L330;
													if ((ny > 0 && REG[idx - g0] === region) || (ny < H - 1 && REG[idx + g0] === region)) break L330;
												}
											} else {
												if (doors && cell.a === 10 && (cell.b & 32) === 0) break L266;
												if (cell.o_(false)) {
													cost = 90;
													break L266;
												}
											}
											cost = 0;
											break L266;
										}
										cost = 800;
									}
									if (nx !== tx || ny !== ty) {
										L212: {
											if (occ == null) {
												const xt = XT[cell.a];
												if (xt.m || (xt.o && (cell.b & 32) !== 0)) break L212;
											}
											if (cost === 0) continue;
										}
										if (M[idx] <= 0) continue;
									}
									if (cost === 0) cost = 100;
									const c13 = (cur.c + cost) | 0;
									let nc = c13;
									if (d !== cur.f && cur !== start) nc = (c13 + 3) | 0;
									const stamp = ST[idx];
									const old = stamp >= openStamp ? ND[idx] : null;
									if (old == null || nc < old.c) {
										const node = poolNode();
										node.a = nx;
										node.b = ny;
										node.c = nc;
										node.e = cur;
										node.f = d;
										const h = ((iabs((tx - nx) | 0) + iabs((ty - ny) | 0)) + nc) | 0;
										node.d = nx !== tx && ny !== ty ? (h + 3) | 0 : h;
										node.g = (cur.g + 1) | 0;
										ND[idx] = node;
										if (stamp === openStamp) heapRemoveCell(heap, nx, ny);
										ST[idx] = openStamp;
										heapAdd(heap, node);
									}
								}
							}
						}
						// the Java leaves its scratch Point on the last cell it stepped from, one step down
						if (expanded) {
							hw.S.a = lastX;
							hw.S.b = (lastY + 1) | 0;
						}
						const res = cur != null && cur.e != null && cur.g <= p4 ? cur.c : 0;
						let ret = res;
						if (res !== 0 && out != null) {
							let node = cur;
							let r5 = res;
							if (isDoor) {
								out.push(tgt.c ? 1 : 2);
								r5 = (res + 100) | 0;
							}
							for (;;) {
								ret = r5;
								if (node.e == null) break;
								out.push(node.f);
								node = node.e;
							}
						}
						heap.k_();
						return ret;
					}
					if (out != null) out.push(dir);
					return 1;
				}
			}
		}
		return 0;
	},
});
