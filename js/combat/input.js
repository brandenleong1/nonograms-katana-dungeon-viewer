// The input layer: a minimal headless DungameView (only the fields the rules read and write), the tap branch of
// DungameView.onTouchEvent (DOWN then UP), the toolbar handler DungameView.d0(id, item, false), and the c30
// view-side helpers C0 (screen -> cell), N0 (cell -> screen), O0, q0, N, O, S, b0, L, j (clear selection), k0.
// Sources: smali com/ucdevs/jcross/d/DungameView (ground truth), its Vineflower decompile
// (../nonograms-katana/decompiled/vineflower/com/ucdevs/jcross/d/DungameView.java: onTouchEvent 4158-4688,
// d0 1622-2622; it matches the smali where JADX is garbled), decompiled/vineflower/c30.java.
//
// Headless rules, as in the oracle (TraceAgent fight mode): every other DungameView method is a no-op (toolbar
// widgets, invalidate, camera l0, sounds); T (dialog) and S (toast) go to the fight hook (driver.js); the sprite
// pick list c30.I0 is never filled (it is built by the renderer c30.D), so a tap picks hw.k at the tapped cell.
import { register, classes } from '../gen/registry.js';
import { zw, vj0 as V } from '../gen/statics.js';
import { imul, idiv, f32, f2i } from '../gen/jrt.js';
import { fg2, Util$Point } from '../gen/model.js';
import { c30, install } from './c30.js';

/**
 * static String vj0.d0(Context, int id, int n): getString(2131690924) + UApp.n(true) + getString(id) + " " +
 * vj0.O0(ctx, n) where O0 = getString(2131690511) + " " + n (the bait's "needs taming N" toast). UApp.n returns ""
 * headless (oracle: neutralised UApp).
 */
function vj0d0(ctx, id, n) {
	return ctx.getString(2131690924) + '' + ctx.getString(id) + ' ' + (ctx.getString(2131690511) + ' ' + n);
}

/** android.content.Context stand-in: strings come back as "#<resId>" (as the oracle's stub). */
export class Context {
	getString(id) { return '#' + id; }
	getString_(id) { return '#' + id; }
}

/** Toolbar button stand-in (ToolbarItem): selection only. */
export class ToolbarItem {
	constructor() { this.selected = false; }
	setSelected(z) { this.selected = z; }
	isSelected() { return this.selected; }
}

/** The fight hook: dialogs captured from T (run by the settle loop), toasts and dialog texts. */
export class FightHook {
	constructor() {
		this.dialogs = [];
		this.dialogCount = 0;
		this.msgs = [];
	}
}

/**
 * DungameView: the dungeon view. Fields keep their Java names (smali .field list); only those the input rules
 * touch exist here. u = c30, a = Context, G/H = view size, F/E = scale, S/T = DOWN point, Q/R = current point,
 * U/V = last point, W = touch down, a0 = dragging, b0 = maybe-tap, c0/k0/l0 = gesture flags, o0 = pointer id,
 * r = selected toolbar id, C0 = webbed-hint flag, q = the three toolbar rows (no children headless).
 */
export class DungameView {
	constructor() {
		this.u = null;
		this.a = null;
		this.hook = new FightHook();
		this.G = 1024; this.H = 1024; this.F = f32(1); this.E = f32(1); this.t = f32(1);
		this.Q = 0; this.R = 0; this.S = 0; this.T = 0; this.U = 0; this.V = 0;
		this.W = true;
		this.a0 = false; this.b0 = false; this.c0 = false; this.h0 = false; this.k0 = false; this.l0 = false;
		this.o0 = -1;
		this.r = 0;
		this.C0 = false;
		this.q = [[], [], []];
		this.f0 = null;   // VelocityTracker
		this.e0 = null;   // ScaleGestureDetector
	}

	invalidate() {}

	/** void S(int icon, String text): toast */
	S_(icon, text) {
		this.hook.msgs.push(`S:${icon}:${text}`);
	}

	/**
	 * void T(rw, String text, int, boolean, kj0, boolean, dj0, kj0, Runnable dismiss): speech / boss dialog.
	 * The game sets c30.g0 = true before every T with a callback; the settle loop runs the callback (oldest first).
	 * dismiss: a JS function, or an object with run_() / run().
	 */
	T_(_rw, text, _i, _z, _k1, _z2, _dj, _k2, dismiss) {
		const h = this.hook;
		h.dialogCount++;
		h.msgs.push('T:' + text);
		if (dismiss != null) h.dialogs.push(dismiss);
	}

	/** int x(yv): toolbar icon of a pref skill (cosmetic) */
	x_(sk) {
		const p = sk.p;
		const d = sk.d;
		if (p !== 0) {
			const a = sk.a;
			if (a === 20200 ? this.u.l0 : a === 20201 ? this.u.i0 : a === 20202 && this.u.j0) return p;
		}
		return d;
	}

	/**
	 * boolean onTouchEvent(MotionEvent): single pointer only. ev = { action: 0 DOWN | 1 UP | 3 CANCEL, x, y }.
	 * DOWN records the point; UP without a drag (a0) is a tap, handled by the inlined c30 tap code below.
	 */
	onTouchEvent_(ev) {
		if (!(this.G > 0 && this.H > 0)) return false;
		const action = ev.action;
		this.Q = f32(ev.x);
		this.R = f32(ev.y);
		// (multi-touch / scale-gesture bookkeeping: with one pointer and k0 false nothing changes)
		if (action !== 0) {
			if (action !== 1) {
				if (action === 2) throw new Error('DungameView.onTouchEvent: MOVE is not modelled');
				if (action !== 3) return true;
			}
			if (!this.c0) {
				if (this.k0) throw new Error('DungameView.onTouchEvent: multi-touch is not modelled');
				else if (this.a0) { /* F(ev): end of a drag (fling) - camera only */ }
				else this.tap_();
			}
			this.W = false;
			this.a0 = false;
			this.l0 = false;
			this.k0 = false;
			this.f0 = null;
			this.e0 = null;
			this.invalidate();
		} else {
			const x = this.Q;
			this.S = x;
			this.U = x;
			const y = this.R;
			this.T = y;
			this.V = y;
			this.W = true;
			this.h0 = false;
			this.f0 = {};
			this.c0 = false;
			this.l0 = false;
			this.k0 = false;
			this.o0 = -1;
			this.a0 = false;
			this.b0 = true;
			this.invalidate();
		}
		return true;
	}

	/** The tap (UP) branch of onTouchEvent: c30 code inlined into the view (Vineflower 4300-4672). */
	tap_() {
		const c = this.u;
		const sx = f2i(f32(this.S / this.F));
		const sy = f2i(f32(this.T / this.F));
		let pt = c.Z0;
		const path = c.z;
		if (path.length !== 0 && c.g0_()) path.length = 0;
		const h0 = c.a;
		if (!(h0.F == null && c.O == null && !c.w && !h0.f.u_() && c.g0_())) return;
		// label632: sprite pick over c30.I0 (newest first); headless I0 is empty
		c.a0 = null;
		pt.a = -1;
		const r90 = 1;
		if (!c.l0 && c.J0 - 1 >= 0) throw new Error('DungameView tap: sprite pick (c30.I0) is not modelled');
		let o = null;
		let tx = pt.a;
		if (tx === -1) {
			c.C0_(sx, sy, pt);
			tx = pt.a;
			if (tx >= 0) {
				const ty = pt.b;
				if (ty >= 0) {
					const g = c.g;
					if (tx < g && ty < c.h) o = c.a.k[(ty * g + tx) | 0];
				}
			}
		}
		let v77 = tx;
		if (c.l0) {
			const m0 = c.m0;
			if (m0 == null || m0.a !== v77 || m0.b !== pt.b) {
				c.m0 = new Util$Point(pt);
				return;
			}
		}
		const hero = c.a.f;
		L565: if (hero.t <= 0 || zw.p_(r90, 0, hero.b, pt)) {
			if (c.q) {
				const hp = c.a.f.b;
				const ddx = (hp.a - pt.a) | 0;
				const ddy = (hp.b - pt.b) | 0;
				if (((imul(ddy, ddy) + imul(ddx, ddx)) | 0) > c.t) break L565;
			}
			if (c.V) {
				if (c.d0 !== 0) break L565;
				const X = c.X;
				if (X != null && fg2.W_(X.c0, 6, 7)) {
					// mechanical spider (6) / familiar (7): onto a free adjacent cell
					if (!c.d0_(pt)) break L565;
					const h = c.a;
					const ax = pt.a, ay = pt.b;
					const free = ax >= 0 && ay >= 0 && ax < h.g && ay < h.h ? h.A_(ax, ay) : false;
					if (!free) break L565;
					const it = c.X;
					if (it.c0 !== 7) {
						const h2 = c.a;
						if (h2.q != null) c.j_();
						else {
							h2.L = new Util$Point(pt);
							c.f_(10, c.a.f, null, null, true);
						}
						break L565;
					}
					const at = new Util$Point(pt);
					const ok = c.i_(it);
					const id = it.a;
					if (ok && c.a.f.D.k_(id)) {
						const slot = (id - 225) | 0;
						const h3 = c.a;
						const pet = h3.v[slot];
						const comp = h3.e.l[slot];
						classes.hw.F_(zw.c_((id - 30) | 0), comp);
						c.I_(c.a.f, at);
						const h4 = c.a;
						const cr = h4.K_((id - 30) | 0, at.a, at.b, 1, h4.f.c, false);
						c.T = cr;
						pet.a = cr;
						cr.A_(pet.b);
						pet.b = 0;
						pet.a.w = pet.e;
						if (c.a.f.C.v_() > 0) {
							const k = c.a.f.C;
							k.z_((k.v_() - 1) | 0);
						} else {
							const k = pet.c;
							k.z_((k.v_() - 1) | 0);
						}
						c.a.e.l[slot].c_();
						c.c_(20);
						const n = Math.min(c.a.e.l.length, 3);
						for (let i = 0; i < n; i++) c.e.G_((i + 225) | 0);
						c.e.f0_(id);
						c.e.k0_();
						c.K0_(pet.a, null);
						c.n_(pet.a, false);
						c.u_(c.a.f, 3, true, 350);
					}
					c.j_();
					break L565;
				}
				const X2 = c.X;
				if (X2 != null && X2.c0 === 12) {
					if (c.d0_(pt) && o != null && o.e_()) {
						const m = o;
						if (m.a.m0 && !m.s_(16384) && !zw.n_(c.a.b) && c.a.f.D.k_(c.X.a)) {
							c.W_(c.X.a, false, true);
							m.z_(16384);
							path.length = 0;
							c.I_(c.a.f, m.b);
							c.I_(m, c.a.f.b);
							c.u_(c.a.f, 4, true, 190);
							c.K0_(m, null);
							c.K0_(c.a.f, null);
							c.j_();
						}
					}
					break L565;
				}
				if (X2 != null && fg2.Z_(X2.c0, 2, 3, 4, 10, 11)) {
					// area items (grenade ...): every revealed object in the square around the target cell
					if (!c.d0_(pt)) break L565;
					const h = c.a;
					const me = h.f;
					const k8 = c.X.c0;
					const is4 = k8 === 4;
					const is10 = k8 === 10;
					const is11 = k8 === 11;
					h.L = new Util$Point(pt);
					c.a.K.length = 0;
					const r = fg2.W_(c.X.c0, 4, 10) ? 2 : 1;
					let any = false;
					for (let yy = Math.max((c.a.L.b - r) | 0, 0); yy <= Math.min((c.a.L.b + r) | 0, (c.h - 1) | 0); yy++) {
						for (let xx = Math.max((c.a.L.a - r) | 0, 0); xx <= Math.min((c.a.L.a + r) | 0, (c.g - 1) | 0); xx++) {
							const i = (imul(c.g, yy) + xx) | 0;
							let nany = any;
							if (c.j[i] > 0) {
								const h5 = c.a;
								const q = h5.k[i];
								if (q == null) nany = any;
								else if (q === me) {
									if (!is4 && !is10) {
										if (!is11) break L565;
									}
									nany = any;
								} else {
									L511: {
										if (is10) {
											if (!q.e_()) break L511;
											if (!zw.o_(me.k, q.k)) break L511;
											if (q.i_(c.a.e) <= 0) break L511;
											c.a.K.push(q);
										} else if (is11) {
											if (!q.e_()) break L511;
											if (!zw.o_(me.k, q.k)) break L511;
											c.a.K.push(q);
										} else {
											if (q.i_(h5.e) > 0) break L511;
											if (!q.e_() && !q.a.s_()) break L511;
											c.a.K.push(q);
											if (!q.e_()) break L511;
											if (!zw.o_(me.k, q.k)) break L511;
										}
										nany = true;
									}
								}
							}
							any = nany;
						}
					}
					if (any) c.f_(is10 ? 24 : 8, me, null, null, true);
					break L565;
				}
				if (o != null && o.e_() && o.i_(c.a.e) > 0) {
					// sealed critter: no item on it
					path.length = 0;
					c.j_();
					c.e.S_(2131231634, c.d.getString(2131690579));
					break L565;
				}
				if (c.X != null) {
					if (!c.d0_(pt) || o == null) break L565;
					pt = o.b;
					if (!o.e_()) break L565;
					const m = o;
					if (!zw.o_(c.a.f.k, m.k)) break L565;
					const kind = c.X.c0;
					if (kind === 9) {
						// hook
						if (!c.a.f.b.c_(pt) && m.q === 0 && !m.a.l0) {
							c.B_(c.a.f, m, c.X);
							c.j_();
						}
						break L565;
					}
					if (kind === 1) {
						// kunai
						if (!c.a.f.b.c_(pt)) c.f_(7, c.a.f, o, null, true);
						break L565;
					}
					if (kind === 5) {
						// net
						if ((!c.a.f.b.c_(pt) || m.w_()) && m.q === 0 && (!m.w_() || m.s_(2048))) c.f_(12, c.a.f, o, null, true);
						break L565;
					}
					if (kind === 8 && m.w_() && c30.c0_(m) && !m.s_(2048) && c.a.f.F.length < 4) {
						const comp = c.R_(m);
						const has = c.a.e.b_(comp);
						const rank = comp.d;
						let msg = null;
						if (!has) msg = vj0d0(c.d, zw.r[15].b, (rank + 1) | 0);
						let text = msg;
						if (rank >= 2 && c.X.a !== 236) text = (msg == null ? '' : msg + '\n\n') + c.d.getString(2131689644);
						if (text != null) {
							c.e.S_(c.X.u, text);
							c.j_();
						} else {
							c.f_(20, c.a.f, o, null, true);
						}
					}
					break L565;
				}
				const W = c.W;
				if (W != null && W.k && (o == null || !o.e_() || !zw.o_(c.a.f.k, o.k))) {
					path.length = 0;
					break L565;
				}
			}
			if (o != null) {
				const r7 = c.o_(o);
				if (r7 === 2 && c.d0 === 0) {
					c.f_(2, c.a.f, o, null, false);
					break L565;
				}
				v77 = r7;
				if (r7 === -1) {
					c.F0_();
					break L565;
				}
			} else {
				v77 = 0;
			}
			L542: if (o != null && o.a.a === 88) {
				if (c.a.c.H) {
					const hh = o.h;
					if ((hh & 16384) !== 0 && V.i2.m[(hh & 16256) >>> 7].i === 0) break L542;
				}
				const p = o.b;
				pt.a = (p.a + 1) | 0;
				pt.b = (p.b - 1) | 0;
			}
			const h43 = c.a;
			if (h43.t_(h43.f.b, c.Z0, path, 45, 45, -1, false, 0) !== 0 && v77 !== 0) c.a0 = o;
			const h44 = c.a;
			c.A = !(h44.C || ((!c.i0 || h44.e.h[13] <= 0) && path.length < 13));
			c.f0 = false;
		}
	}

	/**
	 * void d0(int id, ToolbarItem item, boolean fromUser): toolbar press. Skills (zw.q, id >= 20000; 20200..20202
	 * toggle prefs), items (vj0.Z1). Targeted ones become the selection (c30.V/W/X, plus the range mask c30.Y / Z
	 * for items); pressing the selected one again deselects it. Port of Vineflower 1622-2622 except items 173
	 * (thread), 185 (companion) and 237-239 (teleport), which throw.
	 */
	d0_(id, item, z) {
		const c = this.u;
		if (c == null) return;
		const pt = c.a1;
		const path = c.z;
		if (path.length !== 0 && c.g0_()) path.length = 0;
		let v4 = 0, v5 = 0;
		L787: {
			L786: {
				L785: {
					let v85 = 0;
					L861: {
						L781: {
							L837: {
								if (c.d0 === 0 && !c.w && !c.a.f.u_() && c.g0_()) {
									const sel = c.V;
									const selSkill = sel ? c.W : null;
									const selItem = sel ? c.X : null;
									c.j_();
									L777: if (id >= 20000) {
										if (id === 20200) { c.l0 = !c.l0; c.m0 = null; break L786; }
										if (id === 20201) { c.i0 = !c.i0; break L786; }
										if (id === 20202) { c.j0 = !c.j0; break L786; }
										const sk = zw.q.get(id) ?? null;
										if (sk != null) {
											const sa = sk.a;
											const h = c.a;
											const nw = h.e;
											v85 = 2;
											v4 = sk.o;
											if (v4 === -1 || nw.h[v4] >= 1) {
												if ((h.C ? !sk.h : !sk.i) || !c.G0_(sk, true)) { v4 = 0; break L785; }
												if (sk.j) {
													if (selSkill !== sk) {
														c.V = true;
														c.W = sk;
														c.X = null;
														v4 = 5;
														break L785;
													}
													break L837;
												}
												if (id === 20001) {
													c.p0_();
													c.E0_(200);
													break L837;
												}
												if (id === 20005) {
													let ep = sk.n;
													if (sa === 20005) ep = (ep + V.i2.m[12].i) | 0;
													if (!c.X_(0, ep, 0, 0, false, sk.e, true, false)) break L861;
													c.H0_(sk);
													break L781;
												}
												if (id === 20006) {
													if (c.a.f.j.v_() >= idiv((c.a.f.q_() + 1) | 0, 2)) break L861;
													let hp = sk.l;
													if (sa === 20006) hp = (hp + V.i2.m[14].i) | 0;
													const m = sk.m;
													let amt = hp;
													if (m > 0) amt = (hp + c.a.x.h_((m + 1) | 0)) | 0;
													if (!c.X_(amt, 0, 0, 0, false, sk.e, true, false)) break L861;
													c.H0_(sk);
													break L781;
												}
												if (id === 20003) {
													const h2 = c.a;
													const me = h2.f;
													if (h2.C) {
														h2.L = me.b;
														h2.K.length = 0;
														const dirs = c30.m1;
														let hit = false;
														for (let i = 0; i < dirs.length; i++) {
															const d = dirs[i];
															const h3 = c.a;
															const L = h3.L;
															const q = h3.k[(imul((L.b + d.b) | 0, c.g) + L.a + d.a) | 0];
															let nh;
															if (q == null) nh = hit;
															else if (q === me) nh = hit;
															else if (q.i_(h3.e) > 0) nh = hit;
															else if (q.e_() && zw.o_(me.k, q.k)) {
																c.a.K.push(q);
																nh = true;
															} else {
																nh = hit;
																if (q.a.s_()) c.a.K.push(q);
															}
															hit = nh;
														}
														if (hit) {
															c.f_(9, me, null, sk, true);
															break L781;
														}
													}
													break L777;
												}
												if (id === 20004) {
													if (c.y_(c.a.f)) {
														c.H0_(sk);
														break L781;
													}
													break L777;
												}
												if (id === 20007 && c.T_(c.a.f, 0)) {
													c.a.f.z_(8);
													c.t_(c.a.f, 0);
													c.H0_(sk);
													c.u_(c.a.f, sk.e, true, 200);
													c.y0_(2131231493, 0, c.a.f);
													c.K0_(c.a.f, null);
													break L781;
												}
											}
										}
										v5 = 2;
										v4 = 0;
										break L787;
									} else {
										v4 = 0;
										v5 = 2;
										const it = V.Z1.get(id) ?? null;
										if (it == null) break L787;
										const ia = it.a;
										const h = c.a;
										if ((h.C ? !it.d0 : !it.e0) || !h.f.D.k_(id)) break L787;
										if (it.b0) {
											if (selItem !== it) {
												v85 = it.c0;
												if ((v85 === 6 && c.a.q != null) || (v85 === 7 && !c.i_(it))) break L787;
												if (!fg2.X_(it.c0, 0, 7, 12) && c.a.f.z.v_() < 1) {
													c.e.S_(2131231518, c.d.getString(2131690615));
													break L787;
												}
												c.V = true;
												c.X = it;
												c.W = null;
												let r = it.c0;
												if (r === 7) r = 3;
												else if (r === 12) r = 5;
												else r = (c.a.e.h[3] + 3) | 0;
												c.Z = r;
												const w = (r * 2 + 1) | 0;
												c.Y = new Int8Array(imul(w, w));
												for (let ry = -r; ry <= r; ry++) {
													for (let rx = -r; rx <= r; rx++) {
														if (ry !== 0 || rx !== 0) {
															const h2 = c.a;
															const hp = h2.f.b;
															const px = (hp.a + rx) | 0;
															pt.a = px;
															const py = (hp.b + ry) | 0;
															pt.b = py;
															if (px >= 0 && py >= 0) {
																const g = c.g;
																if (px < g && py < c.h && c.j[(imul(py, g) + px) | 0] > 0 && h2.O_(r, 1, hp, pt)) {
																	c.Y[(imul((ry + r) | 0, w) + rx + r) | 0] = 1;
																}
															}
														}
													}
												}
												v4 = 5;
												break L787;
											}
											break L781;
										}
										if (it.X === 0 && it.Y <= 0 && it.Z <= 0 && it.a0 === 0 && ia !== 304 && ia !== 295) {
											if (id === 173) throw new Error('DungameView.d0: item 173 (thread) is not ported');
											if (id >= 237 && id < 240) throw new Error(`DungameView.d0: teleport item ${id} is not ported`);
											if (id !== 185) {
												v4 = 1;
												v5 = 2;
												break L787;
											}
											if (c.a.u == null) throw new Error('DungameView.d0: item 185 (companion) is not ported');
											v4 = 0;
											v5 = 2;
											break L787;
										}
										let kind = -1;
										if (ia !== 295) kind = ia === 219 ? 100 : 2;
										if (c.Y_(it, kind, true, false)) {
											const r85 = c.W_(id, true, false);
											if (ia === 219) {
												const m = c.a.m;
												for (let i = 0; i < m.length; i++) if (m[i] > 0) m[i] = 1;
												c.l = true;
												c.m = true;
											}
											v4 = r85;
											break L787;
										}
									}
								}
								v5 = 2;
								v4 = 0;
								break L787;
							}
							v4 = 2;
							break L785;
						}
						v5 = 2;
						v4 = 2;
						break L787;
					}
					v4 = 0;
					v5 = v85;
					break L787;
				}
				v5 = 2;
				break L787;
			}
			v4 = 2;
			v5 = 2;
		}
		// toolbar bookkeeping: only the selected id (r) and c30.T for 20007 reach the rules
		if (v4 !== 0) {
			if (v4 !== 1) {
				if (v4 === 5) {
					if (item) item.setSelected(true);
					this.r = id;
				} else if ((v4 === 3 || v4 === 4) && id < 20000) {
					this.u.a.f.D.j_(id);
				}
				if (v4 === v5 || v4 === 3 || v4 === 4) {
					if (id >= 20000) {
						const cc = this.u;
						if (id === 20007) cc.T_(cc.a.f, 0);
					}
				}
				return;
			}
			if (z) this.U_(false, false, id, item);
		}
	}
}
DungameView.javaName = 'DungameView';
register(DungameView, ToolbarItem, Context);

// Every other DungameView method is a no-op returning the default value (TraceAgent fight mode, defaultBody):
// name:return (V void, Z false, I 0, L null). E.g. w(int, float, Point, Point) leaves the points unchanged.
for (const spec of ('A:L B:L C:Z D:L E:V F:V G:V H:V I:V J:V K:I L:V M:V N:V O:V P:V Q:V R:V U:V V:V W:Z X:V Y:V Z:V '
	+ 'a:V a0:V b:V b0:V c:V c0:V d:L e:V e0:V f:V f0:V g:V g0:V h:V h0:V i:V i0:V j:V j0:V k:V k0:V l:V l0:V m:V '
	+ 'n:V o:V onDraw:V onGenericMotionEvent:Z onSizeChanged:V p:V q:V r:V s:V setAlpha:V setBlendingModeAdd:V '
	+ 'setFade:V setTextColor:V setTextSizeDp:V setTint:V t:V u:L v:V w:V y:V z:L').split(' ')) {
	const [name, r] = spec.split(':');
	const value = r === 'Z' ? false : r === 'I' ? 0 : r === 'L' ? null : undefined;
	const key = name + '_';
	if (!(key in DungameView.prototype)) DungameView.prototype[key] = () => value;
}

// ---------------------------------------------------------------------------------------------
// c30 view-side helpers

install({
	/** void C0(int sx, int sy, Point out): screen (view-scaled, camera n0/o0) -> cell; inverse of N0 */
	C0_(x, y, out) {
		const a = (x + this.n0 + 65) | 0;
		const b = imul((y + this.o0 + 102) | 0, 2);
		let d = (a - b) | 0;
		let v = d;
		if (d < 0) v = (d - 127) | 0;
		out.a = (idiv(v, 128) + 1) | 0;
		d = (a + b) | 0;
		v = d;
		if (d < 0) v = (d - 127) | 0;
		out.b = (idiv(v, 128) - 1) | 0;
	},

	/** void N0(int x, int y, Point out, boolean camera): cell -> screen (iso 128x64), minus the camera when set */
	N0_(x, y, out, cam) {
		const a = imul((x + y) | 0, 64);
		out.a = a;
		const b = imul((y - x) | 0, 32);
		out.b = b;
		if (cam) {
			out.a = (a - this.n0) | 0;
			out.b = (b - this.o0) | 0;
		}
	},

	/** float N(int, int): animation phase |sin| from the clock b0 */
	N_(x, y) {
		const p = (irem(imul((imul(y, 3) + x) | 0, 11), 300) + 400) | 0;
		return f32(Math.abs(Math.sin((this.b0 % p) / p * Math.PI)));
	},

	/** float O(int, int): animation phase |sin| from the clock b0 */
	O_(x, y) {
		const p = (irem(imul((imul(y, 3) + x) | 0, 11), 400) + 500) | 0;
		return f32(Math.abs(Math.sin((this.b0 % p) / p * Math.PI)));
	},

	/** boolean O0(int x, int y): (g1 != 0) a cell up-right of (x, y) that c30.r / c30.s flag (wall occlusion) */
	O0_(x, y) {
		if (this.g1 === 0) return false;
		let g = this.g;
		const i = (imul(y, g) + x) | 0;
		if (x < g - 1) {
			const j = (i + 1) | 0;
			if (this.r_(j) || (this.i[j].a === 8 && x < this.g - 2 && this.s_((i + 2) | 0))) return true;
		}
		if (y >= 1) {
			if (this.r_((i - this.g) | 0)) return true;
			g = this.g;
			if (this.i[(i - g) | 0].a === 8 && y >= 2 && this.s_((i - g * 2) | 0)) return true;
		}
		if (y >= 1) {
			g = this.g;
			if (x < g - 1 && this.s_((i - g + 1) | 0)) return true;
		}
		if (y >= 2) {
			g = this.g;
			if (x < g - 2 && this.s_((i - g * 2 + 2) | 0)) return true;
		}
		if (y >= 3) {
			g = this.g;
			if (x < g - 3) {
				if (this.s_((i - g * 3 + 3) | 0)) return true;
				g = this.g;
				if (this.i[(i - g * 3 + 3) | 0].a === 8) {
					if (y >= 4 && this.s_((i - g * 4 + 3) | 0)) return true;
					g = this.g;
					if (x < g - 4 && this.s_((i - g * 3 + 4) | 0)) return true;
				}
			}
		}
		if (y >= 2) {
			g = this.g;
			if (x < g - 1) {
				if (this.s_((i - g * 2 + 1) | 0)) return true;
				g = this.g;
				if (this.i[(i - g * 2 + 1) | 0].a === 3 && y >= 3 && this.s_((i - g * 3 + 1) | 0)) return true;
			}
		}
		if (y >= 3) {
			g = this.g;
			if (x < g - 2 && this.s_((i - g * 3 + 2) | 0)) return true;
		}
		if (y >= 1) {
			g = this.g;
			if (x < g - 2) {
				if (this.s_((i - g + 2) | 0)) return true;
				g = this.g;
				if (this.i[(i - g + 2) | 0].a === 3 && x < g - 3 && this.s_((i - g + 3) | 0)) return true;
			}
		}
		if (y >= 2) {
			g = this.g;
			if (x < g - 3 && this.s_((i - g * 2 + 3) | 0)) return true;
		}
		return false;
	},

	/** boolean S(int i): noise bit 4096 of cell i (c30.k) */
	S_(i) {
		return (this.k[i] & 4096) !== 0;
	},

	/** boolean b0(int x, int i): neither horizontal neighbour of cell i is a wall (types 2 / 7) */
	b0_(x, i) {
		return (x <= 0 || !fg2.W_(this.i[(i - 1) | 0].a, 2, 7)) && (x >= this.g - 1 || !fg2.W_(this.i[(i + 1) | 0].a, 2, 7));
	},

	/** float L(float d): light falloff over radius r */
	L_(d) {
		const r = this.r;
		let v = f32(f32(Math.max(Math.min(f32(f32(r + 1) - d), r), 0)) / r);
		if (!(v > 0) || !(v < 0.125)) return v;
		return v < 0.03125 ? 0 : f32(0.125);
	},

	/** void j(): clear the tool selection (V, W, X, Y) and the tap target a0 */
	j_() {
		if (this.V) {
			this.V = false;
			this.W = null;
			this.X = null;
			this.Y = null;
			const v = this.e;
			for (const row of v.q) {
				for (const t of row) {
					if (t instanceof ToolbarItem && t.q && t.isSelected()) {
						t.setSelected(false);
						v.r = 0;
					}
				}
			}
		}
		this.a0 = null;
	},

	/**
	 * void k0(): area-effect particles over the square around hw.L (or hw.F for item kind 4). Only the scratch
	 * points a1 / c1 (cell -> screen) and the reads remain; with hw.G == 8 it dereferences hw.N.
	 */
	k0_() {
		const h = this.a;
		const g = h.G;
		const is3 = g === 8 && h.N.c0 === 3;
		const is4 = g === 8 && h.N.c0 === 4;
		const is11 = g === 8 && h.N.c0 === 11;
		void is3; void is11;
		const n = h.N != null ? h.N.c0 : 0;
		const r = fg2.W_(n, 4, 10) ? 2 : 1;
		for (let y = (this.a.L.b - r) | 0; y <= this.a.L.b + r; y++) {
			for (let x = (this.a.L.a - r) | 0; x <= this.a.L.a + r; x++) {
				if (is4) {
					const p = this.a.F.b;
					if (x === p.a && y === p.b) continue;
				}
				this.N0_(x, y, this.a1, false);
				const ctr = is4 ? this.a.F.b : this.a.L;
				this.N0_((x - ctr.a) | 0, (y - ctr.b) | 0, this.c1, false);
			}
		}
	},
}, {
	/** static void q0(Point): normalise an iso vector to unit length in screen space (64:32) */
	q0_(p) {
		const a = p.a;
		if (a !== 0 || p.b !== 0) {
			const x = f32(a / 64);
			const y = f32(p.b / 32);
			const n = f32(1 / f32(Math.sqrt(f32(f32(y * y) + f32(x * x)))));
			p.a = f2i(f32(f32(x * n) * 64));
			p.b = f2i(f32(f32(y * n) * 32));
		}
	},
});

function irem(a, b) {
	return (a % b) | 0;
}
