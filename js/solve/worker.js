// Solver worker: a module worker (browser `new Worker(url, { type: 'module' })`, Node worker_threads) hosting one
// robust Shard or exact ExactWorker. Each worker has its own engine statics (its own module instance), so states never
// cross threads: robust samples live in their shard; exact workers re-set up the problem and follow the committed
// inputs (sync).
//
// Protocol (pool.js): { id, method, args } -> { id, result } | { id, error }
//   tables { url | path | json }      load data/tables.json and resetStatics (once)
//   shard  cfg                        new robust Shard (robust.js)
//   exact  cfg                        new ExactWorker (exact.js) + init; cfg.problem.saveBytes (guild.dat / export zip
//                                     bytes) is imported here, after resetStatics
//   <method> ...args                  a Shard / ExactWorker method (init, advance, evaluate, commit, playthrough,
//                                     totals | sync, evaluate)
//
// The message handler is installed before anything is loaded: a browser module worker dispatches messages while its
// imports (the engine's top-level await) are still loading, and a handler installed after them would miss the first
// ones. Messages wait for the engine (`ready`) instead. So every engine module is imported dynamically below.

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node) && typeof self === 'undefined';
let port = null;
let target = null;      // Shard | ExactWorker
let tablesJson = null;
let M = null;           // the loaded modules

const ready = (async () => {
	await import('../combat/all.js');
	const [setup, sim, robust, exact] = await Promise.all([import('../combat/setup.js'), import('./sim.js'), import('./robust.js'), import('./exact.js')]);
	M = { resetStatics: setup.resetStatics, loadEntry: sim.loadEntry, resolveProfile: sim.resolveProfile, Shard: robust.Shard, ExactWorker: exact.ExactWorker, resolveSave: exact.resolveSave };
})();

async function loadTables(src) {
	if (src.json) return src.json;
	if (src.path) {
		const fs = await import('node:fs');
		return JSON.parse(fs.readFileSync(src.path, 'utf8'));
	}
	const r = await fetch(src.url);
	if (!r.ok) throw new Error(`tables: HTTP ${r.status}`);
	return r.json();
}

async function handle(msg) {
	await ready;
	const { method, args = [] } = msg;
	switch (method) {
		case 'tables':
			if (!tablesJson) tablesJson = await loadTables(args[0]);
			M.resetStatics(tablesJson);
			await M.loadEntry();
			return { ok: true };
		case 'shard': {
			M.resetStatics(tablesJson);
			const cfg = { ...args[0], hero: await M.resolveProfile(args[0].hero) };
			target = new M.Shard(cfg);
			return { ok: true };
		}
		case 'exact': {
			M.resetStatics(tablesJson);
			const p = await M.resolveSave(args[0].problem);
			const cfg = { ...args[0], problem: { ...p, hero: await M.resolveProfile(p.hero) } };
			target = new M.ExactWorker(cfg);
			return target.init();
		}
		default: {
			if (!target || typeof target[method] !== 'function') throw new Error(`worker: no method ${method}`);
			return target[method](...args);
		}
	}
}

async function onMessage(msg) {
	try {
		const result = await handle(msg);
		port.postMessage({ id: msg.id, result });
	} catch (e) {
		port.postMessage({ id: msg.id, error: String((e && e.stack) || e) });
	}
}

if (isNode) {
	// worker_threads queue messages until a listener is attached
	const { parentPort } = await import('node:worker_threads');
	port = parentPort;
	parentPort.on('message', onMessage);
} else {
	port = self;
	self.onmessage = (e) => onMessage(e.data);
}
