// Loads x30 and every phase file. Kept separate from ./index.js, which phase files import:
// awaiting them from there would deadlock the module graph.
import './index.js';

const phases = ['gen', 'rooms', 'corridors', 'entry', 'locks', 'place', 'decor', 'monsters'];
for (const p of phases) {
	try {
		await import(`./${p}.js`);
	} catch (e) {
		// Only tolerate the phase file itself being absent (incremental porting).
		const missing = (e.code === 'ERR_MODULE_NOT_FOUND' || /Failed to fetch/i.test(e.message)) && e.message.includes(`/x30/${p}.js`);
		if (!missing) throw e;
	}
}
