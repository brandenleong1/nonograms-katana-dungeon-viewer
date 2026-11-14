# Testing

All tests are plain Node scripts (Node 18+, no dependencies). They fall into three groups:

- **Standalone:** these run anywhere, and CI runs them on every pull request and every push to `main`.
- **Integration:** a browser smoke test, also run by CI on every pull request and push to `main`.
- **Oracle-backed:** these compare against reference output from the game's own code. That output is produced on the
  maintainer's machine and is not in this repository (see [infra.md](infra.md#the-oracle-maintainers-only)).

## Standalone

```sh
npm test        # = node tools/run-tests.mjs: every standalone suite in test/
```

| Suite | Checks | Time |
|---|---|---|
| `test/run.mjs` | The generator against the 10 sample dungeons in `test/fixtures/`: every cell, object, creature, room, and the final random-number states. | ~2 s |
| `test/version.mjs` | `data/game-version.json` and the README's Game version table agree. | instant |
| `test/details.mjs` | Object contents, collected/unsealed states, hidden-creature warnings, distinct item labels and retained catalog behavior. | ~1 s |
| `test/catalog.mjs` | `data/catalog.json`: every creature and object in about 770 generated dungeons (new game and progress states) has an entry with a name and a kind the map draws, and every id is drawn as before the table existed, except object 84 (the caves' mine cart, drawn as reeds before). Also the level's wild familiars and mine-cart riders. | ~9 s |
| `test/questlines.mjs` | The Your progress questlines: every quest the generator reads is on a slider, every position round-trips through a profile, and part 4 of Once Upon a Forest brings 3C's mini-boss. Quest 27 is part 1 of Once Upon a Forest, as the game files it, no shown text has the game's teaser ellipsis, and effects read "Unlocks <quest> (4A)". The mark-all buttons: every slider at its end and every boss beaten, the same on a save, nothing changed on a second press, the user's other edits kept, and dungeons of every family build with everything done. | ~4 s |
| `test/astar.mjs` | `hw.t_` (A*) against a copy of the version before it stopped allocating, on about 10,000 calls over real mid-dungeon states (free, blocked, occupied, revealed or not, doors, teams, regions): same cost, same path (so the same tie-break among equal costs), same scratch point, open list emptied. It fails if the heap order changes. | ~10 s |
| `test/solve.mjs` | Solver: resource ledger, route walker, the wiki's first-strike rule, robust and exact solves on small budgets, MP top-ups (including mid-fight), the plan schema, the worker pool. Use `--quick` to skip the slow cases and `--no-workers` to skip the pool. | ~1 min |
| `test/exact-workers.mjs` | Exact mode gives the same plan with 2, 4 and 8 workers as with the inline pool, and the look-ahead cache changes nothing: a run that re-walks every cache hit finds no difference (`1A-1429008869`, small search). | ~20 s |

`npm test` must pass before a pull request is merged.

**Adding a suite:** most changes should come with a test. A new standalone suite is a file in `test/` that runs with
plain `node`, exits non-zero on failure, and has this line in its header comment:

```js
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
```

`tools/run-tests.mjs` (what `npm test`, precommit, and postcommit run) picks it up, so adding a test touches no CI
files and needs only the usual one approval. Removing that line takes a suite out of CI, which shows in the diff.
Suites that need oracle data or a browser don't get the line.

## Integration

```sh
npm i --no-save playwright && npx playwright install chromium   # once; Playwright isn't a site dependency
npm run test:smoke                                              # = node test/smoke.mjs [-v]
```

`test/smoke.mjs` serves the site on a free loopback port and loads one dungeon of each family (classic, forest, cave,
tomb) in each of the four themes, in headless Chromium. On every page:

- the map is built (objects and creatures present);
- on 3C-172582050, the Selected panel and the map tooltip name a monster, the boss, and a stuck door, with the
  monster's stats, the boss's drop, and the door's energy cost, and the panel credits the wiki for the name;
- the purple chest at 33,35 shows its Meteoric Iron contents in the panel and tooltip;
- the Help popup credits the Nonograms Katana Wiki for the names;
- the Your hero and Your progress popups open;
- on 3C-172582050, the Progress popup shows no quest name with an ellipsis, unlocks as "Unlocks **Magic Beans** (4A)", the quest NPC grid in the game's rows with "← here" on 3C, and where the game shows items, buildings, and counts; its mark buttons move every questline slider to its end, tick every boss (by keyboard), and turn the map's badge to Custom progress; Clear changes puts the new game back;
- nothing raises a page error or logs a console error.

It also checks the page with no dungeon and the importing of saves:

- a bare page load, in each theme, says "No Dungeon Loaded" over a map darker than one with a dungeon, with Selected,
  Objectives, Route, the status line and the solver saying there is nothing to show, the View buttons that need a
  dungeon disabled, and hovering, dragging, keys, buttons and layers all harmless;
- the popup an import asks first: an alert dialog with Cancel focused, Tab kept inside, Escape and Cancel answering no
  and Import answering yes;
- with the maintainer's synthetic saves (`~/.cache/nk-oracle/save/synth/`, or `NK_SAVE_DIR`; skipped cleanly without
  them): importing a save made inside a dungeon onto an empty page asks nothing and shows that dungeon; importing over a
  dungeon and a plan asks first, Cancel changes nothing, Import on a save made in town clears to "No Dungeon Loaded", and
  a reload keeps the save and shows its dungeon, or none.

It needs the `lib/utils` submodule. With a Playwright install elsewhere, point `NK_PLAYWRIGHT` at the module and
`NK_CHROMIUM` at a Chromium binary.

## In CI

| Stage | Runs | Gate |
|---|---|---|
| Precommit (`precommit.yml`) | syntax, the standalone suites (`tools/run-tests.mjs`) on Node 18 and 22, the smoke test | required to merge (`precommit` check), on a branch up to date with `main` |
| PR policy (`pr-policy.yml`) | title, description, branch name (`tools/check-pr.mjs`) | required (`pr-policy`) |
| PR bot (`pr-bot.yml`) | ready to merge: the above green, up to date, no conflicts or changes requested | required (`pr-bot`), plus one human approval |
| Screenshots (`screenshots.yml`, `screenshot-comment.yml`) | screenshots of [fixed views](#screenshots) on `main` and the PR; the ones that look different are posted on the PR | reports only ([infra.md](infra.md#screenshots)) |
| Postcommit (`postcommit.yml`) | commit message format, the standalone suites, and the smoke test on `main`, plus weekly | reports only; a failure on `main` should be fixed or reverted first |

The oracle suites don't run in CI ([infra.md](infra.md#the-oracle-maintainers-only)).

## Oracle-backed (maintainers)

These need `~/.cache/nk-oracle/`. Without it, each script prints where it looked and exits.

| Command | Checks | Reference data |
|---|---|---|
| `node test/run.mjs ~/.cache/nk-oracle/fx7` | The generator on 1,080 dungeons: 40 seeds × 27 types. | `fx7/` dumps |
| `npm run test:save` | Save import against the game's own loader: the user's export plus synthetic saves (town, mid-dungeon, autonomous). | `save/` goldens |
| `npm run test:entry` | Dungeon entry from a profile: pack, MP taken in, familiars, hero stats. | `fights/pf-*` |
| `npm run test:combat` | The combat engine against 628 recorded fights (~108k inputs): every ability, boss mechanic, item, and skill, and whole-dungeon runs. | `fights/` |
| `npm run test:clone` | Snapshot / restore against uninterrupted replays. | `fights/` |
| `npm run test:save-solve` | Exact solves from mid-dungeon saves, the way the page runs them (import, Exact, solve) in headless Chromium. Needs Playwright too. | `save/synth/hw-*.dat` |
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

1. `npm run serve`, then open e.g. `http://127.0.0.1:8000/#3C-172582050` (without the `#…` the page shows "No Dungeon Loaded").
2. Check all four themes (Settings → Change Theme; Light is the default) and a narrow window (about 400 px).
3. The browser console should show no errors. `window.nkd` exposes the view and state for poking at things.
4. For sprites, `tools/sprite-gallery.html?theme=dark` shows every sprite.
5. The Screenshots comment on the PR shows the fixed views before and after ([below](#screenshots)). Add images of
   anything else (another dungeon, a longer solve) to the description ([infra.md](infra.md#screenshots)).

## Screenshots

`tools/screenshots.mjs` takes a fixed set of views of two checkouts, and keeps the ones that look different. The
Screenshots bot runs it on `main` and on every PR and posts the result ([infra.md](infra.md#screenshots)). Locally:

```sh
node tools/screenshots.mjs --list                                      # the views, by group
node tools/screenshots.mjs --before <a main worktree> --out /tmp/shots   # writes the views that changed
node tools/screenshots.mjs --before <a main worktree> --out /tmp/shots --only popup,select-boss
node tools/screenshots.mjs --out /tmp/shots                              # every view of this checkout
node tools/screenshots.mjs --before . --out /tmp/shots                   # this checkout twice: all must be same
```

`--only` takes view names, groups (`popup`), and name prefixes (`map-3c`). `-v` prints how long each view took, and
`--jobs N` sets how many pages are open at once (3). It needs Playwright, which isn't a dependency (`tools/chromium.mjs`
says how to point it at a local install). One checkout takes about a minute on a laptop; both, on 4 cores, between 2
and 3 minutes.

### The views

Every view uses a new game and a fixed dungeon label. Progress comes only from the Progress popup's own controls,
never from a save. The comment lists them in this order:

| Group | Views | What they show |
|---|---|---|
| `map` | `map-3c-` in `light`, `dark`, `dark-high-contrast`, and `sepia`; `map-f1-`, `map-6a-`, `map-eb-` in `light` and `dark` | the page as it opens, for each theme and each dungeon family (classic, forest, cave, tomb), at 1600 × 900 |
| `size` | `size-phone` 390 × 844, `size-phone-landscape` 844 × 390, `size-narrow` 640 × 1100, `size-tablet` 820 × 1180, `size-laptop` 1280 × 800, `size-full` 1920 × 1080, `size-big` 2560 × 1440 | the same in other windows |
| `zoom` | `zoom-3c`, `zoom-f1`, `zoom-6a`, `zoom-eb`, `zoom-6a-dark`, `zoom-eb-dark` | each family's boss room, close enough to see the sprites |
| `select` | `select-monster`, `select-object` (a ladder, with a line to its hatch), `select-boss`, `select-npc`, `select-familiar`, `select-route-stop` | a click on the map or on a Route stop: the Selected panel and what the map highlights |
| `hover` | `hover-tooltip` | the mouse resting on a monster |
| `layers` | `layers-all`, `layers-all-zoom` (5C's floor nonogram, solved), `layers-all-dark`, `layers-tall-walls` | every Show on map box ticked; the tall walls |
| `lists` | `lists-scrolled`, `lists-scrolled-dark` | the Objectives and Route lists scrolled half way, so both edges fade |
| `solver` | `solver-robust-whatif`, `solver-exact-whatif`, `solver-robust-plan`, `solver-exact-script` | the settings with a What-if hero; then a Normal plan of `1A-1429008869` in each mode: robust with its first fight selected, exact with the script player half way through fight 2 |
| `popup` | `popup-help-`, `popup-hero-`, `popup-progress-`, `popup-settings-` in `light` and `dark`; help and progress in `sepia`; hero and progress in `dark-high-contrast`; `popup-progress-narrow`, `popup-progress-phone`; `popup-progress-edited` and `popup-progress-edited-map` | each popup (Your hero as a new game; Progress with a questline unfolded), and Progress with part 3 of Once Upon a Forest set in progress, then the map built with it |
| `empty` | `empty-light`, `empty-dark` | the page with no label and no save: the darker map with "No Dungeon Loaded" and the empty panels |

### Adding a view

Add an entry to `VIEWS` in `tools/screenshots.mjs`, next to its group:

```js
view('select-chest', { theme: 'dark', steps: [clickOnMap({ object: 21 })] }),
```

- **Name:** lowercase letters, digits, and dashes, at most 48 characters. The part before the first dash is its group.
- **Options:** `label` (default `LABELS['3c']`), `theme` (default `light`), `size` (default `SIZES.wide`, 1600 × 900),
  and `steps`.
- **Steps** run in order once the page is ready. Use the ones there (`zoomTo`, `clickOnMap`, `hoverOnMap`, `click`,
  `turnOnLayers`, `scrollToMiddle`, `openPopup`, `chooseQuestPosition`, `solve`, ...), or write one: a function
  `(page) => Promise` that works the page as a player would, through its buttons and the mouse. It may read
  `window.nkd` to find things (where a creature is) and move the map with `window.nkd.view.focus`; anything else
  changes through the page's own controls.
- **The same pixels every run.** The tool turns off the fades, waits for fonts and two drawn frames after each step,
  paints the page afresh before the shot, reports the same 4 CPU threads (the solver's worker count, and so its
  plans, follow it), and masks wall-clock times in the solver panel. A new step must wait for what it changed (an
  element, a state in `window.nkd`), never for a fixed time. Anything else that depends on the clock must be masked:
  wrap it in an element with the class `nk-shot-mask`. Check with `--before .`, a few times and once with `--jobs 6`
  to load the machine: every view must come out `same`.
- **Limits:** the comment workflow takes at most 100 views, 3 MB per image and 80 MB in all. When every view changed
  it gets both sides of each, so one side must stay under 40 MB (now about 16 MB). The tool stops past the first two
  and warns about the third. The limits are read from `main` (the trusted half runs from there), so a PR can't raise
  them for itself: raise them on `main` first, in both `tools/screenshot-comment.mjs` and `tools/screenshots.mjs`.
- **Time:** the bot shoots every view twice on a 4-core runner. A quick view costs about 5 CPU-seconds, a solve about
  35. Keep solves to the small label (`LABELS.small`) and the Normal search.
- **New controls:** a view of something `main` doesn't have yet can't be taken there; it is posted as a new view.

## Useful tools

| Tool | What |
|---|---|
| `node tools/solve.mjs LABEL [--mode=exact --xseed=N]` | Solve a dungeon from the command line and print the plan. |
| `node tools/solve-eval.mjs --set=tiers` | Solver against plain melee on a dungeon set. |
| `node tools/bench.mjs` | Engine step, setup, and clone speed. |
| `NODE_V8_COVERAGE=cov node test/combat.mjs && node tools/coverage.mjs cov` | Which ported code the corpus exercises. |
