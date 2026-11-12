// Isometric dungeon renderer (canvas 2D), using the game's projection (c30.C0):
//   screen x = (x + y) * HW,  screen y = (y - x) * HH   — +x goes up-right, +y goes down-right.
// Walls are drawn the game's way (c30.D): each wall cell is 2 × 2 quarters. The back quarter (+x, -y) is always wall,
// the left one (-x, -y) when the wall goes on toward -x (or runs only along x), the right one (+x, +y) when it goes on
// toward +y (or has no x neighbour), and the front one never. Exact rule and sources: walls.js.
import { KINDS, TILE, objectKind, critterKind, isHiddenTrap, isPressurePlate } from './catalog.js';
import { drawSprite } from './sprites.js';
import { wallQuarters, WALL_LEFT, WALL_RIGHT, OPEN_LEFT, OPEN_RIGHT, FLOOR_SHOWS } from './walls.js';

const HW = 32;   // half tile width at scale 1
const HH = 16;   // half tile height at scale 1

const PALETTES = {
	dark: {
		Dungeon: { room: '#7a7166', corridor: '#5a554e', wall: '#9a98a3', wallL: '#6d6b75', wallR: '#55535c', out: '#2f5a2a' },
		Forest:  { room: '#77874c', corridor: '#8b7a55', wall: '#8f8d84', wallL: '#6a685f', wallR: '#55534c', out: '#2e5e2a' },
		Cave:    { room: '#6b6675', corridor: '#545060', wall: '#8a8296', wallL: '#625b6c', wallR: '#4d4756', out: '#4a4450' },
		Tomb:    { room: '#ad976d', corridor: '#8f7a55', wall: '#c9b282', wallL: '#a08c63', wallR: '#857350', out: '#7a6a4a' },
	},
	light: {
		Dungeon: { room: '#e2dbcf', corridor: '#cfc7b8', wall: '#8f8d99', wallL: '#706e7a', wallR: '#5e5c67', out: '#4f8a45' },
		Forest:  { room: '#c7d99a', corridor: '#d8c39a', wall: '#8f8d84', wallL: '#6f6d64', wallR: '#5c5a52', out: '#4a8a40' },
		Cave:    { room: '#d6d0de', corridor: '#c2bbcf', wall: '#7f778f', wallL: '#635c72', wallR: '#524b5f', out: '#6c6478' },
		Tomb:    { room: '#ecdcb3', corridor: '#dcc898', wall: '#b39a6c', wallL: '#957f56', wallR: '#7c6947', out: '#8f7c58' },
	},
};
const LIQUID = { 1: '#2f6fb3', 2: '#2f6fb3', 3: '#8fd3ff', 4: '#2f6fb3', 5: '#2b78c2', 6: '#5a3f9e' };
const STAIRS = { top: '#ffd84a', left: '#c9a227', right: '#a6841c' };

export class IsoView {
	constructor(canvas, { onHover = () => {}, onSelect = () => {} } = {}) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.onHover = onHover;
		this.onSelect = onSelect;
		this.level = null;
		this.layers = new Set(['loot', 'doors', 'links', 'monsters', 'puzzles', 'always']);
		this.wallHeight = 14;
		this.scale = 1;
		this.ox = 0;
		this.oy = 0;
		this.hover = null;      // {x, y}
		this.selected = null;   // object/critter record
		this.highlights = [];   // [{x, y, color}]
		this.links = [];        // [[a, b, color]] tile pairs to connect
		this.route = null;      // [{x, y} | {jump: true}]
		this.routeLeg = null;   // {from, to} indexes into route
		this.puzzle = null;     // {x0, y0, cells: [[x, y, kind]]}
		this.theme = 'dark';    // 'dark' | 'light' (from the page theme)
		this.solve = emptySolve();   // the solver's overlay (setSolveOverlay)
		this._pending = false;
		this._bindInput();
		new ResizeObserver(() => this._resize()).observe(canvas);
		this._resize();
	}

	setLevel(level, info) {
		this.level = level;
		this.info = info;
		this.palette = paletteFor(this.theme, info.family);
		this.objAt = new Map();
		for (const o of level.objects) this.objAt.set(o.y * level.w + o.x, o);
		this.critAt = new Map();
		for (const c of level.critters) this.critAt.set(c.y * level.w + c.x, c);
		this.walls = wallQuarters(level);
		this.selected = null;
		this.highlights = [];
		this.links = [];
		this.route = null;
		this.solve = emptySolve();
		this.fit();
	}

	setLayers(layers) { this.layers = new Set([...layers, 'always']); this.redraw(); }
	setTheme(theme) {
		this.theme = theme === 'light' ? 'light' : 'dark';
		if (this.info) this.palette = paletteFor(this.theme, this.info.family);
		this.redraw();
	}
	setRoute(route, leg = null) { this.route = route; this.routeLeg = leg; this.redraw(); }
	setPuzzle(puzzle) { this.puzzle = puzzle; this.redraw(); }
	setLinks(links, highlights) { this.links = links; this.highlights = highlights; this.redraw(); }

	/**
	 * The solver's overlay (js/ui/solve-panel.js), merged into the current one:
	 *   markers  [{ x, y, text, color, active, off }]  pins on the route (fixed screen size; off: x offset in px)
	 *   actors   [{ x, y, kind, variant, hp, hpM, bar, hero }] | null   creatures at a fight / script step
	 *   replace  true: actors replace the level's own creatures (script player), false: drawn on top
	 *   marks    [{ x, y, color, fill }]  cell outlines (fill: also a translucent fill)
	 *   callout  { x, y, text } | null  a text label above a cell
	 *   trail    [{ x, y } | { jump: true }] | null, upto: points walked so far (the rest is drawn faint)
	 *   hideRoute  hide the route planner's path (the trail replaces it)
	 */
	setSolveOverlay(o) {
		this.solve = { ...this.solve, ...o };
		if ('actors' in o) this.solve.actAt = this.level && o.actors ? actorsByCell(o.actors, this.level.w) : null;
		this.redraw();
	}
	clearSolveOverlay() { this.solve = emptySolve(); this.redraw(); }

	/** screen position of a cell (CSS px), and whether it is inside the canvas with a margin (fraction of the size) */
	inView(x, y, margin = 0.15) {
		const [sx, sy] = this.project(x, y);
		return sx >= this.cssW * margin && sx <= this.cssW * (1 - margin) && sy >= this.cssH * margin && sy <= this.cssH * (1 - margin);
	}

	/** centre on the box around cells `pts` and zoom so it fits (with a margin), the scale clamped to [min, max] */
	focusBox(pts, { min = 0.4, max = 1.5, pad = 2.5 } = {}) {
		if (!pts.length) return;
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const p of pts) {
			const sx = (p.x + p.y) * HW, sy = (p.y - p.x) * HH;
			if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
			if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
		}
		const w = x1 - x0 + 2 * pad * HW, h = y1 - y0 + 2 * pad * HH + 3 * HW;
		const s = Math.min(Math.max(Math.min(this.cssW / w, this.cssH / h), min), max);
		this.scale = s;
		this.ox = this.cssW / 2 - ((x0 + x1) / 2) * s;
		this.oy = this.cssH / 2 - ((y0 + y1) / 2 - HW) * s;
		this.redraw();
	}

	/** zoom to `scale` (clamped) keeping the canvas centre, then centre on (x, y) */
	focus(x, y, scale = null) {
		if (scale != null && Math.abs(scale - this.scale) > 1e-3) this.zoomAt(scale / this.scale, this.cssW / 2, this.cssH / 2);
		this.centerOn(x, y);
	}

	// ---- coordinates -----------------------------------------------------------------------
	project(x, y) {
		return [this.ox + (x + y) * HW * this.scale, this.oy + (y - x) * HH * this.scale];
	}

	unproject(sx, sy) {
		const u = (sx - this.ox) / (HW * this.scale);
		const v = (sy - this.oy) / (HH * this.scale);
		return { x: Math.round((u - v) / 2), y: Math.round((u + v) / 2) };
	}

	fit() {
		if (!this.level) return;
		const { w, h, cells } = this.level;
		// bounding box of non-void tiles, in unscaled screen units
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				if (cells[2 * (y * w + x)] === 0) continue;
				const sx = (x + y) * HW, sy = (y - x) * HH;
				if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
				if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
			}
		}
		if (minX === Infinity) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
		const cw = this.cssW, ch = this.cssH;
		this.scale = Math.min(cw / (maxX - minX + 2 * HW), ch / (maxY - minY + 2 * HH + this.wallHeight)) * 0.96;
		this.ox = (cw - (maxX - minX) * this.scale) / 2 - minX * this.scale;
		this.oy = (ch - (maxY - minY) * this.scale) / 2 - minY * this.scale;
		this.redraw();
	}

	zoomAt(factor, sx, sy) {
		const s = Math.min(Math.max(this.scale * factor, 0.05), 6);
		factor = s / this.scale;
		this.ox = sx - (sx - this.ox) * factor;
		this.oy = sy - (sy - this.oy) * factor;
		this.scale = s;
		this.redraw();
	}

	centerOn(x, y) {
		const [sx, sy] = this.project(x, y);
		this.ox += this.cssW / 2 - sx;
		this.oy += this.cssH / 2 - sy;
		this.redraw();
	}

	// ---- drawing ---------------------------------------------------------------------------
	redraw() {
		if (this._pending) return;
		this._pending = true;
		requestAnimationFrame(() => { this._pending = false; this.draw(); });
	}

	_resize() {
		const r = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		this.cssW = Math.max(r.width, 50);
		this.cssH = Math.max(r.height, 50);
		this.canvas.width = Math.round(this.cssW * dpr);
		this.canvas.height = Math.round(this.cssH * dpr);
		this.dpr = dpr;
		this.redraw();
	}

	draw() {
		const ctx = this.ctx;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.cssW, this.cssH);
		if (!this.level) return;
		const frame = this._frame();
		this._drawCells(ctx, frame);
		this._overlays(ctx, frame);
	}

	/**
	 * What one redraw needs: tile half sizes and wall height (CSS px), the palette, layer switches, and the shape and
	 * colours of each kind of block.
	 */
	_frame() {
		const s = this.scale;
		const hw = HW * s, hh = HH * s, wh = this.wallHeight * s;
		const pal = this.palette;
		const wall = { top: pal.wall, left: pal.wallL, right: pal.wallR };
		const outerWall = { top: pal.out, left: shade(pal.out, -0.25), right: shade(pal.out, -0.4) };
		const standsAlone = () => false;
		return {
			hw, hh, wh, pal, wall,
			showDecor: this.layers.has('decor') && s > 0.35,
			showTraps: this.layers.has('traps'),
			showPuzzles: this.layers.has('puzzles'),
			// a full block hides a face only behind a full block at least as tall: quarter walls leave gaps
			blocks: {
				[TILE.OUTWALL]: { hw, hh, height: wh * 1.2, faces: outerWall, joins: isOuterWall },
				[TILE.EXIT]: { hw, hh, height: wh, faces: STAIRS, joins: isFullBlock },
				[TILE.PILLAR]: { hw: hw * 0.45, hh: hh * 0.45, height: wh * 1.3, faces: wall, joins: standsAlone },
			},
		};
	}

	/** every cell on screen, back to front (increasing y - x): its tile, object, creature and solver actors */
	_drawCells(ctx, frame) {
		const { w, h, cells } = this.level;
		const margin = frame.hw * 2 + frame.wh;
		// one record, moved from cell to cell: this loop runs for every visible cell on every redraw
		const cell = { x: 0, y: 0, i: 0, a: 0, b: 0, cx: 0, cy: 0 };
		for (let d = -(w - 1); d <= h - 1; d++) {
			const x0 = Math.max(0, -d), x1 = Math.min(w - 1, h - 1 - d);
			for (let x = x0; x <= x1; x++) {
				const y = x + d;
				const [cx, cy] = this.project(x, y);
				if (cx < -margin || cx > this.cssW + margin || cy < -margin || cy > this.cssH + margin) continue;
				cell.x = x; cell.y = y; cell.i = y * w + x;
				cell.a = cells[2 * cell.i]; cell.b = cells[2 * cell.i + 1];
				cell.cx = cx; cell.cy = cy;
				this._drawCell(ctx, cell, frame);
			}
		}
	}

	_drawCell(ctx, cell, frame) {
		this._tile(ctx, cell, frame);
		const o = this.objAt.get(cell.i);
		if (o) this._object(ctx, o, cell, frame);
		const c = this.critAt.get(cell.i);
		// the script player draws the engine's creatures instead of the level's
		if (c && !(this.solve.replace && this.solve.actAt)) this._critter(ctx, c, cell, frame);
		const actors = this.solve.actAt && this.solve.actAt.get(cell.i);
		if (actors) for (const actor of actors) this._actor(ctx, actor, cell, frame.hw);
	}

	_diamond(ctx, cx, cy, hw, hh) {
		ctx.beginPath();
		ctx.moveTo(cx, cy - hh);
		ctx.lineTo(cx + hw, cy);
		ctx.lineTo(cx, cy + hh);
		ctx.lineTo(cx - hw, cy);
		ctx.closePath();
	}

	/** a raised block on the cell: side faces only where no neighbouring block it joins hides them */
	_block(ctx, cell, { hw, hh, height, faces, joins }) {
		const { x, y, cx, cy } = cell;
		const ty = cy - height;
		if (!joins(this._cellA(x - 1, y))) {   // face toward (x-1, y): lower-left edge
			ctx.fillStyle = faces.left;
			ctx.beginPath();
			ctx.moveTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
			ctx.closePath(); ctx.fill();
		}
		if (!joins(this._cellA(x, y + 1))) {   // face toward (x, y+1): lower-right edge
			ctx.fillStyle = faces.right;
			ctx.beginPath();
			ctx.moveTo(cx, ty + hh); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh);
			ctx.closePath(); ctx.fill();
		}
		ctx.fillStyle = faces.top;
		this._diamond(ctx, cx, ty, hw, hh);
		ctx.fill();
	}

	/**
	 * A wall cell the way the game draws it (walls.js): quarter blocks, on the room floor where the floor shows. Every
	 * wall has its back quarter; the left and right quarters are optional and the front quarter is always open.
	 */
	_quarterWall(ctx, cell, frame) {
		const m = this.walls[cell.i];
		if (m & FLOOR_SHOWS) {
			ctx.fillStyle = frame.pal.room;
			this._diamond(ctx, cell.cx, cell.cy, frame.hw, frame.hh);
			ctx.fill();
		}
		quarterFaces(ctx, cell, frame, m);
		quarterTop(ctx, cell, frame, m);
	}

	_tile(ctx, cell, frame) {
		const { cx, cy, a, b } = cell;
		const { hw, hh } = frame;
		switch (a) {
			case TILE.VOID:
				return;
			case TILE.WALL:
				this._quarterWall(ctx, cell, frame);
				return;
			case TILE.OUTWALL:
			case TILE.EXIT:
				this._block(ctx, cell, frame.blocks[a]);
				return;
			case TILE.PILLAR:
				ctx.fillStyle = frame.pal.room; this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
				this._block(ctx, cell, frame.blocks[a]);
				return;
			case TILE.LIQUID:
				ctx.fillStyle = LIQUID[b & 15] || '#2f6fb3';
				this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
				return;
			default:
				this._ground(ctx, cell, frame);
		}
	}

	/** a walkable tile: its colour and grid line, plus the pressure-plate ring and hidden-trap cross when shown */
	_ground(ctx, cell, frame) {
		const { cx, cy, a, b } = cell;
		const { hw, hh } = frame;
		ctx.fillStyle = groundColor(a, b, frame);
		this._diamond(ctx, cx, cy, hw, hh);
		ctx.fill();
		if (hw > 6) { ctx.strokeStyle = this.theme === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke(); }
		if (frame.showPuzzles && isPressurePlate(a, b)) plateRing(ctx, cell, frame);
		if (frame.showTraps && isHiddenTrap(a, b)) trapCross(ctx, cell, frame);
	}

	/** a sprite standing on the tile centred at (cx, cy), or a plain dot when zoomed out too far to read one */
	_badge(ctx, kind, { cx, cy, hw, selected = false, variant = '' }) {
		if (hw < 7) {
			ctx.fillStyle = selected ? (this.theme === 'light' ? '#111' : '#fff') : KINDS[kind].color;
			fillCircle(ctx, cx, cy, Math.max(1.6, hw * 0.55));
			return;
		}
		drawSprite(ctx, kind, cx, cy, hw, { selected, theme: this.theme, dpr: this.dpr, variant });
	}

	_cellA(x, y) {
		const { w, h, cells } = this.level;
		return x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[2 * (y * w + x)];
	}

	_object(ctx, o, cell, frame) {
		const kind = objectKind(o, this.info.rw(o.id));
		const { layer } = KINDS[kind];
		if (!this.layers.has(layer)) return;
		if (layer === 'decor' && !frame.showDecor) return;
		if (layer === 'decor' && frame.hw < 14) {
			ctx.fillStyle = KINDS[kind].color;
			fillCircle(ctx, cell.cx, cell.cy - frame.hh * 0.3, Math.max(1.5, frame.hw * 0.12));
			return;
		}
		const sprite = { cx: cell.cx, cy: cell.cy, hw: frame.hw, selected: this.selected === o, variant: '' };
		if (isWallTile(cell.a)) this._mountOnWall(o, sprite, frame.hh);
		else sprite.variant = this._objectVariant(o, kind);
		if (isDoorKind(kind)) this._alignDoor(o, sprite, frame.hh);
		this._badge(ctx, kind, sprite);
	}

	/** wall-mounted objects (ladders etc.) hang on the wall face that looks into their room */
	_mountOnWall(o, sprite, hh) {
		const facing = isWalkableTile(this._cellA(o.x, o.y + 1)) ? 'x' : isWalkableTile(this._cellA(o.x - 1, o.y)) ? 'y' : '';
		if (!facing) return;
		const i = o.y * this.level.w + o.x;
		const [fx, fy] = faceMiddle(this.level.cells[2 * i] === TILE.WALL ? this.walls[i] : null, facing);
		sprite.cx += sprite.hw * fx;
		sprite.cy += hh * fy;
		sprite.variant = facing;
	}

	/**
	 * A door between quarter walls stands in their line: a quarter tile back from the cell centre, toward -y in a wall
	 * along x and toward +x in a wall along y (walls.js). Doors between full blocks (forest, cave rock) stay centred.
	 */
	_alignDoor(o, sprite, hh) {
		const alongX = sprite.variant === 'x';
		const flanked = alongX
			? this._cellA(o.x - 1, o.y) === TILE.WALL || this._cellA(o.x + 1, o.y) === TILE.WALL
			: this._cellA(o.x, o.y - 1) === TILE.WALL || this._cellA(o.x, o.y + 1) === TILE.WALL;
		if (!flanked) return;
		sprite.cx += sprite.hw * (alongX ? -0.25 : 0.25);
		sprite.cy -= hh * 0.25;
	}

	/** door leaves follow their wall (walls left/right in x: the leaf spans the x axis); fountain 58 restores MP */
	_objectVariant(o, kind) {
		if (isDoorKind(kind)) return isWallTile(this._cellA(o.x - 1, o.y)) || isWallTile(this._cellA(o.x + 1, o.y)) ? 'x' : 'y';
		if (kind === 'fountain' && o.id === 58) return 'mp';
		return '';
	}

	_critter(ctx, c, cell, frame) {
		const kind = critterKind(c, this.info.bw(c.id));
		if (!this.layers.has(KINDS[kind].layer)) return;
		this._badge(ctx, kind, { cx: cell.cx, cy: cell.cy, hw: frame.hw, selected: this.selected === c, variant: kind === 'monster' ? String(c.id) : '' });
	}

	_actor(ctx, actor, { cx, cy }, hw) {
		if (hw < 7) {
			ctx.fillStyle = actor.hero ? '#4f9ef8' : (KINDS[actor.kind] || KINDS.monster).color;
			fillCircle(ctx, cx, cy, Math.max(2, hw * 0.6));
			return;
		}
		drawSprite(ctx, actor.kind, cx, cy, hw, { theme: this.theme, dpr: this.dpr, variant: actor.variant || '' });
	}

	/** moveTo / lineTo through points[from..to] in cell coordinates; a { jump } entry lifts the pen */
	_tracePath(ctx, points, { from, to }) {
		ctx.beginPath();
		let pen = false;
		for (let k = from; k <= to && k < points.length; k++) {
			const p = points[k];
			if (p.jump) { pen = false; continue; }
			const [x, y] = this.project(p.x, p.y);
			if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
			pen = true;
		}
	}

	_overlays(ctx, frame) {
		if (this.puzzle && this.layers.has('solutions')) this._puzzleSolution(ctx, frame);
		if (this.route && this.route.length > 1 && this.layers.has('route') && !this.solve.hideRoute) this._route(ctx, frame);
		this._linkArcs(ctx, frame);
		this._highlights(ctx, frame);
		this._solveOverlay(ctx, frame);
		if (this.hover) this._hoverOutline(ctx, frame);
	}

	/** the floor nonogram's answer: the cells to fill and the clue numbers */
	_puzzleSolution(ctx, { hw, hh }) {
		for (const [x, y, kind, text] of this.puzzle.cells) {
			const [cx, cy] = this.project(x, y);
			if (kind === 'fill') {
				ctx.fillStyle = 'rgba(206,71,255,0.55)';
				this._diamond(ctx, cx, cy, hw * 0.8, hh * 0.8); ctx.fill();
			} else if (kind === 'clue' && hw > 5) {
				ctx.fillStyle = '#f0e6ff';
				ctx.font = `bold ${Math.round(hh * 1.1)}px system-ui, sans-serif`;
				ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
				ctx.fillText(text, cx, cy);
			}
		}
	}

	/** the planner's route, with the selected leg on top, brighter and thicker */
	_route(ctx, { hw }) {
		ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		ctx.strokeStyle = 'rgba(79,158,248,0.9)';
		ctx.lineWidth = Math.max(2, hw * 0.18);
		this._tracePath(ctx, this.route, { from: 0, to: this.route.length - 1 });
		ctx.stroke();
		if (!this.routeLeg) return;
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = Math.max(3, hw * 0.26);
		this._tracePath(ctx, this.route, this.routeLeg);
		ctx.stroke();
	}

	/** dashed arcs between paired objects */
	_linkArcs(ctx, { hw, hh }) {
		for (const [p, q, color] of this.links) {
			const [x1, y1] = this.project(p.x, p.y);
			const [x2, y2] = this.project(q.x, q.y);
			const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - Math.hypot(x2 - x1, y2 - y1) * 0.25;
			ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, hw * 0.12);
			ctx.setLineDash([Math.max(4, hw * 0.4), Math.max(3, hw * 0.25)]);
			ctx.beginPath(); ctx.moveTo(x1, y1 - hh * 0.6); ctx.quadraticCurveTo(mx, my, x2, y2 - hh * 0.6); ctx.stroke();
			ctx.setLineDash([]);
		}
	}

	_highlights(ctx, { hw, hh }) {
		for (const { x, y, color } of this.highlights) {
			const [cx, cy] = this.project(x, y);
			ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, hw * 0.12);
			this._diamond(ctx, cx, cy, hw * 1.15, hh * 1.15); ctx.stroke();
		}
	}

	_hoverOutline(ctx, { hw, hh }) {
		const [cx, cy] = this.project(this.hover.x, this.hover.y);
		ctx.strokeStyle = this.theme === 'light' ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
		this._diamond(ctx, cx, cy, hw, hh); ctx.stroke();
	}

	/** the solver's overlay: trail, cell marks, HP bars, fight pins, callout (see setSolveOverlay) */
	_solveOverlay(ctx, frame) {
		const S = this.solve;
		if (S.trail && S.trail.length > 1 && this.layers.has('route')) this._solveTrail(ctx, frame);
		this._cellMarks(ctx, frame);
		if (S.actors && frame.hw >= 5) this._hpBars(ctx, frame);
		this._fightPins(ctx, frame);
		if (S.callout && S.callout.text) this._callout(ctx, frame);
	}

	/** the trail walked so far, solid; the rest of it faint and dashed underneath */
	_solveTrail(ctx, { hw }) {
		const { trail } = this.solve;
		const light = this.theme === 'light';
		const upto = this.solve.upto < 0 ? trail.length - 1 : this.solve.upto;
		const dash = Math.max(3, hw * 0.25);
		ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		ctx.strokeStyle = light ? 'rgba(200,110,0,0.45)' : 'rgba(255,190,80,0.45)';
		ctx.lineWidth = Math.max(1.5, hw * 0.1);
		ctx.setLineDash([dash, dash]);
		this._tracePath(ctx, trail, { from: upto, to: trail.length - 1 });
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.strokeStyle = light ? 'rgba(214,100,0,0.95)' : 'rgba(255,176,46,0.95)';
		ctx.lineWidth = Math.max(2.5, hw * 0.18);
		this._tracePath(ctx, trail, { from: 0, to: upto });
		ctx.stroke();
	}

	_cellMarks(ctx, { hw, hh }) {
		for (const mark of this.solve.marks || []) {
			const [cx, cy] = this.project(mark.x, mark.y);
			if (mark.fill) {
				ctx.fillStyle = mark.fill === true ? hexA(mark.color, 0.28) : mark.fill;
				this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
			}
			const size = mark.size || 1.08;
			ctx.strokeStyle = mark.color; ctx.lineWidth = Math.max(2, hw * 0.1);
			this._diamond(ctx, cx, cy, hw * size, hh * size); ctx.stroke();
		}
	}

	/** HP bars above creatures, with the numbers once there is room */
	_hpBars(ctx, { hw }) {
		const light = this.theme === 'light';
		for (const actor of this.solve.actors) {
			if (!actor.bar || !(actor.hpM > 0)) continue;
			const [cx, cy] = this.project(actor.x, actor.y);
			const lift = hw < 7 ? hw * 0.9 : hw * (BAR_LIFT[actor.kind] || 0.72);
			const w = Math.max(18, hw * 1.0), h = Math.max(4, Math.min(8, hw * 0.13));
			const x0 = cx - w / 2, y0 = cy - lift - h;
			const health = Math.max(0, Math.min(1, actor.hp / actor.hpM));
			ctx.fillStyle = light ? 'rgba(20,20,20,0.75)' : 'rgba(0,0,0,0.8)';
			ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
			ctx.fillStyle = actor.hero ? '#4f9ef8' : health > 0.5 ? '#3ec46d' : health > 0.25 ? '#f0b429' : '#e5484d';
			ctx.fillRect(x0, y0, w * health, h);
			if (hw >= 22) this._hpText(ctx, actor, { x: cx, y: y0 - 2, hw });
		}
	}

	_hpText(ctx, actor, { x, y, hw }) {
		const light = this.theme === 'light';
		const text = `${actor.hp}/${actor.hpM}`;
		ctx.font = `bold ${Math.round(Math.max(10, Math.min(13, hw * 0.3)))}px system-ui, sans-serif`;
		ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
		ctx.lineWidth = 3; ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
		ctx.strokeText(text, x, y);
		ctx.fillStyle = light ? '#111' : '#fff';
		ctx.fillText(text, x, y);
	}

	/** fight pins (fixed screen size): a light beam from each pin down to its cell, then the pins on top */
	_fightPins(ctx, frame) {
		const pins = this._pinPlacements(frame);
		for (const pin of pins) {
			if (pin.marker.off) continue;   // shares its cell with a pin that already has the beam
			this._pinTarget(ctx, pin, frame);
			this._pinBeam(ctx, pin, frame);
		}
		for (const pin of pins) this._pinHead(ctx, pin);
	}

	/** where each marker's pin goes on screen, for markers whose pin is on the canvas */
	_pinPlacements({ hw }) {
		const pins = [];
		for (const marker of this.solve.markers || []) {
			const [cx, cy] = this.project(marker.x, marker.y);
			const px = cx + (marker.off || 0);   // a second pin on the same cell (e.g. an MP top-up next to a fight)
			if (px < -20 || cy < -20 || px > this.cssW + 20 || cy > this.cssH + 20) continue;
			const r = marker.active ? 12 : 10;
			// above the creature's head (and its HP bar) once sprites are drawn, else just above the cell
			const py = hw >= 7 ? cy - hw * 1.3 - r - (hw >= 22 ? 20 : 8) : cy - Math.max(r + 2, hw * 0.5);
			const strength = (marker.active ? 1 : 0.75) * (this.theme === 'light' ? 1 : 1.3);   // dark floors need a brighter beam
			pins.push({ marker, cx, cy, px, py, r, strength });
		}
		return pins;
	}

	/** the cell a pin points at */
	_pinTarget(ctx, { marker, cx, cy, strength }, { hw, hh }) {
		ctx.fillStyle = hexA(marker.color, 0.24 * strength);
		this._diamond(ctx, cx, cy, hw * 0.92, hh * 0.92); ctx.fill();
		ctx.strokeStyle = hexA(marker.color, 0.9 * strength); ctx.lineWidth = marker.active ? 2.5 : 1.75;
		this._diamond(ctx, cx, cy, hw * 0.92, hh * 0.92); ctx.stroke();
	}

	/** a translucent column from under the pin to the floor, brightest at both ends */
	_pinBeam(ctx, { marker, cx, cy, py, r, strength }, { hw, hh }) {
		const top = py + r * 0.5, w = Math.max(r * 0.7, hw * 0.3), ry = w * hh / hw;
		if (!(cy - top > 2)) return;   // no room for a column
		const g = ctx.createLinearGradient(0, top, 0, cy);
		g.addColorStop(0, hexA(marker.color, 0.5 * strength));
		g.addColorStop(0.5, hexA(marker.color, 0.16 * strength));
		g.addColorStop(1, hexA(marker.color, 0.36 * strength));
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(cx, top, w, ry, 0, Math.PI, 0);   // the far half of the top cap
		ctx.lineTo(cx + w, cy);
		ctx.ellipse(cx, cy, w, ry, 0, 0, Math.PI);    // the near half of the floor ring
		ctx.closePath(); ctx.fill();
		// the column's top rim, so it reads as a cylinder
		ctx.strokeStyle = hexA(marker.color, 0.45 * strength); ctx.lineWidth = 1;
		ctx.beginPath(); ctx.ellipse(cx, top, w, ry, 0, 0, Math.PI * 2); ctx.stroke();
	}

	/** the pin: a circle, or a pill when the text is wider (e.g. "MP") */
	_pinHead(ctx, { marker, px, py, r }) {
		ctx.font = `bold ${marker.active ? 13 : 12}px system-ui, sans-serif`;
		const pw = Math.max(2 * r, ctx.measureText(marker.text).width + 8);
		if (pw > 2 * r) roundRect(ctx, px - pw / 2, py - r, pw, 2 * r, r);
		else { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); }
		ctx.fillStyle = marker.color; ctx.fill();
		ctx.lineWidth = marker.active ? 2.5 : 1.5; ctx.strokeStyle = this.theme === 'light' ? '#ffffff' : '#0b0b0d'; ctx.stroke();
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillStyle = '#ffffff';
		ctx.fillText(marker.text, px, py + 0.5);
	}

	/** a text label in a box below a cell (the script player's instruction) */
	_callout(ctx, { hh }) {
		const light = this.theme === 'light';
		const [cx, cy] = this.project(this.solve.callout.x, this.solve.callout.y);
		ctx.font = 'bold 13px system-ui, sans-serif';
		const pad = 6, bh = 22;
		// fit the canvas: cut the end with an ellipsis (the panel has the full instruction)
		const text = fitText(ctx, this.solve.callout.text, this.cssW - 8 - 2 * pad);
		const tw = ctx.measureText(text).width;
		const bx = Math.max(4, Math.min(this.cssW - tw - 2 * pad - 4, cx - tw / 2 - pad));
		// below the tile: above it sit the sprite, its HP bar and the fight pin
		const by = Math.min(this.cssH - bh - 4, Math.max(4, cy + hh + 8));
		ctx.fillStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(18,18,22,0.92)';
		ctx.strokeStyle = light ? 'rgba(214,100,0,0.95)' : 'rgba(255,176,46,0.95)';
		ctx.lineWidth = 1.5;
		roundRect(ctx, bx, by, tw + 2 * pad, bh, 5);
		ctx.fill(); ctx.stroke();
		ctx.fillStyle = light ? '#111' : '#fff';
		ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
		ctx.fillText(text, bx + pad, by + bh / 2 + 0.5);
	}

	// ---- input -----------------------------------------------------------------------------
	_bindInput() {
		const c = this.canvas;
		const gesture = { pointers: new Map(), drag: null, moved: false, pinch: null };
		c.addEventListener('pointerdown', (e) => this._pointerDown(gesture, e));
		c.addEventListener('pointermove', (e) => this._pointerMove(gesture, e));
		const up = (e) => this._pointerUp(gesture, e);
		c.addEventListener('pointerup', up);
		c.addEventListener('pointercancel', up);
		c.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); this.redraw(); });
		c.addEventListener('wheel', (e) => {
			e.preventDefault();
			const [x, y] = this._canvasPoint(e);
			this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
		}, { passive: false });
	}

	/** one pointer starts a drag (or a click), a second one turns it into a pinch */
	_pointerDown(gesture, e) {
		this.canvas.setPointerCapture(e.pointerId);
		const { pointers } = gesture;
		pointers.set(e.pointerId, this._canvasPoint(e));
		if (pointers.size === 1) { gesture.drag = { p: this._canvasPoint(e), ox: this.ox, oy: this.oy }; gesture.moved = false; }
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			gesture.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: this.scale };
			gesture.drag = null;
		}
	}

	_pointerMove(gesture, e) {
		const p = this._canvasPoint(e);
		if (gesture.pointers.has(e.pointerId)) gesture.pointers.set(e.pointerId, p);
		if (gesture.pinch && gesture.pointers.size === 2) { this._pinchZoom(gesture); return; }
		if (gesture.drag) { this._dragPan(gesture, p); return; }
		this._hoverAt(p);
	}

	_pinchZoom(gesture) {
		const [a, b] = [...gesture.pointers.values()];
		const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
		this.zoomAt((gesture.pinch.scale * d / gesture.pinch.d) / this.scale, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
		gesture.moved = true;
	}

	/** pan once the pointer has moved more than a few pixels (less is still a click) */
	_dragPan(gesture, p) {
		const { drag } = gesture;
		const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
		if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
		if (!gesture.moved) return;
		this.ox = drag.ox + dx; this.oy = drag.oy + dy; this.redraw();
	}

	_pointerUp(gesture, e) {
		const { pointers } = gesture;
		const wasClick = gesture.drag && !gesture.moved && pointers.size === 1;
		pointers.delete(e.pointerId);
		if (pointers.size < 2) gesture.pinch = null;
		if (wasClick) this._clickAt(this._canvasPoint(e));
		if (pointers.size === 0) gesture.drag = null;
	}

	/** an event's position on the canvas (CSS px) */
	_canvasPoint(e) {
		const r = this.canvas.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	}

	_cellAt(p) {
		if (!this.level) return null;
		// Prefer the object badge drawn above the tile: test the tile below the cursor first.
		for (const dy of [hhOffset(this.scale), 0]) {
			const t = this.unproject(p[0], p[1] + dy);
			if (t.x >= 0 && t.y >= 0 && t.x < this.level.w && t.y < this.level.h) {
				const i = t.y * this.level.w + t.x;
				if (dy === 0 || this.objAt.has(i) || this.critAt.has(i)) return t;
			}
		}
		return null;
	}

	_hoverAt(p) {
		const t = this._cellAt(p);
		const same = t && this.hover && t.x === this.hover.x && t.y === this.hover.y;
		if (same || (!t && !this.hover)) return;
		this.hover = t;
		this.onHover(t ? this.describe(t.x, t.y) : null);
		this.redraw();
	}

	_clickAt(p) {
		const t = this._cellAt(p);
		if (!t) return;
		const i = t.y * this.level.w + t.x;
		this.selected = this.critAt.get(i) || this.objAt.get(i) || null;
		this.onSelect(this.describe(t.x, t.y));
		this.redraw();
	}

	describe(x, y) {
		const i = y * this.level.w + x;
		return {
			x, y,
			a: this.level.cells[2 * i], b: this.level.cells[2 * i + 1],
			object: this.objAt.get(i) || null,
			critter: this.critAt.get(i) || null,
		};
	}
}

function hhOffset(scale) { return HH * scale * 0.6; }

function emptySolve() {
	return { markers: [], actors: null, actAt: null, replace: false, marks: [], callout: null, trail: null, upto: -1, hideRoute: false };
}

function paletteFor(theme, family) {
	return PALETTES[theme][family] || PALETTES[theme].Dungeon;
}

/** solver actors grouped by cell index (y * w + x), in their order */
function actorsByCell(actors, w) {
	const byCell = new Map();
	for (const actor of actors) {
		const i = actor.y * w + actor.x;
		if (!byCell.has(i)) byCell.set(i, []);
		byCell.get(i).push(actor);
	}
	return byCell;
}

const isWallTile = (t) => t === TILE.WALL || t === TILE.OUTWALL || t === TILE.PILLAR;
const isDoorKind = (kind) => KINDS[kind].layer === 'doors' && kind !== 'lever';
const isOuterWall = (t) => t === TILE.OUTWALL;
const isFullBlock = (t) => t === TILE.OUTWALL || t === TILE.EXIT;
const isWalkableTile = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.OUTDOOR;

// Quarter walls (IsoView._quarterWall). Points are offsets from the cell centre (cx, cy) on the floor; a quarter is
// half a tile wide (qw = hw / 2) and half a tile high (qh = hh / 2). The back quarter's corners are (0, -hh),
// (qw, -qh), (0, 0) and (-qw, -qh); the left quarter's left corner is (-hw, 0), the right quarter's right corner
// (hw, 0). Hot path: every fill is one small shape (canvases fill those fastest; one path of many shapes was slower),
// side faces that line up are drawn as one, and nothing is allocated.

/** the side faces that show: toward -x in the left colour, toward +y in the right colour */
function quarterFaces(ctx, { cx, cy }, { hw, hh, wh, wall }, m) {
	const left = m & WALL_LEFT, right = m & WALL_RIGHT;
	const qw = hw / 2, qh = hh / 2;
	// toward -x: the left quarter's side unless the wall at x - 1 hides it; the back quarter's where the left quarter
	// is open, in line with the right quarter's
	const leftSide = left && (m & OPEN_LEFT);
	if (leftSide || !left || right) ctx.fillStyle = wall.left;
	if (leftSide) wallFace(ctx, cx - hw, cy, cx - qw, cy + qh, wh);
	if (!left || right) wallFace(ctx, left ? cx : cx - qw, left ? cy : cy - qh, right ? cx + qw : cx, right ? cy + qh : cy, wh);
	// toward +y: the right quarter's side unless the wall at y + 1 hides it; the back quarter's where the right quarter
	// is open, in line with the left quarter's
	const rightSide = right && (m & OPEN_RIGHT);
	if (rightSide || !right || left) ctx.fillStyle = wall.right;
	if (rightSide) wallFace(ctx, cx + qw, cy + qh, cx + hw, cy, wh);
	if (!right || left) wallFace(ctx, left ? cx - qw : cx, left ? cy + qh : cy, right ? cx : cx + qw, right ? cy : cy - qh, wh);
}

/** the top: around the back quarter, out over the right and left quarters when they are wall */
function quarterTop(ctx, { cx, cy }, { hw, hh, wh, wall }, m) {
	const left = m & WALL_LEFT, right = m & WALL_RIGHT;
	const qw = hw / 2, qh = hh / 2, ty = cy - wh;
	ctx.fillStyle = wall.top;
	ctx.beginPath();
	ctx.moveTo(cx, ty - hh);
	if (right) { ctx.lineTo(cx + hw, ty); ctx.lineTo(cx + qw, ty + qh); } else ctx.lineTo(cx + qw, ty - qh);
	if (!left === !right) ctx.lineTo(cx, ty);   // with one side quarter the centre is on a straight edge
	if (left) { ctx.lineTo(cx - qw, ty + qh); ctx.lineTo(cx - hw, ty); } else ctx.lineTo(cx - qw, ty - qh);
	ctx.fill();
}

/** fills a vertical face `height` tall standing on the floor edge (x0, y0)-(x1, y1) */
function wallFace(ctx, x0, y0, x1, y1, height) {
	ctx.beginPath();
	ctx.moveTo(x0, y0 - height);
	ctx.lineTo(x1, y1 - height);
	ctx.lineTo(x1, y1);
	ctx.lineTo(x0, y0);
	ctx.fill();
}

/**
 * Where a sprite hanging on a wall stands: the bottom middle of the face it hangs on, in half tile sizes (x in hw, y
 * in hh) from the cell centre. facing 'x' is the face looking toward +y, 'y' the one toward -x. mask: the cell's
 * quarters (walls.js), or null for a full block. On a straight quarter wall that is the cell centre.
 */
function faceMiddle(mask, facing) {
	if (mask === null) return facing === 'x' ? [0.5, 0.5] : [-0.5, 0.5];
	if (facing === 'x') return mask & WALL_LEFT ? [0, 0] : mask & WALL_RIGHT ? [0.75, 0.25] : [0.25, -0.25];
	return mask & WALL_RIGHT ? [0, 0] : mask & WALL_LEFT ? [-0.75, 0.25] : [-0.25, -0.25];
}

/** fill colour of a walkable tile; pressure plates and nonogram floors stand out with the puzzles layer */
function groundColor(a, b, { pal, showPuzzles }) {
	if (showPuzzles && isPressurePlate(a, b)) return '#7d6a4a';
	switch (a) {
		case TILE.FLOOR: return floorColor(b & 31, pal, showPuzzles);
		case TILE.DOOR: case TILE.OUTDOOR: return '#9b7a4d';
		case TILE.BUSH: return '#4f7a32';
		case TILE.PATCH: return '#6f9a3c';
		default: return pal.room;
	}
}

/** by floor code (b & 31, as in catalog.js tileName) */
function floorColor(code, pal, showPuzzles) {
	if (code === 1) return pal.corridor;
	if (code === 2 || code === 11) return '#8a6a43';    // bridge
	if (code === 18 || code === 19) return '#8b6b40';   // boardwalk
	if (code === 12 && showPuzzles) return '#5d4a6e';   // nonogram floor
	return pal.room;
}

function plateRing(ctx, { cx, cy }, { hw, hh }) {
	ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(1, hw * 0.06);
	ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.45, hh * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
}

function trapCross(ctx, { cx, cy }, { hw, hh }) {
	ctx.strokeStyle = '#ff4747';
	ctx.lineWidth = Math.max(1.5, hw * 0.08);
	ctx.beginPath();
	ctx.moveTo(cx - hw * 0.4, cy - hh * 0.4); ctx.lineTo(cx + hw * 0.4, cy + hh * 0.4);
	ctx.moveTo(cx + hw * 0.4, cy - hh * 0.4); ctx.lineTo(cx - hw * 0.4, cy + hh * 0.4);
	ctx.stroke();
}

function fillCircle(ctx, x, y, r) {
	ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/** `text`, cut at the end with an ellipsis to fit `room` px in the current font */
function fitText(ctx, text, room) {
	if (ctx.measureText(text).width <= room) return text;
	while (text.length > 4 && ctx.measureText(text + '…').width > room) text = text.slice(0, -1);
	return text + '…';
}

// HP bar height above a creature's tile centre, in half tile widths (sprite sizes in sprites.js)
const BAR_LIFT = { hero: 1.05, boss: 1.0, miniboss: 0.85, unique: 0.85, goldmonster: 0.8, monster: 0.72, npc: 0.95, spider: 0.6 };

function hexA(hex, a) {
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function shade(hex, f) {
	const n = parseInt(hex.slice(1), 16);
	const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
	return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
