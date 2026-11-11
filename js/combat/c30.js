// c30: the game's dungeon controller (turn loop, actions, AI, damage), ported method-for-method.
// Fields keep the game's names so oracle snapshots map 1:1; methods carry the `_` suffix (see PORTING.md).
// Each part file adds methods with install(); ./all.js loads them. No top-level await here.
import { register, classes } from '../gen/registry.js';
import { tables } from '../gen/statics.js';

/** fw: FOV result holder for hw.n / hw.o (a = faction of the viewer, b = "saw a hostile"). */
export class fw {
	/** ()V | (IZ)V */
	constructor(a = 0, b = false) {
		this.a = a;
		this.b = b;
	}

	/** int a(): faction when b, else 0 */
	a_() { return this.b ? this.a : 0; }
}
register(fw);

export class c30 {
	constructor() {
		const P = () => new classes.Util$Point();
		// rendering/UI state (kept so the rules code that touches it still runs)
		this.A = false; this.B = null; this.C = null; this.D = false; this.E = null; this.F = false; this.G = false;
		this.H = 0; this.I = 0; this.J = 0; this.K = 0; this.L = -1; this.M = 0; this.N = 1.0; this.O = null; this.P = null;
		this.Q = null; this.R = null; this.S = false; this.T = null; this.U = null; this.V = false; this.W = null; this.X = null;
		this.Y = null; this.Z = 0;
		this.a = null;   // hw level
		this.a0 = null; this.b = null; this.b0 = 0; this.c = null; this.c0 = 0; this.d = null; this.d0 = 0;
		this.e = null;   // DungameView (input layer; see input.js)
		this.e0 = 0; this.f = 0; this.f0 = false; this.g = 0; this.g0 = false; this.h = 0; this.h0 = 0;
		this.i = null; this.i0 = false; this.j = null; this.j0 = false; this.k = null; this.k0 = false;
		this.l = false; this.l0 = false; this.m = false; this.m0 = null; this.n = false; this.n0 = 0;
		this.o = false; this.o0 = 0; this.p = false; this.p0 = 0; this.q = false; this.q0 = 0; this.r = 0; this.r0 = 0;
		this.s = 0; this.s0 = 0; this.t = 0; this.t0 = 0; this.u = false; this.u0 = 0; this.v = false; this.v0 = 0;
		this.w = false; this.w0 = 0; this.x = 0; this.x0 = 0; this.y = 0; this.y0 = null;
		this.z = [];     // shared path of direction ints (0-3) from hw.t: the hero's queued tap path, then each monster's own path; engine state
		this.z0 = null;  // particle system (cosmetic)
		this.A0 = null; this.B0 = null; this.C0 = []; this.D0 = []; this.E0 = 0; this.F0 = false; this.G0 = 0; this.H0 = 0;
		this.I0 = []; this.J0 = 0; this.K0 = false; this.L0 = 0; this.M0 = 0; this.N0 = 0; this.O0 = 0; this.P0 = P();
		this.Q0 = []; this.R0 = 0; this.S0 = []; this.T0 = 0; this.U0 = []; this.V0 = 0; this.W0 = 0;
		this.X0 = P(); this.Y0 = P(); this.Z0 = P(); this.a1 = P(); this.b1 = P(); this.c1 = P();
		this.d1 = false; this.e1 = false; this.f1 = false; this.g1 = 0; this.h1 = 0;
	}
}
c30.javaName = 'c30';
register(c30);

// statics: l1 (shared fw), m1 (the 4 step directions, a table root so snapshots' {"$t":"c30.m1[i]"} are the same
// objects); i1/j1/k1 are particle types (cosmetic, not ported)
c30.l1 = new fw();
Object.defineProperty(c30, 'm1', { get: () => tables.get('c30.m1'), enumerable: true });

/** Attach ported methods: install({ S0_() {...} }, { M_(a, b, z) {...} }) -- second object holds statics. Throws on duplicates. */
export function install(proto, statics = {}) {
	for (const [k, fn] of Object.entries(proto)) {
		if (Object.prototype.hasOwnProperty.call(c30.prototype, k)) throw new Error(`c30.${k} defined twice`);
		c30.prototype[k] = fn;
	}
	for (const [k, fn] of Object.entries(statics)) {
		if (Object.prototype.hasOwnProperty.call(c30, k)) throw new Error(`static c30.${k} defined twice`);
		c30[k] = fn;
	}
}

/** Add methods to a model class (hw, aw, mw, qw, nw, …) that js/gen/model lacks. Throws if already defined. */
export function extend(cls, methods) {
	for (const [k, fn] of Object.entries(methods)) {
		if (k in cls.prototype) throw new Error(`${cls.javaName || cls.name}.${k} already defined`);
		cls.prototype[k] = fn;
	}
}
