// c30 actions: starting an action (f), the action resolver (R0) and its helpers: chests (A), pickups (P0),
// recovery (X / Y), skill costs (G0 / H0), EP / AP / item payment (V / u / W), explosion (g), pull (B),
// action reset (G), the Ariadne thread (H), the familiar check (i), the dig / trap particles (I0), quest
// dialogs (r0 / B0) and the pet-caught statistics (static a).
// Source: decompiled/vineflower/c30.java (f ~8322, R0 ~4865), checked against smali (c30.smali) where the
// decompiles disagree; see the notes at each spot. Methods carry the `_` suffix (PORTING.md).
//
// hw.G action types: 1 melee, 2 unseal / open (sealed objects, MP), 3 chest, 4 pickup, 5 chest (other),
// 6 dig, 7 throw / ranged, 8 bomb, 9 round kick, 10 spider, 11 web, 12 net, 13 activate (levers, fountains,
// shrines, cauldrons), 15 explosion, 16 talk, 18 clear tile / trap, 19 pickup (heavy), 20 bait, 21 catch,
// 24 MP bomb. hw.H phases: 0 start, 1 hit, 2 resolve, 3 remove dead, 4 / 5 / 10 finish.
import { install, extend, c30 } from './c30.js';
import { classes, register } from '../gen/registry.js';
import { zw, vj0 } from '../gen/statics.js';
import { fg2, Util$Point } from '../gen/model.js';
import { imul, idiv, f32, f2i, b8, iabs, get, removeAt, removeObj } from '../gen/jrt.js';

// ---------------------------------------------------------------------------------------------
// small helpers

/** (bj0) vj0.Z1.get(id): null when absent, like HashMap.get */
const item = (id) => {
	const r = vj0.Z1.get(id);
	return r === undefined ? null : r;
};

/** Context.getString(id); the oracle's Context stub answers "#<id>" */
const str = (c, id) => {
	const d = c.d;
	if (d != null) {
		if (typeof d.getString_ === 'function') return d.getString_(id);
		if (typeof d.getString === 'function') return d.getString(id);
	}
	return '#' + id;
};

/**
 * DungameView calls that are pure UI in the oracle (every DungameView method but T / S / d0 / onTouchEvent
 * returns the default there): call them when the view port has them, skip otherwise.
 */
const ui = (c, name, ...args) => {
	const v = c.e;
	if (v != null && typeof v[name] === 'function') return v[name](...args);
	return undefined;
};

/** Index of cell (x, y) in the c30 grids (c30.g = width). */
const cell = (c, p) => (imul(p.b, c.g) + p.a) | 0;

// zw.o(int, int): factions a and b are hostile (one is 1, the other 2). Shared helper; define once.
if (!zw.o_) {
	zw.o_ = function o_(a, b) {
		if (a === b) return false;
		let lo = a, hi = b;
		if (a > b) { hi = a; lo = b; }
		return lo === 1 && hi === 2;
	};
}

// ---------------------------------------------------------------------------------------------
// Dialog dismiss callbacks (Runnables passed to DungameView.T). The view port captures them and the
// settle loop runs them (ORACLE.md). run_() is the Java run(); run() is an alias.

/** t93 (R8-merged Runnable): only case 7 (c30 NPC speech, c = c30, b = the NPC) is reachable from c30. */
export class t93 {
	/** (ILjava/lang/Object;Ljava/lang/Object;Z)V */
	constructor(a, c, b, _z) {
		this.a = a;
		this.c = c;
		this.b = b;
	}

	run_() {
		switch (this.a) {
			case 7: {
				const c = this.c;
				if (c.a == null) return;
				c.Q0_();
				if (c.a.w_(this.b)) c.G_(true, true);
				else c.E0_(600);
				return;
			}
			default:
				throw new Error(`t93 case ${this.a} is not ported`);
		}
	}

	run() { this.run_(); }
}

/** t20: case 0 = NPC that calls its partner (bw.C0) over, other cases = boss speech end. turn.js has the same
 *  class (registered first); this one is only the fallback. */
class t20 {
	/** (Lc30;Law;I)V */
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
			const h = c.a;
			const b = this.b;
			if (!h.w_(b)) {
				c.i0_(b, true);
				c.K0_(b, null);
				c.z_(b);
				c.E0_(350);
			}
		}
	}

	run() { this.run_(); }
}

/** u20: quest dialog chain (c30.r0): next page, or end of the chain. */
export class u20 {
	/** (Lc30;ZLkj0;Law;IZ)V */
	constructor(f, a, b, c, d, e) {
		this.f = f;
		this.a = a;
		this.b = b;
		this.c = c;
		this.d = d;
		this.e = e;
	}

	run_() {
		const c = this.f;
		if (c.a == null) return;
		if (!this.a) {
			c.r0_((this.d + 1) | 0, this.c, this.b, this.e);
		} else {
			c.Q0_();
			const h = c.a;
			if (h.w_(h.J)) c.G_(true, true);
			else c.E0_(600);
		}
	}

	run() { this.run_(); }
}

for (const k of [t93, t20, u20]) if (!classes[k.name]) register(k);

// ---------------------------------------------------------------------------------------------
// model helpers the actions need that js/gen/model lacks

/** cq.k(int id): the list holds item id */
function cqK(id) {
	const list = this.c;
	const n = list.length;
	for (let i = 0; i < n; i++) if (list[i].a.a === id) return true;
	return false;
}

/** cq.l(int f): holds a type-11 item (key) with f == v */
function cqL(v) {
	const list = this.c;
	const n = list.length;
	for (let i = 0; i < n; i++) {
		const it = list[i].a;
		if (it.c === 11 && it.f === v) return true;
	}
	return false;
}

/** cq.q(int id, int n): remove n of id if at least n are held */
function cqQ(id, n) {
	const list = this.c;
	if (n > 0) {
		const len = list.length;
		for (let i = 0; i < len; i++) {
			const e = list[i];
			if (e.a.a === id) {
				if (e.a_() >= n) {
					e.b_((e.a_() - n) | 0);
					if (e.a_() === 0) removeObj(list, e);
					return true;
				}
				break;
			}
		}
	}
	return false;
}

/** cq.b(int id, int n): add n of id (merge into the entry, else c()) */
function cqB(id, n) {
	if (n <= 0) return null;
	const list = this.c;
	const len = list.length;
	for (let i = 0; i < len; i++) {
		const e = list[i];
		if (e.a.a === id) {
			e.b_((e.a_() + n) | 0);
			return e;
		}
	}
	return this.c_(id, n);
}

/** cq.c(int id, int n): insert a new entry before the first with a larger sort key (T when b, else bj0.b) */
function cqC(id, n) {
	const list = this.c;
	const it = item(id);
	if (it == null) return null;
	const len = list.length;
	let at = -1;
	for (let i = 0; i < len; i++) {
		const o = list[i].a;
		if (this.b ? o.T > it.T : o.b > it.b) { at = i; break; }
	}
	const e = Object.create(classes.cj0.prototype);
	e.a = it;
	e.b_(n);
	e.c = false;
	if (at === -1) list.push(e); else list.splice(at, 0, e);
	return e;
}

/** cj0.b(int): store the count (obfuscated) */
function cj0B(n) {
	const v = n ^ 6896781;
	this.b = ((v & 252645135) << 4) | ((-252645136 & v) >>> 4);
}

// js/save/records.js adds identical cq.b/c/q and cj0.b when it loads (only where absent); take whichever is
// there first and add the rest.
const addMissing = (cls, methods) => {
	const add = {};
	for (const [k, fn] of Object.entries(methods)) if (!(k in cls.prototype)) add[k] = fn;
	extend(cls, add);
};
addMissing(classes.cj0, { b_: cj0B });
addMissing(classes.cq, { k_: cqK, l_: cqL, q_: cqQ, b_: cqB, c_: cqC });

addMissing(classes.hw, {
	/** void E(hw): clone template bw 199 (mechanical spider) from the guild hero: 75% HP / defence, full damage */
	E_(lvl) {
		const t = zw.c_(199);
		t.b = lvl.s ? 5643 : 5632;
		const d = t.d0;
		const e = this.e;
		t.f0 = new classes.cw(Math.max(d.a, idiv(imul(e.m_(), 75), 100)), Math.max(d.b, e.f_()),
			Math.max(d.c, idiv(imul(e.e_(), 75), 100)), d.d, 0);
	},
});

extend(classes.nw, {
	/** int o(): skill level h[2] */
	o_() { return this.h[2]; },
	/** boolean r(): shield slot holds item 255 */
	r_() {
		const it = this.i[2];
		return it != null && it.a === 255;
	},
});

extend(classes.vj0, {
	/** void g2(boolean): count a finished action (C), optionally flag a save (r0) */
	g2_(z) {
		this.C = (this.C + 1) | 0;
		if (z) this.r0 = true;
	},
	/** int H0(bj0): EP an item restores (+ ri0[33] bonus for 121 / 124 / 218) */
	H0_(it) {
		const y = it.Y;
		let v = y;
		if (y > 0 && fg2.X_(it.a, 121, 124, 218)) {
			const k = this.m[33].i;
			if (k > 0) v = (y + k) | 0;
		}
		return v;
	},
	/** int I0(bj0): HP an item restores (+ ri0[32] for 120 / 122 / 218, + ri0[31] * k for 123) */
	I0_(it) {
		const x = it.X;
		const id = it.a;
		if (x > 0) {
			const m = this.m;
			if (fg2.X_(id, 120, 122, 218)) {
				const k = m[32].i;
				if (k > 0) return (x + k) | 0;
			} else if (id === 123) {
				const r = m[31];
				const k = r.i;
				if (k > 0) return (imul(k, r.k) + x) | 0;
			}
		}
		return x;
	},
	/** void o2(): flag a save */
	o2_() { this.r0 = true; },
});

// ---------------------------------------------------------------------------------------------
// Quest helpers the NPC talk needs (vj0 / kj0 / dj0). Rewards land in the guild, outside the dungeon.

/** dj0: quest-completion record (only the lj0 list w is used here; the dialog shows it) */
const newDj0 = () => ({ $class: 'dj0', w: [] });

/** static void vj0.N(dj0, kj0): add the quest's reward variant (lj0) and mark the quest done */
function vj0N(dj, q) {
	const f = q.f;
	let k = q.m0;
	if (k >= f.length) k = 0;
	const l = f[k];
	dj.w.push({ $class: 'lj0', a: q, b: q.l0, c: l });
	q.j0 = b8(b8(q.j0 & -17) | 128);
	// analytics ("gu_quest_compl_" + id) omitted
}

if (classes.kj0) {
	addMissing(classes.kj0, {
		/** void B(int): set step bit i in k0 */
		B_(i) { this.k0 = b8((1 << i) | this.k0); },
		/**
		 * void C(int lvl, e01): start the quest (active, not done, step bits cleared). Quests with variants (j)
		 * pick one with the rng, or with the game's unseeded UApp random (not modelled: variant 0).
		 */
		C_(v, rng) {
			this.j0 = b8(b8(this.j0 & -129) | 16);
			let m = 0;
			this.k0 = 0;
			const l = b8(v);
			this.l0 = l;
			const f = this.f;
			if (this.j) {
				if (f.length > 1) m = rng != null ? b8(rng.h_(f.length)) : 0;
			} else if (l < f.length) {
				m = l;
			}
			this.m0 = m;
		},
		/** void D(): start, then pre-tick steps whose item the guild already holds */
		D_() {
			this.C_(0, null);
			if (this.b0 != null && this.x_()) {
				for (const s of this.b0) {
					let p = s.p;
					if (p !== 0 && s.g !== -1) {
						const st = vj0.i2;
						if (st.P1_(p)) {
							this.B_(s.g);
						} else {
							const x = this.x;
							if (x != null) {
								p = x.o;
								if (p !== 0) {
									const line = st.o[p];
									if (line.B0 === 0 && line.j0_()) {
										const m = line.t_();
										if (m.b != null) {
											for (let i = 0; i < m.b.length; i++) {
												if (m.b[i].b === s.p && bz3x(line.D0, i) > 0) {
													this.B_(s.g);
													break;
												}
											}
										}
									}
								}
							}
						}
					}
					p = s.t;
					if (p !== 0 && s.g !== -1) {
						const st = vj0.i2;
						if (st.K.l_(p) || st.L.l_(s.t)) this.B_(s.g);
					}
				}
			}
		},
	});
}

/** bz3.x(int) (case 12 of an R8-merged class): decoded amount i of an Integer[] */
function bz3x(z, i) {
	const v = z.b[i];
	if (v == null) return 0;
	return (((v & 252645135) << 4) | ((v & -252645136) >>> 4)) ^ 57228461;
}

addMissing(classes.vj0, {
	/**
	 * void H(dj0, boolean): deliver a quest's rewards to the guild (gold, items, XP, reputation) and flag a
	 * save. NOT ported beyond the save flag: the rewards only change guild state outside the dungeon.
	 */
	H_(_dj, z) {
		if (z) throw new Error('vj0.H(dj0, true) is not ported');
		this.r0 = true;
	},
});

/**
 * boolean bj0.A(): the item shows as "?" (its recipe / quest / collection is not unlocked). Only picks the
 * NPC dialog icon. The tj0.c() step (ni0.D(e).c()) is not ported: counted as false.
 */
function bj0A(it) {
	const o0 = it.o0;
	const id = it.a;
	const st = vj0.i2;
	if (o0 !== 0) {
		const line = st.o[o0];
		const r = line.z_(id);
		if (hj0f(r, line)) return true;
	}
	const p0 = it.p0;
	if (p0 === 0 || st.Y0_(p0).v_()) return it.q0 && !st.N.b.k_(id);
	return true;
}

/** boolean hj0.f(ni0) (see bj0A) */
function hj0f(r, line) {
	if (r.x) return true;
	const st = vj0.i2;
	if (r.y !== 0 && st.o[r.y].B0 === 0) return true;
	if (r.z !== 0 && !st.Y0_(r.z).v_()) return true;
	if (r.A !== 0 && !st.Y0_(r.A).q_()) return true;
	if (r.C !== 0 && !st.N.b.k_(r.C)) return true;
	if (!r.B || line == null || r.e === 0) return false;
	return false; // ni0.D(e).c() not ported
}

// Runnable classes: prefer whichever part registered the class first (turn.js has t20 too).
const T20 = (c, b, a) => new (classes.t20 ?? t20)(c, b, a);
const T93 = (a, c, b, z) => new (classes.t93 ?? t93)(a, c, b, z);
const U20 = (...a) => new (classes.u20 ?? u20)(...a);

/**
 * R0, H == 0, G == 16: talk to the NPC hw.J. In combat it only says "..." (or "help!" for prisoners).
 * Otherwise the NPC's tag (qw.h) picks the speech: 1000 succubus, 1001 prisoner (thanks + loot), 1002 / 1007
 * speech, 1003 speech + loot, 1004 "you caught me" + loot, 1005 / 1006 retinue, 1008 trader (wants bw.L0),
 * 1009 / 1010 advice bot, 1..999 quest NPC. Then either a plain dialog (G(true, false)) or a dialog whose
 * dismissal (t93 case 7) continues to phase 1 (H = 1).
 * Mapped from smali (both decompiles garble the register merges; JADX also flips two conditions).
 */
function talk0(c) {
	const h = c.a;
	const npc = h.J;
	const dots = '...';
	if (h.C) {
		let s = dots;
		if (fg2.W_(npc.h, 1001, 1000)) {
			const cfg = c.a.c;
			if (!cfg.F && !(cfg.G && npc.a.a === 639)) s = str(c, 2131690624);
		}
		c.e.T_(npc.a, s, 0, false, null, false, null, null, null);
		c.G_(true, false);
		return;
	}
	// tail state (smali registers at :L70): text id, preset text, loot item, "?" icon, plain dialog, T's
	// 4th / 5th / 6th / 7th / 8th arguments
	let tid = 0, txt = null, itm = 0, qicon = 0, close = 0, b4 = 0, quest = null, b6 = 0, dj = null, quest2 = null;
	const v = npc.h;
	if (v === 1002) {
		tid = npc.m_().H0;
		close = 1;
	} else if (v === 1003) {
		tid = npc.m_().H0;
		itm = npc.b_();
	} else if (v === 1007) {
		npc.h = 1008;
		tid = npc.m_().H0;
		close = 1;
	} else if (v === 1008) {
		const want = npc.m_().L0;
		if (want !== 0 && c.a.f.D.k_(want)) {
			c.W_(want, false, true);
			itm = npc.b_();
			tid = 2131690134;
		} else {
			itm = want;
			qicon = 1;
			b4 = 1;
			close = 1;
			tid = 2131691458;
		}
	} else if (v === 1009) {
		npc.h = 1010;
		tid = 2131689668;
		close = 1;
	} else if (v === 1010) {
		// vj0.Z0() (where to go next) is not ported; the advice bot does not appear in generated dungeons
		throw new Error('c30.R0: advice NPC (vj0.Z0) is not ported');
	} else if (v === 1004) {
		itm = npc.b_();
		tid = 2131691457;
	} else if (v === 1001) {
		if (npc.m_().H0 !== 0) {
			tid = npc.m_().H0;
		} else {
			const cfg = c.a.c;
			tid = cfg.G ? 2131690623 : cfg.F ? 2131691448 : cfg.E ? 2131690626 : 2131690625;
		}
		itm = npc.b_();
	} else if (fg2.W_(v, 1005, 1006)) {
		close = 1;
	} else if (npc.h === 1000) {
		tid = 2131691135;
	} else {
		const hv = npc.h;
		const st = vj0.i2;
		const q = hv > 0 && hv <= 999 ? st.Y0_(hv) : null;
		if (q != null) {
			if (q.s_(0, c.a.b)) {
				if (q.c0) {
					// per-level quest step
					if (q.Z != null) { c.r0_(0, npc, q, false); return; }
					const s = q.m_(c.a.b);
					if (s == null) {
						close = 1;
					} else {
						let ok = 0;
						if (s.S !== 0) {
							const has = c.a.f.D.k_(s.S);
							const S = s.S;
							if (has) {
								c.W_(S, false, true);
								tid = npc.m_().H0;
								ok = 1;
							} else {
								qicon = 1;
								b4 = 1;
								close = 1;
								itm = S;
								tid = 2131691458;
							}
						} else {
							tid = npc.m_().H0;
							ok = 1;
						}
						if (ok && s.T && s.g !== -1) {
							q.B_(s.g);
							st.o2_();
							if (q.u_(s)) {
								b6 = 1;
								quest = q;
							} else if (q.p_(0n)) {
								dj = newDj0();
								vj0N(dj, q);
								st.H_(dj, false);
								// e2.m(new d2(context)): UI
								quest = q;
							}
						}
					}
				} else {
					let ok = 0;
					if (q.M != null && q.j_() < ((q.M.length - 1) | 0)) {
						tid = q.N;
					} else {
						const t = npc.m_();
						if ((t.C0 === 0 || npc.x > 0) && q.P !== 0) {
							const has = c.a.f.D.k_(q.P);
							const P = q.P;
							if (has) {
								c.W_(P, false, true);
								ok = 1;
							} else {
								qicon = 1;
								b4 = 1;
								close = 1;
								itm = P;
								tid = 2131691458;
							}
						} else {
							ok = 1;
						}
					}
					if (ok && npc.m_().C0 !== 0) {
						if (npc.x > 0) {
							const id = npc.m_().H0;
							const s = id !== 0 ? str(c, id) : dots;
							c.G_(true, false);
							c.E0_(500);
							c.g0 = true;
							c.e.T_(npc.a, s, 0, false, null, false, null, null, T20(c, npc, 0));
							return;
						}
						// the partner (bw.C0) must not already be on its way (h == 1102)
						const list = c.a.o;
						const n = list.length;
						for (let i = 0; i < n; i++) {
							const o = get(list, i);
							if (o.a.a === npc.m_().C0 && o.h === 1102) {
								ok = 0;
								close = 1;
								break;
							}
						}
					}
					if (ok) {
						dj = newDj0();
						vj0N(dj, q);
						st.H_(dj, false);
						// e2.m(new d2(context)): UI
						const W = q.W;
						if (W !== 0) {
							quest2 = st.Y0_(W);
							quest2.D_();
						}
						c.B0_(q);
						quest = q;
					}
				}
			} else if (q.t_(0, c.a.b, true)) {
				if (q.Z != null) { c.r0_(0, npc, q, true); return; }
				quest = q;
			}
			if (close === 0) itm = npc.b_();
		}
	}

	if (fg2.W_(npc.a.a, 444, 536) && fg2.X_(npc.h, 1002, 1005, 1003) && c.a.x.h_(100) < 5) {
		const r = c.a.x.h_(100);
		tid = r < 25 ? 2131690080 : r < 60 ? 2131689752 : 2131689990;
	}
	let text;
	if (txt != null) {
		text = txt;
	} else {
		const s = tid === 0 ? null : str(c, tid);
		if (close !== 0 && tid === 0) {
			text = dots;
		} else if (tid === 0 && quest == null) {
			text = 'Something wrong.';
			close = 1;
		} else {
			text = s;
		}
	}
	const it = itm === 0 ? null : item(itm);
	let icon;
	if (it == null) icon = 0;
	else if (qicon !== 0 && bj0A(it)) icon = 2131231264;
	else icon = it.u;
	if (close !== 0) {
		c.e.T_(npc.a, text, icon, b4 !== 0, null, false, null, null, null);
		c.G_(true, false);
	} else {
		c.E0_(500);
		c.g0 = true;
		c.a.H = 1;
		c.e.T_(npc.a, text, icon, b4 !== 0, quest, b6 !== 0, dj, quest2, T93(7, c, npc, false));
	}
}

/**
 * R0, H == 1, G == 16 (after the speech): the NPC leaves (j0 = follow / reward bookkeeping, then removed with
 * its quest referrals and retinue 1005), or stays when bw.N0. The succubus (1000) turns into a monster
 * (649 / 350 / 284) that demoralizes the hero (aw.r = 7).
 */
function talk1(c) {
	const h = c.a;
	const npc = h.J;
	const v = npc.h;
	let q = null, call = false, flag = false, succubus = false;
	if (v === 1000) {
		succubus = true;
	} else if (v === 1008 || v === 1004 || v === 1001) {
		if (v === 1001) {
			const N = vj0.i2.N;
			N.x = (N.x + 1) | 0;
		}
		call = true;
		flag = true;
	} else if (v === 1003) {
		call = true;
	} else if (v > 0 && v <= 999) {
		q = vj0.i2.Y0_(v);
		if (q != null) call = true;
	}
	if (call) c.j0_(npc, flag, true);
	if (npc.m_().N0) {
		npc.h = 0;
		c.G_(true, true);
		c.E0_(60);
		return;
	}
	const loot = npc.b_();
	c.K0_(c.a.J, null);
	let h2 = c.a;
	h2.j_(h2.J, true);
	if (q != null && q.Y != null) {
		for (;;) {
			const r = c.a.p_((q.a + 2000) | 0);
			if (r == null) break;
			c.K0_(r, null);
			c.a.j_(r, true);
		}
	}
	const ret = c.a.p_(1005);
	if (ret != null) {
		c.K0_(ret, null);
		c.a.j_(ret, true);
	}
	h2 = c.a;
	if (succubus) {
		const cfg = h2.c;
		const id = cfg.G ? 649 : cfg.E ? 350 : 284;
		const p = h2.J.b;
		const x = p.a, y = p.b;
		const f = h2.F.b;
		const flip = !(((f.a - x) | 0) >= 0 && ((f.b - y) | 0) >= 0);
		const m = h2.K_(id, x, y, 2, flip, true);
		c.T = m;
		m.g = loot !== 0 ? loot : -1;
		const h3 = c.a;
		h3.J = null;
		const hero = h3.f;
		hero.r = 7;
		c.y0_(2131231488, 0, hero);
		c.a.H = 4;
		c.E0_(350);
	} else {
		h2.J = null;
		h2.H = 5;
		c.E0_(350);
	}
}

// ---------------------------------------------------------------------------------------------
// R0 pieces, split out of R0 for readability (not Java methods; called as fn.call(c30))

/** R0, H == 1, G in {1, 7}, target is a critter: dodge, damage, life drain, riposte, shield stun */
function melee() {
	const d = this.a.J;
	let dodged;
	dodge: {
		if (d.m_().O_(128)) {
			const h = this.a;
			if (h.G === 1 && h.M == null && h.N == null && !d.s_(1024) && d.q <= 0 && d.s <= 0 && d.i_(this.a.e) <= 0) {
				const r = this.a.x.h_(100);
				if (r < (d.w_() ? 30 : 20)) {
					const pt = this.a1;
					if (this.P_(d.b, null, -1, pt) && (!d.s_(512) || this.i[cell(this, pt)].o_(false))) {
						const dx = (pt.a - d.b.a) | 0;
						const dy = (pt.b - d.b.b) | 0;
						const flip = d.c;
						if (this.l0_(d, dx, dy, -1, false) === 1) {
							this.u_(d, 1, false, 0);
							d.c = flip;
							dodged = true;
							break dodge;
						}
					}
				}
			}
		}
		dodged = false;
	}
	let h = this.a;
	let def;
	if (d === h.f) {
		def = h.e;
	} else {
		const u = h.u;
		def = u != null && d === u ? h.t : null;
	}
	if (dodged) return;
	let dmg = this.e_(h.G, h.F, d, h.M, h.N, 0);
	h = this.a;
	if (h.G !== 1) return;
	if (h.F.m_().O_(8) && dmg >= 1) {
		dmg = Math.max(idiv(dmg, 2), 1);
		this.w_(this.a.F, dmg);
	}
	h = this.a;
	if (h.F.i_(h.e) > 0) return;
	let rip;
	riposte: {
		if (d.t_()) {
			const r = this.a.x.h_(100);
			const lim = def != null ? 10 : 20;
			if (r < lim && this.e_(17, d, this.a.F, null, null, 0) > 0) {
				rip = true;
				break riposte;
			}
		}
		rip = false;
	}
	if (def != null && def.r_() && this.a.F.p_() > 0 && !this.a.F.m_().l0 && this.a.x.h_(100) < 10) {
		const F = this.a.F;
		F.B_((F.n.v_() - this.a.F.r_()) | 0);
		this.a.F.z_(1024);
		this.y0_(2131231728, 0, this.a.F);
		rip = true;
	}
	if (rip) this.J0_(this.a.F, d);
}

/** R0, H == 1, G in {8, 15, 9}: bombs / explosion (all of K) and round kick (K[I], one per call) */
function area() {
	let h = this.a;
	const g = h.G;
	if (g === 9) {
		const t = get(h.K, h.I);
		if (t.e_()) {
			h = this.a;
			this.e_(h.G, h.F, t, h.M, h.N, 0);
			h = this.a;
			if (h.F === h.f && h.e.o_() >= 2 && t.p_() > 0 && !t.m_().l0 && this.a.x.h_(100) < 50) {
				t.B_((t.n.v_() - imul(t.r_(), 2)) | 0);
				t.z_(1024);
				this.y0_(2131231728, 0, t);
			}
		}
		this.J0_(t, this.a.F);
		h = this.a;
		const n = (h.I + 1) | 0;
		h.I = n;
		if (n < h.K.length) {
			this.a.H = 1;
			this.E0_(150);
			return true;
		}
		return false;
	}
	const stun = g === 8 && h.N.c0 === 3;
	const K = h.K;
	const n = K.length;
	let tot = 0;
	for (let i = 0; i < n; i++) {
		const o = get(K, i);
		if (o.i_(this.a.e) <= 0 && o.e_()) {
			const h2 = this.a;
			const t = h2.G;
			if (t !== 15 || o !== h2.F) {
				tot = (tot + this.e_(t, h2.F, o, h2.M, h2.N, 0)) | 0;
				if (stun && o.p_() > 0 && o !== this.a.f && !o.m_().l0 && o.k === 2 && o.i_(this.a.e) <= 0) {
					o.s = 3;
					this.y0_(2131231607, 0, o);
				}
			}
		}
	}
	h = this.a;
	if (h.G === 8 && h.N.c0 === 11) {
		if (h.F === h.f && tot >= 1) this.X_(fg2.q_(idiv(tot, 2), 1, 25), 0, 0, 0, false, 0, false, false);
		const K2 = this.a.K;
		const n2 = K2.length;
		for (let i = 0; i < n2; i++) {
			const o = get(K2, i);
			if (o.e_() && o.p_() > 0) this.D0_(o);
		}
	}
	if (fg2.W_(this.a.G, 8, 15)) this.k0_();
	return false;
}

/** R0, H == 1, G == 24: MP bomb, unseals the cheapest sealed critters in K with 15 MP */
function mpBomb() {
	const list = [];
	const K = this.a.K;
	const n = K.length;
	for (let i = 0; i < n; i++) {
		const o = get(K, i);
		if (o.e_() && o.i_(this.a.e) > 0) list.push(o);
	}
	if (list.length !== 0) {
		let left = 15;
		while (list.length !== 0) {
			const m = list.length;
			let best = null;
			let bv = 0;
			for (let k = 0; k < m; k++) {
				const o = list[k];
				const v = o.i_(this.a.e);
				if (best != null && v >= bv) continue;
				best = o;
				bv = v;
			}
			if (left >= bv) {
				left = (left - bv) | 0;
				best.h_();
			} else {
				best.x_(left);
				bv = left;
				left = 0;
			}
			this.A0_(bv, -13590796, best);
			if (left <= 0) break;
			removeObj(list, best);
		}
	}
	this.k0_();
}

/** R0, H == 2. Returns true when R0 must return without the common finish (G(true, true) + E0). */
function resolve() {
	let h = this.a;
	const g = h.G;
	if (g === 2) {
		const barrel = fg2.W_(h.J.a.a, 27, 30);
		h = this.a;
		if (barrel) {
			const J = h.J;
			if (J.a.a === 30) {
				const w = this.i[cell(this, J.b)];
				w.b = b8(b8(w.b & -97) | 96);
			}
			h.j_(J, false);
		} else {
			const J = h.J;
			const id = J.a.a;
			if (id === 39) {
				J.e = true;
			} else {
				if (fg2.W_(id, 21, 37)) {
					this.a.G = 3;
					if (this.A_(true)) return true;
				}
				if (this.P0_(true)) return true;
			}
		}
		return false;
	}
	if (fg2.W_(g, 4, 19)) return this.P0_(false);
	if (fg2.W_(this.a.G, 3, 5)) return this.A_(false);

	h = this.a;
	const t = h.G;
	if (t === 21) {
		// catch a companion-type critter as a pet
		if (h.F === h.f && h.J.e_()) {
			const d = this.a.J;
			if (d.w_() && this.a.f.F.length < 4 && !d.e) {
				const n = this.a.f.F.length;
				const u = this.R_(d);
				this.a.f.F.push(u);
				this.U_((n + 230) | 0);
				ui(this, 'H_');
				const tp = d.a;
				const st = d.i;
				const e = st.e;
				const v = tp.v;
				this.b_((imul(v, v <= 4 ? 5 : 4) + e) | 0, d, true);
				c30.a_(u);
				// UApp.X0.v0("gu_pet_caught_" + u.d, false): analytics
				d.e = true;
				d.A_(0);
				this.E0 = 1300;
				this.F0 = true;
				this.a.H = 3;
				this.E0_(400);
				return true;
			}
		}
		return false;
	}
	if (t === 6) {
		// dig: mark the cell dug, remove the mound; a hole (type 3, low bits 3 / 4) drops the digger in
		const w = this.i[cell(this, h.J.b)];
		const hole = w.a === 3 && fg2.W_(w.b & 7, 3, 4);
		w.b = b8(w.b | 32);
		h = this.a;
		h.j_(h.J, false);
		if (hole) {
			h = this.a;
			const F = h.F;
			const hero = F === h.f;
			const L = h.L;
			const dx = (L.a - F.b.a) | 0;
			const dy = (L.b - F.b.b) | 0;
			this.G_(true, true);
			this.l0_(F, dx, dy, 0, hero);
			return true;
		}
		return false;
	}
	if (t === 18) {
		// clear tile / trap: type 8 / 9 for the hero, type 10 for anyone
		const w = this.i[cell(this, h.L)];
		const trap = h.F === h.f && fg2.W_(w.a, 8, 9);
		if (trap || w.a === 10) {
			const b = w.b;
			if ((b & 32) === 0) {
				w.b = b8(b | 32);
				h = this.a;
				const F = h.F;
				const L = h.L;
				const dx = (L.a - F.b.a) | 0;
				const dy = (L.b - F.b.b) | 0;
				this.G_(true, true);
				this.l0_(F, dx, dy, 0, trap);
				if (w.a === 9 && (w.b & 16) !== 0) w.B_(1, 18);
				return true;
			}
		}
		return false;
	}
	if (t === 13) return activate.call(this);
	if (fg2.W_(t, 1, 7)) {
		h = this.a;
		if (h.J.e_()) {
			const d = this.a.J;
			if (d.u_()) {
				const F = this.a.F;
				const k = F.k;
				if ((k === 1 || (k === 2 && F.s > 0)) && d.k === 2) this.i0_(d, true);
				if (c30.h0_(d)) this.a.O = d;
				this.a.H = 3;
				this.E0_(350);
				return true;
			}
			this.q_(d);
			if (this.U != null) {
				this.a.H = 10;
				this.E0_(350);
				return true;
			}
		}
		return false;
	}
	h = this.a;
	if (fg2.X_(h.G, 8, 15, 9)) {
		this.d1 = false;
		this.e1 = false;
		let i = 0;
		while (i < this.a.K.length) {
			const o = get(this.a.K, i);
			if (o.e_()) {
				const dead = o.u_();
				const h2 = this.a;
				if (!dead) {
					removeAt(h2.K, i);
					this.q_(o);
					continue;
				}
				if (h2.G !== 15 || o !== h2.F) {
					const F = h2.F;
					const k = F.k;
					if ((k === 1 || (k === 2 && F.s > 0)) && o.k === 2) this.i0_(o, false);
				}
				const h3 = this.a;
				if (h3.G !== 15 && h3.O == null && c30.h0_(o)) this.a.O = o;
			} else if (!o.a.s_()) {
				removeAt(this.a.K, i);
				continue;
			}
			i++;
		}
		if (this.e1) ui(this, 'b0_', true);
		if (this.d1) ui(this, 'H_');
		if (fg2.W_(this.a.G, 8, 15)) {
			h = this.a;
			if (h.G !== 8 || h.N.c0 !== 11) {
				const N = h.N;
				const c0 = N != null ? N.c0 : 0;
				const r = fg2.W_(c0, 4, 10) ? 2 : 1;
				for (let y = (this.a.L.b - r) | 0; ; y++) {
					const L = this.a.L;
					if (y > ((L.b + r) | 0)) break;
					for (let x = (L.a - r) | 0; x <= ((this.a.L.a + r) | 0); x++) {
						if (x >= 0 && y >= 0) {
							const W = this.g;
							if (x < W && y < this.h) {
								const w = this.i[(imul(W, y) + x) | 0];
								if (w.a === 10) {
									const b = w.b;
									if ((b & 32) === 0) w.b = b8(b | 32);
								}
							}
						}
					}
				}
			}
		}
		if (this.a.K.length !== 0) {
			this.a.H = 3;
			this.E0_(350);
			return true;
		}
		if (this.U != null) {
			this.a.H = 10;
			this.E0_(350);
			return true;
		}
	}
	return false;
}

/** R0, H == 2, G == 13: levers (32), fountains (48, 58, 95), shrines (38, 39), cauldrons (85..87) */
function activate() {
	const h = this.a;
	const J = h.J;
	if (J.e) return false;
	const id = J.a.a;
	if (id === 32) {
		J.e = true;
		const v = J.h;
		if (v === 1201) {
			const step = J.c ? 1 : this.g;
			const at = cell(this, J.b);
			const i1 = (at + step) | 0;
			if (this.i[i1].o_(true)) {
				const w = this.i[i1];
				w.b = b8(w.b & 127);
			}
			const i2 = (at - step) | 0;
			if (this.i[i2].o_(true)) {
				const w = this.i[i2];
				w.b = b8(w.b & 127);
			}
			this.b_(40, this.a.J, true);
			const h2 = this.a;
			h2.z = (h2.y - h2.i_()) | 0;
		} else {
			const o = h.r_(33, v);
			if (o != null) {
				const w = this.i[cell(this, o.b)];
				w.b = b8(w.b | 32);
				this.a.j_(o, false);
			}
		}
		return false;
	}
	if (fg2.W_(id, 38, 39)) {
		h.J.e = true;
		return false;
	}
	const J2 = h.J;
	const id2 = J2.a.a;
	if (id2 === 48) {
		J2.e = true;
		this.X_(0, 10, 0, 0, false, 0, false, false);
	} else if (id2 === 58) {
		J2.e = true;
		this.X_(0, 0, 7, 0, false, 0, false, false);
	} else if (id2 === 95) {
		J2.e = true;
		h.f.E = 100;
		this.X_(0, 10, 0, 0, false, 0, false, false);
		this.T0_();
	} else if (fg2.X_(id2, 85, 86, 87)) {
		const h2 = this.a;
		if (h2.J.h === 1008) {
			if (!h2.f.D.k_(h2.c.y)) {
				this.G_(true, false);
				return true;
			}
			this.W_(this.a.c.y, false, true);
			const J3 = this.a.J;
			J3.e = true;
			if (fg2.W_(J3.a.a, 85, 86)) this.e_(22, null, this.a.F, null, null, 0);
			const id3 = this.a.J.a.a;
			if (id3 === 85) {
				this.X_(0, 20, 0, 128, false, 0, false, false);
				this.K0_(this.a.F, null);
			} else if (id3 === 86) {
				this.X_(0, 0, 0, 1, false, 0, false, false);
			} else if (id3 === 87) {
				this.X_(0, 0, 30, 0, false, 0, false, false);
			}
			const h3 = this.a;
			this.J0_(h3.F, h3.J);
		}
	}
	return false;
}

// ---------------------------------------------------------------------------------------------
// c30 methods

install({
	/**
	 * void f(int type, aw actor, qw target, yv skill, boolean ui): start action `type`. Checks and pays the
	 * hero's costs (skill EP/MP via G0/H0, item presence, EP by type via V, consumes the item via W), then AP
	 * via u(). Non-hero throws (7) take the monster's ammo (bw.p0) and count down aw.w.
	 */
	f_(i, actor, target, skill, z) {
		this.z.length = 0;
		let h = this.a;
		if (h.F != null || this.d0 !== 0) return;
		h.G = i;
		h.F = actor;
		h.J = target;
		if (target != null) {
			const p = target.b;
			h.L = p;
			if (target.a.a === 94 && (i === 2 || i === 4)) {
				h.L = new Util$Point(p);
				h = this.a;
				const L = h.L;
				if (h.J.c) L.b = (L.b - 1) | 0;
				else L.a = (L.a + 1) | 0;
			}
		}
		h.H = 0;
		h.I = 0;
		h.O = null;
		this.T = null;
		this.U = null;
		h.M = skill;
		h.N = null;
		if (h.G === 16) {
			if (h.F !== h.f) { this.G_(false, false); return; }
			const J = h.J;
			if (J == null || !J.e_()) { this.G_(false, false); return; }
		}

		h = this.a;
		if (h.F === h.f) {
			if (this.V && fg2.b0_(h.G, 1, 7, 8, 24, 10, 12, 20)) {
				const W = this.W;
				if (W != null) {
					this.a.M = W;
				} else {
					const X = this.X;
					if (X == null) {
						this.j_();
						this.G_(false, false);
						return;
					}
					this.a.N = X;
				}
			}
			this.j_();
		} else if (h.G === 7) {
			const ammo = h.F.a.p0;
			if (ammo !== 0) h.N = item(ammo);
		}

		h = this.a;
		this.I_(h.F, h.L);
		h = this.a;
		let g = h.G;
		if (g === 16) h.J.c = !h.F.c;

		pay: {
			if (h.F === h.f) {
				if (g === 2) {
					// unseal: needs the target's MP cost (paid in R0), and a sealed boss only with 16384
					const mp = h.f.E_();
					const h2 = this.a;
					if (mp < h2.J.i_(h2.e)) break pay;
					if (this.a.J.e_()) {
						const t = this.a.J;
						if (t.a.m0 && !t.s_(16384)) break pay;
					}
				} else if (g === 1 || g === 7 || g === 8 || g === 24 || g === 10 || g === 12 || g === 20 || g === 21
					|| fg2.b0_(g, 9, 5, 6, 13, 18, 19, 3)) {
					const h2 = this.a;
					const sk = h2.M;
					if (sk != null) {
						if (!this.G0_(sk, z)) { this.G_(false, false); return; }
						this.H0_(this.a.M);
					} else {
						const it = h2.N;
						if (it != null && !h2.f.D.k_(it.a)) { this.G_(false, false); return; }
						const h3 = this.a;
						let ep;
						const t = h3.G;
						if (t === 6) ep = h3.c.r;
						else if (t === 19) ep = 4;
						else if (t === 3) ep = h3.J.a.j ? 2 : 0;
						else if (t === 18) ep = this.i[cell(this, h3.L)].a !== 10 ? 2 : 1;
						else if (t === 13) ep = h3.J.a.a === 32 && !h3.c.H ? 3 : 0;
						else ep = 1;
						if (ep > 0 && !this.V_(ep)) {
							if (z) this.e.S_(2131231518, str(this, 2131690615));
							this.G_(false, false);
							return;
						}
						const it2 = this.a.N;
						if (it2 != null) {
							this.W_(it2.a, false, true);
							if (this.a.G === 10) ui(this, 'f0_', 168);
						}
					}
				}
			} else if (fg2.W_(g, 7, 11)) {
				const F = this.a.F;
				const w = F.w;
				if (w > 0) F.w = (w - 1) | 0;
			}

			h = this.a;
			g = h.G;
			if (g === 16) { this.E0_(120); return; }
			if (g === 15) {
				h.H = 1;
				this.E0_(50);
				return;
			}
			let ap;
			const sk = h.M;
			if (sk != null) {
				ap = sk.e;
			} else if (fg2.X_(g, 3, 21, 4)) {
				ap = 3;
			} else {
				const h2 = this.a;
				const t = h2.G;
				if (t === 19 || t === 13) ap = 4;
				else if (t === 2) {
					if (h2.J == null) throw new TypeError('NullPointerException: hw.J'); // J.getClass()
					ap = 4;
				} else if (fg2.a0_(t, 7, 8, 24, 10, 12, 20)) ap = 4;
				else if (t === 11) ap = 2;
				else if (t === 18 && this.i[cell(this, h2.L)].a === 10) ap = 1;
				else ap = 3;
			}
			this.u_(this.a.F, ap, false, 120);
			return;
		}

		if (z) this.F0_();
		this.G_(false, false);
	},

	/**
	 * void R0(): advance the pending action one phase (hw.H). Called by the turn loop when the previous
	 * phase's animation (E0) has run out.
	 */
	R0_() {
		let h = this.a;
		const H = h.H;
		if (H === 0) {
			if (h.G === 16) {
				talk0(this);
				return;
			}
			// cauldrons (85..87): first touch marks them (h = 1008) and explains; afterwards they need pw.y
			dlg: {
				if (h.G === 13) {
					const J = h.J;
					if (!J.e && fg2.X_(J.a.a, 85, 86, 87)) {
						const h2 = this.a;
						const J2 = h2.J;
						if (J2.h !== 1008) {
							J2.h = 1008;
							break dlg;
						}
						if (!h2.f.D.k_(h2.c.y)) break dlg;
					}
				}
				const g = this.a.G;
				let t = g === 9 ? 150 : 120;
				let v = t;
				if (fg2.a0_(g, 7, 8, 24, 10, 12, 20)) {
					let h2 = this.a;
					const dx = iabs((h2.L.a - h2.F.b.a) | 0);
					h2 = this.a;
					const d = Math.max(dx, iabs((h2.L.b - h2.F.b.b) | 0));
					t = imul(t, d);
					v = t;
					if (this.a.G === 7 && d > 1) v = f2i(f32(f32(t) * f32(0.66)));
				}
				h = this.a;
				h.H = 1;
				h.I = 0;
				this.E0_(v);
				return;
			}
			const icon = item(this.a.c.y).u;
			const s = str(this, 2131689727);
			this.e.T_(this.a.J.a, s, icon, true, null, false, null, null, null);
			this.G_(true, false);
			return;
		}

		if (H === 1) {
			if (h.G === 16) {
				talk1(this);
				return;
			}
			hit: {
				const g = h.G;
				if (g === 2) {
					// unseal: pay the MP now
					const mp = h.f.E_();
					const h2 = this.a;
					const cost = h2.J.i_(h2.e);
					if (mp >= cost) {
						this.a.f.G_((mp - cost) | 0);
						const N = vj0.i2.N;
						N.w = (N.w + cost) | 0;
						this.a.J.h_();
						this.A0_(cost, -13590796, this.a.J);
						if (!this.a.J.e_()) {
							const J = this.a.J;
							this.b_(imul(J.a.v, 5), J, true);
						}
					}
				} else if (g === 6) {
					this.A0_(h.c.r, -10641, h.J);
					if (this.i[cell(this, this.a.J.b)].s_(3, 7, 4)) {
						this.I0_(true);
						break hit;
					}
				} else {
					if (g === 18) {
						this.I0_(this.i[cell(this, h.L)].s_(9, 7, 1));
						break hit;
					}
					if (g === 10) {
						// mechanical spider: clone template 199 from the hero, keep the stored HP
						if (h.q != null) { this.G_(false, false); return; }
						h.E_(h);
						h = this.a;
						const L = h.L;
						const s = h.K_(199, L.a, L.b, 1, h.f.c, false);
						this.T = s;
						h.q = s;
						h = this.a;
						const r = h.r;
						if (r > 0) {
							h.q.A_(r);
							this.a.r = 0;
						}
						ui(this, 'k0_');
						this.n_(this.a.q, true);
						this.a.H = 4;
						this.E0_(350);
						return;
					}
					if (fg2.W_(g, 1, 7)) {
						h = this.a;
						if (h.J.e_()) melee.call(this);
					} else {
						h = this.a;
						if (fg2.X_(h.G, 8, 15, 9)) {
							if (area.call(this)) return;
						} else {
							const t = h.G;
							if (t === 24) mpBomb.call(this);
							else if (fg2.W_(t, 11, 12)) {
								h = this.a;
								if (h.J.e_()) {
									const h2 = this.a;
									const d = h2.J;
									if (d.i_(h2.e) <= 0) {
										d.q = this.a.G === 12 ? 4 : 2;
										this.y0_(2131231723, 0, d);
										if (d === this.a.f) this.t0_();
									}
								}
							} else if (h.G === 20 && h.J.e_()) {
								const d = this.a.J;
								if (d.w_() && d.i_(this.a.e) <= 0 && c30.c0_(d)) {
									d.z_(2048);
									this.y0_(0, 2048, d);
								}
							}
						}
					}
				}
				const h9 = this.a;
				const J = h9.J;
				if (J != null) {
					const t = h9.G;
					if (t !== 8 && t !== 24 && t !== 15 && t !== 9 && t !== 3 && t !== 21 && t !== 4 && t !== 13) this.J0_(J, h9.F);
				}
			}
			this.a.H = 2;
			this.E0_(120);
			return;
		}

		if (H !== 2) {
			if (H === 3) {
				h = this.a;
				if (fg2.W_(h.G, 3, 5)) {
					h.j_(h.J, false);
				} else {
					const g = h.G;
					if (g === 21) {
						if (h.J.e_()) this.z_(this.a.J);
					} else if (fg2.W_(g, 1, 7)) {
						h = this.a;
						if (h.J.e_()) {
							const d = this.a.J;
							if (d.u_() && d !== this.a.O) this.z_(d);
						}
					} else {
						h = this.a;
						if (fg2.X_(h.G, 8, 15, 9)) {
							const K = this.a.K;
							const n = K.length;
							for (let i = 0; i < n; i++) {
								const o = get(K, i);
								if (o.e_()) {
									if (o.u_() && o !== this.a.O) this.z_(o);
								} else if (o.a.s_()) {
									this.a.j_(o, false);
								}
							}
						}
					}
				}
				const O = this.a.O;
				if (O != null) {
					this.G_(false, false);
					this.g_(O);
					return;
				}
			}
		} else if (resolve.call(this)) {
			return;
		}

		this.G_(true, true);
		this.E0_(this.a.f.u_() ? 1000 : 60);
	},

	/**
	 * boolean A(boolean): open a chest (G 3 / 5). Some chests are mimics (3, 26, 104..106: 20%; type 2 in
	 * forest / egypt dungeons: 8%): the chest is replaced by a monster carrying its loot. Returns true when
	 * the action continues (H = 3 or 4), false when a type-2 (k) chest was removed.
	 */
	A_(z) {
		if (this.a.J.a.a === 61) this.I0_(false);
		let h = this.a;
		let t = 350;
		if (h.F === h.f) {
			mimic: {
				if (!fg2.Z_(h.J.a.a, 3, 26, 106, 104, 105) || this.a.x.h_(100) >= 20) {
					h = this.a;
					const cfg = h.c;
					if ((!cfg.E && !cfg.F) || h.J.a.a !== 2 || h.x.h_(100) >= 8) {
						// a normal chest
						h = this.a;
						const J = h.J;
						const tp = J.a;
						if (!tp.i && !tp.m) break mimic;
						const loot = J.b_();
						if (loot !== 0) {
							this.U_(loot);
							ui(this, 'H_');
							const J2 = this.a.J;
							J2.e = true;
							if (J2.a.k !== 1) this.z0_(J2, loot, z, 0);
							if (fg2.X_(this.a.J.a.a, 7, 102, 122)) this.X_(0, 8, 0, 0, false, 0, false, false);
							else if (fg2.Z_(this.a.J.a.a, 66, 67, 68, 69, 70)) this.X_(0, 0, 5, 0, false, 0, false, false);
						}
						h = this.a;
						const J3 = h.J;
						if (J3.a.k === 2) {
							h.j_(J3, false);
							return false;
						}
						break mimic;
					}
				}
				const loot = this.a.J.b_();
				h = this.a;
				h.j_(h.J, false);
				h = this.a;
				const J = h.J;
				const id = J.a.a;
				let m;
				if (id === 106) m = 602;
				else if (id === 104) m = 604;
				else if (id === 105) m = 606;
				else if (id === 2) m = 286;
				else if (id === 3) m = h.c.F ? 352 : 275;
				else m = h.c.F ? 351 : 214;
				const p = J.b;
				const x = p.a, y = p.b;
				const q = h.F.b;
				const flip = !(((q.a - x) | 0) >= 0 && ((q.b - y) | 0) >= 0);
				const c = h.K_(m, x, y, 2, flip, false);
				this.T = c;
				c.g = loot !== 0 ? loot : -1;
				c.z_(64);
				h = this.a;
				h.J = null;
				h.H = 4;
				this.E0_(350);
				return true;
			}
		}
		h.H = 3;
		if (h.G === 3) t = 300;
		this.E0_(t);
		return true;
	},

	/**
	 * boolean P0(boolean): take a pickup-able object (rw.n) for the hero: loot, objective count, item 94
	 * (20% spawns monster 605 holding the loot), 54 (+8 EP, 50% spawns 349), 124 (+5 MP). True when a monster
	 * appeared (H = 4).
	 */
	P0_(z) {
		let h = this.a;
		if (h.F !== h.f) return false;
		const J0 = h.J;
		if (!J0.a.n || J0.e) return false;
		const obj = J0.f_(h);
		const loot = this.a.J.b_();
		h = this.a;
		const pt = this.a1;
		let c;
		spawn: {
			if (h.J.a.a === 94 && h.x.h_(100) < 20) {
				h = this.a;
				if (!this.P_(h.L, h.f.b, -3, pt)) {
					h = this.a;
					if (!this.P_(h.J.b, h.f.b, -3, pt) && !this.P_(this.a.f.b, null, -1, pt) && !this.Q_(4, -3, this.a.f.b, pt)) {
						c = null;
						break spawn;
					}
				}
				c = this.a.K_(605, pt.a, pt.b, 2, false, false);
				this.I_(c, this.a.f.b);
				c.g = loot !== 0 ? loot : -1;
				c.z_(64);
				break spawn;
			}
			c = null;
		}
		if (loot !== 0 && c == null) {
			this.U_(loot);
			ui(this, 'H_');
			this.z0_(this.a.J, loot, z, 0);
		}
		h = this.a;
		h.J.e = true;
		if (obj) h.z = (h.y - h.i_()) | 0;
		if (c != null) {
			this.T = c;
			h = this.a;
			h.J = null;
			h.H = 4;
			this.E0_(350);
			return true;
		}
		const id = this.a.J.a.a;
		if (id === 54) {
			this.X_(0, 8, 0, 0, false, 0, false, false);
			if (this.a.x.h_(100) < 50) {
				h = this.a;
				const J = h.J;
				const f = h.f;
				let m;
				if (!this.P_(J.b, null, -1, pt) && !this.Q_(4, -3, f.b, pt)) {
					m = null;
				} else {
					m = this.a.K_(349, pt.a, pt.b, 2, false, false);
					this.I_(m, f.b);
					this.K0_(m, null);
				}
				this.T = m;
				if (m != null) {
					h = this.a;
					h.J = null;
					h.H = 4;
					this.E0_(350);
					return true;
				}
			}
		} else if (id === 124) {
			this.X_(0, 0, 5, 0, false, 0, false, false);
		}
		return false;
	},

	/**
	 * boolean X(int hp, int ep, int mp, int status, boolean cure, int ap, boolean anim, boolean test): the
	 * hero recovers (potions, fountains, chests). hp < 0 is a cost (refused when it would kill). status sets
	 * an aw.p flag; cure lowers poison (aw.u) by 250; ap < 0 grants AP. With test, only reports whether
	 * anything would change. Pays max(ap, 0) AP through u().
	 */
	X_(hp, ep, mp, st, cure, ap, anim, test) {
		if (hp < 0 && this.a.f.j.v_() <= ((-hp) | 0)) return false;
		let any;
		if (st !== 0 && !this.a.f.s_(st)) {
			if (!test) {
				this.a.f.z_(st);
				this.y0_(0, st, this.a.f);
			}
			any = true;
		} else {
			any = false;
		}
		if (hp > 0) {
			const max = this.a.f.q_();
			if (this.a.f.j.v_() < max) {
				if (!test) {
					const before = this.a.f.j.v_();
					let f = this.a.f;
					f.A_(Math.min((f.j.v_() + hp) | 0, max));
					const got = (this.a.f.j.v_() - before) | 0;
					const rest = (hp - got) | 0;
					f = this.a.f;
					const u = f.u;
					if (u > 0 && rest > 0) f.u = Math.max((u - rest) | 0, 0);
					this.A0_(got, -14626784, this.a.f);
				}
				any = true;
			}
		}
		if (ep > 0) {
			const max = this.a.f.D_();
			if (this.a.f.z.v_() < max) {
				if (!test) {
					const before = this.a.f.z.v_();
					const f = this.a.f;
					f.z.z_(Math.min((f.z.v_() + ep) | 0, max));
					this.A0_((this.a.f.z.v_() - before) | 0, -10641, this.a.f);
				}
				any = true;
			}
		}
		if (mp > 0) {
			const cur = this.a.f.E_();
			const max = this.a.f.y.n_();
			if (cur < max) {
				if (!test) {
					const add = Math.min(mp, (max - cur) | 0);
					this.a.f.G_((cur + add) | 0);
					this.A0_(add, -13590796, this.a.f);
				}
				any = true;
			}
		}
		if (cure) {
			const h = this.a;
			const f = h.f;
			const u = f.u;
			if (u > 0 || (h.C && u >= 0)) {
				if (!test) {
					f.u = Math.max((u - 250) | 0, h.C ? -125 : 0);
					const f2 = this.a.f;
					if (f2.u < 0) this.y0_(2131231393, 0, f2);
				}
				any = true;
			}
		}
		let ok;
		apGrant: {
			if (ap < 0) {
				const max = (this.a.f.r_() + 1) | 0;
				const cur = this.a.f.n.v_();
				if (cur < max) {
					ok = true;
					if (!test) this.a.f.B_(Math.min((cur - ap) | 0, max));
					break apGrant;
				}
			}
			ok = any;
		}
		if (ok && hp < 0 && !test) {
			const cur = this.a.f.j.v_();
			this.a.f.A_((cur + hp) | 0);
			this.A0_((-hp) | 0, -3193566, this.a.f);
		}
		if (ok && !test) this.u_(this.a.f, Math.max(ap, 0), anim, anim ? 200 : 0);
		return ok;
	},

	/** boolean Y(bj0, int ap, boolean anim, boolean test): use a consumable (X with the item's values) */
	Y_(it, ap, anim, test) {
		const v = vj0.i2;
		const hp = v.I0_(it);
		const id = it.a;
		const ep = v.H0_(it);
		let mp = it.Z;
		if (mp > 0 && id === 217) {
			const k = v.m[34].i;
			if (k > 0) mp = (mp + k) | 0;
		}
		return this.X_(hp, ep, mp, it.a0, id === 304, ap, anim, test);
	},

	/** boolean G0(yv, boolean ui): the hero has the skill's EP (f) and MP (g); else toast / dialog */
	G0_(s, z) {
		const ep = s.f;
		const mp = s.g;
		if (ep > 0 && this.a.f.z.v_() < s.f) {
			if (z) {
				this.e.S_(2131231518, str(this, 2131690615));
				return false;
			}
		} else {
			if (mp <= 0 || this.a.f.E_() >= mp) return true;
			if (z) this.F0_();
		}
		return false;
	},

	/** void H0(yv): pay the skill's EP and MP (MP spent counts in pj0.w) */
	H0_(s) {
		const ep = s.f;
		const mp = s.g;
		if (ep > 0) {
			const f = this.a.f;
			const cur = f.z.v_();
			f.z.z_((cur - s.f) | 0);
		}
		if (mp > 0) {
			const f = this.a.f;
			f.G_((f.E_() - mp) | 0);
			const N = vj0.i2.N;
			N.w = (N.w + mp) | 0;
		}
	},

	/** boolean V(int): pay EP if the hero has it */
	V_(n) {
		if (this.a.f.z.v_() < n) return false;
		const f = this.a.f;
		const cur = f.z.v_();
		f.z.z_((cur - n) | 0);
		return true;
	},

	/**
	 * int W(int id, boolean refund, boolean ui): consume one item id. With refund, an item flagged bj0.n0
	 * returns item 224 when quest line 4 step 2 is done (result 4, else 3).
	 */
	W_(id, refund, z) {
		let r;
		if (this.a.f.D.q_(id, 1) && refund && item(id).n0 && vj0.i2.o[4].h0_(2)) {
			this.a.f.D.b_(224, 1);
			r = 4;
		} else {
			r = 3;
		}
		if (z) {
			ui(this, 'G_', id);
			if (r === 4) ui(this, 'H_');
		}
		return r;
	},

	/**
	 * void u(aw, int ap, boolean think, int t): spend ap AP (in combat), tick the hero's haste (mw.E), let
	 * poison (aw.u) act (e(23)), optionally re-plan (k()), then wait t ms (E0).
	 */
	u_(c, ap, think, t) {
		const f = this.a.f;
		if (c === f) {
			let e = f.E;
			if (e > 0) {
				e = (e - ap) | 0;
				f.E = e;
				if (e <= 0) {
					f.E = 0;
					this.T0_();
				}
			}
		}
		if (c.u > 0 && ap > 0) this.e_(23, null, c, null, null, ap);
		if (this.a.C) {
			if (ap > 0) c.B_((c.n.v_() - ap) | 0);
			if (think) this.k_();
		}
		if (t > 0) this.E0_(t);
	},

	/** void g(aw): explosion centred on c (K = c + every visible hostile critter / breakable around it) */
	g_(c) {
		const h = this.a;
		h.L = c.b;
		h.K.length = 0;
		this.a.K.push(c);
		for (let y = Math.max((this.a.L.b - 1) | 0, 0); y <= Math.min((this.a.L.b + 1) | 0, (this.h - 1) | 0); y++) {
			for (let x = Math.max((this.a.L.a - 1) | 0, 0); x <= Math.min((this.a.L.a + 1) | 0, (this.g - 1) | 0); x++) {
				const i = (imul(this.g, y) + x) | 0;
				if (this.j[i] > 0) {
					const h2 = this.a;
					const o = h2.k[i];
					if (o != null && o !== c && o.i_(h2.e) <= 0 && ((o.e_() && zw.o_(c.k, o.k)) || o.a.s_())) this.a.K.push(o);
				}
			}
		}
		this.f_(15, c, null, null, false);
	},

	/** boolean B(aw puller, aw target, bj0 hook): pull target next to puller (hook 209 for the hero: 1 EP) */
	B_(a, t, it) {
		const f = this.a.f;
		if (a !== f || (f.z.v_() >= 1 && (it == null || this.a.f.D.k_(it.a)))) {
			const pt = this.a1;
			if (this.P_(a.b, null, -1, pt)) {
				const px = pt.a;
				const tb = t.b;
				const tx = tb.a;
				const py = pt.b;
				const ty = tb.b;
				const from = new Util$Point(tb);
				if (this.l0_(t, (px - tx) | 0, (py - ty) | 0, -1, false) === 1) {
					if (a === this.a.f) {
						this.V_(1);
						if (it != null) this.W_(it.a, false, true);
					}
					this.z.length = 0;
					this.I_(a, t.b);
					this.u_(a, 3, true, 190);
					this.K0_(t, from);
					this.K0_(t, null);
					return true;
				}
			}
		}
		return false;
	},

	/** void Q0(): close the current dialog wait */
	Q0_() {
		this.g0 = false;
		this.d0 = 0;
		this.e0 = 0;
		this.f0 = false;
		ui(this, 'invalidate');
	},

	/** boolean i(bj0): familiar item 225..227 can be used (its pet is hired, not out, and has charges) */
	i_(it) {
		const k = (it.a - 225) | 0;
		if (k >= 0 && k < this.a.e.l.length) {
			const h = this.a;
			const s = h.v[k];
			if (s != null && s.a == null && s.b > 0 && get(h.e.l, k).k > 0 && (this.a.f.C.v_() > 0 || s.c.v_() > 0)) return true;
		}
		return false;
	},

	/** void G(boolean count, boolean ui): end the pending action (clears hw.F / J / K / O and c30.T / U) */
	G_(cnt, z) {
		const h = this.a;
		const hero = h.F === h.f;
		h.F = null;
		h.J = null;
		h.K.length = 0;
		this.a.O = null;
		this.T = null;
		this.U = null;
		if (cnt && hero) vj0.i2.g2_(true);
		if (z) ui(this, 'k0_');
	},

	/** void H(boolean ask): use the Ariadne thread (173) to leave the dungeon (ask = show the dialog) */
	H_(ask) {
		const h = this.a;
		if (!h.C && !this.w && !this.v && h.f.D.k_(173)) {
			if (ask) {
				ui(this, 'g_', true);
				return;
			}
			this.a.f.D.q_(173, 1);
			ui(this, 'G_', 173);
			this.K_();
		}
	},

	/** void I0(boolean): dig / trap particles from hw.L towards the actor (cosmetic; only scratch points) */
	I0_(z) {
		const L = this.a.L;
		const p1 = this.a1;
		this.N0_(L.a, L.b, p1, false);
		const h = this.a;
		const L2 = h.L;
		const F = h.F.b;
		const p2 = this.c1;
		this.N0_((L2.a - F.a) | 0, (L2.b - F.b) | 0, p2, false);
		const z0 = this.z0;
		if (z0 != null && typeof z0.c_ === 'function') {
			z0.c_(z ? 2 : 0, f32(p1.a), f32(p1.b - 80), f32(f32(p2.a) * f32(0.45)), f32(f32(p2.b) * f32(0.45)));
		}
	},

	/**
	 * void r0(int page, aw npc, kj0 quest, boolean start): show page `page` of the quest's dialog chain
	 * (kj0.Z); the last page unlocks the quest's referral NPCs (B0) and, unless starting, ticks the current
	 * per-level step. The dismiss callback (u20) shows the next page or ends the talk.
	 */
	r0_(page, npc, q, start) {
		this.E0_(500);
		this.g0 = true;
		this.a.H = 1;
		const pg = q.Z[page];
		const who = zw.c_(pg.b);
		const last = page >= ((q.Z.length - 1) | 0);
		if (last) {
			this.B0_(q);
			if (!start && q.c0) {
				const s = q.m_(this.a.b);
				if (s != null && s.T) {
					const g = s.g;
					if (g !== -1) {
						q.B_(g);
						vj0.i2.r0 = true;
					}
				}
			}
		}
		const loot = last ? npc.b_() : 0;
		const icon = loot === 0 ? 0 : item(loot).u;
		const text = str(this, pg.c);
		this.e.T_(who, text, icon, false, last && start ? q : null, false, null, null, U20(this, last, q, npc, page, start));
	},

	/** void B0(kj0): the quest's referral NPCs (h = quest id + 2000, faction 0) become talkers (1003) */
	B0_(q) {
		if (q.X != null) {
			const list = this.a.o;
			const n = list.length;
			for (let i = 0; i < n; i++) {
				const c = list[i];
				if (c.h === ((q.a + 2000) | 0) && c.k === 0) c.h = 1003;
			}
		}
	},
}, {
	/** static void a(uw): statistics for a caught pet (pj0.q per rank, vj0.S0 sorted by zw.L order) */
	a_(u) {
		let r = u.d;
		const tp = u.a;
		const v = vj0.i2;
		const q = v.N.q;
		if (r < q.length) q[r] = (q[r] + 1) | 0;
		const list = v.S0;
		const n = list.length;
		let s = null;
		for (let i = 0; i < n; i++) {
			const e = list[i];
			if (e.a === tp.a) { s = e; break; }
		}
		if (s == null) {
			let at = 0;
			if (vj0.i2.S0.length !== 0) {
				const L = zw.L;
				outer: for (let k = 0; k < L.length; k++) {
					const row = L[k];
					for (let j = 0; j < row.length; j++) {
						const id = row[j];
						if (id === tp.a) break outer;
						if (id === get(vj0.i2.S0, at).a) {
							at = (at + 1) | 0;
							if (at >= vj0.i2.S0.length) break outer;
						}
					}
				}
			}
			s = { $class: 'sj0', a: tp.a, b: 0, c: 0 };
			const S0 = vj0.i2.S0;
			if (at < 0 || at > S0.length) throw new Error(`IndexOutOfBoundsException: ${at}`);
			S0.splice(at, 0, s);
		}
		s.b = (s.b + 1) | 0;
		s.c = b8(b8(1 << u.d) | s.c);
	},
});
