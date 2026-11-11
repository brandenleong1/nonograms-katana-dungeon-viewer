// Dungeon-level simulation on top of the combat engine (js/combat/driver.js, clone.js): read-only state accessors,
// the resource ledger, the route walker (planner stops, taps along the route, bumps) and the encounter loop.
//
//   import '../combat/all.js';                   // entry points load the engine (top-level await) first
//   resetStatics(tablesJson);                     // js/combat/setup.js
//   const run = Run.start(heroSpec, { type, seed, xseed });   // a lean Fight + Walker + Ledger
//   let ev = run.toEncounter();                   // walk the route until combat (C) starts, or the dungeon ends
//   const out = run.fight(policy);                // play the encounter with a policy until C clears
//   const ck = run.checkpoint();  Run.resume(ck)  // freeze / thaw (clone.js state + walker + ledger)
//
// Everything here is browser-safe (no node: imports). Statics are global: only one Run is live per thread; resume()
// makes its Run the live one (see clone.js).
//
// Hero spec (what the hero brings): either the oracle-style edits of js/combat/setup.js
//   { level, gear, kit, kit2, skills, quests, pets, run, trapsindif }
// or the player's profile (js/combat/entry.js, when present): { profile: { vj0, hero } }.
import { zw, vj0 as V } from '../gen/statics.js';
import { Util$Point } from '../gen/model.js';
import { newFight, restoreFight } from '../combat/driver.js';
import { snapshot } from '../combat/clone.js';
import { planRoute } from '../plan/planner.js';

export const DIR4 = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const TELEPORTS = new Set([38, 39, 40, 74, 88, 126]);
const DOOR_IDS = new Set([27, 28, 29, 33, 35, 53, 60, 73]);
/** recovery objects worth a detour (actions.js activate): 48 fountain +10 EP, 58 fountain +7 MP, 95 lantern +10 EP */
export const RECOVERY = new Map([[48, { ep: 10 }], [58, { mp: 7 }], [95, { ep: 10 }]]);
export const SPIDER = 168;
export const AMBROSIA = 123;
export const SKILL = { WAIT: 20001, SMASH: 20002, KICK: 20003, DEMORALIZE: 20004, CHARGE: 20005, DOCTOR: 20006, DIVINE: 20007 };

// ---------------------------------------------------------------------------------------------------------------
// Read-only accessors (record.js reads the same fields)

/** hostile to the hero, alive */
export function isFoe(h, m) { return m !== h.f && !m.u_() && zw.o_(h.f.k, m.k); }
export function foesOf(h) { const out = []; for (const m of h.o) if (isFoe(h, m)) out.push(m); return out; }
export const manh = (p, q) => Math.abs(p.a - q.a) + Math.abs(p.b - q.b);
export const cheb = (p, q) => Math.max(Math.abs(p.a - q.a), Math.abs(p.b - q.b));
/** seal MP still to pay on a critter (0 = none) */
export const sealOf = (h, m) => m.i_(h.e);

/** hero pools: { x, y, hp, hpM, ep, epM, mp, mpM, ap, spd, atk, def } */
export function heroOf(h) {
	const me = h.f;
	return { x: me.b.a, y: me.b.b, hp: me.j.v_(), hpM: me.q_(), ep: me.z.v_(), epM: me.D_(), mp: me.E_(), mpM: h.e.n_(), ap: me.n.v_(), spd: me.r_(), atk: me.o_(), def: me.n_(false) };
}

/** a critter as plain data (UI / plan): id, position, pools, stats, seal, ranged ammo */
export function critterInfo(h, m) {
	return { id: m.a.a, x: m.b.a, y: m.b.b, hp: m.j.v_(), hpM: m.q_(), ap: m.n.v_(), spd: m.r_(), atk: m.o_(), def: m.n_(false), seal: sealOf(h, m), ranged: m.w > 0 ? m.w : 0, boss: !!m.a.l0, objective: !!m.a.t };
}

/** pack counts: Map id -> count (mw.D entries) */
export function packOf(h) {
	const m = new Map();
	for (const e of h.f.D.c) m.set(e.a.a, (m.get(e.a.a) || 0) + e.a_());
	return m;
}
export const packHas = (h, id) => h.f.D.c.some((e) => e.a.a === id && e.a_() > 0);
/** skill learned (nw.h level >= 1, or no skill index) */
export function learned(h, id) {
	const sk = zw.q.get(id);
	return !!sk && (sk.o === -1 || h.e.h[sk.o] >= 1);
}
/**
 * MP is free (the live Run tops the hero up before any input that needs it: Run.topUpFor): no decision is ever
 * limited by the MP pool. Set by the live Run (statics are global, one Run is live per thread).
 */
let MP_FREE = false;
export const mpFree = () => MP_FREE;
export function setMpFree(v) { MP_FREE = !!v; }
/** the pool can pay cost now (always, with MP top-ups) */
export const mpOk = (h, cost) => MP_FREE || h.f.E_() >= cost;

/** skill usable now by pools (MP / EP; AP is checked by the engine) */
export function canSkill(h, id) {
	const sk = zw.q.get(id);
	if (!sk || !learned(h, id)) return false;
	const me = h.f;
	return mpOk(h, sk.g) && me.z.v_() >= sk.f;
}

/**
 * expected damage of src on dst (damage.js e, melee, no crits): E[max(roll - def, 1)] over the roll's spread. def: a
 * defence to use instead of dst's (e.g. demoralized: aw.k r > 0 -> 40% of it)
 */
export function expDamage(src, dst, mult = 100, defOverride = null) {
	const base = src.o_();
	const spread = base >= 15 ? (base / 5) | 0 : base >= 12 ? 3 : 2;
	const def = defOverride ?? dst.n_(false);
	let s = 0;
	for (let r = base - spread; r <= base + spread; r++) {
		const roll = Math.max(r, 1);
		const d = mult === 100 ? roll : Math.max(((mult * roll) / 100) | 0, 2);
		s += Math.max(d - def, 1);
	}
	return s / (2 * spread + 1);
}
/** min / max melee damage of src on dst */
export function dmgRange(src, dst, mult = 100) {
	const base = src.o_();
	const spread = base >= 15 ? (base / 5) | 0 : base >= 12 ? 3 : 2;
	const def = dst.n_(false);
	const f = (r) => { const roll = Math.max(r, 1); const d = mult === 100 ? roll : Math.max(((mult * roll) / 100) | 0, 2); return Math.max(d - def, 1); };
	return [f(base - spread), f(base + spread)];
}

/**
 * Path from p to q for critter faction k (hw.t, the aggro / AI form): { steps, cost } (steps 0 = none). hw.t returns a
 * cost, not a length: 100 per plain cell, 1500 per cell held by a critter of another team, +3 per turn, ...
 */
const PATH = [];
export function pathInfo(h, p, q, k, limit = 20) {
	const cost = h.t_(p, q, PATH, limit, 20, k, true, 0);
	return { steps: cost === 0 ? 0 : PATH.length, cost };
}
/** steps of that path (0 = none) */
export function pathLen(h, p, q, k, limit = 20) { return pathInfo(h, p, q, k, limit).steps; }
/** steps of the hero's own tap path to cell (x, y) (hw.t as the tap uses it: 45, revealed cells); 0 = none */
export function tapLen(h, x, y) {
	const tmp = [];
	h.t_(h.f.b, new Util$Point(x, y), tmp, 45, 45, -1, false, 0);
	return tmp.length;
}
/** cell free to stand on (hw.z) */
export const free = (h, x, y) => x >= 0 && y >= 0 && x < h.g && y < h.h && h.z_(x, y);
/** free 4-neighbours of a cell */
export function openNeighbours(h, x, y) { let n = 0; for (const [dx, dy] of DIR4) if (free(h, x + dx, y + dy)) n++; return n; }

/**
 * A cheap state key for progress detection (lean step() reports rejections, not no-ops): hero, pools, selection,
 * tap path, turn order head, RNG states, list sizes, used / flag bits of objects.
 */
export function progressKey(fight) {
	const { h, c } = fight;
	const me = h.f;
	let k = `${me.b.a},${me.b.b},${me.j.v_()},${me.z.v_()},${me.E_()},${me.n.v_()},${h.x.a},${h.w.a},${h.n.length},${h.o.length},${h.C ? 1 : 0},${c.z.length},${fight.selId()},${h.D.length ? h.o.indexOf(h.D[0]) : -1},${me.D.c.length},${h.F ? 1 : 0}`;
	let s = 0;
	for (let i = 0; i < h.n.length; i++) { const o = h.n[i]; s = (Math.imul(s, 31) + (o.e ? 1 : 0) + (o.d ? 2 : 0) + (o.f ? 4 : 0) + (o.g & 0xff) * 8) | 0; }
	for (let i = 0; i < h.o.length; i++) { const o = h.o[i]; s = (Math.imul(s, 31) + o.b.a * 131 + o.b.b + o.j.v_() * 7) | 0; }
	return k + '|' + s;
}

// ---------------------------------------------------------------------------------------------------------------
// Resource ledger

/**
 * What a stretch of play cost: items used by id (per-step pack decreases; the spider 168 by its net decrease over
 * the stretch, since an unhurt spider goes back into the pack when combat ends), MP spent (net: pool before - after,
 * fountains and crystals count as negative spending), HP / EP lost (net), deaths, inputs.
 */
export class Ledger {
	constructor() {
		this.used = new Map();     // id -> count
		this.gained = new Map();   // id -> count (loot)
		this.spiderNet = 0;        // throws - returns of 168
		this.mp = 0;               // net MP spent
		this.mpOut = 0;            // gross MP spent (decreases only)
		this.hp = 0;               // net HP lost
		this.ep = 0;               // net EP lost
		this.inputs = 0;
		this.dead = false;
		this.mpPeak = 0;           // the largest net MP spent so far (the drawdown below the pool at the start)
		this.mpBy = {};            // gross MP spent by cause: route (doors / chests / traps / bumps), unseal, skill ids
		this.topUps = [];          // MP the player solves for mid-dungeon (Run.topUpFor): { at, stop, enc, amount, pool, min }
	}

	clone() {
		const l = new Ledger();
		l.used = new Map(this.used); l.gained = new Map(this.gained); l.spiderNet = this.spiderNet;
		l.mp = this.mp; l.mpOut = this.mpOut; l.hp = this.hp; l.ep = this.ep; l.inputs = this.inputs; l.dead = this.dead;
		l.mpPeak = this.mpPeak; l.mpBy = { ...this.mpBy };
		l.topUps = this.topUps.map((t) => ({ ...t }));
		return l;
	}

	/** item count: everything used, the spider only if it was lost */
	items() {
		let n = 0;
		for (const [id, k] of this.used) if (id !== SPIDER) n += k;
		return n + Math.max(0, this.spiderNet);
	}

	/** items used as a plain object { id: count } (spider: net) */
	itemsById() {
		const o = {};
		for (const [id, k] of this.used) if (id !== SPIDER && k > 0) o[id] = k;
		if (this.spiderNet > 0) o[SPIDER] = this.spiderNet;
		return o;
	}

	/** this - base (a ledger that continued from base) */
	since(base) {
		const l = new Ledger();
		for (const [id, k] of this.used) { const d = k - (base.used.get(id) || 0); if (d) l.used.set(id, d); }
		for (const [id, k] of this.gained) { const d = k - (base.gained.get(id) || 0); if (d) l.gained.set(id, d); }
		l.spiderNet = this.spiderNet - base.spiderNet; l.mp = this.mp - base.mp; l.mpOut = this.mpOut - base.mpOut;
		l.hp = this.hp - base.hp; l.ep = this.ep - base.ep; l.inputs = this.inputs - base.inputs; l.dead = this.dead && !base.dead;
		l.mpPeak = Math.max(0, this.mpPeak - base.mp);
		for (const [k, v] of Object.entries(this.mpBy)) { const d = v - (base.mpBy[k] || 0); if (d) l.mpBy[k] = d; }
		return l;
	}

	add(o) {
		for (const [id, k] of o.used) this.used.set(id, (this.used.get(id) || 0) + k);
		for (const [id, k] of o.gained) this.gained.set(id, (this.gained.get(id) || 0) + k);
		this.spiderNet += o.spiderNet; this.mp += o.mp; this.mpOut += o.mpOut; this.hp += o.hp; this.ep += o.ep;
		this.inputs += o.inputs; this.dead = this.dead || o.dead;
		this.mpPeak = Math.max(this.mpPeak, this.mp - o.mp + o.mpPeak);
		for (const [k, v] of Object.entries(o.mpBy)) this.mpBy[k] = (this.mpBy[k] || 0) + v;
	}
}

/**
 * The least MP the player must solve for at each recorded top-up (Ledger.topUps; each one filled the pool to max)
 * so that the pool never goes below 0 with the same play: a top-up can shrink by the lowest pool level after it
 * (until the end), less what earlier top-ups already shrank. Returns the amounts, in order.
 */
export function trimTopUps(tops) {
	const n = tops.length;
	const suf = new Array(n);
	let m = Infinity;
	for (let j = n - 1; j >= 0; j--) { m = Math.min(m, tops[j].min); suf[j] = m; }
	const out = [];
	let D = 0;
	for (let j = 0; j < n; j++) {
		const Dj = Math.max(D, Math.min(D + tops[j].amount, suf[j]));
		out.push(tops[j].amount - (Dj - D));
		D = Dj;
	}
	return out;
}

/**
 * A consumable for the objective (bj0): something that restores (X HP / Y EP / Z MP), buffs (a0), is thrown / placed
 * (b0: kunai, grenades, nets, hooks, spider, bait, familiars) -- not keys (167 / 222), loot or quest items. Item 192
 * (the global MP stock) is MP, not an item.
 */
const CONSUMABLE = new Map();
export function isConsumable(it) {
	let v = CONSUMABLE.get(it);
	if (v === undefined) {
		v = it.a !== 192 && (!!it.b0 || it.X > 0 || it.Y > 0 || it.Z > 0 || it.a0 !== 0) && (it.d0 || it.e0);
		CONSUMABLE.set(it, v);
	}
	return v;
}

/** consumable pack counts: flat [id, count, ...] in pack order (cheap to take before every input) */
export function packFlat(h) {
	const out = [];
	for (const e of h.f.D.c) if (isConsumable(e.a)) out.push(e.a.a, e.a_());
	return out;
}

/** pools + consumable pack before an input */
export function probe(h) {
	const me = h.f;
	return { hp: me.j.v_(), ep: me.z.v_(), mp: me.E_(), pack: packFlat(h) };
}

/** the MP cause of an input (Ledger.mpBy): a skill id, unseal, or route (taps / steps: doors, chests, traps) */
const mpCause = (inp) => (!inp ? 'route' : inp.t === 'skill' ? String(inp.id) : inp.t === 'unseal' ? 'unseal' : inp.t === 'item' ? 'item' : 'route');

/** account one input: before = probe(h) taken before it */
export function account(led, before, h, inp = null) {
	const me = h.f;
	const hp = me.j.v_(), ep = me.z.v_(), mp = me.E_();
	led.hp += before.hp - hp;
	led.ep += before.ep - ep;
	led.mp += before.mp - mp;
	if (led.mp > led.mpPeak) led.mpPeak = led.mp;
	if (led.topUps.length) { const t = led.topUps[led.topUps.length - 1]; if (mp < t.min) t.min = mp; }
	if (mp < before.mp) { led.mpOut += before.mp - mp; const k = mpCause(inp); led.mpBy[k] = (led.mpBy[k] || 0) + before.mp - mp; }
	led.inputs++;
	const a = packFlat(h), b = before.pack;
	if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
		const m0 = new Map(), m1 = new Map();
		for (let i = 0; i < b.length; i += 2) m0.set(b[i], (m0.get(b[i]) || 0) + b[i + 1]);
		for (let i = 0; i < a.length; i += 2) m1.set(a[i], (m1.get(a[i]) || 0) + a[i + 1]);
		for (const [id, k] of m0) {
			const k2 = m1.get(id) || 0;
			if (k2 < k) {
				if (id === SPIDER) led.spiderNet += k - k2;
				else led.used.set(id, (led.used.get(id) || 0) + k - k2);
			}
		}
		for (const [id, k2] of m1) {
			const k = m0.get(id) || 0;
			if (k2 > k) {
				if (id === SPIDER) led.spiderNet -= k2 - k;
				else led.gained.set(id, (led.gained.get(id) || 0) + k2 - k);
			}
		}
	}
	if (me.u_()) led.dead = true;
}

// ---------------------------------------------------------------------------------------------------------------
// Fights from a hero spec

let entryMod = undefined;
/** js/combat/entry.js (the player's profile path), if it exists; loaded once */
export async function loadEntry() {
	if (entryMod !== undefined) return entryMod;
	try { entryMod = await import('../combat/entry.js'); } catch { entryMod = null; }
	return entryMod;
}

/**
 * A lean Fight at the dungeon start: { type, seed, xseed, at? } + hero spec. Profile heroes need loadEntry() first.
 * Returns a Fight or { error }.
 */
const EDITS = ['level', 'gear', 'kit', 'kit2', 'skills', 'quests', 'pets', 'run', 'trapsindif'];
export function makeFight(hero, { type, seed, xseed, at = 'start' }) {
	if (hero && hero.profile) {
		// the player's hero (js/combat/entry.js): { profile: { vj0 (importSave(bytes).vj0), hero: index, premium } }
		if (!entryMod || !entryMod.newFightFromProfile) return { error: 'profile hero: js/combat/entry.js (newFightFromProfile) is not available' };
		const P = hero.profile;
		if (!P.vj0) return { error: 'profile hero: not imported (resolveProfile first)' };
		const spec = { vj0: P.vj0, type, seed, xseed, at, profile: P.name || 'profile' };
		if (P.hero != null) spec.hero = P.hero;
		if (P.premium) spec.premium = true;
		for (const k of EDITS) if (hero[k] != null && hero[k] !== false) spec[k] = hero[k];
		const f = entryMod.newFightFromProfile(spec, { lean: true });
		if (!f.error && hero.mp != null) f.h.f.G_(Math.max(0, Math.min(hero.mp | 0, f.h.e.n_())));
		if (!f.error && hero.items) for (const [id, n] of hero.items) f.h.f.D.b_(id, n);
		return f;
	}
	const spec = { mode: 'fightgen', type, seed, xseed, at };
	for (const k of EDITS) if (hero && hero[k] != null && hero[k] !== false) spec[k] = hero[k];
	const f = newFight(spec, { lean: true });
	// solver-side edits after the setup (not in the oracle's flags: robust mode only): MP pool, extra pack items
	if (!f.error && hero) {
		if (hero.mp != null) f.h.f.G_(Math.max(0, Math.min(hero.mp | 0, f.h.e.n_())));
		if (hero.items) for (const [id, n] of hero.items) f.h.f.D.b_(id, n);
	}
	return f;
}

/** the hero spec only uses oracle-replayable edits (exact mode can check its script in the JVM oracle) */
export const oracleReplayable = (hero) => !!hero && (!hero.profile || !!hero.profile.path) && hero.mp == null && !hero.items;

/**
 * A hero spec whose profile is given as save bytes ({ profile: { bytes, hero, premium, path? } }) with the profile
 * imported (js/save importSave) -- done where the fight runs (each worker), since an imported profile is an object
 * graph that does not survive postMessage. Call after resetStatics.
 */
export async function resolveProfile(hero) {
	if (!hero || !hero.profile || hero.profile.vj0 || !hero.profile.bytes) return hero;
	const { importSave } = await import('../save/index.js');
	const imp = await importSave(hero.profile.bytes);
	return { ...hero, profile: { ...hero.profile, vj0: imp.vj0 } };
}

/** a hero spec as plain data for results / plans (a profile by its file name, hero index, premium) */
export function heroSpecOut(hero) {
	if (!hero || !hero.profile) return hero;
	const { vj0, bytes, ...p } = hero.profile;
	void vj0; void bytes;
	return { ...hero, profile: p };
}

/** a hero spec safe to post to a worker (an imported profile is replaced by its bytes) */
export function portableHero(hero) {
	if (!hero || !hero.profile) return hero;
	const { vj0, ...rest } = hero.profile;
	void vj0;
	return { ...hero, profile: rest };
}

/** oracle command-line flags of a hero spec (tools/oracle run.sh fightgen ... [flags]); a profile needs its file path */
export function oracleFlags(hero) {
	const a = [];
	if (hero.profile) {
		a.push('--profile', String(hero.profile.path));
		if (hero.profile.hero != null) a.push('--hero', String(hero.profile.hero));
		if (hero.profile.premium) a.push('--premium');
	}
	if (hero.level != null) a.push('--level', String(hero.level));
	if (hero.gear != null) a.push('--gear', String(hero.gear));
	if (hero.kit) a.push('--kit');
	if (hero.kit2) a.push('--kit2');
	if (hero.quests) a.push('--quests', String(hero.quests));
	if (hero.skills) a.push('--skills', String(hero.skills));
	if (hero.pets) a.push('--pets', String(hero.pets));
	if (hero.run != null) a.push('--run', String(hero.run));
	if (hero.trapsindif != null) a.push('--trapsindif', String(hero.trapsindif));
	return a;
}

// ---------------------------------------------------------------------------------------------------------------
// The planner's level format from the live hw (as tools/explore.mjs levelOf; `ref` = the live object)

export function levelOf(h) {
	const n = h.j.length;
	const cells = new Array(2 * n);
	for (let i = 0; i < n; i++) { cells[2 * i] = h.j[i].a; cells[2 * i + 1] = h.j[i].b; }
	const bit = (v) => (v ? 1 : 0);
	const obj = (q) => ({ id: q.a.a, x: q.b.a, y: q.b.b, c: bit(q.c), d: bit(q.d), e: bit(q.e), f: bit(q.f), g: q.g, h: q.h, ref: q });
	return {
		type: h.b, seed: h.a, w: h.g, h: h.h, a: h.a, y: h.y, A: h.A, cells,
		objects: h.n.map(obj),
		critters: h.o.map((c) => ({ ...obj(c), k: c.k, x: c.b.a, y: c.b.b })),
	};
}

// ---------------------------------------------------------------------------------------------------------------
// Route walker: the planner's stops, out of combat (deterministic port of tools/explore.mjs Policy.walk / plan /
// barrels / nonogram dips, minus its random extras). Object and critter references are kept in one table (refs) and
// everything else holds indexes into it, so freeze() / thaw() can carry the walker across clone.js snapshots:
// freeze turns each ref into its position in hw.n / hw.o (the snapshot keeps both lists in order), thaw looks them
// up in the restored level.

export class Walker {
	/**
	 * opts: { recovery: true (visit unused fountains 48 / 58 / 95 as extra stops), rest: RestRule (between fights:
	 * Doctor / Charge / items), maxReplans: 60 }
	 */
	constructor(fight, opts = {}, frozen = null) {
		this.f = fight;
		this.h = fight.h;
		this.c = fight.c;
		this.opts = opts;
		if (frozen) {
			Object.assign(this, structuredCloneLite(frozen.s));
			this.route = frozen.route;
			this.legs = frozen.legs;
			this.refs = frozen.refs.map((r) => (r == null ? null : r.l === 'n' ? fight.h.n[r.i] : fight.h.o[r.i]));
			return;
		}
		this.refs = [];
		this.route = [];
		this.legs = [];
		this.cur = 0;
		this.stall = 0;
		this.tries = {};
		this.lastKey = '';
		this.exitTries = 0;
		this.finished = false;
		this.done = [];          // ref indexes bumped
		this.failed = [];        // ref indexes given up
		this.replans = 0;
		this.nonogramDone = false;
		this.blocked = [];       // cells that would not open
		this.jumpFrom = null;
		this.pendingBump = -1;
		this.pushes = null;
		this.pushAt = 0;
		this.restTries = 0;
		this.stats = { plans: 0, skips: 0, bumps: 0, stops: 0, walkInputs: 0, rest: 0 };
		this.plan();
	}

	/** plain-data copy for a checkpoint (refs as hw.n / hw.o positions) */
	freeze() {
		const h = this.h;
		const refs = this.refs.map((o) => {
			if (o == null) return null;
			let i = h.n.indexOf(o);
			if (i >= 0) return { l: 'n', i };
			i = h.o.indexOf(o);
			return i >= 0 ? { l: 'o', i } : null;
		});
		const s = {};
		for (const k of Object.keys(this)) if (k !== 'f' && k !== 'h' && k !== 'c' && k !== 'opts' && k !== 'refs' && k !== 'route' && k !== 'legs') s[k] = this[k];
		// route / legs are never changed in place (re-plans make new arrays; the nonogram splice and leg flags copy
		// first), so checkpoints share them
		return { s: structuredCloneLite(s), refs, route: this.route, legs: this.legs };
	}

	static thaw(frozen, fight, opts) { return new Walker(fight, opts, frozen); }

	ref(o) { let i = this.refs.indexOf(o); if (i < 0) { i = this.refs.length; this.refs.push(o); } return i; }
	cellIdx(x, y) { return y * this.h.g + x; }
	heroCell() { const p = this.h.f.b; return p.b * this.h.g + p.a; }
	adjacent(i, j) { const g = this.h.g; return Math.abs((i % g) - (j % g)) + Math.abs(((i / g) | 0) - ((j / g) | 0)) === 1; }
	tapCell(i) { return { t: 'tap', x: i % this.h.g, y: (i / this.h.g) | 0 }; }
	pathLen(i) { return tapLen(this.h, i % this.h.g, (i / this.h.g) | 0); }
	stepTo(i) {
		const p = this.h.f.b, g = this.h.g;
		const dx = Math.sign((i % g) - p.a), dy = Math.sign(((i / g) | 0) - p.b);
		if (dx === 0 && dy === 0) return null;
		if (dx !== 0 && dy !== 0) return free(this.h, p.a + dx, p.b) ? { t: 'step', dx, dy: 0 } : { t: 'step', dx: 0, dy };
		return { t: 'step', dx, dy };
	}

	plan() {
		const h = this.h;
		const level = levelOf(h);
		this.stats.plans++;
		for (const i of this.blocked) level.cells[2 * i] = 0;
		const doneSet = new Set([...this.done, ...this.failed].map((i) => this.refs[i]).filter(Boolean));
		// done stops are used; given-up objects keep blocking their cells but are no stops (id -1: no type)
		const failedSet = new Set(this.failed.map((i) => this.refs[i]).filter(Boolean));
		for (const o of level.objects) { if (doneSet.has(o.ref)) o.e = 1; if (failedSet.has(o.ref)) o.id = -1; }
		level.critters = level.critters.filter((c) => c.id === 180 || !doneSet.has(c.ref) || c.k !== 0);
		// recovery stops: an unused fountain is worth the detour only while the pool it fills is short by half its value
		const want = (id) => this.wantRecovery(id);
		const extra = this.opts.recovery !== false;
		const rw = (id) => {
			const d = zw.Q.get(id) ?? zw.R.get(id) ?? null;
			if (d == null) return undefined;
			if (extra && zw.Q.has(id) && RECOVERY.has(id) && !d.t && want(id)) { const e = Object.create(d); e.t = true; e.n = true; return e; }
			return d;
		};
		let plan;
		try {
			// the first plan is exact up to 16 stops (Held-Karp, 50-200 ms); re-plans mid-dungeon up to 10 (~1 ms), heuristic beyond
			plan = planRoute(level, { rw, bw: (id) => zw.R.get(id) ?? null, pwOf: (t) => zw.M[t], patterns: this.nonogramDone ? null : zw.O, tiles: zw.u, endAtExit: true, exactLimit: this.stats.plans > 1 ? (this.opts.replanExact ?? 10) : (this.opts.planExact ?? 16) });
		} catch (e) {
			this.route = [];
			this.planError = String(e && e.message || e);
			return;
		}
		// recovery stops that are already used, or that the hero would not profit from, are dropped by the planner
		// (used objects are no objectives: rw.n) -- fountains have rw.n? if not, mark used ones done here
		const out = [];
		const legs = [];
		for (const leg of plan.legs) {
			const s = leg.stop;
			const exactFrom = s.walk ? leg.to - s.walk.length + 1 : Infinity;
			const first = out.length;
			const L = { kind: s.kind, label: s.label || null, rec: s.rec ? { id: s.rec.id, x: s.rec.x, y: s.rec.y, k: s.rec.k, ri: s.rec.ref ? this.ref(s.rec.ref) : -1 } : null, at: leg.at, steps: leg.steps, doing: leg.doing.map((d) => ({ text: d.text, at: d.at, ep: d.ep, mp: d.mp })), walk: !!s.walk };
			const li = legs.length;
			legs.push(L);
			for (let k = leg.from + 1; k <= leg.to; k++) {
				const p = plan.route[k];
				if (p.jump) { out.push({ jump: true, leg: li }); continue; }
				out.push({ i: this.cellIdx(p.x, p.y), exact: k >= exactFrom, leg: li });
			}
			if (s.kind === 'exit') out.push({ exit: true, leg: li });
			else if (s.kind === 'barrels') out.push({ barrels: true, leg: li });
			else if (s.rec && s.rec.ref && !s.walk) out.push({ bump: s.rec.k !== undefined ? 'cr' : 'obj', ri: L.rec.ri, leg: li });
			else if (s.walk) out.push({ walkDone: true, leg: li });
			if (s.walk) { const k = out.findIndex((w, j) => j >= first && w.exact); if (k >= 0) out[k].walkStart = true; }
			L.first = first;
			L.last = out.length - 1;
		}
		this.route = out;
		this.legs = legs;
		this.cur = 0;
	}

	/** a recovery object (fountain) is worth a detour now: its pool is short by more than half its value */
	wantRecovery(id) {
		const r = RECOVERY.get(id);
		if (!r) return false;
		const P = heroOf(this.h);
		return r.mp ? P.mpM - P.mp >= (r.mp >> 1) + 1 : P.epM - P.ep >= (r.ep >> 1) + 1;
	}

	/**
	 * After an encounter: re-plan (not counted as a failure) only when an unused fountain became worth visiting and the
	 * route does not go there yet -- planning costs 50-200 ms, so not after every fight.
	 */
	afterEncounter() {
		if (this.opts.recovery === false || this.finished) return;
		const planned = new Set();
		for (let k = this.cur; k < this.route.length; k++) { const w = this.route[k]; if (w.bump === 'obj') planned.add(this.refs[w.ri]); }
		for (const o of this.h.n) {
			if (!RECOVERY.has(o.a.a) || o.e || planned.has(o) || !this.wantRecovery(o.a.a)) continue;
			const r = this.replans;
			this.replan();
			this.replans = r;
			return;
		}
	}

	/**
	 * MP / EP the rest of the route still needs: the planner's door / trap / undergrowth costs and chest MP of the legs
	 * from the current one on, plus the seals of objective critters still alive.
	 */
	routeNeeds() {
		const w = this.route[Math.min(this.cur, this.route.length - 1)];
		const from = w ? w.leg : this.legs.length;
		let mp = 0, ep = 0;
		for (let i = from; i < this.legs.length; i++) {
			const L = this.legs[i];
			for (const d of L.doing) { mp += d.mp || 0; ep += d.ep || 0; }
			if (L.rec && L.rec.k === undefined) { const def = zw.Q.get(L.rec.id); if (def && def.v) mp += def.v; }
		}
		const h = this.h;
		let invincible = 0;
		for (const m of h.o) {
			if (m === h.f || m.u_() || !m.a.t) continue;
			const seal = sealOf(h, m);
			if (seal >= 1000) invincible++;   // bw.m0 bosses (100000) until their quest is done: no MP opens them
			else mp += seal;
		}
		return { mp, ep, invincible };
	}

	/** EP of the current leg only (undergrowth, stuck doors) */
	legEp() {
		const w = this.route[Math.min(this.cur, this.route.length - 1)];
		if (!w) return 0;
		let ep = 0;
		for (const d of this.legs[w.leg].doing) ep += d.ep || 0;
		return ep;
	}

	/** MP of the current leg only: its doors / traps / undergrowth, the chest or sealed object at its stop, its critter's seal */
	legNeeds() {
		const w = this.route[Math.min(this.cur, this.route.length - 1)];
		if (!w) return 0;
		const L = this.legs[w.leg];
		let mp = 0;
		for (const d of L.doing) mp += d.mp || 0;
		if (L.rec) {
			if (L.rec.k === undefined) { const def = zw.Q.get(L.rec.id); if (def && def.v) mp += def.v; }
			else { const o = L.rec.ri >= 0 ? this.refs[L.rec.ri] : null; if (o && o.e_ && o.e_() && !o.u_()) { const sl = sealOf(this.h, o); if (sl < 1000) mp += sl; } }
		}
		return mp;
	}

	/** the current stop: { kind, label, rec, at } (for encounter keys and the plan) */
	stop() {
		const w = this.route[Math.min(this.cur, this.route.length - 1)];
		return w ? this.legs[w.leg] : null;
	}

	/** give up the current leg (markStop: its stop is not retried) and re-plan from here */
	failLeg(markStop = true) {
		this.stats.skips++;
		const w = this.route[this.cur];
		const L = w ? this.legs[w.leg] : null;
		if (markStop && L && L.rec && L.rec.ri >= 0) this.failed.push(L.rec.ri);
		if (L && L.walk) this.nonogramDone = true;
		if (L && L.kind === 'exit') { this.finished = true; return; }
		this.replan();
	}

	replan() {
		if (++this.replans > (this.opts.maxReplans ?? 60)) { this.finished = true; return; }
		this.tries = {};
		this.stall = 0;
		this.jumpFrom = null;
		this.plan();
	}

	/** the next out-of-combat input, or null when the route is done (or given up) */
	next() {
		if (this.finished) return null;
		const h = this.h, c = this.c;
		if (c.w || h.f.u_()) return null;
		if (this.f.selId() !== 0) return { t: 'cancel' };
		const rest = this.opts.rest;
		// the rest rule is for between fights (in a combat stand-off the walker only walks)
		if (rest && this.restTries < 8 && !h.C) {
			const r = rest.next(this.f, this);
			if (r) { this.restTries++; this.stats.rest++; return r; }
		}
		this.restTries = 0;
		this.stats.walkInputs++;
		for (let guard = 0; guard < 200; guard++) {
			const r = this.walk();
			if (r !== undefined) return r;
			if (this.finished) return null;
		}
		this.finished = true;
		return null;
	}

	/**
	 * after an input: changed = the state moved (progressKey differs). A bumped stop counts as done once it is used: an
	 * object gone, flagged used (qw.e) or no longer an objective (a sealed one's first bump only reveals it: bump again);
	 * a critter (talk) when the state changed.
	 */
	observe(changed) {
		if (changed) this.stall = 0;
		else this.stall++;
		const ri = this.pendingBump;
		this.pendingBump = -1;
		if (ri < 0 || !changed) return;
		const o = this.refs[ri];
		const h = this.h;
		if (o == null) { this.done.push(ri); return; }
		// a critter: talking to a person (k 0) is done when something happened; a foe only when it is gone
		if (o.e_()) { if (o.k === 0 || o.u_() || !h.o.includes(o)) this.done.push(ri); return; }
		if (!h.n.includes(o) || o.e || (!o.f_(h) && !RECOVERY.has(o.a.a))) this.done.push(ri);
	}

	walk() {
		const h = this.h;
		if (this.cur >= this.route.length) {
			if (h.i_() > 0 && this.route.length && this.replans < (this.opts.maxReplans ?? 60)) { this.replan(); return undefined; }
			this.finished = true;
			return null;
		}
		const w0 = this.route[this.cur];
		if (this.stall > 8) { this.failLeg(); return undefined; }
		const H = this.heroCell();
		for (let k = this.cur; k < Math.min(this.route.length, this.cur + 60); k++) {
			const q = this.route[k];
			if (q.jump || q.bump || q.exit || q.walkDone || q.barrels) break;
			if (q.exact) { if (k === this.cur && q.i === H) this.cur = k + 1; break; }
			if (q.i === H) this.cur = k + 1;
		}
		if (this.route[this.cur] !== w0) return undefined;
		const w = w0;
		const tk = this.cur;
		const tries = (this.tries[tk] || 0) + 1;
		this.tries[tk] = tries;
		if (tries > 14) { this.failLeg(); return undefined; }
		const L = this.legs[w.leg];

		if (w.walkDone) { this.nonogramDone = true; this.cur++; return undefined; }
		if (w.barrels) return this.barrels(H, tries);
		if (w.exact && this.cur > 0 && this.route[this.cur - 1].walkStart && !L.rewalked) {
			this.legs = this.legs.slice();
			this.legs[w.leg] = { ...L, rewalked: true };
			const walk = this.nonogramDips();
			let end = this.cur;
			while (end < this.route.length && this.route[end].exact) end++;
			this.route = this.route.slice();
			this.route.splice(this.cur, end - this.cur, ...walk.map((i) => ({ i, exact: true, leg: w.leg })));
			this.tries = {};
			return undefined;
		}
		if (w.exit) {
			for (const [dx, dy] of DIR4) {
				const x = h.f.b.a + dx, y = h.f.b.b + dy;
				if (x < 0 || y < 0 || x >= h.g || y >= h.h) continue;
				if (h.j[y * h.g + x].a === 5) {
					if (++this.exitTries > 3) {
						// the stairs did not take us: objectives left (a forest exit lock, a stop given up too early) -> re-plan
						if (h.i_() > 0 && (this.exitReplans = (this.exitReplans || 0) + 1) <= 3) { this.exitTries = 0; this.replan(); return undefined; }
						this.finished = true;
						return null;
					}
					return { t: 'step', dx, dy };
				}
			}
			this.failLeg();
			return undefined;
		}
		if (w.bump) {
			const live = this.refs[w.ri];
			const gone = live == null || (w.bump === 'obj' ? !h.n.includes(live) : !h.o.includes(live) || live.u_());
			const used = live != null && w.bump === 'obj' && RECOVERY.has(live.a.a) && live.e;
			if (gone || used || this.done.includes(w.ri)) { this.stats.stops++; this.cur++; return undefined; }
			if (tries > 6) { this.failLeg(); return undefined; }
			this.stats.bumps++;
			const tgt = this.footNear(live);
			if (this.adjacent(H, tgt) || w.bump === 'cr' || tries > 3) this.pendingBump = this.adjacent(H, tgt) ? w.ri : -1;
			return this.tapCell(tgt);
		}
		if (w.jump) {
			const land = this.route[this.cur + 1];
			if (this.jumpFrom != null && H !== this.jumpFrom) { this.jumpFrom = null; this.cur++; return undefined; }
			if (land && land.i === H) { this.cur += 2; return undefined; }
			if (land && land.i !== undefined && this.pathLen(land.i) > 0) { this.cur++; return undefined; }
			const t = this.teleportNear(H);
			if (t == null || tries > 4) {
				const prev = this.route[this.cur - 1];
				if (t == null && prev && prev.i !== undefined && prev.i !== H && tries <= 4 && this.pathLen(prev.i) > 0) return this.tapCell(prev.i);
				this.failLeg();
				return undefined;
			}
			this.stats.bumps++;
			this.jumpFrom = H;
			return this.tapCell(t);
		}
		const i = w.i;
		const o = h.k[i];
		if (o != null && o !== h.f && !(o.a.a === 84) && this.adjacent(H, i)) {
			if (tries > 6) {
				// a door that needs something first (a key: one per locked door) is re-planned around, not walled up,
				// until it failed twice
				const k = 'door' + i;
				this.tries[k] = (this.tries[k] || 0);
				this.doorFails = this.doorFails || {};
				this.doorFails[i] = (this.doorFails[i] || 0) + 1;
				const retry = DOOR_IDS.has(o.a.a) && this.doorFails[i] <= 2;
				if (!retry) this.blocked.push(i);
				this.failLeg(!retry);
				return undefined;
			}
			this.stats.bumps++;
			return this.tapCell(i);
		}
		if (w.exact) {
			if (this.adjacent(H, i)) return this.stepTo(i);
			if (H !== i) {
				if (this.pathLen(i) > 0) return this.tapCell(i);
				const s = this.stepTo(i);
				if (s) return s;
				this.failLeg();
				return undefined;
			}
		}
		// tap a route cell ahead: the furthest plain one the game can path to (fewer inputs; the engine walks it)
		// (a tap that does not move us -- its path bumps something the route does not, e.g. a sealed critter -- is
		// retried shorter, then as single steps)
		if (this.stall >= 4) { const st = this.stepTo(i); if (st && this.stall % 2 === 0) return st; }
		let last = this.cur;
		const lim = this.stall >= 1 ? Math.max(2, (this.opts.tapAhead ?? 30) >> (this.stall + 1)) : (this.opts.tapAhead ?? 30);
		for (let k = this.cur; k < Math.min(this.route.length, this.cur + lim); k++) {
			const q = this.route[k];
			if (q.jump || q.bump || q.exit || q.exact || q.walkDone || q.barrels) break;
			const oo = h.k[q.i];
			if (oo != null && oo !== h.f && oo.a.a !== 84) break;
			last = k;
		}
		for (let k = last, n = 0; k >= this.cur && n < 12; k--, n++) {
			const ci = this.route[k].i;
			if (ci === H) continue;
			if (this.pathLen(ci) > 0) return this.tapCell(ci);
		}
		const s = this.stepTo(i);
		if (s) return s;
		this.failLeg();
		return undefined;
	}

	/** the floor nonogram (c30.u0): dips from the corner (2,2) that toggle exactly the cells that differ */
	nonogramDips() {
		const h = this.h, c = this.c, g = h.g;
		const pat = zw.O[h.A];
		const at = (gx, gy) => (c.w0 + gy) * g + (c.v0 + gx);
		const fills = [];
		for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
			const set = (h.j[at(q + 3, r + 3)].b & -128) !== 0;
			if (set !== (pat[(r + 3) * 8 + q + 3] !== 0)) fills.push([q, r]);
		}
		const walk = [];
		let cur = [2, 2];
		const moveBorder = (tx, ty) => {
			while (cur[0] !== tx || cur[1] !== ty) {
				if (cur[1] === 2 && ty === 2) cur = [cur[0] + Math.sign(tx - cur[0]), 2];
				else if (cur[0] === 2 && tx === 2) cur = [2, cur[1] + Math.sign(ty - cur[1])];
				else if (cur[1] === 2) cur = [cur[0] + Math.sign(2 - cur[0]), 2];
				else cur = [2, cur[1] + Math.sign(2 - cur[1])];
				walk.push(at(cur[0], cur[1]));
			}
		};
		const dips = fills.map(([q, r]) => (r <= q ? { side: 'top', bx: q + 3, by: 2, depth: r + 1 } : { side: 'left', bx: 2, by: r + 3, depth: q + 1 }));
		dips.sort((a, b) => (a.side === b.side ? (a.side === 'top' ? a.bx - b.bx : a.by - b.by) : a.side === 'top' ? -1 : 1));
		for (const d of dips) {
			moveBorder(d.bx, d.by);
			const path = [];
			for (let k = 1; k <= d.depth; k++) path.push(d.side === 'top' ? at(d.bx, 2 + k) : at(2 + k, d.by));
			walk.push(...path, ...path.slice(0, -1).reverse(), at(d.bx, d.by));
		}
		return walk;
	}

	barrels(H, tries) {
		const h = this.h, c = this.c, g = h.g;
		if (c.u0 === 0 || h.k[c.u0] == null) { this.cur++; return undefined; }
		if (!this.pushes) { this.pushes = this.solveBarrels() || []; this.pushAt = 0; }
		if (this.pushAt >= this.pushes.length || tries > 200) { this.pushes = null; this.cur++; return undefined; }
		const p = this.pushes[this.pushAt];
		if (H === p.from) {
			const o = h.k[p.from + p.d[0] + p.d[1] * g];
			if (o == null || !o.a.u) { this.pushes = null; this.cur++; return undefined; }
			this.pushAt++;
			return { t: 'step', dx: p.d[0], dy: p.d[1] };
		}
		if (this.adjacent(H, p.from)) return this.stepTo(p.from);
		if (this.pathLen(p.from) > 0) return this.tapCell(p.from);
		this.pushes = null;
		this.cur++;
		return undefined;
	}

	solveBarrels() {
		const h = this.h, c = this.c, g = h.g;
		const dx0 = c.u0 % g, dy0 = (c.u0 / g) | 0;
		const near = (i) => Math.max(Math.abs((i % g) - dx0), Math.abs(((i / g) | 0) - dy0)) <= 12;
		const plates = [];
		for (let i = 0; i < h.j.length; i++) if (h.j[i].n_() && near(i)) plates.push(i);
		const boxes = [];
		for (const o of h.n) { const i = o.b.b * g + o.b.a; if (o.a.u && near(i)) boxes.push(i); }
		const open = plates.filter((p) => !boxes.includes(p));
		const loose = boxes.filter((b) => !plates.includes(b));
		if (!open.length || loose.length < open.length || loose.length > 6) return null;
		const H0 = this.heroCell();
		const floor = (i, occ) => !occ.has(i) && (h.z_(i % g, (i / g) | 0) || i === H0 || boxes.includes(i)) && c.j[i] > 0;
		const reach = (from, occ) => {
			const seen = new Set([from]);
			const q = [from];
			while (q.length) {
				const u = q.pop();
				for (const [dx, dy] of DIR4) {
					const v = u + dx + dy * g;
					if (!seen.has(v) && floor(v, occ) && near(v)) { seen.add(v); q.push(v); }
				}
			}
			return seen;
		};
		const one = (box, goal, hero, occ) => {
			const key = (b, p) => b * h.j.length + p;
			const prev = new Map([[key(box, hero), null]]);
			const q = [[box, hero]];
			while (q.length) {
				const [b, p] = q.shift();
				if (b === goal) {
					const out = [];
					for (let k = key(b, p); prev.get(k); k = prev.get(k).k) out.push(prev.get(k).push);
					return { pushes: out.reverse(), hero: p };
				}
				const occ2 = new Set(occ); occ2.add(b);
				const r = reach(p, occ2);
				for (const [dx, dy] of DIR4) {
					const from = b - dx - dy * g, to = b + dx + dy * g;
					if (!r.has(from)) continue;
					const nb = floor(to, occ2) && near(to) ? to : from;
					const k = key(nb, b);
					if (prev.has(k)) continue;
					prev.set(k, { k: key(b, p), push: { from, d: [dx, dy] } });
					q.push([nb, b]);
				}
				if (prev.size > 200000) return null;
			}
			return null;
		};
		let budget = 600;
		const dist = (a, b) => Math.abs((a % g) - (b % g)) + Math.abs(((a / g) | 0) - ((b / g) | 0));
		const dfs = (loose, open, placed, hero) => {
			if (!open.length) return [];
			const pairs = [];
			for (const b of loose) for (const pl of open) pairs.push([dist(b, pl), b, pl]);
			pairs.sort((x, y) => x[0] - y[0]);
			for (const [, b, pl] of pairs) {
				if (--budget < 0) return null;
				const occ = new Set([...placed, ...loose.filter((x) => x !== b)]);
				const r = one(b, pl, hero, occ);
				if (!r) continue;
				const rest = dfs(loose.filter((x) => x !== b), open.filter((x) => x !== pl), new Set([...placed, pl]), r.hero);
				if (rest) return [...r.pushes, ...rest];
			}
			return null;
		};
		return dfs(loose, open, new Set(boxes.filter((b) => plates.includes(b))), H0);
	}

	footNear(o) {
		const h = this.h;
		const rt = o.a;
		const T = rt.T || 1, U = rt.U || 1;
		const th = o.c ? T : U, tw = o.c ? U : T;
		const H = this.heroCell();
		let best = o.b.b * h.g + o.b.a, bd = Infinity;
		if (o.e_()) return best;
		for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
			const x = o.b.a + dx, y = o.b.b - dy;
			if (x < 0 || y < 0 || x >= h.g || y >= h.h) continue;
			const i = y * h.g + x;
			const d = Math.abs(x - h.f.b.a) + Math.abs(y - h.f.b.b);
			if (d < bd || (d === bd && this.adjacent(H, i))) { bd = d; best = i; }
		}
		return best;
	}

	teleportNear(H) {
		const h = this.h, g = h.g;
		const hx = H % g, hy = (H / g) | 0;
		for (const o of h.n) {
			if (!TELEPORTS.has(o.a.a)) continue;
			const rt = o.a;
			const T = rt.T || 1, U = rt.U || 1;
			const th = o.c ? T : U, tw = o.c ? U : T;
			for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
				const x = o.b.a + dx, y = o.b.b - dy;
				if (Math.abs(x - hx) + Math.abs(y - hy) === 1) return y * g + x;
			}
		}
		return null;
	}
}

/** deep copy of plain data (arrays / objects / primitives) */
export function structuredCloneLite(v) {
	if (v === null || typeof v !== 'object') return v;
	if (Array.isArray(v)) return v.map(structuredCloneLite);
	const o = {};
	for (const k of Object.keys(v)) o[k] = structuredCloneLite(v[k]);
	return o;
}

// ---------------------------------------------------------------------------------------------------------------
// Between fights: recovery with MP skills first (Doctor below half HP, Charge for EP), items only below a floor

/**
 * Rest rule (out of combat). Doctor (20006: 6 MP, 8-12 HP, only below half HP) and Charge (20005: 6 MP, +10 EP)
 * cost MP, which ranks below items; potions / food only when HP (EP) is below the item floor. mpReserve: MP kept
 * back for the seals / doors still on the route. Returns null when nothing is worth doing.
 */
export class RestRule {
	/**
	 * mpItems: an MP item may refill the pool when it cannot pay the route (useItemsForMp; off by default: MP comes from
	 * puzzles, Run.topUpFor). mpReserve: MP kept back for the route ('route' = Walker.routeNeeds; 0 with top-ups).
	 * epLow: Charge below this EP ('auto': a quarter of max EP, at least 6).
	 */
	constructor({ doctor = true, charge = true, epLow = 6, hpItemFrac = 0, epItemLow = 0, mpReserve = 0, mpItems = false } = {}) {
		Object.assign(this, { doctor, charge, epLow, hpItemFrac, epItemLow, mpReserve, mpItems });
		this.need = null;   // { hp, ep } the coming fights need (the solver sets it before walking a run)
	}

	next(fight, walker = null) {
		const h = fight.h;
		const P = heroOf(h);
		const reserve = this.mpReserve === 'route' ? (walker ? walker.routeNeeds().mp : 0) : this.mpReserve;
		// MP is spent only where it buys something: with free MP (top-ups), Doctor / Charge repair HP / EP up to what the
		// coming fights need (this.need = { hp, ep }, set by the solver from its scout: robust.js / exact.js), Doctor
		// never above half HP (its engine limit). Without a need: the old rule (Doctor below half, Charge below a quarter).
		const free = MP_FREE;
		const need = this.need;
		const half = (P.hpM + 1) >> 1;
		const hpTarget = free && need ? Math.min(half, need.hp) : half;
		const legEp = walker ? walker.legEp() : 0;
		const epTarget = this.epLow === 'auto' ? (free && need ? Math.min(P.epM, need.ep + legEp) : Math.max(6, (P.epM / 4) | 0)) : this.epLow;
		const mpFor = (c) => free || P.mp - c >= reserve;
		if (this.doctor && P.hp < half && P.hp < hpTarget && mpFor(6) && canSkill(h, SKILL.DOCTOR)) return { t: 'skill', id: SKILL.DOCTOR };
		if (this.charge && P.ep < epTarget && P.ep + 10 <= P.epM + 4 && mpFor(6) && canSkill(h, SKILL.CHARGE)) return { t: 'skill', id: SKILL.CHARGE };
		// MP for the route (seals, doors, chests): an MP item only when allowed and the pool cannot pay what is ahead
		if (this.mpItems && P.mp < 8 && walker && walker.routeNeeds().mp > P.mp) { const id = bestItem(h, 'mp', P.mpM - P.mp, false); if (id) return { t: 'potion', id }; }
		if (this.hpItemFrac > 0 && P.hp < P.hpM * this.hpItemFrac) { const id = bestItem(h, 'hp', P.hpM - P.hp, false); if (id) return { t: 'potion', id }; }
		if (this.epItemLow > 0 && P.ep < this.epItemLow) { const id = bestItem(h, 'ep', P.epM - P.ep, false); if (id) return { t: 'potion', id }; }
		return null;
	}
}

/**
 * The pack item that restores `what` ('hp' X / 'ep' Y / 'mp' Z) best for one use, preferring the smallest that covers
 * `need` (no waste), then the largest. inCombat: bj0.d0 (else e0). Never ambrosia 123 (it revives on its own).
 */
export function bestItem(h, what, need, inCombat) {
	const field = what === 'hp' ? 'X' : what === 'ep' ? 'Y' : 'Z';
	let cover = null, big = null;
	for (const e of h.f.D.c) {
		const it = e.a;
		if (e.a_() <= 0 || it.a === AMBROSIA || it.b0) continue;
		if (inCombat ? !it.d0 : !it.e0) continue;
		const v = it[field];
		if (!(v > 0)) continue;
		if (it.a0 !== 0 && it.a0 !== 2) continue;   // buff side effects (berserk 1, bandages 4, ...): not as plain heals
		if (v >= need && (cover == null || v < cover.v)) cover = { id: it.a, v };
		if (big == null || v > big.v) big = { id: it.a, v };
	}
	return (cover || big || {}).id || 0;
}

// ---------------------------------------------------------------------------------------------------------------
// A run: one dungeon play-through (one RNG sample)

/** default limits */
export const LIMITS = { walkInputs: 3000, encounterInputs: 400, stuck: 12 };

export class Run {
	/** fight: a lean Fight (live); opts: { walker opts, keep inputs log: log } */
	constructor(fight, opts = {}, walker = null) {
		this.fight = fight;
		this.opts = opts;
		this._walker = walker;             // made on first use (planning costs ~ms)
		this.led = new Ledger();
		this.log = opts.log ? [] : null;   // every input applied (replayable from the setup)
		this.encounters = 0;
		this.events = [];                  // per encounter: { key, stop, ledger, policy } (filled by callers)
		this.status = 'walk';              // walk | combat | done | dead | stuck | error
		setMpFree(!!opts.topUp);
		this.fights = 0;                   // encounters reached (toEncounter returned combat)
	}

	/**
	 * MP top-up (opts.topUp; README "MP"): MP is effectively endless -- the player can pause at any moment (mid-fight
	 * too), solve puzzles and refill. Before every input (Run.apply), a pool that cannot pay what the input needs (a
	 * skill's MP, an unseal, a tapped sealed object or critter) or is below a threshold (opts.topUp.reserve, default
	 * 30; out of combat plus the current leg's doors / chests / seal, Walker.legNeeds) is filled to max MP. Recorded in
	 * Ledger.topUps (at = the input it comes before); trimTopUps gives the least the player must solve for.
	 */
	topUpFor(inp) {
		const o = this.opts.topUp;
		const h = this.fight.h, me = h.f;
		if (me.u_() || !inp) return;
		const mpM = h.e.n_(), P = me.E_();
		if (P >= mpM) return;
		let need = Math.min(mpM, o.reserve ?? 30);
		if (inp.t === 'skill') { const sk = zw.q.get(inp.id); if (sk) need = Math.max(need, sk.g); }
		else if (inp.t === 'unseal' || inp.t === 'tap') {
			const x = inp.x, y = inp.y;
			const occ = x >= 0 && y >= 0 && x < h.g && y < h.h ? h.k[y * h.g + x] : null;
			if (occ && occ !== me && typeof occ.i_ === 'function') { const v = occ.i_(h.e); if (v > 0 && v < 1000) need = Math.max(need, v); }
		}
		if (!h.C && this._walker) need = Math.max(need, this._walker.legNeeds() + (o.reserve ?? 30));
		if (P >= Math.min(mpM, need)) return;
		const st = this._walker ? this._walker.stop() : null;
		me.G_(mpM);
		this.led.topUps.push({ at: this.led.inputs, stop: st ? { kind: st.kind, rec: st.rec ? { id: st.rec.id, x: st.rec.x, y: st.rec.y } : null, at: st.at || null } : null, enc: h.C ? Math.max(0, this.fights - 1) : this.fights, amount: mpM - P, pool: P, min: mpM, fight: !!h.C });
	}

	get walker() {
		if (!this._walker) this._walker = new Walker(this.fight, this.opts.walker || {});
		return this._walker;
	}

	static start(hero, where, opts = {}) {
		const f = makeFight(hero, where);
		if (!f || f.error) return { error: f ? f.error : 'no fight' };
		if (f.st === 'err') return { error: String(f.error) };
		return new Run(f, opts);
	}

	/** freeze: { state, walker, ledger, ... }; the run keeps going */
	checkpoint() {
		return { state: snapshot(this.fight, { record: false }), walker: this._walker ? this._walker.freeze() : null, led: this.led.clone(), log: this.log ? this.log.slice() : null, encounters: this.encounters, status: this.status, opts: this.opts, events: this.events.slice(), fights: this.fights };
	}

	/** thaw a checkpoint into a live Run (into: a dead Fight to refill) */
	static resume(ck, into = null) {
		const f = restoreFight(ck.state, into);
		const r = new Run(f, ck.opts, ck.walker ? Walker.thaw(ck.walker, f, ck.opts.walker || {}) : null);
		r.led = ck.led.clone();
		r.log = ck.log ? ck.log.slice() : null;
		r.encounters = ck.encounters;
		r.status = ck.status;
		r.events = ck.events.slice();
		r.fights = ck.fights ?? 0;
		return r;
	}

	/** apply one input with accounting; returns { r (step status), changed } */
	apply(inp, led = this.led) {
		const f = this.fight;
		if (this.opts.topUp) this.topUpFor(inp);
		const before = probe(f.h);
		const k0 = progressKey(f);
		const r = f.step(inp);
		if (this.log) this.log.push(inp);
		account(led, before, f.h, inp);
		if (led !== this.led) account(this.led, before, f.h, inp);
		const changed = progressKey(f) !== k0;
		return { r, changed };
	}

	/** engine can take an input */
	ready() { const st = this.fight.st; return st === 'in' || st === 'idle' || st === 'cap'; }

	/**
	 * Walk the route until an encounter starts (C set) or the dungeon ends. Returns { ev: 'combat' | 'done' | 'dead' |
	 * 'stuck' | 'error', stop }.
	 */
	toEncounter(maxInputs = LIMITS.walkInputs) {
		const f = this.fight, h = f.h, w = this.walker;
		for (let n = 0; n < maxInputs; n++) {
			if (f.c.w || h.f.u_()) { this.status = h.f.u_() ? 'dead' : 'done'; return { ev: this.status }; }
			if (!this.ready()) { this.status = f.st === 'err' ? 'error' : 'done'; return { ev: this.status, err: f.error ? String(f.error) : undefined }; }
			if (h.C) { this.fights++; this.status = 'combat'; return { ev: 'combat', stop: w.stop() }; }
			const inp = w.next();
			if (!inp) { this.status = 'done'; return { ev: 'done' }; }
			const { changed } = this.apply(inp);
			w.observe(changed);
		}
		this.status = 'stuck';
		return { ev: 'stuck' };
	}

	/**
	 * Play the current encounter with a policy (policies.js) until combat ends (C clears and the policy is done), the
	 * hero dies or the input cap. Returns the encounter ledger + { end: 'won' | 'dead' | 'stuck' | 'over', turns }.
	 */
	fightWith(policy, maxInputs = LIMITS.encounterInputs) {
		const f = this.fight, h = f.h;
		const led = new Ledger();
		const hp0 = h.f.j.v_(), ep0 = h.f.z.v_(), mp0 = h.f.E_();
		policy.begin(f);
		let stuck = 0, end = 'stuck';
		for (let n = 0; n < maxInputs; n++) {
			if (h.f.u_()) { end = 'dead'; break; }
			if (f.c.w) { end = 'over'; break; }
			if (!this.ready()) { end = f.st === 'err' ? 'error' : 'over'; break; }
			if (!h.C && !policy.wantsMore(f)) { end = 'won'; break; }
			let inp = policy.next(f);
			// the policy has nothing (stand-off in combat, or done): the route walker moves on -- walking away ends a
			// combat nobody can win
			if (inp == null) { inp = this.walker.next(); if (inp != null) policy.walked = (policy.walked || 0) + 1; }
			if (inp == null) { end = h.C ? 'stuck' : 'won'; break; }
			// a stale selection would turn the next tap into a throw: cancel it first
			if (f.selId() !== 0 && !(inp.t === 'item' || inp.t === 'skill' || inp.t === 'cancel')) {
				this.apply({ t: 'cancel' }, led);
			}
			const { r, changed } = this.apply(inp, led);
			policy.observe(f, inp, r.rej, changed);
			if (r.rej || !changed) {
				if (++stuck > LIMITS.stuck) {
					// fall back: end the turn (always legal at the hero's input in combat)
					if (h.C && this.ready()) { const s2 = this.apply({ t: 'wait' }, led); if (s2.changed) { stuck = 0; continue; } }
					end = 'stuck';
					break;
				}
			} else stuck = 0;
		}
		const turns = policy.turns || 0;
		led.dead = h.f.u_();
		this.encounters++;
		const res = { led, end: led.dead ? 'dead' : end, turns, hp0, ep0, mp0, hp: h.f.j.v_(), ep: h.f.z.v_(), mp: h.f.E_() };
		if (led.dead) this.status = 'dead';
		else if (end === 'stuck') this.status = 'stuck';
		else this.status = h.C ? 'combat' : 'walk';
		return res;
	}

	/** the engaged foes right now (hw.D minus the hero and allies) as plain data */
	engaged() {
		const h = this.fight.h;
		const out = [];
		for (const m of h.D) if (isFoe(h, m)) out.push(critterInfo(h, m));
		return out;
	}
}

/**
 * Encounter key: the stop being walked to, plus the ordinal of the encounter on that leg and the engaged species.
 * Stable across RNG samples as long as the route is (samples that meet other foes there get another key).
 */
export function encounterKey(stop, ordinal, engaged) {
	const s = stop ? `${stop.kind}${stop.rec ? `:${stop.rec.id}@${stop.rec.x},${stop.rec.y}` : stop.at ? `@${stop.at.x},${stop.at.y}` : ''}` : 'start';
	return `${s}#${ordinal}`;
}
