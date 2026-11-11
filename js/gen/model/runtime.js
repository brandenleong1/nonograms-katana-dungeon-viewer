// Small static helpers and throw sites the generator reaches (fg2, lz0, al2, mh2, n30, wg2, ci, bb0,
// fb2, UApp, k93) plus the game's two exception classes.
// Naming: every ported method has a trailing `_` (fields keep their Java names), see ../PORTING.md.
import { register, classes } from '../registry.js';
import { imul, idiv, f32 } from '../jrt.js';

/** com.ucdevs.jcross.d.Exceptions$GenStuckException(boolean a, String msg): generation got stuck, retry. */
export class GenStuckException extends Error {
	constructor(a, msg) {
		super(msg);
		this.name = 'GenStuckException';
		this.a = a; // public final boolean a: report this one to the crash log
	}
}
GenStuckException.javaName = 'Exceptions$GenStuckException';

/** com.ucdevs.jcross.d.Exceptions$DegenException(String msg): Delaunay hit a degenerate triangle. */
export class DegenException extends Error {
	constructor(msg) {
		super(msg);
		this.name = 'DegenException';
	}
}
DegenException.javaName = 'Exceptions$DegenException';

/** java.lang.RuntimeException(String msg) */
export class RuntimeException extends Error {
	constructor(msg, cause) {
		super(msg);
		this.name = 'RuntimeException';
		if (cause !== undefined) this.cause = cause;
	}
}

register(GenStuckException, DegenException);

// n30.c(int, String): `throw new GenStuckException(z, msg)` (smali passes the int straight into the
// boolean field; callers pass 0/1).
export const n30 = {
	/** static void c(int, String) */
	c_(z, msg) {
		throw new GenStuckException(z !== 0 && z !== false, msg);
	},
};

// wg2.h(String): `throw new RuntimeException(msg)`.
export const wg2 = {
	/** static void h(String) */
	h_(msg) {
		throw new RuntimeException(msg);
	},
};

// ci.j(String): IllegalArgumentException; ci.c(Object): AssertionError.
export const ci = {
	/** static void j(String) */
	j_(msg) {
		const e = new Error(msg);
		e.name = 'IllegalArgumentException';
		throw e;
	},
	/** static void c(Object) */
	c_(o) {
		const e = new Error(String(o));
		e.name = 'AssertionError';
		throw e;
	},
};

// bb0.l(Throwable): `throw new RuntimeException(t)`.
export const bb0 = {
	/** static void l(Throwable) */
	l_(t) {
		throw new RuntimeException(String(t && t.message !== undefined ? t.message : t), t);
	},
};

/** Minimal java.lang.StringBuilder for the generator's error messages. */
export class StringBuilder {
	constructor(s = '') { this.s = String(s); }
	append(x) { this.s += String(x); return this; }
	toString() { return this.s; }
}

// fb2.q(int, String, String): new StringBuilder(a).append(i).append(b).
export const fb2 = {
	/** static StringBuilder q(int, String, String) */
	q_(i, a, b) {
		return new StringBuilder(a).append(i).append(b);
	},
};

// UApp: only the crash reporter x30.f calls. Reporting is a no-op here.
export const UApp = {
	X0: {},
	/** static void x0(Throwable, boolean) */
	x0_(_t, _z) {},
};

// fg2: "equals any of" helpers, clamp, lerp, array contains.
export const fg2 = {
	/** static boolean W(III) */
	W_(v, a, b) { return v === a || v === b; },
	/** static boolean X(IIII) */
	X_(v, a, b, c) { return v === a || v === b || v === c; },
	/** static boolean Y(IIIII) */
	Y_(v, a, b, c, d) { return v === a || v === b || v === c || v === d; },
	/** static boolean Z(IIIIII) */
	Z_(v, a, b, c, d, e) { return v === a || v === b || v === c || v === d || v === e; },
	/** static boolean a0(IIIIIII) */
	a0_(v, a, b, c, d, e, f) { return v === a || v === b || v === c || v === d || v === e || v === f; },
	/** static boolean b0(IIIIIIII) */
	b0_(v, a, b, c, d, e, f, g) { return v === a || v === b || v === c || v === d || v === e || v === f || v === g; },
	/** static boolean c0(IIIIIIIIII): 9 candidates */
	c0_(v, a, b, c, d, e, f, g, h, i) {
		return v === a || v === b || v === c || v === d || v === e || v === f || v === g || v === h || v === i;
	},
	/** static int q(III): clamp v to [lo, hi] (lo checked first) */
	q_(v, lo, hi) {
		if (v < lo) return lo;
		return v > hi ? hi : v;
	},
	/** static float H(FFF): lerp a -> b by t, = al2.g(b, a, t, a) */
	H_(a, b, t) {
		return al2.g_(b, a, t, a);
	},
	/** static boolean s(int[], int): array contains */
	s_(arr, v) {
		for (let i = 0; i < arr.length; i++) if (arr[i] === v) return true;
		return false;
	},
};

// lz0: index arithmetic.
export const lz0 = {
	/** static int h(IIII): a * b + c + d */
	h_(a, b, c, d) { return (imul(a, b) + c + d) | 0; },
	/** static String n(int, String): s + i */
	n_(i, s) { return s + String(i); },
};

// al2: arithmetic helpers and the x30 table builders (o30 / t30 with fields preset).
export const al2 = {
	/** static float g(FFFF): (a - b) * c + d in 32-bit float */
	g_(a, b, c, d) { return f32(f32(f32(a - b) * c) + d); },
	/** static int h(IIII): a + b + c + d */
	h_(a, b, c, d) { return (a + b + c + d) | 0; },
	/** static o30 k(IIII) */
	k_(a, b, c, d) {
		const o = new classes.o30(a, b, c);
		o.e = d | 32640;
		return o;
	},
	/** static o30 l(IIIII) */
	l_(a, b, c, d, e) {
		const o = new classes.o30(a, b, c);
		o.a_(d, e);
		return o;
	},
	/** static t30 m(IIII) */
	m_(a, b, c, d) {
		const t = new classes.t30(a, b);
		t.j = c;
		t.k = d;
		return t;
	},
};

// mh2.f(IIII): (a / b) * c + d.
export const mh2 = {
	/** static int f(IIII) */
	f_(a, b, c, d) { return (imul(idiv(a, b), c) + d) | 0; },
};

// k93.b: the integer-sqrt seed table x30.m0 uses. In the APK it is a hex-encoded int[256]; every
// entry equals floor(16 * sqrt(i)) (checked against the decoded table for all 256 entries).
export const k93 = {
	b: Int32Array.from({ length: 256 }, (_, i) => Math.floor(Math.sqrt(i) * 16)),
};
