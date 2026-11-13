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
| Top-level `await` | the map's names and kinds (`js/view/catalog.js` loads `data/catalog.json`) | Chrome 89, Firefox 89, Safari 15 |
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
| `precommit.yml` | every PR; on demand | `syntax` (`node --check` on every module), `test` (`tools/run-tests.mjs`, every standalone suite, on Node 18 and 22), `integration` (browser smoke test). The `precommit` job passes only if all of them did. |
| `pr-policy.yml` | PR opened, edited or pushed | `pr-policy`: the title, description and branch name follow [pr_guidelines.md](pr_guidelines.md) (`tools/check-pr.mjs`). |
| `pr-bot.yml` | after Precommit / PR Policy / PR Reviewed; on merge; hourly; daily | `pr-bot` status on every open PR, resetting reviews made on older commits; deletes merged branches; prunes stale branches (below). |
| `pr-reviewed.yml` | a review is submitted, edited or dismissed | nothing itself; it wakes the PR bot, which has the write token review events from forks lack |
| `postcommit.yml` | push to `main`; weekly; on demand | `commit-format` (the squash commit is title, blank line, PR URL), then `test` and `smoke` on the merged commit. The weekly run catches drift in browsers, runners and `lib/utils`. |
| `stale.yml` | daily | closes PRs with no activity for 30 days, and deletes their branches. |
| `screenshots.yml` | PR opened or pushed | screenshots of the main views on `main` and on the PR (`tools/screenshots.mjs`), uploaded as files. |
| `screenshot-comment.yml` | after Screenshots; daily | posts the views that look different on the PR (`tools/screenshot-comment.mjs`); daily, deletes old images. See [Screenshots](#screenshots). |
| `update-submodules.yml` | daily; on demand | if `brandenleong1/utils` moved, pushes the bump to `bot/bump-utils` and puts an "Open the pull request" link in the run summary; someone with write access opens it. |

Notes:

- The integration job installs Playwright and Chromium in CI only; the site still has no dependencies.
- The submodule workflow doesn't open PRs itself. That needs "Allow GitHub Actions to create and approve pull
  requests", which would also let a workflow approve a PR and stand in for the second person. A person opens the bump
  PR from the link, and it goes through the usual checks and review. `bot/bump-utils` is the one branch name
  `pr-policy` accepts without a username.
- The PR bot runs `tools/pr-bot.mjs` from `main` and never checks out PR code, so a PR can't change what it does.

## Screenshots

Every PR gets a **Screenshots** comment, so UI changes can be reviewed from the PR page. On each push,
`screenshots.yml` takes the same 56 views of `main` and of the PR: the map in every theme and dungeon family, windows
from a phone to a 2560 px screen, rooms zoomed in, clicks on the map and the lists, the hover tooltip, every map layer,
the solver's settings and a finished plan in each mode, and every popup. They all use a new game and fixed labels, so
no save data is ever in them ([the list](testing.md#screenshots)). The run keeps the views that look different,
compared pixel by pixel. Then `screenshot-comment.yml` posts them in a before/after table, in the list's order, and
edits the same comment on later pushes. A view `main` can't show yet (it needs a control the PR adds) is posted on
its own as a new view. If nothing looks different, the comment says so. If the run failed, the comment links to it.

- **Where the images live:** the `bot/screenshots` branch, under `auto/pr-<n>/<commit>/`. It isn't part of the site.
  Runs for several PRs can finish at once. Each adds a commit and moves the branch only if no other run moved it
  first, and tries again otherwise, so no PR's images are lost. Daily, the bot deletes the images of PRs closed 30+
  days ago, so old PR pages show broken images by then. It also squashes the branch to one commit, so old images don't
  pile up in its history. The PR bot never prunes this branch.
- **Safety:** the Screenshots run uses the PR's own code (it may be a fork), with a read-only token, and only uploads
  files. The comment workflow runs `tools/screenshot-comment.mjs` from `main` and treats those files as untrusted
  data. It parses and checks the manifest, accepts only regular PNG files of bounded size under strict names, and
  puts nothing from them into the comment but those names.
- **More images:** the comment covers fixed views. For anything else (another dungeon, a longer solve, a state the
  views don't reach), add images to the PR description: drag them into the editor on github.com, or push them to
  `bot/screenshots` under `pr-<n>/` and link `https://raw.githubusercontent.com/<repo>/bot/screenshots/pr-<n>/<file>.png`.
  The bot leaves `pr-<n>/` alone.
- **Locally:** `node tools/screenshots.mjs --out /tmp/shots` shoots this checkout. Add `--before <main worktree>` to
  keep only what changed, and `--only <group>` for a few views ([testing.md](testing.md#screenshots)).
- **Time:** most of the job is shooting both checkouts on its 4-core runner, three pages at a time: about 3 minutes.

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
- has an approval **of its head commit** from someone with write access, or from **two** people if it changes CI,
  the rulesets or the PR tools (`.github/`, `tools/pr-bot.mjs`, `tools/check-pr.mjs`, `tools/run-tests.mjs`,
  `tools/screenshot-comment.mjs`, `tools/github-setup.sh`, `tools/merge-pr.sh`): a PR's own workflows run from its
  files, so it could weaken what checks it. Test files aren't on the list: adding or changing a test needs one
  approval, and taking one out of CI shows in the diff;
- has a title that passes `tools/check-pr.mjs`.

Example pending reasons: "3 commit(s) behind main: update the branch", "Waiting for review from @alice", "Needs a
review of the latest commit", "Ready, but held: remove the `hold` label".

It merges at most one PR per pass, since a merge moves `main` and puts every other PR behind. Merges made with the
workflow token don't trigger `push` workflows, so after its own merge the bot deletes the branch, re-checks the other
PRs, and dispatches `postcommit` itself. It runs after Precommit, PR Policy and PR Reviewed, on label and
ready-for-review changes (`pull_request_target`, still running only code from `main`), and hourly.

**No code merges unreviewed.** An approval holds only for the diff it was given on. When a push changes the PR's
diff (new commits, or a rebase or update that resolves a conflict), GitHub dismisses the approvals ("dismiss stale
approvals" in the ruleset). A push that leaves the diff as it was keeps them: "Update branch", or a clean rebase onto
`main`. GitHub then moves each approval to the new head commit. The bot dismisses any approval or change request that
still points at an older commit, and asks those reviewers to look again. The ruleset also requires the latest push to
be approved by someone other than whoever pushed it.

**Approving several PRs at once:** the bot merges one per pass, and the others fall behind `main`. Update each one;
its approval stays, its checks run again, and the bot merges it.

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
  than whoever pushed it; approvals are dismissed when a push changes the PR's diff (and by the PR bot if one still points at an older commit);
  all review threads are resolved;
- **`precommit`**, **`pr-policy`** and **`pr-bot`** must pass, reported **by GitHub Actions** (a status posted with
  someone's own token doesn't count), on a branch **up to date with `main`**;
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
- **Actions:** read-only token by default, and **not** allowed to create or approve pull requests, so no workflow can
  approve a PR in a person's place.
- **Rulesets:** each file in `.github/rulesets/`, created or updated by name.
- **Labels:** `stale`, `keep-open`, `mismatch`, `hold`.

## Known limits

The rules guarantee that **every change is approved by a person other than its author**: two people for CI changes,
or the admin's bypass. Some other parts depend on contributors acting in good faith:

- **Write access can fake checks.** Anyone with write access can run their own workflows on their own branches, and a
  workflow's token can post check results. Someone determined could mark their PR's `precommit`, `pr-policy` or
  `pr-bot` green and press Merge themselves: skipping the tests, the bot's conditions and the commit format, but not
  the second person's approval. GitHub's free plan can't prevent this; only give write access to people you trust
  with that. Fork contributors can't do it, because PRs from forks get read-only tokens.
- **A PR can change its own checks.** Pull-request workflows run from the PR's files, so a PR could weaken
  `precommit.yml` and pass. This is why CI changes need two approvals, and why reviewers should read workflow diffs.
  Workflows on a first-time contributor's fork PR wait for a maintainer to approve them before they run.
- **Admin bypass** skips everything, deliberately.
- **`bot/screenshots` isn't protected.** Anyone with write access could replace an image there, so treat the
  screenshot comment as a review aid and check the actual change too.
- **A hand-merge with a bad message** (via the first point, or the bypass) is caught after the fact by the postcommit
  `commit-format` check.

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

`data/catalog.json` is kept by hand. The game has no names for its creatures and objects, so this file gives each id
(creature species `level.critters[].id`, object `level.objects[].id`) the name players know from the
[Nonograms Katana Wiki](https://nonograms-katana.fandom.com) (CC BY-SA 3.0, see [NOTICE.md](../NOTICE.md)), or a plain
description of our own, plus the kind the map draws it as (`js/view/catalog.js`). Each entry records its `source`
(`wiki` or `ours`) and how sure the match is (`confidence`); the file's `about` header says how monsters were matched
(the wiki's bestiary order is the game's `zw.K` order, then HP, damage, defence and AP at each level). To fix a name,
edit the entry and update `retrieved` if you took it from the wiki again. `test/catalog.mjs` checks that every id the
generator places has an entry with a name and a valid kind, and that the kinds still draw the map as before.

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
