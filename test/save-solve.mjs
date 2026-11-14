// Exact solves from a save made inside a dungeon, the way the page runs them: import the save in headless Chromium,
// switch the solver to Exact, solve, and check the result is an exact plan whose script replays to the same end. It
// uses the synthetic mid-dungeon saves the oracle writes (docs/testing.md), so it runs on the maintainer's machine,
// not in CI.
//
//   node test/save-solve.mjs [-v]
//   NK_SAVE_DIR  synthetic saves under synth/ (default ~/.cache/nk-oracle/save)
//
// Needs Playwright (tools/chromium.mjs) and the lib/utils submodule.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../tools/static-server.mjs';
import { launchChromium } from '../tools/chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNTH = path.join(process.env.NK_SAVE_DIR || path.join(os.homedir(), '.cache/nk-oracle/save'), 'synth');
const SAVES = ['hw-0-4242.dat', 'hw-14-99.dat', 'hw-19-2024.dat'];
const SOLVE_TIMEOUT_MS = 15 * 60 * 1000;
const verbose = process.argv.includes('-v');

const missing = SAVES.map((f) => path.join(SYNTH, f)).filter((f) => !fs.existsSync(f));
if (missing.length) {
	console.error(`${missing[0]}: not found. This suite uses the maintainer's oracle data (docs/testing.md); use npm test.`);
	process.exit(2);
}

const browser = await launchChromium();
const server = await serveStatic(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
let failures = 0;
try {
	for (const save of SAVES) failures += await checkSave(path.join(SYNTH, save));
} finally {
	await browser.close();
	server.close();
}
console.log(failures ? `${failures} failed` : `${SAVES.length} passed, 0 failed`);
process.exit(failures ? 1 : 0);

/** Import one save, solve its dungeon in Exact mode, and check the plan. Returns 1 on failure. */
async function checkSave(file) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	try {
		await page.goto(`${base}/index.html`);
		await page.waitForFunction(() => window.nkd && window.nkd.state.hero && window.nkd.solve, null, { timeout: 60000 });   // a bare page shows no dungeon
		await page.setInputFiles('#hero-file', file);
		await page.waitForFunction(() => window.nkd.solve.saveDungeon && window.nkd.solve.saveDungeon(), null, { timeout: 30000 });
		await page.evaluate(() => window.nkd.solve.setOption('mode', 'exact'));
		const outcome = await page.evaluate((ms) => Promise.race([
			window.nkd.solve.run().then(() => {
				const r = window.nkd.solve.result;
				return { status: window.nkd.solve.status, mode: r && r.plan && r.plan.mode, framesMatch: r && r.framesMatch, label: r && r.job && r.job.label };
			}),
			new Promise((done) => setTimeout(() => done({ status: 'timed out' }), ms)),
		]), SOLVE_TIMEOUT_MS);
		if (!/^Done/.test(outcome.status)) errors.push(`solver: ${outcome.status}`);
		else if (outcome.mode !== 'exact') errors.push(`plan mode ${outcome.mode}`);
		else if (!outcome.framesMatch) errors.push('the script player\'s frames don\'t end where the solve did');
		if (verbose) console.log(`  ${path.basename(file)}: ${outcome.label} ${outcome.status}`);
	} catch (e) {
		errors.push(e.message.split('\n')[0]);
	} finally {
		await page.close();
	}
	if (!errors.length) return 0;
	console.log(`FAIL ${path.basename(file)}:\n  ${[...new Set(errors)].join('\n  ')}`);
	return 1;
}
