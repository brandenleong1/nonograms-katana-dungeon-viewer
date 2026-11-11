// The dungeon in progress (vj0.K0) from the save, revived into the js/gen model classes with Java field
// names so the generator's and the combat engine's methods work on it:
//   marker 1: hw(nw, DataInputStream, int)   decompiled/vineflower/hw.java 57-382 (writer hw.d 881-1221)
//   marker 2: ew (autonomous run)            vj0.a2 + JADX ew.java
// Object / critter / hero records are qw.g, aw.g, mw.g (vineflower qw/aw/mw.java).
//
// Post-load derivations the reader runs and that are ported here: hw.E (clone template bw 199), hw.H (shadow
// 198), hw.I (companions 190..193), hw.F (familiars 195..197), hw.l(false) (region labels), hw.m(x, y, true,
// false) (fog: re-reveal the hero's door region; m[] = 127 visible, -1 explored), hw.i() (objectives left).
import { imul, get } from '../gen/jrt.js';
import { register, classes } from '../gen/registry.js';
import { zw, vj0 as V } from '../gen/statics.js';
import { qw, aw, mw, hw, iw, cw, fg2, kh0, Util$Point } from '../gen/model.js';
import { item, readUw } from './records.js';
import { SaveFormatError } from './reader.js';

// ---------------------------------------------------------------------------------------------
// ew: autonomous ("auto dungeon") run. g, h = progress counters, i = flag (writer short bit 8), j = byte.

export class ew extends iw {
	constructor() {
		super();
		this.g = 0;
		this.h = 0;
		this.i = false;
		this.j = 0;
		this.k = false;
	}

	/** ew a() */
	a_() { return this; }
}
if (!classes.ew) register(ew);

// ---------------------------------------------------------------------------------------------
// hw methods the reader needs that the generator port does not have

if (!hw.prototype.E_) {
	/** void E(hw): clone template bw 199 from the guild hero (75% HP / defence, full damage) */
	hw.prototype.E_ = function E_(lvl) {
		const t = zw.c_(199);
		t.b = lvl.s ? 5643 : 5632;
		const d = t.d0;
		const e = this.e;
		t.f0 = new cw(Math.max(d.a, ((imul(e.m_(), 75) / 100) | 0)), Math.max(d.b, e.f_()), Math.max(d.c, ((imul(e.e_(), 75) / 100) | 0)), d.d, 0);
	};
}

if (!hw.prototype.m_) {
	/**
	 * boolean m(int x, int y, boolean reset, boolean dim): reveal the door region (l & -1024) around (x, y).
	 * With reset, every explored cell (m != 0) first becomes -1 (explored, not in view). Then a flood fill over
	 * explored cells of that region sets them (and the explored wall cells around them) to 127 (1 when dim).
	 * Doors / closed cells of types 3, 8, 9 without bit 32 stop the spread.
	 */
	hw.prototype.m_ = function m_(x, y, reset, dim) {
		const val = dim ? 1 : 127;
		const reg = this.l[(imul(this.g, y) + x) | 0] & -1024;
		let any = false;
		if (reg === 0) return false;
		if (reset) {
			for (let yy = 0; yy < this.h; yy++) {
				for (let xx = 0; xx < this.g; xx++) {
					const i = (imul(this.g, yy) + xx) | 0;
					if (this.m[i] !== 0) this.m[i] = -1;
				}
			}
			any = true;
		}
		const R = [];
		let v = x | (y << 16);
		for (;;) {
			const cx = v & 65535;
			const cy = v >>> 16;
			const i = (imul(this.g, cy) + cx) | 0;
			let hit = any;
			if (this.m[i] === -1 && (this.l[i] & -1024) === reg) {
				this.m[i] = val;
				const c = this.j[i];
				if (!fg2.X_(c.a, 3, 8, 9) || (c.b & 32) !== 0) {
					for (let yy = cy > 0 ? cy - 1 : cy; yy < this.h && yy <= cy + 1; yy++) {
						for (let xx = cx > 0 ? cx - 1 : cx; xx < this.g && xx <= cx + 1; xx++) {
							if (xx !== cx || yy !== cy) {
								const k = (imul(this.g, yy) + xx) | 0;
								if ((this.l[k] & -1024) === 0 && this.m[k] !== 0) this.m[k] = val;
							}
						}
					}
					if (cx > 0) R.push((cy << 16) | (cx - 1));
					if (cx < this.g - 1) R.push((cy << 16) | (cx + 1));
					if (cy > 0) R.push(((cy - 1) << 16) | cx);
					if (cy < this.h - 1) R.push(((cy + 1) << 16) | cx);
				}
				hit = true;
			}
			if (R.length === 0) return hit;
			v = R.pop();
			any = hit;
		}
	};
}

// ---------------------------------------------------------------------------------------------
// record readers

/** qw.g(hw, DataInputStream, int, boolean compact) */
function readQw(q, r, ver, compact) {
	const f = r.readByte();
	if ((f & 1) !== 0) q.c = true;
	if ((f & 2) !== 0) q.d = true;
	if ((f & 4) !== 0) q.e = true;
	if ((f & 8) !== 0) q.f = true;
	const p = q.b;
	if (compact) {
		p.a = r.readUByte();
		p.b = r.readUByte();
	} else {
		p.a = r.readShort();
		p.b = r.readShort();
	}
	if ((f & 16) !== 0) {
		const g = r.readUShort();
		q.g = g === 65535 ? -1 : g;
	}
	if ((f & 32) !== 0) q.h = r.e0();
}

/** aw.g: qw.g, then HP, group k and the flag-selected status fields */
function readAw(c, r, ver, compact) {
	readQw(c, r, ver, compact);
	const m = ver >= 27 ? r.readUShort() : r.readUByte();
	c.A_(r.readShort());
	c.k = r.readUByte();
	if ((m & 1) !== 0) {
		if (ver >= 18) c.p = r.readUShort();
		else c.p |= 1024;
	}
	if ((m & 2) !== 0) c.B_(r.readByte());
	if ((m & 4) !== 0) c.r = r.readByte();
	if ((m & 8) !== 0) c.w = r.readByte();
	if ((m & 16) !== 0) c.x = r.readByte();
	if ((m & 32) !== 0) c.q = r.readByte();
	if ((m & 64) !== 0) c.s = r.readByte();
	if ((m & 128) !== 0) c.u = r.readByte();
	if ((m & 256) !== 0) c.v = r.readUByte();
	if ((m & 512) !== 0) c.t = r.readByte();
}

/** mw.g: aw.g, then MP z, A (obfuscated), B, C, the pack D, followers F, E */
function readMw(c, r, ver, compact) {
	readAw(c, r, ver, compact);
	const fl = r.readShort();
	c.z.z_(r.readShort());
	c.G_(r.readUShort());
	if (ver < 18) c.p = r.readUShort();
	c.F_(r.readInt());
	c.C.z_(r.readUByte());
	r.readByte();
	r.readShort();
	r.readInt();
	c.D.m_(r, false);
	if ((fl & 1) !== 0) {
		const n = r.readUByte();
		for (let i = 0; i < n; i++) c.F.push(readUw(r, false, ver));
	}
	if ((fl & 2) !== 0) c.E = r.readUByte();
	r.readInt();
}

/** hw.C(DataInputStream): object reference, -1 null, bit 28 = critter index, else object index */
function readRef(h, r) {
	const v = r.readInt();
	if (v === -1) return null;
	return (268435456 & v) !== 0 ? get(h.o, v & 268435455) : get(h.n, v);
}

const typeOf = (map, id, what) => {
	const t = map.get(id);
	if (t === undefined) throw new SaveFormatError(`dungeon: unknown ${what} type ${id}`);
	return t;
};

/** new hw(nw, DataInputStream, int version) */
export function readHw(hero, r, ver) {
	const fl = r.readShort();
	const a = r.readInt();
	const type = r.readByte();
	const h = new hw(type, hero);           // iw(int, nw): e = hero, b = type, e() -> c, d
	h.s = (fl & 128) !== 0;
	h.E = (fl & 4096) !== 0;
	h.a = a;
	h.y = r.readByte();
	r.readInt();
	r.readInt();
	h.g = r.readUShort();
	h.h = r.readUShort();
	h.i = imul(h.g, h.h);
	h.w.a = r.readInt();
	h.x.a = r.readInt();
	if ((fl & 16) !== 0) h.A = r.readUByte();
	const compact = ver >= 12 && h.g < 256 && h.h < 256;
	const shortIds = ver >= 18;
	h.h_(true, true);

	// cells: RLE, c & 15 == 15 announces a run of (c >> 4) + 2 extra copies of the next cell
	const { ww } = classes;
	for (let i = 0; i < h.i;) {
		let c = r.readByte();
		let t = c & 15;
		let run = 0;
		if (t === 15) {
			run = (15 & (c >>> 4)) + 2;
			c = r.readByte();
			t = c & 15;
		}
		const cell = new ww();
		h.j[i] = cell;
		cell.a = t;
		const bits = c & 112;
		cell.b = bits === 112 ? r.readByte() : bits >>> 4;
		if ((c & 128) !== 0) h.m[i] = 127;
		if (run > 0) {
			const m = h.m[i];
			i++;
			for (; run > 0; run--, i++) {
				const w = new ww();
				h.j[i] = w;
				w.a = cell.a;
				w.b = cell.b;
				h.m[i] = m;
			}
		} else i++;
	}

	let n = r.readInt();
	for (let k = 0; k < n; k++) {
		const id = shortIds ? r.e0() : r.readUShort();
		const q = new qw(zw.Q.get(id) ?? null);
		readQw(q, r, ver, compact);
		h.g_(q, false);
	}
	if ((fl & 2) !== 0) {                    // hero outside the critter list (legacy)
		r.readShort();
		const me = new mw(h);
		h.f = me;
		readMw(me, r, ver, compact);
	}
	h.E_(h);
	if ((fl & 4) !== 0) {
		h.t = V.i2.l[r.readByte()];
		h.H_();
	}
	if ((fl & 32) !== 0) {                   // familiar (pet) slots
		n = r.readUByte();
		for (let k = 0; k < n; k++) {
			const f = r.readByte();
			if ((f & 1) !== 0) {
				const g = { $class: 'gw', a: null, b: 0, c: new kh0(14, false), d: new kh0(14, false), e: 0, f: false, g: false, h: false };
				h.v[k] = g;
				if ((f & 2) !== 0) hw.F_(zw.c_((k + 195) | 0), get(h.e.l, k));
				if ((f & 16) !== 0) g.f = true;
				if ((f & 32) !== 0) g.g = true;
				if ((f & 64) !== 0) g.h = true;
				g.b = r.readShort();
				g.c.z_(r.readUByte());
				g.d.z_(r.readInt());
				g.e = r.readByte();
			}
		}
	}
	if ((fl & 64) !== 0) {                   // hired companions
		n = r.readUByte();
		h.p = new Array(n);
		for (let k = 0; k < n; k++) h.p[k] = readUw(r, false, ver);
		h.I_();
	}
	n = r.readInt();
	for (let k = 0; k < n; k++) {
		const id = shortIds ? r.e0() : r.readUShort();
		let c;
		if (id === 180) {
			c = new mw(h);
			h.f = c;
		} else {
			c = new aw(h, typeOf(zw.R, id, 'critter'));
		}
		if (id === 180) readMw(c, r, ver, compact); else readAw(c, r, ver, compact);
		h.f_(c, false);
		if (ver < 18 && id >= 400 && id <= 405 && c.h === 0) c.h = 1001;
		if (id === 199) h.q = c;
		else if (id === 198) h.u = c;
		else if (id >= 195 && id < 198) h.v[id - 195].a = c;
	}
	if (h.q == null) h.r = r.readShort();
	if ((fl & 1) !== 0) {                    // combat turn order
		h.C = true;
		n = r.readUShort();
		for (let k = 0; k < n; k++) {
			const i = r.readInt();
			if (i < h.o.length) h.D.push(h.o[i]);
		}
	}
	if ((fl & 1792) !== 0) {
		h.B = [null, null, null];
		for (let k = 0; k < 3; k++) {
			if (((256 << k) & fl) !== 0) {
				const p = new Util$Point();
				h.B[k] = p;
				if (compact) { p.a = r.readUByte(); p.b = r.readUByte(); } else { p.a = r.readShort(); p.b = r.readShort(); }
			}
		}
	}
	if ((fl & 8) !== 0) {                    // pending action
		r.readInt();
		h.G = r.readInt();
		h.H = r.readInt();
		h.I = r.readInt();
		h.L = new Util$Point();
		h.L.a = r.readInt();
		h.L.b = r.readInt();
		const m = r.readInt();
		h.M = m === 0 ? null : (zw.q.get(m) ?? null);
		const it = r.readInt();
		h.N = it === 0 ? null : item(it);
		h.F = readRef(h, r);
		h.J = readRef(h, r);
		n = r.readInt();
		// hw.d skips K entries that are no longer in the level but still writes K.size(): the game's own reader
		// then misreads, and so does this one (same bytes, same result).
		for (let k = 0; k < n; k++) {
			const q = readRef(h, r);
			if (q != null) h.K.push(q);
		}
		h.O = readRef(h, r);
		r.readInt();
		r.readInt();
		r.readInt();
	}
	if (h.f == null) h.f = new mw(h);
	h.l_(false);
	const p = h.f.b;
	h.m_(p.a, p.b, true, false);
	h.z = (h.y - h.i_()) | 0;
	return h;
}

/** vj0.a2 marker 2: ew + its hero mw (compact coordinates) */
export function readEw(hero, r, ver) {
	const e = new ew();
	e.e = hero;
	e.i = (r.readShort() & 256) !== 0;
	e.a = r.readInt();
	e.b = r.readByte();
	e.e_();
	e.g = r.readInt();
	e.h = r.readInt();
	e.j = r.readUByte();
	r.readInt();
	r.readInt();
	r.readShort();
	const me = new mw(e);
	e.f = me;
	readMw(me, r, ver, true);
	return e;
}
