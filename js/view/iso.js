// Isometric dungeon renderer (canvas 2D), using the game's projection (c30.C0):
//   screen x = (x + y) * HW,  screen y = (y - x) * HH   — +x goes up-right, +y goes down-right.
import { KINDS, TILE, objectKind, critterKind, isHiddenTrap } from './catalog.js';
import { drawSprite } from './sprites.js';

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
		this.palette = PALETTES[this.theme][info.family] || PALETTES[this.theme].Dungeon;
		this.objAt = new Map();
		for (const o of level.objects) this.objAt.set(o.y * level.w + o.x, o);
		this.critAt = new Map();
		for (const c of level.critters) this.critAt.set(c.y * level.w + c.x, c);
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
		if (this.info) this.palette = PALETTES[this.theme][this.info.family] || PALETTES[this.theme].Dungeon;
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
		if ('actors' in o) {
			const m = new Map();
			if (this.level && o.actors) for (const a of o.actors) {
				const i = a.y * this.level.w + a.x;
				(m.get(i) || m.set(i, []).get(i)).push(a);
			}
			this.solve.actAt = m;
		}
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
		const { w, h, cells } = this.level;
		const s = this.scale;
		const hw = HW * s, hh = HH * s, wh = this.wallHeight * s;
		const pal = this.palette;
		const margin = hw * 2 + wh;
		const showDecor = this.layers.has('decor') && s > 0.35;
		const showTraps = this.layers.has('traps');
		const glyphs = true;

		// back to front: increasing (y - x)
		for (let d = -(w - 1); d <= h - 1; d++) {
			const x0 = Math.max(0, -d), x1 = Math.min(w - 1, h - 1 - d);
			for (let x = x0; x <= x1; x++) {
				const y = x + d;
				const [cx, cy] = this.project(x, y);
				if (cx < -margin || cx > this.cssW + margin || cy < -margin || cy > this.cssH + margin) continue;
				const i = y * w + x;
				const a = cells[2 * i], b = cells[2 * i + 1];
				this._tile(ctx, x, y, cx, cy, a, b, hw, hh, wh, pal, showTraps);
				const o = this.objAt.get(i);
				if (o && glyphs) this._object(ctx, o, cx, cy, hw, hh, showDecor);
				const c = this.critAt.get(i);
				if (c && glyphs && !(this.solve.replace && this.solve.actAt)) this._critter(ctx, c, cx, cy, hw, hh);
				const acts = this.solve.actAt && this.solve.actAt.get(i);
				if (acts) for (const a of acts) this._actor(ctx, a, cx, cy, hw);
			}
		}
		this._overlays(ctx, hw, hh);
	}

	_diamond(ctx, cx, cy, hw, hh) {
		ctx.beginPath();
		ctx.moveTo(cx, cy - hh);
		ctx.lineTo(cx + hw, cy);
		ctx.lineTo(cx, cy + hh);
		ctx.lineTo(cx - hw, cy);
		ctx.closePath();
	}

	_block(ctx, x, y, cx, cy, hw, hh, height, top, left, right, wallTest) {
		const w = this.level.w, h = this.level.h, cells = this.level.cells;
		const solid = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && wallTest(cells[2 * (yy * w + xx)]);
		const ty = cy - height;
		if (!solid(x - 1, y)) {          // face toward (x-1, y): lower-left edge
			ctx.fillStyle = left;
			ctx.beginPath();
			ctx.moveTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
			ctx.closePath(); ctx.fill();
		}
		if (!solid(x, y + 1)) {          // face toward (x, y+1): lower-right edge
			ctx.fillStyle = right;
			ctx.beginPath();
			ctx.moveTo(cx, ty + hh); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh);
			ctx.closePath(); ctx.fill();
		}
		ctx.fillStyle = top;
		this._diamond(ctx, cx, ty, hw, hh);
		ctx.fill();
	}

	_tile(ctx, x, y, cx, cy, a, b, hw, hh, wh, pal, showTraps) {
		const isWall = (t) => t === TILE.WALL || t === TILE.OUTWALL || t === TILE.PILLAR;
		switch (a) {
			case TILE.VOID:
				return;
			case TILE.WALL:
				this._block(ctx, x, y, cx, cy, hw, hh, wh, pal.wall, pal.wallL, pal.wallR, isWall);
				return;
			case TILE.OUTWALL:
				this._block(ctx, x, y, cx, cy, hw, hh, wh * 1.2, pal.out, shade(pal.out, -0.25), shade(pal.out, -0.4), isWall);
				return;
			case TILE.PILLAR:
				ctx.fillStyle = pal.room; this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
				this._block(ctx, x, y, cx, cy, hw * 0.45, hh * 0.45, wh * 1.3, pal.wall, pal.wallL, pal.wallR, () => false);
				return;
			case TILE.LIQUID:
				ctx.fillStyle = LIQUID[b & 15] || '#2f6fb3';
				this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
				return;
			case TILE.EXIT:
				this._block(ctx, x, y, cx, cy, hw, hh, wh, '#ffd84a', '#c9a227', '#a6841c', isWall);
				return;
			default: {
				let color = pal.room;
				if (a === TILE.FLOOR) {
					const f = b & 31;
					if (f === 1) color = pal.corridor;
					else if (f === 2 || f === 11) color = '#8a6a43';
					else if (f === 18 || f === 19) color = '#8b6b40';
					else if (f === 12 && this.layers.has('puzzles')) color = '#5d4a6e';
					if ((b & 63) === 44 && this.layers.has('puzzles')) color = '#7d6a4a';
				} else if (a === TILE.DOOR || a === TILE.OUTDOOR) {
					color = '#9b7a4d';
				} else if (a === TILE.BUSH) {
					color = '#4f7a32';
				} else if (a === TILE.PATCH) {
					color = '#6f9a3c';
				}
				ctx.fillStyle = color;
				this._diamond(ctx, cx, cy, hw, hh);
				ctx.fill();
				if (hw > 6) { ctx.strokeStyle = this.theme === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke(); }
				if (a === TILE.FLOOR && (b & 63) === 44 && this.layers.has('puzzles')) {
					ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(1, hw * 0.06);
					ctx.beginPath(); ctx.ellipse(cx, cy, hw * 0.45, hh * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
				}
				if (showTraps && isHiddenTrap(a, b)) this._cross(ctx, cx, cy, hw, hh, '#ff4747');
			}
		}
	}

	_cross(ctx, cx, cy, hw, hh, color) {
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(1.5, hw * 0.08);
		ctx.beginPath();
		ctx.moveTo(cx - hw * 0.4, cy - hh * 0.4); ctx.lineTo(cx + hw * 0.4, cy + hh * 0.4);
		ctx.moveTo(cx + hw * 0.4, cy - hh * 0.4); ctx.lineTo(cx - hw * 0.4, cy + hh * 0.4);
		ctx.stroke();
	}

	_badge(ctx, cx, cy, hw, kind, selected = false, variant = '') {
		const k = KINDS[kind];
		if (hw < 7) {   // zoomed out: plain dot
			ctx.fillStyle = selected ? (this.theme === 'light' ? '#111' : '#fff') : k.color;
			ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.6, hw * 0.55), 0, Math.PI * 2); ctx.fill();
			return;
		}
		drawSprite(ctx, kind, cx, cy, hw, { selected, theme: this.theme, dpr: this.dpr, variant });
	}

	_cellA(x, y) {
		const { w, h, cells } = this.level;
		return x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[2 * (y * w + x)];
	}

	_object(ctx, o, cx, cy, hw, hh, showDecor) {
		const kind = objectKind(o, this.info.rw(o.id));
		const layer = KINDS[kind].layer;
		if (!this.layers.has(layer)) return;
		if (layer === 'decor') {
			if (!showDecor) return;
			if (hw < 14) {
				ctx.fillStyle = KINDS[kind].color;
				ctx.beginPath(); ctx.arc(cx, cy - hh * 0.3, Math.max(1.5, hw * 0.12), 0, Math.PI * 2); ctx.fill();
				return;
			}
		}
		const isWall = (t) => t === TILE.WALL || t === TILE.OUTWALL || t === TILE.PILLAR;
		const walkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.OUTDOOR;
		let variant = '';
		const a = this._cellA(o.x, o.y);
		if (isWall(a)) {
			// wall-mounted objects (ladders etc.) sit on the wall face that looks into their room
			if (walkable(this._cellA(o.x, o.y + 1))) { cx += hw * 0.5; cy += hh * 0.5; variant = 'x'; }
			else if (walkable(this._cellA(o.x - 1, o.y))) { cx -= hw * 0.5; cy += hh * 0.5; variant = 'y'; }
		} else if (KINDS[kind].layer === 'doors' && kind !== 'lever') {
			// door leaves follow their wall: walls left/right in x -> the leaf spans the x axis
			variant = isWall(this._cellA(o.x - 1, o.y)) || isWall(this._cellA(o.x + 1, o.y)) ? 'x' : 'y';
		} else if (kind === 'fountain') {
			variant = o.id === 58 ? 'mp' : '';
		}
		this._badge(ctx, cx, cy, hw, kind, this.selected === o, variant);
	}

	_critter(ctx, c, cx, cy, hw, hh) {
		const kind = critterKind(c, this.info.bw(c.id));
		if (!this.layers.has(KINDS[kind].layer)) return;
		this._badge(ctx, cx, cy, hw, kind, this.selected === c, kind === 'monster' ? String(c.id) : '');
	}

	_actor(ctx, a, cx, cy, hw) {
		if (hw < 7) {
			ctx.fillStyle = a.hero ? '#4f9ef8' : (KINDS[a.kind] || KINDS.monster).color;
			ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, hw * 0.6), 0, Math.PI * 2); ctx.fill();
			return;
		}
		drawSprite(ctx, a.kind, cx, cy, hw, { theme: this.theme, dpr: this.dpr, variant: a.variant || '' });
	}

	/** the solver's overlay: trail, cell marks, HP bars, fight pins, callout (see setSolveOverlay) */
	_solveOverlay(ctx, hw, hh) {
		const S = this.solve;
		const light = this.theme === 'light';
		if (S.trail && S.trail.length > 1 && this.layers.has('route')) {
			ctx.lineJoin = 'round'; ctx.lineCap = 'round';
			const seg = (from, to, style, width, dash) => {
				ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash);
				ctx.beginPath();
				let pen = false;
				for (let k = Math.max(0, from); k <= to && k < S.trail.length; k++) {
					const p = S.trail[k];
					if (p.jump) { pen = false; continue; }
					const [x, y] = this.project(p.x, p.y);
					if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
					pen = true;
				}
				ctx.stroke();
				ctx.setLineDash([]);
			};
			const upto = S.upto < 0 ? S.trail.length - 1 : S.upto;
			seg(upto, S.trail.length - 1, light ? 'rgba(200,110,0,0.45)' : 'rgba(255,190,80,0.45)', Math.max(1.5, hw * 0.1), [Math.max(3, hw * 0.25), Math.max(3, hw * 0.25)]);
			seg(0, upto, light ? 'rgba(214,100,0,0.95)' : 'rgba(255,176,46,0.95)', Math.max(2.5, hw * 0.18), []);
		}
		for (const m of S.marks || []) {
			const [cx, cy] = this.project(m.x, m.y);
			if (m.fill) {
				ctx.fillStyle = m.fill === true ? hexA(m.color, 0.28) : m.fill;
				this._diamond(ctx, cx, cy, hw, hh); ctx.fill();
			}
			ctx.strokeStyle = m.color; ctx.lineWidth = Math.max(2, hw * 0.1);
			this._diamond(ctx, cx, cy, hw * (m.size || 1.08), hh * (m.size || 1.08)); ctx.stroke();
		}
		// HP bars above creatures
		if (S.actors && hw >= 5) {
			for (const a of S.actors) {
				if (!a.bar || !(a.hpM > 0)) continue;
				const [cx, cy] = this.project(a.x, a.y);
				const lift = hw < 7 ? hw * 0.9 : hw * (BAR_LIFT[a.kind] || 0.72);
				const w = Math.max(18, hw * 1.0), h = Math.max(4, Math.min(8, hw * 0.13));
				const x0 = cx - w / 2, y0 = cy - lift - h;
				const f = Math.max(0, Math.min(1, a.hp / a.hpM));
				ctx.fillStyle = light ? 'rgba(20,20,20,0.75)' : 'rgba(0,0,0,0.8)';
				ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
				ctx.fillStyle = a.hero ? '#4f9ef8' : f > 0.5 ? '#3ec46d' : f > 0.25 ? '#f0b429' : '#e5484d';
				ctx.fillRect(x0, y0, w * f, h);
				if (hw >= 22) {
					ctx.font = `bold ${Math.round(Math.max(10, Math.min(13, hw * 0.3)))}px system-ui, sans-serif`;
					ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
					const t = `${a.hp}/${a.hpM}`;
					ctx.lineWidth = 3; ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
					ctx.strokeText(t, cx, y0 - 2);
					ctx.fillStyle = light ? '#111' : '#fff';
					ctx.fillText(t, cx, y0 - 2);
				}
			}
		}
		// fight pins (fixed screen size): a light beam from each pin down to its cell, then the pins on top
		const pins = [];
		for (const m of S.markers || []) {
			const [cx, cy] = this.project(m.x, m.y);
			const px = cx + (m.off || 0);   // a second pin on the same cell (e.g. an MP top-up next to a fight)
			if (px < -20 || cy < -20 || px > this.cssW + 20 || cy > this.cssH + 20) continue;
			const r = m.active ? 12 : 10;
			// above the creature's head (and its HP bar) once sprites are drawn, else just above the cell
			const py = hw >= 7 ? cy - hw * 1.3 - r - (hw >= 22 ? 20 : 8) : cy - Math.max(r + 2, hw * 0.5);
			pins.push({ m, cx, cy, px, py, r });
		}
		for (const { m, cx, cy, py, r } of pins) {
			if (m.off) continue;   // shares its cell with a pin that already has the beam
			const strong = (m.active ? 1 : 0.75) * (light ? 1 : 1.3);   // dark floors need a brighter beam
			// the cell it points at
			ctx.fillStyle = hexA(m.color, 0.24 * strong);
			this._diamond(ctx, cx, cy, hw * 0.92, hh * 0.92); ctx.fill();
			ctx.strokeStyle = hexA(m.color, 0.9 * strong); ctx.lineWidth = m.active ? 2.5 : 1.75;
			this._diamond(ctx, cx, cy, hw * 0.92, hh * 0.92); ctx.stroke();
			// the beam: a translucent column from under the pin to the floor, brightest at both ends
			const top = py + r * 0.5, w = Math.max(r * 0.7, hw * 0.3), ry = w * hh / hw;
			if (cy - top > 2) {
				const g = ctx.createLinearGradient(0, top, 0, cy);
				g.addColorStop(0, hexA(m.color, 0.5 * strong));
				g.addColorStop(0.5, hexA(m.color, 0.16 * strong));
				g.addColorStop(1, hexA(m.color, 0.36 * strong));
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.ellipse(cx, top, w, ry, 0, Math.PI, 0);   // the far half of the top cap
				ctx.lineTo(cx + w, cy);
				ctx.ellipse(cx, cy, w, ry, 0, 0, Math.PI);    // the near half of the floor ring
				ctx.closePath(); ctx.fill();
				// the column's top rim, so it reads as a cylinder
				ctx.strokeStyle = hexA(m.color, 0.45 * strong); ctx.lineWidth = 1;
				ctx.beginPath(); ctx.ellipse(cx, top, w, ry, 0, 0, Math.PI * 2); ctx.stroke();
			}
		}
		for (const { m, px, py, r } of pins) {
			// a circle, or a pill when the text is wider (e.g. "MP")
			ctx.font = `bold ${m.active ? 13 : 12}px system-ui, sans-serif`;
			const pw = Math.max(2 * r, ctx.measureText(m.text).width + 8);
			if (pw > 2 * r) roundRect(ctx, px - pw / 2, py - r, pw, 2 * r, r);
			else { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); }
			ctx.fillStyle = m.color; ctx.fill();
			ctx.lineWidth = m.active ? 2.5 : 1.5; ctx.strokeStyle = light ? '#ffffff' : '#0b0b0d'; ctx.stroke();
			ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.fillStyle = '#ffffff';
			ctx.fillText(m.text, px, py + 0.5);
		}
		if (S.callout && S.callout.text) {
			const { x, y } = S.callout;
			let text = S.callout.text;
			const [cx, cy] = this.project(x, y);
			ctx.font = 'bold 13px system-ui, sans-serif';
			const pad = 6, bh = 22;
			// fit the canvas: cut the end with an ellipsis (the panel has the full instruction)
			const room = this.cssW - 8 - 2 * pad;
			if (ctx.measureText(text).width > room) {
				while (text.length > 4 && ctx.measureText(text + '…').width > room) text = text.slice(0, -1);
				text += '…';
			}
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
	}

	_overlays(ctx, hw, hh) {
		// puzzle solution cells
		if (this.puzzle && this.layers.has('solutions')) {
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
		// route
		if (this.route && this.route.length > 1 && this.layers.has('route') && !this.solve.hideRoute) {
			ctx.lineJoin = 'round'; ctx.lineCap = 'round';
			ctx.strokeStyle = 'rgba(79,158,248,0.9)';
			ctx.lineWidth = Math.max(2, hw * 0.18);
			ctx.beginPath();
			let pen = false;
			for (const p of this.route) {
				if (p.jump) { pen = false; continue; }
				const [x, y] = this.project(p.x, p.y);
				if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
				pen = true;
			}
			ctx.stroke();
			if (this.routeLeg) {
				// highlighted leg on top, brighter and thicker
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = Math.max(3, hw * 0.26);
				ctx.beginPath();
				let p2 = false;
				for (let k = this.routeLeg.from; k <= this.routeLeg.to && k < this.route.length; k++) {
					const p = this.route[k];
					if (p.jump) { p2 = false; continue; }
					const [x, y] = this.project(p.x, p.y);
					if (p2) ctx.lineTo(x, y); else ctx.moveTo(x, y);
					p2 = true;
				}
				ctx.stroke();
			}
		}
		// links between paired objects
		for (const [p, q, color] of this.links) {
			const [x1, y1] = this.project(p.x, p.y);
			const [x2, y2] = this.project(q.x, q.y);
			const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - Math.hypot(x2 - x1, y2 - y1) * 0.25;
			ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, hw * 0.12);
			ctx.setLineDash([Math.max(4, hw * 0.4), Math.max(3, hw * 0.25)]);
			ctx.beginPath(); ctx.moveTo(x1, y1 - hh * 0.6); ctx.quadraticCurveTo(mx, my, x2, y2 - hh * 0.6); ctx.stroke();
			ctx.setLineDash([]);
		}
		for (const { x, y, color } of this.highlights) {
			const [cx, cy] = this.project(x, y);
			ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, hw * 0.12);
			this._diamond(ctx, cx, cy, hw * 1.15, hh * 1.15); ctx.stroke();
		}
		this._solveOverlay(ctx, hw, hh);
		if (this.hover) {
			const [cx, cy] = this.project(this.hover.x, this.hover.y);
			ctx.strokeStyle = this.theme === 'light' ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
			this._diamond(ctx, cx, cy, hw, hh); ctx.stroke();
		}
	}

	// ---- input -----------------------------------------------------------------------------
	_bindInput() {
		const c = this.canvas;
		const pts = new Map();
		let drag = null, moved = false, pinch = null;
		const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

		c.addEventListener('pointerdown', (e) => {
			c.setPointerCapture(e.pointerId);
			pts.set(e.pointerId, pos(e));
			if (pts.size === 1) { drag = { p: pos(e), ox: this.ox, oy: this.oy }; moved = false; }
			if (pts.size === 2) {
				const [a, b] = [...pts.values()];
				pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: this.scale };
				drag = null;
			}
		});
		c.addEventListener('pointermove', (e) => {
			const p = pos(e);
			if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
			if (pinch && pts.size === 2) {
				const [a, b] = [...pts.values()];
				const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
				this.zoomAt((pinch.scale * d / pinch.d) / this.scale, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
				moved = true;
				return;
			}
			if (drag) {
				const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
				if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
				if (moved) { this.ox = drag.ox + dx; this.oy = drag.oy + dy; this.redraw(); }
				return;
			}
			this._hoverAt(p);
		});
		const up = (e) => {
			const wasClick = drag && !moved && pts.size === 1;
			pts.delete(e.pointerId);
			if (pts.size < 2) pinch = null;
			if (wasClick) this._clickAt(pos(e));
			if (pts.size === 0) drag = null;
		};
		c.addEventListener('pointerup', up);
		c.addEventListener('pointercancel', up);
		c.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); this.redraw(); });
		c.addEventListener('wheel', (e) => {
			e.preventDefault();
			const [x, y] = pos(e);
			this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
		}, { passive: false });
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
