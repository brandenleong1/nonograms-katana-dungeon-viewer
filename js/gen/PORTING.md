# Porting the game's dungeon generator

`js/gen/` is a bit-exact JavaScript port of the game's generator: class `x30` and the classes it uses.
A dungeon label `3C-172582050` means level type `zw.g⁻¹("3C") = 8` and seed `172582050`. `x30.g(hw, seed)`
must produce exactly the game's grid, objects and monsters, so RNG consumption must match call for call.

## Sources (local only, never committed here)

All paths are under `../nonograms-katana/`.

| What | Where | Use |
|---|---|---|
| Vineflower decompile | `decompiled/vineflower/*.java` | **Primary source.** Clean control flow, resolved constants. |
| JADX decompile | `decompiled/sources/defpackage/*.java` | Second opinion. About 20 x30 methods are garbled here. |
| smali | `~/.cache/nk-oracle/smali/*.smali` | Ground truth when the two decompiles disagree. |
| Oracle | `tools/oracle/run.sh` | Runs the real game code on the JVM (see below). |

## Conventions

- **Names:** keep Java class and field names exactly (`ww.a`, `u30.c`, `hw.f`), and keep parameter order.
  Snapshots revive by these names, and other files call your methods by them.
- **Every ported method gets a trailing underscore** (`x30.Z_()`, `hw.M_(id, x, y, flip)`, `zw.c_(id)`,
  `e01.h_(n)`). This applies to instance and static methods alike. Java keeps fields and methods in separate
  namespaces but JS does not: `hw.f` is the hero field while `hw.f(aw, z)` is a method, and `zw.c` is an int[]
  while `zw.c(int)` is a function. Comments may say what a method does in plain words.
- **Classes:** JS `class` per Java class, with `static javaName = 'qw'` when the JS identifier differs, then
  `register(...)` from `registry.js`. Superclass chains mirror Java (`aw extends qw`, `mw extends aw`,
  `hw extends iw`, `bw extends rw`).
- **x30 methods** go in their phase file via `install({ Z_() {...} }, { t_(u30, z) {...} /* statics */ })` from
  `x30/index.js`.
- **Statics:** game tables live on `zw`, `xs` (x30's own statics `O`, `P`, `Q`…), `vj0.i2` (fresh player). See
  `statics.js`. Static *methods* are assigned onto the same objects: `zw.c_ = (id) => …`, `fg2.W_ = …`.
- **Overloads:** one JS method dispatching on `arguments.length`, or on `instanceof`/`typeof` when arities collide.
  Comment each overload's Java descriptor.
- **Java semantics** (`jrt.js`): int `+ - << >> >>>` → `| 0`; int `*` → `imul`; `/ %` → `idiv`/`irem`;
  `(byte)`/`(short)`/`(char)` → `b8`/`s16`/`c16`.
  - Remember **implicit narrowing** in compound assignment to byte/short fields and elements (`ww.b |= 32` →
    `w.b = b8(w.b | 32)`).
  - Float math → `f32()` after every op; `(int)` of float/double → `f2i`.
  - `long` math → `BigInt` (rare; flag it).
- **Primitive arrays:** `byte[]` → `Int8Array`, `short[]` → `Int16Array`, `int[]` → `Int32Array`,
  `boolean[]` → `Array(n).fill(false)`, `float[]` → `Float32Array`. Typed arrays wrap on store exactly like Java.
- **Collections:**
  - `ArrayList` → JS array. Use `get(list, i)` where Java would throw on a bad index. `remove(int)` is `removeAt`;
    `remove(Object)` is `removeObj`.
  - `TreeSet<Integer>` → `TreeSet` (jrt.js). `Collections.sort` / `Arrays.sort(cmp)` → `sortList` (stable, like Java).
  - Iteration order matters; check `HashMap`/`HashSet` uses with the lead before porting.
- **Exceptions:** keep every `throw` (`n30.c_(...)` → GenStuck; `wg2.h_(...)` → RuntimeException). Labels are seeds the
  game accepted, so a throw in JS means a porting bug.
- **No cleverness:** port statement by statement, keeping branch order and evaluation order. Short-circuit `&&`/`||`
  around RNG calls matters. Keep `for`/`while` shapes; labeled breaks become JS labeled breaks.

## Testing with the oracle

```sh
O=../nonograms-katana/tools/oracle
# Entry/exit snapshots of every call of a method, for 2 seeds of each listed type:
$O/run.sh snapbatch 'Z(' test/oracle/Z 0,1,2,3,4,8,11,14,15,19,22,23,26 2 1 3
node test/snaptest.mjs test/oracle/Z              # revive entry, run JS method, deep-compare exit
node test/snaptest.mjs -v test/oracle/Z/8-*       # details
# Model methods: instrument other classes too
NK_TRACE_CLASSES=x30,hw $O/run.sh snapbatch 'M(IIIZ)' test/oracle/hwM 0,8 2 1 5
# RNG trace of the top-level phases (depth 1) for a single dungeon:
$O/run.sh trace 8 172582050 1
```

- The method prefix matches `name(descriptor`. Use the descriptor to pick an overload, e.g. `'G(Lu30;)'`.
- `test/oracle/` is git-ignored. **Use distinct folder names per method, e.g. `test/oracle/m-K`:** `/mnt/c` is case-insensitive, so `k/` and `K/` are the same folder, and runs with the same seed sequence overwrite each other.
- Type numbers: 0–14 classic (1A..5C), 15–18 forest (F1..F4), 19–22 cave (6A..6D,
  22 = arena), 23–26 egypt (EA..ED), 100 = citadel (not needed).

## Who ports what

Each x30 method lives in exactly one file, registered with `install()`. You may call any method in the table
whatever file defines it: they all end up on `x30.prototype`. Line counts are from the Vineflower decompile.

| File | Methods |
|---|---|
| `x30/gen.js` | `g`, `f`; town stubs `F`, `E`, `d0` (citadel is out of scope) |
| `x30/rooms.js` | `Z` (room placement, rivers, arena), `Y`, `X`, `q0`, `A` (room shapes), `b0` (water features), `y0`, `z0`, `h` (liquid code), `i0`, `l`, `k0`, `r`, `c`, `b` |
| `x30/corridors.js` | `j` (Delaunay), `c0` (spanning tree + loops), `m0`, `d` (A* corridors), `j0` (forest/cave widening) |
| `x30/entry.js` | `H` (entrance + hero), `r0` (river exit), `w0`, `G`, `x` (doors), `v0`, `u0`, `V` (nonogram room), `W` (barrel room), statics `t`, `u`, plus `w`, `v` |
| `x30/locks.js` | `M` (key + locked door), `I`, `J`, `K` (ladders/hatches), `a0` (portals), `l0`, `e0`, `s`, `q`, `p`, `o`, `n`, `m`, `z` |
| `x30/place.js` | `R` (object placement), `i`, `k`, `S` (chests), `C`, `D` |
| `x30/decor.js` | `p0` (room themes), `o0` (floor themes), `y`, `h0`, `g0`, `f0` (wall decor), `T`, `U` (decorations) |
| `x30/monsters.js` | `O` (monsters/bosses), `P` (NPCs), `N`, `Q`, `s0`, `t0`, `x0`, `n0`, `L`, `e`, `a`, `B` |
| `model.js` | non-x30 classes and static helpers (`hw`, `qw`, `aw`, `mw`, `ww`, `u30`, `fg2`, `s8`, `m53`, `d2`, …) |
| `progress.js` | player state queried by the generator: `vj0` (`E1`, `Y0`, …), `kj0`, `jj0`, `ni0`, `pj0`, … |
| `../save/*.js` | save import (`vj0.a2` port): reader methods merged into `cq`, `nw`, `ni0`, `kj0`, `pj0`, `vj0` when absent; `hw.E` (clone template) and `hw.m` (fog reveal) in `../save/dungeon.js`, guarded with `if (!hw.prototype.m_)` so a combat port can own them; class `ew` |

**Imports in a phase file:**
```js
import { install, x30 } from './index.js';
import { b8, s16, imul, idiv, irem, f32, f2i, TreeSet, sortList, get, removeAt, removeObj } from '../jrt.js';
import { xs, zw, vj0 } from '../statics.js';
import { classes } from '../registry.js';                        // classes.ww, classes.u30, classes.Util$Point, …
import { fg2, al2, lz0, n30, wg2, k93, s8, m53 } from '../model.js';  // static helper namespaces
```

**Testing a phase:** `snapbatch` captures entry/exit snapshots of real calls (`'Z('`, `'G(Lu30;)'`, …).
Compare with `node test/snaptest.mjs`. A phase that calls methods owned by other files will only pass once
those are ported too, so test leaf helpers first. The whole pipeline is checked with `node test/run.mjs DIR`
against `$O/run.sh batch DIR all 10 1` dumps.
