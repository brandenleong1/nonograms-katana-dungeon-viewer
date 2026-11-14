// Chibi object sprites, by object id (our own vector drawings, after how each object looks in the game; no game art).
// Issue #78. Drawn with the creatures' pen (js/view/creatures.js) in the same style: lit from the left, outlines a
// darker tone of each colour, soft gloss. Each breakable is drawn as itself, so the map shows which mimic it can hide:
// a barrel a Kraken (a Shark attack in the caves), a vase a Fire beetle (a Giant fly), the tombs' basket, crate and
// vase a jar mimic. Each container shows what you find in it (herbs, mushrooms, a crystal, honey...); the five
// crystal rocks share one drawing in their own colours. The purple and golden treasure chests share the wooden
// chest's drawing in their own wood and gold; the black sarcophagus is its own.
//
// Units and origin as in creatures.js: u = half tile width / 32, the tile centre at 0, y up negative. A floor tile
// spans ±32u sideways and ±16u down and up; a single object stands about 20u tall, a group about 28u (a goblin: 34u).
//
//   hasObject(id)                -> true when there is a drawing
//   paintObject(g, env, id)      -> draw it (env as in sprites.js: { u, lw })

import { pen, shade } from './creatures.js';

export const hasObject = (id) => !!DRAW[+id];

/** Draw object `id` standing on the tile centre. */
export function paintObject(g, env, id) {
	const draw = DRAW[+id];
	if (draw) draw(pen(g, env.u, env.lw));
}

// ---- geometry ---------------------------------------------------------------------------------------------------
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** the front half of an ellipse (left to right through its lowest point), as points for P.thin / P.line */
function frontArc(cx, cy, rx, ry, n = 14) {
	return Array.from({ length: n + 1 }, (_, k) => {
		const a = Math.PI - (Math.PI * k) / n;
		return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
	});
}

/** a point on a four-cornered face [top left, top right, bottom right, bottom left] at (s across, t down) */
function facePt([tl, tr, br, bl], s, t) {
	return lerp(lerp(tl, tr, s), lerp(bl, br, s), t);
}

// ---- crates -----------------------------------------------------------------------------------------------------
/**
 * An isometric box on the floor: base centre (x, y), half width d (its corners are d to either side and d/2 above and
 * below), height h. Returns its faces (corners as for facePt) for the details drawn on them.
 */
function isoBox(P, x, y, d, h, color, lid = shade(color, 0.18)) {
	const top = [[x - d, y - h], [x, y - d / 2 - h], [x + d, y - h], [x, y + d / 2 - h]];
	const left = [[x - d, y - h], [x, y + d / 2 - h], [x, y + d / 2], [x - d, y]];
	const right = [[x, y + d / 2 - h], [x + d, y - h], [x + d, y], [x, y + d / 2]];
	P.poly(left, shade(color, 0.04), { flat: true });
	P.poly(right, shade(color, -0.3), { flat: true });
	P.poly(top, lid, { flat: true });
	return { top, left, right };
}

/** a plank frame around a face, inset by `inset` of its size, and a diagonal brace */
function crateFace(P, face, color, brace = true) {
	const rim = shade(color, 0.12), seam = shade(color, -0.45);
	const i = 0.13;
	const ring = [facePt(face, i, i), facePt(face, 1 - i, i), facePt(face, 1 - i, 1 - i), facePt(face, i, 1 - i)];
	P.thin([...ring, ring[0]], seam, 0.5);
	if (brace) P.line([facePt(face, i + 0.04, 1 - i - 0.04), facePt(face, 1 - i - 0.04, i + 0.04)], rim, 1.6);
}

/** the dungeon crate: plank frame and a diagonal brace on each side, planks on top */
function woodCrate(P, x, y, d, h, color = '#9a6a3c') {
	const f = isoBox(P, x, y, d, h, color);
	crateFace(P, f.left, shade(color, 0.04));
	crateFace(P, f.right, shade(color, -0.3));
	for (const s of [0.33, 0.66]) P.thin([facePt(f.top, s, 0.06), facePt(f.top, s, 0.94)], shade(color, -0.25), 0.45);
	P.gloss(x - d * 0.55, y - h * 0.7, d * 0.12, h * 0.2, 0.25);
}

/** the tombs' crate: dark wood framed in light wood, a lotus fan painted on each side */
function tombCrate(P, x, y, d, h) {
	const wood = '#6a4630', frame = '#c49a62';
	const f = isoBox(P, x, y, d, h, wood, shade(wood, 0.1));
	for (const [face, c] of [[f.left, frame], [f.right, shade(frame, -0.3)], [f.top, shade(frame, 0.1)]]) {
		const i = 0.1;
		const ring = [facePt(face, i, i), facePt(face, 1 - i, i), facePt(face, 1 - i, 1 - i), facePt(face, i, 1 - i)];
		P.thin([...ring, ring[0]], c, 1);
	}
	for (const s of [0.37, 0.63]) P.thin([facePt(f.top, s, 0.12), facePt(f.top, s, 0.88)], shade(wood, -0.35), 0.4);
	for (const face of [f.left, f.right]) lotusFan(P, face);
}

/** a fan of teal petals rising from the bottom middle of a face */
function lotusFan(P, face) {
	const root = facePt(face, 0.5, 0.8);
	for (const s of [0.34, 0.42, 0.5, 0.58, 0.66]) P.thin([root, facePt(face, s, 0.5)], '#3fb39a', 0.6);
	P.dot(...root, 0.9, '#2f8a78');
}

/** the gold Egyptian chest: a carved lid, a pointed post at each corner and rows of glyphs */
function goldChest(P, x, y, d, h) {
	const gold = '#c99a4a';
	P.shadow(d * 1.25, d * 0.62);
	const f = isoBox(P, x, y, d, h * 0.72, gold);
	const lidY = y - h * 0.72;
	const lid = isoBox(P, x, lidY + 0.6, d * 1.08, h * 0.28, shade(gold, 0.08), shade(gold, 0.22));
	// rows of carved glyphs: short strokes and dots
	for (const [face, c] of [[f.left, shade(gold, -0.4)], [f.right, shade(gold, -0.6)]]) {
		for (const t of [0.32, 0.62]) {
			for (const s of [0.2, 0.35, 0.5, 0.65, 0.8]) {
				const k = Math.round(s * 20 + t * 10) % 3;
				if (k === 0) P.dot(...facePt(face, s, t), 0.5, c);
				else P.thin([facePt(face, s, t - 0.1), facePt(face, s, t + 0.1)], c, 0.5);
			}
		}
	}
	for (const s of [0.25, 0.5, 0.75]) P.thin([facePt(lid.top, s, 0.3), facePt(lid.top, s, 0.7)], shade(gold, -0.35), 0.5);
	// a post up each visible corner, ending in a rounded point above the lid
	const tip = d * 0.18;
	for (const [cx, cy] of [[x - d * 1.08, lidY], [x, lidY + d * 0.54], [x + d * 1.08, lidY]]) {
		P.line([[cx, cy], [cx, y + (cy - lidY) + 0.4]], shade(gold, -0.05), 1.2);
		P.shape((p) => { p.m(cx - tip, cy); p.q(cx - tip, cy - tip * 1.6, cx, cy - tip * 3); p.q(cx + tip, cy - tip * 1.6, cx + tip, cy); p.q(cx, cy + tip * 0.6, cx - tip, cy); }, shade(gold, 0.12), cx - tip, cx + tip);
	}
	P.gloss(x - d * 0.6, lidY - h * 0.1, d * 0.12, h * 0.08, 0.4);
}

// ---- barrels ----------------------------------------------------------------------------------------------------
/** an upright barrel: base centre (x, y), radius r at the ends, height h; staves and two light hoops */
function barrel(P, x, y, r, h, wood = '#8a6644', hoop = '#d9cdb0') {
	const top = y - h, ry = r * 0.42, bulge = r * 1.14;
	const side = 2 * bulge - r;   // a quadratic through the middle at the bulge
	const width = (t) => r + (bulge - r) * 4 * t * (1 - t);
	P.shape((p) => {
		p.m(x - r, top); p.q(x - side, y - h / 2, x - r, y); p.q(x, y + 2 * ry, x + r, y);
		p.q(x + side, y - h / 2, x + r, top); p.q(x, top + 2 * ry, x - r, top);
	}, wood, x - bulge, x + bulge);
	for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) {
		const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => [x + k * width(t), top + t * h + ry * Math.sqrt(1 - k * k)]);
		P.thin(pts, shade(wood, -0.45), 0.45);
	}
	for (const t of [0.2, 0.8]) P.line(frontArc(x, top + t * h, width(t), ry), hoop, 0.9);
	P.ellipse(x, top, r, ry, shade(wood, 0.2));
	P.ellipse(x, top + 0.3, r * 0.82, ry * 0.78, shade(wood, 0.05), { line: false });
	for (const k of [-0.35, 0, 0.35]) P.thin([[x + k * r * 0.8 - 0.4, top - ry * 0.65], [x + k * r * 0.8 + 0.4, top + ry * 0.65]], shade(wood, -0.3), 0.35);
	P.gloss(x - r * 0.62, top + h * 0.45, r * 0.12, h * 0.16, 0.3);
}

/** a barrel on its side, its end facing the viewer at the right: from (x0, y0) to the end's centre (x1, y1) */
function lyingBarrel(P, x0, y0, x1, y1, r, wood = '#8a6644', hoop = '#d9cdb0') {
	const capRx = r * 0.42, bulge = r * 0.14;
	P.shape((p) => {
		p.m(x0, y0 - r); p.q((x0 + x1) / 2, (y0 + y1) / 2 - r - 2 * bulge, x1, y1 - r);
		p.q(x1 + 2 * capRx, y1, x1, y1 + r);
		p.q((x0 + x1) / 2, (y0 + y1) / 2 + r + 2 * bulge, x0, y0 + r);
		p.q(x0 - 2 * capRx, y0, x0, y0 - r);
	}, wood, x0 - capRx, x1 + capRx);
	for (const k of [-0.6, 0, 0.6]) P.thin([[x0 + capRx * 0.5, y0 + k * r], [(x0 + x1) / 2, (y0 + y1) / 2 + k * (r + bulge)], [x1, y1 + k * r]], shade(wood, -0.45), 0.45);
	for (const t of [0.22, 0.78]) {
		const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, w = r + bulge * 4 * t * (1 - t);
		const arc = Array.from({ length: 11 }, (_, k) => {
			const a = -Math.PI / 2 + (Math.PI * k) / 10;
			return [cx + capRx * Math.cos(a), cy + w * Math.sin(a)];
		});
		P.line(arc, hoop, 0.9);
	}
	P.ellipse(x1, y1, capRx, r, shade(wood, 0.12));
	P.ellipse(x1, y1, capRx * 0.75, r * 0.8, shade(wood, -0.05), { line: false });
	P.gloss(x0 + (x1 - x0) * 0.45, y0 - r * 0.6, r * 0.5, r * 0.1, 0.25);
}

// ---- jars, vases and baskets -------------------------------------------------------------------------------------
/** a pot's half width at height h above its base, along its profile [[height, half width], ...] (bottom up) */
function widthAt(profile, h) {
	for (let k = 1; k < profile.length; k++) {
		const [h0, w0] = profile[k - 1], [h1, w1] = profile[k];
		if (h <= h1) return w0 + (w1 - w0) * ((h - h0) / (h1 - h0 || 1));
	}
	return profile[profile.length - 1][1];
}

/** a round pot's body along its profile, standing at (x, y); returns its height */
function potBody(P, x, y, profile, color) {
	const right = profile.map(([h, w]) => [x + w, y - h]);
	const left = profile.slice().reverse().map(([h, w]) => [x - w, y - h]);
	const pts = [...right, ...left];
	const w0 = profile[0][1];
	const xs = pts.map((q) => q[0]);
	P.shape((p) => {
		p.m(...pts[0]);
		for (let k = 1; k < pts.length - 1; k++) {
			const [mx, my] = lerp(pts[k], pts[k + 1], 0.5);
			if (k === right.length - 1) p.l(...pts[k + 1]);   // straight across the mouth
			else p.q(...pts[k], mx, my);
		}
		p.l(...pts[pts.length - 1]);
		p.q(x, y + w0 * 0.7, ...pts[0]);
	}, color, Math.min(...xs), Math.max(...xs));
	return profile[profile.length - 1][0];
}

/** a band around a pot at height h: a front arc as wide as the pot there */
function potBand(P, x, y, profile, h, color, width) {
	const w = widthAt(profile, h) - width * 0.25;
	P.thin(frontArc(x, y - h, w, w * 0.32), color, width);
}

/** the open mouth at the top of a pot: a rim and its dark inside */
function potMouth(P, x, y, w, color) {
	P.ellipse(x, y, w, w * 0.38, shade(color, 0.15));
	P.ellipse(x, y + 0.15, w * 0.72, w * 0.26, shade(color, -0.6), { line: false });
}

/** a flat lid with radial lines (the game's woven covers) */
function potLid(P, x, y, w, color) {
	P.ellipse(x, y, w, w * 0.38, color);
	for (let k = 0; k < 6; k++) {
		const a = (Math.PI * k) / 6;
		P.thin([[x - Math.cos(a) * w * 0.8, y - Math.sin(a) * w * 0.3], [x + Math.cos(a) * w * 0.8, y + Math.sin(a) * w * 0.3]], shade(color, -0.3), 0.35);
	}
}

/** two loop handles from the neck to the shoulder */
function handles(P, x, y, profile, hNeck, hShoulder, color) {
	for (const s of [-1, 1]) {
		const wn = widthAt(profile, hNeck), ws = widthAt(profile, hShoulder);
		P.line([[x + s * wn, y - hNeck], [x + s * (ws + 0.9), y - hNeck - 0.4], [x + s * (ws + 0.2), y - hShoulder]], color, 0.8);
	}
}

/** an iron stand: a ring under the belly and three curled legs */
function stand(P, x, y, w, h, color = '#4a3e36') {
	for (const s of [-1, 0, 1]) {
		const fx = x + s * w, fy = y + (s === 0 ? 1.2 : 0);
		P.line([[x + s * w * 0.75, y - h], [fx, fy - 0.6], [fx + s * 1.2, fy]], color, 0.7);
	}
	P.line(frontArc(x, y - h, w * 0.8, w * 0.28), color, 0.7);
}

/** coiled weave: close horizontal arcs from bottom to top */
function coils(P, x, y, profile, top, color, step = 1.3) {
	for (let h = step * 0.6; h < top - 0.4; h += step) {
		const w = widthAt(profile, h) - 0.2;
		P.thin(frontArc(x, y - h, w, w * 0.32, 10), color, 0.4);
	}
}

const TERRACOTTA = '#c47a5a';

/** the big clay vase (object 26), also in the dungeon's jar group */
function clayVase(P, x, y, s = 1) {
	const prof = [[0, 4.2], [4, 6.8], [10, 8], [15, 7], [19, 4.6], [21, 4.2]].map(([h, w]) => [h * s, w * s]);
	const top = potBody(P, x, y, prof, TERRACOTTA);
	for (const h of [7, 13, 17]) potBand(P, x, y, prof, h * s, shade(TERRACOTTA, -0.25), 0.35);
	potLid(P, x, y - top, 4.4 * s, '#9a5a4a');
	P.gloss(x - 4.6 * s, y - 12 * s, 0.9 * s, 3 * s, 0.3);
}

/** a blue and white striped headcloth framing a canopic jar's head, which sits on the jar's top at y */
function nemes(P, x, y) {
	P.shape((p) => { p.m(x - 4.4, y + 0.4); p.q(x - 5, y - 6.6, x, y - 6.8); p.q(x + 5, y - 6.6, x + 4.4, y + 0.4); p.l(x - 4.4, y + 0.4); }, '#3a5aa8', x - 5, x + 5);
	for (const k of [-3.2, -1.6, 1.6, 3.2]) P.thin([[x + k * 0.8, y - 6.2], [x + k * 1.25, y + 0.2]], '#eef0f8', 0.5);
}

// ---- chests -----------------------------------------------------------------------------------------------------
/** a floor point from the base centre (x, y): a along the run down to the right, b down to the left, z up */
const isoAt = (x, y, a, b, z = 0) => [x + a - b, y + (a + b) / 2 - z];

/**
 * a chest as the game shows it: the lid's rounded end to the left, the long side with the lock facing down to the
 * right; metal bands over the lid and down the front. The wooden chest (a container) and the purple and golden
 * treasure chests share it in their own wood and metal.
 */
function chest(P, x, y, wood = '#946238', iron = '#7c7a76', plate = '#c0bcb2') {
	const a = 6, b = 9.5, h = 8, r = 5.2;   // a: half depth (down to the right), b: half length (down to the left)
	P.shadow(15, 7);
	const C = (s, t, z) => isoAt(x, y, s * a, t * b, z);
	const end = [C(-1, 1, h), C(1, 1, h), C(1, 1, 0), C(-1, 1, 0)];     // faces down to the left (lit)
	const front = [C(1, 1, h), C(1, -1, h), C(1, -1, 0), C(1, 1, 0)];   // faces down to the right
	P.poly(end, shade(wood, 0.04), { flat: true });
	P.poly(front, shade(wood, -0.14), { flat: true });
	for (const t of [0.4, 0.72]) P.thin([facePt(end, 0, t), facePt(end, 1, t)], shade(wood, -0.4), 0.35);
	for (const t of [0.36, 0.68]) P.thin([facePt(front, 0, t), facePt(front, 1, t)], shade(wood, -0.45), 0.4);
	// the half-round lid, running the chest's length and arching from the front (θ 0) over to the back (θ π);
	// strips from the back so the nearer ones cover the far side
	const arch = (t, th) => isoAt(x, y, a * Math.cos(th), t * b, h + r * Math.sin(th));
	const n = 12;
	for (let k = n; k > 0; k--) {
		const t0 = (Math.PI * (k - 1)) / n, t1 = Math.min(Math.PI, (Math.PI * k) / n + 0.03);
		const mid = (t0 + t1) / 2;
		const c = shade(wood, Math.max(-0.3, -0.1 * Math.cos(mid) + 0.24 * Math.sin(mid) - 0.06));
		P.poly([arch(-1, t1), arch(1, t1), arch(1, t0), arch(-1, t0)], c, { flat: true, line: false });
	}
	const steps = (t, from, to) => Array.from({ length: 13 }, (_, k) => arch(t, from + ((to - from) * k) / 12));
	const seen = Math.atan(r / a) + Math.PI / 2;
	// the lid's rounded end, toward the viewer at the left
	P.poly(steps(1, 0, Math.PI), shade(wood, 0.1), { flat: true });
	P.thin([...steps(-1, 0, seen), arch(1, seen)], shade(wood, -0.55), 0.9);
	P.thin([arch(-1, 0), arch(1, 0)], shade(wood, -0.55), 0.9);
	// iron bands: over the lid and down the front, and round the near end
	for (const t of [-0.72, 0.72]) {
		P.line(steps(t, 0, seen), iron, 0.8);
		P.line([C(1, t, h), C(1, t, 0)], iron, 0.8);
	}
	P.line(steps(0.97, 0, Math.PI), iron, 0.6);
	P.line([front[0], front[3]], iron, 0.6);
	// the lock plate, in the middle of the front
	const [lx, ly] = facePt(front, 0.5, 0.18);
	P.poly([[lx - 1.7, ly - 0.6], [lx + 1.7, ly - 2.2], [lx + 1.7, ly + 1.6], [lx - 1.7, ly + 3.2]], plate);
	P.dot(lx, ly + 0.5, 0.55, '#2a2420');
	P.gloss(x - b * 0.45, y - h - r * 0.55, 2, 0.7, 0.35);
}

/**
 * the black sarcophagus, as the game shows it: a black stone chest with gold bands and glyphs, its long side facing
 * down to the right like the chests'; on it a mummy-shaped coffin lid with a gold striped headdress, its head at the
 * far right end
 */
function sarcophagus(P, x, y) {
	const stone = '#2c2b33', gold = '#d9ae4a', a = 5.2, b = 10.5, h = 6.5;   // a: half depth, b: half length
	P.shadow(15, 7);
	const C = (s, t, z) => isoAt(x, y, s * a, t * b, z);
	const end = [C(-1, 1, h), C(1, 1, h), C(1, 1, 0), C(-1, 1, 0)];
	const front = [C(1, 1, h), C(1, -1, h), C(1, -1, 0), C(1, 1, 0)];
	P.poly(end, shade(stone, 0.1), { flat: true });
	P.poly(front, shade(stone, -0.04), { flat: true });
	P.poly([C(-1, -1, h), C(1, -1, h), C(1, 1, h), C(-1, 1, h)], shade(stone, 0.18), { flat: true });
	// gold bands along the top and the foot of the base, and glyphs on the front: an ankh between rows of marks
	for (const f of [front, end]) {
		P.line([facePt(f, 0, 0.14), facePt(f, 1, 0.14)], gold, 0.5);
		P.line([facePt(f, 0, 0.92), facePt(f, 1, 0.92)], gold, 0.4);
	}
	for (const k of [0.1, 0.19, 0.28, 0.37, 0.63, 0.72, 0.81, 0.9]) {
		const [gx, gy] = facePt(front, k, 0.52);
		P.line([[gx, gy - 0.9], [gx - 0.4, gy + 0.9]], gold, 0.35);
	}
	const [ax, ay] = facePt(front, 0.5, 0.55);
	P.thin([[ax, ay - 0.6], [ax, ay + 2.2]], gold, 0.5);
	P.thin([[ax - 1, ay + 0.5], [ax + 1, ay - 0.1]], gold, 0.5);
	P.thin(frontArc(ax, ay - 1.3, 0.75, 0.9, 8).concat(frontArc(ax, ay - 1.3, 0.75, -0.9, 8).reverse()), gold, 0.4);
	// the coffin lid, lying flat on the base: a wrapped body's outline, foot (l < 0, the near end) to head (l > 0, the
	// far end), w across, with a thickness
	const body = [[-8.6, 1.6], [-6.5, 2.2], [-2.5, 2.6], [0.5, 3.1], [3.6, 3.6], [5, 3.1], [5.6, 3.4], [7.6, 3.6], [9.2, 2.6], [9.6, 0]];
	const ring = [...body, ...body.slice(0, -1).reverse().map(([l, w]) => [l, -w])];
	const lid = h + 0.5, top = h + 3.2;
	const at = (l, w, dz = 0) => isoAt(x, y, w, -l, top + dz);
	P.poly(ring.map(([l, w]) => isoAt(x, y, w, -l, lid)), shade(stone, -0.2), { flat: true });
	P.poly(ring.map(([l, w]) => at(l, w)), shade(stone, 0.1), { flat: true });
	// the headdress, gold with blue stripes, and the gold face
	const nemes = ring.filter(([l]) => l >= 5);
	P.poly(nemes.map(([l, w]) => at(l, w, 0.6)), gold, { flat: true });
	for (const w of [-2.4, -1.2, 1.2, 2.4]) P.thin([at(5.6, w, 0.6), at(8.6, w * 0.9, 0.6)], '#24305a', 0.35);
	P.ellipse(...at(7.1, 0, 1.1), 1.7, 1.1, shade(gold, 0.15));
	P.dot(...at(6.7, -0.6, 1.3), 0.25, '#1e1a16'); P.dot(...at(6.7, 0.6, 1.3), 0.25, '#1e1a16');
	// a gold collar, crossed arms and a column of glyphs down the body
	P.line([at(4.4, -3.2), at(4.4, 3.2)], gold, 0.7);
	P.line([at(2.2, -2.9), at(3.6, 2.9)], gold, 0.5);
	P.line([at(2.2, 2.9), at(3.6, -2.9)], gold, 0.5);
	for (let l = -7.6; l < 1.2; l += 1.4) P.line([at(l, -0.5), at(l + 0.7, 0.4)], gold, 0.3);
	P.gloss(...at(-3, -1.6), 2, 0.6, 0.3);
}

// ---- plants, mushrooms and crystals -----------------------------------------------------------------------------
/** a point s along a direction tilted `a` from straight up, t across it (to the right of it) */
const along = (x, y, a) => (s, t = 0) => [x + s * Math.sin(a) + t * Math.cos(a), y - s * Math.cos(a) + t * Math.sin(a)];

/** a pointed leaf from (x, y), tilted `a` from upright, `len` long and `w` wide, with a midrib */
function leaf(P, x, y, a, len, w, color) {
	const f = along(x, y, a);
	const pts = [f(0), f(len * 0.45, w), f(len), f(len * 0.45, -w)];
	const xs = pts.map((q) => q[0]);
	P.shape((p) => { p.m(...f(0)); p.q(...f(len * 0.3, w * 1.3), ...f(len)); p.q(...f(len * 0.3, -w * 1.3), ...f(0)); }, color, Math.min(...xs), Math.max(...xs));
	P.thin([f(len * 0.1), f(len * 0.8)], shade(color, -0.35), 0.35);
}

/** points along a quadratic curve from p0 to p1, pulled toward c */
function curve(p0, c, p1, n = 8) {
	return Array.from({ length: n + 1 }, (_, k) => {
		const t = k / n, a = (1 - t) ** 2, b = 2 * t * (1 - t), d = t * t;
		return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
	});
}

/** a curving stem from (x0, y0) to (x1, y1), bowed sideways by `bow` */
function stem(P, x0, y0, x1, y1, bow, color, width = 0.9) {
	P.line(curve([x0, y0], [(x0 + x1) / 2 + bow, (y0 + y1) / 2], [x1, y1]), color, width);
}

/** a marigold head seen from the front: a ring of orange petals round a dark middle */
function marigold(P, x, y, r) {
	const petal = '#f69a28';
	const n = 11, at = (a, k) => [x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.92];
	P.shape((p) => {
		p.m(...at(-Math.PI / n, 0.68));
		for (let k = 0; k < n; k++) {
			const a = (Math.PI * 2 * k) / n;
			p.q(...at(a, 1.2), ...at(a + Math.PI / n, 0.68));
		}
	}, petal, x - r, x + r);
	for (let k = 0; k < 11; k++) {
		const a = (Math.PI * 2 * (k + 0.5)) / 11;
		P.thin([[x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.42], [x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.66]], shade(petal, -0.25), 0.3);
	}
	P.circle(x, y, r * 0.42, '#c8541a');
	P.dot(x - r * 0.08, y - r * 0.05, r * 0.24, '#6a2a10');
}

/** a woodland strawberry hanging from (x, y): a pointed red berry with seeds and a green cap */
function strawberry(P, x, y, s = 1) {
	const red = '#d8343a';
	P.shape((p) => { p.m(x - 2.4 * s, y); p.q(x - 2.9 * s, y + 3.4 * s, x, y + 5.4 * s); p.q(x + 2.9 * s, y + 3.4 * s, x + 2.4 * s, y); p.q(x, y - 1 * s, x - 2.4 * s, y); }, red, x - 2.9 * s, x + 2.9 * s);
	for (const [dx, dy] of [[-1.3, 1.2], [0.2, 1.6], [1.4, 1], [-0.7, 2.9], [0.9, 2.8], [0, 4.1]]) P.dot(x + dx * s, y + dy * s, 0.28 * s, '#f6e070');
	for (const a of [-0.9, -0.3, 0.3, 0.9]) leaf(P, x, y - 0.2 * s, Math.PI / 2 * a + Math.PI, 2.1 * s, 0.6 * s, '#4a9a3a');
	P.gloss(x - 1.2 * s, y + 1.4 * s, 0.5 * s, 1 * s, 0.4);
}

/** a mushroom: a stem from (x, y) up `h`, under a cap `w` wide and `capH` tall; returns nothing */
function mushroom(P, x, y, h, stemW, w, capH, cap, stalk) {
	P.shape((p) => { p.m(x - stemW, y); p.q(x - stemW * 0.8, y - h * 0.6, x - stemW * 0.75, y - h); p.l(x + stemW * 0.75, y - h); p.q(x + stemW * 0.8, y - h * 0.6, x + stemW, y); p.q(x, y + stemW * 0.5, x - stemW, y); }, stalk, x - stemW, x + stemW);
	const top = y - h;
	P.ellipse(x, top + 0.2, w * 0.92, capH * 0.28, shade(cap, 0.35));
	P.shape((p) => { p.m(x - w, top); p.b(x - w, top - capH * 1.25, x + w, top - capH * 1.25, x + w, top); p.q(x, top + capH * 0.35, x - w, top); }, cap, x - w, x + w);
	P.gloss(x - w * 0.45, top - capH * 0.6, w * 0.2, capH * 0.14, 0.45);
}

/** a chanterelle: a thin curved stalk under a funnel cap seen a little from above */
function chanterelle(P, x, y, h, lean, w) {
	const cap = '#e2b44a', stalk = '#f0dfa4';
	const tx = x + lean, ty = y - h;
	stem(P, x, y, tx, ty + 3, lean * 0.3, stalk, 2);
	P.shape((p) => { p.m(tx - w, ty - 0.8); p.q(tx - w * 0.4, ty + 0.6, tx - 0.9, ty + 3.6); p.l(tx + 0.9, ty + 3.6); p.q(tx + w * 0.4, ty + 0.6, tx + w, ty - 0.8); p.q(tx, ty + 0.8, tx - w, ty - 0.8); }, shade(cap, -0.1), tx - w, tx + w);
	P.shape((p) => { p.m(tx - w, ty - 0.8); p.q(tx - w * 0.6, ty - w * 0.6, tx - w * 0.2, ty - w * 0.5); p.q(tx + w * 0.1, ty - w * 0.62, tx + w * 0.5, ty - w * 0.5); p.q(tx + w * 1.05, ty - w * 0.45, tx + w, ty - 0.8); p.q(tx, ty + 0.9, tx - w, ty - 0.8); }, cap, tx - w, tx + w);
	P.ellipse(tx + 0.2, ty - w * 0.3, w * 0.5, w * 0.17, shade(cap, -0.18), { line: false, flat: true });
	P.gloss(tx - w * 0.55, ty - w * 0.35, w * 0.22, w * 0.1, 0.5);
}

/** a crystal: a six-sided prism from base (x, y), tilted `a` from upright, `len` long and `w` wide, with a point */
function crystal(P, x, y, a, len, w, color) {
	const f = along(x, y, a);
	const shoulder = len - w * 1.4;
	const tip = f(len), sl = f(shoulder, -w), sr = f(shoulder, w), sm = f(shoulder + w * 0.35, w * 0.2);
	const bl = f(0, -w), br = f(0, w), bm = f(0, w * 0.2);
	P.poly([bl, sl, tip, sm, bm], shade(color, 0.3), { flat: true, line: false });
	P.poly([bm, sm, tip, sr, br], shade(color, -0.22), { flat: true, line: false });
	P.thin([bl, sl, tip, sr, br], shade(color, -0.55), 0.8);
	P.thin([bm, sm, tip], shade(color, 0.55), 0.4);
	P.thin([f(len * 0.15, -w * 0.55), f(shoulder * 0.9, -w * 0.55)], 'rgba(255,255,255,0.75)', 0.45);
}

/** a cluster of crystals in one colour on a coloured glow (the crystal rocks, objects 66 to 70) */
function crystalRock(P, color) {
	P.ellipse(0, 1, 15, 6.5, color, { flat: true, line: false, alpha: 0.35 });
	P.shadow(11, 4.5, 1, 0.22);
	// back row, then the middle, then the small ones at the front
	for (const [x, y, a, len, w] of [[-5, -1, -0.55, 14, 2.4], [5, -1.5, 0.5, 15, 2.4], [-1.5, -2, -0.15, 18, 2.8], [3, -2.5, 0.12, 21, 2.9]]) crystal(P, x, y, a, len, w, color);
	for (const [x, y, a, len, w] of [[-8.5, 1.5, -1.05, 10, 2], [8.5, 1, 1.0, 11, 2], [-3, 1, -0.4, 12, 2.3], [2.5, 1.5, 0.35, 11, 2.2], [-0.5, 2.6, -0.08, 9, 2.4]]) crystal(P, x, y, a, len, w, color);
	for (const [x, y, a, len, w] of [[-5.5, 3.5, -0.8, 6, 1.6], [0, 3.6, 0.05, 7, 1.8], [5.5, 3.4, 0.9, 6, 1.6]]) crystal(P, x, y, a, len, w, color);
	P.glow(0, -8, 10, color, 0.18);
}

/** a spoked wheel seen at an angle: centre (x, y), radius r */
function wheel(P, x, y, r, color) {
	const rx = r * 0.62;
	const at = (a, k = 1) => [x + rx * k * Math.cos(a), y + r * k * Math.sin(a)];
	for (let k = 0; k < 6; k++) {
		const a = (Math.PI * k) / 3 + 0.3;
		P.line([at(a, 0.15), at(a, 0.88)], shade(color, 0.15), 0.6);
	}
	P.line(Array.from({ length: 25 }, (_, k) => at((Math.PI * 2 * k) / 24)), color, 1.3);
	P.ellipse(x, y, 1.2, 1.6, '#d9a84a');
}

const CRYSTAL = { 66: '#e8b42a', 67: '#d8323a', 68: '#34a84a', 69: '#3a86e0', 70: '#8a46d8' };

// ---- the drawings, by object id ----------------------------------------------------------------------------------
const DRAW = {
	// Big barrel
	3(P) {
		P.shadow(11, 5);
		barrel(P, 0, 1, 8.6, 19);
	},
	// Big crate
	4(P) {
		P.shadow(14, 6.5);
		woodCrate(P, 0, 2, 12, 15);
	},
	// Three barrels: two upright, one lying at the front
	12(P) {
		P.shadow(17, 7.5);
		barrel(P, -6.5, -2.5, 6.4, 14);
		barrel(P, 6.5, -4.5, 6.4, 14);
		lyingBarrel(P, -5, 3, 8.5, 4.6, 5.2);
	},
	// Stacked wooden crates: two on the floor, one on top
	13(P) {
		P.shadow(17, 7.5);
		woodCrate(P, 6.5, -1.5, 8.5, 11);
		woodCrate(P, -6.5, 2.5, 8.5, 11);
		woodCrate(P, 0.5, -9.5, 8.5, 11);
	},
	// Group of pottery jars: a pale amphora, the big clay vase, a small pot with a cloth cover on a stand
	20(P) {
		P.shadow(16, 7);
		const pale = '#d8cdb0';
		const amph = [[0, 2.2], [3, 4.4], [9, 4.6], [14, 3], [17, 1.5], [21, 1.6]];
		const ax = -8.5, ay = -2;
		potBody(P, ax, ay, amph, pale);
		handles(P, ax, ay, amph, 19.5, 15.5, shade(pale, -0.1));
		potMouth(P, ax, ay - 21, 1.9, pale);
		for (const [dx, dy] of [[-1.5, -11], [1, -9], [0, -7]]) P.dot(ax + dx, ay + dy, 0.45, shade(pale, -0.4));
		clayVase(P, 3.5, -3.5, 0.95);
		stand(P, -1.5, 6, 4.2, 3.4);
		const pot = [[0, 3], [2.5, 4.8], [5, 4.6], [7, 3.6]];
		potBody(P, -1.5, 4.2, pot, '#b8684a');
		P.shape((p) => { p.m(-5.4, -1.6); p.q(-1.5, -6.6, 2.4, -1.6); p.q(1.6, 0.4, 2.8, 1); p.q(-1.5, 0.6, -5.8, 1); p.q(-4.6, 0.2, -5.4, -1.6); }, '#cbb98e', -5.8, 2.8);
		for (const k of [-2.5, -0.5, 1.5]) P.thin([[-1.5 + k, -3.6], [-1.5 + k * 1.3, 0.2]], shade('#cbb98e', -0.3), 0.35);
	},
	// Big vase
	26(P) {
		P.shadow(10, 4.5);
		clayVase(P, 0, 1, 1);
	},
	// Egyptian basket: coiled, round, with a domed lid
	104(P) {
		P.shadow(11, 5);
		const straw = '#c99a52';
		const prof = [[0, 6.6], [4, 8.6], [10, 8.8], [14, 7.6], [16.5, 5], [17.5, 2], [17.8, 0.1]];
		const top = potBody(P, 0, 1, prof, straw);
		coils(P, 0, 1, prof, top, shade(straw, -0.45), 1.15);
		P.gloss(-5, -9, 1, 3, 0.3);
	},
	// Egyptian crate: a gold chest with corner posts
	105(P) {
		goldChest(P, 0, 2, 11, 15);
	},
	// Egyptian vase: painted with a blue band and orange zigzags, on a gold stand
	106(P) {
		P.shadow(9, 4.2);
		const clay = '#e09a6a', gold = '#c99a4a';
		for (const s of [-1, 1]) P.line([[s * 3.6, -5], [s * 5.6, -1], [s * 7, 0.6]], gold, 1.1);
		P.line([[0, -4], [0, 2]], gold, 1.1);
		P.line(frontArc(0, -5, 4.6, 1.6), gold, 1.1);
		const prof = [[0, 2.6], [3, 5.6], [8, 7], [13, 6.6], [17, 4.4], [19, 3.2], [20.5, 3.6]];
		const y = -2.6;
		const top = potBody(P, 0, y, prof, clay);
		potBand(P, 0, y, prof, 10, '#7aa8c8', 1.6);
		potBand(P, 0, y, prof, 5.8, '#7aa8c8', 0.7);
		potBand(P, 0, y, prof, 14.2, '#7aa8c8', 0.7);
		for (const [h0, amp] of [[12, 1.8], [7, -1.6]]) {
			const zig = Array.from({ length: 9 }, (_, k) => {
				const a = Math.PI - (Math.PI * k) / 8, w = widthAt(prof, h0) - 0.4;
				return [w * Math.cos(a), y - h0 + w * 0.32 * Math.sin(a) - (k % 2 ? amp : 0)];
			});
			P.thin(zig, '#d0582a', 0.6);
		}
		potMouth(P, 0, y - top, 3.6, clay);
		P.gloss(-4.4, y - 11, 0.9, 2.6, 0.3);
	},
	// Group of woven baskets: a tall beehive basket and two small lidded ones
	107(P) {
		P.shadow(16, 7);
		const straw = '#c99a52', line = shade(straw, -0.45);
		const hive = [[0, 7], [5, 8.4], [11, 7.8], [16, 5.8], [20, 3], [22, 0.1]];
		coils(P, -3, -2, hive, potBody(P, -3, -2, hive, straw), line, 1.2);
		P.gloss(-7.5, -12, 0.9, 2.6, 0.3);
		const small = [[0, 4], [3, 4.8], [7, 4.8], [8.4, 4.2]];
		for (const [x, y, c] of [[7.5, 1, shade(straw, 0.06)], [-3, 5.5, shade(straw, -0.04)]]) {
			const top = potBody(P, x, y, small, c);
			for (let h = 0.8; h < top; h += 1.1) P.thin(frontArc(x, y - h, widthAt(small, h) - 0.2, 1.4, 8), shade(c, -0.4), 0.35);
			P.shape((p) => { p.m(x - 4.6, y - top); p.q(x, y - top - 4.4, x + 4.6, y - top); p.q(x, y - top + 1.6, x - 4.6, y - top); }, shade(c, 0.12), x - 4.6, x + 4.6);
			P.dot(x, y - top - 2.4, 0.8, shade(c, -0.25));
		}
	},
	// Stacked crates (the tombs'): dark crates framed in light wood with teal lotus fans
	108(P) {
		P.shadow(17, 7.5);
		tombCrate(P, 6.5, -1.5, 8.5, 11);
		tombCrate(P, -6.5, 2.5, 8.5, 11);
		tombCrate(P, 0.5, -9.5, 8.5, 11);
	},
	// Group of pottery jars (the tombs'): an ochre amphora, a blue jar with a gold band, a small jar with a teal collar
	109(P) {
		P.shadow(16, 7);
		const ochre = '#d49a52', blue = '#4a6aa8', teal = '#46b4a4';
		const amph = [[0, 2.2], [3, 4.4], [9, 4.6], [14, 3], [17, 1.5], [21, 1.6]];
		const ax = -8.5, ay = -2;
		potBody(P, ax, ay, amph, ochre);
		potBand(P, ax, ay, amph, 13, teal, 1.4);
		handles(P, ax, ay, amph, 19.5, 15.5, shade(ochre, -0.1));
		potMouth(P, ax, ay - 21, 1.9, ochre);
		const jar = [[0, 4], [4, 6.8], [10, 7.8], [15, 6.6], [18, 4.4], [19.5, 4.4]];
		const top = potBody(P, 3.5, -3.5, jar, blue);
		potBand(P, 3.5, -3.5, jar, 11.5, '#d9b44a', 1.8);
		potBand(P, 3.5, -3.5, jar, 7, '#d9b44a', 0.5);
		potMouth(P, 3.5, -3.5 - top, 4.2, blue);
		P.gloss(-0.5, -14, 0.9, 2.6, 0.3);
		stand(P, -1.5, 6, 4.2, 3.4);
		const pot = [[0, 3], [2.5, 4.8], [5, 4.8], [7, 3.6], [8, 3.4]];
		const pt = potBody(P, -1.5, 4.2, pot, '#c87850');
		potBand(P, -1.5, 4.2, pot, 6, teal, 1.4);
		for (const k of [-3, -1, 1, 3]) P.dot(-1.5 + k, 4.2 - 4.6 + Math.abs(k) * -0.15, 0.55, teal);
		potMouth(P, -1.5, 4.2 - pt, 3.3, '#c87850');
	},
	// Canopic jars: four cream jars with lids for heads: a jackal at the back, then a baboon, a falcon and a man, each
	// in a blue and white striped headcloth
	121(P) {
		P.shadow(17, 7.5);
		const cream = '#e8dcc4';
		const prof = [[0, 3.2], [2, 4.6], [6, 4.8], [8.5, 4.2]];
		const jar = (x, y) => { const top = potBody(P, x, y, prof, cream); potBand(P, x, y, prof, 2.6, '#b0703a', 0.4); return y - top; };
		// the jackal (Duamutef)
		let t = jar(0, -6);
		P.ellipse(0, t - 3, 4, 3.6, '#2e2a2a');
		for (const s of [-1, 1]) P.poly([[s * 1.2, t - 5.4], [s * 3, t - 11.6], [s * 3.8, t - 4.6]], '#2e2a2a');
		P.ellipse(0, t - 1.6, 1.8, 2, '#3a3434');
		for (const s of [-1, 1]) P.dot(s * 1.5, t - 3.8, 0.5, '#e0b040');
		// the baboon (Hapi), the falcon (Qebehsenuef) and the man (Imsety)
		t = jar(-8, -1.5);
		nemes(P, -8, t);
		P.ellipse(-8, t - 3, 2.6, 2.6, '#8a6048');
		P.ellipse(-8, t - 2, 1.8, 1.4, '#c89a7a');
		for (const s of [-1, 1]) P.dot(-8 + s * 0.9, t - 3.4, 0.4, '#2a1a10');
		t = jar(8, -1.5);
		nemes(P, 8, t);
		P.ellipse(8, t - 3, 2.6, 2.6, '#8a7a96');
		P.poly([[6.6, t - 3], [4.8, t - 1.2], [7.2, t - 1.4]], '#e0b040');
		P.dot(7.4, t - 3.6, 0.55, '#1a1a1a');
		t = jar(0, 4.5);
		nemes(P, 0, t);
		P.ellipse(0, t - 2.8, 2.4, 2.7, '#c8946a');
		for (const s of [-1, 1]) P.dot(s * 0.9, t - 3.2, 0.4, '#2a1a10');
		P.thin([[-0.6, t - 1.6], [0.6, t - 1.6]], '#7a3a2a', 0.35);
	},

	// ---- containers: each shows what you find in it ----
	// Wooden chest
	2(P) {
		chest(P, 0, 1);
	},

	// ---- treasure chests ----
	// Purple chest: purple wood with gold bands and lock
	21(P) { chest(P, 0, 1, '#6a4a9a', '#d4a640', '#e8c35a'); },
	// Golden chest: red-brown wood with gold bands and lock
	37(P) { chest(P, 0, 1, '#b25a2c', '#d4a640', '#e8c35a'); },
	// Black sarcophagus
	94(P) { sarcophagus(P, 0, 1); },
	// Drum: a short red barrel drum lying on top of a tall dark wooden stand, its pale skin facing down to the right
	7(P) {
		P.shadow(12, 6);
		const wood = '#4e3424', top = 9.5, r = 5.6;
		// the stand: four splayed legs, rails round the top and stretchers lower down
		const at = (s, t, z) => isoAt(0, 0, s * 5, t * 2.8, z);
		const foot = (s, t) => isoAt(0, 0, s * 5.6, t * 4, 0);
		const leg = (s, t) => P.line([foot(s, t), at(s, t, top)], s + t > 0 ? wood : shade(wood, -0.15), 1.5);
		const rail = (p, q, z, w = 1.2) => P.line([at(...p, z), at(...q, z)], shade(wood, 0.1), w);
		leg(-1, -1); leg(1, -1); leg(-1, 1);
		rail([-1, -1], [1, -1], top); rail([-1, -1], [-1, 1], top);
		rail([-1, -1], [1, -1], 3.5, 0.9); rail([-1, -1], [-1, 1], 3.5, 0.9);
		rail([-1, 1], [1, 1], 3.5, 0.9); rail([1, -1], [1, 1], 3.5, 0.9);
		leg(1, 1);
		rail([-1, 1], [1, 1], top); rail([1, -1], [1, 1], top);
		// the drum, a short cylinder from back left to the skin at front right
		const z = top + r * 0.8, red = '#a51f2a', skin = '#e4cba0', rx = r * 0.68;
		const [x0, y0] = isoAt(0, 0, -5.4, 0, z), [x1, y1] = isoAt(0, 0, 4.6, 0, z);
		const [mx, my] = lerp([x0, y0], [x1, y1], 0.5);
		P.shape((p) => {
			p.m(x0, y0 - r); p.q(mx, my - r - 0.8, x1, y1 - r); p.l(x1, y1 + r);
			p.q(mx, my + r + 0.8, x0, y0 + r); p.q(x0 - 2 * rx, y0, x0, y0 - r);
		}, red, x0 - rx, x1);
		// the studs round the back rim, and a gold crest on the side
		for (let k = 1; k < 8; k++) {
			const t = -Math.PI / 2 + (Math.PI * k) / 8;
			P.dot(x0 + 1.3 - rx * 0.92 * Math.cos(t), y0 + r * 0.9 * Math.sin(t), 0.35, '#3a2a1c');
		}
		P.poly([[mx - 0.6, my - 1.8], [mx + 0.6, my - 0.2], [mx - 0.6, my + 1.4], [mx - 1.8, my - 0.2]], '#e8c35a');
		P.gloss(mx - 1.5, my - r * 0.62, 3.2, 0.7, 0.3);
		// the skin, and the ring of studs that holds it
		P.ellipse(x1, y1, rx, r, skin);
		P.ellipse(x1 + 0.3, y1 + 0.3, rx * 0.74, r * 0.76, shade(skin, 0.1), { line: false });
		for (let k = 0; k < 16; k++) {
			const t = (Math.PI * 2 * k) / 16;
			P.dot(x1 + rx * 0.88 * Math.cos(t), y1 + r * 0.9 * Math.sin(t), 0.38, '#3a2a1c');
		}
	},
	// Soy sauce: a wooden tub tied with rope, a peg on the lid and a paper label
	34(P) {
		P.shadow(12, 5.5);
		const wood = '#c8985e', rope = '#dcc48a';
		barrel(P, 0, 1, 9.4, 14, wood, rope);
		const top = 1 - 14;
		for (const s of [-1, 1]) P.line([[s * 6.6, top + 2.4], [s * 7.4, -6], [s * 6.8, 3.6]], rope, 0.9);
		P.line([[-9.2, top + 0.2], [0, top - 2.4], [9.2, top + 0.2]], rope, 0.8);
		P.line([[0, top + 3.6], [0, top - 2.4]], rope, 0.8);
		P.line([[0, top + 0.6], [0, top - 4.6]], shade(wood, -0.1), 1.6);
		P.poly([[1.8, -9.6], [5.4, -9.2], [5.2, -2.6], [1.8, -3]], '#f2ead2');
		for (const [y, w] of [[-8.2, 2], [-6.9, 1.4], [-5.6, 2.2], [-4.3, 1.2]]) P.thin([[3.5 - w / 2, y], [3.5 + w / 2, y + 0.1]], '#3a2a20', 0.45);
	},
	// Mushrooms: three yellow chanterelles
	41(P) {
		P.shadow(11, 4.5);
		chanterelle(P, 0.5, -1, 13, 0.6, 4.6);
		chanterelle(P, -5, 2.2, 8.5, -2.2, 3.9);
		chanterelle(P, 5.5, 2.4, 9, 2, 4.1);
	},
	// Porcini mushroom: one fat white stalk under a brown cap
	42(P) {
		P.shadow(10, 4.5);
		mushroom(P, 0, 1, 9, 5.2, 9.6, 9, '#8a5a32', '#ece6dc');
		for (const k of [-2.6, -0.8, 1, 2.8]) P.thin([[k, -1], [k * 0.85, -6.4]], 'rgba(120,110,100,0.45)', 0.35);
	},
	// Woodland strawberry: a leafy plant with three red berries
	43(P) {
		P.shadow(12, 5);
		const leafy = '#3e8a34', green = '#4a8e36';
		for (const a of [-1.25, 1.2, -0.45]) leaf(P, 0, 1, a, 9, 2.8, shade(leafy, -0.1));
		stem(P, 0, 0, -6.5, -13, -1.5, green);
		stem(P, 0, 0, 5, -16, 2.5, green);
		stem(P, 0, 0, 7.5, -7, 4, green);
		strawberry(P, -6.5, -13, 1.05);
		strawberry(P, 5, -16, 1);
		strawberry(P, 7.5, -7, 1);
		for (const a of [-0.8, 0.55]) leaf(P, 0, 1.4, a, 8, 2.6, leafy);
	},
	// Herbs: orange marigolds over long leaves
	44(P) {
		P.shadow(11, 4.5);
		const leafy = '#4a9a40';
		for (const a of [-1.3, 1.3, -0.7, 0.75]) leaf(P, 0, 1, a, 10, 2.2, shade(leafy, -0.08));
		stem(P, 0, 0, -5, -13, -1, '#4a8a36');
		stem(P, 0, 0, 3.5, -17, 1, '#4a8a36');
		stem(P, 0, 0, 6.5, -9, 3, '#4a8a36');
		marigold(P, -5, -13, 3.6);
		marigold(P, 3.5, -17, 3.8);
		marigold(P, 6.5, -9, 3.3);
		for (const a of [-0.25, 0.3]) leaf(P, 0, 1.4, a, 7, 1.8, leafy);
	},
	// Bamboo plant: a clump of jointed yellow-green canes under a bushy crown of leaves
	61(P) {
		P.shadow(12, 5.5);
		const dark = '#2e7a34', mid = '#3e9a3e', light = '#5cb44a', cane = '#a8b848';
		const crown = (list, c) => { for (const [x, y, a, len] of list) leaf(P, x, y, a, len, len * 0.26, c); };
		crown([[-5, -21, -1.2, 9], [5, -22, 1.2, 9], [-1, -27, -0.5, 9], [2, -27, 0.5, 9], [-7, -16, -1.8, 7], [8, -17, 1.7, 7]], dark);
		for (const [x, y, rx, ry] of [[-4, -22, 6.5, 5.5], [4, -23, 6.5, 5.5], [0, -27, 6, 4.5]]) P.ellipse(x, y, rx, ry, dark);
		const canes = [[-5.5, 0.4], [-3, 2.6], [-0.5, -0.6], [1.5, 2.8], [3.8, 0], [6, 1.8], [-1.5, 3.6]];
		for (const [x, y] of canes) {
			P.line([[x, y], [x + 0.2, -19]], cane, 1.3);
			for (let n = y - 4; n > -17; n -= 4.2) P.thin([[x - 0.8, n], [x + 1, n - 0.2]], shade(cane, -0.4), 0.45);
		}
		crown([[-3, -18, -1.1, 8], [3.5, -18.5, 1.1, 8], [0, -20, 0.1, 7], [-6, -21, -0.7, 8], [6, -22, 0.7, 8], [-2, -26, -0.3, 7], [3, -27, 0.5, 7], [0, -24, -0.1, 6]], mid);
		crown([[-4.5, -17, -1.5, 7], [5, -16.5, 1.4, 7], [-1.5, -20, -0.7, 6], [2, -22, 0.4, 6], [-4, -24, -0.4, 5], [5, -25, 0.8, 5]], light);
		crown([[-3, 2.4, -1.3, 4.5], [3.5, 3, 1.3, 4.5], [0.5, 3.6, -0.3, 3.5]], mid);
	},
	// Green empty bottle, lying on its side
	62(P) {
		P.shadow(11, 4);
		const glass = '#3aa65a';
		const f = along(-8, -3.6, 1.17);
		const xs = [f(-2.5)[0], f(18)[0]];
		P.shape((p) => {
			p.m(...f(0, -4.2)); p.l(...f(9.5, -4.2)); p.q(...f(12.5, -4.2), ...f(13.5, -1.7)); p.l(...f(16.8, -1.6)); p.l(...f(17.2, -2.2)); p.l(...f(18.4, -2.2));
			p.l(...f(18.4, 2.2)); p.l(...f(17.2, 2.2)); p.l(...f(16.8, 1.6)); p.l(...f(13.5, 1.7)); p.q(...f(12.5, 4.2), ...f(9.5, 4.2)); p.l(...f(0, 4.2));
			p.q(...f(-2.8, 0), ...f(0, -4.2));
		}, glass, xs[0], xs[1], { alpha: 0.92 });
		P.ellipse(...f(18.4), 0.8, 2.1, shade(glass, -0.45), { rot: 1.17 - Math.PI / 2 + 0.5 });
		P.thin([f(0.5, -2.8), f(10, -2.8)], 'rgba(255,255,255,0.7)', 0.7);
		P.thin([f(14, -0.9), f(16.5, -0.9)], 'rgba(255,255,255,0.6)', 0.45);
		P.thin([f(2, 2.4), f(9, 2.4)], shade(glass, 0.35), 0.5);
	},
	66(P) { crystalRock(P, CRYSTAL[66]); },
	67(P) { crystalRock(P, CRYSTAL[67]); },
	68(P) { crystalRock(P, CRYSTAL[68]); },
	69(P) { crystalRock(P, CRYSTAL[69]); },
	70(P) { crystalRock(P, CRYSTAL[70]); },
	// Chariot: a bronze cab, red inside, with a winged scarab, a spoked wheel, a quiver of javelins and the pole
	102(P) {
		P.shadow(16, 7);
		const bronze = '#c98a3a', wood = '#8a5a30', red = '#9a2e24';
		P.line([[4, -4], [15, 2.5]], wood, 1.6);
		wheel(P, 11, -6.5, 5.6, wood);
		for (const k of [-0.6, 0.6]) P.line([[-6 + k, -12], [-10.5 + k, -28]], shade(wood, 0.2), 0.7);
		P.shape((p) => { p.m(-5.4, -10); p.l(-8.8, -24); p.l(-11.6, -23); p.l(-8.6, -9.4); p.q(-7, -8.8, -5.4, -10); }, shade(bronze, -0.2), -11.6, -5.4);
		P.shape((p) => { p.m(-7, -16); p.q(-1, -23, 11.5, -25); p.l(11.5, -22.5); p.q(2, -11.5, -7, -15); p.l(-7, -16); }, red, -7, 11.5);
		P.thin(curve([-6.6, -16.4], [-1, -22.8], [11, -24.8]), shade(bronze, 0.3), 0.8);
		P.shape((p) => { p.m(-7, -15.5); p.q(2, -11.5, 11.5, -23); p.l(10.8, -6); p.q(2, -0.8, -6.4, -6.6); p.l(-7, -15.5); }, bronze, -7, 11.5);
		P.thin(curve([-6.6, -8.4], [2, -2.6], [10.9, -7.8]), '#3a8a8a', 1);
		P.thin(curve([-6.8, -14], [2, -10], [11.1, -21.2]), shade(bronze, 0.35), 0.7);
		// the winged scarab
		for (const s of [-1, 1]) P.shape((p) => { p.m(3, -12); p.q(3 + s * 3, -15.4, 3 + s * 6, -14); p.q(3 + s * 4, -12.2, 3, -11); }, '#e6b45a', 3 - 6, 3 + 6);
		P.ellipse(3, -11.6, 1.3, 1.7, '#6a4a1e');
		P.gloss(-4.5, -14, 0.8, 2.6, 0.35);
		wheel(P, -5, -6.4, 6.6, wood);
	},
	// Mummy-honey: a round bronze jar brimming with dark honey that runs down its sides
	122(P) {
		P.shadow(11, 5);
		const jar = '#c8843a', honey = '#6e3410', gold = '#e8b85a';
		const prof = [[0, 6], [3, 9.2], [8, 10.2], [13, 9.4], [15.5, 7.8], [17, 7.2]];
		const top = potBody(P, 0, 1, prof, jar);
		potBand(P, 0, 1, prof, 3.2, gold, 0.6);
		potBand(P, 0, 1, prof, 14.2, gold, 0.6);
		for (const k of [-2, -1, 0, 1, 2]) P.thin([[0, -3], [k * 1.4, -6.6 + Math.abs(k) * 0.5]], gold, 0.4);
		const y = 1 - top, w = 7.2;
		P.ellipse(0, y, w, w * 0.4, honey);
		P.shape((p) => { p.m(-5.6, y); p.q(-3.6, y - 3.6, 0.5, y - 2.6); p.q(4.4, y - 3.2, 5.8, y); p.q(0, y + 1.6, -5.6, y); }, shade(honey, 0.08), -5.6, 5.8);
		for (const [x, len, dw] of [[-5.2, 2.6, 0.8], [-2.4, 6, 1], [0.6, 3.2, 0.8], [3.4, 5, 0.9]]) {
			const y0 = y + w * 0.4 * Math.sqrt(1 - (x / (w + 0.4)) ** 2) - 0.6;
			P.shape((p) => { p.m(x - dw, y0); p.l(x - dw * 0.8, y0 + len); p.q(x, y0 + len + dw * 1.8, x + dw * 0.8, y0 + len); p.l(x + dw, y0); }, honey, x - dw, x + dw);
			P.gloss(x - 0.4, y0 + len * 0.5, 0.25, len * 0.25, 0.35);
		}
		P.gloss(-1.8, y - 1.6, 1.2, 0.5, 0.45);
		P.gloss(-5.2, -8, 0.9, 2.8, 0.3);
	},
};
