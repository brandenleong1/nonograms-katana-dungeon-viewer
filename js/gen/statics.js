// Static game data and static methods, mirroring the Java classes they come from.
//   zw.M[i], zw.Q.get(id)      -> zw.M[i], zw.Q.get(id)      (data from data/tables.json)
//   x30's statics O, P, ...    -> xs.O, xs.P, ...
//   vj0.i2 (fresh player)      -> vj0.i2
// Static *methods* (zw.c(id), fg2.W(...), ...) are attached by the modules that port them.
import { Tables } from './revive.js';

export const zw = {};
export const xs = {};
export const vj0 = {};
export let tables = null;

const namespaces = { zw, x30: xs, vj0 };

export function initTables(json) {
	tables = new Tables(json);
	for (const root of Object.keys(tables.roots)) {
		const [cls, field] = root.split('.');
		if (namespaces[cls]) namespaces[cls][field] = tables.roots[root];
	}
	return tables;
}
