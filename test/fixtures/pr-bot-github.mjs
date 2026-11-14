// A fake GitHub API for test/pr-bot.mjs, loaded with `node --import` before tools/pr-bot.mjs. The scene is in the
// PR_BOT_SCENE environment variable (JSON): { prs: [{ number, base, ref, approved }] }, every PR up to date with main,
// with green checks. It prints each write the bot makes, one JSON line per call, for the test to read.
const scene = JSON.parse(process.env.PR_BOT_SCENE);
const REPO = 'o/r';
const pulls = scene.prs.map((p) => ({
	number: p.number,
	title: `[Docs] Fix: Thing ${p.number}`,
	labels: [],
	draft: false,
	user: { login: 'alice' },
	html_url: `https://github.com/${REPO}/pull/${p.number}`,
	head: { sha: `h${p.number}`, ref: p.ref, repo: { full_name: REPO } },
	base: { ref: p.base },
}));
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const byNumber = (p) => scene.prs.find((x) => String(x.number) === p);

globalThis.fetch = async (url, { method = 'GET', body } = {}) => {
	const path = new URL(url).pathname;
	if (method !== 'GET') {
		console.log(JSON.stringify({ method, path, body: body ? JSON.parse(body) : null }));
		if (/\/pulls\/(\d+)\/merge$/.test(path)) return ok({ sha: 'merged', merged: true });
		return ok({});
	}
	let m;
	if (path === `/repos/${REPO}/branches/main`) return ok({ commit: { sha: 'm0' } });
	if (path === `/repos/${REPO}/pulls`) return ok(pulls);
	if ((m = path.match(/\/pulls\/(\d+)$/))) return ok({ mergeable: true, requested_reviewers: [], requested_teams: [] });
	if ((m = path.match(/\/pulls\/(\d+)\/reviews$/))) {
		return ok(byNumber(m[1]).approved ? [{ id: 1, user: { login: 'bob' }, state: 'APPROVED', commit_id: `h${m[1]}`, author_association: 'COLLABORATOR' }] : []);
	}
	if (/\/pulls\/\d+\/files$/.test(path)) return ok([{ filename: 'docs/x.md' }]);
	if (/\/compare\//.test(path)) return ok({ behind_by: 0, ahead_by: 1 });
	if (/\/check-runs$/.test(path)) return ok({ check_runs: [{ name: 'precommit', conclusion: 'success', status: 'completed' }, { name: 'pr-policy', conclusion: 'success', status: 'completed' }] });
	if (/\/status$/.test(path)) return ok({ statuses: [] });
	if (/\/commits\/[^/]+\/pulls$/.test(path)) return ok([]);
	if (/\/git\/refs\/heads\//.test(path)) return ok({});
	throw new Error(`unmocked GET ${path}`);
};
