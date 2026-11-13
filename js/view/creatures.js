// Chibi creature sprites, by species (our own vector drawings, after how each creature looks in the game; no game
// art). Issue #31. Drawn in the map's sprite style (js/view/sprites.js): three-tone gradients, outlines a darker tone
// of each colour, soft gloss. Species that share a picture in the game share a drawing (SAME_AS).
//
// Units: u = half tile width / 32 (device px). Origin: the tile centre; y up is negative. A drawing stays within
// about 26u of the centre sideways and 46u above it, so a 1.2× boss still fits the sprite canvas.
//
//   hasCreature(species)                        -> true when there is a drawing
//   paintCreature(g, env, species, scale = 1)   -> draw it (env as in sprites.js: { u, lw })

/** species drawn the same as another (one picture in the game) */
const SAME_AS = { 276: 210, 277: 212, 278: 234, 279: 236, 285: 224, 267: 268, 280: 265, 281: 266, 282: 244, 283: 246, 270: 255, 271: 255, 272: 256 };

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
function shade(hex, t, a = 1) {
	const to = t >= 0 ? 255 : 0;
	const k = Math.abs(t);
	const v = hex2rgb(hex).map((x) => Math.round(x + (to - x) * k));
	return a >= 1 ? `rgb(${v})` : `rgba(${v},${a})`;
}
const rgba = (hex, a) => `rgba(${hex2rgb(hex)},${a})`;

// ---- the pen: drawing primitives in u ---------------------------------------------------------------------------
function pen(g, u, lw, flip = false) {
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
};
