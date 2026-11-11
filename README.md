# Nonograms Katana Dungeon Viewer

Type a dungeon label exactly as the game shows it at the top of a dungeon, e.g. **`3C-172582050`**. The site
rebuilds that dungeon with the same rules the game uses and draws it isometrically, like in the game. You get:

- **Every object and creature**, with layers you can toggle: monsters and people, chests and pages, doors and
  levers, ladders/hatches/portals, puzzle rooms, plus spoilers (puzzle solutions, hidden traps).
- **Links:** click a ladder, hatch, portal, lever or gate to highlight what it connects to.
- **A route** that clears every objective in few steps. It opens what blocks the way (levers before gates,
  the gold monster before a locked door) and walks the floor nonogram.
- **Your hero:** import the game's export (Settings → Export, `NonogramsKatana.zip`, or a bare `guild.dat`) by
  dropping it on the page or picking it. You see your heroes and their levels, the chosen hero's health, energy, mental
  power, attack, defence, action points, skills and equipment, the pack it would take into the dungeon on screen
  (items, mental power, familiars, entry fee: the game's own entry rules) and your progress. While "Use my progress"
  is on, maps are built with your quests and bosses beaten, so quest people and mini-bosses match your game. The file is
  read in your browser only; nothing is uploaded. It stays in the tab (sessionStorage) until you close it or press Forget.
- **Your progress** (Progress, next to Your hero): the quests, bosses beaten and finds the map is built with, for
  players without a save or for what-ifs on top of an imported one. Only what dungeon generation reads is shown, in
  plain words: the quests that pick a dungeon's quest person (and who each dungeon gets now), bosses and mini-bosses
  beaten, the quests that add bosses, merchants and forest finds, and separately what only changes loot. A preview
  says why the current dungeon has its quest person or extra bosses. Changes rebuild the map at once (status badge:
  new game / your progress / custom progress) and the solver plans with the same progress. They are kept in this
  browser (localStorage); "Reset to new game" / "Reset to my save" drop them.
- **Solver** (the fourth column; the last View button hides it): plays the dungeon in the ported combat engine and
  picks a tactic per fight for the fewest items, then the least mental power, without dying. **Robust** mode works
  from the label (Monte Carlo over the unknown dice); **Exact** mode needs the dice, from a save exported inside the
  dungeon (or a made-up `xseed` to experiment), and gives a step-by-step script: ← / → step through it on the map,
  Page Up / Page Down jump between fights. Use your imported hero or a what-if hero (level, gear, kit, skills). The plan
  shows expected items (and p95), mental power needed against what the hero brings, death risk, the pack, and per
  fight the foes, the tactic in plain words and every tactic it compared. Solves run in Web Workers.

Labels: `1A`–`5C` dungeons, `F1`–`F4` forest, `6A`–`6D` caves, `EA`–`ED` tombs. The number after the dash
is the dungeon's seed.

## Game version

| | |
|---|---|
| Matches | **Nonograms Katana 22.11** |
| `versionName` / `versionCode` | `22.11` / `22110` (from the APK's `AndroidManifest.xml`) |
| Package | `com.ucdevs.jcross` |

The generator, combat engine, save reader and `data/` all follow this version. The site shows it in Help, from
`data/game-version.json`; `test/version.mjs` fails if that file and this table disagree. The game shows its version
on its About screen. If yours is newer and a dungeon doesn't match, the game may have changed: please open an issue. Updating
to a new version is one `[Game] Sync:` PR ([docs/pr_guidelines.md](docs/pr_guidelines.md#game-version-syncs)), and
it updates this table.

## Run locally

It's a static site. Clone with the `lib/utils` submodule, then serve the folder:

```sh
git clone --recurse-submodules git@github.com:brandenleong1/nonograms-katana-dungeon-viewer.git
cd nonograms-katana-dungeon-viewer
npm run serve        # python3 -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/#3C-172582050
```

## How it works

| Path | What |
|---|---|
| `js/gen/` | Port of the game's dungeon generator. It is bit-exact: same random numbers, same rooms, same objects. See `js/gen/PORTING.md`. `progress-spec.js`: player progress as data (the oracle's `--progress` format); `progress-reads.js`: what generation reads from it and what each read changes. |
| `data/tables.json` | Numeric game tables the generator reads (room sizes, object/monster definitions, decoration weights, a new player's progress). |
| `js/view/` | Isometric canvas renderer (the game's projection: 2:1 diamonds, +x up-right, +y down-right) and the object catalogue. |
| `js/plan/planner.js` | Route planner. It does BFS on the tile grid with teleports and gates. The visiting order is solved exactly (Held–Karp) for up to 16 stops; larger maps use a search. |
| `js/save/` | Reads the game's export in the browser (zip, the guild.dat envelope, the player profile). |
| `js/combat/` | Port of the game's turn-based combat; `entry.js` starts a dungeon the way the game does for a player profile. See `js/combat/PORTING.md`. |
| `js/hero.js` | The Your hero panel, and the progress maps and the solver use (`effectiveProfile()`: the save or a new game, plus the edits). |
| `js/solve/` | The solver (robust Monte Carlo and exact search) and its plan format. See `js/solve/README.md`. |
| `js/ui/` | The solver column: `solve-panel.js` (controls, plan view, map overlay, script player), `solve-host*.js` (a module worker that runs the solver's coordinator and its worker pool off the main thread, and replays exact scripts into per-step frames), `pool-worker.js` / `solve-worker.js` (pool worker entries: early-message buffering, in-dungeon saves), `words.js` (plain-language tactic names and step instructions); `progress-panel.js`, the Your progress editor. |
| `test/` | Tests (below) and `test/fixtures/`, sample dungeons dumped from the game's own generator. |
| `tools/` | Developer tools: `explore.mjs` (whole-dungeon play policy), `solve.mjs` / `solve-eval.mjs` (solver from Node), `bench.mjs`, `coverage.mjs`, `sprite-gallery.html` (every sprite, both themes). |

Monsters and people can depend on quests and items. The map assumes a new game until you import your save or set
your progress.

All art is drawn procedurally; no game assets are included.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `npm test` (Node 18+, no install), no game assets and no save files
in the repo, and the generator and combat engine only change to match the game more closely. More docs:

- [docs/repo_layout.md](docs/repo_layout.md): what every directory does
- [docs/testing.md](docs/testing.md): the test suites, including the maintainer-only parity suites
- [docs/infra.md](docs/infra.md): serving, hosting, browser requirements, CI, data files
- [docs/style_guide.md](docs/style_guide.md): how we structure code
- [docs/pr_guidelines.md](docs/pr_guidelines.md): pull request titles and descriptions
- [AGENTS.md](AGENTS.md): notes for AI coding agents (`CLAUDE.md` links to it)

## License and credits

The original code in this repository is released under the [MIT License](LICENSE). That covers the viewer and
renderer, the sprites, the route planner, the solver, the user interface, the save reader, and the tests and tools.

The MIT License does not cover the game. *Nonograms Katana* belongs to its developer: its name, its item, quest and
skill names (`data/names.json`), its numeric tables (`data/tables.json`), and the dungeon generation and combat rules
that `js/gen/` and `js/combat/` reproduce. They are here only so the site can show dungeons exactly as the game builds
them. The game's art, sounds and app are not included, and all graphics are drawn procedurally.

This is an unofficial fan project. It is not affiliated with or endorsed by the developer of Nonograms Katana. If you
are the developer and would like anything changed or removed, please open an issue and it will be taken down.
