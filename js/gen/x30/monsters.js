// x30 monster / NPC phase: O (monsters, bosses, uniques, quest NPC groups, companions), P (NPCs,
// merchants, wagon, referrals) and their helpers N, Q, s0, t0, x0, n0, B; L (monster-key door 29 +
// item 167); e / a (room floor detail on the cosmetic stream f).
// Source: decompiled/vineflower/x30.java. Vineflower is garbled in O's room loop and companion pick,
// JADX in O's unique loop, boss companion test, companion w0 test, s0 and P, so every disputed branch
// was checked against smali (~/.cache/nk-oracle/smali/x30.smali).
// RNG streams: this.e structure, this.f cosmetic (flips, floor detail), hw.w loot (inside s8.u / qw.d).
import { install, x30 } from './index.js';
import { b8, imul, idiv, irem, iabs, f32, f2i, get, removeAt } from '../jrt.js';
import { xs, zw, vj0 } from '../statics.js';
import { fg2, n30, wg2, uw, GenStuckException } from '../model.js';

install({
	/** bw B(): weighted pick from the level's random-monster pool K (total weight L). */
	B_() {
		let r = this.e.h_(this.L);
		for (let i = 0; i < this.K.length; i++) {
			const m = get(this.K, i);
			const w = m.t0;
			if (r < w) return m;
			r = (r - w) | 0;
		}
		return null;
	},

	/** aw N(u30 room, int id): spawn a monster (group 2) on a random free floor cell of the room. */
	N_(room, id) {
		const p = this.i_(room, false, 0, true, null, false, null, false, false);
		if (p === null) return null;
		const flip = this.f.h_(2) === 0;
		const c = this.b.K_(id, p.a, p.b, 2, flip, false);
		room.F = (room.F + 1) | 0;
		return c;
	},

	/** aw Q(u30 room, int id, Util$Point near): spawn an NPC (group 0), strict spot, optionally near a point. */
	Q_(room, id, near) {
		const p = this.i_(room, true, 0, true, null, false, near, false, true);
		if (p === null) return null;
		return this.b.K_(id, p.a, p.b, 0, this.f.h_(2) === 0, false);
	},

	/** void t0(bw boss, u30 room): boss retinue (y0 x monster x0); marks the room as guarded (m). */
	t0_(bt, room) {
		if (bt.x0 !== 0) {
			for (let i = 0; i < bt.y0; i++) this.N_(room, bt.x0);
			room.m = true;
		}
	},

	/** boolean x0(Util$Point p, int id, boolean z): spawn monster id on p if it is free floor (or a 84 marker). */
	x0_(p, id, z) {
		if (p != null) {
			const idx = (imul(p.b, this.h) + p.a) | 0;
			if (this.g[idx].a === 1) {
				const o = this.b.k[idx];
				if (o == null || o.a.a === 84) {
					const flip = this.f.h_(2) === 0;
					const c = this.b.K_(id, p.a, p.b, 2, flip, true);
					if (z && this.g[idx].o_(false)) c.z_(512);
					return true;
				}
			}
		}
		return false;
	},

	/** void n0(int drop, aw m, kj0 quest, boolean boss): set the monster's drop (quest item, special, default key). */
	n0_(drop, m, q, boss) {
		const id = m.a.a;
		if (drop === 0) {
			if (boss && q != null && q.P !== 0 && q.Q && q.s_(0, this.b.b)) {
				drop = q.P;
			} else {
				drop = zw.a_(this.b.b, id);
				if (drop === 0) {
					const pw = this.c;
					if (pw.n > 0 && boss) drop = 117;
					else if (pw.G) drop = 284;
					else drop = 125;
				}
			}
		}
		if (drop !== 0) m.g = drop;
	},

	/** aw s0(int id): place a boss in a big room far from the entrance (170 tries, area/distance relax). */
	s0_(id) {
		const bt = zw.c_(id);
		const minArea = bt.x0 === 0 && bt.C0 === 0 ? 25 : 35;
		const q = this.q;
		const cx = (idiv(q.c, 2) + q.a) | 0;
		const cy = (idiv(q.d, 2) + q.b) | 0;
		let dx = (idiv(this.k, 2) - 5) | 0;
		let dy = (idiv(this.l, 2) - 5) | 0;
		const rooms = this.n;
		for (let t = 0; t < 170; t++) {
			const r = get(rooms, this.e.h_(rooms.length));
			if (x30.t_(r, true)) continue;
			if (t <= 90 && imul(r.c, r.d) < (t <= 60 ? minArea : 25)) continue;
			if (t !== 0 && irem(t, 50) === 0) {
				dx = idiv(imul(dx, 75), 100);
				dy = idiv(imul(dy, 75), 100);
			}
			if ((this.a.r <= 0 || !r.o) && t <= 130
				&& iabs((cx - ((idiv(r.c, 2) + r.a) | 0)) | 0) < dx
				&& iabs((cy - ((idiv(r.d, 2) + r.b) | 0)) | 0) < dy) continue;
			const m = this.N_(r, id);
			if (m !== null) {
				r.l = true;
				return m;
			}
		}
		n30.c_(1, 'no space for boss');
		return null;
	},

	/** void O(): bosses, quest boss extras, uniques, random monsters per room, arena waves, guaranteed
	 *  monsters, then P() (NPCs), then hired companions (hw.p, critters 190..193). */
	O_() {
		const st = vj0.i2;
		const lvl = this.b.b;
		const quests = st.k;
		let quest = null;
		for (let i = 0; i < quests.length; i++) {
			const q = quests[i];
			if (q.s_(-1, lvl) || q.t_(-1, lvl, false)) {
				quest = q;
				break;
			}
		}

		const bossId = this.c.e;
		const f = this.f;
		const rooms = this.n;
		let bossRoom = null;
		if (bossId !== 0) {
			let boss, room;
			if (this.a.h && this.r != null) {
				room = this.r;
				boss = this.N_(room, bossId);
				if (boss === null) {
					n30.c_(1, 'no space for boss');
					return;
				}
				room.l = true;
				boss.h = 1101;
			} else {
				boss = this.s0_(bossId);
				const p = boss.b;
				room = get(rooms, this.m[(imul(p.b, this.h) + p.a) | 0]);
				boss.h = 1103;
			}

			let drop;
			const pw = this.c;
			if (pw.F) drop = !st.y1_(this.b.b) && st.Y0_(46).q_() ? 256 : 0;
			else if (pw.E) drop = st.J1_(this.b.b, true) ? 0 : 113;
			else drop = st.G1_(this.b.b) ? 0 : 142;

			this.n0_(drop, boss, quest, true);
			const bt = boss.a;
			// smali: L0 != 0 && (G ? !(Y0(62).w(2) || Y0(63).v()) : drop != 0)  (JADX has it inverted)
			let extra;
			if (bt.L0 === 0) extra = false;
			else if (this.c.G) extra = !(st.Y0_(62).w_(2) || st.Y0_(63).v_());
			else extra = drop !== 0;

			const q25 = st.Y0_(25);
			if (q25.x_() && q25.a0 === this.b.b) {
				const b2 = this.N_(room, 413);
				if (b2 === null) {
					n30.c_(1, 'no space for boss2');
					return;
				}
				this.n0_(0, b2, null, false);
				room.x = 10;
			} else if (extra) {
				const kind = zw.c_(bt.L0).L0;
				const id = bt.L0;
				if (kind === 1) {
					const p = this.i_(room, false, 0, true, null, false, null, false, false);
					if (p !== null) this.b.K_(id, p.a, p.b, 1, f.h_(2) === 0, false);
				} else {
					this.N_(room, id);
				}
			} else if (bt.a === 267 && room.x !== 8 && !room.f && !fg2.W_(room.w, 3, 2) && !fg2.Z_(room.v, 4, 5, 10, 11, 12)) {
				room.x = 13;
			}
			this.t0_(bt, room);
			bossRoom = room;
		}

		const q51 = st.Y0_(51);
		if (q51.x_() && q51.a0 === this.b.b) {
			const m = this.s0_(389);
			if (!st.P1_(256)) m.g = 256;
			const p = m.b;
			const r = get(rooms, this.m[(imul(p.b, this.h) + p.a) | 0]);
			this.t0_(m.a, r);
			r.x = 10;
		}

		// minor boss (river maps put it beyond the river, in this.s)
		let minorDone = false;
		const minorId = this.c.f;
		if (minorId !== 0) {
			const r = this.s;
			if (r != null) {
				const m = this.N_(r, minorId);
				if (m === null) {
					n30.c_(1, 'no space for boss');
					return;
				}
				if (this.t != null) m.h = 1100;
				r.l = true;
				const d = this.c.E && !st.J1_(this.b.b, false) ? 113 : 0;
				this.n0_(d, m, null, false);
				this.t0_(m.a, r);
				minorDone = true;
			}
		}
		if (!minorDone && this.y) {
			const m = this.s0_(417);
			const p = m.b;
			this.t0_(m.a, get(rooms, this.m[(imul(p.b, this.h) + p.a) | 0]));
		}

		// unique monsters (pw.u: jw a = id, b = count, c = keep away from the entrance)
		const W = xs.P;
		const uniq = this.c.u;
		if (uniq != null) {
			for (let ui = 0; ui < uniq.length; ui++) {
				const u = uniq[ui];
				if (this.c.G && u.a === 621 && !vj0.i2.Y0_(73).v_()) continue;
				const id = u.a, want = u.b, spread = u.c;
				const q = this.q;
				const cx = (idiv(q.c, 2) + q.a) | 0;
				const cy = (idiv(q.d, 2) + q.b) | 0;
				let dx = (idiv(this.k, 2) - 5) | 0;
				let dy = (idiv(this.l, 2) - 5) | 0;
				for (let t = 0, placed = 0; ; t++) {
					const r = get(rooms, this.e.h_(rooms.length));
					const w = W[r.w];
					if (x30.t_(r, false) || w.l || w.m || r.s) continue;
					if (spread) {
						if (t !== 0 && irem(t, 40) === 0) {
							dx = idiv(imul(dx, 75), 100);
							dy = idiv(imul(dy, 75), 100);
						}
						// smali: too close -> next try (JADX's `continue` skips the counter)
						if ((this.a.r <= 0 || !r.o) && t <= 100
							&& iabs((cx - ((idiv(r.c, 2) + r.a) | 0)) | 0) < dx
							&& iabs((cy - ((idiv(r.d, 2) + r.b) | 0)) | 0) < dy) continue;
					}
					const m = this.N_(r, id);
					if (m !== null) {
						const g = zw.a_(this.b.b, m.a.a);
						if (g !== 0) m.g = g;
						r.s = true;
						this.t0_(m.a, r);
						if (++placed >= want) break;
					}
					if (t >= 150) {
						n30.c_(0, 'no room for unique monster');
						return;
					}
				}
			}
		}

		// quest NPC group: a room big enough for the NPC and its referrals
		const refs = quest == null ? null : quest.x_() ? quest.X : quest.Y;
		let groupRoom = null;
		if (refs != null) {
			const n = (refs.length + 1) | 0;
			const minArea = n >= 5 ? 49 : n >= 3 ? 25 : 0;
			let r = null;
			for (let t = 0; t < 100; t++) {
				const c = get(rooms, this.e.h_(rooms.length));
				if (!x30.u_(c) && !c.o && imul(c.c, c.d) >= minArea) {
					r = c;
					break;
				}
			}
			if (r === null) {
				n30.c_(0, 'no good room for npc group');
				return;
			}
			groupRoom = r;
		}

		this.M = this.c.d === 0 ? 0 : idiv(imul(rooms.length, this.c.d), 100);
		this.N = 0;
		this.K = [];
		this.L = 0;
		for (const m of zw.J) {
			if (m.t0 !== 0) {
				const lv = this.b.c.M;
				if (lv >= m.r0 && lv <= m.s0) {
					this.K.push(m);
					this.L = (this.L + m.t0) | 0;
				}
			}
		}

		// per room: theme monster (w30 a/b/c, count d, exclusive m), then random monsters from K
		const size = rooms.length;
		for (let ri = 0; ri < size; ) {
			const room = get(rooms, ri);
			ri++;
			if (room === groupRoom) continue;
			if (room.g) continue;
			const wt = room.w;
			const w = W[wt];
			if (w.l) continue;

			let id = 355, excl = false, cnt = 0, useDefault = false;
			if (wt === 0) {
				id = 0;
			} else {
				const pw = this.c;
				if (pw.F) {
					if (wt === 26 && room.f) {
						this.x0_(room.D, 362, true);
						if (this.x0_(room.E, 355, true)) room.F = (room.F + 1) | 0;
						id = 0;
					} else if (wt === 2) {
						const e = room.E;
						if (e != null) {
							this.x0_(e, 355, true);
							room.F = (room.F + 1) | 0;
							id = 0;
						} else {
							this.x0_(room.D, 362, true);   // id stays 355
						}
					} else {
						id = w.b;
						if (id !== 0) {
							excl = w.m;
							cnt = w.d;
						}
					}
				} else if (pw.E) {
					if (room.r) {
						if (!room.o) {
							id = 0;
						} else {
							let z = wt === 4;
							if (!z) z = this.e.h_(100) < 40;
							id = z ? 348 : 0;
						}
					} else if (wt === 2) {
						this.x0_(room.D, 340, false);
						id = 287;
					} else {
						id = 0;
						useDefault = true;
					}
				} else if (pw.G) {
					if (wt === 2) {
						this.x0_(room.D, 612, false);
						const r = this.e.h_(100);
						id = r < 40 ? 600 : r < 70 ? 603 : 604;
					} else {
						id = w.c;
						if (id !== 0) {
							excl = w.m;
							cnt = w.d;
						}
					}
				} else if (wt === 2) {
					if (pw.C) id = this.e.h_(100) < 40 ? 248 : 251;
					else id = this.e.h_(100) < 60 ? 216 : 215;
				} else {
					id = 0;
					useDefault = true;
				}

				if (useDefault && w.a !== 0) {
					excl = w.m;
					id = w.a;
				}
				if (id !== 0) {
					const bt = zw.c_(id);
					if (cnt > 1 || bt.B0 > 0) {
						if (cnt <= 1) cnt = this.e.i_(bt.A0, bt.B0);
						for (let k = 0; k < cnt; k++) this.N_(room, id);
						continue;
					}
					this.N_(room, id);
					if (excl || room.m) continue;
				}
			}

			if (this.L === 0) continue;
			const r = this.e.h_(100);
			const big = imul(room.c, room.d) >= 49 && id === 0;
			const b = this.c.b;
			let n;
			if (b === 0 || b === 1) n = big && r < 10 ? 3 : r < 35 ? 2 : r < 80 ? 1 : 0;
			else if (b === 2) n = big && r < 10 ? 4 : r < 20 ? 3 : r < 60 ? 2 : r < 85 ? 1 : 0;
			else if (b === 3) n = big && r < 15 ? 4 : r < 30 ? 3 : r < 75 ? 2 : r < 85 ? 1 : 0;
			else if (b === 4) n = big && r < 20 ? 4 : r < 40 ? 3 : r < 80 ? 2 : r < 90 ? 1 : 0;
			else n = big && r < 10 ? 5 : r < 20 ? 4 : r < 40 ? 3 : r < 80 ? 2 : r < 90 ? 1 : 0;
			if (room.m) n = Math.min(n, 1);
			if (n === 0) continue;

			let leader = null, followers = 0, capped = 0;
			for (let i = 0; i < n; i++) {
				let m;
				for (;;) {
					m = this.B_();
					if (m.v === 0) break;
					const cap = this.c.c;
					if (cap !== 0 && capped >= cap) continue;
					if (this.M !== 0 && this.N >= this.M) continue;
					break;
				}
				spawn: {
					// 355 prefers the room's mine carts (type 84)
					if (m.a === 355 && room.G != null && room.G.length !== 0) {
						while (room.G.length !== 0) {
							const G = room.G;
							const o = removeAt(G, this.e.h_(G.length));
							const p = o.b;
							if (this.b.k[(imul(this.h, p.b) + p.a) | 0] === o) {
								const flip = f.h_(2) === 0;
								this.b.K_(m.a, p.a, p.b, 2, flip, true);
								room.F = (room.F + 1) | 0;
								break spawn;
							}
						}
					}
					this.N_(room, m.a);
				}
				if (m.v > 0) {
					capped = (capped + 1) | 0;
					this.N = (this.N + 1) | 0;
				}
				if (m.z0 > 0) {
					followers = (followers + 1) | 0;
					if (n <= 3 && !room.m && leader === null && this.e.h_(100) < m.z0) leader = m;
				}
			}
			if (leader !== null) {
				const k = (this.e.i_(leader.A0, leader.B0) - followers) | 0;
				if (k > 0) for (let j = 0; j < k; j++) this.N_(room, leader.a);
			}
		}

		// arena (s30.n): two waves at each gate in J
		if (this.a.n) {
			const u = this.u;
			const sx = u ? 3 : 1;
			const sy = u ? 1 : 3;
			let prev = 0;
			for (let gi = 0; gi < this.J.length; gi++) {
				const p = get(this.J, gi);
				const cx = u ? p : this.I;
				const cy = u ? this.I : p;
				const first = gi < 2;
				let n = 2;
				if (!first) {
					if (prev === 2) prev = 1;
					else prev = this.e.h_(100) < 40 ? 1 : 2;
					n = prev;
				}
				for (let tries = 0, placed = 0; placed < n && tries < 15; placed++) {
					let x = 0, y = 0, found = false;
					while (tries < 15) {
						x = fg2.q_((this.e.i_(-sx, sx) + cx) | 0, 1, (this.k - 2) | 0);
						y = fg2.q_((this.e.i_(-sy, sy) + cy) | 0, 1, (this.l - 2) | 0);
						if (this.p_(x, y, false, false)) { found = true; break; }
						const o = this.b.k[(imul(this.h, y) + x) | 0];
						if (o != null && o.a.a === 84) { found = true; break; }
						tries++;
					}
					if (found) {
						let m;
						do m = this.B_();
						while (first && placed === 0 ? m.v <= 1 : m.v > 1 || m.z0 >= 100);
						this.b.K_(m.a, x, y, 2, f.h_(2) === 0, true);
					}
				}
			}
		}

		// guaranteed monsters (pw.v: at least b of id a in group 2)
		const guar = this.c.v;
		if (guar != null) {
			for (const g of guar) {
				const crit = this.b.o;
				const nCrit = crit.length;
				let count = 0;
				for (let i = 0; i < nCrit; i++) {
					const c = get(crit, i);
					if (c.a.a === g.a && c.k === 2) count = (count + 1) | 0;
				}
				if (count < g.b) {
					for (let t = 0; count < g.b; t++) {
						if (t >= 150) {
							n30.c_(0, 'no room for guaranteed monster');
							return;
						}
						const r = get(rooms, this.e.h_(rooms.length));
						if (!r.g && !r.l && r !== groupRoom) {
							const w = W[r.w];
							if (!w.l && !w.m && !(t < 50 && r.F > 3)) {
								if (this.N_(r, g.a) !== null) count = (count + 1) | 0;
							}
						}
					}
				}
			}
		}

		this.P_(quest, refs, groupRoom, bossRoom);

		// hired companions: pw.P rolls ranks, zw.L tiers give the monster kind
		if (this.c.O !== 0) {
			const ranks = [];
			for (let i = 0; i < this.c.O; i++) {
				const rk = this.c.P.b_(this.e);
				if (rk !== -1) {
					ranks.push(rk);
					if (ranks.length >= 4) break;
				}
			}
			const cnt = ranks.length;
			if (cnt !== 0) {
				const lv0 = this.b.b;
				const tLo = lv0 >= 23 ? 10 : lv0 >= 19 ? 9 : lv0 >= 15 ? 5 : 0;
				const tHi = zw.b_(lv0);
				let total = 0;
				for (let t = tLo; t <= tHi; t++) total = (total + zw.L[t].length) | 0;
				const lv = this.b.b;
				const z = lv < 23 && lv < 19 && (lv >= 15 ? lv - 15 < 3 : idiv(lv, 3) < 4 && irem(lv, 3) === 2);
				const dbl = imul(total, 2);
				let range = total;
				if (z) range = (zw.L[tHi + 1].length + dbl) | 0;
				const floor = zw.h_(lv);
				this.b.p = new Array(cnt).fill(null);
				for (let i = 0; i < cnt; ) {
					let r = this.e.h_(range);
					let m;
					if (z && r >= dbl) {
						m = zw.c_(zw.L[tHi + 1][(r - dbl) | 0]);
						if (m.l0 || m.G0) continue;
					} else {
						if (z) r = idiv(r, 2);
						m = null;
						for (let t = tLo; t <= tHi; t++) {
							const L = zw.L[t];
							if (r < L.length) {
								m = zw.c_(L[r]);
								break;
							}
							r = (r - L.length) | 0;
						}
						if (!this.c.E && floor <= 1 && (m.l0 || m.G0)) continue;
					}
					// smali: hire only if hw.b >= w0 (JADX has it inverted)
					if (this.b.b < m.w0) continue;
					this.b.p[i] = new uw(m.a, this.e.g_(), ranks[i]);
					i++;
				}
				this.b.I_();

				const q = this.q;
				const cx = (idiv(q.c, 2) + q.a) | 0;
				const cy = (idiv(q.d, 2) + q.b) | 0;
				let dx = (idiv(this.k, 2) - 5) | 0;
				let dy = (idiv(this.l, 2) - 5) | 0;
				let placed = 0, minF = 3;
				for (let t = 0; t < 150; t++) {
					const r = get(rooms, this.e.h_(rooms.length));
					const w = W[r.w];
					if (x30.t_(r, false) || w.l || w.m || r.t || r.u) continue;
					if (minF > 0 && t !== 0 && irem(t, 50) === 0) minF--;
					if (r.F < minF) continue;
					if (t !== 0 && irem(t, 40) === 0) {
						dx = idiv(imul(dx, 75), 100);
						dy = idiv(imul(dy, 75), 100);
					}
					if ((this.a.r <= 0 || !r.o) && t <= 130
						&& iabs((cx - ((idiv(r.c, 2) + r.a) | 0)) | 0) < dx
						&& iabs((cy - ((idiv(r.d, 2) + r.b) | 0)) | 0) < dy) continue;
					if (this.N_(r, (placed + 190) | 0) !== null) {
						r.u = true;
						placed++;
						if (placed >= cnt) break;
					}
				}
				if (placed < cnt) {
					const h = this.b;
					h.p = placed === 0 ? null : h.p.slice(0, placed);
				}
			}
		}
	},

	/**
	 * void P(kj0 quest, int[] refs, u30 groupRoom, u30 bossRoom): the level's NPC (quest giver, merchant,
	 * special 431/447/639), its retinue, quest referrals and wagon. Writes zw.z[0] (402 / 406) as the game does.
	 * NPC tags (qw.h): 1000/1001 merchant, 1002 quest U, 1004 431, 1005/1006 retinue, 1007 447, 1200 wagon,
	 * quest.a for quest NPCs, quest.a + 2000 for referrals.
	 */
	P_(q, refs, groupRoom, bossRoom) {
		let npc, tag, loot = 0, flag = false;
		if (q != null) {
			if (q.x_() && q.U !== 0 && q.S !== 0) {
				npc = q.U;
				tag = 1002;
				flag = true;
			} else {
				npc = q.x_() ? (q.c0 ? q.m_(this.b.b).R : q.O) : q.C;
				tag = q.a;
			}
		} else if (this.b.b === 21) {
			npc = 447;
			tag = 1007;
		} else {
			const pw = this.c;
			if (!pw.J) return;
			if (pw.F && !vj0.i2.Y0_(48).v_()) return;
			tag = 1000;
			let special = false;
			if (this.c.L) {
				const st = vj0.i2;
				let n = st.N.b.j_(115);
				if (st.Y0_(41).q_()) n = (n - 1) | 0;
				const chance = n <= 0 && st.N.f_(18) >= 20 ? 250 : 40;
				if (this.e.h_(1000) < chance) {
					npc = 431;
					tag = 1004;
					special = true;   // smali: straight to placement (JADX falls through)
				}
			}
			if (!special) {
				const pw2 = this.c;
				if (!pw2.F && !pw2.G) zw.z[0] = pw2.E && !vj0.i2.Y0_(45).x_() ? 406 : 402;
				const pw3 = this.c;
				const pool = pw3.G ? zw.B : pw3.F ? zw.A : zw.z;
				npc = pool[this.e.h_(pool.length)];
				const h = this.b;
				loot = zw.C.u_(h.w, h.b, this.c);
				if (this.c.G && loot === 123 && vj0.i2.Y0_(66).q_()) npc = 639;
				if (!this.c.K || vj0.i2.N.x < 3 || this.e.h_(100) >= 12) tag = 1001;
			}
		}
		if (npc === 0) return;

		let main = null, retinue = null, room = null;
		if (q != null && q.R && q.x_()) {
			main = this.Q_(bossRoom, npc, null);
			if (main === null) {
				n30.c_(1, 'no place for npc');
				return;
			}
			room = bossRoom;
		} else if ((q != null && q.D && !q.x_()) || flag || (q != null && q.x_() && q.c0 && q.m_(this.b.b).V)) {
			room = this.q;
			main = this.Q_(room, npc, null);
		} else if (groupRoom != null) {
			main = this.Q_(groupRoom, npc, null);
			if (main === null) {
				n30.c_(1, 'no place for npc');
				return;
			}
			room = groupRoom;
		} else {
			const e = this.q;
			const cx = (idiv(e.c, 2) + e.a) | 0;
			const cy = (idiv(e.d, 2) + e.b) | 0;
			let dx = (idiv(this.k, 2) - 5) | 0;
			let dy = (idiv(this.l, 2) - 5) | 0;
			for (let t = 0; t < 100; t++) {
				const rooms = this.n;
				const c = get(rooms, this.e.h_(rooms.length));
				if (x30.u_(c)) continue;
				if (c.F > 3) continue;
				if (npc === 416 && this.c.E && !c.r && t < 50) continue;
				if (q != null && q.E !== 0 && q.F && c.r) continue;
				if (t !== 0 && irem(t, 40) === 0) {
					dx = idiv(imul(dx, 75), 100);
					dy = idiv(imul(dy, 75), 100);
				}
				if ((this.a.r <= 0 || !c.o)
					&& iabs((cx - ((idiv(c.c, 2) + c.a) | 0)) | 0) < dx
					&& iabs((cy - ((idiv(c.d, 2) + c.b) | 0)) | 0) < dy) continue;
				const m = this.Q_(c, npc, null);
				if (m === null) continue;
				const rid = m.a.x0;
				if (rid !== 0) {
					const r = this.Q_(c, rid, m.b);
					if (r === null) {
						this.b.j_(m, false);
						continue;
					}
					retinue = r;
				}
				main = m;
				room = c;
				break;
			}
		}

		if (main === null && zw.c_(npc).x0 !== 0) {
			throw new GenStuckException(false, 'no place for npc retinue ' + zw.c_(npc).x0);
		}
		if (main === null) return;

		const pt = main.b;
		room.t = true;
		main.h = tag;
		if (loot !== 0) main.g = loot;
		if (main.a.a === 416 && room.r && room.x !== 8 && !room.f && !fg2.W_(room.w, 3, 2) && !fg2.Z_(room.v, 4, 5, 10, 11, 12)) {
			room.x = 13;
		}
		if (refs != null) {
			for (let i = 0; i < refs.length; i++) {
				const r = this.Q_(room, refs[i], refs.length <= 2 ? pt : null);
				if (r === null) {
					n30.c_(0, 'no place for referal');
					return;
				}
				r.h = (q.a + 2000) | 0;
			}
		}
		if (q != null && q.E !== 0) {
			const wagon = this.R_(room, q.E, 0, false, true, true, null, false, true);
			if (wagon === null) {
				n30.c_(0, 'no place for wagon');
				return;
			}
			wagon.h = 1200;
		}
		const rid = main.a.x0;
		if (rid !== 0) {
			let r = retinue;
			if (r === null) {
				r = this.Q_(room, rid, pt);
				if (r === null) throw new GenStuckException(false, 'no place for npc retinue ' + main.a.x0);
			}
			r.h = flag ? 1006 : 1005;
		}
	},

	/** void L(): pw.s times, a random-pool monster carries key item 167 and a monster door (29) closes a dead end. */
	L_() {
		if (this.c.s > 0) {
			outer: for (let i = 0; i < this.c.s; i++) {
				const rooms = this.n;
				let pick = null;
				for (let t = 0; t < 250; t++) {
					const crit = this.b.o;
					const c = get(crit, this.e.h_(crit.length));
					if (c === this.b.f || c.k !== 2 || c.a.l0 || c.w_()) continue;
					const ty = c.a;
					if (ty.M0) continue;
					if (t < 150 && ty.v === 0) continue;
					const loot = c.b_();
					if (loot !== 0) {
						const D = zw.D;
						let ok = false;
						for (let j = 0; j < D.length; j++) if (loot === D[j]) { ok = true; break; }
						if (!ok) continue;
					}
					const p = c.b;
					const ri = this.m[(imul(p.b, this.h) + p.a) | 0];
					if (ri === -1) continue;
					const r = get(rooms, ri);
					if (r.g || r.h || r.n || r.o) continue;
					if ((r.j || r.w === 11) && r.c_(true)) continue;
					pick = c;
					break;
				}
				if (pick === null) return;

				for (let t = 0; t < 200; t++) {
					const r = get(rooms, this.e.h_(rooms.length));
					if (r.n) continue;
					if (!r.j && r.w !== 11) continue;
					if (!r.c_(false)) continue;
					const idx = (imul(r.C, this.h) + r.B) | 0;
					if (this.g[idx].a !== 3) {
						wg2.h_('invalid last door');
						return;
					}
					const o = this.b.k[idx];
					if (o != null) {
						if (fg2.Z_(o.a.a, 29, 33, 35, 60, 53)) continue;
						this.b.j_(o, false);
					}
					this.b.M_(29, r.B, r.C, false);
					this.g[idx].b = 1;
					pick.g = 167;
					continue outer;
				}
			}
		}
	},

	/** void e(): room floor style x on plain floor, then scattered floor detail (cosmetic stream). */
	e_() {
		const rooms = this.n;
		const n = rooms.length;
		for (let i = 0; i < n; ) {
			const r = get(rooms, i);
			i++;
			if (r.x === 8) continue;
			if (r.x !== 0) {
				for (let dy = 0; dy < r.d; dy++) {
					for (let dx = 0; dx < r.c; dx++) {
						const idx = (imul((r.b + dy) | 0, this.h) + r.a + dx) | 0;
						if (this.g[idx].h_() && this.m[idx] === r.e) this.g[idx].b = b8(r.x);
					}
				}
			}
			const x = r.x;
			if (x === 14) {
				this.a_(r, 14, 16, 1);
				this.a_(r, 14, 15, 1);
			} else if (x === 20) {
				this.a_(r, 20, 21, 1);
			} else if (r.w === 17 && x === 4 && !r.r) {
				const pw = this.c;
				const F = pw.F;
				let to = 16;
				if (F) to = 17;
				else if (!pw.E) to = 6;
				this.a_(r, 4, to, F ? 5 : 1);
			} else if (x === 0) {
				this.a_(r, 0, 6, 1);
			}
		}
	},

	/** void a(u30 room, byte from, byte to, float density): (50..99) * area * 0.0009 * density random
	 *  cells of floor style `from` in the room become `to` (cosmetic stream f). */
	a_(r, from, to, density) {
		const f = this.f;
		const area = imul(r.c, r.d);
		const n = f2i(f32(f32(f32(imul((f.h_(50) + 50) | 0, area)) * f32(9.0e-4)) * f32(density)));
		for (let i = 0; i < n; i++) {
			const dx = f.h_(r.c);
			const dy = f.h_(r.d);
			const idx = (imul((r.b + dy) | 0, this.h) + r.a + dx) | 0;
			if (this.g[idx].r_(1, from) && this.m[idx] === r.e) this.g[idx].b = to;
		}
	},
});
