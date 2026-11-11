// Browser entry for the solver's pool workers (M7 adapter; WorkerPool.create({ workerUrl })). js/solve/worker.js
// assigns self.onmessage only after the engine's top-level-await imports have evaluated, and a module worker
// dispatches messages meanwhile, so WorkerPool's first message ('tables') would be lost and create() would never
// resolve. This entry has no static imports: it queues messages from the start, loads the worker, then replays
// them to the worker's own handler. `?save=1` loads js/ui/solve-worker.js (exact mode from an in-dungeon save).
const early = [];
self.onmessage = (e) => { early.push(e); };
const save = new URL(self.location.href).searchParams.has('save');
await (save ? import('./solve-worker.js') : import('../solve/worker.js'));
const handler = self.onmessage;
for (const e of early) handler(e);
