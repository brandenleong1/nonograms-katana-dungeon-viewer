// The solver's output for the UI: one pure-data JSON (schema in README.md, "Plan format"). Built from a robust.js or
// exact.js result; no engine objects, no functions, no cycles.
//
//   const plan = buildPlan(result, { label: '3C-172582050', names: namesJson.items });
import { labelOf, DEFAULTS } from './policies.js';

export const SCHEMA = 'nk-solve-plan/1';

const TACTICS = {
	melee: 'Walk up to the weakest engaged foe and hit it.',
	firstStrike: 'Do not walk into reach: wait (hourglass) until a foe steps next to you, then strike with full AP.',
	kite: 'Against one melee foe: strike, then step back exactly far enough that it arrives next to you with no AP left (one step more after it hesitates); with 2+ more speed than the foe it never gets a hit in. Otherwise first strike.',
	hold: 'Move to the nearby doorway / corridor cell (fewest open sides) and fight from there, first-strike style.',
	rath: 'With several foes engaged, run back the way you came until combat ends, then re-enter to pull them one at a time.',
	spider: 'Throw the Mechanical spider next to the target with full AP, then fight it together.',
	ranged: 'Stay out of a thrower\'s reach (its speed + 4) until it comes in or you can close and strike in one turn.',
};
const PARAMS = {
	smash: { never: 'no Smashing blow', finish: 'Smashing blow when it kills and a plain hit may not', always: 'Smashing blow whenever AP and EP allow' },
	minAp: (v) => (v >= 3 ? 'attack only with 3+ AP (never borrow from the next turn)' : `attack with ${v}+ AP`),
	heal: (v) => (v > 0 ? `drink a healing item when HP <= ${v} x the damage the foes can deal before your next turn` : 'never drink in combat'),
	kick: (v) => (v ? 'Round kick with 2+ adjacent foes' : 'no Round kick'),
	unseal: { adjacent: 'pay a seal when standing next to it', early: 'pay a seal as soon as it is in range' },
	target: { weakest: 'target the foe that dies in the fewest hits', nearest: 'target the nearest foe', ranged: 'target throwers first' },
	demor: () => 'cast Demoralize (4 MP) when it saves 2+ hits: foes within 4 lose 60% defence for 7 turns',
	divine: (v) => `cast Divine protection (10 MP, once per level) when HP <= ${v} x the damage the foes can deal before your next turn`,
	bomb: (v) => `throw ${({ 144: 'a Greek grenade', 206: 'the flamethrower', 118: 'a madness grenade', 294: 'mummy powder' })[v] || 'item ' + v} where it hits 2+ foes`,
	net: () => 'throw a net on a second foe closing in',
	hook: (v) => `pull a thrower next to you with the ${v === 303 ? 'whip' : 'grappling hook'}`,
};

/** human description of a tactic { name, params } */
export function describeTactic(t) {
	const parts = [TACTICS[t.name] || t.name];
	const p = { ...DEFAULTS, ...(t.params || {}) };
	for (const k of ['smash', 'minAp', 'heal', 'kick', 'demor', 'divine', 'bomb', 'net', 'hook']) {
		if (t.params && t.params[k] !== undefined && t.params[k] !== DEFAULTS[k]) {
			const d = PARAMS[k];
			parts.push(typeof d === 'function' ? d(p[k]) : d[p[k]]);
		}
	}
	return parts.join(' ');
}

const r2 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 100) / 100);
const distOut = (d) => (d ? { mean: r2(d.mean), p50: d.p50, p95: d.p95, max: d.max } : null);

/** index of the route leg a stop record belongs to */
function legIndex(route, stop) {
	if (!stop || !route) return null;
	const i = route.findIndex((L) => L.kind === stop.kind && ((!L.rec && !stop.rec) || (L.rec && stop.rec && L.rec.id === stop.rec.id && L.rec.x === stop.rec.x && L.rec.y === stop.rec.y)));
	return i >= 0 ? i : null;
}

/**
 * buildPlan(result, { label, names: { id: name } (data/names.json items), heroSpec }) -> plan (plain JSON).
 */
export function buildPlan(res, opts = {}) {
	if (res.error) return { schema: SCHEMA, error: res.error };
	const names = opts.names || {};
	const nameOf = (id) => names[id] || names[String(id)] || null;
	const route = res.route || [];
	const stops = route.map((L, i) => ({ i, kind: L.kind, label: L.label, target: L.rec ? { ...L.rec } : null, at: L.at, steps: L.steps, doing: (L.doing || []).map((d) => ({ text: d.text, at: d.at, ep: d.ep, mp: d.mp })), encounters: [] }));
	const encounters = [];
	if (res.mode === 'robust') {
		res.decisions.forEach((d, i) => {
			const si = legIndex(route, d.stop);
			if (si != null) stops[si].encounters.push(i);
			const st = d.stats || {};
			encounters.push({
				i, key: d.key, stop: si, where: d.hero ? { x: d.hero.x, y: d.hero.y } : null,
				hero: d.hero ? { hp: d.hero.hp, hpM: d.hero.hpM, ep: d.hero.ep, mp: d.hero.mp, ap: d.hero.ap } : null,
				enemies: (d.enemies || []).map(enemyOut), enemySets: d.enemySets,
				tactic: { name: d.tactic.name, params: d.tactic.params, label: d.tactic.label, description: describeTactic(d.tactic) },
				expected: { pDeath: r2(st.pDeath), items: r2(st.items), mp: r2(st.mp), score: st.score ? st.score.map(r2) : null, hpLost: st.dist ? r2(st.dist.hpLost.mean) : null, p95: st.dist ? { items: st.dist.items.p95, mp: st.dist.mp.p95, hpLost: st.dist.hpLost.p95 } : null },
				samples: d.samples, evaluations: d.evals, need: d.need, quick: !!d.quick,
				mpBefore: d.mpBefore ? { mean: r2(d.mpBefore.mean), p05: d.mpBefore.p05, min: d.mpBefore.min } : null,
				escalated: !!d.escalated, lookahead: d.lookahead ? { risk: r2(d.lookahead.risk), look: d.lookahead.look, n: d.lookahead.n, switched: d.lookahead.switched, candidates: d.lookahead.candidates.map((c) => ({ label: c.label, n: c.n, pDeath: r2(c.pDeath), items: r2(c.items), mp: r2(c.mp) })) } : null,
				candidates: (d.candidates || []).map((c) => ({ label: c.label, n: c.n ?? 0, pDeath: r2(c.pDeath), items: r2(c.items), mp: r2(c.mp), score: c.score ? c.score.map(r2) : null, pruned: !!c.pruned, same: c.same })),
			});
		});
	} else {
		res.encounters.forEach((e, i) => {
			const si = legIndex(route, e.stop);
			if (si != null) stops[si].encounters.push(i);
			encounters.push({
				i, key: e.key, stop: si, where: e.hero ? { x: e.hero.x, y: e.hero.y } : null,
				hero: e.hero ? { hp: e.hero.hp, hpM: e.hero.hpM, ep: e.hero.ep, mp: e.hero.mp, ap: e.hero.ap } : null,
				enemies: (e.enemies || []).map(enemyOut),
				tactic: { name: e.tactic.name, params: e.tactic.params, label: e.tactic.label, description: describeTactic(e.tactic), finish: e.finish || null },
				expected: e.cost ? { pDeath: e.cost.dead ? 1 : 0, items: e.cost.items, mp: e.cost.mp, hpLost: e.cost.hpLost } : null,
				after: e.after ? { hp: e.after.hp, ep: e.after.ep, mp: e.after.mp } : null,
				searched: e.searched, improved: e.improved,
				candidates: (e.tactics || []).map((t) => ({ label: t.label, pDeath: t.dead ? 1 : 0, items: t.items, mp: t.mp, hpLeft: t.hp, score: t.score ? t.score.map(r2) : null })),
				script: { from: e.from, to: e.to, inputs: e.inputs },
			});
		});
	}
	const tot = res.totals || {};
	const totals = res.mode === 'robust'
		? { n: tot.n, pDeath: r2(tot.pDeath), dead: tot.dead, stuck: tot.stuck, items: distOut(tot.items), mp: distOut(tot.mp), objectivesLeft: distOut(tot.objectivesLeft), statuses: tot.statuses }
		: { pDeath: tot.dead ? 1 : 0, items: { mean: tot.items, p50: tot.items, p95: tot.items, max: tot.items }, mp: { mean: tot.mp, p50: tot.mp, p95: tot.mp, max: tot.mp }, objectivesLeft: tot.objectivesLeft, finished: !!tot.end && !tot.dead, final: tot.final };
	const packRows = res.mode === 'robust'
		? (tot.pack || []).map((p) => ({ id: p.id, name: nameOf(p.id), mean: r2(p.mean), p95: p.p95, bring: Math.ceil(p.p95) }))
		: Object.entries(tot.byId || {}).map(([id, n]) => ({ id: +id, name: nameOf(+id), mean: n, p95: n, bring: n }));
	const plan = {
		schema: SCHEMA,
		mode: res.mode,
		dungeon: { type: res.problem.type, seed: res.problem.seed, label: opts.label || null, xseed: res.problem.xseed ?? null, at: res.problem.at ?? 'start' },
		heroSpec: opts.heroSpec || res.problem.hero || null,
		hero: res.hero,
		objective: { order: ['survive', 'items', 'mp'], maxDeath: tot.maxDeath ?? 0.01, prices: res.prices },
		stops, encounters, totals,
		pack: packRows.filter((p) => p.bring > 0 || p.mean > 0),
		perf: { ms: Math.round(res.ms || 0), workers: res.workers || 1, samples: res.N ?? null, search: res.search || null },
	};
	// warnings the UI should show before the numbers
	const warnings = [];
	const stock = !!(res.mpPlan && res.mpPlan.useItemsForMp);
	if (res.needs && res.hero && res.needs.mp > res.hero.mp) warnings.push({ kind: 'mp', need: res.needs.mp, have: res.hero.mp, text: `The route needs about ${res.needs.mp} MP (seals, sealed doors, chests); the hero enters with ${res.hero.mp}${stock ? '' : ': solve puzzles for the rest during the run (MP top-ups)'}.` });
	// a profile run: the game's entry gates (entry.js; away / busy heroes are treated as back) and the MP it hands out
	const gates = (res.entry && Array.isArray(res.entry.gates) ? res.entry.gates : []).filter((g) => g.gate !== 'away' && g.gate !== 'busy');
	for (const g of gates) warnings.push({ kind: 'gate', gate: g.gate, text: `The game would not start this run: ${g.text}.` });
	if (res.needs && res.needs.invincible) warnings.push({ kind: 'invincible', n: res.needs.invincible, text: `${res.needs.invincible} objective boss(es) cannot be hurt yet (their quest is not done; the secret name 306 works only then).` });
	// death risk, plainly: where the hero is too weak, dying is the outcome; say where it happens
	if (totals.pDeath > (tot.maxDeath ?? 0.01)) {
		const pct = Math.round(totals.pDeath * 100);
		let at = null;
		if (res.mode === 'robust') { for (const e of encounters) if (e.expected && e.expected.pDeath > 0 && (!at || e.expected.pDeath * e.samples > at.expected.pDeath * at.samples)) at = e; }
		else at = encounters.find((e) => e.expected && e.expected.pDeath > 0) || null;
		const where = at ? ` ${res.mode === 'robust' ? 'Most deaths are' : 'It dies'} at encounter ${at.i}${at.stop != null && stops[at.stop] ? ` (${stops[at.stop].label || stops[at.stop].kind})` : ''} against ${at.enemies.map((x) => x.id).join(', ')}.` : '';
		warnings.push({ kind: 'death', p: totals.pDeath, encounter: at ? at.i : null, text: `Death risk ${pct}%: even with the best tactics found, the hero dies in ${res.mode === 'robust' ? `${pct}% of the runs` : 'this run'}; it is too weak for this dungeon.${where}` });
	}
	const left = res.mode === 'robust' ? (tot.objectivesLeft ? tot.objectivesLeft.mean : 0) : tot.objectivesLeft;
	if (left > 0) warnings.push({ kind: 'objectives', left, text: `${res.mode === 'robust' ? 'On average ' : ''}${Math.round(left * 10) / 10} objective(s) are left undone.` });
	// MP the plan needs (see README "MP"): plan.mp in full; plan.mpTopUps / plan.mpToSolve, the puzzles the player
	// solves for (MP is replenishable); plan.mpNeeded, the short form the UI reads
	if (res.mpPlan) {
		const m = res.mpPlan;
		const robust = res.mode === 'robust';
		const toSolve = robust ? Math.ceil(m.toSolve.p95) : m.toSolve.max;
		plan.mp = {
			start: m.start, max: m.max, route: m.route, spent: distOut(m.spent), peak: distOut(m.peak), need: m.need, short: m.short,
			spentBy: m.spentBy, mpItems: r2(m.mpItems), useItemsForMp: !!m.useItemsForMp, toSolve: distOut(m.toSolve),
			encounters: (m.encounters || []).map((e) => ({ i: e.i, mean: r2(e.mean), low: e.low })),
			marginal: (m.marginal || []).map((x) => ({ add: x.add, mp: x.mp, n: x.n, items: r2(x.items), saved: r2(x.saved), pDeath: r2(x.pDeath), dDeath: r2(x.dDeath), objectivesLeft: r2(x.objectivesLeft), mpItems: r2(x.mpItems) })),
		};
		const tops = robust
			? (m.topUps || []).map((t) => ({ stopIndex: t.stopIndex, beforeEncounter: firstEncAt(encounters, t.stopIndex), amount: t.amount, p: r2(t.p), mean: r2(t.mean), max: t.max }))
			: (res.topUps || []).map((t) => ({ stopIndex: t.stopIndex, beforeEncounter: t.beforeEncounter, atInput: t.at, amount: t.amount, fight: !!t.fight }));
		plan.mpTopUps = tops;
		plan.mpToSolve = toSolve;
		plan.mpNeeded = { total: m.start + toSolve, toSolve, start: m.start, route: m.route };
		const where = (t) => (t.fight ? `during encounter ${t.beforeEncounter}` : t.stopIndex == null ? 'mid-route' : t.stopIndex === 0 && (t.beforeEncounter ?? 0) === 0 ? 'before you start' : `before stop ${t.stopIndex}${stops[t.stopIndex] ? ` (${stops[t.stopIndex].label || stops[t.stopIndex].kind})` : ''}`);
		if (!m.useItemsForMp && toSolve > 0) {
			const list = tops.filter((t) => !robust || t.p >= 0.25).slice(0, 6).map((t) => `${t.amount} ${where(t)}${robust && t.p < 0.95 ? ` (${Math.round(t.p * 100)}% of runs)` : ''}`);
			plan.mp.advice = `Solve puzzles for about ${toSolve} MP during this run (the hero holds at most ${m.max}): ${list.join('; ')}.`;
			warnings.push({ kind: 'mpTopUp', toSolve, text: plan.mp.advice });
		} else if (m.useItemsForMp) {
			const best = plan.mp.marginal.filter((x) => x.add > 0 && (x.saved >= 0.25 || x.dDeath >= 0.05));
			plan.mp.advice = m.short > 0
				? `Enter with at least ${m.need} MP: the plan draws the pool down by ${m.need}; the hero has ${m.start}.`
				: best.length ? `More MP pays: ${best.map((x) => `+${x.add} MP saves ${x.saved} item(s)${x.dDeath > 0 ? `, ${Math.round(x.dDeath * 100)}% fewer deaths` : ''}`).join('; ')}.` : null;
			if (m.short > 0) warnings.push({ kind: 'mpShort', need: m.need, have: m.start, text: plan.mp.advice });
			else if (best.length) warnings.push({ kind: 'mpValue', text: plan.mp.advice });
		}
	}
	plan.route = { needs: res.needs || null };
	plan.entry = res.entry || null;
	plan.warnings = warnings;
	if (res.baseline) {
		const b = res.baseline;
		plan.baseline = { tactic: labelOf('melee', { smash: 'never', kick: false }), n: b.n, pDeath: r2(b.pDeath), items: distOut(b.items), mp: distOut(b.mp), objectivesLeft: distOut(b.objectivesLeft) };
	}
	if (res.mode === 'exact') plan.script = { inputs: res.inputs, topUps: (res.topUps || []).map((t) => ({ at: t.at, amount: t.amount })), replay: opts.replay || null, oracle: opts.oracle || null };
	return plan;
}

/** the first plan encounter met on the way to stop si (or after it), for top-ups */
function firstEncAt(encounters, si) {
	if (si == null) return null;
	const e = encounters.find((x) => x.stop != null && x.stop >= si);
	return e ? e.i : null;
}

function enemyOut(e) {
	return { id: e.id, x: e.x, y: e.y, hp: e.hp, hpM: e.hpM, ap: e.ap, spd: e.spd, atk: e.atk, def: e.def, seal: e.seal, ranged: e.ranged, boss: e.boss, objective: e.objective };
}

/** quick structural check of a plan (tests / UI guard): returns a list of problems (empty = ok) */
export function validatePlan(p) {
	const errs = [];
	const need = (c, m) => { if (!c) errs.push(m); };
	need(p && p.schema === SCHEMA, 'schema');
	if (!p || p.error) return errs;
	need(p.mode === 'robust' || p.mode === 'exact', 'mode');
	need(p.dungeon && Number.isInteger(p.dungeon.type) && Number.isInteger(p.dungeon.seed), 'dungeon');
	need(Array.isArray(p.stops), 'stops');
	need(Array.isArray(p.encounters), 'encounters');
	for (const e of p.encounters || []) {
		need(typeof e.key === 'string', `encounter ${e.i} key`);
		need(e.tactic && typeof e.tactic.name === 'string' && typeof e.tactic.description === 'string', `encounter ${e.i} tactic`);
		need(Array.isArray(e.enemies), `encounter ${e.i} enemies`);
		if (p.mode === 'exact') need(e.script && Array.isArray(e.script.inputs), `encounter ${e.i} script`);
	}
	need(p.totals && p.totals.items && p.totals.mp, 'totals');
	need(Array.isArray(p.pack), 'pack');
	if (p.mode === 'exact') need(p.script && Array.isArray(p.script.inputs), 'script');
	try { JSON.parse(JSON.stringify(p)); } catch { errs.push('not JSON'); }
	return errs;
}
