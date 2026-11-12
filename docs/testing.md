# Testing

All tests are plain Node scripts (Node 18+, no dependencies). They fall into three groups:

- **Standalone:** these run anywhere, and CI runs them on every pull request and every push to `main`.
- **Integration:** a browser smoke test, also run by CI on every pull request and push to `main`.
- **Oracle-backed:** these compare against reference output from the game's own code. That output is produced on the
  maintainer's machine and is not in this repository (see [infra.md](infra.md#the-oracle-maintainers-only)).

## Standalone

```sh
npm test        # = node test/run.mjs && node test/version.mjs && node test/solve.mjs
```

| Suite | Checks | Time |
|---|---|---|
| `test/run.mjs` | The generator against the 10 sample dungeons in `test/fixtures/`: every cell, object, creature, room and the final random-number states. | ~2 s |
| `test/version.mjs` | `data/game-version.json` and the README's Game version table agree. | instant |
| `test/solve.mjs` | Solver: resource ledger, route walker, the wiki's first-strike rule, robust and exact solves on small budgets, MP top-ups (including mid-fight), the plan schema, the worker pool. Use `--quick` to skip the slow cases and `--no-workers` to skip the pool. | ~1 min |

`npm test` must pass before a pull request is merged.

## Integration

```sh
npm i --no-save playwright && npx playwright install chromium   # once; Playwright isn't a site dependency
npm run test:smoke                                              # = node test/smoke.mjs [-v]
```

`test/smoke.mjs` serves the site on a free loopback port and loads one dungeon of each family (classic, forest, cave,
tomb) in each of the four themes, in headless Chromium. On every page:

- the map is built (objects and creatures present);
- the Your hero and Your progress popups open;
- nothing raises a page error or logs a console error.

It needs the `lib/utils` submodule. With a Playwright install elsewhere, point `NK_PLAYWRIGHT` at the module and
`NK_CHROMIUM` at a Chromium binary.

## In CI

| Stage | Runs | Gate |
|---|---|---|
| Precommit (`precommit.yml`) | syntax, `npm test` on Node 18 and 22, the smoke test | required to merge (`precommit` check), on a branch up to date with `main` |
| PR policy (`pr-policy.yml`) | title, description, branch name (`tools/check-pr.mjs`) | required (`pr-policy`) |
| PR bot (`pr-bot.yml`) | ready to merge: the above green, up to date, no conflicts or changes requested | required (`pr-bot`), plus one human approval |
| Screenshots (`screenshots.yml`, `screenshot-comment.yml`) | screenshots of the main views on `main` and the PR; the ones that look different are posted on the PR | reports only ([infra.md](infra.md#screenshots)) |
| Postcommit (`postcommit.yml`) | commit message format, `npm test` and the smoke test on `main`, plus weekly | reports only; a failure on `main` should be fixed or reverted first |

The oracle suites don't run in CI ([infra.md](infra.md#the-oracle-maintainers-only)).

## Oracle-backed (maintainers)

These need `~/.cache/nk-oracle/`. Without it, each script prints where it looked and exits.

| Command | Checks | Reference data |
|---|---|---|
| `node test/run.mjs ~/.cache/nk-oracle/fx7` | The generator on 1,080 dungeons: 40 seeds × 27 types. | `fx7/` dumps |
| `npm run test:save` | Save import against the game's own loader: the user's export plus synthetic saves (town, mid-dungeon, autonomous). | `save/` goldens |
| `npm run test:entry` | Dungeon entry from a profile: pack, MP taken in, familiars, hero stats. | `fights/pf-*` |
| `npm run test:combat` | The combat engine against 628 recorded fights (~108k inputs): every ability, boss mechanic, item and skill, and whole-dungeon runs. | `fights/` |
| `npm run test:clone` | Snapshot / restore against uninterrupted replays. | `fights/` |
| `npm run test:progress` | The generator under 382 player-progress states (38,080 dungeons), plus check that the progress spec is complete for each save. | `prog/` dumps |
| `node test/snaptest.mjs DIR`, `node test/combatsnap.mjs DIR`, `node test/model.mjs snap DIR` | Method-level snapshots, used while porting a phase. | snapshot dirs |

`npm run test:oracle` runs the first five rows together. Each suite reports the first divergence per case (the field,
the step, the random-number state), which is usually enough to find the line to fix.

### Contributors without the oracle

If you change `js/gen/` or `js/combat/`:
1. Run `npm test`.
2. Say in the pull request that the oracle suites still need to be run.
3. A maintainer runs them before merging.

Changes elsewhere (`js/view/`, `js/plan/`, `js/ui/`, `js/solve/`) can't break parity, but `test/solve.mjs` covers the
solver.

## Checking the page

There's no browser test suite. For UI changes:

1. `npm run serve`, then open e.g. `http://127.0.0.1:8000/#3C-172582050`.
2. Check all four themes (Settings → Change Theme; Light is the default) and a narrow window (about 400 px).
3. The browser console should show no errors. `window.nkd` exposes the view and state for poking at things.
4. For sprites, `tools/sprite-gallery.html?theme=dark` shows every sprite.
5. The Screenshots comment on the PR shows the fixed views before and after. Add images of anything else
   (interactions, a solve) to the description ([infra.md](infra.md#screenshots)).

To see the same views locally, `node tools/screenshots.mjs --before <a main worktree> --out /tmp/shots` writes the
ones that changed. It needs Playwright, which isn't a dependency (`tools/chromium.mjs` says how to point it at a local
install).

## Useful tools

| Tool | What |
|---|---|
| `node tools/solve.mjs LABEL [--mode=exact --xseed=N]` | Solve a dungeon from the command line and print the plan. |
| `node tools/solve-eval.mjs --set=tiers` | Solver against plain melee on a dungeon set. |
| `node tools/bench.mjs` | Engine step, setup and clone speed. |
| `NODE_V8_COVERAGE=cov node test/combat.mjs && node tools/coverage.mjs cov` | Which ported code the corpus exercises. |
