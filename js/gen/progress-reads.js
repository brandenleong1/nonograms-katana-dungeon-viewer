// What dungeon generation reads from the player's progress, and what each read changes. Used by the "Your progress"
// editor (js/ui/progress-panel.js: which controls to show, the per-label explanation) and by the verification sweep
// (test/progress.mjs: which progress states to toggle). Spec format: ./progress-spec.js.
//
// Every vj0.i2 read reachable from x30.g (outside the town / citadel, pw.H) and from the loot rolls qw.d -> s8.u and
// zw.a, with its effect as the sweep measured it (layout = cells, rooms, object / creature ids or positions, or the
// structure / cosmetic RNG; item = only a drop id qw.g; none = no generation output):
//
//   x30.g      vj0.E1(type): types 5/8/11/14 (2C..5C). 2C: quest 27 active, I0 bit 28 clear; 3C/4C/5C: quest 30
//              active, I0 bit 28/29/30 set and bit 29/30/31 clear. -> x30.y: mini-boss 417 (O, s0), first ladder
//              link forced (I: no swap draw), gate check (K).                                                 layout
//   x30.O      quest pick: the first kj0 in vj0.k with s(-1, type) (active, NPC level L or M[min(j(), n-1)] (j():
//              hi0 boss / forest-boss counts in J0, L0(114), o[30].B0; kj0 o[h].B0), mode S / U, V: b0[0].c(),
//              c0 per-type steps via k0 / buildings) or t(-1, type) (not started, B == type, G == 0, H..K via jj0.c:
//              quests done / active / step bits, building B0 / C0, J0 bits (G1) and counts (J1..J4), I0 bits 28..31,
//              p0 = sum of vj0.j[].q, items P1 / V1, vj0.B, N.n / N.p, vj0.i[].q). -> NPC room for referrals X
//              (active) / Y (offered), then P: NPC C (offered) / O (active) / U (S variant, tag 1002) / m(type).R
//              (c0), placement R (boss room), D (entrance, offered), m(type).V (entrance), wagon E (F: not in a
//              river room), retinue x0.                                                                         layout
//   x30.O      boss drop: classic G1(type) (J0 bit type) -> 142; forest J1(type, true) (J0 bit 16 + 2(type-15)) ->
//              113; cave Y0(46).q and !y1(type) (J0 bit type+4) -> 256; otherwise kj0.P (boss quest), zw.a or
//              117/284/125. With a drop the boss's L0 companion spawns (types 2, 21, 23); egypt: !(Y0(62).w(2) ||
//              Y0(63).v).                                                                       layout (type 2, 21, 23), else item
//   x30.O      quest 25 active (a0 = 14): second boss 413 in 5C's boss room. Quest 51 active (a0 = 21): boss 389 in
//              6C (s0), drop 256 unless P1(256).                                                                layout
//   x30.O      forest minor boss drop J1(type, false) (J0 bit 15 + 2(type-15)) -> 113.                         item
//   x30.O      egypt unique 621 only with Y0(73).v; its drop zw.a: L0(305) >= 2 or (type 25 and Y0(75).w(0)) -> 288,
//              else Y0(73/74/75).q -> 306 / 305.                                                          layout / item
//   x30.P      merchant: caves only with Y0(48).v; pw.L (17, 18): NPC 431 at 250 / 1000 instead of 40 when
//              N.b.j(115) - (Y0(41).q ? 1 : 0) <= 0 and N.f(18) >= 20; forest pool zw.z[0] = 406 (retinue 444)
//              unless Y0(45).x (402); egypt: NPC 639 when the merchant's loot is 123 and Y0(66).q; pw.K (7..11, 17,
//              24, 25): N.x >= 3 adds an RNG draw (tag 1000 at 12 %).                                           layout
//   x30.S      pw.t chest contents: Y0(50).q (types 25, 26: 249, else 291).                                    item
//   x30.T      forest decorations xs.Y: entry 26 with Y0(46).v (types >= 16), 27 / 28 with o[4].h0(2) (Shop
//              step 2; types >= 17 / 18): placed (and drawn for) only when the gate passes.                     layout
//   zw.a       drops (only where the drop would be 0: beaten bosses, 6C's boss without 256, 413, uniques):
//              Y0(23).v -> 177 (267, 413, 257, 335, 381, 432), Y0(36).q -> 214 (uniques 314, 387), Y0(71).v -> 315
//              (625). A drop also decides x30.L's key-monster pick (loot outside zw.D is skipped; no case seen).  item
//   s8.u       loot rolls (qw.d on hw.w): the loot table of monsters 288 / 333 with Y0(53).q at types >= 16 ->
//              267 (they spawn as room monsters in F2..F4), zw.E[115] object 94 with Y0(70).q at types >= 25 ->
//              312 / 313, else 291.                                                                            item
//   nw.m / n   hero HP / MP: X bits 29 / 25, j[4] / j[5], vj0.Y0. Not part of the generated level.            none
import { vj0 as V, zw } from './statics.js';
import { withProgress, questState } from './progress-spec.js';

/** I0 bit that is set once the mini-boss of 2C / 3C / 4C / 5C (types 5, 8, 11, 14) is beaten (vj0.E1). */
export const MINI = [{ type: 5, quest: 27, bit: 28 }, { type: 8, quest: 30, bit: 29 }, { type: 11, quest: 30, bit: 30 }, { type: 14, quest: 30, bit: 31 }];

/** J0 bit of a boss: { type, bit, minor } for every dungeon boss that has one (classic, forest main + minor, caves). */
export function bossBits() {
	const out = [];
	for (let t = 0; t < 15; t++) out.push({ type: t, bit: t, minor: false });
	for (let t = 15; t < 19; t++) {
		out.push({ type: t, bit: 16 + 2 * (t - 15), minor: false });
		out.push({ type: t, bit: 15 + 2 * (t - 15), minor: true });
	}
	for (let t = 19; t < 22; t++) out.push({ type: t, bit: t + 4, minor: false });
	return out;
}

/** The dungeon types where a quest's person can appear: start level B (offered), L / M (active), c0 step levels. */
export function questTypes(q) {
	const s = new Set();
	if (q.B >= 0 && q.G === 0) s.add(q.B);
	if (q.L >= 0) s.add(q.L);
	if (q.M) for (const t of q.M) s.add(t);
	if (q.c0 && q.b0) for (const st of q.b0) if (st.Q >= 0) s.add(st.Q);
	return [...s].filter((t) => t >= 0 && t < 27).sort((a, b) => a - b);
}

/** Quests whose person x30.O can pick, in the game's pick order (vj0.k), with their dungeon types. */
export function npcQuests(v) {
	return v.k.filter((q) => questTypes(q).length > 0).map((q) => ({ id: q.a, types: questTypes(q), offered: q.B >= 0 && q.G === 0 ? q.B : -1 }));
}

/** x30.O's pick for a dungeon type on profile v: { q, active } or null (no quest person). */
export function questAt(v, type) {
	const prev = V.i2;
	V.i2 = v;
	try {
		for (const q of v.k) {
			if (q.s_(-1, type)) return { q, active: true };
			if (q.t_(-1, type, false)) return { q, active: false };
		}
		return null;
	} finally {
		V.i2 = prev;
	}
}

/** The person x30.P places for quest pick p on type: { npc, tag, refs, wagon, where } (null without a pick). */
export function questPerson(v, type, p) {
	if (!p) return null;
	const q = p.q;
	const prev = V.i2;
	V.i2 = v;
	try {
		let npc, variant = false;
		if (p.active && q.U !== 0 && q.S !== 0) { npc = q.U; variant = true; }
		else npc = p.active ? (q.c0 ? q.m_(type).R : q.O) : q.C;
		const step = p.active && q.c0 ? q.m_(type) : null;
		const where = p.active && q.R ? 'boss room' : (!p.active && q.D) || variant || (step && step.V) ? 'entrance' : 'room';
		const refs = p.active ? q.X : q.Y;
		return { npc, variant, refs: refs ? Array.from(refs) : [], wagon: q.E || 0, where };
	} finally {
		V.i2 = prev;
	}
}

/** The boss's L0 companion spawns (x30.O): { companion, why } for types with one (2, 21, 23), else null. */
export function bossCompanion(v, type) {
	const pw = zw.M[type];
	if (!pw || !pw.e) return null;
	const bt = zw.c_(pw.e);
	if (!bt || bt.L0 === 0) return null;
	const prev = V.i2;
	V.i2 = v;
	try {
		let on;
		if (pw.G) on = !(v.Y0_(62).w_(2) || v.Y0_(63).v_());
		else if (pw.F) on = !v.y1_(type) && v.Y0_(46).q_();
		else if (pw.E) on = !v.J1_(type, true);
		else on = !v.G1_(type);
		return { companion: bt.L0, on };
	} finally {
		V.i2 = prev;
	}
}

/**
 * Plain-data reasons why this label builds what it builds with profile v (deterministic parts only): the quest
 * person, mini-boss, extra bosses, boss companion, egypt unique, cave merchants. [{ kind, quest?, ... }]
 */
export function explain(v, type) {
	const out = [];
	const prev = V.i2;
	V.i2 = v;
	try {
		const p = questAt(v, type);
		if (p) out.push({ kind: 'npc', quest: p.q.a, active: p.active, person: questPerson(v, type, p) });
		const mini = MINI.find((m) => m.type === type);
		if (mini && v.E1_(type)) out.push({ kind: 'mini', quest: mini.quest, type });
		if (type === 14 && v.Y0_(25).x_() && v.Y0_(25).a0 === type) out.push({ kind: 'boss2', quest: 25, boss: 413 });
		if (type === 21 && v.Y0_(51).x_() && v.Y0_(51).a0 === type) out.push({ kind: 'boss2', quest: 51, boss: 389 });
		const c = bossCompanion(v, type);
		if (c) out.push({ kind: 'companion', on: c.on, companion: c.companion });
		if (type >= 23 && type <= 25) out.push({ kind: 'unique', quest: 73, on: v.Y0_(73).v_() });
		if (type >= 19 && type <= 22 && zw.M[type].J) out.push({ kind: 'merchant', quest: 48, on: v.Y0_(48).v_() });
	} finally {
		V.i2 = prev;
	}
	return out;
}

// ---- verification toggles (test/progress.mjs) ----------------------------------------------------------------

/** merge progress specs (later wins; J0 / I0 bits OR together; quests / items / buildings by key) */
export function mergeSpecs(...specs) {
	const out = {};
	for (const s of specs) {
		if (!s) continue;
		for (const [k, val] of Object.entries(s)) {
			if (k === 'J0' || k === 'I0') out[k] = (out[k] | 0) | (val | 0);
			else if (val && typeof val === 'object' && !Array.isArray(val)) {
				out[k] = out[k] || {};
				for (const [kk, vv] of Object.entries(val)) {
					if (k === 'stats' && vv && typeof vv === 'object') out[k][kk] = { ...(out[k][kk] || {}), ...vv };
					else out[k][kk] = vv;
				}
			} else out[k] = val;
		}
	}
	return out;
}

/** a spec under which jj0 condition s holds (null when the kind is not expressible) */
function satisfyCond(v, s) {
	if (!s) return {};
	if (s.g !== -1) return null;
	if (s.p !== 0) return { items: { [s.p]: 1 } };
	if (s.m !== 0) return { buildings: { [s.l]: [s.m < 0 ? v.o[s.l].e.length : s.m] } };
	if (s.o !== 0 || s.s > 0 || s.v !== 0 || s.z > 0 || s.D !== -1) return null;
	if (s.r > 0) return { B: s.r };
	if (s.w !== 0) return { items: { [s.w]: 1 } };
	if (s.F !== 0) return { quests: { [s.F]: 'done' } };
	if (s.H !== 0) return { quests: { [s.H]: [128, 1 << s.I] } };
	if (s.G !== 0) return { quests: { [s.G]: 'done' } };
	switch (s.J) {
		case 0:
			if (s.L !== -1) return { J0: 1 << s.L };
			if (s.N !== 0) return { buildings: { [s.N]: [v.o[s.N].B0, v.o[s.N].C0 | (1 << (s.O - 1))] } };
			return null;
		case 1: return { J0: (1 << s.K) - 1 };
		case 2: return { J0: ((1 << s.K) - 1) << 15 };
		case 3: return { I0: ((1 << s.K) - 1) << 28 };
		case 4: return { J0: ((1 << s.K) - 1) << 23 };
		case 5: return { perks: { 0: s.K } };
		default: return null;
	}
}

/** the prerequisites of offering quest q (its H..K start conditions), or null */
function offerSpec(v, q) {
	const parts = [];
	for (const s of [q.H, q.I, q.J, q.K]) {
		const p = satisfyCond(v, s);
		if (p === null) return null;
		parts.push(p);
	}
	return mergeSpecs(...parts);
}

/** types where profile b picks a different quest person (or none / mode) than profile a */
function npcChanges(a, b) {
	const out = [];
	for (let t = 0; t < 27; t++) {
		const x = questAt(a, t), y = questAt(b, t);
		if ((x && x.q) !== (y && y.q) ? !(x && y && x.q.a === y.q.a) : (x && x.active) !== (y && y.active)) out.push(t);
	}
	return out;
}

/** a small deterministic PRNG (toggles must be the same on every run) */
function lcg(seed) {
	let x = seed | 0;
	return (n) => { x = (Math.imul(x, 1103515245) + 12345) | 0; return ((x >>> 8) % n + n) % n; };
}

/**
 * The verification sweep's progress states: [{ name, progress, types (more seeds there), expect: { type: 'layout' |
 * 'any' }, read }] built on profile v (the new game). Every read above alone, then chains and combinations.
 */
export function toggles(v) {
	const out = [];
	const all = (n) => Array.from({ length: n }, (_, i) => i);
	const add = (name, progress, o = {}) => {
		let expect = { ...(o.expect || {}) };
		let w;
		try { w = withProgress(v, progress); } catch { w = null; }
		if (w && o.npc !== false) for (const t of npcChanges(v, w)) if (!expect[t]) expect[t] = 'any';
		const types = [...new Set([...(o.types || []), ...Object.keys(expect).map(Number)])].sort((a, b) => a - b);
		const dup = out.find((t) => t.name === name);
		if (!dup) { out.push({ name, progress, types, expect, read: o.read || '', base: o.base || null }); return; }
		// the same name again (a read listed twice): one job, expectations and seed types merged
		if (JSON.stringify(dup.progress) !== JSON.stringify(progress)) throw new Error(`toggles: ${name} defined twice`);
		Object.assign(dup.expect, expect);
		dup.types = [...new Set([...dup.types, ...types])].sort((a, b) => a - b);
		if (o.read) dup.read = o.read;
		if (o.base) dup.base = o.base;
	};
	add('fresh', {}, { read: 'new game' });

	// quests: active / done alone, offered (its start conditions met), and the variants that need a step
	for (const q of v.s) {
		if (q == null) continue;
		const types = questTypes(q);
		add(`q${q.a}-active`, { quests: { [q.a]: 'active' } }, { types, read: `quest ${q.a}` });
		add(`q${q.a}-done`, { quests: { [q.a]: 'done' } }, { types, read: `quest ${q.a}` });
		if (q.B >= 0 && q.G === 0) {
			const pre = offerSpec(v, q);
			if (pre && Object.keys(pre).length) add(`q${q.a}-offer`, pre, { types: [q.B], read: `quest ${q.a} start conditions` });
		}
		if (q.V && q.b0) {
			const pre = satisfyCond(v, q.b0[0]);
			if (pre) add(`q${q.a}-active-v`, mergeSpecs(pre, { quests: { [q.a]: 'active' } }), { types, read: `quest ${q.a} variant (S / U)` });
		}
		if (q.c0 && q.b0) {
			for (let k = 1; k <= q.b0.length; k++) add(`q${q.a}-steps${k}`, { quests: { [q.a]: [16, (1 << k) - 1] } }, { types, read: `quest ${q.a} steps` });
		}
	}
	// quest step bits read directly
	add('q62-step2', { quests: { 62: [16, 4] } }, { types: [23], expect: { 23: 'layout' }, read: 'quest 62 step 2 (egypt boss companion)' });
	add('q62-done-step2', { quests: { 62: [128, 4] } }, { types: [23], expect: { 23: 'layout' }, read: 'quest 62 step 2' });
	add('q75-step0', { quests: { 75: [16, 1] } }, { types: [25], read: 'quest 75 step 0 (621 drop)' });
	add('q75-step0+q73', { quests: { 73: 'active', 75: [16, 1] } }, { types: [23, 24, 25], read: 'quest 75 step 0 + 73' });

	// mini-bosses (E1)
	add('mini-2C', { quests: { 27: 'active' } }, { types: [5], expect: { 5: 'layout' }, read: 'E1 2C' });
	add('mini-2C-beaten', { quests: { 27: 'active' }, I0: 1 << 28 }, { types: [5], read: 'E1 2C beaten' });
	add('mini-3C', { quests: { 27: 'done', 30: 'active' }, I0: 1 << 28 }, { types: [8], expect: { 8: 'layout' }, read: 'E1 3C' });
	add('mini-4C', { quests: { 27: 'done', 30: 'active' }, I0: (1 << 28) | (1 << 29) }, { types: [11], expect: { 11: 'layout' }, read: 'E1 4C' });
	add('mini-5C', { quests: { 27: 'done', 30: 'active' }, I0: (1 << 28) | (1 << 29) | (1 << 30) }, { types: [14], expect: { 14: 'layout' }, read: 'E1 5C' });
	add('mini-all-beaten', { quests: { 27: 'done', 30: 'active' }, I0: 0xf << 28 }, { types: [5, 8, 11, 14], read: 'E1 all beaten' });
	for (const m of MINI) add(`I0-bit${m.bit}`, { I0: 1 << m.bit }, { types: [m.type], read: 'I0 forest flag' });

	// bosses beaten
	for (const b of bossBits()) {
		const exp = (b.type === 2 && !b.minor) ? { 2: 'layout' } : {};
		add(`J0-bit${b.bit}`, { J0: 1 << b.bit }, { types: [b.type], expect: exp, read: `boss ${b.type}${b.minor ? ' minor' : ''}` });
	}
	add('J0-classic', { J0: 0x7fff }, { types: all(15), expect: { 2: 'layout' }, read: 'all classic bosses' });
	add('J0-forest', { J0: 0xff << 15 }, { types: [15, 16, 17, 18], read: 'all forest bosses' });
	add('J0-cave', { J0: 7 << 23 }, { types: [19, 20, 21], read: 'all cave bosses' });
	add('J0-all', { J0: (1 << 26) - 1 }, { types: all(27), read: 'every boss' });
	add('q46-done', { quests: { 46: 'done' } }, { types: [16, 17, 18, 19, 20, 21], expect: { 21: 'layout', 16: 'layout', 17: 'layout', 18: 'layout' }, read: 'quest 46: cave boss drop 256 + companion, forest decor' });
	add('q46-done+cave-beaten', { quests: { 46: 'done' }, J0: 7 << 23 }, { types: [19, 20, 21], read: 'quest 46 + cave bosses beaten' });
	add('egypt-companion-off', { quests: { 63: 'active' } }, { types: [23], expect: { 23: 'layout' }, read: 'quest 63 (egypt boss companion)' });

	// extra bosses and the egypt unique
	add('q25-active', { quests: { 25: 'active' } }, { types: [14], expect: { 14: 'layout' }, read: 'quest 25 second boss' });
	add('q51-active', { quests: { 51: 'active' } }, { types: [21], expect: { 21: 'layout' }, read: 'quest 51 boss 389' });
	add('q51-active+256', { quests: { 51: 'active' }, items: { 256: 1 } }, { types: [21], expect: { 21: 'layout' }, read: 'quest 51 + item 256' });
	add('item256', { items: { 256: 1 } }, { types: [21], read: 'item 256' });
	add('q73-active', { quests: { 73: 'active' } }, { types: [23, 24, 25], expect: { 23: 'layout', 24: 'layout', 25: 'layout' }, read: 'quest 73 unique 621' });
	add('q73-active+305x2', { quests: { 73: 'active' }, items: { 305: 2 } }, { types: [23, 24, 25], read: 'quest 73 + item 305' });
	add('q73-q74-q75-done', { quests: { 73: 'done', 74: 'done', 75: 'done' } }, { types: [23, 24, 25], read: 'zw.n 305 / 306' });
	for (const n of [1, 2, 3]) add(`item305x${n}`, { items: { 305: n } }, { types: [23, 24, 25], read: 'item 305' });

	// merchants
	add('q48-active', { quests: { 48: 'active' } }, { types: [19, 20, 22], read: 'quest 48 cave merchants' });
	add('q45-active', { quests: { 45: 'active' } }, { types: [17, 18, 20], read: 'quest 45 forest pool' });
	add('q66-done', { quests: { 66: 'done' } }, { types: [23, 24, 25, 26], read: 'quest 66 NPC 639' });
	add('pot-of-gold', { stats: { b: { 115: 1 } } }, { types: [17, 18], read: 'pots of gold found' });
	add('pot-of-gold+q41', { stats: { b: { 115: 1 } }, quests: { 41: 'done' } }, { types: [17, 18], read: 'pot of gold via quest 41' });
	add('f4-cleared-20', { stats: { f: { 18: 20 } } }, { types: [17, 18], read: 'F4 cleared 20 times' });
	add('f4-cleared-20+pot', { stats: { f: { 18: 20 }, b: { 115: 1 } } }, { types: [17, 18], read: 'F4 cleared + pot of gold' });
	add('merchants-met-3', { stats: { x: 3 } }, { types: [7, 8, 9, 10, 11, 17, 24, 25], read: 'merchants traded with' });
	add('merchants-met-2', { stats: { x: 2 } }, { types: [7, 8, 9, 10, 11, 17, 24, 25], read: 'merchants traded with (below 3)' });

	// forest decorations
	add('shop-step2', { buildings: { 4: [0, 2] } }, { types: [17, 18], expect: { 17: 'layout', 18: 'layout' }, read: 'Shop step 2 (forest decor)' });
	add('q46-active', { quests: { 46: 'active' } }, { types: [16, 17, 18], expect: { 16: 'layout', 17: 'layout', 18: 'layout' }, read: 'quest 46 (forest decor)' });

	// loot only
	for (const n of [1, 2, 3, 4]) add(`item114x${n}`, { items: { 114: n } }, { types: [15, 16, 17, 18], read: 'item 114 (quest 38 level)' });
	for (const n of [0, 1, 2, 3]) add(`q38-active+114x${n}`, { quests: { 38: 'active' }, items: { 114: n } }, { types: [15, 16, 17, 18], read: 'quest 38 level by item 114' });
	add('chest-q50', { quests: { 50: 'done' } }, { types: [25, 26], read: 'quest 50 chest' });

	// buildings, perks, the rest of the vj0 ints
	for (const [b, lv] of [[18, 1], [22, 5], [29, 2], [30, 3], [1, 5], [4, 3]]) add(`bld${b}-lv${lv}`, { buildings: { [b]: [lv] } }, { read: `building ${b}` });
	add('perk0-1', { perks: { 0: 1 } }, { read: 'perks (p0)' });
	add('B-10', { B: 10 }, { read: 'vj0.B' });
	add('X-all', { X: '-1' }, { read: 'X perk bits (hero only)' });
	add('I0-all', { I0: -1 }, { types: [5, 8, 11, 14], read: 'all I0' });

	// chains: the forest / egypt / adventurer quest lines done step by step (the next quest offered)
	const chain = (name, ids) => {
		for (let i = 1; i <= ids.length; i++) {
			const quests = {};
			for (const id of ids.slice(0, i - 1)) quests[id] = 'done';
			quests[ids[i - 1]] = 'active';
			add(`${name}-${i}`, { quests, J0: 0x7fff }, { read: `${name} chain` });
		}
	};
	chain('forest', [27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41]);
	chain('egypt', [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]);
	chain('adventurer', [45, 46, 47, 48, 50, 51, 52]);
	chain('dark-lady', [24, 23, 26, 53, 25]);

	// reads that only act on top of another state: classed against that state (base), on the same types
	const on = (name, base, extra, types, expect, read) => {
		const b = out.find((t) => t.name === base);
		add(name, mergeSpecs(b.progress, extra), { base, types, expect, npc: false, read });
	};
	on('mini-2C+beaten', 'mini-2C', { I0: 1 << 28 }, [5], { 5: 'layout' }, 'I0 bit 28: 2C mini-boss beaten');
	on('mini-3C+beaten', 'mini-3C', { I0: 1 << 29 }, [8], { 8: 'layout' }, 'I0 bit 29: 3C mini-boss beaten');
	on('q46-done+6C-beaten', 'q46-done', { J0: 1 << 25 }, [21], { 21: 'layout' }, 'J0 bit 25: 6C boss beaten (companion)');
	on('q51-active+own256', 'q51-active', { items: { 256: 1 } }, [21], { 21: 'item' }, 'item 256: 6C extra boss drop');
	on('q73-active+305x2', 'q73-active', { items: { 305: 2 } }, [23, 24, 25], { 23: 'item' }, 'item 305: tomb guardian drop');
	on('q73-active+q75-step1', 'q73-active', { quests: { 75: [16, 1] } }, [25], { 25: 'item' }, 'quest 75 step 1: tomb guardian drop in EC');
	on('q73-active+q73-done', 'q73-active', { quests: { 73: 'done' } }, [23], { 23: 'item' }, 'quest 73 done: tomb guardian drop in EA');
	on('q73-active+q74-done', 'q73-active', { quests: { 74: 'done' } }, [24], { 24: 'item' }, 'quest 74 done: tomb guardian drop in EB');
	on('f4-cleared-20+pot', 'f4-cleared-20', { stats: { b: { 115: 1 } } }, [17, 18], { 18: 'layout' }, 'pots of gold found: NPC 431 chance');
	on('f4-cleared-20+pot+q41', 'f4-cleared-20+pot', { quests: { 41: 'done' } }, [17, 18], {}, 'quest 41 done: one pot of gold does not count');
	on('q38-active-v+114x1', 'q38-active-v', { items: { 114: 1 } }, [15, 16], { 15: 'layout' }, 'item 114: quest 38 person moves to F2');
	on('q38-active-v+114x3', 'q38-active-v', { items: { 114: 3 } }, [15, 18], { 15: 'layout' }, 'item 114: quest 38 person moves to F4');
	add('q37-done', { quests: { 37: 'done' } }, { read: 'quest 37' });
	on('q37-done+q36-done', 'q37-done', { quests: { 36: 'done' } }, [17, 21, 22], { 17: 'item' }, 'quest 36 done: drops 214 (314, 387)');
	add('q71-done', { quests: { 71: 'done' } }, { read: 'quest 71' });
	on('q71-done+q70-done', 'q71-done', { quests: { 70: 'done' } }, [25, 26], { 25: 'item' }, 'quest 70 done: object 94 loot 312 / 313');
	// zw.a only replaces a drop of 0: the bosses already beaten, 6C's (no 256) and quest 25's second boss
	on('q71-done+q23-active', 'q71-done', { quests: { 23: 'active' } }, [8, 14, 18, 21], { 21: 'item' }, 'quest 23: dragon teeth drops');
	on('q23-active+beaten', 'q71-done+q23-active', { J0: (1 << 8) | (1 << 14) }, [8, 14], { 8: 'item', 14: 'item' }, 'quest 23: beaten bosses drop dragon teeth');
	on('merchants-met-3+2', 'merchants-met-2', { stats: { x: 3 } }, [7, 8, 9, 10, 11, 17, 24, 25], { 8: 'layout' }, 'trades 2 -> 3');
	on('q48-active+q48-done', 'q48-active', { quests: { 48: 'done' } }, [19, 20, 22], {}, 'quest 48 active vs done (merchants)');

	// everything at once
	const every = (st) => Object.fromEntries(v.s.filter((q) => q != null).map((q) => [q.a, st]));
	add('all-active', { quests: every('active') }, { types: all(27), read: 'every quest active' });
	add('all-done', { quests: every('done'), J0: (1 << 26) - 1, I0: -1 }, { types: all(27), read: 'every quest done, every boss' });
	add('all-done-no-bosses', { quests: every('done') }, { types: all(27), read: 'every quest done' });

	// random combinations of the reads above (fixed seed)
	const rnd = lcg(20261110);
	const relevant = v.s.filter((q) => q != null).map((q) => q.a);
	for (let i = 0; i < 24; i++) {
		const quests = {};
		for (const id of relevant) {
			const r = rnd(10);
			if (r < 2) quests[id] = [16, rnd(4) === 0 ? rnd(256) : 0];
			else if (r < 4) quests[id] = [128, rnd(4) === 0 ? rnd(256) : 0];
		}
		let J0 = 0;
		for (let b = 0; b < 26; b++) if (rnd(2)) J0 |= 1 << b;
		let I0 = 0;
		for (let b = 28; b < 32; b++) if (rnd(2)) I0 |= 1 << b;
		const spec = {
			quests, J0, I0,
			items: { 114: rnd(5), 256: rnd(2), 305: rnd(4) },
			stats: { x: rnd(5), f: { 18: rnd(3) * 12 }, b: { 115: rnd(2) } },
			buildings: { 4: [rnd(4), rnd(8)], 18: [rnd(3)], 22: [rnd(7)], 29: [rnd(4)], 30: [rnd(4)] },
			perks: { 0: rnd(3) },
		};
		add(`random-${i}`, spec, { types: all(27), read: 'random combination' });
	}
	// keep only well-formed specs
	return out.filter((t) => { try { for (const q of Object.values(t.progress.quests || {})) questState(q); return true; } catch { return false; } });
}
