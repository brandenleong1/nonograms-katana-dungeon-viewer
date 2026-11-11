# Dungeon solver (`js/solve/`, milestone M6)

The solver plays a whole dungeon in the ported combat engine (`js/combat`). It minimises **items used first, then mental power (MP)**, and the hero must survive.

There are two modes:
- **Robust** works from the label alone. The combat RNG `hw.x` is seeded from the clock at entry, so the solver runs Monte Carlo over it.
- **Exact** works from a known RNG state: a seeded fightgen, or an in-dungeon save, which stores `hw.x.a`. It produces a replayable input script.

Both modes write the same pure-data plan for the UI.

| File | What |
|---|---|
| `sim.js` | Read-only state accessors. The resource `Ledger`. The route `Walker`: planner stops, taps along the route, bumps, nonogram, barrels, ladders. The between-fight `RestRule`. `Run`: one play-through, with `toEncounter()`, `fightWith(policy)`, and `checkpoint()` / `Run.resume(ck)`. |
| `policies.js` | The tactic library (`makePolicy(name, params)`), the candidate sets (`candidates`, `EXTRA`, `usable`) and the baseline. |
| `kite.js` | The duel model: one hero vs one melee monster with the engine's exact AP rules (`duelModel`, `verdict`), and its grid executor (`duelInput`) for the `kite` tactic. |
| `cost.js` | The lexicographic objective, the shadow prices for leftover HP/EP/MP, aggregation, comparison and pruning. |
| `robust.js` | `Shard` (owns samples), `InlinePool`, and `solveRobust(problem, opts)`. |
| `exact.js` | `ExactWorker`, `InlineExactPool`, `solveExact(problem, opts)`, `replayScript(problem, inputs)` and `candidateInputs`. |
| `worker.js`, `pool.js` | A module worker that hosts one Shard / ExactWorker, and `WorkerPool.create({ size, tables })`. Works in the browser and in Node (`worker_threads`). |
| `plan.js` | `buildPlan(result, { label, names })`, `validatePlan(plan)` and `describeTactic`. |

Tools:
- `tools/solve.mjs`: the CLI (robust / exact, report, `--out` plan, `--oracle` check).
- `tools/solve-eval.mjs`: solver vs baseline over dungeons and hero strengths.

Tests: `test/solve.mjs`.

## Running it
```sh
node tools/solve.mjs 3C-172582050                                  # robust, hero level:21,gear:4,kit2, N 128, quality first, cores-1 workers
node tools/solve.mjs F1-1492658333 --hero=level:14,gear:2,kit,mp:160 --N=64 --budget=20 --out=/tmp/plan.json
node tools/solve.mjs 3C-172582050 --mode=exact --xseed=12345 --hero=level:21,gear:4,kit2 --oracle   # script + JVM check
node tools/solve.mjs 3A-284485220 --useItemsForMp                  # the old MP stock model (items may buy MP, no top-ups)
node tools/solve.mjs 3A-284485220 --budget=20 --strict --escalate  # cut quality to meet 20 s (defaults: quality first, N 128, no cut)
node tools/solve-eval.mjs --set=small --N=16                       # solver vs baseline
node test/solve.mjs [--quick]
```

**Hero spec:**
- These fields mirror the oracle flags (`setup.js` heroEdits): `level`, `gear` (1-4), `kit`, `kit2`, `skills`, `quests`, `pets`, `run`, `trapsindif`.
- `mp` (starting MP) and `items` (`[[id, n]]` added to the pack) are solver-only edits. A robust solve can use them; an exact script that uses them cannot be checked in the oracle. With replenishable MP (the default) `mp` only sets the entry pool; the rest is topped up.
- Exact mode from an in-dungeon save: `{ saveBytes, saveName? }` (the guild.dat / export zip bytes). Each worker imports them after `resetStatics`.
- `{ profile: { bytes, hero, premium, path, name } }` is the player's own hero, through `js/combat/entry.js` `newFightFromProfile`: the real hero, the entry pack and MP as the game hands them out, and a layout generated with the player's progress.
  - `bytes` is the export zip or `guild.dat`. Each worker imports it with `resolveProfile`, because an imported profile is an object graph that does not survive `postMessage`.
  - `path` lets `--oracle` replay the script with `fightgen --profile <path> --hero N [--premium]`.
  - The other hero fields apply on top as edits.
  - CLI: `--profile=FILE [--heroIndex=N] [--premium]`. The file is only read, never copied.

**Defaults are for quality** (speed does not matter): robust N 128 / nMin 32 in the CLI, every candidate everywhere, survival lookahead 3 encounters; exact 100 searched inputs per encounter, 5 rollout policies, 1 look-ahead encounter. `budgetMs` is the expected time only; `strictBudget` (CLI `--strict`) restores the old cuts. The page's presets are in `js/ui/budgets.js`: Normal / Thorough / Exhaustive (robust N 64 / 128 / 256; exact maxDecisions 40 / 100 / 250; `budgetMs` there is the expected time, about 1 / 3 / 10 minutes robust and 2 / 5 / 15 minutes exact). `fast` remains an alias of `normal` for saved settings.

### Browser
```js
import { WorkerPool } from './js/solve/pool.js';
import { solveRobust } from './js/solve/robust.js';
import { buildPlan } from './js/solve/plan.js';
const pool = await WorkerPool.create({ size: navigator.hardwareConcurrency - 1, tables: { url: new URL('data/tables.json', location).href } });
const plan = buildPlan(await solveRobust({ hero, type, seed }, { pool, N: 64, budgetMs: 20000, onProgress }), { label, names });
```

The coordinator itself needs no engine. Each worker loads `js/combat/all.js` and the tables (it takes messages before that and holds them until the engine is ready, so `WorkerPool.create` resolves in a browser too). The main thread needs the engine only for exact mode, which keeps its own copy of the trajectory, or for an inline pool.

## Simulation (`sim.js`)

**Route.** The planner (`js/plan/planner.js` `planRoute`) is given:
- the live level (`levelOf(hw)`)
- `bw`, so that objective critters are stops too
- the floor nonogram patterns
- `endAtExit`
- **recovery stops**: unused fountains 48 (+10 EP), 58 (+7 MP) and 95 (lantern + 10 EP), included only while their pool is short by more than half their value

The walker is a deterministic port of `tools/explore.mjs`'s route following:
- It taps the furthest pathable route cell ahead; the engine's own tap path is `hw.t`, 45 steps over revealed cells.
- It bumps what blocks the route.
- It bumps each stop. A sealed object needs a second bump: the first only reveals it.
- It re-plans the nonogram dips, solves barrel puzzles, takes ladders and portals, and steps onto the stairs.

Failure handling:
- A stop that will not open is given up: it gets type -1, so it still blocks its cell but is no longer a stop. Then the walker re-plans.
- A door that needs a key gets its leg re-planned, not walled up: there is one key per locked door, and the planner assumes one key opens all.
- Re-plans after the first plan run Held-Karp only up to 10 stops (the new `planRoute` option `exactLimit`). The first plan is exact up to 16.

Walker state holds object and critter references through a ref table. `freeze()` maps each ref to its position in `hw.n` / `hw.o`; the clone.js snapshot keeps both lists in order. So a checkpoint is a clone.js state, the frozen walker, the ledger and the input log. Route arrays are shared between checkpoints (copy on write).

**Encounters.**
- An encounter starts when a walking input leaves `hw.C` set. The state is then at the hero's first input in combat; monsters with higher initiative may already have moved.
- It ends when `C` clears.
- The engaged foes are the hostile critters in `hw.D`.
- The encounter key is `<stop kind>:<target id>@x,y#<ordinal on that leg>`. It is stable across RNG samples as long as the route is.
- `fightWith(policy)` runs the loop:
  - It cancels a stale selection before a plain input.
  - It counts rejected or no-change inputs, using a lean `progressKey`.
  - In a stand-off (the policy has nothing that changes the state), it lets the walker move on.
  - It caps inputs.
  - It returns `won | dead | stuck | over`.

**Ledger.**
- Items are consumables only: `bj0` with a restore X/Y/Z, a buff a0 or a throw b0, usable in or out of combat. Keys 167/222 and loot are not items, and neither is 192.
- Consumables are counted per input from pack decreases.
- The spider 168 is counted by its net decrease. An unhurt spider goes back into the pack when combat ends, so it costs nothing.
- Ambrosia 123 is consumed when it revives you, so it counts as an item.
- MP is net: the pool before minus after, so fountains count back. HP and EP are net losses.
- `mpPeak` is the largest net MP spent so far (the drawdown below the entry pool), `mpBy` the gross MP by cause (`route` for walking bumps: doors, chests, traps; `unseal`; skill ids), and `topUps` the MP top-ups (see "MP" below).

**Between fights** (`RestRule`, never inside a combat, even a stand-off):
- Doctor (20006: 6 MP for 8-12 HP, only below half HP, only out of combat) whenever HP is below half, and Charge (20005: 6 MP for +10 EP) below a quarter of max EP (at least 6). MP is replenishable (below), so no MP is held back.
- With `useItemsForMp` (the old stock model): both only while MP stays above the route's reserve (the doors, traps, chests and objective seals still ahead, `Walker.routeNeeds()`), Charge below 6 EP, and an MP item when the pool cannot pay the route.
- Potions are never drunk between fights by default.

## MP (endless, but minimised)

The player can pause the dungeon at any moment, mid-fight included, solve puzzles, refill MP to full (max MP, `nw.n`) and go on, as often as they like. So MP never *limits* a decision -- but it is still the third objective (survive, then fewest items, then least MP), so it is spent only where it buys something.
- **No item ever buys MP** (MP potion 217, MP food, the ankh 285 ...).
- **MP never limits a decision.** With top-ups on, `sim.js mpOk` / `canSkill` ignore the pool (`setMpFree`, set by the live Run), so policies, the duel planner, exact mode's primitives and `usable` treat every skill, unseal and seal as payable.
- **Top-ups** (`Run.topUpFor`, before every input in `Run.apply`, in or out of combat): a pool that cannot pay what the input needs (a skill's MP, an unseal, a tapped sealed object or critter) or is below a threshold (30; out of combat plus the current leg's doors / chests / seal, `Walker.legNeeds`) is filled to max. Recorded in `Ledger.topUps` (`at` = the input it comes before, `fight` = inside an encounter).
- **What the player solves for**: every top-up fills to max, then `trimTopUps` shrinks each one by the lowest pool level after it (less what earlier ones already shrank), the least MP that keeps the pool at or above 0 with the same play. Robust mode aggregates these per route stop (`plan.mpTopUps`, `plan.mpToSolve` = p95 total); exact mode lists each one with its input (`atInput`), mid-fight ones included.
- **MP only where it buys something.**
  - The cost model prices an MP deficit below the route reserve at 0.01 MP per point (`pricesFor`): enough to break ties against needless spending, never enough to trade an item or a death.
  - Between fights (`RestRule.need`, set from the scout's need levels: the largest expected HP / EP cost of the fights still ahead, x1.25), Doctor repairs HP only up to that need (and never above half HP, its engine limit), Charge EP only up to the need plus the current leg's EP. A fight the hero wins without them costs no MP on them; with nothing ahead (the walk to the exit) nothing is repaired. The scout's own baseline uses the old rule (Doctor below half, Charge below a quarter).
  - In combat, Charge only when EP is below the strike cost (`charge: 1`); Demoralize / Divine protection / unseal timing are tactic parameters, so the objective keeps them only where they lower deaths or items -- equal on both, the lower-MP tactic wins.
- **`useItemsForMp: true`** (option of `solveRobust` / `solveExact`, CLI `--useItemsForMp`) restores the old stock model: no top-ups, MP limits decisions, items may buy MP when that wins (MP priced at 1/Z items per point), Doctor / Charge keep the route's MP reserve, and the plan reports the MP drawdown, the shortfall and the marginal value of more MP (re-plays of the plan with +20 / +50 MP on the scout samples).
- Exact mode: top-ups are no engine input. The script carries them (`script.topUps: [{ at, amount }]`, add `amount` MP before input `at`, also inside a fight); `replayScript(problem, inputs, topUps)` applies them; workers reproduce them (the same rule) and also get them with `sync`; the JVM oracle replays the script up to the first top-up (it has no input for one).

## Tactics (`policies.js`)

Every policy answers `next(fight)` with one engine input at a hero turn. It is robust to rejected inputs: anything rejected, or anything that changed nothing, is banned for the rest of the hero's turn. The fallback chain is: the tactic, then wait, then a step toward the foe, a step away, any free step, and finally null, which hands control to the walker.

Shared parameters (`DEFAULTS`):

| Param | Meaning |
|---|---|
| `smash` | `never`, `finish` (when Smashing blow surely kills and a plain hit may not) or `always` |
| `kick` | Round kick with 2+ adjacent foes |
| `heal` | Drink the smallest covering HP item when HP <= heal x the damage the foes can still deal before our next turn (pessimistic: max roll, fast foes twice) |
| `minAp` | Attack only with this much AP (3 = never borrow from the next turn; AP can go negative) |
| `unseal` | `adjacent` (pay a seal only when about to fight it) or `early` |
| `charge` | Charge for EP before items |
| `target` | `weakest`, `nearest` or `ranged` |
| `demor` | Demoralize (20004: 3 AP, 4 MP; foes in its 4-box lose 60% defence for 7 of their turns, 80% each, bosses 40%, at least one) when it saves this many hits |
| `divine` | Divine protection (20007: 1 AP, 10 MP; immune until our next turn) first thing in the turn when HP <= divine x the threat, before any potion |
| `bomb` | Area item at the cell whose area holds `bombMin` (2) foes, preferring kills: 144 grenade, 118 madness (half damage, stuns 3), 294 mummy powder (blinds 4, heals) on 3x3, 206 flamethrower on 5x5; never with the hero inside a 144 / 118 area, never onto the spider |
| `net` | Net (174: the foe cannot move for 4 of its turns, it still strikes when adjacent) on an engaged melee foe 2+ away that would reach us this turn, while another one is fought |
| `hook` | Grappling hook 209 / whip 303 (pulls the target next to us) on an engaged thrower 2+ away |

Demoralize and Divine protection share the hero's once-per-level flag (aw 32768, `c30.T` / `t`): Divine needs it unused, and a Demoralize sets it (Demoralize itself is not gated and can be cast again). Throws use the throwing range (Chebyshev `h.e.h[3] + 3`, visible, line of sight) and 4 AP + 1 EP.

| Tactic | Behaviour |
|---|---|
| `melee` | Walk to the weakest engaged foe and hit it. |
| `firstStrike` | Never walk into reach. Wait until a foe is adjacent, then hit with full AP. After `waitTurns` idle turns, step in to bait it (the monster's waiting move can stall it at AP + 1). |
| `kite` | Against one engaged melee foe (no leap 2 / charge 4 / summons, nobody else in the turn order), every input comes from the duel model (`kite.js`, below): strike, step back exactly far enough that the foe arrives with no AP, one step more after its waiting move; it plans a payable seal's unseal (4 AP) the same way. Otherwise first strike. |
| `hold` | Move to the nearby cell with the fewest open sides (a doorway or corridor), then fight first-strike style. |
| `rath` | With 2+ foes engaged, run back along the trail until combat ends; the walker then re-enters. The cost of the foes left behind is charged through the extension (see robust mode). |
| `spider` | Throw the Mechanical spider next to the target with full AP, then melee. |
| `ranged` | Against throwers (`aw.w` ammo, range 4 with LOS), stay beyond spd + 4 unless we can close and strike in one turn. |

The candidate sets are `candidates('full')` (27 variants) and `candidates('quick')` (5). The baseline is `melee` with smash never and no kick.
- `full` = 7 **core** variants (melee, melee smash=always, firstStrike, kite, hold, spider, ranged), 7 **late** variants (melee minAp=3, firstStrike smash=always / minAp=3, rath, three heal levels) and the 13 **EXTRA** skill / item tactics (Demoralize with melee / first strike / spider, Divine protection with melee / first strike, grenade, flamethrower, madness, mummy powder, net, hook, whip).
- Each EXTRA tactic has `needs` ({ skill, mp, once, item, foes, ranged }); `usable(cand, avails)` keeps it only where some sample at the encounter has them (`availOf`: pack, learned skills, MP, the once flag, engaged foes, a thrower). Late and EXTRA tactics join a decision only when the core set leaves a death or an item to save (robust "escalation").
- Items cost items, so the objective keeps an item tactic only where it prevents a death or saves more items than it spends; skills cost MP, which ranks below items.

**Round kick** (20003) is already in every tactic: `kick` uses it with 2+ adjacent foes, which covers foes that come round behind the hero; exact mode also tries it as a primitive whenever a foe is adjacent.

### Kiting: the duel model (`kite.js`)

The monster AI (`turn.js` S0 tail, `ai.js` `c30.p`) and the AP rules:
- A new turn's AP is `min(left + spd, spd + 1)` (`c30.o0`; bw flag 8192: spd + 1). Wait (20001) ends the turn and keeps what is left, up to that cap. Melee costs 3 AP for hero and monster and may borrow (AP >= 1 is enough, AP goes negative); a step costs 1 and may not.
- Each step of a monster's turn: AP <= 0 ends it (`c30.k`); next to its target (Manhattan 1) it strikes; else the **waiting move**: spd 2..4, no flag 8192, AP == n = min(spd - 1, 2) and its path is exactly n + 1 long -> 67% it ends its turn (`h(100) >= 33`), keeping n AP; else one step along its path (`hw.t`, computed once per turn).
- So **a monster strikes in its turn iff its path to the hero is shorter than its AP at the start of that turn**, and it arrives next to the hero without striking iff the path is exactly AP + 1 (or it waits one cell short with banked AP). The old conclusion ("stepping back one cell never denies the attack") was right for one cell; the retreat has to match the monster's AP exactly.

The duel model plays this on an open line: state (path length d, hero AP after refill, the monster's AP left), hero turns are any mix of steps and strikes, the monster's waiting move is chance. Value iteration gives the least expected strikes taken while landing k strikes (+0.01 per turn), and a Büchi game gives the states where kiting is certain (no strike ever, strikes landed infinitely often). `duelInput` executes it on the grid: for every cell the hero can end its turn on (after approach, strike(s), unseal, retreat), the monster's real path length to it (a Dijkstra on `hw.t`'s costs with the hero's cell vacated), valued by the model; tie-breaks prefer open space (how much further the hero could still get within its speed) and cells away from other monsters (their in-combat aggro box is 12). Strikes needed are counted at minimum damage.

**Verdict** (model, from a standing start 3 cells apart; `verdict()`):

| hero spd \ monster spd | 2 | 3 | 4 |
|---|---|---|---|
| 4 (base) | no strike taken (almost surely: progress needs the monster not to wait, 33% a turn) | 2 strikes free, then about 1 taken per 2 landed | about 1 per strike after the first 2 |
| 5 (Agility 11) | **certain**: never struck | no strike taken (almost surely) | about 1 per 2 after the first 2 |
| 6 | certain | certain | almost surely none |

Kiting is viable when the hero is at least 2 faster than the monster (certain at 3), with room to retreat (an open room, no other monster within its aggro box), against plain melee foes: not throwers, leapers (bw ability 2), chargers (4) or summoners. Speed 1 more than the monster halves the strikes taken after the first two. Agility (skill 11, unlocked at level 15, +1 spd) turns the common spd-3 monsters into almost sure kites.

**Engine evidence** (40 RNG samples each, `heal: 0`, HP lost per fight; "clear" = other foes within 16 removed for the experiment):

| foe (spd) | room | hero spd 4: kite / melee / firstStrike | hero spd 5: kite / melee / firstStrike |
|---|---|---|---|
| 243 (2), type 10 1145407027 at 59,21 | open | **0.00 (40/40 unhurt)** / 9.85 / 7.38 | **0.00 (40/40)** / 6.85 / 7.47 |
| 243 (2), type 9 1037297226 near 10,49, clear | open | **0.00 (40/40)** / 3.05 / 3.42 | **0.00 (40/40)** / 2.92 / 3.15 |
| 241 (3), type 9 1037297226 near 46,8, clear | 9x7 | 1.10 / 2.70 / 2.73 | **0.13 (36/40)** / 1.25 / 2.50 |
| 221 (3), type 12 1146928824 near 62,51, clear | open | 4.75 / 4.35 / 4.35 | **0.00 (40/40)** / 3.83 / 3.85 |
| 344 (3), type 17 1058135680 near 34,88, clear | open | 1.13 / 2.70 / 2.70 | **0.03 (39/40)** / 1.25 / 2.38 |
| 254 (2, sealed), type 12 1146928824 near 30,61, clear | cramped, cluttered | 22.15 / 20.82 / 20.18 | 14.40 / 17.15 / 16.25 |

The level-16 hero is gear 3 + kit, the others level 21 gear 4 + kit; spd 5 = `skills: '11:1'`. The few hits at spd 5 vs spd 3 come from corners after long waiting-move loops; the cramped room has no retreat. Kite scripts replay identically in the JVM oracle (`fightgen`, `test/combat.mjs`): type 10 1145407027 at 59,21 with spd 5 (xseed 777, 49 steps, HP 35 -> 35) and spd 4 (xseed 4242, 75 steps, HP 35 -> 35), and two spd-3 setups (type 9 near 46,8 xseed 99; type 12 near 62,51 xseed 5).

### Other engine findings
- **First strike** lowers the HP lost against a lone spd-2 melee foe that the hero would otherwise walk up to (7.4 vs 9.9 HP above).
- **Demoralize** against a high-defence group (type 19 1032260387 near 20,52, level 21 gear 4, 4 foes of def 14-19): 6.2 potions with Demoralize vs 11.2 for melee, for 19 MP (5 casts). Divine protection saved about 1-2 potions there for 10 MP.
- **Area items** win only in big groups: the flamethrower (5x5) cleared 3 of 4 foes at once in a test, but in the evaluation fights it rarely saves more than it costs.
- **Spider** remains the most chosen tactic in multi-foe fights, because the spider tanks hits and goes back into the pack when it survives; **kite** is now second-most chosen (39 of 233 decisions in the evaluation).

## Evaluation (`tools/solve-eval.mjs --set=tiers --N=16 --workers=6`)

Setup: 12 dungeons, one per tier and family. The hero is matched to the tier: levels 6/10/15/19 with gear 1-4, `--kit`, full MP and 4 MP potions, or level 21, gear 4, `--kit2` for tier 5. The baseline is plain melee at every encounter, on the same samples, with the same walker, rest rule and MP model. Columns are per dungeon run.

"Before" is the previous solver (2026-11-10, the old MP stock model). "Stock" is this solver with `--useItemsForMp` (the same MP model as before: the tactic changes alone; measured before the quality-first defaults). "Now" is this solver with its defaults: endless MP (mid-fight top-ups, MP minimised), every candidate everywhere, a 3-encounter survival lookahead, no budget cuts; the baseline re-run under the same MP model.

| dungeon | items solver / base: before | stock | now | P(death) solver / base: before | stock | now | MP to solve for (now) |
|---|---|---|---|---|---|---|---|
| 1A-426615974 | 0.06 / 0.25 | 0.00 / 0.25 | 0.00 / 0.00 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| 1C-574540246 | 6.94 / 7.69 | 6.63 / 7.69 | 0.00 / 0.75 | 0.56 / 0.63 | 0.56 / 0.63 | **0 / 0** | 113 |
| 2A-151022963 | 0.06 / 0.56 | 0.00 / 0.56 | 0.00 / 0.56 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| 2C-320999902 | 6.88 / 7.00 | 6.94 / 7.00 | 1.13 / 2.38 | 1.00 / 0.94 | 0.94 / 0.94 | **0 / 0** | 234 |
| 3A-284485220 | 0.13 / 0.81 | 0.00 / 0.81 | 0.00 / 0.81 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| 3C-179451746 | 4.63 / 6.25 | 4.94 / 6.25 | 1.19 / 3.50 | 0.56 / 0.94 | 0.50 / 0.94 | **0 / 0.06** | 140 |
| 4A-258436113 | 0.50 / 1.31 | 0.44 / 1.31 | 0.25 / 1.19 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| 4C-376124340 | 8.13 / 5.94 | 7.31 / 5.94 | 5.19 / 5.75 | 1.00 / 1.00 | 1.00 / 1.00 | **0.06 / 1.00** | 423 |
| 5A-344057351 | 9.81 / 10.75 | 11.38 / 10.75 | 7.00 / 14.31 | 0.06 / 0.31 | 0.25 / 0.31 | **0 / 0.44** | 110 |
| 5C-286055567 | 9.75 / 8.75 | 8.31 / 8.75 | 14.75 / 15.00 | 0.50 / 0.31 | 0.38 / 0.31 | 1.00 / 1.00 | 7 |
| F1-192928257 | 0.00 / 0.50 | 0.06 / 0.50 | 0.00 / 0.38 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| F3-235674798 | 5.75 / 8.88 | 5.94 / 8.88 | 7.56 / 12.44 | 0 / 0 | 0 / 0 | **0 / 0.38** | 91 |

| all 12 | items solver / base | MP spent solver / base | P(death) solver / base | objectives left | s per solve |
|---|---|---|---|---|---|
| before | 4.39 / 4.89 | 179 / 176 | 0.31 / 0.34 | 3.56 / 3.93 | 15.3 |
| stock (`--useItemsForMp`) | 4.33 / 4.89 | 177 / 176 | 0.30 / 0.34 | 3.63 / 3.93 | 13.7 |
| replenishable MP, between-fight top-ups, Doctor / Charge whenever allowed (intermediate) | 3.09 / 4.76 | 295 / 277 | 0.08 / 0.24 | 1.13 / 1.92 | 16.9 |
| **now** (endless MP, MP minimised, quality defaults) | **3.09** / 4.76 | **285** / 277 | **0.09** / 0.24 | 1.16 / 1.92 | 21.1 |

- With endless MP the C dungeons stop killing the tier hero: Doctor / Charge / unseals are always payable, and the solver survives every dungeon except 5C, whose final boss (257, 230 HP) is too strong for the level-21 tier hero: it dies there in every sample under every tactic, which the plan reports as its death risk. With the stock model that boss was rarely reached (no MP left for its 40-MP seal).
- Against the baseline under the same model, the solver saves 1.7 items a run and 0.15 in P(death). It spends a little more MP than the baseline (285 vs 277: Doctor / Charge where a later fight needs the HP / EP, and Demoralize where it saves potions); repairing only up to the scouted need cut 10 MP a run against repairing whenever allowed, at the same items and deaths. MP to solve for 93 vs 84.
- Tactics chosen (now): melee 60 (incl. skill / item variants), first strike 46, spider 56, **kite 29**, hold 12, ranged 14, RATH 7 (before: kite 7).
- The survival lookahead switches rarely: in 5A 1 of 10 checked encounters (melee smash=always died in 1 of 24 three-encounter look-aheads; plain melee in none).

## Cost model (`cost.js`)

The order is:
1. **Survival.** A tactic is feasible when its P(death) on the samples is at most `maxDeath` (1%). A stuck encounter counts as a death. If no tactic is feasible, the lowest P(death) wins.
2. **Items**: the mean of the immediate item cost plus the shadow cost.
3. **MP**: the mean of the immediate MP cost plus the shadow cost.
4. Then more HP left, then fewer inputs.

Items and MP each have a tolerance (0.02 items, 0.1 MP) under which two tactics tie.

**Shadow prices.** Within one encounter, a greedy choice could win by bleeding HP or EP that a later fight then pays for with potions. So the pools left at the end of the encounter are converted to future (items, MP), using the hero's cheapest recovery for each pool:

| Pool short of its need level | Recovery | Price per point |
|---|---|---|
| HP below half | Doctor (out of combat, below half only) | 0.6 MP (no Doctor: 1/X items, X = the best HP item in the pack) |
| HP above half | items only (Doctor needs HP below half) | 1/X items |
| EP | Charge | 0.6 MP (no Charge: 1/Y items) |
| MP below the route reserve (+ the MP the repairs above cost) | nothing: MP is replenishable (top-ups). With `useItemsForMp`: the best MP item (217: 20 MP; also when the pack has none), 1/Z items | 0 |

Deficits are measured against **need levels**, which describe what the rest of the dungeon needs:
- **HP**: 1.25 x the largest expected HP need of any later encounter, from the baseline scout. That need is the HP lost plus what potions healed there, capped at max HP.
- **EP**: the same for EP, plus the route's EP.
- **MP**: the route's remaining doors, traps, chests and objective seals.

At the last encounter every need is 0, because leftovers are worth nothing in the game.

Tactics that leave engaged foes alive (rath, stand-offs) are charged for them. Their play-out is extended: walk on, and fight the next encounter with the continuation policy, until those foes are dead (`ext` = 1 encounter).

## Robust mode (`robust.js`)

`e01` (`js/gen/rng.js`) draws only from the low 15 bits of its state, so `hw.x` has just 32,768 effective states. A sample is a uniform draw at the dungeon start, which is exactly the label's distribution.

1. **Samples.** There are N samples (`mix32(seed, i)`), dealt round-robin to the shards. Each shard plans the route once.
2. **Scout / baseline.** The first `scout` samples play the whole dungeon with the baseline at every encounter. This gives the baseline's totals, the encounter order, and the HP and EP each encounter needs (for the need levels).
3. **Loop.**
   - Every sample walks to its next encounter.
   - The earliest key on the route (by scouted order; ties go to the biggest group) is decided.
   - Its samples, topped up with RNG variants of themselves (same state, another `x.a`) to `nMin`, are played by each candidate. All candidates see the same states, using common random numbers.
   - Only the candidates the hero can use there take part (`usable`: skill learned, MP, items in the pack, foes).
   - Evaluation runs in rounds:
     - a screening round of one sample per worker (at least 4), which drops tactics that played out identically. With `escalate: true` (off by default: quality first) it starts with the **core** candidates and adds the late and EXTRA ones only if the best core one still dies in a sample or uses an item.
     - then `n0` samples, doubling up to N
     - between rounds, it prunes tactics that are infeasible beyond doubt or worse by 3 SE plus a margin
     - it stops when the survivors tie within tolerance (with `zone: { items, mp }` also within that indifference zone from the third round; off by default)
   - **Survival lookahead.** Where the scout's baseline dies in a *later* encounter after this key (`riskAfter > 0`), the top `lookTop` (4) feasible tactics and plain melee are re-played on this key's real samples (topped up to 16 with RNG variants, at most `lookN` = 24) with the next `look` (3) encounters fought by the continuation policy. If the encounter's winner then dies more often than maxDeath and another of them dies less, that one is taken (`lookahead.switched`). So an encounter cannot save items by leaving the hero too weak for what follows; ties on survival keep the encounter's own ranking.
   - The winner is committed: every real sample plays it, and the reported numbers come from that. The samples then carry on from their own outcomes.
4. **Budget.** Quality first: `budgetMs` is only the expected time (progress). Only with `strictBudget` does it fall back, when behind, to the quick candidates, fewer samples and no lookahead.
5. **MP.** The per-sample top-ups are trimmed (`trimTopUps`) and aggregated per route stop (`mpPlanOf`). With `useItemsForMp`, the decided plan is re-played on the scout samples with +20 / +50 MP (`playthrough` with `plan` and `mpAdd`) for the marginal value of MP.

The output is a tactic per encounter (with every candidate's stats), plus whole-dungeon distributions: items and MP (mean, p50, p95, max), P(death), objectives left, the baseline, the pack (p95 of each item's use) and the MP plan (`mpPlan`).

## Exact mode (`exact.js`)

This mode follows one trajectory. At each encounter:
1. Every tactic is played out from the encounter start. The best is the incumbent, and the top 3 become rollout policies.
2. **Receding-horizon rollout search.**
   - At each hero input, the candidate inputs are: what each rollout policy would do; wait; the 4 steps; hit, Smashing blow or unseal each adjacent foe; approach foes within 6; Round kick; the best HP item; Charge; and spider placements next to foes.
   - Each candidate input is applied and then played to the end of the encounter by each rollout policy, in the same `fightWith` loop the trajectory uses.
   - The best (input, policy) pair is committed.
   - The incumbent's own next input is always a candidate, so the search is never worse than the best tactic.
   - After `maxDecisions` decisions, the last winning policy finishes the encounter, exactly as its play-out predicted.
   - Trivial encounters, where every tactic has the same outcome, are not searched.
3. **Workers.** Each worker re-sets up the problem and follows the committed inputs (`sync`, plus the frozen walker at encounter starts). The (input, policy) jobs are spread across them.

Exact mode scouts too: the baseline plays the trajectory from the start once, and the need levels after encounter e are 1.25 x the largest HP (EP) cost of the scouted fights from e on (`opts.hpNeed` overrides HP), plus the route's EP and MP. Defaults are for quality: up to `maxDecisions` = 100 searched inputs per encounter, `rollouts` = 5 policies, every play-out followed by `look` = 1 more encounter with the continuation policy (survival), approach taps on foes within 8, spider placements next to 3 foes; `budgetMs` only cuts the search with `strictBudget`. A thorough exact solve can take minutes. Only the candidates the hero can use at the encounter take part (`usable`), and the primitives also include Demoralize, Divine protection and the policies' own item throws (area items at the best cluster, net, hook). MP top-ups on the trajectory (`res.topUps: [{ at, amount, filled, pool, stopIndex, beforeEncounter }]`, `beforeEncounter` = the first encounter whose inputs start at or after `at`) are passed to the workers with `sync` at the same input positions.

The output is the script (every input from the setup, walking included), a per-encounter slice of it, and the totals. `replayScript` replays it in a fresh JS engine; `tools/solve.mjs --oracle` replays it in the JVM oracle:
```
../nonograms-katana/tools/oracle/run.sh fightgen <type> <seed> <xseed> start <inputs.json> <out.json> <hero flags> --draws
node test/combat.mjs <out.json>
```
The oracle check compares every step record, and also the final HP, MP and death. An in-dungeon save (`problem.save` = `importSave` result) uses the oracle's `fight` mode instead: `run.sh fight <guild.dat> <inputs.json>`.

## Plan format (`plan.js`, schema `nk-solve-plan/1`)

Pure JSON (no functions, no cycles); `validatePlan(plan)` checks the structure.
```jsonc
{
  "schema": "nk-solve-plan/1",
  "mode": "robust" | "exact",
  "dungeon": { "type": 8, "seed": 172582050, "label": "3C-172582050", "xseed": null | 12345, "at": "start" },
  "heroSpec": { "level": 21, "gear": 4, "kit2": true },          // what was solved for
  "hero": { "x","y","hp","hpM","ep","epM","mp","mpM","ap","spd","atk","def" },   // at the dungeon start
  "objective": { "order": ["survive","items","mp"], "maxDeath": 0.01, "prices": { "hpLow":[items,mp], "hpHigh":[..], "ep":[..], "mp":[..] } },
  "stops": [                                                      // the planned route, in order
    { "i": 0, "kind": "objective" | "lever" | "gold" | "miniboss" | "nonogram" | "barrels" | "exit" | ...,
      "label": "..." | null, "target": { "id", "x", "y", "critter": bool } | null, "at": { "x","y" },
      "steps": 23, "doing": [ { "text": "Unseal door", "at": {x,y}, "ep": 0, "mp": 3 } ],
      "encounters": [0, 1] }                                      // indexes into encounters met on this leg
  ],
  "encounters": [
    { "i": 0, "key": "objective:21@17,41#0", "stop": 0 | null, "where": { "x","y" },   // hero cell at combat start
      "hero": { "hp","hpM","ep","mp","ap" },
      "enemies": [ { "id","x","y","hp","hpM","ap","spd","atk","def","seal","ranged","boss","objective" } ],
      "enemySets": [ { "ids": [..], "n": 60 } ],                  // robust: engaged sets seen across samples
      "tactic": { "name": "firstStrike", "params": {..}, "label": "firstStrike(smash=always)", "description": "..." , "finish"?: "..." },
      "expected": { "pDeath", "items", "mp", "hpLost", "score": [items, mp], "p95": { "items","mp","hpLost" } },
      "candidates": [ { "label", "n", "pDeath", "items", "mp", "score", "pruned", "same" } ],   // robust; exact: { label, pDeath, items, mp, hpLeft, score }
      "samples": 64, "evaluations": 48, "need": { "hp","ep" },    // robust
      "after": { "hp","ep","mp" }, "searched": 6, "improved": 4,  // exact
      "script": { "from": 120, "to": 133, "inputs": [ {"t":"tap","x":..,"y":..}, ... ] },  // exact: this encounter's inputs
      // added in M6+ (robust): MP pool at the encounter start over its samples; whether the late / skill / item tactics
      // were played; the survival lookahead when it ran (null otherwise)
      "mpBefore": { "mean", "p05", "min" }, "escalated": bool,
      "lookahead": { "risk", "look": 2, "n", "switched": bool, "candidates": [ { "label", "n", "pDeath", "items", "mp" } ] } | null
    }
  ],
  "totals": { "n", "pDeath", "dead", "stuck", "items": { "mean","p50","p95","max" }, "mp": {..}, "objectivesLeft": {..}, "statuses": {..} }
            // exact: { "pDeath": 0|1, "items": {..}, "mp": {..}, "objectivesLeft": n, "finished": bool, "final": hero }
  "baseline": { "tactic", "n", "pDeath", "items", "mp", "objectivesLeft" },   // robust
  "pack": [ { "id": 120, "name": "Potion of healing", "mean": 0.2, "p95": 1, "bring": 1 } ],
  "route": { "needs": { "mp": 95, "ep": 36, "invincible": 0 } },                  // what the planned route itself costs (doors, chests, objective seals)
  "warnings": [ { "kind": "mp" | "gate" | "invincible" | "death" | "objectives", "text": "...", ... } ],
  "entry": { "hero", "gates", "fee", "feePaid", "mp", "fam", "items" } | null,   // profile runs: entry.js fight.entry
  "script": { "inputs": [..], "topUps": [ { "at", "amount" } ], "replay": { "matches": true, "rej": 0, ... }, "oracle": { "ok", "combat", "summary", "prefix": { "inputs", "of", "why" } | null, ... } | null },   // exact
  "perf": { "ms", "workers", "samples", "search" },

  // added (all optional; README "MP"): MP is replenishable -- the puzzles the player solves for, and what the plan spends
  "mpTopUps": [ { "stopIndex": 3 | null, "beforeEncounter": 5 | null, "amount": 40,       // MP to solve for before walking to stops[stopIndex]
                  "p": 0.6, "mean": 31, "max": 52 } ],                                     // robust: share of runs that need it there, mean / max
                                                                                          // exact: { stopIndex, beforeEncounter, atInput, amount, fight }
                                                                                          // (fight: inside that encounter, before input atInput)
  "mpToSolve": 120,                                                                       // robust: p95 of the per-run total; exact: the total
  "mpNeeded": { "total": 400, "toSolve": 120, "start": 280, "route": 135 },               // short form: total = start + toSolve
  "mp": { "start", "max", "route", "spent": dist, "peak": dist /* drawdown below the entry pool */, "need", "short",
          "spentBy": { "route", "unseal", "doctor", "charge", "demoralize", "divine" }, "mpItems", "useItemsForMp": false,
          "toSolve": dist, "encounters": [ { "i", "mean", "low" } ],
          "marginal": [ { "add", "mp", "n", "items", "saved", "pDeath", "dDeath", "objectivesLeft", "mpItems" } ],   // useItemsForMp only
          "advice": "Solve puzzles for about 120 MP during this run ..." | null }
}
```
New warning kinds: `mpTopUp` (MP to solve for, with where), and with `useItemsForMp` `mpShort` / `mpValue`. The `mp` warning keeps its fields; its text now points at the top-ups.

The inputs use the engine vocabulary (`js/combat/ORACLE.md`): `tap x,y`, `step dx,dy`, `wait`, `unseal x,y`, `skill id [x,y]`, `item id [x,y]`, `potion id` and `cancel`. Each one is applied when the engine waits for the hero.

## Performance

Measured on a 14-core WSL machine shared with another agent (load average 5-8), so a worker gets well under a core.
- **Engine.** About 36% of all solver time is `hw.t` A*: 2/3 of it the engine's own aggro scan in `S0`, 1/4 the walker's tap checks, the rest the policies' path lengths. A plain play-out (restore, about 9 encounter inputs, policy work) takes 4-6 ms on a free core; kite play-outs 2-3x that (more inputs, the duel plan per input: a Dijkstra plus BFS, about 0.2 ms); RATH about 33 ms; a survival look-ahead (3 encounters plus walking) about 12 ms.
- **Robust**, N = 64, 8 workers:
  - 3A-284485220 (15 encounters, easy): 16.2 s before the escalation, **11.7 s** with it (decide 10.1 -> 5.4 s, 7216 -> 3008 play-outs).
  - 5A-344057351 (20 encounters, hard): 28.8-29.4 s with a 30 s budget: setup 0.7, scout 2.1, walk 2.2, decide 14.4-15.2 (6000-6700 play-outs), commit 3.4, lookahead 3.4-3.8 s.
  - The tiers evaluation (N = 16, 6 workers, quality defaults): 21.1 s per solve, against 15.3 s before (every candidate everywhere, the 3-encounter lookahead, no budget cuts).
  - The 3A / 5A timings above were measured with the escalation on and a strict 30 s budget; with the quality defaults expect 1.5-2x.
  - What cuts the waste: common random numbers (each candidate sees the same states, already there), screening and duplicate pruning, the escalation (core set first), indifference-zone stopping from the third round (0.06 items / 0.5 MP per encounter), the lookahead only where the scout dies later and only for feasible tactics. The budget (`--budget`) falls back to the quick candidates, fewer samples and no lookahead when behind.
  - For 10-30 s in a browser: N = 64 on 7+ workers, or N = 32 on 4; the budget keeps a hard dungeon near it.
- **Exact** with the quality defaults (100 decisions, 5 rollouts, 1 look-ahead encounter): 79 s for 3C-172582050 (149 decisions, 7660 play-outs) and 106 s for 5A-1270628764 with the player's hero (255 decisions, 13,595 play-outs), 6 workers, while an evaluation ran beside it.
- **Startup.** Each worker loads the engine and parses the tables, then revives them into fast-mode objects (about 1-2 s; longer on `/mnt/c`). The worker installs its message handler before loading (a browser module worker dispatches messages while its imports load) and holds them until the engine is ready.

## Oracle checks (exact mode, `tools/solve.mjs --mode=exact --oracle`)

Every script replayed identically in the JVM oracle (`test/combat.mjs`: all steps matched, same final HP, MP and death):

| dungeon | hero | steps | result |
|---|---|---|---|
| 1C-1242795585 | level 12, gear 2, kit | 510 | died: kit MP 60 is too little for the seals |
| F1-1279692379 | level 21, gear 4, kit2 | 98, then 211 | the rerun after the walker fixes finished with 0 items and 111 MP (4 workers) |
| 2B-1205639374 | level 10, gear 2, kit2 | 257 | finished, 0 items, 114 MP (4 workers) |
| 6A-1195530112 | level 21, gear 4, kit2 | 64 | died in the second encounter |
| EA-1123407664 | level 21, gear 4, kit2 | 569, then 158 | the first run was before the walker fixes; the rerun died at the tomb boss 620, which is invincible for a fresh profile |
| 3C-172582050 | level 21, gear 4, kit2 | 242 | finished, 0 items, 234 MP |
| 3C-172582050 | level 16, gear 3, kit2 | 264 | finished, 3 MP potions |
| 5A-1270628764 | the player's own hero 0, `--profile` (oracle `fightgen --profile`) | 141 | died: the profile's MP stock is 33 |

After the kite, the skill / item tactics and the replenishable-MP model (scripts with MP top-ups are checked in the oracle up to the first top-up, which has no oracle input; the JS replay applies them and must match):

| dungeon | hero | inputs | result |
|---|---|---|---|
| 3C-172582050 | level 16, gear 3, kit2 | 279 (oracle: the first 209, identical) | finished, **0 items** (was 3 MP potions), 268 MP; solve for 38 MP before stop 11 (79 s, 6 workers) |
| 5A-1270628764 | the player's own hero 0 (`--profile`, MP stock 33 of 570) | 441 (JS replay identical; the first top-up is at the start, so the oracle has nothing to check) | **finished**, 2 items (spiders lost), 266 MP; solve for 233 MP before starting (was: died; 106 s, 6 workers) |
| kite duels, 4 setups (see "Kiting") | level 16 gear 3 kit, spd 4 / 5; level 21 gear 4 kit + Agility | 12-75 each | all identical in the oracle |

## Known limits
- **Planner.**
  - Assumes one key opens every locked door 29. The walker works around it by re-planning, but the visiting order can then be suboptimal.
  - Re-plans are heuristic beyond 10 stops.
  - Does not route around aggro.
- **Encounter keys** follow the stop being walked to. Samples that meet different foes on the same leg share a key: the tactic is chosen for that mix, and `enemySets` shows it.
- **Policies are heuristics over engine inputs.** Not modelled: kiting / RATH against ranged foes, re-entry within 7 of only one foe (the walker simply re-enters), traps in combat, the ankh 285 (it trades an item for MP, which the objective never wants), kiting more than one foe, nets / hooks combined with kiting.
- **Kiting** needs room: the duel model assumes the hero can always step away and the grid executor only looks one turn ahead (with an open-space tie-break), so small or cluttered rooms and other monsters nearby still end in strikes taken; the engine evaluation then prefers another tactic.
- **Survival lookahead** sees only the next 2 encounters with plain melee as the continuation, and only where the scout's baseline dies later; a death further away (or one the baseline avoids by luck) is not seen.
- **MP.** Robust `mpTopUps` aggregate per route stop over samples (`p` = share of runs); a stop that re-plans moved has `stopIndex: null`. The rest rule's need levels come from the baseline scout, so a later fight the solver plays differently may need more or less repair than planned. The oracle cannot replay a top-up, so exact scripts are oracle-checked up to the first one. With `useItemsForMp` the entry MP is a stock as before.
- **Exact mode** is exact only for the script as given. Any deviation in play changes later rolls, so re-import a save and re-plan. A save problem needs `problem.saveBytes`: every fight (main trajectory, inline workers, worker threads) imports its own copy, since `setupSave` consumes the import.
- **Robust mode** re-randomises nothing between encounters: samples carry their own RNG streams, so its estimates are honest Monte Carlo. But a decision made on a few samples (a rare key) uses RNG variants of them, which assumes the RNG state at the encounter is uniform.
