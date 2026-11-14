# Porting the combat engine (`js/combat/`)

Same conventions as the generator (`js/gen/PORTING.md`):
- Java class and field names are kept exactly.
- **Every ported method gets a `_` suffix.**
- Java int semantics come from `js/gen/jrt.js`.
- Statement-by-statement ports keep RNG call order and short-circuit evaluation.

Sources, under `../nonograms-katana/`:
- Vineflower `decompiled/vineflower/c30.java`: the primary source, fully decompiled.
- `decompiled/sources/com/ucdevs/jcross/d/DungameView.java` (JADX; garbled in `onTouchEvent`/`d0`).
- Smali in `~/.cache/nk-oracle/smali/`: ground truth.
- The oracle contract is in `js/combat/ORACLE.md`.

## Infrastructure
- **c30 methods:** add them with `install({...})` from `./c30.js`.
- **Model classes:** methods missing from `js/gen/model` (hw/aw/mw/qw/nw/uw/cq/bw/…) go in with `extend(classes.hw, {...})`. It throws if the method already exists, so a duplicate shows up at load time.
  - Before adding one, grep `js/gen/model/` and the other `js/combat/*.js` files.
  - If two parts both need a missing model method, the **owner listed below** ports it.
- **Imports:**
  - `classes` from `../gen/registry.js`
  - statics from `../gen/statics.js`
  - helpers from `../gen/model.js` and `../gen/jrt.js`
  - never `../gen/index.js` or `./all.js`; those use top-level await
- **RNG:** `hw.x` is the combat RNG (`h_`, `i_`, `g_`). Draw order must match exactly; the oracle's `--draws`/`--trace` show every draw with its caller.

## Who ports what (every c30 method exactly once)

| File | Owner | c30 methods | Also owns (model / view) |
|---|---|---|---|
| `setup.js`, `input.js`, `ui.js`, `nav.js`, `driver.js`, `record.js` | foundation | constructor fields (done in `c30.js`), `T0`, `C0`, `O0`, `q0`, `N0`, `N`, `O`, `S`, `b0`, `L`, `j`, `k0`. **No-op/visual stubs:** `D`, `E`, `A0`, `C`, `F`, `F0`, `K0`, `L0`, `x0`, `v0`, `y0`, `z0`, `J0`, `d`, `t0`. Before stubbing one, verify it doesn't change rules state; port it if it does. | DungameView input layer (tap branch of `onTouchEvent`, toolbar `d0`), ported from smali. hw navigation and visibility: `hw.t` (A*), `hw.O` (LOS), `hw.D` (move critter), `hw.m`/`n`/`o` (reveal), `hw.N`, `hw.q`/`r`/`s` (partners), plus any other hw method the oracle setup needs. Settle loop, input gates and RECORD builder (ORACLE.md). `test/combat.mjs`. |
| `turn.js`, `ai.js`, `damage.js` | turn | `S0`, `p0`, `o0`, `k`, `v`, `g0`, `E0`, `K`, `i0`, `z`, `J`, `T`, `t`, `p`, `x`, `y`, `h`, `M0`, `P`, `Q`, `D0`, `c0`, `h0`, `a0`, `e` (damage), `q` (transform), `e0` | aw/mw status helpers the AI and damage need (`aw.s`/`y`/`B`/`r`/`u`, …) if they're missing |
| `actions.js` | actions | `f`, `R0`, `A`, `P0`, `X`, `G0`, `H0`, `V`, `W`, `Y`, `u`, `g`, `B`, `Q0`, `i`, `G`, `H`, `I0`, `r0`, `B0`, `a` | `bj0` item and `yv` skill helpers, `cq` inventory ops (`k`, `q`, `b`, …) |
| `entry.js` | entry | none (PageDungeon.C, the dungeon start from a player profile: `newFightFromProfile`, `entryPack`, `setupProfile`) | `nw.d` (carry cap), `vj0.C1`/`x1`/`F1`/`D1`/`U0`/`z` |
| `move.js` | move | `m0`, `l0`, `n0`, `Z`, `o`, `d0`, `u0`, `s0`, `w0`, `f0`, `j0`, `I`, `w`, `n`, `R`, `b`, `M` (static), `U`, `r`, `s`, `c`, `l` | |

## Testing
Everything below runs from the site repo; `O=../nonograms-katana/tools/oracle`.

**End to end** (`test/combat.mjs`): build the JS fight from an oracle file's header, compare the header (start, tele,
level, gear, kit MP, heroStats) and the `init` record, then apply the file's `inputs` one by one and compare every
step record (all fields; `rng.d` as [bound, value], `err` by presence).
```sh
$O/run.sh fightgen 8 172582050 12345 auto - /tmp/f.json --kit --level 10 --fuzz 200 --fuzzseed 1 --draws
node test/combat.mjs /tmp/f.json                 # one file
node test/combat.mjs                             # the corpus ~/.cache/nk-oracle/fights (about 2.5 min)
node test/combat.mjs --types=8,19 --only=autokit -v
node test/combat.mjs --init                      # header + init record only (setup, nav, FOV)
node test/combat.mjs --all --max=5               # keep going after a file's first divergence; stop after 5 files
```
- The first divergence per file prints the input index and input, the differing fields (hero sub-fields, the
  changed `cr` / `obj` rows by serial, rng counters), and this input's hw.x draws side by side: oracle
  `[bound, value] Java caller` | JS `[bound, value] JS caller` (`*` marks the first mismatch). A missing method of
  another part shows as `X_ not ported (...)`. The summary groups files by first-divergence reason.
- JS API (`js/combat/driver.js`): `newFight(spec) -> fight` (`fight.init`, `fight.header()`), `fight.apply(input) -> record`;
  `specOf(oracleFile)` gives the spec of a file. `fight` mode takes `spec.imported` = `await importSave(bytes)`.
  Each fight needs fresh static tables: `resetStatics(tablesJson)` (setup.js) before `newFight`.
- **Corpus:** `test/make-fights.sh [--jobs N] [--only RE] [--force] [--list]` writes `~/.cache/nk-oracle/fights/*.json`
  (+ `index.json`: category, oracle args, save path; `saves/` for the chained saves). 628 fights, 108k inputs: every
  type 0-26 with auto (kit + level, bare, gear + long fuzz with --trace, short), start, near:boss (strong, and a weak
  level-2 hero meleeing to death: ambrosia), prefs (--run 0 --trapsindif 0), a mid-fight `--save` continued by `fight`,
  the synthetic saves of `test/save.mjs`, and `test/scenarios/*.json` (one per item and skill, plus cancel / unseal /
  steps / wait) on types 8, 15, 19, 23, the exploration runs below (198 fights, 80k inputs), and 20 profile fights
  (`pf-*`, `fightgen --profile`: the user's export when present and `savegen prog` profiles). Seeds come from
  `~/.cache/nk-oracle/fx7`. About 35 min with 6 jobs; `node test/combat.mjs` on all of it about 6 min.
- **Exploration** (`tools/explore.mjs`): the JS engine plays whole dungeons with a seeded policy (route planner stops,
  bumps, ladders, the floor nonogram, barrel pushes, stairs; a combat mix of melee, skills, items, potions) and writes the
  inputs it used; the oracle replays them (`fightgen ... <inputs.json>`, no `--fuzz`) and `test/combat.mjs` diffs.
  ```sh
  node tools/explore.mjs --types=8,15 --seeds=2 --oracle             # whole dungeons, 2 seeds per type; /tmp/nk-explore
  node tools/explore.mjs --targets --only='E0|K0' --oracle --trace   # targeted: near:x,y of ability / boss / NPC creatures
  node tools/explore.mjs --targets --list                            # the setups and their oracle command lines
  ```
  The corpus has them as categories `explore` (`x-<type>-<k>`, 108: 4 per type, k = 3 with `--kit` only and
  `--trapsindif 0`) and `explore-target` (`xt-*`, 90: one or two creatures per `bw.q0` ability bit, summoners C0,
  transformers E0, invincible bosses m0 with and without their quest done (secret name 306), the HP-threshold boss
  621 via `--quests 73`, NPC kinds, allies, pet catching, familiars via `--pets`); make-fights generates the inputs
  once into `~/.cache/nk-oracle/fights/explore/` (kept unless `--force`). `--chaos=0.2` mixes in random inputs.
  Coverage: `NODE_V8_COVERAGE=/tmp/nkcov node test/combat.mjs; node tools/coverage.mjs /tmp/nkcov --detail=move.js --ranges`.
- **Method snapshots** (`test/combatsnap.mjs`, oracle `--snap`, see ORACLE.md): entry/exit state of a method during
  a real fight. The test revives `[self, args, hw]`, calls `self[name + '_'](...args)` (static: `Class[name + '_']`),
  and deep-compares `[self, return value, hw]` with the exit state plus the call's hw.x draw count.
  ```sh
  $O/run.sh fightgen 8 172582050 12345 auto - /tmp/f.json --kit --level 10 --fuzz 200 --snap 'c30.e(' test/oracle/c-e 20
  NK_TRACE_CLASSES=c30,hw $O/run.sh fightgen 15 1026320547 777 start - /tmp/f.json --kit --fuzz 150 --snap 'hw.t(' test/oracle/c-hwt 20
  node test/combatsnap.mjs test/oracle/c-e test/oracle/c-hwt      # -v, --ignore=f1,f2, --save=guild.dat (fight mode)
  ```
  c30's render-only fields (`C0 D0 I0 J0 Q0 R0 S0 T0 U0 V0 Y0`) are ignored; the opaque view / context are swapped for
  the JS stand-ins during the call.
- **Snapshot folders:** use distinct names (`test/oracle/c-S0`, `test/oracle/c-hwt`), because `/mnt/c` is case-insensitive;
  writing there is slow (about 1 s per 300 KB file), `/tmp/...` is much faster. Delete them when done.
- **Profile fights** (`js/combat/entry.js`, oracle `fightgen --profile`, ORACLE.md): `newFightFromProfile({ vj0, hero,
  type, seed, xseed, at }, opts)` starts a fight the way the game starts a run for that player (pack, MP, familiars,
  fee, generation with the profile's progress); `entryPack(vj0, hero, { type, premium })` is the same rules as a dry
  run. Entry works on a cached copy of the imported profile (clone.js `captureStatics` / `restoreStatics` put it back
  for every call; `generateCachedIn` caches its generation per hero / premium / pets / type / seed), so the import is
  never changed. `test/combat.mjs` and `test/clone.mjs` replay the `pf-*` corpus files through it (the profile save via
  index.json); `node test/entry.mjs` compares `entryPack` with the oracle's init records and checks the import is
  unchanged.
- **Search layer** (`js/combat/clone.js`, `test/clone.mjs`, `tools/bench.mjs`): `snapshot(fight)` / `restore(state)`
  copy the fight graph and save the statics play writes *in place* ("pins": `vj0.i2` own fields, `N`, `S0`, `R0`,
  quests `s`/`k`, heroes `l`, item stock `K` (dungeon entry), templates `zw.c(190..199)`, `zw.w`, `zw.z`,
  `vj0.A1`, `vj0.R1`); every other table
  object is shared as immutable. `resetStatics` restores the same pins instead of re-reviving `tables.json`. **If a
  ported method writes another static object in place** (a table entry, a profile field outside the pins), add it
  to `tablePinList` / `profilePinList` in clone.js; `node test/clone.mjs` (fingerprints of every static object at
  snapshot vs restore, and after `resetStatics`) reports what it missed. `NK_FULL_RESET=1` forces the old re-revive.
  Table objects are rebuilt in V8 fast mode after the revive (`fastTables`; `NK_SLOW_TABLES=1` skips it).
- **Rewritten for speed:** `hw.t_` (A*) is not a statement-by-statement port any more: it pools its
  nodes, runs the heap inline and skips the scan of an empty queue (`nav.js`, "hw.t_ without allocation"). It is
  held to the previous implementation by `test/astar.mjs` (a copy of it, run on real states: cost, path, scratch
  point and open list must be identical, so any change to the heap order fails) and by the corpus
  (`test/combat.mjs`). Don't change its order of operations without the copy in that test.
- Headless stand-ins the rules code may call (`js/combat/input.js`): `c30.d` is a `Context` (`getString(id)` returns
  `"#<id>"`, as the oracle's stub); `c30.e` is the `DungameView` (every view method is a no-op `name_()` with the Java
  default return, except `d0_`, `onTouchEvent_`, `x_`, `S_(icon, text)` (toast) and `T_(rw, text, …, dismiss)`
  (dialog; `dismiss` is a JS function or an object with `run_()`, run by the settle loop when `c30.g0`).
