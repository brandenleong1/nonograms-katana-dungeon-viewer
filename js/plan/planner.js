// Route planner: visit every objective, opening what blocks the way, for the least effort.
//
// Movement follows the game's own pathfinder (hw.t):
//  - 4-directional steps. A tile is walkable if its tile type allows it (zw.u .m: floor, doorway), or if it is
//    overgrowth (.o: tiles 8/9/10) that has been cleared (b & 32); clearing costs energy.
//  - Every object blocks its tile except reeds (84). Objects are used from a neighbouring tile ("bump").
//  - Door objects open by condition:
//      27 sealed door (mental power), 28 stuck door (energy, pw.r)   -> openable at a cost
//      33 gate -> its lever (32, same h); 29 locked door -> the gold monster's key (167);
//      35 / 60 puzzle doors -> floor nonogram / barrels on plates; 53 boss gate -> the mini-boss (key 222)
//  - Ladders 40 <-> hatches 38/39, portals 88 <-> teleporters 126 (same h) move you to the partner.
//  - Monsters in the way are fought (a penalty, not a wall).
// Energy and mental power are weighed against steps (EP_COST / MP_COST steps each), so the route only breaks a
// stuck door or pays a seal when walking around would cost more. The visiting order is solved exactly
// (Held-Karp with unlock state) for up to 16 stops, by search beyond.

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const EXACT_LIMIT = 16;
const DOORS = new Set([27, 28, 29, 33, 35, 53, 60, 73]);   // objects that sit on doorways
export const EP_COST = 3;     // steps one point of energy is worth
export const MP_COST = 3;     // steps one point of mental power is worth
const FIGHT_COST = 4;         // extra for fighting through a monster
const NPC_COST = 3;           // extra for getting past a person
// tile walk flags from zw.u (m = walkable, o = walkable once cleared); used if the caller passes none
const DEFAULT_TILE = { 1: { m: true }, 3: { m: true }, 8: { o: true }, 9: { o: true }, 10: { o: true } };

/**
 * The game's objective list (hw.i): objects with qw.f (forest: only the boss gate 53; elsewhere objective objects
 * not yet used, and arena checkpoint keys 32/h1201), creatures whose definition has bw.t, and in forests one more:
 * unlocking the exit (tile 5 with b&15 in {2,3} and b&32 clear).
 */
export function objectives(level, { rw, bw, pw }) {
	const forest = !!(pw && pw.E);
	const out = [];
	for (const o of level.objects) {
		const t = rw(o.id);
		if (!t) continue;
		const ok = forest ? o.id === 53 : (t.t && (!t.n || !o.e)) || (o.id === 32 && o.h === 1201 && !o.e);
		if (ok) out.push({ kind: 'object', rec: o });
	}
	for (const c of level.critters) {
		const d = bw ? bw(c.id) : null;
		if (d && d.t) out.push({ kind: 'critter', rec: c });
	}
	if (forest) {
		const { w, cells } = level;
		let open = false;
		const locked = [];
		for (let i = 0; i < cells.length / 2; i++) {
			if (cells[2 * i] !== 5) continue;
			const b = cells[2 * i + 1];
			if ((b & 15) === 2 || (b & 15) === 3) { if (b & 32) open = true; else locked.push(i); }
		}
		if (!open && locked.length) out.push({ kind: 'exitlock', rec: null, cells: locked, at: { x: locked[0] % w, y: (locked[0] / w) | 0 } });
	}
	return out;
}

export function planRoute(level, { rw, bw = null, pwOf, patterns, tiles = null, endAtExit = false, epCost = EP_COST, mpCost = MP_COST, exactLimit = EXACT_LIMIT }) {
	const { w, h, cells } = level;
	const N = w * h;
	const objAt = new Map();
	for (const o of level.objects) for (const c of footprint(o, rw(o.id))) objAt.set(c, o);
	const critAt = new Map();
	for (const c of level.critters) if (c.id !== 180) critAt.set(c.y * w + c.x, c);
	const pw = pwOf(level.type);
	const tileFlag = (a) => (tiles ? tiles[a] : DEFAULT_TILE[a]) || {};

	// ---- gates: door objects that need something first -------------------------------------
	const gates = [];            // { cells:Set, kind, need:[node keys], label }
	const gateOf = new Int8Array(N).fill(-1);
	const addGate = (o, kind, label) => {
		const g = gates.length;
		gates.push({ obj: o, kind, label, req: [] });
		gateOf[o.y * w + o.x] = g;
		return g;
	};
	const hero = level.critters.find((c) => c.id === 180);
	const levers = level.objects.filter((o) => o.id === 32 && o.h !== 1201);
	const goldMonsters = level.critters.filter((c) => c.g === 167);
	const miniBoss = level.critters.filter((c) => c.h === 1100);
	const puzzle = patterns ? nonogramWalk(level, patterns) : null;
	const plates = [];
	for (let i = 0; i < N; i++) if (cells[2 * i] === 1 && (cells[2 * i + 1] & 63) === 44) plates.push(i);

	const reqNodes = [];        // optional stops that unlock gates
	const reqIndex = new Map(); // key -> index into reqNodes
	const needReq = (key, make) => {
		if (!reqIndex.has(key)) { reqIndex.set(key, reqNodes.length); reqNodes.push(make()); }
		return reqIndex.get(key);
	};
	for (const o of level.objects) {
		if (o.id === 33) {
			const g = addGate(o, 'gate', 'Gate');
			for (const l of levers.filter((l) => l.h === o.h)) {
				gates[g].req.push(needReq(`lever${l.h}-${l.x},${l.y}`, () => ({ kind: 'lever', rec: l, cells: approach(l), label: 'Pull the lever' })));
			}
		} else if (o.id === 29) {
			const g = addGate(o, 'lock', 'Locked door');
			for (const m of goldMonsters) gates[g].req.push(needReq(`gold${m.x},${m.y}`, () => ({ kind: 'gold', rec: m, cells: approach(m), label: 'Defeat the gold monster (key)' })));
		} else if (o.id === 35) {
			const g = addGate(o, 'nonogram', 'Puzzle door');
			if (puzzle) gates[g].req.push(needReq('nonogram', () => ({ kind: 'nonogram', rec: null, cells: [puzzle.start], walk: puzzle.walk, cost: puzzle.walk.length, label: 'Solve the floor nonogram' })));
		} else if (o.id === 60) {
			const g = addGate(o, 'barrels', 'Barrel door');
			if (plates.length) gates[g].req.push(needReq('barrels', () => ({ kind: 'barrels', rec: null, cells: plates.flatMap((p) => neighbours(p)).filter(walkable), cost: barrelCost(), label: 'Push the barrels onto the plates' })));
		} else if (o.id === 53) {
			const g = addGate(o, 'bossgate', 'Boss gate');
			for (const m of miniBoss) gates[g].req.push(needReq(`mini${m.x},${m.y}`, () => ({ kind: 'miniboss', rec: m, cells: approach(m), label: 'Defeat the mini-boss (key)' })));
		}
	}
	// a gate with no known requirement stays shut (marked in the result)
	const unknownGates = gates.filter((g) => !g.req.length);

	// can the hero stand here (used for "approach" tiles next to objects)?
	function walkable(i) {
		const a = cells[2 * i], b = cells[2 * i + 1];
		const f = tileFlag(a);
		if (!f.m && !f.o) return false;
		const o = objAt.get(i);
		if (o && o.id !== 84 && !DOORS.has(o.id)) return false;
		return true;
	}
	function neighbours(i) {
		const x = i % w, y = (i / w) | 0, out = [];
		for (const [dx, dy] of DIRS) {
			const nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
		}
		return out;
	}
	function approach(rec) {
		const def = rec.k === undefined ? rw(rec.id) : null;
		const fp = rec.k === undefined ? footprint(rec, def) : [rec.y * w + rec.x];
		const set = new Set(fp);
		const out = [];
		const onWall = (c) => cells[2 * c] === 2 || cells[2 * c] === 7;
		for (const c of fp) {
			// Wall-mounted objects face the viewer: they hang on a room's top or right wall, so they are used
			// from the tile below (y+1) or to the left (x-1), never from behind the wall.
			const ns = onWall(c) ? [c + w, c - 1] : neighbours(c);
			for (const n of ns) if (!set.has(n) && walkable(n)) out.push(n);
		}
		if (rec.k !== undefined && walkable(rec.y * w + rec.x)) out.push(rec.y * w + rec.x);
		return [...new Set(out)];
	}
	function barrelCost() {
		const barrels = level.objects.filter((o) => o.id === 59);
		let c = 0;
		for (const b of barrels) {
			let best = Infinity;
			for (const p of plates) best = Math.min(best, Math.abs(b.x - (p % w)) + Math.abs(b.y - ((p / w) | 0)));
			c += 2 * best;
		}
		return c;
	}

	// teleport edges: approach cells of one end -> approach cells of the partner
	const teleports = new Map(); // cell -> [landing cells]
	const groups = new Map();
	for (const o of level.objects) {
		// hw.q: ladder 40 <-> hatch 38/39; portal 88 / teleporter 126 pair with each other (same h)
		const g = o.id === 40 || o.id === 38 || o.id === 39 ? 'ladder' : o.id === 88 || o.id === 126 ? 'portal' : null;
		if (!g || !o.h) continue;
		const k = `${g}:${o.h}`;
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(o);
	}
	for (const list of groups.values()) {
		if (list.length !== 2) continue;
		const [a, b] = list;
		const la = approach(a), lb = approach(b);
		for (const c of la) teleports.set(c, [...(teleports.get(c) || []), ...lb.slice(0, 1)]);
		for (const c of lb) teleports.set(c, [...(teleports.get(c) || []), ...la.slice(0, 1)]);
	}

	// ---- cost of entering each tile (Infinity = blocked), and what it takes --------------------
	const enter = new Float64Array(N);
	const action = new Array(N).fill(null);   // { ep, mp, text } for tiles that need doing something
	for (let i = 0; i < N; i++) {
		const a = cells[2 * i], b = cells[2 * i + 1];
		const f = tileFlag(a);
		let cost = Infinity, act = null;
		if (f.m) cost = 1;
		else if (f.o) {
			cost = 1;
			if (!(b & 32)) { const ep = a === 10 ? 1 : 2; act = { ep, mp: 0, text: a === 10 ? 'Trample flowers' : 'Clear undergrowth' }; }
		}
		const o = objAt.get(i);
		if (cost < Infinity && o && o.id !== 84) {
			const def = rw(o.id);
			if (o.id === 27) act = { ep: 0, mp: (def && def.v) || 3, text: 'Unseal door' };
			else if (o.id === 28 || o.id === 73) act = { ep: pw ? pw.r : 5, mp: 0, text: 'Break stuck door' };
			else if (o.id === 29) act = { ep: 0, mp: 0, text: 'Unlock door with the key' };
			else if (DOORS.has(o.id)) act = null;                                  // opens by itself once unlocked
			else if (o.id === 30) act = { ep: 0, mp: (def && def.v) || 3, text: 'Disarm trap' };
			else if (def && def.l) act = { ep: 1, mp: 0, text: 'Smash' };
			else cost = Infinity;                                                 // furniture etc. blocks
		}
		if (cost < Infinity) {
			if (act) cost += 1 + act.ep * epCost + act.mp * mpCost;
			const c = critAt.get(i);
			if (c) cost += c.k === 2 ? FIGHT_COST : NPC_COST;
		}
		enter[i] = cost;
		action[i] = act;
	}
	// forest exit locked by key 222 (mini-boss): standing on it is the objective, gated like a door
	if (pw && pw.E) {
		for (let i = 0; i < N; i++) {
			const b = cells[2 * i + 1];
			if (cells[2 * i] === 5 && ((b & 15) === 2 || (b & 15) === 3) && !(b & 32)) {
				enter[i] = 1;
				const g = gates.length;
				gates.push({ obj: { id: -1, x: i % w, y: (i / w) | 0 }, kind: 'exitlock', label: 'Locked exit', req: [] });
				gateOf[i] = g;
				for (const m of miniBoss) gates[g].req.push(needReq(`mini${m.x},${m.y}`, () => ({ kind: 'miniboss', rec: m, cells: approach(m), label: 'Defeat the mini-boss (key)' })));
			}
		}
	}
	// stepping on the floor nonogram's inner 5x5 toggles it: route around it (the puzzle walk is added separately)
	if (puzzle) {
		for (let dy = 3; dy < 8; dy++) for (let dx = 3; dx < 8; dx++) {
			const i = (puzzle.y0 + dy) * w + puzzle.x0 + dx;
			if (enter[i] < Infinity) enter[i] += 500;
		}
	}

	// ---- Dijkstra under an unlock mask -------------------------------------------------------
	const cache = new Map();
	function bfs(src, mask) {
		const key = src * 64 + mask;
		if (cache.has(key)) return cache.get(key);
		const dist = new Float64Array(N).fill(Infinity);
		const prev = new Int32Array(N).fill(-1);
		const heap = new Heap();
		dist[src] = 0;
		heap.push(0, src);
		while (heap.size) {
			const [d, c] = heap.pop();
			if (d > dist[c]) continue;
			const relax = (n, extra) => {
				let e = enter[n];
				if (e === Infinity) return;
				const g = gateOf[n];
				if (g >= 0 && !(mask & (1 << g))) return;
				const nd = d + e + extra;
				if (nd < dist[n]) { dist[n] = nd; prev[n] = c; heap.push(nd, n); }
			};
			for (const n of neighbours(c)) relax(n, 0);
			const t = teleports.get(c);
			if (t) for (const n of t) relax(n, 1);   // bump the ladder/portal, then appear by its partner
		}
		for (let i = 0; i < N; i++) if (dist[i] === Infinity) dist[i] = -1;
		const r = { dist, prev };
		cache.set(key, r);
		return r;
	}
	const pathTo = (src, dst, mask) => {
		const { prev } = bfs(src, mask);
		const out = [];
		for (let c = dst; c !== -1; c = prev[c]) out.push(c);
		return out.reverse();
	};

	// ---- stops -----------------------------------------------------------------------------
	const targets = [];
	for (const ob of objectives(level, { rw, bw, pw })) {
		if (ob.kind === 'exitlock') targets.push({ kind: 'objective', rec: null, cells: ob.cells, label: 'Unlock the exit (key from the mini-boss)' });
		else targets.push({ kind: 'objective', rec: ob.rec, cells: approach(ob.rec), label: null });
	}
	if (endAtExit) {
		const exits = [];
		for (let i = 0; i < N; i++) if (cells[2 * i] === 5) for (const n of neighbours(i)) if (walkable(n)) exits.push(n);
		if (exits.length) targets.push({ kind: 'exit', rec: null, cells: exits, label: 'Leave by the stairs', last: true });
	}

	const start = hero.y * w + hero.x;
	for (const r of reqNodes) if (r.rec && targets.some((t) => t.rec === r.rec)) r.cells = [];
	const stops = [...targets, ...reqNodes];
	const T = targets.length;
	const allMask = (1 << gates.length) - 1;
	// pick one representative tile per stop: the approach tile closest to the start with everything open
	const full = bfs(start, allMask);
	for (const s of stops) {
		let best = -1, bd = Infinity;
		for (const c of s.cells) if (full.dist[c] >= 0 && full.dist[c] < bd) { bd = full.dist[c]; best = c; }
		s.at = best;
	}
	const unreachable = stops.filter((s, i) => i < T && s.at < 0);
	const live = stops.map((s, i) => ({ s, i })).filter(({ s }) => s.at >= 0);

	// unlock bits each requirement stop grants
	const grants = stops.map(() => 0);
	gates.forEach((g, gi) => {
		for (const r of g.req) {
			// a requirement that is itself an objective (e.g. the forest mini-boss) is granted by that stop
			const same = reqNodes[r].rec ? targets.findIndex((t) => t.rec === reqNodes[r].rec) : -1;
			grants[same >= 0 ? same : T + r] |= 1 << gi;
		}
	});
	const extra = stops.map((s) => s.cost || 0);

	// distances between stop tiles, one matrix per unlock mask (rows/cols indexed by tile -> node)
	const nodeOf = new Map();
	const nodeCells = [];
	for (const c of [start, ...live.map(({ s }) => s.at)]) if (!nodeOf.has(c)) { nodeOf.set(c, nodeCells.length); nodeCells.push(c); }
	const M = nodeCells.length;
	const matrices = new Map();
	const matrix = (mask) => {
		let m = matrices.get(mask);
		if (m) return m;
		m = new Float64Array(M * M);
		for (let u = 0; u < M; u++) {
			const d = bfs(nodeCells[u], mask).dist;
			for (let v = 0; v < M; v++) m[u * M + v] = d[nodeCells[v]] < 0 ? Infinity : d[nodeCells[v]];
		}
		matrices.set(mask, m);
		return m;
	};
	const dist = (from, to, mask) => matrix(mask)[nodeOf.get(from) * M + nodeOf.get(to)];

	let order = null;
	const idx = live.map(({ i }) => i);
	if (idx.length <= exactLimit) order = heldKarp();
	if (!order) order = heuristic();

	function heldKarp() {
		const n = idx.length;
		if (n === 0) return [];
		const targetBits = idx.reduce((m, si, k) => (si < T ? m | (1 << k) : m), 0);
		const lastStop = idx.findIndex((si) => stops[si].last);
		const size = 1 << n;
		const best = new Float64Array(size * n).fill(Infinity);
		const from = new Int16Array(size * n).fill(-1);
		const unlock = (set) => { let m = 0; for (let k = 0; k < n; k++) if (set & (1 << k)) m |= grants[idx[k]]; return m; };
		for (let k = 0; k < n; k++) {
			if (lastStop === k && n > 1) continue;
			best[(1 << k) * n + k] = dist(start, stops[idx[k]].at, 0) + extra[idx[k]];
		}
		for (let set = 1; set < size; set++) {
			const m = unlock(set);
			for (let k = 0; k < n; k++) {
				if (!(set & (1 << k))) continue;
				const cur = best[set * n + k];
				if (cur === Infinity) continue;
				if (k === lastStop && set !== size - 1 && (set & targetBits) !== targetBits) continue;
				for (let j = 0; j < n; j++) {
					if (set & (1 << j)) continue;
					if (j === lastStop && ((set | (1 << j)) & targetBits) !== targetBits) continue;
					const d = dist(stops[idx[k]].at, stops[idx[j]].at, m);
					if (d === Infinity) continue;
					const ns = set | (1 << j);
					const v = cur + d + extra[idx[j]];
					if (v < best[ns * n + j]) { best[ns * n + j] = v; from[ns * n + j] = k; }
				}
			}
		}
		let bestV = Infinity, bestSet = -1, bestK = -1;
		for (let set = 1; set < size; set++) {
			if ((set & targetBits) !== targetBits) continue;
			for (let k = 0; k < n; k++) {
				if (lastStop >= 0 && k !== lastStop) continue;
				const v = best[set * n + k];
				if (v < bestV) { bestV = v; bestSet = set; bestK = k; }
			}
		}
		if (bestK < 0) return null;
		const out = [];
		for (let set = bestSet, k = bestK; k >= 0; ) {
			out.push(idx[k]);
			const p = from[set * n + k];
			set &= ~(1 << k);
			k = p;
		}
		return out.reverse();
	}

	function evaluate(seq) {
		let pos = start, mask = 0, total = 0;
		for (const si of seq) {
			const d = dist(pos, stops[si].at, mask);
			if (d === Infinity) return Infinity;
			total += d + extra[si];
			pos = stops[si].at;
			mask |= grants[si];
		}
		return total;
	}

	function heuristic() {
		// nearest reachable stop first; requirement stops only when they unlock something still needed
		const todo = new Set(idx.filter((si) => si < T && !stops[si].last));
		const optional = new Set(idx.filter((si) => si >= T));
		const seq = [];
		let pos = start, mask = 0;
		while (todo.size) {
			let pick = -1, pd = Infinity;
			for (const si of [...todo, ...optional]) {
				const d = dist(pos, stops[si].at, mask) + extra[si];
				if (si >= T && !(grants[si] & ~mask)) continue;
				if (d < pd) { pd = d; pick = si; }
			}
			if (pick < 0) break;
			seq.push(pick);
			todo.delete(pick);
			optional.delete(pick);
			pos = stops[pick].at;
			mask |= grants[pick];
		}
		const last = idx.find((si) => stops[si].last);
		if (last !== undefined) seq.push(last);
		// 2-opt on the order (keeping validity)
		let cur = evaluate(seq), improved = true;
		while (improved) {
			improved = false;
			for (let a = 0; a < seq.length - 1; a++) {
				for (let b = a + 1; b < seq.length; b++) {
					if (stops[seq[b]].last) continue;
					const cand = [...seq.slice(0, a), ...seq.slice(a, b + 1).reverse(), ...seq.slice(b + 1)];
					const v = evaluate(cand);
					if (v < cur) { cur = v; seq.splice(0, seq.length, ...cand); improved = true; }
				}
			}
		}
		return seq;
	}

	// ---- route ---------------------------------------------------------------------------
	const legs = [];
	const route = [];
	let pos = start, mask = 0, steps = 0, mp = 0, ep = 0;
	route.push(xy(start));
	const opened = new Set();
	for (const si of order) {
		const s = stops[si];
		const from = route.length - 1;
		const path = pathTo(pos, s.at, mask);
		const doing = [];
		for (let k = 1; k < path.length; k++) {
			const prev = path[k - 1], c = path[k];
			const jump = Math.abs((prev % w) - (c % w)) + Math.abs(((prev / w) | 0) - ((c / w) | 0)) > 1;
			if (jump) { route.push({ jump: true }); doing.push({ text: 'Take the ladder / portal', at: xy(prev), ep: 0, mp: 0 }); }
			route.push(xy(c));
			const act = action[c];
			if (act && !opened.has(c)) {
				opened.add(c);
				ep += act.ep;
				mp += act.mp;
				doing.push({ ...act, at: xy(c) });
			}
		}
		if (s.walk) for (const c of s.walk) route.push(xy(c));
		const len = path.length - 1 + (s.cost || 0);
		steps += len;
		const def = s.rec && s.rec.k === undefined ? rw(s.rec.id) : null;
		if (def && def.v) mp += def.v;
		legs.push({ stop: s, steps: len, at: xy(s.at), from, to: route.length - 1, doing });
		pos = s.walk ? s.walk[s.walk.length - 1] : s.at;
		mask |= grants[si];
	}

	return {
		legs, route, steps, mp, ep,
		exact: idx.length <= exactLimit,
		unreachable: unreachable.map((s) => s.rec),
		unknownGates: unknownGates.map((g) => g.obj),
		puzzle,
		debug: { bfs, teleports, gates, start },
	};

	function xy(i) { return { x: i % w, y: (i / w) | 0 }; }

	// hw.g: multi-tile objects cover rows upward and columns rightward; the flip flag (qw.c) swaps T and U
	function footprint(o, def) {
		const T = def && def.T ? def.T : 1, U = def && def.U ? def.U : 1;
		const th = o.c ? T : U, tw = o.c ? U : T;
		const out = [];
		for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
			const x = o.x + dx, y = o.y - dy;
			if (x >= 0 && y >= 0 && x < w && y < h) out.push(y * w + x);
		}
		return out;
	}
}

/**
 * Floor nonogram walk (c30.u0): stepping on an inner cell toggles it; the door opens when the inner 5x5
 * equals the pattern. Dipping straight in from the clue border to a filled cell and straight back out
 * toggles that cell once and every cell passed twice, so a sequence of dips solves it.
 */
export function nonogramWalk(level, patterns) {
	const { w, h, cells } = level;
	let x0 = -1, y0 = -1;
	for (let y = 0; y < h && x0 < 0; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (cells[2 * i] === 1 && (cells[2 * i + 1] & 63) === 12) { x0 = x; y0 = y; break; }
		}
	}
	if (x0 < 0) return null;
	const pat = patterns[level.A];
	const fills = [];
	for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (pat[(r + 3) * 8 + c + 3] !== 0) fills.push([c, r]);
	// border tiles (clue area): row 2 above the grid and column 2 left of it, in grid coordinates
	const at = (gx, gy) => (y0 + gy) * w + (x0 + gx);
	const walk = [];
	let cur = [2, 2];   // corner of the clue area
	const moveBorder = (tx, ty) => {
		// walk along row 2 / column 2 through the corner (2,2): never enters the inner grid
		while (cur[0] !== tx || cur[1] !== ty) {
			if (cur[1] === 2 && ty === 2) cur = [cur[0] + Math.sign(tx - cur[0]), 2];
			else if (cur[0] === 2 && tx === 2) cur = [2, cur[1] + Math.sign(ty - cur[1])];
			else if (cur[1] === 2) cur = [cur[0] + Math.sign(2 - cur[0]), 2];
			else cur = [2, cur[1] + Math.sign(2 - cur[1])];
			walk.push(at(cur[0], cur[1]));
		}
	};
	// each filled cell is reached from the nearer clue edge; dips run along the top edge left to right,
	// then back through the corner and down the left edge
	const dips = fills.map(([c, r]) => (r <= c ? { side: 'top', bx: c + 3, by: 2, depth: r + 1 } : { side: 'left', bx: 2, by: r + 3, depth: c + 1 }));
	dips.sort((a, b) => (a.side === b.side ? (a.side === 'top' ? a.bx - b.bx : a.by - b.by) : a.side === 'top' ? -1 : 1));
	walk.push(at(2, 2));
	for (const d of dips) {
		moveBorder(d.bx, d.by);
		const path = [];
		for (let k = 1; k <= d.depth; k++) path.push(d.side === 'top' ? at(d.bx, 2 + k) : at(2 + k, d.by));
		walk.push(...path, ...path.slice(0, -1).reverse(), at(d.bx, d.by));
	}
	return { start: at(2, 2), walk, fills: fills.length, x0, y0 };
}

class Heap {
	constructor() { this.k = []; this.v = []; }
	get size() { return this.k.length; }
	push(key, val) {
		const k = this.k, v = this.v;
		let i = k.length;
		k.push(key); v.push(val);
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (k[p] <= key) break;
			k[i] = k[p]; v[i] = v[p]; i = p;
		}
		k[i] = key; v[i] = val;
	}
	pop() {
		const k = this.k, v = this.v;
		const top = [k[0], v[0]];
		const lk = k.pop(), lv = v.pop();
		if (k.length) {
			let i = 0;
			const n = k.length;
			for (;;) {
				let c = 2 * i + 1;
				if (c >= n) break;
				if (c + 1 < n && k[c + 1] < k[c]) c++;
				if (k[c] >= lk) break;
				k[i] = k[c]; v[i] = v[c]; i = c;
			}
			k[i] = lk; v[i] = lv;
		}
		return top;
	}
}
