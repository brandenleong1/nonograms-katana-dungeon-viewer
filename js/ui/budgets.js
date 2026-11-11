// Solver presets (M7), shared by the page (estimates) and js/ui/solve-host.js (solver options).
// Quality first: budgetMs is the expected wall time (progress / ETA only); the solver no longer cuts its search to meet
// it (js/solve: only with strictBudget, which no preset sets). A thorough exact solve may take minutes.
// robust: N samples, nMin per-decision minimum (with RNG variants), budgetMs (expected), candidate set
// exact:  budgetMs (expected), maxDecisions searched hero inputs per encounter, candidate set
const robust = {
	normal: { N: 64, nMin: 32, budgetMs: 60000, cands: 'full' },
	thorough: { N: 128, nMin: 48, budgetMs: 180000, cands: 'full' },
	exhaustive: { N: 256, nMin: 64, budgetMs: 600000, cands: 'full' },
};
const exact = {
	normal: { budgetMs: 120000, maxDecisions: 40, cands: 'full' },
	thorough: { budgetMs: 300000, maxDecisions: 100, cands: 'full' },
	exhaustive: { budgetMs: 900000, maxDecisions: 250, cands: 'full' },
};
export const BUDGETS = {
	// `fast` is kept as an alias of `normal` for settings saved before the rename
	robust: { fast: robust.normal, ...robust },
	exact: { fast: exact.normal, ...exact },
};

export const BUDGET_LABELS = { normal: 'Normal', thorough: 'Thorough', exhaustive: 'Exhaustive' };

/**
 * workers for a solve: hardware threads - 1, at most 8. The same for both modes, so the host keeps one warm pool
 * (each worker loads the engine and the tables, a second or two) when you switch between robust and exact.
 */
export function workerCount() {
	const n = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
	return Math.max(1, Math.min(8, n - 1));
}
