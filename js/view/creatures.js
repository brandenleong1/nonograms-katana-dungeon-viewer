// Chibi creature sprites, by species (our own vector drawings, after how each creature looks in the game; no game
// art). Issue #31. Drawn in the map's sprite style (js/view/sprites.js): three-tone gradients, outlines a darker tone
// of each colour, soft gloss. Species that share a picture in the game share a drawing (SAME_AS).
//
// Units: u = half tile width / 32 (device px). Origin: the tile centre; y up is negative. A drawing stays within
// about 26u of the centre sideways and 46u above it, so a 1.2× boss still fits the sprite canvas.
//
//   hasCreature(species)                        -> true when there is a drawing
//   paintCreature(g, env, species, scale = 1)   -> draw it (env as in sprites.js: { u, lw })
//   pen(g, u, lw), shade(color, t)              -> the drawing primitives, shared with js/view/objects.js

/** species drawn the same as another (one picture in the game) */
const SAME_AS = { 276: 210, 277: 212, 278: 234, 279: 236, 285: 224, 267: 268, 280: 265, 281: 266, 282: 244, 283: 246, 270: 255, 271: 255, 272: 256, 385: 351, 386: 352, 382: 354, 383: 354, 392: 359, 395: 359, 391: 370, 372: 371, 384: 375, 388: 378, 389: 394, 390: 394, 397: 258, 349: 293, 338: 337, 339: 337, 347: 348, 343: 258, 344: 260, 345: 243, 350: 319, 387: 314, 627: 609, 628: 609, 649: 622, 643: 624, 648: 625, /* same pictures as drawn ones: quest copies, spawns, mimics */ 227: 226, 273: 222, 274: 222, 284: 262, 346: 258, 411: 255, 412: 258, 413: 268, 417: 328, 418: 329, 432: 268, 433: 255, 439: 255, 443: 223, 453: 224, 454: 215, 455: 258, 456: 262, 457: 239, 458: 222, 459: 255, 460: 255, 463: 243, 464: 243, 530: 201, 531: 201, 532: 201, 533: 201, 534: 201, 535: 201, 393: 214, 396: 214, /* NPCs: quest copies, shapeshifters and the unknown creatures with the same picture */ 406: 402, 410: 402, 415: 414, 416: 414, 421: 420, 423: 422, 424: 422, 427: 426, 430: 404, 434: 420, 435: 419, 436: 429, 437: 426, 438: 414, 440: 428, 441: 431, 442: 401, 447: 446, 448: 428, 449: 445, 450: 420, 451: 419, 452: 429, 461: 414, 462: 428, 536: 444, 537: 414, 644: 641, 645: 641, 646: 640, 647: 640, 650: 639 };

const drawingOf = (id) => DRAW[SAME_AS[id] ?? id];

/** drawings mirrored so they face right as in the game (drawn facing left); species sharing one turn with it */
const FACE_RIGHT = new Set([200, 201, 203, 204, 215, 228, 268]);

export const hasCreature = (id) => !!drawingOf(+id);

/** Draw species `id` at the tile centre, scaled by `scale` (bosses are drawn larger). */
export function paintCreature(g, env, id, scale = 1) {
	const draw = drawingOf(+id);
	if (!draw) return;
	g.save();
	g.scale(scale, scale);
	draw(pen(g, env.u, env.lw / scale, FACE_RIGHT.has(SAME_AS[+id] ?? +id)));
	g.restore();
}

// ---- colour helpers -------------------------------------------------------------------------------------------
/** [r, g, b] of '#rrggbb' or of 'rgb(r,g,b)' (what shade() returns, so shades can be shaded again) */
function hex2rgb(color) {
	if (color[0] !== '#') return color.slice(color.indexOf('(') + 1, color.indexOf(')')).split(',').slice(0, 3).map(Number);
	const n = parseInt(color.slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
}
export function shade(hex, t, a = 1) {
	const to = t >= 0 ? 255 : 0;
	const k = Math.abs(t);
	const v = hex2rgb(hex).map((x) => Math.round(x + (to - x) * k));
	return a >= 1 ? `rgb(${v})` : `rgba(${v},${a})`;
}
const rgba = (hex, a) => `rgba(${hex2rgb(hex)},${a})`;

// ---- the pen: drawing primitives in u ---------------------------------------------------------------------------
export function pen(g, u, lw, flip = false) {
	const X = (v) => v * u;
	/** a horizontal position: mirrored when the creature is drawn facing the other way */
	const H = (v) => (flip ? -v : v) * u;
	const ink = (color) => shade(color, -0.55);
	const fillOf = (color, x0, x1) => {
		// lit side stays on the left when mirrored
		const a = Math.min(H(x0), H(x1)), b = Math.max(H(x0), H(x1));
		const gr = g.createLinearGradient(a, 0, b, 0);
		gr.addColorStop(0, shade(color, 0.28)); gr.addColorStop(0.45, color); gr.addColorStop(1, shade(color, -0.38));
		return gr;
	};
	const P = {
		/** fill the current path with a lit-to-shaded gradient across [x0, x1], then outline it */
		paint(color, x0 = -10, x1 = 10, opts = {}) {
			if (opts.alpha != null) g.globalAlpha = opts.alpha;
			g.fillStyle = opts.flat ? color : fillOf(color, x0, x1); g.fill();
			if (opts.line !== false) {
				g.strokeStyle = ink(color); g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
			}
			g.globalAlpha = 1;
		},
		ellipse(x, y, rx, ry, color, opts = {}) {
			g.beginPath(); g.ellipse(H(x), X(y), X(rx), X(ry), (flip ? -1 : 1) * (opts.rot || 0), 0, Math.PI * 2);
			P.paint(color, x - rx, x + rx, opts);
		},
		circle(x, y, r, color, opts) { P.ellipse(x, y, r, r, color, opts); },
		poly(pts, color, opts = {}) {
			g.beginPath(); g.moveTo(H(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(H(x), X(y));
			g.closePath();
			const xs = pts.map((p) => p[0]);
			P.paint(color, Math.min(...xs), Math.max(...xs), opts);
		},
		/** a closed path built with p.m / p.l / p.q / p.b (move, line, quadratic, bezier) in u */
		shape(fn, color, x0, x1, opts = {}) {
			g.beginPath();
			fn({
				m: (x, y) => g.moveTo(H(x), X(y)),
				l: (x, y) => g.lineTo(H(x), X(y)),
				q: (cx, cy, x, y) => g.quadraticCurveTo(H(cx), X(cy), H(x), X(y)),
				b: (c1x, c1y, c2x, c2y, x, y) => g.bezierCurveTo(H(c1x), X(c1y), H(c2x), X(c2y), H(x), X(y)),
			});
			g.closePath();
			P.paint(color, x0, x1, opts);
		},
		/** a thick outlined stroke (limbs, staffs, blades) */
		line(pts, color, width) {
			g.beginPath(); g.moveTo(H(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(H(x), X(y));
			g.lineJoin = 'round'; g.lineCap = 'round';
			g.strokeStyle = ink(color); g.lineWidth = X(width) + lw * 2; g.stroke();
			g.strokeStyle = color; g.lineWidth = X(width); g.stroke();
		},
		/** a thin stroke with no outline (details: seams, ribs, whiskers) */
		thin(pts, color, width) {
			g.beginPath(); g.moveTo(H(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(H(x), X(y));
			g.lineJoin = 'round'; g.lineCap = 'round';
			g.strokeStyle = color; g.lineWidth = Math.max(0.8, X(width)); g.stroke();
		},
		gloss(x, y, rx, ry, a = 0.55) {
			g.fillStyle = `rgba(255,255,255,${a})`;
			g.beginPath(); g.ellipse(H(x), X(y), X(rx), X(ry), flip ? 0.5 : -0.5, 0, Math.PI * 2); g.fill();
		},
		dot(x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(H(x), X(y), X(r), 0, Math.PI * 2); g.fill(); },
		/** a soft disc of light added onto what is below */
		glow(x, y, r, color, a = 0.5) {
			const gr = g.createRadialGradient(H(x), X(y), 0, H(x), X(y), X(r));
			gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
			g.globalCompositeOperation = 'lighter'; g.fillStyle = gr;
			g.beginPath(); g.arc(H(x), X(y), X(r), 0, Math.PI * 2); g.fill();
			g.globalCompositeOperation = 'source-over';
		},
		/** big chibi eyes: white, dark iris looking a little to the right on screen (left with look = -1), highlight up and to the left */
		eyes(x, y, gap, r, iris = '#2a1f1a', look = 1) {
			const d = (flip ? -1 : 1) * look;
			for (const s of [-1, 1]) {
				P.dot(x + s * gap, y, r, '#fbf7f0');
				P.dot(x + s * gap + d * r * 0.15, y + r * 0.15, r * 0.62, iris);
				P.dot(x + s * gap - d * r * 0.15, y - r * 0.3, r * 0.25, '#ffffff');
			}
		},
		/** glowing eyes: a bright dot with a halo */
		glowEyes(x, y, gap, r, color) {
			for (const s of [-1, 1]) { P.glow(x + s * gap, y, r * 3, color, 0.55); P.dot(x + s * gap, y, r, shade(color, 0.6)); }
		},
		mouth(x, y, w, color = '#5a2a2a') {
			g.strokeStyle = color; g.lineWidth = Math.max(1, lw * 0.9); g.lineCap = 'round';
			g.beginPath(); g.arc(H(x), X(y - w * 0.6), X(w), 0.3, Math.PI - 0.3); g.stroke();
		},
		shadow(rx, ry, y = 1, a = 0.28) {
			g.fillStyle = `rgba(0,0,0,${a})`;
			g.beginPath(); g.ellipse(0, X(y), X(rx), X(ry), 0, 0, Math.PI * 2); g.fill();
		},
	};
	return P;
}

// ---- shared parts ------------------------------------------------------------------------------------------------
function legs(P, color, boot = shade(color, -0.35)) {
	P.line([[-3, -8], [-3, -2]], color, 3.6);
	P.line([[3, -8], [3, -2]], color, 3.6);
	P.ellipse(-3.4, -1.2, 2.6, 1.6, boot);
	P.ellipse(3.4, -1.2, 2.6, 1.6, boot);
}
/** bony legs and feet (skeletons) */
function boneLegs(P, bone, foot) {
	for (const s of [-1, 1]) {
		P.line([[s * 2.6, -9], [s * 3, -5], [s * 3, -2]], bone, 1.3);
		P.dot(s * 3, -5, 0.9, bone);
		P.ellipse(s * 3.4, -1.2, 2.4, 1.4, foot);
	}
}
/** a torso or robe: top at y0 (half width w0), bottom at y1 (half width w1), rounded hem */
function torso(P, y0, w0, y1, w1, color) {
	P.shape((p) => { p.m(-w0, y0); p.l(w0, y0); p.q(w1 + 0.5, (y0 + y1) / 2, w1, y1); p.q(0, y1 + 2, -w1, y1); p.q(-w1 - 0.5, (y0 + y1) / 2, -w0, y0); }, color, -w1, w1);
}
function head(P, y, r, skin, x = 0) {
	P.circle(x, y, r, skin);
	P.gloss(x - r * 0.4, y - r * 0.45, r * 0.25, r * 0.15, 0.45);
}
/** a skull: cranium, cheeks, dark sockets, nose hole, teeth */
function skull(P, x, y, r, bone, eye = null) {
	P.circle(x, y, r, bone);
	P.ellipse(x, y + r * 0.62, r * 0.62, r * 0.42, bone, { line: false });
	P.ellipse(x - r * 0.38, y + r * 0.05, r * 0.27, r * 0.32, '#1c1612', { line: false });
	P.ellipse(x + r * 0.38, y + r * 0.05, r * 0.27, r * 0.32, '#1c1612', { line: false });
	if (eye) { P.glow(x - r * 0.38, y + r * 0.05, r * 0.5, eye, 0.6); P.glow(x + r * 0.38, y + r * 0.05, r * 0.5, eye, 0.6); P.dot(x - r * 0.38, y + r * 0.08, r * 0.09, shade(eye, 0.6)); P.dot(x + r * 0.38, y + r * 0.08, r * 0.09, shade(eye, 0.6)); }
	P.poly([[x - r * 0.1, y + r * 0.45], [x + r * 0.1, y + r * 0.45], [x, y + r * 0.3]], '#2a2018', { line: false });
	for (const k of [-0.3, -0.1, 0.1, 0.3]) P.thin([[x + k * r, y + r * 0.72], [x + k * r, y + r * 0.92]], shade(bone, -0.5), 0.25);
	P.gloss(x - r * 0.4, y - r * 0.5, r * 0.25, r * 0.14, 0.5);
}
/** a curved blade (sickle, cutlass, glaive) from (x0, y0) bending through (cx, cy) to (x1, y1) */
function curvedBlade(P, x0, y0, cx, cy, x1, y1, width) {
	P.shape((p) => { p.m(x0, y0); p.q(cx, cy, x1, y1); p.q(cx * 0.85 + x0 * 0.15 + width * 0.3, cy * 0.85 + y0 * 0.15 + width, x0 + width * 0.4, y0 + width * 0.3); }, '#dfe4ec', Math.min(x0, x1), Math.max(x0, x1));
}

/** a straight sword with its hilt at (x, y), pointing at angle a (0 = right, positive = down), blade length len, width w */
function sword(P, x, y, a, len, w = 1.6, blade = '#dfe4ec') {
	const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
	const at = (t, o) => [x + dx * t + nx * o, y + dy * t + ny * o];
	P.line([at(-2.4, 0), at(0, 0)], '#4a2a1a', 0.9);
	P.poly([at(0.3, -w * 0.5), at(len - w * 1.1, -w * 0.5), at(len, w * 0.2), at(len - w * 1.6, w * 0.5), at(0.3, w * 0.5)], blade);
	P.thin([at(0.9, -w * 0.05), at(len - w * 1.6, -w * 0.05)], shade(blade, -0.3), 0.25);
	P.line([at(0, -w * 1.2), at(0, w * 1.2)], '#c9a24a', 0.7);
}

/** a double-bitted axe: the haft from (x0, y0) to its head at (x1, y1), two crescent blades either side of it */
function doubleAxe(P, x0, y0, x1, y1, size = 1) {
	const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
	const at = (t, o) => [x1 + dx * t * size + nx * o * size, y1 + dy * t * size + ny * o * size];
	P.line([[x0, y0], at(1.6, 0)], '#6a4a2a', 1.1);
	for (const side of [-1, 1]) {
		const pts = [at(1.3, side * 0.7), at(3.2, side * 3.6), at(0, side * 5.4), at(-3.2, side * 3.6), at(-1.3, side * 0.7)];
		const xs = pts.map((q) => q[0]);
		P.shape((p) => { p.m(...pts[0]); p.l(...pts[1]); p.q(...pts[2], ...pts[3]); p.l(...pts[4]); }, '#8a909a', Math.min(...xs), Math.max(...xs));
		P.thin([at(2.6, side * 3.4), at(0, side * 4.8), at(-2.6, side * 3.4)], '#dfe4ec', 0.3);
	}
	P.dot(...at(0, 0), 0.9 * size, '#5a5f68');
}

/** a tapering tentacle (or tail) through the points `pts`, `w0` wide at the first point and `w1` at the last; smoothed,
 *  drawn as outlined strokes (level 4's tentacles and tails) */
function tentacle(P, pts, color, w0, w1 = 0.4) {
	const sm = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
		for (let t = 0; t < 1; t += 0.25) {
			const t2 = t * t, t3 = t2 * t;
			sm.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
		}
	}
	sm.push(pts[pts.length - 1]);
	const w = (i) => w0 + (w1 - w0) * (i / (sm.length - 1));
	for (let i = 0; i < sm.length - 1; i++) P.thin([sm[i], sm[i + 1]], shade(color, -0.55), w(i) + 0.55);
	for (let i = 0; i < sm.length - 1; i++) P.thin([sm[i], sm[i + 1]], color, w(i));
}

/** a tapering limb, tail, horn or tentacle along a smooth curve through pts (the inner points pull the curve like
 *  quadratic controls), w0 wide at the start and w1 at the end */
function taper(P, pts, w0, w1, color, opts) {
	const c = [];
	const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	if (pts.length === 2) for (let k = 0; k <= 8; k++) c.push(lerp(pts[0], pts[1], k / 8));
	else {
		let start = pts[0];
		for (let i = 1; i < pts.length - 1; i++) {
			const end = i === pts.length - 2 ? pts[i + 1] : lerp(pts[i], pts[i + 1], 0.5);
			for (let k = i === 1 ? 0 : 1; k <= 8; k++) c.push(lerp(lerp(start, pts[i], k / 8), lerp(pts[i], end, k / 8), k / 8));
			start = end;
		}
	}
	const left = [], right = [];
	c.forEach((p, i) => {
		const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
		const w = (w0 + (w1 - w0) * i / (c.length - 1)) / 2;
		left.push([p[0] + nx * w, p[1] + ny * w]); right.push([p[0] - nx * w, p[1] - ny * w]);
	});
	P.poly([...left, ...right.reverse()], color, opts);
}

// ---- tomb shared parts (Egyptian headdresses, collars, blades); each prefixed with the dungeon whose
// drawings use it ----

/** a broad collar across the shoulders: centre (x, y) at the top, half width w, depth h, bands of the given colours */
function eaBroadCollar(P, x, y, w, h, base, bands) {
	P.shape((p) => { p.m(x - w, y); p.q(x, y - h * 0.45, x + w, y); p.q(x + w * 0.85, y + h, x, y + h * 1.1); p.q(x - w * 0.85, y + h, x - w, y); }, base, x - w, x + w);
	bands.forEach((c, i) => {
		const f = (i + 1) / (bands.length + 1);
		P.thin(eaQpts([x - w * (1 - f * 0.12), y + h * f * 0.55], [x, y + h * f * 1.55], [x + w * (1 - f * 0.12), y + h * f * 0.55]), c, h * 0.2);
	});
}

/** the Anubite (boss = false) and Anubis (boss = true): a black jackal warrior facing right, a khopesh low in the far
 *  hand, a round bronze shield on the near arm, a gold-striped headdress, a white kilt */
function eaJackal(P, boss) {
	const fur = '#2e2e3a', gold = '#d8a634', linen = '#ece2c4', bronze = '#b8863a', blade = boss ? '#e8c050' : '#dfe4ec';
	P.shadow(boss ? 13 : 12, 4.6);
	eaNemesSide(P, 0.6, -29.6, 5.2, gold, fur);
	// legs with gold greaves
	for (const [hx, kx, fx, c] of [[-2.6, -4.6, -4, shade(fur, -0.1)], [2.6, 5.4, 4.8, fur]]) {
		taper(P, [[hx, -12], [kx, -6.6], [fx, -1.8]], 4, 2.8, c);
		if (boss) P.line([[kx + (fx - kx) * 0.25, -6], [kx + (fx - kx) * 0.7, -3.4]], gold, 2.6);
		else P.line([[fx - 1.3, -3.2], [fx + 1.3, -3.2]], gold, 0.9);
		P.ellipse(fx + 0.8, -1.2, 2.6, 1.3, shade(fur, -0.1));
	}
	// kilt with a gold apron
	P.shape((p) => { p.m(-5.2, -13.4); p.l(5.2, -13.4); p.l(6.8, -6.6); p.q(0, -5.4, -6.8, -6.6); }, linen, -6.8, 6.8);
	for (const x of [-4, -2, 2.6, 4.4]) P.thin([[x * 0.9, -12.8], [x * 1.2, -6.6]], shade(linen, -0.25), 0.3);
	P.shape((p) => { p.m(-1.6, -13); p.l(1.6, -13); p.l(2, -5.4); p.l(0, -4.4); p.l(-2, -5.4); }, gold, -2, 2);
	P.thin([[-1.2, -10], [1.2, -10]], fur, 0.4); P.thin([[-1.4, -7.6], [1.4, -7.6]], fur, 0.4);
	// muscular torso
	P.shape((p) => { p.m(-5.6, -22.6); p.q(0, -24, 5.8, -22.6); p.q(6, -17, 4, -13.2); p.l(-4, -13.2); p.q(-6, -17, -5.6, -22.6); }, fur, -6, 6);
	if (boss) {
		P.shape((p) => { p.m(-4.6, -21); p.q(0, -22.4, 4.8, -21); p.q(5, -17, 3.6, -14.6); p.q(0, -13.6, -3.6, -14.6); p.q(-5, -17, -4.6, -21); }, gold, -5, 5);
		for (const y of [-18.6, -16.4]) P.thin(eaQpts([-3.6, y], [0, y + 1.2], [3.8, y]), shade(gold, -0.4), 0.4);
		P.circle(0.2, -17.4, 1, '#2c4f9e');
	} else {
		P.thin([[-3, -18.8], [0.2, -17.6], [3.4, -18.8]], shade(fur, 0.35), 0.4); P.thin([[0.2, -17.6], [0.2, -14]], shade(fur, 0.35), 0.35);
		P.thin([[-2.4, -15.6], [2.8, -15.6]], shade(fur, 0.3), 0.3);
	}
	P.line([[-5, -13.4], [5, -13.4]], gold, 1.4);
	// the far arm, the khopesh held low and back
	P.ellipse(-5.4, -21.4, 2.8, 2.6, fur);
	taper(P, [[-5.2, -21], [-9, -16.4], [-9.6, -12]], 3, 2.4, fur);
	P.line([[-9.6, -15.6], [-8.4, -16.6]], gold, boss ? 2 : 1.1);
	eaKhopesh(P, -10, -11.4, 2.25, boss ? 11 : 10, blade, -1);
	P.circle(-9.8, -11.4, 1.7, fur);
	// the near arm, the shield strapped on
	P.ellipse(5.6, -21.4, 2.8, 2.6, fur);
	taper(P, [[5.8, -21], [9.4, -17], [11, -13.6]], 3, 2.4, fur);
	const R = boss ? 8 : 7;
	P.circle(13.4, -15.4, R, bronze);
	P.circle(13.4, -15.4, R - 1.4, shade(bronze, 0.08), { line: false });
	P.circle(13.4, -15.4, R * 0.3, gold);
	for (const a of [0, 1, 2, 3, 4, 5]) { const t = a * Math.PI / 3 + 0.3; P.thin([[13.4 + Math.cos(t) * R * 0.38, -15.4 + Math.sin(t) * R * 0.38], [13.4 + Math.cos(t) * (R - 1.6), -15.4 + Math.sin(t) * (R - 1.6)]], shade(bronze, -0.3), 0.35); }
	P.gloss(11, -19.6, 1.8, 1, 0.4);
	eaBroadCollar(P, 0, -22, 6.4, boss ? 4 : 3.2, gold, boss ? ['#2c4f9e', fur, '#2c4f9e'] : [fur, '#2c4f9e']);
	// the jackal head facing right: tall ears, a long snout, a gold-rimmed eye, the striped headdress at the nape
	P.line([[0.6, -21.4], [1, -24]], fur, 3);
	for (const [x, tx, c] of [[-1.6, -1.4, shade(fur, -0.12)], [1.6, 3, fur]]) {
		P.poly([[x - 1.8, -32.6], [tx, boss ? -43.4 : -41.6], [x + 1.8, -32.4]], c);
		P.poly([[x - 0.7, -33.2], [tx + 0.1, boss ? -41 : -39.4], [x + 0.8, -33]], gold, { line: false });
	}
	P.circle(0.8, -29.4, 5, fur);
	P.shape((p) => { p.m(2, -32.4); p.q(8, -31.6, 12, -28.6); p.q(12.6, -27.2, 11.6, -26.6); p.q(8, -25.6, 3, -25.4); p.l(2, -28); }, fur, 2, 12.6);
	P.thin([[4.4, -26.4], [10.6, -27.2]], '#0e0e14', 0.4);
	P.ellipse(11.8, -28, 0.8, 0.6, '#0e0e14', { line: false });
	P.gloss(-1, -32.4, 1.4, 0.8, 0.35);
	P.ellipse(3.8, -30.2, 1.7, 1.15, gold, { rot: -0.25 });
	P.ellipse(4, -30.2, 1.1, 0.75, '#ffe060', { line: false, rot: -0.25 });
	P.dot(4.3, -30.2, 0.42, '#1a1206');
	P.thin([[2.2, -31.6], [5.6, -31.2]], gold, 0.4);
	if (boss) P.line([[-3.4, -33], [3.2, -33.8]], gold, 1);
}

/** a khopesh (sickle sword): the grip at (x, y), pointing at angle a (0 = right, positive = down), length len; the
 *  blade hooks to the side `side` (1 = clockwise of the pointing direction) */
function eaKhopesh(P, x, y, a, len, metal = '#dfe4ec', side = 1) {
	const dx = Math.cos(a), dy = Math.sin(a), nx = -dy * side, ny = dx * side;
	const at = (t, o) => [x + dx * t + nx * o, y + dy * t + ny * o];
	P.line([at(-2.6, 0), at(0, 0)], '#3a2618', 1);
	P.poly([at(0.2, -0.55), at(len * 0.42, -0.55), at(len * 0.42, 0.55), at(0.2, 0.55)], metal);
	const pts = [...eaQpts(at(len * 0.38, -0.9), at(len * 1.05, -len * 0.12), at(len * 0.95, len * 0.5)), ...eaQpts(at(len * 0.95, len * 0.5), at(len * 0.82, len * 0.08), at(len * 0.38, 0.9))];
	P.poly(pts, metal);
	P.thin(eaQpts(at(len * 0.45, -0.3), at(len * 0.92, -len * 0.06), at(len * 0.9, len * 0.36)), shade(metal, 0.4), 0.3);
	P.line([at(0, -1.1), at(0, 1.1)], '#d8a634', 0.7);
}

/** the back fall of a striped nemes headcloth behind a head of radius r at (x, y); drawn before the body and head */
function eaNemesBack(P, x, y, r, cloth, stripe) {
	P.shape((p) => { p.m(x - r * 0.95, y - r * 0.7); p.q(x - r * 1.3, y + r * 0.2, x - r * 1.24, y + r * 1.3); p.l(x + r * 1.24, y + r * 1.3); p.q(x + r * 1.3, y + r * 0.2, x + r * 0.95, y - r * 0.7); }, cloth, x - r * 1.3, x + r * 1.3);
	for (let k = 1; k <= 3; k++) { const yy = y + r * (0.05 + k * 0.36), w = r * 1.18; P.thin([[x - w, yy], [x + w, yy]], stripe, r * 0.14); }
}

/** the striped cap of a nemes over the top of a head of radius r at (x, y), framing the face, with a gold cobra on the brow */
function eaNemesFront(P, x, y, r, cloth, stripe, cobra = '#e8b83a') {
	P.shape((p) => { p.m(x - r * 1.12, y + r * 0.35); p.q(x - r * 1.28, y - r * 1.32, x, y - r * 1.27); p.q(x + r * 1.28, y - r * 1.32, x + r * 1.12, y + r * 0.35); p.l(x + r * 0.84, y + r * 0.3); p.q(x + r * 0.86, y - r * 0.52, x, y - r * 0.54); p.q(x - r * 0.86, y - r * 0.52, x - r * 0.84, y + r * 0.3); }, cloth, x - r * 1.28, x + r * 1.28);
	for (let k = 0; k <= 10; k++) {
		const t = Math.PI * (0.97 + k * 1.06 / 10), c = Math.cos(t), s = Math.sin(t);
		P.thin([[x + c * r * 0.92, y + s * r * 0.62], [x + c * r * 1.14, y + s * r * 1.18]], stripe, r * 0.09);
	}
	P.thin(eaQpts([x - r * 0.84, y + r * 0.1], [x, y - r * 0.95], [x + r * 0.84, y + r * 0.1]), shade(cloth, -0.25), r * 0.1);
	P.ellipse(x, y - r * 0.68, r * 0.17, r * 0.24, cobra);
}

/** the two striped lappets of a nemes falling in front of the shoulders */
function eaNemesLappets(P, x, y, r, cloth, stripe) {
	for (const s of [-1, 1]) {
		P.shape((p) => { p.m(x + s * r * 0.82, y + r * 0.25); p.l(x + s * r * 1.2, y + r * 0.25); p.q(x + s * r * 1.36, y + r * 1.2, x + s * r * 1.3, y + r * 1.95); p.l(x + s * r * 0.84, y + r * 1.95); p.q(x + s * r * 0.92, y + r * 1.0, x + s * r * 0.82, y + r * 0.25); }, cloth, x + Math.min(s * r * 0.82, s * r * 1.36), x + Math.max(s * r * 0.82, s * r * 1.36));
		for (let k = 1; k <= 4; k++) P.thin([[x + s * r * 0.88, y + r * (0.25 + k * 0.36)], [x + s * r * 1.28, y + r * (0.25 + k * 0.36)]], stripe, r * 0.12);
	}
}

/** a nemes seen from the side on a head facing right: the cap over the back of the head and the fall down the nape */
function eaNemesSide(P, x, y, r, cloth, stripe) {
	P.shape((p) => { p.m(x + r * 0.3, y - r * 0.98); p.q(x - r * 0.5, y - r * 1.25, x - r * 1.0, y - r * 0.5); p.q(x - r * 1.35, y + r * 0.4, x - r * 1.25, y + r * 1.45); p.l(x - r * 0.2, y + r * 1.45); p.q(x - r * 0.4, y + r * 0.7, x - r * 0.1, y + r * 0.2); p.q(x - r * 0.35, y - r * 0.4, x + r * 0.3, y - r * 0.98); }, cloth, x - r * 1.35, x + r * 0.3);
	for (let k = 0; k <= 4; k++) { const yy = y - r * 0.3 + k * r * 0.4; P.thin([[x - r * (1.12 + Math.min(k, 2) * 0.05), yy], [x - r * (k < 2 ? 0.3 : 0.3), yy]], stripe, r * 0.11); }
}

// ---- EA shared parts (the Egyptian tomb) ---------------------------------------------------------------------------
/** points along a quadratic curve from a through control c to b */
function eaQpts(a, c, b, n = 8) {
	const out = [];
	for (let k = 0; k <= n; k++) {
		const t = k / n, s = 1 - t;
		out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
	}
	return out;
}

/** a pharaoh's striped nemes headdress behind a head at (x, y) of radius r: a dome over the head and two lappets
 *  falling to the shoulders, striped `a` and `b`. Draw the face over it, then ebNemesBand() across the brow. */
function ebNemes(P, x, y, r, a, b) {
	const T = (px, py) => [x + px * r, y + py * r];
	P.shape((p) => { p.m(...T(-1.08, 0.1)); p.q(...T(-1.25, -1.4), ...T(0, -1.4)); p.q(...T(1.25, -1.4), ...T(1.08, 0.1)); p.l(...T(1.3, 1.55)); p.l(...T(0.55, 1.55)); p.l(...T(0.55, 0.9)); p.l(...T(-0.55, 0.9)); p.l(...T(-0.55, 1.55)); p.l(...T(-1.3, 1.55)); }, a, x - 1.3 * r, x + 1.3 * r);
	for (let py = 0.36; py < 1.5; py += 0.28) {
		const ox = 1.08 + (py - 0.1) / 1.45 * 0.22;
		for (const s of [-1, 1]) P.thin([T(s * 0.58, py), T(s * (ox - 0.06), py)], b, 0.13 * r);
	}
	for (let k = 0; k < 9; k++) {
		const t = Math.PI * (1.08 + k * 0.105), c = Math.cos(t), sn = Math.sin(t);
		P.thin([T(c * 0.9, sn * 0.9 - 0.05), T(c * 1.16, sn * 1.25 - 0.05)], b, 0.12 * r);
	}
	P.gloss(x - r * 0.7, y - r * 1.05, r * 0.3, r * 0.14, 0.4);
}

/** the gold brow band of a nemes with a little rearing cobra (uraeus) at the front */
function ebNemesBand(P, x, y, r, gold = '#e0b040', front = 0) {
	const pts = [];
	for (let k = 0; k <= 10; k++) { const t = Math.PI * (1.1 + k * 0.08); pts.push([x + Math.cos(t) * r * 0.98, y + Math.sin(t) * r * 0.62 - r * 0.28]); }
	P.line(pts, gold, 0.16 * r);
	const ux = x + front * r;
	P.shape((p) => { p.m(ux - 0.16 * r, y - 0.82 * r); p.q(ux - 0.3 * r, y - 1.2 * r, ux, y - 1.28 * r); p.q(ux + 0.3 * r, y - 1.2 * r, ux + 0.16 * r, y - 0.82 * r); }, gold, ux - 0.3 * r, ux + 0.3 * r);
	P.dot(ux, y - 1.05 * r, 0.08 * r, '#2a5ac8');
}

/** a broad curved blade (khopesh, sickle-sword, curved dagger): from its base at (x0, y0), the outer edge bending through
 *  (cx, cy) to the tip at (x1, y1), about w wide in the middle */
function ecCrescent(P, x0, y0, cx, cy, x1, y1, w, steel = '#dfe4ec') {
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(cx - mx, cy - my) || 1, ux = (mx - cx) / L, uy = (my - cy) / L;
	P.shape((p) => { p.m(x0, y0); p.q(cx, cy, x1, y1); p.q(cx + ux * w * 2, cy + uy * w * 2, x0 + ux * w * 0.8, y0 + uy * w * 0.8); }, steel, Math.min(x0, x1, cx), Math.max(x0, x1, cx));
	P.thin([[x0 + (cx - x0) * 0.25, y0 + (cy - y0) * 0.25], [cx * 0.85 + mx * 0.15, cy * 0.85 + my * 0.15]], '#ffffff', 0.35);
}

/** the back of a striped nemes headdress for a head at (x, y), radius r: the side flaps and the lappets falling onto
 *  the chest either side of the neck (drawn before the face; nemesFront adds the cap over the forehead) */
function ecNemesBack(P, x, y, r, cloth, stripe) {
	P.shape((p) => {
		p.m(x - r * 1.05, y - r * 0.2); p.q(x - r * 1.1, y - r * 1.2, x, y - r * 1.25); p.q(x + r * 1.1, y - r * 1.2, x + r * 1.05, y - r * 0.2);
		p.l(x + r * 1.42, y + r * 1.45); p.q(x + r * 1.05, y + r * 1.7, x + r * 0.62, y + r * 1.55); p.l(x + r * 0.5, y + r * 0.7);
		p.l(x - r * 0.5, y + r * 0.7); p.l(x - r * 0.62, y + r * 1.55); p.q(x - r * 1.05, y + r * 1.7, x - r * 1.42, y + r * 1.45);
	}, cloth, x - r * 1.4, x + r * 1.4);
	for (let t = 0.05; t < 1.45; t += 0.27) {
		const hw = r * (1.06 + 0.34 * t / 1.45);
		for (const s of [-1, 1]) P.thin([[x + s * (hw - r * 0.08), y + r * t], [x + s * r * 0.62, y + r * t + r * 0.05]], stripe, r * 0.12);
	}
}

/** the front of a nemes headdress: the striped cap over the forehead, the brow band and a little cobra (uraeus) */
function ecNemesFront(P, x, y, r, cloth, stripe) {
	P.shape((p) => { p.m(x - r * 0.9, y - r * 0.25); p.q(x, y - r * 0.62, x + r * 0.9, y - r * 0.25); p.q(x + r * 1.02, y - r * 1.2, x, y - r * 1.25); p.q(x - r * 1.02, y - r * 1.2, x - r * 0.9, y - r * 0.25); }, cloth, x - r, x + r);
	for (const t of [0.3, 0.55, 0.8]) {
		const yy = y - r * 0.42 - t * r * 0.72, hw = r * 0.88 * Math.sqrt(1 - t * t * 0.9);
		P.thin([[x - hw, yy + r * 0.06], [x, yy - r * 0.1], [x + hw, yy + r * 0.06]], stripe, r * 0.11);
	}
	P.gloss(x - r * 0.4, y - r * 0.95, r * 0.22, r * 0.1, 0.4);
	P.line([[x - r * 0.88, y - r * 0.28], [x, y - r * 0.6], [x + r * 0.88, y - r * 0.28]], '#e2b440', r * 0.1);
	P.ellipse(x + r * 0.06, y - r * 0.78, r * 0.13, r * 0.24, '#e2b440');
	P.dot(x + r * 0.06, y - r * 0.85, r * 0.06, '#2a4ab0');
}

/** a broad Egyptian collar (usekh) round the neck at (x, y), half width w */
function ecUsekh(P, x, y, w, base = '#2a4ab0', gold = '#e2b440') {
	P.ellipse(x, y, w, w * 0.42, gold);
	P.ellipse(x, y - w * 0.04, w * 0.8, w * 0.3, base, { line: false });
	P.ellipse(x, y - w * 0.1, w * 0.55, w * 0.18, gold, { line: false });
	for (let k = -3; k <= 3; k++) P.dot(x + k * w * 0.22, y + w * 0.3 - Math.abs(k) * w * 0.035, w * 0.06, '#c8202a');
	P.gloss(x - w * 0.45, y - w * 0.15, w * 0.2, w * 0.08, 0.4);
}

// ---- ED shared parts (the Egyptian tomb) ----
/** the back of a pharaoh's striped nemes headdress for a head at (x, y), radius r: the cloth flaring out from behind the
 *  head down past the jaw to the shoulders, stripes a over b; draw the head over it, then nemesTop */
function edNemesBack(P, x, y, r, a = '#d9a83a', b = '#2f5fb0') {
	P.shape((p) => { p.m(x - r * 0.95, y - r * 0.6); p.q(x, y - r * 1.4, x + r * 0.95, y - r * 0.6); p.q(x + r * 1.3, y + r * 0.2, x + r * 1.55, y + r * 1.35); p.l(x + r * 0.6, y + r * 1.45); p.l(x - r * 0.6, y + r * 1.45); p.l(x - r * 1.55, y + r * 1.35); p.q(x - r * 1.3, y + r * 0.2, x - r * 0.95, y - r * 0.6); }, a, x - r * 1.55, x + r * 1.55);
	for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { const t = -0.15 + k * 0.32; P.thin([[x + s * r * 0.75, y + r * t], [x + s * r * (1.12 + 0.09 * k), y + r * (t + 0.1)]], b, r * 0.15); }
}

/** the top of the nemes over the head at (x, y), radius r: a striped cap down to the brow, a gold band, the cobra at the front */
function edNemesTop(P, x, y, r, a = '#d9a83a', b = '#2f5fb0', uraeus = true) {
	P.shape((p) => { p.m(x - r * 1.05, y - r * 0.05); p.q(x - r * 1.15, y - r * 1.25, x, y - r * 1.3); p.q(x + r * 1.15, y - r * 1.25, x + r * 1.05, y - r * 0.05); p.q(x + r * 0.75, y - r * 0.5, x, y - r * 0.5); p.q(x - r * 0.75, y - r * 0.5, x - r * 1.05, y - r * 0.05); }, a, x - r * 1.1, x + r * 1.1);
	for (const k of [-0.75, -0.38, 0, 0.38, 0.75]) P.thin([[x + k * r * 0.95, y - r * (0.58 - Math.abs(k) * 0.15)], [x + k * r * 0.7, y - r * (1.18 - Math.abs(k) * 0.2)]], b, r * 0.15);
	P.thin([[x - r * 1.0, y - r * 0.12], [x - r * 0.5, y - r * 0.47], [x, y - r * 0.54], [x + r * 0.5, y - r * 0.47], [x + r * 1.0, y - r * 0.12]], shade(a, -0.35), r * 0.1);
	if (uraeus) { P.ellipse(x, y - r * 0.74, r * 0.17, r * 0.28, a); P.dot(x, y - r * 0.82, r * 0.07, '#c8302a'); }
	P.gloss(x - r * 0.5, y - r * 0.95, r * 0.3, r * 0.14, 0.45);
}

/** a white kilt (shendyt) from the waist at y0 to the hem at y1, half width w at the waist: pleats, a belt, a striped
 *  front apron (apron = [cloth, stripes], or null) */
function edShendyt(P, y0, y1, w, belt = '#d9a83a', apron = ['#2f5fb0', '#d9a83a'], x = 0, cloth = '#efe9da') {
	P.shape((p) => { p.m(x - w, y0); p.l(x + w, y0); p.l(x + w * 1.25, y1); p.q(x, y1 + 1, x - w * 1.25, y1); }, cloth, x - w * 1.25, x + w * 1.25);
	for (const k of [-0.65, 0.65]) P.thin([[x + k * w, y0 + 0.8], [x + k * w * 1.25, y1 - 0.2]], shade(cloth, -0.2), 0.3);
	if (apron) {
		P.poly([[x - w * 0.32, y0], [x + w * 0.32, y0], [x + w * 0.42, y1 + 1.2], [x - w * 0.42, y1 + 1.2]], apron[0]);
		for (let t = 0.3; t < 1; t += 0.28) P.thin([[x - w * (0.3 + 0.1 * t), y0 + (y1 + 1.2 - y0) * t], [x + w * (0.3 + 0.1 * t), y0 + (y1 + 1.2 - y0) * t]], apron[1], 0.5);
	}
	P.line([[x - w, y0], [x + w, y0]], belt, 1.2);
}

/** a crescent blade (sickle sword, khopesh) from the hilt at (x0, y0) bending through (cx, cy) to the tip at (x1, y1),
 *  about w wide at its belly */
function edSickle(P, x0, y0, cx, cy, x1, y1, w, blade = '#dfe4ec') {
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, d = Math.hypot(mx - cx, my - cy) || 1;
	const ix = cx + (mx - cx) / d * w * 2, iy = cy + (my - cy) / d * w * 2;
	P.shape((p) => { p.m(x0, y0); p.q(cx, cy, x1, y1); p.q(ix, iy, x0, y0); }, blade, Math.min(x0, x1, cx), Math.max(x0, x1, cx));
	P.thin([[x0 + (cx - x0) * 0.3, y0 + (cy - y0) * 0.3], [(x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4], [x1 + (cx - x1) * 0.3, y1 + (cy - y1) * 0.3]], '#ffffff', 0.3);
}

/** a broad collar (usekh) hanging from the neck at (x, y), half width w: bands of the colours, outermost first */
function edUsekh(P, x, y, w, cols = ['#d9a83a', '#2f5fb0', '#d9a83a', '#3aa8a0']) {
	cols.forEach((c, i) => {
		const r = w * (1 - i * 0.18);
		P.shape((p) => { p.m(x - r, y); p.b(x - r, y + r * 0.85, x + r, y + r * 0.85, x + r, y); p.q(x, y - r * 0.12, x - r, y); }, c, x - r, x + r);
	});
}

// ---- NPC shared parts (the people met in the dungeons) ---------------------------------------------------------------
/** a person's face on a head of radius r at (x, y): big eyes and a small smile */
function npcFace(P, x, y, r, skin, iris = '#3a2a1a') {
	head(P, y, r, skin, x);
	P.eyes(x, y + r * 0.14, r * 0.36, r * 0.2, iris);
	P.mouth(x, y + r * 0.62, r * 0.13);
}

/** an arm in its sleeve from the shoulder along pts, w0 wide at the shoulder and w1 at the wrist, a hand at the end */
function npcArm(P, pts, sleeve, skin, w0 = 3, w1 = 2.2) {
	taper(P, pts, w0, w1, sleeve);
	const [x, y] = pts[pts.length - 1];
	P.circle(x, y + 0.6, 1.5, skin);
}

/** legs from the hips at y0 to the ankles, `gap` either side of the middle, in boots `h` high (0: shoes or bare feet);
 *  the far (left) leg a little darker */
function npcLegs(P, y0, trousers, boot, h = 3, gap = 2.8) {
	for (const s of [-1, 1]) {
		const c = s < 0 ? shade(trousers, -0.1) : trousers, x = s * (gap + 0.3);
		P.line([[s * gap, y0], [x, -2]], c, 3.4);
		if (h > 0) P.line([[x, -2 - h], [x, -2]], s < 0 ? shade(boot, -0.1) : boot, 3.8);
		P.ellipse(x + 0.4, -1.2, 2.6, 1.4, boot);
	}
}

/** a long skirt or gown from the waist at y0 (half width w0) flaring to the hem on the ground (half width w1), folds */
function npcGown(P, y0, w0, w1, color) {
	P.shape((p) => { p.m(-w0, y0); p.l(w0, y0); p.q(w1 * 0.8, y0 * 0.45, w1, -1.4); p.q(w1 * 0.5, 0.2, 0, -0.6); p.q(-w1 * 0.5, 0.2, -w1, -1.4); p.q(-w1 * 0.8, y0 * 0.45, -w0, y0); }, color, -w1, w1);
	for (const k of [-0.5, 0, 0.5]) P.thin([[k * w0, y0 + 2], [k * w1 * 1.05, -1.4]], shade(color, -0.25), 0.35);
}

// ---- the creatures -----------------------------------------------------------------------------------------------
const DRAW = {
	// Giant spider: big red abdomen with dark spots, purple legs, cute eyes and fangs
	200(P) {
		P.shadow(14, 5.5);
		const leg = '#5b3a6e';
		for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
			const bx = s * (2 + k * 1.2), by = -9 + k * 0.6;
			P.line([[bx, by], [s * (11 + k * 1.6), -16 + k * 3], [s * (13 + k * 1.2), -0.5]], leg, 2);
		}
		P.ellipse(4, -13, 10.5, 9, '#b8443f');
		for (const [x, y, r] of [[2, -17, 1.6], [7, -15, 1.3], [5, -10, 1.4], [9, -11, 1]]) P.dot(x, y, r, '#7e2a33');
		P.gloss(0, -19, 3, 1.6);
		P.circle(-5, -9, 6.2, '#8e3d55');
		P.eyes(-5, -10, 2.4, 1.9, '#3a0d16');
		P.dot(-7.6, -13.4, 0.9, '#2a0a10'); P.dot(-2.4, -13.4, 0.9, '#2a0a10');
		for (const s of [-1, 1]) P.poly([[-5 + s * 1.2, -5.6], [-5 + s * 2.2, -5.4], [-5 + s * 1.4, -2.8]], '#f3ece0');
	},
	// Scorpion: dark brown carapace, orange pincers, tail arched over its back with an orange sting
	201(P) {
		P.shadow(13, 5);
		const shell = '#5a3a2a', orange = '#d9652a';
		for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.line([[s * (3 + k * 2), -6], [s * (8 + k * 2.4), -9 + k], [s * (10 + k * 2), -0.5]], shade(shell, -0.15), 1.3);
		for (const [x, y, r] of [[3, -14, 3.2], [5, -19, 2.9], [5.5, -24, 2.7], [3.5, -28.5, 2.5], [0, -30.5, 2.3]]) P.circle(x, y, r, shell);
		P.shape((p) => { p.m(-1.5, -31.5); p.q(-5.5, -31, -5, -26.5); p.q(-3.6, -29, -0.5, -29); }, orange, -5.5, -0.5);
		P.ellipse(1, -9, 8.5, 5.5, shell);
		for (const x of [-2, 1.5, 5]) P.thin([[x, -13.5], [x + 0.6, -4.5]], shade(shell, -0.4), 0.4);
		for (const s of [-1, 1]) {
			P.line([[s * 5, -9], [s * 10, -13]], shell, 2);
			P.shape((p) => { p.m(s * 9, -12); p.q(s * 13, -19, s * 16.5, -15); p.l(s * 13.5, -14); p.q(s * 15.5, -11.5, s * 13, -10); p.q(s * 11, -9.5, s * 9, -12); }, orange, s < 0 ? -16.5 : 9, s < 0 ? -9 : 16.5);
		}
		P.circle(-1, -8, 5, shade(shell, 0.08));
		P.eyes(-1, -9, 2, 1.6, '#c2410c');
		P.gloss(-3, -11.5, 1.5, 0.8);
	},
	// Cobra: coiled red body with a cream belly, raised hooded head, forked tongue
	202(P) {
		P.shadow(13, 5);
		const red = '#c2463d', cream = '#efd9b0';
		P.ellipse(1, -2.5, 12, 4.8, red);
		P.ellipse(2, -6.5, 10, 4.2, red);
		P.ellipse(3, -10, 7.5, 3.6, red);
		P.line([[9, -2], [13, -4], [14, -7]], red, 2.4);
		P.line([[2, -11], [-1, -18], [-2, -24]], red, 6.5);
		P.line([[1.4, -11.5], [-1.4, -18], [-2.2, -23]], cream, 2.4);
		P.ellipse(-2, -26, 8.5, 9.5, red);
		P.ellipse(-2, -25, 4.8, 7, cream, { line: false });
		P.ellipse(-2, -30.5, 5.5, 4.3, red);
		P.gloss(-4, -32.5, 1.6, 0.9);
		for (const s of [-1, 1]) { P.dot(-2 + s * 2.3, -31, 1.3, '#ffd23f'); P.dot(-2 + s * 2.3, -31, 0.5, '#1b1208'); }
		P.line([[-2, -27.5], [-2, -24.8]], '#e0303a', 0.5);
		P.line([[-2, -24.8], [-3, -23.6]], '#e0303a', 0.4); P.line([[-2, -24.8], [-1, -23.6]], '#e0303a', 0.4);
	},
	// Mantis: green insect, big black eyes, antennae, folded scythe arms
	203(P) {
		P.shadow(12, 5);
		const green = '#7fae3a', light = '#a9cf5f';
		for (const [x0, x1] of [[2, 10], [6, 13], [-2, -8]]) P.line([[x0, -8], [x1, -4], [x1 + Math.sign(x1) * 1.5, 0]], green, 1.4);
		P.ellipse(6, -10, 9, 6, light, { rot: -0.25 });
		for (const x of [3, 6, 9]) P.line([[x, -14], [x + 1, -6]], '#6f9a2e', 0.5);
		P.ellipse(-2, -16, 4, 6.5, green);
		P.line([[-3, -18], [-9, -14], [-7, -22]], green, 2.2);
		P.line([[0, -18], [-5, -13], [-3, -21]], green, 2.2);
		for (const [x, y] of [[-8.3, -17], [-4.3, -16]]) P.poly([[x, y], [x + 1.6, y - 0.6], [x + 0.6, y + 1.4]], '#e9f2c8');
		P.line([[-4, -31], [-7, -38], [-10, -39]], '#6f9a2e', 0.7);
		P.line([[-1, -31], [1, -38], [4, -39]], '#6f9a2e', 0.7);
		P.circle(-2.5, -26, 7, green);
		P.ellipse(-7, -27, 3.2, 3.8, '#1c2414');
		P.ellipse(2, -27, 3.2, 3.8, '#1c2414');
		P.dot(-7.8, -28.4, 1, '#ffffff'); P.dot(1.2, -28.4, 1, '#ffffff');
		P.gloss(-3, -31, 2, 1);
		P.mouth(-2.5, -21.5, 1, '#3e5a1a');
	},
	// Centipede: purple segmented body rearing up in an S, many little legs, antennae, a pink pincer tail
	204(P) {
		P.shadow(13, 5);
		const purple = '#7a62b8', legc = '#5a468e';
		const segs = [[9, -3, 3.6], [5, -4.5, 4], [1, -6.5, 4.3], [-2.5, -10, 4.4], [-4, -14.5, 4.4], [-3.5, -19, 4.3], [-1.5, -23, 4.1]];
		P.shape((p) => { p.m(11, -4); p.q(15, -7, 16, -12); p.q(14.5, -9, 13, -8.5); p.q(15, -5, 12, -2); }, '#c860b0', 11, 16);
		for (const [x, y, r] of segs) for (const s of [-1, 1]) P.line([[x, y], [x + s * (r + 2.4), y + 2.2]], legc, 0.9);
		for (const [x, y, r] of segs) { P.circle(x, y, r, purple); P.thin([[x - r * 0.8, y - r * 0.3], [x + r * 0.8, y - r * 0.3]], shade(purple, -0.35), 0.35); }
		P.thin([[-1, -31], [-5, -38], [-9, -38]], legc, 0.6);
		P.thin([[2, -31], [4, -38], [8, -39]], legc, 0.6);
		P.circle(0.5, -28, 5.2, '#8b74c8');
		P.eyes(0.5, -28.5, 2.1, 1.5, '#2a1a4a');
		for (const s of [-1, 1]) P.shape((p) => { p.m(0.5 + s * 1, -24); p.q(0.5 + s * 3.4, -23, 0.5 + s * 2, -20.6); p.q(0.5 + s * 1.6, -22.4, 0.5 + s * 0.4, -23); }, '#efe6ff', -3, 3);
		P.gloss(-1.5, -31, 1.6, 0.9);
	},
	// Skeleton pikeman: skull under a leafy green hood, tattered green tunic, bony limbs, a tall spear
	205(P) {
		P.shadow(10, 4.5);
		const bone = '#e6dfcc', moss = '#5f7f3a';
		boneLegs(P, bone, '#5a4a32');
		P.line([[9, 1], [11, -42]], '#7a5a34', 1.3);
		P.poly([[11.5, -48], [12.8, -42.5], [11, -40.5], [9.8, -42.6]], '#d9dee6');
		torso(P, -20, 5, -7, 7.5, '#4f6b35');
		P.poly([[-7.5, -7], [-5, -3.5], [-3, -7], [-1, -3], [1.5, -7], [4, -3.5], [7.5, -7]], '#4f6b35');
		for (const y of [-17, -14.5, -12]) P.thin([[-3, y], [3, y]], shade(bone, -0.15), 0.7);
		P.line([[-5, -18], [-8, -12], [-6.5, -7]], bone, 1.2);
		P.line([[5, -18], [9, -13], [10, -16]], bone, 1.2);
		skull(P, 0, -27, 7, bone, '#7cff6a');
		P.shape((p) => { p.m(-9, -26); p.q(-10, -36, -2, -38); p.l(0, -42); p.l(2, -38); p.q(10, -36, 9, -26); p.q(6, -33, 0, -33.5); p.q(-6, -33, -9, -26); }, moss, -10, 10);
		for (const [x, y] of [[-8, -30], [8, -30], [-5, -35.5], [5, -35.5]]) P.poly([[x, y], [x + Math.sign(x) * 2.4, y - 1.4], [x + Math.sign(x) * 0.6, y + 1.2]], '#7aa04a');
	},
	// Ronin: straw hat, orange-gold armour, red trousers, katana
	206(P) {
		P.shadow(10, 4.5);
		legs(P, '#a8402c', '#5a3a22');
		P.line([[6, -12], [14, -33]], '#d9dee6', 1.4);
		P.line([[5, -10], [7, -15]], '#3a2a1a', 1.8);
		torso(P, -20, 5.5, -6, 7, '#d9902a');
		for (const y of [-16, -12]) P.line([[-6, y], [6, y]], '#b06a14', 0.8);
		P.line([[-7, -9], [7, -9]], '#c94a2a', 1.6);
		P.ellipse(-7.5, -15, 2.4, 3.8, '#d9902a');
		P.ellipse(7, -13, 2.4, 3.6, '#d9902a');
		head(P, -27, 8, '#e8b98a');
		P.eyes(0, -25.5, 3, 1.5);
		P.mouth(0, -21.8, 1.2);
		P.shape((p) => { p.m(-14, -29); p.q(0, -34, 14, -29); p.l(0, -40); }, '#d8b26a', -14, 14);
		P.ellipse(0, -29.3, 14, 3, '#c9a258');
		P.line([[-5, -33], [5, -33]], '#a8843e', 0.6);
	},
	// Blue monk: big grey-blue conical hat, blue robe, pale blue skin, crooked staff
	207(P) {
		P.shadow(10, 4.5);
		P.line([[-10, 0], [-10, -33]], '#7a5a34', 1.5);
		P.line([[-10, -33], [-8, -36], [-6, -34]], '#7a5a34', 1.5);
		P.dot(-6, -32.5, 1.4, '#d94a2a');
		torso(P, -20, 5.5, -1, 9, '#2f6f9e');
		P.shape((p) => { p.m(-2, -20); p.l(2, -20); p.l(3, -2); p.l(-3, -2); }, '#1f4a6e', -3, 3);
		P.line([[-7, -9], [7, -9]], '#7a2a2a', 1.2);
		P.ellipse(4, -8, 1.8, 1.8, '#a33a2a');
		P.ellipse(-8, -14, 2.4, 3.8, '#2f6f9e');
		P.ellipse(7.5, -14, 2.4, 3.8, '#2f6f9e');
		head(P, -27, 8, '#9fc3e0');
		P.eyes(0, -25.5, 3, 1.5, '#1b2a3a');
		P.mouth(0, -21.8, 1.1, '#2a3a5a');
		P.shape((p) => { p.m(-15, -28); p.q(0, -32, 15, -28); p.l(1, -42); }, '#9aa3ad', -15, 15);
		P.ellipse(0, -28.2, 15, 3, '#858e99');
	},
	// Ghoul ninja: a screaming grey ghoul face under a pointed purple hood, dark vest, bare grey arms, two long swords
	208(P) {
		P.shadow(11, 4.5);
		const hood = '#6a4fa3', skin = '#b9ad9e';
		legs(P, '#3a304e', '#241d30');
		torso(P, -20, 5.5, -6, 7, '#3b2f55');
		P.shape((p) => { p.m(-2.8, -20); p.l(2.8, -20); p.l(0, -13); }, skin, -3, 3);
		P.line([[-7, -9], [7, -9]], '#6a4a2a', 1.4);
		P.dot(0, -9, 0.9, '#d9b24a');
		for (const s of [-1, 1]) {
			P.line([[s * 5.5, -18.5], [s * 9, -12.5]], skin, 2);
			P.line([[s * 8.6, -13], [s * 9.3, -11.6]], hood, 2.2);
			P.line([[s * 9.5, -11], [s * 17, 2]], '#dfe4ec', 1.2);
			P.line([[s * 8.3, -11.8], [s * 10.7, -10.4]], '#3a3a44', 0.7);
			P.line([[s * 9.4, -11.2], [s * 8.4, -13.4]], '#4a2a20', 0.9);
		}
		P.shape((p) => { p.m(-9, -25); p.q(-10, -36, 1, -37.5); p.q(6, -37.5, 9.5, -39); p.q(10, -34, 9, -25); p.q(0, -21, -9, -25); }, hood, -10, 11);
		P.ellipse(0, -26, 6, 6.6, '#cfc6b8');
		P.ellipse(-2.4, -27.5, 1.6, 1.4, '#1a1420', { line: false }); P.ellipse(2.4, -27.5, 1.6, 1.4, '#1a1420', { line: false });
		P.dot(-2.3, -27.6, 0.45, '#f0e8ff'); P.dot(2.5, -27.6, 0.45, '#f0e8ff');
		P.thin([[-4, -29.6], [-1.2, -29]], '#6a6058', 0.4); P.thin([[4, -29.6], [1.2, -29]], '#6a6058', 0.4);
		P.ellipse(0, -22.6, 1.9, 2.6, '#2a1218', { line: false });
		P.thin([[-1.2, -24.6], [1.2, -24.6]], '#efe8dc', 0.4);
	},
	// Banshee: a floating ghost in a navy gown that tapers into a wisp (no legs), flowing hair, glowing eyes, arms hanging down
	209(P) {
		P.shadow(8, 3, 2, 0.18);
		const gown = '#2b3a6b', skin = '#a9c4e6', hair = '#1e2a52';
		P.glow(0, -18, 18, '#7aa0ff', 0.22);
		P.shape((p) => { p.m(-6, -22); p.q(-12, -14, -9, -7); p.q(-6, -3, -1, -3); p.q(4, -2, 6, 1.5); p.q(8, -4, 8.5, -7); p.q(12, -14, 6, -22); }, gown, -12, 12, { alpha: 0.4 });
		P.shape((p) => { p.m(-5, -23); p.l(5, -23); p.q(10, -15, 8.5, -9); p.q(7, -5, 3, -4.5); p.q(1, -3.5, 3.5, -0.5); p.q(-0.5, -1.5, -1.5, -4.5); p.q(-7, -5, -8.5, -9); p.q(-10, -15, -5, -23); }, gown, -10, 10);
		P.thin([[-1, -21], [-2, -8]], shade(gown, 0.22), 0.45);
		P.thin([[2.5, -21], [3.5, -10]], shade(gown, 0.22), 0.45);
		P.shape((p) => { p.m(-8.5, -29); p.q(-10, -21, -7.5, -18); p.l(7.5, -18); p.q(10, -21, 8.5, -29); p.q(0, -41, -8.5, -29); }, hair, -10, 10);
		// arms hang down in front, long fingers pointing at the ground
		for (const s of [-1, 1]) {
			P.line([[s * 5, -20.5], [s * 7.5, -15], [s * 7.2, -10.5]], skin, 1.3);
			for (const k of [-1, 0, 1]) P.thin([[s * 7.2, -10.5], [s * (7.2 + k * 0.7), -8.2]], shade(skin, -0.25), 0.35);
		}
		head(P, -29, 7.5, skin);
		P.glowEyes(0, -28.5, 2.8, 0.9, '#bfefff');
		P.ellipse(0, -24.6, 1, 1.5, '#0e1630', { line: false });
		P.shape((p) => { p.m(-8, -31); p.q(-3, -32.5, 0, -36.5); p.q(3, -32.5, 8, -31); p.q(1, -41, -8, -31); }, hair, -8, 8);
	},
	// Cult priestess (also the 1A boss): long bright blue hair half hiding her face, open navy robe, fur stole, two sickles
	210(P) {
		P.shadow(11, 4.8);
		const hair = '#2c5bd1', robe = '#1d2b55', skin = '#e2b892', fur = '#e3e8ee';
		P.shape((p) => { p.m(-8, -30); p.q(-12, -16, -9, -6); p.l(9, -6); p.q(12, -16, 8, -30); p.q(0, -41, -8, -30); }, hair, -12, 12);
		torso(P, -20, 5.5, -1, 9, robe);
		P.shape((p) => { p.m(-1.8, -20); p.l(1.8, -20); p.l(1.5, -8); p.l(-1.5, -8); }, skin, -2, 2);
		P.shape((p) => { p.m(-1.6, -8); p.l(1.6, -8); p.l(2.5, -1); p.l(-2.5, -1); }, '#121a36', -2.5, 2.5);
		P.thin([[-2, -20], [-3, -1.5]], '#6f9ee8', 0.5); P.thin([[2, -20], [3, -1.5]], '#6f9ee8', 0.5);
		for (const s of [-1, 1]) {
			P.ellipse(s * 8, -13, 2.3, 3.8, robe);
			P.line([[s * 9, -10.5], [s * 9.5, -6.5]], '#5a3a22', 1.1);
			P.shape((p) => { p.m(s * 9.5, -6.8); p.q(s * 19, -9, s * 16, 2.5); p.q(s * 15.5, -4, s * 9.8, -4.6); }, '#dfe6ee', s < 0 ? -19 : 9.5, s < 0 ? -9.5 : 19);
		}
		for (const [x, y, r] of [[-9, -15, 2.6], [-8.5, -18, 2.8], [-6, -20.2, 2.9], [-3, -21.2, 2.8], [0, -21.4, 2.8], [3, -21.2, 2.8], [6, -20.2, 2.9], [8.5, -18, 2.8], [9, -15, 2.6]]) P.circle(x, y, r, fur, { line: false });
		head(P, -28, 7.2, skin);
		// a blue blindfold across her eyes, its ends trailing at the side; a flat, unsmiling mouth
		P.shape((p) => { p.m(-7.3, -29.6); p.q(0, -30.6, 7.3, -29.6); p.l(7.1, -26.6); p.q(0, -27.4, -7.1, -26.6); }, '#3d7be0', -7.3, 7.3);
		P.shape((p) => { p.m(6.6, -28.6); p.q(9.5, -28, 10.5, -24.5); p.q(9, -25.5, 7.4, -26.4); }, '#3d7be0', 6.6, 10.5);
		P.thin([[-1.2, -23.6], [1.2, -23.6]], '#7a3a2a', 0.45);
		P.shape((p) => { p.m(-7.5, -29); p.q(-6, -34, 0, -36); p.q(3, -33, 3.5, -30); p.q(1, -33, -3, -31); p.q(-5.5, -27, -5.5, -20); p.q(-8.5, -22, -7.5, -29); }, hair, -8.5, 3.5);
		P.shape((p) => { p.m(7.5, -29); p.q(6.5, -34, 2, -35.5); p.q(5, -32, 5.2, -27); p.q(5.8, -22, 5, -19); p.q(8.4, -22, 7.5, -29); }, hair, 2, 8.4);
	},
	// Samurai beast: red horned helmet and armour, a snarling demon face, tan beast legs, a curved glaive
	211(P) {
		P.shadow(11, 4.8);
		const red = '#b5402e', skin = '#d9a35e', horn = '#5a3a2a';
		for (const s of [-1, 1]) {
			P.line([[s * 3, -9], [s * 4, -5], [s * 3, -2]], skin, 3.2);
			P.ellipse(s * 3.6, -1.2, 2.6, 1.5, '#3a2418');
		}
		P.line([[10, -4], [12, -24]], '#5a3a22', 1.2);
		P.shape((p) => { p.m(11.8, -24); p.q(18, -26, 17, -34); p.q(15, -29, 11.4, -28); }, '#dfe4ec', 11.4, 18);
		torso(P, -20, 6, -7, 8, red);
		for (const y of [-16, -12.5, -9]) P.thin([[-7, y], [7, y]], shade(red, -0.4), 0.5);
		P.poly([[-8, -7], [-6, -3], [-3, -7]], red); P.poly([[3, -7], [6, -3], [8, -7]], red);
		for (const s of [-1, 1]) P.ellipse(s * 8.5, -18, 3.4, 2.6, shade(red, 0.1));
		P.ellipse(-9, -13, 2.4, 3.6, red);
		P.ellipse(9.5, -12, 2.4, 3.4, red);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 4, -33); p.q(s * 11, -36, s * 11, -44); p.q(s * 8.5, -38, s * 3, -35.5); }, horn, s < 0 ? -11 : 3, s < 0 ? -3 : 11);
		P.shape((p) => { p.m(-8, -26); p.q(-8, -36, 0, -36); p.q(8, -36, 8, -26); p.l(10, -24); p.l(-10, -24); }, red, -10, 10);
		P.ellipse(0, -24, 5.6, 4.6, skin);
		P.dot(-2.2, -25.5, 1, '#ffd23f'); P.dot(2.2, -25.5, 1, '#ffd23f');
		P.thin([[-3.6, -27], [-1, -26.4]], '#3a1a10', 0.5); P.thin([[3.6, -27], [1, -26.4]], '#3a1a10', 0.5);
		P.ellipse(0, -21.8, 2.4, 1.1, '#5a1a14', { line: false });
		P.poly([[-1.6, -22.2], [-1, -22.2], [-1.3, -20.8]], '#f3ece0', { line: false }); P.poly([[1.6, -22.2], [1, -22.2], [1.3, -20.8]], '#f3ece0', { line: false });
	},
	// Troll (also the 1B boss): hunched, huge belly, underbite with tusks, green wraps, a cord necklace, sword hilts on its back
	212(P) {
		P.shadow(15, 6);
		const skin = '#d9a77a', wrap = '#5d7a3c';
		for (const [x0, y0, x1, y1, gx, gy] of [[-6, -24, -10, -36, -7.4, -28.6], [6, -24.5, 9.5, -35, 7.2, -28.4]]) {
			P.line([[x0, y0], [x1, y1]], '#6a4a30', 1.2);
			P.line([[gx - 1.8, gy + 0.6], [gx + 1.8, gy - 0.6]], '#7a7f8a', 0.9);
			P.dot(x1, y1, 0.9, '#9aa0aa');
		}
		P.line([[-5, -6], [-6, -1]], shade(skin, -0.05), 4.5); P.line([[5, -6], [6, -1]], shade(skin, -0.05), 4.5);
		P.line([[-5.3, -5], [-5.7, -2.5]], wrap, 4.6); P.line([[5.3, -5], [5.7, -2.5]], wrap, 4.6);
		P.ellipse(-6.5, -0.8, 3.4, 1.8, '#3e3428'); P.ellipse(6.5, -0.8, 3.4, 1.8, '#3e3428');
		P.ellipse(0, -14, 13.5, 12, skin);
		P.ellipse(0.5, -11.5, 9, 7.5, '#e8c39d', { line: false });
		P.gloss(-6, -19, 3.5, 2);
		P.shape((p) => { p.m(-12, -6.5); p.q(0, -3.5, 12, -6.5); p.l(9, -1.5); p.q(0, 0.5, -9, -1.5); }, wrap, -12, 12);
		for (const s of [-1, 1]) {
			P.line([[s * 11, -19], [s * 15, -11], [s * 14, -6]], skin, 4.6);
			P.line([[s * 14.6, -9.5], [s * 14.3, -7.5]], wrap, 4.8);
			P.circle(s * 14, -4.6, 2.8, skin);
		}
		P.line([[-5, -22], [0, -18.5], [5, -22]], '#7d3fb0', 0.6);
		P.dot(0, -18, 1.2, '#9a5ad0');
		P.circle(0, -25.5, 6.4, skin);
		for (const s of [-1, 1]) P.ellipse(s * 6.2, -26.5, 1.4, 2, shade(skin, -0.1));
		P.thin([[-4, -28.6], [-1, -27.8]], '#5a3a22', 0.7); P.thin([[4, -28.6], [1, -27.8]], '#5a3a22', 0.7);
		P.dot(-2.2, -27.2, 0.8, '#1a120a'); P.dot(2.2, -27.2, 0.8, '#1a120a');
		P.ellipse(0, -22.4, 4.6, 2.4, shade(skin, -0.08));
		P.ellipse(0, -23, 3, 0.9, '#6a2020', { line: false });
		P.poly([[-2.6, -22.4], [-1.6, -22.4], [-2.2, -25.4]], '#f3ece0'); P.poly([[2.6, -22.4], [1.6, -22.4], [2.2, -25.4]], '#f3ece0');
	},
	// Gnoll chieftain (1C boss): horned skull helm with a red eye, spiked pauldrons, dark armour, red tabard, bone claws
	213(P) {
		P.shadow(14, 5.5);
		const bone = '#e9e1cc', armour = '#4a3a3a', fur = '#3a2d2a';
		legs(P, fur, '#2a201c');
		torso(P, -22, 8, -6, 8.5, armour);
		P.thin([[-6, -16], [6, -16]], shade(armour, -0.4), 0.5);
		P.shape((p) => { p.m(-2.5, -16); p.l(2.5, -16); p.l(1.8, -2.5); p.l(0, -0.5); p.l(-1.8, -2.5); }, '#b2342c', -2.5, 2.5);
		for (const x of [-5.5, 5.5]) { P.circle(x, -8.5, 1.5, bone); P.dot(x - 0.5, -8.7, 0.35, '#2a1a1a'); P.dot(x + 0.5, -8.7, 0.35, '#2a1a1a'); }
		for (const s of [-1, 1]) {
			P.line([[s * 9, -18], [s * 11, -11]], armour, 3.2);
			for (const k of [-1, 0, 1]) P.shape((p) => { p.m(s * 10.5, -10); p.q(s * (16 + k), -9 + k * 2, s * (17 + k * 0.5), -1 + k * 1.6); p.q(s * (13.5 + k), -6 + k, s * 10, -8.6); }, bone, s < 0 ? -18 : 10, s < 0 ? -10 : 18);
			P.ellipse(s * 9.5, -20, 4.8, 3.6, '#5e4a44');
			P.poly([[s * 8, -22.5], [s * 9, -27], [s * 10.4, -23]], bone);
			P.poly([[s * 11, -21.5], [s * 13.5, -24.5], [s * 13, -20]], bone);
		}
		P.circle(0, -28, 8, fur);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 3.5, -33.5); p.q(s * 13, -43, s * 16, -33); p.q(s * 13, -36.5, s * 6.5, -31.5); }, bone, s < 0 ? -16 : 3.5, s < 0 ? -3.5 : 16);
		P.shape((p) => { p.m(-5.5, -32); p.q(0, -37, 5.5, -32); p.q(6, -26, 3.2, -21); p.q(0, -19.5, -3.2, -21); p.q(-6, -26, -5.5, -32); }, bone, -6, 6);
		P.ellipse(-2.3, -28.5, 1.6, 1.9, '#1a1010', { line: false }); P.ellipse(2.3, -28.5, 1.6, 1.9, '#1a1010', { line: false });
		P.glow(-2.3, -28.5, 3, '#ff3b2a', 0.7);
		P.dot(-2.3, -28.5, 0.8, '#ff6a50');
		P.ellipse(0, -23.5, 1.2, 0.8, '#2a1a1a', { line: false });
		for (const x of [-1.8, 0, 1.8]) P.thin([[x, -22.4], [x, -21]], '#5a4a3a', 0.35);
	},
	// Snotling warlord: a small hooded green goblin on a saddled, harnessed giant rat (long hunched body, big head and ear,
	// orange eye, bared teeth, long pink tail), holding the reins and a pole topped with a spiked axe. Drawn facing left;
	// mirrored (FACE_RIGHT).
	215(P) {
		P.shadow(18, 5.5);
		const rat = '#6b4e3a', belly = '#8a6a50', strap = '#5a3a22', leather = '#8a5a34', goblin = '#7cae4a', cloak = '#4a4458';
		// tail and far legs
		P.line([[12, -5], [17, -3], [21, -6], [22, -10]], '#c9897a', 1);
		P.line([[7, -6], [8.5, -1]], shade(rat, -0.25), 2.6);
		P.line([[-8, -6], [-9.5, -1]], shade(rat, -0.25), 2.2);
		// body: a long, low, hunched back from rump to shoulders
		P.shape((p) => { p.m(13, -4); p.q(15, -12, 8, -16); p.q(1, -19, -7, -15); p.q(-11, -12.5, -11, -8); p.q(-10, -3.5, -5, -3); p.q(4, -1.5, 13, -4); }, rat, -11, 15);
		P.shape((p) => { p.m(-6, -5.8); p.q(1, -3.4, 10, -4.8); p.q(4, -7.2, -6, -5.8); }, belly, -6, 10, { line: false });
		for (const [x0, y0, x1, y1] of [[8, -14.5, 10, -12], [3, -16.5, 5, -13.8], [-2, -16, 0, -13.2], [11, -10, 12.6, -7.8]]) P.thin([[x0, y0], [x1, y1]], shade(rat, -0.35), 0.45);
		// near legs: a bunched haunch and a front leg, with claws
		P.ellipse(8.5, -8, 4.6, 4, rat);
		P.line([[9.5, -5], [11, -1]], rat, 2.4);
		P.line([[-7, -7], [-8, -1]], rat, 2.2);
		for (const x of [11, -8]) for (const d of [-1, 0, 1]) P.thin([[x + d * 0.6, -0.6], [x + d * 0.9 - 0.7, 0.6]], '#efe6dc', 0.3);
		// saddle with a bag and a girth strap
		P.thin([[1.5, -17], [0.5, -3.5]], strap, 0.7);
		P.shape((p) => { p.m(-4, -17.4); p.q(1.5, -19.8, 7, -16.8); p.l(6.5, -14); p.q(1.5, -16, -3.5, -14.6); }, leather, -4, 7);
		P.shape((p) => { p.m(6.5, -15); p.l(11, -13.4); p.l(10.5, -9.2); p.l(6, -10.2); }, '#9a6a40', 6, 11);
		P.thin([[8.6, -14.1], [8.3, -9.8]], strap, 0.5); P.dot(8.4, -11.6, 0.5, '#d9b24a');
		// head: big skull reaching forward, round ear, orange eye, snout with a harness and bared teeth
		P.ellipse(-13, -9.5, 6.5, 5, rat);
		P.shape((p) => { p.m(-16, -12.5); p.q(-21, -11, -22, -7.5); p.q(-21, -5, -17.5, -5.3); p.q(-15, -6.5, -16, -12.5); }, rat, -22, -15);
		P.dot(-21.8, -8, 1, '#e88a9a');
		P.poly([[-19.6, -5.6], [-18.6, -5.6], [-19, -3.4]], '#f3ece0'); P.poly([[-18.3, -5.6], [-17.3, -5.4], [-17.8, -3.6]], '#f3ece0');
		P.thin([[-20, -9.6], [-16.5, -5.8]], strap, 0.6); P.thin([[-16.5, -11.2], [-15, -5.6]], strap, 0.6);
		P.dot(-16.6, -8.4, 0.7, '#c9a24a');
		P.circle(-10, -14.5, 3, rat); P.circle(-10, -14.5, 1.8, '#c28a7a', { line: false });
		P.glow(-15, -11, 2.6, '#ff9a2a', 0.65); P.dot(-15, -11, 1, '#ffb04a'); P.dot(-14.8, -11.3, 0.35, '#fff3d0');
		for (const k of [-1, 1]) P.thin([[-21, -7.6], [-24.5, -7.6 + k * 1.5]], '#d9c9b9', 0.25);
		// reins from the harness ring to the rider's hand
		P.thin([[-16.6, -8.4], [-7.5, -16.5], [-4.8, -18.6]], '#3a2414', 0.4);
		// rider (small): leg, pole with a spiked axe head leaning forward, torso, belt, arms
		P.line([[-0.5, -17], [-1.5, -13.5], [-0.5, -12.2]], goblin, 1.4);
		P.ellipse(-0.2, -12, 1.4, 0.9, '#3a2c22');
		P.line([[-1, -14], [-12, -40]], '#5a3a22', 0.9);
		P.shape((p) => { p.m(-11.4, -38.8); p.q(-17.5, -40, -18, -34.5); p.q(-15.5, -36.8, -12.6, -36.6); }, '#4a4a52', -18, -11.4);
		P.poly([[-12.2, -40.2], [-13.5, -44.5], [-11.2, -41.6]], '#4a4a52'); P.poly([[-11.6, -38.2], [-7.8, -40.8], [-10.6, -37.2]], '#4a4a52');
		torso(P, -23.5, 2.9, -17, 3.8, cloak);
		P.line([[-3.1, -19.2], [3.1, -19.2]], strap, 0.7);
		P.line([[-2.6, -21.6], [2.6, -18.2]], '#a33a2a', 0.5);
		P.line([[-2.2, -22], [-4.6, -18.8]], goblin, 1.1);
		P.circle(-4.8, -18.6, 0.8, goblin);
		P.line([[1.8, -22.2], [-1.2, -21.4], [-4.2, -21.6]], goblin, 1.1);
		P.circle(-4.2, -21.6, 0.9, goblin);
		// head: hooded, long ears, big eyes, a long nose and a grin
		for (const s of [-1, 1]) P.poly([[s * 3, -27.6], [s * 8, -29.4], [s * 3.4, -25.8]], goblin);
		head(P, -27.2, 3.9, goblin);
		P.eyes(-0.6, -27.4, 1.45, 0.9, '#7a2a0a');
		P.poly([[-1.2, -26.9], [-4.6, -25.3], [-1, -25.4]], shade(goblin, -0.05));
		P.thin([[-1.3, -24.4], [1.3, -24.6]], '#2a3a10', 0.4);
		P.shape((p) => { p.m(-4.4, -27.2); p.q(-5.1, -32.6, 0, -32.9); p.q(3.8, -33.1, 5.6, -35.2); p.q(5.6, -30.6, 4.4, -27.2); p.q(0, -31, -4.4, -27.2); }, cloak, -5.1, 5.6);
	},
	// Green slime: a dripping glossy blob with a skull and a dagger stuck inside it
	216(P) {
		P.shadow(13, 5);
		const goo = '#57c742';
		P.shape((p) => { p.m(-12, -2); p.q(-14, -14, -6, -20); p.q(0, -26, 7, -21); p.q(14, -15, 12, -2); p.q(10, 0, 8, -2); p.q(7, 1, 5, -1.5); p.q(2, 1, 0, -1.5); p.q(-3, 1, -5, -1.5); p.q(-8, 1, -12, -2); }, goo, -14, 14, { alpha: 0.92 });
		P.ellipse(-4, 0.6, 1.3, 1.6, goo); P.ellipse(6, 0.3, 1.1, 1.4, goo);
		P.line([[-8, -16], [-12, -25]], '#6a4a2a', 1);
		P.line([[-9.6, -18.4], [-6.2, -20]], '#9aa0aa', 0.8);
		P.dot(-12.2, -25.6, 0.8, '#c9a24a');
		// a skull floating near the top is its face; below it, a wide gooey mouth
		P.circle(2, -16, 4.2, '#e8f2d8', { alpha: 0.88 });
		P.ellipse(0.5, -16, 1.2, 1.4, '#1f3a14', { line: false }); P.ellipse(3.5, -16, 1.2, 1.4, '#1f3a14', { line: false });
		P.poly([[1.6, -13.8], [2.4, -13.8], [2, -14.6]], '#1f3a14', { line: false });
		P.shape((p) => { p.m(-6, -9.5); p.q(1, -12, 8, -9.5); p.q(6, -4.5, 1, -4.5); p.q(-4, -4.5, -6, -9.5); }, '#1d4a12', -6, 8, { line: false });
		P.shape((p) => { p.m(-5, -9.2); p.q(1, -11, 7, -9.2); p.q(1, -9.8, -5, -9.2); }, '#2f6e1e', -5, 7, { line: false });
		for (const x of [-2.5, 1, 4.5]) P.line([[x, -9.6], [x + 0.2, -7.2]], '#7ed866', 0.5);
		P.gloss(-5, -17, 3.4, 1.8, 0.6);
		P.gloss(7, -16, 1.2, 0.7, 0.5);
		for (const [x, y] of [[-9, -8], [9, -9], [-1, -19]]) P.dot(x, y, 0.8, '#b8f0a0');
	},
	// Nosferatu: a pale blue ghoul trailing off into a wisp, bat ears, fangs, ribs, long clawed arms
	217(P) {
		P.shadow(9, 3.5, 2, 0.2);
		const skin = '#7fb0e0', dark = '#2c3f6e';
		P.glow(0, -18, 16, '#6aa0ff', 0.18);
		P.shape((p) => { p.m(-5, -20); p.l(5, -20); p.q(7, -10, 2, -5); p.q(-2, -2, 2, 1); p.q(-6, -1, -4, -6); p.q(-7, -12, -5, -20); }, skin, -7, 7, { alpha: 0.9 });
		for (const y of [-17, -14.5, -12]) P.thin([[-4, y], [4, y + 0.3]], shade(skin, -0.35), 0.4);
		P.poly([[-5, -20], [-8, -26], [-3.5, -22]], dark); P.poly([[5, -20], [8, -26], [3.5, -22]], dark);
		for (const s of [-1, 1]) {
			P.line([[s * 5, -19], [s * 10, -15], [s * 11, -9]], skin, 1.4);
			for (const k of [-1, 0, 1]) P.thin([[s * 11, -9], [s * (11.5 + k * 0.8), -6.6]], '#1a2a4a', 0.4);
		}
		for (const s of [-1, 1]) P.poly([[s * 4.5, -30], [s * 11, -35], [s * 6, -26]], skin);
		head(P, -27, 6.5, skin);
		P.ellipse(-2.3, -27.5, 1.5, 1.2, '#14203a', { line: false }); P.ellipse(2.3, -27.5, 1.5, 1.2, '#14203a', { line: false });
		P.dot(-2.3, -27.5, 0.5, '#e8fbff'); P.dot(2.3, -27.5, 0.5, '#e8fbff');
		P.thin([[-2, -23.8], [2, -23.8]], '#14203a', 0.5);
		P.poly([[-1.2, -23.8], [-0.6, -23.8], [-0.9, -22.4]], '#ffffff', { line: false }); P.poly([[1.2, -23.8], [0.6, -23.8], [0.9, -22.4]], '#ffffff', { line: false });
	},
	// Hooded cultist: a tall pointed orange-brown hood with a dark face and glowing eyes, gold-trimmed robe, a skull in its hands
	218(P) {
		P.shadow(10, 4.5);
		const hood = '#b8682e', robe = '#8a4a24', gold = '#d9a62a';
		torso(P, -21, 6, -1, 9, robe);
		P.thin([[0, -20], [0, -2]], gold, 1);
		P.line([[-7, -10], [7, -10]], '#5a3a1a', 0.8);
		P.ellipse(-6.5, -14, 2.6, 4, robe); P.ellipse(6.5, -14, 2.6, 4, robe);
		P.circle(0, -13.5, 2.6, '#e9e1cc');
		P.dot(-0.9, -13.8, 0.55, '#2a1a1a'); P.dot(0.9, -13.8, 0.55, '#2a1a1a');
		P.ellipse(-3.2, -12.5, 1.6, 1.3, '#d9a77a'); P.ellipse(3.2, -12.5, 1.6, 1.3, '#d9a77a');
		P.shape((p) => { p.m(-8, -20); p.q(-9, -32, -2, -40); p.q(1, -45, 4, -46); p.q(2.5, -42, 3, -38); p.q(9, -30, 8, -20); p.q(0, -17, -8, -20); }, hood, -9, 9);
		P.thin([[-7.6, -20.5], [-2.4, -39]], gold, 0.6);
		P.ellipse(0, -26, 4.4, 5.4, '#2a1810', { line: false });
		P.glowEyes(0, -26.5, 1.7, 0.7, '#ffcc33');
	},
	// Butcher: a big pale stitched brute in a brown apron, cleaver in one hand, meat hook in the other
	219(P) {
		P.shadow(15, 6);
		const skin = '#e0b89a', apron = '#5a3a28';
		P.line([[-5, -6], [-6, -1]], '#5a4a3a', 4.2); P.line([[5, -6], [6, -1]], '#5a4a3a', 4.2);
		P.ellipse(-6.5, -0.8, 3.2, 1.7, '#3a2a1e'); P.ellipse(6.5, -0.8, 3.2, 1.7, '#3a2a1e');
		P.ellipse(0, -14, 12.5, 11.5, skin);
		P.gloss(-6, -19, 3.4, 1.9);
		P.shape((p) => { p.m(-7, -16); p.l(7, -16); p.q(9, -8, 8, -3); p.q(0, -1, -8, -3); p.q(-9, -8, -7, -16); }, apron, -9, 9);
		P.thin([[-7, -16], [-4, -24]], apron, 0.6); P.thin([[7, -16], [4, -24]], apron, 0.6);
		for (const [x0, y0, x1, y1] of [[-9, -20, -5, -21], [7, -10, 10, -12]]) {
			P.thin([[x0, y0], [x1, y1]], '#8a5a4a', 0.4);
			for (let t = 0.2; t < 1; t += 0.25) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; P.thin([[x - 0.3, y - 0.7], [x + 0.3, y + 0.7]], '#8a5a4a', 0.3); }
		}
		P.line([[-11, -18], [-14, -11]], skin, 4); P.circle(-14, -9.5, 2.5, skin);
		P.line([[-14, -9], [-14.5, -4]], '#5a3a22', 1);
		P.poly([[-18.5, -9.5], [-14.6, -10.5], [-13.8, -4.5], [-17.5, -3.5]], '#c9ced8');
		P.line([[11, -18], [14, -11]], skin, 4); P.circle(14, -9.5, 2.5, skin);
		P.shape((p) => { p.m(14.6, -8); p.q(15, -3, 18, -3.5); p.q(20, -5, 18.6, -7.4); p.q(19.4, -4.5, 17.6, -4.7); p.q(16, -5.5, 15.6, -8); }, '#c9ced8', 14.6, 20);
		P.circle(0, -27, 5.6, skin);
		P.thin([[-3.2, -28.8], [-0.8, -28]], '#5a3a2a', 0.7); P.thin([[3.2, -28.8], [0.8, -28]], '#5a3a2a', 0.7);
		P.dot(-1.9, -27.2, 0.7, '#1a120a'); P.dot(1.9, -27.2, 0.7, '#1a120a');
		P.thin([[-1.6, -24.4], [1.6, -24.6]], '#6a3a2a', 0.5);
		P.thin([[2.6, -31.4], [3.6, -29.4]], '#8a5a4a', 0.35);
	},
	// Winged imp: an orange-brown imp with bat wings, a big round head, yellow eyes, a toothy grin and a spade tail
	220(P) {
		P.shadow(8, 3.2, 2, 0.2);
		const skin = '#c9853a', wing = '#d97a3a';
		for (const s of [-1, 1]) {
			P.shape((p) => { p.m(s * 3, -20); p.q(s * 10, -34, s * 19, -32); p.q(s * 17, -28, s * 18.5, -24); p.q(s * 15, -24, s * 14, -21); p.q(s * 10, -22, s * 9, -18); p.q(s * 6, -20, s * 3, -17); }, wing, s < 0 ? -19 : 3, s < 0 ? -3 : 19);
			for (const [x, y] of [[19, -32], [18.5, -24], [14, -21]]) P.thin([[s * 4, -19], [s * x, y]], shade(wing, -0.45), 0.35);
		}
		P.thin([[2, -10], [7, -6], [9, -9]], '#8a4a20', 0.5);
		P.poly([[9, -9], [10.6, -10.8], [10.4, -8.2]], '#8a4a20');
		for (const s of [-1, 1]) P.line([[s * 2, -11], [s * 4.5, -7], [s * 3, -4]], skin, 1.2);
		P.ellipse(0, -14, 4, 5, skin);
		for (const s of [-1, 1]) P.line([[s * 3.5, -16], [s * 7, -13], [s * 8, -15]], skin, 1);
		for (const s of [-1, 1]) P.poly([[s * 3.5, -31], [s * 5.5, -35], [s * 5.4, -30]], '#7a4a24');
		head(P, -25, 7, skin);
		for (const s of [-1, 1]) { P.dot(s * 2.7, -26, 1.9, '#ffe066'); P.dot(s * 2.7, -26, 0.8, '#2a1a0a'); }
		P.shape((p) => { p.m(-3.5, -22.5); p.q(0, -19.6, 3.5, -22.5); p.q(0, -21.6, -3.5, -22.5); }, '#5a1a10', -3.5, 3.5, { line: false });
		for (const x of [-2, -0.7, 0.7, 2]) P.poly([[x - 0.5, -22.2], [x + 0.5, -22.2], [x, -21.2]], '#ffffff', { line: false });
	},
	// Treenemy: a tree trunk with an angry face and glowing eyes, root feet, branch arms and autumn-orange leaves
	221(P) {
		P.shadow(13, 5);
		const bark = '#8a5a34', leaf = '#f0a020';
		for (const s of [-1, 1]) P.line([[s * 4, -6], [s * 9, -3], [s * 11, 0]], bark, 2.2);
		P.line([[0, -5], [0.5, 0]], bark, 2.2);
		for (const s of [-1, 1]) P.line([[s * 5, -18], [s * 11, -24], [s * 13, -30]], bark, 2);
		P.line([[-11, -24], [-15, -23]], bark, 1.2); P.line([[11, -24], [15, -25]], bark, 1.2);
		P.shape((p) => { p.m(-6, -2); p.q(-9, -2, -8, -6); p.q(-6, -14, -7, -30); p.q(0, -34, 7, -30); p.q(6, -14, 8, -6); p.q(9, -2, 6, -2); }, bark, -9, 9);
		for (const [x0, y0, x1, y1] of [[-3, -8, -2.5, -15], [3.5, -9, 3, -16], [-4.5, -26, -4, -31]]) P.thin([[x0, y0], [x1, y1]], shade(bark, -0.35), 0.45);
		for (const [x, y, r] of [[-13, -31, 3], [13, -31, 3], [-16, -23, 2.2], [16, -25, 2.2], [-6, -34, 4], [0, -37, 4.4], [6, -34, 4], [-3, -40, 3.2], [3.5, -40, 3]]) P.circle(x, y, r, leaf);
		for (const [x, y] of [[-1, -38], [5, -35], [-6, -35]]) P.gloss(x, y, 1.2, 0.7, 0.5);
		P.thin([[-4.8, -22.6], [-1.2, -21.4]], '#2a1808', 0.8); P.thin([[4.8, -22.6], [1.2, -21.4]], '#2a1808', 0.8);
		P.glowEyes(0, -20, 2.7, 0.9, '#ffcc33');
		P.ellipse(0, -15.2, 2.6, 1.3, '#2a1808', { line: false });
	},
	// Gnoll shaman: a hunched, lanky dark-purple creature with a horned animal-skull mask, spiky mane and long claws
	222(P) {
		P.shadow(11, 4.5);
		const fur = '#4a4060', bone = '#e3dccb';
		for (const s of [-1, 1]) {
			P.line([[s * 3, -9], [s * 5, -5], [s * 3.5, -1.5]], fur, 2.2);
			P.ellipse(s * 4.2, -1, 2.4, 1.3, shade(fur, -0.3));
		}
		torso(P, -19, 5, -8, 6, fur);
		P.poly([[-6, -8], [-4, -4], [-2, -8], [0, -3.5], [2, -8], [4, -4], [6, -8]], '#3a2f4a');
		for (const s of [-1, 1]) {
			P.line([[s * 5, -17], [s * 10, -11], [s * 12, -4]], fur, 1.5);
			for (const k of [-1, 0, 1]) P.thin([[s * 12, -4], [s * (12.4 + k), -1.6]], bone, 0.5);
		}
		for (const [x, y] of [[-8, -24], [-6, -29], [-2, -31], [2, -31], [6, -29], [8, -24]]) P.poly([[x * 0.6, y * 0.85], [x * 1.25, y * 1.02], [x * 0.9, y * 0.75]], '#6a5a8a');
		P.circle(0, -24, 6.5, fur);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 3, -28.5); p.q(s * 9, -33, s * 12, -28); p.q(s * 9, -30, s * 5, -26.5); }, bone, s < 0 ? -12 : 3, s < 0 ? -3 : 12);
		P.shape((p) => { p.m(-4.5, -27); p.q(0, -31, 4.5, -27); p.q(4.6, -22.5, 2, -18.5); p.q(0, -17, -2, -18.5); p.q(-4.6, -22.5, -4.5, -27); }, bone, -4.6, 4.6);
		P.ellipse(-1.9, -24.4, 1.2, 1.4, '#1a1420', { line: false }); P.ellipse(1.9, -24.4, 1.2, 1.4, '#1a1420', { line: false });
		P.dot(-1.9, -24.4, 0.45, '#c9a8ff'); P.dot(1.9, -24.4, 0.45, '#c9a8ff');
		P.dot(-0.6, -19.6, 0.4, '#3a2a2a'); P.dot(0.6, -19.6, 0.4, '#3a2a2a');
	},
	// Skeleton pirate: a skull in a red bandana, purple-blue coat with gold buttons, red sash, white shirt, a cutlass
	223(P) {
		P.shadow(10, 4.5);
		const bone = '#e9e3d2', coat = '#4a4aa8', red = '#c8344a';
		legs(P, '#2e2a3a', '#5a3a22');
		P.shape((p) => { p.m(-5.5, -20); p.l(5.5, -20); p.q(8, -12, 8.5, -4); p.l(4, -6); p.l(-4, -6); p.l(-8.5, -4); p.q(-8, -12, -5.5, -20); }, coat, -8.5, 8.5);
		P.shape((p) => { p.m(-2.5, -20); p.l(2.5, -20); p.l(2, -10); p.l(-2, -10); }, '#f2efe6', -2.5, 2.5);
		P.line([[-5.5, -10.5], [5.5, -10.5]], red, 1.6);
		P.line([[3, -10], [5, -6.5]], red, 0.9);
		for (const y of [-17, -14]) { P.dot(-3.4, y, 0.55, '#e8c040'); P.dot(3.4, y, 0.55, '#e8c040'); }
		P.ellipse(-8, -15, 2.4, 3.8, coat);
		P.line([[-8.5, -11.5], [-9, -9.5]], bone, 0.9);
		P.ellipse(8, -14, 2.4, 3.6, coat);
		P.line([[9, -11], [10, -9]], bone, 0.9);
		curvedBlade(P, 10, -9, 17, -6, 15, 2, 1.4);
		P.line([[9, -10.5], [11.5, -8.5]], '#c9a24a', 0.7);
		skull(P, 0, -26.5, 7, bone);
		P.shape((p) => { p.m(-7.4, -27); p.q(-7.5, -34.5, 0, -34.5); p.q(7.5, -34.5, 7.4, -27); p.q(0, -29.5, -7.4, -27); }, red, -7.5, 7.5);
		for (const k of [0, 1]) P.dot(-3 + k * 4, -31.4, 0.5, '#f2efe6');
		P.shape((p) => { p.m(6.5, -29); p.q(10, -28.5, 11, -25); p.q(9, -26.5, 7, -26.5); }, red, 6.5, 11);
	},
	// Mushroomonster: a big green spotted cap over a pale stem with a skull face, little green arms and legs
	224(P) {
		P.shadow(11, 4.5);
		const cap = '#7cc23a', stem = '#cfe6a8', limb = '#6fae3a';
		for (const s of [-1, 1]) {
			P.line([[s * 3, -6], [s * 4, -2]], limb, 2);
			P.ellipse(s * 4.4, -1.1, 2.2, 1.3, shade(limb, -0.2));
			P.line([[s * 5, -13], [s * 9, -10], [s * 10, -7]], limb, 1.4);
		}
		// the cap's pale underside with its gills, the stem rising out of it
		P.ellipse(0, -22, 14, 6.2, '#dcdf9e');
		for (let a = 0.18; a < Math.PI - 0.12; a += 0.22) P.thin([[Math.cos(a) * 5, -22 + Math.sin(a) * 2.2], [Math.cos(a) * 13.3, -22 + Math.sin(a) * 5.8]], '#8f9c52', 0.35);
		P.shape((p) => { p.m(-5.5, -21); p.l(5.5, -21); p.q(7, -10, 5, -5); p.q(0, -3.5, -5, -5); p.q(-7, -10, -5.5, -21); }, stem, -7, 7);
		P.ellipse(-2, -14.5, 1.5, 1.7, '#2a3a18', { line: false }); P.ellipse(2, -14.5, 1.5, 1.7, '#2a3a18', { line: false });
		P.poly([[-0.4, -12.4], [0.4, -12.4], [0, -13.2]], '#2a3a18', { line: false });
		P.ellipse(0, -9.6, 2.4, 1.1, '#2a3a18', { line: false });
		for (const k of [-1, 0, 1]) P.thin([[k * 0.8, -10.6], [k * 0.8, -8.6]], stem, 0.3);
		P.shape((p) => { p.m(-14, -21); p.q(-14, -37, 0, -37); p.q(14, -37, 14, -21); p.q(0, -29, -14, -21); }, cap, -14, 14);
		for (const [x, y, r] of [[-7, -28, 2], [0, -31.5, 2.3], [7, -28, 2], [-10.5, -24, 1.3], [10.5, -24, 1.3], [-3, -28.5, 1.4], [4, -29, 1.2]]) P.ellipse(x, y, r, r * 0.8, '#e2f4b8', { line: false });
		P.gloss(-6, -32, 3, 1.4, 0.5);
	},
	// Bone Dragon: a crouching skeletal dragon, head held low on a curving neck, ribcage and spine, ragged grey wings spread
	// above, tail curling up behind; a horned skull with a green eye. Drawn facing left; mirrored (FACE_RIGHT).
	268(P) {
		P.shadow(19, 6);
		const bone = '#d9d4b0', dark = '#6a6550', wing = '#6f6f6a';
		// wings, the far one darker
		for (const [s, c, a] of [[1, shade(wing, -0.25), 0.95], [-1, wing, 0.92]]) {
			P.shape((p) => { p.m(s * 2 + 2, -17); p.q(s * 8 + 2, -40, s * 21 + 2, -44); p.l(s * 19 + 2, -36); p.l(s * 22 + 2, -31); p.l(s * 17 + 2, -27); p.l(s * 19 + 2, -22); p.l(s * 13 + 2, -21); p.q(s * 8 + 2, -19, s * 4 + 2, -13); }, c, s < 0 ? -21 : 2, s < 0 ? 0 : 23, { alpha: a });
			for (const [x, y] of [[21, -44], [22, -31], [19, -22]]) P.thin([[s * 3 + 2, -17], [s * x + 2, y]], shade(bone, -0.15), 0.7);
		}
		// tail curling up behind
		P.line([[10, -11], [14, -12], [17, -16], [16, -20], [18.5, -23]], bone, 1.3);
		for (const [x, y] of [[14, -12], [17, -16], [16, -20]]) P.dot(x, y, 0.9, shade(bone, -0.1));
		// far legs
		P.line([[7, -9], [10, -5], [9, -0.8]], shade(bone, -0.2), 1.3);
		P.line([[-5, -9], [-8, -5], [-10, -1]], shade(bone, -0.2), 1.3);
		// pelvis, spine and ribcage
		P.ellipse(8, -11, 3.4, 2.6, bone);
		P.line([[9, -12.5], [4, -15], [-2, -15.5], [-7, -13.5]], bone, 1.1);
		for (const x of [-5, -2.5, 0, 2.5, 5]) P.shape((p) => { p.m(x, -15.2); p.q(x - 2, -10.5, x - 0.4, -6.5); p.q(x - 0.9, -10.5, x + 0.9, -15); }, bone, x - 2, x + 1);
		P.thin([[-6, -6.8], [5, -6.4]], dark, 0.4);
		// near legs with claws
		P.line([[9, -10], [12, -6], [11, -1]], bone, 1.5);
		P.line([[-6, -10], [-10, -6.5], [-12.5, -1.5]], bone, 1.5);
		for (const x of [11, -12.5]) for (const d of [-1, 0, 1]) P.thin([[x, -1.3], [x - 1.2 + d * 0.9, 0.4]], bone, 0.35);
		// neck curving down to a low head
		for (const [x, y, r] of [[-8.5, -13.5, 1.9], [-11, -12.5, 1.8], [-13, -10.8, 1.7], [-14.6, -8.8, 1.6]]) P.circle(x, y, r, bone);
		// skull: horns swept back, long snout pointing down and forward, a green eye, teeth
		for (const s of [0, 1]) P.shape((p) => { p.m(-15 + s * 1.6, -10); p.q(-12 + s * 2, -14.5, -9 + s * 2.4, -15.5); p.q(-11.5 + s * 2, -12.5, -13.5 + s * 1.6, -9); }, shade(bone, -0.12), -15, -6.5);
		P.shape((p) => { p.m(-13.5, -10); p.q(-17, -11.5, -19.5, -8.5); p.q(-22, -6, -22.5, -3.5); p.q(-20, -3.5, -17.5, -4.5); p.q(-14, -5, -12.8, -7.5); p.q(-12.5, -9, -13.5, -10); }, bone, -22.5, -12.5);
		P.shape((p) => { p.m(-17, -4.6); p.q(-20, -3.4, -22, -2); p.q(-19, -1.6, -16.5, -3.2); }, shade(bone, -0.08), -22, -16.5);
		for (const x of [-21, -19.8, -18.6]) P.thin([[x, -3.9], [x + 0.1, -2.9]], '#f4f0e0', 0.35);
		P.ellipse(-16.3, -8, 1.5, 1.2, '#1a1a12', { line: false });
		P.glow(-16.3, -8, 2.8, '#6aff7a', 0.7); P.dot(-16.3, -8, 0.6, '#b8ffb8');
		P.dot(-21.3, -5.4, 0.45, '#2a2618');
	},
	// ---- dungeon level 2 (2A-2C) ----
	// Goblin: a grey-green goblin in purple armour under a pink hood, big ears and nose, a pale curved blade held low.
	// Drawn facing left; mirrored (FACE_RIGHT).
	228(P) {
		P.shadow(10, 4.5);
		const skin = '#8f9f76', armour = '#5a3f86', hood = '#c8467a';
		legs(P, '#3e305a', '#2a2238');
		torso(P, -19, 5, -6, 6.5, armour);
		for (const y of [-15, -11.5]) P.thin([[-5.5, y], [5.5, y]], shade(armour, -0.4), 0.5);
		P.line([[-6, -8], [6, -8]], '#7a4a2a', 1.2);
		P.shape((p) => { p.m(-6, -20); p.q(-8, -14, -6.5, -9); p.l(-3, -12); p.q(0, -17, 6, -20); p.q(9, -16, 9, -9); p.l(11, -13); p.q(11, -22, 4, -23); p.l(-4, -23); }, hood, -8, 11);
		P.line([[5.5, -16], [8, -11.5]], skin, 1.6);
		for (const k of [-1, 0, 1]) P.thin([[8, -11.5], [8.6 + k * 0.6, -9.6]], '#3a3a2a', 0.35);
		P.line([[-5.5, -16], [-8.5, -11]], skin, 1.6);
		P.line([[-8.6, -10.8], [-9.4, -9]], '#4a3a2a', 1);
		curvedBlade(P, -9, -9.4, -16, -9, -18, -2, 1.6);
		for (const sd of [-1, 1]) P.poly([[sd * 5, -26.5], [sd * 11.5, -29.5], [sd * 6, -23.5]], skin);
		head(P, -25, 6.2, skin);
		P.eyes(-0.8, -25.6, 2.3, 1.35, '#a8201a', -1);
		P.poly([[-1.5, -24.3], [-6.2, -21.6], [-1.2, -22.4]], shade(skin, -0.05));
		P.shape((p) => { p.m(-3.6, -20.8); p.q(-0.5, -18.8, 2.6, -20.6); p.q(-0.5, -19.8, -3.6, -20.8); }, '#3a1a1a', -3.6, 2.6, { line: false });
		P.shape((p) => { p.m(-6.6, -26); p.q(-7.5, -33, 0, -33.5); p.q(6, -33.5, 9, -29); p.q(11, -26, 12.5, -23); p.q(8, -25.5, 6, -27.5); p.q(0, -30.5, -6.6, -26); }, hood, -7.5, 12.5);
	},
	// Harpy: a woman with orange-brown wings spread above her, spiky hair, a feathered skirt, bird legs and a sickle
	229(P) {
		P.shadow(10, 4, 1.5, 0.22);
		const wing = '#c9773a', skin = '#d9955e', feather = '#8a4a24';
		for (const sd of [-1, 1]) {
			P.shape((p) => { p.m(sd * 3, -22); p.q(sd * 8, -38, sd * 18, -42); p.l(sd * 16, -37); p.l(sd * 21, -36); p.l(sd * 17, -31.5); p.l(sd * 21, -29); p.l(sd * 16, -26); p.l(sd * 18.5, -22); p.q(sd * 10, -21, sd * 4, -17); }, wing, sd < 0 ? -21 : 3, sd < 0 ? -3 : 21);
			for (const [x, y] of [[18, -42], [21, -36], [21, -29], [18.5, -22]]) P.thin([[sd * 5, -21], [sd * x * 0.92, y * 0.95]], shade(wing, -0.35), 0.35);
		}
		for (const sd of [-1, 1]) {
			P.line([[sd * 2.4, -8], [sd * 3, -4], [sd * 2.6, -1.6]], '#6a4a2a', 1.1);
			for (const k of [-1, 0, 1]) P.thin([[sd * 2.6, -1.6], [sd * (2.6 + k * 1.1), -0.2]], '#3a2a1a', 0.45);
		}
		P.shape((p) => { p.m(-5, -12); p.l(5, -12); p.l(6.5, -6); p.l(4, -7.5); p.l(2.5, -5); p.l(0, -7); p.l(-2.5, -5); p.l(-4, -7.5); p.l(-6.5, -6); }, feather, -6.5, 6.5);
		torso(P, -20, 4, -12, 4.6, skin);
		P.shape((p) => { p.m(-4, -18.5); p.q(0, -17, 4, -18.5); p.l(4, -16); p.q(0, -14.5, -4, -16); }, feather, -4, 4);
		P.line([[-4, -18], [-7, -13], [-6, -9]], skin, 1.3);
		P.line([[4, -18], [7, -13.5], [8, -11.5]], skin, 1.3);
		sword(P, 8.2, -11.2, 1.2, 9.5, 1.4);
		head(P, -26, 6.2, skin);
		P.eyes(0, -25.6, 2.3, 1.3, '#5a2a0a');
		P.mouth(0, -22.2, 0.9);
		for (const [x0, x1, y1] of [[-6, -9, -31], [-3.5, -5, -35], [0, 0.5, -36], [3.5, 5.5, -35], [6, 9, -31]]) P.poly([[x0 - 1.4, -28], [x1, y1], [x0 + 1.4, -28.5]], '#d9682a');
		P.shape((p) => { p.m(-6.4, -27); p.q(-5, -32.5, 0, -32.6); p.q(5, -32.5, 6.4, -27); p.q(0, -29, -6.4, -27); }, '#d9682a', -6.4, 6.4);
	},
	// Kobold: an orange hood over a snouted face with an open mouth, dark leather, a sickle-dagger in each hand
	230(P) {
		P.shadow(10, 4.5);
		const hood = '#e8892a', fur = '#7a5a48', leather = '#4a3428';
		for (const sd of [-1, 1]) {
			P.line([[sd * 2.6, -9], [sd * 4, -5], [sd * 3, -1.8]], fur, 2.2);
			P.ellipse(sd * 3.6, -1.2, 2.2, 1.3, shade(fur, -0.3));
		}
		P.thin([[3, -6], [9, -4], [11, -7]], fur, 0.8);
		torso(P, -19, 5, -7, 6.5, leather);
		P.line([[-6, -9], [6, -9]], '#6a4a2a', 1.1);
		for (const sd of [-1, 1]) {
			P.line([[sd * 5, -17], [sd * 8.5, -12], [sd * 9, -9.5]], fur, 1.5);
			P.line([[sd * 9, -9.5], [sd * 9.2, -7.6]], '#3a2a1e', 1);
			curvedBlade(P, sd * 9.4, -7.8, sd * 14, -9, sd * 13.5, -14, 1.1);
		}
		P.shape((p) => { p.m(-8, -19); p.q(-10, -31, 0, -33); p.q(8, -33, 9, -27); p.q(11, -25, 13, -23); p.q(10, -21.5, 8, -19); p.q(0, -16.5, -8, -19); }, hood, -10, 13);
		P.ellipse(0, -24.5, 5.4, 5.4, '#2a1a10', { line: false });
		P.ellipse(0, -22.5, 3.6, 3, fur);
		P.dot(0, -24.3, 0.9, '#1a120a');
		P.ellipse(0, -21, 2.2, 1.2, '#5a1a14', { line: false });
		P.poly([[-1.4, -21.9], [-0.8, -21.9], [-1.1, -20.6]], '#f3ece0', { line: false }); P.poly([[1.4, -21.9], [0.8, -21.9], [1.1, -20.6]], '#f3ece0', { line: false });
		P.glowEyes(0, -26.4, 2.2, 0.6, '#ffd23f');
	},
	// Croc zealot: a hunched crocodile warrior facing right in a brown hooded cloak (a small grey horn on the hood), a thick
	// tail, a pale scaly belly, a long toothy snout, a grey kite shield in front and a broad falchion
	231(P) {
		P.shadow(13, 5);
		const skin = '#5f9a34', belly = '#c9d98a', cloak = '#7a5a3a';
		P.shape((p) => { p.m(-3, -9); p.q(-11, -8, -14, -3); p.q(-15, 0, -11, 0.5); p.q(-12, -2, -8, -4); p.q(-4, -5.5, -2, -6); }, skin, -15, -2);
		P.shape((p) => { p.m(-2, -30); p.q(-9, -29, -10, -21); p.q(-11, -12, -10, -5); p.l(-8, -6.5); p.l(-6.5, -4.5); p.l(-5, -6.5); p.l(-3, -5); p.l(-1.5, -7); p.q(-2, -18, 2, -26); }, cloak, -11, 2);
		for (const x of [-8.5, -5.5]) P.thin([[x + 1.5, -26], [x, -8]], shade(cloak, -0.35), 0.45);
		for (const sd of [-1, 1]) {
			P.line([[sd * 3, -9], [sd * 3.6, -5], [sd * 3.2, -2]], skin, 3);
			P.ellipse(sd * 3.6, -1.2, 2.6, 1.3, shade(skin, -0.3));
			for (const k of [-1, 0, 1]) P.thin([[sd * 3.6 + k * 0.9, -0.6], [sd * 3.6 + k * 1.1 + 0.6, 0.4]], '#e9e2c8', 0.3);
		}
		P.shape((p) => { p.m(-5.5, -21); p.q(0, -23, 6, -21); p.q(7.5, -14, 6, -7.5); p.q(0, -5.5, -5.5, -7.5); p.q(-7, -14, -5.5, -21); }, skin, -7, 7.5);
		P.shape((p) => { p.m(-2, -20); p.q(1.5, -21, 4.5, -19.5); p.q(5, -13.5, 4, -8.5); p.q(1, -7.4, -2, -8.5); p.q(-3, -14, -2, -20); }, belly, -3, 5, { line: false });
		for (const y of [-17.5, -15, -12.5, -10]) P.thin([[-2.4, y], [4.6, y]], shade(belly, -0.3), 0.35);
		P.thin([[-4.5, -20.5], [5.5, -9]], '#6a4424', 0.9);
		P.shape((p) => { p.m(-3, -21.5); p.q(-1, -27, 3, -29); p.q(8, -30, 9, -27); p.l(7, -21); p.q(2, -19.5, -3, -21.5); }, skin, -3, 9);
		P.shape((p) => { p.m(6, -29); p.q(12, -29, 16.5, -26.4); p.q(17, -24, 14.5, -23.4); p.q(10, -22.8, 6.5, -23.2); }, skin, 6, 17);
		P.shape((p) => { p.m(6.5, -23.4); p.q(11, -23, 15, -23.3); p.q(13.5, -21.4, 9, -21.4); p.q(7, -21.6, 6.5, -23.4); }, shade(skin, 0.1), 6.5, 15);
		for (let x = 7.5; x < 15; x += 1.5) P.poly([[x, -23.4], [x + 0.6, -23.4], [x + 0.3, -22.4]], '#f3ece0', { line: false });
		P.dot(16, -26.4, 0.4, '#1a2a0a');
		P.shape((p) => { p.m(-4.5, -21); p.q(-5.5, -32, 2, -32.6); p.q(7.5, -32.8, 8.6, -28.8); p.q(4.5, -30.2, 1.5, -28.6); p.q(-1.5, -26, -1.5, -21); }, cloak, -5.5, 8.6);
		P.thin([[-2.6, -22], [-1.4, -28.6], [2.4, -30.6], [7.4, -30]], shade(cloak, 0.25), 0.4);
		P.shape((p) => { p.m(2.4, -32.2); p.q(3.2, -36.5, 6, -37); p.q(4.2, -35, 4.2, -32.2); }, '#5a5f68', 2.4, 6);
		P.shape((p) => { p.m(-6.2, -21.4); p.q(0, -23.4, 6.4, -21); p.q(5, -17.6, 0, -17.4); p.q(-5, -17.8, -6.2, -21.4); }, cloak, -6.2, 6.4);
		P.ellipse(6.2, -27.3, 2, 1.6, '#f0dc3a'); P.ellipse(6.6, -27.3, 0.55, 1.1, '#1a1208', { line: false });
		P.line([[5, -19], [8.5, -15], [10, -12.5]], skin, 2);
		sword(P, 10.4, -12.6, 0.45, 10.5, 2.6);
		P.line([[-5, -18.5], [-8, -15]], skin, 2);
		P.shape((p) => { p.m(-13, -21); p.l(-4.5, -21.5); p.q(-4, -11, -8.6, -5); p.q(-13.4, -11, -13, -21); }, '#9aa6b5', -13.4, -4);
		P.shape((p) => { p.m(-11, -19); p.l(-6.5, -19.2); p.q(-6.4, -13, -8.6, -9.5); p.q(-11.2, -13, -11, -19); }, '#5a6878', -11.2, -6.4, { line: false });
		P.gloss(-11, -19, 1.2, 0.6, 0.4);
	},
	// Boar shieldman: a bristly boar head facing right with tusks, a round wooden shield in front, an axe in the other hand
	232(P) {
		P.shadow(12, 5);
		const fur = '#6a4a3a', mane = '#2e221c';
		for (const sd of [-1, 1]) {
			P.line([[sd * 3, -9], [sd * 3.6, -5], [sd * 3.2, -2]], fur, 2.4);
			P.ellipse(sd * 3.4, -1.2, 2.2, 1.2, '#2a1e18');
		}
		P.line([[5, -10], [14, -18]], '#5a3a22', 1);
		P.shape((p) => { p.m(12.6, -16.4); p.q(19, -19, 19.5, -12.5); p.q(16.5, -13.5, 14, -13.8); }, '#5a5f68', 12.6, 19.5);
		torso(P, -20, 6, -6, 7, '#5a4030');
		P.line([[-6, -9], [6, -9]], '#3a2a1e', 1.2);
		for (let x = -6; x <= 4; x += 2.2) P.poly([[x, -22], [x + 1.2, -27.5 + Math.abs(x) * 0.2], [x + 2.2, -22]], mane);
		P.ellipse(3, -24.5, 6.2, 5.4, '#8a6450');
		P.shape((p) => { p.m(6, -26.5); p.q(11, -26.5, 12.5, -24); p.q(12.5, -21, 9, -20.5); p.q(6.5, -20.5, 6, -22); }, '#8a6450', 6, 12.5);
		P.ellipse(12, -23.4, 1.4, 1.9, '#c98a78');
		P.dot(11.8, -24, 0.3, '#3a1a14'); P.dot(11.9, -22.8, 0.3, '#3a1a14');
		for (const [x, y] of [[8.8, -21], [7.4, -21.3]]) P.shape((p) => { p.m(x, y); p.q(x + 1.6, y - 2.4, x + 0.6, y - 4.4); p.q(x - 0.2, y - 2.4, x - 0.8, y - 0.2); }, '#f3ece0', x - 1, x + 1.6);
		P.poly([[1, -28.6], [-0.6, -32.4], [3, -29.2]], '#8a6450');
		P.dot(5.4, -26, 0.9, '#1a120a'); P.dot(5.6, -26.3, 0.3, '#ffe9c0');
		P.circle(-5, -14, 7.6, '#7a5232');
		for (const a of [-0.8, 0, 0.8]) P.thin([[-5 + Math.sin(a) * 7, -14 - Math.cos(a) * 7], [-5 + Math.sin(a) * 7, -14 + Math.cos(a) * 7]], shade('#7a5232', -0.35), 0.4);
		P.circle(-5, -14, 2, '#9aa0aa');
		P.gloss(-8, -18, 1.8, 0.9, 0.4);
	},
	// Gnoll axeman: a spotted hyena head facing right, a mane, a studded leather pauldron, an axe over the shoulder
	233(P) {
		P.shadow(11, 4.8);
		const fur = '#9a7a5a', spot = '#5a4030', leather = '#5a3e2c';
		P.thin([[-4, -7], [-9, -6], [-11, -9]], fur, 1);
		for (const sd of [-1, 1]) {
			P.line([[sd * 2.8, -9], [sd * 4, -5], [sd * 3, -1.8]], fur, 2.2);
			P.ellipse(sd * 3.6, -1.2, 2.2, 1.3, '#3a2a1e');
		}
		torso(P, -20, 5.5, -6, 6.5, leather);
		P.thin([[-5, -18], [4, -8]], '#3a2818', 0.9);
		for (const [x, y] of [[-2, -14.5], [1, -11.5]]) P.dot(x, y, 0.45, '#c9b080');
		P.line([[7, -7], [-8, -32]], '#8a5a2a', 1.2);
		P.shape((p) => { p.m(-7, -30); p.q(-15, -34, -16, -25.5); p.q(-12.5, -27, -9.5, -26.6); }, '#7a7f8a', -16, -7);
		P.line([[-5, -17], [-3, -13], [1, -11.5]], fur, 1.6);
		P.line([[5, -17], [5, -13], [2.5, -10.5]], fur, 1.6);
		P.ellipse(-4.5, -19.5, 4.2, 3.2, '#4a3428');
		for (const x of [-6.5, -4.5, -2.5]) P.dot(x, -20.4, 0.5, '#c9b080');
		for (let x = -5; x <= 2; x += 1.8) P.poly([[x, -23], [x + 0.9, -27.5], [x + 1.8, -23]], spot);
		P.ellipse(1.5, -25, 5.6, 5, fur);
		P.shape((p) => { p.m(4.5, -27); p.q(10, -26.5, 11.5, -24); p.q(11, -21.5, 7.5, -21.2); p.q(5, -21.4, 4.5, -22.5); }, fur, 4.5, 11.5);
		P.dot(11.2, -24.4, 0.8, '#1a120a');
		P.thin([[6, -22.2], [10.6, -22.4]], '#3a1a10', 0.45);
		P.poly([[7.4, -22.3], [8, -22.3], [7.7, -21.3]], '#f3ece0', { line: false });
		for (const [x, y] of [[-1, -27], [2, -22], [-2.5, -23.5]]) P.dot(x, y, 0.7, spot);
		P.poly([[-1, -28.8], [-1.5, -33], [1.5, -29.4]], fur);
		P.dot(4.2, -26, 0.9, '#1a120a'); P.dot(4.4, -26.3, 0.3, '#ffe9a0');
	},
	// Minotaur (also the 2A boss): a dark brown bull head facing right with big cream horns and a nose ring, a muscular
	// body, a loincloth, a double-bladed axe held across it
	234(P) {
		P.shadow(13, 5);
		const fur = '#6a4a36', dark = '#3e2a20', horn = '#e9dcc0';
		P.thin([[-4, -7], [-10, -5], [-12, -8]], fur, 1);
		for (const sd of [-1, 1]) {
			P.line([[sd * 3.2, -9], [sd * 4, -5], [sd * 3.4, -2]], dark, 2.8);
			P.ellipse(sd * 3.6, -1.1, 2.4, 1.3, '#1e1612');
		}
		torso(P, -21, 7, -7, 7, fur);
		P.shape((p) => { p.m(-3.5, -19); p.q(0, -16.5, 3.5, -19); p.q(3, -13, 0, -12); p.q(-3, -13, -3.5, -19); }, shade(fur, 0.12), -3.5, 3.5, { line: false });
		P.shape((p) => { p.m(-6, -8); p.l(6, -8); p.l(4, -2.5); p.l(-4, -2.5); }, '#8a3a24', -6, 6);
		doubleAxe(P, -8, -4, 15.5, -18.5, 1.35);
		P.line([[-7, -19], [-9, -12], [-6, -9]], fur, 2.2);
		P.line([[7, -19], [8.5, -13], [5.5, -12]], fur, 2.2);
		P.ellipse(1, -25.5, 6, 5.4, fur);
		P.shape((p) => { p.m(4, -27.5); p.q(9.5, -27.5, 10.5, -24); p.q(10.5, -20.5, 6.5, -20.5); p.q(4, -20.8, 3.6, -22.5); }, shade(fur, 0.15), 3.6, 10.5);
		P.dot(9.6, -23.6, 0.45, '#1a120a'); P.dot(9.8, -22.4, 0.45, '#1a120a');
		P.thin([[9.6, -21.8], [10.6, -21.2], [10.2, -20.4]], '#d9b24a', 0.45);
		for (const sd of [-1, 1]) P.shape((p) => { p.m(sd * 3 + 1, -29); p.q(sd * 10 + 1, -30, sd * 11 + 1, -37); p.q(sd * 8 + 1, -32.5, sd * 4 + 1, -31.4); }, horn, sd < 0 ? -10 : 4, sd < 0 ? -2 : 12);
		P.dot(4, -26.2, 0.9, '#1a120a'); P.dot(4.2, -26.5, 0.3, '#ffd0a0');
		P.thin([[2.6, -27.6], [5, -27.2]], '#2a1a12', 0.5);
		P.poly([[-4, -27], [-7.5, -26], [-4.4, -25]], shade(fur, -0.1));
	},
	// Centauride: a woman's torso on a lion's body, long dark braids, a white top, a halberd held upright; faces right
	235(P) {
		P.shadow(16, 5);
		const lion = '#a8683a', skin = '#8a5a3a', hair = '#2a1a14';
		P.line([[-11, -11], [-15, -13], [-16, -18], [-14, -20]], lion, 1.1);
		P.dot(-14, -20.4, 1, '#5a3a24');
		for (const x of [-9, -5]) P.line([[x, -9], [x - 0.6, -4], [x, -1.4]], shade(lion, -0.15), 2);
		for (const x of [3, 7]) P.line([[x, -9], [x + 0.6, -4], [x, -1.4]], shade(lion, -0.15), 2);
		P.ellipse(-2, -11, 10.5, 5, lion);
		P.gloss(-6, -14, 3, 1.2, 0.4);
		for (const x of [-7.5, -3.5, 3.5, 7.5]) P.line([[x, -8], [x + (x > 0 ? 0.6 : -0.6), -4], [x, -1.5]], lion, 2);
		for (const x of [-7.5, -3.5, 3.5, 7.5]) P.ellipse(x, -1.2, 1.6, 1, shade(lion, -0.3));
		P.line([[11, 0], [12, -42]], '#5a3a22', 0.9);
		P.shape((p) => { p.m(12.1, -38); p.q(17.5, -39, 18, -33); p.q(15.5, -34.5, 12.2, -34); }, '#9aa0aa', 12, 18);
		P.poly([[11.6, -42], [12.4, -46], [12.8, -41.8]], '#9aa0aa');
		torso(P, -22, 3.8, -12, 4.4, skin);
		P.shape((p) => { p.m(-3.8, -20); p.q(0, -18.6, 3.8, -20); p.l(4, -17); p.q(0, -15.8, -4, -17); }, '#f2efe6', -4, 4);
		P.line([[-3.8, -14], [3.8, -14]], '#c9a24a', 0.6);
		P.line([[-3.6, -20.5], [-6, -16], [-4.5, -13]], skin, 1.2);
		P.line([[3.6, -20.5], [8, -19], [11.5, -21]], skin, 1.2);
		P.shape((p) => { p.m(-6, -28); p.q(-8, -18, -5.5, -14); p.l(-2, -17); p.q(-3, -22, -3.4, -26); }, hair, -8, -2);
		head(P, -27, 5.6, skin);
		P.eyes(0.4, -27, 2, 1.2, '#2a1408');
		P.mouth(0.4, -23.8, 0.8, '#4a1a10');
		P.shape((p) => { p.m(-5.8, -27.5); p.q(-5.5, -33.5, 0.5, -33.6); p.q(5.5, -33.4, 5.8, -28.5); p.q(2, -31, -5.8, -27.5); }, hair, -6, 6);
		for (const [x, y] of [[-6.6, -22], [-6.8, -18.5]]) P.dot(x, y, 0.6, '#c9a24a');
	},
	// Fanged beast (also the 2B boss): a hulking orange-furred beast with an animal skull worn on the side of its head, a
	// dark mane, fangs, a fur loincloth, a double axe; faces right
	236(P) {
		P.shadow(14, 5.5);
		const fur = '#c8603a', mane = '#4a3024', bone = '#ece2c8';
		for (const sd of [-1, 1]) {
			P.line([[sd * 4, -8], [sd * 5, -4.5], [sd * 4, -2]], fur, 3);
			P.ellipse(sd * 4.4, -1.2, 2.6, 1.3, '#4a2a1a');
		}
		P.ellipse(0, -14, 9, 8.5, fur);
		P.shape((p) => { p.m(-3, -19); p.q(1, -21, 5, -19); p.q(5, -12, 1, -10.5); p.q(-3, -12, -3, -19); }, '#e9d7b8', -3, 5, { line: false });
		P.shape((p) => { p.m(-8, -8); p.l(8, -8); p.l(6.5, -3.5); p.l(4, -5.5); p.l(1.5, -3); p.l(-1, -5.5); p.l(-3.5, -3); p.l(-6, -5.5); p.l(-8.5, -3.5); }, '#5a3a2a', -8.5, 8);
		P.line([[-8, -18], [-11, -11], [-9, -7]], fur, 2.4);
		P.line([[8, -18], [11, -12], [12, -8]], fur, 2.4);
		doubleAxe(P, 12.5, -2, 15.5, -29, 1);
		P.ellipse(1, -25, 8, 7, mane);
		for (const [x, y] of [[-6.5, -20], [-7.5, -24], [-6, -29]]) P.poly([[x + 1.5, y - 1], [x - 2.5, y + 0.5], [x + 1.5, y + 1.8]], mane);
		skull(P, -3, -27, 5.4, bone);
		// the snarling face below the skull: a pale muzzle, an angry eye under a heavy brow, a dark nose, big fangs
		P.ellipse(3, -23, 5.4, 4.6, fur);
		P.shape((p) => { p.m(4.5, -24.5); p.q(10.5, -24.5, 11, -21); p.q(10.5, -17.5, 6.5, -17.8); p.q(3.6, -18.4, 3.6, -21); }, '#f0c890', 3.6, 11);
		P.ellipse(10.4, -22.6, 1.1, 0.8, '#2a120a', { line: false });
		P.shape((p) => { p.m(5.2, -19.6); p.q(8, -20.6, 10.6, -19.6); p.q(8, -18.8, 5.2, -19.6); }, '#4a120a', 5.2, 10.6, { line: false });
		for (const x of [6.4, 9.2]) P.poly([[x - 0.6, -19.6], [x + 0.6, -19.6], [x, -17.4]], '#ffffff');
		P.dot(5, -24.6, 1.3, '#fff2c8'); P.dot(5.4, -24.6, 0.65, '#2a120a');
		P.line([[3, -26.6], [7, -25.6]], '#5a2a14', 0.7);
	},
	// Naga (2C boss): a four-armed woman with pointed ears and an auburn ponytail on a coiled snake tail: curved swords
	// raised in the upper hands, straight swords held down and out in the lower ones
	237(P) {
		P.shadow(13, 5);
		const scale = '#a8643a', belly = '#e0b07a', skin = '#d9a06a', hair = '#6a2a1a';
		P.ellipse(0, -2.6, 11.5, 4.4, scale);
		P.ellipse(1, -6.6, 9.5, 3.8, scale);
		P.line([[9, -3], [14, -2], [16, -5]], scale, 2);
		P.line([[1, -8], [-1, -12], [0, -15]], scale, 6);
		P.line([[1.6, -8.6], [-0.2, -12], [0.6, -14.6]], belly, 2.2);
		for (const sd of [-1, 1]) {
			P.line([[sd * 3.6, -20.5], [sd * 7.5, -16.5], [sd * 9.5, -17.5]], skin, 1.2);
			curvedBlade(P, sd * 9.6, -17.4, sd * 15, -22, sd * 13, -32, 1.3);
			P.line([[sd * 9.2, -18.2], [sd * 10.4, -16.6]], '#4a2a1a', 0.7);
		}
		torso(P, -21, 3.8, -14, 4.2, skin);
		P.shape((p) => { p.m(-3.8, -20.5); p.q(0, -19, 3.8, -20.5); p.l(3.9, -17.5); p.q(0, -16.2, -3.9, -17.5); }, '#6a3a20', -3.9, 3.9);
		// a second pair of arms below the first, each with a sword pointing down and out
		for (const sd of [-1, 1]) {
			P.line([[sd * 3.8, -16], [sd * 7, -13], [sd * 8.6, -10.6]], skin, 1.2);
			sword(P, sd * 8.8, -10.4, sd < 0 ? Math.PI - 0.75 : 0.75, 8.5, 1.3);
		}
		P.shape((p) => { p.m(3, -31); p.q(9, -32, 8.5, -22); p.q(7, -26, 4, -28); }, hair, 3, 9);
		for (const sd of [-1, 1]) P.poly([[sd * 5, -27.5], [sd * 8.5, -30], [sd * 5.4, -26]], skin);
		head(P, -27, 5.6, skin);
		P.eyes(0, -27, 2, 1.2, '#2a5a20');
		P.mouth(0, -23.8, 0.8, '#6a2a1a');
		P.shape((p) => { p.m(-5.8, -27.5); p.q(-5.5, -33.5, 0, -33.6); p.q(5.5, -33.4, 5.8, -27.5); p.q(1, -30.8, -5.8, -27.5); }, hair, -6, 6);
	},
	// ---- dungeon level 3 (3A-3C) ----
	// Spikeworm: a sandy segmented worm rearing out of an orange-spotted coil, a thorny back, a round orange lamprey mouth
	// ringed with teeth facing right, big curved tusks around it, a spiny frond at the tail tip
	225(P) {
		P.shadow(14, 5);
		const sand = '#b88e5c', coil = '#a8683a', thorn = '#e6d4aa', mouth = '#d9783a';
		// the coil lying on the ground: the body loops round from the back, across the front and out to the tail
		const ring = [];
		for (let a = 3.9; a >= -0.1; a -= 0.3) ring.push([-4 + Math.cos(a) * 9, -4.6 + Math.sin(a) * 3.4]);
		ring.push([9, -5.5], [12, -7.5]);
		P.line(ring, coil, 5.2);
		for (const [x, y, r] of [[-12, -3.6, 0.9], [-8, -1.6, 1.1], [-3, -1.2, 1], [2, -1.8, 1], [6.4, -3.4, 0.9]]) P.dot(x, y, r, '#e0a060');
		for (const [x, y] of [[-10.4, -2.2], [-0.4, -1], [4.2, -2.4]]) P.dot(x, y, 0.5, '#5a3016');
		// a spiny frond at the tail tip
		for (const a of [-2.4, -1.9, -1.4, -0.9, -0.4, 0.1]) P.ellipse(12.6 + Math.cos(a) * 2.7, -8 + Math.sin(a) * 2.7, 2.4, 0.95, shade(sand, -0.05), { rot: a });
		// the body rising in a curve, big thorns along its back, a paler belly at the front
		const segs = [[-6.5, -8.5, 5.6], [-7.5, -13.5, 5.5], [-7, -18.5, 5.4], [-5, -23, 5.3], [-1.5, -26.8, 5.3], [2.5, -29.5, 5.4]];
		for (const [x, y, r] of segs) P.shape((p) => { p.m(x - r * 0.4, y - r * 0.85); p.q(x - r * 1.3, y - r * 1.1, x - r * 1.9, y - r * 1.4); p.q(x - r * 1.3, y - r * 0.2, x - r * 0.95, y + r * 0.1); }, thorn, x - r * 1.9, x);
		for (const [x, y, r] of segs) {
			P.circle(x, y, r, sand);
			P.ellipse(x + r * 0.5, y + r * 0.1, r * 0.35, r * 0.65, '#d8b880', { line: false });
			P.thin([[x - r * 0.85, y + r * 0.45], [x + r * 0.85, y + r * 0.45]], shade(sand, -0.4), 0.4);
		}
		for (const [x, y] of [[-9.5, -12], [-9, -17], [-7, -22]]) P.dot(x, y, 0.7, shade(sand, -0.3));
		P.gloss(-9.5, -16, 1.6, 0.9, 0.35);
		// tusks behind the mouth
		P.shape((p) => { p.m(3.5, -35); p.q(4, -41, 9.5, -45); p.q(7, -40, 7.4, -35.5); }, thorn, 3.5, 9.5);
		P.shape((p) => { p.m(0.5, -33); p.q(-4.5, -36.5, -5, -42.5); p.q(-1.4, -38, 3, -35.5); }, thorn, -5, 3);
		P.shape((p) => { p.m(11, -36); p.q(16, -37.5, 17, -42); p.q(17.5, -36.5, 12.5, -33.5); }, thorn, 11, 17.5);
		// the mouth: a scaly orange disc seen a little from the side, a ring of teeth round a dark throat
		P.ellipse(9.5, -30, 7, 9.4, mouth);
		for (const [x, y] of [[5.6, -34], [5, -29], [5.6, -24.6], [7.4, -37], [7.2, -22.6], [11.6, -36.6], [12.8, -24]]) P.dot(x, y, 0.55, '#a8501e');
		P.ellipse(10.4, -30, 4.8, 6.8, '#f0a868', { line: false });
		P.ellipse(10.8, -30, 3.2, 4.8, '#3a120a', { line: false });
		for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) P.thin([[10.8 + Math.cos(a) * 3.2, -30 + Math.sin(a) * 4.8], [10.8 + Math.cos(a) * 1.5, -30 + Math.sin(a) * 2.3]], '#f6ead0', 0.5);
		P.gloss(6.6, -35.5, 1.5, 0.8, 0.5);
		// the lower tusk, in front
		P.shape((p) => { p.m(6, -24); p.q(8.5, -18, 14.5, -16.5); p.q(11, -20, 10, -23.4); }, thorn, 6, 14.5);
	},
	// Knight of doom: dark purple spiked plate with gold trim and glowing violet gems, a horned helmet with a T visor and
	// glowing eyes, a long pale blade held across the body, a dark kite shield on the far arm
	226(P) {
		P.shadow(12, 5);
		const armour = '#4e3a7c', dark = '#2e2246', robe = '#7452b8', gold = '#c9a24a', gem = '#c070ff';
		// kite shield on the far arm, behind
		P.shape((p) => { p.m(6, -22); p.l(16.5, -21); p.q(17.5, -9, 11.5, -1.5); p.q(4.5, -9, 6, -22); }, dark, 4.5, 17.5);
		P.thin([[7, -20.6], [15.6, -19.8], [16, -10], [11.6, -3]], gold, 0.45);
		// armoured legs, spiked boots
		for (const s of [-1, 1]) {
			P.line([[s * 3.2, -9], [s * 3.6, -2.5]], armour, 3.8);
			P.thin([[s * 2, -6], [s * 5, -6.4]], gold, 0.4);
			P.ellipse(s * 3.8, -1.3, 2.9, 1.6, dark);
			P.poly([[s * 2.6, -4], [s * 1.2, -5.8], [s * 1.9, -3.2]], dark);
		}
		torso(P, -21, 6.5, -6, 8, armour);
		P.shape((p) => { p.m(-2.6, -20); p.l(2.6, -20); p.l(3.6, -1.5); p.l(-3.6, -1.5); }, robe, -3.6, 3.6);
		P.thin([[0, -18], [-1.4, -14], [0, -11], [1.4, -6], [0, -3]], '#e0b8ff', 0.4);
		P.line([[-7, -9.5], [7, -9.5]], dark, 1.3);
		P.dot(0, -9.5, 0.8, gold);
		for (const y of [-17, -13.5]) P.thin([[-6.2, y], [-3, y + 0.4]], gold, 0.35);
		// arms: the far one holds the shield, the near one hangs with a clawed gauntlet round the hilt
		P.ellipse(8.4, -14.5, 2.6, 4, armour);
		P.ellipse(-8.6, -14, 2.6, 4.2, armour);
		P.circle(-8.4, -9.4, 2, dark);
		for (const k of [-1, 0, 1]) P.thin([[-9 + k * 0.9, -8], [-9.6 + k * 1.1, -6.4]], dark, 0.5);
		// spiked pauldrons with gems
		for (const s of [-1, 1]) {
			for (const [x0, x1, x2, y1] of [[5.2, 6, 7.8, -29.5], [8.4, 10.2, 11.2, -28.5], [11.4, 14.4, 12.8, -25]]) P.poly([[s * x0, -22.5], [s * x1, y1], [s * x2, -23]], dark);
			P.ellipse(s * 8.6, -20.5, 5.2, 3.6, armour);
			P.thin([[s * 4.4, -19], [s * 8.6, -17.2], [s * 12.6, -19.4]], gold, 0.45);
			P.glow(s * 8.6, -20.8, 2.6, gem, 0.5); P.circle(s * 8.6, -20.8, 1.2, '#8a3ad0'); P.dot(s * 8.3, -21.2, 0.4, '#f4dcff');
		}
		// horned helmet, a T visor with glowing eyes
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 2.8 + 0.5, -33.5); p.q(s * 9.5 + 0.5, -34.5, s * 7.5 + 0.5, -42.5); p.q(s * 6.6 + 0.5, -37, s * 1.6 + 0.5, -35.4); }, '#c9a070', s < 0 ? -9 : 1.5, s < 0 ? -0.5 : 9.5);
		P.circle(0.5, -28.5, 7, armour);
		P.ellipse(2, -27.6, 4.6, 5.4, '#6f50b0');
		P.thin([[-2.6, -31], [2, -33], [6.6, -30.5]], gold, 0.5);
		P.line([[-2.2, -28.6], [6.2, -28.6]], '#140a20', 1.4);
		P.line([[2.2, -28], [2.2, -23.6]], '#140a20', 1.2);
		P.glowEyes(2.2, -28.6, 2.1, 0.55, '#d68aff');
		P.circle(2, -32.3, 0.8, gem);
		P.gloss(-2.5, -32.5, 1.8, 0.9, 0.4);
		// the long pale blade across the body
		sword(P, -8.4, -9.2, -0.72, 23, 2.8, '#dde3f4');
	},
	// Skeleton shieldman: a skeleton in a small horned iron helmet, red sash and ragged brown loincloth, brown boots, a big
	// round green-grey shield behind it, a dark bracer and a sword held low across its legs
	258(P) {
		P.shadow(10, 4.5);
		const bone = '#e6dcc0', shield = '#5f664c';
		// round wooden shield on the far side, slung behind
		P.circle(6.5, -15, 8.5, shade(shield, -0.15));
		P.circle(6.5, -15, 7.4, shield);
		for (const dx of [-4, -1.3, 1.4, 4.1]) { const h = Math.sqrt(7.4 * 7.4 - dx * dx) - 0.4; P.thin([[6.5 + dx, -15 - h], [6.5 + dx, -15 + h]], shade(shield, -0.35), 0.35); }
		P.thin([[1.5, -21], [11, -9]], '#7a4a2a', 0.8);
		// bony legs in tall brown boots
		for (const s of [-1, 1]) {
			P.line([[s * 2.6, -9], [s * 3, -4.4]], bone, 1.3);
			P.dot(s * 2.8, -6.8, 0.9, bone);
			P.shape((p) => { p.m(s * 1.5, -4.6); p.l(s * 4.5, -4.6); p.l(s * 4.7, -2.4); p.q(s * 6.6, -2.2, s * 6.4, -0.4); p.l(s * 1.4, -0.4); }, '#7a4a2a', s < 0 ? -6.6 : 1.4, s < 0 ? -1.4 : 6.6);
		}
		// spine, ribs and pelvis; red sash and a ragged loincloth
		P.shape((p) => { p.m(-4.4, -20); p.l(4.4, -20); p.q(5, -15, 3, -12.4); p.l(-3, -12.4); p.q(-5, -15, -4.4, -20); }, '#4a4036', -5, 5, { alpha: 0.55, line: false });
		P.line([[0, -20.5], [0, -10]], bone, 1.1);
		for (const y of [-18.8, -16.2, -13.6]) for (const s of [-1, 1]) P.line([[s * 0.6, y - 0.2], [s * 3, y], [s * 4, y + 1.2]], bone, 0.7);
		P.ellipse(0, -10, 3.6, 1.8, bone);
		P.line([[-4.4, -11], [4.4, -11]], '#a8303a', 1.5);
		P.line([[3.6, -10.6], [5.4, -7.4]], '#a8303a', 0.8);
		P.shape((p) => { p.m(-3.6, -10.4); p.l(3.6, -10.4); p.l(3, -5); p.l(1.6, -6.6); p.l(0.4, -4.4); p.l(-1, -6.4); p.l(-2.4, -4.8); p.l(-3.4, -7); }, '#8a5a30', -3.6, 3.6);
		// arms: the far one holds the shield's strap, the near one (in a dark bracer) holds the sword
		P.line([[4.2, -19.5], [7, -15.5], [8.5, -12.6]], bone, 1.1);
		P.line([[-4.2, -19.5], [-7, -14.5], [-6.4, -10.6]], bone, 1.1);
		P.line([[-7, -13.6], [-6.6, -11.4]], '#3a3436', 2);
		sword(P, -6.2, -10, 0.75, 13.5, 1.5);
		// skull under a horned iron cap
		skull(P, 1, -26.5, 6.6, bone);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 4 + 1, -32); p.q(s * 7.5 + 1, -33, s * 7.5 + 1, -38); p.q(s * 6 + 1, -34.6, s * 2.6 + 1, -33.6); }, '#c9a070', s < 0 ? -6.5 : 3.6, s < 0 ? -1.6 : 8.5);
		P.shape((p) => { p.m(-5.8, -28.6); p.q(-6, -34.6, 1, -34.6); p.q(8, -34.6, 7.8, -28.6); p.q(1, -30.6, -5.8, -28.6); }, '#7a7672', -6, 8);
		P.thin([[-5.4, -29.2], [1, -30.8], [7.4, -29.2]], '#a8a49c', 0.5);
		P.gloss(-2, -33, 1.6, 0.8, 0.45);
	},
	// Orc shieldman: a green orc with a black topknot under heavy grey stone-plate pauldrons, fur leggings, a round wooden
	// shield with an iron boss held in front, a big axe upright in the other hand
	259(P) {
		P.shadow(12, 5);
		const skin = '#6fae3a', stone = '#7c858c', fur = '#6a5040', wood = '#a8743e';
		// the axe, upright on the far side
		P.line([[10.5, -6], [11.5, -35]], '#7a5030', 1.4);
		P.shape((p) => { p.m(12, -34); p.q(15.5, -35, 18.5, -39.5); p.q(16.5, -31, 19.5, -23.5); p.q(15.5, -26.5, 12, -27.5); }, '#8a9098', 12, 19.5);
		P.thin([[18.3, -38], [17.2, -31], [18.8, -25]], '#e0e4ea', 0.4);
		P.poly([[11, -33.5], [8, -31.5], [11, -30]], '#8a9098');
		// shaggy fur legs, green feet
		for (const s of [-1, 1]) {
			P.line([[s * 3.6, -9], [s * 4, -3]], fur, 4.2);
			for (const k of [-1, 0, 1]) P.thin([[s * 4 + k * 1.2, -4], [s * 4 + k * 1.4, -2.6]], shade(fur, -0.4), 0.35);
			P.ellipse(s * 4.4, -1.2, 2.8, 1.5, skin);
		}
		torso(P, -21, 7.5, -7, 8, '#5a4636');
		P.line([[-7.5, -9], [7.5, -9]], '#3a2a1a', 1.3);
		P.shape((p) => { p.m(3, -9); p.l(6.5, -9); p.l(6, -5.4); p.l(3.4, -5.6); }, '#8a5a30', 3, 6.5);
		// the far arm, holding the axe
		P.line([[9, -19], [11, -14.5], [11, -12.4]], skin, 2.6);
		P.circle(11, -12, 2, skin);
		// stone-plate pauldrons and collar
		for (const [x, y, rx, ry] of [[-9.5, -19.5, 4.6, 3.6], [9.5, -19.5, 4.6, 3.6], [-5.5, -22.5, 4, 3], [5.5, -22.5, 4, 3], [0, -22.8, 3.6, 2.6]]) {
			P.ellipse(x, y, rx, ry, stone);
			P.thin([[x - rx * 0.6, y + ry * 0.2], [x + rx * 0.6, y + ry * 0.3]], shade(stone, -0.4), 0.4);
		}
		P.gloss(-10.5, -21, 1.6, 0.8, 0.4);
		// head: black topknot, pointed ears, a heavy brow, small tusks
		P.shape((p) => { p.m(-1, -34); p.q(-1, -40, 2, -41); p.q(1, -38, 3, -34.6); }, '#1e1a16', -1, 3);
		for (const s of [-1, 1]) P.poly([[s * 5.8, -29], [s * 10.5, -31.5], [s * 6, -26.6]], skin);
		head(P, -28.2, 6.6, skin);
		P.eyes(1, -28.6, 2.3, 1.2, '#7a1a0a');
		P.thin([[-2.6, -30.6], [0.4, -29.9]], '#2a3a10', 0.6); P.thin([[4.6, -30.6], [1.6, -29.9]], '#2a3a10', 0.6);
		P.thin([[-1.4, -24.4], [3.4, -24.4]], '#2a3a10', 0.45);
		P.poly([[-0.8, -24.4], [0, -24.4], [-0.4, -26]], '#f3ece0'); P.poly([[2, -24.4], [2.8, -24.4], [2.4, -26]], '#f3ece0');
		// the near arm, with the round shield in front
		P.line([[-8.5, -18.5], [-9.5, -14]], skin, 2.6);
		P.circle(-7, -11.5, 8, '#666b72');
		P.circle(-7, -11.5, 6.8, wood);
		for (const dx of [-4, -1.4, 1.4, 4]) { const h = Math.sqrt(6.8 * 6.8 - dx * dx) - 0.3; P.thin([[-7 + dx, -11.5 - h], [-7 + dx, -11.5 + h]], shade(wood, -0.35), 0.35); }
		P.circle(-7, -11.5, 2.2, '#7a8088');
		P.gloss(-7.8, -12.6, 0.8, 0.5, 0.6);
	},
	// Orc footman: a muscular green orc with a dark mop of hair, yellow eyes and tusks, leather straps and bracers, a spiked
	// pauldron, a plank shield behind it and a heavy axe held low in front
	260(P) {
		P.shadow(12, 5);
		const skin = '#6cbf3a', leather = '#6a4a2a', strap = '#4a321e', wood = '#7a5530';
		// plank shield on the far side, behind
		P.poly([[4, -25], [14.5, -22.5], [13.5, -3], [3, -5]], wood);
		for (const t of [0.33, 0.66]) P.thin([[4 + 10.5 * t, -25 + 2.5 * t], [3 + 10.5 * t, -5 + 2 * t]], shade(wood, -0.4), 0.4);
		for (const y of [-19, -9]) P.thin([[3.6, y], [14, y + 2]], '#5a5a5a', 0.7);
		legs(P, '#5a4632', '#3a2a1a');
		// bare chest with a strap across it, a belt and a leather skirt
		torso(P, -21, 7, -6, 7.5, skin);
		P.thin([[-3.4, -17.5], [-0.5, -16], [0.5, -16], [3.4, -17.5]], shade(skin, -0.35), 0.45);
		P.thin([[0, -15], [0, -10]], shade(skin, -0.35), 0.4);
		P.shape((p) => { p.m(-7, -9.5); p.l(7, -9.5); p.l(7.5, -4); p.l(-7.5, -4); }, leather, -7.5, 7.5);
		P.line([[-7, -9.5], [7, -9.5]], strap, 1.3);
		P.circle(0, -9.5, 1, '#9a9a9a');
		P.line([[-6, -20], [6, -10.5]], strap, 1.1);
		// spiked pauldron and far arm
		P.line([[8, -18], [11, -13], [11, -9.5]], skin, 2.8);
		P.line([[10.8, -14], [11, -11]], leather, 3);
		P.circle(11, -8.6, 2.2, skin);
		P.ellipse(8.4, -20.2, 4, 3.2, '#8a6a3a');
		for (const [x, y, a] of [[6.4, -22.2, -1.5], [8.6, -22.6, -1.05], [10.6, -21.4, -0.6], [11.8, -19.4, -0.2]]) P.poly([[x - 0.9, y + 0.6], [x + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2], [x + 0.9, y + 0.8]], '#d9b24a');
		// head: dark hair, ears, yellow eyes under a heavy brow, a wide jaw with tusks
		for (const s of [-1, 1]) P.poly([[s * 5.6, -28.5], [s * 10.5, -31], [s * 6, -26]], skin);
		head(P, -27.5, 6.6, skin);
		P.shape((p) => { p.m(6.8, -30); p.q(6.4, -35.6, 1, -36); p.l(-1.6, -38.8); p.l(-2.6, -36); p.l(-6.6, -37.4); p.l(-5.8, -34.4); p.l(-9.6, -33.6); p.l(-6.4, -29.6); p.q(-3.6, -32.6, 0.6, -32.4); p.q(4.4, -33, 6.8, -30); }, '#3a2a1a', -9.6, 6.8);
		for (const s of [-1, 1]) { P.dot(1 + s * 2.4, -28.4, 1.2, '#ffd23f'); P.dot(1.3 + s * 2.4, -28.3, 0.55, '#1a120a'); }
		P.thin([[-2.4, -30.6], [0.8, -29.8]], '#2e5a14', 0.6); P.thin([[5.2, -30.6], [2, -29.8]], '#2e5a14', 0.6);
		P.ellipse(1.2, -23.8, 3.6, 1.6, shade(skin, -0.08));
		P.thin([[-1.6, -24.2], [4, -24.2]], '#2a3a10', 0.45);
		P.poly([[-1, -24.2], [-0.2, -24.2], [-0.6, -26]], '#f3ece0'); P.poly([[2.6, -24.2], [3.4, -24.2], [3, -26]], '#f3ece0');
		// near arm with a bracer, the axe held low across the front, its blade hanging down
		P.line([[-7, -19.5], [-10, -14], [-8.5, -10]], skin, 2.8);
		P.line([[-9.6, -13.6], [-8.8, -10.8]], leather, 3);
		P.line([[-15.5, -15.5], [-3.5, -3]], '#6a4a2a', 1.4);
		P.circle(-15.6, -15.6, 1.2, '#5a5f68');
		P.shape((p) => { p.m(-6.2, -6.2); p.l(-2.6, -2.6); p.q(-2, 1.4, -4.6, 3); p.q(-6, 1.6, -8, 1.6); p.q(-11.5, 1.4, -13.6, -2.6); p.q(-9, -2.4, -6.2, -6.2); }, '#7a7a76', -13.6, -2);
		P.thin([[-13, -2], [-8, 1.2], [-4.8, 2.6]], '#d8dad6', 0.45);
		P.circle(-8.4, -9.6, 2.2, skin);
	},
	// Orc shaman: a green orc in a dark brown robe with a red-brown mantle and a pale fur collar, a rope belt, a necklace of
	// small skulls, a totem of two skull-topped poles on its back and a staff crowned with a horned skull
	261(P) {
		P.shadow(12, 5);
		const skin = '#7cbf4a', robe = '#5a3a30', mantle = '#8a4a40', fur = '#ddd5bc', bone = '#e9e1cc';
		// the back totem: two poles, a sagging cord between them, a small skull on each
		P.line([[-2, -22], [-7.5, -40]], '#5a3a22', 1.1);
		P.line([[2, -22], [6.5, -39]], '#5a3a22', 1.1);
		P.thin([[-6.6, -36.5], [-0.5, -33], [5.8, -35.5]], '#3a2a1a', 0.5);
		for (const [x, y] of [[-4, -30], [3.6, -29.6], [-5.6, -35], [5, -34.5]]) P.poly([[x - 0.5, y], [x + (x < 0 ? -2.4 : 2.4), y - 1.2], [x + 0.3, y + 0.8]], '#5a3a22');
		skull(P, -7.8, -41.6, 2.3, bone);
		skull(P, 6.8, -40.6, 2.3, bone);
		// staff in the far hand
		P.line([[10.5, -1], [13.5, -30]], '#5a3a22', 1.2);
		legs(P, '#3e3e3e', '#262626');
		// robe, mantle, rope belt
		torso(P, -21, 7, -3, 9, robe);
		P.shape((p) => { p.m(-8, -21); p.l(8, -21); p.q(10, -16, 9, -12); p.l(6, -13.5); p.l(4, -11.5); p.q(0, -14, -4, -11.5); p.l(-6, -13.5); p.l(-9, -12); p.q(-10, -16, -8, -21); }, mantle, -10, 10);
		P.line([[-7.5, -8.5], [7.5, -8.5]], '#d08a8a', 1);
		P.line([[2.5, -8.5], [3.6, -4.5]], '#d08a8a', 0.7);
		// arms in fur sleeves: the far hand grips the staff, the near one hangs as a fist
		for (const s of [-1, 1]) { P.line([[s * 8, -18], [s * 10.4, -12.5]], mantle, 3.2); P.line([[s * 10.2, -13.4], [s * 10.6, -12]], fur, 3.4); }
		P.circle(12, -12, 2.2, skin);
		P.circle(-10.6, -10.2, 2.2, skin);
		for (const [x, y, r] of [[-8.5, -20, 2.6], [-5.5, -21.8, 2.6], [-2.4, -22.6, 2.4], [2.4, -22.6, 2.4], [5.5, -21.8, 2.6], [8.5, -20, 2.6]]) P.circle(x, y, r, fur, { line: false });
		// a necklace of three little skulls
		P.thin([[-4, -19], [0, -16.4], [4, -19]], '#3a2a1a', 0.4);
		for (const [x, y] of [[-3.2, -17], [0, -15.4], [3.2, -17]]) skull(P, x, y, 1.8, bone);
		// head: big ears, yellow eyes, an underbite with teeth
		for (const s of [-1, 1]) P.poly([[s * 5.4, -28.5], [s * 11, -30.5], [s * 5.8, -25.6]], skin);
		head(P, -27.5, 6.4, skin);
		for (const s of [-1, 1]) { P.dot(1 + s * 2.3, -28.6, 1.15, '#ffd23f'); P.dot(1.3 + s * 2.3, -28.5, 0.5, '#1a120a'); }
		P.thin([[-2.2, -30.6], [0.6, -30]], '#2e5a14', 0.6); P.thin([[4.8, -30.6], [1.8, -30]], '#2e5a14', 0.6);
		P.ellipse(1.2, -23.6, 3.4, 1.7, shade(skin, -0.06));
		P.ellipse(1.2, -24, 2.4, 0.7, '#4a1a10', { line: false });
		for (const x of [-0.4, 0.8, 2, 3]) P.poly([[x - 0.35, -23.4], [x + 0.35, -23.4], [x, -24.6]], '#f3ece0', { line: false });
		// the horned skull on the staff
		for (const s of [-1, 1]) P.shape((p) => { p.m(13.8 + s * 3, -34); p.q(13.8 + s * 7.5, -35, 13.8 + s * 6.5, -41.5); p.q(13.8 + s * 5, -37, 13.8 + s * 2, -36); }, '#ece2c8', s < 0 ? 7 : 15.6, s < 0 ? 12 : 20.6);
		skull(P, 13.8, -32.5, 4, bone);
	},
	// Succubus: a pink-skinned demoness with big mauve bat wings, two dark horns, long dark hair, arms folded, a dark violet
	// bodice and a thin tail ending in a spade
	262(P) {
		P.shadow(9, 3.5);
		const skin = '#e0968a', bone = '#6a4a7a', hair = '#3a2420', horn = '#2e2228', outfit = '#4a2450';
		// wings: arching up from the shoulders to a clawed tip, then trailing long and ragged down to her knees; the far
		// (left) one a deeper mauve
		for (const [s, membrane] of [[-1, '#9a6e9e'], [1, '#d08a92']]) {
			P.shape((p) => { p.m(s * 3, -21); p.q(s * 8, -37, s * 15, -41); p.q(s * 21, -33, s * 19.5, -21); p.q(s * 18.5, -13, s * 16, -5); p.q(s * 14.5, -10, s * 13, -10.5); p.q(s * 11.6, -11, s * 10.6, -9); p.q(s * 9, -13, s * 7, -13); p.q(s * 5.5, -15, s * 4, -16.5); }, membrane, s < 0 ? -21 : 3, s < 0 ? -3 : 21);
			for (const [x, y] of [[19.5, -21], [16, -5], [13, -10.5], [10.6, -9], [7, -13]]) P.thin([[s * 14.6, -40.4], [s * x, y]], bone, 0.4);
			P.thin([[s * 3, -21], [s * 8, -37], [s * 15, -41]], bone, 0.8);
			P.poly([[s * 14.4, -40.6], [s * 14.6, -44.6], [s * 16, -41]], horn);
		}
		// a long thin tail sweeping down and round, ending in a spade
		P.thin([[2, -11], [8, -9], [10, -5], [6, -2.5], [9, -0.6], [13.5, -1.4]], '#c87a70', 0.6);
		P.poly([[13.5, -1.4], [15.6, -3.4], [16.4, -0.4], [15.4, 0.4]], '#c87a70');
		// long hair falling behind her back
		P.shape((p) => { p.m(-6.5, -28); p.q(-9, -18, -6, -12); p.l(6, -12); p.q(9, -18, 6.5, -28); }, hair, -9, 9);
		// slim legs and dark hooves
		for (const s of [-1, 1]) {
			P.line([[s * 2.2, -9], [s * 2.6, -5], [s * 1.8, -2]], skin, 2);
			P.ellipse(s * 2, -1, 1.5, 1.1, horn);
		}
		// body with a dark bodice, arms folded across it
		torso(P, -20, 3.8, -9, 4.2, skin);
		P.shape((p) => { p.m(-4, -17); p.q(0, -15.5, 4, -17); p.l(4.2, -9); p.q(0, -7, -4.2, -9); }, outfit, -4.2, 4.2);
		P.line([[-3.8, -19], [-5.6, -15.5], [2.4, -14.6]], skin, 1.3);
		P.line([[3.8, -19], [5.6, -14.2], [-2.4, -15.2]], skin, 1.3);
		// head: horns, hair framing her face, red eyes
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 2, -31.5); p.q(s * 7, -36, s * 4, -43); p.q(s * 4.5, -37.5, s * 0.6, -33.5); }, horn, s < 0 ? -7 : 0.6, s < 0 ? -0.6 : 7);
		head(P, -26.5, 5.8, skin);
		P.eyes(0, -26.6, 2.1, 1.2, '#a8203a');
		P.mouth(0, -23.2, 0.8, '#8a2a3a');
		P.shape((p) => { p.m(-6.2, -26); p.q(-6.6, -33.4, 0, -33.4); p.q(6.6, -33.4, 6.2, -26); p.q(4.5, -30.5, 0.5, -31); p.q(-4.5, -30.5, -6.2, -26); }, hair, -6.6, 6.6);
		P.shape((p) => { p.m(-6.2, -27); p.q(-7.8, -21, -6.4, -18); p.q(-5, -22, -5, -26); }, hair, -7.8, -5);
	},
	// Incubus: a muscular blue demon with dark wings, a ram skull worn over its whole face (one glowing blue eye), a
	// ragged brown loincloth, a tail, clawed digitigrade legs; faces right
	263(P) {
		P.shadow(11, 4.5);
		const skin = '#4a64a8', wing = '#2e3f78', bone = '#e6dcc0';
		// wings behind
		for (const [s, top] of [[-1, -40], [1, -44]]) {
			P.shape((p) => { p.m(s * 3, -21); p.q(s * 8, -36, s * 17, top); p.q(s * 20, -30, s * 19, -13); p.q(s * 16, -17, s * 14, -12); p.q(s * 11, -17, s * 8, -12); p.q(s * 6, -17, s * 4, -15); }, s < 0 ? shade(wing, -0.15) : wing, s < 0 ? -20 : 3, s < 0 ? -3 : 20);
			P.line([[s * 3, -21], [s * 8, -36], [s * 17, top]], shade(wing, 0.2), 0.8);
			for (const [x, y] of [[19, -13], [14, -12], [8, -12]]) P.thin([[s * 17, top], [s * x, y]], shade(wing, 0.15), 0.35);
		}
		// tail
		P.line([[-3, -10], [-9, -6], [-12, -8], [-12, -11]], skin, 0.9);
		P.poly([[-12, -11], [-13.6, -13.6], [-10.6, -12.6]], shade(skin, -0.3));
		// digitigrade legs with clawed feet
		for (const s of [-1, 1]) {
			P.line([[s * 3, -10], [s * 5, -6], [s * 3.4, -3.4], [s * 4.4, -1.2]], skin, 2.6);
			P.ellipse(s * 4.8, -0.9, 2.2, 1.1, shade(skin, -0.2));
			for (const k of [0, 1]) P.thin([[s * 4.8 + 1.2 + k, -1], [s * 4.8 + 2 + k, 0.2]], '#e0e6f0', 0.3);
		}
		// muscular torso, ragged loincloth
		torso(P, -21, 6.5, -9, 5.2, skin);
		P.thin([[-3, -17.4], [0, -16], [3, -17.4]], shade(skin, -0.4), 0.45);
		for (const y of [-14, -11.6]) P.thin([[-1.8, y], [1.8, y]], shade(skin, -0.35), 0.4);
		P.thin([[0, -15.6], [0, -9.6]], shade(skin, -0.35), 0.4);
		P.shape((p) => { p.m(-5.4, -9.6); p.l(5.4, -9.6); p.l(4.6, -4); p.l(2.8, -6); p.l(1.4, -3); p.l(0, -5.4); p.l(-1.6, -3.2); p.l(-3, -6); p.l(-4.8, -4.4); }, '#6a4a2e', -5.4, 5.4);
		// arms: the far hand on the hip, the near arm hanging with claws
		P.line([[6.5, -19.5], [9.5, -15], [6.6, -10.6]], skin, 2.2);
		P.line([[-6.5, -19.5], [-8.6, -14], [-8.4, -9.6]], skin, 2.2);
		for (const k of [-1, 0, 1]) P.thin([[-8.4, -9.2], [-8.4 + k * 0.9, -7.2]], '#e0e6f0', 0.35);
		// head: just the ram skull sitting on the body, no face under it: cranium, long toothy snout reaching forward, one
		// glowing blue eye in its socket, horns sweeping back and up
		P.shape((p) => { p.m(-2, -27.5); p.q(-6.5, -29, -7.5, -35); p.q(-6, -38, -3.5, -37); p.q(-5.5, -35, -4.4, -32.4); p.q(-2.4, -30.6, 0.6, -30); }, bone, -7.5, 0.6);
		P.shape((p) => { p.m(-5.2, -23.5); p.q(-5.8, -30.4, 0.5, -30.6); p.q(5.5, -30.8, 7.5, -27); p.l(13, -23.4); p.q(13.6, -21.8, 12.4, -21.2); p.l(7, -21.6); p.q(4.5, -22.6, 2, -21.6); p.q(-2.6, -21, -5.2, -23.5); }, bone, -6, 13.6);
		for (const x of [8, 9.5, 11]) P.poly([[x - 0.45, -21.5], [x + 0.45, -21.5], [x, -20.2]], bone);
		P.thin([[7.5, -26.6], [12.6, -23.2]], shade(bone, -0.35), 0.35);
		P.dot(12.2, -22.8, 0.4, '#3a3020');
		P.ellipse(3.6, -25.4, 2, 1.8, '#0e1430', { line: false });
		P.glow(3.6, -25.4, 3.8, '#3a8aff', 0.85); P.dot(3.6, -25.4, 0.9, '#cfeaff');
		P.shape((p) => { p.m(2, -29.8); p.q(6.5, -33.5, 6, -39); p.q(10, -35.5, 8, -30.8); p.q(6.5, -29, 4.4, -28.4); }, bone, 2, 10);
		P.gloss(-2, -27.5, 2, 1, 0.5);
	},
	// Orc champion: a huge hunched green orc with a small low head, tusks and pointed ears, a red bead necklace with a
	// pendant, a belt with a skull buckle over a ragged loincloth, an axe hanging from each fist
	264(P) {
		P.shadow(16, 6);
		const skin = '#6cbf4a', belt = '#6a4a2a', cloth = '#7a4a2e';
		// the far axe, its dark head near the ground
		P.line([[13.5, -13], [16.5, -1.5]], '#5a3a22', 1.5);
		P.shape((p) => { p.m(15.4, -7.5); p.q(23, -10, 23, 0); p.l(21, -2); p.l(19.6, 0.4); p.q(18, -2, 16.4, -2.4); }, '#4a4a50', 15.4, 23);
		P.poly([[15.4, -6.4], [17.6, -11.4], [16.6, -5.6]], '#4a4a50');
		// short thick legs
		P.line([[-5, -6], [-5.6, -1.5]], skin, 4.6); P.line([[5, -6], [5.6, -1.5]], skin, 4.6);
		P.ellipse(-6, -0.9, 3.4, 1.7, shade(skin, -0.15)); P.ellipse(6, -0.9, 3.4, 1.7, shade(skin, -0.15));
		// the far arm, behind the body, its fist round the far axe
		P.line([[7, -22], [13.5, -16.5], [13.6, -11]], shade(skin, -0.12), 4.2);
		P.circle(13.8, -10.4, 2.7, shade(skin, -0.12));
		// body: a big hunched back rising to a hump of shoulders on the left, the belly hanging forward
		P.shape((p) => { p.m(-11, -9); p.q(-15, -22, -6, -28.5); p.q(2, -31, 8, -25); p.q(13, -19, 11.5, -11); p.q(10, -5, 4, -5); p.q(-5, -4, -11, -9); }, skin, -14, 12.5);
		P.ellipse(3, -13, 7.6, 6.6, '#8ad060', { line: false });
		P.thin([[0, -19.6], [3, -18.4], [6.4, -19.4]], shade(skin, -0.3), 0.45);
		P.gloss(-7, -22, 3.4, 1.9);
		// ragged loincloth and belt with a skull buckle
		P.shape((p) => { p.m(-10, -8); p.l(10, -8); p.l(9, -1.5); p.l(7, -3.6); p.l(5, -0.6); p.l(2.6, -3); p.l(0, 0); p.l(-2.4, -3); p.l(-5, -0.8); p.l(-7, -3.4); p.l(-9.4, -1.6); }, cloth, -10, 10);
		P.shape((p) => { p.m(-11.5, -10); p.q(0, -7, 11.5, -10); p.l(11, -7); p.q(0, -4.2, -11, -7); }, belt, -11.5, 11.5);
		skull(P, 1.2, -8, 2.2, '#e9e1cc');
		// red bead necklace with a gem pendant
		for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.15 + k * 0.0875); P.circle(4 + Math.cos(a) * 5.4, -22.4 + Math.sin(a) * 4.2, 0.75, '#b8302a'); }
		P.poly([[4, -19.2], [5.4, -16.8], [4, -14.4], [2.6, -16.8]], '#3a6a3a');
		P.dot(4, -16.8, 0.6, '#9ae0a0');
		// head: small, sunk between the shoulders and thrust forward; pointed ears, a heavy brow, an underbite with tusks
		for (const s of [-1, 1]) P.poly([[5.5 + s * 4.4, -27.5], [5.5 + s * 8.6, -30], [5.5 + s * 4.8, -25]], skin);
		P.circle(5.5, -25.5, 5.6, skin);
		P.gloss(3.4, -29, 1.5, 0.8, 0.45);
		P.thin([[2.4, -28.2], [5.1, -27.4]], '#2e5a14', 0.7); P.thin([[9, -28.2], [6.3, -27.4]], '#2e5a14', 0.7);
		P.dot(4, -26.6, 0.8, '#1a120a'); P.dot(7.4, -26.6, 0.8, '#1a120a');
		P.ellipse(6, -22.3, 3.9, 2.1, shade(skin, -0.08));
		P.ellipse(6, -22.9, 2.5, 0.8, '#4a1a10', { line: false });
		P.poly([[3.7, -22.3], [4.7, -22.3], [4.1, -25]], '#ffffff'); P.poly([[8.3, -22.3], [7.3, -22.3], [7.9, -25]], '#ffffff');
		// the near arm: heavy, hanging from the hump, the fist round the haft of a stone axe whose head is low on the left
		P.line([[-17, -17], [-10.5, -1]], '#6a4a2a', 1.6);
		P.circle(-17, -17, 1.1, '#5a3a22');
		P.shape((p) => { p.m(-12, -7.5); p.q(-20.5, -9, -21, 0.6); p.l(-18.6, -0.8); p.l(-16.6, 0.6); p.q(-14, -1.6, -11, -2); }, '#8a8a80', -21, -11);
		P.thin([[-20.2, -1], [-19.4, -6.6]], '#c8c8c0', 0.4);
		P.line([[-6, -24], [-12, -21], [-15.5, -15], [-13.8, -11]], skin, 4.6);
		P.circle(-13.8, -10.4, 2.8, skin);
	},
	// Orc chieftain (3A boss): a hunched olive orc with a wide leather strap over the near shoulder, a horn on the other
	// shoulder, a dark spiky crest, fur trim and leather straps, wrapped legs, a fang-studded club held across the body
	265(P) {
		P.shadow(14, 5.5);
		const skin = '#8aa83a', fur = '#d8c890', leather = '#8a5a30', bone = '#e6dca0', wrap = '#7a6a40';
		// dark spiky crest behind the head
		for (const [x, y] of [[-2, -40], [1.5, -42], [5, -40.5]]) P.poly([[x - 2.4, -31], [x, y], [x + 2.4, -31]], '#4a3420');
		// wrapped legs, big bare feet
		for (const s of [-1, 1]) {
			P.line([[s * 4, -9], [s * 4.6, -2.6]], skin, 3.6);
			for (const y of [-7, -4.8]) P.thin([[s * 4 - 1.8, y], [s * 4 + 1.9, y - 0.6]], wrap, 0.8);
			P.ellipse(s * 5, -1.1, 3.2, 1.5, skin);
			for (const k of [0, 1, 2]) P.dot(s * 5 + 1.2 + k * 0.8 - (s < 0 ? 2.4 : 0), -0.4, 0.35, '#3a4a14');
		}
		// body: hunched torso, a ragged leather apron, straps
		torso(P, -22, 8, -7, 8.5, skin);
		P.shape((p) => { p.m(-5, -9); p.l(5, -9); p.l(4, -2); p.l(1.5, -4); p.l(-1, -1.5); p.l(-3.5, -4); p.l(-5, -2); }, '#6a4428', -5, 5);
		P.line([[-8, -9.5], [8, -9.5]], leather, 1.4);
		P.line([[-6.5, -21], [6, -10]], leather, 1.3);
		P.thin([[-2.4, -16.6], [0.8, -13.8]], '#d9b24a', 0.6);
		// horn on the far shoulder, fur trim
		P.shape((p) => { p.m(7, -24); p.q(13, -28, 11.5, -38); p.q(10, -31, 5, -27); }, bone, 5, 13);
		for (const [x, y] of [[-8, -22], [-4, -23], [0, -23.4], [4, -23], [8, -22]]) P.circle(x, y, 2.4, fur, { line: false });
		// head: pointed ears, yellow eyes under a heavy brow, a grin with tusks
		for (const s of [-1, 1]) P.poly([[1.5 + s * 5, -28.5], [1.5 + s * 10.5, -30.5], [1.5 + s * 5.4, -26]], skin);
		head(P, -27.5, 6.2, skin, 1.5);
		for (const s of [-1, 1]) { P.dot(2.5 + s * 2.2, -28.6, 1.15, '#ffe04a'); P.dot(2.8 + s * 2.2, -28.5, 0.5, '#1a120a'); }
		P.thin([[-0.4, -30.6], [2, -29.8]], '#4a5a14', 0.6); P.thin([[5.4, -30.6], [3, -29.8]], '#4a5a14', 0.6);
		P.ellipse(2.6, -23.8, 3.2, 1.5, '#4a1a10', { line: false });
		for (const x of [1, 2.2, 3.4, 4.4]) P.poly([[x - 0.35, -24.6], [x + 0.35, -24.6], [x, -23.6]], '#f3ece0', { line: false });
		P.poly([[0.6, -23], [1.4, -23], [1, -25.4]], '#f3ece0'); P.poly([[4.2, -23], [5, -23], [4.6, -25.4]], '#f3ece0');
		// arms wrapped in leather, gripping the club across the body; fang spikes round its far end
		P.line([[-11, -18], [-13, -12], [-9, -9.6]], skin, 3);
		P.line([[-12.6, -14.6], [-11.6, -11]], leather, 3.2);
		P.line([[-8, -15.5], [-11.2, -19.5], [-9.4, -23.4], [-5, -24.6]], leather, 2.1);
		P.thin([[-8.6, -16.4], [-10.6, -19.4], [-9.2, -22.6], [-5.4, -23.8]], shade(leather, 0.35), 0.25);
		P.shape((p) => { p.m(-12, -20.6); p.l(-9.6, -21.2); p.l(-9.2, -18.6); p.l(-11.6, -18); }, '#d9b24a', -12, -9.2);
		P.thin([[-10.7, -20.8], [-10.4, -18.4]], '#7a5a14', 0.35);
		P.line([[8, -19], [11, -15], [8, -12.6]], skin, 3);
		P.line([[10.4, -16], [9.4, -13.6]], leather, 3.2);
		P.line([[-17, -6], [13, -16]], '#c8c080', 2.6);
		P.ellipse(-17, -6, 1.3, 1.6, '#e0d8a0');
		for (const x of [-9, 2]) P.thin([[x, -10.6 + (x + 9) * -0.333 + 2.4], [x + 1, -10.6 + (x + 9) * -0.333 - 0.4]], '#8a7a40', 0.5);
		P.circle(13, -16, 3, '#c8c080');
		for (const [a, l, bend] of [[-1.6, 8.5, -1], [-0.7, 8.5, -1], [0.2, 7.5, 1], [1.1, 6.5, 1]]) {
			const c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c, at = (t, o) => [13 + c * t + nx * o, -16 + sn * t + ny * o];
			P.shape((p) => { p.m(...at(1.5, 2)); p.q(...at(l * 0.6, 1.6 + bend), ...at(l, bend * 1.2)); p.q(...at(l * 0.55, -1 + bend), ...at(1.5, -2)); }, bone, 6, 22);
		}
		P.circle(-8.6, -9.2, 2.4, skin);
		P.circle(8, -12.6, 2.4, skin);
	},
	// Orc warlord: a grinning orc in dark armour with spiked pauldrons riding a shaggy brown warg (orange eyes, sabre fangs,
	// a bridle with a metal ring, bushy tail), a round wooden shield at its side and a big axe raised high
	266(P) {
		P.shadow(19, 6);
		const fur = '#8a6038', mane = '#6a4428', armour = '#3e3a34', skin = '#a8cc6a', strap = '#5a3a22';
		// a bushy tail streaming out behind, far legs
		P.shape((p) => { p.m(-11, -15); p.q(-16, -15, -19, -19); p.q(-21, -18, -24, -22); p.q(-21, -22, -22, -24.5); p.q(-17, -23, -15, -21); p.q(-14, -19, -9.5, -18.5); }, fur, -24, -9.5);
		P.thin([[-12, -17], [-17, -19], [-21, -22]], shade(fur, -0.3), 0.45);
		P.line([[-10, -10], [-13, -6], [-11.6, -1]], shade(fur, -0.25), 2.8);
		P.line([[10, -11], [12.5, -6], [11, -1]], shade(fur, -0.25), 2.8);
		// body: low rump, a high shaggy hump of shoulders
		P.shape((p) => { p.m(-13, -10); p.q(-14.5, -17, -9, -18.5); p.q(-2, -19.5, 4, -22); p.q(11, -24, 13.5, -16); p.q(14, -9, 8, -7); p.q(-2, -5, -9, -6.5); p.q(-13, -7, -13, -10); }, fur, -14.5, 14);
		for (const [x, y] of [[-9, -17.4], [-4, -18.4], [1, -20.4], [6, -22], [10, -21]]) P.thin([[x, y], [x + 1.2, y + 3.2]], shade(fur, -0.35), 0.45);
		// near legs, bent, with dark claws
		P.ellipse(-8.5, -11.5, 5, 5.2, fur);
		P.line([[-9.5, -8], [-12, -4.5], [-9.5, -1.4]], fur, 2.6);
		P.ellipse(-8.8, -1, 2.3, 1.1, shade(fur, -0.2));
		P.ellipse(8, -12.5, 4.2, 5, fur);
		P.line([[8, -9], [9.6, -5], [7.8, -1.4]], fur, 2.6);
		P.ellipse(8.4, -1, 2.3, 1.1, shade(fur, -0.2));
		for (const [x, y] of [[-11, -14], [-7, -15], [6, -15.4], [9.6, -14]]) P.thin([[x, y], [x - 0.6, y + 3]], shade(fur, -0.35), 0.45);
		for (const x of [-7.6, 10]) for (const d of [-1, 0, 1]) P.thin([[x + d * 0.7, -0.8], [x + d * 0.9 + 0.9, 0.6]], '#1e1610', 0.4);
		// head: a ragged mane, an ear, a broad snout with sabre fangs, an orange eye, a bridle with a metal ring
		for (const [x, y] of [[7, -24.5], [10.5, -25], [14, -23.5], [17, -20.5]]) P.poly([[x - 2.8, y + 3.6], [x - 0.6, y - 2.6], [x + 2.8, y + 3.6]], mane);
		P.ellipse(15, -14.5, 6.6, 6.2, fur);
		for (const [x, y] of [[9.6, -15], [10, -11], [12, -9]]) P.poly([[x + 1.5, y - 1.4], [x - 2.2, y + 0.4], [x + 1.5, y + 1.6]], mane);
		P.poly([[15, -19.6], [17.6, -24], [18.6, -18.6]], fur);
		P.poly([[15.9, -20], [17.4, -22.6], [17.6, -19.6]], '#c87a5a', { line: false });
		P.shape((p) => { p.m(17, -16.5); p.q(23, -16.5, 23.5, -12.5); p.q(23, -9, 19, -9); p.q(16, -9.5, 16, -12); }, shade(fur, 0.15), 16, 23.5);
		P.ellipse(22.6, -14.2, 1.1, 0.9, '#3a1e14');
		for (const x of [18.2, 21.2]) P.poly([[x - 0.7, -9.4], [x + 0.7, -9.4], [x - 0.1, -5.4]], '#f6efe2');
		P.thin([[13.6, -17.8], [17.6, -17.4]], '#3a2414', 0.6);
		P.glow(16.4, -16, 2.4, '#ff9a2a', 0.7); P.dot(16.4, -16, 1, '#ffb84a'); P.dot(16.7, -16.1, 0.4, '#2a1408');
		P.thin([[20.5, -16.4], [17.6, -10.6], [13, -16.6], [17.8, -17.2]], strap, 0.6);
		P.circle(17.6, -11.4, 1.6, '#9aa0aa'); P.circle(17.6, -11.4, 0.8, '#4a4f58', { line: false });
		// saddle cloth
		P.shape((p) => { p.m(-6, -19.6); p.q(0, -21.6, 5, -21); p.l(4.5, -13); p.q(0, -12, -5.5, -13.5); }, '#5a3020', -6, 5);
		// rider: a leg, the dark armoured body with a belt
		P.line([[0, -18], [1.5, -13.5], [0.6, -11.5]], armour, 2.1);
		P.ellipse(1, -11, 1.8, 1, '#2a2620');
		torso(P, -27, 3.8, -18, 4.6, armour);
		P.line([[-4.4, -19.6], [4.4, -19.6]], strap, 0.9);
		// round wooden shield hung at its side
		P.circle(-1, -14.5, 4.6, '#5a6a30');
		P.circle(-1, -14.5, 4, '#7a8040');
		for (const dx of [-1.8, 0, 1.8]) P.thin([[-1 + dx, -18.2 + Math.abs(dx) * 0.3], [-1 + dx, -10.8 - Math.abs(dx) * 0.3]], '#4a5020', 0.3);
		P.circle(-1, -14.5, 1.2, '#5a5f68');
		// reins from the bridle ring to the near hand
		P.thin([[17.6, -11.4], [10, -15], [4.5, -21.5]], '#a05a30', 0.45);
		// the far arm raising a double-bitted axe
		P.line([[3, -25.5], [7, -28], [9, -31]], armour, 1.6);
		doubleAxe(P, 7.6, -25, 12.4, -40, 0.75);
		P.circle(9.4, -31, 1.3, skin);
		// spiked pauldrons
		for (const s of [-1, 1]) {
			for (const [dx, h] of [[-1.4, 4], [0.4, 5], [2, 3.6]]) P.poly([[s * 4 + dx - 0.8, -27.5], [s * 4 + dx, -27.5 - h], [s * 4 + dx + 0.8, -27.5]], '#c8b890');
			P.ellipse(s * 4, -26, 2.8, 2.2, '#4a4a3a');
			P.dot(s * 4, -26, 0.5, '#c8b890');
		}
		// the near arm on the reins
		P.line([[-3, -25], [1, -22.5], [4, -21.6]], armour, 1.6);
		P.circle(4.5, -21.5, 1.3, skin);
		// head: a gaunt pale-green face with dark hollow eyes (one yellow glint), pointed ears, a wide open snarl full of
		// teeth; a dark streamer flying behind
		P.shape((p) => { p.m(-2, -34); p.q(-8, -37.5, -11, -34.5); p.q(-7, -35, -3, -32); }, '#2a2620', -11, -2);
		for (const s of [-1, 1]) P.poly([[s * 3.8, -31.6], [s * 8.4, -34.4], [s * 4.2, -29.4]], skin);
		head(P, -31, 4.6, skin);
		P.thin([[-2, -33.6], [4.4, -33.6]], '#3a5a1a', 0.5);
		P.ellipse(-0.4, -32, 1.5, 1.3, '#1e2a0e', { line: false });
		P.ellipse(2.6, -32, 1.5, 1.3, '#1e2a0e', { line: false });
		P.dot(2.8, -32, 0.65, '#ffe04a'); P.dot(-0.2, -32, 0.5, '#ffe04a');
		P.dot(1.2, -30.3, 0.4, '#1e2a0e');
		P.shape((p) => { p.m(-1, -29.4); p.q(1.4, -29.8, 3.8, -29.4); p.q(3.4, -26.2, 1.4, -26.2); p.q(-0.6, -26.2, -1, -29.4); }, '#b8202a', -1, 3.8, { line: false });
		P.thin([[-0.8, -29.2], [3.6, -29.2]], '#f3ece0', 0.5);
		P.thin([[-0.2, -26.6], [3, -26.6]], '#f3ece0', 0.4);
	},
	// ---- dungeon level 4 (4A-4C) ----
	// Skelebot: a purple-grey mechanical skeleton, hunched, a gear at the shoulder, green glowing eyes, a skull medallion on
	// a cord and a staff topped with a horned skull; faces right
	238(P) {
		P.shadow(11, 4.5);
		const bone = '#8f86a8', dark = '#4a4260', green = '#9aff3a';
		// staff with a horned skull on top
		P.line([[13, 0], [13.5, -35]], dark, 1.1);
		for (const s of [-1, 1]) P.shape((p) => { p.m(13.5 + s * 2, -39); p.q(13.5 + s * 5, -40, 13.5 + s * 5, -45); p.q(13.5 + s * 3.4, -41.5, 13.5 + s * 1.2, -41); }, bone, s < 0 ? 8.5 : 14.5, s < 0 ? 12.5 : 18.5);
		P.ellipse(13.5, -37.5, 3.2, 3.6, bone);
		for (const s of [-1, 1]) { P.dot(13.5 + s * 1.2, -38, 0.8, '#1c1828'); P.glow(13.5 + s * 1.2, -38, 1.8, green, 0.6); P.dot(13.5 + s * 1.2, -38, 0.4, '#d8ffb0'); }
		// jointed legs, knees bent
		for (const [x0, xk, xf] of [[-2.5, -6.5, -5], [2.5, 6.5, 6]]) {
			P.line([[x0, -10], [xk, -5.5], [xf, -2]], bone, 1.4);
			P.circle(xk, -5.5, 1.1, bone);
			P.ellipse(xf + 0.6, -1.2, 2.6, 1.3, dark);
		}
		// pelvis plate, spine, ribcage
		P.poly([[-4, -11.5], [4, -11.5], [2.4, -8.6], [-2.4, -8.6]], bone);
		P.dot(0, -10.2, 0.6, dark);
		P.line([[0, -11], [0.5, -16]], bone, 1.2);
		P.shape((p) => { p.m(-5, -21); p.q(0, -23, 5.5, -21); p.q(6, -16, 3, -13.5); p.q(0.5, -12.8, -2, -13.5); p.q(-5.5, -16, -5, -21); }, bone, -5.5, 6);
		for (const y of [-19.5, -17.5, -15.5]) { P.thin([[-4, y], [-0.6, y + 0.4]], dark, 0.55); P.thin([[0.6, y + 0.4], [4.4, y]], dark, 0.55); }
		// back arm: elbow out, hand low
		P.line([[-5, -20], [-9, -14.5], [-7, -9]], bone, 1.3);
		P.circle(-9, -14.5, 1, bone);
		P.ellipse(-6.8, -8.2, 1.5, 1.8, bone);
		// shoulder gear
		for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) P.dot(-5.5 + Math.cos(a) * 3, -21 + Math.sin(a) * 3, 0.9, dark);
		P.circle(-5.5, -21, 2.8, bone);
		P.circle(-5.5, -21, 1, dark);
		// front arm reaching to the staff
		P.line([[5, -20], [9.5, -16], [12.6, -18]], bone, 1.3);
		P.circle(9.5, -16, 1, bone);
		P.circle(13, -18.2, 1.6, bone);
		// medallion on a cord
		P.thin([[-2.5, -22.5], [1, -17], [4, -22.5]], '#d9cf8a', 0.35);
		P.circle(1, -16.4, 2, '#d9cf8a');
		P.dot(0.4, -16.6, 0.45, '#3a6a1a'); P.dot(1.6, -16.6, 0.45, '#3a6a1a');
		// skull with big green eyes, its jaw a bolted plate
		P.line([[0.5, -21], [1, -24]], bone, 1.4);
		P.circle(1.5, -29, 6.8, bone);
		P.poly([[-1.8, -25], [6, -25], [5.4, -21.5], [-1.2, -21.5]], bone);
		for (const x of [0, 1.6, 3.2]) P.thin([[x, -23.6], [x, -22]], dark, 0.35);
		for (const x of [-0.8, 3.8]) { P.circle(x, -29, 2, '#1c1828', { line: false }); P.glow(x, -29, 3.4, green, 0.55); P.dot(x, -29, 1.2, green); P.dot(x - 0.4, -29.5, 0.4, '#f4ffe0'); }
		P.poly([[1.1, -26.4], [1.9, -26.4], [1.5, -27.2]], '#1c1828', { line: false });
		P.thin([[-3, -34], [1.5, -35.2], [6, -34]], dark, 0.4);
		P.gloss(-1.5, -33, 1.8, 0.9, 0.45);
	},
	// Undead pharaoh: a hunched grey-green mummy in bandages, a gold horned headdress set with green orbs, green eyes, gold
	// belt and bracelets, long clawed hands; faces right
	239(P) {
		P.shadow(11, 4.5);
		const skin = '#8a9a7a', wrap = '#7a8a6a', gold = '#d9a83a', gem = '#2a9a4a';
		// bandaged legs, the far one darker, knees bent
		P.line([[-2.5, -9], [-5, -5], [-4, -1.6]], shade(wrap, -0.15), 3);
		P.line([[3, -9], [5, -5], [4.5, -1.6]], wrap, 3);
		for (const [x, y] of [[-4.8, -6.5], [-4.4, -3.6], [4.6, -6.8], [4.8, -3.8]]) P.thin([[x - 1.6, y - 0.4], [x + 1.6, y + 0.4]], shade(wrap, -0.35), 0.35);
		P.ellipse(-4.6, -1.1, 2.4, 1.3, shade(wrap, -0.3)); P.ellipse(5.4, -1.1, 2.4, 1.3, shade(wrap, -0.3));
		// back arm
		P.line([[-4, -19], [-7.5, -13.5], [-7, -9]], shade(wrap, -0.12), 2);
		// hunched torso leaning forward
		P.shape((p) => { p.m(-5.5, -21); p.q(1, -24, 6, -20.5); p.q(7, -14, 5, -9); p.q(0, -7.5, -5, -9); p.q(-7.5, -15, -5.5, -21); }, wrap, -7.5, 7);
		for (const [y, t] of [[-18.5, 0.3], [-16, -0.2], [-13.5, 0.3]]) P.thin([[-5.5, y], [5.5, y + t]], shade(wrap, -0.32), 0.4);
		P.line([[-5.6, -10], [5.6, -10]], gold, 1.1);
		P.circle(1, -10, 1.1, gem);
		P.shape((p) => { p.m(-1.5, -9.4); p.l(3.5, -9.4); p.l(3, -4.5); p.l(-1, -4.5); }, wrap, -1.5, 3.5);
		P.thin([[-1, -5.2], [3, -5.2]], gold, 0.4);
		// front arm hanging forward, gold bracelet, claws
		// headdress: gold hood falling to the shoulders, horns, green orbs
		for (const [x0, cx, cy, x1, y1] of [[-3.5, -9, -37, -6.5, -44], [3.5, 9, -38, 11, -44]]) P.shape((p) => { p.m(x0, -32); p.q(cx, cy, x1, y1); p.q(x0 * 1.6 + (x1 - x0) * 0.3, -37, x0 * 0.2, -33.5); }, gold, Math.min(x0, x1) - 1, Math.max(x0, x1) + 1);
		P.shape((p) => { p.m(-2, -35); p.q(-9, -34, -9.5, -25); p.q(-10, -20, -7.5, -17); p.l(-2, -19.5); p.q(3, -21, 6, -24); p.q(9, -32, 2, -35); }, gold, -10, 8);
		for (const y of [-28, -24.5, -21]) P.thin([[-8.8, y + 1], [-3.5, y]], shade(gold, -0.35), 0.45);
		P.circle(-7.2, -18.6, 2, gem); P.dot(-7.8, -19.2, 0.6, '#c8ffd8');
		P.circle(-4.5, -31.5, 2.2, gem); P.dot(-5.1, -32.1, 0.7, '#c8ffd8');
		// face peering out to the right: green eyes, a long nose, a thin mouth
		P.ellipse(3.4, -26, 5.4, 6.2, skin);
		P.shape((p) => { p.m(-1.8, -30.5); p.q(3, -33.5, 7.6, -30); p.l(7.2, -28.6); p.q(3, -31, -1.6, -28.8); }, gold, -1.8, 7.6);
		P.glowEyes(4, -27, 1.9, 0.6, '#5aff6a');
		P.thin([[2.6, -28.6], [4.6, -28.2]], shade(skin, -0.5), 0.4); P.thin([[5.4, -28.2], [7.2, -28.6]], shade(skin, -0.5), 0.4);
		P.poly([[6.6, -27], [8.6, -23.6], [6.4, -23.8]], shade(skin, -0.05));
		P.thin([[3.6, -22.2], [6.4, -22.4]], '#2a3a22', 0.45);
		P.gloss(1.4, -29.5, 1.2, 0.7, 0.35);
		P.gloss(-6, -32, 1.4, 0.8, 0.5);
		// front arm hanging forward, a gold bracelet, a clawed hand
		P.line([[4, -18.5], [9.5, -14], [11.5, -8.5]], wrap, 2.4);
		P.thin([[7, -17.4], [9.6, -15.6]], shade(wrap, -0.35), 0.35);
		P.line([[10.6, -11.4], [11.2, -10.2]], gold, 2.8);
		P.circle(11.6, -7.6, 1.7, skin);
		for (const k of [-1, 0, 1]) P.thin([[11.6 + k * 0.8, -6.6], [12 + k * 1.1, -4.6]], shade(skin, -0.4), 0.45);
	},
	// Ballbot: a blue-grey armoured sphere on two stubby mechanical legs, one big red eye and a small one, a jointed claw
	// arm and a drill arm; faces right
	240(P) {
		P.shadow(13, 5);
		const steel = '#6a7aa8', dark = '#3e4a70';
		// legs
		for (const [x0, x1] of [[-4, -6], [4, 6]]) {
			P.line([[x0, -12], [x1, -6], [x1 - 0.5, -2.5]], dark, 2.4);
			P.circle(x1, -6, 1.5, steel);
			P.ellipse(x1 - 0.2, -1.4, 3, 1.4, dark);
		}
		// the ball, with a shoulder plate and engraved swirls
		P.circle(1, -23, 12, steel);
		P.thin([[-11, -21], [-3, -17], [7, -14.5]], shade(steel, -0.3), 0.5);
		for (const [x, y, r] of [[-2, -15.5, 2], [4, -32, 2.4]]) P.thin(Array.from({ length: 14 }, (_, i) => [x + Math.cos(i * 0.6) * r * (0.2 + i / 16), y + Math.sin(i * 0.6) * r * (0.2 + i / 16)]), shade(steel, -0.28), 0.4);
		P.gloss(-4, -31, 3.6, 1.8, 0.45);
		P.shape((p) => { p.m(-12.5, -27); p.q(-8, -33, -3, -29); p.l(-4.5, -19); p.q(-10, -18, -13, -20); }, shade(steel, 0.05), -13, -3);
		P.thin([[-11.5, -21.5], [-5.5, -21]], dark, 0.4);
		// claw arm hanging down in front
		P.line([[-9, -20], [-12, -13], [-11, -8]], steel, 2.4);
		P.circle(-12, -13, 1.5, dark);
		for (const k of [-1, 0, 1]) P.line([[-11, -8], [-11 + k * 1.6, -5.5], [-11 + k * 2.1, -3.8]], dark, 0.8);
		// drill arm in front
		P.line([[8, -16], [11.5, -12.5]], steel, 2.8);
		P.circle(11.5, -12.5, 1.6, dark);
		P.shape((p) => { p.m(9.4, -12); p.l(14.6, -10.6); p.l(17.5, 0); }, '#8a95b5', 9.4, 17.5);
		for (const t of [0.2, 0.38, 0.56, 0.74]) P.thin([[9.4 + 8.1 * t, -12 + 12 * t], [14.6 + 2.9 * t, -10.6 + 10.6 * t - 1.2]], dark, 0.5);
		// the eyes
		P.circle(6.5, -24, 4.6, '#7a1a2a');
		P.circle(6.5, -24, 3.3, '#2a0a10', { line: false });
		P.glow(6.5, -24, 4.4, '#ff4a4a', 0.35);
		P.dot(6, -24.8, 1.1, '#ffffff');
		P.circle(-4, -27.5, 1.9, '#7a1a2a');
		P.dot(-4.2, -27.8, 0.6, '#ffd0d0');
	},
	// Chigger: a squat red-orange brute that is mostly mouth: a huge fanged maw across the body, one big yellow eye on top,
	// little horns and spikes, a pale belly, crab-like pincer arms; faces right
	241(P) {
		P.shadow(14, 5);
		const red = '#d9502a', belly = '#ecc890', horn = '#e8d2a8';
		// stout legs with toes
		for (const s of [-1, 1]) {
			P.line([[s * 4, -8], [s * 5.5, -4], [s * 4.5, -2]], red, 3.2);
			P.ellipse(s * 4.8, -1.2, 2.8, 1.4, shade(red, -0.25));
			for (const k of [-1, 0, 1]) P.thin([[s * 4.8 + k * 1.3, -0.6], [s * 4.8 + k * 1.5, 0.5]], horn, 0.35);
		}
		// horns and spikes on top
		for (const [x, y, dx, dy] of [[-6, -30, -2.5, -6], [-2, -33, -1, -5], [-9, -26, -4.5, -3]]) P.poly([[x - 1.2, y + 0.6], [x + dx, y + dy], [x + 1.2, y]], horn);
		// the body
		P.ellipse(0, -19, 11.5, 13, red);
		P.ellipse(1, -10, 6.5, 4.6, belly, { line: false });
		for (const y of [-11.5, -9.2]) P.thin([[-3.5, y], [5.5, y]], shade(belly, -0.25), 0.35);
		for (const [x, y] of [[-8, -12], [-9, -17], [-6, -9]]) P.dot(x, y, 0.7, shade(red, -0.3));
		P.gloss(-6, -27, 2.6, 1.3, 0.45);
		// the eye
		P.ellipse(4, -28.5, 3.8, 3.4, '#f0cf6a');
		P.ellipse(4.3, -28.5, 0.8, 2.6, '#1a0a04', { line: false });
		P.dot(3, -29.6, 0.6, '#ffffff');
		P.shape((p) => { p.m(-0.2, -30); p.q(4, -34, 8, -30.4); p.q(4, -32.2, -0.2, -30); }, shade(red, -0.12), -0.2, 8);
		// the maw: dark, wide, lined with fangs
		P.shape((p) => { p.m(-7, -23); p.q(2, -26, 11, -24.5); p.q(10, -16, 2, -15.5); p.q(-5, -16, -7, -23); }, '#3a0a08', -7, 11);
		P.shape((p) => { p.m(-4, -17.2); p.q(2, -20, 7, -17.6); p.q(2, -16, -4, -17.2); }, '#b8344a', -4, 7, { line: false });
		for (let x = -5.5; x < 10; x += 1.9) P.poly([[x - 0.75, -24.6 + (x - 2) * (x - 2) * -0.012], [x + 0.75, -24.6 + (x - 2) * (x - 2) * -0.012], [x, -21.5]], '#f6ecd6', { line: false });
		for (let x = -3.6; x < 9; x += 2.2) P.poly([[x - 0.75, -16.3], [x + 0.75, -16.3], [x, -19]], '#f6ecd6', { line: false });
		// pincer arms
		for (const s of [-1, 1]) {
			P.line([[s * 10, -16], [s * 13, -11]], red, 2.6);
			P.shape((p) => { p.m(s * 11.5, -11.5); p.q(s * 17.5, -13, s * 18, -6); p.l(s * 15.5, -7.5); p.q(s * 16.5, -4, s * 14, -2.5); p.q(s * 10.5, -4, s * 11.5, -11.5); }, red, s < 0 ? -18 : 10.5, s < 0 ? -10.5 : 18);
			P.thin([[s * 13, -9.5], [s * 15.4, -7.6]], shade(red, -0.4), 0.4);
		}
	},
	// Shaman bot: a jade stone automaton in a robe, a ribbed mitre over a mask with three green eyes, tentacles curling from
	// its sides, a pendant on a cord and a root staff clutching a green orb
	242(P) {
		P.shadow(11, 4.5);
		const jade = '#4aa08a', light = '#7ad0b0', dark = '#2a6a5a', wood = '#8a6a40', orb = '#2ad06a';
		// tentacles curling out of its sides
		tentacle(P, [[-6, -19], [-12, -22], [-15, -19], [-13.5, -16.5]], jade, 1.6, 0.5);
		tentacle(P, [[-7, -10], [-13, -9], [-15, -5], [-12.5, -3.5]], jade, 1.6, 0.5);
		tentacle(P, [[6, -21], [11, -24], [14, -22], [13, -19.5]], jade, 1.5, 0.5);
		// robe, scaled at the hem
		torso(P, -21, 6.5, -1, 9.5, jade);
		for (const [x, y] of [[-6, -4], [-2, -3], [2, -3], [6, -4], [-4, -8], [0, -7.5], [4, -8]]) P.thin([[x - 1.8, y], [x, y + 1.2], [x + 1.8, y]], dark, 0.4);
		// pendant on a cord
		P.thin([[-4, -20], [-1, -12], [4, -20]], '#5a3a22', 0.35);
		for (const a of [-0.9, 0, 0.9]) P.poly([[-1, -11.6], [-1 + Math.sin(a) * 2.6, -11.6 + Math.cos(a) * 1.4 - 0.8], [-1 + Math.sin(a + 0.3) * 1.2, -11.4]], orb, { line: false });
		P.poly([[-2, -12], [0, -12], [-1, -9.6]], '#e8d090');
		// right hand on the staff: roots twisting up to hold the orb
		P.line([[10, 1], [9, -20], [8.5, -34]], wood, 1.2);
		for (const [dx, dy] of [[-4, -3], [-3.5, -7], [3.5, -6.5], [4, -2.5]]) P.thin([[8.5, -34], [8.5 + dx * 0.6, -34 + dy * 0.5], [8.5 + dx, -34 + dy]], wood, 0.6);
		P.circle(8.5, -40.5, 3.4, orb);
		P.dot(7.4, -41.7, 1, '#e0ffe8');
		for (const s2 of [-1, 1]) P.thin([[8.5, -36], [8.5 + s2 * 3.6, -38.5], [8.5 + s2 * 3.4, -42]], wood, 0.6);
		P.line([[6, -19], [9, -15]], jade, 2.4);
		P.circle(9.2, -15, 1.6, jade);
		// head: a mask with three eyes under a tall ribbed mitre
		P.shape((p) => { p.m(-7, -27); p.q(-7.5, -36, 0, -40); p.q(7.5, -36, 7, -27); p.q(0, -29, -7, -27); }, light, -7.5, 7.5);
		for (const x of [-4, -1.4, 1.4, 4]) P.thin([[x * 0.4, -38], [x, -29.2]], dark, 0.4);
		P.shape((p) => { p.m(-6.5, -28); p.q(0, -30, 6.5, -28); p.q(7, -21, 0, -18.5); p.q(-7, -21, -6.5, -28); }, jade, -7, 7);
		P.thin([[-5, -25.5], [0, -27], [5, -25.5]], dark, 0.4);
		for (const [x, y, r] of [[-2.6, -24, 1.5], [2.6, -24, 1.5], [0.2, -20.8, 1]]) { P.circle(x, y, r, '#123a2a'); P.glow(x, y, r * 2, orb, 0.5); P.dot(x, y, r * 0.5, '#bfffd0'); }
		P.gloss(-3, -36, 1.6, 0.8, 0.45);
	},
	// Octo-mouth: a lime-green bulb of a head with a round toothy mouth facing right, a thin arm reaching forward, and a
	// mass of tentacles for legs
	243(P) {
		P.shadow(14, 4.5);
		const lime = '#a8c832', leg = '#6a9a2a';
		// tentacles spreading over the ground
		for (const pts of [[[-2, -9], [-8, -4], [-14, -3], [-16, -1]], [[0, -8], [-4, -2.5], [-9, -0.5]], [[2, -8], [5, -2.5], [10, -1], [14, -2.5]], [[3, -9], [9, -5], [15, -5], [17, -2]], [[0, -9], [0.5, -3], [3, 0.2]]]) tentacle(P, pts, leg, 2.2, 0.5);
		// stalk of a body
		P.shape((p) => { p.m(-5, -21); p.q(-2, -14, -4, -8); p.l(5, -8); p.q(3, -14, 5, -21); }, leg, -5, 5);
		P.thin([[0, -19], [0.5, -10]], shade(leg, -0.3), 0.4);
		// arm reaching forward
		P.line([[3, -18], [9, -15], [11, -11]], leg, 1.6);
		for (const k of [-1, 0, 1]) P.thin([[11, -11], [11.5 + k * 1.2, -8.8]], shade(leg, -0.2), 0.5);
		// the bulb of a head, leaning back
		P.ellipse(-1, -29, 11, 11.5, lime, { rot: -0.3 });
		for (const [x, y, r] of [[-6, -33, 2], [-3, -37, 1.6], [-8, -27, 1.6], [-4, -24, 1.4], [0, -33, 1.2]]) P.ellipse(x, y, r, r * 0.8, shade(lime, 0.25), { line: false });
		P.thin([[-9, -34], [-3, -39]], shade(lime, -0.3), 0.4); P.thin([[-10, -28], [-5, -38]], shade(lime, -0.3), 0.4);
		P.gloss(-5, -36, 2.6, 1.2, 0.45);
		// the mouth with two rows of teeth
		P.ellipse(7, -27, 4.8, 5.6, lime);
		P.ellipse(7.6, -27, 3.4, 4.2, '#24400c', { line: false });
		for (let k = -2; k <= 2; k++) {
			P.poly([[7.6 + k * 1.2 - 0.5, -30.8 + Math.abs(k) * 0.3], [7.6 + k * 1.2 + 0.5, -30.8 + Math.abs(k) * 0.3], [7.6 + k * 1.2, -28.6]], '#f0ecc8', { line: false });
			P.poly([[7.6 + k * 1.2 - 0.5, -23.2 - Math.abs(k) * 0.3], [7.6 + k * 1.2 + 0.5, -23.2 - Math.abs(k) * 0.3], [7.6 + k * 1.2, -25.4]], '#f0ecc8', { line: false });
		}
	},
	// Leviathan (also the 4A boss): a round blue-grey beast that is all gaping mouth, a pink maw ringed with long fangs,
	// clawed limbs and a tail; faces right
	244(P) {
		P.shadow(14, 5);
		const hide = '#6a7ab0', claw = '#d9b07a', maw = '#c84a7a';
		// tail and far leg
		tentacle(P, [[-9, -14], [-14, -13], [-17, -16], [-18.5, -12]], hide, 2.6, 0.6);
		P.line([[-5, -10], [-7, -5], [-5.5, -2]], shade(hide, -0.2), 2.8);
		// body
		P.circle(0, -21, 12.5, hide);
		for (const [x0, y0, x1, y1] of [[-10, -26, -4, -32], [-11, -20, -2, -31], [-9, -14, 0, -28]]) P.thin([[x0, y0], [(x0 + x1) / 2 - 1.5, (y0 + y1) / 2 - 1], [x1, y1]], shade(hide, -0.25), 0.4);
		P.gloss(-6, -29, 3, 1.6, 0.45);
		// the maw: lips, pink inside, a tongue, fangs above and below
		P.ellipse(5.5, -21, 7.4, 9, shade(hide, -0.05));
		P.ellipse(6, -21, 6, 7.6, maw);
		P.ellipse(6.8, -20.5, 3.8, 5, '#5a1028', { line: false });
		P.ellipse(6, -16.5, 3.6, 2.2, '#e07a9a', { line: false });
		for (const [x, y, a, l] of [[1.5, -27.5, 1.9, 3.6], [3.6, -28.6, 1.7, 4.6], [6.2, -28.9, 1.55, 5], [8.8, -28.2, 1.4, 4.6], [10.8, -26.3, 1.2, 3.6]]) P.poly([[x - 0.9, y], [x + 0.9, y], [x + Math.cos(a) * 0.4, y + l]], '#ecd8a8');
		for (const [x, y, l] of [[2, -14.6, 3.2], [4.4, -13.3, 4], [7.1, -13.1, 4], [9.6, -14, 3.4], [11.2, -16, 2.6]]) P.poly([[x - 0.9, y], [x + 0.9, y], [x, y - l]], '#ecd8a8');
		// clawed limbs in front
		P.line([[-6, -12], [-8, -6], [-7, -2]], hide, 4);
		P.line([[4, -10], [6, -5], [6, -2]], hide, 4);
		for (const x of [-7, 6]) for (const k of [-1, 0, 1]) P.poly([[x + k * 1.2 - 0.5, -1.6], [x + k * 1.2 + 0.5, -1.6], [x + k * 1.6 + 0.9, 0.6]], claw);
		P.line([[-9, -20], [-13.5, -13], [-12.5, -8]], hide, 3.4);
		for (const k of [-1, 0, 1]) P.poly([[-12.5 + k * 1.1 - 0.5, -7.6], [-12.5 + k * 1.1 + 0.5, -7.6], [-13.2 + k * 1.5, -4.8]], claw);
		P.line([[11, -14], [15, -9.5], [15, -6]], hide, 3.4);
		for (const k of [-1, 0, 1]) P.poly([[15 + k * 1.1 - 0.5, -5.6], [15 + k * 1.1 + 0.5, -5.6], [15.8 + k * 1.5, -3]], claw);
	},
	// The eye's mind: a crimson four-legged horror with a bare pink brain for a skull, a fanged mouth facing right, a cluster
	// of yellow eyes on its shoulder and a long tail ending in a spiked knob
	245(P) {
		P.shadow(15, 5);
		const red = '#c8445a', brain = '#f08aa0', eye = '#ecd890';
		// tail curling up behind, spiked tip
		tentacle(P, [[-8, -13], [-14, -16], [-15.5, -25], [-14, -34], [-15.5, -39]], red, 2.4, 1.2);
		P.circle(-15.5, -39.5, 1.6, red);
		for (const a of [-2.6, -1.9, -1.2, -0.5, 0.3]) P.poly([[-15.5 + Math.cos(a - 0.3) * 1.4, -39.5 + Math.sin(a - 0.3) * 1.4], [-15.5 + Math.cos(a) * 3.6, -39.5 + Math.sin(a) * 3.6], [-15.5 + Math.cos(a + 0.3) * 1.4, -39.5 + Math.sin(a + 0.3) * 1.4]], '#efe2c0');
		// far legs
		P.line([[-6, -10], [-10, -6], [-9, -1.5]], shade(red, -0.2), 2.4);
		P.line([[6, -14], [8, -7], [7, -1.5]], shade(red, -0.2), 2.4);
		// body, hunched
		P.shape((p) => { p.m(-9, -11); p.q(-11, -19, -4, -22); p.q(3, -25, 8, -19); p.q(10, -13, 6, -10); p.q(-2, -6.5, -9, -11); }, red, -11, 10);
		for (const y of [-15, -12.5]) P.thin([[-3, y], [5, y - 1]], shade(red, -0.3), 0.4);
		// near legs with long claws
		P.line([[-5, -11], [-9, -6.5], [-6.5, -1.5]], red, 2.8);
		P.line([[7, -16], [11.5, -9], [11, -2]], red, 2.8);
		for (const x of [-6.5, 11]) for (const k of [-1, 0, 1]) P.poly([[x + k * 1.2 - 0.5, -1.4], [x + k * 1.2 + 0.5, -1.4], [x + k * 1.6 + 1.2, 0.4]], shade(red, -0.15));
		// shoulder eyes
		for (const [x, y, r] of [[-6.5, -19.5, 1.7], [-3.5, -21.8, 1.8], [-7.6, -16, 1.4], [-4.6, -17.8, 1.3]]) { P.circle(x, y, r, eye); P.dot(x + r * 0.2, y, r * 0.45, '#2a0a10'); }
		// head: jaw and fangs facing right, a brain on top
		P.shape((p) => { p.m(-2, -27); p.q(4, -31, 10, -28); p.q(13, -24, 11, -20.5); p.q(5, -18, 0, -21); p.q(-3, -24, -2, -27); }, red, -3, 13);
		P.shape((p) => { p.m(4, -25.5); p.q(9, -27.5, 12, -25.5); p.q(12, -21.5, 8, -21.4); p.q(5, -22, 4, -25.5); }, '#4a0a14', 4, 12, { line: false });
		P.ellipse(8.4, -22.4, 2.4, 1, '#e06070', { line: false });
		for (const x of [5.5, 7.4, 9.3, 11]) P.poly([[x - 0.55, -25.9 - (x - 8) * 0.1], [x + 0.55, -25.9 - (x - 8) * 0.1], [x, -23.4]], '#f6ecd6', { line: false });
		for (const x of [6.4, 8.6, 10.6]) P.poly([[x - 0.5, -21.6], [x + 0.5, -21.6], [x, -23.4]], '#f6ecd6', { line: false });
		P.dot(5.8, -27.5, 0.9, '#2a0a10'); P.dot(6, -27.8, 0.3, '#ffffff');
		for (const [x, y, r] of [[-3, -31, 4.4], [2, -34, 5], [6.5, -31, 4], [-5, -27.5, 3], [0, -29.5, 4]]) P.circle(x, y, r, brain);
		for (const [x, y] of [[-4, -32], [1, -35], [5.5, -32], [-1, -29], [3, -31]]) P.thin([[x - 1.5, y + 0.8], [x - 0.5, y - 0.6], [x + 0.6, y + 0.6], [x + 1.6, y - 0.6]], shade(brain, -0.35), 0.35);
		P.gloss(-1, -36, 2.4, 1.1, 0.5);
	},
	// Mynd Flyer (also the 4B boss): a blue squid-headed sorcerer, glowing cyan eyes, face tentacles over the chin, a spiky
	// collar, a tattered robe with a violet gem at the belt, magenta flames burning in both hands
	246(P) {
		P.shadow(11, 4.5);
		const skin = '#4a68a8', robe = '#5a6a90', flame = '#e040c0';
		// flames behind the hands
		for (const s of [-1, 1]) {
			P.glow(s * 10.5, -12, 7, flame, 0.45);
			P.shape((p) => { p.m(s * 8, -7); p.q(s * 6.5, -13, s * 9, -17); p.q(s * 9.5, -14.5, s * 10.5, -15); p.q(s * 10.5, -20, s * 13, -23); p.q(s * 12.5, -18, s * 14, -15); p.q(s * 15, -10, s * 12, -7); p.q(s * 10, -5.5, s * 8, -7); }, flame, s < 0 ? -15 : 6.5, s < 0 ? -6.5 : 15, { alpha: 0.9 });
			P.shape((p) => { p.m(s * 9.5, -8); p.q(s * 9, -12, s * 11, -14); p.q(s * 13, -11, s * 11.5, -8); }, '#ffb0f0', s < 0 ? -13 : 9, s < 0 ? -9 : 13, { line: false });
		}
		// feet and robe, its hem ragged
		P.ellipse(-3.6, -1.2, 2.6, 1.4, '#2a3a60'); P.ellipse(3.6, -1.2, 2.6, 1.4, '#2a3a60');
		P.shape((p) => { p.m(-5, -20); p.l(5, -20); p.q(8, -12, 8.5, -3); p.l(6, -4.5); p.l(4.5, -2); p.l(2.5, -4); p.l(0.5, -1.5); p.l(-1.5, -4); p.l(-3.5, -2); p.l(-5.5, -4.5); p.l(-8.5, -3); p.q(-8, -12, -5, -20); }, robe, -8.5, 8.5);
		for (const [x0, x1] of [[-3, -4.5], [2, 3]]) P.thin([[x0, -12], [x1, -4]], shade(robe, -0.3), 0.4);
		P.line([[-6.5, -13], [6.5, -13]], '#3a4466', 1.2);
		P.circle(0, -13, 1.5, '#9a3ad0'); P.dot(-0.4, -13.5, 0.5, '#f0c8ff');
		// arms reaching down into the flames
		for (const s of [-1, 1]) {
			P.line([[s * 5, -19], [s * 7.6, -15]], shade(robe, -0.15), 2.6);
			P.line([[s * 7.6, -15], [s * 9.5, -11]], '#6a8ad0', 1.5);
			for (const k of [-1, 0, 1]) P.line([[s * 9.5, -11], [s * (9.6 + k * 0.9), -8.8]], '#6a8ad0', 0.5);
		}
		// spiky collar
		for (let k = -3; k <= 3; k++) P.poly([[k * 2.2 - 1.2, -19.5], [k * 2.6, -23.5 + Math.abs(k) * 0.4], [k * 2.2 + 1.2, -19.5]], shade(skin, -0.15));
		// face tentacles hanging over the chin
		for (const [x0, x1, x2] of [[-3, -4.5, -3.4], [-1, -1.6, -0.8], [1, 1.6, 0.8], [3, 4.5, 3.4]]) tentacle(P, [[x0, -24], [x1, -20], [x2, -16.5]], skin, 1.3, 0.4);
		// the domed head
		P.shape((p) => { p.m(-5.5, -24); p.q(-7.5, -32, -4, -38); p.q(0, -43, 4, -38); p.q(7.5, -32, 5.5, -24); p.q(0, -21.5, -5.5, -24); }, skin, -7.5, 7.5);
		P.gloss(-2.5, -36, 1.6, 1, 0.45);
		P.glowEyes(0, -28, 2.3, 0.75, '#5ae8ff');
		P.thin([[-3.8, -29.6], [-1.2, -29]], '#1a2a50', 0.45); P.thin([[3.8, -29.6], [1.2, -29]], '#1a2a50', 0.45);
	},
	// Eye Tyrant (4C boss): a floating purple eyeball beast with pink bat wings, one huge yellow eye with a violet crystal
	// pupil facing right, and a nest of curling tentacles below
	247(P) {
		P.shadow(12, 4, 1.5, 0.2);
		const purple = '#8a4ac8', wing = '#d860b0', tent = '#7a3aa8';
		// far wing
		P.shape((p) => { p.m(6, -30); p.q(10, -37, 19, -41); p.q(18, -37, 21, -33); p.l(17, -33); p.q(17, -29, 15, -27); p.q(11, -29, 8, -25); }, shade(purple, -0.15), 6, 21);
		// tentacles hanging below, curling at the ends
		for (const pts of [[[-6, -14], [-10, -9], [-13, -6], [-12, -3.5], [-10.5, -4.5]], [[-3, -12], [-5, -6], [-7, -2.5], [-5.5, -1]], [[0, -11], [0, -5], [-1.5, -1.5], [0.5, 0]], [[3, -11], [4.5, -5], [3.5, -2], [5.5, -1.5]], [[6, -12], [9, -7], [12, -5], [12.5, -2.5], [11, -2.5]], [[8, -15], [13, -12], [16, -12], [17, -9]]]) tentacle(P, pts, tent, 2.2, 0.5);
		// the body
		P.circle(1, -22, 12, purple);
		for (const [x0, y0, x1, y1] of [[-10, -24, -4, -33], [-10.5, -18, -1, -33.5], [-8, -13, 3, -33]]) P.thin([[x0, y0], [(x0 + x1) / 2 - 1.8, (y0 + y1) / 2], [x1, y1]], shade(purple, -0.28), 0.45);
		P.gloss(-5, -30, 3.2, 1.6, 0.45);
		// near wing, spread up and left
		P.shape((p) => { p.m(-2, -28); p.q(-6, -38, -15, -41); p.q(-17, -36, -21, -34); p.l(-18, -32); p.q(-21, -29, -21, -25); p.l(-16, -25.5); p.q(-16, -21, -14, -18.5); p.q(-8, -22, -4, -21); }, wing, -21, -2);
		for (const [x, y] of [[-15, -41], [-21, -34], [-21, -25], [-14, -18.5]]) P.thin([[-3, -27], [x, y]], shade(purple, -0.1), 0.6);
		P.line([[-3, -27], [-9, -37], [-15, -41]], shade(purple, -0.05), 1);
		P.poly([[-15, -41], [-12.6, -43.5], [-13.4, -40]], '#e0d0f0');
		// the great eye
		P.ellipse(7, -22, 5.8, 7.4, '#f0dca0');
		P.glow(7, -22, 5, '#fff4c0', 0.3);
		P.poly([[7.6, -27.6], [9.4, -22], [7.6, -16.4], [5.8, -22]], '#3a1868');
		P.poly([[7.6, -26], [8.4, -22], [7.6, -18], [6.8, -22]], '#8a5ad0', { line: false });
		P.dot(5.2, -25.4, 1, '#ffffff');
		P.shape((p) => { p.m(1.2, -26); p.q(6, -33, 12.6, -26); p.q(7, -30.5, 1.2, -26); }, shade(purple, -0.1), 1.2, 12.6);
	},
	// ---- dungeon level 5 (5A-5C) ----
	// Imp warrior: a scrawny red imp in a deep crouch, a big skull-like head on a short neck, dark horns and a pointed ear,
	// glowing yellow eyes and a long toothy jaw, a ragged loincloth, a forked tail from the rump, both hands gripping a long
	// wooden trident held across the body
	248(P) {
		P.shadow(12, 4.5);
		const skin = '#c8362c', horn = '#3a1a14', wood = '#7a5a3a', claw = '#4a0e0a';
		// tail from the rump, then the crouching legs joined at the hips
		taper(P, [[-2, -11], [-9, -9], [-12.5, -4], [-11.5, -1.2]], 2.2, 0.8, skin);
		P.poly([[-11.5, -1.2], [-13.6, -0.6], [-11.4, 1]], skin);
		for (const [hx, kx, ky, fx, c] of [[-2.4, -7.5, -8, -5.5, shade(skin, -0.1)], [2.4, 8, -8.5, 6.5, skin]]) {
			taper(P, [[hx, -12], [kx, ky], [fx, -2]], 4, 2.6, c);
			P.ellipse(fx + 1, -1.3, 2.8, 1.3, shade(skin, -0.25));
			for (const k of [0, 1, 2]) P.thin([[fx + 1.6 + k * 0.9, -1], [fx + 2.1 + k * 0.9, 0.2]], claw, 0.35);
		}
		// a compact ribby torso and the loincloth
		P.shape((p) => { p.m(-4.6, -21); p.q(0, -22.5, 4.8, -21); p.q(5.4, -16, 3.6, -12); p.q(0, -10.6, -3.6, -12); p.q(-5.4, -16, -4.6, -21); }, skin, -5.4, 5.4);
		for (const y of [-18.6, -16.6, -14.6]) P.thin([[-3, y], [3, y - 0.2]], shade(skin, -0.35), 0.4);
		P.gloss(-2.6, -19, 1.3, 0.8, 0.35);
		P.shape((p) => { p.m(-4, -13); p.q(0, -11.4, 4, -13); p.l(3.6, -5); p.l(2, -6.6); p.l(0.6, -4); p.l(-1, -6.6); p.l(-2.6, -4.6); p.l(-3.8, -7); }, '#6a4428', -4, 4);
		P.line([[-4, -12.6], [4, -12.6]], '#4a2a18', 0.8);
		// the trident: a long haft from the lower right to three wooden prongs at the upper left
		P.line([[12, -1], [-12.5, -31]], wood, 1);
		P.line([[-14.4, -27.6], [-9.6, -32.6]], wood, 0.9);
		for (const [x, y] of [[-16.2, -31.6], [-10.4, -36.8]]) P.line([[x + 2, y + 2.4], [x, y]], wood, 0.8);
		P.line([[-12.5, -31], [-13.4, -35.2]], wood, 0.8);
		for (const [x, y] of [[-16.2, -31.6], [-13.4, -35.2], [-10.4, -36.8]]) P.poly([[x - 0.8, y + 0.4], [x - 0.4, y - 2], [x + 0.8, y - 0.2]], wood);
		// arms from round shoulders, both hands closed around the haft
		taper(P, [[-3.6, -20], [-8.6, -19], [-6.6, -23.6]], 2.8, 2, skin);
		taper(P, [[3.8, -20], [9, -14.5], [6.2, -8.4]], 2.8, 2, skin);
		for (const [x, y] of [[-3.8, -20.2], [4, -20.2]]) P.circle(x, y, 1.9, skin, { line: false });
		for (const [x, y] of [[-6.6, -23.6], [6.2, -8.4]]) {
			P.circle(x, y, 1.7, skin);
			for (const d of [-0.7, 0, 0.7]) P.thin([[x - 1.1, y + d], [x + 1.1, y + d - 0.2]], shade(skin, -0.45), 0.3);
		}
		// neck, then the head: horns, a pointed ear, the cranium, a long jaw with a toothy grin, glowing eyes in dark sockets
		P.line([[1.2, -20], [2.2, -23.5]], skin, 3.2);
		for (const [x, dx] of [[1, -1], [6.5, 1]]) taper(P, [[x, -33], [x + dx * 1.5, -37.5], [x + dx * 4, -40]], 2.6, 0.4, horn);
		P.poly([[-1.6, -29], [-9, -31.5], [-1.6, -25.5]], skin);
		P.circle(3.8, -29, 6, skin);
		P.gloss(1.4, -32.5, 1.8, 1, 0.4);
		P.shape((p) => { p.m(0, -26.5); p.q(-0.2, -21, 4.6, -20); p.q(9.4, -19.6, 10.8, -22.4); p.q(11, -25.4, 9.2, -26.6); p.q(4.5, -24.8, 0, -26.5); }, skin, -0.2, 11);
		P.shape((p) => { p.m(2, -23.6); p.q(6.5, -20.4, 10.4, -23.4); p.q(6.5, -22, 2, -23.6); }, '#3a0a08', 2, 10.4, { line: false });
		for (let x = 3, i = 0; x < 10; x += 1.1, i++) P.poly([[x - 0.42, -23.3 + i * 0.05], [x + 0.42, -23.3 + i * 0.05], [x, -22.3]], '#fff6e0', { line: false });
		for (const x of [2, 7]) {
			P.ellipse(x, -29.2, 2.4, 2.2, '#5a0e0a', { line: false });
			P.glow(x, -29.2, 2.8, '#ffe040', 0.6); P.dot(x, -29.2, 1.6, '#ffe866'); P.dot(x + 0.3, -29.2, 0.55, '#5a1a0a');
		}
	},
	// Green flying demon: a hunched, muscular green gargoyle hanging in the air on green bat wings, two big cream horns,
	// glowing yellow eyes, a wide toothy grin and a pale belly, legs and tail dangling below
	249(P) {
		P.shadow(9, 3.2, 2, 0.18);
		const skin = '#5aa046', belly = '#e2e8bc', wing = '#4f8f3e', horn = '#f0e0b4';
		// wings rising from the hunched back
		for (const [sd, sc, c] of [[1, 0.7, shade(wing, -0.2)], [-1, 0.8, wing]]) {
			const W = (x) => -2 + sd * x * sc;
			P.shape((p) => { p.m(W(1), -22); p.q(W(3), -34, W(10), -42); p.l(W(10.5), -37); p.l(W(15.5), -36); p.l(W(12.5), -32); p.l(W(15.5), -28.5); p.l(W(10), -27.5); p.q(W(6), -25, W(3), -20); }, c, Math.min(W(1), W(15.5)), Math.max(W(1), W(15.5)));
			for (const [x, y] of [[10, -42], [15.5, -36], [15.5, -28.5]]) P.thin([[W(2), -22], [W(x), y]], shade(c, -0.4), 0.4);
		}
		taper(P, [[-4, -13], [-10, -8], [-8, -1], [-4, 0]], 3.4, 0.9, skin);
		P.poly([[-4, 0.2], [-2.2, -1], [-2.6, 1.4]], skin);
		for (const [hx, kx, fx] of [[-2.5, -2, 0], [3, 5.5, 5]]) {
			taper(P, [[hx, -13], [kx, -6], [fx, -2]], 4.2, 2.4, skin);
			P.ellipse(fx + 0.4, -1.6, 1.9, 1.1, shade(skin, -0.2));
			for (const k of [-1, 0, 1]) P.thin([[fx, -2], [fx + 0.8 + k * 0.7, -0.6]], '#2a3a1a', 0.4);
		}
		// a hunched back rising to the shoulders, the pale belly in front
		P.shape((p) => { p.m(-8, -10); p.q(-11, -18, -6, -23); p.q(0, -27, 7, -22); p.q(10, -17, 8, -10); p.q(0, -5.5, -8, -10); }, skin, -11, 10);
		P.ellipse(4, -14, 5, 6, belly, { line: false });
		for (const y of [-17.5, -15, -12.5, -10]) P.thin([[0.5, y], [8, y + 0.4]], shade(belly, -0.3), 0.35);
		P.gloss(-4, -20, 2.6, 1.4, 0.45);
		P.thin([[-4, -17], [-1, -21]], shade(skin, -0.3), 0.4);
		taper(P, [[5, -19], [11, -14], [9.4, -8]], 4.6, 3, skin);
		P.circle(5.6, -19, 3.4, skin);
		P.circle(9.4, -7.6, 2, skin);
		for (const k of [-1, 0, 1]) taper(P, [[9.4 + k * 1, -6.4], [9.8 + k * 1.2, -4.8]], 0.7, 0.2, '#2a3a1a');
		// head thrust forward low on the shoulders, horns sweeping up
		taper(P, [[3.5, -28.5], [-0.5, -32], [-1.5, -39]], 3.4, 0.4, horn);
		taper(P, [[9.5, -28.5], [13, -31], [13.5, -38]], 3.2, 0.4, horn);
		P.circle(6.5, -24.5, 6.6, skin);
		P.gloss(4, -28.5, 1.8, 1, 0.4);
		P.thin([[3, -27.8], [6, -26.8]], '#2a4a1a', 0.6); P.thin([[11, -27.8], [8.4, -26.8]], '#2a4a1a', 0.6);
		for (const x of [4.6, 9.4]) { P.glow(x, -25.4, 2.4, '#ffd23f', 0.6); P.dot(x, -25.4, 1.25, '#ffe26a'); P.dot(x, -25.4, 0.45, '#3a1a0a'); }
		P.shape((p) => { p.m(1.8, -21.8); p.q(6.5, -17.6, 12, -22); p.q(6.5, -20.2, 1.8, -21.8); }, '#2a1208', 1.8, 12, { line: false });
		for (let x = 3.2; x < 11; x += 1.25) P.poly([[x - 0.4, -21.3], [x + 0.4, -21.3], [x, -20.3]], '#f6f0dc', { line: false });
	},
	// Beholder: a round orange monster made of eyes and teeth: one huge slit-pupilled eye with smaller eyes around it, a wide
	// fanged mouth over a shaggy chin, writhing tentacles all round and crab-like claw legs underneath
	250(P) {
		P.shadow(14, 5);
		const skin = '#e0782a', flesh = '#f0b483';
		for (const [x0, kx, tip] of [[-7, -11, -8], [-3, -5, -2], [3, 5, 3], [7, 11, 9]]) {
			taper(P, [[x0, -9], [kx, -5], [tip, -0.4]], 2.8, 0.5, shade(skin, -0.1));
			P.thin([[tip, -0.4], [tip + Math.sign(tip) * 1.4, -1.6]], shade(skin, -0.5), 0.5);
		}
		const tent = [[[-8, -23], [-15, -31], [-20, -27], [-18, -23]], [[-4, -26], [-8, -36], [-3, -41], [-1, -38]], [[1, -27], [2, -38], [8, -41], [8, -37]],
			[[6, -25], [12, -34], [18, -34], [18, -30]], [[9.5, -20], [17, -24], [21, -19], [19, -15]], [[-10, -16], [-17, -18], [-21.5, -13], [-19, -10]],
			[[9, -12], [16, -12], [18.5, -7], [16, -5]], [[-9, -11], [-14, -8], [-15, -3]]];
		for (const t of tent) taper(P, t, 3, 1.1, skin);
		P.circle(0, -17, 11, skin);
		P.gloss(-5, -24, 3, 1.6, 0.45);
		P.ellipse(0.5, -8.6, 7, 3.8, flesh);
		for (const x of [-4.5, -2.5, -0.5, 1.5, 3.5, 5.5]) P.thin([[x, -7.4], [x + 0.3, -5.4]], shade(flesh, -0.3), 0.35);
		// the mouth: a wide dark grin with teeth top and bottom
		P.shape((p) => { p.m(-8.5, -15.5); p.q(0.5, -13.5, 9.5, -15.5); p.q(9, -10, 0.5, -9.8); p.q(-8, -10, -8.5, -15.5); }, '#4a1206', -8.5, 9.5);
		for (let x = -7; x <= 8; x += 1.5) {
			P.poly([[x - 0.6, -15 + Math.abs(x) * 0.05], [x + 0.6, -15 + Math.abs(x) * 0.05], [x, -12.8]], '#fbf2dc', { line: false });
			P.poly([[x - 0.5, -10.4 - Math.abs(x) * 0.06], [x + 0.5, -10.4 - Math.abs(x) * 0.06], [x - 0.1, -12]], '#fbf2dc', { line: false });
		}
		// eyes: lids, then whites with slit pupils
		for (const [x, y, r] of [[-6, -21.5, 1.9], [7.4, -21, 1.7], [-1.8, -27.2, 1.4], [4.6, -26.8, 1.3]]) {
			P.circle(x, y, r + 0.7, shade(skin, 0.05));
			P.circle(x, y, r, '#fbf6ea');
			P.ellipse(x + 0.2, y, r * 0.3, r * 0.7, '#1a0e08', { line: false });
		}
		P.circle(1, -21.5, 4.6, shade(skin, 0.05));
		P.circle(1, -21.5, 3.7, '#fbf6ea');
		P.ellipse(1.4, -21.5, 1, 2.6, '#1a0e08', { line: false });
		P.dot(0, -23, 0.8, '#ffffff');
	},
	// Demoness: a slim red-skinned woman on dark red bat wings, two dark horns curving back, long black hair, glowing gold
	// eyes, a dark leather top and a spotted skirt, a fireball in one hand and a long spade-tipped tail; she hovers
	251(P) {
		P.shadow(9, 3.2, 2, 0.18);
		const skin = '#c8443a', hair = '#2e1c18', wing = '#8a2a24', leather = '#3e2420';
		for (const [sd, c] of [[1, shade(wing, -0.15)], [-1, wing]]) {
			P.shape((p) => { p.m(sd * 2, -22); p.q(sd * 5, -36, sd * 13, -42); p.l(sd * 13, -37.5); p.l(sd * 18, -35); p.l(sd * 14.5, -31); p.l(sd * 18, -27); p.l(sd * 12.5, -26); p.q(sd * 8, -24, sd * 4, -19); }, c, sd < 0 ? -18 : 2, sd < 0 ? -2 : 18);
			for (const [x, y] of [[13, -42], [18, -35], [18, -27]]) P.thin([[sd * 3, -21], [sd * x, y]], shade(c, -0.45), 0.4);
		}
		taper(P, [[-1, -13], [-8, -10], [-10, -4], [-14, -2.5]], 1.8, 0.7, skin);
		P.poly([[-14, -2.5], [-16.4, -4.2], [-15.4, -0.4]], '#7a1a14');
		// legs together, knees bent back, toes pointed down
		taper(P, [[1.8, -13], [4, -7], [2.8, -2.2]], 3.8, 1.8, shade(skin, -0.1));
		taper(P, [[-1.8, -13], [-0.4, -6.5], [-2.4, -1.2]], 3.8, 1.8, skin);
		P.shape((p) => { p.m(-4.4, -13.4); p.l(4.4, -13.4); p.l(5, -9.5); p.l(2.6, -10.4); p.l(1, -9); p.l(-1, -10.2); p.l(-3, -9); p.l(-4.8, -10); }, '#9a6a4a', -4.8, 5);
		for (const [x, y] of [[-2.6, -11.8], [0.6, -11.2], [3, -12]]) P.dot(x, y, 0.4, '#4a2a1a');
		// slim waist, hips
		P.shape((p) => { p.m(-3.6, -21); p.l(3.6, -21); p.q(2.2, -17, 2.6, -15.5); p.q(4.6, -14, 4.4, -13); p.l(-4.4, -13); p.q(-4.6, -14, -2.6, -15.5); p.q(-2.2, -17, -3.6, -21); }, skin, -4.6, 4.6);
		P.shape((p) => { p.m(-3.8, -20.2); p.q(0, -18.6, 3.8, -20.2); p.l(3.4, -17.6); p.q(1.6, -16.6, 0, -17.8); p.q(-1.6, -16.6, -3.4, -17.6); }, leather, -3.8, 3.8);
		// one arm holds a fireball out to the side; the other hangs, clawed
		taper(P, [[-3.4, -20], [-7.4, -16.8], [-10.2, -17.8]], 2.4, 1.6, skin);
		P.glow(-11.5, -19, 6, '#ffb030', 0.6);
		P.shape((p) => { p.m(-14, -18.5); p.q(-15, -22, -12.5, -25.5); p.q(-12.4, -22.5, -11, -22); p.q(-10.6, -24, -9.4, -24.8); p.q(-8.4, -21, -9.4, -18.2); p.q(-11.5, -15.6, -14, -18.5); }, '#ff9a20', -15, -8.4);
		P.ellipse(-11.6, -19.2, 1.8, 1.7, '#fff2a0', { line: false });
		P.circle(-10.4, -17.6, 1.3, skin);
		for (const d of [-0.6, 0.4]) P.thin([[-10.8 + d, -18.4], [-11.6 + d, -19.4]], shade(skin, -0.4), 0.3);
		taper(P, [[3.4, -20], [6.8, -16], [6.4, -12.4]], 2.4, 1.6, skin);
		P.circle(6.4, -12, 1.2, skin);
		for (const k of [-1, 0, 1]) P.thin([[6.4 + k * 0.6, -11], [6.6 + k * 0.7, -9.8]], '#3a0e0a', 0.35);
		for (const sd of [-1, 1]) P.circle(sd * 3.6, -20.2, 1.6, skin, { line: false });
		// long hair flowing back behind the head, the head, horns curving back, a side-swept fringe
		P.shape((p) => { p.m(-3, -32.5); p.q(-8.5, -31, -8, -25); p.q(-8, -20.5, -5.5, -18); p.q(-6, -22, -3.5, -23.5); p.l(-1, -26); }, hair, -8.5, -1);
		P.line([[0.2, -20], [0.6, -23]], skin, 2.4);
		head(P, -27, 5.6, skin);
		P.eyes(1, -27, 2, 1.2, '#e8a020');
		P.thin([[-1.8, -28.9], [0, -28.4]], '#3a0e0a', 0.4); P.thin([[3.8, -28.9], [2, -28.4]], '#3a0e0a', 0.4);
		P.mouth(1, -23.8, 0.8, '#5a0e0a');
		P.shape((p) => { p.m(-5.8, -25.5); p.q(-6.4, -33.5, 0.5, -33.4); p.q(5.4, -33.2, 5.6, -30); p.q(3, -32.4, 0.4, -32); p.q(-2.6, -31.4, -3.6, -29); p.q(-4.6, -27.6, -4.4, -24.6); }, hair, -6.4, 5.6);
		for (const [x, tx] of [[-2.6, -6.5], [2.4, -1.5]]) taper(P, [[x, -32], [x - 1, -37], [tx, -40]], 2.2, 0.4, '#7a5048');
	},
	// Dethclow: a hulking red brute standing hunched on two short legs like a gorilla: massive shoulders bristling with big
	// curved cream horns, cream knobs on its hide, long thick arms reaching down to the ground, a small pale skull-like head
	// set low between the shoulders with a glowing eye and tusks, a spiny tail
	252(P) {
		P.shadow(17, 5.5);
		const red = '#c0443a', cream = '#f0cf98', face = '#e07a68', claw = '#f4e4c4';
		// tail with spines from behind the rump
		taper(P, [[-5, -12], [-13, -11], [-18, -6], [-16, -1.4]], 3.6, 0.8, shade(red, -0.1));
		for (const [x, y] of [[-11, -12.4], [-15, -10.4], [-17.8, -7]]) P.poly([[x + 0.8, y + 0.4], [x - 1.6, y - 2.8], [x - 0.6, y + 0.6]], cream);
		// horns fanning back from the hunched back and the shoulders
		for (const [x, y, mx, my, tx, ty, w] of [[-8, -21, -12, -24, -16, -24, 3], [-6, -26, -10, -31, -15, -32, 3.6], [-2.5, -30, -4, -37, -9, -40, 4], [2, -31.5, 2, -39, -2, -44, 4], [7, -30, 9, -37, 7, -43, 3.6], [11, -26, 15, -31, 16, -37, 3.2]]) taper(P, [[x, y], [mx, my], [tx, ty]], w, 0.4, cream);
		// short bent legs joined under the body
		for (const [hx, kx, fx] of [[-4, -8, -6], [4, 8, 6.5]]) {
			taper(P, [[hx, -13], [kx, -7.5], [fx, -2]], 5.6, 3.8, shade(red, -0.08));
			P.ellipse(fx + 0.6, -1.3, 3.4, 1.5, shade(red, -0.25));
			for (const k of [-1, 0, 1]) P.thin([[fx + 0.8 + k * 1.2, -0.8], [fx + 1.4 + k * 1.3, 0.5]], claw, 0.4);
		}
		// the body: a huge hump of shoulders over a narrower waist, a cream chest
		P.shape((p) => { p.m(-7, -10); p.q(-12, -17, -10, -24); p.q(-6, -32, 1.5, -32.5); p.q(9.5, -32.5, 12, -25); p.q(13, -16, 7, -10); p.q(0, -7.5, -7, -10); }, red, -12, 13);
		P.shape((p) => { p.m(-1, -22); p.q(4, -24.5, 8, -21); p.q(9, -15, 5, -11.5); p.q(0, -10.4, -2.6, -13); p.q(-4, -18, -1, -22); }, cream, -4, 9, { line: false });
		for (const y of [-19, -16, -13.5]) P.thin([[-1.6, y], [6.6, y - 0.4]], shade(cream, -0.3), 0.35);
		for (const [x, y, r] of [[-8, -21, 1.2], [-5, -26, 1.4], [-1, -29.4, 1.4], [4, -30, 1.3], [8.5, -28, 1.2], [-8.6, -15, 0.9]]) P.circle(x, y, r, cream);
		P.gloss(-5, -24, 3, 1.4, 0.35);
		// long thick arms from the shoulders down to knuckles on the ground, a round deltoid at each shoulder
		for (const [sd, c] of [[-1, shade(red, -0.06)], [1, red]]) {
			taper(P, [[sd * 9, -24], [sd * 15.5, -17], [sd * 14.5, -8], [sd * 14, -3]], 6.6, 4.6, c);
			P.ellipse(sd * 14, -2, 3.4, 2.2, c);
			for (const k of [-1, 0, 1]) P.thin([[sd * 14 + k * 1.3, -0.8], [sd * 14 + k * 1.5 + 0.7, 0.6]], claw, 0.45);
			P.ellipse(sd * 9.6, -24, 5, 4.4, c);
			for (const [dx, dy, tx, ty] of [[-1.5, -3.4, -3, -8], [1.5, -3.4, 2, -8.6], [3.6, -1.6, 6, -5.6]]) taper(P, [[sd * (9.6 + dx), -24 + dy], [sd * (9.6 + tx), -24 + ty]], 2, 0.3, cream);
		}
		// the small head set low between the shoulders: horns, a pale pink skull face, a jaw with tusks, a glowing eye
		taper(P, [[3.5, -26.5], [2.5, -31], [-0.5, -33]], 2.4, 0.4, cream);
		taper(P, [[7.5, -26.5], [10, -30], [10.5, -33.5]], 2.2, 0.4, cream);
		P.circle(5.5, -22.5, 4.6, face);
		P.gloss(3.6, -25, 1.2, 0.7, 0.4);
		P.shape((p) => { p.m(2.6, -20.4); p.q(6.5, -21.4, 10.6, -20.6); p.q(10.4, -17.4, 6.5, -16.8); p.q(3, -17, 2.6, -20.4); }, cream, 2.6, 10.6);
		for (const x of [5.4, 8.8]) P.poly([[x - 0.6, -20.6], [x + 0.6, -20.6], [x + 0.2, -23.2]], '#fff8e8');
		P.thin([[3.2, -25.2], [8.4, -24.2]], '#5a1a14', 0.8);
		for (const x of [4.2, 7.6]) { P.ellipse(x, -23.2, 1.3, 1.1, '#3a0a08', { line: false }); P.glow(x, -23.2, 2.2, '#ffd23f', 0.7); P.dot(x, -23.2, 0.7, '#ffe26a'); }
	},
	// Demon shieldman: a hunched, muscular red demon, its head set down between the shoulders, tall cream horns and a spiny
	// back, glowing eyes and tusks, a strap across the chest, a belt with a skull and crossbones, wrapped legs and wrists, a
	// round wooden shield on one thick arm and a spiked bone club in the other fist
	253(P) {
		P.shadow(14, 5);
		const red = '#c4443a', cream = '#f0d8a4', wrap = '#8a5a34', wood = '#6a4a30';
		taper(P, [[-3, -11], [-11, -9], [-14.5, -12.5], [-12, -15]], 2, 0.8, red);
		// spines along the hunched back
		for (const [x, y] of [[-9.5, -20], [-8.5, -24], [-5.5, -27], [-1.5, -28.4]]) P.poly([[x + 1.8, y + 1.2], [x - 2.6, y - 2.4], [x + 1.6, y - 1.4]], cream);
		// thick bent legs joined at the hips, with wraps
		for (const [hx, kx, fx, c] of [[-3.5, -7.5, -5.5, shade(red, -0.08)], [3.5, 7.5, 6, red]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 5, 3.2, c);
			for (const t of [0.4, 0.7]) P.thin([[kx + (fx - kx) * t - 1.6, -7 + 5 * t + 0.2], [kx + (fx - kx) * t + 1.6, -7 + 5 * t - 0.4]], wrap, 0.8);
			P.ellipse(fx + 0.8, -1.2, 3, 1.4, shade(red, -0.3));
		}
		// a hunched, muscular torso: a high back, broad shoulders, a narrower waist
		P.shape((p) => { p.m(-9, -20); p.q(-10, -27.5, -2, -28); p.q(6, -28.5, 10, -22.5); p.q(10, -15, 5.5, -10.5); p.l(-5.5, -10.5); p.q(-9, -14, -9, -20); }, red, -10, 10);
		P.thin([[-3, -19.5], [1.5, -18], [6, -19.5]], shade(red, -0.35), 0.45); P.thin([[1.5, -18], [1.5, -12]], shade(red, -0.35), 0.4);
		P.thin([[-2, -15], [5, -15]], shade(red, -0.3), 0.35);
		P.gloss(-5, -23, 2.6, 1.3, 0.35);
		P.thin([[-7, -24], [5.5, -11]], wrap, 1.1);
		P.shape((p) => { p.m(-5.8, -11); p.l(5.8, -11); p.l(5.4, -3.5); p.l(3.2, -5); p.l(1, -2.8); p.l(-1.5, -4.6); p.l(-3.6, -3); p.l(-5.8, -4.4); }, '#4a3226', -5.8, 5.8);
		P.line([[-6, -11.2], [6, -11.2]], wrap, 1.4);
		P.line([[-1.6, -14.6], [3, -9.6]], cream, 0.7); P.line([[3, -14.6], [-1.6, -9.6]], cream, 0.7);
		skull(P, 0.7, -12.8, 2.5, cream);
		// the club arm: a thick arm down to a fist gripping a bone club with a spiked head
		P.ellipse(-8.6, -22, 3.8, 3.6, red);
		taper(P, [[-9, -22], [-13, -16.5], [-11, -11]], 4.8, 3.6, red);
		P.line([[-13.2, -16.5], [-8.4, -4.6]], wood, 1.4);
		P.ellipse(-7.8, -3.4, 2.5, 3.5, cream, { rot: -0.4 });
		for (const [dx, dy] of [[-2.6, -0.6], [-2.2, 1.8], [-0.6, 3], [1.4, 2.6], [2.6, 0.6], [2.4, -1.6]]) P.poly([[-7.8 + dx * 0.55 - dy * 0.25, -3.4 + dy * 0.55 + dx * 0.25], [-7.8 + dx * 1.6, -3.4 + dy * 1.5], [-7.8 + dx * 0.55 + dy * 0.25, -3.4 + dy * 0.55 - dx * 0.25]], cream);
		P.circle(-10.9, -10.8, 2.3, red);
		for (const d of [-0.8, 0, 0.8]) P.thin([[-12.4, -10.8 + d], [-9.6, -11.4 + d]], shade(red, -0.45), 0.3);
		P.thin([[-12.8, -13.4], [-9.6, -12.6]], wrap, 1);
		// the shield arm: a thick arm out to the side, the round shield strapped over it
		P.ellipse(8.8, -22, 3.8, 3.6, red);
		taper(P, [[9, -22], [13, -17], [12.5, -13]], 4.8, 3.6, red);
		P.circle(13.5, -12.6, 7, wood);
		P.circle(13.5, -12.6, 5.2, shade(wood, 0.08), { line: false });
		for (const a of [0.5, 1.6, 2.7, 3.8, 4.9, 6]) P.dot(13.5 + Math.cos(a) * 6.1, -12.6 + Math.sin(a) * 6.1, 0.55, '#aab0b8');
		P.circle(13.5, -12.6, 1.9, '#8a909a');
		P.thin([[8.5, -15.6], [18.5, -9.6]], shade(wood, -0.35), 0.4); P.thin([[9, -8.6], [17.5, -16.6]], shade(wood, -0.35), 0.4);
		P.gloss(11, -16.6, 1.8, 0.9, 0.35);
		// head set down into the shoulders, thrust forward: tall horns, a heavy brow, glowing eyes, tusks
		taper(P, [[2.2, -29.5], [0.5, -34.5], [-1, -40.5]], 3, 0.4, cream);
		taper(P, [[7.6, -29.5], [10.5, -33.5], [11.5, -40]], 3, 0.4, cream);
		P.circle(4.8, -25, 5.6, red);
		P.gloss(2.6, -28.4, 1.6, 0.9, 0.4);
		P.shape((p) => { p.m(1.2, -27.4); p.q(5, -26, 10.2, -27.8); p.l(10, -26.4); p.q(5.4, -24.8, 1.4, -26.2); }, shade(red, -0.35), 1.2, 10.2, { line: false });
		for (const x of [3.4, 7.8]) { P.glow(x, -25, 2.2, '#ffd23f', 0.6); P.dot(x, -25, 1.05, '#ffe26a'); P.dot(x + 0.2, -25, 0.4, '#3a0a08'); }
		P.ellipse(6, -21.2, 3.2, 1.3, '#3a0a08', { line: false });
		for (const x of [3.8, 8.2]) P.poly([[x - 0.7, -20.6], [x + 0.7, -20.6], [x + (x < 6 ? -0.4 : 0.4), -23.6]], cream);
	},
	// Lava golem: a tall, hulking golem of glowing red-orange rock, a low domed head with ember eyes, jagged molten cracks
	// glowing across its body, long rocky arms hanging from massive shoulders, dark boulders crusting one shoulder and arm
	254(P) {
		P.shadow(15, 6);
		const lava = '#d4502a', rock = '#5e2622', hot = '#ffb040';
		const crack = (pts, w = 0.9) => {
			for (const [x, y] of pts.filter((_, i) => i % 2)) P.glow(x, y, 1.8, hot, 0.25);
			P.thin(pts, shade(hot, -0.15), w); P.thin(pts, '#fff0a0', w * 0.35);
		};
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 4.5, -12], [sd * 5.5, -6], [sd * 6, -2]], 6, 5, lava);
			P.ellipse(sd * 7, -1.3, 4.2, 2, shade(lava, -0.15));
		}
		// long rocky arms drawn first, so they hang from under the shoulders; big blocky fists
		for (const [sd, c] of [[-1, shade(lava, -0.04)], [1, shade(lava, -0.08)]]) {
			taper(P, [[sd * 8, -24], [sd * 15, -17], [sd * 15.5, -10], [sd * 14.5, -6.5]], 6.4, 4.6, c);
			P.shape((p) => { p.m(sd * 11.6, -8); p.q(sd * 17.6, -9.4, sd * 18, -5); p.q(sd * 17.6, -1.6, sd * 14.4, -1.8); p.q(sd * 11.2, -2.4, sd * 11.6, -8); }, c, sd < 0 ? -18 : 11.2, sd < 0 ? -11.2 : 18);
			for (const k of [0, 1]) P.thin([[sd * (13.6 + k * 2), -3], [sd * (13.6 + k * 2), -1.9]], shade(lava, -0.45), 0.5);
			crack([[sd * 13.5, -20], [sd * 14.6, -17.6], [sd * 13.8, -15.4], [sd * 15, -13]], 0.7);
		}
		// body: massive shoulders narrowing to the hips, the low domed head rising out of them
		P.shape((p) => { p.m(-6, -9.5); p.q(-9, -13, -10, -18); p.q(-14, -22, -11, -25.5); p.q(-8, -27.5, -4.5, -27.5); p.q(-4, -36.5, 1.5, -36.5); p.q(7, -36.5, 7.2, -28); p.q(11, -27.5, 13, -25); p.q(14.5, -21, 11, -17.5); p.q(10, -12, 7, -9.5); p.q(0.5, -7, -6, -9.5); }, lava, -14, 14.5);
		for (const [x, y, r] of [[-6, -19, 1.4], [6, -16, 1.2], [-1.5, -24, 1], [10, -21, 0.9], [2.5, -12, 0.8]]) P.dot(x, y, r, shade(lava, -0.25));
		// jagged molten cracks
		crack([[0.5, -26.5], [-0.6, -24], [1.4, -21.6], [-0.4, -19], [1, -16.4], [-1, -13.6], [0.4, -10.4]]);
		crack([[1.4, -21.6], [3.6, -20.4], [4.4, -17.6], [6.6, -15.6], [6, -12.6]], 0.7);
		crack([[-0.4, -19], [-2.8, -18], [-3.4, -15.2], [-5.6, -13.4]], 0.7);
		crack([[-6.5, -24.5], [-5, -22.6], [-6.8, -20.6], [-5.6, -18.8]], 0.6);
		crack([[8.5, -24.5], [7.2, -22.4], [9, -20.4], [8, -18.6]], 0.6);
		P.thin([[-4, -27.2], [1.5, -26], [7, -27.6]], shade(lava, -0.35), 0.5);
		P.gloss(-1, -34, 2, 1.1, 0.4);
		P.shape((p) => { p.m(-2.2, -31.6); p.q(1.6, -30.4, 5.6, -31.6); p.l(5.4, -29); p.q(1.6, -28, -2, -29); }, '#5a1a10', -2.2, 5.6, { line: false });
		P.glowEyes(1.6, -30.2, 2.1, 0.75, '#ffcc40');
		// dark boulders crusting the left shoulder and upper arm, a few on the right shoulder
		for (const [x, y, r, k] of [[-11.5, -24.5, 2.6, 0], [-7.5, -27, 2.2, 1], [-14.2, -20.5, 2.2, 2], [-15.6, -15.8, 1.9, 3], [-15.4, -11.6, 1.6, 4], [-4.4, -30, 1.7, 5], [-10, -21.5, 1.6, 6], [11, -25, 2, 8], [13.6, -21.5, 1.5, 9], [8, -27.6, 1.6, 10], [-2, -33.5, 1.2, 11]]) {
			const pts = [];
			for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + k, rr = r * (0.8 + 0.25 * Math.sin(k * 3 + i * 2)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]); }
			P.poly(pts, rock);
			P.gloss(x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.18, 0.3);
		}
	},
	// Demon kingpin (also the 5A boss and the Demon mobster): a fat red demon with huge dark horns, little bat wings, glowing
	// eyes and tusks, a necklace of skulls, a ragged brown loincloth, thick arms with long dark claws
	255(P) {
		P.shadow(15, 6);
		const red = '#cf4a44', horn = '#5a3a2a', bone = '#ecdcb8', wing = '#b03a32';
		for (const sd of [-1, 1]) {
			P.shape((p) => { p.m(sd * 7, -22); p.q(sd * 12, -32, sd * 20, -32); p.l(sd * 18.5, -28); p.l(sd * 21, -25); p.l(sd * 16.5, -23.5); p.l(sd * 17.5, -20); p.q(sd * 12, -21, sd * 9, -17); }, wing, sd < 0 ? -21 : 7, sd < 0 ? -7 : 21);
			for (const [x, y] of [[20, -32], [21, -25], [17.5, -20]]) P.thin([[sd * 8, -21], [sd * x, y]], shade(wing, -0.45), 0.4);
		}
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 5.5, -8], [sd * 6, -2]], 5.4, 4.6, red);
			P.ellipse(sd * 6.6, -1.1, 3.4, 1.8, shade(red, -0.25));
			for (const k of [-1, 0, 1]) P.dot(sd * 6.6 + k * 1.3 + sd * 1.4, -0.4, 0.45, '#efe0c0');
		}
		P.ellipse(0, -14, 12.5, 11.5, red);
		P.ellipse(0.5, -11.5, 8.5, 7, shade(red, 0.12), { line: false });
		P.thin([[-0.2, -9.6], [0.6, -9]], shade(red, -0.4), 0.5);
		P.thin([[-8, -17], [-4, -15.5]], shade(red, -0.3), 0.4); P.thin([[8, -17], [4, -15.5]], shade(red, -0.3), 0.4);
		P.gloss(-6, -19, 3.4, 1.8);
		P.shape((p) => { p.m(-10, -6.5); p.q(0, -3.5, 10, -6.5); p.l(8.5, -1); p.l(6.5, -2.4); p.l(4.5, 0); p.l(2, -1.6); p.l(-0.5, 0.4); p.l(-3, -1.6); p.l(-5.5, 0); p.l(-7.5, -2); p.l(-9, -1); }, '#7a5a3a', -10, 10);
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 10.5, -20], [sd * 15, -12], [sd * 13.5, -6.5]], 6, 4.2, red);
			P.circle(sd * 13.5, -5.4, 2.8, red);
			for (const k of [-1, 0, 1]) taper(P, [[sd * (13.5 + k * 1.2), -3.6], [sd * (14 + k * 1.4), -1.2], [sd * (12.8 + k * 1.3), 0]], 1, 0.2, '#4a2a1e');
		}
		// huge horns sweeping out and up
		for (const sd of [-1, 1]) taper(P, [[sd * 3.5, -30.5], [sd * 11, -32], [sd * 9.5, -45]], 3.6, 0.5, horn);
		P.circle(0, -25.5, 6.6, red);
		for (const sd of [-1, 1]) P.ellipse(sd * 6.4, -26, 1.3, 1.9, shade(red, -0.1));
		P.shape((p) => { p.m(-5, -28.6); p.q(0, -26, 5, -28.6); p.l(5, -27.2); p.q(0, -24.6, -5, -27.2); }, shade(red, -0.35), -5, 5, { line: false });
		P.glowEyes(0, -26.4, 2.3, 0.9, '#ffd23f');
		P.ellipse(0, -21.8, 3.6, 1.2, '#3a0a08', { line: false });
		for (const sd of [-1, 1]) P.poly([[sd * 2.6, -21.2], [sd * 1.6, -21.2], [sd * 2.4, -24.4]], '#f6ecd6');
		// skull necklace
		P.thin([[-7.5, -20.5], [0, -16.5], [7.5, -20.5]], '#6a4a2a', 0.5);
		for (const [x, y] of [[-6.2, -19.4], [-3.2, -17.6], [0, -16.8], [3.2, -17.6], [6.2, -19.4]]) skull(P, x, y, 1.9, bone);
	},
	// Demon lord (also the 5B boss): a winged red demon, the wings rising from its back, dark ridged horns curling back, a
	// red head with a long pale muzzle, glowing eyes and fangs on a thick neck, a muscular body with a cream chest, a clawed
	// hand closed around a glowing red orb and a spade-tipped tail
	256(P) {
		P.shadow(13, 5);
		const red = '#c8463a', cream = '#ecc8a0', horn = '#4a2a20', wing = '#a8382e', claw = '#3a0e0a';
		// wings rooted at the shoulder blades
		for (const [sd, c, w, h] of [[1, shade(wing, -0.15), 17, 44], [-1, wing, 22, 42]]) {
			P.shape((p) => { p.m(sd * 1, -23); p.q(sd * 8, -40, sd * w, h * -1); p.l(sd * (w - 1), -36); p.l(sd * (w + 2), -30); p.l(sd * (w - 2.5), -27); p.l(sd * (w - 0.5), -21); p.l(sd * (w - 6), -21); p.q(sd * 9, -19, sd * 3, -17); }, c, sd < 0 ? -w - 2 : 1, sd < 0 ? -1 : w + 2);
			for (const [x, y] of [[w, -h], [w + 2, -30], [w - 0.5, -21]]) P.thin([[sd * 2, -21], [sd * x, y]], shade(c, -0.45), 0.5);
			taper(P, [[sd * 2, -21], [sd * 8, -36], [sd * w, -h]], 1.6, 0.6, shade(c, -0.1));
		}
		taper(P, [[-2, -11], [-8, -9], [-11, -3.5], [-14, -2]], 2.2, 0.8, red);
		P.poly([[-14, -2], [-16.5, -3.6], [-15.6, -0.2]], shade(red, -0.2));
		// thick legs joined at the hips
		for (const [hx, kx, fx, c] of [[-3, -6.5, -3.8, shade(red, -0.08)], [3, 7, 5.2, red]]) {
			taper(P, [[hx, -13], [kx, -6.5], [fx, -2]], 4.8, 3, c);
			P.ellipse(fx + 0.6, -1.3, 2.8, 1.3, shade(red, -0.25));
			for (const k of [-1, 0, 1]) P.thin([[fx + k * 1.1 + 0.6, -0.9], [fx + k * 1.3 + 1.4, 0.4]], claw, 0.4);
		}
		// a muscular torso narrowing to the hips, the cream chest
		P.shape((p) => { p.m(-7.5, -22); p.q(0, -24.5, 7.5, -22); p.q(7.6, -16, 4.5, -12.5); p.q(0, -9.6, -4.5, -12.5); p.q(-7.6, -16, -7.5, -22); }, red, -7.6, 7.6);
		P.shape((p) => { p.m(-3, -21); p.q(0.2, -20, 3.5, -21); p.q(3.4, -14.5, 1.6, -11.4); p.q(0, -10.8, -1.6, -11.4); p.q(-3.2, -14.5, -3, -21); }, cream, -3.2, 3.5, { line: false });
		for (const y of [-17.5, -15, -12.8]) P.thin([[-2.2, y], [2.6, y]], shade(cream, -0.3), 0.35);
		P.gloss(-5, -20, 1.6, 0.9, 0.35);
		// thick arms from round shoulders: one hand closed around a glowing red orb, the other hanging with claws
		taper(P, [[-6.5, -21], [-11.5, -17], [-12, -13]], 4, 2.8, red);
		P.glow(-13.4, -9.6, 5.5, '#ff3a2a', 0.5);
		P.circle(-13.4, -9.6, 3.3, '#c82020');
		P.circle(-13.8, -9.4, 1.8, '#ff6a4a', { line: false });
		P.dot(-14.8, -10.8, 0.7, '#ffe0d0');
		P.circle(-12, -13, 2.1, red);
		for (const [x0, x1, y1] of [[-13.4, -16, -10.4], [-12.2, -14.6, -9], [-11, -12.4, -8.2]]) {
			taper(P, [[x0, -12.4], [x1, y1]], 1.3, 0.9, red);
			P.dot(x1 + 0.1, y1 + 0.5, 0.4, claw);
		}
		taper(P, [[6.5, -21], [11, -16.5], [10.6, -11]], 4, 2.8, red);
		P.circle(10.6, -10.4, 1.9, red);
		for (const k of [-1, 0, 1]) taper(P, [[10.6 + k * 0.9, -9], [10.9 + k * 1.1, -7.4]], 0.7, 0.2, claw);
		for (const sd of [-1, 1]) P.circle(sd * 6.4, -21.2, 2.4, red, { line: false });
		// a dark spiky mane behind the head, the far horn rising up and back, the near one curling down like a ram's
		for (const [x, y] of [[-4, -24.5], [-5, -28.5], [-3.6, -32.6]]) P.poly([[x + 2, y + 1.4], [x - 2.8, y - 1.4], [x + 2.2, y - 1.4]], horn);
		taper(P, [[3.5, -32], [3, -38], [7, -42.5], [10, -41.5]], 2.8, 0.4, shade(horn, 0.12));
		// a thick neck running from the shoulders up into the head
		P.shape((p) => { p.m(-5, -22); p.q(-2, -23.5, -1, -27); p.l(5, -27); p.q(5.6, -23.6, 6, -22); p.q(0.5, -20.6, -5, -22); }, red, -5, 6, { line: false });
		P.thin([[-4.4, -22.4], [-1.4, -24], [-0.8, -26]], shade(red, -0.5), 0.45);
		taper(P, [[0, -32.5], [-6, -36], [-8.5, -29], [-5, -23.5]], 3.8, 1, horn);
		for (const t of [[-3.4, -35.2], [-6.8, -33.6], [-8, -29.6]]) P.thin([[t[0] - 0.8, t[1] - 0.8], [t[0] + 0.8, t[1] + 0.8]], shade(horn, 0.25), 0.35);
		P.circle(2, -28.5, 5.8, red);
		P.gloss(-0.5, -31.8, 1.6, 0.9, 0.4);
		P.shape((p) => { p.m(3, -27.5); p.q(8, -28.2, 10.8, -26); p.q(11.2, -23.6, 9.6, -22.6); p.q(10, -20.6, 7.6, -20.2); p.q(4, -20, 2.2, -22.6); p.q(1.2, -25.4, 3, -27.5); }, cream, 1.2, 11.2);
		P.shape((p) => { p.m(-0.4, -31); p.q(5, -32.4, 9.8, -29.4); p.l(9.6, -27.8); p.q(5, -29.4, -0.2, -29.2); }, shade(red, -0.3), -0.4, 9.8);
		for (const x of [3.4, 7.2]) { P.ellipse(x, -27.9, 1.5, 1.2, '#3a0a08', { line: false }); P.glow(x, -27.9, 2.2, '#ffd23f', 0.7); P.dot(x, -27.9, 0.85, '#ffe26a'); }
		P.ellipse(10.2, -25.4, 0.5, 0.4, '#3a0a08', { line: false });
		P.shape((p) => { p.m(4, -23.4); p.q(7, -22, 10, -23.2); p.q(7.4, -21, 4, -23.4); }, '#3a0a08', 4, 10, { line: false });
		for (const x of [5.2, 6.8, 8.4]) P.poly([[x - 0.4, -23.1], [x + 0.4, -23.1], [x, -21.9]], '#fff6e0', { line: false });
	},
	// The Violet Dragon (5C boss): a violet dragon sitting up on its haunches, wings spread, a cream ridged belly, a long
	// curling tail, a horned head on a curved neck facing right, a red eye and a roaring red mouth
	257(P) {
		P.shadow(18, 6);
		const scale = '#6a5ab8', dark = '#463a8a', belly = '#e8dcb0', wing = '#8a7ad0', horn = '#d9d0ee';
		for (const [sd, c] of [[1, shade(wing, -0.3)], [-1, wing]]) {
			P.shape((p) => { p.m(sd * 2 - 1, -24); p.q(sd * 8, -42, sd * 20, -44); p.l(sd * 18.5, -38); p.l(sd * 24, -33); p.l(sd * 19, -28.5); p.l(sd * 23.5, -22); p.l(sd * 17, -20); p.l(sd * 19, -13); p.q(sd * 10, -16, sd * 5 - 1, -14); }, c, sd < 0 ? -24 : -1, sd < 0 ? 0 : 24, { alpha: 0.95 });
			for (const [x, y] of [[20, -44], [24, -33], [23.5, -22], [19, -13]]) P.thin([[sd * 3, -23], [sd * x, y]], shade(c, -0.4), 0.5);
		}
		// tail curling out to the left
		taper(P, [[-5, -5], [-14, -2], [-20, -6], [-19.5, -12], [-16, -13]], 4, 1, dark);
		P.poly([[-16.4, -12], [-14.4, -16], [-14, -11.6]], dark);
		// haunch and feet
		P.ellipse(-5, -8.5, 6, 6, scale);
		for (const x of [-6, 6.5]) {
			P.ellipse(x, -1.3, 3.6, 1.7, dark);
			for (const k of [-1, 0, 1]) P.thin([[x + 1.6 + k * 1.2, -1], [x + 2.4 + k * 1.2, 0.4]], '#f2ecda', 0.4);
		}
		taper(P, [[5, -9], [6.5, -2]], 4.4, 3.4, dark);
		// body with the belly plates
		P.shape((p) => { p.m(-7, -22); p.q(-12, -12, -8, -4); p.q(0, -1.5, 8, -4); p.q(11, -13, 5, -22); p.q(-1, -26, -7, -22); }, scale, -12, 11);
		P.shape((p) => { p.m(1, -22); p.q(8, -20, 8.6, -12); p.q(8, -5.5, 3, -4); p.q(-2.4, -10, 1, -22); }, belly, -2.4, 8.6);
		for (const y of [-19, -16, -13, -10, -7]) P.thin([[0.5 + Math.abs(y + 13) * 0.25, y], [8.2 - Math.abs(y + 13) * 0.15, y + 0.5]], shade(belly, -0.35), 0.4);
		P.gloss(-6, -17, 2.4, 1.3, 0.4);
		P.ellipse(-5, -8.5, 6, 6, scale);
		P.thin([[-9, -6], [-5, -12], [-1.5, -9]], shade(scale, -0.3), 0.45);
		// front legs held in front of the belly
		taper(P, [[-2, -17], [2, -13], [5, -12]], 3, 2, scale);
		for (const k of [-1, 0, 1]) P.thin([[5, -12], [6.6, -12.6 + k * 0.9]], '#f2ecda', 0.4);
		// a curved neck up to the head, spikes down the back of it
		for (const [x, y] of [[-3, -25], [-2.5, -29.5], [0, -33.5], [3.5, -36]]) P.poly([[x + 1.4, y + 1.6], [x - 3, y - 1.2], [x + 2, y - 1]], dark);
		taper(P, [[1.5, -19], [-1, -27], [2, -32], [7, -33]], 8, 6, scale);
		taper(P, [[4.5, -20], [2.6, -26], [4.6, -29.5], [8, -29.5]], 3, 2.2, belly, { line: false });
		// head: horns, brow, open roaring mouth with fangs, a red eye
		for (const [x, tx, ty] of [[6, 1, -43], [8.5, 6, -45]]) taper(P, [[x, -36], [x - 1.5, -40.5], [tx, ty]], 2.4, 0.4, horn);
		P.ellipse(9, -34, 5.6, 4.6, scale);
		P.shape((p) => { p.m(11, -38); p.q(16.5, -37.5, 20, -35); p.q(20.8, -33, 19, -32.6); p.l(12, -32); }, scale, 11, 20.8);
		P.shape((p) => { p.m(11.5, -32); p.l(19, -32.6); p.q(17, -28, 12, -28.4); }, '#c8303a', 11.5, 19);
		P.shape((p) => { p.m(10, -29.6); p.q(14, -28.6, 18, -29.6); p.q(17, -26.4, 12, -26.2); p.q(9, -26.8, 10, -29.6); }, scale, 9, 18);
		for (const x of [13, 15.2, 17.4]) P.poly([[x - 0.45, -32.4], [x + 0.45, -32.4], [x, -31]], '#fff8e8', { line: false });
		for (const x of [13.6, 16]) P.poly([[x - 0.4, -29.3], [x + 0.4, -29.3], [x, -30.6]], '#fff8e8', { line: false });
		P.dot(19.4, -35, 0.45, '#1a1030');
		P.ellipse(10.4, -35.4, 1.6, 1.25, '#fbf2e8');
		P.dot(10.8, -35.4, 0.8, '#c8202a');
		P.thin([[8.2, -37.3], [12.4, -36.5]], shade(scale, -0.5), 0.7);
		P.gloss(6.6, -36.6, 1.4, 0.7, 0.4);
	},
	// ---- forest (F1-F4) ----
	// Giantoad: a fat green toad squatting, a huge pale yellow-green throat sac bulging in front under a thick lip, warty
	// haunches, bulging yellow eyes on top of the head with two little stalks, webbed feet
	287(P) {
		P.shadow(17, 5.5);
		const skin = '#6fa83a', dark = '#4e8a2a', sac = '#d2e878';
		// webbed back feet and the haunches either side
		for (const s of [-1, 1]) {
			P.shape((p) => { p.m(s * 9, -2.5); p.l(s * 16.5, -2); p.l(s * 18.5, 0.4); p.l(s * 16, 0); p.l(s * 15, 1); p.l(s * 13, 0.2); p.l(s * 11.5, 1); p.l(s * 8, 0.4); }, dark, s < 0 ? -18.5 : 8, s < 0 ? -8 : 18.5);
			P.ellipse(s * 11.5, -9, 6.5, 7.5, dark);
		}
		// the round body
		P.ellipse(0, -17, 14, 13, skin);
		for (const [x, y, r] of [[-11, -20, 1.3], [-12.5, -14, 1.1], [-8.5, -26, 1], [10.5, -21, 1.1], [12.5, -15, 1], [-12.5, -8.5, 1.2], [12, -8, 1], [-9.5, -4.5, 0.9], [13.5, -11.5, 0.8]]) {
			P.circle(x, y, r, shade(skin, 0.12));
			P.dot(x - r * 0.3, y - r * 0.3, r * 0.35, rgba('#ffffff', 0.4));
		}
		P.gloss(-8, -25, 2.6, 1.3, 0.35);
		// the great throat sac with paler blotches
		P.ellipse(2, -11, 10.5, 9.5, sac);
		for (const [x, y, r] of [[-1, -13, 2], [4, -8, 1.6], [6.5, -14, 1.4], [0, -6.5, 1.2], [-4.5, -9, 1.3], [8.5, -9.5, 1]]) P.circle(x, y, r, shade(sac, -0.08), { line: false });
		P.gloss(-2, -15, 3, 1.5, 0.45);
		// front legs curling round the sac, webbed hands on the ground
		for (const s of [-1, 1]) {
			taper(P, [[s * 11, -18], [s * 12.5, -9], [s * 9.5, -2]], 4, 2.6, skin);
			P.shape((p) => { p.m(s * 7, -2.4); p.l(s * 12, -2.6); p.l(s * 13, -0.2); p.l(s * 11, -0.6); p.l(s * 9.6, 0.4); p.l(s * 8.2, -0.6); p.l(s * 6.4, -0.2); }, skin, s < 0 ? -13 : 6.4, s < 0 ? -6.4 : 13);
		}
		// head: a broad flat head with a thick lip over the sac
		P.ellipse(1, -27, 10, 6.5, skin);
		taper(P, [[-8.5, -23.5], [1, -19], [11, -23.5]], 3.2, 3.2, shade(skin, 0.15));
		P.dot(-0.5, -26.6, 0.5, '#2a4a10'); P.dot(2.5, -26.6, 0.5, '#2a4a10');
		// stalks and bulging eyes
		for (const s of [-1, 1]) {
			taper(P, [[1 + s * 7, -31.5], [1 + s * 9.5, -36]], 2.2, 1.4, skin);
			P.circle(1 + s * 9.6, -36.2, 1, shade(skin, -0.2));
			P.circle(1 + s * 4.2, -31.6, 3.2, skin);
		}
		for (const s of [-1, 1]) {
			P.dot(1 + s * 4.2, -32, 2.2, '#f4e86a');
			P.ellipse(1.4 + s * 4.2, -32, 0.6, 1.5, '#1a2208', { line: false });
			P.dot(0.6 + s * 4.2, -32.9, 0.55, '#ffffff');
		}
	},
	// Flowerbeast: a bulky leafy green plant beast rising from a tangle of roots, its head a huge gaping maw full of long
	// teeth facing right, leaves layered down its back and two pink flowers with golden centres growing from it
	288(P) {
		P.shadow(16, 5);
		const green = '#5aa035', dark = '#3a7020', leaf = '#78bc48', pink = '#ec7a80', gold = '#f2b42a';
		const leafAt = (x, y, len, a, c = leaf) => {
			const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, w = len * 0.32;
			P.shape((p) => { p.m(x, y); p.q(x + dx * len * 0.5 + nx * w, y + dy * len * 0.5 + ny * w, x + dx * len, y + dy * len); p.q(x + dx * len * 0.5 - nx * w, y + dy * len * 0.5 - ny * w, x, y); }, c, x - len, x + len);
			P.thin([[x, y], [x + dx * len * 0.8, y + dy * len * 0.8]], shade(c, -0.35), 0.3);
		};
		const flower = (x, y, r) => {
			for (let k = 0; k < 9; k++) { const a = k * Math.PI * 2 / 9; leafAt(x, y, r, a, k % 2 ? shade(pink, 0.12) : pink); }
			P.circle(x, y, r * 0.36, gold);
			P.gloss(x - r * 0.12, y - r * 0.15, r * 0.14, r * 0.08, 0.7);
		};
		// a tangle of roots over the ground
		for (const [tx, ty, mx, my] of [[-18, -0.5, -10, -3], [-14, 0.8, -7, -0.5], [-8, 1, -4, 0.5], [-1, 1, 0, -1], [5, 0.8, 4, -0.5], [10, 0, 6, -2.5]]) taper(P, [[-2, -5], [mx, my], [tx, ty]], 3, 0.4, tx < -6 ? dark : shade(green, -0.15));
		// the flower stalk curling up behind the head, leaves on it
		taper(P, [[-6, -18], [-13, -26], [-10, -34]], 2.6, 1.6, dark);
		leafAt(-12, -24, 5, Math.PI * 1.05); leafAt(-12, -29, 4.4, -0.3);
		// the bulky leafy body curving up from the roots
		taper(P, [[-1, -3], [-9, -10], [-5, -19], [2, -23]], 14, 11, green);
		for (const [x, y, len, a] of [[-12, -5, 5, 2.7], [-14, -10, 5.5, 2.9], [-13, -15, 5.5, -2.9], [-10.5, -20, 6, -2.6], [-6, -25, 6, -2.3], [-8, -3, 4.5, 2.3], [-4, -8, 4.5, 2.2], [-8, -13, 4.8, 2.5], [-6, -18, 4.8, 2.7], [-2, -14, 4.2, 2.1]]) leafAt(x, y, len, a);
		P.gloss(-9, -16, 1.6, 0.8, 0.35);
		// the head: a gaping maw between a heavy upper jaw and a lower jaw, both lined with long teeth
		P.shape((p) => { p.m(0, -23); p.q(10, -24, 17, -19); p.q(16, -12, 8, -11); p.q(1, -12, 0, -23); }, '#4a1414', 0, 17, { line: false });
		P.ellipse(6, -16, 4, 3, '#7a2a24', { line: false });
		P.shape((p) => { p.m(-1, -14); p.q(6, -13, 15.5, -15); p.q(16, -11, 11, -9); p.q(3, -8, -1, -14); }, green, -1, 16);
		for (const x of [4.5, 7.4, 10.3, 13.2]) P.poly([[x - 0.8, -13.4 - (x - 4) * 0.06], [x + 0.8, -13.6 - (x - 4) * 0.06], [x - 0.2, -17.4 - (x - 4) * 0.06]], '#f6f0dc', { line: false });
		P.shape((p) => { p.m(-4, -24); p.q(-2, -33, 7, -32); p.q(15, -31, 19.5, -25); p.q(20, -21, 17.5, -19.8); p.q(9, -22.8, 1, -20.4); p.q(-4, -19.6, -4, -24); }, green, -4, 20);
		for (const x of [3.4, 6.4, 9.4, 12.4, 15.4, 17.8]) P.poly([[x - 0.9, -21 - (x - 3) * 0.04], [x + 0.9, -21.2 - (x - 3) * 0.04], [x + 0.2, -16.6 - (x > 15 ? 1 : 0)]], '#f6f0dc', { line: false });
		for (const [x, y, len, a] of [[-2, -30, 5, -2.3], [2, -32, 5, -1.9], [6, -32, 4.4, -1.5], [-3.5, -25, 4.5, -2.8]]) leafAt(x, y, len, a);
		P.gloss(4, -29.5, 2, 1, 0.4);
		P.thin([[6.4, -29.2], [11, -27.4]], dark, 0.8);
		P.ellipse(9.4, -26.4, 1.8, 1.5, '#fff6c8');
		P.dot(9.8, -26.3, 0.85, '#3a2a08');
		P.dot(18, -24.6, 0.5, dark);
		// the flowers
		flower(-10, -36.5, 6.4);
		taper(P, [[8, -31], [9, -35.5]], 2, 1.3, dark);
		flower(9.5, -38.8, 5.6);
	},
	// Funguy: a walking mushroom: a broad red cap dotted with tan warts, a pale knobbly stalk body with a hollow screaming
	// face, thin knotty arms with long fingers and bent legs mid-stride
	289(P) {
		P.shadow(12, 4.5);
		const stalk = '#d8bc96', cap = '#c8392e', wart = '#d9b48a';
		// legs: bent, striding, joined under the stalk
		taper(P, [[-2, -11], [-3.4, -6.4], [-3.4, -6.4], [-8, -2]], 3.6, 2.2, shade(stalk, -0.1));
		P.ellipse(-8.6, -1.3, 3, 1.3, shade(stalk, -0.2));
		taper(P, [[2, -11], [7.4, -7.4], [7.4, -7.4], [6.4, -1.8]], 3.6, 2.2, stalk);
		P.ellipse(7.6, -1.3, 3, 1.3, shade(stalk, -0.12));
		// arms with long fingers, out to the sides
		for (const [sd, c] of [[-1, shade(stalk, -0.08)], [1, stalk]]) {
			taper(P, [[sd * 4.5, -21], [sd * 10, -17], [sd * 10, -17], [sd * 11.5, -10.5]], 3.2, 2.2, c);
			for (const k of [-1, 0, 1]) taper(P, [[sd * 11.5, -10.5], [sd * (12.4 + k * 1.3), -7.4], [sd * (12.4 + k * 2.2), -5.4]], 1.4, 0.5, c);
		}
		// the stalk body, with the hollow face
		P.shape((p) => { p.m(-5, -26); p.q(-6.5, -16, -4.5, -11); p.q(0, -9, 4.5, -11); p.q(6.5, -16, 5, -26); }, stalk, -6.5, 6.5);
		P.thin([[-4, -13], [-2, -14]], shade(stalk, -0.35), 0.4); P.thin([[3.5, -14.5], [4.5, -12.5]], shade(stalk, -0.35), 0.4);
		for (const x of [-2.2, 2.6]) { P.ellipse(x, -21.6, 1.6, 2, '#3a2214', { line: false }); P.dot(x + 0.4, -21.4, 0.55, '#fff4e0'); }
		P.ellipse(0.4, -16.6, 1.5, 2.1, '#3a2214', { line: false });
		P.thin([[-4, -24.4], [-1, -23.6]], shade(stalk, -0.5), 0.45); P.thin([[4.6, -24.4], [1.6, -23.6]], shade(stalk, -0.5), 0.45);
		// the cap: a broad red dome, a ragged rim and tan warts
		P.shape((p) => { p.m(-16, -25); p.q(-16, -42, 0, -43); p.q(16, -42, 16, -25); p.q(12, -27, 8, -25.5); p.q(4, -27.5, 0, -25.5); p.q(-4, -27.5, -8, -25.5); p.q(-12, -27, -16, -25); }, cap, -16, 16);
		for (const [x, y, r] of [[-8, -36, 2.6], [3, -39, 1.9], [9, -34, 2.2], [-12, -30, 1.4], [13, -29, 1.2], [-2, -33, 1.2], [6, -30, 0.9]]) { P.circle(x, y, r, wart); P.gloss(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.2, 0.4); }
		P.gloss(-6, -40, 3.4, 1.3, 0.4);
	},
	// Mauve widow: a spider with a huge glossy purple abdomen, a small head with shiny black eyes and pale fangs facing
	// right, yellow markings, long jointed purple legs
	290(P) {
		P.shadow(18, 5);
		const leg = '#5a4690', body = '#5c4a9a', band = '#8a7ac8';
		const legs8 = [[25, 1], [21, -1], [16, 1], [12, -1], [-7, 1], [-13, -1], [-18, 1], [-23, -1]];
		const base = (i) => [7 - i * 0.9, -11 + Math.abs(i - 3.5) * 0.2];
		const drawLeg = (i, c) => {
			const [fx, near] = legs8[i], [bx, by] = base(i);
			const kx = bx + (fx - bx) * 0.4, ky = -20 - Math.abs(fx - bx) * 0.12;
			taper(P, [[bx, by], [kx, ky]], 2, 1.6, c);
			taper(P, [[kx, ky], [kx + (fx - kx) * 0.75, ky + (0 - ky) * 0.4], [fx, -0.4]], 1.6, 0.7, c);
			P.dot(kx, ky, 0.9, shade(c, 0.2));
		};
		// far legs, darker, behind everything
		for (let i = 0; i < 8; i++) if (legs8[i][1] < 0) drawLeg(i, shade(leg, -0.25));
		// the abdomen with its pale band and gloss
		P.ellipse(-5, -22, 13, 13.5, body);
		P.shape((p) => { p.m(-14, -30); p.q(-6, -36, 3, -31); p.q(-4, -28, -8, -18); p.q(-12, -22, -14, -30); }, band, -14, 3, { line: false, alpha: 0.7 });
		for (const [x, y, rx, ry] of [[-10, -18, 3, 4.4], [0, -24, 2.6, 4], [-5, -14, 2.4, 1.6]]) P.ellipse(x, y, rx, ry, shade(body, -0.22), { line: false, alpha: 0.7 });
		P.gloss(-9, -30, 3.6, 1.8, 0.5);
		P.ellipse(-2, -10.5, 5, 2, '#e8c45a', { line: false, alpha: 0.85 });
		// near legs
		for (let i = 0; i < 8; i++) if (legs8[i][1] > 0) drawLeg(i, leg);
		// the head and thorax with yellow spots, eyes and pale fangs
		P.ellipse(4, -11.5, 6, 4.6, shade(body, -0.05));
		for (const x of [1, 3.4, 5.8]) P.dot(x, -14.5, 0.7, '#f0d060');
		P.circle(10, -11, 4.6, body);
		P.eyes(10.6, -12, 1.7, 1.3, '#1a1030');
		P.dot(13.6, -14, 0.5, '#1a1030'); P.dot(7.6, -14.4, 0.5, '#1a1030');
		for (const x of [9.4, 12]) P.shape((p) => { p.m(x - 1, -8); p.q(x + 1.4, -7.8, x + 0.8, -4.6); p.q(x, -6, x - 1, -8); }, '#e4cfa0', x - 1, x + 1.4);
		P.gloss(8, -14, 1.2, 0.6, 0.5);
	},
	// Treenekid: a walking tree stump with a hollow-eyed, wailing face, rings on its cut top, orange bracket fungi on its
	// side and a sprig of leaves; twiggy arms grip a crooked staff with a curled top
	291(P) {
		P.shadow(13, 4.5);
		const bark = '#8c6440', dark = '#5e3e24', wood = '#d08e5a';
		// rooty legs
		for (const [hx, kx, fx] of [[-3, -5.5, -6.5], [3, 6, 5.5]]) {
			taper(P, [[hx, -13], [kx, -7], [fx, -2]], 3.6, 2.8, dark);
			for (const k of [-1, 0, 1]) taper(P, [[fx, -2], [fx + k * 2.2, -0.2]], 1.4, 0.6, dark);
		}
		// the trunk with a jagged broken top
		P.shape((p) => { p.m(-8, -39); p.l(-6, -42); p.l(-3, -39.5); p.l(0, -43); p.l(3, -39.5); p.l(6, -42.5); p.l(8, -39); p.q(9, -24, 7, -12); p.q(0, -10, -7, -12); p.q(-9, -24, -8, -39); }, bark, -9, 9);
		P.ellipse(0, -39, 7.4, 2.2, '#dcc48e');
		for (const r of [5, 3, 1.2]) { P.thin([[-r, -39], [0, -39 - r * 0.28], [r, -39]], '#b0905a', 0.3); }
		for (const [x0, x1] of [[-6, -5], [5.6, 6.4], [-2, -2.6]]) P.thin([[x0, -36], [x1, -27], [x0, -16]], shade(bark, -0.3), 0.35);
		// orange bracket fungi up the left side and a sprig of leaves on the right
		for (const [y, w] of [[-34, 4.4], [-29.5, 4], [-25, 3.4]]) P.ellipse(-8.6, y, w, 1.4, '#e06a2a', { rot: 0.1 });
		for (const a of [-1.2, -0.6, 0]) P.ellipse(8.6 + Math.cos(a) * 1.8, -38 + Math.sin(a) * 1.8, 2.2, 0.9, '#9ccc6a', { rot: a });
		// the face: hollow eyes, a gaping wail
		for (const x of [-3, 3]) { P.ellipse(x, -30, 1.6, 2, '#2a180c', { line: false }); P.dot(x + 0.5, -30.6, 0.45, '#f4dcb0'); }
		P.thin([[-5, -33], [-1.4, -32.2]], dark, 0.6); P.thin([[5, -33], [1.4, -32.2]], dark, 0.6);
		P.ellipse(0.4, -22.6, 2.8, 3.4, '#2a180c');
		P.gloss(-5, -35, 1.4, 0.8, 0.3);
		// the crooked staff from the lower left up to a curl at the upper right
		taper(P, [[-14, -5], [16, -30]], 1.8, 1.8, wood);
		taper(P, [[16, -30], [19.5, -33], [18.5, -36.5], [15.6, -35.4]], 2.2, 1.6, wood);
		// twiggy arms with hands round the staff
		taper(P, [[-6.5, -22], [-9, -16], [-5.2, -13.4]], 2.6, 2.2, bark);
		taper(P, [[6.5, -24], [9.5, -21], [10.2, -25]], 2.6, 2.2, bark);
		P.circle(-5.2, -13.4, 1.8, bark); P.circle(10.2, -25.2, 1.8, bark);
	},
	// Armogreeno: a creature hiding under a great domed cloak of overlapping green leaves, its serpentine body coiled
	// beneath with a bright orange belly stripe, a small green head with big ringed eyes peering out under the front of
	// the cloak to the right, spindly legs dangling and an orange, flame-like tail tip
	292(P) {
		P.shadow(18, 5);
		const leaf = '#4e9632', dark = '#2c5e1e', orange = '#f0a020', skin = '#5aa03a';
		// the coiled body at the bottom with its orange belly, the tail rising on the right to an orange tip
		taper(P, [[-2, -10], [-14, -9], [-15, -3], [-4, -2], [8, -4]], 6, 4.4, dark);
		P.shape((p) => { p.m(-16, -6); p.q(-13, -1.4, -3, -1.6); p.q(8, -1.6, 10.6, -5); p.q(6, -3.6, -3, -3.6); p.q(-12, -3.4, -16, -6); }, orange, -16, 10.6, { line: false });
		taper(P, [[8, -4], [17, -3], [20, -9], [18, -14]], 3.6, 1.8, dark);
		P.shape((p) => { p.m(18, -13); p.q(22, -16, 21, -23); p.q(19.6, -19, 18, -19.4); p.q(18.6, -16.6, 16.6, -14.4); }, orange, 16.6, 22);
		// spindly legs dangling from under the front of the cloak
		for (const [x, fx] of [[5, 3.5], [8.5, 8], [12, 13]]) {
			taper(P, [[x, -16], [x + 1, -9], [fx, -3]], 2.4, 1.6, skin);
			P.ellipse(fx + 0.6, -2.6, 1.6, 0.9, shade(skin, -0.2));
		}
		// the leaf cloak: big pointed leaves fanning up and back from under the head, their tips making a jagged dome
		const leafAt = (x, y, len, w, a, c) => {
			const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
			const pt = (t, o) => [x + dx * t + nx * o, y + dy * t + ny * o];
			P.shape((p) => { p.m(...pt(0, 0)); p.q(...pt(len * 0.45, w), ...pt(len, 0)); p.q(...pt(len * 0.45, -w), ...pt(0, 0)); }, c, x - len, x + len);
			P.thin([pt(len * 0.08, 0), pt(len * 0.85, 0)], shade(c, -0.4), 0.4);
		};
		P.shape((p) => { p.m(-13, -8); p.q(-15, -24, -4, -28); p.q(6, -31, 10, -22); p.q(10, -17, 8, -15); p.q(0, -12, -13, -8); }, dark, -15, 10);
		for (const [a, len] of [[-3.05, 22], [-2.75, 26], [-2.45, 29], [-2.15, 30], [-1.85, 29], [-1.55, 26], [-1.25, 22], [-0.95, 16]]) leafAt(5, -11, len, 6.4, a, shade(leaf, -0.06));
		for (const [a, len] of [[-2.85, 14], [-2.45, 16], [-2.05, 17], [-1.65, 16], [-1.25, 13]]) leafAt(7, -14, len, 4.8, a, shade(leaf, 0.14));
		P.gloss(-4, -30, 3.4, 1.4, 0.3);
		// the head peering out under the front edge
		P.circle(14.5, -19.5, 3.6, skin);
		for (const x of [13.4, 16.8]) { P.circle(x, -20.6, 1.7, '#f0c840'); P.dot(x + 0.35, -20.5, 1, '#1a2a0a'); P.dot(x - 0.2, -21.1, 0.4, '#ffffff'); }
		P.mouth(15.6, -17, 0.9, '#1a3a0e');
	},
	// Garganbee: a giant bumblebee facing right: a fat abdomen banded black and gold, a fuzzy tan thorax, a black head with
	// a big red eye, two long smoky wings raised behind, long black hooked legs carrying orange balls of pollen
	293(P) {
		P.shadow(16, 4.5);
		const gold = '#f0b020', black = '#2e2a2c', fuzz = '#c8a062', pollen = '#f08a20';
		// far legs
		for (const [hx, kx, ky, fx] of [[0, -4, -12, -6], [5, 7, -11, 5]]) { taper(P, [[hx, -17], [kx, ky]], 2, 1.6, shade(black, 0.1)); taper(P, [[kx, ky], [fx, -1]], 1.6, 0.6, shade(black, 0.1)); }
		// the abdomen with bands
		for (const [x, y, rx, ry, c] of [[-16.5, -14, 3.4, 4.6, black], [-13.6, -15, 3.8, 7, gold], [-10.6, -16, 3.8, 8.4, black], [-7.4, -17, 4, 8.8, gold], [-4, -18, 4, 8, black]]) P.ellipse(x, y, rx, ry, c, { rot: 0.25 });
		P.gloss(-9, -24, 3.2, 1.4, 0.4);
		// pollen on the hind leg
		P.ellipse(-9, -8, 3.6, 2.8, pollen);
		for (const [x, y] of [[-10.4, -9], [-8, -7], [-8.6, -9.6]]) P.dot(x, y, 0.5, shade(pollen, 0.3));
		// the wings, raised up and back
		P.ellipse(-6, -34, 13, 3.6, '#e8dcb0', { rot: 0.62, alpha: 0.6 });
		P.ellipse(-1, -36, 12, 3.4, '#e8dcb0', { rot: 0.95, alpha: 0.6 });
		P.thin([[2, -27], [-12, -38]], rgba('#8a7a50', 0.6), 0.3); P.thin([[4, -27], [-4, -44]], rgba('#8a7a50', 0.6), 0.3);
		// the fuzzy thorax
		P.circle(2.5, -21, 6.6, fuzz);
		for (let k = 0; k < 9; k++) { const a = k * 0.7; P.thin([[2.5 + Math.cos(a) * 5.6, -21 + Math.sin(a) * 5.6], [2.5 + Math.cos(a) * 7.2, -21 + Math.sin(a) * 7.2]], shade(fuzz, -0.2), 0.6); }
		P.gloss(0.5, -24.5, 2, 1, 0.35);
		// near legs, hooked at the feet
		for (const [hx, kx, ky, fx] of [[1, -3, -10, -2], [5, 10, -12, 10], [7, 14, -16, 18]]) {
			taper(P, [[hx, -17], [kx, ky]], 2.4, 1.8, black);
			taper(P, [[kx, ky], [fx, -3], [fx + 1.6, -1]], 1.8, 0.6, black);
		}
		// the head: antennae, a big red eye, mandibles
		for (const [tx, ty] of [[13, -33], [17, -31]]) taper(P, [[10, -23], [12, -29], [tx, ty]], 1, 0.6, black);
		P.circle(11, -18.5, 5.4, black);
		P.ellipse(12.4, -19.6, 2.8, 3.2, '#c8202a');
		P.dot(12.9, -19.2, 1.3, '#4a0808');
		P.dot(11.6, -20.8, 0.8, '#ffffff');
		P.poly([[14.5, -15], [17, -14], [14.6, -12.4]], shade(black, 0.15));
		P.gloss(8.8, -21.5, 1.4, 0.7, 0.35);
	},
	// Serpent: a green snake rearing up in an S above a loop of its body, a pale green belly, a frill along the neck, a
	// fishlike fin at the tail; the head faces right, jaws wide with fangs and a flickering forked tongue
	294(P) {
		P.shadow(15, 4.5);
		const green = '#5aa83a', belly = '#c8e48a', dark = '#2f6e22';
		// the tail fin
		P.shape((p) => { p.m(-12, -4); p.q(-18, -9, -21, -6); p.q(-18, -4, -21, -0.6); p.q(-17, -0.5, -12, -2.6); }, green, -21, -12);
		// the body: a loop on the ground, then rearing up in an S
		const path = [[-12, -3], [-2, -0.5], [9, -2.6], [11, -9], [3, -13], [-7, -15], [-10, -23], [-5, -31], [4, -34]];
		taper(P, path, 6, 6.4, green);
		taper(P, path.map(([x, y]) => [x + 0.6, y + 1.4]), 2.4, 2.6, belly, { line: false });
		for (let i = 1; i < 8; i++) { const [x, y] = path[i]; P.dot(x - 0.6, y - 1.2, 0.5, shade(green, 0.25)); P.dot(x - 1.6, y - 0.4, 0.4, shade(green, 0.25)); }
		// the frill down the back of the neck
		for (const [x, y, a] of [[-12, -22, 3.5], [-11.5, -27, 3.9], [-8, -32, 4.4], [-3, -35, 4.8]]) P.poly([[x + Math.cos(a + 1.4) * 1.8, y + Math.sin(a + 1.4) * 1.8], [x + Math.cos(a) * 3.4, y + Math.sin(a) * 3.4], [x + Math.cos(a - 1.4) * 1.8, y + Math.sin(a - 1.4) * 1.8]], dark);
		// the head, jaws open, fangs, tongue
		P.shape((p) => { p.m(1, -38); p.q(8, -41, 14, -37.5); p.q(15, -35.5, 13.6, -34.6); p.l(5, -33.4); p.q(1, -33, 1, -38); }, green, 1, 15);
		P.shape((p) => { p.m(4, -33); p.l(13.6, -34.4); p.q(13, -31, 11, -29.4); p.q(5, -29, 3, -31); }, '#8a1a24', 3, 13.6);
		P.shape((p) => { p.m(2, -31.6); p.q(8, -29.8, 12.4, -29.8); p.q(12, -27.6, 9, -27.4); p.q(3, -27.4, 2, -31.6); }, green, 2, 12.4);
		for (const x of [10.6, 12.6]) P.poly([[x - 0.6, -34.6], [x + 0.6, -34.6], [x, -31.6]], '#fbf6e8', { line: false });
		P.thin([[10, -31], [16, -28.6]], '#d0283a', 0.55);
		P.thin([[16, -28.6], [17.8, -29.6]], '#d0283a', 0.4); P.thin([[16, -28.6], [17.4, -27.2]], '#d0283a', 0.4);
		P.ellipse(7.4, -37.6, 1.9, 1.6, '#fbf2c0');
		P.dot(7.9, -37.6, 0.95, '#1a2208');
		P.dot(7.3, -38.3, 0.4, '#ffffff');
		P.thin([[5, -39.6], [9.6, -39]], dark, 0.6);
		P.gloss(3.6, -38.6, 1.6, 0.6, 0.4);
	},
	// Wildboar: a big shaggy brown boar facing right: a high hump of a back with a crest of bristles, a heavy head with a
	// big pointed ear, shaggy cheeks, a small fierce yellow eye, a pink snout and long curving tusks, short legs with
	// dark hooves, a thin tail with a tuft
	295(P) {
		P.shadow(17, 5);
		const brown = '#8c5c3c', dark = '#5e3a24', snout = '#e4a494', tusk = '#f6eedc', hoof = '#3a2418';
		const tufts = (pts, c) => { for (const [x, y, a, l0] of pts) { const l = l0 * 0.6; P.poly([[x - Math.sin(a) * 1.1, y + Math.cos(a) * 1.1], [x + Math.cos(a) * l, y + Math.sin(a) * l], [x + Math.sin(a) * 1.1, y - Math.cos(a) * 1.1]], c); } };
		// thin tail with a tuft
		taper(P, [[-14, -19], [-18.5, -18], [-18, -12]], 1.2, 0.8, dark);
		P.ellipse(-18, -11, 1.1, 1.8, dark);
		// far legs
		for (const [x, fx] of [[-9, -10.5], [6, 6.5]]) { taper(P, [[x, -10], [x - 0.6, -5], [fx, -1.8]], 3.4, 2.2, shade(brown, -0.3)); P.ellipse(fx + 0.3, -1.2, 1.6, 1, hoof); }
		// bristles along the back, then the body
		tufts([[-13, -21, -2.4, 4], [-10, -26, -2.1, 4.6], [-6, -29, -1.9, 5.4], [-2, -30.5, -1.7, 6], [2, -30.5, -1.4, 5.6], [6, -28.4, -1.2, 4.6], [-15, -15, -2.9, 3.4]], shade(brown, -0.12));
		P.shape((p) => { p.m(-16, -12); p.q(-18, -27, -6, -29.5); p.q(6, -31.5, 10, -22); p.q(12, -10, 6, -7); p.q(-6, -5, -16, -12); }, brown, -18, 12);
		for (const [x, y] of [[-12, -18], [-8, -24], [-3, -26], [2, -26], [-6, -14], [-1, -19], [-12, -11]]) P.thin([[x, y], [x - 2, y + 2.6]], shade(brown, -0.3), 0.5);
		P.gloss(-8, -22, 3.4, 1.6, 0.3);
		// near legs: a haunch, a foreleg, hooves
		taper(P, [[-9, -10], [-11, -5], [-9.6, -1.8]], 3.8, 2.4, brown);
		P.ellipse(-9.5, -13, 5, 5.2, brown, { line: false });
		P.thin([[-14, -15], [-13.6, -10.6], [-11, -8.6]], shade(brown, -0.35), 0.45);
		taper(P, [[8, -10], [9.4, -5.4], [9, -1.8]], 3.8, 2.4, brown);
		for (const x of [-9.4, 9.2]) { P.ellipse(x + 0.3, -1.2, 1.8, 1.1, hoof); P.thin([[x + 0.3, -2], [x + 0.3, -0.3]], '#7a5a48', 0.3); }
		// the head: a heavy wedge thrust forward with shaggy cheeks
		tufts([[6, -10, 1.9, 3.4], [9, -9.4, 1.6, 3.4], [12, -9.4, 1.3, 3]], shade(brown, -0.05));
		P.shape((p) => { p.m(3, -25); p.q(12, -28, 16, -20); p.l(19.5, -17.5); p.q(19, -11.5, 14, -10.5); p.q(8, -8.5, 3.6, -12); p.q(0, -18, 3, -25); }, shade(brown, 0.06), 0, 19.5);
		for (const [x, y] of [[7, -14], [9.5, -15.5], [6, -18]]) P.thin([[x, y], [x - 1.6, y + 2]], shade(brown, -0.3), 0.45);
		// a big ear
		P.shape((p) => { p.m(5, -24); p.q(4, -30, 5.4, -33.6); p.q(10, -30, 10.6, -25); }, brown, 4, 10.6);
		P.shape((p) => { p.m(6.2, -24.6); p.q(5.6, -29, 6.2, -31.4); p.q(9, -28.6, 9.4, -25.4); }, snout, 5.6, 9.4, { line: false });
		// snout, tusks, eye
		P.ellipse(19.6, -15.2, 2.8, 3.4, snout, { rot: -0.25 });
		P.ellipse(20.8, -15, 1.6, 2.6, shade(snout, -0.12), { line: false, rot: -0.25 });
		P.dot(20.4, -16.2, 0.5, '#6a2a2a'); P.dot(21.2, -14, 0.5, '#6a2a2a');
		for (const [x, dx] of [[14.6, 0], [16.6, 2.4]]) taper(P, [[x, -11], [x + 4 + dx, -10.6], [x + 5.4 + dx, -17]], 3, 0.8, tusk);
		P.ellipse(11.8, -20.2, 1.7, 1.3, '#f6d040');
		P.dot(12.2, -20.2, 0.85, '#1a1008');
		P.dot(11.6, -20.7, 0.3, '#ffffff');
		P.line([[9.6, -22.6], [14, -21.4]], dark, 0.6);
	},
	// Grandwolf: a big shaggy dark grey wolf stalking right, shoulders hunched high and head low and snarling: a white
	// ruff and beard under the jaw, a yellow eye under a heavy brow, bared fangs, pointed ears laid back, bent legs with
	// big paws and a bushy tail
	296(P) {
		P.shadow(18, 5);
		const grey = '#5a5860', dark = '#3a3940', white = '#eeeae4';
		const tufts = (pts, c) => { for (const [x, y, a, l0] of pts) { const l = l0 * 0.6; P.poly([[x - Math.sin(a) * 1.1, y + Math.cos(a) * 1.1], [x + Math.cos(a) * l, y + Math.sin(a) * l], [x + Math.sin(a) * 1.1, y - Math.cos(a) * 1.1]], c); } };
		// bushy tail sweeping down behind
		taper(P, [[-12, -21], [-18, -18], [-20.5, -12], [-21, -6]], 5.4, 1.6, grey);
		P.thin([[-16, -18], [-19, -13], [-19.6, -8]], shade(grey, -0.35), 0.4);
		// far legs
		for (const [pts, fx] of [[[[-9, -17], [-13, -10], [-11, -2]], -11], [[[7, -16], [8.6, -8], [8.6, -2]], 8.6]]) { taper(P, pts, 4, 2.4, dark); P.ellipse(fx + 1, -1.3, 2.4, 1.1, dark); }
		// shaggy fur along the back, then the body, deep in the chest, highest at the shoulders
		tufts([[-12, -23, -2.4, 3.4], [-7, -26, -2, 3.6], [-2, -28.4, -1.9, 4], [3, -30.4, -1.8, 4], [7, -31, -1.5, 3.6], [-9, -13.6, 2.2, 3], [-3, -13, 1.8, 3]], shade(grey, -0.1));
		P.shape((p) => { p.m(-14, -18); p.q(-15, -26, -6, -25.6); p.q(2, -31, 9, -30); p.q(14, -26, 12, -16); p.q(4, -12, -6, -14.4); p.q(-13, -12.6, -14, -18); }, grey, -15, 14);
		for (const [x, y] of [[-8, -24], [-2, -26], [4, -27.4], [-11, -20], [-4, -18]]) P.thin([[x, y], [x - 1.8, y + 2.2]], shade(grey, -0.32), 0.5);
		P.gloss(-5, -24, 3.6, 1.3, 0.28);
		// near legs: a haunch with a backward-bent hock, a straight foreleg, big paws
		taper(P, [[-9.5, -15], [-13.4, -9], [-10.4, -2]], 5, 3, grey);
		P.ellipse(-9.5, -18.4, 5, 5, grey, { line: false });
		P.thin([[-14.2, -20], [-13.8, -15.4], [-11, -13.4]], shade(grey, -0.4), 0.45);
		taper(P, [[9.6, -17], [11, -8.6], [11.4, -2]], 5.2, 3.2, grey);
		for (const x of [-9.6, 12.2]) { P.ellipse(x, -1.4, 2.6, 1.2, shade(grey, -0.15)); for (const k of [-0.8, 0.8]) P.thin([[x + k, -2.2], [x + k, -0.6]], dark, 0.3); }
		// white ruff down the chest
		tufts([[9, -13, 1.8, 3], [12, -13.4, 1.4, 3]], white);
		P.shape((p) => { p.m(6.6, -27); p.q(15, -23, 13.4, -13); p.l(11, -14.6); p.l(9.6, -11.6); p.l(7.6, -15); p.q(5.6, -21, 6.6, -27); }, white, 5.6, 15);
		// the head, low and thrust forward: ears back, long muzzle, snarl
		P.poly([[10, -29], [6, -35], [13.4, -31]], dark);
		P.poly([[10.4, -30], [8, -33.4], [12, -31]], '#8a7a7a', { line: false });
		P.shape((p) => { p.m(8.6, -29); p.q(14, -32.6, 18, -28.6); p.l(23.4, -26.4); p.q(24.4, -24.4, 22.6, -23.8); p.l(17, -23.2); p.q(14, -19.8, 11, -20.8); p.q(6.6, -23.6, 8.6, -29); }, grey, 7, 24.4);
		P.shape((p) => { p.m(11.6, -25.6); p.q(15, -22, 21.4, -23.4); p.q(19.4, -19.4, 16, -19); p.q(12, -19.4, 10, -21.6); }, white, 10, 21.4);
		P.dot(23.2, -25.8, 0.85, '#1a1a1e');
		for (const x of [18.2, 20.4]) P.poly([[x - 0.55, -24], [x + 0.55, -24], [x, -21.4]], '#fbf8f0', { line: false });
		P.thin([[15.6, -24.1], [22.4, -24.3]], '#2a1a1e', 0.5);
		P.ellipse(15, -28, 1.7, 1.2, '#f0d060');
		P.dot(15.4, -28, 0.8, '#1a1008');
		P.dot(14.8, -28.4, 0.3, '#ffffff');
		P.line([[12.6, -29.8], [17.4, -28.8]], dark, 0.6);
	},
	// Grizzly: a huge shaggy brown bear lumbering right, a massive shoulder hump, the round head carried low and forward
	// with small round ears, a pale muzzle and a black nose, thick bent legs with pale claws
	297(P) {
		P.shadow(18, 5.5);
		const brown = '#9a5a30', dark = '#6a3a1e', muzzle = '#d8a878';
		const tufts = (pts, c) => { for (const [x, y, a, l0] of pts) { const l = l0 * 0.6; P.poly([[x - Math.sin(a) * 1.1, y + Math.cos(a) * 1.1], [x + Math.cos(a) * l, y + Math.sin(a) * l], [x + Math.sin(a) * 1.1, y - Math.cos(a) * 1.1]], c); } };
		// far legs
		taper(P, [[-11, -12], [-12, -6], [-11, -2]], 5, 4, shade(brown, -0.28));
		taper(P, [[6, -14], [7, -7], [6.6, -2]], 5, 4, shade(brown, -0.28));
		for (const x of [-10.6, 7.2]) P.ellipse(x, -1.4, 3, 1.3, dark);
		// shaggy fur over the hump, then the body
		tufts([[-17, -16, -2.9, 3.4], [-15, -24, -2.4, 3.6], [-10, -30, -2.1, 4], [-4, -34, -1.9, 4], [2, -34.6, -1.6, 4], [7.6, -31.4, -1.2, 3.4], [-12, -9, 2.2, 3], [-3, -8.6, 1.7, 3]], shade(brown, -0.1));
		P.shape((p) => { p.m(-18, -11); p.q(-21, -27, -11, -32); p.q(-1, -38, 8, -31); p.q(13, -25, 12, -12); p.q(0, -6, -18, -11); }, brown, -21, 13);
		for (const [x, y] of [[-15, -20], [-11, -26], [-5, -30], [2, -31], [-8, -15], [-2, -22], [5, -24], [-13, -13]]) P.thin([[x, y], [x - 1.6, y + 2.8]], shade(brown, -0.28), 0.5);
		P.gloss(-8, -28, 4, 1.8, 0.28);
		// near legs: a big haunch, a thick foreleg, paws with claws
		taper(P, [[-11, -10], [-9.4, -5], [-8.6, -2]], 6, 4.6, brown);
		P.ellipse(-11.5, -14, 6, 6.2, brown, { line: false });
		P.thin([[-17, -16], [-16, -10.6], [-12.6, -8.4]], shade(brown, -0.35), 0.45);
		taper(P, [[8, -17], [10.6, -9], [10.4, -2]], 6.4, 4.8, brown);
		for (const x of [-8, 11]) {
			P.ellipse(x + 0.8, -1.5, 3.6, 1.6, shade(brown, -0.12));
			for (const k of [-1, 0, 1]) P.dot(x + 2.6 + k * 1.3, -0.5, 0.5, '#f4e8d0');
		}
		// the head, low and forward: small ears, muzzle, nose
		for (const x of [9.4, 17.4]) { P.circle(x, -28.2, 2.2, brown); P.circle(x, -28.2, 1.1, dark, { line: false }); }
		tufts([[9, -16, 2, 2.6], [12, -15.4, 1.7, 2.6]], shade(brown, -0.05));
		P.circle(13.4, -22.4, 6.6, shade(brown, 0.06));
		P.ellipse(17, -18.6, 3.8, 2.8, muzzle);
		P.ellipse(19.2, -19.8, 1.5, 1.1, '#1e1410');
		P.dot(18.8, -20.2, 0.4, '#8a7a70');
		P.thin([[18.6, -18.8], [18, -17.2]], '#3a2418', 0.4);
		P.thin([[16, -16.8], [18, -17.2], [19.4, -16.6]], '#3a2418', 0.4);
		for (const x of [11.8, 17.2]) { P.dot(x, -23.8, 1, '#1a0e08'); P.dot(x - 0.3, -24.2, 0.35, '#ffffff'); }
		P.thin([[11, -25.8], [12.8, -25.6]], dark, 0.5); P.thin([[16.4, -25.6], [18.4, -25.8]], dark, 0.5);
		P.gloss(10.4, -26.4, 2, 1, 0.3);
	},
	// Amphiboss (forest mini-boss and boss): a hulking toad-man standing upright, a huge pale belly, a broad flat head
	// sunk into the shoulders with eyes on top, an amber necklace with a great red gem, a ragged green loincloth, a round
	// stone shield studded with blue crystals on one arm and a crystal-spiked mace in the other hand
	298(P) {
		P.shadow(17, 5.5);
		const green = '#5a9c48', belly = '#cfe0a0', stone = '#8c8a6a', crystal = '#7ab4d8', amber = '#e0902a', cloth = '#4a6a3a';
		// stout bent legs with webbed feet
		for (const s of [-1, 1]) {
			taper(P, [[s * 5, -12], [s * 8.6, -7], [s * 7.6, -2]], 5.4, 4, shade(green, s < 0 ? -0.1 : 0));
			P.ellipse(s * 8.6, -1.2, 3.6, 1.4, shade(green, -0.15));
		}
		// the body: a great pear of a torso, the pale belly
		P.shape((p) => { p.m(-10, -32); p.q(-16, -26, -13, -15); p.q(-11, -8, 0, -8); p.q(11, -8, 13, -15); p.q(16, -26, 10, -32); p.q(0, -36, -10, -32); }, green, -16, 16);
		P.ellipse(0.6, -18, 9, 9.5, belly);
		for (const y of [-22, -18, -14]) P.thin([[-5, y], [0.6, y + 0.8], [6, y]], shade(belly, -0.2), 0.4);
		// ragged loincloth over the hips
		P.shape((p) => { p.m(-9, -12); p.q(0, -9.6, 9, -12); p.l(7, -5); p.l(4, -6.4); p.l(1.6, -2.6); p.l(-1, -6); p.l(-4, -3.6); p.l(-6, -6.6); p.l(-8.6, -5); }, cloth, -9, 9);
		P.line([[-9.4, -12], [9.4, -12]], '#6a4a2a', 1.2);
		// the head, sunk into the shoulders: eye bulges on top, a wide mouth
		P.shape((p) => { p.m(-10, -31); p.q(-11, -40, 0, -40); p.q(11, -40, 10, -31); p.q(0, -28, -10, -31); }, green, -11, 11);
		for (const s of [-1, 1]) P.circle(s * 5.2, -39.6, 3, green);
		P.eyes(0, -39.8, 5.2, 2, '#4a2a08');
		P.thin([[-7, -32.4], [0, -31], [7, -32.4]], shade(green, -0.5), 0.6);
		for (const s of [-1, 1]) P.dot(s * 1.2, -35.4, 0.4, '#2a4a1a');
		P.gloss(-4, -37, 2, 0.9, 0.35);
		// the amber necklace with a big red gem
		for (let k = -4; k <= 4; k++) P.circle(k * 2, -29 + (16 - k * k) * 0.22, 0.75, amber);
		P.circle(0, -24.4, 2, '#b8281e');
		P.dot(-0.5, -25, 0.6, '#ffb0a0');
		// the mace arm: a thick arm down to a fist gripping a mace with a spiky crystal head
		P.ellipse(11, -28, 4, 3.8, green);
		taper(P, [[11, -28], [15, -21], [14.5, -15]], 5, 3.8, green);
		P.line([[13, -15], [20, -5]], '#7a5a34', 1.2);
		for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.poly([[21 + Math.cos(a - 0.4) * 3, -4 + Math.sin(a - 0.4) * 3], [21 + Math.cos(a) * 5, -4 + Math.sin(a) * 5], [21 + Math.cos(a + 0.4) * 3, -4 + Math.sin(a + 0.4) * 3]], crystal); }
		P.circle(21, -4, 3.4, crystal);
		P.gloss(20, -5.4, 1.2, 0.6, 0.5);
		P.circle(14.4, -15, 2.6, green);
		// the shield arm: the round stone shield on the forearm, studded with crystals
		P.ellipse(-11, -28, 4, 3.8, green);
		taper(P, [[-11, -28], [-15, -22], [-15, -17]], 5, 3.8, green);
		P.circle(-16, -18, 7.6, stone);
		P.circle(-16, -18, 5.8, shade(stone, 0.08), { line: false });
		for (const [dx, dy, r] of [[0, 0, 1.6], [-4, -3.6, 1.1], [3.6, -4, 1], [-4.6, 2.4, 1], [3.4, 4, 1.2], [0.4, -6, 0.8]]) P.poly([[-16 + dx, -18 + dy - r], [-16 + dx + r, -18 + dy], [-16 + dx, -18 + dy + r], [-16 + dx - r, -18 + dy]], crystal);
		P.gloss(-19, -22, 1.8, 0.9, 0.35);
	},
	// Toademon: a fat purple demon toad on little bat wings, warty beige bumps over its back, big orange eyes, a curling
	// feeler on its head, a cream belly, a huge mouth with a long pink tongue lolling out over it, a spade-tipped tail
	299(P) {
		P.shadow(18, 5.5);
		const purple = '#6a48a8', wing = '#c060a8', cream = '#ddd2b6', tongue = '#d0609a', wart = '#d8c8a8';
		// spade-tipped tail
		taper(P, [[-12, -12], [-19, -14], [-20, -22]], 2.6, 1.4, purple);
		P.poly([[-20, -21], [-23, -25], [-20.4, -29], [-17.4, -25]], purple);
		// bat wings behind
		const batWing = (bx, by, tips) => {
			P.shape((p) => {
				p.m(bx, by); p.l(...tips[0]);
				for (let i = 1; i < tips.length; i++) { const [ax, ay] = tips[i - 1], [cx, cy] = tips[i]; p.q((ax + cx) / 2 * 0.8 + bx * 0.2, (ay + cy) / 2 * 0.8 + by * 0.2, cx, cy); }
				const [lx, ly] = tips[tips.length - 1]; p.q((lx + bx) / 2 * 0.8 + bx * 0.2 + 1, (ly + by) / 2, bx, by);
			}, wing, Math.min(bx, ...tips.map((t) => t[0])), Math.max(bx, ...tips.map((t) => t[0])));
			for (const t of tips) taper(P, [[bx, by], t], 1.4, 0.5, purple);
		};
		batWing(-8, -27, [[-14, -44], [-21, -38], [-22, -29]]);
		batWing(6, -30, [[9, -45], [16, -43], [20, -36]]);
		// stubby legs with webbed toes
		for (const [x, s] of [[-11, -1], [12, 1]]) {
			P.ellipse(x, -5, 4.4, 4.6, shade(purple, -0.06));
			for (const k of [-1, 0, 1]) P.ellipse(x + s * 1.4 + k * 2, -1.2, 1.2, 1, '#d080b8');
		}
		// the body, a great round blob with warts on top
		P.shape((p) => { p.m(-16, -10); p.q(-19, -28, -4, -32); p.q(12, -35, 17, -22); p.q(19, -8, 8, -5); p.q(-12, -3, -16, -10); }, purple, -19, 19);
		for (const [x, y, r] of [[-12, -24, 1.4], [-8, -29, 1.3], [-3, -31, 1.1], [-14, -18, 1.1], [3, -32, 1.1], [-10, -20, 0.8], [-5, -26, 0.9], [12, -26, 1], [15, -19, 0.9]]) P.circle(x, y, r, wart);
		P.gloss(-9, -26, 3, 1.4, 0.3);
		// the cream belly and the huge mouth with its tongue hanging out
		P.ellipse(2, -11, 12, 7, cream);
		P.shape((p) => { p.m(-12, -18); p.q(2, -14, 16, -19); p.q(14, -15, 9, -14); p.q(2, -12.6, -6, -14); p.q(-11, -15, -12, -18); }, '#3a1830', -12, 16);
		P.shape((p) => { p.m(-6, -15.6); p.q(1, -16.4, 8, -15); p.q(10, -8, 6, -4.6); p.q(2, -2.8, -1, -5); p.q(-5, -9, -6, -15.6); }, tongue, -6, 10);
		P.thin([[1, -14], [2, -7]], shade(tongue, -0.3), 0.45);
		P.gloss(-2, -11, 1.4, 1.2, 0.35);
		// eyes up top and a curling feeler
		taper(P, [[9, -30], [12, -40], [17, -42], [19, -38]], 2, 1.2, purple);
		P.circle(19, -36.6, 2, shade(purple, 0.15));
		for (const [x, y] of [[-4, -28], [8.6, -29]]) {
			P.circle(x, y, 4.2, purple);
			P.circle(x + 0.3, y + 0.3, 3, '#f09020');
			P.ellipse(x + 0.6, y + 0.4, 0.8, 2, '#2a1008', { line: false });
			P.dot(x - 0.6, y - 0.8, 0.7, '#ffffff');
		}
	},
	// Snakeman: a green lizard man rising from a coiled snake tail with a pale scaled belly, a spiky green crest, an orange
	// eye, an amulet with a green stone on a cord, leather bracers, a dagger held up in front, the other hand clawed
	300(P) {
		P.shadow(14, 5);
		const green = '#3fa83a', dark = '#2a7a2a', belly = '#e2e6b0', crest = '#6ad84a', leather = '#7a4a28';
		// the coil on the ground and the tail tip curling up behind
		taper(P, [[-6, -4], [-13, -5], [-17, -10], [-15, -15], [-12.5, -14]], 3.4, 1, green);
		P.ellipse(0, -4, 12, 4.4, dark);
		P.ellipse(1, -3, 10.5, 3, belly, { line: false });
		for (let x = -7; x <= 9; x += 2.4) P.thin([[x, -5.4], [x + 0.3, -0.8]], shade(belly, -0.3), 0.35);
		// the snake body rising into the waist, belly scales down its front
		taper(P, [[3, -5], [-1, -10], [0, -16]], 9.5, 8, green);
		P.shape((p) => { p.m(1.5, -16); p.q(4.6, -14, 4.6, -10); p.q(5.4, -7, 7.5, -5); p.l(2, -6); p.q(0, -9.5, -1.4, -15.5); }, belly, -1.4, 7.5, { line: false });
		for (const y of [-14, -11.5, -9, -6.8]) P.thin([[0.4 + (y + 14) * -0.1, y], [4.6 + (y + 14) * 0.25, y + 0.3]], shade(belly, -0.3), 0.35);
		// far arm with a bracer, clawed hand
		taper(P, [[6, -23], [10.5, -19.5], [11.5, -15.5]], 3.2, 2.6, shade(green, -0.08));
		P.line([[10.8, -19], [11.4, -16.6]], leather, 3.2);
		for (const k of [-1, 0, 1]) taper(P, [[11.5, -15], [12.4 + k * 1.2, -13.4], [11.8 + k * 1.4, -12.2]], 1, 0.4, green);
		// a muscular torso with a pale chest
		P.shape((p) => { p.m(-7, -25.5); p.q(0, -28, 7, -25.5); p.q(6.5, -19, 4, -15); p.q(0, -13.5, -4, -15); p.q(-6.8, -19, -7, -25.5); }, green, -7, 7);
		P.shape((p) => { p.m(-2, -25); p.q(1.5, -26, 4.5, -24.5); p.q(4.4, -18, 2.6, -15); p.q(0.5, -14.4, -1, -15.4); p.q(-2.6, -19.5, -2, -25); }, belly, -2.6, 4.5, { line: false });
		for (const y of [-22, -19.5, -17]) P.thin([[-1.6, y], [4, y]], shade(belly, -0.3), 0.35);
		// the amulet on its cord
		P.thin([[-5.5, -25.5], [0, -21], [5, -25.5]], '#6a3a1a', 0.5);
		P.circle(0.4, -20.6, 1.7, '#b0702a'); P.dot(0.4, -20.6, 0.9, '#2ab04a'); P.dot(0.1, -20.9, 0.3, '#d8ffd8');
		// head: the spiky crest swept back, the long snout facing right, an orange eye
		for (const [x, y, tx, ty] of [[-3, -33, -8, -36.5], [-2, -35, -5.5, -40.5], [0, -36, -1.5, -43], [2, -36, 3, -42], [-3.5, -30, -9, -31]]) P.poly([[x - 1.4, y + 1.2], [tx, ty], [x + 1.6, y]], crest);
		P.line([[0, -25], [1, -28]], green, 4);
		P.ellipse(1, -31, 5.2, 4.6, green);
		P.shape((p) => { p.m(3, -34.4); p.q(9, -34, 12.6, -30.6); p.q(12.6, -29, 11, -28.8); p.l(3.5, -27.4); }, green, 3, 12.6);
		P.shape((p) => { p.m(3, -28.4); p.l(10.6, -28.8); p.q(8, -26.4, 3.6, -26.6); }, belly, 3, 10.6);
		P.dot(11.4, -30.6, 0.35, '#0e2a0e');
		P.ellipse(3.4, -31.6, 1.5, 1.3, '#ffb02a'); P.ellipse(3.7, -31.6, 0.45, 1, '#1a0e04', { line: false }); P.dot(3.1, -32.1, 0.35, '#fff');
		P.thin([[1.6, -33.4], [5.4, -33.2]], shade(green, -0.5), 0.55);
		P.gloss(-1.4, -33.6, 1.4, 0.7, 0.4);
		// near arm with a bracer, the dagger held point up in front of the chest
		taper(P, [[-6, -24], [-9, -19], [-5, -15.5]], 3.2, 2.6, green);
		P.line([[-8.6, -18.8], [-7, -16.6]], leather, 3.2);
		sword(P, -3.6, -16, -0.95, 10, 2.2);
		P.circle(-4.4, -15.6, 1.9, green);
	},
	// Lizard shieldman: a lime-green lizard with a toothy grin and yellow eyes in dark green leaf armour with spiky
	// leaf pauldrons, a leaf-shaped shield with a big green gem held in front, a spiked mace raised high, a long tail
	301(P) {
		P.shadow(13, 5);
		const skin = '#8acc4a', armour = '#3f7048', plate = '#5a8a5a', leaf = '#8aa860', wood = '#7a4a28';
		taper(P, [[-3, -8], [-10, -6], [-15, -9], [-15.5, -12]], 3.6, 1, skin);
		// armoured legs, clawed feet
		for (const [s, kx, fx] of [[-1, -5, -5.5], [1, 5, 5.5]]) {
			taper(P, [[s * 3, -10], [kx, -5.5], [fx, -2.4]], 4.4, 3.6, armour);
			P.ellipse(kx, -6, 2.4, 1.8, plate);
			P.shape((p) => { p.m(fx - 2.4, -2.6); p.l(fx + 2.6, -2.6); p.l(fx + 3.6, 0.2); p.l(fx + 1.6, -0.4); p.l(fx + 0.4, 0.4); p.l(fx - 0.8, -0.4); p.l(fx - 2.6, 0); }, skin, fx - 2.6, fx + 3.6);
		}
		// the mace, raised high over the shoulder
		P.line([[-11, -16], [-13, -36]], wood, 1.7);
		for (let k = 0; k < 9; k++) { const a = k * Math.PI * 2 / 9; P.poly([[-13.2 + Math.cos(a - 0.35) * 2.6, -38 + Math.sin(a - 0.35) * 2.6], [-13.2 + Math.cos(a) * 5, -38 + Math.sin(a) * 5], [-13.2 + Math.cos(a + 0.35) * 2.6, -38 + Math.sin(a + 0.35) * 2.6]], '#4a7a5a'); }
		P.circle(-13.2, -38, 3, '#5a8a6a');
		P.gloss(-14.2, -39.2, 1, 0.6, 0.5);
		// armoured torso: overlapping leaf plates, a belt
		torso(P, -22, 7, -7, 7.5, armour);
		for (const [x, y] of [[-3.5, -18], [3.5, -18], [0, -14], [-4, -10.5], [4, -10.5]]) P.shape((p) => { p.m(x - 3, y - 2); p.q(x, y - 3.4, x + 3, y - 2); p.q(x + 2, y + 1.6, x, y + 2.4); p.q(x - 2, y + 1.6, x - 3, y - 2); }, plate, x - 3, x + 3);
		P.line([[-7.2, -9], [7.2, -9]], wood, 1.2);
		// the raised near arm gripping the mace
		taper(P, [[-7, -20], [-11, -20], [-11.6, -24]], 3.4, 3, armour);
		P.circle(-11.8, -24.6, 2.2, skin);
		P.thin([[-13.6, -24.6], [-10, -24.6]], shade(skin, -0.4), 0.4);
		// spiky leaf pauldrons
		for (const s of [-1, 1]) {
			for (const [dx, dy] of [[-3, -5], [0, -6.4], [3, -5]]) P.poly([[s * 7 + dx * 0.6 - 1.4, -22], [s * 7 + dx + s * 1, -22 + dy], [s * 7 + dx * 0.6 + 1.4, -21]], leaf);
			P.ellipse(s * 7.4, -21, 4, 2.8, plate);
		}
		// head: big lime head, yellow eyes under heavy brows, a wide toothy grin
		P.ellipse(1, -28.5, 7.4, 6.8, skin);
		P.gloss(-2, -32.5, 2, 1, 0.4);
		P.shape((p) => { p.m(-3.6, -25.4); p.q(2, -23, 8, -25.8); p.q(6.6, -22.6, 2, -22.4); p.q(-2.4, -22.8, -3.6, -25.4); }, '#5a1a14', -3.6, 8);
		for (let x = -2.4; x < 7.4; x += 1.4) { P.poly([[x - 0.5, -25.2 + (x - 2) * -0.03], [x + 0.5, -25.2], [x, -24]], '#f6f2e0', { line: false }); }
		for (const s of [-1, 1]) { P.ellipse(1.6 + s * 2.8, -29.6, 1.5, 1.3, '#f0e040'); P.ellipse(1.8 + s * 2.8, -29.6, 0.45, 1, '#1a1a08', { line: false }); }
		P.thin([[-2.6, -31.8], [0.6, -30.8]], '#2a5a14', 0.7); P.thin([[6.2, -31.8], [3, -30.8]], '#2a5a14', 0.7);
		P.dot(7, -27.6, 0.4, '#2a5a14');
		// the leaf shield with its gem, held in front on the right
		P.line([[7, -20], [8, -15]], armour, 3.2);
		P.shape((p) => { p.m(4, -22); p.q(13, -24.5, 17, -21); p.q(17.6, -10, 9.5, -1.5); p.q(3.4, -8, 4, -22); }, leaf, 3.4, 17.6);
		P.thin([[5, -21], [10, -12], [10, -2.6]], shade(leaf, -0.35), 0.5);
		for (const [a, b] of [[[7, -17], [13, -19.5]], [[8.6, -14], [15.5, -15]], [[9.8, -9], [15, -9.5]], [[8, -9], [5, -12]]]) P.thin([a, b], shade(leaf, -0.3), 0.4);
		P.circle(11, -12.5, 2.8, '#2a8a3a');
		P.circle(11, -12.5, 1.6, '#4ad85a', { line: false });
		P.dot(10.3, -13.3, 0.6, '#e8ffe8');
	},
	// Crow shieldman: a black crow head with a long grey beak and a yellow eye, a ruff of grey feathers, an amber pendant,
	// a dark tunic over an orange kilt, bird legs with talons, a tall dark shield behind and a curved scimitar held low
	302(P) {
		P.shadow(13, 5);
		const feather = '#3a3848', ruff = '#7a7888', kilt = '#b0602a', leg = '#4a4050', tunic = '#2e2a36';
		// the tall shield behind on the right
		P.ellipse(9.5, -17, 7.4, 13.5, '#3a2c38');
		P.ellipse(9.5, -17, 5.8, 11.8, '#4e3c4a', { line: false });
		P.gloss(6.5, -24, 1.4, 3.4, 0.25);
		// bird legs and talons
		for (const [s, kx, fx] of [[-1, -5, -4], [1, 4.5, 5]]) {
			taper(P, [[s * 2.6, -9], [kx, -6], [fx, -2]], 2.8, 2, leg);
			P.line([[fx - 0.3, -4.6], [fx, -3.6]], '#d06a2a', 2.6);
			for (const k of [-1, 0, 1]) taper(P, [[fx, -2], [fx + k * 2.2 + 0.8, -0.6], [fx + k * 2.6 + 1.2, 0.2]], 1.1, 0.4, leg);
		}
		// the dark tunic, an orange kilt and a sash
		torso(P, -21, 6, -7, 6.5, tunic);
		P.shape((p) => { p.m(-6.5, -10.5); p.l(6.5, -10.5); p.l(7.5, -4); p.l(4, -5.2); p.l(1, -3.6); p.l(-2, -5); p.l(-5, -3.6); p.l(-7.4, -4.8); }, kilt, -7.5, 7.5);
		P.line([[-6.6, -10.6], [6.6, -10.6]], '#6a5a60', 1.4);
		P.shape((p) => { p.m(4, -10.6); p.l(6, -10.6); p.l(6.6, -6); p.l(4.8, -6.4); }, '#6a5a60', 4, 6.6);
		// far arm: the hand gripping the shield's edge
		taper(P, [[5.5, -19.5], [8, -16], [7.4, -13.5]], 2.8, 2.4, feather);
		P.circle(7.4, -13, 1.8, leg);
		// a ruff of grey feathers round the shoulders, the pendant
		for (let k = 0; k < 9; k++) { const x = -7 + k * 1.75; P.poly([[x - 1.4, -24], [x + 0.3, -18.6 - (k % 2) * 1.2], [x + 1.6, -24]], k % 2 ? ruff : shade(ruff, -0.15)); }
		P.ellipse(0, -23.4, 7.6, 2.6, feather);
		P.thin([[-3.6, -21.6], [0.6, -17.6], [4.4, -21.6]], '#e0b040', 0.4);
		P.poly([[0.6, -18.8], [1.8, -17], [0.6, -14.8], [-0.6, -17]], '#f0902a');
		// head: feathers swept back, a long grey beak to the right, a yellow eye
		for (const [x, y, tx, ty] of [[-3, -31, -9, -32], [-3.5, -28, -9.5, -27.5], [-2, -34, -7, -36]]) P.poly([[x + 1, y - 1.4], [tx, ty], [x + 1, y + 1.4]], feather);
		P.line([[0.5, -23.5], [1, -26]], feather, 4.4);
		P.ellipse(1, -29.6, 5.8, 5.4, feather);
		P.gloss(-1.4, -32.6, 1.8, 0.8, 0.3);
		P.shape((p) => { p.m(4, -32); p.q(10, -32.6, 15.5, -29.2); p.q(12, -28.6, 9, -28.4); p.l(4.4, -27.6); }, '#b8b8c4', 4, 15.5);
		P.shape((p) => { p.m(4.4, -27.6); p.l(11, -28.4); p.q(8, -26.2, 4.6, -26.4); }, '#8a8a98', 4.4, 11);
		P.ellipse(3.2, -30.6, 1.5, 1.4, '#f0c030'); P.dot(3.5, -30.6, 0.75, '#1a1208'); P.dot(2.9, -31.1, 0.35, '#fff');
		P.thin([[1, -32.4], [4.8, -32.2]], '#1a1820', 0.6);
		// near arm, the scimitar held low across the front
		taper(P, [[-5.5, -20], [-8, -15], [-5, -11.5]], 2.8, 2.4, feather);
		curvedBlade(P, -3.4, -10.6, 6, -4, 15, -6.5, 1.8);
		P.line([[-5.6, -12.6], [-3, -10.4]], '#3a2a1a', 1);
		P.line([[-3.6, -12.2], [-4.6, -9.4]], '#d0a040', 0.7);
		P.circle(-4.8, -11.6, 1.8, leg);
	},
	// Kobold assassin: a hunched rat man facing right in a long blue hooded robe, big pink ears, a pink nose, a sapphire
	// brooch, a dark satchel on the hip, bandaged legs, a long tail, a curved dagger held low and a sword on its back
	303(P) {
		P.shadow(13, 5);
		const fur = '#a08070', robe = '#3a6ac8', pink = '#e8907a', wrap = '#4a4a58';
		// the long tail and the sword on its back
		taper(P, [[-5, -7], [-12, -5], [-17, -2], [-21, -3]], 1.8, 0.5, '#9a6a5a');
		P.line([[-7, -28], [12, -8]], '#2a2a36', 1.6);
		P.poly([[11, -9.4], [16.5, -4.6], [12.4, -8]], '#c8ccd8');
		// bandaged legs
		for (const [s, kx, fx] of [[-1, -5, -4.5], [1, 4.5, 5.5]]) {
			taper(P, [[s * 2.6, -9], [kx, -5.5], [fx, -2]], 3.2, 2.6, wrap);
			for (const y of [-7, -5, -3.4]) P.thin([[fx + (kx - fx) * 0.5 - 1.4, y], [fx + (kx - fx) * 0.5 + 1.4, y + 0.6]], shade(wrap, 0.3), 0.35);
			P.ellipse(fx + 1, -1.1, 2.6, 1.2, fur);
		}
		// the robe: hunched forward, a ragged hem
		P.shape((p) => { p.m(-6, -26); p.q(2, -28, 6.5, -24); p.q(9, -14, 8, -6.5); p.l(5.5, -8); p.l(4, -5); p.l(1.5, -7.6); p.l(-1, -5.4); p.l(-3, -8); p.l(-6.4, -6); p.q(-8.6, -16, -6, -26); }, robe, -8.6, 9);
		P.thin([[-2, -24], [0, -8]], shade(robe, -0.35), 0.5); P.thin([[3.5, -24], [5, -9]], shade(robe, -0.35), 0.5);
		P.line([[-7, -13.5], [7.6, -14.5]], '#2a3a6a', 1.2);
		P.shape((p) => { p.m(-8.6, -14); p.l(-3, -14); p.l(-3.4, -8.6); p.q(-6, -7.8, -8.4, -9); }, '#2a3448', -8.6, -3);
		P.thin([[-8.4, -12], [-3.2, -12]], shade('#2a3448', 0.3), 0.4);
		P.dot(-5.8, -10.8, 0.5, '#c8b070');
		// far arm reaching forward
		taper(P, [[5, -22], [9.5, -17], [10, -13]], 2.8, 2.2, robe);
		P.circle(10.2, -12.4, 1.7, fur);
		// the hood draped behind and round the head
		P.shape((p) => { p.m(-7, -21); p.q(-11, -32, -2, -36); p.q(4, -37, 7, -32); p.l(7, -24); p.q(0, -22, -7, -21); }, robe, -11, 7);
		P.shape((p) => { p.m(-5, -22); p.q(-6, -30, -1, -33); p.q(-4, -28, -2, -22.5); }, shade(robe, -0.3), -6, -1, { line: false });
		// head: a long rat face pointing right, big pink ears, a pink nose
		P.ellipse(1, -31.4, 3.4, 4, pink, { rot: -0.3 });
		P.ellipse(1, -31.4, 2, 2.6, shade(pink, 0.25), { rot: -0.3, line: false });
		P.ellipse(4, -28, 5, 4.2, fur);
		P.shape((p) => { p.m(6, -31); p.q(12, -29.4, 14, -27); p.q(13.4, -25, 11, -25.2); p.l(6, -24.4); }, fur, 6, 14);
		P.circle(13.8, -26.6, 1.2, pink);
		P.thin([[11, -25.2], [13.8, -23.6]], '#d8d0c8', 0.25); P.thin([[11.4, -26.6], [15, -26.4]], '#d8d0c8', 0.25);
		P.ellipse(6.6, -28.8, 1.3, 1.2, '#1a1010'); P.dot(6.3, -29.2, 0.4, '#fff');
		P.thin([[5, -30.6], [8, -30]], '#4a3028', 0.5);
		P.gloss(2, -30.4, 1.4, 0.7, 0.35);
		// the sapphire brooch fastening the hood
		P.circle(5.2, -22, 1.3, '#c0c4d0'); P.dot(5.2, -22, 0.8, '#3a3ad0');
		// near arm holding the curved dagger low
		taper(P, [[-4, -22], [-7, -16], [-6.4, -11.5]], 2.8, 2.2, robe);
		curvedBlade(P, -6.6, -10.2, -11, -6, -13, -1.4, 1.4);
		P.circle(-6.4, -11, 1.7, fur);
	},
	// Kobold ranger: a rat archer facing right in a brown hood and cloak, orange eyes, long whiskers and teeth, a quiver of
	// arrows on its back, a bandaged arm drawing a wooden bow held out in front, wrapped legs and a long tail
	304(P) {
		P.shadow(13, 5);
		const fur = '#a8643a', cloak = '#8a5a34', wrap = '#d8c08a', wood = '#a06a30';
		taper(P, [[-5, -7], [-11, -6], [-15, -2], [-19, -3.4]], 1.8, 0.5, '#8a4a3a');
		// the quiver with feathered arrows behind the shoulder
		P.line([[-8, -16], [-4, -32]], '#5a3a20', 3.6);
		for (const [x, y] of [[-6, -33], [-4, -34.5], [-2.4, -33.4]]) { P.thin([[x + 0.6, y + 3], [x, y]], '#8a6a40', 0.4); P.poly([[x - 1, y + 0.6], [x, y - 1.6], [x + 1, y + 0.6]], '#e8dcc0'); }
		// legs with wraps, clawed feet
		for (const [s, kx, fx] of [[-1, -6, -5], [1, 5, 6]]) {
			taper(P, [[s * 2.6, -9], [kx, -5.5], [fx, -2]], 3.4, 2.6, fur);
			for (const y of [-6, -4]) P.thin([[fx + (kx - fx) * 0.4 - 1.5, y], [fx + (kx - fx) * 0.4 + 1.5, y + 0.6]], wrap, 0.6);
			P.ellipse(fx + 1, -1.1, 2.6, 1.2, shade(fur, -0.2));
		}
		// cloak and body
		P.shape((p) => { p.m(-7, -25); p.q(2, -27, 7, -22); p.q(8, -14, 6, -7.5); p.l(2, -8.6); p.l(-1, -6.4); p.l(-4, -8.6); p.l(-8, -7); p.q(-10, -16, -7, -25); }, cloak, -10, 8);
		P.thin([[-3, -23], [-2, -9]], shade(cloak, -0.35), 0.5);
		P.line([[-7.6, -13], [6.8, -13]], '#5a3a20', 1.2);
		P.circle(-1, -13, 0.8, '#b0b4c0');
		// the hood round the head
		P.shape((p) => { p.m(-7.6, -22); p.q(-11, -33, -1, -35.5); p.q(5, -36, 7.5, -31); p.l(6.4, -24); p.q(-1, -21, -7.6, -22); }, cloak, -11, 7.5);
		P.thin([[-7, -26], [-2, -33], [4, -34.4]], shade(cloak, 0.25), 0.45);
		// head: a rat face pointing right, ear through the hood, orange eye, buck teeth
		P.ellipse(0, -31, 2.6, 3, '#d88a6a', { rot: -0.3 });
		P.ellipse(4, -27.6, 5, 4.2, fur);
		P.shape((p) => { p.m(6, -30.6); p.q(12, -29, 14, -26.6); p.q(13.4, -24.6, 11, -24.8); p.l(6, -24); }, fur, 6, 14);
		P.circle(13.8, -26.2, 1.1, '#3a2018');
		P.poly([[10.4, -24.8], [11.6, -24.8], [11, -22.8]], '#f6f0e0');
		P.thin([[11, -25.4], [15, -24]], '#e8dcc8', 0.25); P.thin([[11.4, -26.4], [15.2, -26.6]], '#e8dcc8', 0.25);
		P.ellipse(6.6, -28.4, 1.3, 1.2, '#2a1008'); P.dot(6.6, -28.4, 0.6, '#ff8a2a'); P.dot(6.3, -28.8, 0.3, '#fff');
		P.thin([[5, -30.2], [8, -29.4]], '#4a2018', 0.5);
		// the bow held out in front, the bandaged arm drawing the string
		P.shape((p) => { p.m(10.5, -26); p.q(17, -16, 11, -4); p.q(15, -16, 9.6, -25.4); }, wood, 9.6, 17);
		P.thin([[10.4, -25.6], [3, -14.5], [11, -4.4]], '#efe6d0', 0.3);
		P.thin([[3, -14.5], [17, -15]], '#8a6a40', 0.4);
		P.poly([[16.6, -16], [19, -15], [16.6, -14]], '#c8ccd4');
		taper(P, [[5, -21], [11, -17], [13.4, -15.4]], 2.8, 2.4, fur);
		P.circle(13.6, -15.2, 1.7, fur);
		taper(P, [[-4, -21], [-2, -15.6], [3, -14.6]], 3, 2.4, wrap);
		for (const t of [0.3, 0.6]) P.thin([[-3.6 + t * 6 - 0.6, -19.6 + t * 4.4 - 1], [-3.6 + t * 6 + 0.6, -19.6 + t * 4.4 + 1]], shade(wrap, -0.3), 0.35);
		P.circle(3.2, -14.6, 1.7, fur);
	},
	// Boar axeman: a burly boar man facing right with a shaggy tan mane, a pink snout and white tusks, leather armour with
	// an iron-riveted collar, a round shield on its back, hooves, and a heavy axe held low in front
	305(P) {
		P.shadow(13, 5);
		const fur = '#c08a5a', mane = '#d8aa78', leather = '#7a4a2a', iron = '#8a8a92', hoof = '#4a2e22';
		// the round shield on its back
		P.circle(-7, -20, 8.5, '#5a3a26');
		P.circle(-7, -20, 7, '#7a5232', { line: false });
		// legs with hooves
		for (const [s, kx, fx] of [[-1, -5, -4.5], [1, 5, 5]]) {
			taper(P, [[s * 3.4, -10], [kx, -5.5], [fx, -2.6]], 5, 3.8, leather);
			P.shape((p) => { p.m(fx - 2.6, -3); p.l(fx + 2.6, -3); p.l(fx + 3, 0); p.l(fx + 0.3, 0); p.l(fx, -1.4); p.l(fx - 0.3, 0); p.l(fx - 3, 0); }, hoof, fx - 3, fx + 3);
		}
		// a stocky leather-armoured body, a belt
		torso(P, -23, 8, -8, 8.5, leather);
		P.shape((p) => { p.m(-4, -21); p.q(0, -22, 4, -21); p.q(4.6, -15, 3, -11); p.q(0, -10.4, -3, -11); p.q(-4.6, -15, -4, -21); }, shade(leather, 0.14), -4.6, 4.6);
		for (const y of [-18, -15, -12.5]) P.thin([[-3.6, y], [3.6, y]], shade(leather, -0.3), 0.4);
		P.line([[-7.6, -21], [6.4, -10.4]], '#4a2a18', 1.2);
		for (const t of [0.25, 0.5, 0.75]) P.dot(-7.6 + 14 * t, -21 + 10.6 * t, 0.45, '#c8c8d0');
		P.line([[-8.4, -9.5], [8.4, -9.5]], '#4a2a18', 1.5);
		P.shape((p) => { p.m(-1.6, -10.6); p.l(1.6, -10.6); p.l(1.6, -8.4); p.l(-1.6, -8.4); }, iron, -1.6, 1.6);
		// far arm with a clawed fist
		taper(P, [[7, -20], [11, -15], [11, -11]], 4, 3.4, fur);
		P.line([[10.6, -15], [11, -12.6]], leather, 4);
		P.circle(11, -10.4, 2.4, fur);
		// the iron collar band studded with rivets
		P.shape((p) => { p.m(-8.5, -24); p.q(0, -28, 8.5, -24); p.l(8, -21); p.q(0, -24.6, -8, -21); }, iron, -8.5, 8.5);
		for (const x of [-6, -2, 2, 6]) P.dot(x, -23.6 - (1 - Math.abs(x) / 8) * 1.4, 0.6, '#d8d8e0');
		// head: the shaggy mane, a big snout to the right, tusks, a small eye
		for (let k = 0; k < 8; k++) { const a = -Math.PI * (0.35 + k * 0.1); P.poly([[Math.cos(a - 0.2) * 7, -30 + Math.sin(a - 0.2) * 7], [Math.cos(a) * 11 - 1, -30 + Math.sin(a) * 11], [Math.cos(a + 0.2) * 7, -30 + Math.sin(a + 0.2) * 7]], mane); }
		P.ellipse(0.5, -30, 7.6, 6.6, mane);
		P.ellipse(3, -29, 5.4, 5, fur);
		P.shape((p) => { p.m(5, -32); p.q(11, -32, 12.4, -29); p.q(12.6, -25, 9, -24.6); p.q(5.5, -24.6, 4.6, -26.6); }, fur, 4.6, 12.6);
		P.ellipse(12.2, -28.4, 1.6, 2.2, '#e8909a');
		P.dot(12.1, -29.2, 0.35, '#5a1a20'); P.dot(12.2, -27.6, 0.35, '#5a1a20');
		P.shape((p) => { p.m(7.6, -25.2); p.q(10.4, -26.4, 10.6, -30); p.q(9.4, -27.4, 6.6, -26.4); }, '#f8f2e0', 6.6, 10.6);
		P.poly([[-2, -34.5], [-4.6, -37.4], [-0.2, -35.6]], '#e8909a');
		P.ellipse(-1.6, -31.4, 2.4, 2.8, mane);
		P.ellipse(-1.4, -31, 1.4, 1.8, '#c87a6a', { line: false });
		P.ellipse(5.4, -30.2, 1.2, 1.1, '#2a1208'); P.dot(5.5, -30.2, 0.55, '#ffb030'); P.dot(5.2, -30.6, 0.3, '#fff');
		P.thin([[3.8, -32.2], [7, -31.6]], '#5a3218', 0.6);
		// near arm and the axe held low across the front, its head down by the feet
		P.line([[-12, -12], [3, -6]], '#7a4a28', 1.6);
		P.shape((p) => { p.m(-1, -8); p.q(2, -10, 4.6, -8.2); p.q(5.4, -3, 2.6, 0); p.q(1.4, -3, -2, -3.6); p.q(-1, -5.6, -1, -8); }, '#8a8a92', -2, 5.4);
		P.thin([[4.4, -7.4], [3.4, -1.6]], '#e0e0e6', 0.45);
		taper(P, [[-7, -20], [-9.6, -15], [-7.4, -11]], 4, 3.4, fur);
		P.line([[-9.2, -15], [-8.4, -12.6]], leather, 4);
		P.circle(-7, -10.4, 2.4, fur);
	},
	// Minitaur: a tawny muscular bull man facing right with long dark curving horns, a leather shoulder plate on a strap
	// across the chest, a belt and a ragged loincloth, hooves, a big single-bladed axe held low in one hand
	306(P) {
		P.shadow(13, 5);
		const fur = '#c07838', light = '#d89a58', leather = '#8a5a34', horn = '#3a2a24', hoof = '#3a2418';
		taper(P, [[-5, -10], [-10, -9], [-12, -5]], 1.4, 0.8, fur);
		P.ellipse(-12, -4.4, 1, 1.4, horn);
		// legs with hooves
		for (const [s, kx, fx] of [[-1, -5, -4.5], [1, 5, 5]]) {
			taper(P, [[s * 3.4, -10], [kx, -5.5], [fx, -2.6]], 4.6, 3.4, fur);
			P.shape((p) => { p.m(fx - 2.4, -3); p.l(fx + 2.4, -3); p.l(fx + 2.8, 0); p.l(fx + 0.3, 0); p.l(fx, -1.4); p.l(fx - 0.3, 0); p.l(fx - 2.8, 0); }, hoof, fx - 2.8, fx + 2.8);
		}
		// the muscular torso: pecs and abs, the belt and loincloth
		P.shape((p) => { p.m(-8, -24); p.q(0, -26.5, 8, -24); p.q(8.5, -16, 5, -10); p.q(0, -8.5, -5, -10); p.q(-8.5, -16, -8, -24); }, fur, -8.5, 8.5);
		P.thin([[-5, -19.5], [-1, -18], [0, -18], [4.4, -19.5]], shade(fur, -0.35), 0.5);
		for (const y of [-16, -13.6]) P.thin([[-2.6, y], [2.6, y]], shade(fur, -0.3), 0.4);
		P.thin([[0, -17.6], [0, -11.4]], shade(fur, -0.3), 0.4);
		P.shape((p) => { p.m(-5, -10); p.l(5, -10); p.l(4, -3.6); p.l(2, -5); p.l(0, -2.6); p.l(-2, -5); p.l(-4, -3.6); }, '#7a4a2a', -5, 5);
		P.line([[-5.6, -10.2], [5.6, -10.2]], '#5a3218', 1.3);
		P.shape((p) => { p.m(-1.6, -11.2); p.l(1.6, -11.2); p.l(1.6, -9.2); p.l(-1.6, -9.2); }, '#9a9aa2', -1.6, 1.6);
		// far arm, fist clenched
		taper(P, [[7.5, -22], [11, -17], [11, -13]], 4, 3.4, fur);
		P.circle(11, -12, 2.3, light);
		// the strap and the leather shoulder plate
		P.line([[-7, -23], [5, -11]], '#5a3218', 1.1);
		P.shape((p) => { p.m(-11, -24); p.q(-8, -28.6, -2.6, -27); p.l(-3.6, -21); p.q(-8, -19.8, -11, -21); }, leather, -11, -2.6);
		for (const [a, b] of [[[-9, -25.6], [-4, -24.4]], [[-6.4, -26.6], [-6.8, -21]]]) P.thin([a, b], shade(leather, -0.35), 0.45);
		// head: long dark horns curving up, a bull face to the right, a pale muzzle
		taper(P, [[-3, -33], [-10, -34], [-11.5, -40], [-9, -44]], 2.8, 0.6, horn);
		taper(P, [[5, -34], [11, -34], [14, -38], [12.6, -42.4]], 2.8, 0.6, horn);
		P.line([[1, -24], [1.6, -27]], fur, 5);
		P.ellipse(1, -31, 6.2, 5.6, fur);
		P.shape((p) => { p.m(4, -33); p.q(9.6, -32.4, 10.6, -28); p.q(10.6, -24, 6.6, -24); p.q(4, -24.2, 3.6, -26.4); }, light, 3.6, 10.6);
		P.dot(9.4, -27.4, 0.45, '#3a1a10'); P.dot(9.6, -26.2, 0.45, '#3a1a10');
		P.poly([[-4, -32], [-7.6, -31], [-4.4, -29.6]], fur);
		P.ellipse(4.2, -31.2, 1.2, 1.1, '#2a1208'); P.dot(4.3, -31.2, 0.55, '#ff9a2a'); P.dot(4, -31.6, 0.3, '#fff');
		P.thin([[2.6, -33.2], [5.8, -32.6]], '#5a3218', 0.6);
		P.gloss(-1.4, -34, 1.6, 0.7, 0.35);
		// near arm and the axe held low, its blade down by the feet
		P.line([[-12, -24], [-8.6, -5]], '#6a4224', 1.6);
		P.shape((p) => { p.m(-8.4, -9); p.q(-13, -10, -15.6, -6); p.q(-14.6, -1.6, -11, 0.2); p.q(-10, -3.4, -7.4, -4.4); }, '#8a8a92', -15.6, -7.4);
		P.thin([[-15, -6], [-11.4, -0.4]], '#e0e0e6', 0.45);
		taper(P, [[-7, -22], [-10.6, -18], [-10.4, -14]], 4, 3.4, fur);
		P.circle(-10.2, -13, 2.3, light);
	},
	// Dusk gnoll: a hunched blue-grey werewolf facing right with a shaggy icy-white mane, a snarling muzzle with white
	// fangs and an orange eye, a brown loincloth on a rope, big clawed hands, a bushy tail
	307(P) {
		P.shadow(13, 5);
		const fur = '#4e6a8a', dark = '#3a5070', mane = '#cfe2f0', cloth = '#7a5034';
		taper(P, [[-4, -11], [-12, -10], [-16, -5], [-17.5, -1]], 4.4, 1, dark);
		P.poly([[-17.6, -3.6], [-19.4, 0.4], [-16, -0.6]], mane);
		// digitigrade legs, clawed feet
		for (const [s, kx, ax] of [[-1, -7, -4.6], [1, 7.5, 5]]) {
			taper(P, [[s * 3.4, -12], [kx, -7], [ax, -3]], 5, 2.8, s < 0 ? dark : fur);
			P.ellipse(ax + 1, -1.4, 2.8, 1.4, shade(fur, -0.25));
			for (const k of [-1, 0, 1]) P.thin([[ax + 2.4 + k * 0.4, -1.8 + k * 0.6], [ax + 4 + k * 0.3, -1 + k * 0.6]], '#e8eef4', 0.4);
		}
		// the loincloth and rope belt
		P.shape((p) => { p.m(-5, -12.5); p.l(5.5, -12.5); p.l(5, -6); p.l(2.6, -7.4); p.l(0.6, -5); p.l(-1.6, -7.2); p.l(-4.4, -6.2); }, cloth, -5, 5.5);
		P.thin([[-5.4, -12.4], [5.8, -12.6]], '#c8a870', 0.8);
		// far arm, a big open claw
		taper(P, [[6, -23], [12, -18], [13.5, -12.5]], 4.4, 3.4, dark);
		P.circle(13.6, -11.4, 2.4, dark);
		for (const k of [-1, 0, 1]) { taper(P, [[13.6 + k * 1.2, -10.4], [14.6 + k * 1.6, -8]], 1.2, 0.5, dark); P.dot(14.6 + k * 1.6, -7.7, 0.35, '#e8eef4'); }
		// a broad hunched torso with muscles drawn in
		P.shape((p) => { p.m(-8, -25); p.q(0, -29, 8, -25); p.q(8, -17, 5, -12.5); p.q(0, -11, -5, -12.5); p.q(-8.6, -18, -8, -25); }, fur, -8.6, 8);
		P.thin([[-4.4, -21], [-0.8, -19.4], [0.6, -19.4], [4.4, -21]], shade(fur, -0.4), 0.5);
		for (const y of [-17.4, -15.4]) P.thin([[-2.4, y], [2.4, y]], shade(fur, -0.35), 0.4);
		P.thin([[0, -19], [0, -13.6]], shade(fur, -0.35), 0.4);
		P.gloss(-4.6, -23, 1.8, 0.9, 0.3);
		// the icy mane over the shoulders and down the back of the neck
		for (const [x, y, tx, ty] of [[-6, -26, -10.5, -22], [-5, -29, -11.6, -28], [-3, -32, -9.4, -35.6], [0, -34, -3.6, -41], [3, -34, 2.5, -40.6], [-7, -24, -9.6, -18], [-1.6, -33, -7, -39], [-4.4, -30.6, -11, -31.6], [-7.6, -25, -12, -25]]) P.poly([[x - 1.6, y + 1.6], [tx, ty], [x + 1.8, y - 0.4]], mane);
		// head: a long wolf muzzle to the right, snarling, ear laid back, orange eye
		P.poly([[-1, -33], [-4.6, -37.4], [1.4, -35]], dark);
		P.ellipse(1.5, -30, 5.6, 5, fur);
		P.shape((p) => { p.m(4, -33); p.q(10, -32.6, 13, -29.4); p.q(13.2, -27.6, 11.6, -27.4); p.l(4.4, -26.6); }, fur, 4, 13.2);
		P.shape((p) => { p.m(4.4, -26.6); p.l(11.6, -27.4); p.q(11, -25.4, 9.6, -25); p.q(6, -24.4, 4.6, -24.6); }, '#5a1a1a', 4.4, 11.6);
		P.shape((p) => { p.m(4.6, -24.8); p.q(8, -24.6, 10.6, -25.2); p.q(9.6, -23, 5.4, -22.8); }, fur, 4.6, 10.6);
		for (const x of [6, 7.6, 9.2, 10.6]) P.poly([[x - 0.45, -27.2], [x + 0.45, -27.2], [x, -25.8]], '#f6f6f0', { line: false });
		for (const x of [6.8, 8.6]) P.poly([[x - 0.4, -24.8], [x + 0.4, -24.8], [x, -26]], '#f6f6f0', { line: false });
		P.dot(13, -29.2, 0.6, '#1a1a24');
		P.ellipse(4.6, -30.6, 1.3, 1.1, '#2a1408'); P.dot(4.7, -30.6, 0.6, '#ff8a2a'); P.dot(4.4, -31, 0.3, '#fff');
		P.thin([[2.6, -32.6], [6.4, -31.6]], '#1e2a3a', 0.6);
		for (const [x, y, tx, ty] of [[-3.5, -27.5, -9, -25.5], [-4.5, -31, -10, -32]]) P.poly([[x + 1, y - 1.6], [tx, ty], [x + 1, y + 1.6]], mane);
		// near arm: thick, hanging, clawed hand
		taper(P, [[-7, -23], [-10.6, -17], [-9, -11]], 4.4, 3.4, fur);
		P.circle(-8.6, -10, 2.4, fur);
		for (const k of [-1, 0, 1]) { taper(P, [[-8.6 + k * 1.2, -9], [-8 + k * 1.6, -6.6]], 1.2, 0.5, fur); P.dot(-8 + k * 1.6, -6.3, 0.35, '#e8eef4'); }
	},
	// Centaurelk: an elk centaur, a tawny man's torso rising from a brown elk body, big branching antlers, long dark hair,
	// a necklace of fangs with a skull pendant, a gold armband; one foreleg lifted, a dark tail
	308(P) {
		P.shadow(16, 5);
		const skin = '#d8b878', body = '#9a7444', dark = '#6a4a2a', hair = '#2a1e18', antler = '#8a6a40', hoof = '#3a2a1e';
		taper(P, [[-13, -15], [-16, -10], [-15.6, -5]], 3.4, 1.6, hair);
		// far legs (darker)
		for (const [x0, x1, x2] of [[-10, -12, -11.5], [2, 3, 2.6]]) { taper(P, [[x0, -12], [x1, -6], [x2, -2]], 3.4, 2, shade(body, -0.25)); P.ellipse(x2 + 0.3, -1.2, 1.8, 1.1, hoof); }
		// the elk body
		P.ellipse(-4, -13.5, 11, 5.6, body);
		P.ellipse(-4, -11, 8, 2.4, shade(body, 0.18), { line: false });
		P.gloss(-9, -16.5, 2.6, 1.1, 0.3);
		// near legs: a hind leg and a lifted foreleg
		taper(P, [[-9, -12], [-7.6, -6], [-8.6, -2]], 4, 2.2, body);
		P.ellipse(-8.3, -1.2, 1.9, 1.1, hoof);
		taper(P, [[4, -12], [7, -8], [5, -5]], 3.6, 2, body);
		P.ellipse(5, -4.4, 1.6, 1.2, hoof, { rot: 0.6 });
		// the man's torso rising from the front of the body
		P.shape((p) => { p.m(-1.5, -26.5); p.q(4.5, -28.6, 10.5, -26.5); p.q(10, -20, 7.5, -14); p.q(4, -11, 0, -14); p.q(-2.2, -20, -1.5, -26.5); }, skin, -2.2, 10.5);
		P.thin([[1.6, -22.6], [4.4, -21.6], [7.6, -22.6]], shade(skin, -0.35), 0.45);
		for (const y of [-19.4, -17.2]) P.thin([[2.8, y], [6.2, y]], shade(skin, -0.3), 0.4);
		// far arm with the gold armband, hand on the hip
		taper(P, [[9.5, -25.5], [12.6, -20], [11.5, -15]], 3, 2.4, shade(skin, -0.1));
		P.line([[11.4, -21], [13.4, -21.6]], '#e0a020', 0.9);
		P.circle(11.2, -14.4, 1.8, shade(skin, -0.1));
		// long dark hair down the back
		P.shape((p) => { p.m(-0.6, -34); p.q(-4, -29, -3.6, -22); p.q(-1.6, -24, 0.6, -24.6); p.q(1, -29, 2, -32); }, hair, -4, 2);
		// head and the antlers
		for (const sd of [-1, 1]) {
			const bx = 4.2 + sd * 3.2;
			taper(P, [[bx, -35.5], [bx + sd * 3, -39], [bx + sd * 2.6, -45]], 2.2, 1, antler);
			taper(P, [[bx + sd * 2.6, -38.6], [bx + sd * 6.6, -40], [bx + sd * 8.4, -44]], 1.6, 0.6, antler);
			taper(P, [[bx + sd * 1, -37], [bx + sd * 5.4, -36.4], [bx + sd * 8.6, -38]], 1.4, 0.5, antler);
			taper(P, [[bx + sd * 2.8, -42], [bx + sd * 0.8, -45.2]], 1.2, 0.5, antler);
		}
		P.line([[4.4, -26], [4.6, -28]], skin, 3.4);
		head(P, -31.6, 5.4, skin, 4.4);
		P.shape((p) => { p.m(-1.2, -30); p.q(-1.6, -37.6, 4.4, -37.6); p.q(9, -37.6, 9.8, -34.6); p.q(6, -35.6, 2.4, -34); p.q(0.4, -33, -1.2, -30); }, hair, -1.2, 9.8);
		P.eyes(5.4, -31.6, 2.2, 1.15, '#3a2410');
		P.thin([[2.4, -33.4], [4.4, -33]], '#3a2410', 0.6); P.thin([[8.6, -33.4], [6.6, -33]], '#3a2410', 0.6);
		P.thin([[4.8, -28.4], [6.4, -28.6]], '#7a4a2a', 0.45);
		for (const sd of [-1, 1]) P.poly([[4.4 + sd * 5, -31.6], [4.4 + sd * 7.2, -33], [4.4 + sd * 5.2, -30.4]], skin);
		// the necklace of fangs and the skull pendant
		P.thin([[0.6, -26.4], [4.4, -23.4], [9, -26.4]], '#5a3a20', 0.4);
		for (const [x, y] of [[1.6, -25.4], [2.8, -24.4], [6, -24.4], [7.4, -25.2]]) P.poly([[x - 0.4, y], [x + 0.4, y], [x, y + 1.6]], '#f4ecd8');
		skull(P, 4.4, -22, 1.6, '#f0e8d4');
		// near arm, hanging, the hand loosely open
		taper(P, [[-0.6, -25.5], [-2.6, -19.6], [-0.6, -15]], 3, 2.4, skin);
		P.circle(-0.4, -14.2, 1.8, skin);
	},
	// Gnoll zealot: a hulking hyena warrior hunched forward to the right in heavy dark grey plate, a huge pauldron
	// humped over its back, a horned helmet with a tawny mane, a white muzzle and yellow eye, a red tabard hung with a
	// string of gold coins, a spiked iron mace swung low in the near fist, furry brown legs bent back on clawed toes
	309(P) {
		P.shadow(13, 5);
		const plate = '#5e5652', dark = '#3e3836', fur = '#7a4a32', red = '#9a2a24', gold = '#e0a830', mane = '#a8805a', bone = '#e8dcc0';
		// legs bent back on their toes, plated knees, clawed feet; the far one darker
		for (const [hx, kx, ax, fx, c] of [[3, 8, 4.6, 8, shade(fur, -0.15)], [-2, 2.4, -1.6, 1.8, fur]]) {
			taper(P, [[hx, -12], [kx, -7.4], [ax, -3.4]], 4.2, 2.4, c);
			taper(P, [[ax, -3.4], [fx, -1.2]], 2.4, 1.8, c);
			P.ellipse(kx, -7.2, 2.2, 1.8, plate);
			for (const k of [-1, 0, 1]) P.thin([[fx, -1.2 + k * 0.5], [fx + 1.4, -0.6 + k * 0.6]], '#2a1a10', 0.45);
		}
		// far arm in a plated gauntlet, hanging forward, a clawed fist
		taper(P, [[6, -25], [10.6, -19], [10.6, -13.6]], 4, 3.2, dark);
		P.circle(10.8, -12.8, 2.3, dark);
		for (const k of [-1, 0, 1]) P.thin([[10.6 + k * 1.1, -11], [11.4 + k * 1.2, -9.6]], '#1a1a1a', 0.4);
		// the hunched plated body, back humped high, and the red tabard hanging below the belt
		P.shape((p) => { p.m(-4.6, -11.6); p.q(-8.6, -20, -6.6, -29); p.q(-1.4, -34, 6.4, -29.4); p.q(8.6, -22, 5.4, -12.4); p.q(0, -10, -4.6, -11.6); }, plate, -8.6, 8.6);
		for (const [y, d] of [[-24, 0], [-20.4, 0.4], [-16.8, 0.6]]) P.thin([[-6, y + d], [6, y - 1 + d]], '#6a4630', 0.6);
		P.shape((p) => { p.m(-3.6, -13); p.l(4.4, -13.4); p.l(4, -4); p.l(2, -5.4); p.l(0, -3.2); p.l(-2, -5.2); p.l(-3.4, -4.2); }, red, -3.6, 4.4);
		P.line([[-6, -12.6], [6, -13.2]], '#4a2a1a', 1.2);
		// the string of gold coins over the belt
		for (const [x, y] of [[-1.6, -14.6], [0, -13.6], [1.6, -13.4], [3.2, -13.8], [-0.8, -12], [0.8, -11.6], [2.4, -11.8], [0, -10.2], [1.6, -10]]) { P.circle(x, y, 0.95, gold); P.dot(x - 0.25, y - 0.3, 0.3, '#fff2b0'); }
		// the far pauldron, behind the head
		P.ellipse(5.4, -28.4, 4, 3.4, shade(plate, -0.08));
		// head thrust forward: mane, horned helmet, white hyena muzzle facing right, a yellow eye
		for (const [x, y, tx, ty] of [[3.4, -29, -1.6, -31.6], [4, -26.6, -0.6, -24.4], [3.6, -31.6, 0, -35.4]]) P.poly([[x + 1, y - 1.6], [tx, ty], [x + 1, y + 1.6]], mane);
		taper(P, [[5.4, -33.4], [3.6, -37.4], [5, -41]], 2.4, 0.5, bone);
		taper(P, [[10.4, -33.4], [13, -36.8], [12.4, -40.6]], 2.4, 0.5, bone);
		P.ellipse(8.4, -29.6, 4.6, 4.2, '#e8e2d6');
		P.shape((p) => { p.m(10.4, -31.4); p.q(15.4, -30.6, 17, -27.4); p.q(16.8, -25.2, 14, -25); p.l(10.4, -25.4); }, '#e8e2d6', 10.4, 17);
		P.ellipse(16.2, -28, 1.2, 0.95, '#1a1210');
		P.shape((p) => { p.m(12.2, -30.8); p.q(14.6, -30, 16.6, -28.8); p.q(14.4, -29, 12.2, -29.6); }, '#b89a7a', 12.2, 16.6, { line: false });
		P.thin([[11.6, -26.2], [15.8, -26.2]], '#3a1a10', 0.45);
		P.poly([[13, -26.2], [13.7, -26.2], [13.35, -25]], '#fff', { line: false });
		P.shape((p) => { p.m(3.8, -29); p.q(3.6, -35.4, 8.4, -35.6); p.q(13.4, -35.4, 13.8, -31); p.l(12.6, -31); p.q(10.4, -32.6, 8, -32.2); p.q(5.6, -32, 5.2, -27.6); }, plate, 3.6, 13.8);
		P.gloss(6.6, -34.2, 1.6, 0.6, 0.4);
		P.ellipse(10.8, -29.6, 1.4, 1.2, '#2a1a08'); P.dot(11, -29.6, 0.75, '#f8d020'); P.thin([[9.2, -31.2], [12.6, -30.8]], '#3a2a1a', 0.7); P.dot(10.6, -30, 0.3, '#fff');
		// the huge near pauldron humped over the back
		P.ellipse(-5.4, -27.4, 6.2, 5, plate);
		P.thin([[-9.6, -26.4], [-1.2, -25.6]], shade(plate, -0.4), 0.5);
		P.thin([[-9, -23.8], [-1.8, -23.2]], shade(plate, -0.4), 0.5);
		P.gloss(-7.4, -30, 1.8, 0.9, 0.35);
		// the mace: a wooden haft from the fist down to a spiked iron ball near the ground
		P.line([[-15.6, -18.6], [-9.6, -7.4]], '#8a5a30', 1.6);
		for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.poly([[-9 + Math.cos(a - 0.4) * 2.8, -5.4 + Math.sin(a - 0.4) * 2.8], [-9 + Math.cos(a) * 4.4, -5.4 + Math.sin(a) * 4.4], [-9 + Math.cos(a + 0.4) * 2.8, -5.4 + Math.sin(a + 0.4) * 2.8]], dark); }
		P.circle(-9, -5.4, 3.2, dark);
		P.gloss(-10, -6.6, 1, 0.6, 0.4);
		// near arm: a gauntlet hanging from the pauldron, gripping the mace
		taper(P, [[-6.4, -24], [-11, -20], [-12.8, -15.6]], 4, 3.2, dark);
		P.ellipse(-11, -20.4, 2, 1.4, '#6a4630', { rot: 0.6 });
		P.circle(-13, -15, 2.4, dark);
	},
	// Kobold swordmaster (F2 mini-boss): a rat knight facing right in battered silver plate with a crested helmet, the
	// snout and a glowing orange eye showing, a red-brown ear, a round wooden shield behind, a broad notched sword held
	// out in front, bandaged legs and a long tail
	310(P) {
		P.shadow(14, 5);
		const steel = '#a8a8b8', dark = '#6a6a7a', fur = '#7a4030', wrap = '#c8c0b0', wood = '#7a5032';
		taper(P, [[-5, -8], [-12, -6], [-17, -2], [-21, -2.6]], 2, 0.5, '#9a5a4a');
		// the round shield behind on the right
		P.circle(9, -17, 8, '#5a5a62');
		P.circle(9, -17, 6.8, wood, { line: false });
		for (const dx of [-3.4, 0, 3.4]) P.thin([[9 + dx, -17 - Math.sqrt(46 - dx * dx)], [9 + dx, -17 + Math.sqrt(46 - dx * dx)]], shade(wood, -0.35), 0.4);
		// bandaged legs, rat feet
		for (const [s, kx, fx] of [[-1, -5.6, -5], [1, 5, 5.6]]) {
			taper(P, [[s * 3, -10], [kx, -6], [fx, -2.2]], 3.6, 2.8, fur);
			for (const y of [-7, -5, -3.4]) P.thin([[fx + (kx - fx) * 0.5 - 1.6, y], [fx + (kx - fx) * 0.5 + 1.6, y + 0.6]], wrap, 0.7);
			P.ellipse(fx + 1.2, -1.2, 2.8, 1.2, fur);
			for (const k of [0, 1, 2]) P.thin([[fx + 2.6 + k * 0.5, -1.4 + k * 0.5], [fx + 4 + k * 0.4, -1 + k * 0.5]], '#e8dcc8', 0.35);
		}
		// a ragged leather skirt under the plate cuirass
		P.shape((p) => { p.m(-6, -12); p.l(6, -12); p.l(6.6, -6); p.l(4, -7.4); p.l(1.6, -5.4); p.l(-1, -7.4); p.l(-3.6, -5.6); p.l(-6.6, -6.6); }, '#8a5a34', -6.6, 6.6);
		P.shape((p) => { p.m(-7.6, -25); p.q(0, -28, 7.6, -25); p.q(7.8, -17, 6, -12); p.q(0, -10.6, -6, -12); p.q(-7.8, -17, -7.6, -25); }, steel, -7.8, 7.8);
		for (const y of [-20.4, -16.8, -13.6]) P.thin([[-6.4, y], [6.4, y + 0.4]], shade(steel, -0.4), 0.45);
		P.line([[-6.4, -24], [5.4, -12.6]], '#8a5a34', 1);
		P.gloss(-4, -22.6, 1.8, 1, 0.45);
		// pauldrons
		for (const [x, y] of [[-7.6, -24], [7.6, -24]]) { P.ellipse(x, y, 4.2, 3.4, steel); P.thin([[x - 3, y + 0.6], [x + 3, y + 1]], shade(steel, -0.4), 0.45); }
		// head: the helmet with a crest, the snout out in front, an ear poking out, a glowing eye
		P.ellipse(-1.6, -34.6, 2.4, 3, '#d86a4a', { rot: -0.4 });
		P.ellipse(3, -29.6, 5.6, 5, fur);
		P.shape((p) => { p.m(6, -31); p.q(11, -30, 13.6, -27.4); p.q(13.4, -25.4, 11, -25.2); p.l(6, -24.4); }, fur, 6, 13.6);
		P.circle(13.4, -26.6, 1, '#3a1a14');
		P.thin([[7.4, -25.2], [12, -25.4]], '#2a1008', 0.45);
		for (const x of [8.4, 10.2]) P.poly([[x - 0.4, -25.3], [x + 0.4, -25.3], [x, -24]], '#f6f0e0', { line: false });
		P.shape((p) => { p.m(-3, -27); p.q(-4.4, -36, 2.6, -36.4); p.q(8.6, -36, 9.4, -30.4); p.l(8.4, -28); p.q(6, -31, 2, -31); p.q(-1, -30, -1, -26); }, steel, -4.4, 9.4);
		for (const [x, y] of [[-3, -32], [-1, -35.6], [2, -37], [5.4, -36]]) P.poly([[x - 1.2, y + 0.8], [x - 0.6, y - 3], [x + 1.2, y]], dark);
		P.thin([[-2.6, -29.4], [8.6, -30]], shade(steel, -0.45), 0.4);
		P.gloss(0.6, -34.6, 1.8, 0.7, 0.45);
		P.ellipse(6.6, -28.6, 1.3, 1.1, '#2a0e04');
		P.glow(6.6, -28.6, 2.4, '#ff8a1a', 0.8); P.dot(6.6, -28.6, 0.6, '#ffd060');
		// far arm and the big sword held out in front
		taper(P, [[6.6, -22], [9, -17], [7, -13.6]], 3.4, 2.8, steel);
		sword(P, -2, -13, 0.12, 21, 4, '#d8dce6');
		for (const x of [8, 12, 15.6]) P.poly([[x, -14.4 + (x + 2) * 0.12 - 1.2], [x + 1, -14.4 + (x + 2) * 0.12 - 0.4], [x + 2, -14.4 + (x + 2) * 0.12 - 1.4]], '#f0ece4', { line: false });
		P.circle(6.8, -12.4, 1.8, dark);
		// near arm gripping the hilt
		taper(P, [[-6.6, -22], [-8.4, -17], [-3.6, -13.4]], 3.4, 2.8, steel);
		P.circle(-2.6, -13.2, 1.9, dark);
	},
	// Gnoll demon (F2 boss): a hunched blue-black gnoll fiend facing right, great bat wings spread behind with hooked
	// claws at their tips, a shaggy mane, a pale chest, orange eyes and small tusks, long arms with clawed hands, a long tail
	311(P) {
		P.shadow(17, 5.5);
		const skin = '#3e5a7a', dark = '#2a3e5a', membrane = '#5a7a96', belly = '#9ab4c8', claw = '#e8e0cc';
		// the wings, rooted at the shoulders, a hooked claw at each tip
		for (const [sd, c] of [[-1, membrane], [1, shade(membrane, -0.15)]]) {
			const w = sd < 0 ? 22 : 21;
			P.shape((p) => { p.m(sd * 3, -27); p.q(sd * 10, -38, sd * w, -40); p.l(sd * (w + 1.5), -28); p.q(sd * (w - 1), -22, sd * (w + 0.5), -14); p.q(sd * (w - 3.5), -15, sd * (w - 5.5), -10); p.q(sd * (w - 7.5), -14, sd * (w - 10), -12); p.q(sd * 8, -18, sd * 5, -20); }, c, sd < 0 ? -w - 2 : 2, sd < 0 ? -2 : w + 2, { alpha: 0.96 });
			for (const [x, y] of [[w + 1.5, -28], [w + 0.5, -14], [w - 5.5, -10], [w - 10, -12]]) P.thin([[sd * (w - 1), -39], [sd * x, y]], shade(c, -0.4), 0.5);
			taper(P, [[sd * 3, -27], [sd * 10, -36], [sd * w, -40]], 2.2, 1, dark);
			taper(P, [[sd * w, -40], [sd * (w - 0.6), -44], [sd * (w - 3), -44.6]], 1.4, 0.4, claw);
		}
		// the long tail along the ground
		taper(P, [[-3, -10], [-10, -6], [-16, -2], [-22, -2.6]], 3, 0.6, dark);
		// digitigrade legs, clawed feet
		for (const [s, kx, ax] of [[-1, -7, -5], [1, 7.6, 5.6]]) {
			taper(P, [[s * 3.6, -12], [kx, -7], [ax, -3]], 5.4, 3, s < 0 ? dark : skin);
			P.ellipse(ax + 1, -1.4, 3, 1.4, dark);
			for (const k of [-1, 0, 1]) P.thin([[ax + 2.6 + k * 0.4, -1.8 + k * 0.6], [ax + 4.2 + k * 0.3, -1 + k * 0.6]], claw, 0.4);
		}
		// a hunched muscular body, the pale chest and belly
		P.shape((p) => { p.m(-7.6, -27); p.q(0, -30, 7.6, -27); p.q(7.8, -18, 5, -12); p.q(0, -10, -5, -12); p.q(-8, -19, -7.6, -27); }, skin, -8, 7.8);
		P.shape((p) => { p.m(-3, -25); p.q(1, -26.4, 5, -25); p.q(5, -17, 2.6, -12.6); p.q(0.6, -11.6, -1.4, -12.6); p.q(-3.6, -18, -3, -25); }, belly, -3.6, 5, { line: false });
		for (const y of [-21.6, -18.6, -15.6]) P.thin([[-2.4, y], [4.2, y]], shade(belly, -0.35), 0.4);
		P.thin([[0.8, -24.6], [0.8, -13]], shade(belly, -0.35), 0.4);
		// far arm reaching forward, clawed hand
		taper(P, [[6.4, -25], [12, -19], [13, -12]], 4, 3, dark);
		P.circle(13, -11, 2.2, dark);
		for (const k of [-1, 0, 1]) taper(P, [[13 + k * 1.1, -10], [14 + k * 1.4, -7.4]], 1.1, 0.4, claw);
		// head: a shaggy mane, a broad muzzle facing right with tusks, pointed ears, orange eyes
		for (const [x, y, tx, ty] of [[-4.6, -28, -9.6, -26], [-4.4, -31.6, -9.6, -33], [-2, -35, -5, -39.6], [2, -35.4, 1.6, -40]]) P.poly([[x - 1.6, y + 1.4], [tx, ty], [x + 1.8, y - 0.4]], dark);
		P.poly([[-1, -34], [-4, -39], [2, -36]], skin);
		P.poly([[3.4, -35], [3.6, -40.6], [6.6, -35.4]], skin);
		P.ellipse(1.6, -31, 6, 5.4, skin);
		P.shape((p) => { p.m(4.4, -33.4); p.q(10.4, -33, 12, -29.6); p.q(12, -26, 8.6, -25.4); p.l(4.6, -25.6); }, skin, 4.4, 12);
		P.ellipse(11.4, -30, 1.3, 1, '#14202e');
		P.thin([[6, -27.2], [11, -27.6]], '#14202e', 0.5);
		P.shape((p) => { p.m(7.4, -27.2); p.q(8.4, -29, 7.8, -30.6); p.q(7.2, -29, 6.6, -27.4); }, claw, 6.6, 8.4);
		P.shape((p) => { p.m(10, -27.5); p.q(11, -29.2, 10.4, -30.4); p.q(9.8, -29, 9.2, -27.6); }, claw, 9.2, 11);
		for (const x of [3.2, 6.8]) { P.ellipse(x, -31.6, 1.3, 1.1, '#1a0e04'); P.glow(x, -31.6, 2.2, '#ff8a1a', 0.7); P.dot(x, -31.6, 0.6, '#ffb030'); }
		P.thin([[1.6, -33.6], [4.6, -33]], '#14202e', 0.6); P.thin([[8.2, -33.6], [5.4, -33]], '#14202e', 0.6);
		P.gloss(-1, -34, 1.6, 0.7, 0.35);
		// near arm, long and hanging, clawed hand
		taper(P, [[-7, -25], [-11, -18], [-10, -11]], 4, 3, skin);
		P.circle(-9.8, -10, 2.2, skin);
		for (const k of [-1, 0, 1]) taper(P, [[-9.8 + k * 1.1, -9], [-9.2 + k * 1.4, -6.6]], 1.1, 0.4, claw);
	},
	// Snotling footman: a lanky green goblin with huge pointed ears, a long hooked nose, a spiky black topknot, a pendant on a
	// cord, a ragged brown loincloth, leather wraps on the wrists, a wooden club held low in one hand
	312(P) {
		P.shadow(9, 4);
		const skin = '#6aa83a', wrap = '#a07a40', cloth = '#6a4a2c';
		// legs, bent a little, feet out
		for (const [hx, kx, fx, c] of [[-2, -3.5, -3.5, shade(skin, -0.1)], [2, 4, 4.5, skin]]) {
			taper(P, [[hx, -11], [kx, -6], [fx, -2]], 2.8, 2.2, c);
			P.ellipse(fx + 0.8, -1.2, 2.6, 1.2, shade(c, -0.12));
		}
		// a slim torso, the loincloth
		P.shape((p) => { p.m(-4.5, -21); p.q(0, -22.5, 4.5, -21); p.q(4.6, -15, 3.4, -11); p.l(-3.4, -11); p.q(-4.6, -15, -4.5, -21); }, skin, -4.6, 4.6);
		P.shape((p) => { p.m(-3.8, -12.4); p.l(4, -12.4); p.l(3.2, -5); p.l(1.4, -6.6); p.l(0, -4.4); p.l(-1.6, -6.4); p.l(-3.6, -5.4); }, cloth, -3.8, 4);
		P.line([[-4, -12.4], [4, -12.4]], '#4a2e1a', 0.9);
		P.thin([[-3.4, -21], [0.6, -16.6], [3.4, -21]], '#4a2e1a', 0.4);
		P.circle(0.6, -16, 1.2, '#8a5a2a');
		P.gloss(-2.6, -19.4, 1, 0.6, 0.35);
		// the club arm: forward, gripping a club that slants back over the ground
		P.line([[-12, -16], [3, -8]], '#7a5030', 1.6);
		P.ellipse(-12, -16, 2.2, 1.7, '#8a5a34', { rot: 0.5 });
		taper(P, [[3.6, -20], [6.2, -14], [3.6, -9]], 2.4, 1.8, skin);
		P.circle(3.4, -8.6, 1.6, skin);
		P.thin([[4.6, -12.6], [6.6, -13.2]], wrap, 0.9);
		// the other arm hangs at the side
		taper(P, [[-3.8, -20], [-6, -14.5], [-5.4, -10]], 2.4, 1.8, shade(skin, -0.06));
		P.circle(-5.4, -9.6, 1.5, shade(skin, -0.06));
		P.thin([[-6.8, -13.6], [-4.6, -13.2]], wrap, 0.9);
		// neck, ears, head, nose, topknot
		P.line([[0.6, -21], [1, -23.5]], skin, 2.4);
		for (const [x, tx, ty, c] of [[-4, -13, -33, shade(skin, -0.06)], [5, 13.5, -32, skin]]) P.shape((p) => { p.m(x, -30); p.q((x + tx) / 2, -33, tx, ty); p.q((x + tx) / 2, -27, x, -26); }, c, Math.min(x, tx), Math.max(x, tx));
		P.shape((p) => { p.m(-2, -35); p.l(-1, -42); p.l(0.5, -37.5); p.l(2, -43); p.l(2.6, -37); p.l(4.6, -41); p.l(3.6, -35); }, '#2a1a12', -2, 4.6);
		P.line([[-0.8, -35.4], [3.4, -35.4]], '#a07a40', 0.7);
		head(P, -29, 6, skin);
		P.eyes(1.6, -30, 2.1, 1.3, '#c08a10');
		P.thin([[-1.6, -32], [0.8, -31.4]], '#2a3a10', 0.45); P.thin([[4.8, -32], [2.6, -31.4]], '#2a3a10', 0.45);
		taper(P, [[3.6, -28.6], [7, -27], [7.2, -24.4]], 2, 0.6, shade(skin, 0.04));
		P.mouth(1.6, -24.6, 1, '#2a3a10');
		P.poly([[0.4, -25], [1, -25], [0.7, -23.8]], '#f6f0dc');
	},
	// Cerberus: a three-headed hound with shaggy red-brown fur bristling along its back, each head wearing a bone skull
	// mask with glowing yellow eyes and bared teeth, clawed paws and a long tail ending in a spiky tuft
	313(P) {
		P.shadow(19, 5);
		const fur = '#a04e3c', dark = '#72322a', bone = '#ecdcc0', claw = '#f0e4cc';
		const dogHead = (x, y, r, c) => {
			for (const dx of [-0.5, 0.35]) P.poly([[x + dx * r - r * 0.35, y - r * 0.6], [x + dx * r - r * 0.1, y - r * 1.45], [x + dx * r + r * 0.3, y - r * 0.55]], dark);
			P.circle(x, y, r, c);
			for (const a of [2.2, 2.7, 3.2, 3.7]) P.poly([[x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8 - r * 0.25], [x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35], [x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8 + r * 0.25]], c);
			P.ellipse(x + r * 0.35, y - r * 0.05, r * 0.72, r * 0.68, bone);
			P.ellipse(x + r * 0.95, y + r * 0.35, r * 0.55, r * 0.38, bone);
			P.shape((p) => { p.m(x + r * 0.3, y + r * 0.55); p.q(x + r * 0.95, y + r * 0.95, x + r * 1.45, y + r * 0.55); p.q(x + r * 1.1, y + r * 1.25, x + r * 0.4, y + r * 1.0); }, '#3a120c', x, x + r * 1.5, { line: false });
			for (const t of [0.55, 0.85, 1.15]) P.poly([[x + r * t - r * 0.09, y + r * 0.62], [x + r * t + r * 0.09, y + r * 0.62], [x + r * t, y + r * 0.9]], '#fff8e8', { line: false });
			for (const dx of [0.05, 0.72]) { P.ellipse(x + dx * r, y - r * 0.15, r * 0.24, r * 0.22, '#2a1208', { line: false }); P.glow(x + dx * r, y - r * 0.15, r * 0.5, '#ffd23f', 0.7); P.dot(x + dx * r, y - r * 0.15, r * 0.12, '#fff07a'); }
			P.dot(x + r * 1.45, y + r * 0.25, r * 0.1, '#3a120c');
			P.gloss(x - r * 0.1, y - r * 0.55, r * 0.3, r * 0.14, 0.45);
		};
		// the tail with a spiky tuft
		taper(P, [[-11, -16], [-18, -15], [-21, -21], [-18, -26]], 2.2, 1.2, fur);
		P.poly([[-18.6, -24.4], [-22, -28], [-19, -27.6], [-18.6, -31.4], [-17, -27.6], [-14.4, -29], [-16.4, -25]], dark);
		// far legs
		for (const [hx, kx, fx] of [[-10, -14.4, -11.4], [5, 6.4, 8.8]]) {
			taper(P, [[hx, -12], [kx, -7], [kx, -7], [fx, -1.6]], 3.6, 2.2, dark);
			P.ellipse(fx + 1, -1.2, 2.4, 1.2, dark);
		}
		// the shaggy body, spikes of fur along the back
		for (const [x, y] of [[-12, -18], [-9, -22.6], [-5, -25.6], [-0.5, -26.6], [4, -25.6]]) P.poly([[x - 2.4, y + 1.6], [x - 1.4, y - 3.4], [x + 0.6, y - 1], [x + 1.6, y - 3.8], [x + 2.6, y + 1.4]], fur);
		P.shape((p) => { p.m(-13, -11); p.q(-15, -21, -8, -24); p.q(0, -28, 7, -22); p.q(11, -17, 9, -10); p.q(0, -7, -13, -11); }, fur, -15, 11);
		for (const [x0, y0, x1, y1] of [[-10, -18, -7, -15], [-5, -21, -2, -17.6], [1, -20, 4, -16], [-4, -13, -1, -11]]) P.thin([[x0, y0], [x1, y1]], shade(fur, -0.35), 0.4);
		P.gloss(-6, -22, 3, 1.3, 0.35);
		// near legs, clawed paws
		for (const [hx, kx, fx] of [[-8, -12, -8], [7, 9.6, 12.4]]) {
			taper(P, [[hx, -14], [kx, -7.5], [kx, -7.5], [fx, -1.8]], 4.6, 2.6, fur);
			P.ellipse(fx + 1, -1.3, 2.8, 1.4, shade(fur, -0.1));
			for (const k of [-1, 0, 1]) P.thin([[fx + 1.6 + k * 0.9, -1.2], [fx + 2.4 + k * 0.9, 0.3]], claw, 0.35);
		}
		// three heads: the far one high at the back, then the right, then the front one low
		dogHead(10, -30, 4.6, dark);
		dogHead(16, -21, 5, shade(fur, -0.08));
		dogHead(7, -17, 5.6, fur);
	},
	// Salamander: a green lizard sitting up on its haunches, front legs planted out in front, a long tail on the ground,
	// a cream ridged belly, pale spikes down its back, a big head with a red eye and jaws open wide on a red tongue
	314(P) {
		P.shadow(16, 5);
		const green = '#4f9a30', belly = '#ecdcaa', claw = '#24300f', spike = '#bcd88a';
		taper(P, [[-3, -9], [-12, -6], [-18, -2], [-23, -4.5]], 6, 0.8, green);
		// far legs: the hind one back by the tail, the front one under the chest
		taper(P, [[-6, -10], [-11, -6], [-10, -1.6]], 4.4, 2.8, shade(green, -0.14));
		P.ellipse(-9, -1.2, 2.8, 1.2, shade(green, -0.24));
		taper(P, [[3, -16], [3.6, -8], [2.4, -1.6]], 4.2, 3, shade(green, -0.14));
		P.ellipse(3.4, -1.2, 3, 1.3, shade(green, -0.24));
		// spikes down the back
		for (const [x, y] of [[-8.6, -13], [-8.4, -18], [-6.8, -23], [-4.4, -27.4], [-1.4, -31], [1.6, -35]]) P.poly([[x + 1.6, y + 1.2], [x - 2.2, y - 1.4], [x + 1.6, y - 1.6]], spike);
		// body leaning upright, the belly in front
		P.shape((p) => { p.m(-7, -6); p.q(-10.5, -19, -4, -28); p.q(0, -33, 5, -30); p.q(11, -21, 9, -8); p.q(1, -3, -7, -6); }, green, -10.5, 11);
		P.shape((p) => { p.m(2.5, -28); p.q(8.5, -22, 8.4, -13); p.q(7.6, -6.5, 2, -5.8); p.q(-0.6, -16, 2.5, -28); }, belly, -0.6, 8.6);
		for (const y of [-24, -21, -18, -15, -12, -9]) P.thin([[1.4 + Math.abs(y + 16) * 0.12, y], [8 - Math.abs(y + 16) * 0.12, y + 0.5]], shade(belly, -0.35), 0.4);
		for (const [x, y] of [[-6, -18], [-4, -23], [-7, -12], [-2, -14]]) P.dot(x, y, 0.6, spike);
		P.gloss(-5, -21, 1.8, 1, 0.35);
		// near hind leg: a thick haunch at the back, the shin, a clawed foot
		P.ellipse(-5.6, -8.6, 4.8, 4.8, green);
		taper(P, [[-5, -7], [-6.4, -1.6]], 4, 2.8, green);
		P.ellipse(-4.6, -1.3, 3.2, 1.3, shade(green, -0.15));
		for (const k of [-1, 0, 1]) P.thin([[-3.6 + k * 1.2, -1.2], [-2.6 + k * 1.3, 0.3]], claw, 0.4);
		// near front leg: from the shoulder, out and down to a splayed clawed foot planted out front
		taper(P, [[6, -21], [12, -14], [12.6, -2]], 3.8, 2.8, green);
		P.ellipse(13.6, -1.3, 3.2, 1.3, shade(green, -0.15));
		for (const k of [-1, 0, 1]) P.thin([[14.4 + k * 1.2, -1.2], [15.6 + k * 1.3, 0.3]], claw, 0.4);
		// the head on a short thick neck: open jaws, a red tongue, teeth, a red eye
		P.shape((p) => { p.m(-1, -30); p.q(-1, -40, 7, -40.5); p.q(15, -41, 19.5, -36.5); p.q(20, -34.6, 18.6, -34); p.l(8, -32.6); p.q(4, -27, -1, -30); }, green, -1, 20);
		P.shape((p) => { p.m(7.6, -32.6); p.l(18.6, -34); p.q(17.5, -27.4, 11, -26.4); p.q(7.6, -27.6, 7.6, -32.6); }, '#7a1414', 7.6, 18.6, { line: false });
		P.ellipse(12, -29.4, 4, 1.8, '#e0485a', { rot: -0.2, line: false });
		P.shape((p) => { p.m(6, -29); p.q(11, -26.8, 17, -28.6); p.q(15, -23.6, 10, -23.8); p.q(5.4, -24.6, 6, -29); }, shade(green, 0.04), 5.4, 17);
		P.shape((p) => { p.m(7.4, -27.6); p.q(11, -25.8, 15.4, -27.2); p.q(12.4, -24.6, 7.4, -27.6); }, belly, 7.4, 15.4, { line: false });
		for (let x = 9.5; x < 18.5; x += 1.6) P.poly([[x - 0.45, -33.3 + (x - 9) * 0.1], [x + 0.45, -33.3 + (x - 9) * 0.1], [x, -32]], '#fffaf0', { line: false });
		for (let x = 9; x < 16; x += 1.6) P.poly([[x - 0.45, -27.9 - (x - 9) * 0.05], [x + 0.45, -27.9 - (x - 9) * 0.05], [x, -29.2]], '#fffaf0', { line: false });
		P.dot(18.6, -37.4, 0.45, '#1a2a0a');
		P.ellipse(7.6, -36.4, 2.4, 2.2, '#fbf6ea');
		P.dot(8.2, -36.3, 1.3, '#d01e1e'); P.dot(8.3, -36.3, 0.5, '#2a0808'); P.dot(7.3, -37.2, 0.45, '#ffffff');
		P.thin([[4.8, -38.8], [10, -38.4]], shade(green, -0.5), 0.6);
		P.gloss(3, -38.4, 1.8, 0.8, 0.4);
	},
	// Stone troll: a hulking troll of blue-grey boulders, its small pale green head sunk between massive rocky shoulders,
	// a pale green stone chest and belly, long arms with big fists, a belt with a round buckle, a ragged loincloth and a
	// coil of rope at the hip
	315(P) {
		P.shadow(17, 5.5);
		const rock = '#5f7088', pale = '#b2c2a2', brown = '#6a4a2e', rope = '#c8a050';
		const boulders = (list) => {
			for (const [x, y, r, k] of list) {
				const pts = [];
				for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + k, rr = r * (0.82 + 0.22 * Math.sin(k * 3 + i * 2)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]); }
				P.poly(pts, shade(rock, 0.06));
				P.gloss(x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.18, 0.3);
			}
		};
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 5, -11], [sd * 6, -6], [sd * 6.5, -2]], 6.4, 5.4, shade(rock, -0.05));
			P.ellipse(sd * 7.4, -1.4, 4.4, 2, shade(rock, -0.2));
		}
		// long arms hanging from the shoulders, big fists
		for (const [sd, c] of [[-1, shade(rock, -0.04)], [1, shade(rock, -0.08)]]) {
			taper(P, [[sd * 10, -27], [sd * 16, -22], [sd * 16, -22], [sd * 15, -11]], 7, 5.6, c);
			P.circle(sd * 15.8, -8.6, 3.8, c);
			for (const k of [-1, 0, 1]) P.thin([[sd * 14.2, -9.4 + k * 1.3], [sd * 17.4, -9.8 + k * 1.3]], shade(rock, -0.45), 0.35);
		}
		// the body: shoulders like a hill, narrowing to the hips
		P.shape((p) => { p.m(-7, -9); p.q(-12, -16, -12, -24); p.q(-14, -33, -6, -36); p.q(0, -38, 6, -36); p.q(14, -33, 12, -24); p.q(12, -16, 7, -9); p.q(0, -7, -7, -9); }, rock, -14, 14);
		// the pale stone chest and belly
		for (const sd of [-1, 1]) P.ellipse(sd * 4.4, -21, 4.6, 3.6, pale);
		P.ellipse(0, -14.5, 6.4, 4.6, pale);
		for (const [x, y] of [[-2, -15], [2.4, -14], [-4, -13], [0, -12.4], [3.6, -16.4]]) P.thin([[x - 0.8, y], [x + 0.8, y - 0.3]], shade(pale, -0.3), 0.35);
		// belt, buckle, loincloth and the rope coil
		P.shape((p) => { p.m(-5.4, -10.4); p.l(5.4, -10.4); p.l(4.4, -2.6); p.l(2, -4.2); p.l(0, -2); p.l(-2, -4.2); p.l(-4.4, -2.8); }, brown, -5.4, 5.4);
		P.line([[-7.6, -10.4], [7.6, -10.4]], '#4a3020', 1.4);
		P.circle(0, -10.4, 1.7, '#a87a48'); P.circle(0, -10.4, 0.8, '#5a3a20', { line: false });
		for (const [rx, ry, dx] of [[3, 4.4, -0.6], [2.8, 4.2, 0], [2.6, 4, 0.6]]) { const ring = []; for (let i = 0; i <= 20; i++) ring.push([-9.4 + dx + Math.cos(i * Math.PI / 10) * rx, -7 + Math.sin(i * Math.PI / 10) * ry]); P.thin(ring, shade(rope, -0.45), 1); P.thin(ring, rope, 0.55); }
		// boulders crusting the shoulders and arms
		boulders([[-10, -31, 3, 0], [-5.5, -34, 2.4, 1], [-13.6, -26, 2.6, 2], [-16.2, -20, 2.2, 3], [-17, -14.6, 1.8, 4], [10, -31, 3, 5], [5.5, -34, 2.4, 6], [13.6, -26, 2.6, 7], [16.2, -20, 2.2, 8], [17, -14.6, 1.8, 9], [-9.6, -18, 1.4, 10], [9.6, -17, 1.3, 11]]);
		// the small head sunk between the shoulders: a heavy brow, a big nose, an underbite with little tusks
		P.circle(0, -29, 6, pale);
		P.gloss(-2.4, -32.4, 1.6, 0.8, 0.4);
		P.shape((p) => { p.m(-6, -32); p.q(0, -36.5, 6, -32); p.l(5.4, -30.6); p.q(0, -33.4, -5.4, -30.6); }, rock, -6, 6);
		P.eyes(0, -30.2, 2.5, 1.25, '#1a2a1a');
		P.ellipse(0, -27.4, 1.6, 1.8, shade(pale, -0.08));
		P.thin([[-3, -24.6], [3, -24.6]], '#2a3020', 0.5);
		for (const x of [-2, 2]) P.poly([[x - 0.5, -24.6], [x + 0.5, -24.6], [x, -26]], '#fff8e8', { line: false });
	},
	// Snotling ranger: a green goblin in a brown hood and a tattered brown tunic with criss-cross straps, big ears poking
	// out of the hood, a long nose, a quiver of arrows on its back, a bow held low in front, wrapped shins
	316(P) {
		P.shadow(10, 4);
		const skin = '#6aa83a', tunic = '#8a6a3a', dark = '#5a4024', wood = '#7a5030', wrap = '#b08a50';
		// quiver on the back with feathered arrows
		P.poly([[-9.6, -30.6], [-5, -32.6], [-1.6, -17.4], [-5.8, -15.6]], '#6a4428');
		for (const [x, y] of [[-8.8, -33.6], [-7.2, -34.6], [-5.6, -34.4]]) { P.line([[x + 1, y + 3], [x, y]], '#d8c8a0', 0.4); P.poly([[x - 0.8, y + 0.4], [x, y - 1.6], [x + 0.8, y + 0.4]], '#e8e0d0'); }
		for (const [hx, kx, fx, c] of [[-2, -3.5, -4, shade(skin, -0.1)], [2, 4, 5, skin]]) {
			taper(P, [[hx, -11], [kx, -6], [fx, -2]], 3, 2.4, c);
			for (const y of [-5.6, -4]) P.thin([[fx - 1.6 + (kx - fx) * 0.3, y], [fx + 1.6 + (kx - fx) * 0.3, y - 0.3]], wrap, 0.8);
			P.ellipse(fx + 0.9, -1.2, 2.7, 1.2, shade(c, -0.12));
		}
		// the tattered tunic
		P.shape((p) => { p.m(-5, -22); p.q(0, -23.5, 5, -22); p.q(5.6, -16, 5.4, -10); p.l(4, -6.4); p.l(2.4, -8.4); p.l(0.6, -5.4); p.l(-1.4, -8.2); p.l(-3, -6); p.l(-4.4, -8.6); p.l(-5.8, -7); p.q(-5.6, -16, -5, -22); }, tunic, -5.8, 5.6);
		P.thin([[-4.4, -21], [4.4, -12]], dark, 0.6); P.thin([[4.4, -21], [-4.4, -12]], dark, 0.6);
		P.line([[-5.2, -11.6], [5.2, -11.6]], dark, 0.9);
		// the bow arm reaching forward and down, the bow lying across in front
		taper(P, [[3.8, -21], [7, -16], [6, -11.6]], 2.4, 1.8, skin);
		P.thin([[-12, -8.6], [13, -7.4]], '#e8e0c8', 0.3);
		P.shape((p) => { p.m(-12.6, -8.4); p.q(0, -19, 13.6, -7.2); p.q(0, -15.4, -12.6, -8.4); }, wood, -12.6, 13.6);
		P.circle(6, -11.2, 1.6, skin);
		P.thin([[5.2, -14.4], [7.6, -14.6]], wrap, 0.9);
		taper(P, [[-3.8, -21], [-5.6, -16], [-4.6, -12]], 2.4, 1.8, shade(skin, -0.06));
		P.circle(-4.6, -11.6, 1.5, shade(skin, -0.06));
		// neck, ears, head, the hood over it
		P.line([[0.6, -22], [1, -24]], skin, 2.4);
		for (const [x, tx, ty, c] of [[-4, -12.5, -32.5, shade(skin, -0.06)], [5, 13, -32, skin]]) P.shape((p) => { p.m(x, -30.4); p.q((x + tx) / 2, -33, tx, ty); p.q((x + tx) / 2, -27.4, x, -26.4); }, c, Math.min(x, tx), Math.max(x, tx));
		head(P, -29.4, 6, skin);
		P.shape((p) => { p.m(-6.6, -27); p.q(-7.6, -37.6, 0.6, -37.6); p.q(7.4, -37.4, 6.8, -29.4); p.q(3.4, -34.4, 0.4, -34); p.q(-4, -33.6, -5, -26); }, tunic, -7.6, 7.4);
		P.shape((p) => { p.m(-6.6, -27); p.q(-6, -23, -1, -22.6); p.l(-3, -21); p.q(-7.4, -22, -6.6, -27); }, dark, -7.4, -1);
		P.eyes(1.8, -30, 2, 1.25, '#c08a10');
		P.thin([[-1.2, -31.8], [0.8, -31.2]], '#2a3a10', 0.45); P.thin([[4.8, -31.8], [2.8, -31.2]], '#2a3a10', 0.45);
		taper(P, [[3.6, -28.8], [7.2, -27.2], [7.4, -24.8]], 2, 0.6, shade(skin, 0.04));
		P.mouth(1.6, -25, 1, '#2a3a10');
		P.poly([[0.2, -25.4], [0.9, -25.4], [0.6, -24]], '#f6f0dc');
	},
	// Orc swordsman: a big hunched green orc in dark studded steel armour with a heavy shoulder plate, a pointed ear, small
	// angry eyes and tusks, a dark kilt, tall brown boots, a round wooden shield on its back and a broad curved cleaver held
	// out in front
	317(P) {
		P.shadow(14, 5);
		const skin = '#6aa83a', steel = '#4a5260', boot = '#6a4428', wood = '#7a4a2a';
		// the shield slung on the back
		P.circle(-8, -18, 8.6, wood);
		P.circle(-8, -18, 6.8, shade(wood, 0.08), { line: false });
		P.circle(-8, -18, 2, '#8a909a');
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 3.5, -11], [sd * 4.2, -6], [sd * 4.6, -2.4]], 4.6, 4, boot);
			P.line([[sd * 4.2 - 2.4, -8], [sd * 4.2 + 2.4, -8]], shade(boot, -0.25), 0.7);
			P.ellipse(sd * 4.6 + 1.4, -1.4, 3.6, 1.6, '#3a2a1e');
		}
		// kilt and the armoured body
		P.shape((p) => { p.m(-6.4, -13); p.l(6.4, -13); p.l(7, -7.4); p.l(4.4, -8.4); p.l(2, -6.8); p.l(-0.6, -8.4); p.l(-3.2, -6.8); p.l(-5.4, -8.4); p.l(-7, -7); }, '#3a3e48', -7, 7);
		P.shape((p) => { p.m(-7, -26); p.q(0, -30, 7, -26); p.q(9, -18, 7, -12); p.q(0, -10, -7, -12); p.q(-9, -18, -7, -26); }, steel, -9, 9);
		P.line([[-7.4, -14], [7.4, -14]], '#2a2e36', 1.2);
		for (const [x, y] of [[-4, -24], [-1, -24.6], [2, -24.6], [5, -24], [-5, -20.5], [-2, -21], [1, -21], [4, -21], [6.6, -20.5]]) P.dot(x, y, 0.45, '#c8ccd4');
		P.thin([[-6, -17.4], [7, -17.4]], shade(steel, -0.4), 0.45);
		P.gloss(-4.6, -22.4, 2, 1, 0.35);
		// the far arm hangs behind the shield side
		taper(P, [[-6, -24], [-9.6, -18], [-8.6, -12]], 3.8, 3, shade(skin, -0.08));
		P.circle(-8.4, -11.4, 2.2, shade(skin, -0.08));
		// the sword arm: the fist forward, the curved cleaver held out level
		P.ellipse(6.6, -24.4, 4.4, 3.6, steel);
		for (const x of [4.6, 6.6, 8.6]) P.dot(x, -25.6, 0.45, '#c8ccd4');
		taper(P, [[7, -22], [10, -17], [8.6, -13.4]], 4, 3.2, skin);
		P.line([[3, -12.6], [8.6, -13]], '#3a2a1e', 1.4);
		P.circle(2.4, -12.6, 1.2, '#8a909a');
		P.shape((p) => { p.m(10, -14.6); p.q(17, -16, 22.5, -23); p.q(23.5, -13.6, 16.5, -10.2); p.q(13, -9.4, 10, -11.4); }, '#c8ced8', 10, 23.5);
		P.thin([[11, -12.6], [16, -12.4], [21.6, -18.6]], '#eef2f8', 0.4);
		P.line([[9.8, -15.6], [9.8, -10.4]], '#5a5f68', 0.9);
		P.circle(8.6, -13, 2.4, skin);
		// head thrust forward low on the shoulders: a pointed ear, a big jaw with tusks
		P.shape((p) => { p.m(-1, -32.4); p.q(-5, -34.6, -8.4, -36); p.q(-6, -30.4, -2, -28.4); }, shade(skin, -0.04), -12, -1);
		P.circle(3, -31, 6.2, skin);
		P.gloss(0.6, -34.4, 1.8, 0.9, 0.4);
		P.shape((p) => { p.m(-0.6, -29); p.q(4, -30.4, 9.6, -28.6); p.q(10, -24.8, 5, -24.4); p.q(0, -24.8, -0.6, -29); }, shade(skin, 0.04), -0.6, 10);
		for (const x of [2.6, 7]) P.poly([[x - 0.6, -27.2], [x + 0.6, -27.2], [x, -30.2]], '#fff4dc');
		P.thin([[1.6, -27.2], [8.6, -27.2]], '#2a3a10', 0.45);
		P.eyes(4, -32.2, 2, 1.2, '#c03a10');
		P.thin([[0.8, -34.2], [3.2, -33.2]], '#2a3a10', 0.6); P.thin([[7.6, -34.2], [5.2, -33.2]], '#2a3a10', 0.6);
	},
	// Orc ranger: a hunched, heavy green orc under a dark olive cloak with its hood thrown back, tusks, a necklace of fangs,
	// teal wrist guards and leg wraps, a quiver of arrows over the shoulder, a long bow held low across the body and an
	// arrow pointing down in the other fist
	318(P) {
		P.shadow(14, 5);
		const skin = '#5f9e34', cloak = '#5a5230', teal = '#3e7a80', wood = '#a8702e', quiver = '#7a4a28';
		// quiver over the right shoulder, arrows sticking up
		P.poly([[2, -30], [6, -33.6], [10.6, -24], [7, -21.6]], quiver);
		for (const [x, y] of [[5.6, -37.4], [7.6, -36.6], [9.4, -35]]) { P.line([[x - 1.6, y + 3.6], [x, y]], '#d8c8a0', 0.4); P.poly([[x - 1, y + 0.6], [x + 0.6, y - 1.6], [x + 1.2, y + 0.4]], '#f2ead6'); }
		// bent legs with teal wraps
		for (const [hx, kx, fx, c] of [[-3.5, -6.5, -5, shade(skin, -0.1)], [3.5, 7, 6, skin]]) {
			taper(P, [[hx, -12], [kx, -7], [kx, -7], [fx, -2]], 4.4, 3.2, c);
			P.line([[fx - 1.8 + (kx - fx) * 0.3, -4.4], [fx + 1.8 + (kx - fx) * 0.3, -4.6]], teal, 1.2);
			P.ellipse(fx + 0.8, -1.3, 3, 1.3, shade(c, -0.15));
		}
		// the cloak hanging behind, the bulky torso, a brown loin flap
		P.shape((p) => { p.m(-10, -28); p.q(-15, -18, -11, -8); p.l(-8, -10); p.l(-6, -7.6); p.l(-3, -10); p.l(-4, -24); }, shade(cloak, -0.1), -15, -3);
		P.shape((p) => { p.m(-7.4, -25); p.q(0, -28.4, 7.4, -25); p.q(8.6, -17, 6, -12); p.q(0, -10, -6, -12); p.q(-8.6, -17, -7.4, -25); }, skin, -8.6, 8.6);
		P.thin([[-3, -20], [0, -18.6], [3, -20]], shade(skin, -0.35), 0.4);
		P.shape((p) => { p.m(-5.6, -12.6); p.l(5.6, -12.6); p.l(4.4, -6); p.l(0, -7.6); p.l(-4.4, -6); }, '#6a4428', -5.6, 5.6);
		P.line([[-6, -12.6], [6, -12.6]], '#3a2a1a', 1);
		P.thin([[-6.6, -25.4], [6, -14]], quiver, 1);
		// the cloak over the shoulders, the hood bunched behind the neck
		P.shape((p) => { p.m(-10.6, -21); p.q(-11, -30, -4, -31.6); p.q(4, -33, 10, -27.6); p.q(11.6, -22, 9.6, -19.6); p.q(6, -24.6, 0, -25.4); p.q(-6, -25, -10.6, -21); }, cloak, -11, 11.6);
		P.gloss(-6, -27.6, 2, 0.9, 0.3);
		// fang necklace
		P.thin([[-4, -25], [0, -22.4], [4, -25]], '#4a3020', 0.4);
		for (const x of [-2.6, -1, 0.8, 2.6]) P.poly([[x - 0.45, -23.4 + Math.abs(x) * 0.3], [x + 0.45, -23.4 + Math.abs(x) * 0.3], [x, -21.6 + Math.abs(x) * 0.3]], '#f6eedc');
		// the bow held low across the body in the far hand
		P.thin([[-15, -9], [15.4, -6.4]], '#e8e0c8', 0.3);
		P.shape((p) => { p.m(-15.6, -8.8); p.q(-2, -18, 16, -6.2); p.q(-2, -14.4, -15.6, -8.8); }, wood, -15.6, 16);
		taper(P, [[-7.6, -22], [-10, -16], [-10, -16], [-7.8, -12]], 4.4, 3.2, shade(skin, -0.06));
		P.line([[-10, -16.4], [-6.2, -15.6]], teal, 2);
		P.circle(-7.6, -11.8, 2.2, shade(skin, -0.06));
		// the arrow hand: fist forward, an arrow pointing down
		taper(P, [[7.6, -22], [10.4, -17], [10.4, -17], [7.6, -14]], 4.4, 3.2, skin);
		P.line([[10.4, -17], [8.8, -15]], teal, 2);
		P.line([[7, -18], [6.4, -3]], '#c8a870', 0.5);
		P.poly([[5.6, -3.6], [7.2, -3.4], [6.2, -0.6]], '#7ab0b8');
		P.circle(7, -13.6, 2.2, skin);
		// head set low and forward: pointed ears, a heavy jaw with tusks, angry little eyes
		for (const [x, tx, ty, c] of [[-3, -9.6, -33, shade(skin, -0.06)], [6, 12.6, -32.6, skin]]) P.shape((p) => { p.m(x, -31); p.q((x + tx) / 2, -33, tx, ty); p.q((x + tx) / 2, -28.6, x, -27.6); }, c, Math.min(x, tx), Math.max(x, tx));
		P.circle(1.6, -30, 5.8, skin);
		P.gloss(-0.6, -33.4, 1.6, 0.8, 0.4);
		P.dot(6.4, -30.2, 0.6, '#d8b040');
		P.shape((p) => { p.m(-2.6, -28); p.q(1.6, -29.4, 6.4, -28); p.q(6.6, -24.2, 1.8, -23.6); p.q(-2.8, -24.2, -2.6, -28); }, shade(skin, 0.04), -2.8, 6.6);
		P.thin([[-1.2, -26.4], [5, -26.4]], '#2a3a10', 0.45);
		for (const x of [-0.6, 4.2]) P.poly([[x - 0.6, -26.2], [x + 0.6, -26.2], [x, -29.2]], '#fff4dc');
		P.eyes(1.8, -31.2, 2, 1.2, '#c03a10');
		P.thin([[-1.2, -33.2], [1, -32.2]], '#2a3a10', 0.6); P.thin([[4.8, -33.2], [2.6, -32.2]], '#2a3a10', 0.6);
	},
	// Snotling shaman: a goblin in a long ragged olive-green hooded robe, dark curved horns jutting back from the hood, a big
	// nose and yellow eyes in the hood's shadow, a skull dangling from one hand and a gnarled staff topped with antlers and a
	// skull in the other
	319(P) {
		P.shadow(13, 4.5);
		const robe = '#8aa040', skin = '#6aa83a', horn = '#4a3420', wood = '#8a6a3a', bone = '#efe2c4';
		// the staff on the right: a gnarled shaft up to antler branches and a skull
		P.line([[12, 0], [11.4, -20], [12.6, -32]], wood, 1.4);
		for (const [pts, w] of [[[[12.6, -32], [9, -37], [7.6, -42]], 1.2], [[[12.6, -32], [16, -38], [19, -41]], 1.2], [[[9.6, -36.4], [6.4, -37.4]], 0.8], [[[15.6, -37.4], [16.4, -42]], 0.8], [[[11.6, -33], [11.2, -43]], 0.9]]) taper(P, pts, w * 1.6, 0.5, wood);
		skull(P, 12.4, -33.4, 3.2, bone);
		// the robe: a hooded cone spreading into a ragged hem
		P.shape((p) => { p.m(-5, -26); p.q(-9, -12, -14, -2); p.l(-11.4, -3); p.l(-9.6, -0.4); p.l(-6.4, -2.4); p.l(-3, 0); p.l(0, -2); p.l(3, 0); p.l(6, -2); p.l(9.4, -0.6); p.l(10, -3); p.q(8, -14, 5, -26); }, robe, -14, 10);
		for (const x of [-6, -1, 4]) P.thin([[x * 0.6, -20], [x, -4]], shade(robe, -0.3), 0.4);
		P.line([[-6.8, -14], [6.8, -14]], '#6a5a2a', 1);
		P.circle(4.6, -12.6, 1, '#c84a2a');
		P.gloss(-4, -20, 1.6, 1, 0.3);
		// the sleeve arm down to a hand holding a skull by its crown; the other sleeve to the staff
		taper(P, [[-4, -23], [-6.6, -16], [-6.6, -16], [-3.6, -10.4]], 3.8, 3.2, robe);
		P.circle(-3, -10, 1.5, skin);
		skull(P, -3, -6.6, 2.8, bone);
		taper(P, [[4, -23], [8, -18], [8, -18], [11, -19.4]], 3.8, 3.2, shade(robe, -0.04));
		P.circle(11.4, -19.6, 1.6, skin);
		// horns jutting back from the hood
		taper(P, [[-3, -33], [-9.6, -34.6], [-13.4, -40]], 2.8, 0.4, horn);
		taper(P, [[-2, -29.4], [-9.6, -29], [-13.6, -33.6]], 2.6, 0.4, shade(horn, 0.1));
		// the hood with the face inside
		P.shape((p) => { p.m(-7.6, -24); p.q(-9.6, -38, 0, -38.6); p.q(4, -38.6, 8.4, -36); p.q(9, -31, 7.6, -24); p.q(0, -21, -7.6, -24); }, robe, -9.6, 9);
		P.ellipse(1.2, -29.2, 5.6, 5.4, shade(robe, -0.5), { line: false });
		P.circle(1.6, -28.8, 4.6, skin);
		P.eyes(1.8, -30, 1.8, 1.2, '#c09010');
		P.thin([[-1, -31.6], [1, -31]], '#2a3a10', 0.45); P.thin([[4.6, -31.6], [2.6, -31]], '#2a3a10', 0.45);
		taper(P, [[3.4, -28.6], [6.4, -27], [6.4, -25.2]], 1.8, 0.5, shade(skin, 0.05));
		P.mouth(1.6, -25.4, 0.9, '#2a3a10');
	},
	// Orc sorcerer (F3 mini-boss): a hunched, bulky green orc under a shaggy brown fur cloak, wooden antlers rising from his
	// head, pointed ears, a long pale beard and glaring eyes, a skull on his belt beside a pouch, long clawed fingers, and a
	// tall staff crowned with a horned animal skull
	320(P) {
		P.shadow(16, 5.5);
		const skin = '#5f9e34', fur = '#7a5a34', dark = '#4a3420', beard = '#d8d0b0', wood = '#7a5a34', bone = '#efe2c4';
		// the staff on the left: the shaft and the horned skull at its top
		P.line([[-12, 0], [-13, -34]], wood, 1.4);
		for (const sd of [-1, 1]) taper(P, [[-13 + sd * 2, -37], [-13 + sd * 5, -40], [-13 + sd * 4.4, -45]], 2, 0.4, bone);
		P.ellipse(-13, -36, 3.6, 3.8, bone);
		P.ellipse(-13, -31.6, 2.2, 2.2, bone);
		for (const sd of [-1, 1]) P.ellipse(-13 + sd * 1.4, -36, 1, 1.2, '#2a1a10', { line: false });
		P.thin([[-14, -30.6], [-12, -30.6]], '#6a5a40', 0.4);
		P.thin([[-12.8, -33], [-13.6, -26], [-12.2, -22]], '#c84a2a', 0.5);
		// fur boots, short thick legs
		for (const [sd, c] of [[-1, shade(skin, -0.1)], [1, skin]]) {
			taper(P, [[sd * 4, -11], [sd * 5, -6]], 4.6, 4, c);
			P.ellipse(sd * 5.6, -2.6, 3.8, 3, fur);
			P.ellipse(sd * 6, -1.2, 3.6, 1.4, dark);
		}
		// the body, belt, skull and pouch
		P.shape((p) => { p.m(-8, -24); p.q(0, -27, 8, -24); p.q(9.6, -16, 6.6, -10); p.q(0, -7.6, -6.6, -10); p.q(-9.6, -16, -8, -24); }, skin, -9.6, 9.6);
		P.shape((p) => { p.m(-6.6, -11.6); p.l(6.6, -11.6); p.l(5.6, -3.4); p.l(3, -5); p.l(0.6, -2.6); p.l(-2, -5); p.l(-5.4, -3.4); }, dark, -6.6, 6.6);
		P.line([[-7.4, -12], [7.4, -12]], '#3a2414', 1.2);
		skull(P, 0, -11.4, 2.8, bone);
		P.ellipse(-4.6, -9.6, 2, 2.4, '#a8804a');
		P.thin([[-5.6, -11.6], [-3.6, -11.6]], '#5a3a1a', 0.5);
		// the fur cloak over the shoulders and back, hanging in shaggy points
		P.shape((p) => { p.m(-12.6, -14); p.q(-15, -26, -8, -30); p.q(0, -33, 8, -30); p.q(15, -26, 12.6, -14); p.l(10.4, -16.6); p.l(9.4, -13.4); p.l(8, -18); p.q(6, -24, 0, -24); p.q(-6, -24, -8, -18); p.l(-9.4, -13.4); p.l(-10.4, -16.6); }, fur, -15, 15);
		for (const [x, y] of [[-11, -22], [-9, -26.6], [9, -26.6], [11, -22], [-5, -28.6], [5, -28.6]]) P.thin([[x, y], [x * 1.08, y + 3]], shade(fur, -0.35), 0.45);
		P.gloss(-8, -27.4, 2, 1, 0.3);
		// arms: the left hand grips the staff, the right hangs with long claws
		taper(P, [[-8, -22], [-11, -17], [-11, -17], [-12.4, -15]], 4.4, 3.4, shade(skin, -0.06));
		P.circle(-12.6, -15, 2.4, shade(skin, -0.06));
		taper(P, [[8, -22], [11, -16], [11, -16], [10.4, -11]], 4.4, 3.4, skin);
		P.circle(10.4, -10.6, 2.3, skin);
		for (const k of [-1, 0, 1]) taper(P, [[10.4 + k * 1.1, -9.4], [11.2 + k * 1.4, -6.4], [10.6 + k * 1.6, -4.6]], 0.9, 0.3, '#e8dcc0');
		// antlers behind the head
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 3, -35], [sd * 6, -39], [sd * 5, -45.6]], 2, 0.6, wood);
			taper(P, [[sd * 5.4, -40.4], [sd * 9.4, -41.6], [sd * 10.4, -44.6]], 1.4, 0.4, wood);
		}
		// ears, the head, a long pale beard over the chest
		for (const sd of [-1, 1]) P.shape((p) => { p.m(sd * 4.6, -32.6); p.q(sd * 9, -35, sd * 12, -36); p.q(sd * 9.4, -30.4, sd * 4.6, -29.6); }, sd < 0 ? shade(skin, -0.06) : skin, sd < 0 ? -12 : 4.6, sd < 0 ? -4.6 : 12);
		head(P, -31, 6, skin);
		P.shape((p) => { p.m(-5, -29.6); p.q(-6, -22, -3, -18); p.l(-1.6, -20); p.l(0, -16.6); p.l(1.6, -20); p.l(3, -18); p.q(6, -22, 5, -29.6); p.q(0, -26.4, -5, -29.6); }, beard, -6, 6);
		for (const x of [-2.6, 0, 2.6]) P.thin([[x, -26], [x * 0.8, -20]], shade(beard, -0.3), 0.35);
		P.shape((p) => { p.m(-5.6, -33.4); p.q(-4, -38.6, 0, -38.4); p.q(4, -38.6, 5.6, -33.4); p.q(0, -36, -5.6, -33.4); }, beard, -5.6, 5.6);
		P.eyes(0, -31.6, 2.3, 1.25, '#c03a10');
		P.thin([[-3.8, -33.8], [-1, -32.6]], '#2a3a10', 0.6); P.thin([[3.8, -33.8], [1, -32.6]], '#2a3a10', 0.6);
		P.thin([[-1.6, -27.6], [1.6, -27.6]], '#2a3a10', 0.45);
		for (const x of [-1.4, 1.4]) P.poly([[x - 0.5, -27.6], [x + 0.5, -27.6], [x, -29.4]], '#fff4dc');
	},
	// Skeleton ranger: a skeleton archer in a round iron helmet over a grey mail hood, a green tunic hanging in rags, a strap
	// and a belt, a quiver of arrows on its back, bony arms holding a tall bow, and tall brown boots
	321(P) {
		P.shadow(10, 4);
		const bone = '#e6dac0', steel = '#7a828e', mail = '#9aa2aa', rag = '#4f6a4a', boot = '#7a5030', wood = '#8a5a30';
		// quiver on the back
		P.poly([[-9.4, -32], [-5.6, -33.6], [-2.6, -18], [-6, -16.6]], '#6a4428');
		for (const [x, y] of [[-9.6, -34.6], [-8, -35.6], [-6.4, -35.4]]) { P.line([[x + 0.8, y + 3], [x, y]], '#d8c8a0', 0.4); P.poly([[x - 0.8, y + 0.4], [x, y - 1.6], [x + 0.8, y + 0.4]], '#e0d8c8'); }
		// legs: bony thighs into tall boots
		for (const [hx, fx, c] of [[-2.4, -3.4, shade(boot, -0.1)], [2.4, 4, boot]]) {
			P.line([[hx, -12], [fx, -7]], bone, 1.3);
			taper(P, [[fx, -7.6], [fx, -2.2]], 3.6, 3.2, c);
			P.ellipse(fx + 0.8, -1.3, 2.8, 1.3, shade(c, -0.2));
		}
		// the ragged green tunic, a belt and a strap; ribs showing above
		P.shape((p) => { p.m(-4.6, -18); p.l(4.6, -18); p.q(5.4, -13, 5, -9); p.l(3.6, -6.6); p.l(2.4, -8.6); p.l(0.6, -5.4); p.l(-1.2, -8.4); p.l(-2.8, -6); p.l(-4.4, -8.6); p.l(-5.4, -7.6); p.q(-5.4, -13, -4.6, -18); }, rag, -5.4, 5.4);
		P.line([[-5, -14], [5, -14]], '#5a3a20', 1);
		P.circle(1.4, -14, 0.9, '#c8903a');
		P.shape((p) => { p.m(-3.6, -24); p.q(0, -25, 3.6, -24); p.l(3, -18); p.l(-3, -18); }, '#2a2420', -3.6, 3.6, { line: false });
		for (const y of [-23, -21.4, -19.8]) P.line([[-3, y], [3, y]], bone, 0.6);
		P.line([[0, -24], [0, -17.6]], bone, 0.7);
		P.thin([[-4, -24], [3.6, -15]], '#5a3a20', 0.8);
		// the bow held upright out in front, string drawn back a little
		P.thin([[11.4, -33], [7.6, -20.6], [11.4, -7]], '#e8e0c8', 0.3);
		P.shape((p) => { p.m(11, -33.6); p.q(17.6, -20, 11, -6.4); p.q(15.6, -20, 11, -33.6); }, wood, 11, 17.6);
		// arms: bony, the far one reaching to the string, the near one gripping the bow
		P.line([[-3.6, -23], [-0.4, -19], [6, -20.6]], shade(bone, -0.08), 1.2);
		P.circle(7.2, -20.6, 1.1, shade(bone, -0.08));
		P.line([[3.6, -23], [8, -21.6], [13.8, -21]], bone, 1.2);
		P.dot(8, -21.6, 0.8, bone);
		P.circle(14.2, -20.6, 1.3, bone);
		// head: a skull in a mail hood under a round iron helmet
		P.line([[0.6, -24], [0.8, -26]], bone, 1.2);
		P.shape((p) => { p.m(-6.8, -24); p.q(-8, -33, 0.4, -34); p.q(8, -33, 7.4, -24); p.q(0, -22.4, -6.8, -24); }, mail, -8, 8);
		for (const y of [-26, -24.6]) P.thin([[-6, y], [6.6, y]], shade(mail, -0.3), 0.3);
		P.ellipse(1.6, -29, 4.8, 4.6, '#2a2620', { line: false });
		skull(P, 2, -28.6, 4.4, bone);
		P.shape((p) => { p.m(-5.8, -31.6); p.q(-5.6, -37.8, 0.6, -38); p.q(6.6, -37.8, 6.8, -31.6); p.q(0.6, -33.2, -5.8, -31.6); }, steel, -5.8, 6.8);
		P.thin([[0.6, -38], [0.6, -32.6]], shade(steel, -0.3), 0.5);
		P.line([[0.6, -38], [0.6, -39.4]], steel, 0.7);
		P.gloss(-2, -36, 1.6, 0.8, 0.5);
	},
	// Skeletal grandwolf: a great skeleton wolf prowling on long bony legs with clawed feet, a knobbly spine and ribcage, a
	// bony tail, a shaggy dark mane round its neck held by a spiked collar, and a huge wolf skull with a glowing green eye
	322(P) {
		P.shadow(19, 5);
		const bone = '#e2d4b4', mane = '#3a2a24', claw = '#b8a888';
		const legB = (pts, c) => { P.line(pts, c, 1.5); for (const q of pts.slice(1, -1)) P.dot(q[0], q[1], 1.1, c); const f = pts[pts.length - 1]; P.ellipse(f[0] + 1, f[1] + 0.5, 2.2, 1.1, c); for (const k of [-1, 0, 1]) P.thin([[f[0] + 1.4 + k * 0.8, f[1] + 0.6], [f[0] + 2.4 + k * 0.8, f[1] + 1.6]], claw, 0.35); };
		// tail
		P.line([[-11, -20], [-16, -19], [-20, -15], [-21.6, -11]], bone, 1);
		for (const [x, y] of [[-14, -19.6], [-17.6, -17.8], [-20.4, -14]]) P.dot(x, y, 0.8, bone);
		// far legs
		legB([[-10, -19], [-14, -12], [-11.6, -6], [-13, -1.6]], shade(bone, -0.15));
		legB([[6, -18], [9, -11], [7, -2]], shade(bone, -0.15));
		// spine with knobs, pelvis, ribs
		P.ellipse(-10.4, -19.6, 3.4, 2.6, bone);
		const sp = [[-10, -21], [-6, -23.4], [-2, -24.6], [2, -24.6], [6, -23.4]];
		P.line(sp, bone, 1.4);
		for (const [x, y] of sp) P.poly([[x - 1, y], [x - 0.4, y - 2.6], [x + 0.8, y]], bone);
		for (let i = 0; i < 5; i++) { const x = -5 + i * 2.4; P.thin([[x, -23.6], [x - 1.4 + i * 0.3, -18], [x + 0.6, -13.6 + Math.abs(i - 2) * 0.6]], shade(bone, -0.45), 1.4); P.thin([[x, -23.6], [x - 1.4 + i * 0.3, -18], [x + 0.6, -13.6 + Math.abs(i - 2) * 0.6]], bone, 0.9); }
		// near legs
		legB([[-8, -18], [-11.4, -11], [-8.6, -6], [-10, -1.6]], bone);
		// the dark mane over the shoulders and neck
		P.shape((p) => { p.m(4, -15); p.l(2, -20); p.l(3, -24); p.l(2, -28); p.l(5.6, -28.4); p.l(6, -32); p.l(9.4, -30); p.l(11.6, -33); p.l(13, -29.4); p.l(16.4, -29.6); p.q(17, -18, 12, -13); p.l(10, -15); p.l(8, -12.6); p.l(6.6, -15.4); }, mane, 2, 17);
		P.gloss(6, -26, 2, 1, 0.25);
		legB([[9, -15], [13, -9], [12.4, -2]], bone);
		// spiked collar
		P.shape((p) => { p.m(9, -29); p.q(13, -30, 15, -26); p.q(14.6, -20, 11.6, -16); p.l(10, -17); p.q(12.6, -21, 12.6, -25); p.q(11.6, -27.4, 8.6, -27.4); }, '#4a3a30', 8.6, 15);
		for (const [x, y] of [[10.6, -29], [13.6, -27.4], [14.4, -23], [13.4, -18.6]]) P.poly([[x - 0.6, y], [x + 0.8, y - 1.6], [x + 0.6, y + 0.6]], '#9aa2b0');
		// the big wolf skull: cranium, long snout, fangs, a glowing green eye
		P.shape((p) => { p.m(9, -24); p.q(9, -33.6, 16, -33); p.q(20, -32, 22.4, -27.4); p.q(24.4, -24, 23, -21.4); p.l(15, -20); p.q(10, -19, 9, -24); }, bone, 9, 24.4);
		P.shape((p) => { p.m(14.6, -20.4); p.l(22.6, -21.4); p.q(21, -17.6, 16, -17.6); p.q(13.6, -18, 14.6, -20.4); }, shade(bone, -0.06), 13.6, 22.6);
		P.thin([[15, -20.4], [22.6, -21.4]], '#3a2a1e', 0.5);
		for (const [x, d] of [[17, 1], [20.6, 1], [18.4, -1]]) P.poly([[x - 0.5, -20.8], [x + 0.5, -20.8], [x, -20.8 + d * 1.6]], '#fffaf0');
		P.ellipse(22, -24.6, 0.7, 0.5, '#2a1a10', { line: false });
		P.ellipse(14.6, -26.4, 2.6, 2.2, '#1a1410', { line: false });
		P.glow(14.6, -26.4, 3.8, '#7cff4a', 0.7);
		P.dot(14.6, -26.4, 1.3, '#c8ff80'); P.dot(14.6, -26.4, 0.5, '#2a4a10');
		P.thin([[12, -29.4], [17.4, -28.6]], shade(bone, -0.4), 0.5);
		P.gloss(12.4, -31, 1.8, 0.8, 0.45);
	},
	// Reaper horseman (F3 boss): a hooded reaper in a ragged dark green cloak, a skull face in the hood's shadow and a
	// bony hand holding up a scythe with a glowing green blade, riding a skeleton horse with a long skull head, a glowing
	// green eye, bony legs and a ragged tail
	323(P) {
		P.shadow(19, 5);
		const bone = '#d8c8a4', cloak = '#4a5a48', claw = '#a89878';
		const legB = (pts, c) => { P.line(pts, c, 1.6); for (const q of pts.slice(1, -1)) P.dot(q[0], q[1], 1.1, c); const f = pts[pts.length - 1]; P.ellipse(f[0] + 0.6, f[1] + 0.4, 1.8, 1.2, shade(c, -0.25)); };
		// the horse: tail, far legs, pelvis, spine, ribs
		taper(P, [[-12, -21], [-17, -20], [-18.4, -12]], 2.4, 0.6, '#3a3430');
		legB([[-10, -17], [-13, -10], [-11, -6], [-12.4, -1.6]], shade(bone, -0.15));
		legB([[9, -16], [11, -9], [10, -2]], shade(bone, -0.15));
		P.ellipse(-11, -19.4, 3.6, 2.8, bone);
		P.line([[-11, -21], [-4, -22.6], [4, -22.6], [10, -21]], bone, 1.4);
		for (let i = 0; i < 6; i++) { const x = -6 + i * 2.6; const pts = [[x, -22.4], [x - 1 + i * 0.3, -17.6], [x + 0.6, -13.6 + Math.abs(i - 2.5) * 0.5]]; P.thin(pts, shade(bone, -0.45), 1.4); P.thin(pts, bone, 0.9); }
		legB([[-8, -16], [-11, -9.6], [-8.6, -6], [-9.6, -1.6]], bone);
		legB([[11, -15], [14, -8.6], [13.4, -2]], bone);
		// the horse's neck and long skull, a dark mane
		P.line([[9, -20], [13, -27], [14.4, -31]], bone, 1.4);
		for (const [x, y] of [[10.4, -22.6], [12, -25.4], [13.6, -28.4]]) P.dot(x, y, 1, bone);
		P.shape((p) => { p.m(8, -19); p.l(10, -24); p.l(9.6, -28); p.l(12.4, -30.6); p.l(12, -26); p.l(12.6, -22.6); }, '#3a3430', 8, 12.6);
		P.shape((p) => { p.m(12, -31); p.q(13, -36, 17, -35); p.q(21, -33, 24.4, -27.6); p.q(25, -25, 23, -24.6); p.l(18.6, -25.6); p.q(13, -26, 12, -31); }, bone, 12, 25);
		for (const x of [13.4, 15.4]) P.poly([[x - 0.8, -34.6], [x, -38], [x + 0.8, -34.4]], bone);
		P.thin([[18.6, -25.8], [24, -25.4]], '#3a2a1e', 0.4);
		for (const x of [19.6, 21.4, 23]) P.thin([[x, -26.2], [x, -25.2]], '#3a2a1e', 0.3);
		P.ellipse(16.4, -30.8, 1.8, 1.6, '#1a1410', { line: false });
		P.glow(16.4, -30.8, 3, '#7cff4a', 0.7); P.dot(16.4, -30.8, 1, '#c8ff80');
		P.gloss(15, -33.6, 1.4, 0.6, 0.45);
		// the scythe: a long dark shaft, the glowing green blade curving at the top
		P.line([[-3.6, -8], [1.8, -45]], '#3a2e28', 1);
		P.glow(-4, -42, 6, '#7cff4a', 0.3);
		P.shape((p) => { p.m(1.8, -44.6); p.q(-7, -47.6, -14, -38.6); p.q(-7, -44, 1.4, -42); }, '#6ae03a', -14, 1.8);
		P.thin([[0.4, -44.4], [-6, -45], [-12.4, -39.4]], '#d0ffb0', 0.35);
		// the rider's cloak draped over the horse's back, legs hidden in it
		P.shape((p) => { p.m(-5.6, -36); p.q(-9.6, -29, -13, -17); p.l(-10.6, -18); p.l(-9.4, -13); p.l(-7, -16.4); p.l(-5, -11.6); p.l(-3, -15.6); p.l(-0.6, -11); p.l(1.6, -15); p.l(3.6, -12.6); p.l(5, -16.4); p.l(7.4, -14.6); p.q(5.6, -26, 3, -36); }, cloak, -13, 7.4);
		for (const x of [-7, -3.6, 0]) P.thin([[x * 0.6, -32], [x, -18]], shade(cloak, -0.35), 0.4);
		P.gloss(-6, -30, 1.4, 1.2, 0.25);
		// the bony arm up to the scythe, the other hand on the reins
		taper(P, [[0.6, -32], [4, -29], [4, -29], [1.2, -26.4]], 2.8, 2.2, cloak);
		P.line([[1.2, -26.4], [0.6, -26]], bone, 0.9);
		P.circle(0.4, -26, 1.3, bone);
		P.thin([[2, -26.4], [9, -25], [17.6, -27.6]], '#4a3a30', 0.4);
		taper(P, [[-4, -32], [-1.6, -36], [-1.6, -36], [0.6, -38]], 2.8, 2.2, shade(cloak, -0.06));
		P.circle(0.9, -38.4, 1.3, bone);
		// the hood with a skull face in its shadow
		P.shape((p) => { p.m(-7.4, -32); p.q(-9, -43, -2, -45); p.q(2, -45.6, 4.6, -42); p.q(5.6, -37, 3.6, -32); p.q(-2, -30, -7.4, -32); }, cloak, -9, 5.6);
		P.ellipse(-0.6, -37, 3.8, 4.4, '#141a14', { line: false });
		skull(P, -0.2, -37.2, 3.2, bone, '#7cff4a');
	},
	// Plaguebeak: a plague doctor facing right, an ochre hood peaked at the back over a dark leather beak mask with round
	// amber lenses, a grey cape over one shoulder, a long ragged brown robe with wide sleeves, gloved hands on a crooked
	// staff whose long curved blade sweeps back over the hood
	324(P) {
		P.shadow(13, 5);
		const hood = '#d89a48', robe = '#8a5a2e', cape = '#5a5452', mask = '#5a3a22', glove = '#6a5a48', wood = '#6a4a2a';
		// the long robe flaring to a ragged hem
		P.shape((p) => { p.m(-6, -24); p.l(6, -24); p.q(9, -12, 12, -1); p.l(9, -2.4); p.l(6.5, 0); p.l(3.6, -1.8); p.l(0.6, 0.4); p.l(-2.4, -1.6); p.l(-5.4, 0.4); p.l(-8, -1.6); p.l(-11.5, 0); p.q(-9.5, -12, -6, -24); }, robe, -11.5, 12);
		for (const [x0, x1] of [[-2, -4.5], [3, 4.5], [-6, -8.6]]) P.thin([[x0, -18], [x1, -3]], shade(robe, -0.35), 0.45);
		P.gloss(-4.5, -18, 1.4, 2.6, 0.3);
		// the staff, held upright in front, a crook at the top
		P.line([[15, -1], [13, -38]], wood, 1.4);
		P.line([[13, -38], [14.6, -41], [17.4, -40.2], [17.6, -38]], wood, 1.2);
		// the far arm in its sleeve, the gloved hand low on the staff
		taper(P, [[-1, -20], [5, -13], [11, -10.6]], 4, 3.4, shade(robe, -0.12));
		P.ellipse(13.6, -10.6, 2.2, 1.9, glove);
		// grey cape over the far shoulder, ragged
		P.shape((p) => { p.m(-9.5, -29); p.q(-6, -27, -1, -25); p.l(-2.5, -18); p.l(-5, -20); p.l(-7, -16.5); p.l(-8.4, -20); p.l(-11, -18); p.q(-12, -24, -9.5, -29); }, cape, -12, -1);
		// the hood around the mask, peaked at the back
		P.shape((p) => { p.m(-9, -21); p.q(-12, -31, -7, -37); p.l(-6, -44); p.q(3, -41, 7.5, -35.5); p.q(11.5, -30, 9.5, -22); p.q(1, -19, -9, -21); }, hood, -12, 11.5);
		P.shape((p) => { p.m(-4.5, -23); p.q(-5, -34, 2.6, -35); p.q(8.6, -34.5, 8.4, -26); p.q(2, -21.4, -4.5, -23); }, shade(hood, -0.55), -5, 8.6, { line: false });
		P.thin([[-7.6, -36], [-9.4, -28], [-7.4, -22]], shade(hood, -0.25), 0.45);
		P.gloss(-7.4, -31, 1.2, 2.6, 0.35);
		// the beak mask: round amber lenses, the long curved beak
		P.ellipse(2.4, -28.5, 5, 5, mask);
		P.thin([[-2, -30.2], [7, -30.2]], shade(mask, -0.3), 0.6);
		for (const x of [0.2, 4.6]) { P.circle(x, -29.3, 1.9, '#3a2416'); P.dot(x, -29.3, 1.3, '#e8a02a'); P.dot(x - 0.45, -29.8, 0.45, '#fff6d8'); }
		taper(P, [[5, -27], [10, -24.5], [13.6, -18.6]], 3.6, 0.6, shade(mask, 0.1));
		P.thin([[6, -25.6], [10.4, -23.4], [12.8, -19.6]], shade(mask, -0.4), 0.35);
		// the near arm in its wide sleeve, the gloved hand high on the staff
		taper(P, [[-4, -21], [3, -17.5], [11, -16.6]], 4.4, 3.8, robe);
		P.ellipse(13.2, -16.2, 2.2, 1.9, glove);
		P.thin([[12, -17.2], [12, -15.2]], shade(glove, -0.4), 0.3); P.thin([[13.4, -17.4], [13.4, -15]], shade(glove, -0.4), 0.3);
		// the long blade sweeping back over the hood
		P.shape((p) => { p.m(13.6, -39.5); p.q(1, -48, -16, -39); p.q(-1, -44, 12.6, -37); }, '#cfc6b4', -16, 13.6);
		P.thin([[11.6, -39.6], [0, -44.6], [-13, -39.8]], '#f4f0e6', 0.35);
	},
	// Vampiress: a pale vampire woman with long black hair, pointed ears and gold eyes, a tall-collared violet cloak, a
	// white blouse under a dark laced bodice, a long dark skirt, magenta flames swirling in both hands
	325(P) {
		P.shadow(12, 4.5);
		const skin = '#e6dcd8', hair = '#2a2036', cloak = '#7a4aa8', dark = '#3a3248', magenta = '#ff3ad0';
		const flame = (x, y, sd) => {
			P.glow(x, y, 7, magenta, 0.55);
			P.shape((p) => { p.m(x - 3, y + 2); p.q(x - 4.4, y - 3, x - sd * 1, y - 5); p.q(x + sd * 1.6, y - 9, x + sd * 0.4, y - 12); p.q(x + sd * 4, y - 8, x + 3.4, y - 2); p.q(x + 3, y + 3.4, x, y + 3.4); p.q(x - 2, y + 3.4, x - 3, y + 2); }, '#e030c0', x - 4.4, x + 4.4, { alpha: 0.9 });
			P.circle(x, y, 2.4, '#ff8ae8', { line: false });
			P.dot(x - 0.6, y - 0.6, 0.9, '#fff0fc');
		};
		// the cloak behind, flaring to the ground
		P.shape((p) => { p.m(-6, -24); p.l(6, -24); p.q(10, -10, 12, 0); p.l(-12, 0); p.q(-10, -10, -6, -24); }, cloak, -12, 12);
		P.shape((p) => { p.m(-5, -22); p.l(5, -22); p.q(8, -10, 9, 0); p.l(-9, 0); p.q(-8, -10, -5, -22); }, shade(cloak, -0.45), -9, 9, { line: false });
		// long skirt and boots
		for (const x of [-2.6, 2.6]) { P.line([[x, -8], [x, -2]], dark, 3.4); P.ellipse(x + 0.6, -1.2, 2.4, 1.4, '#241e30'); }
		P.shape((p) => { p.m(-4.6, -14); p.l(4.6, -14); p.q(6.5, -6, 7, -3); p.l(1, -4.5); p.l(-1.5, -2.6); p.l(-7, -3); p.q(-6.5, -6, -4.6, -14); }, dark, -7, 7);
		P.thin([[0.5, -13], [1, -4]], magenta, 0.4);
		// bodice and blouse
		torso(P, -22, 5, -13, 4.2, '#4a4058');
		P.shape((p) => { p.m(-4.4, -22); p.l(4.4, -22); p.q(3, -19, 0, -18); p.q(-3, -19, -4.4, -22); }, '#efe4f2', -4.4, 4.4);
		for (const y of [-17, -15.4]) P.thin([[-1.4, y], [1.4, y - 0.8]], '#8a7a9a', 0.35);
		P.line([[-4.6, -13.6], [4.6, -13.6]], '#6a3a5a', 1);
		// arms reaching down and out, a flame in each hand
		for (const [sd, c] of [[-1, shade(skin, -0.06)], [1, skin]]) {
			taper(P, [[sd * 4.5, -21], [sd * 8, -16], [sd * 10, -12]], 3.2, 2.4, c);
			flame(sd * 12, -9.5, sd);
			P.circle(sd * 10.4, -11.4, 1.6, c);
		}
		// long black hair behind the head, falling to the shoulders
		P.shape((p) => { p.m(-6.6, -28); p.q(-7.6, -35.6, 0, -35.6); p.q(7.6, -35.6, 7, -28); p.q(7.4, -23, 6, -20.5); p.l(-6, -20.5); p.q(-7.4, -23, -6.6, -28); }, hair, -7.6, 7.6);
		// the tall pointed collar
		for (const sd of [-1, 1]) P.shape((p) => { p.m(sd * 3, -23); p.q(sd * 9, -25, sd * 10.5, -33); p.q(sd * 8, -29.6, sd * 6.6, -27.6); p.l(sd * 3.4, -25.5); }, cloak, sd < 0 ? -10.5 : 3, sd < 0 ? -3 : 10.5);
		// face: pointed ears, gold eyes, dark lips
		for (const sd of [-1, 1]) P.poly([[sd * 5, -29], [sd * 10, -32.5], [sd * 5.4, -26.4]], skin);
		head(P, -28.5, 6, skin);
		P.shape((p) => { p.m(-6.2, -27.6); p.q(-6.6, -35, 0.6, -34.8); p.q(6.6, -34.6, 6.4, -30); p.q(2, -33.4, -2.6, -31.6); p.q(-4.6, -30.4, -6.2, -27.6); }, hair, -6.6, 6.6);
		P.ellipse(-2.6, -26.4, 1.1, 0.6, rgba('#e87a9a', 0.45), { line: false }); P.ellipse(3.8, -26.4, 1.1, 0.6, rgba('#e87a9a', 0.45), { line: false });
		P.eyes(0.6, -28.6, 2.5, 1.45, '#c89a10');
		P.thin([[-3, -30.8], [-0.6, -30.4]], hair, 0.5); P.thin([[4.2, -30.8], [1.8, -30.4]], hair, 0.5);
		P.mouth(0.6, -24.8, 1, '#7a1a3a');
	},
	// Efreet reaper: a hulking ghostly blue cloud of a body trailing into a wisp, a horned skull for a head, dark armoured
	// shoulders with gold trim and blue gems, gauntleted hands gripping a bone scythe with a horned skull and an icy blade
	326(P) {
		P.shadow(11, 4, 1, 0.2);
		const blue = '#8ab0e8', armor = '#4a4a5a', gold = '#c9a24a', bone = '#e8e0cc', ice = '#5ad8f0';
		P.glow(0, -20, 18, '#7aa0ff', 0.2);
		// the wispy tail curling under it (no legs)
		P.shape((p) => { p.m(-5, -12); p.q(-6, -4, 0, -3); p.q(5, -2, 3, 1); p.q(9, -1, 7, -5); p.q(5, -8, 6, -12); }, shade(blue, -0.2), -6, 9);
		// the cloud body: billowing blue puffs
		for (const [x, y, r] of [[-10, -20, 5], [-7, -26, 6], [0, -28, 6.5], [7, -25, 6], [9, -17, 5], [-6, -14, 5.5], [3, -13, 5.5], [0, -20, 7]]) P.circle(x, y, r, blue);
		P.gloss(-8, -28, 2.4, 1.2, 0.45);
		// a dark armoured chest plate with a gold trim and a gem
		P.shape((p) => { p.m(-5, -24); p.l(5, -24); p.l(4, -15); p.l(-4, -15); }, armor, -5, 5);
		P.thin([[-5, -24], [5, -24]], gold, 0.6);
		P.poly([[0, -22], [1.4, -20], [0, -18], [-1.4, -20]], '#2a5ad8');
		// the bone scythe: a long bone shaft, a horned skull at the head and an icy curved blade hanging from it
		P.line([[-19, -9], [14, -22]], bone, 1.8);
		P.circle(-19.4, -8.8, 1.6, bone); P.circle(-18.4, -7.2, 1.4, bone);
		P.shape((p) => { p.m(15, -21); p.q(24, -18, 20, -2); p.q(19.5, -11, 13, -18); }, ice, 13, 24);
		P.thin([[16, -20], [20.4, -14], [20.2, -5]], '#e0faff', 0.4);
		taper(P, [[15, -26], [13.5, -30], [11, -31]], 1.6, 0.3, bone);
		taper(P, [[18, -26], [20, -30], [22, -30]], 1.6, 0.3, bone);
		skull(P, 16.5, -23.5, 3.2, bone);
		// gauntleted fists on the shaft, armoured forearms
		for (const [sx, sy, hx, hy] of [[-9, -22, -8, -13.4], [8, -24, 6.5, -18.6]]) {
			taper(P, [[sx, sy], [hx + (sx - hx) * 0.4, hy - 3], [hx, hy]], 4.4, 3.6, armor);
			P.thin([[hx - 1.6, hy - 2.4], [hx + 1.6, hy - 2.6]], gold, 0.5);
			P.circle(hx, hy, 2.4, shade(armor, 0.12));
		}
		// armoured shoulders with gold trim and blue gems
		for (const [x, c] of [[-9, armor], [9, shade(armor, -0.06)]]) {
			P.ellipse(x, -28, 5, 3.6, c);
			P.thin([[x - 4.6, -27], [x, -24.6], [x + 4.6, -27]], gold, 0.6);
			P.dot(x, -28.2, 1, '#3a6af0');
		}
		// the horned skull head, set into the shoulders
		for (const sd of [-1, 1]) taper(P, [[sd * 3.5, -36], [sd * 7, -38], [sd * 8, -43]], 2.4, 0.4, bone);
		skull(P, 0.6, -33, 5.6, bone, '#7af0ff');
	},
	// Emerelf assassin: a lean elf facing right in a deep green hood (a pointed ear poking out) over a shadowed face with
	// glowing green eyes, a leafy mantle, a long green coat with pointed tails over bare legs, green boots, two curved daggers
	327(P) {
		P.shadow(11, 4.5);
		const green = '#2f9a4a', light = '#5ac860', dark = '#1a5a2a', skin = '#e2d6bc', glow = '#6aff7a';
		const dagger = (x, y, sd) => {
			P.line([[x, y], [x - sd * 1.6, y + 1.2]], '#2a3a2a', 1);
			P.shape((p) => { p.m(x, y - 0.8); p.q(x + sd * 4, y - 3, x + sd * 7, y - 1); p.q(x + sd * 4, y - 1.2, x + 0.4 * sd, y + 0.8); }, '#c8ecd0', Math.min(x, x + sd * 7), Math.max(x, x + sd * 7));
		};
		// bare legs in a wide stance, green boots
		for (const [hx, fx, c] of [[-3, -7, shade(skin, -0.06)], [3, 7, skin]]) {
			taper(P, [[hx, -12], [fx, -4]], 3.4, 3, c);
			taper(P, [[hx + (fx - hx) * 0.5, -8], [fx + Math.sign(fx) * 0.4, -2]], 3.8, 3.6, dark);
			P.ellipse(fx + 1, -1.3, 3, 1.4, dark);
		}
		// the long coat with pointed tails
		P.shape((p) => { p.m(-5.5, -23); p.l(5.5, -23); p.q(7, -15, 7, -11); p.l(9.5, -3); p.l(4, -9); p.l(-4, -9); p.l(-11, -2); p.q(-7, -10, -5.5, -23); }, green, -11, 9.5);
		P.thin([[0.5, -22], [0.5, -10]], light, 0.4);
		P.line([[-5.4, -13], [5.6, -13]], dark, 1);
		// far arm with a dagger held out
		taper(P, [[5, -21], [10, -17], [13, -18.5]], 2.8, 2.2, skin);
		P.circle(13.2, -18.6, 1.6, skin);
		dagger(13.6, -18.8, 1);
		// the leafy mantle over the shoulders
		for (const [x, y, a] of [[-6, -22, 2.6], [-5, -25, 2.9], [-3, -26, 2.2], [5, -23, 0.4], [6, -21, 0.7], [-6.5, -19, 2.4], [-4, -23.5, 2]]) {
			const dx = Math.cos(a) * 5.5, dy = -Math.sin(a) * 3.5;
			P.shape((p) => { p.m(x, y); p.q(x + dx * 0.5 - 1, y + dy * 0.5 - 1.6, x + dx, y + dy); p.q(x + dx * 0.5 + 1, y + dy * 0.5 + 1.6, x, y); }, light, x - 6, x + 6);
		}
		P.shape((p) => { p.m(-8, -25); p.q(0, -28, 8, -24); p.q(6, -19, 0, -18.5); p.q(-6, -19, -8, -25); }, light, -8, 8);
		// the hood, peaked at the back, a dark face inside with glowing eyes
		P.shape((p) => { p.m(-8, -23); p.q(-10, -33, -6, -38); p.l(-7, -45); p.q(3, -42, 7, -36); p.q(10, -31, 8.4, -24); p.q(0, -20, -8, -23); }, green, -10, 10);
		P.poly([[-3, -37], [-10, -41], [-5, -34.6]], skin);
		P.shape((p) => { p.m(-3.6, -24); p.q(-4.4, -34, 2.6, -34.4); p.q(8, -33.6, 7.4, -25.6); p.q(2, -22, -3.6, -24); }, '#0e2a14', -4.4, 8, { line: false });
		P.thin([[-6.4, -37], [-7.6, -30], [-6, -24]], light, 0.45);
		P.glowEyes(2.4, -29, 2.2, 0.75, glow);
		P.gloss(-6, -33, 1.2, 2.4, 0.3);
		// near arm: a dagger held reversed low in front
		taper(P, [[-4, -21], [-2, -15], [3, -13]], 3, 2.4, skin);
		P.circle(3.8, -12.8, 1.7, skin);
		dagger(4.4, -12.6, 1);
	},
	// Emerelf guard: an elf in pointed green leaf-plate armour, a green hood over a pale grey-green face with a pointed
	// ear, a pale curved sword held low and a tall dark green kite shield
	328(P) {
		P.shadow(11, 4.5);
		const green = '#2a8a48', light = '#4ab868', dark = '#164a28', skin = '#b8cab8';
		// tall kite shield on the far side, behind
		P.shape((p) => { p.m(5, -28); p.q(11, -30, 16, -27); p.q(16.5, -12, 10, -2); p.q(4.6, -12, 5, -28); }, dark, 4.6, 16.5);
		P.thin([[10.6, -28], [10.2, -4]], light, 0.5);
		P.gloss(7.4, -24, 1, 2.2, 0.3);
		// armoured legs and pointed sabatons
		for (const [x, c] of [[-3, shade(green, -0.1)], [3, green]]) {
			taper(P, [[x, -12], [x * 1.4, -2.5]], 4, 3.4, c);
			P.poly([[x * 1.4 - 2.4, -3], [x * 1.4 + 4, -1.6], [x * 1.4 - 2.4, -0.2]], dark);
			P.poly([[x - 2.2, -8], [x + 2.2, -8], [x, -11]], light);
		}
		// leaf-plate body: overlapping pointed plates, a tasset skirt
		P.shape((p) => { p.m(-6, -23); p.l(6, -23); p.q(7, -15, 6, -11); p.l(4, -6); p.l(1.5, -10); p.l(-1, -5.6); p.l(-3.4, -10); p.l(-6.4, -6); p.q(-7, -15, -6, -23); }, green, -7, 7);
		for (const y of [-20, -16.5]) P.thin([[-5, y], [0, y + 2.4], [5, y]], light, 0.5);
		P.poly([[0, -22], [1.4, -20], [0, -18], [-1.4, -20]], '#8aa8b8');
		// pointed leaf pauldrons
		for (const sd of [-1, 1]) P.shape((p) => { p.m(sd * 3, -24); p.q(sd * 9, -26, sd * 12, -22); p.l(sd * 8.4, -21.6); p.l(sd * 9.6, -18.6); p.q(sd * 6, -19, sd * 4, -21); }, sd < 0 ? light : green, sd < 0 ? -12 : 3, sd < 0 ? -3 : 12);
		// far arm to the shield grip
		taper(P, [[7, -21], [9, -16], [8.5, -13]], 3, 2.6, green);
		P.circle(8.6, -12.6, 1.6, skin);
		// the hood and face
		P.shape((p) => { p.m(-7.5, -24); p.q(-9.5, -33, -5, -37.5); p.l(-4, -43.5); p.q(4, -40.5, 7, -35.5); p.q(9.4, -30, 7.6, -24.4); p.q(0, -21.6, -7.5, -24); }, green, -9.5, 9.4);
		P.poly([[-3.5, -32.6], [-10.5, -36.5], [-5, -29.4]], skin);
		P.ellipse(1.6, -28.6, 5.2, 5.6, skin);
		P.shape((p) => { p.m(-4, -31); p.q(-2.6, -36.6, 3, -36); p.q(8, -35, 7.2, -30.4); p.q(2, -34, -4, -31); }, light, -4, 8);
		P.eyes(2.4, -28.6, 2.3, 1.35, '#1a5a2a');
		P.thin([[-0.6, -30.8], [1.4, -30.2]], dark, 0.5); P.thin([[5.4, -30.8], [3.4, -30.2]], dark, 0.5);
		P.mouth(2.4, -25.2, 0.9, '#4a5a4a');
		// near arm and the curved sword held low across the front
		taper(P, [[-7, -21], [-9, -15], [-6, -11.5]], 3, 2.6, green);
		P.circle(-5.6, -11.4, 1.7, skin);
		P.line([[-7.6, -12.6], [-4, -10.2]], '#c9a24a', 0.7);
		P.shape((p) => { p.m(-5, -11); p.q(4, -8, 11, 1); p.q(4, -5, -6, -9.6); }, '#dff0e0', -6, 11);
		P.thin([[-4, -10.4], [3.6, -7], [9.6, 0]], '#9ab8a0', 0.3);
	},
	// Emerelf ranger: a slim olive-skinned elf facing right with wild dark green hair and long pointed ears, a leafy
	// cape and top, dark green leggings, a quiver of yellow-fletched arrows on her back and a long bow held out in front
	329(P) {
		P.shadow(11, 4.5);
		const skin = '#b8c070', hair = '#2a5a2a', leaf = '#4aa050', dark = '#1e3a2a', wood = '#b07a3a';
		// quiver on the back with yellow fletchings
		P.shape((p) => { p.m(-9, -30); p.l(-6, -31.6); p.l(-2, -14); p.l(-5, -13); }, '#6a4a2a', -9, -2);
		for (const [x, y] of [[-10.6, -33.6], [-8.6, -35], [-6.6, -34.2]]) { P.line([[x + 1.4, y + 3], [x, y]], '#d8c070', 0.5); P.poly([[x - 1, y + 0.8], [x - 0.2, y - 1.8], [x + 1, y + 0.4]], '#f2d23a'); }
		// legs in leggings and soft boots
		for (const [hx, fx, c] of [[-2.6, -4, shade(dark, 0.1)], [2.6, 5, shade(dark, 0.2)]]) {
			taper(P, [[hx, -12], [fx, -2.5]], 3.4, 2.8, c);
			P.ellipse(fx + 1, -1.3, 2.8, 1.3, '#5a7a3a');
		}
		// slim body: leaf top and a ragged leaf skirt
		torso(P, -21, 4.4, -12, 4, skin);
		P.shape((p) => { p.m(-4.6, -21); p.l(4.6, -21); p.l(4.2, -16); p.q(0, -14.6, -4.2, -16); }, leaf, -4.6, 4.6);
		P.shape((p) => { p.m(-4.4, -13); p.l(4.4, -13); p.l(6, -7); p.l(3, -9); p.l(1, -6); p.l(-1.6, -9); p.l(-4, -6.4); p.l(-6, -8); }, leaf, -6, 6);
		// the leafy cape over the shoulders
		P.shape((p) => { p.m(-6, -24); p.q(0, -26, 7, -23); p.l(8, -19); p.l(5, -20.6); p.l(2, -18); p.l(-1, -20.6); p.l(-4.6, -18.4); p.l(-7.6, -20.6); }, shade(leaf, 0.1), -7.6, 8);
		// the bow held out in front, the arrow nocked, the near arm drawing
		taper(P, [[4.5, -21], [9, -18], [12.4, -17]], 2.6, 2.2, skin);
		P.shape((p) => { p.m(13, -36); p.q(19.4, -18, 12, -1); p.q(17.6, -18, 13, -36); }, wood, 12, 19.4);
		P.thin([[13, -36], [6, -17], [12, -1]], '#e8e0c8', 0.3);
		P.line([[3, -17.2], [19, -17.2]], '#d8c070', 0.45);
		P.poly([[19, -18.2], [21.4, -17.2], [19, -16.2]], '#c8ccd2');
		P.circle(13.4, -17.2, 1.6, skin);
		taper(P, [[-4, -21], [0, -17.6], [5, -17.4]], 2.6, 2.2, shade(skin, -0.05));
		P.circle(5.4, -17.4, 1.5, skin);
		// the head: wild dark green hair streaming back, long ears, a calm face
		for (const pts of [[[-2, -34], [-7, -40], [-12, -40]], [[-4, -32], [-10, -35], [-14, -32]], [[-5, -29], [-10, -29], [-13, -25]], [[0, -35], [-3, -41], [-8, -44]], [[-5, -26], [-8, -23], [-10, -19]]]) taper(P, pts, 3.4, 0.5, hair);
		P.circle(-1.4, -30.4, 6, hair);
		for (const sd of [-1, 1]) P.poly([[sd * 5, -30], [sd * 11, -34.4], [sd * 5.6, -27]], skin);
		head(P, -29, 6, skin);
		P.shape((p) => { p.m(-6.2, -29); p.q(-6, -36, 0.8, -36); p.q(6, -36, 6.4, -31.4); p.q(2, -34.6, -2, -32); p.q(-4, -32, -6.2, -29); }, hair, -6.2, 6.4);
		P.eyes(1.6, -28.8, 2.3, 1.35, '#3a5a1a');
		P.thin([[-1, -31], [1, -30.6]], hair, 0.45); P.thin([[4.6, -31], [2.6, -30.6]], hair, 0.45);
		P.mouth(1.8, -25.2, 0.9, '#6a3a2a');
	},
	// Emerelf sorcerer: a tall robed elf in a deep green hood (a pointed ear poking out) over a shadowed face with glowing
	// green eyes, a leafy mantle, a long green robe with a sash, a pale hand on a tall wooden staff crowned with a green orb
	330(P) {
		P.shadow(11, 4.5);
		const green = '#2f9a4a', light = '#5ac860', dark = '#1a5a2a', skin = '#c8d2b8', wood = '#a08a6a';
		// the staff, upright on the right, an orb held in a claw at the top
		P.line([[13, 0], [13, -38]], wood, 1.3);
		P.glow(13, -41.5, 6, '#6aff7a', 0.45);
		P.circle(13, -41.5, 3, '#2ab84a');
		P.dot(12, -42.6, 0.9, '#e8ffe8');
		for (const sd of [-1, 1]) taper(P, [[13, -37.6], [13 + sd * 2.6, -39.4], [13 + sd * 2.2, -42.4]], 1, 0.3, wood);
		// long robe to the ground, pointed panels
		P.shape((p) => { p.m(-6, -23); p.l(6, -23); p.q(9, -12, 10, -1); p.l(5, -3); p.l(0.6, 0.4); p.l(-4, -3); p.l(-10, -1); p.q(-9, -12, -6, -23); }, green, -10, 10);
		P.shape((p) => { p.m(-1, -18); p.l(2.6, -18); p.l(4, -3); p.l(0.8, 0); p.l(-2.4, -3); }, light, -2.4, 4);
		P.line([[-6.6, -16], [7, -16]], light, 1.4);
		for (const x of [-4, -7]) P.ellipse(x + 1, -1.4, 2.6, 1.3, dark);
		// far arm, sleeved, a pale hand on the staff
		taper(P, [[5, -21], [9, -18], [11.4, -20]], 3.2, 2.6, shade(green, -0.1));
		P.ellipse(13, -20.4, 1.8, 2.1, skin);
		// leafy mantle
		for (const [x, y, a] of [[-5.5, -22, 2.6], [-4.5, -25, 2.9], [-3, -26, 2.3], [5.5, -22.5, 0.5], [-6.5, -19, 2.4], [-4, -23.5, 2]]) {
			const dx = Math.cos(a) * 5.5, dy = -Math.sin(a) * 3.5;
			P.shape((p) => { p.m(x, y); p.q(x + dx * 0.5 - 1, y + dy * 0.5 - 1.6, x + dx, y + dy); p.q(x + dx * 0.5 + 1, y + dy * 0.5 + 1.6, x, y); }, light, x - 6, x + 6);
		}
		// near arm, a pale clawed hand hanging
		taper(P, [[-5, -21], [-8, -15], [-7.4, -11]], 3.4, 2.8, green);
		P.ellipse(-7.2, -10, 1.8, 2, skin);
		// the hood with a shadowed face and glowing eyes
		P.shape((p) => { p.m(-8, -23); p.q(-10, -33, -6, -38); p.l(-6.5, -45); p.q(3, -42, 7, -36); p.q(10, -31, 8.4, -24); p.q(0, -20, -8, -23); }, green, -10, 10);
		P.poly([[-3, -37], [-10, -40.6], [-5, -34.6]], skin);
		P.shape((p) => { p.m(-3.6, -24); p.q(-4.4, -34, 2.6, -34.4); p.q(8, -33.6, 7.4, -25.6); p.q(2, -22, -3.6, -24); }, '#0e2a14', -4.4, 8, { line: false });
		P.thin([[-6.4, -37], [-7.6, -30], [-6, -24]], light, 0.45);
		P.glowEyes(2.4, -29, 2.2, 0.75, '#6aff7a');
		P.gloss(-6, -33, 1.2, 2.4, 0.3);
	},
	// Emerelf nymph: a floating yellow-green dryad facing right, a huge cloud of curly mossy hair streaming out behind her,
	// long pointed ears, a leaf dress, leafy tendrils trailing from her arms and legs tucked up as she hovers
	331(P) {
		P.shadow(9, 3, 1, 0.18);
		const skin = '#d8e08a', hair = '#6a9a2a', leaf = '#7ab83a', dark = '#3a6a1a';
		// the mass of curly hair behind her: a billowing cloud with curling locks trailing off to the left
		for (const pts of [[[-10, -36], [-16, -40], [-20, -37], [-18, -34]], [[-12, -26], [-19, -24], [-21, -19], [-18, -18]], [[-9, -16], [-13, -10], [-11, -5], [-9, -7]], [[-4, -38], [-8, -44], [-12, -44]]]) taper(P, pts, 3.4, 0.8, shade(hair, -0.1));
		const cloud = [];
		for (let i = 0; i < 26; i++) {
			const a = i / 26 * Math.PI * 2, r = (i % 2 ? 1 : 0.86);
			cloud.push([-6 + Math.cos(a) * 9.5 * r, -27 + Math.sin(a) * 12.5 * r]);
		}
		P.poly(cloud, hair);
		for (const [x, y] of [[-9, -34], [-12, -27], [-10, -20], [-5, -31], [-13, -22], [-7, -24], [-4, -18]]) P.thin([[x - 1.6, y + 0.4], [x - 0.6, y - 1.2], [x + 0.8, y - 0.8], [x + 0.6, y + 0.8], [x - 0.4, y + 0.6]], dark, 0.45);
		P.gloss(-8, -35, 2.4, 1.1, 0.35);
		// legs tucked up, floating, toes pointed
		taper(P, [[-1, -12], [-5, -7], [-2, -2]], 3.8, 2.4, shade(skin, -0.1));
		taper(P, [[2.5, -12], [6, -8], [4.5, -3]], 3.8, 2.4, skin);
		// slim body in a leaf dress
		torso(P, -21, 3.8, -12, 4.6, skin);
		P.shape((p) => { p.m(-3.6, -20); p.q(-1, -18, 0.5, -20.5); p.q(2, -18, 4, -20); p.l(4.8, -12); p.l(6, -6); p.l(2.6, -9); p.l(0.4, -5); p.l(-1.6, -9.4); p.l(-5.4, -7); p.l(-4.6, -12); }, leaf, -5.4, 6);
		P.thin([[0.5, -19.6], [0.4, -8]], dark, 0.4);
		// arms: one trailing, one reaching forward, leafy tendrils from the wrists
		taper(P, [[-3, -20], [-6, -15], [-9, -12]], 2.6, 2, shade(skin, -0.06));
		taper(P, [[-9, -12], [-11, -9], [-10, -5]], 1.6, 0.4, leaf);
		taper(P, [[3.5, -20], [8, -18], [11, -20]], 2.6, 2, skin);
		taper(P, [[11, -20], [14, -18], [15, -14]], 1.6, 0.4, leaf);
		P.circle(11, -20.2, 1.3, skin);
		// head: long ears, big green-gold eyes, a swept fringe of curls
		for (const sd of [-1, 1]) P.poly([[sd * 4.4 + 1.5, -31], [sd * 9.6 + 1.5, -35], [sd * 5 + 1.5, -28]], skin);
		head(P, -29, 6, skin, 1.5);
		P.shape((p) => { p.m(-4.6, -28); p.q(-5.4, -35.6, 1.5, -35.4); p.q(6.6, -35.4, 7.4, -31.6); p.q(4.6, -33.6, 1.4, -32.8); p.q(-1.6, -32, -4.6, -28); }, hair, -5.4, 7.4);
		P.eyes(2.6, -28.6, 2.3, 1.4, '#6a7a10');
		P.mouth(2.8, -25, 0.8, '#7a5a2a');
	},
	// Wood golem: a hulking golem of ochre wood, a carved stump of a head set into massive shoulders with hollow eyes and a
	// jagged mouth, twigs sprouting from its crown and shoulders, huge clenched fists and red-brown root legs
	332(P) {
		P.shadow(16, 5.5);
		const wood = '#d8a040', dark = '#9a6a24', root = '#a8582a', twig = '#b08a3a';
		// root legs flaring into roots at the ground
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 5, -12], [sd * 6, -5], [sd * 7, -1.5]], 6.4, 5.4, sd < 0 ? shade(root, -0.08) : root);
			for (const t of [-1, 0, 1]) taper(P, [[sd * 7 + t * 1.6, -2], [sd * 7 + t * 4, -0.2]], 2, 0.5, shade(root, -0.12));
		}
		// twigs sprouting from the crown and shoulders
		for (const [x, y, tx, ty] of [[-4, -36, -6.4, -40.4], [0, -37, 0.6, -41.6], [4, -36, 6.6, -40], [-12, -29, -15, -31.6], [12, -29, 15, -31.6]]) {
			taper(P, [[x, y], [tx, ty]], 1.6, 0.5, twig);
			for (const [t, s] of [[0.55, -1], [0.8, 1], [1, 0]]) { const lx = x + (tx - x) * t, ly = y + (ty - y) * t; P.ellipse(lx + s * 1.4, ly - 0.6, 1.8, 1, '#a0a838', { rot: s * 0.7 }); }
		}
		// the body: massive shoulders, the stump head rising out of them, a narrower waist
		P.shape((p) => { p.m(-6, -10); p.q(-10, -16, -11, -22); p.q(-15, -24, -13, -29); p.q(-9, -32, -6, -30); p.q(-6.5, -37, 0, -37.5); p.q(6.5, -37, 6, -30); p.q(9, -32, 13, -29); p.q(15, -24, 11, -22); p.q(10, -16, 6, -10); p.q(0, -8, -6, -10); }, wood, -15, 15);
		for (const [x0, y0, x1, y1] of [[-8, -26, -4, -18], [7, -26, 9, -18], [-2, -16, 2, -11], [-10, -22, -8, -15], [3, -18, 6, -14]]) P.thin([[x0, y0], [x1, y1]], dark, 0.5);
		P.gloss(-9, -28, 2, 1, 0.35);
		for (const x of [-4.4, -1.4, 1.6, 4.4]) P.thin([[x, -36], [x + 0.3, -23]], dark, 0.35);
		P.thin([[-6, -30], [-11, -26.6]], dark, 0.5); P.thin([[6, -30], [11, -26.6]], dark, 0.5);
		// carved face: hollow eyes, a jagged mouth
		for (const x of [-2.4, 2.4]) P.ellipse(x, -31, 1.4, 1.8, '#3a1a0a', { line: false });
		P.shape((p) => { p.m(-4, -26.4); p.l(-2.6, -27.8); p.l(-1.2, -26.6); p.l(0.2, -28); p.l(1.6, -26.6); p.l(3, -27.8); p.l(4, -26.4); p.l(3, -24.4); p.l(1.6, -25.4); p.l(0, -24.2); p.l(-1.6, -25.4); p.l(-3, -24.4); }, '#3a1a0a', -4, 4, { line: false });
		P.thin([[-4, -33.6], [-1, -33]], dark, 0.5); P.thin([[4, -33.6], [1, -33]], dark, 0.5);
		// huge arms with clenched fists hanging in front
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(wood, -0.06) : wood;
			taper(P, [[sd * 11, -26], [sd * 15, -18], [sd * 11, -12]], 7, 6, c);
			P.shape((p) => { p.m(sd * 7, -14); p.q(sd * 6, -8, sd * 9, -6); p.q(sd * 14, -5, sd * 15, -9); p.q(sd * 15.6, -14, sd * 11, -15); p.q(sd * 8, -15.4, sd * 7, -14); }, c, sd < 0 ? -15.6 : 6, sd < 0 ? -6 : 15.6);
			for (const k of [0, 1, 2]) P.thin([[sd * (8.6 + k * 1.8), -9.4], [sd * (8.6 + k * 1.8), -6.6]], dark, 0.45);
		}
	},
	// Lychen golem: a hulking golem of rounded grey-green stone blocks facing right, hunched, its back and shoulders
	// overgrown with bright moss and leaves, a small head thrust forward with glowing green eyes and a beaked brow, long
	// arms of stacked stones reaching down to the ground
	333(P) {
		P.shadow(17, 5.5);
		const stone = '#a8bcae', dark = '#6a8070', moss = '#6ad040', leaf = '#9ae860';
		const rock = (x, y, rx, ry, c = stone, k = 0) => {
			const pts = [];
			for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + k, rr = 0.86 + 0.16 * Math.sin(i * 2.3 + k * 3); pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr]); }
			P.poly(pts, c);
			P.gloss(x - rx * 0.35, y - ry * 0.4, rx * 0.25, ry * 0.14, 0.3);
		};
		const leafAt = (x, y, len, a) => {
			const dx = Math.cos(a) * len, dy = -Math.sin(a) * len;
			P.shape((p) => { p.m(x, y); p.q(x + dx * 0.5 - dy * 0.35, y + dy * 0.5 + dx * 0.35, x + dx, y + dy); p.q(x + dx * 0.5 + dy * 0.35, y + dy * 0.5 - dx * 0.35, x, y); }, leaf, x - len, x + len);
		};
		// far arm: stacked stones down to the ground
		taper(P, [[-9, -26], [-15, -18], [-15, -4]], 6, 5, shade(stone, -0.2));
		rock(-14.6, -18, 4.2, 5, shade(stone, -0.16), 1); rock(-15, -5, 4, 3.8, shade(stone, -0.16), 2);
		// stocky legs
		for (const [x, c, k] of [[-5, shade(stone, -0.12), 3], [4.5, shade(stone, -0.04), 4]]) { taper(P, [[x, -14], [x, -3]], 6.4, 6, c); rock(x + 0.6, -3.4, 4.2, 3.4, c, k); }
		// the hunched body: a mass of big stones
		P.shape((p) => { p.m(-8, -12); p.q(-14, -20, -12, -28); p.q(-8, -34, 1, -33); p.q(9, -32, 11, -25); p.q(11, -16, 6, -12); p.q(-1, -9.6, -8, -12); }, stone, -14, 11);
		for (const [x, y, rx, ry, k] of [[-7, -16, 5, 4, 1], [3, -15, 5, 4, 2], [-1, -23, 6, 5, 3], [-9, -25, 4.4, 5, 4]]) rock(x, y, rx, ry, shade(stone, 0.04), k);
		// moss over the back and shoulders, leaves sprouting from it
		for (const [x, y, len, a] of [[-10, -31, 5, 2.3], [-7, -34, 5.4, 1.9], [-3, -35, 5, 1.5], [1, -34.6, 4.6, 1.1], [-12, -28, 4.4, 2.8], [-13, -24, 4, 3.2], [4, -33, 4, 0.8]]) leafAt(x, y, len, a);
		P.shape((p) => { p.m(-13, -24); p.q(-14, -33, -4, -35); p.q(4, -36, 7, -30); p.q(3, -29.6, 0, -30.6); p.q(-3, -28, -6, -30); p.q(-8, -27, -9.6, -28); p.q(-11, -24, -13, -24); }, moss, -14, 7);
		for (const [x, y] of [[-10, -29], [-5, -32], [1, -32.4]]) P.dot(x, y, 0.8, shade(moss, 0.35));
		// the near arm: a big shoulder stone, stacked stones down to a heavy fist on the ground, moss streaking it
		taper(P, [[7, -25], [13, -17], [14, -4]], 6.4, 5.4, shade(stone, -0.06));
		rock(9, -25, 5, 4.6, stone, 5);
		rock(13, -16, 4.4, 5, stone, 6);
		rock(14.4, -4.4, 4.6, 4, shade(stone, 0.06), 7);
		P.thin([[12.4, -13], [13.6, -9], [14, -6.6]], moss, 1.3);
		for (const k of [-1, 0, 1]) P.thin([[14.4 + k * 1.6, -2.6], [14.4 + k * 1.6, -1]], dark, 0.5);
		// the small head thrust forward from the shoulders: a stony brow coming to a beak, glowing green eyes
		P.shape((p) => { p.m(4, -28); p.q(6, -33, 11, -32); p.q(15, -31, 16, -27); p.q(16, -24, 14, -21); p.q(13, -24, 12, -24); p.q(8, -21.4, 5, -23.6); p.q(3.4, -26, 4, -28); }, shade(stone, 0.08), 3.4, 16);
		P.thin([[6.6, -28.6], [11, -27.4], [14.6, -27.6]], dark, 0.7);
		P.glowEyes(9.8, -26.2, 2, 0.75, '#5aff5a');
		P.gloss(8, -31, 1.6, 0.7, 0.4);
	},
	// Brimstone golem (mini-boss): a hulking golem of dark violet rock with no head, a burning red heart of flame in the
	// top of its chest holding a dark skull with red eyes, a molten drip below it, huge rocky arms and blocky legs
	334(P) {
		P.shadow(16, 6);
		const rock = '#5a4a62', dark = '#3a2e42', fire = '#e81a1a';
		const boulder = (x, y, rx, ry, c = rock, k = 0) => {
			const pts = [];
			for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + k, rr = 0.85 + 0.18 * Math.sin(i * 2.3 + k * 3); pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr]); }
			P.poly(pts, c);
			P.gloss(x - rx * 0.35, y - ry * 0.4, rx * 0.25, ry * 0.14, 0.25);
		};
		// blocky legs, rooted in the body
		for (const sd of [-1, 1]) taper(P, [[sd * 5, -14], [sd * 6.5, -5]], 8, 8, shade(rock, -0.15));
		for (const sd of [-1, 1]) boulder(sd * 6.5, -6, 5.4, 6, sd < 0 ? shade(rock, -0.1) : rock, sd);
		// the body: a craggy mass
		boulder(0, -22, 12, 11, rock, 0.3);
		for (const [x, y, rx, ry, k] of [[-8, -30, 6, 5, 1], [8, -30, 6, 5, 2], [0, -33, 5, 4, 3], [-5, -14, 5, 4, 4], [5, -14, 5, 4, 5]]) boulder(x, y, rx, ry, rock, k);
		for (const [a, b] of [[[-9, -24], [-4, -20]], [[6, -22], [10, -18]], [[-2, -14], [2, -12]]]) P.thin([a, b], dark, 0.5);
		// the burning heart: red flame licking up, a dark skull with red eyes inside, a molten drip below
		P.glow(1, -27, 10, '#ff3020', 0.55);
		P.shape((p) => { p.m(-4, -22); p.q(-6.5, -29, -2, -33); p.q(-2, -38, 1, -41); p.q(0, -37, 3.4, -34); p.q(6.6, -30, 5, -24); p.q(3, -20.5, 0, -21); p.q(-2.6, -21, -4, -22); }, fire, -6.5, 6.6);
		skull(P, 0.6, -27.6, 3.4, '#4a4048');
		for (const x of [-0.7, 1.9]) { P.glow(x, -27.4, 1.6, '#ff2020', 0.8); P.dot(x, -27.4, 0.6, '#ff6a5a'); }
		P.shape((p) => { p.m(-0.6, -21); p.q(1.6, -18, 1, -15); p.q(-0.6, -17, -1.6, -18); }, fire, -1.6, 1.6);
		P.poly([[0.2, -18.6], [0.8, -17], [0.1, -16]], '#f0f0f8', { line: false });
		// huge rocky arms hanging, boulder fists
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(rock, -0.04) : shade(rock, -0.1);
			taper(P, [[sd * 10, -28], [sd * 16, -18], [sd * 17, -8]], 7, 7, shade(rock, -0.2));
			boulder(sd * 14, -26, 5, 5.4, c, sd + 2);
			boulder(sd * 16.5, -17, 4.6, 5.6, c, sd + 3);
			boulder(sd * 17, -8, 5.4, 4.4, c, sd + 4);
			for (const k of [-1, 0, 1]) P.thin([[sd * (17 + k * 1.6), -6], [sd * (17 + k * 1.6), -4]], dark, 0.5);
		}
	},
	// Emerald dragon (boss): a green dragon on all fours facing right, a great translucent wing raised high behind, a cream
	// belly, a spiky frilled head with a yellow eye and a toothy jaw, a long tail curling up with a frilled tip
	335(P) {
		P.shadow(19, 6);
		const green = '#6ab83a', dark = '#3a7a2a', belly = '#e6ecb8', wing = '#8ad050', frill = '#c8e8a0';
		// tail curling up behind
		taper(P, [[-8, -10], [-17, -4], [-21, -12], [-17, -20]], 4.6, 1.4, dark);
		for (const [x, y, a] of [[-19, -18, 2.4], [-21, -14, 3], [-18.6, -21, 1.9]]) P.poly([[x, y], [x + Math.cos(a) * 3.6, y - Math.sin(a) * 3.6], [x + 1.2, y - 0.6]], frill);
		// far legs
		for (const [x, c] of [[-10, shade(green, -0.2)], [7, shade(green, -0.2)]]) { taper(P, [[x, -11], [x - 3, -6], [x - 1, -1.5]], 4.4, 2.6, c); P.ellipse(x - 0.2, -1.2, 2.6, 1.1, c); }
		// the great wing raised behind
		P.shape((p) => { p.m(-2, -20); p.q(-4, -32, 2, -45); p.q(-6, -42, -12, -43); p.q(-12, -38, -16, -36); p.q(-15, -31, -18, -27); p.q(-13, -24, -12, -18); p.q(-7, -21, -2, -20); }, wing, -18, 2, { alpha: 0.95 });
		for (const [x, y] of [[-12, -43], [-16, -36], [-18, -27]]) P.thin([[-2, -21], [x, y]], dark, 0.5);
		taper(P, [[-2, -20], [-2, -32], [2, -45]], 2.2, 0.8, dark);
		for (const [x, y] of [[-7, -38], [-11, -33], [-12, -26]]) P.dot(x, y, 1.6, shade(wing, -0.15));
		// the body with the cream belly
		P.shape((p) => { p.m(-12, -12); p.q(-13, -22, -2, -22); p.q(8, -22, 11, -17); p.q(12, -9, 6, -7.6); p.q(-4, -6, -12, -12); }, green, -13, 12);
		P.shape((p) => { p.m(-6, -8); p.q(2, -6.4, 7, -8.4); p.q(11, -11, 10, -16); p.q(4, -12, -6, -8); }, belly, -6, 11, { line: false });
		for (const x of [-2, 2, 6]) P.thin([[x, -8], [x + 1.4, -11.6]], shade(belly, -0.3), 0.35);
		for (const [x, y] of [[-10, -19], [-6, -21.6], [-2, -22.4], [2, -22.2]]) P.poly([[x - 1.2, y + 0.6], [x - 0.4, y - 3], [x + 1.4, y + 0.4]], frill);
		P.gloss(-5, -19, 2.6, 1.1, 0.4);
		// near legs, clawed
		for (const [x, c] of [[-5, green], [9.5, green]]) {
			P.ellipse(x - 0.6, -12, 4.4, 4.6, c);
			taper(P, [[x, -11], [x + 2.4, -6.4], [x + 0.6, -1.5]], 4.4, 3, c);
			P.ellipse(x + 1.4, -1.2, 3, 1.2, shade(c, -0.1));
			for (const k of [0, 1, 2]) P.poly([[x + 2.4 + k * 1.1, -1], [x + 3.4 + k * 1.1, -0.6], [x + 2.6 + k * 1.1, 0.2]], '#f2ecda', { line: false });
		}
		// the neck rising to the head, the frilled spiky head with a toothy jaw
		taper(P, [[7, -16], [10, -24], [13, -29]], 7, 5, green);
		taper(P, [[9.6, -14], [12, -22], [14.6, -26]], 3, 2, belly, { line: false });
		for (const [x, y, tx, ty] of [[12, -32, 4, -42], [10.6, -31, 4.6, -36], [10, -29, 5, -30], [14, -33, 13, -42]]) taper(P, [[x, y], [tx, ty]], 2.4, 0.3, frill);
		P.shape((p) => { p.m(10, -33); p.q(16, -35.5, 23, -30.5); p.q(24, -28.6, 22.5, -28); p.l(14, -27); p.q(9.6, -27.6, 10, -33); }, green, 9.6, 24);
		P.shape((p) => { p.m(12, -27); p.l(21.6, -27.6); p.q(19, -23.4, 14, -24); p.q(11.6, -24.6, 12, -27); }, green, 11.6, 21.6);
		for (const x of [15, 17.2, 19.4]) P.poly([[x - 0.45, -27.6], [x + 0.45, -27.6], [x, -26.2]], '#fff8e8', { line: false });
		P.thin([[13, -31.6], [17, -31]], dark, 0.6);
		P.ellipse(14.6, -30.2, 1.4, 1.1, '#fff2a0');
		P.dot(14.9, -30.2, 0.6, '#2a2a08');
		P.dot(22, -30.2, 0.4, dark);
		P.gloss(13, -33.4, 1.6, 0.6, 0.45);
	},
	// Zomphibian: a gangly undead frog-man facing right, rotting green skin, a leather cap, bulging eyes and a gaping mouth,
	// a leather strap across the chest, a ragged brown loincloth, wrapped shins and a flail (an iron ball on a chain)
	336(P) {
		P.shadow(12, 4.5);
		const skin = '#8ab04a', rot = '#b0603a', leather = '#7a4a2a', iron = '#4a4a50';
		// legs bowed, wrapped shins, splayed webbed feet
		for (const [hx, kx, fx, c] of [[-3, -6, -9.5, shade(skin, -0.1)], [3, 7, 7.5, skin]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 3.4, 2.6, c);
			P.thin([[kx + (fx - kx) * 0.4 - 1.5, -5], [kx + (fx - kx) * 0.4 + 1.5, -5.4]], leather, 1);
			P.shape((p) => { p.m(fx - 2, -2.4); p.l(fx + 3, -2.2); p.l(fx + 3.6, -0.4); p.l(fx + 1.6, -0.8); p.l(fx + 0.6, 0.2); p.l(fx - 1, -0.6); p.l(fx - 2.6, -0.2); }, c, fx - 2.6, fx + 3.6);
		}
		// far arm hanging, long fingers curled
		taper(P, [[5, -20], [10, -15], [11.5, -10]], 2.8, 2.2, shade(skin, -0.08));
		P.thin([[9.4, -14.6], [11.6, -14.2]], leather, 1);
		for (const k of [-1, 0, 1]) taper(P, [[11.5, -10], [11.5 + k * 1.2 + 0.6, -8], [11 + k * 1.4, -6.4]], 1, 0.3, shade(skin, -0.08));
		// skinny body with rot patches, the strap and loincloth
		torso(P, -21, 5, -10, 4.4, skin);
		for (const [x, y, r] of [[-2, -17, 1.2], [3, -13, 0.9], [-3, -12, 0.7]]) P.ellipse(x, y, r * 1.3, r * 0.7, rot, { line: false, rot: 0.5 });
		P.thin([[-4, -19], [-1, -18], [2, -19]], shade(skin, -0.35), 0.35);
		P.line([[-5, -21], [5, -12]], leather, 1.2);
		P.shape((p) => { p.m(-5, -12); p.l(5, -12); p.l(6, -4); p.l(3.4, -6.4); p.l(1.4, -3.4); p.l(-0.6, -6.6); p.l(-3, -3.6); p.l(-5.4, -6); }, leather, -5.4, 6);
		P.line([[-5, -12], [5, -12]], shade(leather, -0.2), 1.1);
		P.ellipse(6, -22, 2.8, 2, leather);
		// the head: a wide frog face in a leather cap, bulging eyes, a gaping mouth
		P.ellipse(1.6, -28, 7.4, 6.2, skin);
		P.ellipse(-2.4, -25.6, 1.4, 0.7, rot, { line: false, rot: 0.6 });
		P.shape((p) => { p.m(-5.8, -30); p.q(-5.6, -37, 1.6, -37); p.q(8.4, -37, 8.8, -30); p.q(1.6, -32.6, -5.8, -30); }, leather, -5.8, 8.8);
		P.thin([[1.4, -36.6], [1.6, -32]], shade(leather, -0.35), 0.5);
		for (const x of [0, 5.6]) P.circle(x, -31, 2.4, skin);
		P.eyes(2.8, -31, 2.8, 1.75, '#2a3010');
		P.ellipse(4.4, -25.4, 2.8, 2.2, '#3a1414', { line: false });
		for (const x of [2.8, 5.8]) P.poly([[x - 0.4, -27.2], [x + 0.4, -27.2], [x, -26.2]], '#efe6c8', { line: false });
		// the flail: a wooden handle in the near hand, a chain and an iron ball swinging below
		P.line([[-12.6, -23], [-9.4, -10]], '#8a5a30', 1.5);
		P.circle(-9.4, -10, 1, '#5a3a20');
		P.thin([[-9.4, -9.6], [-11, -7.4], [-12.4, -5.6]], '#5a5a60', 0.7);
		for (const [x, y] of [[-10.2, -8.6], [-11.6, -6.6]]) P.circle(x, y, 0.6, '#7a7a80', { line: false });
		P.circle(-13.6, -3.4, 2.8, iron);
		P.gloss(-14.4, -4.4, 0.9, 0.5, 0.5);
		// near arm with a wrapped wrist, the fist round the flail handle
		taper(P, [[-4.5, -20], [-9, -18], [-11, -17]], 2.8, 2.4, skin);
		P.thin([[-8.6, -19.4], [-8.2, -16.6]], leather, 1);
		P.circle(-11.2, -16.6, 1.9, skin);
	},
	// Feral gnoll: a hunched, wiry pale blue beast wearing an antlered deer skull for a head (glowing blue eyes), a ruff of
	// dark blue feathers round its shoulders and trailing behind like a cloak, long arms ending in curved claws
	337(P) {
		P.shadow(13, 5);
		const blue = '#9ac8e8', feather = '#3a3a8a', bone = '#efe8d6';
		const claws = (x, y, sd) => { for (const k of [-1, 0, 1]) taper(P, [[x + k * 1.1, y], [x + k * 1.3 + sd * 0.8, y + 2.4], [x + k * 1.1 + sd * 0.2, y + 4]], 0.9, 0.2, '#e0f0ff'); };
		// trailing feathers behind, like a ragged cloak
		for (const [x, y, tx, ty] of [[-6, -20, -16, -10], [-6, -16, -14, -6], [-5, -22, -15, -15], [-4, -14, -10, -3]]) taper(P, [[x, y], [tx, ty]], 4, 0.6, shade(feather, 0.1));
		// legs: bent, digitigrade, clawed toes
		for (const [hx, kx, fx, c] of [[-3, -6, -5, shade(blue, -0.1)], [3, 7, 6.5, blue]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 4, 2.8, c);
			P.ellipse(fx + 1, -1.2, 2.8, 1.2, c);
			for (const k of [0, 1, 2]) P.poly([[fx + 1.6 + k, -1], [fx + 2.8 + k, -0.4], [fx + 1.8 + k, 0.2]], '#e0f0ff', { line: false });
		}
		// far arm hanging long, claws
		taper(P, [[6, -21], [11, -15], [12, -9]], 3.4, 2.4, shade(blue, -0.1));
		claws(12, -9, 1);
		// the wiry hunched torso
		P.shape((p) => { p.m(-6, -24); p.q(1, -27, 6.4, -23); p.q(6, -16, 4, -11); p.q(0, -9.6, -4, -11); p.q(-7, -16, -6, -24); }, blue, -7, 6.4);
		for (const y of [-18, -15.5]) P.thin([[-2.6, y], [2.6, y - 0.6]], shade(blue, -0.3), 0.4);
		P.thin([[-3, -21], [0, -19.6], [3, -21]], shade(blue, -0.3), 0.4);
		// near arm reaching down with claws
		taper(P, [[-5, -21], [-10, -15], [-10, -8]], 3.4, 2.4, blue);
		claws(-10, -8, -1);
		// the feather ruff round the shoulders
		for (let k = 0; k < 9; k++) {
			const x = -8 + k * 2, y = -24 - Math.sin(k / 8 * Math.PI) * 3;
			P.poly([[x - 1.8, y - 1], [x + (k < 4 ? -1.4 : 1.4), y + 4.6], [x + 1.8, y - 1]], k % 2 ? feather : shade(feather, 0.15));
		}
		// the antlered deer skull worn as its head (no face beneath it): pale bone, a long snout, glowing blue eye sockets
		for (const sd of [-1, 1]) {
			const bx = sd * 3.6 + 1;
			taper(P, [[bx, -35], [bx + sd * 3, -40], [bx + sd * 5, -45]], 1.4, 0.5, bone);
			taper(P, [[bx + sd * 1.8, -38], [bx + sd * 0.6, -43]], 1, 0.3, bone);
			taper(P, [[bx + sd * 3.4, -41], [bx + sd * 7, -42]], 1, 0.3, bone);
		}
		P.shape((p) => { p.m(-4.4, -33); p.q(-4, -38, 1, -38); p.q(6.6, -38, 6.4, -32); p.q(6, -28, 4, -26); p.q(3, -21.6, 1.2, -21); p.q(-0.6, -21.6, -1.4, -26); p.q(-4.6, -28, -4.4, -33); }, bone, -4.6, 6.6);
		for (const x of [-1.4, 3.6]) { P.ellipse(x, -32, 1.5, 1.7, '#1a1a3a', { line: false }); P.glow(x, -32, 2.4, '#5ab0ff', 0.7); P.dot(x, -32, 0.6, '#c8f0ff'); }
		P.thin([[0.4, -26], [0.6, -23]], shade(bone, -0.4), 0.4); P.thin([[1.8, -26], [1.6, -23]], shade(bone, -0.4), 0.4);
		P.gloss(-1.6, -36.4, 1.6, 0.7, 0.5);
	},
	// Cyclops: a hulking hunched grey-tan giant with one big eye and tusks, an animal skull worn on one shoulder, a leather
	// apron with a gold medallion on a strap, wrapped legs, a spiked wooden club raised back over its other shoulder
	340(P) {
		P.shadow(15, 5.5);
		const skin = '#b8ac94', leather = '#9a6034', wrap = '#7a4a28', wood = '#8a5530', bone = '#e8dcc0';
		// the spiked club raised behind, held in the far hand over the shoulder
		P.line([[-6, -22], [-17, -34]], wood, 2.4);
		P.ellipse(-18, -36, 3.6, 4.4, wood, { rot: -0.7 });
		for (const [dx, dy] of [[-3.6, -2], [-1.6, -4.6], [1.6, -3.6], [-4, 1.6], [3, -0.6]]) P.poly([[-18 + dx * 0.6 - 0.6, -36 + dy * 0.6], [-18 + dx * 1.5, -36 + dy * 1.4], [-18 + dx * 0.6 + 0.6, -36 + dy * 0.6 + 0.6]], '#e0d0a8');
		for (const t of [0.3, 0.6]) P.thin([[-6 - 11 * t - 1, -22 - 12 * t + 1], [-6 - 11 * t + 1, -22 - 12 * t - 1]], wrap, 0.8);
		// thick legs with leather wraps
		for (const [x, c] of [[-5, shade(skin, -0.08)], [5, skin]]) {
			taper(P, [[x, -12], [x * 1.2, -2]], 6, 5, c);
			for (const y of [-8, -5]) P.thin([[x * 1.2 - 2.8, y], [x * 1.2 + 2.8, y - 0.6]], wrap, 1.1);
			P.ellipse(x * 1.2 + 1, -1.3, 3.8, 1.6, shade(skin, -0.15));
		}
		// the big hunched body
		P.shape((p) => { p.m(-9, -12); p.q(-13, -20, -10, -28); p.q(-5, -33, 3, -32); p.q(11, -31, 12, -24); p.q(13, -15, 9, -11); p.q(0, -8, -9, -12); }, skin, -13, 13);
		P.thin([[-3, -24], [1, -22], [5, -24]], shade(skin, -0.3), 0.45);
		P.gloss(-7, -26, 2.4, 1.2, 0.35);
		// apron, strap and gold medallion
		P.line([[-8, -26], [6, -14]], wrap, 1.2);
		P.shape((p) => { p.m(-7, -14); p.l(8, -14); p.l(5, -4); p.l(1, -1.6); p.l(-3, -4.4); }, leather, -7, 8);
		P.circle(2.6, -14.6, 2.2, '#e0b040');
		P.circle(2.6, -14.6, 1.2, '#c08a20', { line: false });
		// the far arm up to the club
		taper(P, [[-9, -26], [-11, -22], [-7, -21]], 5, 4, shade(skin, -0.1));
		P.circle(-6.4, -21.6, 2.6, shade(skin, -0.1));
		// the near arm hanging, a big fist
		taper(P, [[10, -26], [14, -18], [12.6, -11]], 5.4, 4.2, skin);
		P.circle(12.6, -10, 3, skin);
		// an animal skull worn on the near shoulder
		P.ellipse(9.6, -28.6, 5.4, 4.4, bone);
		P.ellipse(11, -28.6, 1.8, 2, '#3a2a1a', { line: false });
		P.ellipse(7.4, -26.2, 1.1, 1, '#3a2a1a', { line: false });
		// the head set low between the shoulders: one big eye, a heavy brow, tusks
		P.circle(1.6, -30, 6.4, skin);
		for (const sd of [-1, 1]) P.poly([[1.6 + sd * 5.6, -31], [1.6 + sd * 8.6, -33.6], [1.6 + sd * 6.2, -28.4]], skin);
		P.ellipse(2.2, -31, 2.8, 2.6, '#fbf7f0');
		P.dot(2.6, -30.8, 1.6, '#4a7a2a'); P.dot(2.7, -30.7, 0.8, '#1a1208'); P.dot(1.8, -31.8, 0.6, '#ffffff');
		P.thin([[-1.6, -34.2], [2.4, -33.6], [6, -34.4]], shade(skin, -0.5), 0.8);
		P.ellipse(2.2, -26, 3.4, 1.2, '#3a1a14', { line: false });
		for (const x of [0, 4.4]) P.poly([[x - 0.6, -25.6], [x + 0.6, -25.6], [x, -28]], '#f6efd8');
	},
	// Furballmeanie: a round, shaggy brown furball of a brute with a scowling bare face, heavy brows, glowing amber eyes and
	// two tusks jutting up from its underbite, stubby legs, and a bone club bound with cord and tipped with a hooked black
	// claw, held up at its side with one arm reaching right across its belly to grip it
	342(P) {
		P.shadow(15, 5);
		const fur = '#8a5634', skin = '#b07a54', bone = '#e8c890', claw = '#3a3438';
		// stubby legs
		for (const [x, c] of [[-5, shade(skin, -0.1)], [5, skin]]) { taper(P, [[x, -10], [x * 1.3, -2]], 4.6, 4, c); P.ellipse(x * 1.3 + 0.6, -1.4, 3, 1.4, shade(skin, -0.12)); }
		// the shaggy body: a ring of fur tufts with the round body over them
		for (let k = 0; k < 20; k++) {
			const a = k * Math.PI / 10 + 0.1, r = 12.4 + (k % 2) * 0.8;
			P.circle(Math.cos(a) * r, -21 + Math.sin(a) * r * 0.98, 2.6, shade(fur, (k % 3) * 0.04 - 0.04));
		}
		P.circle(0, -21, 12.6, fur, { line: false });
		for (const [x, y] of [[-9, -24], [-6, -30], [6, -30], [-10, -16], [-3, -32], [10, -25]]) P.thin([[x, y], [x - 1.4, y + 2.6]], shade(fur, -0.3), 0.5);
		P.gloss(-6, -29, 3, 1.4, 0.3);
		// the face: a bare patch, heavy brows, eyes, a scowling underbite with tusks
		P.ellipse(-0.6, -21, 7.2, 6.4, skin);
		for (const s of [-1, 1]) P.shape((p) => { p.m(-0.6 + s * 6.4, -25.4); p.q(-0.6 + s * 3, -24.6, -0.6 + s * 0.6, -22.2); p.l(-0.6 + s * 0.8, -21.2); p.q(-0.6 + s * 3.4, -23, -0.6 + s * 6.6, -23.4); }, shade(fur, -0.25), -7.4, 6.4);
		for (const x of [-3.4, 2.2]) { P.ellipse(x, -21.2, 1.5, 1.05, '#fff0b0'); P.dot(x + 0.2, -21.1, 0.65, '#3a1a08'); }
		P.ellipse(-0.6, -18.8, 1.2, 0.9, shade(skin, -0.25), { line: false });
		P.shape((p) => { p.m(-4.4, -15.4); p.q(-0.6, -17.8, 3.4, -15.4); p.q(-0.6, -13.8, -4.4, -15.4); }, '#3a1a10', -4.4, 3.4);
		for (const x of [-3.4, 2.4]) P.poly([[x - 0.7, -14.8], [x + 0.7, -14.8], [x, -18]], '#f6eedc');
		// the club at its right side: a long bone bound with cord, a hooked black claw at the top
		taper(P, [[9, -5], [18, -36]], 2.8, 3.4, bone);
		for (const t of [0.35, 0.62]) P.thin([[9 + 9 * t - 1.8, -5 - 31 * t - 0.4], [9 + 9 * t + 1.8, -5 - 31 * t + 0.4]], '#8a4a2a', 0.8);
		P.shape((p) => { p.m(16.6, -35); p.q(19.6, -44.6, 24.6, -42); p.q(21.4, -41.4, 19.6, -34.6); }, claw, 16.6, 24.6);
		P.circle(18, -36, 2.2, bone);
		// arms: one from the right shoulder down to the club, one reaching across the belly to grip it lower down
		taper(P, [[9.6, -25], [14, -22.6], [14, -20]], 4.2, 3.6, skin);
		P.circle(14, -19.6, 2.5, skin);
		taper(P, [[-10, -19], [-4, -10], [11.6, -12]], 4.6, 3.8, skin);
		P.circle(11.6, -12.6, 2.6, skin);
		for (const k of [-0.9, 0.9]) P.thin([[11.6 + k, -14], [11.6 + k, -11.4]], shade(skin, -0.35), 0.3);
	},
	// Gnollferatu: a gaunt, bald, pale green vampire facing right with long pointed ears, yellow eyes and fangs, a brown
	// gold-trimmed capelet with a pendant, a bare chest, leather bracers, a belt and a long ragged brown skirt over boots,
	// a curved sabre with a gold hilt held low in the near hand
	348(P) {
		P.shadow(11, 4.5);
		const skin = '#a8c09a', leather = '#6a4a2e', gold = '#d8a83a', dark = '#4a3220';
		// boots and the long ragged skirt
		for (const x of [-3, 3.5]) { P.line([[x, -7], [x, -2]], dark, 3.6); P.ellipse(x + 1, -1.3, 2.8, 1.4, shade(dark, -0.2)); }
		P.shape((p) => { p.m(-5, -13); p.l(5, -13); p.q(7, -8, 8, -4); p.l(5.6, -5.4); p.l(4, -3); p.l(1.6, -5.4); p.l(-0.6, -3.4); p.l(-2.6, -5.6); p.l(-5, -3); p.l(-6.4, -5.6); p.q(-6.4, -9, -5, -13); }, leather, -6.4, 8);
		P.line([[-5.2, -13], [5.2, -13]], dark, 1.2);
		P.circle(-1.6, -12.6, 1.2, '#b03030');
		// the bare gaunt torso
		torso(P, -22, 5, -13, 4.4, skin);
		P.thin([[-2.6, -18], [0.4, -17], [3, -18]], shade(skin, -0.3), 0.4); P.thin([[0.2, -16.4], [0.2, -14]], shade(skin, -0.3), 0.35);
		// far arm hanging, bracer, a clawed hand
		taper(P, [[5, -21], [9, -16], [10, -11]], 2.8, 2.2, shade(skin, -0.08));
		P.line([[9, -15], [10, -12]], leather, 2.8);
		for (const k of [-1, 0, 1]) taper(P, [[10, -11], [10 + k * 1 + 0.6, -9], [10 + k * 1.2, -7.6]], 0.9, 0.3, shade(skin, -0.08));
		// the capelet over the shoulders with gold trim and a pendant
		P.shape((p) => { p.m(-8.4, -22.4); p.q(0, -26.6, 8.4, -22.4); p.l(5, -18); p.l(0.4, -14.6); p.l(-4.6, -18); }, leather, -8.4, 8.4);
		P.thin([[-8, -22.4], [-4.6, -18.2], [0.4, -15], [5, -18.2], [8, -22.4]], gold, 0.6);
		P.thin([[-3, -23.6], [0.4, -19.6], [3.6, -23.6]], gold, 0.35);
		P.circle(0.4, -19, 1.1, gold);
		// the bald head: long pointed ears, yellow eyes, a heavy brow, fangs
		for (const sd of [-1, 1]) P.poly([[sd * 4.6 + 1, -30], [sd * 11 + 1, -34.6], [sd * 5.2 + 1, -27]], skin);
		head(P, -29.5, 6.2, skin, 1);
		P.eyes(2, -29.6, 2.3, 1.4, '#b88a10');
		P.thin([[-1.4, -32], [1.4, -31.2]], shade(skin, -0.45), 0.6); P.thin([[5.6, -32], [2.8, -31.2]], shade(skin, -0.45), 0.6);
		P.thin([[0.4, -25.6], [4, -25.6]], '#3a2a2a', 0.45);
		for (const x of [1.2, 3.2]) P.poly([[x - 0.45, -25.6], [x + 0.45, -25.6], [x, -24.2]], '#f6f0e0', { line: false });
		// near arm with a bracer, the sabre held low, its curved blade sweeping down and forward
		taper(P, [[-5, -21], [-8, -16], [-6.5, -12]], 2.8, 2.4, skin);
		P.line([[-8, -16], [-7, -13]], leather, 3);
		P.shape((p) => { p.m(-5.4, -11); p.q(3, -8, 10, 0); p.q(2, -4.4, -6, -9.6); }, '#e8ecf0', -6, 10);
		P.thin([[-4.4, -10.4], [3, -6.6], [8.6, -0.6]], '#a8b0b8', 0.3);
		P.shape((p) => { p.m(-8.6, -13.6); p.q(-10, -10, -7, -9); p.l(-6.6, -10.2); p.q(-8.6, -10.6, -7.6, -13); }, gold, -10, -6.6);
		P.circle(-6.4, -11, 1.7, skin);
		P.line([[-7.2, -9.6], [-4.4, -12]], gold, 0.6);
	},
	// ---- caves (6A-6D) ----
	// Giant fly: a brown insect standing hunched on two jointed legs, a ridged brown wing-case over its back, a gauzy golden
	// wing behind, a round head with one big glowing yellow eye and feathery golden antennae, clawed forelegs held up front
	351(P) {
		P.shadow(12, 5);
		const brown = '#8a6a3a', dark = '#5e4526', tan = '#b8955a', gold = '#e8c060';
		// a gauzy wing behind the back
		P.shape((p) => { p.m(-5, -24); p.q(-17, -24, -17, -7); p.q(-12, -8, -5, -17); }, '#ecd890', -17, -5, { alpha: 0.75 });
		for (const [x, y] of [[-14, -10], [-12, -16], [-9, -21]]) P.thin([[-5.5, -19], [x, y]], shade(gold, -0.3), 0.3);
		// jointed legs joined under the abdomen
		for (const [hx, kx, fx, c] of [[-3, -6.5, -4.5, shade(brown, -0.12)], [2, 5.5, 5, brown]]) {
			taper(P, [[hx, -11], [kx, -7], [fx, -2]], 3.4, 2.2, c);
			P.dot(kx - 0.3, -7.2, 1.3, shade(c, -0.15));
			P.ellipse(fx + 0.8, -1.2, 2.6, 1.3, dark);
		}
		// a segmented tan thorax and belly
		P.ellipse(1, -15.5, 6.5, 7.5, tan);
		for (const y of [-12, -15, -18]) P.thin([[-3.5, y], [5.5, y + 0.6]], shade(tan, -0.35), 0.4);
		// the ridged wing-case arching over the back
		P.shape((p) => { p.m(-9, -9); p.q(-12, -24, -2, -27.5); p.q(4, -28, 5, -23.5); p.q(-3, -21, -5.5, -9); p.q(-7.5, -7.6, -9, -9); }, brown, -12, 5);
		P.thin([[-7.5, -11], [-8, -20], [-2, -25.5]], shade(brown, -0.35), 0.45);
		P.thin([[-4.8, -11], [-4.5, -19], [1.5, -24.5]], shade(brown, -0.35), 0.4);
		P.gloss(-6, -21.5, 2, 1.1, 0.4);
		// clawed forelegs held up in front of the chest
		for (const [y, c] of [[-20, brown], [-15, shade(brown, -0.1)]]) {
			taper(P, [[4, y], [10, y + 1], [10.5, y + 5]], 2.6, 1.8, c);
			for (const d of [-1, 0, 1]) taper(P, [[10.5, y + 5], [11.5 + d * 1.2, y + 7], [12.5 + d * 1.6, y + 6.2]], 1, 0.3, gold);
		}
		// feathery antennae
		for (const [ax, tx, ty] of [[6.5, 9, -43], [9, 15.5, -40]]) {
			P.line([[ax, -33], [(ax + tx) / 2 + 1, (ty - 33) / 2 - 3], [tx, ty]], gold, 0.6);
			for (let t = 0.35; t < 1; t += 0.16) { const x = ax + (tx - ax) * t, y = -33 + (ty + 33) * t; P.thin([[x, y], [x + 2.2, y + 1.4]], gold, 0.45); P.thin([[x, y], [x - 1, y - 1.6]], gold, 0.4); }
		}
		// the head: a round brown head, a little mandible, one big glowing eye
		P.circle(7, -27.5, 6.5, '#9c7a46');
		P.gloss(4.5, -31, 1.8, 1, 0.45);
		P.poly([[10.5, -23], [13, -22], [10.8, -21]], '#5e4526');
		P.glow(8.8, -28.5, 4.5, '#ffd23f', 0.45);
		P.circle(8.8, -28.5, 3.2, '#f6cf3e');
		P.dot(9.4, -28.2, 1.4, '#5a3a10');
		P.dot(7.8, -29.8, 0.8, '#ffffff');
	},
	// Shark attack: a hunched blue shark man, the whole upper body one great shark's head with a dorsal fin, jaws gaping
	// to the right over rows of white teeth and an orange throat, a pale belly, dark blue legs, and a bone club in each fist
	352(P) {
		P.shadow(14, 5);
		const blue = '#3f98c8', belly = '#cfe6ee', legc = '#33507e', bone = '#e6dcc2';
		// a bone cleaver: a short grip held at (x0, y0), then a flat blade flaring out to a broad, slanted, hollowed end
		const club = (x0, y0, x1, y1) => {
			const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
			const at = (t, w) => [x0 + ux * t + nx * w, y0 + uy * t + ny * w];
			P.line([at(-2, 0), at(2.6, 0)], shade(bone, -0.2), 1.3);
			P.shape((p) => { p.m(...at(2.4, -1.2)); p.l(...at(l - 1.2, -2.4)); p.l(...at(l + 0.6, -3.4)); p.q(...at(l - 0.6, 0), ...at(l - 1.4, 3.2)); p.l(...at(l - 2.6, 2.2)); p.l(...at(2.4, 1.2)); }, bone, Math.min(x0, x1) - 3, Math.max(x0, x1) + 3);
			P.thin([at(3.4, 0.2), at(l - 2.4, 0.4)], shade(bone, -0.25), 0.4);
			P.ellipse(...at(2.4, 0), 0.9, 1.6, shade(bone, -0.3), { rot: Math.atan2(uy, ux) });
		};
		for (const [hx, kx, fx, c] of [[-4, -8, -6, shade(legc, -0.1)], [4, 8, 6.5, legc]]) {
			taper(P, [[hx, -13], [kx, -7], [fx, -2]], 5, 3.4, c);
			P.ellipse(fx + 0.8, -1.3, 3, 1.4, shade(legc, -0.2));
		}
		// tail fin behind
		P.poly([[-9, -15], [-15, -18], [-13.5, -12]], blue);
		// the shark body-head: back curving up to the dorsal fin, jaws open to the right
		P.poly([[-4, -36], [-6, -45], [2, -38]], shade(blue, -0.05));
		P.shape((p) => { p.m(-9, -12); p.q(-13, -24, -6, -34); p.q(2, -41, 10, -39); p.q(17, -36, 18, -33); p.l(6, -30); p.l(17, -18); p.q(14, -12, 8, -10); p.q(0, -8, -9, -12); }, blue, -13, 18);
		P.shape((p) => { p.m(-5, -13); p.q(-2, -22, 6, -26); p.l(14, -18); p.q(12, -12, 6, -10.6); p.q(0, -9.6, -5, -13); }, belly, -5, 14, { line: false });
		for (const [x, y] of [[-5, -23], [-3.8, -21], [-2.6, -19]]) P.thin([[x, y], [x + 1.4, y - 3]], shade(blue, -0.4), 0.4);
		P.gloss(-5, -31, 2.6, 1.3, 0.45);
		// the open mouth: orange throat, teeth on both jaws
		P.shape((p) => { p.m(17.6, -33); p.q(9, -33.5, 4, -29); p.q(9, -22, 16.6, -18.6); p.q(10, -24, 17.6, -33); }, '#e0603a', 4, 17.6);
		P.ellipse(8.6, -27, 3, 2.4, '#a8301e', { line: false });
		for (let i = 0; i < 6; i++) {
			const t = i / 5, x = 16.6 - t * 11, y = -32.8 + t * 1.6 + t * t * 2;
			P.poly([[x - 0.75, y], [x + 0.75, y], [x - 0.1, y + 2.2]], '#fffaf0');
			const bx = 16 - t * 10, by = -19 + t * -4 - t * t * 4;
			P.poly([[bx - 0.75, by], [bx + 0.75, by], [bx + 0.3, by - 2]], '#fffaf0');
		}
		P.dot(7.6, -36, 1.1, '#141a24'); P.dot(7.3, -36.4, 0.35, '#ffffff');
		// arms hanging low, a bone cleaver in each fist: the far one hangs across in front of the legs, the near one points
		// straight out ahead
		taper(P, [[-4, -25], [-10, -19], [-9.4, -13.6]], 5.4, 3.8, shade(blue, -0.1));
		club(-9.6, -13.4, 6.4, -1.4);
		P.circle(-9.4, -13.4, 2.4, shade(blue, -0.1));
		taper(P, [[1, -23], [6, -16], [10.4, -12.4]], 5.6, 4, blue);
		club(10.6, -12.2, 26, -12);
		P.circle(10.6, -12.4, 2.5, blue);
		for (const d of [-0.8, 0, 0.8]) P.thin([[9.6 + d, -13.6], [10.8 + d, -10.8]], shade(blue, -0.45), 0.3);
	},
	// Demogorgon: a sinewy brown humanoid, a little hunched, whose head is a flower of flesh, dark petals with red insides
	// opening on a round cream mouth ringed with teeth; long arms with big claws, a purple bracelet, a long purple loincloth
	353(P) {
		P.shadow(13, 5);
		const skin = '#b47c52', dark = '#8e5a38', petal = '#7a3a24', inner = '#c84a32', purple = '#6a3aa8', gold = '#d9b04a';
		// bent legs
		for (const [hx, kx, fx, c] of [[-3, -7, -5.5, dark], [3, 7, 5.5, skin]]) {
			taper(P, [[hx, -13], [kx, -7], [fx, -2]], 4.6, 3, c);
			P.ellipse(fx + 1, -1.3, 3.2, 1.4, shade(c, -0.2));
			for (const k of [-1, 0, 1]) P.thin([[fx + 3, -1.4 + k * 0.5], [fx + 4.4, -0.9 + k * 0.7]], shade(c, -0.45), 0.45);
		}
		// far arm, long, hanging to a big claw
		P.ellipse(-7.5, -24, 3.6, 3.4, dark);
		taper(P, [[-7.5, -24], [-13.5, -17], [-12, -10]], 4.6, 3.2, dark);
		for (const k of [-1, 0, 1]) taper(P, [[-12, -10], [-12.9 + k * 1.6, -7.4], [-11.9 + k * 2.2, -5.6]], 1.2, 0.25, shade(dark, -0.2));
		// sinewy torso with a ribbed chest
		P.shape((p) => { p.m(-8.5, -24); p.q(-6, -28.5, 0, -28); p.q(6, -28.5, 8.5, -24.5); p.q(7, -18, 3.2, -12.5); p.l(-3.2, -12.5); p.q(-7, -18, -8.5, -24); }, skin, -8.5, 8.5);
		for (const y of [-22, -19.5, -17]) { P.thin([[-4, y], [-1, y + 0.6]], shade(skin, -0.35), 0.4); P.thin([[1.8, y + 0.6], [4.6, y]], shade(skin, -0.35), 0.4); }
		P.thin([[0.4, -25], [0.4, -13.5]], shade(skin, -0.3), 0.4);
		P.gloss(-3.6, -23, 1.8, 0.9, 0.35);
		// purple belt and a long loincloth strip with gold trim
		P.line([[-3.6, -12.8], [3.8, -12.8]], purple, 1.3);
		P.shape((p) => { p.m(-1.6, -12.4); p.l(2, -12.4); p.l(1.8, -4.4); p.l(0.2, -5.6); p.l(-1.4, -4.4); }, purple, -1.6, 2);
		P.thin([[-1.2, -11.4], [1.6, -11.4]], gold, 0.5); P.thin([[0.2, -11], [0.2, -6.4]], shade(purple, 0.3), 0.35);
		// near arm reaching forward to a big claw, a purple bracelet with gold studs on the wrist
		P.ellipse(7.5, -23.5, 3.8, 3.6, skin);
		taper(P, [[7.5, -23.5], [13.5, -19], [13.5, -12]], 4.8, 3.4, skin);
		P.line([[11.6, -15.4], [14.8, -14.8]], purple, 1.1);
		P.dot(13.2, -15.1, 0.4, gold);
		for (const k of [-1, 0, 1]) taper(P, [[13.5, -12], [14.4 + k * 1.8, -9], [15.6 + k * 2, -7.6]], 1.3, 0.25, shade(skin, -0.15));
		// neck up to the flower head
		taper(P, [[0.6, -26], [1.2, -30]], 3.6, 3.2, skin);
		// petals around a round toothy mouth facing the viewer, the head tipped to the right
		const cx = 1.6, cy = -35.5;
		for (const a of [-2.75, -1.6, -0.45, 0.7, 1.95, 3.15]) {
			const R = 12.5, tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R * 0.9, nx = -Math.sin(a), ny = Math.cos(a);
			P.shape((p) => { p.m(cx + nx * 4, cy + ny * 4); p.q(cx + Math.cos(a) * 8 + nx * 5, cy + Math.sin(a) * 8 + ny * 5, tx, ty); p.l(cx + Math.cos(a) * 9.5 - nx * 1.4, cy + Math.sin(a) * 9.5 - ny * 1.4); p.q(cx + Math.cos(a) * 7 - nx * 4.6, cy + Math.sin(a) * 7 - ny * 4.6, cx - nx * 4, cy - ny * 4); }, petal, cx - 12, cx + 12);
			P.shape((p) => { p.m(cx + nx * 2.8, cy + ny * 2.8); p.q(cx + Math.cos(a) * 6.5 + nx * 3, cy + Math.sin(a) * 6.5 + ny * 3, cx + Math.cos(a) * 10, cy + Math.sin(a) * 9); p.q(cx + Math.cos(a) * 6.5 - nx * 3, cy + Math.sin(a) * 6.5 - ny * 3, cx - nx * 2.8, cy - ny * 2.8); }, inner, cx - 10, cx + 10, { line: false });
		}
		P.circle(cx, cy, 5.4, '#f2e6cc');
		P.circle(cx, cy, 3, '#3a0e0a', { line: false });
		for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; P.poly([[cx + Math.cos(a - 0.2) * 5, cy + Math.sin(a - 0.2) * 5], [cx + Math.cos(a + 0.2) * 5, cy + Math.sin(a + 0.2) * 5], [cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.4]], '#fffaf0', { line: false }); }
		P.gloss(cx - 2.4, cy - 3, 1.4, 0.7, 0.5);
	},
	// Death crow: a big shaggy mass of blue-grey feathers crouched on bony bird legs, a bird skull for a head with a
	// glowing yellow eye and a long cream beak pointing right, a skeletal clawed arm hanging in front
	354(P) {
		P.shadow(15, 5);
		const fea = '#4a5c94', bone = '#e6dcc0';
		// bony crouched legs with big clawed feet
		for (const [hx, kx, fx] of [[-5, -10, -6], [2, 6.5, 3]]) {
			P.line([[hx, -10], [kx, -6], [fx, -2]], bone, 1.8);
			P.dot(kx, -6, 1.3, bone);
			for (const k of [-1, 0, 1]) P.line([[fx, -1.6], [fx + 3 + k * 0.3, -0.8 + k * 0.8]], bone, 0.8);
		}
		// the shaggy feather mass: ragged feather tufts round an oval body
		const cx = -3, cy = -23;
		for (let k = 0; k < 22; k++) {
			const a = Math.PI * 2 * k / 22 + 0.1, r1 = 9, r2 = 14.5 + (k % 3) * 1.4;
			const bend = 0.35;
			taper(P, [[cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.1], [cx + Math.cos(a + bend * 0.5) * (r2 - 2), cy + Math.sin(a + bend * 0.5) * (r2 - 2) * 1.1], [cx + Math.cos(a + bend) * r2, cy + Math.sin(a + bend) * r2 * 1.1]], 5, 0.4, k % 2 ? fea : shade(fea, -0.12));
		}
		P.ellipse(cx, cy, 11.5, 12.5, fea, { line: false });
		for (let k = 0; k < 12; k++) {
			const a = Math.PI * 2 * k / 12 + 0.4, r = 6 + (k % 2) * 2.5;
			const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
			taper(P, [[x, y], [x + 1.4, y + 2], [x + 0.8, y + 4.6]], 2.4, 0.3, shade(fea, (k % 2 ? 0.08 : -0.08)), { line: false });
			P.thin([[x, y], [x + 1.2, y + 3.6]], shade(fea, -0.35), 0.35);
		}
		P.gloss(-8, -30, 3, 1.6, 0.3);
		// skeletal arm hanging in front, bony claw
		P.line([[4, -19], [8, -13], [7.5, -6]], bone, 1.6);
		P.dot(8, -13, 1.2, bone);
		for (const k of [-1, 0, 1]) taper(P, [[7.5, -6], [8.2 + k * 1.3, -4], [9.4 + k * 1.3, -3.2]], 1, 0.3, bone);
		// a fringe of feathers behind the skull
		for (const [x, y, tx, ty] of [[4, -34, 0, -40], [6, -35, 4, -42], [8, -35, 8.5, -41.5], [3, -31, -2, -34]]) taper(P, [[x, y], [tx, ty]], 2.6, 0.4, fea);
		// the bird skull: cranium, a dark socket with a glowing yellow eye, a long hooked beak, a toothed jaw
		P.shape((p) => { p.m(10, -33.4); p.q(17, -33.6, 22, -29); p.q(23.5, -25.6, 21.6, -23.6); p.q(21, -27, 17.6, -27.8); p.q(13.4, -27.8, 10, -26.8); }, bone, 10, 23.5);
		P.thin([[12, -29], [19.6, -28.6]], shade(bone, -0.4), 0.4);
		P.shape((p) => { p.m(10.4, -26.4); p.q(14.6, -27, 18.6, -26.6); p.q(15.4, -24.4, 10.4, -24.2); }, shade(bone, -0.08), 10.4, 18.6);
		for (const x of [12.6, 14.4, 16.2]) P.poly([[x - 0.45, -26.6], [x + 0.45, -26.6], [x, -25.4]], '#fffaf0', { line: false });
		P.circle(8, -31, 5.8, bone);
		P.ellipse(9, -31.4, 2.4, 2.4, '#1c1612', { line: false });
		P.glow(9, -31.4, 3.2, '#ffcc30', 0.7); P.dot(9, -31.4, 1.3, '#ffd84a'); P.dot(9.3, -31.4, 0.5, '#3a2a08');
		P.ellipse(6.4, -27.2, 1.2, 0.8, '#3a3026', { line: false });
		P.gloss(5.6, -34.2, 1.5, 0.7, 0.5);
	},
	// Brown bomber: a grinning goblin with tan skin, big pointed ears and a leather cap with two dark horns and goggles, a
	// strap across the chest, a belt with a skull buckle and a ragged loincloth, a round bomb in one fist and a forked
	// stick in the other, a thin tail
	355(P) {
		P.shadow(12, 5);
		const skin = '#c9a24a', leather = '#6a4a2a', dark = '#4a3220', bomb = '#5a3a24';
		taper(P, [[-3, -9], [-10, -6], [-13, -3]], 1.4, 0.5, skin);
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 2.6, -11], [sd * 4.5, -7], [sd * 4.5, -2.5]], 3.6, 3, sd < 0 ? shade(skin, -0.1) : skin);
			P.thin([[sd * 4.5 - 1.6, -5], [sd * 4.5 + 1.6, -5.5]], leather, 1);
			P.ellipse(sd * 5, -1.3, 2.8, 1.3, shade(skin, -0.15));
		}
		// a small body, a strap, the belt with its skull buckle, a ragged loincloth
		torso(P, -20, 4.5, -10, 5.5, skin);
		P.thin([[-4, -19.5], [4.5, -11]], leather, 1.2);
		P.poly([[-4.5, -11], [4.5, -11], [3.5, -5.5], [1.5, -7], [0, -5], [-1.5, -7], [-3.5, -5.5]], dark);
		P.line([[-5.4, -11], [5.4, -11]], leather, 1.4);
		skull(P, 0, -11, 1.8, '#efe4c8');
		// the arms: a forked stick held up on one side, a round fused bomb on the other
		P.circle(-5.5, -18.5, 2.2, skin);
		taper(P, [[-5.5, -18.5], [-9.5, -17], [-10.5, -22]], 2.8, 2.2, skin);
		P.line([[-10.5, -20], [-11, -29]], '#5a3a24', 1);
		P.line([[-11, -27], [-13, -30]], '#5a3a24', 0.8); P.line([[-11, -27.5], [-9, -31]], '#5a3a24', 0.8);
		P.circle(-10.6, -22.4, 1.9, skin);
		P.thin([[-12, -23], [-9.2, -23.5]], leather, 0.8);
		P.circle(5.5, -18.5, 2.2, skin);
		taper(P, [[5.5, -18.5], [9.5, -15.5], [11, -12]], 2.8, 2.2, skin);
		P.circle(12.5, -9, 3.6, bomb);
		P.line([[12, -12.4], [13, -12.6]], '#8a909a', 1.4);
		P.thin([[13, -13], [14.5, -15]], '#3a2a1a', 0.4);
		P.glow(14.6, -15.2, 1.6, '#ffb040', 0.7);
		P.gloss(11, -10.4, 1.1, 0.6, 0.45);
		P.circle(10.8, -12.2, 1.9, skin);
		// big pointed ears, the head, horned cap with goggles, a toothy grin
		for (const sd of [-1, 1]) P.shape((p) => { p.m(sd * 5, -30); p.q(sd * 12, -32, sd * 15, -30); p.q(sd * 11, -27, sd * 5.5, -26.5); }, skin, sd < 0 ? -15 : 5, sd < 0 ? -5 : 15);
		head(P, -28, 7, skin);
		for (const sd of [-1, 1]) taper(P, [[sd * 3.5, -34.5], [sd * 6, -38.5], [sd * 4.5, -42]], 2.4, 0.4, '#3a2a22');
		P.shape((p) => { p.m(-7, -29.5); p.q(-7, -36.5, 0, -36.5); p.q(7, -36.5, 7, -29.5); p.q(0, -32, -7, -29.5); }, leather, -7, 7);
		for (const sd of [-1, 1]) { P.circle(sd * 2.6, -33, 1.7, '#8a909a'); P.dot(sd * 2.6, -33, 1.1, '#9fd0e0'); }
		P.eyes(0, -27.5, 2.6, 1.4, '#3a2a08');
		P.shape((p) => { p.m(-3, -24.5); p.q(0, -23.6, 3, -24.5); p.q(0, -21.4, -3, -24.5); }, '#4a1a10', -3, 3, { line: false });
		P.thin([[-2.2, -24.2], [2.2, -24.2]], '#f6efe0', 0.5);
	},
	// Armored beetle: a dark brown beetle on many spiky legs, a shell of jagged plates and spikes, orange soft parts showing
	// under the shell, two curved cream tusks in front, glowing yellow eyes and long antennae
	356(P) {
		P.shadow(15, 5.5);
		const shell = '#5a4434', dark = '#3e2e22', orange = '#d9883a', tusk = '#e8dcc0';
		// far legs behind the body: out to a spiky knee, down to a pointed foot
		const leg = (x, dx, c) => {
			const kx = x + dx * 0.55, fx = x + dx;
			taper(P, [[x, -8], [kx, -12.5]], 2.6, 2.2, c);
			taper(P, [[kx, -12.5], [fx, -1]], 2.2, 0.5, c);
			P.poly([[kx - 0.8, -12], [kx + Math.sign(dx) * 1.6, -15], [kx + 0.8, -13]], c);
		};
		for (const [x, dx] of [[-9, -8], [-3, -6], [4, 7]]) leg(x, dx, dark);
		// the body: an orange underside, then the shell of plates
		P.ellipse(-1, -11, 11, 5, orange);
		for (const x of [-7, -3, 1, 5]) P.thin([[x, -14], [x - 0.5, -7]], shade(orange, -0.35), 0.4);
		P.shape((p) => { p.m(-14, -11); p.q(-15, -24, -3, -26); p.q(7, -26.5, 9, -16); p.q(2, -13, -14, -11); }, shell, -15, 9);
		for (const [x, y, a] of [[-12, -18, -2.4], [-9, -23, -2], [-4, -25.5, -1.6], [1.5, -25.6, -1.2], [6, -22, -0.8]]) {
			const dx = Math.cos(a), dy = Math.sin(a);
			P.poly([[x - dy * 1.6, y + dx * 1.6], [x + dx * 5, y + dy * 5], [x + dy * 1.6, y - dx * 1.6]], shade(shell, -0.1));
		}
		// overlapping plates
		for (const [x0, x1] of [[-12, -7], [-6.5, -1], [-0.5, 5]]) P.thin([[x0, -13], [(x0 + x1) / 2 - 1, -21], [x1, -24]], shade(shell, -0.45), 0.5);
		P.thin([[-12, -14], [-6, -17], [4, -16]], shade(shell, -0.4), 0.5);
		P.gloss(-6, -21, 2.6, 1.2, 0.35);
		// near legs in front of the belly
		for (const [x, dx] of [[-6, -7], [-1, -4], [3, 5.5]]) leg(x, dx, shell);
		// head: antennae, a dark armoured head, two curved tusks, glowing eyes
		P.thin([[11, -15], [14, -22], [18, -25]], dark, 0.6);
		P.thin([[12.5, -14], [17, -19], [21, -20]], dark, 0.6);
		P.ellipse(11, -11.5, 5.6, 4.6, shell);
		P.gloss(9.5, -14, 1.4, 0.7, 0.4);
		taper(P, [[13, -9], [18, -7], [20.5, -11]], 2, 0.4, tusk);
		taper(P, [[11, -8], [15, -4], [18.5, -5.5]], 2, 0.4, shade(tusk, -0.1));
		P.glowEyes(12.2, -12.6, 1.8, 0.7, '#ffcc40');
	},
	// Purple eye spider: a soft purple sac of a head bulging up and back, one great dark eye staring from the top, pink
	// mottling, a little fanged face at the front and long jointed purple spider legs
	357(P) {
		P.shadow(16, 5);
		const skin = '#6a52b0', dark = '#43317a', pink = '#e486b8';
		const leg = (x, y, kx, ky, fx, c, w = 2.6) => {
			taper(P, [[x, y], [(x + kx) / 2, ky - 2], [kx, ky]], w, w * 0.75, c);
			taper(P, [[kx, ky], [fx + (fx - kx) * 0.15, ky * 0.5], [fx, 0]], w * 0.75, 0.6, c);
			P.circle(kx, ky, w * 0.42, c);
			P.poly([[kx - 0.5, ky - 0.6], [kx + (fx > kx ? 1.6 : -1.6), ky - 2.4], [kx + 0.5, ky + 0.2]], c);
		};
		for (const [x, kx, ky, fx] of [[-6, -15, -21, -24], [-2, -9, -23, -17], [4, 14, -21, 24], [1, 8, -23, 17]]) leg(x, -12, kx, ky, fx, dark);
		// the sac: a big bulb leaning back, a fleshy body under it
		P.shape((p) => { p.m(-1, -12); p.q(-9, -14, -13, -20); p.q(-19, -29, -14, -36); p.q(-8, -42, -1, -39); p.q(7, -36, 8, -29); p.q(10, -21, 9, -15); p.q(5, -10.6, -1, -12); }, skin, -17, 10);
		for (const [x, y, r] of [[-12, -30, 1.4], [-14.5, -24, 1.1], [-8, -36, 1], [4, -20, 0.9], [-10, -18, 1.2]]) P.ellipse(x, y, r * 1.3, r, pink, { line: false, alpha: 0.6 });
		P.thin([[-15, -20], [-8, -16], [0, -16]], shade(skin, -0.35), 0.45);
		P.gloss(-11, -35, 3, 1.4, 0.4);
		// the eye on top: a pink lid ring, a dark glossy eyeball
		P.circle(0, -35, 5.4, shade(skin, 0.1));
		P.circle(0, -35, 4, '#1c1030');
		P.circle(0.6, -35, 2.4, '#6a2a9a', { line: false });
		P.dot(0.6, -35, 1.2, '#0a0610');
		P.dot(-1.2, -36.8, 0.9, '#ffffff');
		// the little face at the front: fanged mouth parts
		P.ellipse(8.5, -15, 3.6, 3, shade(skin, -0.05));
		for (const [x, tx] of [[7.4, 8], [10, 11.4]]) taper(P, [[x, -13], [tx + 0.6, -10.6], [tx - 0.4, -9.4]], 1.2, 0.3, pink);
		// near legs in front
		for (const [x, kx, ky, fx] of [[-3, -12, -17, -21], [4, 13, -17, 22], [2, 6, -14, 11]]) leg(x, -11, kx, ky, fx, skin, 2.8);
	},
	// Desert spider: a huge pale beige stitched-up sac of a body with two small brass eye lenses, carried on eight
	// segmented orange-brown legs round a small armoured head underneath
	358(P) {
		P.shadow(17, 5);
		const leg = '#b8682a', dark = '#8a4a1e', sac = '#e2d2a8';
		// segmented legs splaying out from under the body
		const legOf = (s, kx, ky, fx, c) => {
			P.line([[s * 3, -13], [s * kx, ky], [s * fx, -0.6]], c, 1.6);
			P.dot(s * kx, ky, 1.4, shade(c, 0.1));
			for (const t of [0.35, 0.7]) P.thin([[s * (kx + (fx - kx) * t) - 1, ky + (-0.6 - ky) * t], [s * (kx + (fx - kx) * t) + 1, ky + (-0.6 - ky) * t]], shade(c, -0.4), 0.4);
			P.poly([[s * fx - 0.8, -1.2], [s * fx + 0.8, -1.2], [s * fx + s * 0.4, 0.6]], shade(c, -0.3));
		};
		for (const s of [-1, 1]) for (const [kx, ky, fx] of [[19, -24, 25], [13, -25, 17]]) legOf(s, kx, ky, fx, dark);
		for (const s of [-1, 1]) for (const [kx, ky, fx] of [[16, -19, 21], [9, -19, 11]]) legOf(s, kx, ky, fx, leg);
		// the small armoured head under the sac
		P.ellipse(0, -12, 5, 4, leg);
		for (const x of [-2, 0, 2]) P.thin([[x, -15], [x, -9.6]], shade(leg, -0.35), 0.4);
		for (const s of [-1, 1]) P.poly([[s * 1.2, -9], [s * 2.4, -9], [s * 1.4, -7]], '#f2e2c8');
		// the stitched sac
		P.ellipse(0, -29, 14, 12.5, sac);
		P.shape((p) => { p.m(-2, -41); p.q(-6, -30, -1, -17); p.l(1, -17); p.q(-3.5, -30, 0.5, -41.4); }, shade(sac, -0.12), -6, 1, { line: false });
		P.thin([[-1, -41.2], [-4, -30], [0, -17]], shade(sac, -0.45), 0.5);
		for (let y = -38; y < -19; y += 3) { const x = -4 + Math.abs(y + 29) * 0.2; P.thin([[x - 1.4, y - 0.4], [x + 1.4, y + 0.4]], shade(sac, -0.5), 0.35); }
		P.thin([[-13.5, -30], [-6, -34], [-3.4, -33]], shade(sac, -0.4), 0.4);
		P.thin([[13.4, -26], [6, -22], [-2, -23]], shade(sac, -0.4), 0.4);
		for (const [x, y] of [[-10, -32.6], [-7, -33.6], [8, -23.2], [4, -22.4], [10, -24.4]]) P.thin([[x, y - 1], [x, y + 1]], shade(sac, -0.45), 0.3);
		P.gloss(-6, -36, 4, 2, 0.45);
		// two brass eye lenses
		for (const [x, y, r] of [[-12.4, -27, 1.8], [12, -24, 2.2]]) {
			P.circle(x, y, r, '#a8783a');
			P.circle(x, y, r * 0.55, '#2a1a10', { line: false });
			P.glow(x, y, r, '#ffb040', 0.5);
			P.dot(x - r * 0.25, y - r * 0.25, r * 0.2, '#ffffff');
		}
	},
	// Green squid: a green sea thing rearing up on curling tentacles, a crest of lime spines and webbed fins, two eyes
	// on stalks, and a cluster of fiery orange feelers round its mouth at the front
	359(P) {
		P.shadow(15, 5);
		const green = '#4caa38', dark = '#2e7a26', lime = '#a8d84a', fire = '#f08a24';
		// curling tentacles along the ground
		for (const t of [[[-4, -10], [-12, -6], [-17, -3], [-20, -6]], [[-1, -9], [-6, -3], [-10, -1], [-11, -3.4]], [[2, -9], [4, -3], [9, -1], [12, -3]], [[5, -11], [11, -8], [16, -4], [19, -6]]]) taper(P, t, 3.4, 0.9, dark);
		// webbed fins at the back
		P.shape((p) => { p.m(-7, -26); p.l(-19, -30); p.l(-15, -25); p.l(-21, -21); p.l(-14, -18); p.l(-18, -12); p.l(-7, -14); }, shade(green, -0.1), -21, -7);
		// the body, a lime belly
		P.shape((p) => { p.m(-8, -12); p.q(-12, -24, -6, -32); p.q(0, -38, 6, -32); p.q(11, -26, 9, -16); p.q(5, -9, -8, -12); }, green, -12, 11);
		P.shape((p) => { p.m(-2, -14); p.q(-4, -24, 2, -30); p.q(7, -24, 6, -15); p.q(2, -12, -2, -14); }, lime, -4, 7, { line: false });
		for (const y of [-26, -22, -18]) P.thin([[-1.5, y], [5.5, y - 0.4]], shade(lime, -0.3), 0.35);
		// the spiny crest
		for (const [x, y, tx, ty] of [[-6, -31, -11, -37], [-2, -34, -4, -42], [3, -34, 5, -40], [7, -29, 12, -33]]) P.poly([[x - 1.6, y + 1], [tx, ty], [x + 1.6, y]], lime);
		P.gloss(-5, -28, 2, 1.1, 0.4);
		// eyes on stalks
		for (const [x, tx, ty, c] of [[-2, -6, -43, shade(green, -0.08)], [3, 7, -44, green]]) {
			taper(P, [[x, -31], [x + (tx - x) * 0.3, -38], [tx, ty]], 2.2, 1.6, c);
			P.circle(tx, ty, 3, '#d4e86a');
			P.dot(tx + 0.7, ty + 0.2, 1.4, '#1a2410');
			P.dot(tx - 0.6, ty - 1, 0.6, '#ffffff');
		}
		// fiery feelers round the mouth
		for (const [ey, tx, ty] of [[-24, 18, -27], [-21, 19, -19], [-18, 17, -12], [-22, 14, -10], [-25, 14, -31]]) taper(P, [[7, ey], [(7 + tx) / 2 + 1, (ey + ty) / 2 + 2], [tx, ty]], 2.2, 0.5, fire);
		P.ellipse(8.4, -21, 2.6, 3.6, shade(fire, -0.15));
		P.glow(9, -21, 4, '#ffd040', 0.4);
	},
	// Faceless assassin: a blue-violet hood with nothing but darkness inside, a short cape over a violet tunic and leather
	// belt, wrapped boots, a curved steel dagger in each hand held out ready
	360(P) {
		P.shadow(12, 5);
		const violet = '#4a3a9a', hood = '#3a48c0', dark = '#2a2060', leather = '#6a4a2a';
		// legs and wrapped boots
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 3, -11], [sd * 4.5, -6], [sd * 5, -2.5]], 4.2, 3.6, sd < 0 ? shade(violet, -0.12) : violet);
			for (const y of [-5, -3.6]) P.thin([[sd * 5 - 2, y], [sd * 5 + 2, y - 0.4]], shade(violet, -0.4), 0.4);
			P.ellipse(sd * 5.6, -1.3, 3, 1.4, dark);
		}
		// tunic with a long front flap, belt and pouch
		torso(P, -21, 5.5, -9, 7, violet);
		P.poly([[-3, -10], [3, -10], [2.4, -4], [-2.4, -4]], shade(violet, -0.15));
		P.line([[-6.6, -12], [6.6, -12]], leather, 1.3);
		P.circle(3.5, -11.5, 1.4, '#3a6ad0');
		// arms out to the sides, a curved dagger in each fist
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(violet, -0.12) : violet;
			P.circle(sd * 6.5, -20, 2.8, c);
			taper(P, [[sd * 6.5, -20], [sd * 11, -16], [sd * 12.5, -19.5]], 3.4, 2.8, c);
			P.line([[sd * 12.5, -18], [sd * 12.5, -22]], leather, 1);
			P.shape((p) => { p.m(sd * 12, -22); p.q(sd * 11, -28, sd * 15.5, -31); p.q(sd * 13.5, -27, sd * 13.5, -22); }, '#b8c4d4', sd < 0 ? -15.5 : 11, sd < 0 ? -11 : 15.5);
			P.circle(sd * 12.6, -19.5, 2, c);
			P.thin([[sd * 11, -20.5], [sd * 14, -20.5]], leather, 0.7);
		}
		// the cape over the shoulders and the big hood, empty and dark inside but for two faint glints
		P.shape((p) => { p.m(-8, -19); p.q(-8.5, -24, -5, -24.5); p.l(5, -24.5); p.q(8.5, -24, 8, -19); p.q(0, -21, -8, -19); }, hood, -8.5, 8.5);
		P.shape((p) => { p.m(-8, -24); p.q(-9, -36, -2, -40); p.q(4, -43, 7, -38); p.q(9.5, -33, 8, -24); p.q(0, -22, -8, -24); }, hood, -9.5, 9.5);
		P.shape((p) => { p.m(-5.5, -25); p.q(-6, -34, 0, -35.5); p.q(6, -34, 5.5, -25); p.q(0, -23.5, -5.5, -25); }, '#0e0a24', -6, 6, { flat: true });
		P.thin([[-6.5, -25], [-6.6, -33], [-1, -37]], shade(hood, 0.3), 0.5);
		for (const x of [-2, 2.4]) { P.glow(x, -30, 1.6, '#8090ff', 0.35); P.dot(x, -30, 0.45, '#b0c0ff'); }
		P.gloss(-4, -37, 2, 1, 0.35);
	},
	// Capricorn archer: a lean tan goat-man crouched to shoot, long ridged horns sweeping back, a goat's head with a long
	// muzzle facing right and a pale eye, a shaggy fur vest, a quiver of arrows on the back, hoofed legs, a wooden bow held
	// out in front and a tufted tail
	361(P) {
		P.shadow(14, 5);
		const fur = '#c8964e', dark = '#9a6a34', vest = '#7a5430', horn = '#a07a50', wood = '#7a4a24';
		// tail
		taper(P, [[-5, -13], [-11, -14], [-13, -9]], 1.6, 0.8, dark);
		P.ellipse(-13, -8.4, 1.6, 2.2, shade(dark, -0.2));
		// the quiver on the back, arrows sticking up
		for (const x of [-9.4, -8, -6.6]) { P.line([[x + 1, -26], [x - 1, -34]], '#d8c8a8', 0.4); P.poly([[x - 1.6, -33.4], [x - 0.4, -36.4], [x - 0.2, -33.6]], '#c84a2a'); }
		P.shape((p) => { p.m(-8, -14); p.l(-12, -27); p.l(-7.4, -28.6); p.l(-4, -15.6); }, wood, -12, -4);
		// digitigrade legs to small hooves
		for (const [hx, kx, ax, fx, c] of [[-3, -6, -4.5, -6, dark], [3, 7, 4, 5.5, fur]]) {
			P.line([[hx, -13], [kx, -8.6], [ax, -4.4], [fx, -1.6]], c, 2.8);
			for (const y of [-11.6, -10]) P.thin([[hx + (kx - hx) * 0.5 - 1.6, y], [hx + (kx - hx) * 0.5 + 1.6, y]], vest, 0.6);
			P.poly([[fx - 1.6, -2.4], [fx + 1.8, -2.4], [fx + 2, 0], [fx - 1.6, 0]], '#4a3424');
		}
		// lean body leaning forward, a shaggy fur vest
		P.shape((p) => { p.m(-5, -12); p.q(-7, -20, -3, -26); p.q(3, -29, 7, -24); p.q(7, -17, 4, -12); p.q(0, -10.5, -5, -12); }, fur, -7, 7);
		P.shape((p) => { p.m(-6, -13); p.q(-7.6, -21, -3.6, -26.4); p.q(-0.6, -27, 0.4, -24); p.l(-0.4, -20); p.l(1, -16); p.l(-0.6, -12); p.q(-3, -11, -6, -13); }, vest, -7.6, 1);
		for (const [x, y] of [[-6.6, -16], [-5.8, -21], [-3.2, -25]]) P.thin([[x, y], [x - 1.2, y + 1.6]], shade(vest, -0.35), 0.4);
		P.line([[-5.8, -13.6], [4.6, -13.2]], '#4a3424', 1);
		P.thin([[2, -22], [4.6, -21]], shade(fur, -0.35), 0.4);
		// far arm drawing the string back
		P.ellipse(-1, -23.6, 2.4, 2.4, dark);
		taper(P, [[-1, -23.6], [3, -18], [7, -19]], 2.6, 2, dark);
		// the bow held out in front, its string back to the drawing hand
		P.shape((p) => { p.m(13, -30); p.q(19, -20, 13, -8); p.q(17.4, -20, 12, -29.6); }, wood, 12, 19);
		P.thin([[13, -30], [7, -19], [13, -8]], '#f0e8d8', 0.3);
		P.thin([[7, -19], [15.6, -19]], '#d8c8a8', 0.35); P.poly([[15.2, -20.2], [17.6, -19], [15.2, -17.8]], '#c8d0dc');
		// near arm holding the bow
		P.ellipse(5, -23, 2.8, 2.6, fur);
		taper(P, [[5, -23], [10, -20.5], [14.6, -19.6]], 2.8, 2.2, fur);
		P.circle(15, -19.6, 1.6, fur);
		// horns sweeping back, ridged
		for (const [x0, mx, my, tx, ty, c] of [[2, -4, -44, -10, -42, shade(horn, -0.15)], [5, 1, -45, -6, -46, horn]]) {
			taper(P, [[x0, -34], [mx, my], [tx, ty]], 3, 0.6, c);
			for (let t = 0.2; t < 0.85; t += 0.15) { const x = x0 + (mx - x0) * t * 1.4, y = -34 + (my + 34) * t * 1.1; P.thin([[x - 1, y + 0.6], [x + 0.8, y - 0.6]], shade(c, -0.4), 0.35); }
		}
		// goat head: long muzzle to the right, beard, ears, a pale eye with a slit pupil
		P.ellipse(-0.6, -32, 3.2, 1.4, fur, { rot: 0.4 });
		P.circle(3.6, -31, 5, fur);
		P.shape((p) => { p.m(4, -34.6); p.q(10, -34, 13.6, -29.4); p.q(14, -27, 12, -26.4); p.q(8, -26, 4, -27); }, fur, 4, 14);
		P.ellipse(13, -28.6, 0.6, 0.5, '#3a2414', { line: false });
		P.thin([[8.6, -27], [12.4, -27.2]], shade(fur, -0.45), 0.35);
		P.shape((p) => { p.m(5, -27); p.q(7, -26.4, 9, -26.6); p.q(7.6, -23, 6, -21.6); p.q(5, -24, 5, -27); }, '#e8d4a8', 5, 9);
		P.gloss(1.6, -33.4, 1.3, 0.7, 0.4);
		P.ellipse(6.8, -31.4, 2, 1.5, '#f6ecd0');
		P.ellipse(7.2, -31.4, 1, 1.1, '#b8402a', { line: false });
		P.ellipse(7.2, -31.4, 0.35, 0.9, '#1a0a04', { line: false });
		P.thin([[5, -33.2], [8.4, -32.6]], shade(fur, -0.5), 0.5);
	},
	// Rail troll: a hulking blue troll hunched under a huge patched brown sack on its back, a pale grey-blue face with
	// yellow eyes, tusks and a long nose, a gold ring in its pointed ear, a shaggy dark mane, a fur loincloth, and a big
	// pick with a curved steel blade gripped low in front
	362(P) {
		P.shadow(15, 5.5);
		const blue = '#4a62a8', face = '#a8b8cc', sack = '#7a5a3a', hair = '#4a4258', steel = '#c0ccd8';
		// the huge sack on its back
		P.shape((p) => { p.m(-4, -16); p.q(-18, -18, -18, -32); p.q(-17, -44, -4, -43); p.q(6, -42, 4, -30); p.q(2, -20, -4, -16); }, sack, -18, 6);
		P.thin([[-15, -38], [-11, -40], [-7, -41]], shade(sack, -0.4), 0.5);
		for (const x of [-14, -11.5, -9]) P.thin([[x - 0.8, -40.5 + (x + 14) * 0.2], [x + 0.6, -38.8 + (x + 14) * 0.2]], shade(sack, 0.3), 0.4);
		P.gloss(-12, -36, 2.4, 1.2, 0.35);
		// legs
		for (const [hx, kx, fx, c] of [[-3, -7, -5, shade(blue, -0.12)], [3, 7, 6, blue]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 5, 3.6, c);
			P.ellipse(fx + 1, -1.3, 3.4, 1.5, shade(blue, -0.2));
		}
		// body hunched forward, a fur loincloth
		P.shape((p) => { p.m(-6, -26); p.q(2, -31, 9, -26); p.q(10, -17, 5, -11); p.q(-1, -9.5, -6, -12); p.q(-9, -19, -6, -26); }, blue, -9, 10);
		P.shape((p) => { p.m(-1, -24); p.q(5, -25, 7, -20); p.q(6, -16, 2, -15); p.q(-1.4, -18, -1, -24); }, face, -1.4, 7, { line: false, alpha: 0.55 });
		P.shape((p) => { p.m(-6.5, -14); p.l(6, -14); p.l(6.6, -8); p.l(4, -9.6); p.l(2, -7.4); p.l(-0.4, -9.4); p.l(-3, -7.6); p.l(-6.6, -9); }, '#6a4a3a', -6.6, 6.6);
		// the weapon: a short wrapped haft held low across the knees, ending in a broad hooked blade that sweeps down
		// and round to a point, a spur on its back
		P.line([[-7, -8.6], [10, -10.6]], '#6a4a2a', 1.5);
		for (const x of [-4.6, -3.2, -1.8]) P.thin([[x, -9.8], [x + 0.4, -7.6]], '#3a2a1a', 0.4);
		P.circle(-7.4, -8.6, 1.3, '#8a909a');
		P.shape((p) => { p.m(9, -12.2); p.q(12.6, -12.6, 14, -8.6); p.q(16.4, -3.4, 21.6, -5); p.q(23.6, -6.4, 24, -10); p.q(25, -3.4, 19.6, -1.4); p.q(13, -0.6, 11, -6.4); p.q(10.4, -8.4, 9.4, -9); }, '#a4b2c2', 9, 25);
		P.poly([[10, -12], [9.2, -15.6], [12.2, -12.6]], '#a4b2c2');
		P.thin([[12.2, -7.4], [14.6, -3], [19.6, -2.2], [23.6, -5.6]], '#f0f6fc', 0.45);
		P.circle(10, -10.6, 1.3, '#8a909a');
		// thick arms: the back one over the sack strap, the front gripping the haft
		taper(P, [[-4, -25], [-9, -21], [-5, -16]], 4.4, 3.4, shade(blue, -0.1));
		P.circle(-4, -16, 2.4, shade(blue, -0.1));
		taper(P, [[5, -25], [9, -18], [7, -11.6]], 4.8, 3.6, blue);
		P.ellipse(8.4, -16.8, 2.6, 1.2, '#7a5a3a', { rot: 1.2 });
		P.circle(6.6, -10.4, 2.6, blue);
		// a shaggy dark mane over the shoulders, the head thrust forward
		P.shape((p) => { p.m(4, -35); p.q(-3, -37, -6, -31); p.l(-8.6, -30); p.l(-6.4, -27.6); p.l(-9, -25); p.l(-5.4, -24); p.l(-6.6, -20.4); p.q(-1, -22, 3, -26); }, hair, -9, 4);
		for (const [x, y] of [[-4, -31], [-5, -26.4], [0, -33]]) P.thin([[x + 2, y - 0.6], [x - 1.6, y + 1.6]], shade(hair, 0.25), 0.4);
		head(P, -29, 5.8, face, 5);
		P.shape((p) => { p.m(0, -31); p.q(-4, -34, -7, -36); p.q(-4, -29, 0, -28); }, face, -7, 0);
		P.ellipse(-0.6, -27.8, 1, 1, '#d8a830', { line: false });
		P.dot(-0.6, -27.8, 0.45, face);
		P.shape((p) => { p.m(-0.5, -33); p.q(4, -36, 9, -33.4); p.q(5, -33.8, -0.5, -31); }, hair, -0.5, 9);
		for (const x of [3.2, 7]) { P.dot(x, -30.4, 1.1, '#2a2a20'); P.dot(x, -30.4, 0.7, '#ffd23f'); }
		P.shape((p) => { p.m(5, -29.6); p.q(9, -29.6, 10, -27); p.q(8, -26.8, 6, -27.4); }, shade(face, -0.12), 5, 10);
		P.shape((p) => { p.m(1.6, -26.2); p.q(5, -24.4, 8.6, -25.6); p.q(5, -23, 1.6, -26.2); }, '#3a1a3a', 1.6, 8.6, { line: false });
		for (const x of [2.6, 7.4]) P.poly([[x - 0.5, -25.2], [x + 0.5, -25.2], [x, -27.2]], '#f8f0d8');
	},
	// Zombie pharaoh: a hunched, bony green zombie with a spiny ridge down its back, a tall black and gold pharaoh's
	// crown with a gold eye, a gaping mouth, a big gold-rimmed wooden shield and a curved bronze khopesh held low
	363(P) {
		P.shadow(14, 5.5);
		const green = '#7e8f52', dark = '#5a6a38', gold = '#d8b048', wood = '#5e3a20', black = '#24241e', steel = '#c4bc98';
		// skinny legs folded in a deep crouch, knees high, long toes
		for (const [hx, kx, ky, fx, c] of [[-4, -10, -9, -7, dark], [0, 5, -10.4, 3, green]]) {
			taper(P, [[hx, -14], [kx, ky], [fx, -2]], 2.8, 1.8, c);
			P.circle(kx, ky, 1.5, c);
			for (const d of [-1, 0, 1]) taper(P, [[fx, -2], [fx + 2.6 + d * 0.3, -0.7 + d * 0.6]], 1, 0.3, shade(c, -0.1));
		}
		// the far arm, reaching round to the back of the shield
		taper(P, [[-1, -29], [-5, -23], [1, -17]], 2.2, 1.7, dark);
		// a spiny ridge down the bent back
		for (const [x, y] of [[-6.6, -17], [-8, -21], [-8, -25], [-6.6, -28.8], [-4, -32], [-0.6, -34.4]]) P.poly([[x + 1.6, y + 1.4], [x - 2.8, y - 1], [x + 1, y - 1.8]], dark);
		// thin torso leaning forward, ribs showing, a ragged wrap at the waist
		P.shape((p) => { p.m(-5, -14); p.q(-8.4, -24, -4, -31); p.q(0, -35.6, 5, -32); p.q(5, -25, 1.4, -19); p.q(0, -15, 0, -13); p.q(-3, -12, -5, -14); }, green, -8.4, 5);
		for (const y of [-27, -24.4, -21.8]) P.thin([[-4.6, y], [0.4, y - 1.2]], shade(green, -0.35), 0.4);
		P.shape((p) => { p.m(-5.6, -15); p.l(0.6, -14); p.l(1, -10); p.l(-0.8, -11); p.l(-2.4, -9.2); p.l(-3.8, -11); p.l(-6, -10.4); }, '#8a7a5a', -6, 1);
		// the shield held low in front: dark wood, a gold rim and gold straps
		P.shape((p) => { p.m(3, -22); p.l(13, -24); p.l(15, -14); p.l(13.6, -5.6); p.l(5, -4); p.q(2, -12, 3, -22); }, wood, 2, 15);
		P.thin([[3, -22], [13, -24], [15, -14], [13.6, -5.6], [5, -4], [2.6, -12], [3, -22]], gold, 0.8);
		for (const y of [-18.6, -12.4]) P.thin([[3.2, y + 0.8], [14, y - 1.2]], gold, 0.6);
		P.thin([[8.4, -23], [9.4, -4.8]], shade(wood, -0.4), 0.5);
		P.gloss(5.6, -19.6, 1.1, 1.6, 0.25);
		// near arm: bony, the elbow out, reaching down over the shield to the khopesh
		P.circle(3, -30, 2, green);
		taper(P, [[3, -30], [8, -24], [5.4, -13.4]], 2.4, 1.9, green);
		P.circle(8, -24, 1.3, green);
		// the khopesh: a short grip and a dark bronze blade sweeping out and hooking down to a point
		P.line([[3.6, -13.4], [8.4, -12.4]], '#4a2e18', 1);
		P.shape((p) => { p.m(8.2, -13.6); p.q(14.4, -16, 18.4, -12); p.q(21.6, -7.6, 20, -2.4); p.q(19, -6.6, 16, -9.2); p.q(12.6, -12, 8.4, -11.4); }, steel, 8.2, 21.6);
		P.thin([[9.6, -13.6], [15, -14], [18.8, -10.6]], '#f4f0e0', 0.35);
		P.circle(5.4, -13, 1.7, green);
		// the gold-trimmed black side flap of the headdress, behind the face
		P.shape((p) => { p.m(4, -40); p.l(8, -40); p.l(8.4, -32); p.l(5.6, -28.4); p.l(3.6, -32.6); }, black, 3.6, 8.4);
		P.thin([[8, -39.6], [8.4, -32], [5.6, -28.4]], gold, 0.7);
		// the gaunt, skull-like head thrust forward: sunken eye, nose slits, a grinning jaw full of teeth
		P.ellipse(9, -35.6, 4.2, 4.2, green);
		P.shape((p) => { p.m(7, -33.4); p.q(12, -32.2, 15.4, -34.2); p.q(15.4, -29, 11, -28.2); p.q(7.8, -29, 7, -33.4); }, green, 7, 15.4);
		P.shape((p) => { p.m(9, -32.6); p.q(12, -31.8, 14.6, -33.4); p.q(13.8, -30, 11.2, -29.8); p.q(9.4, -30.2, 9, -32.6); }, '#2a1008', 9, 14.6, { line: false });
		for (let x = 9.8; x < 14.4; x += 1.1) P.poly([[x - 0.4, -32.6 - (x - 9.8) * 0.18], [x + 0.4, -32.6 - (x - 9.8) * 0.18], [x, -31.4 - (x - 9.8) * 0.18]], '#ece4c0', { line: false });
		for (let x = 10.4; x < 13.8; x += 1.1) P.poly([[x - 0.4, -30.2], [x + 0.4, -30.2], [x, -31.3]], '#ece4c0', { line: false });
		P.ellipse(11.4, -36.4, 1.7, 1.4, '#1a1a10', { line: false });
		P.dot(11.7, -36.4, 0.6, '#e8e070');
		P.thin([[10, -38.4], [13.4, -37.4]], shade(green, -0.4), 0.45);
		P.dot(14.2, -35, 0.35, '#1a1a10');
		// the tall black crown flaring to the top, gold bands and a gold eye
		P.shape((p) => { p.m(4.6, -39.2); p.l(14, -39.8); p.l(16.6, -51); p.l(3.8, -50); }, black, 3.8, 16.6);
		P.thin([[4.6, -40.8], [14.3, -41.4]], gold, 1);
		P.thin([[3.8, -50], [16.6, -51]], gold, 0.8);
		P.circle(13.8, -45.2, 1.5, gold);
		P.dot(13.8, -45.2, 0.6, '#1a1a10');
		P.gloss(6.4, -46.2, 0.9, 2.4, 0.25);
	},
	// Fallen angel: a pale, muscular angel in a dark closed helm, great dark grey feathered wings rising behind, a long dark
	// slate robe from the waist to the ground, both hands gripping a dark iron trident across the body
	364(P) {
		P.shadow(13, 5);
		const skin = '#d8d4c4', wing = '#5a6070', robe = '#4a5066', iron = '#3a3e4a';
		// wings: two broad dark wings rising behind the shoulders, scalloped feather edges
		for (const [sd, c] of [[-1, shade(wing, -0.15)], [1, wing]]) {
			const o = sd < 0 ? -4 : 3;
			P.shape((p) => { p.m(o, -26); p.q(o + sd * 4, -40, o + sd * 13, -43); p.q(o + sd * 12, -36, o + sd * 13.5, -32); p.l(o + sd * 10.5, -31); p.l(o + sd * 12, -26); p.l(o + sd * 9, -25.5); p.l(o + sd * 10, -20); p.l(o + sd * 6.5, -20.5); p.l(o + sd * 6.5, -15); p.q(o + sd * 2, -20, o, -22); }, c, sd < 0 ? o - 13.5 : o, sd < 0 ? o : o + 13.5);
			for (const [k, y] of [[0.45, -36], [0.6, -30], [0.5, -24]]) P.thin([[o + sd * 2, -26], [o + sd * 13 * k + sd * 3, y]], shade(c, -0.35), 0.4);
		}
		// the long robe, flaring and ragged at the hem, a sash
		P.shape((p) => { p.m(-5, -15); p.l(5, -15); p.q(8, -8, 11, -1.5); p.l(7, -2.6); p.l(4, -1); p.l(0, -2.4); p.l(-4, -1); p.l(-8, -2.4); p.l(-10, -1.5); p.q(-8, -8, -5, -15); }, robe, -10, 11);
		for (const x of [-4, 0, 4]) P.thin([[x * 0.5, -13], [x * 1.4, -3]], shade(robe, -0.35), 0.45);
		P.line([[-5.4, -14.6], [5.4, -14.6]], shade(robe, -0.25), 1.6);
		// a bare muscular torso
		P.shape((p) => { p.m(-6.5, -25); p.q(0, -27, 6.5, -25); p.q(6.5, -19, 5, -15); p.l(-5, -15); p.q(-6.5, -19, -6.5, -25); }, skin, -6.5, 6.5);
		P.thin([[-3.5, -22], [0, -21], [3.5, -22]], shade(skin, -0.3), 0.45); P.thin([[0, -21], [0, -16]], shade(skin, -0.3), 0.4);
		P.thin([[-2.4, -18.4], [2.4, -18.4]], shade(skin, -0.25), 0.35);
		// the trident held across the body, top right to bottom left
		P.line([[-8, -6], [13, -32]], iron, 1.1);
		for (const o of [-1.8, 0, 1.8]) P.line([[12.4 + o * 0.8, -31.6 + o * 0.6], [14.5 + o * 0.8, -36 + o * 0.6]], iron, 0.8);
		P.line([[11.2, -32.4], [14.8, -29.6]], iron, 0.9);
		// thick arms from round shoulders, both fists on the haft
		for (const [sd, fx, fy, c] of [[-1, 2, -17.5, shade(skin, -0.1)], [1, 8, -25, skin]]) {
			P.circle(sd * 6.5, -24, 2.8, c);
			taper(P, [[sd * 6.5, -24], [sd * 6 + (sd < 0 ? -1 : 5), -19], [fx, fy]], 3.2, 2.6, c);
			P.circle(fx, fy, 2, c);
			P.thin([[fx - 1, fy + 1.2], [fx + 1, fy - 1.2]], iron, 0.5);
		}
		// a neck and the dark closed helm with a crest
		P.line([[0, -26], [0.5, -28]], skin, 3.2);
		P.shape((p) => { p.m(-5, -29); p.q(-6, -38, 0, -39); p.q(6, -39, 6.5, -32); p.q(6.5, -28, 3, -27.5); p.l(-3, -27.5); p.q(-5, -27.5, -5, -29); }, iron, -6, 6.5);
		P.shape((p) => { p.m(-2, -38.6); p.q(1, -43, 4, -41); p.q(2, -40, 2, -38.6); }, iron, -2, 4);
		P.thin([[1.5, -33.5], [6.2, -33.5]], '#0e1018', 1);
		P.glow(4.4, -33.5, 1.8, '#a0c0ff', 0.4); P.dot(4.4, -33.5, 0.45, '#d0e0ff');
		P.thin([[3, -32], [3, -28.5]], shade(iron, 0.3), 0.4);
		P.gloss(-2.5, -36, 1.8, 0.9, 0.35);
	},
	// Lava golem (the cave one): a hulking golem of dark grey boulders with glowing orange cracks between them, a flame
	// burning on its low head, glowing orange eyes, molten patches on its chest and one shoulder, long rocky arms
	365(P) {
		P.shadow(15, 6);
		const rock = '#4a4248', hot = '#ff9030';
		const boulder = (x, y, rx, ry, k, c = rock) => {
			const pts = [];
			for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7 + k, f = 0.85 + 0.18 * Math.sin(k * 5 + i * 2.3); pts.push([x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f]); }
			P.poly(pts, c);
			P.gloss(x - rx * 0.35, y - ry * 0.4, rx * 0.3, ry * 0.18, 0.25);
		};
		// a glow behind everything, so the gaps between the boulders shine
		P.glow(0, -20, 18, hot, 0.25);
		// one solid rocky mass underneath: legs, arms, body, head
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 5, -12], [sd * 5.5, -6], [sd * 5.5, -2]], 7, 6.5, shade(rock, -0.2));
			taper(P, [[sd * 8, -25], [sd * 14, -19], [sd * 14.5, -9]], 7, 6.5, shade(rock, -0.2));
		}
		P.shape((p) => { p.m(-6, -10); p.q(-10, -14, -9.5, -20); p.q(-12, -27, -5, -27); p.q(-4, -35, 0.5, -35.5); p.q(5.5, -35, 5.5, -27); p.q(12, -27, 10.5, -20); p.q(10, -13, 6, -10); p.q(0, -8, -6, -10); }, shade(rock, -0.2), -12, 12);
		// legs
		for (const sd of [-1, 1]) { boulder(sd * 5, -9, 4, 3.4, sd + 1); boulder(sd * 5.5, -3.5, 4.4, 3, sd + 2); }
		// arms: three boulders each down to a big fist
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(rock, -0.08) : rock;
			boulder(sd * 12, -24, 4.4, 4, sd + 3, c); boulder(sd * 14, -17, 3.8, 3.6, sd + 4, c); boulder(sd * 14.5, -9.5, 4.4, 4, sd + 5, c);
		}
		// the body: big chest and belly boulders, the low head
		boulder(0, -14, 7, 5, 1); boulder(-4, -22, 6, 5, 2); boulder(4.5, -22, 6, 5.5, 3);
		boulder(0.5, -31, 5.5, 4.6, 4);
		// molten patches and glowing cracks
		const molten = (x, y, r) => { P.glow(x, y, r * 2.2, hot, 0.5); P.ellipse(x, y, r, r * 1.2, '#ff7a20', { line: false }); P.ellipse(x, y, r * 0.5, r * 0.6, '#ffe080', { line: false }); };
		molten(5, -21, 2.2); molten(-14, -17, 1.8);
		for (const pts of [[[-1, -26], [0, -22], [-1, -18], [1, -15]], [[-9, -20], [-6, -17], [-3, -17]], [[3, -10], [4, -13], [7, -15]], [[13, -20], [15, -18], [14, -14]]]) { P.thin(pts, '#ff8a20', 0.8); P.thin(pts, '#ffe080', 0.3); }
		// a flame on the head and glowing eyes
		P.shape((p) => { p.m(-3, -34); p.q(-4, -39, -1, -41); p.q(-1, -38.5, 1, -38); p.q(1, -42, 3.5, -45); p.q(3.5, -40, 5.5, -38.5); p.q(6, -35.5, 4, -34); }, '#ff6a20', -4, 6, { line: false });
		P.shape((p) => { p.m(-1, -34); p.q(0, -37.5, 2.5, -40); p.q(3, -37, 3.5, -34); }, '#ffd84a', -1, 3.5, { line: false });
		P.glowEyes(1.5, -30.5, 2.2, 0.75, '#ffa030');
	},
	// Wild shaman: a hunched pink-magenta goat-demon with a great shaggy white mane, short dark horns, red eyes and
	// fangs, a fringed loincloth, gourd flasks at its hip, a tufted tail, a tall wooden staff with a gourd and feathers
	// at its head gripped in front
	366(P) {
		P.shadow(14, 5.5);
		const pink = '#c4508a', mane = '#ece2d2', wood = '#9a6a3a', gourd = '#a88a3a', horn = '#3a2a2a';
		// tufted tail
		taper(P, [[-6, -14], [-13, -14], [-15, -19]], 1.6, 0.8, pink);
		for (const k of [-1, 0, 1]) P.poly([[-15, -19], [-17.5 + k * 1.4, -22.5 + Math.abs(k) * 0.6], [-14.2 + k * 0.6, -20]], mane);
		// legs: furry fetlocks, hooves
		for (const [hx, kx, fx, c] of [[-4, -9, -7, shade(pink, -0.12)], [2, 6, 4, pink]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2.5]], 4.2, 3, c);
			P.ellipse(fx, -3, 2.8, 1.8, mane);
			P.ellipse(fx + 0.6, -1, 2.6, 1.1, horn);
		}
		// hunched body, loincloth, gourds at the hip, a strap
		P.shape((p) => { p.m(-8, -14); p.q(-11, -25, -3, -29); p.q(4, -31, 7, -25); p.q(7, -17, 4, -12); p.q(-3, -10, -8, -14); }, pink, -11, 7);
		P.shape((p) => { p.m(-7, -14); p.l(4.6, -13); p.l(5, -7); p.l(2.6, -8.6); p.l(0.4, -6.6); p.l(-2, -8.6); p.l(-4.6, -6.8); p.l(-7.4, -8.4); }, '#7a5a3a', -7.4, 5);
		P.thin([[-7, -13.6], [4.6, -12.6]], mane, 0.5);
		for (const [x, y] of [[-7.6, -16], [-4.6, -14.6]]) { P.circle(x, y + 1, 2, gourd); P.circle(x, y - 1.6, 1.3, gourd); P.gloss(x - 0.6, y + 0.4, 0.6, 0.4, 0.4); }
		P.thin([[-6, -26], [3, -15]], '#8a6a2a', 0.8);
		// back arm
		taper(P, [[-4, -25], [-8, -20], [-6, -16]], 3.2, 2.6, shade(pink, -0.12));
		// the staff, gourd and feathers at its head
		P.line([[13, -2], [12.4, -38]], wood, 1.6);
		for (const y of [-34, -31]) P.thin([[11.2, y], [13.6, y + 0.4]], '#6a4a2a', 0.5);
		P.circle(12.6, -40, 2.6, gourd);
		for (const [tx, ty] of [[9, -45], [12, -46], [15.6, -44.6]]) taper(P, [[12.6, -42], [tx, ty]], 1.4, 0.4, '#8ab040');
		P.dot(12.6, -40, 0.9, '#f0d040');
		// front arm gripping the staff
		taper(P, [[4, -25], [9, -22], [12, -24]], 3.4, 2.8, pink);
		P.circle(12.6, -24.4, 2.1, pink);
		// the great shaggy white mane round the head, flowing back over the shoulders
		const maneP = [];
		for (let k = 0; k < 28; k++) {
			const a = Math.PI * 0.3 + k / 28 * Math.PI * 1.75, r = k % 2 ? 0.8 : 1.06;
			maneP.push([3 + Math.cos(a) * 11 * r, -30 + Math.sin(a) * 10 * r]);
		}
		maneP.push([5, -24], [3, -22]);
		P.poly(maneP, mane);
		for (const [x, y] of [[-6, -34], [-8, -29], [-6, -24], [-2, -36], [-3, -27], [-7, -21]]) P.thin([[x + 1.6, y - 1], [x - 1.6, y + 2]], shade(mane, -0.25), 0.4);
		// horns, and the goatish demon face looking right out of the mane
		for (const [x, tx] of [[2, -1], [5, 6]]) taper(P, [[x, -35], [x - 1, -39], [tx, -42]], 1.8, 0.4, horn);
		P.shape((p) => { p.m(1, -34.4); p.q(5, -36.6, 8, -33); p.q(10.6, -30.6, 10.4, -27.6); p.q(8.6, -24.6, 5.4, -25); p.q(1.4, -25.6, 0.6, -29); p.q(0, -32.6, 1, -34.4); }, pink, 0, 10.6);
		P.shape((p) => { p.m(1, -31); p.q(-2.4, -32.4, -3.6, -34); p.q(-1.6, -30, 0.8, -29.4); }, pink, -3.6, 1);
		P.gloss(2.6, -33.4, 1.2, 0.6, 0.4);
		P.ellipse(5.6, -31.2, 1.5, 1.1, '#fbf2e8');
		P.dot(6, -31.2, 0.7, '#c81a1a');
		P.thin([[4, -32.8], [7.6, -32.2]], shade(pink, -0.5), 0.45);
		P.dot(10, -29.2, 0.4, '#3a0a1a');
		P.shape((p) => { p.m(4.4, -27.6); p.q(7.6, -26.6, 10, -27.4); p.q(7.6, -25, 4.4, -27.6); }, '#4a0a1a', 4.4, 10, { line: false });
		for (const x of [5.6, 8.6]) P.poly([[x - 0.45, -27.2], [x + 0.45, -27.2], [x, -25.4]], '#fff6e0', { line: false });
	},
	// Purple round mage: a big round pink-red blob of a body pitted with craters, one bloodshot eye and a huge grimace of
	// square teeth, a purple robe at the bottom, a dark book under one arm, a gnarled dark staff topped by a red orb
	367(P) {
		P.shadow(14, 5.5);
		const pink = '#d04a68', robe = '#4a3a6a', staff = '#3a2a40';
		// stubby legs and the robe hem
		for (const x of [-5, 4]) { taper(P, [[x, -8], [x, -2.5]], 3.6, 3.4, shade(pink, -0.1)); P.ellipse(x + 1, -1.4, 3, 1.4, shade(pink, -0.2)); }
		P.shape((p) => { p.m(-11, -14); p.q(0, -10, 10, -14); p.l(9, -6.4); p.l(5, -7.6); p.l(1, -5.6); p.l(-3, -7.6); p.l(-7, -6); p.l(-11, -7.6); }, robe, -11, 10);
		// the staff behind the front hand, its red orb
		P.line([[15, -1], [14, -37]], staff, 1.4);
		for (const [y, d] of [[-30, 1], [-22, -1], [-14, 1]]) P.line([[14.4, y], [14.4 + d * 1.6, y - 2]], staff, 0.6);
		P.glow(14, -40.5, 5, '#ff3a4a', 0.4);
		P.circle(14, -40.5, 3.4, '#8a1020');
		P.circle(13.6, -40.2, 1.9, '#c8303a', { line: false });
		P.dot(12.8, -41.6, 0.9, '#ffffff');
		// the big round cratered body
		P.circle(-1, -24, 13, pink);
		for (const [x, y, r] of [[-9, -31, 1.4], [-6, -34, 1.1], [-11, -26, 1.2], [-3, -35.6, 0.9], [-10, -20, 1], [-7, -28, 0.8], [3, -34, 0.8]]) {
			P.ellipse(x, y, r, r * 0.8, shade(pink, -0.4), { line: false });
			P.ellipse(x + r * 0.2, y + r * 0.2, r * 0.6, r * 0.45, shade(pink, -0.6), { line: false });
		}
		P.gloss(-6, -32, 3.4, 1.6, 0.35);
		// one eye, a huge grimace of square teeth
		P.ellipse(5, -30, 2.8, 2.4, '#fbf2e8');
		P.dot(5.4, -30, 1.3, '#8a1010');
		P.dot(5.4, -30, 0.6, '#1a0606');
		P.thin([[2, -33.4], [7.6, -32.4]], shade(pink, -0.5), 0.6);
		P.shape((p) => { p.m(-0.6, -25.6); p.q(5, -27, 10.4, -25); p.q(10, -19.4, 4.4, -19.4); p.q(-0.4, -20, -0.6, -25.6); }, '#3a0a10', -0.6, 10.4);
		for (let i = 0; i < 5; i++) { const x = 0.6 + i * 2; P.ellipse(x + 0.9, -24.4 + Math.abs(i - 2) * 0.2, 0.9, 1.1, '#f6ecd0', { line: false }); P.ellipse(x + 0.9, -21.2 - Math.abs(i - 2) * 0.1, 0.9, 1, '#e8dcbc', { line: false }); }
		// arms: the back one with the book, the front one gripping the staff
		P.shape((p) => { p.m(-14, -12); p.l(-7, -15); p.l(-5.6, -8); p.l(-12.6, -5.4); }, '#3a3a4a', -14, -5.6);
		P.poly([[-13, -11.6], [-7.4, -14], [-7, -12.6], [-12.6, -10.4]], '#e8e0d0');
		taper(P, [[-10, -20], [-11, -15], [-9, -11]], 3.4, 2.8, shade(pink, -0.08));
		taper(P, [[9, -19], [12, -16], [14, -18]], 3.2, 2.8, pink);
		P.circle(14.4, -18.4, 2.2, pink);
	},
	// Pot of greed: an olive iron cauldron for a head, green smoke curling from its rim and ring handles on its sides, a
	// skull face moulded on the front with a long yellow tongue lolling out, a stout body of tan stone blocks with big
	// fists, and a pool of dripping green slime for legs
	368(P) {
		P.shadow(14, 5);
		const iron = '#6a6a3a', stone = '#c8b080', slime = '#b8c030';
		// the slime pool and its drips running down from the body
		P.shape((p) => { p.m(-6, -11); p.q(-7, -5, -11, -2.5); p.q(-12, -0.5, -7, -0.5); p.q(-3, 0.5, 0, -0.8); p.q(5, 0.5, 9, -0.6); p.q(13, -1.6, 9, -3); p.q(6, -5, 6, -11); }, slime, -12, 13);
		for (const [x, y] of [[-3, -4], [3, -6], [-8, -1.5]]) P.ellipse(x, y, 0.9, 1.6, shade(slime, 0.4), { line: false });
		// the stone body: big blocks
		for (const [x, y, w, h] of [[-8, -22, 8, 7], [0, -22, 8, 7], [-7, -15.5, 7, 6], [0, -15.5, 7, 6]]) P.shape((p) => { p.m(x + 1, y); p.l(x + w - 0.5, y + 0.3); p.l(x + w, y + h - 1); p.l(x + w - 1, y + h); p.l(x + 0.5, y + h - 0.3); p.l(x, y + 1); }, stone, x, x + w);
		// arms of stone blocks, big fists
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(stone, -0.1) : stone;
			P.ellipse(sd * 10, -20, 3.2, 3, c);
			P.ellipse(sd * 12, -14.5, 3, 3.2, c);
			P.ellipse(sd * 12.5, -9, 3.6, 3.4, c);
			for (const k of [-1, 0, 1]) P.thin([[sd * 12.5 + k * 1.2, -7], [sd * 12.5 + k * 1.2, -5.8]], shade(stone, -0.45), 0.4);
		}
		// green smoke curling up out of the pot
		for (const [x, y, r] of [[-2, -40, 2.4], [1, -43, 2], [-1, -45.5, 1.5], [3, -39.5, 1.8]]) P.circle(x, y, r, '#a8b498', { alpha: 0.6, line: false });
		// the cauldron head: ring handles, a rim, a skull face, the tongue
		for (const sd of [-1, 1]) { P.circle(sd * 9, -30, 2.2, iron); P.circle(sd * 9, -30, 1.1, '#e0dcc8', { line: false }); }
		P.shape((p) => { p.m(-8.5, -36); p.l(8.5, -36); p.q(10, -26, 6, -22); p.l(-6, -22); p.q(-10, -26, -8.5, -36); }, iron, -10, 10);
		P.ellipse(0, -36.5, 9.5, 2.2, shade(iron, -0.1));
		P.ellipse(0, -36.8, 7.5, 1.3, '#aac040', { line: false });
		P.glow(0, -37, 5, '#d8ff60', 0.4);
		P.ellipse(-3, -30, 2.2, 2, '#2a2414', { line: false }); P.ellipse(3, -30, 2.2, 2, '#2a2414', { line: false });
		P.glowEyes(0, -30, 3, 0.5, '#d8ff60');
		P.poly([[-0.8, -26.8], [0.8, -26.8], [0, -28]], '#2a2414', { line: false });
		P.thin([[-4, -24.6], [4, -24.6]], '#2a2414', 0.8);
		for (const x of [-3, -1.5, 0, 1.5, 3]) P.thin([[x, -25.4], [x, -23.8]], '#2a2414', 0.3);
		P.shape((p) => { p.m(-1.4, -24.4); p.q(-2, -19, 2, -18.5); p.q(6, -19, 5, -22); p.q(3.6, -20.8, 2.6, -21.5); p.q(2, -23.5, 1.4, -24.4); }, '#e8c838', -2, 6);
		P.gloss(-5, -33.5, 2, 1, 0.35);
	},
	// Walking pot of greed: what is left of the pot of greed once it is beaten down: the olive iron cauldron alone, green
	// smoke curling from it, its moulded skull face and lolling yellow tongue, tottering on two stubby iron feet with a
	// the moulded skull face with its fangs bared
	369(P) {
		P.shadow(11, 4.5);
		const iron = '#6a6a3a', bone = '#ece4c4';
		// stubby feet
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 4, -6], [sd * 4.6, -1.8]], 3, 2.4, shade(iron, -0.15));
			P.ellipse(sd * 4.6 + 0.8, -1.1, 2.8, 1.2, shade(iron, -0.3));
		}
		// green smoke curling up out of the pot
		for (const [x, y, r] of [[-2, -31, 2.6], [1.4, -34, 2.2], [-0.6, -37, 1.6], [3.4, -30.4, 2]]) P.circle(x, y, r, '#a8b498', { alpha: 0.6, line: false });
		// ring handles, the cauldron, its rim and the glowing green brew
		for (const sd of [-1, 1]) { P.circle(sd * 11.4, -18, 2.6, iron); P.circle(sd * 11.4, -18, 1.3, '#e0dcc8', { line: false }); }
		P.shape((p) => { p.m(-10.5, -26); p.l(10.5, -26); p.q(13, -13, 8, -4.4); p.l(-8, -4.4); p.q(-13, -13, -10.5, -26); }, iron, -12, 12);
		P.ellipse(0, -26.4, 11.4, 2.6, shade(iron, -0.1));
		P.ellipse(0, -26.7, 9, 1.5, '#aac040', { line: false });
		P.glow(0, -27, 6, '#d8ff60', 0.45);
		// the skull face: hollow glowing eyes, a nose hole, clenched teeth
		P.ellipse(-3.6, -19, 2.6, 2.4, '#2a2414', { line: false }); P.ellipse(3.6, -19, 2.6, 2.4, '#2a2414', { line: false });
		P.glowEyes(0, -19, 3.6, 0.6, '#d8ff60');
		P.poly([[-1, -15.2], [1, -15.2], [0, -16.6]], '#2a2414', { line: false });
		P.shape((p) => { p.m(-5.4, -13.4); p.q(0, -14.6, 5.4, -13.4); p.q(4.4, -8.4, 0, -8); p.q(-4.4, -8.4, -5.4, -13.4); }, '#2a1408', -5.4, 5.4, { line: false });
		for (const x of [-4, -2, 0, 2, 4]) P.poly([[x - 0.6, -13.6 + Math.abs(x) * 0.1], [x + 0.6, -13.6 + Math.abs(x) * 0.1], [x, -11.4]], bone, { line: false });
		for (const x of [-3, -1, 1, 3]) P.poly([[x - 0.55, -8.5], [x + 0.55, -8.5], [x, -10.4]], bone, { line: false });
		// the long yellow tongue lolling out of the corner of the mouth and curling round
		P.shape((p) => { p.m(1.4, -10.6); p.q(6, -11.4, 9, -8.6); p.q(11.6, -5.6, 9.6, -3.6); p.q(7.4, -2.4, 6.8, -4.6); p.q(8.6, -4.4, 8.6, -6.2); p.q(7.6, -8.6, 2, -8.8); }, '#e8c838', 1.4, 11.6);
		P.thin([[3, -9.8], [7.4, -8.6], [9, -6.4]], shade('#e8c838', -0.3), 0.4);
		P.gloss(-6, -22.4, 2.2, 1.1, 0.35);
	},
	// Koh: a crouching four-legged beast of raw red flesh carrying a huge cracked stone head, with a calm sleeping mask
	// set into the top of it, tipped back to look up and a little to the right; bone plates along its flank, and under
	// the stone a gaping fanged maw with a long lolling red tongue
	370(P) {
		P.shadow(15, 5.5);
		const red = '#b8323a', dark = '#7a1e26', stone = '#e6dcc4', bone = '#efe6d2';
		// four thick clawed legs, far pair darker
		for (const [hx, kx, fx, c] of [[-9, -12, -11, dark], [4, 8, 7, dark], [-6, -8, -7, red], [7, 12, 12, red]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2.5]], 5.4, 3.6, c);
			for (const d of [-1, 0, 1]) taper(P, [[fx, -2.5], [fx + d * 1.4 + 1, -0.6]], 1.4, 0.4, c);
		}
		// the body, with bone plates along its back
		P.shape((p) => { p.m(-13, -12); p.q(-14, -22, -4, -22); p.q(6, -22, 11, -16); p.q(11, -10, 6, -9); p.l(-10, -9); p.q(-13, -9, -13, -12); }, red, -14, 11);
		for (const [x, y, w] of [[-10, -18, 3], [-5.5, -20, 3.2], [-9, -13.5, 2.6]]) P.ellipse(x, y, w, w * 0.6, bone);
		for (const [x0, x1] of [[-3, -1], [0, 2], [3, 5]]) P.thin([[x0, -18], [x1, -12]], shade(red, -0.4), 0.45);
		// the maw under the mask: a fleshy neck, the lower jaw, fangs, the tongue
		P.shape((p) => { p.m(5, -20); p.q(12, -21, 19, -17); p.q(20, -10, 13, -8.5); p.q(7, -9, 5, -12); }, red, 5, 20);
		P.shape((p) => { p.m(8, -18.5); p.q(14, -18.5, 18.5, -16); p.q(18, -11.5, 13, -10.8); p.q(9, -11.5, 8, -18.5); }, '#4a0810', 8, 18.5, { line: false });
		for (const [x, y, up] of [[9.6, -18.2, 0], [12, -18, 0], [14.4, -17.4, 0], [16.8, -16.4, 0], [10.6, -11.2, 1], [13.2, -10.9, 1], [15.8, -11.6, 1]]) P.poly(up ? [[x - 0.8, y], [x + 0.8, y], [x, y - 2.6]] : [[x - 0.8, y], [x + 0.8, y], [x, y + 2.8]], bone);
		taper(P, [[13, -12], [18, -9.5], [19, -5], [22, -5.5]], 2.8, 1.8, '#e0405a');
		// the huge stone head: angular cracked blocks at the back, and set into its top and upper front a great calm mask,
		// tipped back so it looks up, a little to the right and a little toward us (crown at the left, chin at the right)
		P.shape((p) => { p.m(-7.1, -17.2); p.q(-15, -21.5, -14.6, -29); p.l(-12.6, -36); p.l(-8.6, -41.4); p.l(-3, -44.8); p.q(4, -47.6, 10, -45); p.l(13.6, -43.6); p.l(17.2, -40.6); p.q(20, -37, 21.6, -31.6); p.q(23.8, -29, 23.6, -26.2); p.q(23.4, -23.4, 19.4, -22.6); p.q(12.9, -19.6, 3.9, -19); p.q(-2.5, -16.6, -7.1, -17.2); }, stone, -16, 34);
		const line = shade(stone, -0.6), crack = shade(stone, -0.45), hollow = shade(stone, -0.18);
		// the mask's face plane, a little lighter than the rock around it
		P.shape((p) => { p.m(-1, -43.4); p.q(4, -46.4, 9.6, -44.2); p.l(13.2, -42.8); p.l(16.6, -40); p.q(19.2, -36.6, 20.8, -31.4); p.q(22.8, -28.8, 22.6, -26.4); p.q(22.2, -24, 19, -23.4); p.l(15.6, -21.6); p.l(8, -24); p.l(1.2, -29.6); p.l(-1.6, -36); }, shade(stone, 0.16), -6, 40, { line: false });
		// cracks: the edge of the mask, and the blocks of the back of the head
		for (const pts of [[[-1, -44.6], [-1.6, -36], [1.2, -29.6], [8, -24], [15.6, -21.4]], [[-8.6, -41.4], [-6.2, -35.2], [-1.6, -36]], [[-6.2, -35.2], [-8.4, -28], [-14.2, -27.2]], [[-8.4, -28], [-3.6, -23.4], [-4.6, -17.6]], [[-3.6, -23.4], [1.2, -29.6]], [[8, -24], [8.6, -19.6]], [[-12.6, -36], [-10, -33.4]]]) P.thin(pts, crack, 0.6);
		// the near eye: a shadowed socket under a heavy brow, the lid closed in a long dark slit
		P.ellipse(4.8, -36.4, 3.6, 2, hollow, { line: false, rot: -0.5 });
		P.thin([[0.6, -35.6], [2, -38], [4.6, -39.6], [8.8, -39.9]], crack, 0.75);
		P.shape((p) => { p.m(1.8, -33.8); p.q(5.2, -37.8, 8.6, -37.6); p.q(6, -34.6, 1.8, -33.8); }, line, 0, 1, { flat: true, line: false });
		// the far eye, a closed slit in its hollow beyond the bridge of the nose
		P.ellipse(12.8, -42, 2.3, 1.1, hollow, { line: false, rot: 0.45 });
		P.thin([[10.8, -42.9], [12.6, -42.3], [14.8, -41]], line, 0.8);
		// the nose rising out of the face: its shadow, the side toward us, the ridge to the tip, a nostril
		P.poly([[9.2, -38.6], [12.8, -32.6], [10.2, -33], [7.8, -37]], hollow, { line: false, alpha: 0.8 });
		P.shape((p) => { p.m(9.4, -39); p.l(15.4, -40.4); p.q(17.4, -40.2, 17.6, -38.4); p.l(18, -35); p.q(17.6, -32.8, 15.4, -32.6); p.l(12.8, -32.6); }, shade(stone, 0.2), 4, 40, { line: false });
		P.shape((p) => { p.m(16.2, -40.2); p.q(17.4, -40.2, 17.6, -38.4); p.l(18, -35); p.q(17.6, -32.8, 15.4, -32.6); p.l(12.8, -32.6); }, shade(stone, -0.14), 0, 1, { flat: true, line: false });
		P.thin([[9.4, -39], [15.4, -40.4], [16.8, -40.2], [17.6, -38.4], [18, -35], [17.2, -33], [15.4, -32.6], [12.8, -32.6]], crack, 0.7);
		P.thin([[12.8, -32.6], [9.4, -39]], shade(stone, -0.3), 0.45);
		P.ellipse(15.9, -35.2, 1.2, 0.75, line, { line: false, flat: true, rot: -0.9 });
		// full, calm lips, a little parted, and the chin beyond them
		P.shape((p) => { p.m(14.4, -28.4); p.q(17.2, -32.6, 20.8, -31.2); p.q(17.8, -30, 14.4, -28.4); }, shade(stone, -0.24), 15, 21, { flat: true, line: false });
		P.shape((p) => { p.m(14.4, -28.4); p.q(17.8, -30, 20.8, -31.2); p.q(20.6, -26.6, 14.4, -28.4); }, shade(stone, 0.3), 15, 21, { flat: true, line: false });
		P.thin([[14.4, -28.4], [17.6, -29.8], [20.8, -31.2]], line, 0.9);
		P.thin([[15.6, -26.9], [18.4, -26.5], [20.6, -27.6]], shade(stone, -0.3), 0.5);
		// a hollow cheek, and the light on the brow and the back of the head
		P.ellipse(9.4, -28.6, 3.6, 2.2, shade(stone, -0.08), { line: false, alpha: 0.6, rot: 0.4 });
		P.gloss(4, -43, 2.8, 1, 0.5);
		P.gloss(-9.4, -33, 2, 1.1, 0.35);
	},
	// Hooded occultist (the 6B boss): a tall robed cultist in a pointed brown sack hood with dark eye holes, a rust-orange
	// robe with dark red trim and ragged hem, a bundle of scrolls under one arm and a red tome with a golden sigil held
	// open in thin grey-green hands
	371(P) {
		P.shadow(12, 4.5);
		const robe = '#c46a24', trim = '#7a2a1a', hood = '#7a5032', hand = '#a8b498', book = '#a01e1e', gold = '#e0b840';
		// the long robe, ragged at the hem, dark red trim down the front
		P.shape((p) => { p.m(-6, -28); p.l(6, -28); p.q(9, -14, 11, -1.4); p.l(8, -2.6); p.l(5.4, -0.6); p.l(2.6, -2.4); p.l(0, -0.4); p.l(-2.8, -2.4); p.l(-5.4, -0.6); p.l(-8, -2.6); p.l(-11, -1.4); p.q(-9, -14, -6, -28); }, robe, -11, 11);
		P.thin([[1, -27], [2, -2]], trim, 1.2);
		for (const x of [-5, 6]) P.thin([[x * 0.6, -24], [x, -3]], shade(robe, -0.3), 0.45);
		P.line([[-7, -16.6], [7.4, -16.6]], trim, 1.2);
		P.gloss(-5, -24, 1.4, 1, 0.3);
		// the bundle of scrolls under the far arm
		for (const [x, y, a] of [[-10, -24, -0.5], [-11, -21, -0.3], [-9, -22, -0.7]]) {
			taper(P, [[x - 2.4 * Math.sin(a), y + 4], [x + 2.4 * Math.sin(a), y - 5]], 2, 2, '#ecdcb4');
			P.ellipse(x + 2.4 * Math.sin(a), y - 5, 1, 0.6, '#d4c090');
		}
		taper(P, [[-5.6, -27], [-10, -21], [-7, -17]], 3.4, 2.6, shade(robe, -0.1));
		P.circle(-6.6, -17.2, 1.5, hand);
		// the red tome held in front with both hands
		taper(P, [[5.6, -27], [10, -22], [8, -18]], 3.4, 2.6, robe);
		P.poly([[2, -24], [10.6, -26], [12, -15.4], [3.4, -13.6]], shade(book, -0.15));
		P.poly([[2.6, -23.4], [10, -25.2], [11.2, -15.8], [3.8, -14.2]], book);
		P.thin([[4.8, -21], [7, -17.6], [9.2, -21.6], [4.8, -21]], gold, 0.45);
		P.thin([[7, -22.6], [7, -16.6]], gold, 0.35);
		P.thin([[5.4, -19.6], [9, -19.6]], gold, 0.35);
		for (const [x, y] of [[3.6, -18], [11, -20]]) {
			P.circle(x, y, 1.6, hand);
			for (const d of [-0.5, 0.5]) P.thin([[x - 1, y + d], [x + 1, y + d]], shade(hand, -0.4), 0.3);
		}
		// the tall pointed sack hood, eye holes and a stitched seam
		P.shape((p) => { p.m(-6.4, -26.6); p.q(-7.4, -34, -3.6, -38); p.q(-1, -41, 1.4, -46); p.q(4, -40, 6, -37); p.q(8.6, -32, 7, -26.6); p.q(0, -24.4, -6.4, -26.6); }, hood, -7.4, 8.6);
		P.thin([[1.4, -45], [0.6, -38], [1.2, -27]], shade(hood, -0.35), 0.45);
		for (const y of [-41, -38, -35]) P.thin([[0.2, y], [1.8, y + 0.6]], shade(hood, -0.45), 0.35);
		for (const x of [-2.4, 4]) { P.ellipse(x, -31.6, 1.5, 1.8, '#1a0e08'); P.dot(x + 0.3, -31.4, 0.5, '#ffd060'); }
		P.gloss(-3.6, -35, 1.2, 1.6, 0.3);
	},
	// Purple masked executioner: a tall figure in a stitched purple hood with a floppy pointed top and a gold bell at the
	// throat, eyeholes in its mask, a layered purple robe tied with a sash, wrapped hands on a long pole with a golden
	// crescent blade at its lower end
	373(P) {
		P.shadow(13, 5);
		const purple = '#7a5aaa', dark = '#4e3a7a', gold = '#e0b850', sash = '#7a3a6a';
		// boots under the robe
		for (const x of [-4, 4]) P.ellipse(x + 1, -1.4, 3.2, 1.6, '#3a2e4a');
		// the long layered robe
		P.shape((p) => { p.m(-7, -26); p.q(0, -28, 7, -26); p.q(10, -12, 10, -2); p.l(6, -3.4); p.l(3, -1.6); p.l(0, -3.2); p.l(-3, -1.6); p.l(-6, -3.4); p.l(-10, -2); p.q(-10, -12, -7, -26); }, dark, -10, 10);
		P.shape((p) => { p.m(-3, -22); p.l(3, -22); p.q(5, -12, 4, -4); p.l(0, -5.4); p.l(-4, -4); p.q(-5, -12, -3, -22); }, purple, -5, 5);
		P.thin([[-7.6, -16.4], [0, -15], [7.6, -16.4]], sash, 1.6);
		P.line([[1, -15.2], [2, -10.4]], sash, 0.8);
		// the pole with its golden crescent blade, held across the body
		P.line([[13, -22], [-11, -6]], '#6a4a2a', 1.2);
		P.circle(13.4, -22.4, 1.2, gold);
		P.shape((p) => { p.m(-8, -10); p.q(-18, -16, -21, -7); p.q(-21, 1, -13, 1.6); p.q(-16, -2, -16.6, -6.4); p.q(-15, -12, -9.6, -7.6); }, gold, -21, -8);
		P.thin([[-17, -12], [-19.4, -7], [-17, -1.6]], '#fff0b0', 0.4);
		P.ellipse(-10, -7.6, 1.8, 1.2, gold);
		// arms crossing to the pole, wrapped hands
		taper(P, [[-6, -25], [-8, -18], [-4, -13]], 3.4, 2.8, purple);
		P.circle(-3.6, -12.8, 1.8, '#e0d8c8');
		taper(P, [[6, -25], [9, -20], [6.6, -17.4]], 3.4, 2.8, purple);
		P.circle(6.4, -17.4, 1.8, '#e0d8c8');
		// the hood's ragged mantle over the shoulders
		P.shape((p) => { p.m(-9, -24); p.q(0, -31, 9, -24); p.l(7, -21); p.l(4, -22.6); p.l(1, -20); p.l(-2, -22.4); p.l(-5, -20.4); p.l(-7.4, -22.2); }, purple, -9, 9);
		// the hood with its floppy pointed top
		P.shape((p) => { p.m(-5.6, -26); p.q(-7, -36, -2, -39); p.q(-2, -44, -4.6, -46); p.q(1, -45, 2.6, -40); p.q(7, -37, 6.6, -26); p.q(0.5, -23.6, -5.6, -26); }, purple, -7, 7);
		P.thin([[0.4, -39], [0.6, -26.4]], shade(purple, -0.45), 0.4);
		for (const y of [-37, -34, -31, -28]) P.thin([[-0.4, y], [1.4, y + 0.6]], shade(purple, -0.45), 0.35);
		P.gloss(-3.6, -35, 1.2, 1.8, 0.3);
		// eyeholes in the mask
		for (const x of [-2.4, 3.2]) { P.ellipse(x, -32.4, 1.4, 1, '#1a1024', { line: false }); P.dot(x + 0.3, -32.4, 0.45, '#e8d8ff'); }
		// the gold bell at the throat
		P.shape((p) => { p.m(-0.6, -27.6); p.q(-2.2, -26.6, -2.4, -23.6); p.l(3.2, -23.6); p.q(3, -26.6, 1.4, -27.6); }, gold, -2.4, 3.2);
		P.dot(0.4, -23.2, 0.6, '#8a6a20');
	},
	// Alien tentacle: a ribbed purple alien hunched on two clawed legs, a long smooth crest of a head with three round
	// pores along its side and a skeletal grinning jaw, ruffled gill plates round the neck and long tentacles for arms
	374(P) {
		P.shadow(14, 5);
		const purple = '#9a4a8a', dark = '#6a2a5e', light = '#c070b0';
		// the tail-tentacle behind
		taper(P, [[-5, -14], [-13, -14], [-16, -9], [-13, -6]], 2.6, 0.5, dark);
		// legs: thigh, back-bent shin, clawed foot
		for (const [hx, kx, ax, fx, c] of [[-3, -8, -5, -7, dark], [3, 6, 4, 6, purple]]) {
			taper(P, [[hx, -13], [kx, -9]], 4.4, 3, c);
			taper(P, [[kx, -9], [ax, -5], [fx, -2.5]], 3, 2, c);
			for (const d of [-1, 0, 1]) taper(P, [[fx, -2.5], [fx + d * 1.5 + 1.2, -0.6]], 1.2, 0.3, c);
		}
		// the far tentacle arm
		taper(P, [[-3, -23], [-11, -22], [-14, -15], [-10, -12]], 3, 0.6, dark);
		// a ribbed, hunched body
		P.shape((p) => { p.m(-6, -15); p.q(-8, -25, -1, -28); p.q(6, -28, 7, -21); p.q(6, -14, 3, -11.5); p.l(-4, -11.5); p.q(-6, -12, -6, -15); }, purple, -8, 7);
		for (const y of [-24, -21, -18, -15]) P.thin([[-4, y + 1], [0, y], [4.5, y + 1]], shade(purple, -0.35), 0.5);
		P.gloss(-3.5, -24, 1.8, 1, 0.35);
		// ruffled gill plates round the neck
		for (const [x, y] of [[-6, -27], [-4.5, -30], [-2, -31.5], [-6.5, -23.5]]) P.ellipse(x, y, 3, 1.8, light, { rot: -0.4 });
		// the head: a long crest swept back, three pores, a skeletal jaw full of teeth
		P.shape((p) => { p.m(-1, -28); p.q(-4, -38, -1, -43); p.q(3, -42, 6, -36); p.q(12, -33, 15, -28); p.q(13, -25, 9, -25); p.q(3, -24, -1, -28); }, purple, -4, 15);
		P.thin([[-1, -42], [3, -35], [12, -30]], shade(purple, -0.3), 0.45);
		for (const [x, y] of [[1, -31.5], [3.6, -31], [6.2, -30.4]]) { P.circle(x, y, 1.2, '#2a0a24'); P.dot(x - 0.3, y - 0.3, 0.35, light); }
		P.shape((p) => { p.m(9, -27); p.q(13, -27.4, 15, -27.6); p.q(14.5, -23.5, 10.5, -23.2); p.q(8.5, -24, 9, -27); }, '#2a0a1e', 8.5, 15, { line: false });
		for (const x of [10.6, 12, 13.4]) { P.poly([[x - 0.5, -27.4], [x + 0.5, -27.4], [x, -25.4]], '#f6eee0'); P.poly([[x - 0.45, -23.6], [x + 0.45, -23.6], [x, -25.2]], '#f6eee0'); }
		P.shape((p) => { p.m(8.5, -24); p.q(12, -21.5, 14.5, -23.4); p.q(13, -20.5, 9.5, -21); }, dark, 8.5, 14.5);
		// the near tentacle arm curling forward and out
		taper(P, [[3, -22], [10, -18], [15, -18], [17, -13], [20, -14]], 3.2, 0.6, purple);
		for (const [x, y] of [[11, -17.4], [14, -17.4], [16.4, -15]]) P.dot(x, y + 0.6, 0.4, light);
	},
	// Formless deamon: a hunched sandy demon of bone and sinew, long curved horns and a ridge of spikes down its back,
	// glowing yellow eyes over a fanged jaw, long arms armoured with orange plates ending in big hooked claws, a spiked tail
	375(P) {
		P.shadow(14, 5);
		const skin = '#c8a464', plate = '#d88a30', bone = '#f0e2c0';
		// spiked tail
		taper(P, [[-4, -12], [-12, -10], [-16, -4], [-12, -1.6]], 3, 0.6, skin);
		for (const [x, y] of [[-11, -11], [-14.6, -7.4]]) P.poly([[x + 1, y], [x - 1.6, y - 3], [x - 0.6, y + 0.6]], bone);
		for (const [hx, kx, fx, c] of [[-3, -8, -5, shade(skin, -0.12)], [3, 8, 5.5, skin]]) {
			taper(P, [[hx, -13], [kx, -8], [fx, -2]], 4.4, 2.6, c);
			P.ellipse(fx + 0.8, -1.3, 2.8, 1.2, shade(skin, -0.25));
			for (const k of [-1, 0, 1]) P.thin([[fx + 0.8 + k * 1.1, -0.8], [fx + 1.6 + k * 1.2, 0.5]], bone, 0.45);
		}
		// spikes along the back, the hunched ribby body
		for (const [x, y, tx, ty] of [[-7, -20, -14, -22], [-6, -24, -13, -29], [-3, -27, -8, -34], [1, -29, -1, -37]]) taper(P, [[x, y], [tx, ty]], 2.6, 0.3, bone);
		P.shape((p) => { p.m(-7, -12); p.q(-10, -22, -3, -28); p.q(4, -31, 8, -24); p.q(9, -16, 5, -11.6); p.q(-1, -9.6, -7, -12); }, skin, -10, 9);
		for (const y of [-22, -19, -16]) P.thin([[-2, y], [5, y + 0.4]], shade(skin, -0.38), 0.45);
		P.gloss(-5, -22, 1.4, 0.8, 0.3);
		// long arms hanging forward, the forearms armoured with curved orange plates, big hooked claws near the ground
		for (const [sx, mx, ex, c] of [[-4, -12, -8, shade(skin, -0.1)], [5, 14.5, 11, skin]]) {
			taper(P, [[sx, -24], [mx, -19], [ex, -14]], 3.8, 3, c);
			P.circle(mx, -19, 2, c);
			taper(P, [[mx, -19], [mx + (ex > 0 ? 0.6 : -0.6), -12], [ex, -6]], 4.4, 2.4, plate);
			for (const t of [0.35, 0.65]) P.thin([[mx + (ex - mx) * t - 2, -19 + 14 * t], [mx + (ex - mx) * t + 2, -19 + 14 * t - 0.6]], shade(plate, -0.4), 0.5);
			for (const k of [-1, 0, 1]) taper(P, [[ex + k * 1.4, -6], [ex + k * 2 + (ex > 0 ? 2.6 : -2.6), -2.4], [ex + k * 2 + (ex > 0 ? 4.6 : -4.6), -6]], 2.4, 0.3, '#e8cc98');
		}
		// the head low and forward: long horns, glowing eyes, a fanged jaw
		for (const [x, c] of [[3, shade(bone, -0.15)], [7, bone]]) taper(P, [[x, -33], [x - 1, -40], [x + 2, -45]], 2.8, 0.4, c);
		P.line([[3, -26], [5, -29]], skin, 3);
		P.shape((p) => { p.m(1.6, -31); p.q(4, -36, 9, -34.6); p.q(13, -33, 14, -29); p.q(13.6, -26.6, 11, -26.2); p.q(6, -25, 2.4, -27); p.q(1, -29, 1.6, -31); }, skin, 1, 14);
		P.shape((p) => { p.m(6, -28.4); p.q(10, -28.6, 13.6, -28.6); p.q(12, -26.2, 7, -26.6); }, '#3a1a0a', 6, 13.6, { line: false });
		for (const x of [8, 10, 12]) P.poly([[x - 0.45, -28.5], [x + 0.45, -28.5], [x, -27.2]], '#fff6e0', { line: false });
		P.thin([[5, -32.2], [10.6, -31.4]], shade(skin, -0.5), 0.6);
		for (const x of [6.6, 10]) { P.ellipse(x, -30.6, 1.1, 0.8, '#2a1406', { line: false }); P.glow(x, -30.6, 1.8, '#ffd23f', 0.6); P.dot(x, -30.6, 0.5, '#ffe26a'); }
		P.gloss(4, -33.4, 1.2, 0.6, 0.4);
	},
	// Owl-lion: a lion's tawny body padding along on four big paws, a black mane, a tufted tail, and an owl's head: a cream
	// feathered facial disc, tall ear tufts, round staring eyes and a small hooked orange beak
	376(P) {
		P.shadow(18, 5.5);
		const tawny = '#b8823e', dark = '#8a5a2a', cream = '#ead6a8', mane = '#3a3028';
		// tail with a dark tuft
		taper(P, [[-12, -16], [-19, -18], [-20, -24], [-17, -27]], 1.8, 1, tawny);
		P.ellipse(-17, -27.6, 2, 1.4, mane, { rot: -0.6 });
		// far legs
		for (const [x0, x1] of [[-9, -11], [6, 9]]) { taper(P, [[x0, -12], [x1, -2]], 4.4, 3.4, dark); P.ellipse(x1 + 1, -1.4, 3, 1.4, shade(dark, -0.1)); }
		// the body
		P.shape((p) => { p.m(-15, -16); p.q(-15, -24, -6, -24); p.l(6, -26); p.q(12, -24, 12, -16); p.q(10, -10, 4, -10.6); p.l(-9, -10.4); p.q(-15, -10.4, -15, -16); }, tawny, -15, 12);
		for (const x of [-10, -6, -2]) P.thin([[x, -22], [x - 1, -19]], shade(tawny, -0.3), 0.4);
		P.gloss(-9, -21.6, 3, 1.2, 0.35);
		// near legs with big paws
		for (const [x0, x1] of [[-6, -6], [9, 12]]) {
			taper(P, [[x0, -14], [x1, -2]], 5, 3.8, tawny);
			P.ellipse(x1 + 1, -1.4, 3.4, 1.6, shade(tawny, -0.08));
			for (const k of [0, 1]) P.thin([[x1 + k * 1.4, -2.4], [x1 + k * 1.4 + 0.2, -0.8]], shade(tawny, -0.45), 0.4);
		}
		// the black mane round the neck
		const mn = [];
		for (let k = 0; k < 18; k++) { const a = Math.PI * 0.55 + k / 17 * Math.PI * 1.3, r = k % 2 ? 0.8 : 1.08; mn.push([8 + Math.cos(a) * 10 * r, -27 + Math.sin(a) * 9 * r]); }
		mn.push([12, -20]);
		P.poly(mn, mane);
		// the owl head: ear tufts, the cream facial disc, staring eyes, the small hooked beak
		for (const [x, tx] of [[5, 2], [12, 15]]) P.poly([[x - 1.8, -33], [tx, -42], [x + 1.6, -33.6]], tawny);
		P.circle(9, -29, 6.4, tawny);
		P.ellipse(10, -28, 5.2, 5, cream);
		for (const x of [7.6, 12.4]) {
			P.circle(x, -29.4, 1.9, '#f8f4e8');
			P.dot(x + 0.3, -29.4, 1, '#1a1208');
			P.dot(x - 0.2, -29.9, 0.35, '#ffffff');
			P.thin([[x - 2.4, -31.8], [x + 1.6, -31.2]], dark, 0.4);
		}
		P.shape((p) => { p.m(9, -27.8); p.l(11.4, -27.8); p.q(11.6, -25, 10, -24.6); p.q(10.4, -26, 9, -27.8); }, '#e88a3a', 9, 11.6);
		P.gloss(6, -33, 1.4, 0.7, 0.4);
	},
	// Hungry ginny: a squat blue-violet heap of muscle with no head, just lumps, each with its own fanged mouth and dotted
	// with little bubble warts; gold armbands, a gold necklace with a violet gem, a red loincloth, thick arms to the ground
	377(P) {
		P.shadow(16, 5);
		const blue = '#5a5ac8', dark = '#4242a0', gold = '#e0b040', red = '#a0303a';
		const mouth = (x, y, w, h) => {
			P.shape((p) => { p.m(x - w, y); p.q(x, y - h * 0.6, x + w, y); p.q(x, y + h, x - w, y); }, '#3a0e1a', x - w, x + w);
			for (let k = -1; k <= 1; k++) { P.poly([[x + k * w * 0.55 - 0.45, y - h * 0.22], [x + k * w * 0.55 + 0.45, y - h * 0.22], [x + k * w * 0.55, y + h * 0.3]], '#fff6e0', { line: false }); }
			for (const k of [-0.3, 0.3]) P.poly([[x + k * w * 1.4 - 0.4, y + h * 0.6], [x + k * w * 1.4 + 0.4, y + h * 0.6], [x + k * w * 1.4, y + h * 0.15]], '#fff6e0', { line: false });
		};
		// stubby legs
		for (const x of [-5, 5]) { taper(P, [[x, -10], [x * 1.1, -2]], 5.4, 4.6, dark); P.ellipse(x * 1.15, -1.4, 3.6, 1.6, shade(dark, -0.2)); }
		// arms down to big fists, gold armbands
		for (const [s, c] of [[-1, dark], [1, blue]]) {
			taper(P, [[s * 11, -24], [s * 17, -16], [s * 15, -6]], 6, 4.6, c);
			P.ellipse(s * 15, -4.6, 3.6, 3, c);
			P.line([[s * 13.6, -14], [s * 18, -13]], gold, 1.4);
		}
		// the heap of lumps
		P.ellipse(0, -18, 12, 9, blue);
		for (const [x, y, r] of [[-8, -28, 6.4], [7, -29, 6.6], [0, -35, 6.2], [-11, -20, 5], [11, -20, 5]]) P.circle(x, y, r, x < 0 ? shade(blue, -0.04) : blue);
		for (const [x, y, r] of [[-4, -38, 1], [3, -40, 0.9], [-12, -30, 0.8], [11, -33, 1], [-5, -24, 0.9], [4.6, -22.6, 0.8], [-14, -22, 0.7], [14, -22, 0.8], [0, -29, 0.9]]) { P.circle(x, y, r, '#8ab0f0'); P.dot(x - r * 0.3, y - r * 0.3, r * 0.3, '#ffffff'); }
		P.gloss(-9, -32, 2, 1, 0.4); P.gloss(-2, -39, 1.8, 0.9, 0.4);
		// the mouths, each with a pair of little eyes
		for (const [x, y, w, h] of [[0, -33.6, 3.2, 3], [-8.4, -26.6, 2.8, 2.6], [7.4, -27.4, 3, 2.8], [-11.6, -18.6, 2, 2], [11.4, -18.6, 2, 2]]) {
			mouth(x, y, w, h);
			for (const s of [-1, 1]) { P.dot(x + s * w * 0.55, y - h * 0.95, 0.75, '#fbf7f0'); P.dot(x + s * w * 0.55 + 0.2, y - h * 0.95, 0.4, '#1a1030'); }
		}
		// red loincloth and the gold necklace with a violet gem
		P.shape((p) => { p.m(-8, -12); p.q(0, -10, 8, -12); p.l(6.6, -6); p.l(3, -7.6); p.l(0, -5); p.l(-3, -7.6); p.l(-6.6, -6); }, red, -8, 8);
		P.line([[-8.4, -12], [8.4, -12]], shade(red, -0.3), 1);
		P.thin([[-6, -26], [-3, -20], [0, -18.6], [3, -20], [6, -26]], gold, 0.7);
		P.circle(0, -18, 1.8, gold); P.circle(0, -18, 1, '#8a3ac8', { line: false });
	},
	// Cannon squid (6A boss; also the regular monster): a hulking blue brute with a squid's head, a beard of tentacles round
	// a small mouth, glowing blue eyes, bubbles of pale spots on its scalp, spiky fins at the shoulders and back, a strap
	// holding a sack of cannonballs, a long iron cannon cradled in its arms and a tail
	378(P) {
		P.shadow(18, 6);
		const blue = '#4a7ab8', dark = '#3a5a90', iron = '#6a6e74', ball = '#3a3a40';
		// tail
		taper(P, [[-6, -8], [-14, -5], [-20, -2]], 4, 0.8, dark);
		// thick legs
		for (const [hx, kx, fx, c] of [[-5, -9, -7, dark], [4, 8, 6, blue]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 6, 4.4, c);
			P.ellipse(fx + 1, -1.4, 3.8, 1.7, shade(c, -0.15));
			for (const k of [0, 1]) P.dot(fx + 2.2 + k * 1.4, -1, 0.5, '#e8f0f8');
		}
		// spiky fins at the back and shoulders
		for (const [x, y, tx, ty] of [[-9, -26, -17, -32], [-10, -21, -18, -22], [-6, -31, -9, -39], [9, -29, 17, -35], [10, -25, 18, -26]]) taper(P, [[x, y], [(x + tx) / 2, (y + ty) / 2 - 1.6], [tx, ty]], 3.6, 0.4, shade(blue, 0.1));
		// the broad hunched body
		P.shape((p) => { p.m(-10, -12); p.q(-14, -26, -6, -31); p.q(3, -34, 10, -29); p.q(14, -20, 9, -11); p.q(0, -8, -10, -12); }, blue, -14, 14);
		for (const [x, y, r] of [[-7, -22, 1.4], [-4, -17, 1.1], [6, -14, 1.2], [-9, -16, 0.9]]) P.ellipse(x, y, r, r * 0.8, shade(blue, -0.2), { line: false });
		P.gloss(-6, -27, 3, 1.4, 0.35);
		// the strap and the sack of cannonballs over the shoulder
		P.thin([[8, -30], [-2, -18], [-6, -13]], '#6a4a2a', 0.9);
		P.shape((p) => { p.m(-6, -19); p.q(-1, -22, 5, -19); p.q(5.6, -13, 0, -12.4); p.q(-6.6, -13, -6, -19); }, '#6a4a32', -6.6, 5.6);
		for (const [x, y] of [[-3, -19.6], [0, -20.6], [3, -19.6], [-1.4, -21.8], [1.6, -22]]) { P.circle(x, y, 1.6, ball); P.dot(x - 0.5, y - 0.5, 0.45, '#9a9aa4'); }
		// the cannon cradled across the body, pointing down to the right
		const cdx = Math.cos(0.5), cdy = Math.sin(0.5), cn = (t, o) => [-8 + cdx * t - cdy * o, -24 + cdy * t + cdx * o];
		P.poly([cn(0, -2.6), cn(27, -3.2), cn(27, 3.2), cn(0, 2.6)], iron);
		P.ellipse(...cn(27, 0), 1.6, 3.2, shade(iron, 0.15), { rot: 0.5 });
		P.ellipse(...cn(27.3, 0), 0.9, 2, '#14141a', { line: false, rot: 0.5 });
		P.thin([cn(1, -1.4), cn(26, -2)], shade(iron, 0.45), 0.5);
		for (const t of [8, 11, 14]) P.dot(...cn(t, -0.4), 0.55, '#2a2a30');
		P.circle(...cn(0, 0), 2.4, shade(iron, -0.1));
		// thick arms holding the cannon
		taper(P, [[-7, -27], [-11, -20], [-4, -16]], 5, 4, dark);
		P.circle(-3.4, -16.4, 2.6, dark);
		taper(P, [[8, -28], [13, -21], [9.6, -14]], 5.4, 4.2, blue);
		P.circle(9.4, -13.8, 2.8, blue);
		for (const k of [-1, 0, 1]) taper(P, [[9.4 + k * 1.2, -12], [10 + k * 1.4, -10]], 1.2, 0.4, '#2a3a5a');
		// the squid head: a bulbous scalp dotted with pale spots, glowing eyes, a beard of tentacles
		P.shape((p) => { p.m(-1, -30); p.q(-3, -42, 5, -44); p.q(13, -44, 13, -34); p.q(12.6, -29, 8, -28); p.q(2, -27, -1, -30); }, blue, -3, 13);
		for (const [x, y, r] of [[2, -40, 1], [4.4, -41.6, 0.8], [6.6, -40, 1.1], [3, -37.6, 0.7], [8.8, -41.8, 0.7]]) { P.circle(x, y, r, '#8ab8e0'); P.dot(x - r * 0.3, y - r * 0.3, r * 0.35, '#e0f0ff'); }
		P.gloss(0.6, -38, 1, 1.6, 0.35);
		for (const x of [6, 10.4]) { P.glow(x, -34.4, 2.2, '#60d0ff', 0.7); P.dot(x, -34.4, 0.9, '#c0f0ff'); }
		for (const [x0, x1, y1] of [[4, 2, -21], [6, 5.6, -20], [8, 9, -20.6], [10, 12, -22], [11.6, 14.6, -25]]) taper(P, [[x0, -30], [(x0 + x1) / 2 + 0.6, -26], [x1, y1]], 2, 0.5, shade(blue, 0.05));
		P.ellipse(8, -30.4, 1.6, 0.8, '#1a2a4a', { line: false });
	},
	// Anchor golem: a hulking dark blue sea golem, its domed back and head overgrown with green moss and weed and crusted
	// with barnacles, a rusty anchor and chain stuck in the top, a little clay pot caught in the weed, glowing blue eyes
	// peering out from under the moss, long arms with clawed hands
	379(P) {
		P.shadow(15, 6);
		const blue = '#2e4a6a', moss = '#4a8a3a', iron = '#5a6068';
		// legs
		for (const sd of [-1, 1]) { taper(P, [[sd * 5, -12], [sd * 6, -6], [sd * 6, -2.5]], 6.4, 5.4, sd < 0 ? shade(blue, -0.12) : blue); P.ellipse(sd * 7, -1.5, 3.8, 1.8, shade(blue, -0.25)); }
		// the anchor and chain stuck in the top, behind the moss
		for (const [x, y] of [[-4, -37], [-5, -40], [-5.5, -43]]) P.ellipse(x, y, 1, 1.5, iron);
		P.line([[3, -33], [5.5, -43]], iron, 2);
		P.line([[2.4, -40.5], [8, -40]], iron, 1.3);
		P.shape((p) => { p.m(-1, -38); p.q(1, -33.5, 4, -34); p.q(8, -34, 10, -38.5); p.l(11.5, -37.5); p.q(9, -32, 4, -32); p.q(-1, -32, -2.5, -37); }, iron, -2.5, 11.5);
		P.circle(5.8, -44.6, 1.4, iron); P.dot(5.8, -44.6, 0.6, '#d8d4c8');
		// the body: a big domed mass
		P.shape((p) => { p.m(-8, -10); p.q(-14, -16, -13, -26); p.q(-11, -36, 0, -36); p.q(11, -36, 13, -26); p.q(14, -16, 8, -10); p.q(0, -8, -8, -10); }, blue, -14, 14);
		// moss draped over the dome, hanging in strands
		P.shape((p) => { p.m(-13.5, -24); p.q(-12, -36, 0, -36.5); p.q(12, -36, 13.5, -24); p.l(12, -19); p.l(10.5, -23); p.l(8.5, -18); p.l(6, -23); p.l(3.5, -20); p.l(1, -24); p.l(-2, -20.5); p.l(-4.5, -24); p.l(-7, -18.5); p.l(-9, -23); p.l(-11.5, -17.5); }, moss, -13.5, 13.5);
		for (const [x, y] of [[-9, -31], [-4, -33.5], [2, -34], [8, -31], [10.5, -27], [-11, -27], [-2, -29], [5, -28.5]]) { P.circle(x, y, 0.9, '#d8d0b8'); P.dot(x, y, 0.35, '#5a5040'); }
		P.ellipse(-9.5, -34, 1.6, 2, '#a8643a');
		P.gloss(-6, -33, 2.6, 1.2, 0.3);
		// long arms hanging, clawed hands
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(blue, -0.12) : blue;
			taper(P, [[sd * 11, -24], [sd * 17, -17], [sd * 17, -9]], 5.6, 4.4, c);
			for (const d of [-1, 0, 1]) taper(P, [[sd * 17, -9], [sd * (17.5 + d * 1.6), -5.5], [sd * (16.5 + d * 2), -4]], 1.6, 0.4, c);
		}
		// glowing eyes under the moss, a dark face shadow
		P.ellipse(0, -19, 6, 2.6, shade(blue, -0.35), { line: false });
		P.glowEyes(0, -19.5, 2.6, 0.9, '#40c8ff');
	},
	// Diamond golem: a golem of grey stone blocks bound together by glowing blue crystal veins, a big blocky head with a
	// single glowing blue gem eye on one side, broad blocky shoulders, chunky arms and stumpy legs
	380(P) {
		P.shadow(15, 6);
		const stone = '#a8acb0', vein = '#2a60e0', glow = '#60b8ff';
		const block = (x, y, rx, ry, k, c = stone) => {
			const pts = [];
			for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + k * 0.4, f = 0.88 + 0.14 * Math.sin(k * 3 + i * 2.1); pts.push([x + Math.cos(a) * rx * f, y + Math.sin(a) * ry * f]); }
			P.poly(pts, c);
			P.gloss(x - rx * 0.3, y - ry * 0.4, rx * 0.3, ry * 0.18, 0.3);
		};
		// the blue crystal core binding everything together
		const core = (pts, w) => taper(P, pts, w, w * 0.85, vein);
		for (const sd of [-1, 1]) { core([[sd * 4, -14], [sd * 5, -3]], 4.4); core([[sd * 8, -25], [sd * 13, -18], [sd * 13, -9]], 4); }
		P.shape((p) => { p.m(-6, -11); p.q(-9, -20, -8, -27); p.q(-5, -32, 0, -36); p.q(8, -35, 8, -27); p.q(9, -18, 6, -11); p.q(0, -9, -6, -11); }, vein, -9, 9);
		P.glow(0, -22, 10, glow, 0.2);
		// legs and arms of stone blocks
		for (const sd of [-1, 1]) {
			const c = sd < 0 ? shade(stone, -0.12) : stone;
			block(sd * 4.5, -9, 4.2, 3.4, 1 + sd, c); block(sd * 5, -3.5, 4.6, 3.2, 2 + sd, c);
			block(sd * 10.5, -25, 5.2, 4.6, 3 + sd, c); block(sd * 13, -18.5, 4.2, 3.8, 4 + sd, c); block(sd * 13.5, -10.5, 4.8, 4.6, 5 + sd, c);
		}
		// body blocks and the head
		block(-3.5, -22, 5.6, 5, 1); block(4, -21, 5, 4.8, 2); block(0, -14, 6.2, 3.8, 3);
		block(1.5, -32, 7, 6, 4);
		// thin glowing seams between the blocks
		for (const pts of [[[0.8, -26], [0, -17.6]], [[-6, -17.4], [6, -17]], [[-4, -27], [6, -26.6]]]) { P.thin(pts, glow, 0.7); P.thin(pts, '#e0f4ff', 0.25); }
		// the gem eye
		P.glow(4.5, -32.5, 5, glow, 0.55);
		P.circle(4.5, -32.5, 2.4, vein);
		P.circle(4.5, -32.5, 1.5, glow, { line: false });
		P.dot(4.1, -33, 0.6, '#ffffff');
	},
	// The White Dragon (6C boss): a pale ivory dragon standing up on its hind legs, great bony wings spread behind, a
	// cream ridged belly, a long tail curling round, a crest of horns and spines on a head held high with a hooked,
	// beak-like snout and a golden eye
	381(P) {
		P.shadow(15, 5.5);
		const ivory = '#d8d2c0', dark = '#b0a890', belly = '#f0e2b0', horn = '#f4efe2', web = '#cfc4ac';
		// wings: a bony arm and webbed panels, spread up and out to the left, the other wing peeking up on the right
		P.shape((p) => { p.m(4, -28); p.l(12, -38); p.q(13, -33, 11, -28); }, shade(web, -0.08), 4, 13, { alpha: 0.95 });
		P.line([[4, -28], [12, -38]], dark, 1);
		P.shape((p) => { p.m(-2, -27); p.q(-10, -40, -19, -42); p.q(-17, -34, -20, -28); p.q(-16, -27, -18, -20); p.q(-13, -21, -14, -14); p.q(-8, -18, -3, -18); }, web, -20, -2, { alpha: 0.95 });
		P.line([[-2, -27], [-10, -38], [-19, -42]], dark, 1.1);
		for (const [x, y] of [[-20, -28], [-18, -20], [-14, -14]]) P.thin([[-10, -38], [x, y]], dark, 0.5);
		// the tail curling round to the left
		taper(P, [[-4, -9], [-12, -6], [-17, -9], [-14, -13]], 4, 0.6, ivory);
		for (const [x, y] of [[-10, -8.6], [-14.6, -9.8]]) P.poly([[x - 0.8, y], [x - 0.2, y - 2], [x + 0.8, y - 0.2]], horn);
		// haunches and clawed feet
		for (const [x, c] of [[-4, dark], [4, ivory]]) {
			P.ellipse(x, -9, 4.5, 5, c);
			taper(P, [[x, -6], [x + 1.5, -2.5]], 3.4, 2.6, c);
			for (const d of [-1, 0, 1]) taper(P, [[x + 1.5, -2.5], [x + 1.5 + d * 1.6 + 1, -0.6]], 1.3, 0.3, c);
		}
		// the body and the ridged belly
		P.shape((p) => { p.m(-6, -24); p.q(-9, -14, -5, -7); p.q(1, -5, 6, -8); p.q(9, -16, 5, -25); p.q(-1, -28, -6, -24); }, ivory, -9, 9);
		P.shape((p) => { p.m(0, -24); p.q(6, -22, 6.6, -14); p.q(6, -8.5, 2, -7.4); p.q(-2, -14, 0, -24); }, belly, -2, 6.6);
		for (const y of [-21, -18, -15, -12, -9.5]) P.thin([[0.2 + Math.abs(y + 15) * 0.2, y], [6.2 - Math.abs(y + 15) * 0.12, y + 0.4]], shade(belly, -0.35), 0.4);
		P.gloss(-4, -19, 1.8, 1.2, 0.4);
		// forelegs held in front
		taper(P, [[1, -21], [5, -17], [7.5, -16]], 2.8, 2, ivory);
		for (const k of [-1, 0, 1]) P.thin([[7.5, -16], [9, -16.6 + k * 0.8]], horn, 0.4);
		// the neck curving up, spines down the back of it
		for (const [x, y] of [[-3, -27], [-2, -31], [0.5, -34.5], [4, -37]]) P.poly([[x + 1.4, y + 1.6], [x - 3, y - 1.2], [x + 2, y - 1]], horn);
		taper(P, [[1, -21], [-0.5, -28], [2.5, -33], [7, -35]], 7.4, 5.6, ivory);
		taper(P, [[4, -22], [3, -27], [5, -31], [8, -31.5]], 2.6, 2, belly, { line: false });
		// the head: a crest of horns, a long hooked beak-like snout, a golden eye
		for (const [x, tx, ty] of [[5, -1, -45], [7, 2, -46], [9, 6.5, -46]]) taper(P, [[x, -37], [x - 2, -41.5], [tx, ty]], 2, 0.4, horn);
		P.ellipse(9, -35, 5, 4.2, ivory);
		P.shape((p) => { p.m(11, -38.5); p.q(17, -38, 19.5, -34); p.q(19.5, -31.5, 18, -31); p.q(17.5, -33, 12, -32.5); }, ivory, 11, 19.5);
		P.shape((p) => { p.m(11.5, -32.5); p.l(17, -32.2); p.q(15, -29.5, 11.5, -30); }, dark, 11.5, 17);
		P.thin([[12.5, -32.4], [17.2, -32]], shade(ivory, -0.55), 0.45);
		P.glow(10.6, -35.6, 2, '#ffc030', 0.5);
		P.ellipse(10.6, -35.6, 1.4, 1.1, '#ffd040');
		P.dot(10.9, -35.6, 0.5, '#2a1a08');
		P.thin([[8.6, -37.3], [12.4, -36.6]], shade(ivory, -0.5), 0.6);
		P.gloss(7, -37, 1.4, 0.7, 0.45);
	},
	// Demon of ignorance (6D boss): a tall, lanky demon split down the middle, blue on one side and green on the other, a
	// big horned white animal skull worn as its head with a red feather crest, a red tunic with bone fangs strung round
	// the neck, a ragged orange-and-green loincloth with a skull, a spiked wooden club in one fist
	394(P) {
		P.shadow(13, 5);
		const blue = '#4a9ad8', green = '#3aa84a', bone = '#f0ead8', red = '#c03a2a', orange = '#e07a2a', wood = '#6a3a24';
		// long legs, blue and green
		for (const [x, c] of [[-3, blue], [3, green]]) {
			taper(P, [[x, -13], [x * 1.4, -7], [x * 1.3, -2]], 3.6, 2.6, c);
			P.ellipse(x * 1.3 + (x < 0 ? -0.6 : 0.6), -1.3, 2.6, 1.3, shade(c, -0.3));
		}
		// the far (blue) arm hanging, clawed
		P.ellipse(-6.4, -26, 2.6, 2.6, blue);
		taper(P, [[-6.4, -26], [-9.6, -19], [-9, -11]], 2.8, 2.2, blue);
		for (const k of [-1, 0, 1]) P.thin([[-9, -11], [-9.6 + k * 1, -9]], shade(blue, -0.4), 0.5);
		// red tunic
		torso(P, -27, 5.6, -13, 5, red);
		P.thin([[0, -26], [0, -14]], shade(red, -0.35), 0.4);
		// ragged loincloth, orange and green, a skull on the belt
		P.shape((p) => { p.m(-5.4, -14); p.l(0, -14); p.l(0, -5); p.l(-1.6, -7.6); p.l(-3.4, -5.4); p.l(-5, -8); }, orange, -5.4, 0);
		P.shape((p) => { p.m(0, -14); p.l(5.4, -14); p.l(5, -8); p.l(3.4, -5.4); p.l(1.6, -7.6); p.l(0, -5); }, green, 0, 5.4);
		P.line([[-5.8, -14.2], [5.8, -14.2]], '#4a2a1a', 1.1);
		skull(P, 0, -12.6, 1.8, bone);
		// necklace of bone fangs
		for (const [x, y] of [[-4, -25.6], [-2, -24.4], [0, -24], [2, -24.4], [4, -25.6]]) P.poly([[x - 0.6, y], [x + 0.6, y], [x, y + 2]], bone);
		// the near (green) arm down to a spiked club
		P.ellipse(6.4, -26, 2.6, 2.6, green);
		taper(P, [[6.4, -26], [10, -20], [10.6, -14]], 2.8, 2.2, green);
		P.line([[10.4, -15], [12, -3]], wood, 1.4);
		P.ellipse(12.4, -1.6, 2.6, 3.4, wood, { rot: -0.15 });
		for (const [dx, dy] of [[-2.6, 0], [2.6, -0.4], [-2, -2.6], [2, -2.8], [0, -4.4], [-1.6, 2], [1.8, 2]]) P.poly([[12.4 + dx * 0.7 - 0.4, -1.6 + dy * 0.7], [12.4 + dx * 1.45, -1.6 + dy * 1.45], [12.4 + dx * 0.7 + 0.4, -1.6 + dy * 0.7]], bone);
		P.circle(10.6, -14, 1.8, green);
		P.thin([[9.6, -16.4], [11.8, -16]], '#4a2a1a', 0.7);
		// neck, half and half
		P.line([[0, -27], [0, -30]], blue, 2.6);
		// red feather crest behind the skull
		for (const [tx, ty, c] of [[-9, -43, red], [-5, -46, '#e0503a'], [-1, -46, red], [4, -45, '#e0503a']]) taper(P, [[-1, -38], [tx, ty]], 2.6, 0.5, c);
		// the big horned animal skull worn as its head: long snout pointing down and right, dark sockets with red eyes
		for (const s of [-1, 1]) taper(P, [[s * 4.6, -37], [s * 10, -40], [s * 12, -36]], 2.2, 0.4, bone);
		P.shape((p) => { p.m(-6, -36); p.q(-6, -42, 0, -42); p.q(6, -42, 6.4, -36); p.q(6, -31, 3, -29); p.l(2.4, -26.4); p.l(-2.4, -26.4); p.l(-3, -29); p.q(-6, -31, -6, -36); }, bone, -6.4, 6.4);
		for (const x of [-2.6, 2.6]) { P.ellipse(x, -35, 1.7, 1.9, '#1c1612', { line: false }); P.glow(x, -35, 2, '#ff4030', 0.6); P.dot(x, -34.8, 0.55, '#ffb0a0'); }
		P.poly([[-0.6, -31], [0.6, -31], [0, -32.6]], '#2a2018', { line: false });
		for (const x of [-1.4, 0, 1.4]) P.thin([[x, -28.4], [x, -26.8]], shade(bone, -0.45), 0.3);
		P.thin([[-4, -40], [0, -38.6], [4, -40]], shade(bone, -0.3), 0.4);
		P.gloss(-2.6, -40, 1.6, 0.7, 0.5);
	},
	// Scrap shaman: a stooped automaton of olive-green stone slabs and brass rivets, a jade skull mask with glowing green
	// eyes crowned with jagged orange crystals, a brass gear in its chest with a green eye, a square slab shield on one
	// arm and a long jointed lever arm reaching forward
	398(P) {
		P.shadow(16, 5);
		const stone = '#6a7a5a', dark = '#4e5c42', brass = '#c8a040', jade = '#9ad8a0', crystal = '#f08a30';
		// jointed legs
		for (const [hx, kx, fx, c] of [[-3, -7, -6, dark], [3, 6, 5, stone]]) {
			P.line([[hx, -12], [kx, -7], [fx, -2]], c, 2.4);
			P.circle(kx, -7, 1.4, brass);
			P.poly([[fx - 2.6, -2.6], [fx + 3, -2.6], [fx + 3.4, 0], [fx - 2.6, 0]], c);
		}
		// the square slab shield behind on the far arm
		P.poly([[-17, -26], [-8, -27], [-7.6, -13], [-16.6, -12]], dark);
		P.poly([[-15.4, -24.4], [-9.6, -25], [-9.4, -14.6], [-15, -14]], stone, { line: false });
		P.dot(-12.4, -19.6, 1, brass);
		// the body: a stack of stone slabs
		P.poly([[-7, -27], [6, -28], [7, -13], [-6, -12]], stone);
		P.poly([[-5, -12], [5, -12.6], [4, -9], [-4, -9]], dark);
		for (const [x, y] of [[-6, -26], [5, -27], [-5.4, -13.4], [6, -14]]) P.dot(x, y, 0.5, brass);
		P.gloss(-4, -24, 1.6, 0.8, 0.3);
		// the brass gear with a green eye in the chest
		const gx = 0.4, gy = -20;
		for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.poly([[gx + Math.cos(a - 0.2) * 3.2, gy + Math.sin(a - 0.2) * 3.2], [gx + Math.cos(a - 0.15) * 4.3, gy + Math.sin(a - 0.15) * 4.3], [gx + Math.cos(a + 0.15) * 4.3, gy + Math.sin(a + 0.15) * 4.3], [gx + Math.cos(a + 0.2) * 3.2, gy + Math.sin(a + 0.2) * 3.2]], brass, { line: false }); }
		P.circle(gx, gy, 3.4, brass);
		P.circle(gx, gy, 1.8, '#1a2a1a', { line: false });
		P.glow(gx, gy, 2.4, '#60ff80', 0.6); P.dot(gx, gy, 0.9, '#b0ffb8');
		// the long jointed lever arm reaching forward
		P.circle(7.4, -25, 2.2, brass);
		P.line([[7.4, -25], [13, -20], [20, -21]], dark, 2.2);
		P.circle(13, -20, 1.4, brass);
		P.poly([[19, -23.4], [23.4, -22.6], [23.6, -19.4], [19.2, -18.6]], stone);
		P.dot(21.4, -21, 0.6, brass);
		// head: a jade skull mask under a crest of jagged orange crystals
		for (const [x, tx, ty] of [[-3, -6, -45], [-1, -2, -46.6], [1.4, 2, -46], [3.4, 6.4, -44], [-4.4, -8.6, -41]]) {
			P.poly([[x - 1.4, -37], [tx, ty], [x + 1.4, -37]], crystal);
			P.thin([[x, -37.4], [tx * 0.5 + x * 0.5, (ty - 37) / 2]], '#ffd0a0', 0.35);
		}
		P.glow(0, -41, 5, crystal, 0.3);
		P.poly([[-6, -37.6], [6, -38], [6.6, -30], [3, -27.6], [-3, -27.6], [-6.4, -30]], jade);
		P.thin([[-6, -36], [6.2, -36.4]], brass, 0.9);
		for (const x of [-2.6, 2.6]) { P.ellipse(x, -32.6, 1.8, 1.8, '#1a2a1e', { line: false }); P.glow(x, -32.6, 2, '#40ff70', 0.6); P.dot(x, -32.6, 0.7, '#c0ffc8'); }
		P.poly([[-0.6, -29.8], [0.6, -29.8], [0, -31]], '#1a2a1e', { line: false });
		P.poly([[-3, -28.6], [3, -28.6], [3, -27.8], [-3, -27.8]], '#f4f0e0', { line: false });
		for (const x of [-2, -1, 0, 1, 2]) P.thin([[x, -28.8], [x, -27.6]], '#3a4a3a', 0.25);
		P.gloss(-3.4, -35.6, 1.4, 0.6, 0.4);
	},
	// ---- tombs (EA-ED) ----
	// Golden beetle: a big scarab of burnished gold, a ridged domed shell split down the back, a round pronotum, a small
	// head with cute eyes and short mandibles facing right, six dark-gold legs with blue claws
	600(P) {
		P.shadow(16, 5);
		const gold = '#c8962e', dark = '#86601e', blue = '#3050a8';
		for (const pts of [[[-4, -11], [-13, -13], [-18, -3]], [[3, -11], [9, -17], [13, -7]], [[8, -11], [16, -16], [20, -6]]]) {
			taper(P, pts, 2, 1.2, shade(dark, -0.15)); P.dot(...pts[2], 0.9, blue);
		}
		P.ellipse(-3, -13.5, 11.5, 8.8, gold, { rot: -0.12 });
		P.thin(eaQpts([6.5, -19.5], [-3, -17], [-13.5, -10]), shade(gold, -0.5), 0.5);
		for (const d of [-3.4, 3, 5.6]) P.thin(eaQpts([5 - Math.abs(d) * 0.3, -19.5 + d], [-3, -17 + d], [-12.5 + Math.abs(d) * 0.4, -10 + d * 0.6]), shade(gold, -0.28), 0.35);
		P.gloss(-6, -19, 4, 1.8, 0.5);
		for (const pts of [[[-7, -7], [-11, -4.5], [-12.5, 0]], [[2, -7], [4.5, -3.5], [6.5, 0]]]) { taper(P, pts, 2.2, 1.3, dark); P.dot(...pts[2], 0.95, blue); }
		P.ellipse(6, -11.5, 5.6, 6.4, gold);
		P.thin([[6.5, -17.4], [7, -6]], shade(gold, -0.4), 0.35);
		P.gloss(4.4, -15.4, 1.6, 0.9, 0.45);
		taper(P, [[9, -7], [13.5, -4], [15.5, 0]], 2.2, 1.3, dark); P.dot(15.5, 0, 0.95, blue);
		for (const s of [-1, 1]) taper(P, [[15, -8 + s * 1.4], [18, -8.4 + s * 1.2], [17.8, -9.4 + s * 0.2]], 1.1, 0.3, dark);
		P.circle(12.4, -9.4, 4.4, shade(gold, -0.06));
		P.gloss(11, -12, 1.2, 0.7, 0.45);
		P.eyes(13, -9.8, 1.7, 1.15, '#1a1206');
	},
	// Egypt spider: a sandy, hairy spider, a big spiky abdomen raised behind with a dark hollow, eight jointed legs, a
	// round head with red eyes and cream fangs
	601(P) {
		P.shadow(16, 5);
		const tan = '#b8946a', legc = '#9a7650';
		for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
			const bx = 3 + s * (2 + k * 1.2), by = -9 + k * 0.6, kx = 3 + s * [9, 12.5, 15.5, 17.5][k], ky = [-19, -17.5, -15, -11.5][k];
			P.line([[bx, by], [kx, ky], [3 + s * [11, 15, 18.5, 21][k], [-0.5, -1, -0.5, -1.5][k]]], k % 2 ? legc : shade(legc, -0.12), 1.3);
			P.dot(kx, ky, 1.15, shade(legc, 0.12));
		}
		// abdomen with a fringe of spiky hairs
		for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
			const x = -4 + Math.cos(a) * 10, y = -19 + Math.sin(a) * 9;
			P.poly([[x - Math.sin(a) * 1.4, y + Math.cos(a) * 1.4], [-4 + Math.cos(a + 0.12) * 12.6, -19 + Math.sin(a + 0.12) * 11.4], [x + Math.sin(a) * 1.4, y - Math.cos(a) * 1.4]], shade(tan, -0.12));
		}
		P.ellipse(-4, -19, 10.5, 9.5, tan);
		for (const [x, y, r] of [[-8, -22, 0.7], [0, -24, 0.6], [-9, -15, 0.6], [1, -15, 0.5], [-5, -26, 0.5]]) P.dot(x, y, r, shade(tan, -0.3));
		P.ellipse(-6, -21, 1.3, 1.5, shade(tan, -0.45), { line: false });
		P.gloss(-8, -24.5, 3, 1.4, 0.4);
		// head
		P.circle(6.5, -11, 6.5, shade(tan, 0.04));
		for (const s of [-1, 1]) P.poly([[6.5 + s * 1.2, -5.4], [6.5 + s * 2.4, -5.2], [6.5 + s * 1.4, -2.6]], '#f3ece0');
		P.dot(5, -15.6, 0.7, '#c01820'); P.dot(8.6, -15.6, 0.7, '#c01820');
		P.eyes(7, -11.5, 2.5, 1.9, '#b01820');
		P.gloss(4, -15, 1.5, 0.8, 0.4);
	},
	// Vase spider: a jar mimic: a bronze jar turned upside down, its rounded base on top, dark bands round it and a
	// loop handle on one side, scuttling on eight long spindly brown legs that splay out from its open mouth
	602(P) {
		P.shadow(13, 4);
		const bronze = '#c48a3a', band = '#8a5a24', leg = '#5a3a30';
		// the legs, far ones darker, each bending up to a knee and down to a point on the ground
		for (const far of [true, false]) {
			for (let i = 0; i < 4; i++) {
				if ((i % 2 === 1) !== far) continue;
				for (const sd of [-1, 1]) {
					const c = far ? shade(leg, -0.2) : leg, kx = sd * (7.6 + i * 2.2), ky = -19 + i * 2.2, tx = kx + sd * (2.6 + i * 0.6);
					taper(P, [[sd * 1.2, -12.6], [kx, ky]], 2.2, 1.6, c);
					taper(P, [[kx, ky], [kx + sd * 2.6 * (1 + i * 0.2), (ky - 0.4) / 2], [tx, -0.4]], 1.6, 0.4, c);
				}
			}
		}
		// a dark hairy mass in the jar's mouth
		P.ellipse(0, -12.4, 3.6, 2, '#2a1a14');
		// the jar: its rounded base on top, swelling, then narrowing to a flared mouth at the bottom
		P.shape((p) => { p.m(-2.8, -13.6); p.q(-3.6, -16, -6.6, -20); p.q(-9, -26, -7, -32); p.q(-4.6, -38.4, 0, -38.4); p.q(4.6, -38.4, 7, -32); p.q(9, -26, 6.6, -20); p.q(3.6, -16, 2.8, -13.6); }, bronze, -9, 9);
		P.shape((p) => { p.m(-4.2, -14.4); p.l(4.2, -14.4); p.l(3.8, -12.6); p.l(-3.8, -12.6); }, shade(bronze, -0.1), -4.2, 4.2);
		// bands round the jar, a zigzag in the broad one
		P.shape((p) => { p.m(-8.2, -25.4); p.q(0, -23.4, 8.2, -25.4); p.l(7.6, -21.6); p.q(0, -19.6, -7.6, -21.6); }, band, -8.2, 8.2);
		P.thin([[-7, -23.6], [-5.2, -22], [-3.4, -23.6], [-1.6, -22], [0.2, -23.6], [2, -22], [3.8, -23.6], [5.6, -22], [7.2, -23.4]], shade(bronze, 0.2), 0.45);
		P.thin([[-5.6, -18.6], [5.6, -18.6]], band, 0.7);
		// the loop handle on the left
		P.shape((p) => { p.m(-6.6, -29); p.q(-11.6, -29, -11, -23.4); p.q(-10.6, -19.4, -6.4, -19); p.l(-6.6, -20.4); p.q(-9.4, -20.8, -9.6, -23.4); p.q(-10, -27.4, -6.8, -27.4); }, bronze, -11.6, -6.4);
		P.gloss(-3.4, -33, 2.4, 1.6, 0.5);
		P.dot(3, -31, 0.6, shade(bronze, -0.25)); P.dot(4.6, -28.6, 0.45, shade(bronze, -0.25)); P.dot(-1.6, -29.4, 0.5, shade(bronze, -0.2));
	},
	// Desert scorpion: a brown scorpion facing right, its segmented tail arched high over its back to a dark sting, two big
	// pincers held forward, eight legs, a round head with big eyes
	603(P) {
		P.shadow(16, 5);
		const brown = '#9a6234', dark = '#5e3a1e';
		for (const pts of [[[-3, -8], [-9, -12], [-12, -1]], [[-1, -8], [-5, -12.5], [-7, -0.5]], [[1, -8], [1.5, -12.5], [-1, -0.5]], [[3, -8], [6, -12], [5, -0.5]]]) P.line(pts, shade(brown, -0.2), 1.5);
		for (const [x, y, r] of [[-8, -11, 3.6], [-11.5, -15.5, 3.4], [-13.2, -20.5, 3.2], [-12.8, -25.5, 3], [-10.4, -29.8, 2.8], [-6.6, -32.4, 2.6], [-2.6, -33, 2.4]]) {
			P.circle(x, y, r, brown);
			P.gloss(x - r * 0.4, y - r * 0.45, r * 0.3, r * 0.16, 0.35);
		}
		P.shape((p) => { p.m(-1.5, -34.5); p.q(3.5, -35, 3.2, -30); p.q(3, -28, 1.8, -26.2); p.q(1.4, -29, -0.5, -31); }, dark, -1.5, 3.5);
		P.ellipse(-2, -9.5, 9.5, 5.5, brown);
		for (const x of [-7, -3.5, 0]) P.thin([[x, -14.2], [x + 0.6, -5]], shade(brown, -0.4), 0.4);
		P.gloss(-4, -13, 3, 1, 0.4);
		// a pincer: a fat palm and two curved fingers opening forward
		const claw = (ox, oy, k, c) => {
			taper(P, [[ox + 3.5 * k, oy - 1 * k], [ox + 7 * k, oy - 3.6 * k], [ox + 9 * k, oy - 1.2 * k]], 2.2 * k, 0.5, c);
			taper(P, [[ox + 3.5 * k, oy + 0.8 * k], [ox + 7 * k, oy + 2 * k], [ox + 8.4 * k, oy + 0.4 * k]], 1.8 * k, 0.5, c);
			P.ellipse(ox + 2.6 * k, oy, 3.2 * k, 2.4 * k, c);
			P.gloss(ox + 1.8 * k, oy - 1 * k, 1 * k, 0.5 * k, 0.4);
		};
		// the far pincer, then the near legs, body front and the near pincer
		P.line([[4, -10], [9, -15]], shade(brown, -0.12), 2.2);
		claw(9, -15, 1.1, shade(brown, -0.08));
		for (const pts of [[[0, -6], [-4, -4], [-5.5, -0.5]], [[4, -6], [8, -4], [9, -0.5]]]) P.line(pts, brown, 1.6);
		P.line([[5, -7], [10, -5]], brown, 2.4);
		claw(9.5, -5.2, 1.2, brown);
		P.circle(5, -10.5, 5.2, shade(brown, 0.08));
		P.eyes(6, -11.4, 2, 1.6, '#2a1206');
		P.gloss(3, -13.6, 1.5, 0.8, 0.45);
	},
	// Green cobra: a coiled olive-green cobra with a cream belly, rearing up with its hood spread, its head turned right,
	// the tail tip curling up beside the coils
	604(P) {
		P.shadow(15, 5);
		const green = '#7c9c32', belly = '#ecdaa2', dark = '#55701e';
		P.ellipse(0, -2.6, 12.5, 4.8, green);
		taper(P, [[9, -3], [16, -5], [16.5, -12], [13, -14]], 3.2, 0.6, green);
		P.ellipse(1, -6.6, 10, 4.2, green);
		P.ellipse(2, -10.2, 7.5, 3.6, green);
		for (const [x, y] of [[-7, -3], [-2, -1.6], [4.5, -2.4], [-4, -6.8], [2.5, -5.6], [-1, -10], [4.5, -10.6]]) P.dot(x, y, 0.7, dark);
		P.gloss(-4, -5, 2.6, 1, 0.35);
		P.line([[2, -11], [-1, -18], [-1.5, -23]], green, 6.8);
		P.ellipse(-1.5, -25.5, 8.6, 9.6, green);
		for (const [x, y] of [[-7, -27], [-6.5, -22], [3.6, -27], [3.4, -22], [-6, -31]]) P.dot(x, y, 0.75, dark);
		P.shape((p) => { p.m(-4, -32); p.q(-0.5, -34, 2.6, -32); p.q(3.6, -22, 2, -16); p.q(1.2, -11.5, 3.2, -10.2); p.l(-0.4, -10.4); p.q(-2.4, -14, -3, -18); p.q(-5, -24, -4, -32); }, belly, -5, 3.6);
		for (let y = -30; y <= -12; y += 2.2) P.thin([[-3.8 + (y + 30) * 0.06, y], [2.8 - (y + 30) * 0.02, y + 0.3]], shade(belly, -0.3), 0.35);
		P.ellipse(0.6, -32.4, 5.2, 4.2, green);
		P.ellipse(4.2, -31.2, 3.4, 2.7, green, { line: false });
		P.thin(eaQpts([4.6, -33.8], [7.4, -32.6], [7.4, -30.6]), shade(green, -0.55), 0.4);
		P.thin([[2.6, -29.6], [6.6, -30.2]], shade(green, -0.55), 0.4);
		P.dot(6.4, -32.4, 0.35, '#1a2008');
		P.gloss(-1.4, -35, 1.8, 0.8, 0.45);
		P.eyes(1.6, -32.6, 1.9, 1.25, '#3a4008');
		P.thin([[-1.2, -34.6], [0.8, -34]], shade(green, -0.5), 0.4); P.thin([[4.4, -34.6], [2.6, -34]], shade(green, -0.5), 0.4);
	},
	// Pharaoh mummy: a shambling mummy in yellowed wrappings, hunched with both arms hanging forward, a blue-and-gold
	// striped nemes and a gold collar, a gaping mouth and dark sunken eyes, a loose strip trailing from the hip
	605(P) {
		P.shadow(11, 4.5);
		const wrap = '#cdb88c', seam = '#8a7450', lapis = '#2c4f9e', gold = '#d8a634';
		const wraps = (x0, x1, y0, y1, n) => { for (let i = 1; i <= n; i++) { const y = y0 + (y1 - y0) * i / (n + 1); P.thin([[x0, y + 0.6], [x1, y - 0.6]], seam, 0.35); } };
		eaNemesBack(P, -0.6, -29, 6.2, gold, lapis);
		for (const [hx, kx, fx, c] of [[-3, -4.4, -4.6, shade(wrap, -0.1)], [3, 4.6, 4.2, wrap]]) {
			taper(P, [[hx, -12], [kx, -7], [fx, -2]], 4.4, 3.2, c);
			wraps(fx - 1.8, fx + 1.8, -11.5, -2.5, 4);
			P.ellipse(fx - 0.7, -1.3, 2.8, 1.4, shade(wrap, -0.2));
		}
		torso(P, -22, 6, -10, 6.4, wrap);
		wraps(-6, 6, -22, -10, 5);
		taper(P, [[4.5, -12], [6.5, -8], [5.6, -4.6]], 1.6, 0.8, shade(wrap, 0.06));
		for (const [s, c] of [[-1, wrap], [1, shade(wrap, -0.08)]]) {
			taper(P, [[s * 5.4, -20.5], [s * 10.6, -16], [s * 10.4, -10]], 3.4, 2.6, c);
			wraps(s * 9 - 1.8, s * 9 + 1.8, -19, -11, 3);
			P.circle(s * 10.4, -9.4, 1.9, c);
			for (const k of [-1, 0, 1]) taper(P, [[s * 10.4 + k * 0.9, -8], [s * 10.6 + k * 1.1, -6.2]], 0.8, 0.3, c);
		}
		taper(P, [[-10.6, -13], [-12.4, -9], [-11.6, -5.4]], 1.2, 0.6, shade(wrap, 0.06));
		eaBroadCollar(P, 0, -21.8, 7.2, 4.4, gold, [lapis, '#2a9a8c']);
		head(P, -29, 6.2, wrap, -0.6);
		for (const y of [-30.5, -27.4, -24.6]) P.thin([[-6.4, y + 0.7], [5.4, y - 0.5]], seam, 0.35);
		for (const x of [-3.2, 1.6]) { P.ellipse(x, -28.8, 1.7, 1.5, '#3a2616', { line: false }); P.dot(x - 0.4, -28.7, 0.65, '#f6ecc8'); }
		P.ellipse(-0.9, -25.2, 2, 1.3, '#3a1a10', { line: false });
		for (const x of [-2, -0.9, 0.2]) P.poly([[x - 0.4, -26.4], [x + 0.4, -26.4], [x, -25.6]], '#f6ecc8', { line: false });
		eaNemesFront(P, -0.6, -29, 6.2, gold, lapis);
		eaNemesLappets(P, -0.6, -29, 6.2, gold, lapis);
	},
	// Cat assassin: a tabby cat woman in a white dress with a gold-and-blue collar and belt, banded arms, a curled striped
	// tail, a curved dagger in each hand held out to the sides
	606(P) {
		P.shadow(11, 4.5);
		const fur = '#c08a4a', stripe = '#6a4422', dress = '#f2eee4', gold = '#d9a83a', blue = '#2f5fb0';
		// a curled striped tail behind
		taper(P, [[-4, -6], [-14, -6], [-15.5, -12], [-12.5, -14]], 2.2, 1.3, fur);
		for (const [x, y] of [[-9, -6], [-13.4, -8], [-14.6, -11.6]]) P.thin([[x - 0.8, y - 0.8], [x + 0.8, y + 0.8]], stripe, 0.5);
		// striped legs, sandals
		legs(P, fur, '#8a5a2a');
		for (const s of [-1, 1]) for (const y of [-7, -4.5]) P.thin([[s * 3 - 1.4, y], [s * 3 + 1.4, y - 0.5]], stripe, 0.45);
		// the white dress, a gold belt with a blue panel
		torso(P, -20, 4.6, -5, 6.8, dress);
		P.thin([[-2.6, -10], [-3.6, -5]], shade(dress, -0.18), 0.3); P.thin([[2.6, -10], [3.6, -5]], shade(dress, -0.18), 0.3);
		P.line([[-4.8, -11.5], [4.8, -11.5]], gold, 1.1);
		P.poly([[-1.2, -11], [1.2, -11], [1.5, -5], [-1.5, -5]], blue);
		P.dot(0, -11.5, 0.7, blue);
		// curved daggers, then arms with gold bands and hands round the hilts
		edSickle(P, -10.8, -12.4, -18.5, -15, -14.5, -24, 1.6);
		edSickle(P, 10.8, -12.4, 18.5, -15, 14.5, -24, 1.6);
		for (const s of [-1, 1]) P.line([[s * 10.6, -11.6], [s * 10.2, -9]], '#4a2a1a', 1);
		for (const s of [-1, 1]) {
			P.line([[s * 4.6, -18.6], [s * 8, -15], [s * 10.2, -11.6]], fur, 2);
			P.thin([[s * 7.2, -16.4], [s * 8.6, -15]], stripe, 0.45);
			P.line([[s * 9.2, -13.4], [s * 10, -12.4]], gold, 2.2);
			P.circle(s * 10.6, -11, 1.5, fur);
		}
		edUsekh(P, 0, -20.4, 5, [gold, blue, gold]);
		// head: big pointed ears, tabby stripes, green eyes, a pink nose, whiskers
		for (const s of [-1, 1]) { P.poly([[s * 2.6, -32.5], [s * 6.4, -38.5], [s * 6.6, -29.5]], fur); P.poly([[s * 3.6, -32], [s * 5.9, -36.6], [s * 5.8, -31]], '#e8a8a0', { line: false }); }
		head(P, -27.5, 6.6, fur);
		for (const x of [-2, 0, 2]) P.thin([[x, -33.6], [x * 0.7, -31.2]], stripe, 0.5);
		for (const s of [-1, 1]) P.thin([[s * 6.2, -27], [s * 4.6, -26.4]], stripe, 0.5);
		P.ellipse(0.4, -23.8, 3.2, 2.3, '#efe0c8', { line: false });
		P.eyes(0.4, -27.8, 2.5, 1.35, '#3a8a2a');
		P.poly([[-0.4, -25.2], [1.2, -25.2], [0.4, -24.2]], '#d87a7a', { line: false });
		P.mouth(0.4, -22.7, 0.9, '#5a3020');
		for (const s of [-1, 1]) for (const d of [-0.6, 0.6]) P.thin([[0.4 + s * 2.6, -24 + d * 0.5], [0.4 + s * 7, -24.4 + d * 1.6]], '#f8f4ea', 0.25);
	},
	// Blinding archer: a falcon-headed archer in bronze scale armour, crouched in a wide stance drawing a big recurve bow to
	// the right, a red sun disc on its head, a quiver of arrows on its back
	607(P) {
		P.shadow(14, 4.8);
		const bronze = '#b07a3a', leather = '#7a5232', blue = '#3a6a9a', wood = '#7a4a26', gold = '#d8a634';
		// quiver on the back, arrows sticking up over the shoulder
		P.line([[-8, -15], [-4.6, -32]], leather, 2.6);
		for (const [x, y] of [[-5.4, -36], [-3.8, -36.6], [-2.4, -35.6]]) { P.thin([[-4.6, -32], [x, y]], '#5a3a1a', 0.4); P.poly([[x, y], [x - 1.2, y - 1.8], [x + 0.6, y - 1.6]], '#e8e0cc'); }
		// wide crouching legs
		for (const [pts, c] of [[[[-2.6, -12], [-8, -8], [-10, -1.6]], shade(bronze, -0.12)], [[[2.6, -12], [8.6, -9], [10, -1.6]], bronze]]) {
			taper(P, pts, 4, 2.8, leather);
			P.line([[pts[1][0] + (pts[2][0] - pts[1][0]) * 0.3, -6.6], [pts[2][0], -3]], c, 2.6);
			P.ellipse(pts[2][0] + 0.8, -1.2, 2.6, 1.3, shade(leather, -0.2));
		}
		// armoured torso, tasset skirt
		P.shape((p) => { p.m(-6, -13); p.l(6, -13); p.l(7, -7.4); p.l(3.6, -6.6); p.l(0, -7.6); p.l(-3.6, -6.6); p.l(-7, -7.4); }, bronze, -7, 7);
		for (const x of [-3.6, 0, 3.6]) P.thin([[x, -12.6], [x, -7.4]], shade(bronze, -0.4), 0.35);
		P.shape((p) => { p.m(-5.6, -22.6); p.q(0, -24.4, 5.8, -22.6); p.q(6.4, -17, 5.4, -12.4); p.l(-5.4, -12.4); p.q(-6.4, -17, -5.6, -22.6); }, bronze, -6.4, 6.4);
		for (let y = -21; y < -13; y += 1.8) for (let x = -4.4 + ((y + 21) % 3.6 ? 0.9 : 0); x < 5; x += 1.8) P.thin(eaQpts([x - 0.8, y], [x, y + 1], [x + 0.8, y]), shade(bronze, -0.35), 0.3);
		P.line([[-5.6, -12.8], [5.6, -12.8]], leather, 1.2);
		P.dot(0, -12.8, 0.8, gold);
		// the bow: a big recurve in the front hand, the string drawn back to the cheek, an arrow nocked
		P.thin([[13.6, -38], [4.4, -24.6], [13.6, -6]], '#f2ece0', 0.3);
		P.line([[4.4, -24.6], [20.6, -24.6]], '#8a6a40', 0.5);
		P.poly([[22.6, -24.6], [20.2, -25.8], [20.6, -24.6], [20.2, -23.4]], '#cfd4dc');
		P.poly([[4.4, -24.6], [2.6, -26], [3.4, -24.6], [2.6, -23.2]], '#e8e0cc');
		taper(P, [[18.4, -24], [19, -33], [13.6, -38]], 2, 0.8, wood);
		taper(P, [[18.4, -24], [19, -15], [13.6, -6]], 2, 0.8, wood);
		P.line([[18.2, -26], [18.2, -22]], '#4a2a16', 1.6);
		// arms: the front one stretched out to the bow, the back one drawing the string
		P.ellipse(-5.6, -21.4, 2.8, 2.6, bronze);
		taper(P, [[-4.4, -21], [-0.6, -23], [4.2, -24.4]], 2.8, 2.2, leather);
		P.circle(4.4, -24.4, 1.6, '#c8905a');
		taper(P, [[4.4, -21.4], [11, -23.6], [17.6, -24]], 2.8, 2, leather);
		P.line([[13, -23.8], [15.6, -23.9]], bronze, 2.4);
		P.circle(18.2, -24, 1.6, '#c8905a');
		P.ellipse(5.2, -21.6, 2.8, 2.6, bronze);
		// the falcon head: blue feathers, a cream cheek with the dark eye marking, a hooked yellow beak, the sun disc
		P.circle(1, -40.6, 4.4, gold);
		P.circle(1, -40.6, 3.4, '#e0502a', { line: false });
		P.gloss(-0.2, -42, 1.2, 0.7, 0.5);
		P.line([[1, -36.4], [1, -35]], gold, 1.4);
		P.line([[1.4, -22.6], [1.8, -24.6]], blue, 2.6);
		P.circle(1.4, -29.6, 5.8, blue);
		P.gloss(-0.8, -32.6, 1.6, 0.9, 0.45);
		P.shape((p) => { p.m(1.6, -29.2); p.q(5.4, -31.6, 7, -28.4); p.q(6.6, -25, 3.6, -24.4); p.q(1.4, -25.6, 1.6, -29.2); }, '#f2ead6', 1.4, 7, { line: false });
		P.thin(eaQpts([3.4, -28], [3.2, -25.6], [2, -24.6]), '#1a2030', 0.6);
		P.shape((p) => { p.m(6.2, -30.6); p.q(10, -31.2, 10.6, -28.4); p.q(10.4, -26.6, 9.2, -26.2); p.q(9.4, -27.6, 8, -27.6); p.l(6.4, -27.4); }, '#e8b830', 6.2, 10.6);
		P.dot(7.4, -29.8, 0.3, '#5a3a10');
		P.eyes(3.6, -29.6, 1.7, 1.2, '#1a1206');
		P.thin([[1.8, -31.6], [5.8, -31.4]], '#1a2030', 0.5);
	},
	// Hippopotamus warrior: a big purple-brown hippo on stubby legs, a jewelled gold-and-blue collar, a white kilt with a blue
	// apron, a spiked club raised in one fist and a gold oval shield with a blue scarab on the other arm; mouth open
	608(P) {
		P.shadow(14, 5);
		const skin = '#8e6a74', gold = '#d9a83a', blue = '#2f5fb0', wood = '#7a5232';
		// the club raised behind: a bone handle, a heavy head with iron spikes
		P.line([[-11.5, -12], [-14, -26]], '#e8dcc0', 1.4);
		P.circle(-11.3, -11.4, 1.1, '#e8dcc0');
		taper(P, [[-13.4, -23], [-16.6, -41]], 3.4, 5.4, wood);
		for (const [x, y, s] of [[-14.6, -28, -1], [-12.4, -31, 1], [-15.6, -33, -1], [-13.4, -36.5, 1], [-17, -38.5, -1]]) P.poly([[x, y - 0.8], [x + s * 2.6, y - 0.6], [x, y + 0.8]], '#b8bcc4');
		P.thin([[-14.8, -26], [-13.4, -25.6]], '#4a3020', 0.5);
		// stubby legs with toenails
		for (const s of [-1, 1]) {
			P.line([[s * 4.6, -9], [s * 5, -3]], s < 0 ? shade(skin, -0.1) : skin, 5.4);
			P.ellipse(s * 5.2, -1.6, 3.4, 1.8, skin);
			for (const k of [-1, 0, 1]) P.dot(s * 5.2 + k * 1.3, -0.6, 0.45, '#efe6dc');
		}
		// a round belly
		P.ellipse(0, -15, 10.5, 10, skin);
		P.ellipse(1.5, -13, 6.5, 6.5, shade(skin, 0.12), { line: false });
		P.gloss(-5, -20, 2.4, 1.2, 0.35);
		edShendyt(P, -9.5, -4.2, 8.5, gold, [blue, gold]);
		P.dot(0, -9.5, 0.9, '#c8302a');
		edUsekh(P, 1, -23, 8, [gold, blue, gold, '#c8302a']);
		// the club arm and fist
		P.line([[-8, -20.5], [-12.5, -17.5], [-12.8, -15]], skin, 3.8);
		P.line([[-12.9, -17.3], [-12.8, -15.8]], gold, 4);
		P.circle(-12.6, -14.2, 2.6, skin);
		// the shield arm, then the oval gold shield with a scarab
		P.line([[8.5, -20.5], [12.5, -16.5]], skin, 3.8);
		P.ellipse(15.5, -13.5, 5.6, 9, gold);
		P.ellipse(15.5, -13.5, 4.2, 7.4, blue);
		P.ellipse(15.5, -14, 1.8, 2.6, gold);
		for (const s of [-1, 1]) P.thin([[15.5 + s * 1.6, -15], [15.5 + s * 3.4, -17.4]], gold, 0.5);
		P.circle(15.5, -17.6, 1, '#c8302a');
		P.gloss(13.2, -19, 1.2, 1.8, 0.45);
		// head: a broad cranium with little ears, a huge muzzle, mouth open with tusks
		for (const x of [-3.5, 1.5]) P.ellipse(x, -36.4, 1.6, 2, skin);
		P.ellipse(1, -31, 7.5, 6.5, skin);
		P.shape((p) => { p.m(4, -26); p.q(9, -27.5, 13.5, -24.5); p.q(13, -21, 8, -21.6); p.q(4, -22, 4, -26); }, shade(skin, -0.05), 4, 13.5);
		P.shape((p) => { p.m(5.5, -25.6); p.q(9, -26.6, 12.4, -24.6); p.q(10, -23, 6, -23.6); }, '#8a2a3a', 5.5, 12.4, { line: false });
		P.poly([[7.4, -25.8], [8.2, -25.9], [7.8, -24.4]], '#f6efe0'); P.poly([[10.6, -25.2], [11.4, -25], [11, -23.8]], '#f6efe0');
		P.ellipse(8.6, -29.6, 6.5, 4, skin);
		for (const x of [9, 12.2]) P.ellipse(x, -32.4, 1, 0.7, shade(skin, -0.4), { line: false });
		P.eyes(2.2, -32.4, 2, 1.25, '#2a1a1a');
		P.gloss(-2, -34.8, 1.8, 0.9, 0.4);
		P.gloss(7, -31.4, 2, 0.8, 0.35);
	},
	// Winged sphinx: a lion's body lying down with its paws forward, cream feathered wings raised behind, a pharaoh's head
	// in a striped teal-and-gold nemes, a tail curling up behind; faces right
	609(P) {
		P.shadow(18, 5);
		const fur = '#d0a060', feather = '#e4d0a0', gold = '#d9a83a', teal = '#2a8aa0', skin = '#d8a870';
		// wings rising from the back, the far one darker and higher
		for (const [dx, dy, c] of [[5, -3, shade(feather, -0.2)], [0, 0, feather]]) {
			const pts = [[-2, -13], [-20, -38], [-18, -31], [-15.5, -33.5], [-13.5, -26.5], [-11, -29], [-9, -21.5], [-6.4, -24], [-4.6, -17]].map(([x, y]) => [x + dx, y + dy]);
			const tips = [pts[1], pts[2], pts[4], pts[6], pts[8], pts[0]];
			P.shape((p) => { p.m(...pts[0]); p.q(-5 + dx, -34 + dy, ...pts[1]); for (let i = 1; i < tips.length; i++) p.q((tips[i - 1][0] + tips[i][0]) / 2 + 1.4, (tips[i - 1][1] + tips[i][1]) / 2 - 1.4, ...tips[i]); }, c, -20 + dx, -2 + dx);
			for (const q of [pts[2], pts[4], pts[6]]) P.thin([[pts[0][0] - 1.5, pts[0][1] - 2], q], shade(c, -0.3), 0.35);
			P.thin([[-4 + dx, -20 + dy], [-9 + dx, -31 + dy], [-17 + dx, -36.5 + dy]], shade(c, -0.3), 0.5);
			for (const [x, y] of [[-6, -22], [-9.5, -27], [-13.5, -31]]) P.thin([[x + dx, y + dy], [x + dx - 2, y + dy + 4]], shade(c, -0.25), 0.35);
		}
		// tail curling up behind the rump, a dark tuft
		taper(P, [[-14, -5], [-21, -7], [-21, -15], [-17, -16]], 1.5, 1, fur);
		P.ellipse(-16.6, -16.4, 1.8, 1.3, '#8a5a26', { rot: 0.4 });
		// the lying body, the haunch, the forelegs reaching forward
		P.shape((p) => { p.m(-17, -1); p.q(-19, -12, -9, -13); p.q(1, -14.5, 7, -11); p.q(10, -6, 9, -1); p.q(-4, 0.5, -17, -1); }, fur, -19, 10);
		P.ellipse(-11.5, -5.5, 5.8, 4.8, fur);
		P.ellipse(-7, -1.4, 3, 1.4, shade(fur, -0.05));
		P.line([[3, -4], [14, -2.2]], shade(fur, -0.15), 3.2);
		P.ellipse(15.4, -1.6, 2.6, 1.5, shade(fur, -0.15));
		P.line([[1, -3], [11.5, -1.6]], fur, 3.4);
		P.ellipse(13, -1.2, 2.8, 1.6, fur);
		for (const k of [-1, 0, 1]) P.thin([[13.6 + k * 0.9, -2], [14 + k * 0.9, -0.4]], shade(fur, -0.45), 0.3);
		P.gloss(-10, -10.5, 4, 1.2, 0.35);
		// a pharaoh's head on the chest
		edNemesBack(P, 5, -21, 6.2, gold, teal);
		head(P, -21, 5.8, skin, 5);
		P.eyes(5.6, -20.8, 2.2, 1.25, '#2a6aa0');
		P.thin([[2.6, -22.8], [4.6, -22.6]], '#5a3a1a', 0.45); P.thin([[6.6, -22.6], [8.6, -22.8]], '#5a3a1a', 0.45);
		P.thin([[4.8, -16.8], [6.4, -16.8]], '#8a4a3a', 0.45);
		P.poly([[4.6, -15.4], [6.6, -15.4], [6, -12.6], [5.2, -12.6]], gold);
		edNemesTop(P, 5, -21, 6.2, gold, teal);
	},
	// Crocodile priest: a green crocodile in a green and gold nemes, the long toothy snout facing right, a white robe with a
	// green front panel and a gold belt, a gold collar, a thick tail behind, a gold staff topped with an ankh
	610(P) {
		P.shadow(13, 5);
		const skin = '#5f9a3a', belly = '#c9d98a', white = '#f2ede0', green = '#3a7a4a', gold = '#d9a83a';
		// tail
		taper(P, [[-3, -9], [-12, -8], [-16, -3], [-19, -2]], 5, 1, skin);
		for (const [x, y] of [[-8, -10.6], [-12, -9.4], [-15, -6.6]]) P.poly([[x - 1, y + 0.4], [x, y - 1.4], [x + 1, y + 0.4]], shade(skin, -0.15));
		// feet below the robe
		for (const x of [-3.4, 3.6]) { P.ellipse(x + 0.6, -1.4, 2.8, 1.5, skin); for (const k of [-1, 0, 1]) P.thin([[x + 2 + k * 0.4, -1.6 + k], [x + 3.4, -1.4 + k * 1.1]], '#efe8d0', 0.3); }
		// the robe, green front panel, gold belt
		P.shape((p) => { p.m(-5, -21); p.q(0, -23, 5, -21); p.q(7, -12, 7.4, -3); p.q(0, -1.6, -7.4, -3); p.q(-7, -12, -5, -21); }, white, -7.4, 7.4);
		P.shape((p) => { p.m(-1.6, -13); p.l(2.8, -13); p.l(3.8, -2.4); p.l(-2.4, -2.4); }, green, -2.4, 3.8);
		P.thin([[0.6, -12], [0.8, -3]], gold, 0.4);
		P.line([[-5.6, -13.4], [5.8, -13.4]], gold, 1.3);
		P.circle(0.6, -13.4, 1, '#2a5ac8');
		// back arm
		P.line([[-4.5, -19.5], [-7, -14], [-6, -10.5]], shade(skin, -0.12), 2.2);
		P.circle(-5.8, -9.8, 1.5, shade(skin, -0.12));
		// collar
		P.shape((p) => { p.m(-6, -21.4); p.q(0, -24, 6, -21.4); p.q(4.4, -17.4, 0, -17.2); p.q(-4.4, -17.4, -6, -21.4); }, gold, -6, 6);
		P.thin([[-4.4, -20.6], [0, -21.6], [4.4, -20.6]], '#2a5ac8', 0.6);
		// the ankh staff, standing behind the head
		P.line([[13, 0], [13, -33]], gold, 1.2);
		P.shape((p) => { p.m(13, -33); p.q(10, -36, 13, -39.6); p.q(16, -36, 13, -33); }, gold, 10, 16);
		P.ellipse(13, -36.4, 1, 1.8, '#f6f0e4', { line: false });
		P.line([[10.6, -33], [15.4, -33]], gold, 1);
		// the head: a green and gold nemes, the long snout facing right
		ebNemes(P, -0.6, -28.6, 5.8, '#1f5a5a', gold);
		P.ellipse(0.6, -28, 4.8, 5.2, skin);
		P.shape((p) => { p.m(2, -31.2); p.q(12, -31.6, 17, -29.4); p.q(17.6, -27.6, 16, -27.2); p.l(3, -26.6); }, skin, 2, 17.6);
		P.shape((p) => { p.m(3, -26.6); p.l(16, -27.2); p.q(15, -24.8, 10, -24.6); p.q(4, -24.4, 2.6, -25.6); }, belly, 2.6, 16);
		for (let x = 5; x < 15.5; x += 1.6) P.poly([[x, -27], [x + 0.6, -27], [x + 0.3, -26]], '#fff8e8', { line: false });
		P.dot(16.4, -29.4, 0.45, '#1a2a0a');
		for (const x of [7, 9.6, 12]) P.dot(x, -30.6, 0.35, shade(skin, -0.3));
		ebNemesBand(P, -0.6, -28.6, 5.8, gold, 0.3);
		P.ellipse(3.6, -29.6, 1.7, 1.5, '#f2dc3a'); P.ellipse(4, -29.6, 0.5, 1.1, '#1a1208', { line: false });
		// front arm holding the ankh staff
		P.line([[4.6, -19.5], [9, -16], [11.6, -18]], skin, 2.2);
		P.line([[7.8, -16.8], [9.4, -15.8]], gold, 2.4);
		P.circle(12.4, -18.2, 1.6, skin);
	},
	// Lioness warrior: a tawny lioness woman (Sekhmet) in a blue-and-gold nemes, a white top and a white kilt with a blue
	// apron, gold bracelets, a sickle sword in each hand, a tufted tail
	611(P) {
		P.shadow(11, 4.5);
		const fur = '#c8904a', gold = '#d9a83a', blue = '#2f5fb0', white = '#efe9da';
		// tail behind with a dark tuft
		taper(P, [[-3, -9], [-11, -6], [-13.5, -11], [-12, -14.5]], 1.6, 1.2, fur);
		P.ellipse(-12, -15.4, 1.6, 2, '#7a4a1e');
		legs(P, fur, '#8a5a2a');
		for (const s of [-1, 1]) P.line([[s * 3, -3.8], [s * 3, -3]], gold, 3.8);
		// bare midriff, white top, kilt
		torso(P, -20, 5, -10, 4.4, fur);
		P.shape((p) => { p.m(-5, -20); p.l(5, -20); p.l(4.8, -16); p.q(0, -15, -4.8, -16); }, white, -5, 5);
		P.thin([[-1.6, -13.5], [-1.6, -11.5]], shade(fur, -0.3), 0.35); P.thin([[1.6, -13.5], [1.6, -11.5]], shade(fur, -0.3), 0.35);
		edShendyt(P, -11, -5, 5, gold, [blue, gold]);
		// the swords: one hanging low on the left, one held up on the right; arms with gold bands
		edSickle(P, -9.2, -9.4, -16.5, -9.5, -14, -1.5, 1.7);
		edSickle(P, 11, -18.6, 18, -24, 13, -31.5, 1.7);
		P.line([[-5, -18.5], [-8.4, -13.6], [-9, -10]], fur, 2.1);
		P.line([[5, -18.5], [9, -15.6], [10.8, -17.8]], fur, 2.1);
		P.line([[-8.6, -12.6], [-8.8, -11.2]], gold, 2.3); P.line([[8.6, -16], [9.6, -16.4]], gold, 2.3);
		P.circle(-9.1, -9.4, 1.5, fur); P.circle(11, -18.4, 1.5, fur);
		edUsekh(P, 0, -20.6, 5.4, [gold, blue, gold]);
		// head: a lioness face, an amber gaze, a pale muzzle and a dark nose
		edNemesBack(P, 0, -27.5, 6.8, gold, blue);
		head(P, -27.5, 6.4, fur);
		P.ellipse(0.8, -24, 3.4, 2.5, '#f0d8b0', { line: false });
		P.eyes(0.6, -27.8, 2.4, 1.3, '#8a5a0a');
		P.thin([[-2.8, -29.8], [-0.6, -29.4]], '#6a3a10', 0.5); P.thin([[4, -29.8], [1.8, -29.4]], '#6a3a10', 0.5);
		P.poly([[0, -25.2], [1.6, -25.2], [0.8, -24]], '#5a2a1a', { line: false });
		P.mouth(0.8, -22.6, 0.9, '#5a2a1a');
		edNemesTop(P, 0, -27.5, 6.8, gold, blue);
	},
	// Beetle guardian: a scarab warrior in lapis-blue armour with gold trim, its dark shell spread like a cloak behind it,
	// branching antler horns over a blue-and-gold nemes, a dark beetle face with glowing green eyes, a tall axe-headed
	// halberd in its far hand and a round shield with a scarab in its near hand
	612(P) {
		P.shadow(13, 5);
		const blue = '#2c4f9e', dark = '#1c2a5e', gold = '#d8a634', horn = '#7a5230', face = '#4a3424', silver = '#c8ccd4';
		// the halberd behind the far hand: a long haft, a broad crescent axe blade, a long spear point, a back spike
		P.line([[-13, 0.6], [-13, -41]], '#6a4a2a', 1);
		P.shape((p) => { p.m(-13, -38.6); p.q(-16.6, -39.4, -19.4, -42.6); p.q(-24.4, -35, -20, -26.4); p.q(-17, -30, -13, -30.4); }, silver, -24.4, -13);
		P.thin([[-19, -41], [-22.2, -34.6], [-19.6, -28]], '#f4f6fa', 0.45);
		P.shape((p) => { p.m(-13, -41); p.q(-11.4, -44.4, -13, -49); p.q(-14.6, -44.4, -13, -41); }, silver, -14.6, -11.4);
		P.poly([[-12.6, -36.6], [-8.4, -38.2], [-12.6, -34.2]], silver);
		P.circle(-13, -33.6, 1.5, '#3a6ad0');
		for (const y of [-39.6, -31.2]) P.line([[-13.9, y], [-12.1, y]], gold, 0.9);
		P.circle(-13, 0.4, 0.8, gold);
		// the shell spread behind like a cloak
		P.shape((p) => { p.m(-2, -27); p.q(-12, -27, -11.4, -14); p.q(-11, -6, -6, -4); p.l(6, -4); p.q(11, -6, 11.4, -14); p.q(12, -27, 2, -27); }, dark, -12, 12);
		P.thin([[0, -26], [0, -5]], shade(dark, 0.3), 0.4);
		P.gloss(-7, -20, 1.6, 3.4, 0.3);
		// thin armoured insect legs
		for (const [hx, kx, fx, c] of [[-2.4, -5, -3.6, shade(blue, -0.15)], [2.4, 5.6, 4.6, blue]]) {
			taper(P, [[hx, -11], [kx, -6.4], [fx, -1.6]], 2.8, 1.8, c);
			P.dot(kx * 0.85, -7, 1, gold);
			P.poly([[fx - 1.6, -1.6], [fx + 2.8, -1.4], [fx + 3.2, -0.2], [fx - 1.6, -0.4]], shade(c, -0.1));
		}
		// a striped silver-and-blue kilt, armoured torso with gold trim
		P.shape((p) => { p.m(-5, -13); p.l(5, -13); p.l(6.4, -6.6); p.q(0, -5.6, -6.4, -6.6); }, silver, -6.4, 6.4);
		for (const x of [-3.6, -1.2, 1.2, 3.6]) P.thin([[x * 0.9, -12.6], [x * 1.2, -6.4]], shade(silver, -0.35), 0.35);
		P.shape((p) => { p.m(-1.4, -12.6); p.l(1.4, -12.6); p.l(1.6, -5.4); p.l(-1.6, -5.4); }, blue, -1.6, 1.6);
		P.shape((p) => { p.m(-5, -21.6); p.q(0, -23, 5, -21.6); p.q(5.6, -16.6, 4.6, -12.6); p.l(-4.6, -12.6); p.q(-5.6, -16.6, -5, -21.6); }, blue, -5.6, 5.6);
		P.thin([[-3.4, -18], [0, -16.6], [3.4, -18]], gold, 0.5); P.thin([[-3, -15], [3, -15]], gold, 0.4);
		P.line([[-5, -12.8], [5, -12.8]], gold, 1.2);
		// the far arm holding the halberd, the near arm with the shield
		P.ellipse(-5.2, -21, 2.6, 2.4, blue);
		taper(P, [[-5, -20.4], [-10, -19.6], [-12.4, -23.6]], 2.4, 1.8, blue);
		P.circle(-13, -23.8, 1.6, face);
		P.ellipse(5.4, -21, 2.6, 2.4, blue);
		taper(P, [[5.6, -20.4], [9, -16.6], [11, -14]], 2.4, 1.8, blue);
		P.circle(13, -13.6, 7, gold);
		P.circle(13, -13.6, 5.4, blue, { line: false });
		P.ellipse(13, -13.2, 2, 2.6, '#3a6ad0');
		P.circle(13, -16.4, 1.2, '#3a6ad0');
		for (const s of [-1, 1]) P.thin(eaQpts([13 + s * 1.6, -13.6], [13 + s * 4.4, -15], [13 + s * 4, -11]), gold, 0.5);
		P.circle(13, -19.4, 1, '#e05a2a');
		P.gloss(10.6, -17.6, 1.4, 1, 0.35);
		eaBroadCollar(P, 0, -21.8, 5.6, 3.2, gold, [blue]);
		// antlers, nemes, the beetle face
		eaNemesBack(P, 0.8, -28.4, 5.4, blue, gold);
		P.line([[0.6, -21], [0.8, -23]], face, 2.4);
		head(P, -28.4, 5.4, face, 0.8);
		P.shape((p) => { p.m(-1, -25); p.q(1.8, -26, 4.4, -25); p.l(3.6, -22.4); p.q(1.6, -23.6, -0.2, -22.4); }, shade(face, 0.15), -1, 4.4);
		P.glowEyes(1.6, -28.6, 2.1, 0.95, '#60f060');
		eaNemesFront(P, 0.8, -28.4, 5.4, blue, gold);
		eaNemesLappets(P, 0.8, -28.4, 5.4, blue, gold);
		for (const s of [-1, 1]) {
			taper(P, [[0.8 + s * 3.4, -34], [0.8 + s * 4.6, -38], [0.8 + s * 8.6, -42.6]], 2, 0.5, horn);
			taper(P, [[0.8 + s * 4.6, -38.4], [0.8 + s * 7.6, -38.6], [0.8 + s * 9.2, -36.2]], 1.2, 0.4, horn);
		}
	},
	// Pharaoh scorpion: a bare-chested pharaoh in a blue and gold nemes rising from a golden scorpion's body, the tail
	// arched high behind him, pincers forward, a khopesh in one hand and a staff topped with a watching eye in the other
	613(P) {
		P.shadow(17, 5);
		const shell = '#c8963a', skin = '#d49a6a', gold = '#e2b440', blue = '#2a4ab0';
		for (const pts of [[[-5, -8], [-11, -12], [-14, -1]], [[-2, -8], [-6, -12.5], [-8, -0.5]], [[1, -8], [1.5, -12.5], [-1, -0.5]], [[4, -8], [7, -12], [6, -0.5]]]) P.line(pts, shade(shell, -0.2), 1.5);
		for (const [x, y, r] of [[-10, -11, 3.6], [-14, -15, 3.4], [-16, -20.5, 3.2], [-16.4, -26, 3], [-15, -31, 2.8], [-12, -35, 2.6], [-8, -37, 2.4]]) {
			P.circle(x, y, r, shell);
			P.gloss(x - r * 0.4, y - r * 0.45, r * 0.3, r * 0.16, 0.35);
		}
		P.shape((p) => { p.m(-6.6, -38.6); p.q(-2, -39.4, -2.4, -34); p.q(-2.6, -32, -3.8, -30.4); p.q(-4.2, -33.4, -6, -35.4); }, shade(shell, -0.35), -6.6, -2);
		const claw = (ox, oy, k, c) => {
			taper(P, [[ox + 3.5 * k, oy - 1 * k], [ox + 7 * k, oy - 3.6 * k], [ox + 9 * k, oy - 1.2 * k]], 2.2 * k, 0.5, c);
			taper(P, [[ox + 3.5 * k, oy + 0.8 * k], [ox + 7 * k, oy + 2 * k], [ox + 8.4 * k, oy + 0.4 * k]], 1.8 * k, 0.5, c);
			P.ellipse(ox + 2.6 * k, oy, 3.2 * k, 2.4 * k, c);
			P.gloss(ox + 1.8 * k, oy - 1 * k, 1 * k, 0.5 * k, 0.4);
		};
		P.line([[6, -9], [11, -9]], shade(shell, -0.1), 2.2);
		claw(10.5, -9.5, 1.05, shade(shell, -0.08));
		P.ellipse(-1, -9, 11, 5.6, shell);
		for (const x of [-8, -4, 0]) P.thin([[x, -14], [x + 0.6, -4.2]], shade(shell, -0.4), 0.4);
		P.gloss(-5, -12.6, 3, 1, 0.4);
		P.line([[5, -5], [10, -3]], shell, 2.4);
		claw(9.5, -3.2, 1.15, shell);
		// the pharaoh's torso, rising from the scorpion's front
		torso(P, -26, 5.6, -11.5, 4.8, skin);
		P.thin([[0, -21], [0, -14]], shade(skin, -0.3), 0.35);
		for (const y of [-19, -16.6]) P.thin([[-2.2, y], [2.2, y]], shade(skin, -0.3), 0.3);
		P.shape((p) => { p.m(-5.6, -13.6); p.l(5.6, -13.6); p.l(4, -9.4); p.l(0, -8); p.l(-4, -9.4); }, gold, -5.6, 5.6);
		P.line([[-5.4, -13.6], [5.4, -13.6]], blue, 0.8);
		// the khopesh in the left hand, sweeping down across the scorpion
		taper(P, [[-5, -24], [-8.4, -19.6], [-8.2, -15.2]], 3.2, 2.6, shade(skin, -0.05));
		P.line([[-9.4, -20.4], [-7.2, -19.2]], blue, 0.8);
		ecCrescent(P, -7.6, -13.2, -10.2, -5, -1.4, -5, 1.6);
		P.line([[-8.2, -15.6], [-7.6, -13]], '#4a2a1a', 1);
		P.circle(-8.2, -14.8, 1.8, skin);
		// the staff with the eye in the right hand
		P.line([[12.4, -10], [12.4, -37.4]], '#c89a30', 0.9);
		P.circle(12.4, -40.4, 3, gold);
		P.ellipse(12.4, -40.4, 2.2, 1.3, '#fbf7f0', { line: false });
		P.dot(12.7, -40.4, 0.9, '#1a8aa0'); P.dot(12.7, -40.4, 0.45, '#101010');
		taper(P, [[5, -24], [9, -21.6], [11.4, -20]], 3.2, 2.6, skin);
		P.line([[8, -23.2], [8.8, -20.8]], blue, 0.8);
		P.circle(12.4, -20, 1.9, skin);
		ecUsekh(P, 0.6, -25.4, 6.4);
		ecNemesBack(P, 1, -33, 7.6, gold, blue);
		head(P, -32.6, 6.2, skin, 1.5);
		P.thin([[-1.2, -34.4], [1, -34]], '#4a2a1a', 0.4); P.thin([[2.4, -34], [4.8, -34.4]], '#4a2a1a', 0.4);
		P.eyes(1.8, -32.6, 2.4, 1.5, '#2a1a10');
		P.thin([[0.8, -28.6], [2.8, -28.6]], '#7a3a2a', 0.4);
		ecNemesFront(P, 1.3, -33, 7.2, gold, blue);
	},
	// Ammit: a beast with a crocodile's head roaring open, a shaggy lion's mane and forelegs, and a grey hippo's rump and
	// hind legs; faces right
	614(P) {
		P.shadow(17, 5);
		const hippo = '#8c8a98', lion = '#c8954a', mane = '#b0702e', croc = '#6a9a3a';
		// far legs
		P.line([[-11, -8], [-12, -1.8]], shade(hippo, -0.2), 4);
		P.line([[7, -8], [9.5, -2]], shade(lion, -0.2), 3);
		P.ellipse(10.2, -1.4, 2.2, 1.2, shade(lion, -0.2));
		// a little tail, the grey rump, the tawny chest
		P.line([[-17, -12], [-19.5, -8.5]], hippo, 1.2);
		P.ellipse(-8, -12, 10, 8, hippo);
		P.gloss(-11, -17, 3.4, 1.2, 0.35);
		P.ellipse(4, -11.5, 7, 7, lion);
		// near hind leg, fat with toes
		P.ellipse(-10, -9, 5, 6, hippo);
		P.line([[-10, -6], [-10.5, -2]], hippo, 4.6);
		P.ellipse(-10.4, -1.4, 3, 1.5, hippo);
		for (const k of [-1, 0, 1]) P.dot(-10 + k * 1.2, -0.6, 0.45, '#e8e2d8');
		// a shaggy mane round the neck
		P.shape((p) => {
			const pts = [];
			for (let i = 0; i <= 22; i++) { const a = Math.PI * 2 * i / 22, r = i % 2 ? 8 : 11; pts.push([3 + Math.cos(a) * r * 0.85, -19 + Math.sin(a) * r]); }
			p.m(...pts[0]); for (let i = 1; i < pts.length - 1; i += 2) p.q(...pts[i], ...pts[i + 1]);
		}, mane, -5, 13);
		for (const a of [0.4, 1.6, 2.6, 3.6, 4.6]) P.thin([[4 + Math.cos(a) * 3, -20 + Math.sin(a) * 3.6], [4 + Math.cos(a) * 7, -20 + Math.sin(a) * 8]], shade(mane, -0.35), 0.4);
		// near foreleg with claws
		P.line([[5, -10], [9, -5.5], [11.5, -2]], lion, 3.4);
		P.ellipse(12.4, -1.4, 2.6, 1.4, lion);
		for (const k of [0, 1, 2]) P.poly([[13.2 + k * 0.6, -1.6], [14.8 + k * 0.6, -0.6], [13.6 + k * 0.6, -0.4]], '#f0ead8', { line: false });
		// the crocodile head, jaws open wide
		P.shape((p) => { p.m(7, -19); p.q(13, -17.6, 19.5, -16); p.q(20, -14, 18, -13.8); p.q(12, -14, 6, -15); }, shade(croc, -0.08), 6, 20);
		P.shape((p) => { p.m(8, -21); p.q(13, -19.5, 19, -17); p.l(18, -24); p.q(13, -24, 8, -24); }, '#b03a4a', 8, 19);
		P.shape((p) => { p.m(4, -25); p.q(12, -27.5, 21, -27.5); p.q(22.5, -26.2, 21, -24.6); p.q(13, -24.2, 8, -22); }, croc, 4, 22.5);
		for (let x = 10; x < 21; x += 2.2) { P.poly([[x, -24.6], [x + 0.9, -24.4], [x + 0.5, -23]], '#f6efe0', { line: false }); P.poly([[x + 0.4, -16], [x + 1.3, -16.3], [x + 0.8, -17.6]], '#f6efe0', { line: false }); }
		P.ellipse(6, -23.4, 4.6, 3.2, croc, { rot: -0.15 });
		P.circle(6.4, -26.6, 2, croc);
		P.ellipse(6.6, -26.8, 1.3, 1.1, '#ffd23f', { line: false }); P.ellipse(6.8, -26.8, 0.35, 0.9, '#1a0a00', { line: false });
		P.thin([[4.6, -28.2], [8.6, -27.6]], shade(croc, -0.45), 0.5);
		P.dot(20.6, -27.4, 0.45, shade(croc, -0.5));
		P.gloss(3.6, -26, 1.4, 0.7, 0.4);
	},
	// Burning obelisk: a walking golden obelisk wreathed in flames, its pointed top above a glowing angry face and carved
	// hieroglyphs, a stone slab at its base, blocky stone arms with big square fists and blocky legs
	615(P) {
		P.shadow(15, 5);
		const stone = '#d8a840', fire = '#ff9a20';
		const flame = (x, y, h, w) => {
			P.glow(x, y - h * 0.45, w * 2, fire, 0.35);
			P.shape((p) => { p.m(x - w, y); p.q(x - w * 1.2, y - h * 0.5, x - w * 0.3, y - h * 0.68); p.q(x - w * 0.4, y - h * 0.9, x, y - h); p.q(x + w * 0.3, y - h * 0.62, x + w * 0.7, y - h * 0.78); p.q(x + w * 1.3, y - h * 0.4, x + w, y); }, fire, x - w, x + w, { line: false });
			P.shape((p) => { p.m(x - w * 0.5, y); p.q(x - w * 0.6, y - h * 0.35, x, y - h * 0.62); p.q(x + w * 0.6, y - h * 0.35, x + w * 0.5, y); }, '#ffe070', x - w, x + w, { line: false });
		};
		for (const [x, y, h, w] of [[-14, -16, 12, 3.4], [14, -16, 12, 3.4], [-10, -27, 9, 2.6], [10, -27, 9, 2.6], [-7.6, -3, 7, 2.4], [8, -3, 7, 2.4]]) flame(x, y, h, w);
		const block = (x0, y0, x1, y1, c = stone) => { P.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c); P.thin([[x0 + 0.6, y0 + 0.6], [x1 - 0.6, y0 + 0.6]], shade(c, 0.35), 0.4); };
		block(-7.6, -10.5, -2.4, -3.4, shade(stone, -0.1)); block(-8.6, -3.6, -1.8, -0.6, shade(stone, -0.15));
		block(2.4, -10.5, 7.6, -3.4); block(1.8, -3.6, 8.6, -0.6, shade(stone, -0.08));
		for (const s of [-1, 1]) {
			block(s < 0 ? -11.4 : 6, -30, s < 0 ? -6 : 11.4, -24, shade(stone, s < 0 ? -0.05 : 0));
			block(s < 0 ? -13.6 : 8.6, -24.4, s < 0 ? -8.6 : 13.6, -18.6, shade(stone, s < 0 ? -0.08 : -0.03));
			block(s < 0 ? -16 : 9.4, -19, s < 0 ? -9.4 : 16, -12, shade(stone, s < 0 ? -0.02 : 0.03));
			for (const d of [0.25, 0.5, 0.75]) { const x0 = s < 0 ? -16 : 9.4; P.thin([[x0 + 6.6 * d, -15.6], [x0 + 6.6 * d, -12.4]], shade(stone, -0.4), 0.35); }
		}
		// the obelisk body, its slab base and the face
		P.poly([[0, -45], [5.2, -38], [5.6, -12], [-5.6, -12], [-5.2, -38]], stone);
		P.poly([[0, -45], [5.2, -38], [-5.2, -38]], shade(stone, 0.12));
		P.thin([[0, -45], [0.4, -38]], shade(stone, -0.3), 0.35);
		P.gloss(-3, -34, 0.8, 3, 0.35);
		for (const [x, y] of [[-2.4, -24], [1.6, -22], [-1, -19], [2.4, -17], [-2.6, -15.4]]) { P.thin([[x, y], [x + 1.2, y]], shade(stone, -0.4), 0.35); P.thin([[x + 0.6, y - 1], [x + 0.6, y + 0.6]], shade(stone, -0.4), 0.35); }
		block(-9, -13.4, 9, -10, shade(stone, -0.05));
		P.shape((p) => { p.m(-3.6, -34.4); p.l(-0.8, -32.6); p.l(-1.2, -31.4); p.l(-3.8, -32.6); }, '#5a2a08', -3.8, -0.8, { line: false });
		P.shape((p) => { p.m(3.6, -34.4); p.l(0.8, -32.6); p.l(1.2, -31.4); p.l(3.8, -32.6); }, '#5a2a08', 0.8, 3.8, { line: false });
		for (const s of [-1, 1]) { P.glow(s * 2.3, -32.4, 2.2, '#ffe060', 0.6); P.dot(s * 2.3, -32.4, 0.6, '#fff6c0'); }
		P.poly([[-1.8, -28.6], [1.8, -28.6], [1.8, -27.4], [-1.8, -27.4]], '#5a2a08', { line: false });
	},
	// Dancing skeleton: a bronze-boned skeleton caught mid-dance, one hand flung up, the other out to the side, knees bent,
	// in a green-and-gold striped nemes, a turquoise collar, a white kilt with a striped apron, gold bracelets and anklets
	616(P) {
		P.shadow(12, 4.5);
		const bone = '#d2ad78', gold = '#d8a634', green = '#2a9a6a', linen = '#f2ecdc';
		const limb = (pts, w = 1.6) => { P.line(pts, bone, w); for (const q of pts.slice(1, -1)) P.dot(q[0], q[1], w * 0.6, shade(bone, 0.1)); };
		eaNemesBack(P, 0.4, -29.4, 5.8, gold, green);
		limb([[-2.6, -11], [-8, -6.6], [-6, -2]]);
		limb([[2.6, -11], [8, -7], [7, -2]]);
		for (const x of [-6, 7]) { P.line([[x - 1.1, -3], [x + 1.1, -3]], gold, 0.9); P.ellipse(x + 0.4, -1.1, 2.2, 1.1, bone); }
		P.line([[0, -21], [0, -12]], bone, 1.3);
		P.shape((p) => { p.m(-4.6, -21.6); p.q(0, -23, 4.6, -21.6); p.q(5, -17.4, 3.4, -15.4); p.q(0, -14.6, -3.4, -15.4); p.q(-5, -17.4, -4.6, -21.6); }, bone, -5, 5);
		for (const y of [-19.6, -17.8, -16.2]) for (const s of [-1, 1]) P.thin(eaQpts([s * 0.6, y], [s * 3, y - 0.4], [s * 4, y + 0.8]), '#3a2614', 0.45);
		P.shape((p) => { p.m(-5.2, -12.8); p.l(5.2, -12.8); p.l(6.6, -6.4); p.q(0, -5.2, -6.6, -6.4); }, linen, -6.6, 6.6);
		P.shape((p) => { p.m(-1.6, -12.4); p.l(1.6, -12.4); p.l(1.8, -4.4); p.l(-1.8, -4.4); }, green, -1.8, 1.8);
		for (const y of [-10.6, -8.6, -6.6]) P.thin([[-1.6, y], [1.6, y]], gold, 0.5);
		P.line([[-5.4, -12.8], [5.4, -12.8]], gold, 1.2);
		limb([[-4.6, -20.6], [-10.6, -19.6], [-14.6, -15.2]]);
		P.line([[-12.6, -18.2], [-11.8, -16.4]], gold, 1.2);
		P.ellipse(-16, -14, 2.2, 1.3, bone, { rot: 0.5 });
		limb([[4.6, -20.6], [10.6, -23.6], [12.6, -31]]);
		P.line([[11.4, -28], [13.4, -28.4]], gold, 1.2);
		P.ellipse(14.4, -33, 2.6, 1.3, bone, { rot: -0.4 });
		eaBroadCollar(P, 0, -21.8, 6, 3.4, gold, [green, '#2c4f9e']);
		P.line([[0.2, -21], [0.4, -23]], bone, 1.6);
		skull(P, 0.4, -29.4, 5.8, bone);
		eaNemesFront(P, 0.4, -29.4, 5.8, gold, green);
		eaNemesLappets(P, 0.4, -29.4, 5.8, gold, green);
	},
	// Skeletal pharaoh: a brown-boned skeleton king in the tall white crown, a broad striped collar, a white kilt with a
	// green and gold apron and gold bands on the bones, the crook raised in one hand and the flail hanging from the other
	617(P) {
		P.shadow(11, 4.5);
		const bone = '#c8b080', green = '#1f7a5a', gold = '#d9a83a', white = '#f2ece0', blue = '#2f5aa8';
		// bony legs
		for (const [h, k, f] of [[-2.6, -4.4, -4.4], [2.6, 4.6, 4.8]]) {
			P.line([[h, -9], [k, -5.4], [f, -2]], bone, 1.4);
			P.dot(k, -5.4, 1, bone);
			P.line([[f, -3.8], [f, -2.8]], gold, 1.8);
			P.ellipse(f + 0.6, -1.2, 2.2, 1.1, bone);
		}
		// kilt with the apron
		P.shape((p) => { p.m(-4.6, -12); p.l(4.6, -12); p.l(6.6, -6.4); p.q(0, -5, -6.6, -6.4); }, white, -6.6, 6.6);
		P.shape((p) => { p.m(-1.2, -11.6); p.l(2, -11.6); p.l(2.4, -4.4); p.l(-1.6, -4.4); }, green, -1.6, 2.4);
		for (const y of [-10, -8, -6]) P.thin([[-1.3, y], [2.1, y]], gold, 0.4);
		P.line([[-4.8, -12], [4.8, -12]], gold, 1.1);
		// spine and ribs
		P.line([[0, -12], [0, -21]], bone, 1.2);
		for (const [y, w] of [[-18.4, 4.2], [-16.4, 3.8], [-14.6, 3]]) P.line([[-w, y + 0.6], [0, y], [w, y + 0.6]], bone, 0.9);
		// the flail hanging from the far hand
		P.line([[-4.4, -21], [-7.6, -16], [-8.4, -12]], bone, 1.2);
		P.dot(-7.6, -16, 0.9, bone);
		P.line([[-8.6, -12.6], [-10.4, -14.6]], '#8a5a2a', 0.9);
		for (const k of [0, 1, 2]) P.line([[-10.4, -14.6], [-11.8 + k * 1.2, -8.4 + k * 0.4]], gold, 0.7);
		P.circle(-8.6, -12, 1.2, bone);
		// broad striped collar
		P.shape((p) => { p.m(-6.4, -22.4); p.q(0, -25.4, 6.4, -22.4); p.q(4.6, -17.6, 0, -17.4); p.q(-4.6, -17.6, -6.4, -22.4); }, gold, -6.4, 6.4);
		P.shape((p) => { p.m(-5, -21.8); p.q(0, -23.8, 5, -21.8); p.q(3.6, -19.2, 0, -19); p.q(-3.6, -19.2, -5, -21.8); }, green, -5, 5, { line: false });
		P.thin([[-3.8, -20.8], [0, -21.8], [3.8, -20.8]], blue, 0.5);
		// the skull under the tall white crown
		skull(P, 0.6, -28, 5, bone);
		P.shape((p) => { p.m(-4.4, -30.6); p.q(-5, -36, -3, -38.6); p.q(-1.6, -41.6, 0.6, -42); p.q(2.8, -41.6, 4.2, -38.6); p.q(6.2, -36, 5.6, -30.6); p.q(0.6, -32.6, -4.4, -30.6); }, white, -5, 6.2);
		P.circle(0.6, -42.4, 1.1, white);
		P.line([[-4.4, -30.8], [0.6, -32.4], [5.6, -30.8]], gold, 0.7);
		P.gloss(-2.2, -37, 0.8, 1.8, 0.45);
		// the near arm raising the crook
		P.line([[4.4, -21], [8.4, -17.6], [10.2, -21]], bone, 1.2);
		P.dot(8.4, -17.6, 0.9, bone);
		P.line([[10.6, -17], [10.6, -26.4]], '#3aa8a0', 0.9);
		P.shape((p) => { p.m(10.2, -26.4); p.q(10, -29.6, 12.1, -29.6); p.q(14, -29.4, 13.6, -27); p.l(12.7, -27.2); p.q(12.9, -28.6, 12.1, -28.6); p.q(11, -28.6, 11, -26.4); }, '#3aa8a0', 10, 14);
		for (const y of [-18.4, -23.4, -26.2]) P.thin([[10, y], [11.2, y]], gold, 0.6);
		P.circle(10.6, -21, 1.2, bone);
	},
	// Flying mummy: a hovering mummy wrapped in grey bandages, a blue and gold nemes over a skull with glowing green eyes,
	// clawed arms raised and spread with bandage strips trailing, its lower body a tattered shroud of grey rags
	618(P) {
		P.shadow(11, 4, 1, 0.18);
		const band = '#9a9884', dark = '#5e5e52', gold = '#e2b440', blue = '#2a4ab0';
		// trailing rags
		for (const [x, d] of [[-6, -1], [-2, 0], [2, 0.5], [6, 1]]) taper(P, [[x, -10], [x + d * 2, -6], [x + d * 3 - 1, -2.4]], 2, 0.4, dark);
		P.shape((p) => { p.m(-5, -18); p.l(5, -18); p.q(8, -12, 8.6, -6); p.l(6.4, -8); p.l(5, -3.6); p.l(3, -7); p.l(1, -2.6); p.l(-1, -6.6); p.l(-3, -3); p.l(-4.6, -7.4); p.l(-6.6, -4.4); p.l(-8.4, -7); p.q(-8, -12, -5, -18); }, shade(dark, 0.12), -8.6, 8.6);
		for (const x of [-4, 0, 4]) P.thin([[x, -16], [x * 1.3, -7]], shade(dark, -0.3), 0.35);
		P.line([[-5.4, -17.4], [5.4, -17.4]], '#8a7a40', 1.1);
		torso(P, -25, 5.4, -17, 4.8, band);
		for (const y of [-23, -21, -19]) P.thin([[-4.6, y + 0.6], [4.6, y - 0.6]], shade(band, -0.4), 0.35);
		// raised clawed arms, strips hanging from them
		for (const s of [-1, 1]) {
			taper(P, [[s * 4.6, -23.4], [s * 10.4, -25.4], [s * 14.6, -30.6]], 3.2, 2.6, s < 0 ? shade(band, -0.08) : band);
			for (const [x, y] of [[9, -24.6], [12.6, -27.6]]) taper(P, [[s * x, y], [s * (x + 0.6), y + 4], [s * (x - 0.4), y + 8]], 1, 0.3, band);
			P.circle(s * 15.4, -31.6, 1.9, band);
			for (const a of [-0.9, -0.3, 0.3]) P.line([[s * 15.4, -31.6], [s * (15.4 + Math.cos(a - 1.2) * 3.4), -31.6 + Math.sin(a - 1.2) * 3.4]], band, 0.6);
		}
		ecUsekh(P, 0.4, -25, 6, '#2a8a8a');
		ecNemesBack(P, 0.6, -32, 7.6, gold, blue);
		skull(P, 1, -31.4, 5.8, '#cac2a4', '#50ff60');
		ecNemesFront(P, 1, -32, 7.2, gold, blue);
	},
	// Thoth (the ibis scribe, a unique monster on EA-EC): a green-skinned man with an ibis head and a long down-curved beak
	// under a dark striped wig, a gold and teal collar, a cream robe with a brown belt, a gold buckle and a teal apron,
	// wrapped legs on bird feet, a green staff topped by an animal head in one hand and an open scroll in the other
	621(P) {
		P.shadow(12, 4.6);
		const skin = '#4f9a7a', wig = '#33323c', robe = '#efe6cf', gold = '#d9a83a', teal = '#2f8a84', wrap = '#8a6040', staff = '#3f8a5a';
		// the staff, behind: a forked foot, a gold band, an animal head on top
		P.line([[-10.4, 0.4], [-10.4, -36.6]], staff, 1.2);
		P.thin([[-11.4, 1], [-10.4, -0.6], [-9.4, 1]], staff, 0.6);
		P.line([[-11.1, -29.4], [-9.7, -29.4]], gold, 0.9);
		P.shape((p) => { p.m(-11, -36); p.q(-10.6, -39.6, -13.2, -40); p.l(-15.4, -38.8); p.l(-13, -38.6); p.q(-11.8, -38, -9.8, -35.6); }, staff, -15.4, -9.8);
		P.poly([[-12.2, -39.6], [-12.6, -42], [-11.4, -40]], staff);
		P.dot(-12.8, -39.2, 0.35, '#e05040');
		// wrapped legs on bird feet
		for (const [x, c] of [[-2.4, shade(wrap, -0.12)], [2.4, wrap]]) {
			taper(P, [[x, -11], [x + 0.4, -2.4]], 2.6, 2, c);
			for (const y of [-9, -7, -5, -3.4]) P.thin([[x - 1, y], [x + 1.3, y - 0.5]], shade(c, -0.35), 0.35);
			for (const k of [-1, 0, 1]) taper(P, [[x + 0.4, -1.8], [x + 1.6 + k * 1.4, -0.2 + Math.abs(k) * 0.2]], 0.9, 0.35, '#5a4a30');
		}
		// the robe, flaring to the hem, the teal apron with gold chevrons, the belt and its gold buckle
		P.shape((p) => { p.m(-5.4, -25.6); p.l(5.4, -25.6); p.q(6.6, -16, 8.4, -7); p.q(0, -5.4, -8.4, -7); p.q(-6.6, -16, -5.4, -25.6); }, robe, -8.4, 8.4);
		P.thin([[-3.4, -14], [-5.4, -7.4]], shade(robe, -0.15), 0.45); P.thin([[3.6, -14], [5.6, -7.4]], shade(robe, -0.15), 0.45);
		P.shape((p) => { p.m(-2.2, -15); p.l(2.2, -15); p.l(1.8, -7.6); p.l(0, -5.8); p.l(-1.8, -7.6); }, teal, -2.2, 2.2);
		for (const y of [-12.6, -10.4, -8.2]) P.thin([[-1.6, y], [0, y + 1], [1.6, y]], gold, 0.4);
		P.line([[-5.6, -15.6], [5.8, -15.6]], '#7a4a2a', 1.4);
		P.poly([[-1.2, -16.4], [1.2, -16.4], [0, -14.2]], gold);
		// the near arm down to the staff, a gold armband
		taper(P, [[-4.4, -24], [-7.6, -20.6], [-9.6, -23.6]], 2.8, 2.2, skin);
		P.line([[-7.1, -21.9], [-8.2, -20.4]], gold, 1.6);
		P.circle(-10.2, -24, 1.5, skin);
		// the dark striped wig hanging behind the head to the shoulders
		P.shape((p) => { p.m(-1, -38.4); p.q(-5.6, -38, -5.8, -32); p.l(-6, -25.4); p.l(-1.6, -25); p.l(3.2, -27); p.q(4.6, -33, 3.4, -36.6); p.q(1.6, -38.6, -1, -38.4); }, wig, -6, 4.6);
		for (const x of [-4.6, -3, -1.4]) P.thin([[x + 0.6, -37], [x, -25.8]], shade(wig, 0.3), 0.4);
		// the collar: gold, teal and gold bands
		P.ellipse(0, -25.2, 6.4, 2.8, gold);
		P.ellipse(0, -25.5, 5.2, 2.1, teal, { line: false });
		P.ellipse(0, -25.8, 4, 1.4, gold, { line: false });
		// the ibis head: a slender green neck and head, a long down-curved beak, a dark eye
		taper(P, [[1, -26.4], [1.6, -31]], 2.8, 2.2, skin);
		P.ellipse(2, -34, 3, 2.8, skin);
		P.shape((p) => { p.m(4.2, -35.6); p.q(10.4, -36.4, 14.4, -28.6); p.q(13.8, -28.2, 13.6, -28.6); p.q(10, -33.2, 4.4, -32.8); }, '#9a6a6a', 4.2, 14.4);
		P.thin([[5.6, -34.4], [9.6, -34], [13, -29.6]], shade('#9a6a6a', 0.35), 0.35);
		P.dot(3, -34.8, 0.75, '#1a1a1a'); P.dot(3.2, -35.1, 0.25, '#ffffff');
		P.gloss(0.8, -35.6, 1, 0.6, 0.4);
		// the far arm holding an open papyrus scroll out in front
		taper(P, [[4.4, -24], [7, -18.6], [9.6, -18.4]], 2.8, 2.2, skin);
		P.shape((p) => { p.m(9, -24.4); p.l(14, -23.4); p.l(13.2, -14.6); p.l(8.2, -15.6); }, '#e8d6a4', 8.2, 14);
		P.line([[8.8, -24.6], [14.2, -23.6]], shade('#e8d6a4', -0.15), 1.2);
		P.line([[8, -15.4], [13.4, -14.4]], shade('#e8d6a4', -0.15), 1.2);
		for (const y of [-22, -20.4, -18.8, -17.2]) P.thin([[9.6, y], [12.8, y + 0.6]], shade('#e8d6a4', -0.4), 0.3);
		P.circle(9.8, -18.6, 1.5, skin);
	},
	// Anubite: a black-furred jackal warrior with a gold-striped headdress, a gold collar and armlets, a white kilt with a
	// gold belt and apron, a khopesh low in its far hand and a round bronze shield on its near arm
	619(P) { eaJackal(P, false); },
	// Anubis (the EA boss): the jackal god, taller and grander than his Anubites: a gold breastplate, gold bracers and
	// greaves, a golden khopesh and a big bronze shield
	620(P) { eaJackal(P, true); },
	// Demoralization snake: a cobra-headed sorcerer in a long dark green robe with brown lapels and a green scaled front,
	// the head spreading a wide hood, glowing eyes and fangs, a serpent's tail coiling out under the robe, one clawed
	// hand raised, the other on a staff topped with a live snake
	622(P) {
		P.shadow(17, 5);
		const green = '#4e8a3a', robe = '#4a5a3e', lapel = '#7a5a3a', pale = '#8ac08a';
		P.ellipse(0, -3.4, 16, 4.4, green);
		for (let x = -13; x <= 13; x += 2.6) P.thin([[x - 0.8, -4.4], [x + 0.8, -2.6]], shade(green, -0.3), 0.3);
		P.gloss(-9, -5, 3, 0.8, 0.35);
		torso(P, -25, 6, -4.4, 9, robe);
		P.shape((p) => { p.m(-2.6, -21); p.l(2.6, -21); p.l(4.6, -4.4); p.q(0, -3.2, -4.6, -4.4); }, pale, -4.6, 4.6);
		for (let y = -18; y < -5; y += 2.4) P.thin([[-2.6 - (y + 21) * 0.1, y], [0, y + 1], [2.6 + (y + 21) * 0.1, y]], shade(pale, -0.3), 0.35);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 2.6, -24.8); p.l(s * 5.6, -24.8); p.l(s * 3.4, -16.4); p.l(s * 0.8, -16.4); }, lapel, s < 0 ? -5.6 : 0.8, s < 0 ? -0.8 : 5.6);
		P.line([[-6.4, -16.4], [6.4, -16.4]], '#8a6a40', 1.4);
		// the raised arm: a wide sleeve and a clawed hand held up
		P.shape((p) => { p.m(-4.6, -24); p.q(-10, -23, -13, -18.6); p.l(-8.6, -16.4); p.q(-7, -19.4, -4.4, -19.6); }, robe, -13, -4.4);
		P.circle(-12.6, -21.4, 1.9, '#5a7a4a');
		for (const a of [-2.4, -1.9, -1.4, -0.9]) P.line([[-12.6, -21.4], [-12.6 + Math.cos(a) * 3.4, -21.4 + Math.sin(a) * 3.4]], '#5a7a4a', 0.6);
		// the staff topped with a snake, held in the other hand
		P.line([[12.6, -1.4], [12.6, -32]], '#8a6a3a', 0.9);
		taper(P, [[12.6, -31], [10.6, -35], [13.4, -38.4], [15.6, -40]], 2, 1.4, green);
		P.ellipse(17, -40.6, 2.4, 1.6, green);
		P.dot(17.4, -41.2, 0.5, '#ffe040');
		P.line([[19.2, -40.2], [20.6, -39.6]], '#d0303a', 0.25);
		P.shape((p) => { p.m(4.6, -24); p.q(10, -23, 12.4, -19); p.l(8.6, -15.6); p.q(7, -19, 4.4, -19.6); }, shade(robe, 0.05), 4.4, 12.4);
		P.circle(12.6, -18.6, 1.9, '#5a7a4a');
		// cobra head with a wide hood
		P.shape((p) => { p.m(1, -42.6); p.q(-8.4, -42.4, -8, -33); p.q(-7.4, -26.4, -3, -23.4); p.l(5, -23.4); p.q(9.4, -26.4, 10, -33); p.q(10.4, -42.4, 1, -42.6); }, green, -8.4, 10.4);
		P.shape((p) => { p.m(-2.6, -36); p.q(1, -37, 4.6, -36); p.q(4, -28, 1, -24); p.q(-2, -28, -2.6, -36); }, pale, -2.6, 4.6, { line: false });
		for (let y = -34; y < -25; y += 2) P.thin([[-1.6 + (y + 34) * 0.12, y], [3.6 - (y + 34) * 0.12, y]], shade(pale, -0.3), 0.3);
		P.ellipse(1.4, -37.4, 4.6, 3.4, shade(green, 0.08));
		P.gloss(-0.4, -39.6, 1.6, 0.6, 0.45);
		P.ellipse(2.6, -34.4, 2.4, 1.2, '#5a1a1a', { line: false });
		for (const x of [1.4, 3.8]) P.poly([[x - 0.4, -35], [x + 0.4, -35], [x, -33.4]], '#f3ece0', { line: false });
		P.line([[2.6, -34], [2.6, -32.4]], '#d0303a', 0.25);
		for (const x of [-0.6, 3.6]) { P.glow(x, -38, 1.8, '#ffe040', 0.55); P.dot(x, -38, 0.75, '#fff080'); P.dot(x + 0.15, -38, 0.3, '#1a1a08'); }
	},
	// Serpent sorceress: a woman with a green snake's tail in place of legs, a golden cobra hood rising over her black hair,
	// a white top, a gold hip panel, gold armbands, a cobra-topped staff in one hand and the other hand raised
	623(P) {
		P.shadow(15, 5);
		const skin = '#d8a070', green = '#3f8a3a', belly = '#e0c060', gold = '#d9a83a', hair = '#1e1a1a';
		// the staff on the left, a golden cobra on top, a green snake twined round it
		P.line([[-11, 0], [-11.5, -32]], gold, 1.1);
		taper(P, [[-11.5, -31], [-13.6, -35], [-11.6, -38]], 1.8, 1.4, gold);
		P.ellipse(-11.6, -39.4, 2.6, 2.2, gold);
		P.dot(-12.2, -39.8, 0.5, '#c8302a');
		for (let y = -4; y > -26; y -= 5) P.line([[-12.6, y], [-10.4, y - 2.5]], green, 0.9);
		// the tail: down from the hips, along the ground and curling up on the right
		taper(P, [[0, -12], [-2, -2], [8, -1.5], [16, -3], [17, -9], [13.4, -11]], 7, 1.2, green);
		taper(P, [[0.6, -11], [-0.6, -3], [8, -2.8], [14.6, -4]], 2.4, 0.6, belly, { line: false });
		for (const [x, y] of [[-1, -7], [4, -2], [10, -2.4], [15.4, -6]]) P.thin([[x - 0.8, y - 0.8], [x + 0.8, y + 0.8]], shade(green, -0.35), 0.35);
		// long black hair behind
		P.shape((p) => { p.m(-6.4, -30); p.q(-8.4, -22, -6.4, -17); p.l(6.4, -17); p.q(8.4, -22, 6.4, -30); }, hair, -8.4, 8.4);
		// bare midriff, white top, gold hip panel
		torso(P, -21, 4.6, -11, 5, skin);
		P.shape((p) => { p.m(-4.8, -20.5); p.l(4.8, -20.5); p.l(4.6, -17.4); p.q(0, -16, -4.6, -17.4); }, '#efe9da', -4.8, 4.8);
		P.shape((p) => { p.m(-5.2, -12); p.l(5.2, -12); p.l(3, -5); p.l(0, -3); p.l(-3, -5); }, gold, -5.2, 5.2);
		P.poly([[-1.2, -11.4], [1.2, -11.4], [0, -6]], green);
		// arms: the left on the staff, the right raised with an open hand
		P.line([[-4.6, -19.5], [-8, -16.4], [-10.4, -18]], skin, 1.9);
		P.line([[-7.4, -17], [-8.6, -16.4]], gold, 2.1);
		P.circle(-11.2, -18.4, 1.5, skin);
		P.line([[4.6, -19.5], [8.6, -17.6], [10.8, -21.4]], skin, 1.9);
		P.line([[8, -17.8], [9, -17.8]], gold, 2.1);
		P.circle(11, -22.6, 1.5, skin);
		for (const k of [-1, 0, 1]) P.thin([[11 + k * 0.8, -23.6], [11.2 + k * 1.2, -25.4]], skin, 0.6);
		edUsekh(P, 0, -21.2, 4.6, [gold, green, gold]);
		// the golden cobra hood behind the head, its head rearing on top
		P.ellipse(0, -30, 8.6, 9.6, gold);
		P.ellipse(0, -29.4, 6.2, 7.4, green, { line: false });
		P.ellipse(0, -39.6, 2.8, 2.4, gold);
		for (const s of [-1, 1]) P.dot(s * 1.1, -39.8, 0.45, '#2a8a2a');
		// face: black fringe, green eyes, red lips
		head(P, -27.5, 5.8, skin);
		P.shape((p) => { p.m(-5.8, -28); p.q(-6, -33.6, 0, -33.6); p.q(6, -33.6, 5.8, -28); p.q(3, -31, 0, -31); p.q(-3, -31, -5.8, -28); }, hair, -6, 6);
		P.eyes(0, -27.4, 2.2, 1.25, '#2a8a3a');
		P.thin([[-3.4, -28.6], [-1, -28.9]], '#1a1010', 0.45); P.thin([[3.4, -28.6], [1, -28.9]], '#1a1010', 0.45);
		P.ellipse(0, -23.8, 1.1, 0.5, '#b83a3a', { line: false });
	},
	// Apophis (EB boss): a huge golden cobra in great coils, rearing up under a wide hood striped like a pharaoh's headdress
	// in blue and gold, a cream ridged belly, the head facing right with glowing eyes and a gaping fanged mouth
	624(P) {
		P.shadow(19, 6);
		const gold = '#d9a03a', dark = '#a8701e', belly = '#f2deaa', blue = '#2f5aa8';
		P.ellipse(0, -3.6, 19, 5.4, dark);
		for (let x = -16; x <= 16; x += 3) P.thin([[x, -7.6], [x + 1.2, -1]], shade(dark, -0.3), 0.3);
		taper(P, [[14, -6], [22, -11], [20, -19], [15.5, -19]], 4.4, 0.5, gold);
		P.ellipse(-3, -8.5, 15.5, 5.6, gold);
		for (let x = -15; x <= 10; x += 3) P.thin([[x, -12.8], [x + 1.4, -4.4]], shade(gold, -0.3), 0.3);
		P.gloss(-10, -11.8, 3.4, 1, 0.4);
		P.ellipse(0, -13, 11, 4.4, gold);
		// the neck rising, belly plates
		taper(P, [[-1, -13], [-4, -22], [-1, -29]], 8, 6.4, gold);
		taper(P, [[0.6, -13.6], [-1.6, -22], [0.8, -28]], 4.2, 3.4, belly, { line: false });
		for (const y of [-15, -17.5, -20, -22.5, -25, -27.5]) P.thin([[-2.4 + (y + 22) * 0.1, y], [2 + (y + 22) * 0.1, y]], shade(belly, -0.35), 0.35);
		// the hood, striped blue and gold like a nemes headdress: nested bands shrinking towards the neck
		[[1, gold], [0.9, blue], [0.8, gold], [0.7, blue], [0.6, gold], [0.5, blue]].forEach(([k, c]) => {
			const T = (x, y) => [x * k, -26 + (y + 26) * k];
			P.shape((p) => { p.m(...T(-2, -22)); p.q(...T(-19, -25), ...T(-14, -38)); p.q(...T(-8, -48), ...T(0, -47)); p.q(...T(11, -46), ...T(12, -34)); p.q(...T(12, -24), ...T(3, -22)); }, c, -19 * k, 12 * k, { line: k === 1 });
		});
		P.shape((p) => { p.m(-3, -24); p.q(-6, -33, -2, -39); p.l(4, -39); p.q(6, -31, 3, -24); }, belly, -6, 6, { line: false });
		for (const y of [-26, -28.5, -31, -33.5, -36]) P.thin([[-3.4, y], [4, y]], shade(belly, -0.35), 0.35);
		P.gloss(-8, -42, 2.4, 1.1, 0.45);
		// head facing right, a gaping mouth with fangs, glowing eyes under a heavy brow
		P.ellipse(3.6, -40, 6.6, 5, gold);
		P.shape((p) => { p.m(5, -44); p.q(12, -45, 14.6, -41.4); p.q(14.4, -39.4, 12, -39); p.l(5, -38.6); }, gold, 5, 14.6);
		P.shape((p) => { p.m(5.4, -38.8); p.l(13, -39); p.q(13.6, -34, 9.4, -33.2); p.q(6, -33.8, 5.4, -38.8); }, '#a8202a', 5.4, 13.6);
		P.shape((p) => { p.m(4.4, -36); p.q(8, -33.4, 12.6, -34.4); p.q(12, -32, 8, -31.4); p.q(4.6, -32, 4.4, -36); }, gold, 4.4, 12.6);
		for (const [x, d] of [[11.6, 1], [8.4, 1]]) P.poly([[x - 0.5, -39], [x + 0.5, -39], [x + 0.1, -36.6 * d]], '#fff8e8', { line: false });
		for (const x of [10.4, 7.6]) P.poly([[x - 0.45, -34.2], [x + 0.45, -34.2], [x, -36]], '#fff8e8', { line: false });
		P.dot(14, -42.2, 0.45, '#3a1a08');
		P.glowEyes(6.4, -41.6, 1.9, 0.75, '#ffd23f');
		P.thin([[3.6, -43.6], [9.4, -43]], shade(gold, -0.55), 0.6);
		P.gloss(1.6, -43.4, 1.6, 0.8, 0.45);
	},
	// Set (EC boss): a violet god with the long curved snout and tall square-tipped ears of the Set animal, glowing eyes,
	// dark violet armour bound with pink-brown wraps, a gem on his belt, a tattered skirt, a curved sword swept low across
	// him and a twisted staff holding a swirling dark vortex, violet flames licking at his feet
	625(P) {
		P.shadow(15, 5);
		const violet = '#5e3e86', dark = '#3a2456', wrap = '#b8908a', skirt = '#7a3a6a', glowC = '#b060ff';
		for (const [x, y] of [[-8, -2], [7, -2.4], [-1, -1.6]]) { P.glow(x, y - 2, 4, glowC, 0.4); taper(P, [[x, y], [x + 1.4, y - 4], [x - 0.4, y - 7]], 1.6, 0.3, '#9a60e0'); }
		for (const [hx, kx, fx] of [[-3, -5.2, -5.4], [3, 5.2, 5.4]]) {
			taper(P, [[hx, -13], [kx, -7.5], [fx, -2.4]], 4, 3.2, hx < 0 ? shade(wrap, -0.12) : wrap);
			for (const t of [0.3, 0.6]) P.thin([[hx + (fx - hx) * t - 1.8, -13 + 10.6 * t + 0.4], [hx + (fx - hx) * t + 1.8, -13 + 10.6 * t - 0.4]], shade(wrap, -0.4), 0.35);
			P.ellipse(fx + 0.8, -1.4, 3, 1.4, dark);
		}
		P.shape((p) => { p.m(-6, -15.4); p.l(6, -15.4); p.l(8.4, -6.6); p.l(6.4, -8); p.l(4.4, -5); p.l(2, -7.4); p.l(0, -4.4); p.l(-2, -7.4); p.l(-4.4, -5); p.l(-6.4, -8); p.l(-8.4, -6.6); }, skirt, -8.4, 8.4);
		torso(P, -25, 6.4, -14.6, 5.4, violet);
		P.thin([[-5.6, -23.4], [5, -15.6]], wrap, 1); P.thin([[5.6, -23.4], [-5, -15.6]], wrap, 1);
		P.line([[-6, -15.4], [6, -15.4]], dark, 1.4);
		P.poly([[0, -17.4], [1.4, -15.4], [0, -13.4], [-1.4, -15.4]], '#c070ff');
		// the staff with the vortex, in the right hand
		P.line([[13.4, -1.4], [12.6, -12], [13.8, -22], [12.8, -33]], dark, 1.1);
		P.glow(13.6, -38, 7, glowC, 0.5);
		P.circle(13.6, -38, 4.2, '#2a1040');
		P.circle(13.6, -38, 2.8, '#c890ff', { line: false });
		P.circle(13.6, -38, 2, '#3a1860', { line: false });
		P.circle(14, -38.2, 1, '#100418', { line: false });
		P.thin([[11.2, -36.6], [12.6, -40.6], [15.6, -40.4]], '#f0d8ff', 0.35);
		taper(P, [[5.6, -23], [10, -20.6], [12, -21.6]], 3.4, 2.8, wrap);
		P.ellipse(6, -23, 3.4, 3, dark);
		P.circle(13.2, -21.6, 2, dark);
		// the sword arm, the blade swept low across the body
		P.ellipse(-6, -23, 3.4, 3, dark);
		taper(P, [[-6, -22.4], [-9.4, -18], [-8.6, -14]], 3.4, 2.8, shade(wrap, -0.06));
		ecCrescent(P, -7.4, -12.6, 2, -2.6, 12, -9, 1.6, '#d8d4e4');
		P.line([[-9.4, -14.6], [-7.4, -12.6]], '#2a1a2a', 1);
		P.circle(-8.6, -13.8, 2, dark);
		// the Set animal's head: dark lappets, tall square-tipped ears, a long curved snout, glowing eyes
		ecNemesBack(P, 1.4, -31, 7, dark, '#7a4a8a');
		for (const [x0, x1] of [[-2.2, 0.2], [2.6, 5]]) { P.poly([[x0, -35], [x0 - 0.4, -45.4], [x1 - 0.4, -45.4], [x1, -35]], violet); P.thin([[x0 + 0.4, -44.6], [x1 - 0.8, -44.6]], shade(violet, 0.3), 0.35); }
		P.circle(2, -31, 6, violet);
		P.shape((p) => { p.m(5, -33.4); p.q(11, -34.4, 13.6, -30); p.q(14.4, -27.4, 13, -26.6); p.q(12.4, -29.4, 6.4, -27.4); }, violet, 5, 14.4);
		P.gloss(0, -34.6, 1.6, 0.8, 0.4);
		for (const x of [0.6, 4.4]) { P.glow(x, -31.6, 2.2, glowC, 0.6); P.dot(x, -31.6, 0.85, '#f0d0ff'); }
	},
	// Nefersah: the mummified pharaoh-king: a skull with red eyes under the red-and-white double crown and a teal-striped
	// nemes, a bandaged body in a ragged teal cloak, a gold belt with a striped apron, a tall gold staff topped with a fan
	626(P) {
		P.shadow(13, 5);
		const wrap = '#a89c80', dk = '#7a6e58', teal = '#2a8a8a', gold = '#d9a83a', bone = '#d8ccb0', blue = '#2f5fb0';
		// the ragged cloak behind, hanging from the shoulders nearly to the ground
		P.shape((p) => { p.m(-6, -23); p.q(-12, -16, -13, -3); p.l(-10.5, -5); p.l(-9.5, -1.5); p.l(-7, -4.5); p.l(6.5, -4.5); p.l(9, -1.5); p.l(10, -5); p.l(13, -3); p.q(12, -16, 6, -23); }, teal, -13, 13);
		for (const x of [-9, 9]) P.thin([[x * 0.7, -21], [x, -5]], shade(teal, -0.35), 0.4);
		// the staff with its fan on top
		P.line([[11, -1], [12.4, -37]], gold, 1.1);
		P.shape((p) => { p.m(12.5, -37); p.l(9, -42); p.q(12.6, -45.4, 16.4, -42.4); }, gold, 9, 16.4);
		P.shape((p) => { p.m(12.5, -38); p.l(10.4, -41.6); p.q(12.6, -43.4, 15, -41.8); }, teal, 10.4, 15, { line: false });
		// bandaged legs, the body, the belt and apron
		for (const s of [-1, 1]) { P.line([[s * 3, -9], [s * 3.4, -2]], s < 0 ? shade(wrap, -0.1) : wrap, 3.2); P.thin([[s * 3.4 - 1.6, -6], [s * 3.4 + 1.6, -5.4]], dk, 0.35); P.ellipse(s * 3.8, -1.2, 2.4, 1.3, shade(wrap, -0.3)); }
		torso(P, -21, 5.6, -8, 6, wrap);
		for (const [y, t] of [[-18, 0.6], [-15.5, -0.5], [-10, 0.4]]) P.thin([[-5.6, y - t], [5.6, y + t]], dk, 0.4);
		P.line([[-5.6, -12.5], [5.6, -12.5]], gold, 1.3);
		P.poly([[-1.4, -12], [1.4, -12], [2, -4], [-2, -4]], teal);
		for (const y of [-9.6, -7.2, -5]) P.thin([[-1.6, y], [1.6, y]], gold, 0.45);
		// arms: the left hanging with claws, the right on the staff
		P.line([[-5.4, -19.5], [-8.4, -14], [-8.6, -10]], wrap, 2.4);
		P.circle(-8.6, -9.2, 1.6, bone);
		for (const k of [-1, 0, 1]) P.thin([[-8.6 + k * 0.8, -8.2], [-8.8 + k * 1.1, -6.2]], shade(bone, -0.45), 0.45);
		P.line([[5.4, -19.5], [9, -16], [11.4, -17]], wrap, 2.4);
		P.circle(11.8, -17, 1.6, bone);
		edUsekh(P, 0, -21.4, 6, [gold, teal, gold, blue]);
		// skull in a pale striped nemes, red eyes, the double crown
		edNemesBack(P, 0, -28, 6.4, '#d8c8a0', teal);
		skull(P, 0, -28, 5.8, bone, '#ff3a2a');
		P.shape((p) => { p.m(-6.4, -31); p.l(-6.6, -39); p.l(-4.6, -39); p.l(-4.4, -35.6); p.l(4.4, -35.6); p.l(5.4, -31); p.q(0, -32.6, -6.4, -31); }, '#c8302a', -6.6, 5.4);
		P.shape((p) => { p.m(-3.4, -35.4); p.q(-4, -40, -1.6, -42); p.q(-1.4, -45, 0.4, -45); p.q(2.2, -45, 2.2, -42); p.q(4.4, -40, 3.4, -35.4); }, '#efe9da', -4, 4.4);
		P.line([[-4.6, -38.6], [-3.4, -40.6], [-1.6, -40.2]], gold, 0.6);
		P.gloss(-1, -41, 0.7, 1.4, 0.5);
	},
	// Merytsah: a queen in a white pleated dress with a gold sash, a sheer white shawl, a gold vulture headdress over long
	// black hair, a red crown base with two short gold plumes, a green papyrus staff in her hand; looks left
	642(P) {
		P.shadow(11, 4.5);
		const skin = '#c88a5a', gold = '#d9a83a', white = '#f4f1ea', red = '#c8302a', green = '#2f7a4a', hair = '#1a1414';
		// the sheer shawl hanging behind the right arm
		P.shape((p) => { p.m(4, -21); p.q(10, -18, 11, -4); p.l(7, -5); p.q(7, -14, 4, -16); }, white, 4, 11, { alpha: 0.75 });
		// the papyrus staff
		P.line([[11, 1], [12.4, -33]], green, 0.9);
		P.shape((p) => { p.m(12.4, -33); p.l(9.4, -37); p.q(12.6, -39, 15.6, -37); }, green, 9.4, 15.6);
		// long hair behind
		P.shape((p) => { p.m(-6, -28); p.q(-7.6, -21, -6, -15.5); p.l(6, -15.5); p.q(7.6, -21, 6, -28); }, hair, -7.6, 7.6);
		// the white dress, red-and-green bands at the hem, a gold sash hanging at the side
		torso(P, -15, 4.4, -1, 6.6, white);
		for (const [y, c] of [[-4.2, red], [-2.8, green]]) P.thin([[-6.4, y], [6.4, y]], c, 0.5);
		for (const x of [-2, 2]) P.thin([[x, -13], [x * 1.4, -5]], shade(white, -0.15), 0.3);
		P.shape((p) => { p.m(-4.8, -14.4); p.l(4.8, -14.4); p.l(4.8, -12); p.l(-4.8, -12); }, gold, -4.8, 4.8);
		P.poly([[-4.6, -12.4], [-2.6, -12.4], [-2.8, -4], [-4.8, -4]], gold);
		P.thin([[-4.6, -6], [-2.8, -6]], red, 0.4);
		// a patterned red-and-gold bodice
		torso(P, -20, 4.4, -14.4, 4.2, red);
		for (const x of [-2.4, 0, 2.4]) P.dot(x, -17, 0.5, gold);
		// arms: the left hanging, the right on the staff; gold bands
		P.line([[-4.4, -19.4], [-6.4, -14.4], [-6.4, -10.4]], skin, 1.9);
		P.line([[-6.2, -15.4], [-6.4, -14.4]], gold, 2.1);
		P.circle(-6.4, -9.8, 1.3, skin);
		P.line([[4.4, -19.4], [8.4, -16.4], [11.2, -17]], skin, 1.9);
		P.line([[7.4, -17.2], [8.4, -16.6]], gold, 2.1);
		P.circle(11.6, -17, 1.4, skin);
		edUsekh(P, 0, -20.4, 4.8, [gold, '#2f5fb0', gold, red]);
		// head: a gold vulture cap, kohl-lined eyes looking left, red lips
		head(P, -25, 5.6, skin);
		P.shape((p) => { p.m(-6, -24); p.q(-6.6, -31.6, 0, -31.6); p.q(6.6, -31.6, 6, -24); p.q(5, -28.4, 0, -28.6); p.q(-5, -28.4, -6, -24); }, gold, -6.6, 6.6);
		P.shape((p) => { p.m(-1, -30); p.q(-4.6, -30.6, -5.4, -28); p.q(-3.6, -29, -1.4, -28.6); }, shade(gold, -0.15), -5.4, -1);
		P.eyes(-0.6, -25, 2.1, 1.15, '#1a1010', -1);
		for (const s of [-1, 1]) P.thin([[-0.6 + s * 2.1 - 1.4, -25.8], [-0.6 + s * 2.1 + 1.6, -26]], '#1a1010', 0.45);
		P.ellipse(-0.6, -21.6, 1, 0.45, '#a83030', { line: false });
		// the crown: a red base, two gold plumes, kept short so the unique monster's crown floats clear of them
		P.shape((p) => { p.m(-3.6, -31); p.l(3.6, -31); p.l(3.2, -34); p.l(-3.2, -34); }, red, -3.6, 3.6);
		for (const x of [-1.5, 1.5]) P.shape((p) => { p.m(x - 1.4, -34); p.l(x - 1.4, -38.6); p.q(x, -41, x + 1.4, -38.6); p.l(x + 1.4, -34); }, gold, x - 1.4, x + 1.4);
		P.thin([[-1.5, -35], [-1.5, -38.2]], shade(gold, -0.3), 0.3); P.thin([[1.5, -35], [1.5, -38.2]], shade(gold, -0.3), 0.3);
	},
	// ---- creatures that spawn during play: mimics and a summoned imp ----
	// Fire beetle (the vase mimic, outside the caves): a low green spiny bug facing right, dragging a great glowing
	// cluster of orange egg sacs behind it, a yellow eye, spiky legs
	214(P) {
		P.shadow(13, 4);
		const green = '#5a8a30', sac = '#f0a020';
		// legs: far ones darker, each bent up at the knee and down to a point
		for (const far of [true, false]) {
			for (const [x, d] of [[-2, -1], [3, 0.3], [7, 1]]) {
				const c = far ? shade(green, -0.22) : green, dx = far ? 2 : -0.6;
				taper(P, [[x + dx, -6], [x + dx + d * 4.4 + 1, -13.4], [x + dx + d * 7.6 + 1, -0.6]], 2.1, 0.4, c);
			}
		}
		// the egg sacs, glowing: one great round cluster of swollen lobes
		P.glow(-4.4, -13.4, 13, '#ffb030', 0.35);
		P.circle(-4.4, -14, 9.2, shade(sac, -0.12));
		for (const [x, y, r] of [[-8.4, -9.4, 3.8], [-3.2, -8, 3.8], [1, -10.8, 3.4], [-4.8, -13.6, 3.8], [-9.4, -15.4, 3.8], [0.4, -16.4, 3.6], [-6.4, -19.4, 3.8], [-2, -20.4, 3.4]]) {
			P.circle(x, y, r, sac);
			P.gloss(x - r * 0.35, y - r * 0.42, r * 0.32, r * 0.2, 0.55);
		}
		// the spiny green body and head at the front
		P.shape((p) => { p.m(-1.6, -15); p.q(6.4, -17.4, 11, -11); p.q(12.6, -5.4, 7, -4.2); p.q(1, -3.2, -1.4, -7.6); p.q(-2.6, -11, -1.6, -15); }, green, -2.6, 12.6);
		for (const [x, y, a] of [[1, -15.4, -1.9], [4, -15.6, -1.6], [7, -14.4, -1.2], [9.6, -12, -0.8]]) P.poly([[x - 0.9, y + 0.4], [x + Math.cos(a) * 3, y + Math.sin(a) * 3], [x + 0.9, y + 0.2]], shade(green, -0.15));
		for (const y of [-12, -9, -6.4]) P.thin([[0, y], [5, y + 0.6]], shade(green, -0.35), 0.4);
		P.circle(8.8, -9.4, 1.9, '#e8d060');
		P.dot(9.2, -9.4, 0.8, '#1a1a0a'); P.dot(8.5, -10, 0.3, '#ffffff');
		P.poly([[11.4, -7], [13.6, -6.4], [11.6, -5.4]], shade(green, -0.3));
	},
	// Kraken (the barrel mimic, outside the caves): an oak barrel with iron hoops, purple tentacles writhing up out of
	// its open top and more curling out underneath for legs
	275(P) {
		P.shadow(13, 4.5);
		const purple = '#9a5aa8', dark = '#6a3a7a', wood = '#8a5a34', hoop = '#5a5a64', sucker = '#e8c8e8';
		// tentacle legs under the barrel, far ones darker
		for (const [sd, far] of [[-1, true], [1, true], [-1, false], [1, false]]) {
			const c = far ? dark : purple;
			const pts = far ? [[sd * 2, -9], [sd * 7, -7], [sd * 8, -1], [sd * 10.4, -1.6]] : [[sd * 4, -9], [sd * 10, -8], [sd * 13, -2], [sd * 15.4, -2.6]];
			taper(P, pts, 3, 0.6, c);
		}
		// the barrel: bulging staves, two iron hoops, a dark open top
		P.shape((p) => { p.m(-6.4, -24); p.q(-9.4, -16, -6.4, -7.4); p.l(6.4, -7.4); p.q(9.4, -16, 6.4, -24); }, wood, -9.4, 9.4);
		for (const x of [-4, -1.4, 1.4, 4]) P.thin([[x * 1.05, -23.4], [x * 1.25, -15.6], [x * 1.05, -8]], shade(wood, -0.35), 0.4);
		for (const y of [-20.6, -10.6]) P.thin([[-7.8, y], [0, y + 1], [7.8, y]], hoop, 1.2);
		P.ellipse(0, -24, 6.4, 1.8, shade(wood, -0.2));
		P.ellipse(0, -24, 5, 1.2, '#2a1424', { line: false });
		P.gloss(-5, -18, 1, 2.6, 0.3);
		// tentacles rising out of the barrel, the back ones darker, suckers on the near ones
		const up = [
			[dark, [[-3, -24], [-7, -31], [-11, -36], [-9, -40]]],
			[dark, [[3.4, -24], [8, -31], [12.4, -35], [11, -39]]],
			[purple, [[-4.4, -24], [-5, -33], [-2.6, -41], [0.6, -41]]],
			[purple, [[0.6, -24], [2, -33], [5.4, -39], [8, -37.6]]],
			[purple, [[4.6, -24], [10, -27], [14, -25], [14.6, -21.4]]],
			[purple, [[-5.4, -24], [-11, -26.6], [-14.4, -24], [-14, -20.6]]],
		];
		for (const [c, pts] of up) taper(P, pts, 3, 0.6, c);
		for (const [x, y] of [[-4.8, -30], [-3.8, -35], [2.2, -30.6], [3.6, -35.4], [9.4, -26.6], [12.4, -26.2], [-10.4, -26], [-13, -25]]) P.dot(x, y, 0.55, sucker);
	},
	// Mimikchest (the chest mimic in the forest and caves): a wooden treasure chest gaping open into a toothy maw, a
	// long pink tongue lolling out, a gold eye on the lid, curved horns, and green clawed arms planted on the ground
	286(P) {
		P.shadow(15, 5);
		const wood = '#a0582a', gold = '#d8a840', arm = '#5a6a3a', bone = '#efe2bc', tongue = '#e07888';
		// clawed arms reaching down and out to the ground on either side
		for (const sd of [-1, 1]) {
			taper(P, [[sd * 9, -10], [sd * 15.6, -9], [sd * 15.6, -2]], 3.8, 2.8, sd < 0 ? shade(arm, -0.15) : arm);
			for (const k of [-1, 0, 1]) taper(P, [[sd * 15.6, -2], [sd * 17.4 + k * 1.5, -0.4]], 1.2, 0.3, '#2a2a1a');
		}
		// the chest's base, planks and gold corner bands
		P.shape((p) => { p.m(-11.4, -13); p.l(11.4, -13); p.l(10.8, -2.4); p.l(-10.8, -2.4); }, wood, -11.4, 11.4);
		for (const y of [-9.4, -5.8]) P.thin([[-11, y], [11, y]], shade(wood, -0.35), 0.4);
		for (const sd of [-1, 1]) P.line([[sd * 10.4, -12.6], [sd * 9.9, -2.8]], gold, 1.5);
		// the gaping maw between base and lid
		P.shape((p) => { p.m(-11, -13); p.q(0, -15, 11, -13); p.l(10.4, -23.4); p.q(0, -27, -10.4, -23.4); }, '#4a0e10', -11, 11);
		P.ellipse(0, -16.4, 6.4, 2.6, '#7a1a20', { line: false });
		for (let x = -9; x <= 9.1; x += 3) P.poly([[x - 1.2, -13.2], [x + 1.2, -13.2], [x, -17.6 + Math.abs(x) * 0.12]], bone);
		// the lid, thrown back, with its gold eye
		P.shape((p) => { p.m(-11, -23); p.q(0, -27.4, 11, -23); p.l(10, -30); p.q(0, -34.6, -10, -30); }, wood, -11, 11);
		P.thin([[-10.4, -26.6], [0, -30.4], [10.4, -26.6]], shade(wood, -0.35), 0.4);
		for (const sd of [-1, 1]) P.line([[sd * 10.6, -23.4], [sd * 9.8, -29.6]], gold, 1.5);
		for (let x = -8.4; x <= 8.5; x += 2.8) P.poly([[x - 1.2, -24.4 - (8.4 - Math.abs(x)) * 0.13], [x + 1.2, -24.4 - (8.4 - Math.abs(x)) * 0.13], [x, -19.4]], bone);
		P.circle(0, -29.4, 2.4, gold);
		P.ellipse(0, -29.4, 0.55, 1.7, '#2a1408', { line: false });
		// horns curving up from the lid's corners
		for (const sd of [-1, 1]) taper(P, [[sd * 9.4, -29], [sd * 14.4, -31], [sd * 13.4, -37.6]], 3.2, 0.5, '#e8d8a8');
		// the long tongue lolling out over the front and down the side
		P.shape((p) => { p.m(-4, -15.4); p.q(-5.4, -10, -2.6, -7); p.q(1, -4, 2.6, -1.6); p.q(4.4, 0, 5.6, -2.4); p.q(3.6, -3.4, 3.4, -6.4); p.q(3, -11.6, 3.4, -15.4); }, tongue, -5.4, 5.6);
		P.thin([[-0.4, -14.6], [-0.6, -9], [2.4, -4.4]], shade(tongue, -0.3), 0.4);

	},
	// Minidimmon: a crouching tan imp facing right, horned, yellow-eyed, an orange bat wing spread behind it, a red
	// loincloth, long arms hanging to its knees and a long thin tail
	341(P) {
		P.shadow(12, 4.5);
		const skin = '#d8b07a', wing = '#d9852a', horn = '#6a4a30';
		// the bat wing behind
		P.shape((p) => { p.m(-2, -24); p.q(-9, -38, -19, -36); p.q(-17, -32, -18.6, -28); p.q(-15, -28, -14, -25); p.q(-10, -26, -9, -22); p.q(-6, -24, -2.6, -20); }, wing, -19, -2);
		for (const [x, y] of [[-19, -36], [-18.6, -28], [-14, -25]]) P.thin([[-3, -22.6], [x, y]], shade(wing, -0.45), 0.4);
		// the tail
		taper(P, [[-4, -9], [-10, -6], [-13, -1.6], [-16.4, -3]], 1.4, 0.4, shade(skin, -0.1));
		// legs folded in a crouch, the far one darker
		for (const [hx, kx, fx, c] of [[1.4, 7, 5, shade(skin, -0.15)], [-3, 2.6, -0.6, skin]]) {
			taper(P, [[hx, -9], [kx, -9.4], [fx, -2]], 4.6, 3, c);
			P.ellipse(fx + 1, -1.3, 2.8, 1.2, shade(c, -0.15));
		}
		// far arm hanging to the ground
		taper(P, [[5, -20], [9.6, -13], [9, -5]], 3.2, 2.4, shade(skin, -0.15));
		P.circle(9.2, -4.6, 1.8, shade(skin, -0.15));
		// the hunched body, a red loincloth
		P.shape((p) => { p.m(-6, -10); p.q(-9.4, -20, -3, -25); p.q(5, -27.6, 8, -20); p.q(8.4, -12, 3.4, -9); p.q(-2, -7.6, -6, -10); }, shade(skin, -0.08), -9.4, 8.4);
		P.thin([[0.6, -21.6], [3.4, -19.4], [6.6, -20.6]], shade(skin, -0.3), 0.45);
		P.gloss(-3.6, -20, 1.6, 1, 0.3);
		P.shape((p) => { p.m(-5, -11); p.l(3.6, -10); p.l(3, -6.4); p.l(1.6, -2.6); p.l(0.2, -4.4); p.l(-1.4, -2.2); p.l(-2.6, -5); p.l(-4.4, -6); }, '#a02a20', -5, 3.6);
		P.line([[-5.4, -10.8], [3.8, -9.8]], '#6a1a14', 1);
		P.thin([[-1, -9.4], [-0.4, -4]], shade('#a02a20', -0.3), 0.4);
		for (const y of [-18, -15.6]) P.thin([[0, y], [4, y + 0.4]], shade(skin, -0.3), 0.4);
		// the head thrust forward: horns, pointed ear, yellow eyes, a toothy grin
		for (const [x, tx] of [[2.6, 0.6], [7.4, 9.4]]) taper(P, [[x, -31], [tx - 1, -35.4], [tx + 1.4, -39]], 2.4, 0.4, horn);
		P.poly([[1, -28], [-4.4, -31], [0.6, -25]], shade(skin, -0.05));
		head(P, -27, 6, skin, 5.6);
		P.shape((p) => { p.m(6, -25.4); p.q(11.6, -26.4, 12.4, -23.4); p.q(11.4, -20.6, 7, -21); p.q(5, -22, 6, -25.4); }, skin, 5, 12.4);
		P.thin([[3.6, -29.4], [7, -28.4], [10.6, -29.2]], shade(skin, -0.5), 0.7);
		P.dot(11.6, -25.4, 0.4, '#4a3020');
		for (const x of [5.4, 8.6]) { P.dot(x, -26.8, 1.3, '#ffd23f'); P.dot(x + 0.3, -26.8, 0.5, '#2a1a0a'); }
		P.thin([[4.4, -28.6], [9.6, -28.2]], shade(skin, -0.45), 0.5);
		P.shape((p) => { p.m(6.6, -23.2); p.q(9.4, -21.6, 11.8, -23.4); p.q(9.4, -22.6, 6.6, -23.2); }, '#5a1a10', 6.6, 11.8, { line: false });
		for (const x of [7.8, 10.4]) P.poly([[x - 0.45, -23], [x + 0.45, -23], [x, -24.4]], '#ffffff', { line: false });
		// near arm, long, a clawed hand on the ground
		taper(P, [[-1.4, -20], [3, -12], [2.4, -4.6]], 3.4, 2.6, skin);
		for (const k of [-1, 0, 1]) P.thin([[2, -4], [2.6 + k * 1, -2.6]], '#4a3020', 0.4);
		// a strap across the chest and a red diamond pendant set in gold
		P.thin([[-5, -22.6], [1.4, -19.6], [6.6, -21.6]], '#5a3a20', 0.6);
		P.poly([[4, -21.4], [5.6, -19.2], [4, -16.8], [2.4, -19.2]], '#d8a840');
		P.poly([[4, -20.6], [5, -19.2], [4, -17.6], [3, -19.2]], '#c8202a', { line: false });
		P.dot(3.7, -19.8, 0.3, '#ffd0d0');
	},
	// ---- NPCs ----
	// the people met in the dungeons: wandering merchants (the lost adventurers), quest characters and the tombs'
	// townsfolk. Shapeshifters share these drawings (sprites.js adds their tell).

	// Lost adventurer: a young man in a studded brown leather jerkin with an orange hood down round his neck, dark
	// trousers, tall turned-down boots, short dark hair
	400(P) {
		P.shadow(10, 4.5);
		const leather = '#8a5a34', skin = '#e8b88a', hair = '#3a2a20', boot = '#7a5030';
		npcLegs(P, -9, '#4a3a34', boot, 4.4);
		for (const s of [-1, 1]) P.ellipse(s * 3.1, -6.6, 2.5, 1.1, shade(boot, 0.1));
		torso(P, -21, 5.4, -8, 6.6, leather);
		P.thin([[0, -20], [0, -8.6]], shade(leather, -0.4), 0.4);
		for (const y of [-17.4, -14.6]) P.thin([[-5.4, y], [5.4, y]], shade(leather, -0.35), 0.35);
		for (const [x, y] of [[-3, -16], [3, -16], [-3, -10.6], [3, -10.6]]) P.dot(x, y, 0.45, '#d9b24a');
		P.line([[-6.2, -12.6], [6.2, -12.6]], '#4a2e1a', 1.1);
		P.poly([[0, -14.2], [1.1, -12.6], [0, -11], [-1.1, -12.6]], '#d9b24a');
		for (const s of [-1, 1]) {
			npcArm(P, [[s * 5.4, -20], [s * 8.2, -15], [s * 7.8, -10.4]], leather, skin);
			P.line([[s * 7.6, -13], [s * 7.9, -11]], shade(leather, -0.25), 2.6);
		}
		P.shape((p) => { p.m(-6.2, -21.4); p.q(0, -25.4, 6.2, -21.4); p.q(4.4, -17.6, 0, -17.4); p.q(-4.4, -17.6, -6.2, -21.4); }, '#e8962a', -6.2, 6.2);
		npcFace(P, 0, -28, 6.4, skin);
		P.shape((p) => { p.m(-6.6, -28.4); p.q(-7, -35.8, 0, -35.6); p.q(7, -35.8, 6.6, -28.4); p.q(5.6, -31.4, 2, -32); p.q(-2, -32.6, -4.6, -30.4); p.l(-5.6, -27); }, hair, -7, 7);
	},
	// a pedlar with a huge bedroll pack: a red waistcoat over a cream shirt, brown trousers and boots, a satchel at the
	// hip, a dark moustache, one hand held out
	401(P) {
		P.shadow(11, 4.5);
		const skin = '#e8b88a', vest = '#a8382a', shirt = '#efe2c8', pack = '#8a6a44', hair = '#3a2618';
		// the pack behind: a frame bag with a rolled blanket on top and a scroll tube at the side
		P.shape((p) => { p.m(-10.4, -24); p.q(-11.6, -14, -9.6, -7); p.l(-2, -8); p.l(-2, -24); }, pack, -11.6, -2);
		P.ellipse(-6.2, -26.2, 6, 2.8, '#6a7a5a', { rot: 0.15 });
		P.thin([[-9, -27.6], [-9, -24.8]], '#3a2a1a', 0.5); P.thin([[-3.6, -27.4], [-3.6, -24.6]], '#3a2a1a', 0.5);
		P.line([[-11.6, -20], [-10.4, -9]], '#c9a26a', 1.6);
		npcLegs(P, -9, '#7a4a2e', '#4a3020', 3.4);
		torso(P, -21, 5.4, -8.4, 6.4, shirt);
		P.shape((p) => { p.m(-5.4, -21); p.l(-1.4, -21); p.l(-0.6, -9); p.q(-4, -8.6, -6.4, -9); p.q(-6.6, -16, -5.4, -21); }, vest, -6.6, -0.6);
		P.shape((p) => { p.m(5.4, -21); p.l(1.4, -21); p.l(0.6, -9); p.q(4, -8.6, 6.4, -9); p.q(6.6, -16, 5.4, -21); }, vest, 0.6, 6.6);
		for (const y of [-17, -14, -11]) P.thin([[-1.6, y], [1.6, y]], '#5a3a20', 0.35);
		P.thin([[-5, -20.6], [6, -11]], '#5a3a20', 0.6);
		P.ellipse(6.4, -9.4, 2.8, 2.2, '#9a6a3a');
		P.line([[-6.4, -9.4], [6.4, -9.4]], '#4a2e1a', 0.9);
		npcArm(P, [[-5.4, -20], [-7.6, -15], [-7, -10.6]], shirt, skin);
		npcArm(P, [[5.4, -20], [9.4, -17.6], [13, -17.4]], shirt, skin);
		P.line([[-5.6, -21], [-6.6, -12]], '#5a3a20', 0.8);
		npcFace(P, 0, -28, 6.4, skin);
		P.shape((p) => { p.m(-3, -24.8); p.q(0, -26.4, 3, -24.8); p.q(1.6, -24, 0, -24.8); p.q(-1.6, -24, -3, -24.8); }, hair, -3, 3);
		P.shape((p) => { p.m(-6.6, -27.6); p.q(-7.4, -35.8, 0, -35.6); p.q(7, -35.8, 6.6, -28.4); p.q(4.6, -32.4, 1.2, -31.6); p.q(-1.6, -32.4, -4.6, -30); p.l(-5.6, -26.6); }, hair, -7.4, 7);
	},
	// Methusalem: an old hermit, hunched, a long grey beard to his belt, a ragged brown tunic, bound legs, bare feet,
	// leaning on a tall gnarled staff
	402(P) {
		P.shadow(11, 4.5);
		const skin = '#d8a880', rag = '#7a5a3e', beard = '#c8c2b8';
		P.line([[10.6, -1], [10, -15], [11, -31]], '#6a4a2e', 1.4);
		npcLegs(P, -9, '#6a5040', skin, 0);
		for (const s of [-1, 1]) for (const y of [-7.6, -5.6]) P.thin([[s * 3.1 - 1.6, y], [s * 3.1 + 1.6, y + 0.4]], '#c8b090', 0.5);
		P.shape((p) => { p.m(-5.2, -21); p.q(0, -22.4, 5.6, -20.6); p.q(7, -14, 7, -7); p.l(5.4, -8.6); p.l(4, -5.4); p.l(2.4, -8); p.l(0, -5.6); p.l(-2, -8.2); p.l(-3.8, -5.6); p.l(-5.2, -8.4); p.l(-6.8, -6.6); p.q(-7, -14, -5.2, -21); }, rag, -7, 7);
		P.thin([[-4.4, -18], [-1.4, -10]], shade(rag, -0.3), 0.4); P.thin([[4.4, -17], [2.6, -10]], shade(rag, -0.3), 0.4);
		P.line([[-6.4, -12.6], [6.4, -12.6]], '#4a3420', 0.9);
		npcArm(P, [[-5, -19.6], [-8, -15.4], [-5.4, -12.6]], rag, skin);
		npcArm(P, [[5.2, -19.6], [9.4, -20.4], [10.6, -23]], rag, skin);
		// the bald head tilted forward, wispy grey hair at the sides, bushy brows, the long beard
		for (const s of [-1, 1]) P.ellipse(0.6 + s * 5.8, -27, 2.2, 3, beard);
		head(P, -27.4, 6.2, skin, 0.6);
		P.shape((p) => { p.m(-4.6, -27); p.q(-5.4, -18, -1.6, -11); p.l(0.6, -13.4); p.l(2.4, -11); p.q(6, -18, 5.8, -27); p.q(0.6, -22.6, -4.6, -27); }, beard, -5.4, 6);
		for (const x of [-1.6, 0.6, 2.8]) P.thin([[x, -22.6], [x * 0.7, -14.4]], shade(beard, -0.25), 0.35);
		P.eyes(0.8, -27.6, 2.2, 1.1);
		for (const s of [-1, 1]) P.thin([[0.8 + s * 1.2, -29.4], [0.8 + s * 3.2, -29.8]], '#8a8278', 0.7);
		P.ellipse(0.8, -25.4, 1, 0.8, shade(skin, -0.1));
	},
	// a lady in a long orange and gold gown with wide hanging sleeves, a pale sash, golden hair down to her knees
	403(P) {
		P.shadow(11, 4.5);
		const skin = '#f0c8a0', gown = '#d8702a', gold = '#e8b048', hair = '#f0d080';
		P.shape((p) => { p.m(-6.6, -30); p.q(-9.4, -20, -8, -8); p.l(8, -8); p.q(9.4, -20, 6.6, -30); }, shade(hair, -0.05), -9.4, 9.4);
		npcGown(P, -13, 5, 9.6, gown);
		P.poly([[-2.4, -12.6], [2.4, -12.6], [3.6, -1], [-3.6, -1]], gold, { line: true });
		torso(P, -21, 4.6, -12, 4.8, gown);
		P.line([[-5, -13.4], [5, -13.4]], '#d8d0c0', 1.6);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 4.2, -20.6); p.q(s * 9.4, -18, s * 10.4, -8); p.l(s * 6.2, -9.4); p.q(s * 5.8, -15, s * 4.2, -17); }, gold, Math.min(s * 4.2, s * 10.4), Math.max(s * 4.2, s * 10.4));
		for (const s of [-1, 1]) P.circle(s * 6, -11.4, 1.4, skin);
		npcFace(P, 0, -28, 6.2, skin, '#4a6a3a');
		P.shape((p) => { p.m(-6.6, -26); p.q(-7.6, -35.4, 0, -35.4); p.q(7.6, -35.4, 6.6, -26); p.q(5.4, -31.4, 0.8, -32.2); p.q(-4.4, -31.6, -6.6, -26); }, hair, -7.6, 7.6);
		P.thin([[-4, -33.2], [0, -34.2], [4, -33.2]], '#c88a2a', 0.5);
	},
	// Pilot: a woman in a brown leather flight jacket over a green top, tan jodhpurs, tall dark boots, a leather flying
	// cap with goggles pushed up
	404(P) {
		P.shadow(10, 4.5);
		const skin = '#eec29b', jacket = '#8a5a30', breeches = '#c8a068', cap = '#7a4a28';
		for (const s of [-1, 1]) P.ellipse(s * 3.8, -11, 3, 3.4, s < 0 ? shade(breeches, -0.1) : breeches);
		npcLegs(P, -10, breeches, '#4a3a30', 6);
		torso(P, -21, 4.6, -12, 5.2, '#6a8a4a');
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 2, -21); p.l(s * 5, -21); p.q(s * 7.6, -15, s * 6.6, -10.6); p.l(s * 2.6, -11); p.q(s * 3.6, -15, s * 2, -21); }, jacket, Math.min(s * 2, s * 7.6), Math.max(s * 2, s * 7.6));
		P.line([[-3, -12.4], [3, -12.4]], '#4a3020', 0.9);
		for (const s of [-1, 1]) npcArm(P, [[s * 5, -20], [s * 8.4, -15.4], [s * 7.6, -11]], jacket, skin, 3.4, 2.6);
		P.shape((p) => { p.m(-5.6, -22); p.q(0, -19.4, 5.6, -22); p.l(3, -18.4); p.l(0, -20.4); p.l(-3, -18.4); }, shade(jacket, 0.15), -5.6, 5.6);
		npcFace(P, 0, -28, 6.2, skin);
		P.shape((p) => { p.m(-6.8, -26); p.q(-7.6, -36, 0, -36); p.q(7.6, -36, 6.8, -26); p.l(5, -25); p.q(5.4, -31.6, 0, -31.6); p.q(-5.4, -31.6, -5, -25); }, cap, -7.6, 7.6);
		for (const s of [-1, 1]) P.ellipse(s * 2.8, -33, 2.2, 1.8, '#8a8a8a');
		for (const s of [-1, 1]) P.ellipse(s * 2.8, -33, 1.4, 1.1, '#9ad0e8', { line: false });
		P.thin([[-0.6, -33], [0.6, -33]], '#5a5a5a', 0.6);
	},
	// a young woman with a satchel: a flat cap, a cream shirt with rolled sleeves, grey trousers rolled at the boots, a
	// leather satchel on a strap, a spanner in one hand, a long braid
	405(P) {
		P.shadow(10, 4.5);
		const skin = '#eec29b', shirt = '#ece0c8', trousers = '#7a7a72', hair = '#a8743a';
		npcLegs(P, -9, trousers, '#6a4428', 3.4);
		for (const s of [-1, 1]) P.ellipse(s * 3.1, -5.2, 2.2, 1, shade(trousers, 0.1));
		torso(P, -21, 4.8, -8.6, 5.6, shirt);
		P.line([[-5.6, -10.4], [5.6, -10.4]], '#5a3a20', 1);
		P.thin([[4.6, -20.6], [-5, -12]], '#6a4428', 0.7);
		P.shape((p) => { p.m(-9.6, -13.6); p.l(-3.6, -13.6); p.l(-3.8, -7.4); p.q(-6.6, -6.6, -9.4, -7.4); }, '#8a5a30', -9.6, -3.6);
		P.line([[-9.6, -12.6], [-3.6, -12.6]], '#6a4428', 0.8);
		npcArm(P, [[-4.8, -20], [-7.4, -16], [-6.6, -12.4]], shirt, skin);
		npcArm(P, [[4.8, -20], [7.8, -15], [7.4, -10.6]], shirt, skin);
		P.line([[7.6, -10], [9, -5.6]], '#9aa0aa', 0.8);
		P.thin([[8.4, -5.4], [9, -4.6], [9.8, -5.6]], '#9aa0aa', 0.6);
		taper(P, [[-5.2, -27], [-7, -20], [-6, -15]], 2.4, 1, hair);
		npcFace(P, 0, -28, 6.2, skin);
		P.shape((p) => { p.m(-6.4, -26.4); p.q(-7, -33.2, 0, -33.4); p.q(7, -33.2, 6.4, -26.4); p.q(4, -30.6, 0, -30.6); p.q(-4, -30.6, -6.4, -26.4); }, hair, -7, 7);
		P.shape((p) => { p.m(-7.2, -31.2); p.q(-6.4, -37, 0.6, -36.8); p.q(7, -36.4, 7.4, -32); p.l(9.4, -31); p.l(-7.2, -31.2); }, '#6a6258', -7.2, 9.4);
		P.line([[-6.6, -31.4], [8.8, -31]], shade('#6a6258', -0.25), 0.8);
	},
	// Dark Lady: a horned sorceress, pale, long black hair, a dark teal-blue gown spreading in ragged trails, holding a
	// skull up in one hand
	414(P) {
		P.shadow(12, 4.5);
		const skin = '#e0dae4', gown = '#2a4a6a', dark = '#1e2a3e', hair = '#1a1a26', horn = '#c8c2b8';
		P.shape((p) => { p.m(-6.6, -30); p.q(-10, -20, -9.4, -11); p.l(9.4, -11); p.q(10, -20, 6.6, -30); }, hair, -10, 10);
		P.shape((p) => { p.m(-5, -14); p.l(5, -14); p.q(9, -8, 12.6, -1); p.l(8, -2); p.l(5, 0); p.l(1, -1.6); p.l(-3, 0); p.l(-7, -1.6); p.l(-12, -0.6); p.q(-8.6, -8, -5, -14); }, gown, -12.6, 12.6);
		for (const x of [-2, 2]) P.thin([[x, -13], [x * 1.6, -1.4]], '#4a7a9a', 0.4);
		torso(P, -21, 4.4, -12.6, 4.6, dark);
		for (const y of [-18, -16, -14]) P.thin([[-1.6, y], [1.6, y]], '#c8c8d0', 0.4);
		P.shape((p) => { p.m(-4.6, -21); p.q(-10, -18, -11, -9); p.l(-7, -10); p.q(-6.4, -16, -4.4, -17.4); }, gown, -11, -4.4);
		P.circle(-7.6, -10, 1.4, skin);
		npcArm(P, [[4.6, -20.4], [9, -18], [10.4, -21.4]], gown, skin);
		skull(P, 12, -24, 3.4, '#e8e2d2');
		npcFace(P, 0, -28, 6, skin, '#7a2a3a');
		P.ellipse(0, -24.6, 0.9, 0.4, '#5a1a2a', { line: false });
		for (const s of [-1, 1]) taper(P, [[s * 3.4, -33], [s * 6.4, -37.6], [s * 4.8, -41]], 2.2, 0.4, horn);
		P.shape((p) => { p.m(-6.4, -26); p.q(-7.4, -35.4, 0, -35); p.q(7.4, -35.4, 6.4, -26); p.q(5, -31.6, 0, -32); p.q(-5, -31.6, -6.4, -26); }, hair, -7.4, 7.4);
	},
	// Mechanical adventurer: a pale-green robot on thin jointed legs, a wide brown hat, round goggle eyes, an orange lens
	// glowing in its chest, a pack with a brass horn on its back, a rolled map under one arm
	419(P) {
		P.shadow(12, 4.5);
		const metal = '#a8bc94', dark = shade('#a8bc94', -0.25), hat = '#8a6a44';
		P.shape((p) => { p.m(-9.6, -24); p.l(-3, -24); p.l(-3, -12); p.l(-9.6, -13); }, '#7a5a3a', -9.6, -3);
		P.shape((p) => { p.m(-8, -24); p.q(-11, -30, -7.4, -32); p.l(-4.4, -31); p.q(-6.6, -28, -5, -24); }, '#d8a840', -11, -4.4);
		for (const [s, c] of [[-1, dark], [1, metal]]) {
			P.line([[s * 2.6, -11], [s * 4.6, -6.6], [s * 3.6, -2.4]], c, 1.5);
			P.circle(s * 4.6, -6.6, 1.2, c);
			P.ellipse(s * 4.2, -1.4, 2.8, 1.4, c);
		}
		P.shape((p) => { p.m(-5, -22); p.q(0, -23, 5, -22); p.q(6, -16, 4, -11); p.q(0, -10, -4, -11); p.q(-6, -16, -5, -22); }, metal, -6, 6);
		for (const y of [-18.6, -14.6]) P.thin([[-4.6, y], [4.6, y]], shade(metal, -0.4), 0.4);
		P.circle(0, -16.6, 2, '#5a5a4a');
		P.circle(0, -16.6, 1.4, '#ff8a20', { line: false });
		P.glow(0, -16.6, 4, '#ff9a30', 0.5);
		P.dot(-0.4, -17, 0.4, '#fff0c0');
		P.line([[-4.4, -20], [-8.6, -15], [-6.6, -12]], dark, 1.4);
		P.ellipse(-4, -12.6, 5.6, 2, '#e8e0c4', { rot: 0.1 });
		P.ellipse(-9.4, -13, 1, 2, '#d8d0b4');
		P.line([[4.4, -20], [8.6, -15.6], [10, -11]], metal, 1.4);
		for (const k of [-1, 0, 1]) P.thin([[10, -11], [10.8 + k, -9]], shade(metal, -0.4), 0.5);
		P.line([[0, -22], [0, -24.4]], dark, 1.6);
		P.shape((p) => { p.m(-5, -24.4); p.l(5, -24.4); p.q(5.6, -29, 4, -31); p.l(-4, -31); p.q(-5.6, -29, -5, -24.4); }, metal, -5.6, 5.6);
		for (const s of [-1, 1]) { P.circle(s * 2.4, -27.6, 2.2, '#6a6a5a'); P.circle(s * 2.4, -27.6, 1.4, '#2a2a22', { line: false }); P.dot(s * 2.4 - 0.5, -28.1, 0.45, '#ffffff'); }
		P.ellipse(0, -31.4, 11, 2.6, hat);
		P.shape((p) => { p.m(-5.4, -31.6); p.q(-5.6, -37.6, 0, -37.8); p.q(5.6, -37.6, 5.4, -31.6); }, hat, -5.6, 5.6);
		P.line([[-5.2, -32.4], [5.2, -32.4]], shade(hat, -0.35), 0.7);
	},
	// Big wise raven: a raven-headed sage with a heavy grey beak, a purple robe and cape, a yellow tabard, a red gem
	// pendant, bird feet, a twisted red staff in one wing-hand and a book under the other
	420(P) {
		P.shadow(12, 4.5);
		const robe = '#5a3a6a', feather = '#3a3044', beak = '#a8a8b0', tabard = '#e8c050';
		P.line([[11, -1], [11.4, -32]], '#8a3a2a', 1.4);
		P.shape((p) => { p.m(11.4, -32); p.q(8, -36, 10, -38.4); p.q(14, -40, 15, -35); p.q(13, -37, 12.4, -34); }, '#8a3a2a', 8, 15);
		P.shape((p) => { p.m(-5.6, -22); p.q(-12, -12, -13, -2); p.l(-9, -3.6); p.l(-6, -1.4); p.l(6, -1.4); p.l(9, -3.6); p.l(12, -2); p.q(11, -12, 5.6, -22); }, robe, -13, 12);
		for (const s of [-1, 1]) { P.line([[s * 2.6, -4], [s * 3, -1.6]], '#2a2a2a', 1.2); for (const k of [-1, 0, 1]) P.line([[s * 3, -1.4], [s * 3 + k * 1.4 + 0.6, -0.4]], '#2a2a2a', 0.6); }
		P.shape((p) => { p.m(-3.6, -19); p.l(3.6, -19); p.l(4.6, -4.6); p.l(-4.6, -4.6); }, tabard, -4.6, 4.6);
		P.line([[-5, -13.4], [5, -13.4]], '#6a4a2a', 1);
		P.shape((p) => { p.m(-11, -15.6); p.l(-5, -15.6); p.l(-5, -10); p.l(-11, -10); }, '#7a4a2a', -11, -5);
		P.thin([[-10.4, -15], [-10.4, -10.6]], '#e8dcc0', 0.6);
		npcArm(P, [[-5, -20.6], [-8.6, -16], [-7, -12.6]], robe, '#4a4050');
		npcArm(P, [[5, -20.6], [9.4, -18.6], [11, -21]], robe, '#4a4050');
		P.shape((p) => { p.m(-6.4, -22.4); p.q(0, -26, 6.4, -22.4); p.q(4, -18.4, 0, -18); p.q(-4, -18.4, -6.4, -22.4); }, '#7a5a8a', -6.4, 6.4);
		P.circle(0, -18.6, 1.4, '#d8a840'); P.circle(0, -18.6, 0.9, '#c8202a', { line: false });
		P.circle(0, -28.4, 6.4, feather);
		P.gloss(-2.6, -31.6, 1.6, 0.9, 0.35);
		for (const [x, y] of [[-5, -33.6], [-2.4, -35.4], [1, -35.6]]) P.poly([[x - 1.2, y + 1.6], [x, y - 1.6], [x + 1.4, y + 1.6]], feather);
		P.shape((p) => { p.m(1.6, -30.4); p.q(10, -31, 14, -26.6); p.q(10, -26, 7, -26.4); p.l(1.6, -25.6); }, beak, 1.6, 14);
		P.thin([[2, -27.6], [11, -27.4]], shade(beak, -0.45), 0.4);
		P.eyes(-0.6, -29.6, 2.3, 1.2, '#1a1206');
	},
	// Mr. Diligence: a gentleman in a tall blue top hat and a long blue frock coat over a purple waistcoat, dark
	// trousers, a black beard, a cane
	422(P) {
		P.shadow(10, 4.5);
		const skin = '#eec29b', coat = '#3a4a9a', vest = '#7a4a8a', hair = '#2a2020';
		P.line([[10, -1], [8.6, -12]], '#2a1a14', 0.9);
		npcLegs(P, -10, '#2a2a3a', '#1a1a22', 0);
		P.shape((p) => { p.m(-5, -21); p.l(5, -21); p.q(7.4, -12, 7, -4.6); p.l(2, -6.6); p.l(0, -10); p.l(-2, -6.6); p.l(-7, -4.6); p.q(-7.4, -12, -5, -21); }, coat, -7.4, 7.4);
		P.shape((p) => { p.m(-2.4, -21); p.l(2.4, -21); p.l(1.6, -11); p.l(-1.6, -11); }, vest, -2.4, 2.4);
		for (const y of [-18, -15.4, -12.8]) P.dot(0, y, 0.45, '#d9b24a');
		P.thin([[-4.6, -20], [-3, -11]], '#c8a84a', 0.4); P.thin([[4.6, -20], [3, -11]], '#c8a84a', 0.4);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7, -11]], coat, skin);
		npcArm(P, [[5, -20.4], [8.4, -16], [8.6, -12.4]], coat, skin);
		P.shape((p) => { p.m(-2, -22.4); p.l(2, -22.4); p.l(1, -20); p.l(-1, -20); }, '#efe8dc', -2, 2);
		npcFace(P, 0, -28, 6.2, skin);
		P.shape((p) => { p.m(-5.8, -28.6); p.q(-6, -21.4, 0, -20.4); p.q(6, -21.4, 5.8, -28.6); p.q(4.4, -24.6, 2.6, -24.4); p.q(0, -26.2, -2.6, -24.4); p.q(-4.4, -24.6, -5.8, -28.6); }, hair, -6, 6);
		P.shape((p) => { p.m(-6, -29); p.q(-6.6, -33.6, -3, -34); p.l(3, -34); p.q(6.6, -33.6, 6, -29); p.q(4, -31, 0, -31.4); p.q(-4, -31, -6, -29); }, hair, -6.6, 6.6);
		P.ellipse(0, -33.6, 8.6, 1.8, coat);
		P.shape((p) => { p.m(-5, -33.6); p.l(-5.4, -42.6); p.q(0, -43.6, 5.4, -42.6); p.l(5, -33.6); }, coat, -5.4, 5.4);
		P.line([[-5.1, -35.6], [5.1, -35.6]], vest, 1.2);
		P.gloss(-3.4, -40, 0.7, 1.8, 0.4);
	},
	// Mrs. Diligence: a lady in a blue bustled dress with puffed sleeves and a small blue hat, red hair pinned up, a
	// furled umbrella
	425(P) {
		P.shadow(11, 4.5);
		const skin = '#f0c8a0', dress = '#3a6aa8', dark = '#24406e', hair = '#b0482a';
		P.line([[-8.6, -1], [-7.6, -13]], '#2a2a3a', 0.9);
		P.shape((p) => { p.m(-5, -13); p.l(5, -13); p.q(11, -9, 11.6, -1.6); p.q(6, 0, 0, -0.8); p.q(-6, 0, -10, -1.6); p.q(-9, -8, -5, -13); }, dark, -10, 11.6);
		P.shape((p) => { p.m(-4.4, -13); p.l(4, -13); p.q(5, -8, 2.6, -0.8); p.l(-6, -0.8); p.q(-6, -8, -4.4, -13); }, dress, -6, 5);
		P.thin([[-5.8, -5], [3.6, -5]], shade(dress, -0.3), 0.4);
		torso(P, -21, 4.2, -12.4, 4, dress);
		for (const y of [-19, -17, -15]) P.dot(0, y, 0.4, '#e8e0d0');
		P.line([[-4.4, -13], [4.4, -13]], dark, 1);
		for (const s of [-1, 1]) P.ellipse(s * 5, -18.6, 2.8, 2.8, dress);
		npcArm(P, [[-5.2, -17], [-7.4, -14], [-7.6, -12.4]], dress, skin, 2.4, 2);
		npcArm(P, [[5.2, -17], [6.8, -14], [5, -12]], dress, skin, 2.4, 2);
		npcFace(P, 0, -28, 6.2, skin, '#3a5a2a');
		P.shape((p) => { p.m(-6.6, -26); p.q(-7.6, -35, 0, -35); p.q(7.6, -35, 6.6, -26); p.q(5, -31, 1, -31.6); p.q(-4, -31, -6.6, -26); }, hair, -7.6, 7.6);
		P.circle(-5, -33.4, 2.6, hair);
		P.shape((p) => { p.m(-3.6, -34); p.q(-3.4, -39, 2, -39); p.q(5.6, -38.4, 5.4, -34); p.l(7.4, -33.4); p.q(1, -32.6, -5.4, -33.4); }, dark, -5.4, 7.4);
		P.line([[-3.4, -34.6], [5.2, -34.6]], dress, 0.8);
	},
	// Forest Fairy: a slender fairy with big translucent teal wings, a leafy green dress, long pale green-white hair,
	// a glowing green orb held up in one hand, barefoot
	426(P) {
		P.shadow(9, 4);
		const skin = '#f0d8a8', dress = '#7ac83a', wing = '#5ad0c8', hair = '#e8f0d0';
		for (const s of [-1, 1]) {
			P.shape((p) => { p.m(s * 1, -22); p.q(s * 10, -40, s * 16, -34); p.q(s * 14, -26, s * 1, -20); }, wing, Math.min(s, s * 16), Math.max(s, s * 16), { alpha: 0.55 });
			P.shape((p) => { p.m(s * 1, -20); p.q(s * 12, -20, s * 11, -12); p.q(s * 6, -11, s * 1, -19); }, wing, Math.min(s, s * 12), Math.max(s, s * 12), { alpha: 0.5 });
			P.thin([[s * 1.4, -21.6], [s * 12, -33]], shade(wing, -0.3), 0.3);
		}
		P.shape((p) => { p.m(-5.6, -29); p.q(-8, -20, -6.6, -14); p.l(5, -16); p.q(7, -22, 5.6, -29); }, hair, -8, 7);
		for (const s of [-1, 1]) { P.line([[s * 1.8, -9], [s * 2, -2]], skin, 2.2); P.ellipse(s * 2.4, -1.2, 1.8, 1, skin); }
		P.shape((p) => { p.m(-3.6, -20); p.l(3.6, -20); p.l(4, -13); p.l(6.6, -6); p.l(3, -8.4); p.l(1.4, -4.6); p.l(-0.4, -8.4); p.l(-3.4, -5); p.l(-3.6, -9.6); p.l(-6, -7.4); p.l(-4.2, -13); }, dress, -6.6, 6.6);
		P.thin([[0, -19], [0.4, -9]], shade(dress, -0.3), 0.4);
		npcArm(P, [[-3.6, -19.4], [-6, -15], [-4.4, -12]], skin, skin, 2, 1.6);
		npcArm(P, [[3.6, -19.4], [7.4, -18.6], [9, -22]], skin, skin, 2, 1.6);
		P.glow(9.4, -25.4, 6, '#7aff5a', 0.6);
		P.circle(9.4, -25.4, 2.8, '#4ac83a');
		P.gloss(8.4, -26.6, 0.9, 0.6, 0.8);
		npcFace(P, 0, -27.6, 5.8, skin, '#3a8a3a');
		P.shape((p) => { p.m(-6, -25); p.q(-7, -34, 0, -34); p.q(7, -34, 6, -25); p.q(4.4, -30.6, 1.4, -31); p.q(-2, -29.4, -6, -25); }, hair, -7, 7);
		for (const s of [-1, 1]) P.poly([[s * 5.4, -28.4], [s * 8, -30], [s * 5.8, -26.4]], skin);
	},
	// Inventor: a smith in a long leather apron over bare arms, a respirator mask over his mouth, a brass tank and pipes
	// on his back, a gauge strapped to one forearm, short brown hair
	428(P) {
		P.shadow(10, 4.5);
		const skin = '#e0a878', apron = '#9a4a24', tank = '#8a5a3a', hair = '#5a3a24';
		P.shape((p) => { p.m(-9, -26); p.l(-3, -26); p.l(-3, -14); p.l(-9, -15); }, tank, -9, -3);
		P.line([[-8.6, -26], [-7, -31], [-3, -29]], '#a8a8a8', 0.8);
		P.circle(-6, -21, 1.6, '#d8a840');
		npcLegs(P, -9, '#5a3424', '#3a2418', 3);
		torso(P, -21, 5, -8.6, 5.6, '#d8c8a8');
		P.shape((p) => { p.m(-3.6, -21); p.l(3.6, -21); p.l(4, -16); p.q(6.6, -10, 6, -4); p.l(-6, -4); p.q(-6.6, -10, -4, -16); }, apron, -6.6, 6.6);
		P.shape((p) => { p.m(-2, -16); p.l(2, -16); p.l(2, -12.6); p.l(-2, -12.6); }, shade(apron, -0.15), -2, 2);
		P.thin([[-4, -16], [-6, -14.4]], '#3a2418', 0.6); P.thin([[4, -16], [6, -14.4]], '#3a2418', 0.6);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7, -11]], skin, skin, 2.8, 2.2);
		npcArm(P, [[5, -20.4], [8.4, -16], [6.6, -19.6]], skin, skin, 2.8, 2.2);
		P.shape((p) => { p.m(6.4, -18.4); p.l(10, -17.6); p.l(10.4, -14); p.l(6.6, -14.6); }, '#6a4428', 6.4, 10.4);
		P.circle(8.4, -16.2, 1.2, '#e8e0c8');
		npcFace(P, 0, -28, 6.2, skin);
		P.ellipse(0, -24.4, 3.8, 2.4, '#6a6a6a');
		for (const s of [-1, 1]) P.circle(s * 2.8, -23.8, 1.3, '#4a4a4a');
		P.thin([[-5.4, -25.4], [-3.6, -25]], '#3a2418', 0.6); P.thin([[5.4, -25.4], [3.6, -25]], '#3a2418', 0.6);
		P.shape((p) => { p.m(-6.4, -27.6); p.q(-7, -35.6, -1, -36); p.l(1, -37); p.l(2, -35.6); p.q(7, -35, 6.4, -27.6); p.q(4.4, -31.6, 0, -31.6); p.q(-4, -31.4, -6.4, -27.6); }, hair, -7, 7);
	},
	// Hunter: a hooded ranger in a brown hood and a fur-trimmed red-brown cloak, leather bracers and belt, a coiled rope
	// on one arm, a hook in the other hand
	429(P) {
		P.shadow(11, 4.5);
		const skin = '#e0b088', cloak = '#7a3a28', hood = '#6a4a34', fur = '#d8ccb8';
		P.shape((p) => { p.m(-6, -22); p.q(-10, -12, -9, -3); p.l(9, -3); p.q(10, -12, 6, -22); }, shade(cloak, -0.15), -10, 10);
		npcLegs(P, -9, '#5a4434', '#5a3424', 4);
		for (const s of [-1, 1]) P.ellipse(s * 3.1, -6, 2.6, 1, fur);
		torso(P, -21, 4.8, -8.6, 5.6, cloak);
		P.line([[-5.6, -12.4], [5.6, -12.4]], '#3a2418', 1.1);
		P.thin([[-4.4, -20], [4, -12.6]], '#3a2418', 0.6);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7.4, -11]], cloak, skin);
		P.line([[-7.6, -14], [-7.4, -12]], '#5a3424', 2.8);
		for (const [dx, r] of [[-0.6, 3.6], [0, 3.2], [0.6, 2.8]]) P.line(Array.from({ length: 17 }, (_, k) => [-8.6 + dx + r * Math.cos(k * Math.PI / 8), -7.6 + r * 1.2 * Math.sin(k * Math.PI / 8)]), '#b8945a', 0.7);
		npcArm(P, [[5, -20.4], [8, -15.4], [8, -11]], cloak, skin);
		P.line([[8, -14], [8, -12]], '#5a3424', 2.8);
		P.thin([[8.4, -10.6], [9.6, -8], [8.6, -5.6], [7, -6.4]], '#9aa0aa', 0.7);
		P.shape((p) => { p.m(-6.6, -21.6); p.q(0, -24.4, 6.6, -21.6); p.q(3.6, -18.4, 0, -18.6); p.q(-3.6, -18.4, -6.6, -21.6); }, fur, -6.6, 6.6);
		P.shape((p) => { p.m(-7.6, -24); p.q(-8.6, -36.6, 0, -37); p.q(8.6, -36.6, 7.6, -24); p.q(0, -21.6, -7.6, -24); }, hood, -8.6, 8.6);
		npcFace(P, 0, -28, 5.6, skin);
		P.shape((p) => { p.m(-5.8, -28.4); p.q(-5, -34.2, 0, -34); p.q(5, -34.2, 5.8, -28.4); p.q(3, -31.4, -1, -31.6); p.q(-4, -31, -5.8, -28.4); }, '#4a2e1a', -5.8, 5.8);
		P.thin([[-6.4, -27], [-5.4, -33.4], [0, -34.8], [5.4, -33.4], [6.4, -27]], shade(hood, -0.3), 0.6);
	},
	// Leprechaun: a stout little man in a green coat, a huge brown top hat with a green band and a clover, a bushy orange
	// beard, a pipe, striped stockings, a cane
	431(P) {
		P.shadow(11, 4.5);
		const skin = '#f0c09a', coat = '#2a7a3a', beard = '#e0702a', hat = '#7a4a2a';
		P.line([[10.4, -1], [8.4, -12]], '#3a2a20', 0.9);
		for (const s of [-1, 1]) { P.line([[s * 3, -8], [s * 3.4, -2.6]], '#c8c0a8', 3.2); for (const y of [-6.6, -4.4]) P.thin([[s * 3.4 - 1.5, y], [s * 3.4 + 1.5, y]], '#a8382a', 0.7); P.ellipse(s * 3.8, -1.4, 2.8, 1.4, '#3a2a20'); }
		P.shape((p) => { p.m(-5.6, -21); p.l(5.6, -21); p.q(8.6, -14, 8, -6.4); p.l(-8, -6.4); p.q(-8.6, -14, -5.6, -21); }, coat, -8.6, 8.6);
		P.ellipse(0, -13.6, 4.6, 5, '#8aa848');
		P.line([[-7.6, -12], [7.6, -12]], '#3a2a20', 1.4);
		P.shape((p) => { p.m(-1.4, -13); p.l(1.4, -13); p.l(1.4, -11); p.l(-1.4, -11); }, '#d9b24a', -1.4, 1.4);
		npcArm(P, [[-5.6, -20], [-9, -16], [-8.4, -12]], coat, skin, 3.4, 2.8);
		npcArm(P, [[5.6, -20], [9.4, -16], [8.4, -12.6]], coat, skin, 3.4, 2.8);
		npcFace(P, 0, -28, 6.4, skin, '#2a5a2a');
		P.shape((p) => { p.m(-6.6, -29); p.q(-8, -20, -4, -17); p.q(0, -15.6, 4, -17); p.q(8, -20, 6.6, -29); p.q(5, -24.4, 2.4, -25); p.q(0, -26.4, -2.4, -25); p.q(-5, -24.4, -6.6, -29); }, beard, -8, 8);
		for (const x of [-3, 0, 3]) P.thin([[x, -23], [x * 1.2, -18.4]], shade(beard, -0.25), 0.4);
		P.line([[2.6, -24.6], [6.6, -23.6]], '#5a3a20', 0.7);
		P.ellipse(7.2, -24.6, 1.2, 1.4, '#5a3a20');
		P.ellipse(-0.6, -26.2, 1.2, 1, shade(skin, -0.12));
		P.ellipse(0, -33.4, 10, 2.4, hat);
		P.shape((p) => { p.m(-6, -33.4); p.l(-6.6, -44); p.q(0, -45.4, 6.6, -44); p.l(6, -33.4); }, hat, -6.6, 6.6);
		P.line([[-6.1, -35.8], [6.1, -35.8]], '#2a7a3a', 1.6);
		P.shape((p) => { p.m(-1.4, -36.4); p.l(1.4, -36.4); p.l(1.4, -34.8); p.l(-1.4, -34.8); }, '#d9b24a', -1.4, 1.4);
		for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0.4]]) P.circle(-4.4 + dx * 1.3, -40 + dy * 1.3, 1.2, '#4ac83a');
		P.gloss(-4, -42, 0.7, 1.6, 0.4);
	},
	// Goat: a tan goat with long ridged horns sweeping back, a beard, a brass bell on a collar; side on, facing right
	444(P) {
		P.shadow(13, 4.5);
		const coat = '#c8b07a', dark = shade('#c8b07a', -0.2), horn = '#5a4a3a';
		for (const x of [-7, 5]) { P.line([[x, -10], [x - 0.6, -1.6]], dark, 2); P.ellipse(x - 0.4, -1, 1.4, 0.9, '#3a3028'); }
		P.shape((p) => { p.m(-11, -14); p.q(-14, -16, -15, -12); p.q(-13, -13, -11, -11); }, coat, -15, -11);
		P.ellipse(-1.6, -13.4, 10.4, 5.4, coat);
		P.gloss(-6, -16.4, 2.4, 1, 0.35);
		for (const x of [-4.4, 7.4]) { P.line([[x, -11], [x + 0.4, -1.6]], coat, 2.2); P.ellipse(x + 0.6, -1, 1.5, 0.9, '#3a3028'); }
		P.shape((p) => { p.m(5, -17); p.q(7, -23, 9.6, -24); p.l(12.6, -21); p.q(10, -17, 8.6, -12); p.q(6, -11.6, 5, -17); }, coat, 5, 12.6);
		P.line([[6.6, -15.6], [10.6, -18.6]], '#7a4a2a', 0.9);
		P.circle(9.8, -16.4, 1.4, '#d8a840');
		P.dot(9.8, -15.6, 0.4, '#5a3a10');
		taper(P, [[9.6, -27], [6, -34], [1, -36], [-1.6, -33]], 2.4, 0.5, horn);
		taper(P, [[11.4, -27], [9, -34.6], [4, -37.6], [1.6, -35.4]], 2.4, 0.5, shade(horn, 0.15));
		P.shape((p) => { p.m(8, -27); p.q(10, -29.6, 13, -27.6); p.l(17, -22.6); p.q(17.4, -20.6, 15.4, -20.6); p.q(12, -21, 9.4, -22.4); p.q(7.4, -24.4, 8, -27); }, coat, 7.4, 17.4);
		P.poly([[8.4, -26.4], [4.6, -26], [7.6, -24.4]], dark);
		P.shape((p) => { p.m(13, -21); p.q(14, -17.6, 12.6, -16.4); p.q(12, -18.4, 11.4, -21); }, '#e8dcb8', 11.4, 14);
		P.ellipse(11.8, -25.4, 1.1, 0.9, '#e8c040');
		P.thin([[11.2, -25.4], [12.4, -25.4]], '#1a1206', 0.5);
		P.dot(16.4, -21.8, 0.4, '#3a2a20');
	},
	// Samurai panda: a stocky panda in a teal kimono and wide blue hakama, plated shoulder and thigh guards, a straw hat
	// on his back, a katana raised in one paw
	445(P) {
		P.shadow(13, 5);
		const fur = '#f2f0ea', black = '#2a2a2e', kimono = '#2a8a8a', hakama = '#2a4a8a', steel = '#9aa0aa';
		P.circle(-2, -22, 9.4, '#d8b868');
		for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.thin([[-2, -22], [-2 + Math.cos(a) * 9, -22 + Math.sin(a) * 9]], '#a8884a', 0.35); }
		P.shape((p) => { p.m(-6, -13); p.l(6, -13); p.q(11, -7, 11.6, -1.6); p.l(4, -1.4); p.l(0, -6); p.l(-4, -1.4); p.l(-11.6, -1.6); p.q(-11, -7, -6, -13); }, hakama, -11.6, 11.6);
		for (const s of [-1, 1]) P.ellipse(s * 7.6, -1.2, 3, 1.4, black);
		for (const s of [-1, 1]) P.shape((p) => { p.m(s * 3, -12.4); p.l(s * 8, -11.6); p.l(s * 8.6, -7); p.l(s * 3.6, -7.6); }, steel, Math.min(s * 3, s * 8.6), Math.max(s * 3, s * 8.6));
		P.shape((p) => { p.m(-6.6, -22); p.l(6.6, -22); p.q(8, -16, 6.6, -12); p.l(-6.6, -12); p.q(-8, -16, -6.6, -22); }, kimono, -8, 8);
		P.shape((p) => { p.m(-2.4, -22); p.l(0, -17); p.l(2.4, -22); }, fur, -2.4, 2.4);
		P.line([[-6.6, -12.6], [6.6, -12.6]], '#1a2a3a', 1.4);
		P.line([[-10, -9], [6, -14]], '#2a2a3a', 1.2);
		taper(P, [[-6, -21], [-10, -16], [-9, -12]], 4.4, 3.6, kimono);
		P.circle(-9, -11.6, 2.2, black);
		P.ellipse(-6.4, -21, 3.4, 2.4, steel);
		taper(P, [[6, -21], [9.6, -19], [9.4, -23.6]], 4.4, 3.6, kimono);
		P.ellipse(6.4, -21, 3.4, 2.4, steel);
		for (const s of [-1, 1]) P.circle(s * 4.8, -34.4, 2.4, black);
		P.circle(0, -28.6, 7, fur);
		P.gloss(-3, -32, 1.6, 0.9, 0.4);
		for (const s of [-1, 1]) P.ellipse(s * 2.6, -28.6, 1.8, 2.4, black, { rot: s * -0.5, line: false });
		for (const s of [-1, 1]) { P.dot(s * 2.4, -28.8, 0.8, '#ffffff'); P.dot(s * 2.4, -28.6, 0.45, '#1a1a1a'); }
		P.ellipse(0, -25, 1.2, 0.8, black);
		P.mouth(0, -23.4, 0.8, '#3a2a2a');
		sword(P, 9.6, -24, -1.25, 19, 1.4);
		P.circle(9.4, -24, 2.2, black);
	},
	// Royal rat: a grey rat in an olive scale-mail vest and green breeches, a red sash, shoulder guards, a sword at the
	// hip, a long pink tail, pink paws and feet
	446(P) {
		P.shadow(11, 4.5);
		const fur = '#8a8a90', pink = '#d89a9a', vest = '#a8a050', breeches = '#5a7a4a';
		taper(P, [[-3, -9], [-10, -10], [-14, -20], [-11, -28]], 1.8, 0.4, pink);
		for (const s of [-1, 1]) { P.line([[s * 2.8, -9], [s * 3.2, -2.6]], s < 0 ? shade(breeches, -0.1) : breeches, 3.6); P.line([[s * 3.2, -5], [s * 3.2, -2.4]], '#7a4a3a', 3.6); P.ellipse(s * 3.8, -1.2, 2.8, 1.2, pink); }
		sword(P, -5, -10, 1.95, 9, 1.2);
		torso(P, -21, 5, -8.6, 6, vest);
		for (let y = -19; y < -10; y += 1.8) for (let x = -4 + ((y + 19) % 3.6 ? 0.9 : 0); x < 4.6; x += 1.8) P.thin(eaQpts([x - 0.7, y], [x, y + 0.9], [x + 0.7, y]), shade(vest, -0.35), 0.3);
		P.line([[-6, -11.4], [6, -11.4]], '#a8384a', 1.8);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7.2, -11]], '#c8c088', pink);
		npcArm(P, [[5, -20.4], [8.4, -16.4], [5.4, -12.6]], '#c8c088', pink);
		for (const s of [-1, 1]) P.ellipse(s * 5.4, -20.4, 2.8, 2.2, '#8a8460');
		for (const s of [-1, 1]) { P.circle(s * 4.6, -34.6, 2.8, fur); P.circle(s * 4.6, -34.6, 1.7, pink, { line: false }); }
		P.circle(0, -28.6, 6, fur);
		P.shape((p) => { p.m(1.6, -30.4); p.q(8, -29.4, 11.4, -26); p.q(9, -24, 4, -24.4); p.q(1, -25, 1.6, -30.4); }, shade(fur, 0.1), 1, 11.4);
		P.dot(11.4, -26.2, 1, '#e86a8a');
		for (const k of [-1, 1]) P.thin([[9, -25.6], [13, -25.6 + k * 1.4]], '#4a4a4a', 0.25);
		P.gloss(-2.6, -31.6, 1.4, 0.8, 0.4);
		P.eyes(1.6, -29.6, 1.9, 1.1, '#1a1206');
	},
	// the tombs' townsfolk
	// a scribe: a blue headcloth, a long cream robe with a blue sash, a satchel at the hip, sandals
	634(P) {
		P.shadow(10, 4.5);
		const skin = '#c88a5a', linen = '#ece0c0', blue = '#2f5fb0';
		for (const s of [-1, 1]) P.ellipse(s * 3.4, -1.2, 2.4, 1.2, '#8a5a30');
		P.shape((p) => { p.m(-5, -21); p.l(5, -21); p.q(7.4, -12, 7, -2.4); p.q(0, -1, -7, -2.4); p.q(-7.4, -12, -5, -21); }, linen, -7.4, 7.4);
		for (const x of [-3, 0, 3]) P.thin([[x * 0.8, -11], [x * 1.3, -2.6]], shade(linen, -0.2), 0.35);
		P.line([[-6, -13], [6, -13]], blue, 2);
		P.thin([[-6, -12.4], [6, -12.4]], '#d9a83a', 0.4);
		P.thin([[-4.6, -20.4], [6, -10]], '#6a4428', 0.6);
		P.shape((p) => { p.m(4.4, -11); p.l(8.6, -11); p.l(8.4, -6.4); p.l(4.6, -6.4); }, '#8a5a30', 4.4, 8.6);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7, -11]], linen, skin);
		npcArm(P, [[5, -20.4], [8, -16.4], [6.4, -13.4]], linen, skin);
		P.shape((p) => { p.m(-6.6, -30); p.q(-8, -22, -7.4, -19.4); p.l(7.4, -19.4); p.q(8, -22, 6.6, -30); }, blue, -8, 8);
		npcFace(P, 0, -28, 6, skin);
		edUsekh(P, 0, -21.4, 4, ['#d9a83a', blue]);
		P.shape((p) => { p.m(-6.6, -27); p.q(-7.4, -35.4, 0, -35.6); p.q(7.4, -35.4, 6.6, -27); p.l(5, -27.6); p.q(5, -31.4, 0, -31.6); p.q(-5, -31.4, -5, -27.6); }, blue, -7.4, 7.4);
		P.line([[-5.6, -30.4], [0, -32], [5.6, -30.4]], '#d9a83a', 0.6);
	},
	// a labourer: bare-chested, a short black bob, a grey linen loincloth, an armband and a cord necklace, a sickle in
	// one hand, barefoot
	635(P) {
		P.shadow(10, 4.5);
		const skin = '#c88a5a', cloth = '#8a8478', hair = '#1e1a1a';
		npcLegs(P, -9, skin, skin, 0, 2.6);
		P.shape((p) => { p.m(-5, -21); p.q(0, -22, 5, -21); p.q(6, -15, 4.6, -11); p.l(-4.6, -11); p.q(-6, -15, -5, -21); }, skin, -6, 6);
		P.thin([[-2.6, -16.4], [0, -15.6], [2.6, -16.4]], shade(skin, -0.25), 0.4);
		P.shape((p) => { p.m(-5, -12); p.l(5, -12); p.l(5.6, -6); p.l(2, -7); p.l(0, -4); p.l(-2, -7); p.l(-5.6, -6); }, cloth, -5.6, 5.6);
		P.line([[-5.2, -12], [5.2, -12]], shade(cloth, -0.25), 1);
		npcArm(P, [[-5, -20.4], [-7.6, -15.4], [-7.2, -11]], skin, skin, 2.6, 2);
		P.thin([[-5.6, -18.8], [-7.6, -18.4]], '#5a3a20', 0.8);
		npcArm(P, [[5, -20.4], [8, -15.4], [8, -11]], skin, skin, 2.6, 2);
		P.line([[8.4, -10], [8.6, -7]], '#6a4428', 0.9);
		edSickle(P, 8.6, -7, 14, -6, 12.4, -1, 1);
		P.thin([[-2.4, -21.4], [0, -18.6], [2.4, -21.4]], '#5a3a20', 0.4);
		P.dot(0, -18.4, 0.6, '#d9a83a');
		npcFace(P, 0, -28, 6, skin);
		P.shape((p) => { p.m(-6.8, -24.6); p.q(-8, -35.4, 0, -35.4); p.q(8, -35.4, 6.8, -24.6); p.l(5.2, -24.6); p.q(5.4, -29.4, 4, -29.6); p.l(-4, -29.6); p.q(-5.4, -29.4, -5.2, -24.6); }, hair, -8, 8);
	},
	// a pharaoh: a blue and gold striped nemes, bare chest under a sheer white robe, a long red, blue and gold apron, a
	// broad collar, a tall gold staff
	636(P) {
		P.shadow(11, 4.5);
		const skin = '#d8a070', linen = '#f2ece0', gold = '#e0b040', blue = '#2f5fb0';
		P.line([[-10, 0], [-10.6, -36]], gold, 1.1);
		P.shape((p) => { p.m(-10.6, -36); p.q(-12, -40, -9, -40.4); p.q(-6.6, -40, -7.4, -37); }, gold, -12, -6.6);
		for (const s of [-1, 1]) P.ellipse(s * 3.6, -1.2, 2.4, 1.2, '#a8382a');
		P.shape((p) => { p.m(-5, -14); p.l(5, -14); p.q(7, -8, 7.2, -2); p.q(0, -0.6, -7.2, -2); p.q(-7, -8, -5, -14); }, linen, -7.4, 7.4, { alpha: 0.9 });
		P.shape((p) => { p.m(-2, -13.6); p.l(2, -13.6); p.l(2.6, -2.6); p.l(-2.6, -2.6); }, '#c8302a', -2.6, 2.6);
		for (let y = -11.6; y < -3; y += 2.2) P.thin([[-2.2, y], [2.2, y]], blue, 0.6);
		P.shape((p) => { p.m(-5, -21); p.q(0, -22, 5, -21); p.q(6, -16, 4.6, -13); p.l(-4.6, -13); p.q(-6, -16, -5, -21); }, skin, -6, 6);
		P.line([[-5.4, -13.6], [5.4, -13.6]], gold, 1.4);
		npcArm(P, [[-5, -20.4], [-8.6, -17], [-10, -20]], skin, skin, 2.6, 2);
		P.line([[-8, -17.6], [-8.8, -18.4]], gold, 2.2);
		npcArm(P, [[5, -20.4], [8, -15.4], [7.6, -11]], skin, skin, 2.6, 2);
		P.line([[7.8, -13.4], [7.7, -12]], gold, 2.6);
		ebNemes(P, 0, -28, 6, gold, blue);
		edUsekh(P, 0, -21.6, 5, [gold, blue, gold]);
		npcFace(P, 0, -28, 5.6, skin);
		ebNemesBand(P, 0, -28, 6);
	},
	// a townswoman: long black hair, a white dress with a blue sash wrapped across it, gold armlets, barefoot, hands on
	// her hips
	637(P) {
		P.shadow(10, 4.5);
		const skin = '#c88a5a', linen = '#f2ece0', blue = '#5a7ac0', hair = '#1e1a1a';
		P.shape((p) => { p.m(-6.6, -29); p.q(-8.4, -22, -6.6, -16); p.l(6.6, -16); p.q(8.4, -22, 6.6, -29); }, hair, -8.4, 8.4);
		for (const s of [-1, 1]) P.ellipse(s * 3, -1.2, 2.2, 1.1, skin);
		npcGown(P, -14, 4.6, 7.4, linen);
		P.shape((p) => { p.m(-5, -14); p.l(5, -13); p.q(6.6, -6, 7, -2.4); p.l(4.6, -2); p.q(2, -8, -5.6, -9.6); }, blue, -5.6, 7);
		P.line([[-7, -2], [7, -2]], blue, 1);
		torso(P, -21, 4.4, -13, 4.6, linen);
		P.thin([[-4, -20.6], [4.4, -14.4]], blue, 1.2);
		for (const s of [-1, 1]) {
			npcArm(P, [[s * 4.6, -20.4], [s * 8, -16.6], [s * 4.8, -13.4]], skin, skin, 2.2, 1.6);
			P.thin([[s * 5.6, -19.4], [s * 6.6, -20.2]], '#d9a83a', 0.7);
		}
		npcFace(P, 0, -28, 6, skin);
		for (const s of [-1, 1]) P.dot(s * 6, -25.6, 0.6, '#d9a83a');
		P.shape((p) => { p.m(-6.6, -25); p.q(-7.8, -35.4, 0, -35.4); p.q(7.8, -35.4, 6.6, -25); p.q(5.4, -30, 2, -30.4); p.q(-2, -30.6, -5, -28.6); p.q(-5.6, -27, -6.6, -25); }, hair, -7.8, 7.8);
		P.line([[-6.4, -30.4], [0, -33.2], [6.4, -30.4]], '#d9a83a', 0.6);
	},
	// a soldier: bald, a quilted linen corslet with blue armbands, a white kilt, a khopesh low in one hand and a tall
	// round-topped wooden shield on the other arm, barefoot
	638(P) {
		P.shadow(12, 4.5);
		const skin = '#c88a5a', linen = '#d8d0b8', wood = '#7a4a28', blue = '#2f5fb0';
		npcLegs(P, -9, skin, skin, 0, 2.8);
		edShendyt(P, -13, -6, 5, '#a8946a', null, 0, '#ece4d0');
		P.shape((p) => { p.m(-5.2, -21.6); p.l(5.2, -21.6); p.l(5, -12.6); p.l(-5, -12.6); }, linen, -5.2, 5.2);
		for (const y of [-19.4, -17, -14.6]) P.thin([[-5, y], [5, y]], shade(linen, -0.3), 0.4);
		P.thin([[-3.6, -21.6], [-2, -12.6]], shade(linen, -0.3), 0.4); P.thin([[3.6, -21.6], [2, -12.6]], shade(linen, -0.3), 0.4);
		npcArm(P, [[-5, -20.6], [-7.8, -15.6], [-7.6, -11]], skin, skin, 2.8, 2.2);
		P.line([[-6.6, -18.4], [-8, -17.6]], blue, 1.4);
		eaKhopesh(P, -7.6, -10.6, 1.9, 10, '#cfd4dc', -1);
		P.circle(-7.6, -10.4, 1.6, skin);
		npcArm(P, [[5, -20.6], [8, -16], [9, -13]], skin, skin, 2.8, 2.2);
		P.shape((p) => { p.m(8, -2); p.l(8, -20); p.q(12, -27, 16, -20); p.l(16, -2); p.q(12, 0, 8, -2); }, wood, 8, 16);
		P.shape((p) => { p.m(9.4, -3.4); p.l(9.4, -19.4); p.q(12, -24.6, 14.6, -19.4); p.l(14.6, -3.4); p.q(12, -2, 9.4, -3.4); }, shade(wood, 0.12), 9.4, 14.6, { line: false });
		P.circle(12, -12, 1.4, '#a87a4a');
		P.gloss(10.4, -19, 0.8, 1.8, 0.4);
		npcFace(P, 0, -28, 6.2, skin);
		P.gloss(-2, -32.6, 1.8, 0.8, 0.5);
		for (const s of [-1, 1]) P.ellipse(s * 6.2, -27.6, 0.9, 1.4, skin);
	},
	// a priestess: the horned crown with an orange sun disc over long black hair, a white dress with teal and gold
	// borders, a flaming torch in one hand and an ankh in the other
	639(P) {
		P.shadow(11, 4.5);
		const skin = '#b87a4a', linen = '#f2ece0', teal = '#2a9a90', gold = '#d9a83a', hair = '#1e1a1a';
		P.shape((p) => { p.m(-6.6, -29); p.q(-8.4, -22, -6.6, -16); p.l(6.6, -16); p.q(8.4, -22, 6.6, -29); }, hair, -8.4, 8.4);
		for (const s of [-1, 1]) P.ellipse(s * 3, -1.2, 2.2, 1.1, '#8a5a30');
		npcGown(P, -14, 4.6, 7.4, linen);
		P.shape((p) => { p.m(-7.2, -5); p.q(0, -3.6, 7.2, -5); p.l(7.4, -1.6); p.q(0, -0.2, -7.4, -1.6); }, teal, -7.4, 7.4);
		P.poly([[-1.4, -13.6], [1.4, -13.6], [1.8, -5], [-1.8, -5]], teal);
		torso(P, -21, 4.4, -13, 4.6, linen);
		P.line([[-4.8, -13.6], [4.8, -13.6]], gold, 1.2);
		npcArm(P, [[-4.6, -20.4], [-7.6, -15.6], [-7.4, -11.4]], skin, skin, 2.4, 1.8);
		P.line([[-7.4, -10], [-7.4, -6]], '#a8a8a8', 0.7); P.line([[-8.8, -8.6], [-6, -8.6]], '#a8a8a8', 0.7);
		P.ellipse(-7.4, -11.4, 1, 1.3, '#a8a8a8');
		npcArm(P, [[4.6, -20.4], [8.4, -17.4], [9.6, -19.4]], skin, skin, 2.4, 1.8);
		P.line([[9.8, -14], [10.6, -27]], '#8a5a2a', 1.2);
		P.shape((p) => { p.m(9, -27); p.l(12.2, -27); p.l(11.8, -29.4); p.l(9.4, -29.4); }, gold, 9, 12.2);
		P.glow(10.6, -32, 6, '#ffb030', 0.6);
		P.shape((p) => { p.m(8.6, -29.4); p.q(8, -33, 10.4, -36.6); p.q(10.6, -33.6, 11.6, -33); p.q(12.6, -31, 12.6, -29.4); }, '#ff9a20', 8, 12.6);
		P.shape((p) => { p.m(9.6, -29.6); p.q(9.6, -32, 10.6, -33.6); p.q(11.6, -31.4, 11.6, -29.6); }, '#ffe060', 9.6, 11.6, { line: false });
		edUsekh(P, 0, -21.6, 4.6, [gold, teal, gold]);
		npcFace(P, 0, -28, 6, skin);
		P.shape((p) => { p.m(-6.6, -25); p.q(-7.8, -35.4, 0, -35.4); p.q(7.8, -35.4, 6.6, -25); p.l(5.2, -25); p.q(5.4, -30.6, 0, -30.8); p.q(-5.4, -30.6, -5.2, -25); }, hair, -7.8, 7.8);
		P.line([[-6.4, -31], [0, -33.4], [6.4, -31]], gold, 0.7);
		for (const s of [-1, 1]) taper(P, [[s * 1.4, -34.6], [s * 6.6, -38], [s * 5.4, -43.4]], 1.6, 0.6, gold);
		P.circle(0, -39.4, 3.6, '#e8601a');
		P.gloss(-1.2, -40.6, 1, 0.6, 0.5);
	},
	// Jane: a red-haired dancer with a feather in her hair, a red corset over a white blouse, a ruffled red skirt short
	// in front and long behind, tall pink-brown boots
	640(P) {
		P.shadow(11, 4.5);
		const skin = '#f0c8a0', red = '#b8303a', hair = '#c8502a', boot = '#a8706a';
		P.shape((p) => { p.m(-5, -14); p.l(5, -14); p.q(10, -8, 10.4, -1.6); p.q(5, -0.4, 4, -3); p.l(-4, -3); p.q(-5, -0.4, -10.4, -1.6); p.q(-10, -8, -5, -14); }, shade(red, -0.2), -10.4, 10.4);
		npcLegs(P, -10, skin, boot, 6, 2.4);
		P.shape((p) => { p.m(-5, -14); p.l(5, -14); p.q(7, -11, 7.4, -8.6); p.q(0, -6.6, -7.4, -8.6); p.q(-7, -11, -5, -14); }, red, -7.4, 7.4);
		P.thin([[-7, -8.8], [0, -7], [7, -8.8]], '#f0b0b0', 0.8);
		torso(P, -21, 4.4, -13, 4.4, '#efe4dc');
		P.shape((p) => { p.m(-4.4, -19); p.q(0, -17.6, 4.4, -19); p.l(4.4, -13.4); p.l(-4.4, -13.4); }, red, -4.4, 4.4);
		for (const y of [-17, -15]) P.thin([[-1, y], [1, y]], '#f0d0c0', 0.35);
		npcArm(P, [[-4.6, -20.4], [-8, -16.4], [-5.4, -13.4]], '#efe4dc', skin, 2.6, 1.8);
		npcArm(P, [[4.6, -20.4], [7.4, -15.4], [7, -11.4]], '#efe4dc', skin, 2.6, 1.8);
		P.thin([[-2.6, -21.4], [0, -20], [2.6, -21.4]], red, 0.7);
		P.shape((p) => { p.m(-6.6, -30); p.q(-9.6, -24, -7.4, -18); p.l(-4, -21); p.l(4, -21); p.l(7.4, -18); p.q(9.6, -24, 6.6, -30); }, hair, -9.6, 9.6);
		npcFace(P, 0, -28, 6, skin, '#3a6a3a');
		P.shape((p) => { p.m(-6.6, -26); p.q(-7.6, -35.4, 0, -35.4); p.q(7.6, -35.4, 6.6, -26); p.q(5.6, -30, 2, -31.6); p.q(-1, -29.6, -6.6, -26); }, hair, -7.6, 7.6);
		taper(P, [[4.4, -33], [6.6, -38], [5.6, -42.6]], 2, 0.5, '#e8e0d8');
		P.thin([[4.6, -33.4], [5.6, -42]], '#8a8278', 0.3);
	},
	// Merytsah (in the town): long black hair under a red headband, a beaded collar, a yellow gown banded in red and
	// green, a sheer white shawl, a tall green papyrus staff
	641(P) {
		P.shadow(11, 4.5);
		const skin = '#c88a5a', yellow = '#e0a830', green = '#2a6a3a', red = '#c8302a', hair = '#1e1a1a';
		P.line([[10, -0.6], [10.6, -34]], green, 1.1);
		P.shape((p) => { p.m(10.6, -34); p.l(7.4, -38.6); p.q(10.8, -40.6, 14, -38.6); }, green, 7.4, 14);
		P.shape((p) => { p.m(-6.6, -29); p.q(-8.4, -22, -6.6, -16); p.l(6.6, -16); p.q(8.4, -22, 6.6, -29); }, hair, -8.4, 8.4);
		P.shape((p) => { p.m(-5, -21); p.q(-9, -14, -8.6, -6); p.l(-5.4, -7); p.q(-5.4, -15, -4, -18); }, '#f2ece0', -9, -4, { alpha: 0.85 });
		for (const s of [-1, 1]) P.ellipse(s * 3, -1.2, 2.2, 1.1, skin);
		npcGown(P, -13, 4.6, 7, yellow);
		for (const y of [-9, -4]) P.thin([[-6.6, y], [6.6, y]], red, 0.6);
		P.thin([[-7, -3.2], [7, -3.2]], green, 0.6);
		torso(P, -21, 4.4, -12.4, 4.6, yellow);
		P.line([[-4.8, -13], [4.8, -13]], red, 1.2);
		npcArm(P, [[-4.6, -20.4], [-7, -15.6], [-6.4, -11.4]], skin, skin, 2.4, 1.8);
		P.line([[-6.8, -14.6], [-7, -13]], '#d9a83a', 2.2);
		npcArm(P, [[4.6, -20.4], [8.6, -17.4], [10.2, -19.6]], skin, skin, 2.4, 1.8);
		edUsekh(P, 0, -21.6, 4.8, [green, red, '#d9a83a']);
		npcFace(P, 0, -28, 6, skin);
		P.shape((p) => { p.m(-6.6, -25); p.q(-7.8, -35.4, 0, -35.4); p.q(7.8, -35.4, 6.6, -25); p.l(5.2, -25); p.q(5.4, -30.6, 0, -30.8); p.q(-5.4, -30.6, -5.2, -25); }, hair, -7.8, 7.8);
		P.line([[-6.6, -30.6], [0, -32.6], [6.6, -30.6]], red, 1);
		for (const s of [-1, 1]) P.dot(s * 6.3, -26.6, 0.7, '#d9a83a');
	},
};
