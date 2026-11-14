// The PR bot (tools/pr-bot.mjs) against a fake GitHub (test/fixtures/pr-bot-github.mjs): which PR it merges, and what
// it tells the ones it holds. Here: a stacked PR (based on another PR's branch) waits, however ready it looks.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bot = path.join(here, '..', 'tools', 'pr-bot.mjs');
const fake = pathToFileURL(path.join(here, 'fixtures', 'pr-bot-github.mjs')).href;
let passed = 0, failed = 0;

function check(name, ok, detail = '') {
	if (ok) passed++;
	else { failed++; console.log(`FAIL ${name}${detail ? `  ${detail}` : ''}`); }
}

/** Run `pr-bot.mjs review` on a scene; the writes it made, parsed. */
function review(prs) {
	const run = spawnSync(process.execPath, ['--import', fake, bot, 'review'], {
		env: { ...process.env, GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'o/r', PR_BOT_SCENE: JSON.stringify({ prs }) },
		encoding: 'utf8',
	});
	if (run.status !== 0) throw new Error(`pr-bot exited ${run.status}: ${run.stderr || run.stdout}`);
	return run.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}
const merges = (writes) => writes.filter((w) => /\/merge$/.test(w.path)).map((w) => +w.path.match(/pulls\/(\d+)/)[1]);
const statusOf = (writes, sha) => writes.filter((w) => w.path.endsWith(`/statuses/${sha}`)).map((w) => w.body).pop();

// #2 is stacked on #1 (based on #1's branch) and approved; #1 isn't approved yet
{
	const writes = review([
		{ number: 1, base: 'main', ref: 'alice/lower', approved: false },
		{ number: 2, base: 'alice/lower', ref: 'alice/upper', approved: true },
	]);
	check('a stacked PR is not merged, even approved and green', !merges(writes).includes(2), JSON.stringify(merges(writes)));
	const s = statusOf(writes, 'h2');
	check('a stacked PR says what it waits for', s && s.state === 'pending' && /^Stacked on #1/.test(s.description), JSON.stringify(s));
	check('the PR below it still waits for its review', !merges(writes).includes(1) && /review/i.test(statusOf(writes, 'h1')?.description || ''), JSON.stringify(statusOf(writes, 'h1')));
}

// a PR based on a branch that no open PR has
{
	const writes = review([{ number: 3, base: 'some-branch', ref: 'alice/x', approved: true }]);
	const s = statusOf(writes, 'h3');
	check('a PR based on another branch is not merged', merges(writes).length === 0, JSON.stringify(merges(writes)));
	check('it says to change its base to main', s && s.state === 'pending' && /not main/.test(s.description), JSON.stringify(s));
}

// the normal case still merges: based on main, approved, green
{
	const writes = review([{ number: 4, base: 'main', ref: 'alice/y', approved: true }]);
	check('a ready PR based on main is merged', JSON.stringify(merges(writes)) === '[4]', JSON.stringify(merges(writes)));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
