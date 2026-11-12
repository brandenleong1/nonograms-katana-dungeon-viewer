// Vector sprites for the isometric map (our own drawings; no game art).
//
// Style: light from the upper left, three-tone shading (lit / base / shade) with soft gradients, outlines in a
// darker tone of each colour (never black), soft contact shadows, glossy highlights. Geometry is true isometric:
// boxes and door leaves follow the tile axes, ladders lie in the wall plane, hatches and traps in the floor plane.
//
// Units: u = half tile width / 32 (device px). Tile coords project as  sx = (X + Y)·32u,  sy = (Y − X)·16u.
// Sprites are rendered once per (kind, variant, size bucket, theme) at device-pixel resolution and blitted.

const cache = new Map();
const CACHE_MAX = 600;

/**
 * Draw sprite `kind` standing on the tile centred at (cx, cy) (CSS px). hw = half tile width (CSS px).
 * opts: { selected, theme: 'dark'|'light', dpr, variant: string (door axis 'x'/'y', species, …) }
 */
export function drawSprite(ctx, kind, cx, cy, hw, { selected = false, theme = 'dark', dpr = 1, variant = '' } = {}) {
	const px = sizeBucket(hw * dpr);
	const spr = cachedSprite({ kind, variant, px, theme });
	const k = hw / px;   // device-px sprite -> CSS px
	if (selected) ring(ctx, cx, cy, hw, theme);
	ctx.drawImage(spr.canvas, cx - spr.ax * k, cy - spr.ay * k, spr.canvas.width * k, spr.canvas.height * k);
}

export const hasSprite = (kind) => kind in PAINTERS;

/** sprites are drawn at quarter-octave sizes from 8 to 256 device px, so zooming reuses cached renders */
function sizeBucket(devicePx) {
	return Math.min(256, Math.max(8, Math.round(2 ** (Math.round(Math.log2(devicePx) * 4) / 4))));
}

/** the rendered sprite for { kind, variant, px, theme }; the oldest render is dropped once the cache is full */
function cachedSprite(spec) {
	const key = `${spec.kind}|${spec.variant}|${spec.px}|${spec.theme}`;
	let spr = cache.get(key);
	if (spr) return spr;
	spr = paintSprite(spec);
	if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
	cache.set(key, spr);
	return spr;
}

function ring(ctx, cx, cy, hw, theme) {
	ctx.save();
	const col = theme === 'light' ? 'rgba(20,90,200,0.9)' : 'rgba(150,215,255,0.95)';
	ctx.shadowColor = col;
	ctx.shadowBlur = Math.max(4, hw * 0.25);
	ctx.strokeStyle = col;
	ctx.lineWidth = Math.max(1.5, hw * 0.06);
	ctx.beginPath();
	ctx.ellipse(cx, cy, hw * 0.7, hw * 0.35, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
}

/** paint a sprite at `px` device px per half tile width onto its own canvas; ax, ay: the tile centre in it */
function paintSprite({ kind, variant, px, theme }) {
	const u = px / 32;
	const w = Math.ceil(px * 2.3), h = Math.ceil(px * 2.9);
	const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
	const g = canvas.getContext('2d');
	const ax = w / 2, ay = h - px * 0.62;   // tile centre inside the sprite canvas
	g.translate(ax, ay);
	g.lineJoin = 'round';
	g.lineCap = 'round';
	const env = { u, theme, variant, lw: Math.max(0.8, 0.9 * u), shadowA: theme === 'light' ? 0.22 : 0.38 };
	(PAINTERS[kind] || PAINTERS.decor)(g, env);
	return { canvas, ax, ay };
}

// ---- colour helpers ---------------------------------------------------------------------------------
function hex2rgb(hex) {
	const n = parseInt(hex.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
}
function rgbStr([r, g, b], a = 1) {
	return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
/** t > 0 lightens toward white, t < 0 darkens toward black. */
function shade(hex, t, a = 1) {
	const c = hex2rgb(hex);
	const to = t >= 0 ? [255, 255, 255] : [0, 0, 0];
	const k = Math.abs(t);
	return rgbStr([c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k], a);
}
function hslHex(h, s, l) {
	s /= 100; l /= 100;
	const f = (n) => {
		const k = (n + h / 30) % 12;
		const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255).toString(16).padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}
const ink = (hex) => shade(hex, -0.55);

// ---- geometry helpers -------------------------------------------------------------------------------
/** Tile-plane point (X, Y in tiles) at elevation z (in u). */
function P(u, X, Y, z = 0) {
	return [(X + Y) * 32 * u, (Y - X) * 16 * u - z * u];
}

function path(g, pts) {
	g.beginPath();
	g.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
	g.closePath();
}

function vgrad(g, y0, y1, c0, c1) {
	const gr = g.createLinearGradient(0, y0, 0, y1);
	gr.addColorStop(0, c0);
	gr.addColorStop(1, c1);
	return gr;
}

function hgrad(g, x0, x1, stops) {
	const gr = g.createLinearGradient(x0, 0, x1, 0);
	for (const [t, c] of stops) gr.addColorStop(t, c);
	return gr;
}

/** Soft elliptical contact shadow. */
function shadow(g, e, rx = 15, ry = 7.5, dy = 1) {
	const { u } = e;
	g.save();
	g.translate(0, dy * u);
	g.scale(1, ry / rx);
	const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * u);
	gr.addColorStop(0, `rgba(0,0,0,${e.shadowA})`);
	gr.addColorStop(0.65, `rgba(0,0,0,${e.shadowA * 0.55})`);
	gr.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = gr;
	g.beginPath(); g.arc(0, 0, rx * u, 0, Math.PI * 2); g.fill();
	g.restore();
}

/**
 * Isometric box centred at (x, y) tiles, half-extents ex, ey (tiles), height (u), base elevation z0 (u).
 * Faces: left (−X side) lit, right (+Y side) shaded, top brightest; slight darkening toward the base.
 * Optional: top (top face colour), ink (outline colour), line: false (no outlines).
 */
function box(g, e, { x = 0, y = 0, ex, ey, height, color, z0 = 0, ...opt }) {
	const { u, lw } = e;
	const b = (X, Y, z) => P(u, x + X, y + Y, z0 + z);
	const top = opt.top || shade(color, 0.22);
	const L = [b(-ex, -ey, 0), b(-ex, ey, 0), b(-ex, ey, height), b(-ex, -ey, height)];
	const R = [b(-ex, ey, 0), b(ex, ey, 0), b(ex, ey, height), b(-ex, ey, height)];
	const T = [b(-ex, -ey, height), b(-ex, ey, height), b(ex, ey, height), b(ex, -ey, height)];
	const yTop = Math.min(...T.map((p) => p[1])), yBot = Math.max(...L.concat(R).map((p) => p[1]));
	path(g, L); g.fillStyle = vgrad(g, yTop, yBot, shade(color, 0.04), shade(color, -0.12)); g.fill();
	path(g, R); g.fillStyle = vgrad(g, yTop, yBot, shade(color, -0.22), shade(color, -0.36)); g.fill();
	path(g, T); g.fillStyle = top; g.fill();
	if (opt.line !== false) {
		g.strokeStyle = opt.ink || ink(color); g.lineWidth = lw;
		path(g, [L[0], L[1], R[1], R[2], T[3], T[0]]); g.stroke();     // silhouette
		g.strokeStyle = shade(color, 0.35, 0.7); g.lineWidth = lw * 0.8;   // lit top edges
		g.beginPath(); g.moveTo(...T[0]); g.lineTo(...T[1]); g.lineTo(...T[2]); g.stroke();
		g.strokeStyle = shade(color, -0.4, 0.6);
		g.beginPath(); g.moveTo(...L[1]); g.lineTo(...L[2]); g.stroke();  // front vertical edge
	}
	return { L, R, T };
}

/**
 * Run `fn` with the context mapped onto a vertical face { axis, half, ox, oy }: local s in [-1, 1] along `axis`
 * ('x' or 'y') spanning `half` tiles, t up in u. Origin at the face centre bottom (ox, oy) in px. Paths are built in
 * face space; stroke after restore so line widths stay isotropic.
 */
function onFace(g, e, { axis, half, ox, oy }, fn) {
	const { u } = e;
	const a = 32 * u * half, b = (axis === 'x' ? -16 : 16) * u * half;
	g.save();
	g.transform(a, b, 0, -u, ox, oy);
	fn();
	g.restore();
}

/** Same for the floor plane: local (X, Y) in tiles. */
function onFloor(g, e, fn) {
	const { u } = e;
	g.save();
	g.transform(32 * u, -16 * u, 32 * u, 16 * u, 0, 0);
	fn();
	g.restore();
}

function gloss(g, x, y, rx, ry, a = 0.55) {
	g.fillStyle = `rgba(255,255,255,${a})`;
	g.beginPath(); g.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2); g.fill();
}

function eye(g, e, { x, y, r, iris, sclera }) {
	const { u, lw } = e;
	g.fillStyle = sclera; g.beginPath(); g.ellipse(x, y, r * u, r * 1.15 * u, 0, 0, Math.PI * 2); g.fill();
	g.strokeStyle = 'rgba(40,25,20,0.55)'; g.lineWidth = lw * 0.6; g.stroke();
	g.fillStyle = iris; g.beginPath(); g.arc(x + r * 0.25 * u, y + r * 0.15 * u, r * 0.55 * u, 0, Math.PI * 2); g.fill();
	g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(x + r * 0.05 * u, y - r * 0.25 * u, r * 0.22 * u, 0, Math.PI * 2); g.fill();
}

// ---- door helpers -----------------------------------------------------------------------------------
const WOOD = '#8a5a32', WOOD_D = '#6b4325', STONE = '#8e8a94', IRON = '#5d6470';

/** Door in a doorway. axis = wall direction ('x' or 'y'). Returns face mapping for details. */
function doorBase(g, e, axis, leaf, { arch = STONE, height = 30 } = {}) {
	const { u } = e;
	const doorway = { axis, arch, height };
	shadow(g, e, 18, 8);
	const far = farSide(axis);
	doorPost(g, e, doorway, far);
	// leaf (slightly inset)
	const lex = axis === 'x' ? 0.36 : 0.045, ley = axis === 'x' ? 0.045 : 0.36;
	box(g, e, { ex: lex, ey: ley, height: height - 4, color: leaf });
	doorPost(g, e, doorway, -far);
	lintel(g, e, doorway);
	// visible broad face of the leaf
	const [ox, oy] = axis === 'x' ? P(u, 0, ley) : P(u, -lex, 0);
	return { axis, half: 0.36, ox, oy, h: height - 4 };
}

/** which end of a doorway along `axis` is drawn first: +X is up-right (far); +Y is down-right (near) */
const farSide = (axis) => (axis === 'x' ? 1 : -1);

/** one post of a doorway { axis, arch, height }, at end `side` (1 or -1) */
function doorPost(g, e, { axis, arch, height }, side) {
	if (axis === 'x') box(g, e, { x: side * 0.42, ex: 0.07, ey: 0.11, height, color: arch });
	else box(g, e, { y: side * 0.42, ex: 0.11, ey: 0.07, height, color: arch });
}

function lintel(g, e, { axis, arch, height }) {
	if (axis === 'x') box(g, e, { ex: 0.49, ey: 0.12, height: 5, color: arch, z0: height });
	else box(g, e, { ex: 0.12, ey: 0.49, height: 5, color: arch, z0: height });
}

function faceStroke(g, e, f, color, width, draw) {
	onFace(g, e, f, () => { g.beginPath(); draw(); });
	g.strokeStyle = color; g.lineWidth = width; g.stroke();
}

function planks(g, e, f, color) {
	faceStroke(g, e, f, color, e.lw * 0.9, () => {
		for (const s of [-0.5, 0, 0.5]) { g.moveTo(s, 1.5); g.lineTo(s, f.h - 1.5); }
	});
}

// ---- page helpers -----------------------------------------------------------------------------------
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** pedestal, post and the slanted book rest (top tilted toward the viewer); returns the rest's corners */
function lectern(g, e) {
	const { u, lw } = e;
	box(g, e, { ex: 0.16, ey: 0.16, height: 3, color: '#6f6a76' });
	box(g, e, { ex: 0.07, ey: 0.07, height: 13, color: '#7a5236', z0: 3 });
	const rest = { tl: P(u, -0.26, -0.18, 22), tr: P(u, 0.26, -0.18, 22), br: P(u, 0.26, 0.2, 16), bl: P(u, -0.26, 0.2, 16) };
	path(g, [rest.tl, rest.tr, rest.br, rest.bl]); g.fillStyle = '#6b4427'; g.fill(); g.strokeStyle = ink('#6b4427'); g.lineWidth = lw; g.stroke();
	return rest;
}

/** the open book on the rest: returns its two pages (corner quads) and the spine (top, bottom) */
function openBook(g, e, { tl, tr, br, bl }) {
	const { u, lw } = e;
	const m0 = lerp(tl, tr, 0.5), m1 = lerp(bl, br, 0.5);
	const left = [lerp(tl, m0, 0.08), m0, m1, lerp(bl, m1, 0.08)], right = [m0, lerp(tr, m0, 0.08), lerp(br, m1, 0.08), m1];
	const lift = (pts, d) => pts.map(([x, y], i) => [x, y - (i === 1 || i === 2 ? 0 : d) * u]);   // corners 0 and 3 up by d
	path(g, lift(left, 1.2)); g.fillStyle = vgrad(g, tl[1], bl[1], '#fbf3dc', '#e6d8b5'); g.fill(); g.strokeStyle = '#b39d74'; g.lineWidth = lw * 0.7; g.stroke();
	path(g, lift(right, 1.2)); g.fillStyle = vgrad(g, tr[1], br[1], '#f2e7cb', '#d9c9a2'); g.fill(); g.stroke();
	return { left, right, spine: [m0, m1] };
}

/** lines of writing across both pages */
function bookLines(g, e, { left, right }) {
	const { u, lw } = e;
	g.strokeStyle = 'rgba(110,90,60,0.55)'; g.lineWidth = lw * 0.6;
	for (const t of [0.3, 0.45, 0.6, 0.75]) {
		for (const [p, q, r, s] of [[left[0], left[1], left[3], left[2]], [right[0], right[1], right[3], right[2]]]) {
			const a = lerp(lerp(p, r, t), lerp(q, s, t), 0.15), b = lerp(lerp(p, r, t), lerp(q, s, t), 0.85);
			g.beginPath(); g.moveTo(a[0], a[1] - 0.6 * u); g.lineTo(b[0], b[1] - 0.6 * u); g.stroke();
		}
	}
}

// ---- painters ---------------------------------------------------------------------------------------
const PAINTERS = {
	chest(g, e) {
		const { u, lw } = e;
		shadow(g, e, 17, 8.5);
		box(g, e, { ex: 0.3, ey: 0.2, height: 10, color: WOOD });
		// rounded lid: a lighter box plus a curved highlight
		const { T } = box(g, e, { ex: 0.31, ey: 0.21, height: 5, color: '#9b6a3c', z0: 10 });
		g.strokeStyle = 'rgba(255,230,190,0.45)'; g.lineWidth = lw;
		g.beginPath(); g.moveTo(...T[0]); g.lineTo(...T[3]); g.stroke();
		// metal bands on the front (+Y) face and the side (−X) face
		const band = '#c9a24a';
		for (const s of [-0.18, 0.18]) {
			const a = P(u, s, 0.21, 0), b = P(u, s, 0.21, 15);
			g.strokeStyle = shade(band, -0.35); g.lineWidth = lw * 2.6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
			g.strokeStyle = band; g.lineWidth = lw * 1.6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
		}
		const a = P(u, -0.31, 0, 0), b = P(u, -0.31, 0, 15);
		g.strokeStyle = band; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
		// lock plate
		const [lx, ly] = P(u, 0, 0.21, 10);
		g.fillStyle = '#e8c35a'; g.strokeStyle = shade('#e8c35a', -0.5); g.lineWidth = lw;
		g.beginPath(); g.roundRect(lx - 3 * u, ly - 3.5 * u, 6 * u, 6.5 * u, 1.2 * u); g.fill(); g.stroke();
		g.fillStyle = '#3a2a14'; g.beginPath(); g.arc(lx, ly - 0.8 * u, 1 * u, 0, Math.PI * 2); g.fill();
		g.fillRect(lx - 0.45 * u, ly - 0.5 * u, 0.9 * u, 2.2 * u);
		gloss(g, lx - 1.2 * u, ly - 2.2 * u, 1 * u, 0.6 * u, 0.7);
	},
	page(g, e) {
		const { u, lw } = e;
		shadow(g, e, 13, 6.5);
		const rest = lectern(g, e);
		const book = openBook(g, e, rest);
		bookLines(g, e, book);
		const [top, bottom] = book.spine;
		// ribbon
		g.strokeStyle = '#c0392b'; g.lineWidth = lw * 1.3;
		g.beginPath(); g.moveTo(...bottom); g.lineTo(bottom[0] + 1 * u, bottom[1] + 5 * u); g.stroke();
		// faint golden aura (an objective)
		glowDisc(g, { x: top[0], y: top[1], r: 16 * u, inner: 'rgba(255,220,120,0.35)', outer: 'rgba(255,220,120,0)' });
	},
	container(g, e) {
		const { u, lw } = e;
		shadow(g, e, 13, 6.5);
		const c = '#a57a48';
		box(g, e, { ex: 0.2, ey: 0.2, height: 13, color: c });
		// cross braces on both visible faces
		g.strokeStyle = shade(c, -0.4); g.lineWidth = lw * 1.5;
		const fx = (s, z) => P(u, s, 0.2, z), fy = (s, z) => P(u, -0.2, s, z);
		for (const f of [fx, fy]) {
			g.beginPath(); g.moveTo(...f(-0.2, 1)); g.lineTo(...f(0.2, 12)); g.moveTo(...f(0.2, 1)); g.lineTo(...f(-0.2, 12)); g.stroke();
		}
	},
	breakable(g, e) {
		const { u, lw } = e;
		shadow(g, e, 9, 4.5);
		const c = '#b8754a';
		g.beginPath();
		g.moveTo(-3 * u, 0);
		g.bezierCurveTo(-10 * u, -3 * u, -9 * u, -13 * u, -3.2 * u, -16 * u);
		g.lineTo(-3.2 * u, -19 * u); g.lineTo(3.2 * u, -19 * u); g.lineTo(3.2 * u, -16 * u);
		g.bezierCurveTo(9 * u, -13 * u, 10 * u, -3 * u, 3 * u, 0);
		g.closePath();
		g.fillStyle = hgrad(g, -9 * u, 9 * u, [[0, shade(c, 0.15)], [0.35, c], [1, shade(c, -0.4)]]); g.fill();
		g.strokeStyle = ink(c); g.lineWidth = lw; g.stroke();
		g.fillStyle = shade(c, -0.3); g.beginPath(); g.ellipse(0, -19 * u, 3.4 * u, 1.2 * u, 0, 0, Math.PI * 2); g.fill();
		g.strokeStyle = shade(c, 0.3, 0.8); g.lineWidth = lw; g.beginPath(); g.ellipse(0, -9 * u, 7.6 * u, 2 * u, 0, 0.2, Math.PI - 0.2); g.stroke();
		gloss(g, -4.5 * u, -10 * u, 1.3 * u, 3 * u, 0.35);
	},
	ore(g, e) {
		const { u, lw } = e;
		shadow(g, e, 13, 6.5);
		const crystal = (x, h, w, c) => {
			const tip = [x * u, -h * u], l = [(x - w) * u, -h * 0.25 * u], r = [(x + w) * u, -h * 0.25 * u], b = [x * u, 1 * u];
			path(g, [tip, l, b]); g.fillStyle = shade(c, 0.25); g.fill();
			path(g, [tip, b, r]); g.fillStyle = shade(c, -0.2); g.fill();
			path(g, [tip, l, b, r]); g.strokeStyle = shade(c, -0.5); g.lineWidth = lw * 0.8; g.stroke();
			g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(...tip); g.lineTo(x * u, -h * 0.3 * u); g.stroke();
		};
		crystal(-6, 11, 3.5, '#7fb2f0');
		crystal(5, 13, 3.5, '#6aa0e6');
		crystal(-0.5, 19, 4.5, '#a8cdfa');
		g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-1.5 * u, -15 * u, 0.9 * u, 0, Math.PI * 2); g.fill();
	},

	// ---- doors (variant = wall axis) ------------------------------------------------------------------
	mpdoor(g, e) {
		const f = doorBase(g, e, e.variant || 'x', '#3f5f9e');
		faceStroke(g, e, f, 'rgba(140,200,255,0.95)', e.lw * 1.6, () => {
			g.moveTo(0, 5); g.lineTo(0, f.h - 5); g.moveTo(-0.45, 10); g.lineTo(0.45, f.h - 9); g.moveTo(0.45, 10); g.lineTo(-0.45, f.h - 9);
		});
		glow(g, e, f, 'rgba(120,190,255,0.45)');
	},
	stuckdoor(g, e) {
		const f = doorBase(g, e, e.variant || 'x', WOOD);
		planks(g, e, f, shade(WOOD, -0.35));
		faceStroke(g, e, f, '#c39561', e.lw * 2.6, () => { g.moveTo(-0.8, 6); g.lineTo(0.8, f.h - 6); g.moveTo(0.8, 6); g.lineTo(-0.8, f.h - 6); });
		faceStroke(g, e, f, shade('#c39561', -0.45), e.lw * 0.6, () => { g.moveTo(-0.8, 6); g.lineTo(0.8, f.h - 6); });
	},
	lockdoor(g, e) {
		const f = doorBase(g, e, e.variant || 'x', WOOD);
		planks(g, e, f, shade(WOOD, -0.35));
		faceStroke(g, e, f, IRON, e.lw * 2.2, () => { g.moveTo(-0.9, 7); g.lineTo(0.9, 7); g.moveTo(-0.9, f.h - 7); g.lineTo(0.9, f.h - 7); });
		// padlock on the face centre
		const { u, lw } = e;
		const cx = f.ox, cy = f.oy - f.h * 0.45 * u;
		g.strokeStyle = '#d9b44a'; g.lineWidth = lw * 1.8; g.beginPath(); g.arc(cx, cy - 2.5 * u, 2.6 * u, Math.PI, 0); g.stroke();
		g.fillStyle = vgrad(g, cy - 2.5 * u, cy + 4 * u, '#f3d26b', '#b8902c'); g.strokeStyle = shade('#d9b44a', -0.5); g.lineWidth = lw;
		g.beginPath(); g.roundRect(cx - 3.5 * u, cy - 2.5 * u, 7 * u, 6 * u, 1.2 * u); g.fill(); g.stroke();
		g.fillStyle = '#3a2a14'; g.beginPath(); g.arc(cx, cy, 0.9 * u, 0, Math.PI * 2); g.fill();
	},
	gate(g, e) {
		const { u, lw } = e;
		const doorway = { axis: e.variant || 'x', arch: STONE, height: 30 };
		shadow(g, e, 18, 8);
		const far = farSide(doorway.axis);
		doorPost(g, e, doorway, far);
		const [ox, oy] = P(u, 0, 0);
		const f = { axis: doorway.axis, half: 0.36, ox, oy, h: 26 };
		const bars = () => {
			for (const s of [-0.75, -0.25, 0.25, 0.75]) { g.moveTo(s, 0); g.lineTo(s, 26); }
			g.moveTo(-1, 9); g.lineTo(1, 9); g.moveTo(-1, 20); g.lineTo(1, 20);
		};
		faceStroke(g, e, f, shade(IRON, -0.45), lw * 3.2, bars);
		faceStroke(g, e, f, '#aab3c2', lw * 1.6, bars);
		doorPost(g, e, doorway, -far);
		lintel(g, e, doorway);
	},
	puzzledoor(g, e) {
		const f = doorBase(g, e, e.variant || 'x', '#5d3c80');
		faceStroke(g, e, f, 'rgba(225,180,255,0.95)', e.lw * 1.2, () => {
			for (const s of [-0.5, 0, 0.5]) { g.moveTo(s, 5); g.lineTo(s, f.h - 5); }
			for (const t of [0.25, 0.5, 0.75]) { g.moveTo(-0.75, f.h * t); g.lineTo(0.75, f.h * t); }
		});
		glow(g, e, f, 'rgba(200,120,255,0.4)');
	},
	barreldoor(g, e) {
		const f = doorBase(g, e, e.variant || 'x', '#5d3c80');
		faceStroke(g, e, f, 'rgba(225,180,255,0.95)', e.lw * 1.8, () => {
			for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const x = Math.cos(a) * 0.45, y = f.h / 2 + Math.sin(a) * 6; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
		});
		glow(g, e, f, 'rgba(200,120,255,0.4)');
	},
	bossgate(g, e) {
		const f = doorBase(g, e, e.variant || 'x', '#6e2222', { arch: '#4c4752', height: 34 });
		faceStroke(g, e, f, '#b9a06a', e.lw * 1.8, () => { g.moveTo(-0.9, 8); g.lineTo(0.9, 8); g.moveTo(-0.9, f.h - 8); g.lineTo(0.9, f.h - 8); });
		// skull emblem
		const { u } = e;
		const cx = f.ox, cy = f.oy - f.h * 0.55 * u;
		g.fillStyle = '#efe6d2'; g.beginPath(); g.arc(cx, cy, 3.6 * u, 0, Math.PI * 2); g.fill();
		g.fillRect(cx - 2.2 * u, cy + 1.8 * u, 4.4 * u, 2.6 * u);
		g.fillStyle = '#2a1414'; g.beginPath(); g.arc(cx - 1.4 * u, cy, 1 * u, 0, Math.PI * 2); g.arc(cx + 1.4 * u, cy, 1 * u, 0, Math.PI * 2); g.fill();
		glow(g, e, f, 'rgba(255,80,60,0.3)');
	},

	// ---- links ---------------------------------------------------------------------------------------
	ladder(g, e) {
		const { u, lw } = e;
		const axis = e.variant || 'x';   // wall plane the ladder leans on
		const f = { axis, half: 0.5, ox: 0, oy: 0 };
		const wood = '#b98a52';
		const rails = () => { g.moveTo(-0.42, -1); g.lineTo(-0.42, 34); g.moveTo(0.42, -1); g.lineTo(0.42, 34); };
		const rungs = () => { for (let t = 3; t < 33; t += 5.5) { g.moveTo(-0.42, t); g.lineTo(0.42, t); } };
		faceStroke(g, e, f, shade(wood, -0.55), lw * 3.4, rails);
		faceStroke(g, e, f, shade(wood, -0.5), lw * 2.6, rungs);
		faceStroke(g, e, f, wood, lw * 2.2, rails);
		faceStroke(g, e, f, shade(wood, 0.12), lw * 1.5, rungs);
		faceStroke(g, e, f, shade(wood, 0.45, 0.8), lw * 0.7, () => { g.moveTo(-0.46, 0); g.lineTo(-0.46, 33); });
		// cyan marker so links read at a glance
		g.fillStyle = 'rgba(71,243,255,0.9)'; g.beginPath(); g.arc(0, -36 * u, 2 * u, 0, Math.PI * 2); g.fill();
	},
	hatch(g, e) {
		const { lw } = e;
		const wood = '#8a5a32';
		onFloor(g, e, () => { g.beginPath(); g.rect(-0.4, -0.4, 0.8, 0.8); });
		g.fillStyle = '#3a3a40'; g.fill();
		onFloor(g, e, () => { g.beginPath(); g.rect(-0.33, -0.33, 0.66, 0.66); });
		g.fillStyle = wood; g.fill(); g.strokeStyle = ink(wood); g.lineWidth = lw; g.stroke();
		onFloor(g, e, () => { g.beginPath(); for (const t of [-0.11, 0.11]) { g.moveTo(-0.33, t); g.lineTo(0.33, t); } });
		g.strokeStyle = shade(wood, -0.4); g.lineWidth = lw * 0.9; g.stroke();
		onFloor(g, e, () => { g.beginPath(); for (const t of [-0.22, 0.22]) { g.moveTo(t, -0.33); g.lineTo(t, 0.33); } });
		g.strokeStyle = IRON; g.lineWidth = lw * 1.6; g.stroke();
		onFloor(g, e, () => { g.beginPath(); g.ellipse(0.12, 0.05, 0.07, 0.07, 0, 0, Math.PI * 2); });
		g.strokeStyle = '#d6c27a'; g.lineWidth = lw * 1.3; g.stroke();
		g.fillStyle = 'rgba(71,243,255,0.9)'; g.beginPath(); g.arc(0, -6 * e.u, 1.8 * e.u, 0, Math.PI * 2); g.fill();
	},
	portal(g, e) {
		const { u, lw } = e;
		shadow(g, e, 14, 6);
		box(g, e, { ex: 0.2, ey: 0.2, height: 3, color: '#5e5970' });
		const cy = -17 * u;
		for (const [r, a] of [[16, 0.12], [12, 0.18]]) glowDisc(g, { x: 0, y: cy, r: r * u, inner: `rgba(190,140,255,${a * 2})`, outer: 'rgba(130,70,255,0)' });
		const disc = g.createRadialGradient(-2 * u, cy - 3 * u, 1 * u, 0, cy, 11 * u);
		disc.addColorStop(0, '#f2e8ff'); disc.addColorStop(0.35, '#a878ff'); disc.addColorStop(1, '#3d1f8f');
		g.fillStyle = disc; g.beginPath(); g.ellipse(0, cy, 8 * u, 12 * u, 0, 0, Math.PI * 2); g.fill();
		g.strokeStyle = '#d9c3ff'; g.lineWidth = lw * 1.4;
		for (let k = 0; k < 3; k++) {
			g.beginPath();
			for (let t = 0; t <= 1.001; t += 0.05) {
				const a = t * Math.PI * 1.6 + k * 2.1, r = (1 - t) * 7;
				const x = Math.cos(a) * r * u * 0.7, y = cy + Math.sin(a) * r * u;
				if (t) g.lineTo(x, y); else g.moveTo(x, y);
			}
			g.stroke();
		}
		g.strokeStyle = shade('#6a4bc0', -0.3); g.lineWidth = lw * 2; g.beginPath(); g.ellipse(0, cy, 8.5 * u, 12.5 * u, 0, 0, Math.PI * 2); g.stroke();
	},
	teleport(g, e) { PAINTERS.portal(g, e); },

	// ---- puzzle props, hazards, utilities ------------------------------------------------------------
	barrel(g, e) {
		const { u, lw } = e;
		shadow(g, e, 10, 5);
		const c = '#9a5b2e', rx = 8 * u, ry = 3.6 * u, H = 19 * u;
		g.beginPath();
		g.moveTo(-rx, 0);
		g.quadraticCurveTo(-rx * 1.25, -H / 2, -rx, -H);
		g.lineTo(rx, -H);
		g.quadraticCurveTo(rx * 1.25, -H / 2, rx, 0);
		g.ellipse(0, 0, rx, ry, 0, 0, Math.PI, false);
		g.closePath();
		g.fillStyle = hgrad(g, -rx * 1.2, rx * 1.2, [[0, shade(c, 0.12)], [0.3, shade(c, 0.05)], [1, shade(c, -0.45)]]); g.fill();
		g.strokeStyle = ink(c); g.lineWidth = lw; g.stroke();
		g.strokeStyle = shade(c, -0.35, 0.8); g.lineWidth = lw * 0.7;
		for (const s of [-0.55, -0.15, 0.25, 0.62]) { g.beginPath(); g.moveTo(s * rx, ry * 0.9); g.quadraticCurveTo(s * rx * 1.25, -H / 2, s * rx, -H); g.stroke(); }
		for (const t of [0.2, 0.8]) {
			const y = -H * t, w = rx * (1 + 0.2 * Math.sin(Math.PI * t));
			g.strokeStyle = '#5a5f68'; g.lineWidth = lw * 2.2; g.beginPath(); g.ellipse(0, y, w, ry, 0, 0, Math.PI); g.stroke();
			g.strokeStyle = '#9aa1ab'; g.lineWidth = lw * 0.8; g.beginPath(); g.ellipse(0, y - lw * 0.5, w, ry, 0, 0.2, Math.PI * 0.6); g.stroke();
		}
		g.fillStyle = shade(c, -0.15); g.beginPath(); g.ellipse(0, -H, rx, ry, 0, 0, Math.PI * 2); g.fill();
		g.strokeStyle = ink(c); g.lineWidth = lw; g.stroke();
		g.strokeStyle = shade(c, -0.4); g.lineWidth = lw * 0.6; g.beginPath(); g.moveTo(-rx * 0.6, -H); g.lineTo(rx * 0.6, -H); g.stroke();
		gloss(g, -rx * 0.55, -H * 0.55, 1.2 * u, 4 * u, 0.25);
	},
	trap(g, e) {
		const { u, lw } = e;
		onFloor(g, e, () => { g.beginPath(); g.rect(-0.32, -0.32, 0.64, 0.64); });
		g.fillStyle = '#6c6f78'; g.fill(); g.strokeStyle = '#3c3e45'; g.lineWidth = lw; g.stroke();
		const spikes = [];
		for (const X of [-0.18, 0, 0.18]) for (const Y of [-0.18, 0, 0.18]) spikes.push(P(u, X, Y));
		spikes.sort((a, b) => a[1] - b[1]);
		for (const [x, y] of spikes) {
			path(g, [[x - 2.2 * u, y], [x, y - 8 * u], [x + 2.2 * u, y]]);
			g.fillStyle = hgrad(g, x - 2.2 * u, x + 2.2 * u, [[0, '#e3e6ec'], [0.5, '#b8bcc6'], [1, '#6f737d']]); g.fill();
			g.strokeStyle = '#4b4e56'; g.lineWidth = lw * 0.6; g.stroke();
		}
	},
	fountain(g, e) {
		const { u, lw } = e;
		const mp = e.variant === 'mp';
		const water = mp ? '#6c7cff' : '#3fd0c8';
		shadow(g, e, 19, 9);
		const rx = 16 * u, ry = 8 * u, H = 8 * u, stone = '#8f8b99';
		g.beginPath(); g.moveTo(-rx, 0); g.lineTo(-rx, -H); g.ellipse(0, -H, rx, ry, 0, Math.PI, Math.PI * 2, false); g.lineTo(rx, 0); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI); g.closePath();
		g.fillStyle = hgrad(g, -rx, rx, [[0, shade(stone, 0.1)], [0.4, stone], [1, shade(stone, -0.4)]]); g.fill();
		g.strokeStyle = ink(stone); g.lineWidth = lw; g.stroke();
		g.fillStyle = shade(stone, 0.2); g.beginPath(); g.ellipse(0, -H, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
		const wg = g.createRadialGradient(-4 * u, -H - 2 * u, 1 * u, 0, -H, rx * 0.85);
		wg.addColorStop(0, shade(water, 0.6)); wg.addColorStop(0.5, water); wg.addColorStop(1, shade(water, -0.35));
		g.fillStyle = wg; g.beginPath(); g.ellipse(0, -H, rx * 0.82, ry * 0.78, 0, 0, Math.PI * 2); g.fill();
		// centre spout and jets
		box(g, e, { ex: 0.06, ey: 0.06, height: 10, color: stone, z0: 7 });
		g.strokeStyle = shade(water, 0.55, 0.9); g.lineWidth = lw * 1.3;
		for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, -19 * u); g.quadraticCurveTo(s * 6 * u, -25 * u, s * 9 * u, -H - 1 * u); g.stroke(); }
		g.fillStyle = 'rgba(255,255,255,0.8)';
		for (const [x, y] of [[-5, -9], [4, -10], [1, -7.5]]) { g.beginPath(); g.ellipse(x * u, y * u, 1.6 * u, 0.6 * u, 0, 0, Math.PI * 2); g.fill(); }
	},
	special(g, e) {
		const { u, lw } = e;
		shadow(g, e, 14, 7);
		box(g, e, { ex: 0.24, ey: 0.24, height: 4, color: '#7d7888' });
		box(g, e, { ex: 0.16, ey: 0.16, height: 12, color: '#948fa1', z0: 4 });
		const cy = -23 * u;
		glowDisc(g, { x: 0, y: cy, r: 12 * u, inner: 'rgba(255,170,240,0.55)', outer: 'rgba(255,120,220,0)' });
		path(g, [[0, cy - 6 * u], [4 * u, cy], [0, cy + 5 * u], [-4 * u, cy]]);
		g.fillStyle = hgrad(g, -4 * u, 4 * u, [[0, '#ffd6f6'], [0.5, '#e078d0'], [1, '#8f3a86']]); g.fill();
		g.strokeStyle = '#6e2a68'; g.lineWidth = lw * 0.8; g.stroke();
		gloss(g, -1.2 * u, cy - 2 * u, 0.9 * u, 1.6 * u, 0.8);
	},
	cover(g, e) {
		const { u, lw } = e;
		const blades = [[-9, 14, -0.3], [-5, 19, -0.15], [-1, 22, 0.05], [3, 18, 0.2], [7, 15, 0.35], [10, 11, 0.5], [-12, 10, -0.5]];
		for (const [x, h, lean] of blades) {
			g.beginPath();
			g.moveTo((x - 1.2) * u, 1 * u);
			g.quadraticCurveTo((x + lean * 6) * u, -h * 0.5 * u, (x + lean * 10) * u, -h * u);
			g.quadraticCurveTo((x + lean * 6 + 1) * u, -h * 0.5 * u, (x + 1.2) * u, 1 * u);
			g.fillStyle = vgrad(g, -h * u, 0, '#a9cf5a', '#4f7d26'); g.fill();
			g.strokeStyle = 'rgba(40,70,20,0.6)'; g.lineWidth = lw * 0.5; g.stroke();
		}
		for (const [x, h] of [[-3, 24], [5, 21]]) {
			g.strokeStyle = '#6b5a2e'; g.lineWidth = lw; g.beginPath(); g.moveTo(x * u, 0); g.lineTo(x * u, -h * u); g.stroke();
			g.fillStyle = '#7a4a24'; g.beginPath(); g.ellipse(x * u, -(h - 2) * u, 1.4 * u, 3.2 * u, 0, 0, Math.PI * 2); g.fill();
		}
	},
	marker(g, e) {
		const { u, lw } = e;
		shadow(g, e, 6, 3);
		g.strokeStyle = '#6b4a2e'; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(0, 1 * u); g.lineTo(0, -22 * u); g.stroke();
		path(g, [[0, -22 * u], [11 * u, -19 * u], [0, -15 * u]]);
		g.fillStyle = vgrad(g, -22 * u, -15 * u, '#f0f0f0', '#bdbdbd'); g.fill(); g.strokeStyle = '#7a7a7a'; g.lineWidth = lw * 0.7; g.stroke();
	},
	decor(g, e) {
		const { u, lw } = e;
		shadow(g, e, 11, 5.5);
		const c = '#8b7356';
		box(g, e, { ex: 0.17, ey: 0.12, height: 9, color: c });
		g.strokeStyle = shade(c, -0.4); g.lineWidth = lw * 0.8;
		const a = P(u, -0.17, -0.12, 4.5), b = P(u, -0.17, 0.12, 4.5), d = P(u, 0.17, 0.12, 4.5);
		g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...d); g.stroke();
	},

	// ---- creatures (variant for monsters = species hue) -----------------------------------------------
	hero(g, e) {
		const { u, lw } = e;
		shadow(g, e, 10, 5);
		const skin = '#f0c8a0', tunic = '#3f78d0', steel = '#c9cfda', cape = '#c23a3a';
		// cape behind
		g.beginPath(); g.moveTo(-6 * u, -21 * u); g.quadraticCurveTo(-10 * u, -10 * u, -8 * u, 0); g.lineTo(5 * u, 0); g.quadraticCurveTo(6 * u, -12 * u, 5 * u, -21 * u); g.closePath();
		g.fillStyle = vgrad(g, -21 * u, 0, shade(cape, 0.1), shade(cape, -0.35)); g.fill(); g.strokeStyle = ink(cape); g.lineWidth = lw; g.stroke();
		// legs
		g.fillStyle = '#4a3a2e';
		g.beginPath(); g.roundRect(-4.5 * u, -8 * u, 3.6 * u, 8.5 * u, 1 * u); g.roundRect(1 * u, -8 * u, 3.6 * u, 8.5 * u, 1 * u); g.fill();
		// body
		g.beginPath(); g.moveTo(-6.5 * u, -8 * u); g.quadraticCurveTo(-7.5 * u, -16 * u, -5 * u, -21 * u); g.lineTo(5 * u, -21 * u); g.quadraticCurveTo(7.5 * u, -16 * u, 6.5 * u, -8 * u); g.closePath();
		g.fillStyle = hgrad(g, -7 * u, 7 * u, [[0, shade(tunic, 0.25)], [0.45, tunic], [1, shade(tunic, -0.35)]]); g.fill(); g.strokeStyle = ink(tunic); g.lineWidth = lw; g.stroke();
		g.fillStyle = '#7a5530'; g.fillRect(-6.4 * u, -11 * u, 12.8 * u, 1.8 * u);
		g.fillStyle = '#e2c25a'; g.fillRect(-1 * u, -11.2 * u, 2 * u, 2.2 * u);
		// head + helmet
		g.fillStyle = hgrad(g, -4 * u, 4 * u, [[0, shade(skin, 0.15)], [1, shade(skin, -0.2)]]);
		g.beginPath(); g.arc(0, -25 * u, 4.6 * u, 0, Math.PI * 2); g.fill(); g.strokeStyle = ink(skin); g.lineWidth = lw * 0.8; g.stroke();
		g.beginPath(); g.arc(0, -26 * u, 5.4 * u, Math.PI * 0.98, Math.PI * 2.02); g.lineTo(5.4 * u, -24.5 * u); g.lineTo(-5.4 * u, -24.5 * u); g.closePath();
		g.fillStyle = hgrad(g, -5.4 * u, 5.4 * u, [[0, '#f3f6fb'], [0.4, steel], [1, shade(steel, -0.45)]]); g.fill(); g.strokeStyle = ink(steel); g.lineWidth = lw * 0.8; g.stroke();
		g.fillStyle = cape; g.beginPath(); g.ellipse(0, -32 * u, 1.6 * u, 2.6 * u, 0, 0, Math.PI * 2); g.fill();
		g.fillStyle = '#2a2a33'; g.beginPath(); g.arc(1.6 * u, -24 * u, 0.7 * u, 0, Math.PI * 2); g.arc(-1.2 * u, -24 * u, 0.7 * u, 0, Math.PI * 2); g.fill();
		// shield (left arm) and sword (right)
		g.beginPath(); g.moveTo(-10 * u, -18 * u); g.lineTo(-4 * u, -18 * u); g.lineTo(-4 * u, -12 * u); g.quadraticCurveTo(-7 * u, -6 * u, -7 * u, -6 * u); g.quadraticCurveTo(-10 * u, -9 * u, -10 * u, -12 * u); g.closePath();
		g.fillStyle = hgrad(g, -10 * u, -4 * u, [[0, '#5b8fe6'], [1, '#2d55a3']]); g.fill(); g.strokeStyle = '#d9b44a'; g.lineWidth = lw * 1.2; g.stroke();
		g.strokeStyle = '#d9b44a'; g.lineWidth = lw; g.beginPath(); g.moveTo(-7 * u, -17 * u); g.lineTo(-7 * u, -8 * u); g.stroke();
		g.strokeStyle = shade(steel, -0.5); g.lineWidth = lw * 2.6; g.beginPath(); g.moveTo(7.5 * u, -10 * u); g.lineTo(12.5 * u, -27 * u); g.stroke();
		g.strokeStyle = '#eef2f8'; g.lineWidth = lw * 1.3; g.beginPath(); g.moveTo(7.5 * u, -10 * u); g.lineTo(12.5 * u, -27 * u); g.stroke();
		g.strokeStyle = '#8a6a2a'; g.lineWidth = lw * 1.8; g.beginPath(); g.moveTo(5 * u, -11.5 * u); g.lineTo(10 * u, -10 * u); g.stroke();
	},
	npc(g, e) { robedFigure(g, e, { robe: '#5f8a3e', hood: '#4a6d2f', gem: staffOrb }); },
	// looks like a person until you talk to it: red, with a red diamond on its staff
	shapeshifter(g, e) { robedFigure(g, e, { robe: '#b23a3a', hood: '#7e2424', gem: staffDiamond }); },
	monster(g, e) { creature(g, e, { color: speciesColor(e.variant), r: 10 }); },
	goldmonster(g, e) { creature(g, e, { color: '#e6b422', r: 10.5, key: true, aura: 'rgba(255,215,90,0.28)' }); },
	miniboss(g, e) { creature(g, e, { color: '#e07a2c', r: 12.5, horns: true, teeth: true }); },
	boss(g, e) { creature(g, e, { color: '#9e2430', r: 15, horns: true, teeth: true, aura: 'rgba(255,60,40,0.35)', eyes: '#ffd23f' }); },
	unique(g, e) { creature(g, e, { color: '#d4a21c', r: 12.5, crown: true, aura: 'rgba(255,220,80,0.3)' }); },
	spider(g, e) {
		const { u, lw } = e;
		shadow(g, e, 12, 6);
		const metal = '#9aa6b5';
		g.strokeStyle = shade(metal, -0.45); g.lineWidth = lw * 2;
		for (const s of [-1, 1]) for (const [k, reach, drop] of [[0, 11, -3], [1, 13, 1], [2, 12, 4]]) {
			g.beginPath(); g.moveTo(s * 3 * u, -8 * u); g.lineTo(s * (reach - 3) * u, (-14 + k * 3) * u); g.lineTo(s * reach * u, drop * u); g.stroke();
		}
		g.strokeStyle = shade(metal, 0.2); g.lineWidth = lw * 0.8;
		for (const s of [-1, 1]) for (const [k, reach] of [[0, 11], [1, 13], [2, 12]]) { g.beginPath(); g.moveTo(s * 3 * u, -8 * u); g.lineTo(s * (reach - 3) * u, (-14 + k * 3) * u); g.stroke(); }
		const bg = g.createRadialGradient(-2.5 * u, -11 * u, 1 * u, 0, -8 * u, 8 * u);
		bg.addColorStop(0, '#f1f4f8'); bg.addColorStop(0.45, metal); bg.addColorStop(1, shade(metal, -0.5));
		g.fillStyle = bg; g.beginPath(); g.ellipse(0, -8 * u, 7 * u, 5.5 * u, 0, 0, Math.PI * 2); g.fill();
		g.strokeStyle = ink(metal); g.lineWidth = lw; g.stroke();
		g.strokeStyle = '#c9a24a'; g.lineWidth = lw * 1.2; g.beginPath(); g.ellipse(0, -8 * u, 7 * u, 2 * u, 0, 0, Math.PI); g.stroke();
		glowDisc(g, { x: 0, y: -9 * u, r: 5 * u, inner: 'rgba(120,255,255,0.9)', outer: 'rgba(71,243,255,0)' });
		g.fillStyle = '#c9ffff'; g.beginPath(); g.arc(0, -9 * u, 1.7 * u, 0, Math.PI * 2); g.fill();
	},
};

/** a hooded figure with a staff; look: { robe, hood (colours), gem (draws the staff's top) } */
function robedFigure(g, e, { robe, hood, gem }) {
	const { u, lw } = e;
	shadow(g, e, 10, 5);
	const skin = '#eec29b';
	g.beginPath(); g.moveTo(-7.5 * u, 0); g.quadraticCurveTo(-8 * u, -14 * u, -4.5 * u, -21 * u); g.lineTo(4.5 * u, -21 * u); g.quadraticCurveTo(8 * u, -14 * u, 7.5 * u, 0); g.quadraticCurveTo(0, 2 * u, -7.5 * u, 0); g.closePath();
	g.fillStyle = hgrad(g, -8 * u, 8 * u, [[0, shade(robe, 0.25)], [0.45, robe], [1, shade(robe, -0.4)]]); g.fill(); g.strokeStyle = ink(robe); g.lineWidth = lw; g.stroke();
	g.strokeStyle = '#d9c27a'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(-6 * u, -12 * u); g.quadraticCurveTo(0, -10 * u, 6 * u, -12 * u); g.stroke();
	g.fillStyle = skin; g.beginPath(); g.arc(0, -24.5 * u, 4.2 * u, 0, Math.PI * 2); g.fill();
	g.beginPath(); g.arc(0, -25 * u, 6 * u, Math.PI * 0.85, Math.PI * 2.15); g.quadraticCurveTo(4 * u, -21 * u, 3 * u, -20 * u); g.lineTo(-3 * u, -20 * u); g.quadraticCurveTo(-4 * u, -21 * u, -5.6 * u, -22.4 * u); g.closePath();
	g.fillStyle = hgrad(g, -6 * u, 6 * u, [[0, shade(hood, 0.2)], [1, shade(hood, -0.4)]]); g.fill(); g.strokeStyle = ink(hood); g.lineWidth = lw * 0.8; g.stroke();
	g.fillStyle = skin; g.beginPath(); g.ellipse(0.5 * u, -23.8 * u, 3 * u, 3.2 * u, 0, 0, Math.PI * 2); g.fill();
	g.fillStyle = '#2a2a33'; g.beginPath(); g.arc(1.8 * u, -24 * u, 0.6 * u, 0, Math.PI * 2); g.arc(-0.8 * u, -24 * u, 0.6 * u, 0, Math.PI * 2); g.fill();
	g.strokeStyle = '#7a5a34'; g.lineWidth = lw * 1.8; g.beginPath(); g.moveTo(9 * u, 0); g.lineTo(9 * u, -30 * u); g.stroke();
	gem(g, e);
}

function staffOrb(g, { u }) {
	g.fillStyle = '#9fe3ff'; g.beginPath(); g.arc(9 * u, -31 * u, 2 * u, 0, Math.PI * 2); g.fill();
	gloss(g, 8.4 * u, -31.6 * u, 0.6 * u, 0.6 * u, 0.9);
}

function staffDiamond(g, { u, lw }) {
	const x = 9 * u, y = -33 * u;
	glowDisc(g, { x, y, r: 7 * u, inner: 'rgba(255,70,70,0.5)', outer: 'rgba(255,40,40,0)' });
	path(g, [[x, y - 4.5 * u], [x + 3 * u, y], [x, y + 4.5 * u], [x - 3 * u, y]]);
	g.fillStyle = hgrad(g, x - 3 * u, x + 3 * u, [[0, '#ff9a9a'], [0.5, '#e02a2a'], [1, '#8a1010']]); g.fill();
	g.strokeStyle = '#5a0a0a'; g.lineWidth = lw * 0.8; g.stroke();
	gloss(g, x - 0.9 * u, y - 1.6 * u, 0.6 * u, 1 * u, 0.85);
}

/** a glow over the middle of door face f */
function glow(g, e, f, color) {
	const { u } = e;
	glowDisc(g, { x: f.ox, y: f.oy - f.h * 0.5 * u, r: 16 * u, inner: color, outer: 'rgba(0,0,0,0)' });
}

/** a disc of light added onto what is below it, fading from `inner` at (x, y) to `outer` at radius r */
function glowDisc(g, { x, y, r, inner, outer }) {
	const gr = g.createRadialGradient(x, y, 0, x, y, r);
	gr.addColorStop(0, inner); gr.addColorStop(1, outer);
	g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
	g.globalCompositeOperation = 'source-over';
}

function speciesColor(variant) {
	const n = parseInt(variant, 10);
	if (!Number.isFinite(n)) return '#d9534f';
	const hue = (n * 137.508) % 360;
	return hslHex(hue, 55, 52);
}

/**
 * Round creature with a glossy body and big eyes. look: { color, r (size in u), horns, crown, teeth, key (carries a
 * key), aura (colour), eyes (iris colour: glowing eyes on dark sclera) }.
 */
function creature(g, e, look) {
	shadow(g, e, look.r * 1.1, look.r * 0.5);
	const body = { ...look, R: look.r * e.u };
	if (body.aura) glowDisc(g, { x: 0, y: -body.R * 0.8, r: body.R * 2, inner: body.aura, outer: 'rgba(0,0,0,0)' });
	if (body.horns) creatureHorns(g, e, body);
	creatureBody(g, e, body);
	creatureFace(g, e, body);
	if (body.teeth) creatureTeeth(g, body);
	if (body.key) carriedKey(g, e, body);
	if (body.crown) creatureCrown(g, e, body);
}

function creatureHorns(g, e, { R }) {
	for (const s of [-1, 1]) {
		g.beginPath();
		g.moveTo(s * R * 0.35, -R * 1.45); g.quadraticCurveTo(s * R * 1.0, -R * 1.75, s * R * 1.05, -R * 2.3);
		g.quadraticCurveTo(s * R * 0.75, -R * 1.85, s * R * 0.62, -R * 1.25); g.closePath();
		g.fillStyle = hgrad(g, -R, R, [[0, '#fff6df'], [1, '#bfae8a']]); g.fill();
		g.strokeStyle = '#7a6a4a'; g.lineWidth = e.lw * 0.8; g.stroke();
	}
}

/** a soft dome with a slightly squashed base, rim-lit on the shaded side */
function creatureBody(g, e, { R, color }) {
	const { lw } = e;
	g.beginPath();
	g.moveTo(-R, -R * 0.1);
	g.bezierCurveTo(-R * 1.05, -R * 1.25, -R * 0.55, -R * 1.75, 0, -R * 1.75);
	g.bezierCurveTo(R * 0.55, -R * 1.75, R * 1.05, -R * 1.25, R, -R * 0.1);
	g.quadraticCurveTo(R * 0.95, R * 0.25, 0, R * 0.25);
	g.quadraticCurveTo(-R * 0.95, R * 0.25, -R, -R * 0.1);
	g.closePath();
	const bg = g.createRadialGradient(-R * 0.4, -R * 1.25, R * 0.1, 0, -R * 0.7, R * 1.45);
	bg.addColorStop(0, shade(color, 0.45)); bg.addColorStop(0.45, color); bg.addColorStop(1, shade(color, -0.45));
	g.fillStyle = bg; g.fill();
	g.strokeStyle = ink(color); g.lineWidth = lw * 1.1; g.stroke();
	g.strokeStyle = shade(color, 0.3, 0.45); g.lineWidth = lw;
	g.beginPath(); g.arc(0, -R * 0.75, R * 0.92, -0.2, 0.9); g.stroke();
	gloss(g, -R * 0.45, -R * 1.3, R * 0.22, R * 0.12, 0.7);
}

function creatureFace(g, e, { R, r, color, eyes }) {
	const ey = -R * 0.95;
	const iris = eyes || '#2a1f1a', sclera = eyes ? '#2a1010' : '#fbf7f0';
	eye(g, e, { x: -R * 0.33, y: ey, r: r * 0.24, iris, sclera });
	eye(g, e, { x: R * 0.33, y: ey, r: r * 0.24, iris, sclera });
	g.strokeStyle = ink(color); g.lineWidth = e.lw;
	g.beginPath(); g.arc(0, -R * 0.6, R * 0.22, 0.25, Math.PI - 0.25); g.stroke();
}

function creatureTeeth(g, { R }) {
	g.fillStyle = '#fbf7f0';
	for (const s of [-1, 1]) {
		path(g, [[s * R * 0.12, -R * 0.42], [s * R * 0.2, -R * 0.28], [s * R * 0.28, -R * 0.44]]);
		g.fill();
	}
}

/** a small golden key floating above (the gold monster drops the door key) */
function carriedKey(g, e, { R }) {
	const { lw } = e;
	g.strokeStyle = '#7a5a12'; g.lineWidth = lw * 2.6;
	keyPath(g, R); g.stroke();
	g.strokeStyle = '#ffe27a'; g.lineWidth = lw * 1.3;
	keyPath(g, R); g.stroke();
}

function keyPath(g, R) {
	const ky = -R * 2.05, kx = R * 0.15;
	g.beginPath(); g.arc(kx - R * 0.32, ky, R * 0.17, 0, Math.PI * 2);
	g.moveTo(kx - R * 0.15, ky); g.lineTo(kx + R * 0.45, ky); g.lineTo(kx + R * 0.45, ky + R * 0.18);
	g.moveTo(kx + R * 0.28, ky); g.lineTo(kx + R * 0.28, ky + R * 0.14);
}

function creatureCrown(g, e, { R }) {
	const c = '#ffd84a';
	path(g, [[-R * 0.5, -R * 1.62], [-R * 0.55, -R * 2.15], [-R * 0.25, -R * 1.85], [0, -R * 2.3], [R * 0.25, -R * 1.85], [R * 0.55, -R * 2.15], [R * 0.5, -R * 1.62]]);
	g.fillStyle = hgrad(g, -R * 0.55, R * 0.55, [[0, '#fff1a8'], [0.5, c], [1, '#b8892a']]); g.fill();
	g.strokeStyle = '#8a6418'; g.lineWidth = e.lw * 0.8; g.stroke();
	g.fillStyle = '#e8384f'; g.beginPath(); g.arc(0, -R * 1.85, R * 0.07, 0, Math.PI * 2); g.fill();
}
