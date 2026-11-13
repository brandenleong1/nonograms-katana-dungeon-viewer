// Route planner: visit every objective, opening what blocks the way, for the least effort.
//
// Movement follows the game's own pathfinder (hw.t):
//  - 4-directional steps. A tile is walkable if its tile type allows it (zw.u .m: floor, doorway), or if it is
//    overgrowth (.o: tiles 8/9/10) that has been cleared (b & 32); clearing costs energy.
//  - Every object blocks its tile except mine carts (84). Objects are used from a neighbouring tile ("bump").
//  - Door objects open by condition:
//      27 sealed door (mental power), 28 stuck door (energy, pw.r)   -> openable at a cost
//      33 gate -> its lever (32, same h); 29 locked door -> a gold monster's key (167), or one the hero holds;
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
const NONOGRAM_DETOUR = 500;  // extra for stepping on the floor nonogram's inner grid
// tile walk flags from zw.u (m = walkable, o = walkable once cleared); used if the caller passes none
const DEFAULT_TILE = { 1: { m: true }, 3: { m: true }, 8: { o: true }, 9: { o: true }, 10: { o: true } };
// tile types (cell a) and flags (cell b) the planner reads
const FLOOR = 1, WALL = 2, EXIT = 5, OUTWALL = 7, FLOWERS = 10;
const CLEARED = 32;            // b & 32: overgrowth cleared, a forest exit unlocked
const PLATE = 44;              // floor decoration (b & 63): a barrel plate
const NONOGRAM_CORNER = 12;    // floor decoration (b & 63): the corner of the floor nonogram's clue area
const HERO = 180, MINE_CART = 84;
// tileAction's answer for a tile nobody can enter (null: nothing to do there)
const BLOCKED = Object.freeze({ blocked: true });

/**
 * The route through every objective, from the hero's tile.
 *
 * Options: the game's tables (`rw` object definitions, `bw` creature definitions, `pwOf(type)` dungeon definitions,
 * nonogram `patterns`, tile walk flags `tiles`), `endAtExit` (finish at the stairs), the step price of one point of
 * energy and mental power (`epCost`, `mpCost`), up to how many stops the order is exact (`exactLimit`), and from a
 * live state the keys (167) already in the hero's pack (`heldKeys`; 0 for a label's fresh dungeon).
 *
 * Returns `{ legs, route, steps, mp, ep, exact, unreachable, unknownGates, puzzle, debug }`: `route` is the tiles
 * walked (`{ jump: true }` before a ladder or portal hop), each leg covers `route[from + 1 .. to]`.
 */
export function planRoute(level, { rw, bw = null, pwOf, patterns, tiles = null, endAtExit = false, epCost = EP_COST, mpCost = MP_COST, exactLimit = EXACT_LIMIT, heldKeys = 0 }) {
	const pw = pwOf(level.type);
	const grid = new RouteGrid(level, { rw, tiles });
	const puzzle = patterns ? nonogramWalk(level, patterns) : null;
	const locks = doorLocks(grid, puzzle, heldKeys);
	// a gate with no known requirement stays shut (marked in the result)
	const unknownGates = locks.gates.filter((g) => !g.req.length);
	const teleports = teleportLinks(grid);
	const { enter, action } = entryCosts(grid, pw, { epCost, mpCost });
	if (pw && pw.E) lockForestExits(grid, locks, enter);
	if (puzzle) avoidNonogramGrid(grid, puzzle, enter);
	const paths = new PathSearch(grid, { enter, gateOf: locks.gateOf, teleports });

	const hero = level.critters.find((c) => c.id === HERO);
	const targets = targetStops(grid, { rw, bw, pw, endAtExit });
	const start = hero.y * grid.w + hero.x;
	clearOpenersThatAreObjectives(locks.openers, targets);
	const stops = [...targets, ...locks.openers];
	placeStops(stops, paths.search(start, (1 << locks.gates.length) - 1).dist);
	const unreachable = stops.filter((s, i) => i < targets.length && s.at < 0);

	const tour = newTour({ start, stops, targets, locks, paths });
	const order = visitOrder(tour, exactLimit);
	const walk = walkRoute(order, tour, { grid, paths, action, rw });
	return {
		legs: walk.legs, route: walk.route, steps: walk.steps, mp: walk.mp, ep: walk.ep,
		exact: tour.live.length <= exactLimit,
		unreachable: unreachable.map((s) => s.rec),
		unknownGates: unknownGates.map((g) => g.obj),
		puzzle,
		debug: { bfs: (src, mask) => paths.search(src, mask), teleports, gates: locks.gates, start },
	};
}

/**
 * The game's objective list (hw.i): objects with qw.f (forest: only the boss gate 53; elsewhere objective objects
 * not yet used, and arena checkpoint keys 32/h1201), creatures whose definition has bw.t, and in forests one more:
 * unlocking the exit (tile 5 with b&15 in {2,3} and b&32 clear).
 */
export function objectives(level, { rw, bw, pw }) {
	const forest = !!(pw && pw.E);
	const out = [];
	for (const o of level.objects) {
		const def = rw(o.id);
		if (def && isObjectiveObject(o, def, forest)) out.push({ kind: 'object', rec: o });
	}
	for (const c of level.critters) {
		const def = bw ? bw(c.id) : null;
		if (def && def.t) out.push({ kind: 'critter', rec: c });
	}
	const exitLock = forest ? lockedForestExit(level) : null;
	if (exitLock) out.push(exitLock);
	return out;
}

/**
 * Floor nonogram walk (c30.u0): stepping on an inner cell toggles it; the door opens when the inner 5x5
 * equals the pattern. Dipping straight in from the clue border to a filled cell and straight back out
 * toggles that cell once and every cell passed twice, so a sequence of dips solves it.
 */
export function nonogramWalk(level, patterns) {
	const corner = nonogramCorner(level);
	if (!corner) return null;
	const { x0, y0 } = corner;
	const fills = filledCells(patterns[level.A]);
	// grid coordinates: the inner 5x5 is 3..7; row 2 above it and column 2 left of it are the clue border
	const at = (gx, gy) => (y0 + gy) * level.w + (x0 + gx);
	const walk = [at(2, 2)];
	let border = [2, 2];   // corner of the clue area
	for (const d of nonogramDips(fills)) {
		for (const [gx, gy] of borderSteps(border, [d.bx, d.by])) walk.push(at(gx, gy));
		border = [d.bx, d.by];
		const path = [];
		for (let k = 1; k <= d.depth; k++) path.push(d.side === 'top' ? at(d.bx, 2 + k) : at(2 + k, d.by));
		walk.push(...path, ...path.slice(0, -1).reverse(), at(d.bx, d.by));
	}
	return { start: at(2, 2), walk, fills: fills.length, x0, y0 };
}

// ---- the grid and its movement rule -------------------------------------------------------

/** The level as the planner walks it: tiles, what stands on them, and the game's movement rule. */
class RouteGrid {
	constructor(level, { rw, tiles }) {
		this.level = level;
		this.w = level.w;
		this.h = level.h;
		this.cells = level.cells;
		this.cellCount = level.w * level.h;
		this.rw = rw;
		this.tiles = tiles;
		this.objAt = new Map();
		for (const o of level.objects) for (const c of this.footprint(o, rw(o.id))) this.objAt.set(c, o);
		this.critAt = new Map();
		for (const c of level.critters) if (c.id !== HERO) this.critAt.set(this.cellOf(c), c);
	}

	tileFlag(a) {
		return (this.tiles ? this.tiles[a] : DEFAULT_TILE[a]) || {};
	}

	cellOf(rec) {
		return rec.y * this.w + rec.x;
	}

	xy(i) {
		return { x: i % this.w, y: (i / this.w) | 0 };
	}

	manhattan(i, j) {
		const w = this.w;
		return Math.abs((i % w) - (j % w)) + Math.abs(((i / w) | 0) - ((j / w) | 0));
	}

	/** Can the hero stand here? (used for "approach" tiles next to objects) */
	walkable(i) {
		const flag = this.tileFlag(this.cells[2 * i]);
		if (!flag.m && !flag.o) return false;
		const o = this.objAt.get(i);
		if (o && o.id !== MINE_CART && !DOORS.has(o.id)) return false;   // objects block, except mine carts and doors
		return true;
	}

	neighbours(i) {
		const { w, h } = this;
		const x = i % w, y = (i / w) | 0, out = [];
		for (const [dx, dy] of DIRS) {
			const nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
		}
		return out;
	}

	/** The tiles an object or creature is used from: around an object's footprint, or a creature's tile and around it. */
	approach(rec) {
		const isCritter = rec.k !== undefined;
		const covered = isCritter ? [this.cellOf(rec)] : this.footprint(rec, this.rw(rec.id));
		const inside = new Set(covered);
		const out = [];
		for (const c of covered) {
			// Wall-mounted objects face the viewer: they hang on a room's top or right wall, so they are used
			// from the tile below (y+1) or to the left (x-1), never from behind the wall.
			const sides = this.isWall(c) ? [c + this.w, c - 1] : this.neighbours(c);
			for (const n of sides) if (!inside.has(n) && this.walkable(n)) out.push(n);
		}
		if (isCritter && this.walkable(this.cellOf(rec))) out.push(this.cellOf(rec));
		return [...new Set(out)];
	}

	isWall(i) {
		const a = this.cells[2 * i];
		return a === WALL || a === OUTWALL;
	}

	/** Walkable tiles next to the stairs. */
	stairsApproach() {
		const out = [];
		for (let i = 0; i < this.cellCount; i++) {
			if (this.cells[2 * i] !== EXIT) continue;
			for (const n of this.neighbours(i)) if (this.walkable(n)) out.push(n);
		}
		return out;
	}

	plates() {
		const out = [];
		for (let i = 0; i < this.cellCount; i++) if (this.cells[2 * i] === FLOOR && (this.cells[2 * i + 1] & 63) === PLATE) out.push(i);
		return out;
	}

	// hw.g: multi-tile objects cover rows upward and columns rightward; the flip flag (qw.c) swaps T and U
	footprint(o, def) {
		const T = def && def.T ? def.T : 1, U = def && def.U ? def.U : 1;
		const th = o.c ? T : U, tw = o.c ? U : T;
		const out = [];
		for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) {
			const x = o.x + dx, y = o.y - dy;
			if (x >= 0 && y >= 0 && x < this.w && y < this.h) out.push(y * this.w + x);
		}
		return out;
	}
}

// ---- gates: door objects that need something first ------------------------------------------

/**
 * The gates (door objects that stay shut until something is done elsewhere) and their openers: optional stops
 * that unlock them, shared between gates by key. A gate's `req` lists indices into `openers`; its bit in an unlock
 * mask is its index in `gates`.
 */
class Locks {
	constructor(grid, puzzle, heldKeys) {
		const { objects, critters } = grid.level;
		this.grid = grid;
		this.puzzle = puzzle;
		this.keyedDoors = keyedDoors(grid.level, heldKeys);
		this.gates = [];
		this.gateOf = new Int8Array(grid.cellCount).fill(-1);
		this.openers = [];
		this.openerIndex = new Map();
		this.levers = objects.filter((o) => o.id === 32 && o.h !== 1201);
		this.goldMonsters = critters.filter((c) => c.g === 167);
		this.miniBosses = critters.filter((c) => c.h === 1100);
		this.plateCells = grid.plates();
	}

	/** Adds the gate a door object makes, if it makes one, with the stops that open it. */
	addDoor(o) {
		const cell = this.grid.cellOf(o);
		if (o.id === 33) {
			const g = this.addGate(cell, { obj: o, kind: 'gate', label: 'Gate' });
			for (const l of this.levers.filter((l) => l.h === o.h)) this.require(g, `lever${l.h}-${l.x},${l.y}`, () => this.bumpStop('lever', l, 'Pull the lever'));
		} else if (o.id === 29) {
			// a key already held opens it as it is bumped (c30.m0): no gate, a plain door
			if (this.keyedDoors.has(o)) return;
			const g = this.addGate(cell, { obj: o, kind: 'lock', label: 'Locked door' });
			for (const m of this.goldMonsters) this.require(g, `gold${m.x},${m.y}`, () => this.bumpStop('gold', m, 'Defeat the gold monster (key)'));
		} else if (o.id === 35) {
			const g = this.addGate(cell, { obj: o, kind: 'nonogram', label: 'Puzzle door' });
			if (this.puzzle) this.require(g, 'nonogram', () => this.nonogramStop());
		} else if (o.id === 60) {
			const g = this.addGate(cell, { obj: o, kind: 'barrels', label: 'Barrel door' });
			if (this.plateCells.length) this.require(g, 'barrels', () => this.barrelStop());
		} else if (o.id === 53) {
			this.addMiniBossGate(cell, { obj: o, kind: 'bossgate', label: 'Boss gate' });
		}
	}

	/** A forest exit locked by key 222 (mini-boss): standing on it is the objective, gated like a door. */
	addExitLock(cell) {
		this.addMiniBossGate(cell, { obj: { id: -1, ...this.grid.xy(cell) }, kind: 'exitlock', label: 'Locked exit' });
	}

	addMiniBossGate(cell, gate) {
		const g = this.addGate(cell, gate);
		for (const m of this.miniBosses) this.require(g, `mini${m.x},${m.y}`, () => this.bumpStop('miniboss', m, 'Defeat the mini-boss (key)'));
	}

	addGate(cell, { obj, kind, label }) {
		const g = this.gates.length;
		this.gates.push({ obj, kind, label, req: [] });
		this.gateOf[cell] = g;
		return g;
	}

	require(gate, key, makeStop) {
		if (!this.openerIndex.has(key)) {
			this.openerIndex.set(key, this.openers.length);
			this.openers.push(makeStop());
		}
		this.gates[gate].req.push(this.openerIndex.get(key));
	}

	bumpStop(kind, rec, label) {
		return { kind, rec, cells: this.grid.approach(rec), label };
	}

	nonogramStop() {
		const { start, walk } = this.puzzle;
		return { kind: 'nonogram', rec: null, cells: [start], walk, cost: walk.length, label: 'Solve the floor nonogram' };
	}

	barrelStop() {
		const grid = this.grid;
		const cells = this.plateCells.flatMap((p) => grid.neighbours(p)).filter((n) => grid.walkable(n));
		return { kind: 'barrels', rec: null, cells, cost: barrelPushSteps(grid, this.plateCells), label: 'Push the barrels onto the plates' };
	}
}

function doorLocks(grid, puzzle, heldKeys) {
	const locks = new Locks(grid, puzzle, heldKeys);
	for (const o of grid.level.objects) locks.addDoor(o);
	return locks;
}

/**
 * The locked doors (29) the hero's held keys open: in the game (c30.m0) any key 167 opens any door 29 and is used up
 * by it, so `heldKeys` of them -- the ones nearest the hero (Manhattan), which the walk most likely reaches first.
 */
function keyedDoors(level, heldKeys) {
	if (!(heldKeys > 0)) return new Set();
	const hero = level.critters.find((c) => c.id === HERO);
	const away = (o) => Math.abs(o.x - hero.x) + Math.abs(o.y - hero.y);
	const doors = level.objects.filter((o) => o.id === 29).sort((a, b) => away(a) - away(b));
	return new Set(doors.slice(0, heldKeys));
}

function lockForestExits(grid, locks, enter) {
	for (let i = 0; i < grid.cellCount; i++) {
		if (!isForestExit(grid.cells, i) || grid.cells[2 * i + 1] & CLEARED) continue;
		enter[i] = 1;
		locks.addExitLock(i);
	}
}

// steps to push every barrel to its nearest plate: twice the distance (walk round it, then push)
function barrelPushSteps(grid, plates) {
	let steps = 0;
	for (const b of grid.level.objects.filter((o) => o.id === 59)) {
		let nearest = Infinity;
		for (const p of plates) nearest = Math.min(nearest, Math.abs(b.x - (p % grid.w)) + Math.abs(b.y - ((p / grid.w) | 0)));
		steps += 2 * nearest;
	}
	return steps;
}

// ---- moving: teleports, tile costs, shortest paths ------------------------------------------

/** Teleport edges: each approach tile of a ladder / portal leads to the first approach tile of its partner. */
function teleportLinks(grid) {
	const pairs = new Map();
	for (const o of grid.level.objects) {
		const group = teleportGroup(o);
		if (!group || !o.h) continue;
		const key = `${group}:${o.h}`;
		if (!pairs.has(key)) pairs.set(key, []);
		pairs.get(key).push(o);
	}
	const teleports = new Map(); // cell -> [landing cells]
	for (const ends of pairs.values()) {
		if (ends.length !== 2) continue;
		const [a, b] = ends;
		const la = grid.approach(a), lb = grid.approach(b);
		for (const c of la) teleports.set(c, [...(teleports.get(c) || []), ...lb.slice(0, 1)]);
		for (const c of lb) teleports.set(c, [...(teleports.get(c) || []), ...la.slice(0, 1)]);
	}
	return teleports;
}

// hw.q: ladder 40 <-> hatch 38/39; portal 88 / teleporter 126 pair with each other (same h)
function teleportGroup(o) {
	if (o.id === 40 || o.id === 38 || o.id === 39) return 'ladder';
	if (o.id === 88 || o.id === 126) return 'portal';
	return null;
}

/** The cost of entering each tile (Infinity = blocked), and what it takes ({ ep, mp, text } or null). */
function entryCosts(grid, pw, { epCost, mpCost }) {
	const enter = new Float64Array(grid.cellCount);
	const action = new Array(grid.cellCount).fill(null);
	for (let i = 0; i < grid.cellCount; i++) {
		const act = tileAction(grid, i, pw);
		if (act === BLOCKED) {
			enter[i] = Infinity;
			continue;
		}
		let cost = 1;
		if (act) cost += 1 + act.ep * epCost + act.mp * mpCost;
		const c = grid.critAt.get(i);
		if (c) cost += c.k === 2 ? FIGHT_COST : NPC_COST;
		enter[i] = cost;
		action[i] = act;
	}
	return { enter, action };
}

/** What stepping onto a tile takes: an action, null for nothing, or BLOCKED. */
function tileAction(grid, i, pw) {
	const terrain = terrainAction(grid, i);
	if (terrain === BLOCKED) return BLOCKED;
	const o = grid.objAt.get(i);
	if (!o || o.id === MINE_CART) return terrain;
	return objectAction(o, grid.rw(o.id), pw);
}

function terrainAction(grid, i) {
	const a = grid.cells[2 * i], b = grid.cells[2 * i + 1];
	const flag = grid.tileFlag(a);
	if (flag.m) return null;
	if (!flag.o) return BLOCKED;
	if (b & CLEARED) return null;
	return { ep: a === FLOWERS ? 1 : 2, mp: 0, text: a === FLOWERS ? 'Trample flowers' : 'Clear undergrowth' };
}

function objectAction(o, def, pw) {
	if (o.id === 27) return { ep: 0, mp: (def && def.v) || 3, text: 'Unseal door' };
	if (o.id === 28 || o.id === 73) return { ep: pw ? pw.r : 5, mp: 0, text: 'Break stuck door' };
	if (o.id === 29) return { ep: 0, mp: 0, text: 'Unlock door with the key' };
	if (DOORS.has(o.id)) return null;                                  // opens by itself once unlocked
	if (o.id === 30) return { ep: 0, mp: (def && def.v) || 3, text: 'Disarm trap' };
	if (def && def.l) return { ep: 1, mp: 0, text: 'Smash' };
	return BLOCKED;                                                     // furniture etc.
}

// stepping on the floor nonogram's inner 5x5 toggles it: route around it (the puzzle walk is added separately)
function avoidNonogramGrid(grid, puzzle, enter) {
	for (let dy = 3; dy < 8; dy++) for (let dx = 3; dx < 8; dx++) {
		const i = (puzzle.y0 + dy) * grid.w + puzzle.x0 + dx;
		if (enter[i] < Infinity) enter[i] += NONOGRAM_DETOUR;
	}
}

/** Dijkstra over the tile costs, through the gates an unlock mask has opened. Cached per source and mask. */
class PathSearch {
	constructor(grid, { enter, gateOf, teleports }) {
		this.grid = grid;
		this.enter = enter;
		this.gateOf = gateOf;
		this.teleports = teleports;
		this.cache = new Map();
	}

	/** { dist, prev } from src: dist is -1 where unreachable, prev the tile before on a shortest path. */
	search(src, mask) {
		const key = mask * this.grid.cellCount + src;   // unique for any number of gates (src < cellCount)
		if (this.cache.has(key)) return this.cache.get(key);
		const { grid, enter, gateOf, teleports } = this;
		const N = grid.cellCount;
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
			for (const n of grid.neighbours(c)) relax(n, 0);
			const t = teleports.get(c);
			if (t) for (const n of t) relax(n, 1);   // bump the ladder/portal, then appear by its partner
		}
		for (let i = 0; i < N; i++) if (dist[i] === Infinity) dist[i] = -1;
		const result = { dist, prev };
		this.cache.set(key, result);
		return result;
	}

	pathTo(src, dst, mask) {
		const { prev } = this.search(src, mask);
		const out = [];
		for (let c = dst; c !== -1; c = prev[c]) out.push(c);
		return out.reverse();
	}
}

// ---- stops ------------------------------------------------------------------------------------

/** The objectives as stops, each with the tiles it can be done from, then the stairs when the route ends there. */
function targetStops(grid, { rw, bw, pw, endAtExit }) {
	const targets = [];
	for (const ob of objectives(grid.level, { rw, bw, pw })) {
		if (ob.kind === 'exitlock') targets.push({ kind: 'objective', rec: null, cells: ob.cells, label: 'Unlock the exit (key from the mini-boss)' });
		else targets.push({ kind: 'objective', rec: ob.rec, cells: grid.approach(ob.rec), label: null });
	}
	if (!endAtExit) return targets;
	const exits = grid.stairsApproach();
	if (exits.length) targets.push({ kind: 'exit', rec: null, cells: exits, label: 'Leave by the stairs', last: true });
	return targets;
}

// an opener that is itself an objective (e.g. the forest mini-boss) is done as that objective, not as a stop of its own
function clearOpenersThatAreObjectives(openers, targets) {
	for (const r of openers) if (r.rec && targets.some((t) => t.rec === r.rec)) r.cells = [];
}

// pick one representative tile per stop: the approach tile closest to the start with everything open (-1: none)
function placeStops(stops, distFromStart) {
	for (const s of stops) {
		let best = -1, bd = Infinity;
		for (const c of s.cells) if (distFromStart[c] >= 0 && distFromStart[c] < bd) { bd = distFromStart[c]; best = c; }
		s.at = best;
	}
}

/**
 * What the visiting order is chosen over: the stops (targets first, then openers), the reachable ones (`live`,
 * indices into `stops`), the unlock bits each grants, each one's extra steps, and the distances between them.
 */
function newTour({ start, stops, targets, locks, paths }) {
	const live = [];
	stops.forEach((s, i) => { if (s.at >= 0) live.push(i); });
	return {
		start, stops, live,
		targetCount: targets.length,
		grants: unlockGrants(stops, targets, locks),
		extra: stops.map((s) => s.cost || 0),
		distances: new StopDistances(paths, [start, ...live.map((si) => stops[si].at)]),
	};
}

// unlock bits each stop grants
function unlockGrants(stops, targets, locks) {
	const grants = stops.map(() => 0);
	locks.gates.forEach((g, gi) => {
		for (const r of g.req) {
			// a requirement that is itself an objective (e.g. the forest mini-boss) is granted by that stop
			const same = locks.openers[r].rec ? targets.findIndex((t) => t.rec === locks.openers[r].rec) : -1;
			grants[same >= 0 ? same : targets.length + r] |= 1 << gi;
		}
	});
	return grants;
}

/** Distances between stop tiles, one matrix per unlock mask, built on first use. */
class StopDistances {
	constructor(paths, cells) {
		this.paths = paths;
		this.nodeOf = new Map();   // tile -> row / column
		this.nodeCells = [];
		for (const c of cells) if (!this.nodeOf.has(c)) { this.nodeOf.set(c, this.nodeCells.length); this.nodeCells.push(c); }
		this.matrices = new Map();
	}

	between(from, to, mask) {
		return this.matrix(mask)[this.nodeOf.get(from) * this.nodeCells.length + this.nodeOf.get(to)];
	}

	matrix(mask) {
		let m = this.matrices.get(mask);
		if (m) return m;
		const cells = this.nodeCells, M = cells.length;
		m = new Float64Array(M * M);
		for (let u = 0; u < M; u++) {
			const d = this.paths.search(cells[u], mask).dist;
			for (let v = 0; v < M; v++) m[u * M + v] = d[cells[v]] < 0 ? Infinity : d[cells[v]];
		}
		this.matrices.set(mask, m);
		return m;
	}
}

// ---- visiting order ---------------------------------------------------------------------------

/** Stop indices in visiting order: exact up to `exactLimit` reachable stops (if an exact order exists), else by search. */
function visitOrder(tour, exactLimit) {
	const exact = tour.live.length <= exactLimit ? heldKarp(tour) : null;
	return exact || searchOrder(tour);
}

/** Held-Karp over (stops visited, last stop) with the gates those stops opened; null if no order covers every target. */
function heldKarp(tour) {
	if (tour.live.length === 0) return [];
	const table = heldKarpTable(tour);
	const end = cheapestEnd(table);
	return end ? traceOrder(table, end) : null;
}

/** best[set * n + k]: the cheapest walk from the start through `set` (bits over `live`) ending at k; from: the stop before. */
function heldKarpTable(tour) {
	const { live, stops, grants, extra, distances, start } = tour;
	const n = live.length;
	const targetBits = live.reduce((m, si, k) => (si < tour.targetCount ? m | (1 << k) : m), 0);
	const lastStop = live.findIndex((si) => stops[si].last);
	const size = 1 << n;
	const best = new Float64Array(size * n).fill(Infinity);
	const from = new Int16Array(size * n).fill(-1);
	const unlock = (set) => { let m = 0; for (let k = 0; k < n; k++) if (set & (1 << k)) m |= grants[live[k]]; return m; };
	for (let k = 0; k < n; k++) {
		if (lastStop === k && n > 1) continue;
		best[(1 << k) * n + k] = distances.between(start, stops[live[k]].at, 0) + extra[live[k]];
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
				const d = distances.between(stops[live[k]].at, stops[live[j]].at, m);
				if (d === Infinity) continue;
				const ns = set | (1 << j);
				const v = cur + d + extra[live[j]];
				if (v < best[ns * n + j]) { best[ns * n + j] = v; from[ns * n + j] = k; }
			}
		}
	}
	return { live, n, size, targetBits, lastStop, best, from };
}

// the cheapest finished walk: every target visited, ending at the last stop if there is one
function cheapestEnd({ n, size, targetBits, lastStop, best }) {
	let bestV = Infinity, end = null;
	for (let set = 1; set < size; set++) {
		if ((set & targetBits) !== targetBits) continue;
		for (let k = 0; k < n; k++) {
			if (lastStop >= 0 && k !== lastStop) continue;
			const v = best[set * n + k];
			if (v < bestV) { bestV = v; end = { set, k }; }
		}
	}
	return end;
}

function traceOrder({ live, n, from }, end) {
	const out = [];
	for (let set = end.set, k = end.k; k >= 0; ) {
		out.push(live[k]);
		const p = from[set * n + k];
		set &= ~(1 << k);
		k = p;
	}
	return out.reverse();
}

/** Beyond the exact limit: nearest stop first, then 2-opt. */
function searchOrder(tour) {
	const seq = nearestFirst(tour);
	improveByTwoOpt(tour, seq);
	return seq;
}

// nearest reachable stop first; requirement stops only when they unlock something still needed
function nearestFirst(tour) {
	const { live, stops, targetCount: T, grants, extra, distances } = tour;
	const todo = new Set(live.filter((si) => si < T && !stops[si].last));
	const optional = new Set(live.filter((si) => si >= T));
	const seq = [];
	let pos = tour.start, mask = 0;
	while (todo.size) {
		let pick = -1, pd = Infinity;
		for (const si of [...todo, ...optional]) {
			const d = distances.between(pos, stops[si].at, mask) + extra[si];
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
	const last = live.find((si) => stops[si].last);
	if (last !== undefined) seq.push(last);
	return seq;
}

// 2-opt on the order (keeping validity): reverse a run of stops whenever that shortens the walk
function improveByTwoOpt(tour, seq) {
	let cur = tourLength(tour, seq), improved = true;
	while (improved) {
		improved = false;
		for (let a = 0; a < seq.length - 1; a++) {
			for (let b = a + 1; b < seq.length; b++) {
				if (tour.stops[seq[b]].last) continue;
				const cand = [...seq.slice(0, a), ...seq.slice(a, b + 1).reverse(), ...seq.slice(b + 1)];
				const v = tourLength(tour, cand);
				if (v < cur) { cur = v; seq.splice(0, seq.length, ...cand); improved = true; }
			}
		}
	}
}

// Infinity if a stop can't be reached with the gates opened before it
function tourLength(tour, seq) {
	const { stops, grants, extra, distances } = tour;
	let pos = tour.start, mask = 0, total = 0;
	for (const si of seq) {
		const d = distances.between(pos, stops[si].at, mask);
		if (d === Infinity) return Infinity;
		total += d + extra[si];
		pos = stops[si].at;
		mask |= grants[si];
	}
	return total;
}

// ---- the route --------------------------------------------------------------------------------

function walkRoute(order, tour, { grid, paths, action, rw }) {
	const walk = new RouteWalk(grid, action, tour.start);
	let pos = tour.start, mask = 0;
	for (const si of order) {
		const stop = tour.stops[si];
		walk.addLeg(stop, paths.pathTo(pos, stop.at, mask), stopObjectMp(stop, rw));
		pos = stop.walk ? stop.walk[stop.walk.length - 1] : stop.at;
		mask |= tour.grants[si];
	}
	return walk;
}

// the mental power the stop's object itself asks (rw.v), e.g. a sealed chest
function stopObjectMp(stop, rw) {
	const def = stop.rec && stop.rec.k === undefined ? rw(stop.rec.id) : null;
	return def && def.v ? def.v : 0;
}

/** The route as it is walked: its tiles, its legs, and the steps, energy and mental power they take. */
class RouteWalk {
	constructor(grid, action, start) {
		this.grid = grid;
		this.action = action;
		this.legs = [];
		this.route = [grid.xy(start)];
		this.opened = new Set();   // tiles whose action is done: a door broken once stays open
		this.steps = 0;
		this.mp = 0;
		this.ep = 0;
	}

	addLeg(stop, path, objectMp) {
		const from = this.route.length - 1;
		const doing = [];
		for (let k = 1; k < path.length; k++) this.step(path[k - 1], path[k], doing);
		if (stop.walk) for (const c of stop.walk) this.route.push(this.grid.xy(c));
		const steps = path.length - 1 + (stop.cost || 0);
		this.steps += steps;
		if (objectMp) this.mp += objectMp;
		this.legs.push({ stop, steps, at: this.grid.xy(stop.at), from, to: this.route.length - 1, doing });
	}

	// one step of a leg; what the hero does on the way goes into `doing`
	step(prev, cell, doing) {
		if (this.grid.manhattan(prev, cell) > 1) {
			this.route.push({ jump: true });
			doing.push({ text: 'Take the ladder / portal', at: this.grid.xy(prev), ep: 0, mp: 0 });
		}
		this.route.push(this.grid.xy(cell));
		const act = this.action[cell];
		if (!act || this.opened.has(cell)) return;
		this.opened.add(cell);
		this.ep += act.ep;
		this.mp += act.mp;
		doing.push({ ...act, at: this.grid.xy(cell) });
	}
}

// ---- objectives and the floor nonogram ----------------------------------------------------------

// qw.f: forest: only the boss gate 53; elsewhere objective objects not yet used, and arena checkpoint keys 32/h1201
function isObjectiveObject(o, def, forest) {
	if (forest) return o.id === 53;
	return (def.t && (!def.n || !o.e)) || (o.id === 32 && o.h === 1201 && !o.e);
}

// the forest's last objective: unlocking the exit, unless one of its tiles is already open
function lockedForestExit(level) {
	const { w, cells } = level;
	let open = false;
	const locked = [];
	for (let i = 0; i < cells.length / 2; i++) {
		if (!isForestExit(cells, i)) continue;
		if (cells[2 * i + 1] & CLEARED) open = true;
		else locked.push(i);
	}
	if (open || !locked.length) return null;
	return { kind: 'exitlock', rec: null, cells: locked, at: { x: locked[0] % w, y: (locked[0] / w) | 0 } };
}

// tile 5 with b&15 in {2,3}: an exit the forest keeps locked until b&32
function isForestExit(cells, i) {
	if (cells[2 * i] !== EXIT) return false;
	const exitKind = cells[2 * i + 1] & 15;
	return exitKind === 2 || exitKind === 3;
}

function nonogramCorner({ w, h, cells }) {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (cells[2 * i] === FLOOR && (cells[2 * i + 1] & 63) === NONOGRAM_CORNER) return { x0: x, y0: y };
		}
	}
	return null;
}

// [column, row] of every filled cell of the 5x5 pattern (patterns are 8x8 with the grid at 3..7)
function filledCells(pattern) {
	const fills = [];
	for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (pattern[(r + 3) * 8 + c + 3] !== 0) fills.push([c, r]);
	return fills;
}

// each filled cell is reached from the nearer clue edge; dips run along the top edge left to right,
// then back through the corner and down the left edge
function nonogramDips(fills) {
	const dips = fills.map(([c, r]) => (r <= c ? { side: 'top', bx: c + 3, by: 2, depth: r + 1 } : { side: 'left', bx: 2, by: r + 3, depth: c + 1 }));
	dips.sort((a, b) => (a.side === b.side ? (a.side === 'top' ? a.bx - b.bx : a.by - b.by) : a.side === 'top' ? -1 : 1));
	return dips;
}

// the border tiles from one clue-border tile to another, along row 2 / column 2 through the corner (2,2): never
// into the inner grid
function borderSteps([x, y], [tx, ty]) {
	const out = [];
	while (x !== tx || y !== ty) {
		if (y === 2 && ty === 2) x += Math.sign(tx - x);
		else if (x === 2 && tx === 2) y += Math.sign(ty - y);
		else if (y === 2) x += Math.sign(2 - x);
		else { x = 2; y += Math.sign(2 - y); }
		out.push([x, y]);
	}
	return out;
}

// ---- low level ----------------------------------------------------------------------------------

// binary min-heap of (key, value) pairs, for Dijkstra
class Heap {
	constructor() { this.keys = []; this.values = []; }
	get size() { return this.keys.length; }
	push(key, val) {
		const k = this.keys, v = this.values;
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
		const k = this.keys, v = this.values;
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
