// Chibi object sprites, by object id (our own vector drawings, after how each object looks in the game; no game art).
// Issue #78. Drawn with the creatures' pen (js/view/creatures.js) in the same style: lit from the left, outlines a
// darker tone of each colour, soft gloss. Each breakable is drawn as itself, so the map shows which mimic it can hide:
// a barrel a Kraken (a Shark attack in the caves), a vase a Fire beetle (a Giant fly), the tombs' basket, crate and
// vase a jar mimic.
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
};
