// Geometry, graph and search helpers used by x30: points, A* nodes and heap, comparators, Delaunay.
import { register } from '../registry.js';
import { f32, iabs } from '../jrt.js';
import { al2, DegenException } from './runtime.js';

/** com.ucdevs.util.Util$Point: mutable int point (a = x, b = y). Directions: 0 left, 1 right, 2 up, 3 down. */
export class Util$Point {
	/** ()V | (II)V | (Lcom/ucdevs/util/Util$Point;)V */
	constructor(a, b) {
		if (a instanceof Util$Point) {
			this.a = a.a;
			this.b = a.b;
		} else {
			this.a = a === undefined ? 0 : a;
			this.b = b === undefined ? 0 : b;
		}
	}

	/** boolean a(Util$Point): same coordinates (false for null) */
	a_(p) {
		return p == null ? false : this.a === p.a && this.b === p.b;
	}

	/** void b(int dir): step one cell in direction dir */
	b_(dir) {
		if (dir !== 0) {
			if (dir !== 1) {
				if (dir !== 2) {
					if (dir === 3) this.b = (this.b + 1) | 0;
				} else {
					this.b = (this.b - 1) | 0;
				}
			} else {
				this.a = (this.a + 1) | 0;
			}
		} else {
			this.a = (this.a - 1) | 0;
		}
	}

	/** boolean c(Util$Point): 4-adjacent or equal */
	c_(p) {
		const dx = iabs((this.a - p.a) | 0);
		return ((iabs((this.b - p.b) | 0) + dx) | 0) <= 1;
	}

	/** int d(Util$Point): Manhattan distance */
	d_(p) {
		const dx = iabs((p.a - this.a) | 0);
		return (iabs((p.b - this.b) | 0) + dx) | 0;
	}

	/** void e(Util$Point): copy */
	e_(p) {
		this.a = p.a;
		this.b = p.b;
	}

	/** void f(int dir): set to the unit vector of dir */
	f_(dir) {
		if (dir !== 0) {
			if (dir !== 1) {
				if (dir !== 2) {
					if (dir === 3) { this.a = 0; this.b = 1; }
				} else {
					this.a = 0; this.b = -1;
				}
			} else {
				this.a = 1; this.b = 0;
			}
		} else {
			this.a = -1; this.b = 0;
		}
	}
}

/** sw: A* search node (a, b = cell; c = cost so far; d = cost + heuristic; e = parent; f = arrival dir). */
export class sw {
	constructor(a, b) {
		this.a = a;
		this.b = b;
		this.c = 0;
		this.d = 0;
		this.e = null;
		this.f = 0;
		this.g = 0;
	}
}

/** v30: weighted edge (a, b = room indices, c = weight). */
export class v30 {
	constructor(a, b, c) {
		this.a = a;
		this.b = b;
		this.c = c;
	}
}

/** yz: Delaunay triangle (a, b, c = vertex indices; d, e = circumcentre; f = squared circumradius). */
export class yz {
	constructor() {
		this.a = 0; this.b = 0; this.c = 0;
		this.d = 0; this.e = 0; this.f = 0;
	}
}

/** zz: float point. Callers must pass float values (Math.fround). */
export class zz {
	constructor(a, b) {
		this.a = a;
		this.b = b;
	}
}

/** a00: int triple. */
export class a00 {
	constructor() {
		this.a = 0; this.b = 0; this.c = 0;
	}
}

/** r30: room adjacency graph; a = ArrayList<TreeSet<Integer>> (set by x30). */
export class r30 {
	constructor() {
		this.a = null;
	}

	/** void a(int, int): add undirected edge */
	a_(i, j) {
		const l = this.a;
		getL(l, i).add(j);
		getL(l, j).add(i);
	}
}

function getL(list, i) {
	if (i < 0 || i >= list.length) throw new Error(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${list.length}`);
	return list[i];
}

/** xz: Comparator<Integer> over zz[] by descending x, then ascending index. */
export class xz {
	constructor(a) {
		this.a = a;
	}

	/** int compare(Object, Object) */
	compare_(p, q) {
		const z = this.a;
		const d = f32(z[q].a - z[p].a);
		if (d !== 0) return d < 0 ? -1 : 1;
		return (p - q) | 0;
	}
}

/**
 * ol: R8-merged Comparator; field a picks the case. Ported cases:
 *   1 aw by o descending, 2 sw by d ascending, 3 v30 by c ascending, 4 v30 by c descending.
 */
export class ol {
	constructor(a) {
		this.a = a;
	}

	/** int compare(Object, Object) */
	compare_(x, y) {
		let r = -1;
		switch (this.a) {
			case 1: {
				const d = (x.o - y.o) | 0;
				if (d <= 0) r = d < 0 ? 1 : 0;
				return r;
			}
			case 2: {
				const p = x.d, q = y.d;
				if (p >= q) r = p > q ? 1 : 0;
				return r;
			}
			case 3: {
				const p = x.c, q = y.c;
				if (p >= q) r = p > q ? 1 : 0;
				return r;
			}
			case 4: {
				const p = y.c, q = x.c;
				if (p >= q) r = p > q ? 1 : 0;
				return r;
			}
			default:
				throw new Error(`ol.compare case ${this.a} is not ported`);
		}
	}
}

/** z53: R8-merged lambda holder; x30 uses case 13 as te1 predicate "sw at the same cell as b". */
export class z53 {
	constructor(a, b) {
		this.a = a;
		this.b = b;
	}

	/** boolean g(Object) (te1) */
	g_(o) {
		const s = this.b;
		return o.a === s.a && o.b === s.b;
	}
}

/**
 * d2 (case 9 of an R8-merged class): binary min-heap of sw used by the corridor A*.
 * Fields as in Java: a = 9, b = size, c = Object[] storage (initial 256), d = ol comparator.
 * x30 polls inline (reads c[0], decrements b, then q(0, last)).
 */
export class d2 {
	/** (Lol;)V */
	constructor(cmp) {
		this.a = 9;
		this.b = 0;
		this.c = new Array(256).fill(null);
		this.d = cmp;
	}

	/** void b(sw): add */
	b_(x) {
		const n = this.b;
		let arr = this.c;
		if (n >= arr.length) {
			const grown = new Array(arr.length * 2).fill(null);
			for (let i = 0; i < n; i++) grown[i] = arr[i];
			this.c = grown;
			arr = grown;
		}
		this.b = n + 1;
		if (n === 0) arr[0] = x;
		else this.r_(n, x);
	}

	/** void k(): clear */
	k_() {
		for (let i = 0; i < this.b; i++) this.c[i] = null;
		this.b = 0;
	}

	/** void p(te1): remove the first element matching the predicate */
	p_(pred) {
		for (let i = 0; i < this.b; i++) {
			if (pred.g_(this.c[i])) {
				const last = this.b - 1;
				this.b = last;
				const arr = this.c;
				if (last === i) {
					arr[i] = null;
					return;
				}
				const moved = arr[last];
				arr[last] = null;
				this.q_(i, moved);
				if (this.c[i] === moved) this.r_(i, moved);
				return;
			}
		}
	}

	/** void q(int, Object): sift down from i */
	q_(i, x) {
		const cmp = this.d;
		const half = this.b >>> 1;
		let k = i;
		while (k < half) {
			let child = (k << 1) + 1;
			let c = this.c[child];
			const right = (k << 1) + 2;
			if (right < this.b && cmp.compare_(c, this.c[right]) > 0) {
				c = this.c[right];
				child = right;
			}
			if (cmp.compare_(x, c) <= 0) break;
			this.c[k] = c;
			k = child;
		}
		this.c[k] = x;
	}

	/** void r(int, Object): sift up from i */
	r_(i, x) {
		let k = i;
		while (k > 0) {
			const parent = (k - 1) >>> 1;
			const e = this.c[parent];
			if (this.d.compare_(x, e) < 0) {
				this.c[k] = e;
				k = parent;
				continue;
			}
			break;
		}
		this.c[k] = x;
	}
}

const EPS = f32(9.536743e-7); // 0x35800000

/**
 * m53.d(zz[], int, int, int): circumcircle of triangle (p, q, r) in 32-bit float, as yz.
 * Throws DegenException when two edges are both horizontal.
 */
function m53d(pts, i1, i2, i3) {
	const P = pts[i1], Q = pts[i2], R = pts[i3];
	const x1 = P.a, y1 = P.b;
	const x2 = Q.a, y2 = Q.b;
	const x3 = R.a, y3 = R.b;
	const d12 = Math.abs(f32(y1 - y2));
	const d23 = Math.abs(f32(y2 - y3));
	let cx, cy;
	if (d12 < EPS && d23 < EPS) throw new DegenException('degenerate triangle');
	if (d12 < EPS) {
		// y1 ~ y2: centre x on the perpendicular bisector of p-q, y from the bisector of q-r
		const m = -f32(f32(x3 - x2) / f32(y3 - y2));
		const mx = f32(f32(x3 + x2) / 2);
		const my = f32(f32(y3 + y2) / 2);
		cx = f32(f32(x1 + x2) / 2);
		cy = al2.g_(cx, mx, m, my);
	} else if (d23 < EPS) {
		const m = -f32(f32(x2 - x1) / f32(y2 - y1));
		const mx = f32(f32(x1 + x2) / 2);
		const my = f32(f32(y1 + y2) / 2);
		cx = f32(f32(x3 + x2) / 2);
		cy = al2.g_(cx, mx, m, my);
	} else {
		const m1 = -f32(f32(x2 - x1) / f32(y2 - y1));
		const m2 = -f32(f32(x3 - x2) / f32(y3 - y2));
		const mx1 = f32(f32(x1 + x2) / 2);
		const mx2 = f32(f32(x3 + x2) / 2);
		const my1 = f32(f32(y1 + y2) / 2);
		const my2 = f32(f32(y3 + y2) / 2);
		let t = f32(m1 * mx1);
		t = f32(t - f32(m2 * mx2));
		t = f32(t + my2);
		t = f32(t - my1);
		cx = f32(t / f32(m1 - m2));
		cy = d12 > d23 ? al2.g_(cx, mx1, m1, my1) : al2.g_(cx, mx2, m2, my2);
	}
	const dx = f32(x2 - cx);
	const dy = f32(y2 - cy);
	const out = new yz();
	out.a = i1;
	out.b = i2;
	out.c = i3;
	out.d = cx;
	out.e = cy;
	out.f = f32(f32(dy * dy) + f32(dx * dx));
	return out;
}

export const m53 = {
	/** static yz d(zz[], int, int, int) */
	d_: m53d,
};

register(Util$Point, sw, v30, yz, zz, a00, r30, xz, ol, z53, d2);
