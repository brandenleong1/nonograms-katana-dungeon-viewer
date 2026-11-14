// Look-ahead cache for exact mode. When a play-out wins its encounter, robust.js outcomeOf walks on: it fights what the
// winning tactic left behind and then the next encounter (fightLeftovers / lookAhead), which is most of a play-out's
// time. Many play-outs of one decision end in the same state (several policies make the same moves), and everything
// after that point is then the same as well: the engine, the walker and the continuation policy are deterministic. So
// what the walk cost is kept by the state it started from, and each state is walked once per batch of play-outs.
//
// The key holds everything the walk reads:
//   - the inputs applied since the batch's checkpoint: the engine state, RNG states included, is a function of them
//     (as every resumed play-out relies on), and a play-out's policy leaves nothing behind but its inputs;
//   - the walker's own state (Walker.stateKey): it moves when it supplies an input, which the inputs alone do not
//     tell, and it chooses what the walk does next;
//   - the run's status.
// The rest is the same for every play-out of a batch (one checkpoint, one ctx: the continuation policy, the rest
// rule's needs, the limits), so a cache lives for one batch and never outlives its checkpoint.
//
//   const cache = new LookCache({ from: ck.log.length });   // then outcomeOf(run, cand, { ..., lookCache: cache })
//
// `verify` makes every hit walk anyway and compare the two: a test of the key, and a check for a change to it.

export class LookCache {
	/** from: the length of the input log at the checkpoint; stats: { walks, hits, mismatches } to count into */
	constructor({ from, verify = false, stats = null }) {
		this.from = from;
		this.verify = verify;
		this.stats = stats || { walks: 0, hits: 0, mismatches: 0 };
		this.known = new Map();
	}

	/** the key of a run that has just won its encounter, or null when its inputs are not logged */
	keyOf(run) {
		if (!run.log || !run._walker) return null;
		return `${run.status}|${run._walker.stateKey()}|${JSON.stringify(run.log.slice(this.from))}`;
	}

	get(key) { return this.known.get(key); }

	/** a walk was made from `key`; `known` is what the cache had for it (verify mode: it must be the same) */
	walked(key, walk, known) {
		this.stats.walks++;
		if (!known) { this.known.set(key, walk); return; }
		this.stats.hits++;
		if (plain(known) !== plain(walk)) this.stats.mismatches++;
	}

	/** a walk was not made: the cache had it */
	reused() { this.stats.hits++; }
}

/** a walk's cost as a string that equal walks share */
function plain(walk) {
	const l = walk.led;
	const ledger = [[...l.used].sort(), [...l.gained].sort(), l.spiderNet, l.mp, l.mpOut, l.hp, l.ep, l.inputs, l.dead, l.mpPeak, Object.entries(l.mpBy).sort()];
	return JSON.stringify([ledger, walk.turns, walk.ext, walk.looked, walk.end, walk.final]);
}
