// x30: the dungeon generator, ported method-for-method from the game (see ../PORTING.md).
// Fields and method names are the game's obfuscated ones so oracle snapshots map 1:1.
// Each phase file adds its methods to x30.prototype (and statics to x30); ./all.js loads them.
// No top-level await here: phase files import this module, so it must finish evaluating first.
import { register } from '../registry.js';
import { e01 } from '../rng.js';
import { xs } from '../statics.js';

export class x30 {
	constructor() {
		this.A = [];
		this.B = null;    // r30 room graph
		this.C = [];
		this.D = 0; this.E = 0; this.F = 0; this.G = 0; this.H = 0; this.I = 0;
		this.J = null; this.K = null;
		this.L = 0; this.M = 0; this.N = 0;
		this.a = null;    // s30 size config
		this.b = null;    // hw level
		this.c = null;    // pw dungeon config
		this.d = 0;       // seed
		this.e = new e01(); // structure stream
		this.f = new e01(); // cosmetic stream
		this.g = null;    // ww[] cells (= hw.j)
		this.h = 0; this.i = 0; this.j = 0; this.k = 0; this.l = 0;
		this.m = null;    // short[] cell -> room index (= hw.l)
		this.n = [];      // u30 rooms
		this.o = 0;
		this.p = new Int32Array(xs.P.length);
		this.q = null; this.r = null; this.s = null;
		this.t = null;    // Util$Point
		this.u = false; this.v = false;
		this.w = null; this.x = null; // qw markers
		this.y = false;
		this.z = null;
	}
}
x30.javaName = 'x30';
register(x30);

/** Attach ported methods: install(x30, { Z() {...}, ... }, { t(u30, z) {...} }). */
export function install(proto, statics = {}) {
	for (const [k, fn] of Object.entries(proto)) {
		if (Object.prototype.hasOwnProperty.call(x30.prototype, k)) throw new Error(`x30.${k} defined twice`);
		x30.prototype[k] = fn;
	}
	for (const [k, fn] of Object.entries(statics)) {
		if (Object.prototype.hasOwnProperty.call(x30, k)) throw new Error(`static x30.${k} defined twice`);
		x30[k] = fn;
	}
}
