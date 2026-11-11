// Fight driver: the oracle's settle loop, input gates and input vocabulary (js/combat/ORACLE.md;
// tools/oracle/FightHarness.java settle / canTap / canSelect / tap / select / apply / run).
//
//   import { newFight } from './driver.js';            // after initTables() and loading ./all.js
//   const fight = newFight({ mode: 'fightgen', type: 8, seed: 172582050, xseed: 12345, at: 'auto', kit: true, level: 10 });
//   fight.init                       // the init RECORD (after the setup settle)
//   const rec = fight.apply({ t: 'tap', x: 18, y: 42 });   // one step RECORD, as in the oracle's "steps"
//
// spec: fightgen { type, seed, xseed, at, quests?, level?, gear? (tier 1..4), kit?, kit2?, skills?, pets?, run?, trapsindif?,
//       cap?, draws?, trace?, cells? }
//       fight    { mode: 'fight', imported (js/save importSave result), save?, level?, gear?, kit?, ... }
//       a player profile's dungeon start (oracle fightgen --profile): js/combat/entry.js newFightFromProfile
// opts: { callers: true } keeps the JS caller of every hw.x draw (fight.rec.jsCallers) for divergence reports.
//       { lean: true } builds no Recorder (no RNG watchers, no records): for search, use fight.step(input);
//       fight.init is then just { st } (+ err). apply() needs a Recorder.
// A missing method of another part shows up as an `err` record whose text says "<name>_ not ported".
//
// Search API (lean or not):
//   fight.step(input) -> { st, rej, hp, ep, mp, dead, end, C }   apply + settle, no record (rej: reason or null)
//   fight.snapshot([{ record }]) -> state;  restoreFight(state[, deadFight]) -> Fight;  fight.clone()   (clone.js)
import { classes } from '../gen/registry.js';
import { zw, vj0 as V } from '../gen/statics.js';
import { iabs } from '../gen/jrt.js';
import { Util$Point } from '../gen/model.js';
import { setupGen, setupSave, heroStats } from './setup.js';
import { ToolbarItem } from './input.js';
import { Recorder, selIdOf } from './record.js';
import { snapshot, restore, cloneFight } from './clone.js';

/** Turn "x.y_ is not a function" into "y_ not ported (...)". */
export function errText(e) {
	if (!(e instanceof Error)) return String(e);
	const m = /([A-Za-z0-9$]+_) is not a function/.exec(e.message);
	if (m) return `${m[1]} not ported (${e.message})`;
	return `${e.name}: ${e.message}`;
}

function runDialog(r) {
	if (typeof r === 'function') r();
	else if (typeof r.run_ === 'function') r.run_();
	else r.run();
}

const num = (inp, k, def) => {
	const v = inp[k];
	return v == null ? def : Math.trunc(Number(v)) | 0;
};

export class Fight {
	constructor(setup, spec, opts = {}) {
		const { h, c, dgv, meta } = setup;
		this.h = h;
		this.c = c;
		this.dgv = dgv;
		this.hook = dgv.hook;
		this.meta = meta;
		this.tb = new ToolbarItem();
		this.cap = spec.cap ?? 20000;
		if (spec.run != null) { c.i0 = !(spec.run === 0 || spec.run === '0' || spec.run === false); meta.run = c.i0 ? 1 : 0; }
		if (spec.trapsindif != null) { c.j0 = !(spec.trapsindif === 0 || spec.trapsindif === '0' || spec.trapsindif === false); meta.trapsindif = c.j0 ? 1 : 0; }
		this.heroStats = heroStats(h);
		this.rec = opts.lean ? null : new Recorder(this, { draws: spec.draws, trace: spec.trace, callers: opts.callers, cells: spec.cells });
		this.index = 0;
		this.error = null;
		if (this.rec) this.rec.begin();
		let st;
		try {
			st = this.settle();
		} catch (e) {
			st = 'err';
			this.error = e;
		}
		this.st = st;
		const init = { st };
		if (this.error) init.err = errText(this.error);
		if (this.rec) this.rec.state(init, true);
		this.init = init;
	}

	/** DungameView.onDraw with all frame time elapsed: in | end | dlg | idle | cap */
	settle() {
		const c = this.c;
		let idle = 0;
		for (let it = 0; it < this.cap; it++) {
			if (c.w) return 'end';
			if (c.d0 > 0) {
				c.d0 = 0;
				c.B = null;
				c.C = null;
				c.E = null;
			}
			if (c.g0) {
				if (!this.hook.dialogs.length) return 'dlg';
				runDialog(this.hook.dialogs.shift());
				continue;
			}
			if (c.f0) return 'in';
			c.S0_();
			if (c.d0 === 0 && !c.f0 && !c.g0 && !c.w) {
				if (++idle > 2000) return 'idle';
			} else idle = 0;
		}
		return 'cap';
	}

	canTap() {
		const { h, c } = this;
		return h.F == null && c.O == null && !c.w && !h.f.u_() && c.g0_();
	}

	canSelect() {
		const { h, c } = this;
		return c.d0 === 0 && !c.w && !h.f.u_() && c.g0_();
	}

	selId() { return selIdOf(this.c); }

	/** touch DOWN + UP at the centre of cell (x, y): the inverse of c30.C0 at view scale 1 */
	tap(x, y) {
		const c = this.c;
		const sx = (64 * (x + y) - 1 - c.n0) | 0;
		const sy = (32 * (y - x) - 38 - c.o0) | 0;
		const pt = new Util$Point();
		c.C0_(sx, sy, pt);
		if (pt.a !== x || pt.b !== y) throw new Error(`tap mapping ${x},${y} -> ${pt.a},${pt.b}`);
		this.dgv.onTouchEvent_({ action: 0, x: sx, y: sy });
		this.dgv.onTouchEvent_({ action: 1, x: sx, y: sy });
		this.dgv.W = true;
	}

	select(id) {
		this.dgv.d0_(id, this.tb, false);
	}

	/** One input; returns null when applied, else the rejection reason (FightHarness.apply). */
	applyInput(inp) {
		const t = String(inp.t);
		const { h } = this;
		const f = h.f;
		switch (t) {
			case 'step': case 'tap': case 'unseal': {
				let x, y;
				if (t === 'step') {
					const dx = num(inp, 'dx', 0), dy = num(inp, 'dy', 0);
					if (iabs(dx) > 1 || iabs(dy) > 1 || (dx === 0 && dy === 0)) return 'bad step';
					x = (f.b.a + dx) | 0;
					y = (f.b.b + dy) | 0;
				} else {
					x = num(inp, 'x', -1);
					y = num(inp, 'y', -1);
				}
				if (x < 0 || y < 0 || x >= h.g || y >= h.h) return 'out of bounds';
				if (t === 'unseal') {
					const o = h.k[y * h.g + x];
					if (!(o instanceof classes.aw) || !o.d || o.i_(h.e) <= 0) return 'no sealed critter';
				}
				if (!this.canTap()) return "not hero's input";
				this.tap(x, y);
				return null;
			}
			case 'wait':
				if (!this.canSelect()) return "not hero's input";
				this.select(20001);
				return null;
			case 'cancel': {
				const s = this.selId();
				if (s === 0) return 'nothing selected';
				if (!this.canSelect()) return "not hero's input";
				if (s > 0) this.select(s);
				else this.c.j_();
				return null;
			}
			case 'skill': case 'item': case 'potion': {
				const id = num(inp, 'id', 0);
				const target = 'x' in inp;
				if (t === 'skill') {
					const sk = zw.q.get(id) ?? null;
					if (sk == null || id >= 20200) return 'unknown skill';
					if (sk.o !== -1 && h.e.h[sk.o] < 1) return 'skill not learned';
				} else {
					if ((V.Z1.get(id) ?? null) == null) return 'unknown item';
					if (!f.D.c.some((e) => e.a.a === id)) return 'not in pack';   // cq.k(id)
				}
				if (!this.canSelect()) return "not hero's input";
				this.select(id);
				if (target) {
					const x = num(inp, 'x', -1), y = num(inp, 'y', -1);
					if (this.selId() !== id) return null;
					if (x < 0 || y < 0 || x >= h.g || y >= h.h || !this.canTap()) return null;
					this.tap(x, y);
				}
				return null;
			}
			default:
				return 'unknown input';
		}
	}

	/** Apply one input (when the engine waits for one) and settle; returns the step RECORD. */
	apply(inp) {
		const i = this.index++;
		const rec = this.rec;
		const hook = this.hook;
		rec.begin();
		hook.msgs.length = 0;
		const dlg0 = hook.dialogCount;
		let before = null, why, st = this.st;
		let err = null;
		try {
			before = rec.key();
			why = st === 'in' || st === 'idle' || st === 'cap' ? this.applyInput(inp) : 'engine ' + st;
			st = this.settle();
		} catch (e) {
			why = null;
			st = 'err';
			err = e;
			this.error = e;
		}
		let after = null;
		try { after = rec.key(); } catch (e) { if (!err) { err = e; this.error = e; st = 'err'; } }
		const r = why != null ? 'rejected' : rec.sameKey(before, after) ? 'noop' : 'ok';
		this.st = st;
		const out = { i, in: inp, r };
		if (why != null) out.why = why;
		out.st = st;
		if (err) out.err = errText(err);
		try { rec.state(out, false); } catch (e) { if (!err) { out.err = errText(e); this.error = e; } }
		if (hook.dialogCount > dlg0) out.dlg = hook.dialogCount - dlg0;
		if (hook.msgs.length) out.msg = hook.msgs.slice();
		return out;
	}

	/**
	 * Lean step for search: apply one input (when the engine waits for one) and settle, exactly as apply() does,
	 * without building a record. Returns { st, rej, hp, ep, mp, dead, end, C }: rej is the rejection reason or
	 * null; hp / ep / mp are the hero's pools, dead / end / C booleans (hero dead, dungeon over, in combat).
	 * An engine exception gives st 'err' (fight.error holds it).
	 */
	step(inp) {
		this.index++;
		let st = this.st, rej = null;
		try {
			rej = st === 'in' || st === 'idle' || st === 'cap' ? this.applyInput(inp) : 'engine ' + st;
			st = this.settle();
		} catch (e) {
			rej = null;
			st = 'err';
			this.error = e;
		}
		this.st = st;
		return this.status(rej);
	}

	/** { st, rej, hp, ep, mp, dead, end, C } of the current state (see step) */
	status(rej = null) {
		const f = this.h.f;
		return { st: this.st, rej, hp: f.j.v_(), ep: f.z.v_(), mp: f.E_(), dead: f.u_(), end: this.c.w, C: this.h.C };
	}

	/** clone.js snapshot of this fight (opts.record = false drops the Recorder) */
	snapshot(opts) { return snapshot(this, opts); }

	/** An independent copy, made the live fight (statics are global: step only the live fight). */
	clone(opts) { return cloneFight(this, opts); }

	/** The oracle header fields this setup determines (to compare with a fight file). */
	header() {
		return { ...this.meta, heroStats: this.heroStats };
	}
}

/** Build a fight from a spec (see the top of this file). Returns a Fight, or { error, meta } when setup fails. */
export function newFight(spec, opts = {}) {
	const mode = spec.mode ?? 'fightgen';
	const r = mode === 'fight' ? setupSave(spec, spec.imported) : setupGen(spec);
	if (r.error) return { error: r.error, meta: r.meta };
	return new Fight(r, spec, opts);
}

/** clone.js restore(state[, into]): a new Fight at the snapshot point, made the live one (into: a dead fight to refill). */
export function restoreFight(state, into = null) {
	return restore(state, into);
}

/**
 * The setup spec of an oracle fight file (its header): what to pass to newFight to replay it (spec.profile set:
 * to entry.js newFightFromProfile, with spec.vj0 = the imported profile).
 */
export function specOf(file) {
	const spec = { mode: file.mode, type: file.type, seed: file.seed, xseed: file.xseed, at: file.at };
	if (file.level != null) spec.level = file.level;
	if (file.gear != null) {
		const tier = [154, 155, 156, 176].indexOf(file.gear[0]) + 1;
		spec.gear = tier;
	}
	if (file.kit) spec.kit = true;
	if (file.kit2) spec.kit2 = true;
	if (file.quests != null) spec.quests = file.quests;
	if (file.pets != null) spec.pets = file.pets;
	if (file.skills != null) spec.skills = file.skills;
	if (file.run != null) spec.run = file.run;
	if (file.trapsindif != null) spec.trapsindif = file.trapsindif;
	if (file.save != null) spec.save = file.save;
	// fightgen --profile (js/combat/entry.js newFightFromProfile; the caller supplies spec.vj0 from the save)
	if (file.profile != null) {
		spec.profile = file.profile;
		spec.hero = file.hero;
		if (file.premium) spec.premium = true;
	}
	const steps = file.steps || [];
	spec.draws = file.init?.rng?.d != null || steps.some((s) => s.rng && s.rng.d != null);
	spec.trace = !!(file.summary && file.summary.callers);
	spec.cells = file.init?.cellsH != null;
	return spec;
}
