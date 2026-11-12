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
// Needs GITHUB_TOKEN (contents: write, pull-requests: write) and GITHUB_REPOSITORY.
import fs from 'node:fs';
import path from 'node:path';

const BRANCH = 'bot/screenshots';
const MARKER = '<!-- nkd-screenshots -->';
const BOT = 'github-actions[bot]';
const PRUNE_DAYS = 30;
const LIMITS = { manifestBytes: 64 * 1024, views: 60, pngBytes: 3 * 1024 * 1024, totalBytes: 40 * 1024 * 1024 };
const NAME = /^[a-z0-9][a-z0-9-]{0,47}$/;
const STATUSES = new Set(['changed', 'added', 'same']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const API = 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY;
const DRY_RUN = process.argv.includes('--dry-run');

const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--dry-run');
if (!REPO || !process.env.GITHUB_TOKEN) fail('GITHUB_TOKEN and GITHUB_REPOSITORY must be set');
if (command === 'post') await post(...rest);
else if (command === 'prune') await prune();
else fail('usage: node tools/screenshot-comment.mjs post DIR HEAD_SHA CONCLUSION RUN_URL | prune [--dry-run]');

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
	const views = readViews(dir);
	const shown = views.filter((v) => v.status !== 'same');
	const prefix = `auto/pr-${pr.number}/${headSha.slice(0, 7)}`;
	const files = shown.flatMap((v) => v.files.map((f) => ({ path: `${prefix}/${f.name}`, file: f.file })));
	await storeImages({ replace: `auto/pr-${pr.number}/`, files, message: `Screenshots for #${pr.number} at ${headSha.slice(0, 7)}` });
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
	if (!manifest || !Array.isArray(manifest.views) || manifest.views.length > LIMITS.views) fail('manifest.json: expected { views: [...] } with at most 60 views');
	let total = 0;
	return manifest.views.map((v) => {
		if (!v || typeof v.name !== 'string' || !NAME.test(v.name) || !STATUSES.has(v.status)) fail(`manifest.json: bad view ${JSON.stringify(v).slice(0, 80)}`);
		const sides = v.status === 'changed' ? ['before', 'after'] : v.status === 'added' ? ['after'] : [];
		const files = sides.map((side) => {
			const name = `${v.name}.${side}.png`;
			const file = regularFile(path.join(dir, name), LIMITS.pngBytes);
			total += fs.statSync(file).size;
			if (total > LIMITS.totalBytes) fail('images: more than 40 MB in total');
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

/** Edit the bot's screenshot comment on the PR, or add it. */
async function upsertComment(number, body) {
	const comments = await github(`/repos/${REPO}/issues/${number}/comments?per_page=100`);
	const mine = comments.find((c) => c.user?.login === BOT && c.body.startsWith(MARKER));
	if (mine) await act(`#${number}: update the screenshot comment`, () => github(`/repos/${REPO}/issues/comments/${mine.id}`, 'PATCH', { body }));
	else await act(`#${number}: add the screenshot comment`, () => github(`/repos/${REPO}/issues/${number}/comments`, 'POST', { body }));
}

// ---- the branch ----------------------------------------------------------------------------------------------------

/**
 * Commit to the branch: its current files, minus everything under `replace`, plus `files` ([{ path, file }]). The
 * branch only moves if it is still where this run read it; if another run moved it first, start again from there.
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
		const kept = (head ? head.files : []).filter((e) => e.type === 'blob' && !e.path.startsWith(replace)).map(treeEntry);
		const tree = await github(`/repos/${REPO}/git/trees`, 'POST', { tree: [...kept, ...added] });
		const commit = await github(`/repos/${REPO}/git/commits`, 'POST', { message, tree: tree.sha, parents: head ? [head.sha] : [] });
		if (await moveBranch({ from: head?.sha, to: commit.sha })) {
			console.log(`${BRANCH}: ${message} (${added.length} images)`);
			return;
		}
		console.log(`${BRANCH} moved meanwhile; trying again (${attempt})`);
		await new Promise((done) => setTimeout(done, 1000 * attempt));
	}
	fail(`${BRANCH}: kept moving; gave up`);
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

function treeEntry(e) {
	return { path: e.path, mode: e.mode, type: 'blob', sha: e.sha };
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

async function github(apiPath, method = 'GET', body = null, okMissing = []) {
	const res = await fetch(API + apiPath, {
		method,
		headers: {
			authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
			accept: 'application/vnd.github+json',
			'x-github-api-version': '2022-11-28',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (okMissing.includes(res.status)) return null;
	if (!res.ok) throw new Error(`${method} ${apiPath}: ${res.status} ${await res.text()}`);
	return res.status === 204 ? null : res.json();
}

async function act(what, run) {
	console.log(DRY_RUN ? `(dry run) ${what}` : what);
	if (!DRY_RUN) await run();
}

/** Print and stop. Messages can quote the untrusted files, so control characters go (no injected workflow commands). */
function fail(message) {
	console.error(`error: ${String(message).replace(/[\u0000-\u001f\u007f]/g, ' ')}`);
	process.exit(2);
}
