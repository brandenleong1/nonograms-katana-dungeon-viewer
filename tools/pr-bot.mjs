// The PR bot (.github/workflows/pr-bot.yml) merges pull requests; people don't. It reports the required `pr-bot` status
// on every open PR's head commit, pending with the reason until the PR is ready. When it is ready, the bot sets the
// status to success and squash-merges in the same moment, with the commit message docs/pr_guidelines.md asks for (the
// PR title, a blank line, the PR's URL). The status is never left green, so there's no window in which a person
// could press Merge and type their own message. Drafts and PRs labelled `hold` are left alone. The bot never submits
// reviews, so it can't stand in for the human approval the ruleset requires.
//
// No code merges unreviewed: an approval holds for the diff it was given on. GitHub dismisses approvals when a push
// changes the PR's diff, and moves them to the new head when it doesn't ("Update branch", a clean rebase). The bot
// dismisses any verdict still pointing at an older commit, and asks those reviewers to review again.
//
//   node tools/pr-bot.mjs review              set `pr-bot` on every open PR, and merge the first one that is ready
//   node tools/pr-bot.mjs after-merge SHA     main moved to SHA (an admin merged by hand): delete the merged PR's branch,
//                                             then review again (the other PRs are now behind main)
//   node tools/pr-bot.mjs prune-branches      delete branches without an open PR that are merged or 30+ days old
//                                             (not bot/screenshots, the screenshot bot's image store)
//   node tools/pr-bot.mjs branches            report every branch: age, PR, ahead/behind main, what prune would do
//   add --dry-run to print what it would do
//
// Ready to merge: not a draft, based on main (a stacked PR waits for the one below it), no merge conflict, up to date with main, every check it depends on passed on the head
// commit, nobody requests changes, every requested reviewer (person or team) has responded, and someone with write
// access approved the head commit (two people when the PR changes CI, the rulesets or the PR tools: CI_PATHS).
//
// Needs GITHUB_TOKEN (contents: write, pull-requests: write, statuses: write, checks: read, actions: write) and
// GITHUB_REPOSITORY.
import { checkPr } from './check-pr.mjs';

const STATUS = 'pr-bot';
const HOLD_LABEL = 'hold';
const POSTCOMMIT = 'postcommit.yml';
const DEPENDS_ON = ['precommit', 'pr-policy'];
const STALE_DAYS = 30;
const KEEP_BRANCHES = new Set(['bot/screenshots']);   // not a PR branch: the screenshot bot's image store
const BOT = 'github-actions[bot]';
const CAN_APPROVE = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);   // review author_association with write access
// PRs touching these need two approvals: a PR's own workflows run from its files, so it could weaken what checks it
const CI_PATHS = [/^\.github\//, /^tools\/(pr-bot|check-pr|screenshot-comment|run-tests)\.mjs$/, /^tools\/(github-setup|merge-pr)\.sh$/];
const API = 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY;
const DRY_RUN = process.argv.includes('--dry-run');

await main();

async function main() {
	if (!REPO || !process.env.GITHUB_TOKEN) fail('Set GITHUB_TOKEN and GITHUB_REPOSITORY.');
	const [command, arg] = process.argv.slice(2).filter((a) => a !== '--dry-run');
	if (command === 'review') return reviewAll();
	if (command === 'after-merge' && arg) return afterMerge(arg);
	if (command === 'prune-branches') return pruneBranches();
	if (command === 'branches') return reportBranches();
	fail('usage: node tools/pr-bot.mjs review | after-merge SHA | prune-branches | branches [--dry-run]');
}

/** Set `pr-bot` on every open PR's head: success when ready, otherwise pending with the reason. */
/**
 * Set `pr-bot` on every open PR, and merge the first ready one. One merge per pass: it moves main, so every other PR
 * is behind and the follow-up review sets them back to pending.
 */
async function reviewAll({ merge = true } = {}) {
	const mainSha = (await github(`/repos/${REPO}/branches/main`)).commit.sha;
	for (const pr of await openPulls()) {
		await resetOutdatedReviews(pr);
		const reason = (await notReadyReason(pr, mainSha)) || heldReason(pr, merge);
		if (reason) {
			await setStatus(pr, 'pending', reason);
			continue;
		}
		const mergedSha = await mergeNow(pr);
		if (!mergedSha) continue;
		await afterBotMerge(pr);
		return;
	}
}

/** main moved because an admin merged by hand: clean up, and every other PR goes back to pending. */
async function afterMerge(sha) {
	await deleteMergedBranches(sha);
	await reviewAll({ merge: false });
}

/** The bot's own merge doesn't trigger push workflows (GitHub's rule for its token), so do their work here. */
async function afterBotMerge(pr) {
	// by the PR itself: right after a merge, GitHub may not list it for the merge commit yet (commits/{sha}/pulls)
	if (pr.head.repo?.full_name === REPO) await act(`#${pr.number}: delete branch ${pr.head.ref}`, () => deleteBranch(pr.head.ref));
	await act(`run ${POSTCOMMIT} on main`, () => github(`/repos/${REPO}/actions/workflows/${POSTCOMMIT}/dispatches`, 'POST', { ref: 'main' }));
	await reviewAll({ merge: false });
}

function heldReason(pr, merge) {
	if ((pr.labels || []).some((l) => l.name === HOLD_LABEL)) return `Ready, but held: remove the \`${HOLD_LABEL}\` label and the bot merges it`;
	if (!merge) return 'Ready: the bot merges it on its next pass';
	return null;
}

/**
 * Turn `pr-bot` green and squash-merge at once, pinned to the reviewed head. Returns the merge commit's SHA, or null
 * (with the status set back to pending) when GitHub refuses.
 */
async function mergeNow(pr) {
	if (pr.base?.ref && pr.base.ref !== 'main') return null;   // notReadyReason holds these; never squash into a side branch
	const title = pr.title.trim();
	const titleErrors = checkPr({ title, author: pr.user?.login || '' }).errors;
	if (titleErrors.length) {
		await setStatus(pr, 'pending', `Title: ${titleErrors[0].replace(/^Title: /, '')}`);
		return null;
	}
	await setStatus(pr, 'success', 'Merging');
	if (DRY_RUN) {
		console.log(`(dry run) #${pr.number}: squash-merge "${title}"`);
		return null;
	}
	try {
		const merged = await github(`/repos/${REPO}/pulls/${pr.number}/merge`, 'PUT', {
			merge_method: 'squash',
			sha: pr.head.sha,
			commit_title: title,
			commit_message: pr.html_url,
		});
		console.log(`#${pr.number}: merged as ${merged.sha.slice(0, 7)}`);
		return merged.sha;
	} catch (e) {
		console.log(`#${pr.number}: merge refused: ${e.message}`);
		await setStatus(pr, 'pending', `GitHub refused the merge; the bot retries: ${e.message.replace(/^\S+ \S+: /, '')}`);
		return null;
	}
}

/** Branches without an open PR: delete them once merged into main, or after STALE_DAYS without a commit. */
async function pruneBranches() {
	for (const b of await branchReport()) {
		if (b.action === 'keep') continue;
		await act(`delete ${b.name} (${b.action})`, () => deleteBranch(b.name));
	}
}

async function reportBranches() {
	const rows = await branchReport();
	console.log('branch'.padEnd(36), 'age'.padStart(5), 'PR'.padStart(6), 'ahead/behind'.padStart(13), ' prune');
	for (const b of rows) {
		console.log(b.name.padEnd(36), `${b.ageDays}d`.padStart(5), (b.pr ? `#${b.pr}` : '-').padStart(6), `${b.ahead}/${b.behind}`.padStart(13), ` ${b.action}`);
	}
}

// ---- readiness ------------------------------------------------------------------------------------------------------

async function notReadyReason(pr, mainSha) {
	if (pr.draft) return 'Draft';
	const stacked = await stackedReason(pr);
	if (stacked) return stacked;
	const detail = await github(`/repos/${REPO}/pulls/${pr.number}`);
	if (detail.mergeable === false) return 'Merge conflict with main';
	const compare = await github(`/repos/${REPO}/compare/${mainSha}...${pr.head.sha}`);
	if (compare.behind_by > 0) return `${compare.behind_by} commit(s) behind main: update the branch`;
	const unmet = await unmetChecks(pr.head.sha);
	if (unmet.length) return `Waiting for ${unmet.join(', ')}`;
	const verdicts = await currentReviews(pr);
	if (verdicts.some((r) => r.state === 'CHANGES_REQUESTED')) return 'Changes requested';
	const waitingFor = [...(detail.requested_reviewers || []).map((u) => `@${u.login}`), ...(detail.requested_teams || []).map((t) => `team ${t.name}`)];
	if (waitingFor.length) return `Waiting for review from ${waitingFor.join(', ')}`;
	const approvers = verdicts.filter((r) => r.state === 'APPROVED' && r.commit_id === pr.head.sha && CAN_APPROVE.has(r.author_association));
	const needed = (await changesCi(pr)) ? 2 : 1;
	if (approvers.length < needed) {
		return needed === 2
			? `Changes CI or the PR tools: needs 2 reviews of the latest commit (has ${approvers.length})`
			: 'Needs a review of the latest commit';
	}
	return null;
}

/**
 * A PR based on another branch than main (a stacked PR) waits. Merging it would squash it into that branch, not into
 * main. Once the PR below it merges, the bot deletes that branch and GitHub retargets this PR to main.
 */
async function stackedReason(pr) {
	const base = pr.base?.ref;
	if (!base || base === 'main') return null;
	const below = (await openPulls()).find((p) => p.head?.ref === base && p.head?.repo?.full_name === REPO);
	return below
		? `Stacked on #${below.number}: waits for it to merge (GitHub then retargets this PR to main)`
		: `Based on ${base}, not main: change the base branch to main`;
}

async function changesCi(pr) {
	for (let page = 1; ; page++) {
		const files = await github(`/repos/${REPO}/pulls/${pr.number}/files?per_page=100&page=${page}`);
		if (files.some((f) => CI_PATHS.some((re) => re.test(f.filename) || (f.previous_filename && re.test(f.previous_filename))))) return true;
		if (files.length < 100) return false;
	}
}

/** Each reviewer's latest standing verdict (approve / request changes); comments and dismissed reviews don't count. */
async function currentReviews(pr) {
	const latest = new Map();
	for (const r of await github(`/repos/${REPO}/pulls/${pr.number}/reviews?per_page=100`)) {
		if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') latest.set(r.user.login, r);
		if (r.state === 'DISMISSED') latest.delete(r.user.login);
	}
	return [...latest.values()];
}

/** Verdicts given on an older head: dismiss them and ask those reviewers to look again. */
async function resetOutdatedReviews(pr) {
	const outdated = (await currentReviews(pr)).filter((r) => r.commit_id !== pr.head.sha && r.user.login !== BOT);
	for (const r of outdated) {
		await act(`#${pr.number}: dismiss ${r.user.login}'s ${r.state.toLowerCase()} review (on ${r.commit_id.slice(0, 7)})`, () =>
			github(`/repos/${REPO}/pulls/${pr.number}/reviews/${r.id}/dismissals`, 'PUT', {
				event: 'DISMISS',
				message: `New commits since this review (now at ${pr.head.sha.slice(0, 7)}). Please review again.`,
			}));
	}
	const reviewers = [...new Set(outdated.map((r) => r.user.login))].filter((login) => login !== pr.user?.login);
	if (reviewers.length) {
		await act(`#${pr.number}: re-request ${reviewers.join(', ')}`, () => github(`/repos/${REPO}/pulls/${pr.number}/requested_reviewers`, 'POST', { reviewers }));
	}
}

/** Checks the bot depends on without a success on `sha`, from check runs (workflows) or statuses (the submodule bot). */
async function unmetChecks(sha) {
	const runs = (await github(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`)).check_runs;
	const statuses = (await github(`/repos/${REPO}/commits/${sha}/status`)).statuses;
	const passed = new Set([
		...runs.filter((r) => r.conclusion === 'success').map((r) => r.name),
		...statuses.filter((s) => s.state === 'success').map((s) => s.context),
	]);
	return DEPENDS_ON.filter((name) => !passed.has(name));
}

/** Only writes when the status changes, so the PR's timeline doesn't fill up with repeats. */
async function setStatus(pr, state, description) {
	const current = (await github(`/repos/${REPO}/commits/${pr.head.sha}/status`)).statuses.find((s) => s.context === STATUS);
	if (current && current.state === state && current.description === description) return;
	await act(`#${pr.number} ${pr.head.sha.slice(0, 7)}: ${state} (${description})`, () => github(`/repos/${REPO}/statuses/${pr.head.sha}`, 'POST', {
		state,
		context: STATUS,
		description: description.slice(0, 140),
	}));
}

// ---- branches -------------------------------------------------------------------------------------------------------

/** Every branch but main: { name, ageDays, pr, ahead, behind, action: 'keep' | 'merged' | 'stale' } */
async function branchReport() {
	const prByBranch = new Map((await openPulls()).filter((p) => p.head.repo?.full_name === REPO).map((p) => [p.head.ref, p.number]));
	const rows = [];
	for (const branch of await github(`/repos/${REPO}/branches?per_page=100`)) {
		if (branch.name === 'main' || KEEP_BRANCHES.has(branch.name)) continue;
		const commit = await github(`/repos/${REPO}/commits/${branch.commit.sha}`);
		const ageDays = Math.floor((Date.now() - Date.parse(commit.commit.committer.date)) / 86400000);
		// 404: no history in common with main (a hand-made orphan branch); judged by age alone
		const compare = (await github(`/repos/${REPO}/compare/main...${branch.commit.sha}`, 'GET', null, [404])) || { ahead_by: -1, behind_by: -1 };
		const pr = prByBranch.get(branch.name) || null;
		const merged = !pr && (compare.ahead_by === 0 || (await mergedAsIs(branch)));
		const action = pr ? 'keep' : merged ? 'merged' : ageDays >= STALE_DAYS ? 'stale' : 'keep';
		rows.push({ name: branch.name, ageDays, pr, ahead: compare.ahead_by, behind: compare.behind_by, action });
	}
	return rows;
}

/**
 * Whether a PR merged this branch exactly as it is now (a squash merge leaves the branch "ahead" of main). A branch
 * with commits pushed after its PR merged isn't counted: that's new work.
 */
async function mergedAsIs(branch) {
	const owner = REPO.split('/')[0];
	const pulls = await github(`/repos/${REPO}/pulls?state=closed&head=${encodeURIComponent(`${owner}:${branch.name}`)}&per_page=10`);
	return pulls.some((p) => p.merged_at && p.head.sha === branch.commit.sha);
}

/** The PRs merged as `sha` (normally one): delete their head branch if it lives in this repository. */
async function deleteMergedBranches(sha) {
	for (const pr of await github(`/repos/${REPO}/commits/${sha}/pulls`)) {
		if (!pr.merged_at || pr.head.repo?.full_name !== REPO || pr.head.ref === 'main') continue;
		await act(`#${pr.number}: delete branch ${pr.head.ref}`, () => deleteBranch(pr.head.ref));
	}
}

function deleteBranch(name) {
	return github(`/repos/${REPO}/git/refs/heads/${name.split('/').map(encodeURIComponent).join('/')}`, 'DELETE', null, [404, 422]);
}

// ---- GitHub API -----------------------------------------------------------------------------------------------------

function openPulls() {
	return github(`/repos/${REPO}/pulls?state=open&per_page=100`);
}

/** A REST call; `okMissing` lists statuses that mean "already done" (e.g. a branch that's already gone). */
async function github(path, method = 'GET', body = null, okMissing = []) {
	const res = await fetch(API + path, {
		method,
		headers: {
			authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
			accept: 'application/vnd.github+json',
			'x-github-api-version': '2022-11-28',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (okMissing.includes(res.status)) return null;
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return res.status === 204 ? null : res.json();
}

async function act(what, run) {
	console.log(DRY_RUN ? `(dry run) ${what}` : what);
	if (!DRY_RUN) await run();
}

function fail(message) {
	console.error(message);
	process.exit(2);
}
