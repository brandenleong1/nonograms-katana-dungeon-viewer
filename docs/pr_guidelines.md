# Pull request guidelines

How to write a pull request's title and description, and the commit message it's merged as. Every change reaches
`main` as one squashed commit, made by the PR bot: the PR title, then a link to the PR. The details stay in the PR,
where the discussion is too (see [Commit messages](#commit-messages)).

## Title

Format: `[Area][Sub-area] Qualifier: Title Case Summary`. The sub-area is optional.

**Area** (required): the top-level part of the repo the change lives in. Add one sub-area if it helps, e.g.
`[Combat][AI]` or `[UI][Progress]`.

| Area | Covers |
|---|---|
| `[Gen]` | the generator port, `js/gen/` |
| `[Combat]` | the combat engine port, `js/combat/` |
| `[Save]` | save import, `js/save/` |
| `[Plan]` | the route planner, `js/plan/` |
| `[Solve]` | the solver, `js/solve/` |
| `[View]` | the map, `js/view/` |
| `[UI]` | page, panels, popups: `js/ui/`, `js/app.js`, `js/hero.js`, `index.html`, `style.css` |
| `[Data]` | `data/*.json` |
| `[Tests]` | test suites |
| `[Tools]` | developer tools |
| `[CI]` | workflows |
| `[Docs]` | documentation |
| `[Game]` | a new game version, across the ports, data and save reader (with `Sync:`) |

**Qualifier** (required): one of

| Qualifier | Use it for |
|---|---|
| `Parity:` | the ports disagreed with the game, e.g. a wrong room, monster, loot, or fight result |
| `Fix:` | any other bug: a crash, a broken control, a wrong route or plan |
| `Feature:` | something new: a tactic, a panel, a map layer, an option |
| `Performance:` | faster solving, rendering or loading, or less memory |
| `Refactor:` | restructuring with no change in behaviour |
| `Sync:` | following a new version of the game: re-ported code, regenerated `data/`, a new save format |

For docs, tests, tools and CI, use `Feature:` when the change adds something and `Fix:` when it corrects something.

**Summary:** Title Case and imperative. Say what the change *does*, not what was wrong. The whole title is at most 80
characters.

The `pr-policy` check (`tools/check-pr.mjs`) enforces all of this, plus the branch name and the description sections
below. Run it locally before opening the PR, e.g. `node tools/check-pr.mjs --title "..." --branch you/thing`.

Examples:

- `[Plan] Fix: Walk Through Doors Instead Of Smashing Walls`
- `[Combat][AI] Parity: End The Waiting Move When AP Matches`
- `[Solve] Feature: Kite Melee Foes With Two Or More Speed To Spare`
- `[View] Performance: Cache Sprites Per Zoom Level`
- `[Docs] Feature: Add Style Guide`
- `[Game] Sync: Match Game Version 22.12`

## Branch

Name your branch `<your GitHub username>/<short-name>`: lowercase, one slash, e.g. `brandenleong1/docs` or
`alice/kite-tactic`. Branches that don't match can't be pushed to this repository, and `pr-policy` fails for PRs from
forks that don't match. A branch is deleted when its PR merges, or after 30 days without activity
([infra.md](infra.md#the-pr-bot)).

## Description

Use the template (`.github/pull_request_template.md`). Leave a blank line between paragraphs and sections. The
description isn't copied into the commit; the commit links to it, so write it for someone arriving from `git log`.

| Section | What goes in it |
|---|---|
| Context | What was wrong or missing, why, and how the change addresses it. See [Writing a good Context](#writing-a-good-context). |
| Changes | Bullets, each starting with a past-tense verb (Added, Changed, Fixed, Removed, Moved). Say what changed and where, e.g. "Fixed the door cost in `planRoute` for stuck doors." Don't start a bullet with a file name. |
| Testing | Bullets, each starting with a past-tense verb. Name the tests you added, and show they fail without the change and pass with it. List what else you ran, with results, e.g. "Ran `npm test`: 10/10 and 35/35 pass." Put solver evaluations and before/after numbers here. For `[Gen]` / `[Combat]` changes, say whether the oracle suites were run or are left for a maintainer. |
| Screenshots | UI and map changes only: before and after, in Light and one dark theme. |
| Issue | `Fixes #123`, if there is one. |

**Keep personal and sensitive detail out.** PRs are public and linked from the git history for good.

- **Never include:** anyone's save file, or values read from one (hero names, inventory, profile dumps).
- **Never include:** personal paths (`/home/<you>/…`, `C:\Users\<you>\…`), tokens or credentials.
- **Never include:** game code or game files.
- **Fine to include:** dungeon labels, since they're only a dungeon type and a seed.
- If a bug only shows up with a particular save, describe it in words (e.g. "a profile with quest 25 active and every
  boss beaten") and reproduce it with `Your progress` or a synthetic profile.

## Writing a good Context

Context is what a reviewer reads first, and what a future reader finds through `git blame`. It should explain the
change without them opening the issue. It has two parts: a short explanation, always, and one real example, when it
helps.

### 1. Summary and explanation (always)

Open with one sentence saying what the change does, and in which situation. Then cover, in one or two short
paragraphs:

- **The problem:** which part does what wrong, on what kind of dungeon, fight or input. Describe the mechanism, not
  just the symptom.
- **Why it matters:** what a player sees (a wrong map, a bad route, a plan that dies, a frozen page).
- **The fix:** how the change solves it, and why this is the right place. If there's an obvious alternative you
  rejected, say why in one sentence.

### 2. One real example (when it helps)

Show the smallest case that demonstrates the change, before and after:

- The label or input, and the one-line command that runs it, e.g. `node tools/solve.mjs 3C-172582050` or
  `node test/run.mjs --types=8 test/fixtures`.
- **Parity bugs:** the first divergence the suite reports (field, step, random-number state), with the line in the
  port that causes it.
- **Bugs:** the error, or the wrong value and where it shows up.
- **The output on `main` and with this change.** Run both; don't write the "before" from memory.
- **Performance:** a small before/after table of the numbers that move.
- **Features:** a short before/after (what the panel or plan shows).
- **No example** for refactors, renames, docs and CI changes.

### Keep it short

- **Prose:** at most about six sentences.
- **Example:** at most about 15 lines. Keep the lines that matter and cut the rest with `…`.
- **Full logs and the investigation story:** in Testing, or on the issue.

### Write for a reviewer who knows the code but not this bug

Name functions and data with inline code, explain any game term the reader might not know, and say which game rule
the change follows.

### Example (illustrative)

Weak:

> Fixes #12. The route was wrong in some rooms.

Better:

> Makes the route planner walk through doors instead of smashing a wall next to them.
>
> `planRoute` treated every non-wall object as passable at a flat cost, and priced smashable walls by energy alone.
> In rooms where the door sat one tile off the straight line, smashing the wall (1 energy) looked cheaper than the
> two-step detour. Players saw the route break a wall right beside an open door.
>
> The planner now uses the game's movement rule (`hw.t`: every object blocks except reeds; tiles 8–10 only once
> cleared) and weighs energy against steps. Doors win unless the detour is long.
>
> `3C-172582050`, first room. Before: "Smash (1 energy) at 54,41". After: the route goes through the door at 55,41.

### Game version syncs

A `Sync:` PR moves everything to a new game version in one go. The ports, `data/` and the parity suites only make
sense together, so don't split it.

- **Context:** the old and new version (e.g. 22.11 → 22.12), and what changed in the game's rules, tables or save
  format, in plain words. If a change affects players (new dungeons, different spawns, a changed formula), say so.
- **Changes:** per area: which ported methods changed, which tables, and the save format version, if it moved.
- **Testing:** every oracle suite rebuilt against the new version, with results ([testing.md](testing.md)). Also
  `npm test`, after regenerating `test/fixtures/`.
- **Version:** update the README's [Game version](../README.md#game-version) table and `data/game-version.json` in the
  same PR; `npm test` checks they agree.

## Commit messages

What lands on `main` is one commit per PR, in the same format as the PR title, then a blank line, then the PR's URL:

```
[Docs] Feature: Add Contributing Docs

https://github.com/brandenleong1/nonograms-katana-dungeon-viewer/pull/12
```

- **Subject:** the PR title, exactly, without the ` (#12)` GitHub appends (the link replaces it).
- **Body:** only the PR's URL. Context, changes and testing live in the PR.

**The PR bot writes it.** People don't merge: once a PR is approved, green and up to date, the bot squash-merges it
with exactly this message ([CONTRIBUTING.md](../CONTRIBUTING.md#how-a-pr-gets-merged)). The postcommit
`commit-format` check flags any commit on `main` that doesn't follow it. That can only happen through an admin's
manual merge, and `tools/merge-pr.sh` writes the message for those.

**Commits on your branch** are squashed away, so write them however helps you. Using the same title format makes the
PR easier to review.

**Exception:** the daily submodule bot's PRs keep the title `Auto-Bump [Utils] Submodule (-> <sha>)`, the same as on
the maintainer's other sites.

## Before opening the PR

- [ ] The title and every section follow this guide.
- [ ] `npm test` passes; parity changes say whether the oracle suites were run.
- [ ] No save data, personal paths or game files in the diff or the description.
- [ ] Screenshots for UI changes.
