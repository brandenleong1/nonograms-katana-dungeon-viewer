// Pool worker adapter (M7) for exact mode from an in-dungeon save. Same protocol as js/solve/worker.js (pool.js
// talks to it unchanged: { id, method, args } -> { id, result } | { id, error }); the only difference is the `exact`
// setup: problem.saveBytes (the guild.dat) is imported here, after resetStatics (the loader writes statics a save
// fight needs), and becomes problem.save for exact.js exactFight. The stock worker expects problem.save itself,
// which an imported save (an object graph, consumed by setupSave) cannot be across postMessage.
// Loaded through js/ui/pool-worker.js?save=1 (which also keeps the first messages; see there) by
// js/ui/solve-host-main.js for save problems; everything else uses js/solve/worker.js.
import '../combat/all.js';
import { resetStatics } from '../combat/setup.js';
import { loadEntry, resolveProfile } from '../solve/sim.js';
import { Shard } from '../solve/robust.js';
import { ExactWorker } from '../solve/exact.js';
import { importSave } from '../save/index.js';

let target = null;
let tablesJson = null;

async function handle({ method, args = [] }) {
	switch (method) {
		case 'tables': {
			const src = args[0];
			if (!tablesJson) {
				if (src.json) tablesJson = src.json;
				else {
					const r = await fetch(src.url);
					if (!r.ok) throw new Error(`tables: HTTP ${r.status}`);
					tablesJson = await r.json();
				}
			}
			resetStatics(tablesJson);
			await loadEntry();
			return { ok: true };
		}
		case 'shard': {
			resetStatics(tablesJson);
			target = new Shard({ ...args[0], hero: await resolveProfile(args[0].hero) });
			return { ok: true };
		}
		case 'exact': {
			resetStatics(tablesJson);
			const p = args[0].problem;
			const problem = { ...p, hero: await resolveProfile(p.hero) };
			if (p.saveBytes) {
				problem.save = await importSave(p.saveBytes);
				delete problem.saveBytes;
			}
			target = new ExactWorker({ ...args[0], problem });
			return target.init();
		}
		default:
			if (!target || typeof target[method] !== 'function') throw new Error(`worker: no method ${method}`);
			return target[method](...args);
	}
}

self.onmessage = async (e) => {
	const msg = e.data;
	try {
		self.postMessage({ id: msg.id, result: await handle(msg) });
	} catch (err) {
		self.postMessage({ id: msg.id, error: String((err && err.stack) || err) });
	}
};
