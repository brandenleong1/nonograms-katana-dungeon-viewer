// c30 damage resolution e (roll, crit, defence, kill guards, poison proc and tick, ambrosia auto-revive),
// the death transform q, and the toolbar availability test e0. Ported from Vineflower c30.java (e ~7877,
// q ~10640, e0 ~8261); e checked against smali (JADX garbles it). See PORTING.md.
import { install, c30 } from './c30.js';
import { ui } from './turn.js';
import { zw, vj0 } from '../gen/statics.js';
import { fg2 } from '../gen/model.js';
import { imul, idiv } from '../gen/jrt.js';

install({
	/**
	 * int e(int type, aw src, aw dst, yv skill, bj0 item, int n): deal damage to dst, return the damage dealt.
	 * type 17: fixed 3..5 (never kills); 22: 10 (never kills); 23: poison tick, n rounds of 34% x 1..3
	 * (n >= 100: all of it); 14: trap (dungeon pw.o); 8/15: area/explosive; otherwise src's attack.
	 */
	e_(type, src, dst, skill, item, n) {
		const seal = dst.i_(this.a.e);
		const hp = dst.j;
		if (seal > 0) return 0;
		if (dst.s_(8)) {
			if (type !== 23) {
				this.A0_(0, -8355712, dst);
				return 0;
			}
			return 0;
		}
		if (type === 7) {
			// ranged hit on the hero (or the hired companion) wearing shield 255: 10% miss
			const lv = this.a;
			let owner = null;
			if (dst === lv.f) owner = lv.e;
			else {
				const u = lv.u;
				if (u != null && dst === u) owner = lv.t;
			}
			if (owner != null) {
				const it = owner.i[2];
				if (it != null && it.a === 255 && lv.x.h_(100) < 10) {
					this.A0_(0, -8355712, dst);
					return 0;
				}
			}
		}

		let dmg;
		let raw = 0;       // the roll before crit and defence (poison proc base)
		let redraw = false; // toolbar refresh
		let crit = false;
		if (type === 17) {
			let d = this.a.x.i_(3, 5);
			const cap = Math.max(idiv(dst.q_(), 4), 1);
			if (d >= cap) d = cap;
			if (d >= hp.v_()) d = Math.max((hp.v_() - 1) | 0, 0);
			dmg = d;
		} else if (type === 22) {
			dmg = 10;
			if (10 >= hp.v_()) dmg = Math.max((hp.v_() - 1) | 0, 0);
		} else if (type === 23) {
			const u = dst.u;
			if (u <= 0 || n <= 0) return 0;
			if (n >= 100) {
				dst.u = 0;
				dmg = u;
			} else {
				let sum = 0;
				for (let i = 0; i < n && dst.u > 0; i++) {
					let d;
					if (this.a.x.h_(100) < 34) d = dst.u > 5 ? this.a.x.i_(1, 3) : 1;
					else d = 0;
					const cu = dst.u;
					if (d > cu) d = cu;
					dst.u = (cu - d) | 0;
					sum = (sum + d) | 0;
				}
				dmg = sum;
			}
			redraw = true;
		} else {
			let ally = false;
			if (src != null) {
				const lv = this.a;
				if (src === lv.f || src === lv.u) ally = true;
			}
			let owner = null;
			if (ally) {
				const lv = this.a;
				owner = src === lv.f ? lv.e : lv.t;
			}
			let base;
			if (type === 14) {
				base = Math.max(this.a.c.o, 5);
				redraw = true;
			} else if (fg2.W_(type, 8, 15)) {
				if (type === 8 && item != null && item.c0 === 3) base = Math.max(idiv(src.o_(), 2), 1);
				else if (type === 8 && item != null && item.c0 === 11) base = Math.max(idiv(imul(src.o_(), 2), 3), 1);
				else {
					base = Math.max((src.o_() + 2) | 0, 8);
					if (type === 8 && owner != null && owner.h[3] >= 3) base = (base + 3) | 0;
				}
			} else {
				base = src.o_();
			}
			const spread = base >= 15 ? idiv(base, 5) : base >= 12 ? 3 : 2;
			const roll = Math.max((this.a.x.h_((imul(spread, 2) + 1) | 0) + base - spread) | 0, 1);
			let bonus = 0;
			if (type === 7 && item != null && fg2.W_(item.a, 143, 277) && owner != null && owner.h[3] >= 3) {
				crit = true;
				bonus = 50;
			}
			if (skill != null) {
				if (src === this.a.f) {
					const id = skill.a;
					if (id === 20002) {
						bonus = owner.h[1] >= 2 ? 100 : 50;
						crit = true;
					} else if (id === 20003 && owner.h[2] >= 3) {
						crit = true;
						bonus = 50;
					}
				}
			} else if (type === 1 || type === 7) {
				let chance;
				if (owner != null) {
					chance = vj0.i2.t1_(28) ? 10 : 5;
					const w = owner.i[0];
					if (w != null && w.a === 253) chance = (chance + 5) | 0;
				} else {
					chance = 5;
				}
				if (this.a.x.h_(100) < chance) {
					bonus = ally ? 100 : 50;
					crit = true;
				}
			}
			const d = crit ? Math.max(idiv(imul((bonus + 100) | 0, roll), 100), 2) : roll;
			let pierce = false;
			if (owner != null) {
				const w = owner.i[0];
				if (w != null && w.a === 253) pierce = true;
			}
			const def = dst.n_(pierce);
			dmg = Math.max((d - def) | 0, crit ? 2 : 1);
			raw = roll;
		}

		let dealt = dmg;
		if (dmg > 0) {
			const cur = hp.v_();
			let d = dmg;
			if (dmg >= cur) {
				// kill guards: transformers (E0) and threshold bosses (K0) stay at 1 HP; a protected companion too
				const t = dst.a;
				if (t.E0 !== 0) d = Math.max((cur - 1) | 0, 0);
				else if (t.K0 > 0) d = Math.max((cur - 1) | 0, 0);
				else if (dst.w_() && !c30.c0_(dst) && src.s <= 0) {
					const u = this.R_(dst);
					if (this.a.e.b_(u)) d = Math.max((cur - 1) | 0, 0);
				}
			}
			dealt = d;
			if (d > 0) {
				dst.A_((cur - d) | 0);
				this.A0_(d, crit ? -5177344 : -3193566, dst);
				// poisonous attacker (bw flag 512): 35% to poison for 55% of the roll
				if (src != null && src.a.O_(512) && raw > 0 && !dst.a.O_(1024) && !dst.a.l0 && this.a.x.h_(100) < 35) {
					let p = Math.max(idiv(imul(raw, 55), 100), 1);
					if (p > 0) {
						p = Math.min(p, (dst.q_() - dst.u) | 0);
						if (p > 0) {
							const nu = (dst.u + p) | 0;
							dst.u = nu;
							if (nu > 0) this.y0_(2131231673, 0, dst);
							this.A0_(p, -14318318, dst);
						}
					}
				}
				const hero = this.a.f;
				if (dst === hero) {
					if (hero.j.v_() <= 0) {
						// ambrosia (123) revives
						if (this.a.f.D.k_(123) && this.Y_(vj0.Z1.get(123), 2, false, false)) {
							this.W_(123, true, true);
							this.z0_(this.a.f, 123, true, 0);
							redraw = true;
						}
					} else if (this.h0 === 0 && this.a.f.j.v_() <= Math.min(idiv(this.a.f.q_(), 3), 15)) {
						this.h0 = 1;
					}
					if (redraw) ui(this, 'k0_');
				}
			}
		}
		return dealt;
	},

	/** void q(aw): a transformer (bw.E0) left at 1 HP becomes its next form (same loot, tag, flag 512) */
	q_(c) {
		if (c.a.E0 !== 0 && c.j.v_() === 1) {
			const loot = c.b_();
			const tag = c.h;
			const marked = c.s_(512);
			this.a.j_(c, false);
			const lv = this.a;
			const p = c.b;
			const nc = lv.K_(c.a.E0, p.a, p.b, c.k, c.c, false);
			nc.g = loot;
			nc.h = tag;
			if (marked) nc.z_(512);
			this.K0_(nc, null);
			let U = this.U;
			if (U == null) {
				U = [];
				this.U = U;
			}
			U.push(nc);
		}
	},

	/** boolean e0(int id): skill (>= 20000) or item id usable now (toolbar enabled state) */
	e0_(id) {
		if (id >= 20000) {
			const s = zw.q.get(id);
			if (s == null) return false;
			const lv = this.a;
			if (lv.C ? !s.h : !s.i) return false;
			if (id === 20005) {
				if (!this.X_(0, 1, 0, 0, false, 0, true, true)) return false;
			} else if (id === 20006) {
				if (lv.f.j.v_() >= idiv((this.a.f.q_() + 1) | 0, 2)) return false;
				if (!this.X_(1, 0, 0, 0, false, 0, true, true)) return false;
			} else if (id === 20007 && !this.T_(lv.f, 0)) {
				return false;
			}
		} else {
			const it = vj0.Z1.get(id);
			const lv = this.a;
			if (lv.C ? !it.d0 : !it.e0) return false;
			const kind = it.c0;
			const iid = it.a;
			if ((kind === 6 && lv.q != null) || (kind === 7 && !this.i_(it))) return false;
			if (it.X !== 0 || it.Y > 0 || it.Z > 0 || it.a0 !== 0 || iid === 304 || iid === 295) {
				if (!this.Y_(it, iid === 295 ? -1 : 0, true, true)) return false;
			}
			if (iid === 185 && this.a.u != null) return false;
		}
		return true;
	},
});
