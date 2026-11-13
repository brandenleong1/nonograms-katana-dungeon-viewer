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
const SAME_AS = { 276: 210, 277: 212 };

const drawingOf = (id) => DRAW[SAME_AS[id] ?? id];

export const hasCreature = (id) => !!drawingOf(+id);

/** Draw species `id` at the tile centre, scaled by `scale` (bosses are drawn larger). */
export function paintCreature(g, env, id, scale = 1) {
	const draw = drawingOf(+id);
	if (!draw) return;
	g.save();
	g.scale(scale, scale);
	draw(pen(g, env.u, env.lw / scale));
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
function pen(g, u, lw) {
	const X = (v) => v * u;
	const ink = (color) => shade(color, -0.55);
	const fillOf = (color, x0, x1) => {
		const gr = g.createLinearGradient(X(x0), 0, X(x1), 0);
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
			g.beginPath(); g.ellipse(X(x), X(y), X(rx), X(ry), opts.rot || 0, 0, Math.PI * 2);
			P.paint(color, x - rx, x + rx, opts);
		},
		circle(x, y, r, color, opts) { P.ellipse(x, y, r, r, color, opts); },
		poly(pts, color, opts = {}) {
			g.beginPath(); g.moveTo(X(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(X(x), X(y));
			g.closePath();
			const xs = pts.map((p) => p[0]);
			P.paint(color, Math.min(...xs), Math.max(...xs), opts);
		},
		/** a closed path built with p.m / p.l / p.q / p.b (move, line, quadratic, bezier) in u */
		shape(fn, color, x0, x1, opts = {}) {
			g.beginPath();
			fn({
				m: (x, y) => g.moveTo(X(x), X(y)),
				l: (x, y) => g.lineTo(X(x), X(y)),
				q: (cx, cy, x, y) => g.quadraticCurveTo(X(cx), X(cy), X(x), X(y)),
				b: (c1x, c1y, c2x, c2y, x, y) => g.bezierCurveTo(X(c1x), X(c1y), X(c2x), X(c2y), X(x), X(y)),
			});
			g.closePath();
			P.paint(color, x0, x1, opts);
		},
		/** a thick outlined stroke (limbs, staffs, blades) */
		line(pts, color, width) {
			g.beginPath(); g.moveTo(X(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(X(x), X(y));
			g.lineJoin = 'round'; g.lineCap = 'round';
			g.strokeStyle = ink(color); g.lineWidth = X(width) + lw * 2; g.stroke();
			g.strokeStyle = color; g.lineWidth = X(width); g.stroke();
		},
		/** a thin stroke with no outline (details: seams, ribs, whiskers) */
		thin(pts, color, width) {
			g.beginPath(); g.moveTo(X(pts[0][0]), X(pts[0][1]));
			for (const [x, y] of pts.slice(1)) g.lineTo(X(x), X(y));
			g.lineJoin = 'round'; g.lineCap = 'round';
			g.strokeStyle = color; g.lineWidth = Math.max(0.8, X(width)); g.stroke();
		},
		gloss(x, y, rx, ry, a = 0.55) {
			g.fillStyle = `rgba(255,255,255,${a})`;
			g.beginPath(); g.ellipse(X(x), X(y), X(rx), X(ry), -0.5, 0, Math.PI * 2); g.fill();
		},
		dot(x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(X(x), X(y), X(r), 0, Math.PI * 2); g.fill(); },
		/** a soft disc of light added onto what is below */
		glow(x, y, r, color, a = 0.5) {
			const gr = g.createRadialGradient(X(x), X(y), 0, X(x), X(y), X(r));
			gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
			g.globalCompositeOperation = 'lighter'; g.fillStyle = gr;
			g.beginPath(); g.arc(X(x), X(y), X(r), 0, Math.PI * 2); g.fill();
			g.globalCompositeOperation = 'source-over';
		},
		/** big chibi eyes: white, dark iris, highlight */
		eyes(x, y, gap, r, iris = '#2a1f1a') {
			for (const s of [-1, 1]) {
				P.dot(x + s * gap, y, r, '#fbf7f0');
				P.dot(x + s * gap + r * 0.15, y + r * 0.15, r * 0.62, iris);
				P.dot(x + s * gap - r * 0.15, y - r * 0.3, r * 0.25, '#ffffff');
			}
		},
		/** glowing eyes: a bright dot with a halo */
		glowEyes(x, y, gap, r, color) {
			for (const s of [-1, 1]) { P.glow(x + s * gap, y, r * 3, color, 0.55); P.dot(x + s * gap, y, r, shade(color, 0.6)); }
		},
		mouth(x, y, w, color = '#5a2a2a') {
			g.strokeStyle = color; g.lineWidth = Math.max(1, lw * 0.9); g.lineCap = 'round';
			g.beginPath(); g.arc(X(x), X(y - w * 0.6), X(w), 0.3, Math.PI - 0.3); g.stroke();
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
	// Banshee: a floating ghost in a tattered navy gown that fades out, flowing hair, glowing eyes, reaching hands
	209(P) {
		P.shadow(9, 3.5, 2, 0.2);
		const gown = '#2b3a6b', skin = '#a9c4e6', hair = '#1e2a52';
		P.glow(0, -18, 18, '#7aa0ff', 0.22);
		P.shape((p) => { p.m(-5, -23); p.l(5, -23); p.q(10, -14, 12, -4); p.l(9, -6.5); p.l(7.5, -2); p.l(5, -5.5); p.l(2.5, -1); p.l(0, -5); p.l(-2.5, -1); p.l(-5, -5.5); p.l(-7.5, -2); p.l(-9, -6.5); p.l(-12, -4); p.q(-10, -14, -5, -23); }, gown, -12, 12);
		P.shape((p) => { p.m(-9, -6.5); p.l(-11, 1); p.l(-7.5, -2); }, gown, -11, -7, { alpha: 0.45 });
		P.shape((p) => { p.m(9, -6.5); p.l(12, 0); p.l(7.5, -2); }, gown, 7, 12, { alpha: 0.45 });
		P.thin([[-3, -20], [-4, -8]], shade(gown, 0.25), 0.5); P.thin([[3, -20], [4, -8]], shade(gown, 0.25), 0.5);
		for (const s of [-1, 1]) {
			P.line([[s * 5, -20], [s * 9.5, -15], [s * 11.5, -16.5]], skin, 1.3);
			for (const k of [-1, 0, 1]) P.thin([[s * 11.5, -16.5], [s * (13.4 + k * 0.2), -17.6 + k * 1.1]], shade(skin, -0.25), 0.35);
		}
		P.shape((p) => { p.m(-9, -29); p.q(-11, -19, -8, -14); p.l(8, -14); p.q(11, -19, 9, -29); p.q(0, -41, -9, -29); }, hair, -11, 11);
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
		P.eyes(0, -27, 2.5, 1.4, '#1a2a6a');
		P.mouth(0, -23.3, 0.9);
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
	// Snotling warlord: a little green goblin in an iron helmet riding a big brown rat, holding a forked pole
	215(P) {
		P.shadow(14, 5);
		const rat = '#6b4e3a', goblin = '#7cae4a';
		P.thin([[11, -6], [16, -4], [18, -8], [17, -11]], '#c28a7a', 1);
		for (const [x, s] of [[-6, -1], [-2, 1], [5, -1], [9, 1]]) P.line([[x, -5], [x + s * 0.5, -1]], shade(rat, -0.1), 2);
		P.ellipse(2, -9, 11, 6.5, rat);
		P.gloss(-1, -13, 3, 1.2);
		P.ellipse(-10, -9, 5, 4.2, rat);
		P.ellipse(-14.5, -8, 2.2, 1.8, shade(rat, 0.15));
		P.dot(-16.4, -8.4, 0.9, '#e88a9a');
		P.ellipse(-8.5, -13.5, 1.8, 2.4, '#c28a7a');
		P.glow(-10.5, -10.5, 2, '#ff9a2a', 0.6); P.dot(-10.5, -10.5, 0.9, '#ffb04a');
		for (const k of [-1, 1]) P.thin([[-15.5, -7.4], [-19, -7.4 + k * 1.4]], '#d9c9b9', 0.25);
		P.line([[7, -12], [9, -36]], '#5a3a22', 0.9);
		P.line([[7.6, -34], [10.6, -36.4]], '#5a3a22', 0.8); P.line([[9.4, -36], [11, -39.4]], '#7a7f8a', 0.8); P.line([[8.4, -35.6], [7, -39]], '#7a7f8a', 0.8);
		torso(P, -20, 3.5, -12, 4.2, '#5a4a3a');
		P.line([[3, -17], [7, -18]], goblin, 1.4);
		P.line([[-3, -17], [-6, -14]], goblin, 1.4);
		for (const s of [-1, 1]) P.poly([[s * 3.5, -24.5], [s * 9, -26], [s * 4, -22.6]], goblin);
		head(P, -24, 4.4, goblin);
		P.eyes(0, -23.5, 1.6, 1.1, '#3a1a0a');
		P.thin([[-1.2, -21.6], [1.2, -21.6]], '#2a3a10', 0.45);
		P.shape((p) => { p.m(-5, -25.5); p.q(-5, -31, 0, -31.5); p.q(5, -31, 5, -25.5); p.q(0, -27, -5, -25.5); }, '#4a4a52', -5, 5);
		P.poly([[0, -31.5], [0.8, -34.5], [-0.8, -34.5]], '#4a4a52');
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
		const s = 4.4;
		P.circle(4, -12, s, '#e8f2d8', { alpha: 0.85 });
		P.ellipse(2.4, -12, 1.2, 1.4, '#1f3a14', { line: false }); P.ellipse(5.6, -12, 1.2, 1.4, '#1f3a14', { line: false });
		P.ellipse(4, -8.6, 2.4, 1.4, '#d8e8c8', { line: false, alpha: 0.85 });
		for (const k of [-1, 0, 1]) P.thin([[4 + k * 0.9, -9.2], [4 + k * 0.9, -8]], '#5a7a4a', 0.25);
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
		P.shape((p) => { p.m(-5.5, -20); p.l(5.5, -20); p.q(7, -10, 5, -5); p.q(0, -3.5, -5, -5); p.q(-7, -10, -5.5, -20); }, stem, -7, 7);
		P.ellipse(-2, -14.5, 1.5, 1.7, '#2a3a18', { line: false }); P.ellipse(2, -14.5, 1.5, 1.7, '#2a3a18', { line: false });
		P.poly([[-0.4, -12.4], [0.4, -12.4], [0, -13.2]], '#2a3a18', { line: false });
		P.ellipse(0, -9.6, 2.4, 1.1, '#2a3a18', { line: false });
		for (const k of [-1, 0, 1]) P.thin([[k * 0.8, -10.6], [k * 0.8, -8.6]], stem, 0.3);
		P.shape((p) => { p.m(-14, -20); p.q(-14, -36, 0, -36); p.q(14, -36, 14, -20); p.q(0, -17, -14, -20); }, cap, -14, 14);
		for (const [x, y, r] of [[-7, -28, 2], [0, -31.5, 2.3], [7, -28, 2], [-10.5, -22.5, 1.3], [10.5, -22.5, 1.3], [-3, -24, 1.4], [4, -23.5, 1.2]]) P.ellipse(x, y, r, r * 0.8, '#e2f4b8', { line: false });
		P.gloss(-6, -32, 3, 1.4, 0.5);
	},
	// Bone Dragon: a skeletal dragon crouched on four bony legs, ragged grey wings spread, a horned skull with a green eye
	268(P) {
		P.shadow(18, 6);
		const bone = '#d9d4b0', wing = '#6f6f6a';
		for (const s of [-1, 1]) {
			P.shape((p) => { p.m(s * 4, -16); p.q(s * 10, -40, s * 24, -42); p.l(s * 22, -34); p.l(s * 25, -30); p.l(s * 20, -26); p.l(s * 22, -21); p.l(s * 16, -20); p.q(s * 10, -18, s * 6, -12); }, wing, s < 0 ? -25 : 4, s < 0 ? -4 : 25, { alpha: 0.92 });
			for (const [x, y] of [[24, -42], [25, -30], [22, -21]]) P.thin([[s * 5, -16], [s * x, y]], shade(bone, -0.2), 0.7);
		}
		P.line([[8, -6], [13, -8], [17, -5], [20, -7]], bone, 1.4);
		for (const [x0, x1] of [[-6, -9], [-2, -3], [4, 6], [8, 11]]) P.line([[x0, -8], [(x0 + x1) / 2, -4], [x1, -0.8]], bone, 1.4);
		P.ellipse(2, -9.5, 8, 4.5, shade(bone, -0.1));
		for (const x of [-3, 0, 3, 6]) P.thin([[x, -13.5], [x + 0.5, -6]], '#6a6550', 0.5);
		for (const [x, y] of [[-6, -12], [-9, -15], [-11, -18.5]]) P.circle(x, y, 1.8, bone);
		P.shape((p) => { p.m(-17, -18); p.q(-18, -24, -12, -24.5); p.q(-8, -24, -7.5, -20); p.q(-9, -16, -14, -16.5); p.q(-16, -16, -17, -18); }, bone, -18, -7.5);
		P.shape((p) => { p.m(-17, -18); p.l(-21.5, -16.5); p.l(-19, -15.4); p.l(-15, -16.4); }, bone, -21.5, -15);
		for (const s of [-1, 1]) P.poly([[-10 + s, -23.5], [-7 + s * 1.5, -29], [-9 + s * 0.6, -23]], shade(bone, -0.15));
		P.ellipse(-13, -20.5, 1.7, 1.4, '#1a1a12', { line: false });
		P.glow(-13, -20.5, 3, '#6aff7a', 0.65); P.dot(-13, -20.5, 0.6, '#b8ffb8');
		for (const x of [-20.5, -19, -17.5]) P.thin([[x, -16.6], [x + 0.2, -15.6]], '#f4f0e0', 0.35);
	},
};
