// Loads c30 and every part file (each calls install()/extend()). Only entry points import this file.
import '../gen/index.js';
import './c30.js';

const parts = ['ui', 'setup', 'input', 'nav', 'turn', 'ai', 'actions', 'move', 'damage'];
for (const p of parts) {
	try {
		await import(`./${p}.js`);
	} catch (e) {
		const missing = (e.code === 'ERR_MODULE_NOT_FOUND' || /Failed to fetch/i.test(e.message)) && e.message.includes(`/combat/${p}.js`);
		if (!missing) throw e;
	}
}
export { c30 } from './c30.js';
