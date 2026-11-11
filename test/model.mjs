// Model tests (js/gen/model*), independent of x30 so they run while x30 is being ported.
//
//   node test/model.mjs snap <snapdir>...      replay oracle snapshots of model methods (like snaptest)
//   node test/model.mjs unit <probe.json>      compare static helpers against a Java probe dump
//
// snap: for every <n>-entry.json / -exit.json pair, revive [self, args], call self[name_](...args),
// deep-compare self with the exit state. Progress queries (vj0/kj0) must already be ported, or be
// stubbed with --stub-progress=<probe.json> (uses the "progress" answers recorded by the probe).
import fs from 'node:fs';
import path from 'node:path';
import '../js/gen/rng.js';
import * as M from '../js/gen/model.js';
import { initTables, vj0, zw } from '../js/gen/statics.js';
import { revive } from '../js/gen/revive.js';
import { compare } from '../js/gen/compare.js';
import { e01 } from '../js/gen/rng.js';
import { f32, sortList } from '../js/gen/jrt.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const tables = initTables(JSON.parse(fs.readFileSync(path.join(here, '../data/tables.json'), 'utf8')));

const args = process.argv.slice(2);
const mode = args.shift();
const verbose = args.includes('-v');
const stubArg = args.find((a) => a.startsWith('--stub-progress='));
const rest = args.filter((a) => !a.startsWith('-'));

// Fresh-player answers for the progress queries, recorded by the probe ("progress" section).
function stubProgress(file) {
	const p = JSON.parse(fs.readFileSync(file, 'utf8')).progress;
	const st = vj0.i2;
	const kj = (id) => ({
		q_: () => p.q[id], v_: () => p.v[id], x_: () => p.x[id], w_: (a) => p.w[id][a],
	});
	if (typeof st.Y0_ !== 'function') st.Y0_ = kj;
	if (typeof st.t1_ !== 'function') st.t1_ = (id) => p.t1[id];
	if (typeof st.L0_ !== 'function') st.L0_ = (id) => p.L0[id];
}
if (stubArg) stubProgress(stubArg.slice('--stub-progress='.length));

let pass = 0, fail = 0;
function check(label, diffs) {
	if (diffs.length) {
		fail++;
		console.log(`FAIL ${label}`);
		for (const d of diffs.slice(0, verbose ? 20 : 5)) console.log('     ' + d);
	} else {
		pass++;
		if (verbose) console.log(`ok   ${label}`);
	}
}

function pairs(dir) {
	const out = [];
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		if (fs.statSync(p).isDirectory()) out.push(...pairs(p));
		else if (name.endsWith('-entry.json')) out.push([p, p.replace(/-entry\.json$/, '-exit.json')]);
	}
	return out.sort();
}

function snap(dirs) {
	for (const dir of dirs) {
		for (const [entryPath, exitPath] of pairs(dir)) {
			const label = path.relative(process.cwd(), entryPath);
			const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
			if (!fs.existsSync(exitPath)) { console.log(`SKIP ${label} (no exit: method threw)`); continue; }
			const exit = JSON.parse(fs.readFileSync(exitPath, 'utf8'));
			const [self, callArgs] = revive(entry.state, tables);
			const name = entry.method.slice(0, entry.method.indexOf('(')) + '_';
			let diffs;
			try {
				if (typeof self[name] !== 'function') throw new Error(`${self.constructor.name}.${name} is not ported`);
				self[name](...callArgs);
				const [expected] = revive(exit.state, tables);
				diffs = compare(self, expected);
			} catch (e) {
				diffs = [`threw ${verbose ? e.stack : e.message}`];
			}
			check(`${label} ${entry.method}`, diffs);
		}
	}
}

// ---- unit checks against the Java probe ---------------------------------------------------------

const eq = (a, b) => (Object.is(a, b) || (a === b) ? [] : [`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`]);
const deq = (a, b) => {
	const sa = JSON.stringify(a), sb = JSON.stringify(b);
	return sa === sb ? [] : [`expected ${sb.slice(0, 300)}, got ${sa.slice(0, 300)}`];
};

function unit(file) {
	const P = JSON.parse(fs.readFileSync(file, 'utf8'));

	// k93.b
	check('k93.b', deq(Array.from(M.k93.b), P.k93));

	// m53.d: circumcircles in float32, including near-degenerate triangles
	P.m53.forEach((c, n) => {
		const pts = c.pts.map(([x, y]) => new M.zz(f32(x), f32(y)));
		let got;
		try {
			const t = M.m53.d_(pts, 0, 1, 2);
			got = [t.a, t.b, t.c, t.d, t.e, t.f];
		} catch (e) {
			got = e instanceof M.DegenException ? 'degen' : `threw ${e.message}`;
		}
		// the oracle's rewritten bytecode throws a plain Exception where the game throws DegenException
		const exp = c.out === 'threw java.lang.Exception: degenerate triangle' ? 'degen' : c.out;
		check(`m53.d #${n}`, deq(got, exp));
	});

	// d2 heap with ol(2) and z53(13) removal, replaying the probe's op sequence
	P.heap.forEach((h, n) => {
		const q = new M.d2(new M.ol(2));
		const out = [];
		for (const op of h.ops) {
			if (op[0] === 'add') {
				const s = new M.sw(op[1], op[2]);
				s.d = op[3];
				q.b_(s);
			} else if (op[0] === 'rm') {
				q.p_(new M.z53(13, new M.sw(op[1], op[2])));
			} else if (op[0] === 'poll') {
				// x30's inline poll
				let top = null;
				let b = q.b;
				if (b !== 0) {
					const arr = q.c;
					top = arr[0];
					q.b = --b;
					const last = arr[b];
					arr[b] = null;
					if (b !== 0) q.q_(0, last);
				}
				out.push(top ? [top.a, top.b, top.d] : null);
			} else if (op[0] === 'clear') {
				q.k_();
			}
		}
		check(`d2 heap #${n}`, deq(out, h.out));
	});

	// ol(3) / ol(4) on v30 (Collections.sort), xz on Integer[] (Arrays.sort)
	P.sorts.forEach((s, n) => {
		if (s.kind === 'xz') {
			const pts = s.pts.map(([x, y]) => new M.zz(f32(x), f32(y)));
			const idx = s.pts.map((_, i) => i);
			const cmp = new M.xz(pts);
			sortList(idx, (a, b) => cmp.compare_(a, b));
			check(`xz sort #${n}`, deq(idx, s.out));
		} else {
			const list = s.items.map(([a, b, c]) => new M.v30(a, b, c));
			const cmp = new M.ol(s.kind);
			sortList(list, (a, b) => cmp.compare_(a, b));
			check(`ol(${s.kind}) sort #${n}`, deq(list.map((v) => [v.a, v.b, v.c]), s.out));
		}
	});

	// t30.b / y83.b on table objects
	P.picks.forEach((p, n) => {
		const obj = tables.resolve(p.path);
		const r = new e01(p.seed);
		const out = [];
		for (let i = 0; i < p.n; i++) {
			const v = obj.b_(r);
			out.push(p.kind === 't30' ? (v == null ? -1 : obj.s.indexOf(v)) : v);
		}
		out.push(r.a);
		check(`${p.kind}.b ${p.path} seed ${p.seed}`, deq(out, p.out));
	});

	// uw constructor (companion roll)
	P.uw.forEach((u, n) => {
		let got;
		try {
			const c = new M.uw(u.id, u.seed, u.rank);
			got = [c.e.a, c.e.b, c.e.c, c.e.d, c.g, c.j, c.i.v_(), c.i.b];
		} catch (e) {
			got = `threw ${e.message}`;
		}
		check(`uw(${u.id},${u.seed},${u.rank}) #${n}`, deq(got, u.out));
	});

	// s8.u loot rolls
	P.loot.forEach((l, n) => {
		const s8 = tables.resolve(l.path);
		const cfg = l.type === 100 ? zw.N : zw.M[l.type];
		const r = new e01(l.seed);
		const out = [];
		for (let i = 0; i < l.n; i++) out.push(s8.u_(r, l.lvl, cfg));
		out.push(r.a);
		check(`s8.u ${l.path} lvl ${l.lvl} type ${l.type}`, deq(out, l.out));
	});

	// kh0 / mw obfuscated ints
	P.kh0.forEach(([v, enc], n) => {
		const k = new M.kh0(14, false);
		k.z_(v);
		check(`kh0 #${n}`, deq([k.b, k.v_()], [enc, v]));
	});

	// static int helpers
	for (const [name, fn] of Object.entries({
		'zw.b': zw.b_, 'zw.h': zw.h_, 'zw.k': zw.k_, 'uw.d': M.uw.d_, 'uw.g': M.uw.g_, 'nw.h': M.nw.h_, 'nw.q': M.nw.q_,
	})) {
		const exp = P.ints[name];
		check(name, deq(exp.map(([x]) => fn(x)), exp.map(([, y]) => y)));
	}

	// hw.F: companion stats onto template bw 530..535 (mutates tables in the probe's order)
	const num = (v) => (Number.isFinite(v) ? v : String(v));
	(P.hwF || []).forEach((f, n) => {
		const u = new M.uw(f.id, f.seed, f.rank);
		u.l_(f.xp);
		const t = zw.c_(f.tgt);
		M.hw.F_(t, u);
		const s = t.f0;
		check(`hw.F #${n} (${f.id},${f.rank}) -> ${f.tgt}`, deq(
			[t.b, num(t.d), t.O0, num(t.c), t.Y, t.Z, t.a0, t.V, s.a, s.b, s.c, s.d, s.e, t.q0, t.o0, t.p0], f.out));
	});

	// hw.I: companion templates 190..193
	(P.hwI || []).forEach((c, n) => {
		const level = new M.hw(c.type, vj0.i2.l[0]);
		level.p = c.p.map(([id, seed, rank]) => new M.uw(id, seed, rank));
		level.I_();
		const out = [];
		for (let k = 0; k < 4; k++) {
			const t = zw.c_(190 + k);
			out.push([t.b, num(t.d), num(t.c), t.Y, t.Z, t.a0, t.V, t.v, t.D0, t.C0]);
		}
		check(`hw.I #${n} type ${c.type}`, deq(out, c.out));
	});

	// hw(type, hero) constructor: iw.e() resolution and the hero mw
	P.hw.forEach((h) => {
		const level = new M.hw(h.type, vj0.i2.l[0]);
		const hero = new M.mw(level);
		check(`hw(${h.type})`, deq([tablesPath(level.c), level.d ? level.d.a : null, hero.q_(), hero.D_(), hero.A, hero.B, hero.i === hero.a.L_(level.c.N)], h.out));
	});
}

function tablesPath(o) {
	return o && typeof o === 'object' && 'a' in o ? o.a : o;
}

if (mode === 'snap') snap(rest);
else if (mode === 'unit') unit(rest[0]);
else {
	console.error('usage: node test/model.mjs snap <dir>... | unit <probe.json> [--stub-progress=<probe.json>] [-v]');
	process.exit(2);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
