# Code style guide

Code is read far more often than it's written. Write for the next reader: clear intent, little to hold in your head,
easy to change.

Formatting (tabs, quotes, line endings) is in `.editorconfig` and [AGENTS.md](../AGENTS.md#code-style). This guide is
about structure.

## Where it applies

**Everything we wrote:** `js/view/`, `js/plan/`, `js/solve/`, `js/ui/`, `js/app.js`, `js/hero.js`, `js/labels.js`,
`test/` and `tools/`.

**Not the ports.** `js/gen/`, `js/combat/`, and the loader in `js/save/guild.js` / `records.js` mirror the game's Java
method for method, so they can be diffed against it and stay bit-exact. There, fidelity beats style:

- Keep the Java names (`hw`, `qw.e`, `S0_`), even short or meaningless ones.
- Keep the method boundaries, argument lists, control flow and statement order. Don't extract, merge or flatten.
- Keep Java's statics as they are (`vj0.i2` and friends). A port that "improves" structure can't be checked against the
  original any more.

The code *around* the ports (`driver.js`, `setup.js`, `clone.js`, `entry.js`, `generate.js`, `progress-spec.js`) is
ours and follows this guide.

## 1. Functions

### One job each

A function does one thing. If it has numbered steps, blank-line sections with headings, or a name with "and" in it
(`solveAndRender`), split it. When a sub-task can be given a clear name, extract it under that name.

Keep orchestration separate from detail. The top-level function reads like a summary of the steps:

```js
// Avoid: route search, MP bookkeeping and DOM writes in one function
function showPlan(level) { /* 80 lines */ }

// Prefer
function showPlan(level) {
	const route = planRoute(level, routeOptions());
	const budget = routeBudget(route);
	renderRoutePanel(route, budget);
}
```

### One level of abstraction

Don't mix the domain story ("plan the route, count the seals") with low-level mechanics (index arithmetic, bit masks,
string building) in the same function. Move the mechanics into a named helper:

```js
// Avoid
if ((cell.b & 63) === 44 && layers.has('puzzles')) { /* ... */ }

// Prefer
if (isPuzzleCell(cell) && layers.has('puzzles')) { /* ... */ }
```

### Few parameters, no boolean flags

- Aim for 0–2 parameters; 3 is fine. Beyond that, pass an options object with named fields, as
  `focusBox(pts, { min, max, pad })` and `entryPack(profile, hero, { type, premium })` do.
- A boolean that switches the whole function between two behaviours should be two functions: `renderPdf()` and
  `renderHtml()`, not `render(data, true)`.
- A boolean that tweaks one detail is fine as a named option (`{ focus: true }`), never as a bare positional `true`.

### Ask or do, not both

A query returns data and changes nothing; a command changes state and returns nothing, or a status. Don't hide a
mutation in something that reads like a getter (`takeTopUps()` that also clears them).

Memoising a query is fine: callers can't tell, as with `effectiveProfile()`.

## 2. Structure between callers and callees

### Parse at the edge, then pass the parsed value

JavaScript has no nominal types, but the idea still holds. Turn raw input into a structured value once, where it
enters, and have everything downstream take that value:

- A label string becomes `{ type, seed }` (`js/labels.js`).
- A dropped file becomes a profile (`importSave`).
- A URL hash becomes a label.

Functions further in should never re-check raw strings or bytes, and should never receive them. Return `null` (or
throw with a message that says what to do) when parsing fails; don't return booleans for the caller to remember. Write
the shape in JSDoc (`/** @param {{ type: number, seed: number }} label */`).

### Top-down files

Order a file like a newspaper article: the exported entry points first, then the helpers they call, then the low-level
utilities. Function declarations are hoisted, so callers can sit above callees.

```
export function solve()      ← what the module is for
  function scoutRoute()      ← steps it calls
    function encounterAt()
      function manhattan()   ← low-level helpers last
```

### Explicit state

Pass what a function needs as arguments. Don't add new module-level mutable state, singletons, or "call `setX()`
before `doY()`" orderings.

When the engine forces it (the ports read Java statics such as `vj0.i2`), confine it to one place and name the
precondition. Examples: `resetStatics(tables)` before `newFight()`; `withProgress(base, spec)` returning a profile
rather than editing the global.

### Files named for what they do

No `utils.js`, `helpers.js` or `common.js` in this repo. (`lib/utils` is the shared upstream library; that's a
different thing.)

- If a function is really about one type, make it a method of that class.
- Otherwise put it in a file named for its purpose. Existing examples: `labels.js`, `links.js`, `words.js`,
  `budgets.js`, `catalog.js`.
- Split a file when it holds two unrelated responsibilities, not just because it's long.

## 3. Comments

Code says *what*; comments say *why*.

- Delete comments that restate the code (`// loop over the critters`).
- If a line needs explaining, first try a better name or an extracted function.
- Keep comments for what the code can't say: a game rule (`// a monster strikes when its path is shorter than its
  AP`), a port reference (`// hw.t: A* over revealed cells`), a constraint, a tradeoff, or a trap
  (`// no top-level await here: phase files import this`).
- Use JSDoc `/** */` on exported functions: what it returns, units, and anything surprising.

## 4. Names

- Names say what a value is and why it exists: `activeEncounters`, `mpToSolve`, `heroCell`. Avoid `data`, `res`,
  `tmp`, `obj`, `item2`.
- Name length grows with scope. `i`, `x`, `y`, `p` are fine in a three-line loop or a tiny callback. Module-level
  names and exports are spelled out.
- No type noise: `encounters`, not `encounterList` / `encountersArr`; `plan`, not `planObj`.
- Casing: `camelCase` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE` for module constants
  (`BAR_LIFT`, `PALETTES`).
- Use the game's vocabulary for game things (seal, ladder, hatch, familiar, mental power). Inside the ports, use the
  Java names.

## 5. Flat control flow

- Handle bad input and edge cases first with guard clauses, then return. The happy path runs unindented to the end.
- Invert conditions to bail out early, rather than wrapping the main path in `if { … } else`.
- Aim for at most two levels of nesting inside a function. Deeper usually means a function wants to come out.

```js
// Avoid
function pinFor(encounter, plan) {
	if (encounter.where) {
		if (plan.mode === 'exact') {
			if (encounter.script) return exactPin(encounter);
		} else return robustPin(encounter, plan);
	}
	return null;
}

// Prefer
function pinFor(encounter, plan) {
	if (!encounter.where) return null;
	if (plan.mode !== 'exact') return robustPin(encounter, plan);
	if (!encounter.script) return null;
	return exactPin(encounter);
}
```

## Hot paths

The engine step, `clone.js` and A* run millions of times per solve. There, a flat loop over typed arrays can beat a
tidy abstraction. That's acceptable when:

- a comment says why, and
- `tools/bench.mjs` shows the gain.

Everywhere else, readability wins.
