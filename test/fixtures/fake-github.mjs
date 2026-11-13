// An in-memory GitHub for test/screenshot-comment.mjs: preload it with `node --import` and tools/screenshot-comment.mjs
// talks to it instead of api.github.com. It knows the endpoints that tool uses (pulls, the git data API, issue
// comments) and can be told to fail requests, so retries and the failure comment can be tested without a network.
//
// Configuration, JSON in $FAKE_GITHUB:
//   pulls    [{ number, sha }]        the open pull requests
//   branch   { path: text }           the files on bot/screenshots (none: the branch doesn't exist yet)
//   comments [{ id, number, body }]   comments already there (by the bot)
//   faults   [{ match, bodyHas, times, status, message, headers, network, afterSuccess }]
//                                     fail the next `times` requests whose "METHOD /path" contains `match` (and whose body
//                                     contains `bodyHas`, if given): answer
//                                     `status` with `message`, or drop the connection (network); afterSuccess does the
//                                     request first, then fails (the answer got lost)
//   race     true                     another run moves the branch just before our first update of it
// What happened is written to $FAKE_GITHUB_OUT as JSON when the process exits: { calls, comments, branch, commits }.
import crypto from 'node:crypto';
import fs from 'node:fs';

const config = JSON.parse(process.env.FAKE_GITHUB || '{}');
const BRANCH = 'bot/screenshots';
const BOT = 'github-actions[bot]';

const blobs = new Map();       // sha -> base64
const trees = new Map();       // sha -> Map(path -> { mode, sha })
const commits = new Map();     // sha -> { message, tree, parents }
let head = null;               // the branch's commit sha
const calls = [];
const treeSizes = [];          // how many entries each tree request carried
const comments = (config.comments || []).map((c) => ({ ...c, user: { login: BOT } }));
let nextCommentId = 1000;
let raced = !config.race;
const faults = (config.faults || []).map((f) => ({ ...f, left: f.times ?? 1 }));

const hash = (text) => crypto.createHash('sha1').update(text).digest('hex');
const treeSha = (entries) => hash(JSON.stringify([...entries].sort(([a], [b]) => (a < b ? -1 : 1))));
const blobSha = (base64) => {
	const sha = hash(`blob ${base64}`);
	blobs.set(sha, base64);
	return sha;
};
function addCommit(message, files, parents) {
	const entries = new Map(Object.entries(files).map(([p, text]) => [p, { mode: '100644', sha: blobSha(Buffer.from(text).toString('base64')) }]));
	return makeCommit(message, entries, parents);
}
function makeCommit(message, entries, parents) {
	const tree = treeSha(entries);
	trees.set(tree, entries);
	const sha = hash(JSON.stringify({ message, tree, parents, n: commits.size }));
	commits.set(sha, { message, tree, parents });
	return sha;
}
if (config.branch) head = addCommit('start', config.branch, []);

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms >= 30000 ? ms : 0, ...args);   // no waiting between retries (a request's own time limit stays)

process.on('exit', () => {
	const files = {};
	if (head) for (const [p, e] of trees.get(commits.get(head).tree)) files[p] = Buffer.from(blobs.get(e.sha), 'base64').toString('latin1');
	fs.writeFileSync(process.env.FAKE_GITHUB_OUT, JSON.stringify({ calls, comments, branch: files, commits: [...commits.values()].map((c) => c.message), treeSizes }));
});
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const hasTree = (sha) => trees.has(sha);

globalThis.fetch = async (url, { method = 'GET', body } = {}) => {
	const route = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '') + new URL(url).search;
	calls.push(`${method} ${route}`);
	if (method === 'POST' && route === '/git/trees') treeSizes.push(JSON.parse(body).tree.length);   // failed ones too
	const fault = faults.find((f) => f.left > 0 && `${method} ${route}`.includes(f.match) && (!f.bodyHas || (body || '').includes(f.bodyHas)));
	if (fault) {
		fault.left--;
		if (fault.network) throw new TypeError('fetch failed');
		if (!fault.afterSuccess) return json(fault.status, { message: fault.message }, fault.headers);
		await handle(method, route, body ? JSON.parse(body) : null);
		return json(fault.status, { message: fault.message }, fault.headers);
	}
	return handle(method, route, body ? JSON.parse(body) : null);
};

async function handle(method, route, body) {
	let m;
	if (method === 'GET' && route.startsWith('/pulls?')) {
		const page = +new URL(`http://x${route}`).searchParams.get('page');
		return json(200, page > 1 ? [] : (config.pulls || []).map((p) => ({ number: p.number, head: { sha: p.sha } })));
	}
	if (method === 'GET' && route === `/git/ref/heads/${BRANCH}`) return head ? json(200, { object: { sha: head } }) : json(404, { message: 'Not Found' });
	if (method === 'GET' && (m = route.match(/^\/git\/commits\/(\w+)$/))) return json(200, { sha: m[1], tree: { sha: commits.get(m[1]).tree } });
	if (method === 'GET' && (m = route.match(/^\/git\/trees\/(\w+)\?recursive=1$/))) {
		const out = [];
		const dirs = new Set();
		for (const [p, e] of trees.get(m[1])) {
			const parts = p.split('/');
			for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
			out.push({ path: p, mode: e.mode, type: 'blob', sha: e.sha });
		}
		return json(200, { sha: m[1], truncated: false, tree: [...[...dirs].map((p) => ({ path: p, mode: '040000', type: 'tree', sha: hash(p) })), ...out] });
	}
	if (method === 'POST' && route === '/git/blobs') return json(201, { sha: blobSha(body.content) });
	if (method === 'POST' && route === '/git/trees') {
		if (body.base_tree && !hasTree(body.base_tree)) return json(422, { message: 'base tree not found' });
		const entries = new Map(body.base_tree ? trees.get(body.base_tree) : []);
		for (const e of body.tree) {
			if (e.sha === null) entries.delete(e.path);
			else if (blobs.has(e.sha)) entries.set(e.path, { mode: e.mode, sha: e.sha });
			else return json(422, { message: `tree.sha ${e.sha} not found` });
		}
		const sha = treeSha(entries);
		trees.set(sha, entries);
		return json(201, { sha });
	}
	if (method === 'POST' && route === '/git/commits') {
		if (!hasTree(body.tree)) return json(422, { message: 'tree not found' });
		const sha = hash(JSON.stringify({ ...body, n: commits.size }));
		commits.set(sha, { message: body.message, tree: body.tree, parents: body.parents });
		return json(201, { sha });
	}
	if (method === 'POST' && route === '/git/refs') {
		if (head) return json(422, { message: 'Reference already exists' });
		head = body.sha;
		return json(201, {});
	}
	if (method === 'PATCH' && route === `/git/refs/heads/${BRANCH}`) {
		if (!raced) {
			raced = true;
			head = makeCommit('another run', new Map([...trees.get(commits.get(head).tree), ['auto/pr-99/abcdef0/other.png', { mode: '100644', sha: blobSha(Buffer.from('other').toString('base64')) }]]), [head]);
		}
		const descends = (sha) => sha === head || (commits.get(sha).parents || []).some(descends);
		if (!body.force && !descends(body.sha)) return json(422, { message: 'Update is not a fast forward' });
		head = body.sha;
		return json(200, { object: { sha: head } });
	}
	if (method === 'GET' && (m = route.match(/^\/issues\/(\d+)\/comments\?/))) return json(200, comments.filter((c) => c.number === +m[1]));
	if (method === 'POST' && (m = route.match(/^\/issues\/(\d+)\/comments$/))) {
		comments.push({ id: nextCommentId++, number: +m[1], body: body.body, user: { login: BOT } });
		return json(201, {});
	}
	if (method === 'PATCH' && (m = route.match(/^\/issues\/comments\/(\d+)$/))) {
		comments.find((c) => c.id === +m[1]).body = body.body;
		return json(200, {});
	}
	return json(404, { message: `the fake GitHub doesn't know ${method} ${route}` });
}
