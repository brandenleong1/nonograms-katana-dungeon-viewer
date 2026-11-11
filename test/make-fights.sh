#!/usr/bin/env bash
# Build the combat oracle corpus: several hundred fuzzed / scripted fights in ~/.cache/nk-oracle/fights/
# (every dungeon type; auto / near:boss / start setups; --kit, --level, --gear, short and long --fuzz, --draws and
# --trace; mid-fight --save continued by `fight`; test/scenarios/*.json for each item and skill).
#
#   test/make-fights.sh [--jobs N] [--only REGEX] [--force] [--list] [--out DIR]
#
# Needs the oracle (../nonograms-katana/tools/oracle, built with `flock /tmp/nk-oracle-build.lock ./build.sh`) and
# the generator batch ~/.cache/nk-oracle/fx7 for seeds (`run.sh batch ~/.cache/nk-oracle/fx7 all 40 7`).
set -euo pipefail
cd "$(dirname "$0")/.."
exec node test/make-fights.mjs "$@"
