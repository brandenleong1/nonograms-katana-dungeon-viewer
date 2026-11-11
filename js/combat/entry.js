// Dungeon entry from a player profile: what the game does when you start a dungeon run with a hero, so a fight
// begins exactly as it would for that player (pack, MP, familiars, and a layout generated with their progress).
//
//   import { newFightFromProfile, entryPack } from './entry.js';   // after initTables() and loading ./all.js
//   const { vj0 } = await importSave(bytes);                       // js/save
//   const fight = newFightFromProfile({ vj0, type: 8, seed: 172582050, xseed: 12345 }, { lean: true });
//   fight.entry                                                     // gates, fee, MP, pack, pets (see enter())
//   entryPack(vj0)                                                  // what the selected hero would take in (pure)
//
// Source: the game's PageDungeon.C(int type, boolean auto) with auto = false (Vineflower decompile of
// com/ucdevs/jcross/g/PageDungeon.class; JADX garbles this method; where the two disagree the smali decides, e.g.
// the pack loop skips bj0.c == 19: smali PageDungeon.smali `if-ne v10, v12 (19)`), plus vj0.u0 / D1 / F1 / C1 / x1
// / z / U0 and nw.d (decompiled/vineflower/{vj0,nw}.java). For 0 <= type < 27 it does, in this order:
//   gates  vj0.K0 == null; hero = vj0.u0() (H0, 0 when out of range, none when H0 < 0) with nw.n <= 0 (not away);
//          fewer than 5 heroes away (nw.n > 0); vj0.M0.size() <= vj0.U0() (stable); vj0.D1(type) (unlocked);
//          vj0.z(false, true, premium, type): the entry fee zw.M[type].I (vw: item b, count jh1.a() less vw.e when
//          premium), all affordable from vj0.K, then deducted from vj0.K
//   gen    hw = new hw(type, hero); vj0.K0 = hw; x30.f(hw, UApp.X0.j.nextInt()); hw.x.a = (int) now ^ hw.a; hw.n(null)
//   MP     cap = nw.d(item 192) (= nw.n(), max MP); n = min(K.j(192), cap); K.q(192, n); mw.G(n)
//   pets   the first 3 of nw.l with food (uw.k > 0): hw.v[i] = gw (charges kh0 c = 1, +1 with uw flag 1048576,
//          +1 for food 236 / 251 / 252; d = kh0; uw.j(true); b = uw.f.a; e = uw.f(true)), mw.D += item 225 + i,
//          uw.c() (one food eaten); then mw.C = 1 / 3 / 5 for 1 / 2 / 3 familiars
//   pack   for each bj0 of vj0.c1 (table order) with c != 19, V > 0, cap = nw.d(bj0) > 0 and K.j(id) > 0:
//          n = min(K.j(id), cap); K.q(id, n); mw.D.b(id, n). nw.d: 0 for items the hero has locked (nw.m), for
//          235 without taming (nw.h[15]) and 236 below taming 3 (c == 28), and for pet food (c == 31) when no pet
//          has food left (unless taming and quest 55's open step 270); else V, plus nw.h[10] * zw.r[10].f
//          (equipment preparation) unless bj0.W
//   extras armour 254 worn (nw.i[1]): mw.D += 209 x2; research 37 (vj0.t1(37)): mw.D += flamethrower 206 x
//          (vj0.I1[37].i + armour 254 + premium); premium (UApp.X0.e): mw.D += 277 x2, 168 x1 and hw.s = true.
//          None of these come out of vj0.K.
//   then   vj0.g2(false) (action counter), vj0.l2() (autosave; not modelled)
// Then the page builds the dungeon view (setup.js buildC30).
//
// Differences from the game, all shared with the oracle (`fightgen --profile`, ORACLE.md):
//   - the seed is the label's seed (x30.g once; a seed that gets stuck for this profile is an error, where the game's
//     x30.f would retry with seed * 69069 + 1); hw.x.a = xseed (default: the game's (int) Date.now() ^ seed)
//   - every hero away (nw.n > 0) is treated as back (n = o = 0, what the game's timer does when it runs out), so the
//     "hero away" and "5 heroes away" gates pass; a dungeon in progress (K0) is dropped first
//   - the other gates (stable, unlocked, fee) are reported in fight.entry.gates; the fight starts anyway (a fee that
//     cannot be paid is not deducted). The oracle refuses such setups (the game's code does not start the run).
//   - spec.pets (S:SEED:RANK:FOOD:N,..): companions added to the hero's nw.l before entry (the game's own familiar
//     code above then fills the slots); spec.premium: UApp.X0.e
// The imported profile is never changed: entry works on a copy (cached per profile and put back to its imported state
// for every call through clone.js captureStatics / restoreStatics, like resetStatics does for the fresh profile).
// As for newFight, call setup.js resetStatics(tables) before; import the profile after the first resetStatics.
import { classes } from '../gen/registry.js';
import { zw, vj0 as V, tables } from '../gen/statics.js';
import { cloneGraph } from '../save/fresh.js';
import { extend } from './c30.js';
import { autoCell, teleport, heroEdits, buildC30 } from './setup.js';
import { Fight } from './driver.js';
import { captureStatics, restoreStatics, generateCachedIn } from './clone.js';

const { nw, vj0, cq, kh0, gw, uw } = classes;

const addMissing = (cls, methods) => {
	const add = {};
	for (const [k, fn] of Object.entries(methods)) if (!(k in cls.prototype)) add[k] = fn;
	extend(cls, add);
};

// ---------------------------------------------------------------------------------------------------------------
// Model methods (decompiled/vineflower/nw.java, vj0.java)

addMissing(nw, {
	/** int d(bj0): how many of this item the hero carries into a dungeon (0: does not take it) */
	d_(b) {
		const cap = b.V;
		const id = b.a;
		if (cap === 0) return 0;
		const c = b.c;
		if (c === 19) return id === 192 ? this.n_() : 0;
		const h = this.h;
		if (c === 28) {
			const t = h[15];
			if ((id === 235 && t <= 0) || (id === 236 && t <= 2)) return 0;
		} else if (c === 31) {
			let fed = 0;
			for (const u of this.l) if (u.k > 0) fed = (fed + 1) | 0;
			if (fed === 0 && h[15] > 0) {
				const q = V.i2.Y0_(55);
				if (q.x_() && q.b0 != null) {
					for (const s of q.b0) {
						if (s.R !== 0 && s.S === 270 && !s.c_(q, 0n)) { fed = 1; break; }
					}
				}
			}
			if (fed === 0) return 0;
		}
		if (lockedHas(this.m, id)) return 0;
		if (b.W) return cap;
		return (h[10] * zw.r[10].f + cap) | 0;
	},
});

/** nw.m (ArrayList<Integer> of locked item ids; an Array in the import) contains id */
function lockedHas(m, id) {
	if (m == null) return false;
	if (Array.isArray(m)) return m.includes(id);
	if (typeof m.has === 'function') return m.has(id);
	if (typeof m.contains_ === 'function') return m.contains_(id);
	return false;
}

addMissing(vj0, {
	/** boolean C1(int type): classic floor not reached yet (o[22].B0 <= type / 3) */
	C1_(t) {
		return t >= 0 && t < 15 && this.o[22].B0 <= ((t / 3) | 0);
	},
	/** boolean x1(int type): cave types 19..22 unlocked (quests 45, 47, 50, 57) */
	x1_(t) {
		if (!zw.q_(t)) return false;
		if (!this.Y0_(45).v_()) return false;
		if (t >= 20 && !this.Y0_(47).v_()) return false;
		if (t >= 21 && !this.Y0_(50).q_()) return false;
		return t < 22 || this.Y0_(57).v_();
	},
	/** boolean F1(int type): the type's family is open (classic always; quests for the others) */
	F1_(t) {
		if (t < 0 || t >= 27) return false;
		if (t < 15) return true;
		if (zw.r_(t)) {
			return this.Y0_(61).q_() && (t < 24 || this.Y0_(64).q_()) && (t < 25 || this.Y0_(67).q_()) && (t < 26 || this.Y0_(70).v_());
		}
		if (zw.q_(t)) return this.x1_(t);
		if (zw.s_(t)) return this.I1_(t);
		return false;
	},
	/** boolean D1(int type): this dungeon can be entered (family open, floor reached, level unlocked) */
	D1_(t) {
		if (t < 0 || t >= 27) return false;
		if (!this.F1_(t)) return false;
		if (this.C1_(t)) return false;
		if (zw.h_(t) === 0) return true;
		return (this.I0 & (1 << t)) !== 0;
	},
	/** int U0(): stable capacity (companions vj0.M0) */
	U0_() {
		const q = this.o[22];
		let n = q.h0_(1) ? 7 : 5;
		if (q.h0_(2)) n = (n + 2) | 0;
		const r = this.m[38];
		let t = 0;
		for (const e of this.l) {
			const s = e.h[15];
			if (s >= 2) t++;
			if (s >= 4) t++;
		}
		return (Math.min(t, 6) + r.i * r.k + n) | 0;
	},
	/**
	 * boolean z(boolean auto, boolean pay, boolean premium, int type): the entry fee (zw.M[type].I, or the autonomous
	 * one) is affordable from K; with pay, deduct it
	 */
	z_(auto, pay, premium, t) {
		const p = zw.M[t];
		const list = auto ? p.S.i : p.I;
		if (list != null) {
			const K = this.K;
			for (const w of list) if (K.j_(w.b) < vwB(w, premium)) return false;
			if (pay) for (const w of list) { const n = vwB(w, premium); if (n > 0) K.q_(w.b, n); }
		}
		return true;
	},
});

/** vw.b(boolean premium): fee count jh1.a() (c ^ 375066), less e when premium */
function vwB(w, premium) {
	const a = w.c ^ 375066;
	return !premium || w.e <= 0 ? a : Math.max((a - w.e) | 0, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The entry rules (one code path for the real entry and the dry run)

const FOOD_BONUS = [236, 251, 252];

/** Gate failures for this profile / hero / type (empty: the game starts the run). */
export function entryGates(P, e, type, premium = false) {
	const out = [];
	if (P.K0 != null) out.push({ gate: 'dungeon', text: 'a dungeon is already in progress' });
	if (e == null) { out.push({ gate: 'hero', text: 'no hero selected' }); return out; }
	if (e.n > 0) out.push({ gate: 'away', text: 'the hero is away', ms: e.n });
	let away = 0;
	for (const x of P.l) if (x.n > 0) away++;
	if (away >= 5) out.push({ gate: 'busy', text: `${away} heroes are away (at most 4)` });
	if (P.M0 && P.M0.length > P.U0_()) out.push({ gate: 'stable', text: 'the stable is over capacity' });
	if (type != null) {
		if (type < 0 || type >= 27) out.push({ gate: 'type', text: `dungeon type ${type} cannot be started here` });
		else {
			const prev = V.i2;
			V.i2 = P;
			try {
				if (!P.D1_(type)) out.push({ gate: 'locked', text: 'this dungeon is not unlocked yet' });
				if (!P.z_(false, false, premium, type)) out.push({ gate: 'fee', text: 'the entry fee cannot be paid' });
			} finally {
				V.i2 = prev;
			}
		}
	}
	return out;
}

/** The entry fee of a type: [[id, count]] (premium: less vw.e). */
export function entryFee(type, premium = false) {
	const list = type >= 0 && type < 27 ? zw.M[type].I : null;
	return list ? list.map((w) => [w.b, vwB(w, premium)]).filter((x) => x[1] > 0) : [];
}

/**
 * PageDungeon.C after generation: MP, familiars, pack, extras (see the top of the file), on P (vj0 with stock K),
 * hero e and level h (hw: e, f = mw with D / C, v = gw[3], s). Returns { mp, pets }.
 */
function fillPack(P, e, h, premium) {
	const K = P.K;
	const f = h.f;
	// MP from the item-192 stock
	let mp = 0;
	const cap = e.d_(V.Z1.get(192));
	if (cap > 0) {
		const s = K.j_(192);
		if (s > 0) {
			mp = s > cap ? cap : s;
			K.q_(192, mp);
		}
	}
	if (mp > 0) f.G_(mp);
	// familiars: the first three companions with food
	const pets = [];
	const m = Math.min(e.l.length, 3);
	let cnt = 0;
	for (let i = 0; i < m; i++) {
		const u = e.l[i];
		if (u.k <= 0) continue;
		const g = new gw();
		const ch = new kh0(14, false);
		g.c = ch;
		g.d = new kh0(14, false);
		u.j_(true);
		g.b = u.f.a;
		const base = u.h_(1048576, true) ? 2 : 1;
		const food = u.l;
		const bonus = u.k > 0 && FOOD_BONUS.includes(food.a) ? 1 : 0;
		ch.z_((bonus + base) | 0);
		g.e = u.f_(true);
		h.v[i] = g;
		f.D.b_((i + 225) | 0, 1);
		pets.push({ slot: i, item: (i + 225) | 0, species: u.a ? u.a.a : 0, kind: u.d, food: food.a, foodLeft: u.k - 1, charges: (bonus + base) | 0, hp: g.b, e: g.e });
		u.c_();
		cnt++;
	}
	if (cnt > 0) f.C.z_(cnt === 1 ? 1 : cnt === 2 ? 3 : 5);
	// the pack: every item the hero carries, up to its carry cap, from the stock
	for (const b of V.c1) {
		const id = b.a;
		if (b.c === 19 || !(b.V > 0)) continue;
		const c = e.d_(b);
		if (c <= 0) continue;
		const s = K.j_(id);
		if (s <= 0) continue;
		const n = s <= c ? s : c;
		K.q_(id, n);
		f.D.b_(id, n);
	}
	const armour = h.e.i[1] != null && h.e.i[1].a === 254;
	if (P.t1_(37)) {
		let n = V.I1[37].i;
		if (armour) n = (n + 1) | 0;
		if (premium) n = (n + 1) | 0;
		f.D.b_(206, n);
	}
	if (armour) f.D.b_(209, 2);
	if (premium) {
		f.D.b_(277, 2);
		f.D.b_(168, 1);
		h.s = true;
	}
	return { mp, pets };
}

/** cq with the same entries (count copies; items shared) */
function copyCq(src, sorted) {
	const q = new cq(false);
	q.c = src.c.map((e) => { const c = Object.create(Object.getPrototypeOf(e)); Object.assign(c, e); return c; });
	q.b = sorted;
	return q;
}

/** The hero of profile P at index i the way vj0.u0 picks it (H0 = i; out of range -> 0; negative -> none). */
export function heroAt(P, i = P.H0) {
	if (i == null || i < 0) return null;
	return i >= P.l.length ? P.l[0] : P.l[i];
}

/**
 * What hero `hero` (default: the game's selected hero vj0.H0) would take into a dungeon: a dry run of the entry on
 * copies (the profile is not changed). Returns
 *   { hero, items: [[id, count]] (the pack mw.D in its order, familiar items 225-227 included), mp, pets, fam,
 *     taken: [[id, count]] out of the stock (fee, MP 192, pack items), fee: [[id, count]] (the type's entry fee),
 *     feePaid (false: the stock cannot pay it; the game would not start the run), gates }
 * type (optional) adds the fee and the gates of that dungeon; premium: UApp.X0.e.
 */
export function entryPack(P, hero = P.H0, { type = null, premium = false } = {}) {
	const e0 = heroAt(P, hero);
	const fee = type != null ? entryFee(type, premium) : [];
	if (e0 == null) return { hero, items: [], mp: 0, pets: [], fam: 0, taken: [], fee, feePaid: false, gates: entryGates(P, null, type, premium) };
	const gates = entryGates(P, e0, type, premium);
	// scratch copies of what entry writes: the stock K, the hero's companions (uw.j / uw.c), the hero (its l)
	const K = copyCq(P.K, P.K.b);
	const before = new Map(P.K.c.map((x) => [x.a.a, x.a_()]));
	const e = Object.create(Object.getPrototypeOf(e0));
	Object.assign(e, e0);
	e.l = e0.l.map((u) => {
		const c = Object.create(Object.getPrototypeOf(u));
		Object.assign(c, u);
		c.f = Object.assign(Object.create(Object.getPrototypeOf(u.f)), u.f);
		return c;
	});
	const S = Object.create(Object.getPrototypeOf(P));
	Object.assign(S, P);
	S.K = K;
	const prev = V.i2;
	V.i2 = S;
	let feePaid = true;
	try {
		if (type != null && type >= 0 && type < 27) {
			feePaid = S.z_(false, false, premium, type);
			if (feePaid) S.z_(false, true, premium, type);
		}
		const D = new cq(false);
		D.c = [];
		D.b = true;
		let mpSet = 0;
		const C = new kh0(14, false);
		const h = { e, f: { D, C, G_(n) { mpSet = n; } }, v: [null, null, null], s: false };
		const r = fillPack(S, e, h, premium);
		const taken = [];
		for (const [id, n] of before) {
			const d = n - K.j_(id);
			if (d > 0) taken.push([id, d]);
		}
		return {
			hero, items: D.c.map((x) => [x.a.a, x.a_()]), mp: mpSet, pets: r.pets, fam: C.v_(), taken, fee, feePaid, gates,
		};
	} finally {
		V.i2 = prev;
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Fights

const WORK = new WeakMap();   // imported profile -> { W (working copy), tok (its statics record) }

/** The working copy of profile src, put back to its imported state, installed as vj0.i2. */
function workCopy(src) {
	let w = WORK.get(src);
	if (w !== undefined && w.tok.tables === tables) {
		restoreStatics(w.tok);
		return w;
	}
	const k0 = src.K0;
	src.K0 = null;   // a dungeon in progress is not part of the profile entry uses
	let W;
	try {
		W = cloneGraph(src);
	} finally {
		src.K0 = k0;
	}
	V.i2 = W;
	w = { W, tok: captureStatics(W) };
	WORK.set(src, w);
	return w;
}

/**
 * Set up a profile fight: { h, c, dgv, meta, entry } (or { error, meta }). spec = { vj0, hero?, type, seed, xseed?,
 * at?, premium?, pets?, profile? (name for the header) } plus newFight's optional hero edits (level, gear, kit, kit2,
 * skills; applied after entry and teleport, as the oracle does).
 */
export function setupProfile(spec) {
	const src = spec.vj0 ?? (spec.imported && spec.imported.vj0);
	const { type, seed } = spec;
	const at = spec.at ?? 'start';
	const premium = !!spec.premium;
	const meta = { mode: 'fightgen', type, seed, xseed: spec.xseed, at };
	if (src == null) return { error: 'profile: no vj0', meta };
	const hero = spec.hero ?? src.H0;
	meta.profile = spec.profile ?? 'profile';
	meta.hero = hero;
	if (premium) meta.premium = 1;
	if (spec.pets) meta.pets = spec.pets;
	if (!(type >= 0 && type < 27)) return { error: `profile: type ${type} is not a dungeon (0..26)`, meta };
	if (tables == null) return { error: 'profile: call initTables / resetStatics first', meta };
	const { W, tok } = workCopy(src);
	// the game's selection, then entry's gates (reported) and the shared deviations (see the top of the file)
	W.H0 = hero | 0;
	const e = W.u0_();
	if (e == null) return { error: `profile: no hero ${hero}`, meta };
	const gates = entryGates(src, heroAt(src, hero), type, premium);
	for (const x of W.l) if (x.n > 0) { x.n = 0; x.o = 0; }
	if (spec.pets) petsToHero(e, String(spec.pets));
	const feePaid = W.z_(false, false, premium, type);
	const fee = entryFee(type, premium);
	if (feePaid) W.z_(false, true, premium, type);
	let h;
	try {
		const key = `${W.H0}|${premium ? 1 : 0}|${spec.pets || ''}|${type}|${seed}`;
		h = generateCachedIn(tok, key, () => {
			const lv = new classes.hw(type, e);
			new classes.x30().g_(lv, seed);
			return lv;
		});
	} catch (err) {
		return { error: `gen: ${err.name || 'Error'}: ${err.message}`, meta };
	}
	W.K0 = h;
	const xseed = spec.xseed ?? (((Date.now() | 0) ^ h.a) | 0);
	meta.xseed = xseed;
	h.x.a = xseed | 0;
	h.n_(null);
	const stock0 = new Map(W.K.c.map((x) => [x.a.a, x.a_()]));
	const { mp, pets } = fillPack(W, e, h, premium);
	W.g2_(false);
	const taken = [];
	for (const [id, n] of stock0) { const d = n - W.K.j_(id); if (d > 0) taken.push([id, d]); }
	const entry = {
		hero: W.H0, gates, fee, feePaid, mp, pets, fam: h.f.C.v_(), taken,
		items: h.f.D.c.map((x) => [x.a.a, x.a_()]),
	};
	meta.start = [h.f.b.a, h.f.b.b];
	if (at !== 'start') {
		let t;
		if (at === 'auto') t = autoCell(h, null);
		else if (at.startsWith('near:')) {
			const p = at.slice(5).split(',').map(Number);
			const o = h.k[p[1] * h.g + p[0]];
			if (!(o instanceof classes.aw)) return { error: `near: no critter at ${p[0]},${p[1]}`, meta };
			t = autoCell(h, o);
		} else t = at.split(',').map(Number);
		if (t == null) return { error: 'auto: no hostile critter in a room', meta };
		if (!teleport(h, t[0], t[1])) return { error: `teleport: cell ${t[0]},${t[1]} not free`, meta };
		meta.tele = t;
	}
	const edits = { ...spec };
	delete edits.pets;   // spec.pets went to the hero before entry
	heroEdits(h, edits, meta);
	W.K0 = null;
	const { c, dgv } = buildC30(h);
	return { h, c, dgv, meta, entry };
}

/** spec.pets before entry: companions uw(S, SEED, RANK) with uw.l = FOOD, uw.k = N appended to the hero's nw.l */
function petsToHero(e, spec) {
	for (const p of spec.split(',')) {
		const q = p.split(':').map(Number);
		const u = new uw(q[0], q[1], q[2]);
		if (q.length > 3) { u.l = V.Z1.get(q[3]) ?? null; u.k = q.length > 4 ? q[4] : 1; }
		e.l.push(u);
	}
}

/**
 * A fight that starts the way the game starts a dungeon run for this player: `type` / `seed` (the label), the
 * imported profile `vj0` as vj0.i2 (generation sees its quests and bosses), hero `hero` (default vj0.H0) with the pack,
 * MP and familiars the game gives it, hw.x.a = xseed (default: the game's (int) Date.now() ^ seed), then `at`
 * ('start' | 'auto' | 'near:x,y' | 'x,y', as newFight). Returns the same Fight as newFight (step / apply / snapshot /
 * clone), with fight.entry = { hero, gates, fee, feePaid, mp, pets, fam, taken, items } (as entryPack; items: the pack
 * before newFight-style hero edits such as --kit); or { error, meta } when setup fails.
 * fightOpts as newFight's opts ({ lean, callers }); spec also takes newFight's cap / run / trapsindif / draws / trace /
 * cells and hero edits, and premium / pets (see setupProfile).
 */
export function newFightFromProfile(spec, fightOpts = {}) {
	const r = setupProfile(spec);
	if (r.error) return { error: r.error, meta: r.meta };
	const fight = new Fight(r, spec, fightOpts);
	fight.entry = r.entry;
	return fight;
}

// ---------------------------------------------------------------------------------------------------------------
// Profile summary for the UI

/** vj0.t0(bj0): maximum durability of an equipment item (base h0, +5 with its building upgrade, + investment for Lv 4). */
function durabilityMax(P, b) {
	let n = b.h0 | 0;
	const bi = b.i0 | 0;
	if (bi !== 0 && P.o && P.o[bi] && typeof P.o[bi].h0_ === 'function' && P.o[bi].h0_(b.j0)) n += 5;
	if ((b.f | 0) < 4) return n;
	const r = P.m && P.m[40];
	return r ? (n + Math.imul(r.i | 0, r.k | 0)) | 0 : n;
}

/** Hero sheet: level, HP / EP / MP / attack / defence / AP (nw-derived), skills, equipment, companions. */
export function heroSheet(P, i) {
	const e = P.l[i];
	const prev = V.i2;
	V.i2 = P;
	try {
		const gear = [];
		for (let s = 0; s < 4; s++) {
			const b = e.i[s];
			// bj0.f = level (1..4), bj0.g = the "+" version; nw.j = durability left, max = vj0.t0(item); nw.k = incrustation
			gear.push(b == null ? null : { id: b.a, level: b.f | 0, plus: !!b.g, dur: e.j ? e.j[s] : 0, durMax: durabilityMax(P, b), enh: e.k ? e.k[s] : 0 });
		}
		return {
			index: i, name: e.p || '', lvl: e.g, xp: e.g_(),
			hp: e.m_(), ep: e.l_(), mp: e.n_(), atk: e.f_(), def: e.e_(), ap: e.p_(),
			skills: Array.from(e.h), gear, away: e.n > 0 ? e.n : 0, locked: Array.isArray(e.m) ? e.m.slice() : [],
			pets: e.l.map((u) => ({ species: u.a ? u.a.a : 0, kind: u.d, level: u.j, food: u.l ? u.l.a : 0, foodLeft: u.k })),
		};
	} finally {
		V.i2 = prev;
	}
}

/** Progress summary: bosses beaten per family, active / done quests, MP stock, unlocked types. */
export function progressSummary(P) {
	const prev = V.i2;
	V.i2 = P;
	try {
		const J0 = P.J0 | 0;
		const bits = (from, n) => { let c = 0; for (let i = 0; i < n; i++) if (J0 & (1 << (from + i))) c++; return c; };
		const active = [], done = [];
		for (const q of P.k) {
			if (q == null) continue;
			if (q.q_()) done.push(q.a);
			else if (q.x_()) active.push(q.a);
		}
		const unlocked = [];
		for (let t = 0; t < 27; t++) if (P.D1_(t)) unlocked.push(t);
		return {
			classicBosses: bits(0, 15), forestBosses: bits(15, 8), caveBosses: bits(23, 3),
			activeQuests: active, doneQuests: done.length, mpStock: P.K.j_(192), unlocked,
			heroes: P.l.length, selected: P.H0,
		};
	} finally {
		V.i2 = prev;
	}
}
