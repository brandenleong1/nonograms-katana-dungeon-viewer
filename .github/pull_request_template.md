<!--
Title: [Area] Qualifier: Title Case Summary, e.g. "[Plan] Fix: Walk Through Doors Instead Of Smashing Walls".
See docs/pr_guidelines.md. Merged as one commit: this title, then a link to this PR. PRs are public, so keep save data
and personal paths out.
-->

## Context

<!-- What was wrong or missing, why it matters to a player, and how this fixes it. Add one small before/after example
     when it helps (label, command, output on main vs. this branch). -->

## Changes

- <!-- Past-tense verb first: Added / Changed / Fixed / Removed / Moved ... -->

## Testing

- <!-- e.g. Ran `npm test`: 10/10 and 35/35 pass. Added `...`, which fails on main and passes here. -->

## Screenshots

<!-- UI and map changes: before and after, in Light and one dark theme. Delete otherwise. -->

## Issue

<!-- Fixes #123 -->

---

- [ ] `npm test` passes; `node tools/check-pr.mjs --title "..." --branch <you>/<thing>` is clean
- [ ] No game assets, decompiled code, save data or personal paths
- [ ] `[Gen]` / `[Combat]` changes: they only bring the code closer to the game; oracle suites run, or left for a maintainer
