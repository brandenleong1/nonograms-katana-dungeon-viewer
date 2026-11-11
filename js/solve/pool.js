// Worker pool for the solver: the same interface as robust.js InlinePool / exact.js InlineExactPool, backed by module
// workers (browser Web Workers, or Node worker_threads), one Shard / ExactWorker each.
//
//   const pool = await WorkerPool.create({ size: navigator.hardwareConcurrency - 1, tables: { url: 'data/tables.json' } });
//   await solveRobust(problem, { pool });   // or solveExact(problem, { pool })
//   pool.close();
// Node: WorkerPool.create({ size: 8, tables: { path: '/abs/data/tables.json' } }).
//
// pool.setup(cfg) (robust) / pool.setupExact(cfg) (exact) make each worker's target; pool.call(i, method, ...args)
// runs a method on worker i and resolves with its (structured-cloned) result.

/** an imported profile (object graph) does not survive postMessage: workers re-import it from its bytes */
function portableHero(hero) {
	if (!hero || !hero.profile) return hero;
	const { vj0, ...rest } = hero.profile;
	void vj0;
	return { ...hero, profile: rest };
}

const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node) && typeof window === 'undefined' && typeof self === 'undefined';

class Port {
	constructor(w, node) {
		this.w = w;
		this.node = node;
		this.seq = 0;
		this.wait = new Map();
		const on = (msg) => {
			const p = this.wait.get(msg.id);
			if (!p) return;
			this.wait.delete(msg.id);
			if (msg.error) p.reject(new Error(msg.error));
			else p.resolve(msg.result);
		};
		const fail = (e) => { for (const p of this.wait.values()) p.reject(e instanceof Error ? e : new Error(String(e && e.message || e))); this.wait.clear(); };
		if (node) { w.on('message', on); w.on('error', fail); w.on('exit', (c) => { if (c !== 0) fail(new Error(`worker exit ${c}`)); }); }
		else { w.onmessage = (e) => on(e.data); w.onerror = (e) => fail(e); }
	}

	call(method, ...args) {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			this.wait.set(id, { resolve, reject });
			this.w.postMessage({ id, method, args });
		});
	}

	close() { if (this.node) this.w.terminate(); else this.w.terminate(); }
}

export class WorkerPool {
	constructor(ports) { this.ports = ports; }
	get size() { return this.ports.length; }

	/** { size, tables: { url | path | json }, workerUrl? } */
	static async create({ size = 4, tables, workerUrl } = {}) {
		const url = workerUrl || new URL('./worker.js', import.meta.url);
		const ports = [];
		if (isNode) {
			const { Worker } = await import('node:worker_threads');
			for (let i = 0; i < size; i++) ports.push(new Port(new Worker(url), true));
		} else {
			for (let i = 0; i < size; i++) ports.push(new Port(new Worker(url, { type: 'module' }), false));
		}
		const pool = new WorkerPool(ports);
		await Promise.all(ports.map((p) => p.call('tables', tables)));
		return pool;
	}

	async setup(cfg) { const c = { ...cfg, hero: portableHero(cfg.hero) }; return Promise.all(this.ports.map((p) => p.call('shard', c))); }
	async setupExact(cfg) {
		// an imported save (problem.save) is an object graph: workers need its bytes (problem.saveBytes) to import it
		const pr = cfg.problem;
		if (pr.save && !pr.saveBytes) throw new Error('WorkerPool: an exact problem from a save needs problem.saveBytes (the guild.dat / export zip bytes)');
		const { save, ...rest } = pr;
		void save;
		const c = { ...cfg, problem: { ...rest, hero: portableHero(pr.hero) } };
		return Promise.all(this.ports.map((p) => p.call('exact', c)));
	}
	call(i, method, ...args) { return this.ports[i].call(method, ...args); }
	async close() { for (const p of this.ports) p.close(); }
}

/** a sensible default size: hardware threads - 1 (browser) / cores - 1 (Node), at least 1, at most 16 */
export async function defaultSize() {
	if (isNode) { const os = await import('node:os'); return Math.max(1, Math.min(16, os.cpus().length - 1)); }
	const n = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
	return Math.max(1, Math.min(16, n - 1));
}
