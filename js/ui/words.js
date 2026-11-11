// Plain-language text for the solver UI (M7): tactic names, tactic parameters, creature labels, and the player's
// instruction for each script input ("tap tile (12,40)", "use Smashing blow on Monster 206 at (14,40)", "wait").
// Pure functions; the caller passes name lookups (ctx) so this works with any names table.

const TACTICS = {
	melee: 'Plain melee',
	firstStrike: 'First strike',
	kite: 'Kite',
	hold: 'Hold a chokepoint',
	rath: 'Run away and come back',
	spider: 'Spider first',
	ranged: 'Keep out of throwing range',
	demoralize: 'Demoralize first',
	divine: 'Divine protection',
	net: 'Net first',
	hook: 'Hook',
	grenade: 'Grenade',
};

const PARAMS = {
	smash: { never: 'no Smashing blow', finish: 'Smashing blow to finish', always: 'Smashing blow when possible' },
	minAp: (v) => (Number(v) >= 3 ? 'full-AP attacks only' : `attack with ${v}+ AP`),
	heal: (v) => (Number(v) > 0 ? `heal at ${v}× danger` : 'no healing in fights'),
	kick: (v) => (v === true || v === 'true' ? 'Round kick on groups' : 'no Round kick'),
	unseal: { adjacent: 'unseal when adjacent', early: 'unseal early' },
	target: { weakest: 'weakest first', nearest: 'nearest first', ranged: 'throwers first' },
	charge: (v) => (v === true || v === 'true' ? 'Charge before items' : 'no Charge'),
	waitTurns: (v) => `bait after ${v} idle turns`,
};

const humanize = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** 'firstStrike(smash=always,minAp=3)' -> { name: 'firstStrike', params: { smash: 'always', minAp: '3' } } */
export function parseTacticLabel(label) {
	const m = /^([A-Za-z0-9_]+)(?:\((.*)\))?$/.exec(String(label || ''));
	if (!m) return { name: String(label || ''), params: {} };
	const params = {};
	if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); if (k) params[k.trim()] = v == null ? true : v.trim(); }
	return { name: m[1], params };
}

export function tacticName(name) { return TACTICS[name] || humanize(name); }

/** short plain words for a tactic: "First strike · Smashing blow when possible" */
export function tacticWords(t) {
	const { name, params } = typeof t === 'string' ? parseTacticLabel(t) : { name: t.name, params: t.params || {} };
	const extra = [];
	for (const [k, v] of Object.entries(params || {})) {
		const d = PARAMS[k];
		if (!d) { extra.push(`${humanize(k).toLowerCase()} ${v}`); continue; }
		const w = typeof d === 'function' ? d(v) : d[v];
		if (w) extra.push(w);
	}
	return [tacticName(name), ...extra].join(' · ');
}

/** screen direction of a step in the isometric view: +x goes up-right, +y down-right */
export function dirWord(dx, dy) {
	if (dx > 0 && dy === 0) return 'up-right';
	if (dx < 0 && dy === 0) return 'down-left';
	if (dy > 0 && dx === 0) return 'down-right';
	if (dy < 0 && dx === 0) return 'up-left';
	return '';
}

const at = (x, y) => `(${x},${y})`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * The player's instruction for one recorded input (js/ui/solve-host.js recordFrames act):
 * { text, verb, cell: { x, y } | null }. ctx: { item(id), skill(index), critter(target) -> "Monster 206", object(id) }
 */
export function instruction(act, ctx) {
	const inp = act.inp || {};
	const tg = act.target;
	const who = (t) => (t && t.kind === 'critter' ? ctx.critter(t) : t && t.kind === 'object' ? `the ${ctx.object(t.id)}` : null);
	const from = act.from || { x: 0, y: 0 };
	switch (inp.t) {
		case 'tap': {
			const cell = { x: inp.x, y: inp.y };
			const d = Math.abs(inp.x - from.x) + Math.abs(inp.y - from.y);
			if (tg && tg.kind === 'critter' && tg.foe) return { verb: 'attack', cell, text: d <= 1 ? `Attack ${who(tg)} at ${at(inp.x, inp.y)}` : `Tap ${who(tg)} at ${at(inp.x, inp.y)}` };
			if (tg) return { verb: 'use', cell, text: `Tap ${who(tg)} at ${at(inp.x, inp.y)}` };
			return { verb: 'walk', cell, text: `Tap tile ${at(inp.x, inp.y)}${d > 1 ? ` (${plural(d, 'tile')} away)` : ''}` };
		}
		case 'step': {
			const x = from.x + (inp.dx | 0), y = from.y + (inp.dy | 0);
			const cell = { x, y };
			if (tg && tg.kind === 'critter' && tg.foe) return { verb: 'attack', cell, text: `Attack ${who(tg)} at ${at(x, y)}` };
			if (tg) return { verb: 'use', cell, text: `Tap ${who(tg)} at ${at(x, y)}` };
			const dw = dirWord(inp.dx | 0, inp.dy | 0);
			return { verb: 'step', cell, text: `Step ${dw ? dw + ' ' : ''}to tile ${at(x, y)}` };
		}
		case 'unseal':
			return { verb: 'unseal', cell: { x: inp.x, y: inp.y }, text: `Unseal ${who(tg) || 'the creature'} at ${at(inp.x, inp.y)}${tg && tg.seal ? ` (${tg.seal} mental power)` : ''}` };
		case 'skill': {
			const name = act.skill === -1 ? 'Wait' : ctx.skill(act.skill, inp.id);
			if (inp.x != null) {
				const cell = { x: inp.x, y: inp.y };
				return { verb: 'skill', cell, text: tg && tg.kind === 'critter' ? `Use ${name} on ${who(tg)} at ${at(inp.x, inp.y)}` : `Use ${name} on tile ${at(inp.x, inp.y)}` };
			}
			return { verb: 'skill', cell: null, text: `Use ${name}` };
		}
		case 'item': {
			const name = ctx.item(inp.id);
			if (inp.x != null) {
				const cell = { x: inp.x, y: inp.y };
				if (tg && tg.kind === 'critter') return { verb: 'throw', cell, text: `Throw ${name} at ${who(tg)} at ${at(inp.x, inp.y)}` };
				return { verb: 'place', cell, text: `${inp.id === 168 ? 'Place' : 'Use'} ${name} on tile ${at(inp.x, inp.y)}` };
			}
			return { verb: 'item', cell: null, text: `Use ${name}` };
		}
		case 'potion':
			return { verb: 'item', cell: null, text: `Use ${ctx.item(inp.id)}` };
		case 'wait':
			return { verb: 'wait', cell: null, text: 'Wait (end your turn)' };
		case 'cancel':
			return { verb: 'cancel', cell: null, text: 'Cancel the selection' };
		default:
			if (act.topup != null || /^(mp|topup|topUp|mpTopUp|puzzle|puzzles)$/.test(String(inp.t))) {
				const n = act.topup ?? Number(inp.mp ?? inp.amount ?? inp.n ?? 0);
				return { verb: 'topup', cell: null, text: `Top up mental power now: solve puzzles for ${n} MP` };
			}
			return { verb: inp.t || '?', cell: null, text: JSON.stringify(inp) };
	}
}

/** a plan MP top-up in words: "Before fight 6 (stop 4): solve puzzles for 25 MP" */
export function topUpText(u, plan) {
	const amount = u.amount ?? u.mp ?? 0;
	const stop = u.stopIndex != null ? u.stopIndex : u.stop;
	const nEnc = plan && plan.encounters ? plan.encounters.length : Infinity;
	const start = (u.atInput === 0) || ((stop ?? 0) === 0 && (u.beforeEncounter ?? 0) === 0 && u.atInput == null);
	const where = start ? 'Before you start'
		: u.fight && u.beforeEncounter != null && u.beforeEncounter < nEnc ? `During fight ${u.beforeEncounter + 1} (pause and refill)`
		: u.beforeEncounter != null && u.beforeEncounter < nEnc ? `Before fight ${u.beforeEncounter + 1}${stop != null ? ` (stop ${stop + 1})` : ''}`
			: stop != null ? `On the way to stop ${stop + 1}` : 'Along the way';
	const often = u.p != null && u.p < 0.95 ? ` (needed in ${Math.round(u.p * 100)}% of runs${u.max != null && u.max > amount ? `, up to ${u.max}` : ''})` : '';
	return `${where}: solve puzzles for ${amount} MP${often}`;
}

const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);

/** what an input did: "−3 HP · used Potion of healing · defeated Monster 206 · a fight starts" */
export function effects(act, ctx) {
	const out = [];
	if (act.rej) return [`the game does not take this input (${act.rej})`];
	const d = act.d || {};
	if (act.topup != null) return [`+${act.topup} mental power from puzzles`];
	if (d.hp) out.push(`${signed(d.hp)} HP`);
	if (d.ep) out.push(`${signed(d.ep)} energy`);
	if (d.mp) out.push(`${signed(d.mp)} mental power`);
	for (const [id, n] of act.used || []) out.push(`used ${n > 1 ? n + '× ' : ''}${ctx.item(id)}`);
	for (const [id, n] of act.got || []) out.push(`got ${n > 1 ? n + '× ' : ''}${ctx.item(id)}`);
	for (const k of act.killed || []) out.push(`defeated ${ctx.critter({ kind: 'critter', id: k.id, x: k.x, y: k.y })}`);
	if (act.jump) out.push(`moved to ${at(act.to.x, act.to.y)}`);
	if (!act.C && act.C1) out.push('a fight starts');
	if (act.C && !act.C1 && !act.dead) out.push('the fight is over');
	if (act.dead) out.push('the hero dies');
	if (act.end && !act.dead) out.push('the dungeon is done');
	for (const m of act.msg || []) out.push(`“${m}”`);
	return out;
}

export function pct(p) {
	if (p == null || !Number.isFinite(p)) return '–';
	if (p <= 0) return '0%';
	if (p < 0.01) return '<1%';
	return `${Math.round(p * 100)}%`;
}

export function num(x, d = 1) {
	if (x == null || !Number.isFinite(x)) return '–';
	const k = 10 ** d;
	return String(Math.round(x * k) / k);
}
