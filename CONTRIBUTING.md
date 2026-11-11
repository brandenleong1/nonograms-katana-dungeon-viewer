# Contributing

Thanks for helping. Bug reports, dungeons that don't match your game, UI polish, solver tactics and docs are all
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
CI and data files: [docs/infra.md](docs/infra.md).

## Ground rules

1. **No game material.** Don't add the game's art, sounds, app files or decompiled code. All graphics are drawn in
   code (`js/view/sprites.js`). See [NOTICE.md](NOTICE.md).
2. **No save files, ever.** A `guild.dat` or `NonogramsKatana.zip` export is your whole game profile. Don't commit
   one, and don't attach one to a public issue. If a bug needs your save, say so in the issue and we'll arrange a
   private way.
3. **The generator and combat engine copy the game exactly.** `js/gen/` and `js/combat/` reproduce the game's
   random-number draws and rules one for one ([js/gen/PORTING.md](js/gen/PORTING.md)).
   - Changes there should only make them match the game more closely.
   - Keep the Java names and the `_` method suffix.
   - New behaviour belongs in the planner, the solver or the UI.
   - The full parity suites need the maintainer's data, so a maintainer runs them before merging such changes.
4. **The shared UI library is upstream.** `lib/utils` is a submodule. Changes to layout, themes or popups that every
   site shares go to [brandenleong1/utils](https://github.com/brandenleong1/utils).
5. **Nothing leaves the browser.** No analytics, no uploads, no remote logging.

## Reporting a dungeon that doesn't match the game

Use the "Dungeon mismatch" issue template. Include:

- the label exactly as the game shows it (e.g. `3C-172582050`);
- whether you imported your save or set "Your progress" (quests and bosses beaten change what spawns);
- what differs, with a screenshot from the game and one from the site.

## Pull requests

- Keep each PR to one change, with a short description of what and why.
- To merge, a PR needs:
  - the `precommit` checks green: syntax, `npm test`, and a browser smoke test (`npm run test:smoke`; see
    [docs/testing.md](docs/testing.md#integration));
  - `pr-policy` green: title, description and branch name;
  - `pr-bot` green: the bot's ready-to-merge check ([docs/infra.md](docs/infra.md#the-pr-bot));
  - one approving review from a person;
  - a branch up to date with `main`.
- PRs with no activity for 30 days are closed, and their branches deleted.
- For UI changes, add before/after screenshots in Light and one dark theme, and check a narrow window.
- For solver changes, include `node tools/solve-eval.mjs --set=tiers` totals before and after, if you can run it.
- Title and description follow [docs/pr_guidelines.md](docs/pr_guidelines.md): `[Area] Qualifier: Title Case
  Summary`, then Context / Changes / Testing. Each PR is squash-merged as one commit: the title, a blank line, the
  PR's URL.

## Code style

See [docs/style_guide.md](docs/style_guide.md). In short:

- Tabs, single quotes, semicolons, LF (`.editorconfig`). Plain modern JavaScript, no dependencies.
- Comments say *why*.
- Text players see is plain language: "combat dice" rather than "RNG", "mental power" rather than "MP" on first use.

AI agents: see [AGENTS.md](AGENTS.md).
