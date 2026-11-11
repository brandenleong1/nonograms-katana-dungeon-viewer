// Summarise V8 block coverage (NODE_V8_COVERAGE=dir node test/combat.mjs) for js/combat and js/gen/model files:
//   node tools/coverage.mjs <dir> [--files=combat] [--detail=actions.js] [--ranges]
// Prints, per file: % of lines executed, and per function the never-executed line count (--ranges: the line ranges).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dir, ...opts] = process.argv.slice(2);
const want = (opts.find((o) => o.startsWith('--files=')) || '--files=combat').slice(8);
const detail = (opts.find((o) => o.startsWith('--detail=')) || '').slice(9);
const showRanges = opts.includes('--ranges');
const results = [];
for (const f of fs.readdirSync(dir)) results.push(...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).result);

for (const r of results) {
	if (!r.url.startsWith('file://') || !r.url.includes(`/js/${want}`)) continue;
	const file = fileURLToPath(r.url);
	const src = fs.readFileSync(file, 'utf8');
	const lineStart = [0];
	for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStart.push(i + 1);
	const lineOf = (off) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStart[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };
	// per-character count: innermost range wins (ranges are nested, later = inner)
	const cnt = new Int32Array(src.length).fill(-1);
	for (const fn of r.functions) for (const rg of fn.ranges) cnt.fill(rg.count, rg.startOffset, rg.endOffset);
	const lines = src.split('\n');
	let code = 0, hit = 0;
	const dead = new Set();
	for (let ln = 1; ln <= lines.length; ln++) {
		const t = lines[ln - 1].trim();
		if (!t || t.startsWith('//') || t === '}' || t === '{' || t.startsWith('*') || t.startsWith('/*')) continue;
		const a = lineStart[ln - 1], b = a + lines[ln - 1].length;
		let first = a; while (first < b && /\s/.test(src[first])) first++;
		if (cnt[first] < 0) continue;
		code++;
		if (cnt[first] > 0) hit++; else dead.add(ln);
	}
	console.log(`${path.basename(file).padEnd(18)} ${String(Math.round(100 * hit / Math.max(code, 1))).padStart(3)}% of ${code} lines`);
	if (detail && path.basename(file) === detail) {
		// group dead lines into ranges, label by enclosing method name
		const ranges = [];
		for (const ln of [...dead].sort((x, y) => x - y)) {
			const last = ranges[ranges.length - 1];
			if (last && ln - last[1] <= 2) last[1] = ln; else ranges.push([ln, ln]);
		}
		let fnName = '?';
		const names = [];
		for (let ln = 1; ln <= lines.length; ln++) { const m = /^\t([A-Za-z0-9$]+_)\s*\(/.exec(lines[ln - 1]) || /^(?:export )?(?:async )?function\s+([A-Za-z0-9$_]+)/.exec(lines[ln - 1]); if (m) names.push([ln, m[1]]); }
		const nameAt = (ln) => { let n = '?'; for (const [l, nm] of names) { if (l <= ln) n = nm; else break; } return n; };
		const byFn = new Map();
		for (const [a, b] of ranges) { const n = nameAt(a); byFn.set(n, (byFn.get(n) || 0) + (b - a + 1)); }
		console.log('   never-run lines by method:', [...byFn].sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} ${c}`).join(', '));
		if (showRanges) for (const [a, b] of ranges) console.log(`   ${nameAt(a).padEnd(12)} ${a}-${b}  ${lines[a - 1].trim().slice(0, 90)}`);
	}
}
