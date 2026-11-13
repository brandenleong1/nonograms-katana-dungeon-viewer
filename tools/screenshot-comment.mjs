// The screenshot bot's trusted half (.github/workflows/screenshot-comment.yml). It runs from main with a write token,
// takes the images a Screenshots run made for a pull request (tools/screenshots.mjs, run on the PR's own code), stores
// them on the `bot/screenshots` branch and keeps one comment on the PR up to date.
//
// The images come from code nobody has reviewed yet, so they are data only: the manifest must parse and match the
// expected shape, names are checked against a strict pattern, only regular PNG files of a bounded size are read, and
// nothing from them reaches the comment except validated view names.
//
//   node tools/screenshot-comment.mjs post DIR HEAD_SHA CONCLUSION RUN_URL   post a run's images on its PR
//   node tools/screenshot-comment.mjs prune                                  delete the images of PRs closed 30+ days
//   add --dry-run to print what it would do
//
// Images live at `auto/pr-<n>/<sha7>/` on the branch. Other paths there (e.g. pr-<n>/ images for PR descriptions)
// are left alone. Several runs can post at once (one per PR), so each adds a commit on top of the branch and moves it
// only if nobody else moved it meanwhile, retrying otherwise. The daily prune squashes the branch back to one commit,
// so deleted images don't stay in its history.
//
// GitHub sometimes times out or errors on a request: those are repeated a few times. If posting still fails, the PR
// gets a comment saying so, so a PR never just stays without one, and the job fails too. The comment links the images'
// folder on the branch if they were stored, or the Screenshots run (its artifact) if not; it doesn't say why: the reason
// can come from the untrusted files, so it stays in the log.
//
// Needs GITHUB_TOKEN (contents: write, pull-requests: write) and GITHUB_REPOSITORY.
import fs from 'node:fs';
import path from 'node:path';

const BRANCH = 'bot/screenshots';
const MARKER = '<!-- nkd-screenshots -->';
const BOT = 'github-actions[bot]';
const PRUNE_DAYS = 30;
// bounds on the untrusted artifact (keep in step with tools/screenshots.mjs LIMITS): room for a PR that adds views to
// main's ~60, every one of them changed
const LIMITS = { manifestBytes: 64 * 1024, views: 100, pngBytes: 3 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 };
const NAME = /^[a-z0-9][a-z0-9-]{0,47}$/;
const STATUSES = new Set(['changed', 'added', 'same']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const API = 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY;
const DRY_RUN = process.argv.includes('--dry-run');
const ATTEMPTS = 4;            // tries for a request GitHub timed out on or answered with an error
const RETRY_MS = 1000;         // the first pause between tries; it doubles
const REQUEST_MS = 60 * 1000;  // a request that takes longer than this counts as failed

/** A refusal (bad arguments, files that fail the checks): exit code 2. Anything else that goes wrong exits with 1. */
class Refused extends Error {}

/** A failed request. `transient`: trying again may work. `waitMs`: how long GitHub asked us to wait. `status`: HTTP, if any. */
class Failure extends Error {
	constructor(message, { transient = false, waitMs = 0, status = 0 } = {}) {
		super(message);
		this.transient = transient;
		this.waitMs = waitMs;
		this.status = status;
	}
}

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--dry-run');
try {
	if (!REPO || !process.env.GITHUB_TOKEN) fail('GITHUB_TOKEN and GITHUB_REPOSITORY must be set');
	if (command === 'post') await post(...rest);
	else if (command === 'prune') await prune();
	else fail('usage: node tools/screenshot-comment.mjs post DIR HEAD_SHA CONCLUSION RUN_URL | prune [--dry-run]');
} catch (e) {
	console.error(`error: ${clean(e.message)}`);
	process.exit(e instanceof Refused ? 2 : 1);
}

async function post(dir, headSha, conclusion, runUrl) {
	if (!/^[0-9a-f]{40}$/.test(headSha || '')) fail(`bad head SHA: ${headSha}`);
	if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(runUrl || '')) fail(`bad run URL: ${runUrl}`);
	const pr = (await openPulls()).find((p) => p.head.sha === headSha);
	if (!pr) {
		console.log(`no open PR has head ${headSha.slice(0, 7)} (pushed again, or closed): nothing to post`);
		return;
	}
	if (conclusion !== 'success') {
		await upsertComment(pr.number, failedBody(headSha, runUrl));
		return;
	}
	const progress = { stored: false };
	try {
		await postViews({ pr, dir, headSha, runUrl, progress });
	} catch (e) {
		// best effort: the run fails either way, but nobody watches this workflow's runs; the PR page is what people read
		await upsertComment(pr.number, notPostedBody({ pr, headSha, runUrl, progress })).catch((again) => console.error(`error: couldn't say so on the PR either: ${clean(again.message)}`));
		throw e;
	}
}

/** Check and store the run's images and post the comment. `progress.stored` says if the images got onto the branch. */
async function postViews({ pr, dir, headSha, runUrl, progress }) {
	const views = readViews(dir);
	const shown = views.filter((v) => v.status !== 'same');
	const prefix = `auto/pr-${pr.number}/${headSha.slice(0, 7)}`;
	const files = shown.flatMap((v) => v.files.map((f) => ({ path: `${prefix}/${f.name}`, file: f.file })));
	await storeImages({ replace: `auto/pr-${pr.number}/`, files, message: `Screenshots for #${pr.number} at ${headSha.slice(0, 7)}` });
	Object.assign(progress, { stored: true, shown: shown.length });
	await upsertComment(pr.number, viewsBody({ views, shown, prefix, headSha, runUrl }));
}

/** Delete auto/pr-<n>/ for PRs closed PRUNE_DAYS ago or more. */
async function prune() {
	const head = await branchHead();
	if (!head) return;
	const tree = head.files;
	const numbers = [...new Set(tree.filter((e) => /^auto\/pr-\d+\//.test(e.path)).map((e) => +e.path.split('/')[1].slice(3)))];
	const old = [];
	for (const n of numbers) {
		const pr = await github(`/repos/${REPO}/pulls/${n}`, 'GET', null, [404]);
		const closedDays = pr && pr.closed_at ? (Date.now() - Date.parse(pr.closed_at)) / 86400000 : 0;
		if (!pr || closedDays >= PRUNE_DAYS) old.push(n);
	}
	if (!old.length) {
		console.log('no screenshots to prune');
		return;
	}
	for (const n of old) await storeImages({ replace: `auto/pr-${n}/`, files: [], message: `Prune screenshots of #${n}` });
	await squashBranch();
}

// ---- reading the run's images (untrusted) -------------------------------------------------------------------------

/** The manifest's views, checked, with their image files: [{ name, status, files: [{ name, file }] }]. */
function readViews(dir) {
	const manifestFile = regularFile(path.join(dir, 'manifest.json'), LIMITS.manifestBytes);
	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
	} catch (e) {
		fail(`manifest.json: ${e.message}`);
	}
	if (!manifest || !Array.isArray(manifest.views) || manifest.views.length > LIMITS.views) fail(`manifest.json: expected { views: [...] } with at most ${LIMITS.views} views`);
	let total = 0;
	return manifest.views.map((v) => {
		if (!v || typeof v.name !== 'string' || !NAME.test(v.name) || !STATUSES.has(v.status)) fail(`manifest.json: bad view ${JSON.stringify(v).slice(0, 80)}`);
		const sides = v.status === 'changed' ? ['before', 'after'] : v.status === 'added' ? ['after'] : [];
		const files = sides.map((side) => {
			const name = `${v.name}.${side}.png`;
			const file = regularFile(path.join(dir, name), LIMITS.pngBytes);
			total += fs.statSync(file).size;
			if (total > LIMITS.totalBytes) fail(`images: more than ${LIMITS.totalBytes / 1024 / 1024} MB in total`);
			if (!fs.readFileSync(file).subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${name}: not a PNG`);
			return { name, file };
		});
		return { name: v.name, status: v.status, files };
	});
}

/** path, if it is a regular file (not a link) no bigger than maxBytes. */
function regularFile(file, maxBytes) {
	let st;
	try {
		st = fs.lstatSync(file);
	} catch {
		fail(`${path.basename(file)}: missing`);
	}
	if (!st.isFile()) fail(`${path.basename(file)}: not a regular file`);
	if (st.size > maxBytes) fail(`${path.basename(file)}: ${st.size} bytes, more than ${maxBytes}`);
	return file;
}

// ---- the comment -------------------------------------------------------------------------------------------------

function viewsBody({ views, shown, prefix, headSha, runUrl }) {
	const url = (name) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${prefix}/${name}`;
	const head = `${MARKER}\n### Screenshots\n\n\`main\` next to this PR at ${headSha.slice(0, 7)} ([run](${runUrl})), with a new game and fixed labels.`;
	if (!shown.length) return `${head}\n\n**No view looks different** (${views.length} checked).\n`;
	const sections = shown.map((v) => {
		if (v.status === 'added') return `#### \`${v.name}\` (new view)\n\n![${v.name}](${url(`${v.name}.after.png`)})`;
		return `#### \`${v.name}\`\n\n| Before | After |\n|---|---|\n| ![before](${url(`${v.name}.before.png`)}) | ![after](${url(`${v.name}.after.png`)}) |`;
	});
	const same = views.filter((v) => v.status === 'same').map((v) => `\`${v.name}\``);
	return `${head} **${shown.length} of ${views.length} views look different.**\n\n${sections.join('\n\n')}\n\n${same.length ? `<sub>Unchanged: ${same.join(', ')}</sub>\n` : ''}`;
}

function failedBody(headSha, runUrl) {
	return `${MARKER}\n### Screenshots\n\nThe screenshots for ${headSha.slice(0, 7)} couldn't be taken: see [the run](${runUrl}).\n`;
}

/**
 * The images were taken but the comment couldn't be written. If they are on the branch, link their folder; if not (or
 * if no view looked different, so there is no folder), link the Screenshots run, whose artifact has them for a week.
 * Built from the PR number, the head SHA and the repository only, never from the artifact. The reason stays in the log:
 * it may quote the untrusted files.
 */
function notPostedBody({ pr, headSha, runUrl, progress }) {
	const sha = headSha.slice(0, 7);
	const runId = /^\d+$/.test(process.env.GITHUB_RUN_ID || '') ? process.env.GITHUB_RUN_ID : null;
	const why = runId ? ` See [this run](https://github.com/${REPO}/actions/runs/${runId}) for why.` : '';
	const again = ' Pushing again, or re-running the Screenshots run, tries again.';
	const folder = `https://github.com/${REPO}/tree/${BRANCH}/auto/pr-${pr.number}/${sha}`;
	const what = !progress.stored
		? `were taken but weren't stored, so they can't be shown here. They are in the artifact of [the run](${runUrl}).`
		: progress.shown
			? `were taken and stored ([the images](${folder})), but the comment couldn't be written.`
			: `were taken, and no view looks different, but the comment couldn't be written.`;
	return `${MARKER}\n### Screenshots\n\nThe screenshots for ${sha} ${what}${why}${again}\n`;
}

/**
 * Edit the bot's screenshot comment on the PR, or add it. All of it is repeated if GitHub fails part way: if an answer
 * got lost after the comment was made, the next try finds the comment and edits it, so it is never added twice.
 */
async function upsertComment(number, body) {
	await retrying(async () => {
		const comments = await request(`/repos/${REPO}/issues/${number}/comments?per_page=100`);
		const mine = comments.find((c) => c.user?.login === BOT && c.body.startsWith(MARKER));
		if (mine) await act(`#${number}: update the screenshot comment`, () => request(`/repos/${REPO}/issues/comments/${mine.id}`, 'PATCH', { body }));
		else await act(`#${number}: add the screenshot comment`, () => request(`/repos/${REPO}/issues/${number}/comments`, 'POST', { body }));
	});
}

// ---- the branch ----------------------------------------------------------------------------------------------------

/**
 * Commit to the branch: its current files, minus everything under `replace`, plus `files` ([{ path, file }]). The
 * branch only moves if it is still where this run read it; if another run moved it first, start again from there.
 * The new tree is described as changes to the branch's current tree, not as a list of every file on the branch: that
 * list grows with every PR kept, and GitHub gives up ("your request timed out") on a long one.
 */
async function storeImages({ replace, files, message }) {
	if (DRY_RUN) {
		console.log(`(dry run) ${BRANCH}: drop ${replace}, add ${files.map((f) => f.path).join(', ') || 'nothing'}`);
		return;
	}
	const added = [];
	for (const f of files) {
		const blob = await github(`/repos/${REPO}/git/blobs`, 'POST', { content: fs.readFileSync(f.file).toString('base64'), encoding: 'base64' });
		added.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
	}
	for (let attempt = 1; attempt <= 6; attempt++) {
		const head = await branchHead();
		const tree = await newTree(head, replace, added);
		const commit = await github(`/repos/${REPO}/git/commits`, 'POST', { message, tree: tree.sha, parents: head ? [head.sha] : [] });
		if (await moveBranch({ from: head?.sha, to: commit.sha })) {
			console.log(`${BRANCH}: ${message} (${added.length} images)`);
			return;
		}
		console.log(`${BRANCH} moved meanwhile; trying again (${attempt})`);
		await pause(1000 * attempt);
	}
	fail(`${BRANCH}: kept moving; gave up`);
}

/**
 * A tree like the branch's (`head`, if there is one) with everything under `replace` swapped for `added`. It is sent as
 * changes to the branch's tree. If GitHub refuses that for good (a 4xx), the whole file list is sent instead, as the
 * bot did before: a quirk of the short form can't stop the screenshots. A timeout isn't that, and is not sent bigger.
 */
async function newTree(head, replace, added) {
	const files = (head ? head.files : []).filter((e) => e.type === 'blob');
	const dropped = files.filter((e) => e.path.startsWith(replace) && !added.some((a) => a.path === e.path));
	const changes = [...dropped.map((e) => ({ path: e.path, mode: e.mode, type: 'blob', sha: null })), ...added];   // a null sha deletes
	if (!head) return github(`/repos/${REPO}/git/trees`, 'POST', { tree: changes });
	try {
		return await github(`/repos/${REPO}/git/trees`, 'POST', { base_tree: head.tree, tree: changes });
	} catch (e) {
		if (!(e instanceof Failure) || e.transient || e.status < 400 || e.status >= 500) throw e;
		console.log(`${clean(e.message).slice(0, 300)}; sending the whole file list instead`);
		const kept = files.filter((f) => !f.path.startsWith(replace)).map((f) => ({ path: f.path, mode: f.mode, type: 'blob', sha: f.sha }));
		return github(`/repos/${REPO}/git/trees`, 'POST', { tree: [...kept, ...added] });
	}
}

/** Replace the branch's history with one commit of its current files (daily, from prune). */
async function squashBranch() {
	const head = await branchHead();
	if (!head || DRY_RUN) return;
	const commit = await github(`/repos/${REPO}/git/commits`, 'POST', { message: 'Screenshots for pull requests', tree: head.tree, parents: [] });
	await github(`/repos/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: true });
	console.log(`${BRANCH}: squashed to one commit`);
}

/** Point the branch at `to` if it is still at `from` (no branch yet when from is undefined). False if it moved. */
async function moveBranch({ from, to }) {
	if (!from) return (await github(`/repos/${REPO}/git/refs`, 'POST', { ref: `refs/heads/${BRANCH}`, sha: to }, [422])) !== null;
	// a fast-forward only: it fails (422) if the branch is no longer at `from`
	return (await github(`/repos/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', { sha: to, force: false }, [422])) !== null;
}

/** The branch's head: { sha, tree, files: [{ path, mode, type, sha }] }, or null if it doesn't exist yet. */
async function branchHead() {
	const ref = await github(`/repos/${REPO}/git/ref/heads/${BRANCH}`, 'GET', null, [404]);
	if (!ref) return null;
	const commit = await github(`/repos/${REPO}/git/commits/${ref.object.sha}`);
	const tree = await github(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
	if (tree.truncated) fail(`${BRANCH}: too many files to list; prune it`);
	return { sha: ref.object.sha, tree: commit.tree.sha, files: tree.tree };
}

// ---- GitHub ----------------------------------------------------------------------------------------------------------

async function openPulls() {
	const all = [];
	for (let page = 1; ; page++) {
		const batch = await github(`/repos/${REPO}/pulls?state=open&per_page=100&page=${page}`);
		all.push(...batch);
		if (batch.length < 100) return all;
	}
}

/** A request, repeated if GitHub timed out or errored. Don't use it for one that must not be made twice (a new comment). */
function github(apiPath, method = 'GET', body = null, okMissing = []) {
	return retrying(() => request(apiPath, method, body, okMissing));
}

/** One try. The answer's JSON, or null for 204 and for a status in okMissing; throws a Failure otherwise. */
async function request(apiPath, method = 'GET', body = null, okMissing = []) {
	// not AbortSignal.timeout: on Node 18 a process that used it can hang when it should exit
	const stop = new AbortController();
	const timer = setTimeout(() => stop.abort(), REQUEST_MS);
	try {
		const res = await fetch(API + apiPath, {
			method,
			headers: {
				authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
				accept: 'application/vnd.github+json',
				'x-github-api-version': '2022-11-28',
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: stop.signal,
		});
		if (okMissing.includes(res.status)) return null;
		if (!res.ok) throw failure(`${method} ${apiPath}`, res, await res.text());
		return res.status === 204 ? null : await res.json();
	} catch (e) {
		throw e instanceof Failure ? e : new Failure(`${method} ${apiPath}: ${e.message}`, { transient: true });   // no answer, or half of one
	} finally {
		clearTimeout(timer);
	}
}

/** Server errors, rate limits, and the 422 GitHub answers when it runs out of time on a request are worth another try. */
function failure(what, res, text) {
	const retryAfter = Number(res.headers.get('retry-after')) || 0;
	const limited = res.status === 429 || (res.status === 403 && (retryAfter > 0 || res.headers.get('x-ratelimit-remaining') === '0'));
	const timedOut = res.status === 422 && /timed out/i.test(text);
	return new Failure(`${what}: ${res.status} ${text}`, { transient: res.status >= 500 || limited || timedOut, waitMs: Math.min(retryAfter, 60) * 1000, status: res.status });
}

/** Run `run`; if it fails in a way worth another try, pause and run it again, up to ATTEMPTS times in all. */
async function retrying(run) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (e) {
			if (!e.transient || attempt >= ATTEMPTS) throw e;
			console.log(`${clean(e.message).slice(0, 300)}; trying again (${attempt})`);
			await pause(e.waitMs || RETRY_MS * 2 ** (attempt - 1));
		}
	}
}

function pause(ms) {
	return new Promise((done) => setTimeout(done, ms));
}

async function act(what, run) {
	console.log(DRY_RUN ? `(dry run) ${what}` : what);
	if (!DRY_RUN) await run();
}

/** Stop with a message (printed by the top of the file). It can quote the untrusted files, so see `clean`. */
function fail(message) {
	throw new Refused(message);
}

/** Control characters go from anything printed that may quote the untrusted files (no injected workflow commands). */
function clean(message) {
	return String(message).replace(/[\u0000-\u001f\u007f]/g, ' ');
}
