// Combat tactics: parameterised policies that turn the engine state into one input per call, during an encounter.
// The wiki's tactics ("Tips for Adventurers Guild") are macro policies here; robust.js / exact.js evaluate them in
// the engine and keep what wins -- nothing below is assumed to work.
//
//   const p = makePolicy('firstStrike', { smash: 'finish', heal: 1 });
//   p.begin(fight);  while (...) { const inp = p.next(fight); ...step...; p.observe(fight, inp, rej, changed); }
//   p.wantsMore(fight)   // false once combat is over (RATH: once it has broken away)
//
// Engine facts used (js/combat, decompile): hero AP per turn min(left + spd, spd + 1) and AP may go negative (an
// action may borrow from the next turn); melee 3 AP + 1 EP (tap on an adjacent foe); steps 1 AP; throws / spider 4 AP
// + 1 EP; consumables 2 AP; wait (20001) ends the turn and keeps up to 1 AP; Smashing blow 20002 4 AP 4 EP (+50%, +100%
// at level 2); Round kick 20003 5 AP 5 EP (all 4 neighbours); Charge 20005 3 AP 6 MP +10 EP; Doctor 20006 only out of
// combat. Monsters strike when 4-adjacent with AP > 0; ranged ones (aw.w ammo) throw from range 4 with line of sight;
// the waiting move (c30.p): a monster whose path is exactly AP + 1 waits (67%) instead of arriving with no AP.
// Sealed critters (aw.i MP) take no damage until unsealed (input `unseal`, f(2): melee range, or 2..3 with
// Tactical gaze and LOS).
//
// Every policy is robust to rejected inputs: what was rejected (or changed nothing) this hero turn is banned and the
// next option is taken; the last resort is `wait`, which always ends the turn.
import { zw, vj0 } from '../gen/statics.js';
import { Util$Point } from '../gen/model.js';
import {
	DIR4, SKILL, SPIDER, foesOf, isFoe, manh, cheb, sealOf, heroOf, packHas, learned, canSkill, expDamage, dmgRange,
	pathLen, pathInfo, tapLen, free, openNeighbours, bestItem, mpOk, mpFree,
} from './sim.js';
import { duelable, duelInput } from './kite.js';

/** strikes the hero needs on m at minimum damage (a certain count; crits only shorten it) */
export function strikesNeeded(me, m) {
	const [lo] = dmgRange(me, m);
	return Math.max(1, Math.ceil(m.j.v_() / Math.max(lo, 1)));
}

const key = (inp) => `${inp.t}:${inp.id ?? ''}:${inp.x ?? inp.dx ?? ''},${inp.y ?? inp.dy ?? ''}`;

/** shared defaults: smash 'never' | 'finish' | 'always'; heal: danger factor for in-combat HP items (0 = never) */
export const DEFAULTS = {
	smash: 'finish',     // Smashing blow: never / when it kills and a plain hit may not / whenever AP and EP allow
	kick: true,          // Round kick with 2+ adjacent foes
	heal: 1.0,           // drink when HP <= heal * (max damage the foes can deal before our next turn)
	minAp: 1,            // attack only with at least this much AP (3 = never borrow from the next turn)
	unseal: 'adjacent',  // pay a seal when standing next to it ('adjacent'), or as soon as it is in range ('early')
	charge: 1,           // Charge (MP) when EP below this; EP items only when Charge is impossible
	target: 'weakest',   // 'weakest' (fewest hits to kill) | 'nearest' | 'ranged' (ranged foes first)
	spider: false,       // throw the Mechanical spider next to the target (spider policy turns it on)
	waitTurns: 4,        // first strike / hold: turns to wait for foes before advancing anyway
	demor: 0,            // Demoralize (20004, 3 AP 4 MP: foes within 4 lose 60% defence for 7 turns) when it saves this many hits
	divine: 0,           // Divine protection (20007, 1 AP 10 MP: immune until our next turn) when HP <= divine * threat
	bomb: 0,             // area item to throw (144 grenade, 206 flamethrower, 118 madness, 294 mummy powder) ...
	bombMin: 2,          // ... at the cell whose area holds at least this many foes
	net: false,          // throw a net (174: the foe cannot move for 4 turns) at a second foe closing in
	hook: 0,             // pull a thrower next to us with the grappling hook 209 / whip 303
};

/** once-per-level hero skills (Demoralize 20004 and Divine protection 20007 share the flag aw 32768: turn.js c30.T / t) */
export const onceUsed = (h) => h.f.s_(32768);

export class Policy {
	constructor(name, params = {}) {
		this.name = name;
		this.p = { ...DEFAULTS, ...params };
		this.label = labelOf(name, params);
	}

	begin(fight) {
		this.banned = new Set();
		this.turnAp = null;
		this.turns = 0;
		this.waited = 0;
		this.idleTurns = 0;
		this.spiderOut = false;
		this.start = fight.h.f.b.a + ',' + fight.h.f.b.b;
		this.home = { x: fight.h.f.b.a, y: fight.h.f.b.b };
		this.done = false;
		this.onBegin(fight);
	}

	onBegin() {}

	/** combat over: true while the policy still has business out of combat (none by default) */
	wantsMore() { return false; }

	observe(fight, inp, rej, changed) {
		const me = fight.h.f;
		const ap = me.n.v_();
		if (this.turnAp != null && ap > this.turnAp) this.newTurn(fight);
		else if (inp && inp.t === 'wait' && changed) this.newTurn(fight);
		this.turnAp = ap;
		if (rej || !changed) this.banned.add(key(inp));
	}

	newTurn() { this.banned.clear(); this.turns++; }

	ok(inp) { return inp != null && !this.banned.has(key(inp)); }

	/** first acceptable of a list of candidate inputs */
	first(...cands) { for (const c of cands) if (c && this.ok(c)) return c; return null; }

	next(fight) {
		const h = fight.h;
		if (!h.C) return null;
		const ctx = this.context(fight);
		const r = this.common(fight, ctx) || this.extras(fight, ctx) || this.decide(fight, ctx);
		if (r && this.ok(r)) return r;
		if (this.ok({ t: 'wait' })) return { t: 'wait' };
		// waiting changes nothing (a stand-off: the foes cannot reach us, nor we them): move -- toward the nearest
		// engaged foe, else away, else any free step; null lets the encounter loop walk the route out of it
		const eng = ctx.foes.filter((q) => q.engaged).sort((a, b) => a.d - b.d);
		if (eng.length) { const s = this.stepToward(fight, eng[0]); if (this.ok(s)) return s; }
		const a = this.stepAway(fight, ctx, 0);
		if (a) return a;
		for (const [dx, dy] of DIR4) { const s = { t: 'step', dx, dy }; if (free(h, h.f.b.a + dx, h.f.b.b + dy) && this.ok(s)) return s; }
		return null;
	}

	/** per-call view: hero pools, foes with distances / hits-to-kill / threat */
	context(fight) {
		const h = fight.h, me = h.f;
		const P = heroOf(h);
		const foes = [];
		for (const m of foesOf(h)) {
			const md = manh(m.b, me.b);
			if (md > 16 && !(m.l === me)) continue;
			const seal = sealOf(h, m);
			// path length (A*) only where it matters; adjacent = 1; far = Manhattan. blocked: its way runs through critters
			let plen = md, blocked = false;
			if (md > 1 && md <= 9) { const pi = pathInfo(h, m.b, me.b, m.k, 20); plen = pi.steps; blocked = pi.cost >= 1500; }
			const e = expDamage(me, m);
			foes.push({ m, x: m.b.a, y: m.b.b, d: md, plen: plen || 99, blocked, hp: m.j.v_(), seal, ranged: m.w > 0, spd: m.r_(), ap: m.n.v_(), hits: Math.ceil(m.j.v_() / Math.max(e, 0.5)), maxHit: dmgRange(m, me)[1], adj: md === 1, engaged: m.l === me || h.D.includes(m) });
		}
		const adj = foes.filter((q) => q.adj);
		// threat before our next turn: foes adjacent, or whose path fits in their AP (+1 carried), or ranged in reach
		let threat = 0;
		for (const q of foes) {
			if (!q.engaged && q.d > 7) continue;
			const reach = q.ranged ? q.spd + 1 + 4 : q.spd + 1;
			if (q.adj || q.plen - 1 <= reach) threat += q.maxHit * (q.spd >= 6 ? 2 : 1);
		}
		return { h, me, P, foes, adj, threat };
	}

	/** heal / EP / unseal before the tactic proper (noUnseal: the tactic plans the unseal itself) */
	common(fight, ctx, noUnseal = false) {
		const { h, P, adj, threat } = ctx;
		const p = this.p;
		// Divine protection (MP) before a potion (an item): immune until our next turn, first thing this turn
		if (p.divine > 0 && threat > 0 && P.hp <= p.divine * threat && P.ap >= 1 && !onceUsed(h) && !h.f.s_(8) && canSkill(h, SKILL.DIVINE)) {
			const r = { t: 'skill', id: SKILL.DIVINE };
			if (this.ok(r)) return r;
		}
		// in-combat HP item when the foes could kill us before our next turn
		if (p.heal > 0 && threat > 0 && P.hp <= p.heal * threat && P.ap >= 1) {
			const id = bestItem(h, 'hp', Math.min(threat - P.hp + 1, P.hpM - P.hp), true);
			if (id) { const r = { t: 'potion', id }; if (this.ok(r)) return r; }
		}
		// EP for melee: Charge (MP) first, items only without it
		if (P.ep < p.charge) {
			if (canSkill(h, SKILL.CHARGE) && P.ap >= 1) { const r = { t: 'skill', id: SKILL.CHARGE }; if (this.ok(r)) return r; }
			const id = bestItem(h, 'ep', P.epM - P.ep, true);
			if (id) { const r = { t: 'potion', id }; if (this.ok(r)) return r; }
		}
		if (noUnseal) return null;
		// seals: pay when about to fight it (adjacent), or as soon as unseal works (early)
		const sealed = ctx.foes.filter((q) => q.seal > 0 && q.m.d && mpOk(h, q.seal) && (q.adj || (p.unseal === 'early' && q.d <= 3 && h.e.h[7] >= 1)));
		if (sealed.length && P.ap >= 1) {
			sealed.sort((a, b) => a.d - b.d || a.seal - b.seal);
			const q = sealed[0];
			if (q.adj || p.unseal === 'early') { const r = { t: 'unseal', x: q.x, y: q.y }; if (this.ok(r)) return r; }
		}
		void adj;
		return null;
	}

	/**
	 * Skills and items on top of the tactic (params demor / bomb / net / hook): Demoralize when it saves enough hits,
	 * an area item at the best cluster, a net on a second foe closing in, a hook on a thrower.
	 */
	extras(fight, ctx) {
		const p = this.p, { h, P } = ctx;
		if (P.ap < 1) return null;
		if (p.demor > 0 && canSkill(h, SKILL.DEMORALIZE)) {
			// c30.y on the hero: foes within the 4-box with r <= 0 get r = 7 (80%, bosses 40%; one always does)
			let saved = 0, any = false;
			for (const q of ctx.foes) {
				if (!q.engaged || q.seal > 0 || cheb(q.m.b, h.f.b) > 4) continue;
				if (q.m.r > 0) continue;
				any = true;
				const def = q.m.n_(false);
				const now = Math.ceil(q.hp / Math.max(expDamage(h.f, q.m), 0.5));
				const dem = Math.ceil(q.hp / Math.max(expDamage(h.f, q.m, 100, ((40 * def) / 100) | 0), 0.5));
				saved += Math.min(now - dem, 7) * (q.m.a.l0 ? 0.4 : 0.8);
			}
			if (any && saved >= p.demor) { const r = { t: 'skill', id: SKILL.DEMORALIZE }; if (this.ok(r)) return r; }
		}
		if (p.bomb && packHas(h, p.bomb) && P.ep >= 1) { const r = this.areaThrow(fight, ctx, p.bomb); if (r) return r; }
		if (p.net && packHas(h, 174) && P.ep >= 1) { const r = this.netThrow(fight, ctx); if (r) return r; }
		if (p.hook && packHas(h, p.hook) && P.ep >= 1) { const r = this.hookThrow(fight, ctx, p.hook); if (r) return r; }
		return null;
	}

	/** cells a thrown item can target (input.js: Chebyshev throwing range h.e.h[3] + 3, visible, line of sight) */
	throwCells(fight) {
		const h = fight.h, c = fight.c, me = h.f;
		const r = (h.e.h[3] + 3) | 0;
		const out = [];
		const pt = new Util$Point();
		for (let y = me.b.b - r; y <= me.b.b + r; y++) for (let x = me.b.a - r; x <= me.b.a + r; x++) {
			if (x < 0 || y < 0 || x >= h.g || y >= h.h || (x === me.b.a && y === me.b.b)) continue;
			if (c.j[y * h.g + x] <= 0) continue;
			pt.a = x; pt.b = y;
			if (h.O_(r, 1, me.b, pt)) out.push([x, y]);
		}
		return out;
	}

	/** area item (input.js: c0 2 / 3 / 11 a 3x3 square, c0 4 a 5x5; c0 2 / 3 never with the hero inside) */
	areaThrow(fight, ctx, id) {
		const h = fight.h, me = h.f;
		const it = vj0.Z1.get(id);
		if (!it) return null;
		const r = it.c0 === 4 || it.c0 === 10 ? 2 : 1;
		const selfOk = it.c0 === 4 || it.c0 === 10 || it.c0 === 11;
		const dmg = (q) => expDamage(me, q.m, it.c0 === 3 ? 50 : it.c0 === 11 ? 67 : 100) + (it.c0 === 2 || it.c0 === 4 ? 2 : 0);
		let best = null, bv = 0;
		for (const [x, y] of this.throwCells(fight)) {
			if (!selfOk && Math.abs(x - me.b.a) <= r && Math.abs(y - me.b.b) <= r) continue;
			let n = 0, v = 0, ally = false;
			for (const q of ctx.foes) {
				if (Math.abs(q.x - x) > r || Math.abs(q.y - y) > r || q.seal > 0) continue;
				n++;
				const d = dmg(q);
				v += d >= q.hp ? 1.5 : d / q.hp;
			}
			if (h.q && Math.abs(h.q.b.a - x) <= r && Math.abs(h.q.b.b - y) <= r) ally = true;
			if (ally || n < this.p.bombMin) continue;
			if (v > bv) { bv = v; best = { t: 'item', id, x, y }; }
		}
		return best && this.ok(best) ? best : null;
	}

	/** net (174) on an engaged melee foe 2+ away that would reach us this turn, when another one is fought */
	netThrow(fight, ctx) {
		const eng = ctx.foes.filter((q) => q.engaged && q.seal <= 0);
		if (eng.length < 2) return null;
		const cells = new Set(this.throwCells(fight).map(([x, y]) => y * fight.h.g + x));
		const cand = eng.filter((q) => !q.adj && !q.ranged && q.m.q <= 0 && q.plen - 1 <= q.spd + 1 && cells.has(q.y * fight.h.g + q.x));
		if (!cand.length) return null;
		cand.sort((a, b) => b.maxHit - a.maxHit || a.plen - b.plen);
		const r = { t: 'item', id: 174, x: cand[0].x, y: cand[0].y };
		return this.ok(r) ? r : null;
	}

	/** grappling hook / whip (c0 9: pulls the target next to us) on an engaged thrower 2+ away */
	hookThrow(fight, ctx, id) {
		const cells = new Set(this.throwCells(fight).map(([x, y]) => y * fight.h.g + x));
		const cand = ctx.foes.filter((q) => q.engaged && q.ranged && !q.adj && q.seal <= 0 && cells.has(q.y * fight.h.g + q.x));
		if (!cand.length) return null;
		cand.sort((a, b) => a.hits - b.hits || a.d - b.d);
		const r = { t: 'item', id, x: cand[0].x, y: cand[0].y };
		return this.ok(r) ? r : null;
	}

	/** the tactic: an input (null = wait) */
	decide(fight, ctx) { return this.fightAdjacent(fight, ctx) || this.advance(fight, ctx); }

	/** attack an adjacent foe if there is one worth hitting (kick / smash / spider / plain) */
	fightAdjacent(fight, ctx) {
		const { h, P } = ctx;
		const p = this.p;
		const adj = ctx.adj.filter((q) => q.seal <= 0);
		if (!adj.length) return null;
		if (p.spider) { const s = this.spiderInput(fight, ctx); if (s) return s; }
		if (p.kick && adj.length >= 2 && P.ap >= 5 && canSkill(h, SKILL.KICK)) { const r = { t: 'skill', id: SKILL.KICK }; if (this.ok(r)) return r; }
		const q = this.pick(adj);
		if (P.ap < p.minAp) return null;
		const smashMult = h.e.h[1] >= 2 ? 200 : 150;
		if (p.smash !== 'never' && P.ap >= 4 && canSkill(h, SKILL.SMASH) && P.ep >= 5) {
			const [lo] = dmgRange(h.f, q.m, smashMult);
			const [, hiPlain] = dmgRange(h.f, q.m);
			const kills = lo >= q.hp && hiPlain < q.hp;
			if (p.smash === 'always' || kills) { const r = { t: 'skill', id: SKILL.SMASH, x: q.x, y: q.y }; if (this.ok(r)) return r; }
		}
		return this.first({ t: 'tap', x: q.x, y: q.y });
	}

	pick(list) {
		const t = this.p.target;
		const s = list.slice();
		if (t === 'nearest') s.sort((a, b) => a.plen - b.plen || a.hits - b.hits);
		else if (t === 'ranged') s.sort((a, b) => (b.ranged - a.ranged) || a.hits - b.hits || a.plen - b.plen);
		else s.sort((a, b) => a.hits - b.hits || a.plen - b.plen || b.maxHit - a.maxHit);
		return s[0];
	}

	/** walk to the chosen foe (tap on it: the engine walks and strikes if AP is left) */
	advance(fight, ctx) {
		// the engaged foes first: walking at others pulls them in too
		const can = (q) => q.plen < 99 && (q.seal <= 0 || mpOk(ctx.h, q.seal));
		let reach = ctx.foes.filter((q) => q.engaged && can(q));
		if (!reach.length) reach = ctx.foes.filter((q) => can(q) && q.d <= 8);
		if (!reach.length) return null;
		const q = this.pick(reach);
		if (ctx.P.ap < 1) return null;
		// one step toward it (keeps the waiting-move rule in our favour less often than a tap, but never overshoots)
		return this.first({ t: 'tap', x: q.x, y: q.y }, this.stepToward(fight, q));
	}

	stepToward(fight, q) {
		const h = fight.h, me = h.f;
		let best = null, bd = Infinity;
		for (const [dx, dy] of DIR4) {
			const x = me.b.a + dx, y = me.b.b + dy;
			if (!free(h, x, y)) continue;
			const d = Math.abs(x - q.x) + Math.abs(y - q.y);
			if (d < bd) { bd = d; best = { t: 'step', dx, dy }; }
		}
		return best;
	}

	/** a step that maximises the distance to the nearest foe (ties: more open cells behind, toward home) */
	stepAway(fight, ctx, minGain = 1) {
		const h = fight.h, me = h.f;
		const near = (x, y) => { let d = Infinity; for (const q of ctx.foes) if (q.seal <= 0 || q.engaged) d = Math.min(d, Math.abs(q.x - x) + Math.abs(q.y - y)); return d; };
		const d0 = near(me.b.a, me.b.b);
		let best = null, bv = -Infinity;
		for (const [dx, dy] of DIR4) {
			const x = me.b.a + dx, y = me.b.b + dy;
			if (!free(h, x, y)) continue;
			const d = near(x, y);
			if (d < d0 + minGain) continue;
			const v = d * 10 + openNeighbours(h, x, y) - 0.1 * (Math.abs(x - this.home.x) + Math.abs(y - this.home.y));
			if (v > bv) { bv = v; best = { t: 'step', dx, dy }; }
		}
		return best && this.ok(best) ? best : null;
	}

	/** Mechanical spider (168): onto a free cell next to the target, with full AP, when it is not out yet */
	spiderInput(fight, ctx) {
		const { h, P } = ctx;
		if (h.q != null || !packHas(h, SPIDER) || P.ap < 4 || P.ep < 2) return null;
		const tgt = this.pick(ctx.foes.filter((q) => q.seal <= 0 && q.d <= 3));
		if (!tgt) return null;
		const range = (h.e.h[3] + 3) | 0;
		let best = null, bd = Infinity;
		for (const [dx, dy] of DIR4) {
			const x = tgt.x + dx, y = tgt.y + dy;
			if (!free(h, x, y) || cheb({ a: x, b: y }, h.f.b) > range) continue;
			if (fight.c.j[y * h.g + x] <= 0) continue;
			const d = Math.abs(x - h.f.b.a) + Math.abs(y - h.f.b.b);
			if (d < bd) { bd = d; best = { t: 'item', id: SPIDER, x, y }; }
		}
		return best && this.ok(best) ? best : null;
	}
}

// ---------------------------------------------------------------------------------------------------------------
// The tactics

/** plain melee: walk to the target and hit it; ends turns only when nothing else is possible */
class Melee extends Policy {}

/**
 * First strike (wiki): do not walk into reach; wait (the hourglass keeps 1 AP) until a foe comes adjacent, then hit
 * with full AP. The monster's waiting move makes it hang back at AP + 1 sometimes; after `waitTurns` idle turns we
 * advance one step to bait it.
 */
class FirstStrike extends Policy {
	decide(fight, ctx) {
		const hit = this.fightAdjacent(fight, ctx);
		if (hit) return hit;
		const engaged = ctx.foes.filter((q) => q.engaged && q.plen < 99);
		if (!engaged.length) return this.advance(fight, ctx);
		if (ctx.adj.length) return null;   // adjacent but not hittable now (AP / seal): wait
		if (this.idleTurns >= this.p.waitTurns) {
			this.idleTurns = 0;
			const q = this.pick(engaged);
			return this.first(this.stepToward(fight, q));
		}
		return null;   // wait for them
	}

	newTurn(fight) {
		super.newTurn(fight);
		const me = fight.h.f;
		let near = Infinity;
		for (const m of foesOf(fight.h)) near = Math.min(near, manh(m.b, me.b));
		if (near === this.lastNear) this.idleTurns++;
		else this.idleTurns = 0;
		this.lastNear = near;
	}
}

/**
 * Kiting / duel (wiki: melee foes with 2-3 AP; kite.js): against one engaged melee foe (no leap / charge / summons,
 * nobody else in the turn order), every hero input comes from the duel model -- the engine's exact AP rules (refill
 * min(left + spd, spd + 1), strikes borrow, the monster's waiting move and banked AP) valued over the monster's real
 * path length to each cell the hero could end its turn on. It strikes, steps back exactly far enough that the foe
 * arrives with no AP, steps back one more after a waiting move, and trades blows only when nothing safer exists.
 * Otherwise it plays first strike.
 */
class Kite extends Policy {
	duel(fight, ctx) {
		const h = fight.h;
		const engaged = ctx.foes.filter((q) => q.engaged);
		if (engaged.length !== 1 || h.D.length !== 2) return null;
		const q = engaged[0];
		if (!duelable(h, q.m) || ctx.foes.some((o) => o !== q && o.d <= (this.p.clear ?? 3))) return null;
		const k = strikesNeeded(h.f, q.m);
		const r = duelInput(fight, q.m, k, (x, y) => free(h, x, y));
		return r && this.ok(r.inp) ? r : null;
	}

	common(fight, ctx) {
		const r = this.duel(fight, ctx);
		this.plan = r;
		// the duel plan says the foe cannot strike before our next turn: no potion
		if (r && r.model.risk(r.plan.d, r.foe.n.v_()) === 0) return Policy.prototype.common.call(this, fight, { ...ctx, threat: 0 }, true);
		return Policy.prototype.common.call(this, fight, ctx, !!r);
	}

	decide(fight, ctx) {
		if (this.plan) return this.plan.inp;
		return FirstStrike.prototype.decide.call(this, fight, ctx);
	}

	newTurn(fight) { FirstStrike.prototype.newTurn.call(this, fight); }
}

/**
 * Hold a chokepoint (doorway / corridor, wiki): move to the nearby cell with the fewest open neighbours (reachable,
 * not closer to the foes than needed), then fight first-strike style from there.
 */
class Hold extends Policy {
	onBegin(fight) {
		const h = fight.h, me = h.f;
		const r = this.p.radius ?? 4;
		let best = null, bv = Infinity;
		const foes = foesOf(h).filter((m) => m.l === me || h.D.includes(m));
		for (let y = me.b.b - r; y <= me.b.b + r; y++) for (let x = me.b.a - r; x <= me.b.a + r; x++) {
			if (!(x === me.b.a && y === me.b.b) && !free(h, x, y)) continue;
			if (fight.c.j[y * h.g + x] <= 0) continue;
			const n = openNeighbours(h, x, y);
			if (n > 2) continue;
			const steps = x === me.b.a && y === me.b.b ? 0 : tapLen(h, x, y);
			if (steps === 0 && !(x === me.b.a && y === me.b.b)) continue;
			if (steps > r + 2) continue;
			let near = Infinity;
			for (const m of foes) near = Math.min(near, Math.abs(m.b.a - x) + Math.abs(m.b.b - y));
			if (near < 2) continue;
			const v = n * 10 + steps * 2 - Math.min(near, 6);
			if (v < bv) { bv = v; best = { x, y }; }
		}
		this.spot = best;
	}

	decide(fight, ctx) {
		const me = fight.h.f;
		const hit = this.fightAdjacent(fight, ctx);
		if (hit) return hit;
		if (this.spot && (me.b.a !== this.spot.x || me.b.b !== this.spot.y) && ctx.P.ap >= 1) {
			const r = { t: 'tap', x: this.spot.x, y: this.spot.y };
			if (this.ok(r)) return r;
			this.spot = null;
		}
		if (ctx.adj.length) return null;
		if (this.idleTurns >= this.p.waitTurns) { this.idleTurns = 0; return this.advance(fight, ctx); }
		return null;
	}

	newTurn(fight) { FirstStrike.prototype.newTurn.call(this, fight); }
}

/**
 * RATH (wiki): with several foes engaged, run back the way we came until combat ends (beyond the 12-box / 20-path
 * in-combat aggro), so the walker re-enters and pulls them one at a time. Ends the encounter when combat clears.
 */
class Rath extends Policy {
	onBegin(fight) {
		this.trail = (this.p.trail || []).slice();
		this.fled = false;
	}

	decide(fight, ctx) {
		const engaged = ctx.foes.filter((q) => q.engaged);
		if (engaged.length <= 1 || this.fled) return this.fightAdjacent(fight, ctx) || this.advance(fight, ctx);
		if (ctx.adj.length && ctx.P.ap >= 3 && ctx.adj.length === engaged.length) return this.fightAdjacent(fight, ctx);
		if (ctx.P.ap < 1) return null;
		// run: the farthest cell we can tap among those behind us (trail), else step away
		const h = fight.h, me = h.f;
		let best = null, bv = -Infinity;
		for (const c of this.trail) {
			const x = c % h.g, y = (c / h.g) | 0;
			if (!free(h, x, y)) continue;
			let near = Infinity;
			for (const q of engaged) near = Math.min(near, Math.abs(q.x - x) + Math.abs(q.y - y));
			const st = Math.abs(x - me.b.a) + Math.abs(y - me.b.b);
			if (st > 6 || st === 0) continue;
			const v = near * 3 - st;
			if (v > bv) { bv = v; best = { t: 'tap', x, y }; }
		}
		return this.first(best, this.stepAway(fight, ctx, 1)) || this.fightAdjacent(fight, ctx);
	}

	observe(fight, inp, rej, changed) {
		super.observe(fight, inp, rej, changed);
		if (!fight.h.C) this.fled = true;
	}
}

/** Mechanical spider (wiki): throw it next to the target when it is in reach and we have full AP, then melee */
class Spider extends Policy {
	constructor(name, params) { super(name, { ...params, spider: true }); }
	decide(fight, ctx) {
		const s = this.spiderInput(fight, ctx);
		if (s) return s;
		return this.fightAdjacent(fight, ctx) || (ctx.adj.length ? null : this.advance(fight, ctx));
	}
}

/**
 * Ranged spacing (wiki: their effective range is AP + 3): stay out of a thrower's reach (distance > its spd + 4),
 * waiting for it to come in, unless we can close and strike in one turn; melee foes are handled first-strike style.
 */
class Ranged extends Policy {
	decide(fight, ctx) {
		const hit = this.fightAdjacent(fight, ctx);
		if (hit) return hit;
		const thr = ctx.foes.filter((q) => q.ranged && q.engaged);
		if (!thr.length) return FirstStrike.prototype.decide.call(this, fight, ctx);
		const q = thr.sort((a, b) => a.plen - b.plen)[0];
		// close in if we can reach it this turn with AP to strike, else keep out of its reach
		if (q.plen - 1 + 3 <= ctx.P.ap + 1) return this.first({ t: 'tap', x: q.x, y: q.y });
		if (q.d <= q.spd + 4) { const s = this.stepAway(fight, ctx, 1); if (s) return s; }
		if (this.idleTurns >= this.p.waitTurns) { this.idleTurns = 0; return this.first({ t: 'tap', x: q.x, y: q.y }); }
		return null;
	}

	newTurn(fight) { FirstStrike.prototype.newTurn.call(this, fight); }
}

const CLASSES = { melee: Melee, firstStrike: FirstStrike, kite: Kite, hold: Hold, rath: Rath, spider: Spider, ranged: Ranged };
export const POLICY_NAMES = Object.keys(CLASSES);

/** a policy by name + params (DEFAULTS); throws on an unknown name */
export function makePolicy(name, params = {}) {
	const C = CLASSES[name];
	if (!C) throw new Error(`unknown policy ${name}`);
	return new C(name, params);
}

/** short human label: "firstStrike(smash=always,heal=0.7)" */
export function labelOf(name, params = {}) {
	const ps = Object.entries(params).filter(([k, v]) => k !== 'trail' && DEFAULTS[k] !== v).map(([k, v]) => `${k}=${v}`);
	return ps.length ? `${name}(${ps.join(',')})` : name;
}

/**
 * A candidate set: { name, params, needs? } list (robust / exact try them all). 'full' also has the skill / item
 * tactics (EXTRA), each with `needs` (usable() filters them by what the hero has at the encounter).
 */
export function candidates(level = 'full') {
	const base = [
		{ name: 'melee', params: {} },
		{ name: 'melee', params: { smash: 'always' } },
		{ name: 'melee', params: { minAp: 3 } },
		{ name: 'firstStrike', params: {} },
		{ name: 'firstStrike', params: { smash: 'always' } },
		{ name: 'firstStrike', params: { minAp: 3 } },
		{ name: 'kite', params: {} },
		{ name: 'hold', params: {} },
		{ name: 'rath', params: {} },
		{ name: 'spider', params: {} },
		{ name: 'ranged', params: {} },
	];
	if (level === 'quick') return base.filter((c, i) => [0, 3, 6, 7, 9].includes(i));
	if (level === 'full') {
		// late: tried only where the core set leaves a death or an item to save (robust.js decide, escalation)
		for (const i of [2, 4, 5, 8]) base[i].late = true;
		base.push({ name: 'melee', params: { heal: 1.5 }, late: true }, { name: 'firstStrike', params: { heal: 1.5 }, late: true }, { name: 'melee', params: { heal: 0.6 }, late: true });
		for (const c of EXTRA) base.push({ name: c.name, params: { ...c.params }, needs: c.needs, late: true });
	}
	return base;
}

/**
 * Skill and item tactics (wiki: bosses and big groups). Skills cost MP, items count as items, so the objective keeps
 * them only where they prevent a death or save more than they cost. needs: { skill, mp, once (the shared
 * once-per-level flag must be free), item, foes (engaged at the start), ranged (a thrower engaged) }.
 */
export const EXTRA = [
	{ name: 'melee', params: { demor: 2 }, needs: { skill: 20004, mp: 4, foes: 1 } },
	{ name: 'firstStrike', params: { demor: 2 }, needs: { skill: 20004, mp: 4, foes: 1 } },
	{ name: 'spider', params: { demor: 2 }, needs: { skill: 20004, mp: 4, item: 168, foes: 2 } },
	{ name: 'melee', params: { divine: 1 }, needs: { skill: 20007, mp: 10, once: true } },
	{ name: 'firstStrike', params: { divine: 1.5 }, needs: { skill: 20007, mp: 10, once: true } },
	{ name: 'melee', params: { bomb: 144 }, needs: { item: 144, foes: 2 } },
	{ name: 'firstStrike', params: { bomb: 144 }, needs: { item: 144, foes: 2 } },
	{ name: 'melee', params: { bomb: 206 }, needs: { item: 206, foes: 2 } },
	{ name: 'melee', params: { bomb: 118 }, needs: { item: 118, foes: 2 } },
	{ name: 'melee', params: { bomb: 294 }, needs: { item: 294, foes: 2 } },
	{ name: 'melee', params: { net: true }, needs: { item: 174, foes: 2 } },
	{ name: 'ranged', params: { hook: 209 }, needs: { item: 209, ranged: true } },
	{ name: 'ranged', params: { hook: 303 }, needs: { item: 303, ranged: true } },
];

/** what the hero has at an encounter, for usable(): { pack: { id: n }, skills: { id: true }, mp, once, foes, ranged } */
export function availOf(h) {
	const pack = {};
	for (const e of h.f.D.c) if (e.a_() > 0) pack[e.a.a] = (pack[e.a.a] || 0) + e.a_();
	const skills = {};
	for (const id of [20004, 20005, 20006, 20007]) if (learned(h, id)) skills[id] = true;
	const eng = h.D.filter((m) => isFoe(h, m));
	// (with MP top-ups the pool never limits a tactic)
	return { pack, skills, mp: mpFree() ? 1e9 : h.f.E_(), once: h.f.s_(32768), foes: eng.length, ranged: eng.some((m) => m.w > 0) };
}

/** a candidate is worth trying here (its needs are met in at least one of the avail records) */
export function usable(cand, avails) {
	const n = cand.needs;
	if (!n) return true;
	const list = Array.isArray(avails) ? avails : [avails];
	return list.some((a) => a && (!n.skill || a.skills[n.skill]) && (!n.mp || a.mp >= n.mp) && (!n.once || !a.once)
		&& (!n.item || a.pack[n.item] > 0) && (!n.foes || a.foes >= n.foes) && (!n.ranged || a.ranged));
}

/** the baseline: plain melee (no smash finisher, drink when in danger) -- what tools/solve-eval compares against */
export const BASELINE = { name: 'melee', params: { smash: 'never', kick: false } };

export { isFoe, zw, learned };
