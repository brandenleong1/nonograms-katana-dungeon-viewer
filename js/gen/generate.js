// Public generator API: dungeon type + seed -> level in the viewer's format (same as oracle dumps).
import './index.js';
import { classes } from './registry.js';
import { vj0 } from './statics.js';
import { formatLabel } from '../labels.js';

function newLevel(type) {
	const { hw } = classes;
	const hero = vj0.i2.l[0];   // the game's first hero (stats do not affect layout)
	return new hw(type, hero);
}

/** Build the dungeon exactly as the game does for this (successful) seed. */
export function generate(type, seed) {
	const { x30 } = classes;
	const level = newLevel(type);
	const gen = new x30();
	gen.g_(level, seed);
	return toLevel(level, gen, type, seed);
}

/** A random label the game could show: start anywhere and retry like x30.f until generation succeeds. */
export function randomLabel(type) {
	const { x30 } = classes;
	const level = newLevel(type);
	const gen = new x30();
	const start = (Math.random() * 0x7fffffff) | 0;
	gen.f_(level, start);
	return formatLabel(type, level.a);
}

const bit = (v) => (v ? 1 : 0);

export function toLevel(hw, gen, type, seed) {
	const n = hw.j.length;
	const cells = new Array(2 * n);
	for (let i = 0; i < n; i++) {
		cells[2 * i] = hw.j[i].a;
		cells[2 * i + 1] = hw.j[i].b;
	}
	const obj = (q) => ({ id: q.a.a, x: q.b.a, y: q.b.b, c: bit(q.c), d: bit(q.d), e: bit(q.e), f: bit(q.f), g: q.g, h: q.h });
	return {
		type, seed,
		w: hw.g, h: hw.h, a: hw.a, y: hw.y, A: hw.A,
		rng: { e: gen.e.a, f: gen.f.a, w: hw.w.a },
		cells,
		regions: Array.from(hw.l),
		objects: hw.n.map(obj),
		critters: hw.o.map((c) => ({ ...obj(c), k: c.k })),
		rooms: gen.n.map((r) => ({ x: r.a, y: r.b, w: r.c, h: r.d, id: r.e, v: r.v, w_: r.w, x_: r.x })),
	};
}
