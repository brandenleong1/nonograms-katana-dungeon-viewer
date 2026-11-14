# Contributing

Thanks for helping. Bug reports, dungeons that don't match your game, UI polish, solver tactics, and docs are all
welcome.

## Getting started

```sh
git clone --recurse-submodules git@github.com:brandenleong1/nonograms-katana-dungeon-viewer.git
cd nonograms-katana-dungeon-viewer
npm run serve      # http://127.0.0.1:8000/#3C-172582050
npm test           # Node 18+; no install needed
git switch -c <your-username>/<short-name>   # e.g. alice/kite-tactic: other branch names are rejected
```

Where things are: [docs/repo_layout.md](docs/repo_layout.md). Tests: [docs/testing.md](docs/testing.md). Hosting,
CI, and data files: [docs/infra.md](docs/infra.md).

## Ground rules

1. **No game material.** Don't add the game's art, sounds, app files, or decompiled code. All graphics are drawn in
   code (`js/view/sprites.js`). See [NOTICE.md](NOTICE.md).
2. **No save files, ever.** A `guild.dat` or `NonogramsKatana.zip` export is your whole game profile. Don't commit
   one, and don't attach one to a public issue. If a bug needs your save, say so in the issue and we'll arrange a
   private way.
3. **The generator and combat engine copy the game exactly.** `js/gen/` and `js/combat/` reproduce the game's
   random-number draws and rules one for one ([js/gen/PORTING.md](js/gen/PORTING.md)).
   - Changes there should only make them match the game more closely.
   - Keep the Java names and the `_` method suffix.
   - New behaviour belongs in the planner, the solver, or the UI.
   - The full parity suites need the maintainer's data, so a maintainer runs them before merging such changes.
4. **The shared UI library is upstream.** `lib/utils` is a submodule. Changes to layout, themes, or popups that every
   site shares go to [brandenleong1/utils](https://github.com/brandenleong1/utils).
5. **Nothing leaves the browser.** No analytics, no uploads, no remote logging.

## Reporting a dungeon that doesn't match the game

Use the "Dungeon mismatch" issue template. Include:

- the label exactly as the game shows it (e.g. `3C-172582050`);
- whether you imported your save or set "Your progress" (quests and bosses beaten change what spawns);
- what differs, with a screenshot from the game and one from the site.

## Pull requests

- Keep each PR to one change, with a short description of what and why.
- Add or update a test with most changes. A new standalone suite in `test/` runs in CI by itself once its header has
  the `// Standalone suite:` line ([docs/testing.md](docs/testing.md#standalone)).
- PRs with no activity for 30 days are closed, and their branches deleted.
- For UI changes, check all four themes and a phone (the browser's device toolbar). The Screenshots bot comments on every PR with before
  and after of the main views; add images of anything else to the description.
- For solver changes, include `node tools/solve-eval.mjs --set=tiers` totals before and after, if you can run it.
- Title and description follow [docs/pr_guidelines.md](docs/pr_guidelines.md): `[Area] Qualifier: Title Case
  Summary`, then Context / Changes / Testing.

## How a PR gets merged

**You don't press Merge. The PR bot merges.** It squash-merges each PR into one commit with the message the guidelines
ask for (the PR title, a blank line, the PR's URL), so nobody has to type it and nobody can get it wrong.

The bot merges a PR as soon as all of this is true:

1. **Checks pass:**
   - `precommit`: syntax, the standalone test suites on Node 18 and 22, and a browser smoke test (see
     [docs/testing.md](docs/testing.md#integration));
   - `pr-policy`: title, description, and branch name.
2. **It's up to date with `main`.** If GitHub says the branch is out of date, press "Update branch", or merge or
   rebase `main` yourself.
3. **A person with write access approved the latest commit**: two people if the PR changes CI or the PR tools
   (`.github/`, the PR tools in `tools/` such as `pr-bot.mjs`, `check-pr.mjs`, and `run-tests.mjs`, and the setup and
   merge scripts). A push that
   changes the PR's diff (new code, or a rebase or update that resolves a conflict) dismisses every approval, and the
   reviewers have to look again. Bringing the branch up to date ("Update branch", or a clean rebase onto `main`) keeps
   approvals, because the PR's own changes are the same. Nothing merges unreviewed.
4. **Every requested reviewer has approved.** If you (or anyone) request a review from someone, the bot waits for them,
   even if someone else already approved. To go ahead without them, remove the request.
5. **Nobody requests changes**, there are no merge conflicts, and the PR isn't a draft.

The **`pr-bot`** check on your PR says what it's waiting for, e.g. "Needs a review of the latest commit" or
"2 commit(s) behind main: update the branch". It runs after every push, edit, review, or label change, and hourly. It
never stays green: it only turns green at the moment the bot merges, so there's no window to merge by hand.

**To stop a ready PR from merging:**
- keep it a draft; or
- add the `hold` label. Remove it when you're ready, and the bot merges within a minute or so.

**After a merge:**
- The bot deletes the PR's branch.
- Every other open PR is now behind `main` and goes back to waiting. Update it, the checks run again against the new
  `main`, and it needs a fresh review.

**Submodule bumps:** when the shared `utils` library changes, a daily workflow pushes the bump to `bot/bump-utils` and
leaves an "Open the pull request" link in its run summary (Actions → Update Submodules). Anyone with write access
opens it, and it's reviewed and merged like any other PR.

**Maintainers:** admins can bypass the rules, e.g. for a solo maintainer's own PRs, which nobody else can approve.
Use `tools/merge-pr.sh <n> --admin` so the commit message is still right. The details are in [docs/infra.md](docs/infra.md#the-pr-bot).

## Code style

See [docs/style_guide.md](docs/style_guide.md). In short:

- Tabs, single quotes, semicolons, LF (`.editorconfig`). Plain modern JavaScript, no dependencies.
- Comments say *why*.
- Text players see is plain language: "combat dice" rather than "RNG", "mental power" rather than "MP" on first use.

AI agents: see [AGENTS.md](AGENTS.md).
