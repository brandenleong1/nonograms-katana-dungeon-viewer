// RECORD builder: the oracle's per-input state dump (tools/oracle/FightHarness.java state / hero / crRec / objRec /
// snapKey / gone), field for field and in its key order, so JSON.stringify of a JS record equals the oracle's
// record text. Also the hw.x / hw.w draw counter (wraps e01 h_ / g_ on those two instances).
//
// Serials: critters (hw.o order) then objects (hw.n order) get the next number on first sight, scanned before
// every record (and inside the noop key); objects referenced only through a field (tgt, F, spider, cr target l)
// get theirs where the oracle's ser() first meets them.

/** Count (and optionally log) draws of one e01 instance: h_(n) logs [n, v], g_() logs [-1, v]; i_ goes through h_. */
export function watchRng(rng, onDraw) {
	const h = rng.h_, g = rng.g_;
	rng.h_ = function h_(n) {
		const v = h.call(this, n);
		onDraw(n, v);
		return v;
	};
	rng.g_ = function g_() {
		const v = g.call(this);
		onDraw(-1, v);
		return v;
	};
}

/** Caller of a draw as "Class.method" (the first stack frame outside e01 and this file), from a V8 stack. */
export function drawCaller() {
	const st = new Error().stack.split('\n');
	for (let i = 1; i < st.length; i++) {
		const l = st[i];
		if (l.includes('/record.js')) continue;
		const m = /at (?:(?:Object|Function)\.)?([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+?)_? \(/.exec(l) || /at ([A-Za-z0-9_$]+?)_? \(/.exec(l);
		if (!m) continue;
		if (m.length === 3) return `${m[1]}.${m[2]}`;
		return m[1];
	}
	return '?';
}

const b = (v) => (v ? 1 : 0);

/** a value as JSON shows it inside an array: undefined / NaN / +-Infinity are null; booleans stay booleans */
const jsonVal = (v) => (v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? null : v);

/** flat arrays equal as JSON text: same length, elements === (after jsonVal) */
function sameRow(a, b) {
	if (a === b) return true;
	if (a == null || b == null || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i], y = b[i];
		if (x !== y && jsonVal(x) !== jsonVal(y)) return false;
	}
	return true;
}

/** selected tool id of a c30: skill yv.a / item bj0.a, 0 none, -1 selected without a tool */
export function selIdOf(c) {
	if (!c.V) return 0;
	if (c.W != null) return c.W.a;
	if (c.X != null) return c.X.a;
	return -1;
}

/**
 * oracle --cells (FightHarness.cellState): the tiles hw.j as a = ww.a << 8 | (ww.b & 255). init: "cellsH", the int
 * hash 31 * h + v over all; a step: "cells", the [index, a, b (signed byte)] that changed since the previous record.
 * Both: "vis", the same hash over hw.m (visibility). Hidden state the other fields do not show (puzzle and plate
 * bits, cleared undergrowth, dug cells, trap marks, fog).
 */
function cellState(rec, out, full) {
	const h = rec.f.h;
	const n = h.j.length;
	const cur = new Int32Array(n);
	for (let i = 0; i < n; i++) { const w = h.j[i]; cur[i] = (w.a << 8) | (w.b & 255); }
	const prev = rec.prevCells;
	if (full || prev == null) {
		let hs = 0;
		for (let i = 0; i < n; i++) hs = (Math.imul(31, hs) + cur[i]) | 0;
		out.cellsH = hs;
	} else {
		const d = [];
		for (let i = 0; i < n; i++) if (cur[i] !== prev[i]) d.push([i, cur[i] >> 8, (cur[i] << 24) >> 24]);
		out.cells = d;
	}
	rec.prevCells = cur;
	let hm = 0;
	const m = h.m;
	for (let i = 0; i < m.length; i++) hm = (Math.imul(31, hm) + m[i]) | 0;
	out.vis = hm;
}

export class Recorder {
	/**
	 * fight: { h, c, dgv } (driver.js). opts.draws: keep this input's hw.x draws in rng.d; opts.trace: with callers.
	 */
	constructor(fight, opts = {}) {
		this.f = fight;
		this.serial = new Map();
		this.next = 0;
		this.prevCr = new Map();
		this.prevObj = new Map();
		this.nx = 0;
		this.nw = 0;
		this.draws = [];        // this input's hw.x draws: [bound, value] or [bound, value, caller]
		this.log = !!(opts.draws || opts.trace);
		this.trace = !!opts.trace;
		this.callers = !!opts.callers;   // JS callers kept separately (for divergence reports)
		this.jsCallers = [];
		this.cells = !!opts.cells;   // oracle --cells: tile deltas / hashes (cellState)
		this.prevCells = null;
		this.watch();
	}

	/** Count draws on this fight's hw.x / hw.w (own h_ / g_ on those two e01; clone.js re-runs it on copies). */
	watch() {
		const h = this.f.h;
		watchRng(h.x, (n, v) => {
			this.nx++;
			if (this.log) this.draws.push([n, v]);
			if (this.callers) this.jsCallers.push(drawCaller());
		});
		watchRng(h.w, () => { this.nw++; });
	}

	ser(o) {
		let s = this.serial.get(o);
		if (s === undefined) {
			s = this.next++;
			this.serial.set(o, s);
		}
		return s;
	}

	assign() {
		const h = this.f.h;
		for (const o of h.o) this.ser(o);
		for (const o of h.n) this.ser(o);
	}

	/** selected tool id: skill yv.a / item bj0.a, 0 none, -1 selected without a tool */
	selId() {
		return selIdOf(this.f.c);
	}

	hero() {
		const { h, c } = this.f;
		const f = h.f;
		const inv = f.D.c.map((e) => [e.a.a, e.a_()]);
		return {
			n: this.ser(f), x: f.b.a, y: f.b.b,
			hp: f.j.v_(), hpM: f.q_(), ep: f.z.v_(), epM: f.D_(), mp: f.E_(), mpM: h.e.n_(), ap: f.n.v_(), spd: f.r_(),
			st: [f.p, f.q, f.r, f.s, f.t, f.u, f.v, f.w, f.x, f.o],
			fam: f.C.v_(), inv,
			path: c.z.length, tgt: c.a0 == null ? -1 : this.ser(c.a0),
			F: h.F == null ? -1 : this.ser(h.F), G: h.G, H: h.H,
			spider: h.q == null ? -1 : this.ser(h.q), spiderHp: h.r,
		};
	}

	/** [serial, id, x, y, hp, ap, k, p, q, r, s, t, u, v, w, x, o, l, m, c, d, e, f, g, h] */
	crRec(m) {
		return [this.ser(m), m.a.a, m.b.a, m.b.b, m.j.v_(), m.n.v_(), m.k, m.p, m.q, m.r, m.s, m.t, m.u, m.v, m.w, m.x, m.o,
			m.l == null ? -1 : this.ser(m.l), b(m.m), b(m.c), b(m.d), b(m.e), b(m.f), m.g, m.h];
	}

	/** [serial, id, x, y, c, d, e, f, g, h] */
	objRec(o) {
		return [this.ser(o), o.a.a, o.b.a, o.b.b, b(o.c), b(o.d), b(o.e), b(o.f), o.g, o.h];
	}

	/**
	 * Whole-state key for ok/noop: hero, selection, tap path, C, draw count, RNG states, every critter and object,
	 * as one flat array (with the lengths of its variable parts); compare two with sameKey. Equal exactly when the
	 * JSON text of those parts is (the oracle's snapKey), at a fraction of the cost. ser() calls (serial numbering)
	 * happen in the same order as in the records.
	 */
	key() {
		this.assign();
		const { h, c } = this.f;
		const k = [];
		const hr = this.hero();
		k.push(hr.n, hr.x, hr.y, hr.hp, hr.hpM, hr.ep, hr.epM, hr.mp, hr.mpM, hr.ap, hr.spd);
		for (const v of hr.st) k.push(v);
		k.push(hr.fam, hr.inv.length);
		for (const e of hr.inv) k.push(e[0], e[1]);
		k.push(hr.path, hr.tgt, hr.F, hr.G, hr.H, hr.spider, hr.spiderHp);
		k.push(this.selId(), c.z.length);
		for (const d of c.z) k.push(d);
		k.push(h.C, this.nx, h.x.a, h.w.a, h.o.length);
		const cr = h.o;
		for (let i = 0; i < cr.length; i++) {
			const m = cr[i];   // crRec's row, pushed directly (same ser() order)
			k.push(this.ser(m), m.a.a, m.b.a, m.b.b, m.j.v_(), m.n.v_(), m.k, m.p, m.q, m.r, m.s, m.t, m.u, m.v, m.w, m.x, m.o,
				m.l == null ? -1 : this.ser(m.l), b(m.m), b(m.c), b(m.d), b(m.e), b(m.f), m.g, m.h);
		}
		const ob = h.n;
		k.push(ob.length);
		for (let i = 0; i < ob.length; i++) {
			const o = ob[i];   // objRec's row
			k.push(this.ser(o), o.a.a, o.b.a, o.b.b, b(o.c), b(o.d), b(o.e), b(o.f), o.g, o.h);
		}
		return k;
	}

	/** two key() results (or record rows) describe the same state: elementwise equal as JSON values */
	sameKey(a, b) {
		return sameRow(a, b);
	}

	/** The state part of a record (C ... end), as an ordered plain object; updates the delta baselines. */
	state(out, full) {
		const { h, c } = this.f;
		const f = h.f;
		this.assign();
		out.C = b(h.C);
		out.D = h.D.map((o) => this.ser(o));
		out.sel = this.selId();
		out.hero = this.hero();
		const curCr = new Map();
		const cr = [];
		for (const o of h.o) {
			if (o === f) continue;
			const r = this.crRec(o);
			curCr.set(o, r);
			if (full || !sameRow(r, this.prevCr.get(o))) cr.push(r);
		}
		out.cr = cr;
		const gone = this.gone(this.prevCr, curCr);
		if (gone) out.gone = gone;
		this.prevCr = curCr;
		const curObj = new Map();
		const obj = [];
		for (const o of h.n) {
			const r = this.objRec(o);
			curObj.set(o, r);
			if (full || !sameRow(r, this.prevObj.get(o))) obj.push(r);
		}
		out.obj = obj;
		const og = this.gone(this.prevObj, curObj);
		if (og) out.objGone = og;
		this.prevObj = curObj;
		const rng = { x: h.x.a, w: h.w.a, nx: this.nx, nw: this.nw };
		if (this.log) rng.d = this.draws.map((d) => [d[0], d[1]]);   // (oracle --trace adds Java callers; see jsCallers)
		out.rng = rng;
		out.dead = b(f.u_());
		out.end = b(c.w);
		if (this.cells) cellState(this, out, full);
		return out;
	}

	gone(prev, cur) {
		const g = [];
		for (const o of prev.keys()) if (!cur.has(o)) g.push(o);
		if (!g.length) return null;
		g.sort((x, y) => this.ser(x) - this.ser(y));
		return g.map((o) => [this.ser(o), o.a.a, o.b.a, o.b.b]);
	}

	/** start of an input: clear the per-input draw log */
	begin() {
		this.draws = [];
		this.jsCallers = [];
	}
}
