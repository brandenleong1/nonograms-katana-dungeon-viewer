// c30 turn loop (S0) and turn bookkeeping: deaths, boss-threshold dialogs, aggro scan, joining, combat
// entry (initiative) / exit, the hero's turn and the dispatch to the monster AI (the AI tail of S0).
// Ported from Vineflower c30.java (S0 ~6404); control flow checked against smali where the decompiles
// disagree (JADX garbles the k() loop, the hero-turn D scan and the AI tail). See PORTING.md.
//
// Also here: the dialog callbacks t20 / v20 (Runnables handed to DungameView.T) and c30.m (hint toast,
// only called from S0), plus the static helpers zw.o / zw.p and kj0.B / vj0.g2 / nw.b that the turn,
// AI and damage code need.
import { install, extend, c30 } from './c30.js';
import { register, classes } from '../gen/registry.js';
import { zw, vj0 } from '../gen/statics.js';
import { fg2, ol, UApp } from '../gen/model.js';
import { imul, idiv, irem, iabs, b8, get, removeAt, sortList } from '../gen/jrt.js';

const MAX = 2147483647;

// ---------------------------------------------------------------------------------------------
// Shared helpers (ai.js / damage.js import these).

/** Call a DungameView method if the view provides it. Everything but T (dialog) and S (toast) is UI-only. */
export function ui(c, m, ...args) {
	const v = c.e;
	const f = v != null ? v[m] : undefined;
	return typeof f === 'function' ? f.apply(v, args) : undefined;
}

/** Context.getString(id): the oracle's Context stub returns "#<id>". */
export function str(c, id) {
	const d = c.d;
	if (d != null) {
		if (typeof d.getString_ === 'function') return d.getString_(id);
		if (typeof d.getString === 'function') return d.getString(id);
	}
	return '#' + id;
}

/** static boolean zw.o(int, int): factions 1 and 2 are hostile to each other */
if (!zw.o_) {
	zw.o_ = function o_(a, b) {
		if (a === b) return false;
		let lo = a, hi = b;
		if (a > b) { hi = a; lo = b; }
		return lo === 1 && hi === 2;
	};
}

/** static boolean zw.p(int r, int cut, Point, Point): Chebyshev distance <= r, corners cut by `cut` */
if (!zw.p_) {
	zw.p_ = function p_(r, cut, p, q) {
		const dx = iabs((p.a - q.a) | 0);
		const dy = iabs((p.b - q.b) | 0);
		return dx <= r && dy <= r && (cut <= 0 || ((dx + dy) | 0) < ((imul(r, 2) + 1 - cut) | 0));
	};
}

// Model methods S0 / e need that js/gen/model lacks (vj0.g2 comes from actions.js / move.js).
// Guarded: other parts may add the same helper first.
const addMissing = (cls, methods) => {
	const add = {};
	for (const [k, fn] of Object.entries(methods)) if (!(k in cls.prototype)) add[k] = fn;
	extend(cls, add);
};

addMissing(classes.kj0, {
	/** void B(int): set step bit i in k0 */
	B_(i) { this.k0 = b8((1 << i) | this.k0); },
});

addMissing(classes.nw, {
	/** boolean b(uw): companion protected from dying (skill h[15] above its rank) */
	b_(u) { return this.h[15] > u.d; },
});

// ---------------------------------------------------------------------------------------------
// Dialog callbacks (java.lang.Runnable). DungameView.T stores them; the settle loop runs them.

/** t20(c30, aw, mode): 0 = boss summons its minions (from R0), 1 = boss at its HP threshold leaves */
export class t20 {
	constructor(c, b, a) {
		this.a = a;
		this.c = c;
		this.b = b;
	}

	run_() {
		const c = this.c;
		if (this.a === 0) {
			if (c.a != null) {
				c.Q0_();
				c.E0_(600);
				c.M0_(this.b, c.a.f, 2, 1102, true);
			}
		} else if (c.a != null) {
			c.Q0_();
			const b = this.b;
			if (!c.a.w_(b)) {
				c.i0_(b, true);
				c.K0_(b, null);
				c.z_(b);
				c.E0_(350);
			}
		}
	}

	run() { this.run_(); }
}

/** v20(c30, boolean, aw) (case 0): after a monster's speech, optionally remove it */
export class v20 {
	constructor(c, z, b) {
		this.a = 0;
		this.d = c;
		this.b = z;
		this.c = b;
	}

	run_() {
		const b = this.c;
		const c = this.d;
		if (c.a != null) {
			c.Q0_();
			if (!this.b) c.E0_(350);
			else if (!c.a.w_(b)) {
				c.K0_(b, null);
				c.z_(b);
				c.E0_(350);
			}
		}
	}

	run() { this.run_(); }
}

if (!classes.t20) register(t20);
if (!classes.v20) register(v20);

const byO = new ol(1); // aw by initiative o, descending

// ---------------------------------------------------------------------------------------------

install({
	/** void S0(): one step of the dungeon/combat loop */
	S0_() {
		if (this.w) return;
		let lv = this.a;
		if (lv.F != null) {
			this.R0_();
			return;
		}
		this.T = null;
		this.U = null;

		// a critter marked as dying last step: remove it
		let r = this.R;
		if (r != null) {
			if (r.k === 2) this.i0_(r, true);
			const special = c30.h0_(this.R);
			r = this.R;
			if (special) {
				this.g_(r);
			} else {
				this.z_(r);
				this.E0_(this.R === this.a.f ? 1000 : 60);
			}
			this.R = null;
			return;
		}

		if (lv.f.u_()) {
			lv = this.a;
			if (!lv.w_(lv.f)) {
				this.R = this.a.f;
				this.S = false;
				this.E0_(350);
			} else {
				this.K_();
			}
			return;
		}

		{
			const list = this.a.o;
			const n = list.length;
			for (let i = 0; i < n;) {
				const c = get(list, i);
				i++;
				if (c !== this.a.f && c.u_()) {
					this.R = c;
					this.S = c30.h0_(c);
					this.E0_(350);
					return;
				}
			}
		}

		// boss at its HP threshold: speech, then t20(.., 1) removes it
		{
			const list = this.a.o;
			const n = list.length;
			for (let i = 0; i < n;) {
				const c = get(list, i);
				i++;
				const t = c.a;
				if (t.K0 > 0 && c.k === 2 && !c.u_() && c.j.v_() <= t.K0) {
					this.z.length = 0;
					const sid = t.K_();
					const text = sid === 0 ? '...' : str(this, sid);
					const loot = c.b_();
					const icon = loot === 0 ? 0 : vj0.Z1.get(loot).u;
					this.E0_(500);
					this.g0 = true;
					this.e.T_(c.a, text, icon, false, null, false, null, null, new t20(this, c, 1));
					return;
				}
			}
		}

		// pending bump (tap on an object next to the hero)
		{
			const o = this.O;
			lv = this.a;
			if (o != null) {
				this.m0_(lv.f, 0, 0, 0, false, o, this.P);
				ui(this, 'E_', true, true);
				this.O = null;
				return;
			}
		}

		// aggro scan: every visible critter picks the nearest reachable enemy (box 7, 12 in combat)
		let found = false;
		// Aggro candidates, once per scan: critters standing on their own hw.k cell on a revealed cell, by cell index.
		// Walking these (filtered to each box) visits the same cells in the same row-major order as scanning the box.
		const CAND = [];
		{
			const g = this.g, K = this.a.k, Jv = this.j, L = this.a.o;
			for (let q = 0; q < L.length; q++) {
				const m = L[q];
				const ix = (imul(m.b.b, g) + m.b.a) | 0;
				if (K[ix] === m && Jv[ix] > 0) CAND.push(ix);
			}
			CAND.sort((u, v) => u - v);
		}
		{
			const list = lv.o;
			const n = list.length;
			for (let i = 0; i < n;) {
				const c = get(list, i);
				i++;
				let lv2 = this.a;
				if (c === lv2.f) continue;
				let best = null;
				const p = c.b;
				if (this.j[(imul(p.b, this.g) + p.a) | 0] > 0) {
					const blind = c.s > 0;
					const held = c.t > 0;
					const rad = lv2.C && !held ? 12 : 7;
					const x1 = Math.min((p.a + rad) | 0, (this.g - 1) | 0);
					const y1 = Math.min((p.b + rad) | 0, (this.h - 1) | 0);
					let bestLen = MAX;
					let bestHp = MAX;
					const x0 = Math.max((p.a - rad) | 0, 0), y0 = Math.max((p.b - rad) | 0, 0);
					for (let ci = 0; ci < CAND.length; ci++) {
						{
							const idx = CAND[ci];
							const y = (idx / this.g) | 0, x = idx - y * this.g;
							if (y < y0 || y > y1 || x < x0 || x > x1) continue;
							if (this.j[idx] <= 0) continue;
							const o = this.a.k[idx];
							if (o == null || o === c || !o.e_() || o.i_(this.a.e) > 0) continue;
							if (c.k === 1 && o.s_(2048)) continue;
							if (!zw.o_(c.k, o.k)) {
								if (!blind || !fg2.W_(o.k, 1, 2)) continue;
							}
							lv2 = this.a;
							const len = lv2.t_(c.b, o.b, null, lv2.C && !held ? 20 : 13, 20, blind ? -1 : c.k, true, 0);
							if (len !== 0) {
								const hp = blind ? irem(o.j.v_(), 7) : o.j.v_();
								if (bestLen > len || (bestLen === len && bestHp > hp)) {
									best = o;
									bestLen = len;
									bestHp = hp;
								}
							}
						}
					}
				}
				c.l = best;
				c.m = best != null;
				if (best != null) {
					this.v_(c);
					const l = c.l;
					if (l !== this.a.f) this.v_(l);
				} else {
					if (!c.a.M0 || c.k !== 1) continue;
					const q = c.b;
					if (this.j[(imul(q.b, this.g) + q.a) | 0] <= 0) continue;
					lv2 = this.a;
					if (!zw.p_(lv2.C ? 12 : 7, 0, q, lv2.f.b)) continue;
					this.v_(c);
				}
				found = true;
			}
		}

		// in combat: an idle critter joins an engaged ally within 5 and takes over its target
		let fight = found;
		lv = this.a;
		if (lv.C) {
			const list = lv.o;
			const n = list.length;
			for (let i = 0; i < n;) {
				const c = get(list, i);
				i++;
				const lv2 = this.a;
				const hero = lv2.f;
				if (c === hero) continue;
				if (c.l != null) continue;
				const p = c.b;
				let pick = null;
				if (c !== hero && lv2.D.length !== 0 && this.j[(imul(p.b, this.g) + p.a) | 0] > 0 && c.s <= 0 && c.t <= 0) {
					const D = this.a.D;
					const nd = D.length;
					let bestLen = MAX;
					let bestHp = MAX;
					for (let k = 0; k < nd;) {
						const a2 = get(D, k);
						k++;
						if (a2 === c) continue;
						const q = a2.b;
						if (a2.k === c.k && a2.l != null && a2.m && a2.t <= 0
							&& iabs((q.a - p.a) | 0) <= 5 && iabs((q.b - p.b) | 0) <= 5) {
							const tgt = a2.l;
							const len = this.a.t_(p, tgt.b, null, 26, 26, c.k, true, 0);
							if (len !== 0 && (bestLen > len || (bestLen === len && bestHp > tgt.j.v_()))) {
								bestHp = tgt.j.v_();
								bestLen = len;
								pick = tgt;
							}
						}
					}
				}
				c.l = pick;
				if (pick != null) {
					this.v_(c);
					fight = true;
				}
			}
		}

		lv = this.a;
		const inCombat = lv.C;
		const a1 = this.a1;
		if (inCombat !== fight) {
			lv.C = fight;
			if (fight) {
				// combat entry: initiative o = h(30) + (spd + n0 + (64 ? 3 : 0)) * 10, sorted descending
				this.z.length = 0;
				const lv3 = this.a;
				lv3.D.push(lv3.f);
				const D = this.a.D;
				const nd = D.length;
				for (let k = 0; k < nd;) {
					const c = get(D, k);
					k++;
					c.B_(0);
					const bonus = c.s_(64) ? 3 : 0;
					const spd = c.r_();
					const n0 = c.a.n0;
					c.o = (this.a.x.h_(30) + imul((spd + n0 + bonus) | 0, 10)) | 0;
				}
				sortList(this.a.D, (x, y) => byO.compare_(x, y));
				const D2 = this.a.D;
				const nd2 = D2.length;
				for (let k = 0; k < nd2;) {
					const c = get(D2, k);
					k++;
					c.y_(64);
				}
				c30.o0_(get(this.a.D, 0));
				this.a.E = false;
				this.E0_(250);
			} else {
				// combat exit
				this.z.length = 0;
				this.a.D.length = 0;
				const list = this.a.o;
				const n = list.length;
				for (let k = 0; k < n; k++) {
					const c = get(list, k);
					c.l = null;
					if (c.s_(128)) this.K0_(c, null);
					c.y_(1231);
					c.r = 0;
					c.q = 0;
					c.s = 0;
					c.t = 0;
					if (c.u > 0 && c !== this.a.f) this.e_(23, null, c, null, null, 100);
				}
				const lv4 = this.a;
				const hero = lv4.f;
				if (hero.u < 0) hero.u = 0;
				const spider = lv4.q;
				if (spider != null && !spider.u_()) {
					const keep = this.a.s;
					this.K0_(this.a.q, null);
					this.a.r = this.a.q.j.v_();
					this.a.j_(this.a.q, true);
					const lv5 = this.a;
					lv5.q = null;
					if (keep) lv5.s = true;
					this.U_(168);
					ui(this, 'H_');
					ui(this, 'f0_', 168);
				}
				const comp = this.a.u;
				if (comp != null && !comp.u_()) {
					this.K0_(this.a.u, null);
					this.a.j_(this.a.u, true);
					const lv6 = this.a;
					lv6.u = null;
					lv6.t = null;
				}
				for (let k = 0; k < 3; k++) {
					const slot = this.a.v[k];
					if (slot != null) {
						const s = slot.a;
						if (s != null && !s.u_()) {
							slot.b = slot.a.j.v_();
							const s2 = slot.a;
							slot.e = s2.w;
							this.K0_(s2, null);
							this.a.j_(slot.a, true);
							slot.a = null;
							ui(this, 'f0_', (k + 225) | 0);
						}
					}
				}
				ui(this, 'V_');

				// quest NPC / boss that appears next to the hero after a fight on this dungeon type
				const st = vj0.i2;
				const type = this.a.b;
				const ks = st.k;
				let q = null;
				for (let k = 0; k < ks.length; k++) {
					const kq = ks[k];
					if (kq.s_(1, type) || kq.t_(1, type, false)) {
						q = kq;
						break;
					}
				}
				if (q != null) {
					const qtag = q.a;
					let id = 0;
					let tag = 0;
					if (q.G !== 0 && !q.v_()) {
						id = q.C;
						tag = q.G;
					} else if (q.S !== 0 && q.x_() && (q.T === 0 || !this.a.f.D.k_(q.T))) {
						id = q.O;
						tag = q.S;
					}
					if (tag !== 0) {
						const crit = this.a.o;
						const nc = crit.length;
						let wagon = null;
						let haveBoss = false;
						let haveNpc = false;
						for (let k = 0; k < nc;) {
							const c = get(crit, k);
							k++;
							const t = c.a;
							if (t.l0 && c.h === tag) {
								haveBoss = true;
							} else {
								const tid = t.a;
								if (tid === id && c.h === qtag) haveNpc = true;
								else {
									const u = q.U;
									if (u !== 0 && tid === u && c.h === 1002) wagon = c;
								}
							}
						}
						if (!haveBoss && !haveNpc) {
							if (wagon != null) {
								this.a.j_(wagon, true);
								const p = this.a.p_(1006);
								if (p != null) this.a.j_(p, true);
								const e = q.E;
								if (e !== 0) {
									const o = this.a.r_(e, 1200);
									if (o != null) this.a.j_(o, true);
								}
							}
							if (this.Q_(3, -1, this.a.f.b, a1)) {
								const c = this.a.K_(id, a1.a, a1.b, 0, false, false);
								this.T = c;
								this.I_(c, this.a.f.b);
								c.h = qtag;
								this.K0_(c, null);
								this.E0_(350);
							}
						}
					}
				}
				// autosave (vj0.l2 every 120 s of wall time): not modelled (x0 is never reached headless)
			}
			this.j_();
			ui(this, 'k0_');
			ui(this, 'e0_', false);
			this.f0 = false;
			return;
		}

		// level cleared out of combat: show the exit button once
		if (!inCombat && !this.v) {
			if (lv.i_() === 0) this.v = true;
			if (this.v) {
				ui(this, 'e0_', true);
				return;
			}
		}

		let first = true; // no monster acted yet in this call (hero waits for input only then)
		for (;;) {
			while (this.k_());
			const heroTurn = this.g0_();
			lv = this.a;
			if (heroTurn) {
				if (lv.C) {
					// sealed monsters in the fight: speech (J), companion hint, or MP hint (m), once each
					const D = lv.D;
					const nd = D.length;
					let speech = null;
					let comp = null;
					let other = null;
					for (let k = 0; k < nd;) {
						const c = get(D, k);
						k++;
						const lv2 = this.a;
						if (c === lv2.f) continue;
						if (c.i_(lv2.e) > 0 && !c.d) {
							const t = c.a;
							if (t.K_() !== 0 && !t.M0 && t.K0 === 0) {
								if (speech != null) continue;
								speech = c;
							}
							c.d = true;
							if (c.w_()) {
								other = c;
								comp = c;
							} else {
								other = c;
							}
						}
					}
					if (speech != null) {
						this.J_(speech, false);
						this.z.length = 0;
						return;
					}
					if (comp != null) {
						// vj0.i2.N.g() < 3 -> PageDungeon.B(...): tutorial page, no-op headless
						this.z.length = 0;
						return;
					}
					if (other != null) {
						this.m_(other);
						this.z.length = 0;
						return;
					}
				}
				if (this.z.length === 0) {
					this.f0 = first;
					return;
				}
				if (this.a.C) {
					const t = this.a0;
					if (t != null) {
						const r2 = this.o_(t);
						if (r2 === 2) {
							this.f_(2, this.a.f, this.a0, null, false);
							this.a0 = null;
							return;
						}
						if (r2 <= 0) this.a0 = null;
					}
				}
				if (this.n0_(this.a.f) === 1 && this.v) {
					// DungameView.b(true): level-complete prompt (needs vj0.i2.K0 and the complete button)
					const view = this.e;
					const c = view != null && view.u != null ? view.u : this;
					if (c.v) {
						const lv2 = c.a;
						if (!lv2.C && vj0.i2.K0 != null && view != null && view.v0 != null && !lv2.c.H && !view.x0) {
							ui(this, 'b_', true);
							return;
						}
						return;
					}
				}
				return;
			}

			// monster turn: D[0] acts
			const me = get(lv.D, 0);
			const t = me.a;
			const pos = me.b;
			if (t.M0) {
				if (t.a === 646) {
					const kq = vj0.i2.Y0_(62);
					if (kq.v_()) kq.B_(2);
				}
				this.J_(me, true);
				return;
			}

			if (me.l == null) {
				if (me.k === 1 && this.a0_(me, 16) && !me.s_(2) && me.s <= 0) {
					this.h_(me);
					return;
				}
				if (this.x_(me)) return;
				this.p0_();
			} else {
				if (me.x > 0 && t.C0 !== 0 && c30.c0_(me) && me.s <= 0) {
					this.M0_(me, me.l, me.k, 0, false);
					if (this.U != null) {
						this.u_(me, 3, true, 350);
						return;
					}
				}
				if (this.a0_(me, 16) && !me.s_(2) && me.s <= 0) {
					this.h_(me);
					return;
				}
				if (this.a0_(me, 32)) {
					const l = me.l;
					if (l.r <= 0) {
						if (zw.p_(me.t > 0 ? 1 : 4, 0, pos, l.b) && me.s <= 0 && this.y_(me)) {
							this.I_(me, me.l.b);
							this.K0_(me, null);
							return;
						}
					}
				}
				if (pos.c_(me.l.b)) {
					this.f_(1, me, me.l, null, false);
					return;
				}
				if (this.x_(me)) return;
				if (me.w > 0 && me.t <= 0) {
					const tt = me.a;
					if (tt.p0 === 191) {
						if (me.s <= 0) {
							const l = me.l;
							if (l === this.a.f && l.q === 0 && pos.d_(l.b) > 2 && this.a.O_(3, 2, pos, me.l.b)) {
								this.f_(11, me, me.l, null, false);
								return;
							}
							// otherwise the nearest free enemy within 3 (not next to one of its own foes) in LOS
							const x1 = Math.min((pos.a + 3) | 0, (this.g - 1) | 0);
							const y1 = Math.min((pos.b + 3) | 0, (this.h - 1) | 0);
							let pick = null;
							let bestD = MAX;
							for (let y = Math.max((pos.b - 3) | 0, 0); y <= y1; y++) {
								for (let x = Math.max((pos.a - 3) | 0, 0); x <= x1; x++) {
									const idx = (imul(this.g, y) + x) | 0;
									if (this.j[idx] <= 0) continue;
									const o = this.a.k[idx];
									if (o == null || o === me || !o.e_() || o.i_(this.a.e) > 0) continue;
									const cp = o.b;
									if (o === me.l || !zw.o_(me.k, o.k) || o.q > 0 || o.s > 0 || o.t > 0 || o.w > 0) continue;
									let engaged = false;
									for (let d = 0; d < 4; d++) {
										a1.a = cp.a;
										a1.b = cp.b;
										a1.b_(d);
										const ax = a1.a;
										if (ax < 0) continue;
										const ay = a1.b;
										if (ay < 0 || ax >= this.g || ay >= this.h) continue;
										const i2 = (imul(ay, this.g) + ax) | 0;
										if (this.j[i2] > 0) {
											const o2 = this.a.k[i2];
											if (o2 != null && o2.e_() && zw.o_(o.k, o2.k)) {
												engaged = true;
												break;
											}
										}
									}
									if (engaged) continue;
									if (this.a.O_(3, 2, pos, cp)) {
										const dd = pos.d_(cp);
										if (bestD > dd) {
											bestD = dd;
											pick = o;
										}
									}
								}
							}
							if (pick != null) {
								this.f_(11, me, pick, null, false);
								return;
							}
						}
					} else {
						let range = 4;
						if (tt.a === 198) {
							const nt = this.a.t;
							if (nt != null) range = (nt.h[3] + 3) | 0;
						}
						if (this.a.O_(range, 1, pos, me.l.b)) {
							this.f_(7, me, me.l, null, false);
							return;
						}
					}
				}
				if (me.a.O_(4) && me.t <= 0 && pos.d_(me.l.b) > 3 && me.l.i_(this.a.e) <= 0) {
					const l = me.l;
					if (l.q === 0 && !l.a.l0 && this.a.O_(7, 2, pos, l.b) && this.B_(me, me.l, null)) return;
				}
				if (me.q > 0 || (me.t > 0 && this.a.E)) {
					this.p0_();
					this.E0_(200);
					return;
				}
				if (me.a.O_(2) && me.t <= 0 && pos.d_(me.l.b) > 3 && this.a.O_(5, 1, pos, me.l.b)
					&& this.P_(me.l.b, null, -1, a1)) {
					const dx = (a1.a - pos.a) | 0;
					const dy = (a1.b - pos.b) | 0;
					const from = new classes.Util$Point(pos);
					if (this.l0_(me, dx, dy, 3, false) === 1) {
						this.z.length = 0;
						this.K0_(me, from);
						this.K0_(me, null);
						return;
					}
				}
				if (this.z.length === 0) {
					this.a.t_(pos, me.l.b, this.z, 20, 20, me.s > 0 ? -1 : me.k, true, 0);
				}
				if (this.z.length !== 0) {
					if (this.p_(me) || this.n0_(me) !== 0) return;
					if (me.a.O_(1) && me.t <= 0 && zw.p_(2, 0, pos, me.l.b) && this.P_(me.l.b, null, -1, a1)) {
						const dx = (a1.a - pos.a) | 0;
						const dy = (a1.b - pos.b) | 0;
						const from = new classes.Util$Point(pos);
						if (this.l0_(me, dx, dy, 3, false) === 1) {
							this.z.length = 0;
							this.K0_(me, from);
							this.K0_(me, null);
							return;
						}
					}
				}
				this.p0_();
			}
			first = false;
		}
	},

	/** void p0(): end the current turn: rotate D, tick status counters, give the next actor its AP */
	p0_() {
		const lv = this.a;
		if (lv.C && lv.D.length !== 0) {
			this.z.length = 0;
			const c = removeAt(this.a.D, 0);
			this.a.D.push(c);
			if (c.r > 0) c.r = (c.r - 1) | 0;
			if (c.q > 0) {
				const q = (c.q - 1) | 0;
				c.q = q;
				if (q === 0 && c === this.a.f) ui(this, 'V_');
			}
			if (c.s > 0) c.s = (c.s - 1) | 0;
			if (c.t > 0) c.t = (c.t - 1) | 0;
			if (c === this.a.f) {
				this.j_();
				this.h0 = 0;
			}
			const nx = get(this.a.D, 0);
			c30.o0_(nx);
			nx.y_(8);
			const lv2 = this.a;
			lv2.E = false;
			if (nx === lv2.f) {
				vj0.i2.g2_(true);
				return;
			}
			if (nx.a.O_(64) && nx.f && !nx.s_(8192)) {
				if (nx.s_(4096)) {
					nx.y_(4096);
					nx.z_(8192);
					return;
				}
				nx.z_(4096);
			}
		}
	},

	/** boolean k(): in combat and the actor has no AP left -> p0(), true */
	k_() {
		const lv = this.a;
		if (lv.C && lv.D.length !== 0 && get(this.a.D, 0).n.v_() <= 0) {
			this.p0_();
			return true;
		}
		return false;
	},

	/** void v(aw): add a critter to the turn order (fast joiners in combat may cut in at random) */
	v_(c) {
		if (!this.a.D.includes(c)) {
			c.B_(0);
			if (this.a.C) c.y_(64);
			if (this.a.C && c.r_() >= 6) {
				const n = this.a.D.length;
				let i = 1;
				if (n > 1) {
					if (this.a.x.h_(100) >= 50) {
						const lv = this.a;
						i = (1 + lv.x.h_(lv.D.length)) | 0;
					}
					this.a.D.splice(i, 0, c);
					return;
				}
			}
			this.a.D.push(c);
		}
	},

	/** boolean g0(): the hero may act (out of combat, or D[0] is the hero) */
	g0_() {
		const lv = this.a;
		return !lv.C || get(lv.D, 0) === this.a.f;
	},

	/** void E0(int): start an animation pause */
	E0_(v) {
		this.c0 = v;
		this.d0 = v;
		this.e0 = 0;
		this.f0 = false;
	},

	/** void K(): dungeon over (the page's result dialogs only run with vj0.i2.K0 set) */
	K_() {
		if (!this.w) {
			// vj0.i2.K0 != null: DungameView/kl0 end-of-dungeon UI (dismiss dialog, result page). Not modelled.
			this.w = true;
		}
	},

	/** void i0(aw, boolean): kill bookkeeping (j0), then the bestiary counter for its type */
	i0_(c, z) {
		let inc = 1;
		this.j0_(c, true, z);
		if (this.b != null) {
			let t = c.a;
			const alt = t.j0;
			if (alt !== 0) t = zw.c_(alt);
			for (let i = 0; ; i++) {
				const ids = this.b;
				if (i >= ids.length) break;
				if (ids[i] === t.a) {
					const cnt = this.c;
					const v = cnt[i];
					if (v < 20) {
						if (t.l0) inc = 2;
						const nv = b8(v + inc);
						cnt[i] = nv;
						if (nv > 20) cnt[i] = 20;
						if (cnt[i] === 20) {
							this.E0 = 1000;
							this.F0 = false;
							return;
						}
					}
					break;
				}
			}
		}
	},

	/** void z(aw): remove a critter (ends its turn if it is acting) */
	z_(c) {
		const lv = this.a;
		if (lv.C && lv.D.length !== 0 && c === get(this.a.D, 0)) this.p0_();
		const id = c.a.a;
		this.a.j_(c, true);
		if (id >= 195 && id < 198) {
			get(this.a.e.l, (id - 195) | 0).c_();
			ui(this, 'G_', (id + 30) | 0);
		}
	},

	/** void J(aw, boolean): monster speech (dialog, then v20), or just remove it when z */
	J_(c, z) {
		const sid = c.a.K_();
		if (sid !== 0) {
			this.E0_(500);
			this.g0 = true;
			this.e.T_(c.a, str(this, sid), 0, false, null, false, null, null, new v20(this, z, c));
		} else if (z) {
			this.K0_(c, null);
			this.z_(c);
			this.E0_(350);
		}
	},

	/** boolean T(aw, int): once-per-level ability still available (flag 32768 / summon slot flags) */
	T_(c, m) {
		if (c === this.a.f) return !c.s_(32768);
		if (c.v_() && fg2.X_(m, 16, 32, 2048)) {
			const g = this.a.v[(c.a.a - 195) | 0];
			if (m === 16 ? g.f : m === 32 ? g.g : g.h) return false;
		} else if (m === 2048) {
			return !c.s_(32768);
		}
		return true;
	},

	/** void t(aw, int): mark the once-per-level ability used */
	t_(c, m) {
		if (c === this.a.f) {
			c.z_(32768);
		} else if (c.v_() && fg2.X_(m, 16, 32, 2048)) {
			const g = this.a.v[(c.a.a - 195) | 0];
			if (m === 16) g.f = true;
			else if (m === 32) g.g = true;
			else g.h = true;
		} else if (m === 2048) {
			c.z_(32768);
		}
	},

	/** boolean a0(aw, int): type has ability m and it is still available */
	a0_(c, m) {
		return c.a.O_(m) && this.T_(c, m);
	},

	/** void D0(aw): blind for 4 turns (the actor's pending flag E is reset) */
	D0_(c) {
		const lv = this.a;
		if (lv.C && lv.D.length !== 0 && get(this.a.D, 0) === c && c.t <= 0) this.a.E = false;
		c.t = 4;
		this.y0_(2131231427, 0, c);
	},

	/** void m(qw): MP hint toast for a sealed critter / object (UApp hint counter; 0 headless) */
	m_(o) {
		if (o.e_() || fg2.c0_(o.a.a, 27, 39, 30, 15, 55, 110, 21, 37, 94)) {
			let key;
			if (o.e_()) key = 'HINT_MP_BOSS';
			else if (fg2.W_(o.a.a, 27, 39)) key = 'HINT_MP_DOOR';
			else {
				const id = o.a.a;
				if (id === 30) key = 'HINT_MP_TRAP';
				else if (fg2.X_(id, 15, 55, 110)) key = 'HINT_MP_PAGE';
				else key = 'HINT_MP_CHEST';
			}
			const pref = UApp.X0;
			const shown = pref != null && typeof pref.v_ === 'function' ? pref.v_(0, key) : 0;
			if (shown < 3) {
				if (pref != null && typeof pref.g0_ === 'function') pref.g0_((shown + 1) | 0, key);
				let sid;
				if (o.e_()) sid = 2131690579;
				else {
					const id = o.a.a;
					if (id === 30) sid = 2131690581;
					else if (fg2.X_(id, 15, 55, 110)) sid = 2131689593;
					else sid = 2131690580;
				}
				const text = str(this, sid) + '\n\n' + str(this, 2131690923);
				this.e.S_(2131231634, text);
			}
		}
	},
}, {
	/** static boolean c0(aw): at or below half HP */
	c0_(c) {
		return c.j.v_() <= idiv(c.q_(), 2);
	},

	/** static boolean h0(aw): type 199 once quest line 7 step 11 is done (killed through g) */
	h0_(c) {
		return c.a.a === 199 && vj0.i2.o[7].h0_(11);
	},

	/** static void o0(aw): new turn AP = min(AP + spd, spd + 1) (+1 spd for bw flag 8192) */
	o0_(c) {
		const spd = c.r_();
		const ap = c.n;
		let v = spd;
		if (c.a.O_(8192)) v = (spd + 1) | 0;
		c.B_(Math.min((ap.v_() + v) | 0, (v + 1) | 0));
		if (ap.v_() > 0) c.y_(1024);
	},
});
