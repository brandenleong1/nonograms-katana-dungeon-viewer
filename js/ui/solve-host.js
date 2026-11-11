// Worker entry of the solver host (M7; the work is in js/ui/solve-host-main.js). The engine's import graph has
// top-level await (js/combat/all.js), and a module worker dispatches messages while its modules are still
// evaluating: a handler assigned by those modules would miss the first messages. So this entry, which has no
// static imports, takes messages from the start and hands them over once the host is loaded.
const early = [];
self.onmessage = (e) => { early.push(e); };
await import('./solve-host-main.js');
const handler = self.onmessage;
for (const e of early) handler(e);
