// The screenshot bot's trusted half (tools/screenshot-comment.mjs) against an in-memory GitHub
// (test/fixtures/fake-github.mjs): the comment and the stored images, GitHub timing out or erroring part way, and what the
// PR is told when posting fails. No network.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/screenshot-comment.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools/screenshot-comment.mjs');
const FAKE = path.join(ROOT, 'test/fixtures/fake-github.mjs');
const SHA = 'a'.repeat(7) + '1'.repeat(33);
const RUN_URL = 'https://github.com/o/r/actions/runs/777';
const TIMED_OUT = { status: 422, message: "Sorry, your request timed out.  It's likely that your input was too large to process." };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-screenshot-comment-'));
process.on('exit', () => fs.rmSync(work, { recursive: true, force: true }));

/** A Screenshots run's artifact: `views` is [name, status]; images are made for the changed and added ones. */
function artifact(views) {
	const dir = fs.mkdtempSync(path.join(work, 'art-'));
	fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ views: views.map(([name, status]) => ({ name, status, changedPixels: 0 })) }));
	for (const [name, status] of views) {
		if (status !== 'same') fs.writeFileSync(path.join(dir, `${name}.after.png`), PNG);
		if (status === 'changed') fs.writeFileSync(path.join(dir, `${name}.before.png`), PNG);
	}
	return dir;
}

/** Run `post` for PR 7 (head SHA) against a fake GitHub set up by `fake`; the exit code, output and what the fake saw. */
function post(dir, fake = {}, { conclusion = 'success', sha = SHA } = {}) {
	const out = path.join(work, `out-${Math.random().toString(36).slice(2)}.json`);
	const config = { pulls: [{ number: 7, sha: SHA }], ...fake };
	const env = { ...process.env, GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '888', FAKE_GITHUB: JSON.stringify(config), FAKE_GITHUB_OUT: out };
	return new Promise((done) => {
		const child = spawn(process.execPath, ['--import', pathToFileURL(FAKE).href, TOOL, 'post', dir, sha, conclusion, RUN_URL], { env });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('close', (status) => {
			const seen = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
			done({ status, stdout, stderr, ...seen, count: (what) => (seen?.calls || []).filter((c) => c.startsWith(what)).length });
		});
	});
}

const cases = [];
const test = (name, run) => cases.push([name, run]);
const bodyOf = (r) => r.comments.map((c) => c.body).join('\n');
const linksOf = (text) => [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]);
const FOLDER = 'https://github.com/o/r/tree/bot/screenshots/auto/pr-7/aaaaaaa';
const COMMENT_DOWN = { match: 'POST /issues/7/comments', times: 4, status: 502, message: 'Bad Gateway' };   // all four tries

test('posts the views that changed, and says how many of how many', async () => {
	const r = await post(artifact([['map', 'changed'], ['help', 'same'], ['hero', 'added']]));
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 1);
	assert.match(bodyOf(r), /^<!-- nkd-screenshots -->\n### Screenshots/);
	assert.match(bodyOf(r), /\*\*2 of 3 views look different\.\*\*/);
	assert.match(bodyOf(r), /bot\/screenshots\/auto\/pr-7\/aaaaaaa\/map\.before\.png/);
	assert.deepEqual(Object.keys(r.branch).sort(), ['auto/pr-7/aaaaaaa/hero.after.png', 'auto/pr-7/aaaaaaa/map.after.png', 'auto/pr-7/aaaaaaa/map.before.png']);
});

test("replaces this PR's older images and leaves everything else on the branch alone", async () => {
	const branch = { 'auto/pr-7/bbbbbbb/map.after.png': 'old', 'auto/pr-5/ccccccc/x.png': 'five', 'pr-7/by-hand.png': 'hand', 'README.md': 'readme' };
	const r = await post(artifact([['map', 'changed']]), { branch });
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(Object.keys(r.branch).sort(), ['README.md', 'auto/pr-5/ccccccc/x.png', 'auto/pr-7/aaaaaaa/map.after.png', 'auto/pr-7/aaaaaaa/map.before.png', 'pr-7/by-hand.png']);
	assert.equal(r.branch['pr-7/by-hand.png'], 'hand');
});

test('describes a tree change, not every file on the branch', async () => {
	const branch = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`auto/pr-${100 + i}/ddddddd/v.png`, `v${i}`]));
	const r = await post(artifact([['map', 'changed']]), { branch });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(Object.keys(r.branch).length, 302);
	assert.ok(r.treeSizes[0] <= 2, `the tree request carried ${r.treeSizes[0]} entries`);
});

test('creates the branch when there is none', async () => {
	const r = await post(artifact([['map', 'added']]));
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(Object.keys(r.branch), ['auto/pr-7/aaaaaaa/map.after.png']);
});

test('edits its comment on a later push instead of adding another', async () => {
	const r = await post(artifact([['map', 'same']]), { comments: [{ id: 5, number: 7, body: '<!-- nkd-screenshots -->\nold' }, { id: 6, number: 7, body: 'someone else' }] });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 2);
	assert.match(r.comments[0].body, /No view looks different\*\* \(1 checked\)/);
	assert.equal(r.comments[1].body, 'someone else');
});

test('does nothing when no open PR has that head (pushed again, or merged)', async () => {
	const r = await post(artifact([['map', 'changed']]), {}, { sha: 'b'.repeat(40) });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /no open PR has head bbbbbbb/);
	assert.equal(r.comments.length, 0);
	assert.equal(r.count('POST'), 0);
});

test('links the run when the Screenshots run itself failed', async () => {
	const r = await post(artifact([]), {}, { conclusion: 'failure' });
	assert.equal(r.status, 0, r.stderr);
	assert.match(bodyOf(r), /couldn't be taken: see \[the run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/777\)/);
});

// run 43470655535, the one that left PR 61 without its comment: POST /git/trees answered 422 "your request timed out"
test('repeats a tree request GitHub timed out on', async () => {
	const r = await post(artifact([['map', 'changed']]), { faults: [{ match: 'POST /git/trees', times: 2, ...TIMED_OUT }] });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.count('POST /git/trees'), 3);
	assert.equal(r.comments.length, 1);
	assert.match(bodyOf(r), /1 of 1 views look different/);
	assert.equal(Object.keys(r.branch).length, 2);
});

test('repeats requests that got a server error or lost the connection', async () => {
	const r = await post(artifact([['map', 'changed']]), {
		faults: [{ match: 'GET /pulls', status: 502, message: 'Bad Gateway' }, { match: 'POST /git/blobs', network: true }, { match: 'POST /git/commits', status: 503, message: 'x' }],
	});
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 1);
});

test('waits when GitHub says it is rate limiting, then goes on', async () => {
	const r = await post(artifact([['map', 'changed']]), { faults: [{ match: 'POST /git/blobs', times: 1, status: 403, message: 'secondary rate limit', headers: { 'retry-after': '1' } }] });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 1);
});

test('does not repeat a request that is simply wrong', async () => {
	const r = await post(artifact([['map', 'changed']]), { branch: { 'README.md': 'readme' }, faults: [{ match: 'POST /git/trees', times: 99, status: 422, message: 'tree.sha is not a valid sha' }] });
	assert.equal(r.status, 1);
	assert.equal(r.count('POST /git/trees'), 2, 'the short form once, then the whole list once');
});

test('sends the whole file list when GitHub refuses the short form for good', async () => {
	const branch = { 'auto/pr-7/bbbbbbb/map.after.png': 'old', 'auto/pr-5/ccccccc/x.png': 'five', 'pr-7/by-hand.png': 'hand', 'README.md': 'readme' };
	const r = await post(artifact([['map', 'changed']]), { branch, faults: [{ match: 'POST /git/trees', bodyHas: '"base_tree"', times: 99, status: 422, message: 'base_tree is not supported' }] });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /sending the whole file list instead/);
	assert.deepEqual(r.treeSizes, [3, 5], 'the short form: 1 deleted and 2 added; the whole list: 3 kept and 2 added');
	assert.deepEqual(Object.keys(r.branch).sort(), ['README.md', 'auto/pr-5/ccccccc/x.png', 'auto/pr-7/aaaaaaa/map.after.png', 'auto/pr-7/aaaaaaa/map.before.png', 'pr-7/by-hand.png']);
	assert.equal(r.comments.length, 1);
});

test('adds a comment once even if GitHub made it and then lost the answer', async () => {
	const r = await post(artifact([['map', 'changed']]), { faults: [{ match: 'POST /issues/7/comments', times: 1, status: 502, message: 'Bad Gateway', afterSuccess: true }] });
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 1);
	assert.equal(r.count('POST /issues/7/comments'), 1);
});

test('starts again when another run moved the branch first, and keeps what that run stored', async () => {
	const r = await post(artifact([['map', 'changed']]), { branch: { 'README.md': 'readme' }, race: true });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /moved meanwhile/);
	assert.ok('auto/pr-99/abcdef0/other.png' in r.branch, 'the other run\'s image is gone');
	assert.ok('auto/pr-7/aaaaaaa/map.after.png' in r.branch);
});

test("tells the PR when the images couldn't be stored, links the run's artifact, and fails the run", async () => {
	const branch = { 'README.md': 'readme', 'auto/pr-5/ccccccc/x.png': 'five' };
	const r = await post(artifact([['map', 'changed']]), { branch, faults: [{ match: 'POST /git/trees', times: 99, ...TIMED_OUT }] });
	assert.equal(r.status, 1);
	assert.equal(r.count('POST /git/trees'), 4, 'a timeout is repeated, and not answered with a bigger request');
	assert.deepEqual(r.treeSizes, [2, 2, 2, 2]);
	assert.match(r.stderr, /^error: POST \/repos\/o\/r\/git\/trees: 422/m);
	assert.equal(r.comments.length, 1);
	const body = bodyOf(r);
	assert.match(body, /^<!-- nkd-screenshots -->/);
	assert.match(body, /screenshots for aaaaaaa were taken but weren't stored/);
	assert.match(body, /artifact of \[the run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/777\)/);
	assert.match(body, /\[this run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/888\)/);
	assert.doesNotMatch(body, /tree\/bot\/screenshots/, 'there is no folder to link');
	assert.doesNotMatch(body, /timed out/);
	assert.deepEqual(Object.keys(r.branch).sort(), ['README.md', 'auto/pr-5/ccccccc/x.png']);
});

test("tells the PR where the images are when they were stored but the comment couldn't be written", async () => {
	const r = await post(artifact([['map', 'changed'], ['help', 'same']]), { faults: [COMMENT_DOWN] });
	assert.equal(r.status, 1);
	assert.equal(r.comments.length, 1);
	const body = bodyOf(r);
	assert.match(body, /screenshots for aaaaaaa were taken and stored \(\[the images\]\(https:\/\/github\.com\/o\/r\/tree\/bot\/screenshots\/auto\/pr-7\/aaaaaaa\)\), but the comment couldn't be written/);
	assert.doesNotMatch(body, /weren't stored/);
	assert.deepEqual(linksOf(body), [FOLDER, 'https://github.com/o/r/actions/runs/888']);
	assert.deepEqual(Object.keys(r.branch).sort(), ['auto/pr-7/aaaaaaa/map.after.png', 'auto/pr-7/aaaaaaa/map.before.png'], 'the folder the link points to exists');
});

test('does not link a folder that was never made when no view looked different', async () => {
	const r = await post(artifact([['map', 'same']]), { faults: [COMMENT_DOWN] });
	assert.equal(r.status, 1);
	assert.match(bodyOf(r), /were taken, and no view looks different, but the comment couldn't be written/);
	assert.deepEqual(linksOf(bodyOf(r)), ['https://github.com/o/r/actions/runs/888']);
	assert.deepEqual(Object.keys(r.branch), []);
});

test("replaces its own comment with the notice, so there is still one comment", async () => {
	const r = await post(artifact([['map', 'changed']]), { comments: [{ id: 5, number: 7, body: '<!-- nkd-screenshots -->\nan older push' }], faults: [{ match: 'POST /git/trees', times: 99, ...TIMED_OUT }] });
	assert.equal(r.status, 1);
	assert.equal(r.comments.length, 1);
	assert.match(r.comments[0].body, /couldn't be posted|weren't stored/);
});

test('builds the notice from trusted values only: nothing from the artifact is in it or its links', async () => {
	const evil = 'x](http://evil.example)<img src=x>';
	const dir = artifact([['map', 'changed']]);
	const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
	manifest.title = evil;
	manifest.views[0].changedPixels = evil;
	manifest.views[0].note = evil;
	fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
	const stored = await post(dir, { faults: [COMMENT_DOWN] });
	const unstored = await post(dir, { faults: [{ match: 'POST /git/trees', times: 99, ...TIMED_OUT }] });
	const refused = await post(artifact([['map', 'changed'], ['x](http://evil.example)', 'same']]));
	for (const r of [stored, unstored, refused]) {
		assert.equal(r.comments.length, 1);
		const body = bodyOf(r);
		assert.doesNotMatch(body, /evil|<img/);
		for (const link of linksOf(body)) assert.match(link, /^https:\/\/github\.com\/o\/r\/(actions\/runs\/\d+|tree\/bot\/screenshots\/auto\/pr-7\/aaaaaaa)$/);
	}
	assert.match(bodyOf(stored), /were taken and stored/);
	assert.match(bodyOf(unstored), /weren't stored/);
	assert.match(bodyOf(refused), /weren't stored/);
	assert.equal(refused.status, 2);
});

test('accepts a manifest at the 100-view limit', async () => {
	const views = Array.from({ length: 100 }, (_, i) => [`view-${i}`, 'same']);
	const r = await post(artifact(views));
	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.comments.length, 1);
	assert.match(bodyOf(r), /No view looks different\*\* \(100 checked\)/);
});

test('refuses a manifest with too many views, tells the PR, and says nothing of what was in it', async () => {
	const views = Array.from({ length: 101 }, (_, i) => [`view-${i}`, 'same']);
	const r = await post(artifact(views));
	assert.equal(r.status, 2);
	assert.match(r.stderr, /at most 100 views/);
	assert.match(bodyOf(r), /weren't stored/);
	assert.doesNotMatch(bodyOf(r), /view-/);
	assert.equal(r.count('POST /git/blobs'), 0);
});

test('refuses a view name that could break out of the comment, and a missing image', async () => {
	const dir = artifact([['map', 'same']]);
	fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ views: [{ name: 'x](http://evil)', status: 'changed' }] }));
	const bad = await post(dir);
	assert.equal(bad.status, 2);
	assert.doesNotMatch(bodyOf(bad), /evil/);
	const missing = artifact([['map', 'changed']]);
	fs.rmSync(path.join(missing, 'map.before.png'));
	assert.equal((await post(missing)).status, 2);
});

// every case starts its own node process, so they run side by side
const errors = await Promise.all(cases.map(([, run]) => run().then(() => null, (e) => e)));
let failed = 0;
cases.forEach(([name], i) => {
	if (!errors[i]) return console.log(`ok   ${name}`);
	failed++;
	console.log(`FAIL ${name}\n${String(errors[i].stack || errors[i]).split('\n').slice(0, 8).join('\n')}`);
});
console.log(`${cases.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
