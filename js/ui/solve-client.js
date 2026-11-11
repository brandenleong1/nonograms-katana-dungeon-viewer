// Main-thread side of the solver host (js/ui/solve-host.js): one module worker, created on the first solve and kept
// warm (with its worker pool) between solves. cancel() terminates it, which ends every pending call with a
// CancelError and its pool with it; the next solve starts a fresh one.
export class CancelError extends Error {
	constructor() { super('cancelled'); this.name = 'CancelError'; }
}

export class SolveClient {
	constructor({ tablesUrl, namesUrl }) {
		this.urls = { tablesUrl, namesUrl };
		this.w = null;
		this.ready = null;
		this.seq = 0;
		this.wait = new Map();
	}

	get warm() { return !!this.w; }

	_start() {
		const w = new Worker(new URL('./solve-host.js', import.meta.url), { type: 'module' });
		w.onmessage = (e) => {
			const m = e.data || {};
			const p = this.wait.get(m.id);
			if (!p) return;
			if (m.progress) { if (p.onProgress) p.onProgress(m.progress); return; }
			this.wait.delete(m.id);
			if (m.error) { const err = new Error(m.error); err.stack = m.stack || err.stack; p.reject(err); } else p.resolve(m.result);
		};
		w.onerror = (e) => {
			const err = new Error(`solver worker failed: ${(e && e.message) || 'could not load'}`);
			for (const p of this.wait.values()) p.reject(err);
			this.wait.clear();
			this._drop();
		};
		this.w = w;
		this.ready = this._call('init', this.urls);
		return this.ready;
	}

	_drop() {
		if (this.w) this.w.terminate();
		this.w = null;
		this.ready = null;
	}

	_call(cmd, args, onProgress) {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			this.wait.set(id, { resolve, reject, onProgress });
			this.w.postMessage({ id, cmd, args });
		});
	}

	async run(cmd, args, onProgress) {
		if (!this.w) this._start();
		await this.ready;
		return this._call(cmd, args, onProgress);
	}

	/** solve a job (see js/ui/solve-panel.js buildJob): { plan, frames?, acts?, timings } */
	solve(job, onProgress) { return this.run('solve', job, onProgress); }

	/** replay a script: { frames, acts, replay } */
	replay(args) { return this.run('replay', args); }

	cancel() {
		const err = new CancelError();
		for (const p of this.wait.values()) p.reject(err);
		this.wait.clear();
		this._drop();
	}
}
