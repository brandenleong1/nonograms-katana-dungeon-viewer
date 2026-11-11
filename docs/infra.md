# Infrastructure: build, hosting, CI, data

## No build step

The site is static: `index.html`, `style.css`, `init.js` and ES modules under `js/`. There's no bundler, transpiler or
package install. Whatever is in the repository is what the browser loads.

- **Local:** `npm run serve` (Python's static server on `http://127.0.0.1:8000`, loopback only). Any static server
  works, but it must be served over HTTP: module workers don't load from `file://`.
- **Clone with the submodule:** `git clone --recurse-submodules …`. In an existing clone, run
  `git submodule update --init`. Without it the page has no layout, themes or popups.

## Hosting

Any static host works. On GitHub Pages: Settings → Pages → Deploy from a branch → `main`, `/ (root)`. Pages fetches
the `lib/utils` submodule over its public HTTPS URL. There's nothing to configure: no server code, no environment
variables, no secrets.

## Browser requirements

The site needs a current browser:

| Feature | Used for | Oldest browsers that have it |
|---|---|---|
| ES modules, dynamic `import()` | everything | all current browsers |
| Module Web Workers | the solver (`js/ui/solve-host.js`, the worker pool) | Chrome 80, Firefox 114, Safari 15 |
| `DecompressionStream` | reading the save export (zip, gzip) | Chrome 80, Firefox 113, Safari 16.4 |
| Canvas 2D | the map | all |

Without module workers the map and route still work, but the solver doesn't.

## What the page stores

Everything stays in the browser. Nothing is sent anywhere.

| Key | Where | What |
|---|---|---|
| `themeID` | cookie | chosen theme (shared with the other sites using `lib/utils`) |
| `nkd-save`, `nkd-save-name`, `nkd-hero`, `nkd-use-profile` | sessionStorage | the imported `guild.dat` (base64), chosen hero, "use my progress"; gone when the tab closes, or on Forget |
| `nkd-progress` | localStorage | "Your progress" edits |
| `nkd-solve` | localStorage | solver settings |
| `nkd-solver`, `nkd-layers`, `nkd-effort` | localStorage | solver column shown, map layers, route preference |

## CI (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| `precommit.yml` | every PR; on demand | `syntax` (`node --check` on every module), `test` (`npm test` on Node 18 and 22), `integration` (browser smoke test). The `precommit` job passes only if all of them did. |
| `pr-policy.yml` | PR opened, edited or pushed | `pr-policy`: the title, description and branch name follow [pr_guidelines.md](pr_guidelines.md) (`tools/check-pr.mjs`). |
| `pr-bot.yml` | after Precommit / PR Policy / PR Reviewed; on merge; hourly; daily | `pr-bot` status on every open PR, resetting reviews made on older commits; deletes merged branches; prunes stale branches (below). |
| `pr-reviewed.yml` | a review is submitted, edited or dismissed | nothing itself; it wakes the PR bot, which has the write token review events from forks lack |
| `postcommit.yml` | push to `main`; weekly; on demand | `commit-format` (the squash commit is title, blank line, PR URL), then `test` and `smoke` on the merged commit. The weekly run catches drift in browsers, runners and `lib/utils`. |
| `stale.yml` | daily | closes PRs with no activity for 30 days, and deletes their branches. |
| `update-submodules.yml` | daily; on demand | if `brandenleong1/utils` moved, opens or updates a `bot/bump-utils` PR. |

Notes:

- The integration job installs Playwright and Chromium in CI only; the site still has no dependencies.
- PRs opened with the workflow token don't trigger workflows, so the submodule bot dispatches `precommit` and reports
  `pr-policy` for its own PRs (their fixed title is the one exception in `tools/check-pr.mjs`).
- The PR bot runs `tools/pr-bot.mjs` from `main` and never checks out PR code, so a PR can't change what it does.

## The PR bot

The bot merges pull requests; people don't. It sets a **`pr-bot`** commit status on each open PR's head, and keeps it
**pending**, with the reason, until the PR is ready. When it is ready, the bot turns the status **green and
squash-merges in the same moment**, with the guideline commit message (title, blank line, PR URL). The status is never
left green, so there's no window in which a person could press Merge and type their own message. It also never
submits GitHub reviews, which would count toward the human approval.

Ready means the PR:
- is not a draft, has no merge conflict, and isn't labelled `hold`;
- is up to date with `main`;
- has `precommit` and `pr-policy` green on its head commit;
- has no reviewer requesting changes;
- has **no outstanding review requests**: every requested reviewer, person or team, has responded (GitHub removes a
  request once that reviewer submits a review, and the bot re-requests everyone whose review it resets);
- has an approval **of its head commit** from someone with write access;
- has a title that passes `tools/check-pr.mjs`.

Example pending reasons: "3 commit(s) behind main: update the branch", "Waiting for review from @alice", "Needs a
review of the latest commit", "Ready, but held: remove the `hold` label".

It merges at most one PR per pass, since a merge moves `main` and puts every other PR behind. Merges made with the
workflow token don't trigger `push` workflows, so after its own merge the bot deletes the branch, re-checks the other
PRs, and dispatches `postcommit` itself. It runs after Precommit, PR Policy and PR Reviewed, on label and
ready-for-review changes (`pull_request_target`, still running only code from `main`), and hourly.

**No code merges unreviewed.** A review counts only for the commit it was given on. Whenever the head moves (new
commits, a rebase or force-push, "Update branch"), the bot dismisses the older approvals and change requests, and
asks those reviewers to review again. GitHub's own "dismiss stale approvals" can keep an approval when a push doesn't
change the diff; the bot doesn't. The ruleset also requires the latest push to be approved by someone other than whoever
pushed it.

When any PR merges, `main` moves. Every other PR is then behind `main`, and the bot sets it back to pending. Its
author updates the branch, the checks run against the new `main`, a reviewer approves the new head, and the bot
merges it. This gives a merge
queue's guarantee (what merges was tested on what it lands on) without a merge queue, which GitHub doesn't offer for
personal repositories on the free plan.

**Branches.** No stale branches are left lying around:

- a merged PR's branch is deleted, by the repository setting and again by the bot;
- a PR with no activity for 30 days is closed and its branch deleted (`stale.yml`; label `keep-open` exempts it);
- every day the bot deletes branches **with no open PR** that are fully merged into `main`, or that have had no
  commit for 30+ days.

To see where every branch stands without changing anything:

```sh
GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=brandenleong1/nonograms-katana-dungeon-viewer node tools/pr-bot.mjs branches
```

It prints each branch's age, PR, commits ahead/behind `main`, and what the daily prune would do (`keep`, `merged`,
`stale`). Add `--dry-run` to `prune-branches` or `review` to preview them.

## Branch protection

Two rulesets in `.github/rulesets/`.

**`main.json`**, on `main`:

- changes arrive through a pull request with **one approving human review** of the latest push, given by someone other
  than whoever pushed it; approvals are dismissed when new commits are pushed (and by the PR bot on any head change);
  all review threads are resolved;
- **`precommit`**, **`pr-policy`** and **`pr-bot`** must pass, on a branch **up to date with `main`**;
- squash merges only, linear history, and `main` can't be force-pushed or deleted;
- **repository admins** may bypass the rules, but only when merging a pull request (`bypass_mode: pull_request`);
  direct pushes to `main` are blocked for everyone.

**`branch-names.json`**, on every other branch: a branch can only be created if its name is `<something>/<something>`.
`pr-policy` then checks that the first part is the PR author's username, e.g. `brandenleong1/docs`. Branches in forks
are only held to the `pr-policy` check.

**Why admins can bypass:** GitHub doesn't let anyone approve their own PR, so without it a solo maintainer could never
merge. Rulesets can't name a user, only roles, teams and apps. On a personal repository the owner is the only admin,
so the admin role means the owner. A solo maintainer's own PRs can't get a human approval, so the bot never merges them; you merge those yourself with
admin bypass: `tools/merge-pr.sh <n> --admin` (or the "bypass rules" box on github.com, writing the message by
hand). Bypassing skips every rule for that merge, so wait for `precommit` and `pr-policy` first. Once
there's a second maintainer, remove the entry and review each other's PRs.

**Apply everything** (merge settings, Actions permissions, both rulesets, labels) with:

```sh
tools/github-setup.sh      # needs gh, logged in as a repository admin; safe to re-run
```

It sets:

- **Merging:** squash only, commit title = PR title, blank body, head branches deleted on merge, "Update branch" offered.
- **Actions:** read-only token by default, and allowed to create pull requests, which the submodule bot needs. GitHub
  calls the setting "create and approve"; no workflow here approves.
- **Rulesets:** each file in `.github/rulesets/`, created or updated by name.
- **Labels:** `stale`, `keep-open`, `mismatch`, `hold`.

## Game version

The ports, `data/` and `test/fixtures/` match the game version in the README's
[Game version](../README.md#game-version) table (the APK manifest's `versionName` and `versionCode`). The site reads
the same values from `data/game-version.json` and shows them in Help. `test/version.mjs` (part of `npm test`) fails if
the two disagree. Dungeons from other versions of the game may differ wherever the game's rules or tables
changed.

When the game updates, a maintainer syncs everything in one `[Game] Sync:` PR ([pr_guidelines.md](pr_guidelines.md#game-version-syncs)):

1. Rebuild the oracle from the new version.
2. Regenerate `data/tables.json`, `data/names.json` and the reference output.
3. Port the changed methods into `js/gen/`, `js/combat/` and `js/save/`.
4. Run every parity suite.
5. Update the README's version table and `data/game-version.json`.

Until then, the site keeps matching the old version.

## Data files

`data/tables.json` and `data/names.json` are generated from the game by the maintainer. Don't edit them by hand: the
generator and engine depend on their exact contents, and the parity tests would no longer mean anything.

- `tables.json`: numeric tables (room shapes, object, creature and item definitions, decoration weights, a new
  player's profile). Exported by the oracle's `tables` mode.
- `names.json`: short English display names (items, skills, quests) from the game's string resources.

If a table looks wrong, open an issue with the dungeon label and what the game shows.

## The oracle (maintainers only)

The parity suites compare the ports against the game's own code, run headless on the JVM. That tooling, and the game
files it needs, live in a separate private project and are not distributed, since they contain the game's code.

What the suites read, all under `~/.cache/nk-oracle/` (Linux filesystem; it's large):

| Directory | Contents | Rebuilt by |
|---|---|---|
| `fx7/` | generator dumps, 40 seeds × 27 types | the oracle's `batch` mode |
| `fights/` | the combat corpus: fights, scenarios, profile fights | `test/make-fights.sh` |
| `save/` | save goldens: the game's loader on real and synthetic saves | `node test/save.mjs --oracle` |
| `prog/` | generation under progress states | `node test/progress.mjs --oracle` |

`test/fixtures/` holds a few `fx7`-style dumps in the repository, so `npm test` works without any of this.
