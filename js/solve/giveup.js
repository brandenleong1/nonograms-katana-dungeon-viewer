// Exact mode's last resort: when every line the search finds dies, turn back and head for the exit.
//
// The trajectory (exact.js solveExact) marks a point between fights before each walk to the next fight. When the hero
// dies, each of those points is played out with every stop still ahead given up (sim.js Walker.giveUp): the walker
// heads for the stairs and fights only what is in the way, with the best tactic per fight. The objective order decides:
// getting home alive beats any death, whatever objectives it leaves; among the points that get home, the fewest
// objectives left wins, then the fewest items, then the least MP. The best point is then committed: the trajectory
// rewinds there and the main loop solves the fights on the way out with the full search. If that walk dies after all,
// the next point is tried; with none left, the death found first stands.
//
// The game asks before letting the hero leave with objectives left (DungameView.g), and the engine port has no such
// dialog: a plan that gives up ends next to the stairs, and the player steps onto them and confirms.
import { Run, heroOf } from './sim.js';
import { makePolicy, usable, availOf } from './policies.js';
import { pricesFor, scoreOutcome, compareExact } from './cost.js';
import { outcomeOf, setRestNeed, stopOut } from './robust.js';

/** encounters a walk out may take before it counts as lost */
const WALK_FIGHTS = 60;
/** after the first point that gets home, how many earlier ones are still played (the fewest objectives left wins) */
const MORE_POINTS = 2;

export class TurnBack {
	/** search: exact.js's search state (run, workers, cands, opts, scoutNeeds); enabled: opts.giveUp !== false */
	constructor(search, { enabled = true, onProgress = null } = {}) {
		this.search = search;
		this.enabled = enabled;
		this.onProgress = onProgress;
		this.points = [];      // { e, ck, encounters, stopCount, at, stop, objectivesLeft }
		this.death = null;     // the trajectory where the hero first died: { e, walking, ck, encounters, stopCount }
		this.options = null;   // the points that get home, best first (played out once, at the first death)
		this.played = [];      // every point played out: { afterFight, home, dead, objectivesLeft, items, mp, fights }
		this.chosen = null;    // the point turned back at, with the stops it gave up
		this.failedWalks = 0;  // committed walks out that died after all
	}

	/** a point where the plan could still turn back: before walking to fight e, out of combat */
	mark(e, run, encounters, stopCount) {
		if (!this.enabled || this.chosen) return;
		const h = run.fight.h;
		if (h.C || h.f.u_()) return;
		this.points.push({ e, ck: run.checkpoint(), encounters: encounters.length, stopCount: { ...stopCount }, at: run.log.length, stop: stopOut(run.walker.stop()), objectivesLeft: h.i_() });
	}

	/**
	 * The hero died (in fight e, or on the way to it when walking): the trajectory to go on with, { run, encounters,
	 * stopCount, e, final }, or null to keep it as it is. final: no point gets home; run is the first death, restored.
	 */
	async back(e, run, encounters, stopCount, { walking = false } = {}) {
		if (!this.enabled || !this.points.length) return null;
		if (this.chosen) this.failedWalks++;
		if (!this.death) this.death = { e, walking, ck: run.checkpoint(), encounters: encounters.slice(), stopCount: { ...stopCount } };
		if (!this.options) this.options = this.rank();
		const next = this.options.shift();
		if (!next) return this.firstDeath();
		return this.turnAt(next);
	}

	/** the points played out latest first, until one gets home and MORE_POINTS after it; those that get home, best first */
	rank() {
		const home = [];
		let left = Infinity;   // points still to play once one got home
		for (let k = this.points.length - 1; k >= 0 && left > 0; k--) {
			const p = this.playOut(this.points[k]);
			this.played.push({ afterFight: this.points[k].encounters, home: p.home, dead: p.dead, objectivesLeft: p.objectivesLeft, items: p.items, mp: p.mp, fights: p.fights });
			if (this.onProgress) this.onProgress({ phase: 'giveUp', afterFight: this.points[k].encounters, home: p.home });
			if (left !== Infinity) left--;
			if (p.home) {
				home.push(p);
				if (left === Infinity) left = MORE_POINTS;
			}
		}
		// stable: equal ones keep the later point first
		return home.sort((a, b) => a.objectivesLeft - b.objectivesLeft || a.items - b.items || a.mp - b.mp);
	}

	/** walk out from a point (the best tactic per fight, by its play-out): { point, home, dead, objectivesLeft, items, mp, fights } */
	playOut(point) {
		let run = Run.resume(point.ck);
		run.walker.giveUp();
		const need = walkOutNeed(run);
		let fights = 0;
		for (; fights < WALK_FIGHTS; fights++) {
			setRestNeed(run, need);
			const ev = run.toEncounter();
			if (ev.ev !== 'combat') break;
			run = this.fightBest(run, need);
			if (run.fight.h.f.u_() || run.fight.c.w) { fights++; break; }
			run.walker.afterEncounter();
		}
		const h = run.fight.h;
		const dead = h.f.u_();
		return { point, home: !dead && run.walker.atExit, dead, objectivesLeft: h.i_(), items: run.led.items(), mp: run.led.mp, fights };
	}

	/** the fight the run stands at, played with the tactic whose play-out is best (exact.js's ranking, no input search) */
	fightBest(run, need) {
		const { cands, runOpts, opts } = this.search;
		const ck = run.checkpoint();
		const h = run.fight.h;
		const prices = pricesFor(h, { useItemsForMp: !!runOpts.useItemsForMp });
		const score = { hp: need.hp, ep: need.ep, mp: 0 };
		let best = null;
		for (const c of cands.filter((q) => usable(q, availOf(h)))) {
			const r = Run.resume(ck);
			setRestNeed(r, need);
			const o = outcomeOf(r, c, { ext: 1, look: 0, maxInputs: opts.maxInputs });
			const sc = scoreOutcome(o, score, prices);
			if (!best || (compareExact(sc, best.sc) || (o.inputs - best.o.inputs)) < 0) best = { c, sc, o };
		}
		const r = Run.resume(ck);
		setRestNeed(r, need);
		if (best) r.fightWith(makePolicy(best.c.name, best.c.params), opts.maxInputs);
		return r;
	}

	/** rewind the trajectory to the point and give up there; the workers follow it again from the setup */
	async turnAt(option) {
		const { point } = option;
		const run = Run.resume(point.ck);
		const abandoned = run.walker.giveUp();
		const search = this.search;
		search.run = run;
		// on the way out every fight may be the last one the hero can afford: keep the pools full
		search.scoutNeeds = Array.from({ length: 300 }, () => walkOutNeed(run));
		await rewindWorkers(search.workers);
		this.chosen = { ...option, abandoned };
		return { run, encounters: this.death.encounters.slice(0, point.encounters), stopCount: { ...point.stopCount }, e: point.e, final: false };
	}

	/** no point gets home: the death found first stands (the trajectory as it was) */
	firstDeath() {
		this.chosen = null;
		const d = this.death;
		const run = Run.resume(d.ck);
		this.search.run = run;
		return { run, encounters: d.encounters, stopCount: d.stopCount, e: d.e, final: true };
	}

	/**
	 * What the plan reports (exact.js result.gaveUp): null when the plan did not give up; else where it turned back
	 * (after how many fights, at which script input, walking to which stop), the fight the hero died in on the line given
	 * up, the stops given up, and every point played out.
	 */
	record() {
		const c = this.chosen;
		if (!c) return null;
		const d = this.death;
		return {
			reason: 'every line dies',
			afterFight: c.point.encounters, atInput: c.point.at, stop: c.point.stop,
			died: { fight: d.e + 1, walking: d.walking },
			abandoned: c.abandoned,
			objectivesLeft: c.objectivesLeft,
			played: this.played, failedWalks: this.failedWalks,
		};
	}

	/** for the search stats: the points played out, and whether one was used */
	stats() {
		return { points: this.played.length, home: this.played.filter((p) => p.home).length, used: !!this.chosen, failedWalks: this.failedWalks };
	}
}

/** the need levels on the way out: every fight may be the hardest still ahead, so keep the hero's pools full */
function walkOutNeed(run) {
	const P = heroOf(run.fight.h);
	return { hp: P.hpM, ep: P.epM };
}

/** every worker back to the setup; the next sync replays the (rewound) trajectory from its first input */
async function rewindWorkers(workers) {
	await Promise.all([...Array(workers.pool.size).keys()].map((w) => workers.pool.call(w, 'rewind')));
	workers.synced = 0;
}

