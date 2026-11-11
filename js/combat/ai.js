// c30 monster-AI helpers called from the AI tail of S0 (turn.js): the waiting move p, blind x,
// demoralise y, buff h, summon M0, and the random cell pickers P / Q. Ported from Vineflower c30.java
// (p ~10514, x ~11062, y ~11190, h ~8736, M0 ~4529, P ~4692, Q ~4826). See PORTING.md.
import { install } from './c30.js';
import './turn.js'; // zw.o_ / zw.p_
import { zw } from '../gen/statics.js';
import { imul, iabs, get } from '../gen/jrt.js';

install({
	/**
	 * boolean p(aw): waiting move. The actor's path c30.z to the hero is exactly AP + 1 long (it would end
	 * next to the hero with no AP left to strike), every step is free and no other foe of the hero is near:
	 * with 67% it ends its turn instead (p0, E0(200)).
	 */
	p_(me) {
		const l = me.l;
		if (l === this.a.f && me.k !== 1 && l != null) {
			const z = this.z;
			if (z.length !== 0 && me.s <= 0 && me.i_(this.a.e) <= 0 && me.l.q <= 0 && !me.a.O_(8192)) {
				const spd = me.r_();
				if (spd <= 4 && spd !== 1) {
					const n = Math.min((spd - 1) | 0, 2);
					if (me.n.v_() === n && z.length === ((n + 1) | 0) && z.length !== 0) {
						const p = me.b;
						const a1 = this.a1;
						a1.a = p.a;
						a1.b = p.b;
						// z is a stack of directions (last = next step); all but the final step must be free
						for (let i = z.length - 1; i >= 1; i--) {
							const dir = get(z, i);
							const c1 = this.c1;
							c1.f_(dir);
							a1.a = (a1.a + c1.a) | 0;
							a1.b = (a1.b + c1.b) | 0;
							const lv = this.a;
							const idx = (imul(a1.b, lv.g) + a1.a) | 0;
							if (lv.k[idx] == null) {
								const w = lv.j[idx];
								const xt = zw.u[w.a];
								if (xt.m || (xt.o && (w.b & 32) !== 0)) continue;
							}
							return false;
						}
						const tgt = me.l;
						const r = (n + 2) | 0;
						const tp = tgt.b;
						for (let y = Math.max((tp.b - r) | 0, 0); y <= Math.min((tp.b + r) | 0, (this.h - 1) | 0); y++) {
							for (let x = Math.max((tp.a - r) | 0, 0); x <= Math.min((tp.a + r) | 0, (this.g - 1) | 0); x++) {
								const idx = (imul(this.g, y) + x) | 0;
								if (this.j[idx] > 0) {
									const o = this.a.k[idx];
									if (o != null && o !== tgt && o !== me && o.e_() && zw.o_(tgt.k, o.k)) return false;
								}
							}
						}
						if (this.a.x.h_(100) >= 33) {
							this.p0_();
							this.E0_(200);
							return true;
						}
					}
				}
			}
		}
		return false;
	},

	/** boolean x(aw): blind (ability 2048, once): the best-scored visible foe within 4 in LOS */
	x_(me) {
		const can = this.a0_(me, 2048);
		const pos = me.b;
		if (can && me.t <= 0 && me.s <= 0) {
			const x1 = Math.min((pos.a + 4) | 0, (this.g - 1) | 0);
			const y1 = Math.min((pos.b + 4) | 0, (this.h - 1) | 0);
			let best = 0;
			let pick = null;
			for (let y = Math.max((pos.b - 4) | 0, 0); y <= y1; y++) {
				for (let x = Math.max((pos.a - 4) | 0, 0); x <= x1; x++) {
					const idx = (imul(this.g, y) + x) | 0;
					if (this.j[idx] <= 0) continue;
					const o = this.a.k[idx];
					if (o == null || o === me || !o.e_()) continue;
					const op = o.b;
					if (!zw.o_(me.k, o.k) || o.s > 0 || o.t > 0) continue;
					if (!this.a.O_(4, 0, pos, op)) continue;
					let score = pos.d_(op);
					if (o.a.O_(2608)) score = (score + 12) | 0;
					if (o.w > 0) score = (score + 8) | 0;
					if (best < score) {
						pick = o;
						best = score;
					}
				}
			}
			if (pick != null) {
				const tp = pick.b;
				this.D0_(pick);
				this.t_(me, 2048);
				this.u_(me, 3, true, 200);
				this.I_(me, tp);
				// DungameView.w(sprite size -> Y0/X0) is a no-op headless; N0 writes the target's screen
				// position into a1; z0.c(2, ...) is a particle burst (cosmetic)
				this.N0_(tp.a, tp.b, this.a1, false);
				this.K0_(me, null);
				return true;
			}
		}
		return false;
	},

	/** boolean y(aw): demoralise (ability 32, once): foes within 4 (1 when held) get r = 7 */
	y_(me) {
		if (this.a.C) {
			const list = [];
			const r = me.t > 0 ? 1 : 4;
			const pos = me.b;
			let any = false;
			for (let y = Math.max((pos.b - r) | 0, 0); y <= Math.min((pos.b + r) | 0, (this.h - 1) | 0); y++) {
				for (let x = Math.max((pos.a - r) | 0, 0); x <= Math.min((pos.a + r) | 0, (this.g - 1) | 0); x++) {
					const idx = (imul(this.g, y) + x) | 0;
					if (this.j[idx] <= 0) continue;
					const o = this.a.k[idx];
					if (o == null || o === me || !o.e_() || o.i_(this.a.e) > 0) continue;
					if (zw.o_(me.k, o.k)) {
						list.push(o);
						if (o.r <= 0) any = true;
					}
				}
			}
			if (list.length !== 0 && any) {
				let hit = 0;
				const n = list.length;
				for (let i = 0; i < n;) {
					const o = get(list, i);
					i++;
					const chance = o.a.l0 ? 40 : 80;
					if (this.a.x.h_(100) < chance) {
						hit = (hit + 1) | 0;
						o.r = 7;
						this.y0_(2131231488, 0, o);
					}
					this.J0_(o, me);
				}
				if (hit === 0) {
					const o = get(list, this.a.x.h_(list.length));
					o.r = 7;
					this.y0_(2131231488, 0, o);
				}
				this.t_(me, 32);
				this.u_(me, zw.q.get(20004).e, true, 200);
				return true;
			}
		}
		return false;
	},

	/** void h(aw): buff (ability 16, once): flag 2 on every visible ally within 4 (1 when held) */
	h_(me) {
		if (this.a.C) {
			const r = me.t > 0 ? 1 : 4;
			const pos = me.b;
			for (let y = Math.max((pos.b - r) | 0, 0); y <= Math.min((pos.b + r) | 0, (this.h - 1) | 0); y++) {
				for (let x = Math.max((pos.a - r) | 0, 0); x <= Math.min((pos.a + r) | 0, (this.g - 1) | 0); x++) {
					const idx = (imul(this.g, y) + x) | 0;
					if (this.j[idx] > 0) {
						const o = this.a.k[idx];
						if (o != null && o.e_() && me.k === o.k) {
							o.z_(2);
							this.y0_(0, 2, o);
							this.K0_(o, null);
						}
					}
				}
			}
			this.t_(me, 16);
			this.u_(me, 3, true, 200);
		}
	},

	/** void M0(aw, aw, int group, int tag, boolean loot): up to 3 minions (bw.C0) near the target, x-- each */
	M0_(me, tgt, group, tag, loot) {
		this.U = null;
		for (let i = 0; i < 3 && me.x > 0; i++) {
			const tp = tgt.b;
			const a1 = this.a1;
			if (!this.Q_(4, -3, tp, a1)) break;
			const c = this.a.K_(me.a.C0, a1.a, a1.b, group, false, false);
			this.I_(c, tgt.b);
			c.h = tag;
			if (loot) {
				const v = zw.a_(this.a.b, c.a.a);
				if (v !== 0) c.g = v;
			}
			this.K0_(c, null);
			let U = this.U;
			if (U == null) {
				U = [];
				this.U = U;
			}
			U.push(c);
			me.x = (me.x - 1) | 0;
		}
	},

	/** boolean P(Point from, Point to, int k, Point out): random free 4-neighbour of from (reaching to) */
	P_(from, to, k, out) {
		let tries = 0;
		let mask = 0;
		for (;;) {
			if (tries >= 20) return false;
			const d = this.a.x.h_(4);
			const bit = 1 << d;
			if ((mask & bit) === 0) {
				const a1 = this.a1;
				a1.f_(d);
				const x = (a1.a + from.a) | 0;
				a1.a = x;
				const y = (a1.b + from.b) | 0;
				a1.b = y;
				if (this.a.A_(x, y) && (to == null || this.a.t_(a1, to, null, 9, 20, k, true, 0) > 0)) {
					out.a = a1.a;
					out.b = a1.b;
					return true;
				}
				mask |= bit;
				if (mask === 15) return false;
			}
			tries++;
		}
	},

	/** boolean Q(int r, int k, Point from, Point out): random visible free cell 2..r from `from`, reachable */
	Q_(r, k, from, out) {
		if (r >= 1 && r >= 2) {
			for (let i = 0; i < 150; i++) {
				const rng = this.a.x;
				const w = (imul(r, 2) + 1) | 0;
				const dx = (rng.h_(w) - r) | 0;
				const dy = (this.a.x.h_(w) - r) | 0;
				if (iabs(dx) >= 2 || iabs(dy) >= 2) {
					const x = (dx + from.a) | 0;
					const y = (dy + from.b) | 0;
					if (x > 0 && y > 0) {
						const g = this.g;
						if (x < g - 1 && y < this.h - 1 && this.j[(imul(g, y) + x) | 0] > 0 && this.a.A_(x, y)) {
							out.a = x;
							out.b = y;
							if (this.a.t_(out, from, null, 9, 20, k, true, 0) > 0) return true;
						}
					}
				}
			}
		}
		return false;
	},
});
