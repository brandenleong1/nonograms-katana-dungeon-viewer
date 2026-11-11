// Generator entry point: imports every ported module (each registers its classes / methods).
// Only entry points (generate.js, tests) import this file; ported modules must not (top-level await).
import './rng.js';
import './model.js';
import './x30/all.js';

// Player-progress queries (vj0, kj0, ...). Tolerate absence only while it is being ported.
try {
	await import('./progress.js');
} catch (e) {
	const missing = (e.code === 'ERR_MODULE_NOT_FOUND' || /Failed to fetch/i.test(e.message)) && e.message.includes('/progress.js');
	if (!missing) throw e;
}

export { e01 } from './rng.js';
export { zw, xs, vj0, initTables, tables } from './statics.js';
export { classes } from './registry.js';
