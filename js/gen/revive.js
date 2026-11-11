// Revive the oracle's JSON encoding (tools/oracle/Snap.java) into JS objects.
//   {"$c":C,"$i":id,...}  -> instance of registered class C (plain object if unregistered)
//   {"$r":id}             -> previously revived object
//   {"$t":"zw.M[8]"}      -> object inside the static tables
//   {"$a":T,"v":[...]}    -> typed array (B Int8, S Int16, I Int32, C Uint16, F Float32, D Float64)
//   {"$col":"TreeSet"}    -> TreeSet; {"$col":"HashMap","$map":[...]} -> Map
import { classes } from './registry.js';
import { TreeSet } from './jrt.js';

const TYPED = { B: Int8Array, S: Int16Array, I: Int32Array, C: Uint16Array, F: Float32Array, D: Float64Array };

export function revive(json, tables = null) {
	const ids = new Map();
	const walk = (v) => {
		if (v === null || typeof v !== 'object') return v;
		if (Array.isArray(v)) return v.map(walk);
		if ('$r' in v) {
			if (!ids.has(v.$r)) throw new Error(`revive: dangling $r ${v.$r}`);
			return ids.get(v.$r);
		}
		if ('$t' in v) {
			if (!tables) throw new Error(`revive: table ref ${v.$t} without tables`);
			return tables.resolve(v.$t);
		}
		if ('$a' in v) {
			const T = TYPED[v.$a];
			if (T) { const arr = T.from(v.v); if ('$i' in v) ids.set(v.$i, arr); return arr; }
			const arr = [];                       // boolean[] / long[] / Object[] ("L")
			if ('$i' in v) ids.set(v.$i, arr);
			for (const x of v.v) arr.push(walk(x));
			return arr;
		}
		if ('$col' in v) {
			// containers register before their contents so shared/cyclic references resolve
			if ('$map' in v) {
				const m = new Map();
				if ('$i' in v) ids.set(v.$i, m);
				for (const [k, x] of v.$map) m.set(walk(k), walk(x));
				return m;
			}
			if (v.$col === 'TreeSet') {
				const t = new TreeSet();
				if ('$i' in v) ids.set(v.$i, t);
				for (const x of v.v) t.add(walk(x));
				return t;
			}
			const arr = [];
			if ('$i' in v) ids.set(v.$i, arr);
			for (const x of v.v) arr.push(walk(x));
			return arr;
		}
		if ('$map' in v) return new Map(v.$map.map(([k, x]) => [walk(k), walk(x)]));
		if ('$c' in v) {
			const cls = classes[v.$c];
			const o = cls ? Object.create(cls.prototype) : { $class: v.$c };
			ids.set(v.$i, o);
			for (const k in v) {
				if (k === '$c' || k === '$i') continue;
				o[k] = walk(v[k]);
			}
			return o;
		}
		const o = {};
		for (const k in v) o[k] = walk(v[k]);
		return o;
	};
	return walk(json);
}

/** Static game tables (data/tables.json), addressable by oracle path such as "zw.Q{21}.T". */
export class Tables {
	constructor(json) {
		this.roots = revive(json);
	}

	get(root) {
		if (!(root in this.roots)) throw new Error(`tables: no root ${root}`);
		return this.roots[root];
	}

	resolve(path) {
		const m = /^([A-Za-z0-9$]+\.[A-Za-z0-9$]+)(.*)$/.exec(path);
		if (!m) throw new Error(`tables: bad path ${path}`);
		let cur = this.get(m[1]);
		const re = /\[(\d+)\]|\{([^}]*)\}|\.([A-Za-z0-9$]+)/g;
		let t;
		while ((t = re.exec(m[2]))) {
			if (t[1] !== undefined) cur = cur[+t[1]];
			else if (t[2] !== undefined) cur = cur.get(Number.isNaN(+t[2]) ? t[2] : +t[2]);
			else cur = cur[t[3]];
			if (cur === undefined) throw new Error(`tables: path ${path} not found`);
		}
		return cur;
	}
}
