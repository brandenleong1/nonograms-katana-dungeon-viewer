// The guild save body: port of the game's loader vj0.a2(DataInputStream) for version 27 (the writer is
// vj0.m2; decompiled/vineflower/vj0.java a2 at 11688, m2 at 14440). The body has no length prefixes, so every
// section is read exactly as the game reads it. Section order:
//   header ints | F, h[16].q | i[5].q, byte, short S | j count, T0, U0, V0, j[].q | Y (wi0 offer) |
//   G H I J z A0 B0 C0, long D0 | cq K, L, M | tag 0x26F3 buildings ni0 until byte 0 | tag 0x2732 quests until
//   short 0 | pj0 stats | short 0x2800 ki0 pairs | e0 f0 h0 + packed o0/p0/q0 | b[].p, d.p | mask (c[7], e[], f[]) |
//   [hdr&2048] i0 | j0 k0 l0 | [S&16] m0 | [hdr&1024] w0 / x0 | 20 heroes nw | L0 | M0 (uw) |
//   O0 I0 J0 H0 | dungeon marker (0 none, 1 hw, 2 ew) + blob | R0[11] | [hdr&32768] F0 | G0 | S0 | [S&64] ri0
import { s16 } from '../gen/jrt.js';
import { vj0 as V } from '../gen/statics.js';
import { DataReader, SaveFormatError } from './reader.js';
import { item, kj0A, lvl1000, oj0j, tri1000, newBz3, bz3x, mi0a, jh1a, newSj0, obf, unobf, readUw } from './records.js';
import { readHw, readEw } from './dungeon.js';

const clampQ = (m, v) => {
	if (v < m.o) return m.o;
	return v > m.n ? m.n : v;
};

/**
 * vj0.a2: read `plain` (decoded guild.dat: 12 header ints, then the inflated GZIP `body`) into `v`, a fresh
 * profile from fresh.js. vj0.i2 must be `v` while this runs (hero XP caps, hw readers consult vj0.i2).
 */
export function readGuild(v, headerInts, body) {
	const hdr = headerInts[0];
	const ver = hdr >>> 16;
	if (ver !== 27) throw new SaveFormatError(`guild.dat version ${ver}: only version 27 (current game) is supported`);
	if (V.i2 !== v) throw new Error('readGuild: vj0.i2 must be the profile being loaded');
	const lvl10 = tri1000(10);

	v.w = (hdr & 1) !== 0;
	v.t2_(1, (hdr & 16) !== 0);
	v.d0 = (hdr & 32) !== 0;
	v.P0 = (hdr & 64) !== 0;
	v.t2_(0, (hdr & 128) !== 0);
	v.t2_(2, (hdr & 256) !== 0);
	v.a0 = (hdr & 512) !== 0;
	v.c0 = (hdr & 4096) !== 0;
	v.W = (hdr & 8192) !== 0;
	v.V = (hdr & 16384) !== 0;
	// headerInts[1] = save time (s)
	v.x = headerInts[2];
	v.y = headerInts[3];
	v.s2_(headerInts[4]);
	v.B = headerInts[5];
	v.U = v.v0_();
	v.D = headerInts[6];
	v.E = headerInts[7];
	// [8] = K.i() ^ L.i(), [9] = l0() (checks, not read back)
	const lo = BigInt(headerInts[10] >>> 0);
	const i7 = headerInts[11];
	v.C = i7 & 65535;
	v.X = lo | ((BigInt(i7 >>> 0) & 0xffff0000n) << 16n);

	const r = new DataReader(body);
	v.F = r.readUByte();
	for (let i = 0; i < 16; i++) v.h[i].q = clampQ(v.h[i], r.readUByte());
	for (const m of v.i) m.q = clampQ(m, r.readUByte());
	r.readByte();
	const S = r.readShort();
	v.t2_(3, (S & 1) !== 0);
	v.t2_(4, (S & 2) !== 0);
	v.t2_(5, (S & 4) !== 0);
	v.t2_(6, (S & 1024) !== 0);
	v.t2_(7, (S & 2048) !== 0);
	if ((S & 32) !== 0) v.r = true;
	v.Q0 = (S & 128) !== 0;
	v.g0 = (S & 256) !== 0;
	v.b0 = (S & 512) !== 0;

	const nj = r.readByte();
	v.T0 = r.readByte();
	v.U0.z_(r.readShort() & 0xffff);
	v.V0 = r.readInt();
	r.readInt();
	for (let i = 0; i < nj; i++) v.j[i].q = clampQ(v.j[i], r.readUByte());

	// Y: pending quest offer (wi0 from the static table vj0.R1)
	const yId = r.readUByte();
	if (yId !== 0) {
		const packed = r.readInt();
		const x0 = [r.readByte(), r.readByte(), r.readByte(), r.readByte()];
		const y0 = r.readInt();
		const z = r.readInt();
		r.readInt();
		const w = V.R1.find((o) => o.a === yId) || null;
		v.Y = w;
		if (w != null) {
			kj0A(w, packed);
			for (let i = 0; i < 4; i++) w.x0[i] = x0[i];
			w.y0 = y0;
			v.Z = z;
		}
	}

	v.G = r.readInt();
	v.H = r.readInt();
	v.I = r.readInt();
	v.J = r.readInt();
	v.z = r.readInt();
	v.A0 = r.readInt();
	v.B0 = r.readInt();
	v.C0 = r.readInt();
	v.D0 = r.readLong();
	r.readInt();
	v.K.m_(r, true);
	v.L.m_(r, true);
	v.M.m_(r, true);

	const tag = r.readInt() >>> 16;
	if (tag < 9969 || tag > 9971) throw new SaveFormatError('tag error: b');
	const legacyBump = tag <= 9970;
	readBuildings(v, r, ver, legacyBump);

	if ((r.readInt() & -65536) !== 657588224) throw new SaveFormatError('tag error: q');
	for (;;) {
		const id = r.readUShort();
		if (id === 0) break;
		r.readInt();
		const st = r.readInt();
		const q = v.Y0_(id);
		if (q != null) q.A_(st);
	}

	readStats(v.N, r, ver);

	if ((r.readShort() & 0xff00) !== 10240) throw new SaveFormatError('tag error: o');
	for (;;) {
		const id = r.readUShort();
		if (id === 0) break;
		const g = r.readShort();
		const k = V.a2 ? V.a2.get(id) : V.A1.find((o) => o.a === id);
		if (k != null) k.g = g & 0xffff;
	}

	v.e0 = r.readUByte();
	v.f0 = r.readUByte();
	v.h0 = r.readUByte();
	const pk = r.readByte();
	const o0 = pk & 15;
	v.o0 = o0 === 15 ? -1 : o0;
	v.p0 = (pk >>> 4) & 7;
	v.q0 = (pk & 128) !== 0;
	const shipXp = (o, x) => {
		if (!o.j) {
			o.p = x;
			if (x < -1) o.p = -1;
			else if (oj0j(x) >= 10) o.p = lvl10;
		}
	};
	for (const o of v.b) shipXp(o, r.readInt());
	shipXp(v.d, r.readInt());
	const mask = r.readInt();
	if ((1073741824 & mask) !== 0) { const c = v.c[7]; if (c.p < 0) c.p = 0; }
	for (let i = 0; i < v.e.length; i++) if (((1 << i) & mask) !== 0) v.e[i].o = true;
	for (let i = 0; i < v.f.length; i++) if (((1 << (i + 16)) & mask) !== 0) v.f[i].n = true;

	if ((hdr & 2048) !== 0) {
		const y = v.i0;
		for (let i = 0; i < y.h.length; i++) y.h[i] = r.readUShort();
		y.a = r.readUShort();
		const s = r.readShort();
		y.b = s & 32767;
		y.g = (s & 32768) !== 0;
		y.c = r.readShort();
		r.readShort();
		r.readInt();
		r.readInt();
	}

	v.j0 = r.readUByte();
	v.k0 = r.readUByte();
	const l0 = r.readInt();
	v.l0 = l0;
	if (l0 < 0) v.l0 = 0;
	else if (lvl1000(l0) >= 10) v.l0 = lvl10;

	if ((S & 16) !== 0) {
		const y = v.m0;
		for (let i = 0; i < y.h.length; i++) y.h[i] = r.readUShort();
		y.a = r.readUShort();
		const s = r.readShort();
		y.g = (s & 32768) !== 0;
		y.b = s & 32767;
		y.c = r.readShort();
		r.readInt();
	}

	if ((hdr & 1024) !== 0) {
		const s = r.readShort();
		v.w0 = s & 0xffff;
		if ((s & 32768) !== 0) {
			v.z0 = true;
			v.w0 = s & 32767;
		}
		v.r2_(r.readUShort());
		if (v.w0 !== 0) {
			const have = v.h0_();
			if (have <= 0) v.w0 = 0;
			else {
				const it = item(v.w0);
				if (it != null && it.c === 7 && it.o > 0) {
					const cap = v.i0_(it);
					v.y0 = cap;
					if (have > cap) v.r2_(cap);
				} else v.w0 = 0;
			}
		}
	}

	// heroes, party, hired, dungeon (ver >= 8)
	for (let i = 0; i < 20; i++) v.l[i].u_(r, ver);
	let n = r.readUByte();
	for (let i = 0; i < n; i++) v.L0.push(v.l[r.readByte()]);
	n = r.readUByte();
	for (let i = 0; i < n; i++) v.M0.push(readUw(r, false, ver));
	r.readByte();
	r.readShort();
	v.O0 = r.readUShort();
	v.I0 = r.readInt();
	v.J0 = r.readInt();
	v.H0 = r.readByte();
	const marker = r.readByte() & 3;
	if (marker === 1) v.K0 = readHw(v.u0_(), r, ver);
	else if (marker === 2) v.K0 = readEw(v.u0_(), r, ver);

	for (let i = 0; i < 11; i++) {
		const row = v.R0[i];
		const b = r.readByte();
		if (b < 0) row.fill(20);
		else for (let k = 0; k < b; k++) row[k] = r.readByte();
	}

	if ((hdr & 32768) !== 0) {
		n = r.readUByte();
		for (let i = 0; i < n; i++) v.F0.push(r.g0());
	}
	n = r.readUShort();
	for (let i = 0; i < n; i++) {
		const b = r.readByte();
		const s = r.readShort();
		v.G0.push(((b & 255) << 16) | (s & 0xffff));
	}
	n = r.readUShort();
	for (let i = 0; i < n; i++) {
		const s = newSj0(r.readUShort());
		s.b = r.f0();
		s.c = r.readByte();
		v.S0.push(s);
	}
	if ((S & 64) !== 0) {
		for (const x of v.m) {
			const b = r.readByte();
			x.i = b & 255;
			if ((b & 128) !== 0) {
				x.i = b & 127;
				x.j = r.f0();
			}
		}
	}
	// the stream closes here (a trailing int 0 is never read)
	v.E2_();
	let m = Math.min(v.N.f_(22) * 2, 20);
	if (v.R0[9][35] < m) v.R0[9][35] = m;
	m = Math.min(v.N.f_(26) * 2, 20);
	if (v.R0[10][27] < m) v.R0[10][27] = m;
	return { marker, unread: r.remaining };
}

/** Buildings / quest lines: {id byte, B0, flags, ...} until id 0 (a2's inner loop). */
function readBuildings(v, r, ver, legacyBump) {
	for (;;) {
		const id = r.readUByte();
		if (id === 0) return;
		const b = v.o[id];
		if (b == null) throw new SaveFormatError(`building ${id} is not in the fresh profile`);
		let B0 = r.readUByte();
		b.B0 = B0;
		if (b.C != null) b.C.B0 = B0;
		const fl = r.readInt();
		if ((fl & 4) !== 0) {
			b.C0 = (fl & 128) !== 0 ? r.readInt() : r.readUShort();
			b.n0_(false);
		}
		if ((fl & 32) !== 0) b.E0 = r.readInt();
		const parts = r.readUByte();
		if (parts > 0) {
			const g = (fl & 8) !== 0 ? r.readUByte() : 0;
			const mi = b.w_(g);
			if (mi != null && mi.b != null) {
				b.D0 = newBz3(mi.b.length);
				b.G0 = g;
			}
			const cur = b.t_();
			for (let k = 0; k < parts; k++) {
				let x = r.readInt();
				if (cur != null) {
					const z = b.D0;
					if (z != null && k < z.b.length) {
						x = Math.min(jh1a(cur.b[k]), x) ^ 57228461;
						z.b[k] = ((x & 252645135) << 4) | ((-252645136 & x) >>> 4);
					}
				}
			}
			const cur2 = b.t_();
			b.F0 = cur2 == null ? 0 : mi0a(cur2, b.D0, null);
		}
		if (legacyBump && id === 16) {
			B0 = b.B0;
			if (B0 === 1 || B0 === 2 || (B0 === 0 && b.D0 != null)) {
				b.B0 = ++B0;
				if (b.C != null) b.C.B0 = B0;
			}
		}
		if ((fl & 16) !== 0) {
			b.H0 = r.readUShort();
			b.I0 = b.H0 === 0 ? null : b.z_(b.H0);
			b.L0 = r.readUShort();
			b.J0 = r.readUShort();
			b.K0 = r.readInt();
			b.M0 = r.readInt();
		}
		if ((fl & 1) !== 0) {
			b.N0 = r.readUShort();
			b.O0 = r.readInt();
			const it = item(b.N0);
			b.P0 = it != null ? it.o * 3600 : 1;
		}
		if ((fl & 2) !== 0) b.Q0 = r.readInt();
		if ((fl & 64) !== 0) {
			const c = b.C;
			if (c != null) {
				c.H0 = r.readUShort();
				c.I0 = c.H0 === 0 ? null : c.z_(c.H0);
				c.L0 = r.readUShort();
				c.J0 = r.readUShort();
				c.K0 = r.readInt();
				c.M0 = r.readInt();
			} else {
				r.readShort(); r.readShort(); r.readShort(); r.readInt(); r.readInt();
			}
		}
	}
}

/** pj0 statistics block (flags-driven). */
function readStats(N, r, ver) {
	pj0c(N);
	const fl = r.readInt();
	N.a.m_(r, false);
	N.b.m_(r, false);
	if ((fl & 2) !== 0) N.c.m_(r, false);
	if ((fl & 2048) !== 0) N.d.m_(r, false);
	N.f = r.readInt();
	N.g = r.readInt();
	N.h = r.readInt();
	N.i = r.readInt();
	const j = N.j;
	j[0] = r.readInt(); j[1] = r.readInt(); j[2] = r.readInt(); j[3] = r.readInt();
	if ((fl & 256) !== 0) j[4] = r.readInt();
	if ((fl & 1) !== 0) {
		N.k = r.readInt();
		const n = (fl & 4096) !== 0 ? 8 : (fl & 512) !== 0 ? 7 : (fl & 16) !== 0 ? 6 : 5;
		for (let i = 0; i < n; i++) N.l[i] = r.readInt();
	}
	if ((fl & 32) !== 0) {
		N.m = r.readInt();
		for (let i = 0; i < 8; i++) N.n[i] = r.readInt();
		r.readInt();
	}
	if ((fl & 128) !== 0) {
		r.readInt();
		for (let i = 0; i < 6; i++) N.o[i] = r.readInt();
		r.readInt();
	}
	if ((fl & 1024) !== 0) {
		N.u = r.readInt(); N.v = r.readInt(); N.w = r.readInt(); N.x = r.readInt(); N.y = r.readInt();
		for (let i = 0; i < 27; i++) N.j_(i, r.readInt());
		r.readInt(); r.readInt(); r.readInt();
	}
	if ((fl & 4) !== 0) N.i_(r.readInt());
	if ((fl & 8) !== 0) {
		N.z = r.readInt();
		N.A = r.readUShort();
		N.B = r.readUShort();
		N.C = r.readUShort();
	}
	if ((fl & 64) !== 0) N.D = r.readInt();
	if ((fl & 8192) !== 0) {
		for (let i = 0; i < 4; i++) N.q[i] = r.readInt();
		r.readInt();
	}
	if ((fl & 16384) !== 0) {
		for (let i = 0; i < N.p.length; i++) N.p[i] = r.readInt();
		r.readInt();
		r.readInt();
	}
	if ((fl & 32768) !== 0) {
		N.r = r.readInt();
		N.e.m_(r, false);
	}
}

/** pj0.c(): clear all statistics */
function pj0c(N) {
	N.a.h_(); N.b.h_(); N.c.h_(); N.d.h_(); N.e.h_();
	N.f = 0; N.g = 0; N.h = 0; N.i = 0;
	N.j.fill(0);
	N.k = 0;
	N.l.fill(0);
	N.m = 0;
	N.n.fill(0); N.o.fill(0); N.p.fill(0); N.q.fill(0);
	N.r = 0;
	for (let i = 0; i < 27; i++) N.j_(i, 0);
	N.y = 0; N.x = 0; N.w = 0; N.v = 0; N.u = 0;
	N.i_(0);
	N.z = 0; N.C = 0; N.B = 0; N.A = 0; N.D = 0;
}

export { obf, unobf, bz3x, s16 };
