# Display catalog additions

The shared `data/catalog.json` and `js/ui/occupant.js` provide names, kinds, stats, NPC details,
familiar ranks, mine-cart bonuses, seals and creature drops. Selections and tooltips reuse the same description;
Objectives and Route keep the catalog names. The solver uses the same item labels as selections.

The additions here cover what the initial catalog did not include: placed object contents, hidden-creature warnings,
distinct item labels, and 51 more specific appearance descriptions for furnishings and grouped containers.
Existing specific wiki names, family/tag variants, creature identities and sprite kinds are preserved. The older parallel
creature-name catalog, saved-page importer and Details class are superseded by the shared catalog and occupant code.

## Item and object evidence

The item labels were checked against the 22.11 item definitions and English resources in the earlier PR work.
`catalog.evidence` preserves the inspected version, APK digest and member/field references; it records static
observations, not runtime verification. No game artwork, game code or player saves are included.

- Items 299–302 distinguish Bastet's Alabaster/Basalt and Anubis's Bronze/Obsidian materials (bj0.i).
- Items 305/306 distinguish the Eternal/Ephemeral Secret names (bj0.i).
- Maps 50/51/52/90 and fragments 53/54/55/57 distinguish variants 1–4 (bj0.f).
- Items 113/262, 256/260 and 114/263 distinguish quest/ordinary MALU, Red diamond and Punched card copies.
- Appearance labels were checked against the 22.11 object atlas via zw.Q atlas/frame IDs. They use source
  `ours` and medium confidence: descriptions, rather than official names. Partial creature sprites 89–92 stay
  unidentified. Existing specific wiki names retain their credits and confidence.

## Contents and hidden creatures

Object contents follow qw.b: collected objects and g = -1 have no contents, positive g overrides the default,
and g = 0 uses the definition's w. Opening costs disappear after unsealing (f). None of these reads consumes dice
or changes game tables.

The port's c30.A and c30.P0 give objects 3/26/104/105/106 and sarcophagus 94 a 20% hidden-creature chance;
wooden chest 2 has an 8% chance in forests and caves. The creature inherits the container's contents, contrary to
issue #29's wording. The beehive has a separate 50% Garganbee chance. The torch statue restores 10 energy and
lights the torch. Collected/used objects show their state instead of these effects.

Run `node test/details.mjs` for the added labels, contents, warnings and preserved catalog behavior.
