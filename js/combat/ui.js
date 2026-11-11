// c30's visual methods. Headless (oracle and JS) nothing renders, so these are no-ops, except where a method
// writes state that rules code could read; each was read in decompiled/vineflower/c30.java first:
//   D (655, frame render; also fills the sprite pick list I0/J0 through d) and E (2957, object render): called
//     only from DungameView.onDraw, which the headless settle loop never runs. No-op.
//   A0 (508) floating number -> C0 list; z0 (11309) floating item icon -> C0; y0 (11287) flash -> D0;
//   v0 (10992) / x0 (11172) render caches S0 / Q0; d (7834) pick sprite -> I0: render-only lists. No-op.
//   C (592), F (4120; sets the render flags n / p) draw sprites. No-op.
//   J0 (4353), K0 (4459) emit particles (z0): only their scratch points a1 / c1 are kept (rules code reuses them).
//   F0 (4191): help dialog through the page (kl0 c is null headless) - only string lookups. No-op.
//   L0 (4492): screen offset of an object's label (writes only its Point argument). Ported.
//   t0 (10844): webbed tutorial hint: UApp pref (0 headless), then marks DungameView.C0. Ported (view state).
import { fg2 } from '../gen/model.js';
import { install, c30 } from './c30.js';

install({
	D_() {},
	E_(_x, _y, _o) {},
	A0_(_v, _color, _o) {},
	C_(_res, _flag, _x, _y, _size, _o) {},
	F_(_x, _y, _sx, _sy, _flip, _z) {},
	F0_() {},
	/** void J0(qw, qw from): hit particles flying from `from`; keeps a1 = screen(o), c1 = unit screen(o - from) */
	J0_(o, from) {
		o.c_(this.a);
		const p = o.b;
		this.N0_(p.a, p.b, this.a1, false);
		if (from != null) {
			const q = from.b;
			const c1 = this.c1;
			this.N0_((p.a - q.a) | 0, (p.b - q.b) | 0, c1, false);
			if (((Math.abs(c1.b) + Math.abs(c1.a)) | 0) > 1) c30.q0_(c1);
		}
	},
	/** void K0(qw, Point at): puff particles at `at` (default o.b); keeps a1 = screen(at) */
	K0_(o, at) {
		const p = at == null ? o.b : at;
		o.c_(this.a);
		this.N0_(p.a, p.b, this.a1, false);
	},
	v0_(_o, _v) {},
	x0_(_o, _a, _b, _c) {},
	y0_(_res, _flag, _o) {},
	z0_(_o, _id, _z, _n) {},
	d_(_res, _x, _y, _a, _b, _flip, _scale, _o) {},

	/** void L0(qw, Point p): label offset for walls 27-29 (by cell shape) and object 94 (by flip) */
	L0_(o, p) {
		const t = o.a;
		const q = o.b;
		if (fg2.X_(t.a, 27, 28, 29)) {
			const w = this.i[(q.b * this.g + q.a) | 0];
			if (w.s_(3, 7, 3)) p.b = (p.b + 60) | 0;
			else if (w.s_(3, 7, 4)) p.b = (p.b + 14) | 0;
			else {
				const x = q.a;
				const open = this.b0_(x, (q.b * this.g + x) | 0);
				p.a = (p.a + (open ? -20 : 20)) | 0;
			}
		} else if (o.a.a === 94) {
			p.a = ((o.c ? -1 : 1) * 50 + p.a) | 0;
		}
	},

	/** void t0(): first webbed turns show a hint: marks the view's C0 (UApp pref reads 0 headless) */
	t0_() {
		const v = this.e;
		if (v.u != null && v.q[0] != null && !v.C0) v.C0 = true;
	},
});
