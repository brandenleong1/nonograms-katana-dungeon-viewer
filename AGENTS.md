# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md` is a symlink to this file. Humans: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

A static website for the mobile game *Nonograms Katana*. You type a dungeon label (e.g. `3C-172582050`) and it:

- rebuilds the dungeon exactly as the game does,
- draws it isometrically,
- plans a route through it,
- can simulate and solve its fights with a port of the game's combat rules.

There are no dependencies and no build step: plain ES modules in the browser, and Node 18+ for tests.
The ports match the game version in the README's [Game version](README.md#game-version) table and
`data/game-version.json`, which the site shows. A new game version is synced in one `[Game] Sync:` PR, which updates
both.

More docs:
- [docs/repo_layout.md](docs/repo_layout.md): every directory and what it does.
- [docs/testing.md](docs/testing.md): the test suites and what each needs.
- [docs/infra.md](docs/infra.md): serving, hosting, CI, data files.
- Porting rules: [js/gen/PORTING.md](js/gen/PORTING.md), [js/combat/PORTING.md](js/combat/PORTING.md).
- Solver design and plan format: [js/solve/README.md](js/solve/README.md).
- [docs/style_guide.md](docs/style_guide.md): how to structure code (functions, names, comments), and why the ports are exempt.
- [docs/pr_guidelines.md](docs/pr_guidelines.md): PR titles, descriptions and commit messages.

## Hard rules

1. **No game material beyond what is already here.** Never add the APK, decompiled Java/smali, game art, sounds, or
   anyone's save file (`guild.dat`, `NonogramsKatana.zip`, `*.progress`). `.gitignore` blocks the common file types;
   don't work around it. See [NOTICE.md](NOTICE.md).
2. **`js/gen/` and `js/combat/` are bit-exact ports.** They must produce the same random draws and the same state as the
   game. So:
   - Keep the Java class and field names, and suffix every ported method with `_`.
   - Use `js/gen/jrt.js` for Java int, long, float and division semantics.
   - Don't "clean up", reorder or simplify ported logic, even when it looks redundant. Order of RNG draws matters.
   - Fixing a divergence means matching the game, not improving on it.
   - Behaviour changes (new features, better choices) go in `js/plan/`, `js/solve/`, `js/view/` or `js/ui/`, never into
     the ports.
3. **Parity tests must stay green.** Any change under `js/gen/` or `js/combat/` must keep the suites in
   [docs/testing.md](docs/testing.md) passing. The standalone ones (`npm test`) run anywhere. The oracle-backed ones
   need maintainer-only data. If you can't run them, say so in the PR; don't claim parity.
4. **`lib/utils` is a git submodule** (shared with the maintainer's other sites). Don't edit it here. Fixes go to
   [brandenleong1/utils](https://github.com/brandenleong1/utils), and a daily workflow bumps the submodule.
5. **Privacy:** saves are read in the browser only. Nothing may be uploaded, logged remotely or sent anywhere. Keep
   imported saves in `sessionStorage` (cleared with the tab).
6. **Local servers bind to `127.0.0.1`** (`npm run serve` does).

## Engine pitfalls

- **Top-level await:** files imported by port phase files must not use it, or module loading deadlocks. Entry points
  load everything through `js/gen/x30/all.js` and `js/combat/all.js`.
- **Statics before a fight:** call `resetStatics(tables)` (`js/combat/setup.js`) before `newFight` /
  `newFightFromProfile`. Import a profile only after the first `resetStatics`.
- **Cloning:** `js/combat/clone.js` snapshots fight state for search. Any static the engine mutates during play must be
  pinned there, or clones leak state into each other.
- **Plan schema:** `js/solve/plan.js` (`nk-solve-plan/1`) is read by the UI. Only add fields; keep old ones working.
- **No dungeon:** the page starts empty ("No Dungeon Loaded", `window.nkd.state.level === null`) unless the URL has a
  label or the save kept in the tab is inside a dungeon. UI code must cope with a null level. Importing a save asks
  first when a dungeon or plan is on screen, then shows the save's dungeon or none; nothing of the old save or solve
  stays (`importFile` in `js/hero.js`, `showImportedSave` in `js/app.js`).

## Commands

```sh
npm test                 # every standalone suite in test/ (tools/run-tests.mjs; ~1 min)
npm run serve            # http://127.0.0.1:8000/#3C-172582050
npm run test:oracle      # maintainers: full parity suites (needs ~/.cache/nk-oracle)
npm run test:smoke       # browser smoke test, needs Playwright (docs/testing.md#integration)
npm run test:progress    # maintainers: generation under player-progress states vs the oracle
node tools/solve.mjs --help   # solver from the command line
```

## Code style

- Follow [docs/style_guide.md](docs/style_guide.md) for everything outside the ports: one job per function, few
  parameters, guard clauses, intention-revealing names, comments only for *why*.
- Tabs, single quotes, semicolons, `===`, LF line endings (`.editorconfig`). Modern JS (ES2022), no transpiling.
- Comments explain *why*. Ported code cites the Java method it mirrors.
- **UI text is plain language for players.** Say "combat dice", not "RNG"; "mental power", not "MP" on first use.
- **UI changes:** check all four themes (Light, Dark, Dark High Contrast, Sepia), with Light as the default, plus a
  narrow screen. Map colours come from `js/view/iso.js` palettes and the theme CSS variables. Check with
  `node tools/screenshots.mjs --before <main worktree> --out /tmp/shots`. The Screenshots bot comments on the PR with the
  fixed views. For other images in a PR description, push them to `bot/screenshots` under `pr-<n>/` and link the raw
  URL ([docs/infra.md](docs/infra.md#screenshots)); never images taken with a real save.
- **Issues:** before starting work on an issue, check that it is not assigned. Also check the issue's comments for any
  sign that someone else is working on it. Then assign the issue to yourself before starting work.
- **Branches:** `<username>/<short-name>`, lowercase, e.g. `brandenleong1/docs`. Other names are rejected.
- **Commits and PRs:** follow [docs/pr_guidelines.md](docs/pr_guidelines.md) and check with `node tools/check-pr.mjs`. The title is
  `[Area] Qualifier: Title Case Summary` (e.g. `[Solve] Feature: Kite Melee Foes With Two Or More Speed To Spare`),
  then Context / Changes / Testing. Keep save data, personal paths and game files out of messages.
- **Merging:** don't merge PRs. The PR bot squash-merges them once they're approved, green and up to date, and it
  writes the commit message (title, blank line, PR URL). Use a draft or the `hold` label to keep a PR open
  ([CONTRIBUTING.md](CONTRIBUTING.md#how-a-pr-gets-merged)).
