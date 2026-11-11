// Deep structural comparison of a JS object graph against a revived oracle snapshot.
// Only fields present in `expected` are compared (JS objects may carry extra helpers).
import { TreeSet } from './jrt.js';

export function compare(actual, expected, { limit = 20, ignore = [] } = {}) {
	const diffs = [];
	const seen = new Map(); // expected object -> actual object
	const ign = new Set(ignore);

	const walk = (a, e, path) => {
		if (diffs.length >= limit) return;
		if (e === a) return;
		if (e === null || typeof e !== 'object') {
			if (typeof e === 'number' && typeof a === 'number' && Number.isNaN(e) && Number.isNaN(a)) return;
			diffs.push(`${path}: expected ${fmt(e)}, got ${fmt(a)}`);
			return;
		}
		if (a === null || typeof a !== 'object') {
			diffs.push(`${path}: expected object, got ${fmt(a)}`);
			return;
		}
		if (seen.has(e)) {
			if (seen.get(e) !== a) diffs.push(`${path}: identity differs (shared object expected)`);
			return;
		}
		seen.set(e, a);
		if (e instanceof TreeSet) e = e.toArray();
		if (a instanceof TreeSet) a = a.toArray();
		if (e instanceof Map) {
			if (!(a instanceof Map)) { diffs.push(`${path}: expected Map`); return; }
			if (a.size !== e.size) diffs.push(`${path}: map size ${a.size} != ${e.size}`);
			for (const [k, v] of e) walk(a.get(k), v, `${path}{${k}}`);
			return;
		}
		if (ArrayBuffer.isView(e) || Array.isArray(e)) {
			if (!(ArrayBuffer.isView(a) || Array.isArray(a))) { diffs.push(`${path}: expected array, got ${fmt(a)}`); return; }
			if (a.length !== e.length) { diffs.push(`${path}: length ${a.length} != ${e.length}`); }
			const n = Math.min(a.length, e.length);
			for (let i = 0; i < n && diffs.length < limit; i++) walk(a[i], e[i], `${path}[${i}]`);
			return;
		}
		for (const k of Object.keys(e)) {
			if (k === '$class' || ign.has(k)) continue;
			walk(a[k], e[k], `${path}.${k}`);
		}
	};

	walk(actual, expected, '$');
	return diffs;
}

function fmt(v) {
	if (v === undefined) return 'undefined';
	if (v === null || typeof v !== 'object') return JSON.stringify(v);
	if (Array.isArray(v) || ArrayBuffer.isView(v)) return `array(${v.length})`;
	return `{${v.constructor?.name || 'object'}}`;
}
