# Combat oracle (M4): input and output contract

The JVM oracle runs the game's own combat engine headless and records the state after every input. The JS engine (M5)
mirrors the setup, the input vocabulary and the record format below, so the two can be diffed record by record.

The oracle lives in `nonograms-katana/tools/oracle/`:
- `FightHarness.java` is the harness.
- `FightHook.java` holds the runtime hooks.
- `TraceAgent.java` has the fight mode (bytecode rewrites).

## Running it

```
cd nonograms-katana/tools/oracle
flock /tmp/nk-oracle-build.lock ./build.sh      # after stub / agent changes (shared with other oracle users)
./run.sh fightgen <type> <seed> <xseed> <at> <inputs.json|-> [out.json] [flags]
./run.sh fight    <guild.dat|export.zip> <inputs.json|-> [out.json] [flags]
```

`run.sh` adds `-javaagent:agent.jar=fight` for these two modes. If you set `NK_AGENT_ARGS` yourself, it must include `fight`.

**`<at>` (fightgen only):**

| Value | Meaning |
|---|---|
| `start` | Stay at the generated start cell. |
| `x,y` | Teleport to that cell. |
| `auto` | A ready-made encounter (rule below). |
| `near:x,y` | Like `auto`, but measured from the critter standing at `x,y`, e.g. a boss. |

**Flags:**

| Flag | Effect |
|---|---|
| `--kit` | Adds 5×120, 2×168, 5×143, 3×144, 2×174, 2×209 and 1×123 to the backpack `mw.D`, in that order. Sets skills `nw.h[i] = max(cur, lvl)` for (i, lvl) = 0:1, 1:2, 2:3, 3:3, 5:1, 6:1, 7:1, 17:1. Then `mw.G(min(60, nw.n()))`, which sets MP. |
| `--kit2` | After `--kit`: the exploration kit (`tools/explore.mjs`). Adds `KIT2_ITEMS` (FightHarness / `setup.js`): 10×120, 3×122, 10×121, 2×124, 2×123, 2×304, 4×217, 219, 2×218, 2×292, 3×118, 2×206, 2×294, 2×285, 295, 2×235, 2×236, 306, 303, 2×277, 291. Raises skills to their max levels (`zw.r[i].h.length`) for 0-15 and 17 (not 16; 14 traps indifference makes `c30.k0` true). Then `mw.G(nw.n())`: full MP. Header `kit2: {items, skills, mp}`. |
| `--quests Q[:B],..` | fightgen, before generation: quest `vj0.i2.Y0(Q).j0 \|= B` (default 16 = active, 128 = done). The generator reads quest state, e.g. quest 73 places the HP-threshold boss 621 (`bw.K0`) in types 23-25. Header `quests`. |
| `--skills I:L,..` | After the kits: `nw.h[I] = L` exactly (e.g. `15:0`, no taming, for the bait toast `vj0.d0`). Header `skills`. |
| `--pets S:SEED:RANK:FOOD:N,..` | With `--profile`: the companions are appended to the hero's `nw.l` **before** entry, and the game's own entry code fills the familiar slots. Otherwise, after the other hero edits: companions `new uw(S, SEED, RANK)` with `uw.l = FOOD`, `uw.k = N` appended to the hero's `nw.l`, then the familiar slots exactly as PageDungeon's dungeon start (smali PageDungeon ~6000): for each of the first 3 with food a `gw` in `hw.v[i]` (charges `kh0` 1, +1 with uw flag 1048576, +1 for food 236 / 251 / 252; `uw.j(true)`, `gw.b = uw.f.a`, `gw.e = uw.f(true)`), item `225 + i`, `uw.c()`; then `mw.C = 1 / 3 / 5` for 1 / 2 / 3 familiars. Species 190-193 are the pet kinds. Header `pets`. |
| `--level N` | `nw.w(nw.q(N))`: sets XP to level N's threshold. Kills add XP and recompute `nw.g`, so writing `nw.g` alone would not stick. Capped at 21 for a fresh profile. |
| `--gear T` | Tier T, 1..4. Sets `nw.i[0..3]` to weapon {154,155,156,176}, armour {157,158,159,216}, shield {160,161,162,188} and ring {163,164,165,175}. Gear is **not** kept by save/load. |
| `--fuzz N --fuzzseed S` | Appends N inputs from a seeded policy, `java.util.Random(S)`. The policy only reads state, and the inputs it used are written to `inputs`, so replaying them without `--fuzz` gives identical records. |
| `--draws` | Records the hw.x draws of each input in `rng.d`. |
| `--trace` | Like `--draws`, and also records the calling method of each draw. Adds `summary.callers`. |
| `--cap N` | Maximum S0 calls per input. Default 20000. |
| `--run 0\|1` | Sets c30 pref `i0` (DNG_ALWAYS_RUN, default 1). |
| `--trapsindif 0\|1` | Sets c30 pref `j0` (DNG_TRAPS_INDIF, default 1). |
| `--save F` | After the last input, writes `guild.dat` with the game's writer `vj0.n2()`, with this hw as `K0`. A fresh profile first gets `vj0.s2(0)`, because the loader's sanity check `zi0.b()` rejects the never-initialised counters of the `<clinit>` profile. |
| `--cells` | Records also carry hidden map state (see RECORD): `cellsH` / `cells` (tiles) and `vis` (fog). |
| `--snap P DIR [N]` | Method snapshots, like the generator's `snapbatch`: the entry and exit state of the first N (default 20) calls of `P` from the init settle on, as `DIR/<n>-entry.json` / `<n>-exit.json`. `P` is `name(` or `name(desc` (any instrumented class) or `Class.name(` (`c30.e(`, `hw.t(`). `run.sh` instruments `c30` when `--snap` is present; set `NK_TRACE_CLASSES=c30,hw,aw,mw` for model methods. See "Method snapshots" below. |
| `--snapskip K` | With `--snap`: skip the first K matching calls. |
| `--profile F` | fightgen from a player profile (`guild.dat` or the export zip) instead of the fresh one: the game's loader, then the game's own dungeon start `PageDungeon.C(type, false)` (see "fightgen --profile" below). Header `profile` (file name), `hero`. Without it, output is unchanged. |
| `--hero N` | With `--profile`: `vj0.H0 = N` (the hero selection) before entry. Default: the save's `H0`. |
| `--premium` | With `--profile`: `UApp.X0.e = true` (premium: fee less `vw.e`, +1 flamethrower, 277×2, 168×1, `hw.s`). Header `premium: 1`. |

**Cost:** one run takes about 3 s of JVM start and in-memory compile, plus 0.2–1.2 s for 200 inputs. Output is byte-identical across runs.

## Setup (mirror exactly)

### fightgen
1. Use the fresh profile `vj0.i2` and hero `nw = vj0.i2.l[0]`. Then `hw = new hw(type, nw)` and `x30.g(hw, seed)`. If generation gets stuck, output `{"error":...}`; there is no `x30.f` retry.
2. `hw.x.a = xseed`, then `hw.n(null)`. This is the order PageDungeon uses, except that the game's `xseed` is `currentTimeMillis ^ hw.a`.
3. **Teleport** (`at` ≠ `start`). This is the same sequence as teleport items 237-239 in `DungameView.d0`:
   - `hw.D(tx, ty, hero)`
   - if `hero.s(512)`: `hero.y(512)` and `hw.L(ox, oy)`
   - `hw.m(tx, ty, true, true)`
   - `hw.n(new fw(hero.k, false))`
4. **`auto` target cell:**
   - **Monster:** the critter nearest the hero (Manhattan), counting only critters that are hostile (`zw.o(hero.k, k)`), alive, and standing in a room (`hw.l & 1023 ≠ 0`).
   - **Cell:** a free cell (`hw.z`) in the same room (equal `hw.l`) at Chebyshev distance 3 from that monster. If there is none, try 2, then 4, then 5.
   - **Tie-break:** nearest to the hero (Manhattan). If still tied, take the first in row-major order.
5. Hero edits, in this order: `--level`, `--gear`, `--kit`, `--kit2`. If `--level` or `--gear` was given, refill with `hero.A(hero.q())` and `hero.z.z(hero.D())`. Then `--skills`, then `--pets`. (`--quests` is applied before step 1's generation.)
6. `vj0.i2.K0 = null`. With it null, `c30.K()` (dungeon end) only sets `w`.
7. Build `c30` as the dungeon view init in PageDungeon does (`kl0`, PageDungeon.java about line 2240):
   - **Copied fields:** `d, a, e, f=1, b=zw.K[zw.b(type)], c=vj0.i2.R0[..], g, h, i, j, q=pw.G`, then `T0()`.
   - **`y0`:** `y0 = zw.g(hw.b, 0) + "-" + hw.a`.
   - **`zw.w[1]`:** `pw.B` if set, else `zw.v`.
   - **Flags:** `l=true`, `u=nw.h[12]>0`.
   - **Search fields:** `t0/u0` (first cell holding object 35 / 60) and `v0/w0` (first cell with `a==1 && (b&63)==12`).
   - **Noise array:** `k[]` from the LCG on `(hw.a+1001)*69069`.
   - **Particles:** the `z0` system with `Random(0)` (cosmetic only).
   - **`n`, `o`:** `n=true`, `o=pw.E`.
   - **Prefs:** `l0=false`, `i0=true`, `j0=true`, `k0=nw.h[14]>0`.
   - **Autosave clock:** `x0 = Long.MAX_VALUE/4`, so autosave never fires.
   - **Level-clear flag:** `if (!v && hw.i()==0) v = true`.
8. Settle (the loop below). The resulting state is the `init` record.

### fightgen --profile
Runs the game's own dungeon start (no mirror): `FightHarness.setupProfile`, JS `js/combat/entry.js` `setupProfile` /
`newFightFromProfile`.
1. `vj0.i2.c2(bytes, true)` (the loader). A dungeon in progress is dropped: `vj0.K0 = null` (entry needs none).
2. `--hero N`: `vj0.H0 = N`. Every hero away (`nw.n > 0`) is made back (`n = o = 0`, what the game's timer does when
   it runs out), so the "hero away" and "5 heroes away" gates pass (the user's export has 5 heroes away, the
   selected hero 19 among them).
3. `--pets`: companions appended to `vj0.u0().l`. `--premium`: `UApp.X0.e = true`.
4. `UApp.X0.j` (final `java.util.Random`, the game's seed source) is reseeded so its next `nextInt()` is `seed`.
5. `PageDungeon.C(type, false)` on an `Unsafe`-allocated page with `cm0.c = vj0.i2`. The game's code does all of it:
   the gates (`nw.n <= 0`, fewer than 5 heroes away, `M0.size() <= U0()`, `D1(type)`, fee `vj0.z(false, true,
   premium, type)` paid from `vj0.K` **before** generation, which reads `vj0.K`), `new hw(type, hero)`,
   `x30.f(hw, seed)`, `hw.x.a = (int) now ^ hw.a`, `hw.n(null)`, MP (`min(K.j(192), nw.n())` out of `K`), the
   familiars (first 3 companions with food: `gw` slots, items 225-227, `uw.c()`, `mw.C` 1/3/5), the pack (every
   `vj0.c1` item with `c != 19`, `V > 0`: `min(K.j(id), nw.d(bj0))` out of `K`, locked `nw.m` skipped), armour 254
   (+2×209, +1×206), research 37 (`I1[37].i`×206), premium extras, `vj0.g2(false)`. `vj0.l2` (autosave) and `UApp`
   are no-ops under the agent. The page-UI tail (`this.C.d(...)`, null on the allocated page) throws a
   `NullPointerException` after the run has started; that one is expected, anything else is an error.
6. The run must have started (else `{"error":"profile: PageDungeon.C did not start the run: <gates>"}`, e.g. `z (fee)`,
   `D1 (not unlocked)`) and `hw.a == seed` (else `x30.f` retried: the seed is stuck for this profile; error).
   `hw.x.a = xseed` overwrites the clock-based value (`hw.n` draws nothing).
7. Then fightgen's steps 3 (teleport), 5 (hero edits, without `--pets`), 6, 7 and 8.

The JS side mirrors the same deviations (2, 4: the label's seed with `x30.g` once, 6) and, for setups the game would
refuse (locked type, fee, stable), starts the fight anyway and lists the gates in `fight.entry.gates`.
Corpus: category `profile` (`pf-*`): the user's export (heroes 19 / 0 / 3 / 1 on its unlocked types; `--premium`,
`--pets`) and synthetic profiles `SaveHarness savegen prog` (`~/.cache/nk-oracle/save/prof/synth/prog-0-*.dat`: all
types unlocked, stock with MP / fees / consumables, taming foods, pet food 270, a locked item, research 37, companions
with food), hero `--level 20` after entry. `node test/entry.mjs` checks `entryPack` against their init records.

### fight
`vj0.i2.c2(bytes, true)` is the game's loader. Use `hw = vj0.i2.K0.b()`; an `ew`, or no K0 at all, is an error. Then run steps 5–8, with the hw.x and hw.w states exactly as saved.

A mid-combat `--save` followed by `fight` continues identically:
- **What matches:** the hero, x.a/w.a, every draw, C and D.
- **Tests:** splits at 10 and 40 of a 71-input combat-heavy run gave 0 differing steps.
- **Lost across the round trip:** c30's UI state (tool selection `V/W/X`, tap path `z`, `a0`), `hw.G/H` leftovers, and initiative `o`. A `cancel` right after loading is therefore rejected.

## Generation with progress (Harness `--progress`, `progbatch`, `progress`)

The dungeon generator under an arbitrary player progress state, without a save: `Harness.java` edits the fresh
`vj0.i2` before `x30.g`. JS mirror: `js/gen/progress-spec.js` (`applyProgress`, `readProgress`, `withProgress`), the
same spec format. What the generator reads and what each read changes: `js/gen/progress-reads.js`. Sweep:
`node test/progress.mjs [--oracle]`.

```
./run.sh gen 14 123 --progress '{"quests":{"25":"active"}}'       # inline JSON or a file; any Harness mode
./run.sh batch DIR all 10 1 --progress spec.json
./run.sh progbatch jobs.json OUTDIR                               # many specs in one JVM
./run.sh progress --progress spec.json                            # the spec of vj0.i2 after the edits
```

Without `--progress` every mode's output is byte-identical to before.

**Spec** (every key optional; unknown keys, quest / building / perk / counter ids are errors in both engines):

| Key | Value | Writes |
|---|---|---|
| `quests` | `{"<id>": [j0, k0] \| "none" \| "active" \| "done"}` | `vj0.Y0(id).j0 = (byte) j0`, `k0 = (byte) k0`; the words are `[0,0]`, `[16,0]`, `[128,0]` (`kj0.C` starts with `j0 \|= 16`, completion is `j0 = (j0 & ~16) \| 128`) |
| `J0`, `I0`, `B` | int | `vj0.J0` (bosses: bits 0-14 classic, 15-22 forest minor / main, 23-25 caves), `vj0.I0` (bits 28-31: mini-bosses 2C-5C beaten), `vj0.B` |
| `X` | decimal string (long) | `vj0.X` (perk bits; only hero stats read it) |
| `items` | `{"<id>": n}` | `vj0.K`: entries of `id` removed, then `cq.b(id, n)` when `n > 0`; `vj0.L`: entries of `id` removed. So `L0(id) = n` and `P1(id) = n > 0` |
| `buildings` | `{"<id>": [B0, C0?]}` | `vj0.o[id].B0` (level), `.C0` (done-step bits, `ni0.h0(s)` = bit `s - 1`) |
| `stats` | `{"x": n, "f": {"<i>": n}, "b": {"<id>": n}}` | `vj0.N.x` (trades with tag-1001 merchants), `N.j(i, n)` (encoded counter: dungeons of type `i` cleared), `N.b` like `items` (items found) |
| `perks` | `{"<i>": q}` | `vj0.j[i].q` (`vj0.p0()` is their sum) |

**`progress`** prints the canonical spec of `vj0.i2`: every quest with `j0` or `k0` set (as `[j0 & 255, k0 & 255]`),
`J0`, `I0`, `B`, `X`, `items` for 114 / 256 / 305 (`L0`, the ids the generator reads), every building, `stats` with
`x`, `f.18`, `b.115`, every perk. JS `readProgress` returns the same JSON, key order included.

**`progbatch <jobs.json> <outdir>`**: `jobs.json` is `[{"name", "progress", "cases": [[type, seed], ...]}, ...]`. Per
job the edits are applied to the fresh profile (with an undo log), `<outdir>/<name>.jsonl.gz` gets one JSON per line
(`{"progress": <spec read back>}` or `{"error": "<why the spec was rejected>"}`, then one `gen` dump per case), and
the edits are undone, so jobs are independent. About 25 ms per dungeon after the 3 s start;
`test/progress.mjs --oracle` runs 6 JVMs in parallel.

## Settle loop
This is `DungameView.onDraw` with all frame time elapsed:

```
repeat up to cap:
  if c30.w            -> "end"
  if c30.d0 > 0       -> d0 = 0; B = C = E = null        (animation finished)
  if c30.g0           -> run the oldest captured dialog Runnable, continue   (none captured -> "dlg")
  if c30.f0           -> "in"                             (hero waits for input)
  c30.S0()
  2000 consecutive S0 calls with d0==0 and no f0/g0/w  -> "idle"
-> "cap"
```

Dialogs come from `DungameView.T(...)`. The rewritten `T` stores its `Runnable` argument, which is the dismiss callback (`g30` → `v20` / `t20` / `t93` / `u20`). The game sets `c30.g0 = true` before every `T` that has a callback.

## Inputs (JSON array)

| input | gate | engine call |
|---|---|---|
| `{"t":"tap","x":X,"y":Y}` | canTap | `DungameView.onTouchEvent` DOWN then UP at screen `(64(x+y)-1-c30.n0, 32(y-x)-38-c30.o0)`, view scale 1. This is the exact inverse of `c30.C0`. Afterwards `DungameView.W = true`. |
| `{"t":"step","dx":-1..1,"dy":-1..1}` | canTap | tap at hero + (dx, dy). Diagonals are allowed; it is just a tap. |
| `{"t":"unseal","x":X,"y":Y}` | canTap, and a critter at X,Y with `qw.d && i(nw) > 0` | tap. `c30.o()` turns it into `f(2)`: ranged when 2..3 tiles with LOS and skill 7, otherwise melee. |
| `{"t":"wait"}` | canSelect | `DungameView.d0(20001, item, false)` |
| `{"t":"skill","id":I[,"x","y"]}` | canSelect; `I` in `zw.q`, `I < 20200`, learned (`yv.o==-1 \|\| nw.h[yv.o]>=1`) | `d0(I)`. If x,y is given, the selection is now `I`, and canTap holds, then tap(x, y). |
| `{"t":"item","id":I[,"x","y"]}` | canSelect; `I` in `vj0.Z1` and `mw.D.k(I)` | same as skill |
| `{"t":"potion","id":I}` | as item | `d0(I)` |
| `{"t":"cancel"}` | canSelect, and something is selected | `d0(selected id)`, which toggles it off |

**Symbolic targets** (for hand-written scenarios, `test/scenarios/*.json`): an input may carry `"at"` instead of x,y. The
oracle resolves it when the input is applied, and `in` / `inputs` record the concrete input, so replays never see `at`:
- `"at":"near"`: the nearest live hostile critter (Chebyshev, first in `hw.o` order), as the fuzz policy picks it.
- `"at":"hero"` with `"ox","oy"`: the hero's cell plus that offset.
- `"at":"free"`: the first free (`hw.z`) 4-neighbour of the hero, in the order left, up, right, down.
- No such cell: x,y are left out (a tap is then rejected as out of bounds; a skill or item is only selected).

**Gates:**
- **canTap:** `hw.F==null && c30.O==null && !c30.w && !hero.u() && c30.g0()`. This is the gate inside the tap branch of `onTouchEvent`.
- **canSelect:** `c30.d0==0 && !c30.w && !hero.u() && c30.g0()`. This is the gate of `d0`.
- Inputs are only applied when the engine status is `in`, `idle` or `cap`.

**A selection persists across inputs** (`c30.V/W/X`, shown as `sel`). A later tap uses the selected skill or item, exactly as in the game. Send `cancel` before a plain move.

The headless sprite-pick list `c30.I0` is empty, so a tap picks the object at the tapped cell, `hw.k[y*g+x]`.

### Item and skill ids
**Skills:**

| id | skill | notes |
|---|---|---|
| 20001 | wait | |
| 20002 | smashing blow | targeted |
| 20003 | round kick | |
| 20004 | demoralize | |
| 20005 | charge | +EP for MP |
| 20006 | doctor | below half HP |
| 20007 | divine protection | |

**Items:**

| id | item | `bj0.c0` | engine action |
|---|---|---|---|
| 120 | potion | | |
| 123 | ambrosia | | auto-revive in `c30.e` |
| 143 | kunai | 1 | `f(7)`, not adjacent |
| 144 | grenade | 2 | area `f(8)` |
| 168 | mechanical spider | 6 | `f(10)`; reusable, its HP is kept in `hw.r` |
| 174 | net | 5 | `f(12)`, not adjacent |
| 209 | hook | 9 | `c30.B` |

## Output

```
{ "mode", fightgen: "type","seed","xseed","at","profile"?,"hero"?,"premium"?,"pets"?,"start":[x,y],"tele":[x,y]?
          fight: "save","type","seed","rng0":[x.a,w.a],
  "level"?,"gear"?,"kit"?:{"items","skills","mp"},"run"?,"trapsindif"?,"fuzz"?,"fuzzseed"?,
  "heroStats": {"lvl","xp","hp","ep","mp","atk","def","spd","gear":[4 ids],"skills":[18]},   // nw-derived, at setup
  "init": RECORD,                          // after the setup settle; "cr"/"obj" list everything
  "steps": [ {"i", "in", "r", "why"?, ...RECORD} ],
  "inputs": [...],                         // exactly the inputs applied (file + fuzz), replayable
  "summary": {"inputs","ok","noop","rejected","xDraws","wDraws","st","dead","end","dialogs","callers"?} }
error: {"mode":..., "error":"..."}
```

### Step fields
- **`r`:**
  - `rejected`: the gate or validation failed (`why` gives the reason), or the engine status was end/dlg/err. The engine was not called.
  - `noop`: the input was applied, but after settling the state is unchanged. "State" means the hero record, `sel`, the tap path, C, the RNG states and counters, and every critter and object record.
  - `ok`: anything else.
- **`st`:** the settle status after this input: `in`, `end`, `dlg`, `idle`, `cap` or `err`. If `err`, then `err` holds the exception and the run stops.

### RECORD
- **Combat:** `C` is `hw.C` (in combat). `D` is `hw.D` as serials (turn order; `D[0]` is acting).
- **Selection:** `sel` is the selected tool id, the skill `yv.a` or the item `bj0.a`, and 0 for none.
- **`hero`:**
  - **Identity and position:** `n` (serial), `x`, `y`.
  - **Pools:**
    - `hp` / `hpM`: `aw.j` / `q()`
    - `ep` / `epM`: `mw.z` / `D()`
    - `mp` / `mpM`: `mw.E()` / `nw.n()`
    - `ap`: `aw.n`
    - `spd`: `r()`
  - **Status (`st`):** `[p, q, r, s, t, u, v, w, x, o]`, the aw status fields. `p` is the bit set; `o` is initiative.
  - **Inventory:** `fam` is the `mw.C` charges. `inv` is `[[id, count]]` in `mw.D` order.
  - **Pending input:** `path` is `c30.z.size()`, the queued tap path. `tgt` is the `c30.a0` serial.
  - **Pending action:**
    - `F`: actor of the pending action, `hw.F` serial or -1
    - `G` / `H`: `hw.G` (action type) and `hw.H` (phase). These are not reset after an action.
  - **Spider:** `spider` is the `hw.q` serial and `spiderHp` is `hw.r`.
- **`cr`:** critters other than the hero, each as `[serial, id, x, y, hp, ap, k, p, q, r, s, t, u, v, w, x, o, l, m, c, d, e, f, g, h]`.
  - `k` is the faction: 1 for hero side, 2 for hostile.
  - `l` is the target serial, or -1.
  - `m` is `aw.m`.
  - `c..h` are the `qw` fields; `d` is the seal flag.
  - **Which critters appear:** `init` lists all of them. A step lists only critters that are new or changed since the previous record.
- **Removals:** `gone` and `objGone` list critters and objects that left `hw.o` / `hw.n`, as `[serial, id, x, y]`.
- **`obj`:** objects in `hw.n` order, each as `[serial, id, x, y, c, d, e, f, g, h]`. Like `cr`, `init` lists all of them and a step lists only new or changed ones.
- **`rng`:**
  - `x`, `w`: `hw.x.a`, `hw.w.a`
  - `nx`, `nw`: cumulative draw counts since setup, including the init settle. These count `e01.h` and `e01.g` on that instance; `e01.i` goes through `h`.
  - `d`: this input's hw.x draws as `[bound, value]`, or `[bound, value, "c30.method"]` with `--trace`. A bound of -1 means a raw `g()` draw.
- **`dead`, `end`:** `dead` is `hero.u()`; `end` is `c30.w`.
- **`cellsH`, `cells`, `vis`** (only with `--cells`): tiles `hw.j` as `v = ww.a << 8 | (ww.b & 255)`. `init` has
  `cellsH`, the int hash `h = 31 * h + v` over all cells; a step has `cells`, the `[index, a, b]` (b as a signed byte)
  that changed since the previous record. Both have `vis`, the same hash over `hw.m` (visibility, `c30.j`). This shows
  puzzle / plate bits, cleared undergrowth, dug cells and trap marks, which no other field does.
- **`dlg`, `msg`:** `dlg` is the number of dialogs auto-dismissed during this input. `msg` lists toasts as `"S:<drawable>:<text>"` and dialog texts as `"T:<text>"`. Strings come through a Context stub as `#<resId>`.

**Serials:** at setup, critters (hero included) are numbered in `hw.o` order, then objects in `hw.n` order. Before each record, the oracle scans `hw.o` then `hw.n` and gives each object not yet seen the next number. A critter that appears and vanishes within one input never gets a serial; for example, the spider is dismissed when combat ends. Its effect still shows in `rng.d`.

## Method snapshots (`--snap`)
`Hook.enterC` / `exitR` (TraceAgent `instrument`) write, per matching call:
- `<n>-entry.json`: `{"method":"e(ILaw;Law;Lyv;Lbj0;I)I","class":"c30","depth":0,"nx":..,"nw":..,"state":[self, args, hw]}`
- `<n>-exit.json`: the same with `"state":[self, returnValue, hw]` (return boxed; `null` for void).

`state` is one Snap graph (identity kept across self, args and the extra root `hw`). `nx` / `nw` are the cumulative
hw.x / hw.w draw counts, so `exit.nx - entry.nx` is the call's draw count. Static tables are `{"$t":path}` refs
(`Harness.TABLE_ROOTS` without `vj0.i2`): the profile is **not** a table root, so the hero `nw` (edited by setup) is
inline, and a JS replay of a `fight`-mode snapshot needs the same save installed. Opaque (`"<class>"`): DungameView,
UApp, ToolbarItem, DragLinearLayout, Context, views, particles (`nc1`, `mc1`, `lc1`) and render-cache entries (`a30`,
`b30`, `w20`, `x20`, `y20`, `z20`). A c30 snapshot of a mid-size dungeon is about 300 KB. Writing to `/mnt/c` is slow
(about 1 s per file); a Linux directory is much faster. Fight output is byte-identical with and without `--snap`.

## Engine findings (for the port)
- **The waiting move uses the monster's own path** (corrected by the turn-loop port, from smali). `c30.z` is one shared list of direction ints:
  - `p0()` and combat entry clear it.
  - The AI then writes the monster's own A* path into it (`hw.t(me, tgt, this.z, 20, 20, …)`) just before calling `p()`.
  - `n0` pops steps from its end.
  - `c30.p` fires when the path length is `min(spd-1, 2) + 1`, the monster has exactly that much AP, every path cell is free, and no other hostile is within that range + 2 of the hero. It then waits with 67% probability (`x.h(100) >= 33`). In every corpus case the hero's tap path was already empty.
  - The hero's tap path is still engine state between inputs: a multi-tile tap moves one step per settle tick, and the monster turns are interleaved.
- **Flag 32768 is never cleared.**
  - **Where it is set:** `c30.t` sets it on the hero (divine protection, through `T(hero)`) and on demoralized critters (2048 → 32768). The combat-exit clear `y(1231)` does not include it.
  - **Evidence:** in 81 runs it was set on the hero 47 times and on critters 4 times, and cleared 0 times. That covers 152 combat exits; later combats in the same level began with it still set, and retries of 20007 were no-ops.

  So divine protection and demoralize are once per level.
- **RNG callers seen:** `c30.e` (damage: `h(5)` then `h(100)` per hit), `c30.S0` (initiative `h(30)`), `c30.P`, `c30.R0`, `c30.y`, `c30.v`, `c30.A`, `c30.Z`, `c30.Q` and `c30.p`. `hw.w` was never drawn during combat.
- **The spider's HP lives on.** Mechanical spider (168) is summoned through `f(10)` → R0. It fights, and when combat ends `S0` stores its HP in `hw.r` and removes it.
- **Ambrosia (123)** is consumed inside `c30.e` when the hero would die.
- **Dungeon end:** hero death without a revive sets `c30.w` through `K()`, giving `st=end`.

## Not supported yet
- **Unreachable headless / with a fresh profile** (found by `tools/explore.mjs` coverage):
  - `c30.e0` and `c30.O0` are only called by the toolbar / renderer (`DungameView`, `c30.D`).
  - Items 237-239 teleport to `hw.B` marks, which only a save or the page UI sets; 185 (horn) needs a second guild hero;
    173 (thread) is the leave dialog. Not in any kit.
  - `pw.H` dungeons (the `m0` branch for objects with `h & 16384`): no type 0-26 has `pw.H`.
  - Shrines 85-87 with `qw.h == 1008` (offering of `pw.y`): generated shrines have `h == 0`.
  - The exploding spider (`c30.h0`: 199 with guild research `vj0.i2.o[7].h0(11)`) and the quest-step parts of NPC talk
    (`kj0.s(0, type)` true needs quest step state beyond `j0`), `c30.r0` / `B0`, and the after-fight quest spawns in `S0`.
- **JS input layer** (`js/combat/input.js`): `DungameView.d0` throws for items 173 (thread), 185 (companion) and
  237-239 (teleport scrolls); the tap's item kind 8 (companion capture) needs `vj0.d0_` for its message. Never
  reached by the corpus (the fuzz policy only uses targeted items and potions).
- **Item 185 (companion):** needs the sprite cache `DungameView.Q0`.
- **Item 173 (Ariadne thread / leave):** the leave dialog is a no-op.
- **Object 93:** the "examine" dialog's action (`DungameView.R` with the `d8` callback) is never run.
- **Familiars (`c0 == 7`, items 225-227):** need `--pets` (see the flags); exercised by the `explore-target` runs `xt-pets-*`.
- **Pref toggles 20200-20202:** rejected as skills; use `--run` / `--trapsindif`.
- **Multi-touch, drag and scroll gestures:** not modelled. Only single taps.
- **Level transitions** (ladders, portals): the run stops at `end`, or at whatever the engine does without the page UI.
