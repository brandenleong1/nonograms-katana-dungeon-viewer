# Repository layout

## How the pieces fit

```
label "3C-172582050"
  └─ js/labels.js ─ type + seed
       └─ js/gen/ (bit-exact generator) ─ level: cells, rooms, objects, creatures
            ├─ js/view/  ─ isometric canvas map, sprites, link highlights
            ├─ js/plan/  ─ route through every objective
            └─ js/solve/ ─ fight-by-fight tactics, using js/combat/ (bit-exact combat engine)
                  └─ run in Web Workers by js/ui/solve-host*.js, shown by js/ui/solve-panel.js

player progress (what changes the map):
  js/save/ (import the game's export) ─┐
  js/ui/progress-panel.js (edits)      ├─ js/hero.js effectiveProfile() ─ used by js/gen/ and js/solve/
  data/tables.json (a new game)        ─┘
```

`js/app.js` wires the page together; `index.html` holds the markup.

## Top level

| Path | What |
|---|---|
| `index.html`, `style.css` | The page: four columns (dungeon and Your hero, map, selection and route, solver) and the popups. |
| `init.js` | Page chrome shared with the maintainer's other sites: theme, popups, fonts. |
| `js/` | All site code, as ES modules (below). |
| `data/tables.json` | Numeric game tables the generator and engine read: room shapes, object and creature definitions, items, decoration weights, a new player's profile. Generated; don't edit by hand ([infra.md](infra.md#data-files)). |
| `data/names.json` | English display names for items, skills and quests. Generated. |
| `data/game-version.json` | The game version everything follows; shown in Help, and kept equal to the README's table by `test/version.mjs`. |
| `lib/utils/` | Git submodule [brandenleong1/utils](https://github.com/brandenleong1/utils): layout CSS, themes, popups, cookies. |
| `test/` | Test suites and fixtures ([testing.md](testing.md)). |
| `tools/` | Developer tools (below). |
| `docs/` | These docs: layout, testing, infra, style guide, PR guidelines. |
| `.github/` | Workflows (precommit, PR policy, PR bot, postcommit, stale PRs, submodule bump), the rulesets, issue and PR templates. |
| `AGENTS.md` (`CLAUDE.md` links to it), `CONTRIBUTING.md`, `NOTICE.md`, `LICENSE` | For contributors, and the license scope. |

## `js/`

| Path | What |
|---|---|
| `app.js` | UI glue: label → level → map, layers, selection, objectives, route panel. Exposes `window.nkd` for debugging. |
| `labels.js` | Dungeon labels (`3C-172582050`) ↔ dungeon type and seed. |
| `game-version.js` | The game version line in the Help popup. |
| `hero.js` | The "Your hero" panel: imports a save, shows heroes, gear, pack and progress. `effectiveProfile()` is what maps and the solver use. |

### `js/gen/`: dungeon generator (bit-exact port)

Rules are in [js/gen/PORTING.md](../js/gen/PORTING.md).

| Path | What |
|---|---|
| `generate.js` | Public API: `generate(type, seed)` → the level in the viewer's format, built with the current profile (`vj0.i2`); `randomLabel`. |
| `index.js` | Imports every ported module. |
| `x30/` | The generator, one file per phase: `gen.js` (entry and retries), `rooms.js`, `corridors.js`, `entry.js` (entrance, exits, doors, puzzle rooms), `locks.js` (keys, ladders, gates), `place.js` (object placement), `decor.js`, `monsters.js` (monsters, bosses, NPCs). Loaded through `x30/all.js`. |
| `model.js`, `model/` | The classes the generator uses: level, objects, creatures, heroes (`level.js`), geometry and A* (`geom.js`), tables (`tables.js`), small runtime helpers. |
| `progress.js` | Player-progress queries the generator makes (quests, bosses beaten, buildings). |
| `progress-spec.js` | Player progress as data: `applyProgress` / `readProgress` / `withProgress` / `diffProgress`. |
| `progress-reads.js` | Catalogue of every progress read that changes generation, and whether it changes the layout or only loot. |
| `jrt.js`, `rng.js` | Java int/long/float semantics; the game's LCG. |
| `statics.js`, `registry.js`, `revive.js`, `compare.js` | Static game data; Java class registry; reviving oracle JSON; deep compare for tests. |

### `js/combat/`: combat engine (bit-exact port)

Rules and file ownership are in [js/combat/PORTING.md](../js/combat/PORTING.md); the oracle's formats are in [js/combat/ORACLE.md](../js/combat/ORACLE.md).

| Path | What |
|---|---|
| `c30.js`, `all.js` | The controller class and its loader. |
| `turn.js` | Turn loop, aggro scan, joining fights, deaths. |
| `actions.js` | Actions and their resolver: attacks, skills, items, chests, pickups. |
| `move.js` | Moving, stepping, traps, tap paths. |
| `ai.js` | Monster AI helpers. |
| `damage.js` | Damage rolls, crits, poison, revive. |
| `nav.js` | A*, line of sight, visibility. |
| `input.js` | The touch-input layer (what a tap or button does). |
| `ui.js` | Visual methods, which are no-ops headless. |
| `driver.js` | `newFight(spec)` and the `Fight` API: `apply`, `step`, `snapshot`, `clone`. |
| `setup.js` | Fight setup and `resetStatics`. |
| `entry.js` | Entering a dungeon from a player profile; hero sheet and pack. |
| `clone.js` | Fast snapshot / restore of fight state, for search. |
| `record.js` | Per-input state dumps in the oracle's format (tests). |

### Other `js/` directories

| Path | What |
|---|---|
| `js/save/` | Reads the game's export in the browser: `zip.js` → `envelope.js` (XOR, checksum, gzip) → `guild.js` / `records.js` (the profile) and `dungeon.js` (a dungeon in progress). Entry point: `index.js` `importSave`. |
| `js/plan/planner.js` | Route planner: weighted shortest paths over the game's movement rules, gates, levers and keys, teleports, then the visiting order (exact up to 16 stops). |
| `js/solve/` | Solver ([README](../js/solve/README.md)): `robust.js` (Monte Carlo over unknown dice), `exact.js` (search with known dice), `sim.js` (dungeon walk on the engine), `policies.js` and `kite.js` (tactics), `cost.js` (objective), `plan.js` (output for the UI), `worker.js` / `pool.js` (workers). |
| `js/view/` | Map: `iso.js` (renderer, palettes, solver overlay), `walls.js` (which quarters of each wall cell are wall, the game's rule), `sprites.js` (procedural sprites), `catalog.js` (what each id is), `links.js` (ladder ↔ hatch and similar pairs). |
| `js/ui/` | Solver column and progress editor: `solve-panel.js`, `solve-client.js` → `solve-host.js` (worker) → `solve-host-main.js`, pool worker adapters, `budgets.js` (presets), `words.js` (plain-language text), `progress-panel.js` (the Your progress editor) and `questlines.js` (its questline sliders: quests grouped by name, and what each part changes). |

## `test/` and `tools/`

| Path | What |
|---|---|
| `test/*.mjs` | Suites; see [testing.md](testing.md). |
| `test/fixtures/` | Ten sample dungeons dumped from the game's generator, so `npm test` works without the oracle. |
| `test/scenarios/` | Scripted fights, one per ability or item, for the combat corpus. |
| `test/make-fights.*` | Maintainer: regenerates the oracle fight corpus. |
| `tools/solve.mjs`, `tools/solve-eval.mjs` | Solve a dungeon from Node; compare the solver against plain melee. |
| `tools/explore.mjs` | Plays whole dungeons with a simple policy (used to build oracle inputs). |
| `tools/bench.mjs`, `tools/coverage.mjs` | Engine and clone benchmarks; V8 coverage summary for the ports. |
| `tools/check-pr.mjs`, `tools/pr-bot.mjs` | PR policy check (title, description, branch, commit message); the PR bot (ready-to-merge status, branch cleanup). |
| `tools/screenshots.mjs`, `tools/screenshot-comment.mjs` | The screenshot bot: shoot the main views of two checkouts and keep what changed; post them on the PR (trusted, from `main`). |
| `tools/run-tests.mjs` | Runs every standalone suite in `test/` (the files with a `// Standalone suite:` line): `npm test`, precommit and postcommit. |
| `tools/static-server.mjs`, `tools/chromium.mjs` | A loopback static server and headless Chromium, for the smoke test and the screenshots. |
| `tools/merge-pr.sh`, `tools/github-setup.sh` | Squash-merge a PR with the right commit message; apply the repository's GitHub settings and rulesets. |
| `tools/sprite-gallery.html` | Every sprite on a tile, per theme: `/tools/sprite-gallery.html?theme=dark`. |
