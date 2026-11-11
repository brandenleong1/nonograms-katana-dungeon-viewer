// Checks a pull request or a commit message against docs/pr_guidelines.md.
//
//   node tools/check-pr.mjs                                    PR from the environment (PR_TITLE, PR_BODY, PR_AUTHOR,
//                                                              PR_BRANCH; CI)
//   gh pr view 12 --json title,body,author,headRefName | node tools/check-pr.mjs --json
//   node tools/check-pr.mjs --title "[Docs] Feature: Add Style Guide"
//   node tools/check-pr.mjs --branch brandenleong1/docs [--author brandenleong1]
//   git log -1 --format=%B | node tools/check-pr.mjs --commit  a squashed commit on main: title, blank line, PR URL
//
// Errors fail (exit 1); warnings are printed only. In GitHub Actions they show up as annotations.
import fs from 'node:fs';

export const AREAS = ['Gen', 'Combat', 'Save', 'Plan', 'Solve', 'View', 'UI', 'Data', 'Tests', 'Tools', 'CI', 'Docs', 'Game'];
export const QUALIFIERS = ['Parity', 'Fix', 'Feature', 'Performance', 'Refactor', 'Sync'];
const MAX_TITLE = 80;
const BOT_TITLE = /^Auto-Bump \[Utils\] Submodule \(-> [0-9a-f]{7,40}\)$/;   // old direct-to-main bumps, in history only
const BRANCH = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/;
const REQUIRED_SECTIONS = ['Context', 'Changes', 'Testing'];
const PAST_TENSE = /^(\w+ed|Ran|Made|Wrote|Built|Kept|Split|Set|Put|Cut|Left|Took|Gave|Found|Brought|Rewrote|Undid|Bumped)$/;
const NOT_IMPERATIVE = /^(Added|Adds|Fixed|Fixes|Changed|Changes|Removed|Removes|Moved|Moves|Updated|Updates|Renamed|Improved|Improves|Refactored|Implemented|Created|Deleted|Replaced|Made|Makes|Used|Uses)$/;
const SENSITIVE = [
	[/\/home\/(?!<)[\w.-]+\//, 'a personal path (/home/<name>/...)'],
	[/\/Users\/(?!<)[\w.-]+\//, 'a personal path (/Users/<name>/...)'],
	[/[A-Za-z]:\\Users\\(?!<)[\w.-]+/, 'a personal path (C:\\Users\\<name>)'],
	[/\b(ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
	[/\[[^\]]*(guild\d?\.dat|NonogramsKatana\.zip|\.progress)\]\(/i, 'an attached save file'],
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) await main();

async function main() {
	const args = process.argv.slice(2);
	const report = args.includes('--commit') ? checkCommit(await readStdin()) : checkPr(await readPr(args));
	for (const w of report.warnings) annotate('warning', w);
	for (const e of report.errors) annotate('error', e);
	if (!report.errors.length) console.log(`ok${report.warnings.length ? ` (${report.warnings.length} warning(s))` : ''}`);
	process.exit(report.errors.length ? 1 : 0);
}

/** A pull request: { title, body, author, branch } -> { errors, warnings }. Omitted fields aren't checked. */
export function checkPr({ title = null, body = null, author = '', branch = null }) {
	const report = { errors: [], warnings: [] };
	if (title != null) checkTitle(title, report);
	if (body != null) checkBody(body, report);
	if (branch != null) checkBranch(branch, author, report);
	return report;
}

/** A squashed commit on main: the PR title, a blank line, then the PR's URL and nothing else. */
export function checkCommit(message) {
	const report = { errors: [], warnings: [] };
	const [subject, blank, ...rest] = message.replace(/\s+$/, '').split('\n');
	if (BOT_TITLE.test(subject)) return report;
	if (/ \(#\d+\)$/.test(subject)) report.errors.push('Commit: drop the " (#N)" GitHub appends to the title; the PR\'s URL goes in the body.');
	checkTitle(subject.replace(/ \(#\d+\)$/, ''), report);
	const body = rest.join('\n').trim();
	if (blank !== undefined && blank.trim() !== '') report.errors.push('Commit: leave a blank line after the title.');
	if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(body)) {
		report.errors.push('Commit: the body must be only the PR\'s URL (https://github.com/<owner>/<repo>/pull/<n>). Merge with tools/merge-pr.sh.');
	}
	return report;
}

/** Branches are `<your GitHub username>/<short-name>`, e.g. brandenleong1/docs. */
function checkBranch(branch, author, report) {
	const m = BRANCH.exec(branch);
	const expected = `${author || '<username>'}/<short-name>, lowercase (e.g. ${author || 'brandenleong1'}/docs)`;
	if (!m) {
		report.errors.push(`Branch: "${branch}" should be ${expected}.`);
		return;
	}
	if (branch === 'bot/bump-utils') return;   // pushed by the submodule workflow; anyone may open the PR for it
	if (author && m[1].toLowerCase() !== author.toLowerCase()) report.errors.push(`Branch: "${branch}" should start with your username: ${expected}.`);
}

function checkTitle(title, report) {
	const t = title.trim();
	if (t.length > MAX_TITLE) report.errors.push(`Title: ${t.length} characters; keep it to ${MAX_TITLE}.`);
	const m = /^((?:\[[^\]]+\]){1,2}) (\w+): (.+)$/.exec(t);
	if (!m) {
		report.errors.push('Title: use "[Area][Sub-area] Qualifier: Title Case Summary", e.g. "[Plan] Fix: Walk Through Doors Instead Of Smashing Walls".');
		return;
	}
	const [, tags, qualifier, summary] = m;
	checkTags(tags, report);
	if (!QUALIFIERS.includes(qualifier)) report.errors.push(`Title: unknown qualifier "${qualifier}:"; use one of ${QUALIFIERS.map((q) => `${q}:`).join(' ')}.`);
	checkSummary(summary, report);
}

function checkTags(tags, report) {
	const [area, sub] = tags.slice(1, -1).split('][');
	if (!AREAS.includes(area)) report.errors.push(`Title: unknown area "[${area}]"; use one of ${AREAS.map((a) => `[${a}]`).join(' ')}.`);
	if (sub !== undefined && !/^[A-Z][A-Za-z0-9]*$/.test(sub)) report.errors.push(`Title: sub-area "[${sub}]" should be one capitalised word.`);
}

function checkSummary(summary, report) {
	const words = summary.replace(/`[^`]*`/g, 'Code').split(/\s+/);
	if (NOT_IMPERATIVE.test(words[0])) report.errors.push(`Title: say what the change does, imperative ("${imperativeOf(words[0])}", not "${words[0]}").`);
	const lower = words.filter((w) => /^[a-z]/.test(w));
	if (lower.length) report.errors.push(`Title: use Title Case (${lower.slice(0, 3).map((w) => `"${w}"`).join(', ')}).`);
	if (/[.!]$/.test(summary)) report.errors.push('Title: no full stop at the end.');
}

function checkBody(body, report) {
	const text = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '');
	for (const [pattern, what] of SENSITIVE) if (pattern.test(text)) report.errors.push(`Description: contains ${what}. PRs are public; remove it.`);
	const sections = sectionsOf(text);
	for (const name of REQUIRED_SECTIONS) {
		const content = (sections.get(name) || '').replace(/^\s*-\s*$/gm, '').trim();
		if (!content) report.errors.push(`Description: fill in the "## ${name}" section.`);
	}
	for (const name of ['Changes', 'Testing']) checkBullets(name, sections.get(name) || '', report);
}

/** Bullets in Changes / Testing start with a past-tense verb (Added, Fixed, Ran...). A style warning, not an error. */
function checkBullets(name, content, report) {
	for (const line of content.split('\n')) {
		const m = /^- +(\S+)/.exec(line);
		if (m && !PAST_TENSE.test(m[1].replace(/[^\w]/g, ''))) report.warnings.push(`Description: ${name} bullets should start with a past-tense verb ("${line.trim().slice(0, 50)}").`);
	}
}

function sectionsOf(text) {
	const sections = new Map();
	let current = null;
	for (const line of text.split('\n')) {
		const h = /^##\s+(.+?)\s*$/.exec(line);
		if (h) { current = h[1]; sections.set(current, ''); continue; }
		if (current) sections.set(current, sections.get(current) + line + '\n');
	}
	return sections;
}

function imperativeOf(word) {
	return word.replace(/ied$/, 'y').replace(/(ed|es|s)$/, '').replace(/^Mad$/, 'Make').replace(/^Us$/, 'Use');
}

async function readPr(args) {
	if (args.includes('--json')) {
		const pr = JSON.parse(await readStdin());
		return { title: pr.title, body: pr.body ?? '', author: pr.author?.login || '', branch: pr.headRefName ?? null };
	}
	const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] || '' : null);
	if (option('--title') != null || option('--branch') != null) {
		return { title: option('--title'), branch: option('--branch'), author: option('--author') || '' };
	}
	const env = process.env;
	return { title: env.PR_TITLE || '', body: env.PR_BODY ?? '', author: env.PR_AUTHOR || '', branch: env.PR_BRANCH ?? null };
}

function readStdin() {
	return new Promise((resolve) => {
		let data = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (d) => { data += d; });
		process.stdin.on('end', () => resolve(data));
	});
}

function annotate(level, message) {
	console.log(process.env.GITHUB_ACTIONS ? `::${level}::${message}` : `${level}: ${message}`);
}
