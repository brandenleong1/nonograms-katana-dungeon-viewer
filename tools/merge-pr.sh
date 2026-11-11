#!/usr/bin/env bash
# Squash-merge a pull request with the commit message docs/pr_guidelines.md asks for: the PR title, a blank line,
# then the PR's URL. Refuses if the title doesn't pass tools/check-pr.mjs, or if the PR's head moved since you looked.
# GitHub still enforces the ruleset (approval, checks, up to date with main).
#
#   tools/merge-pr.sh 12
set -euo pipefail
cd "$(dirname "$0")/.."
pr=${1:?usage: tools/merge-pr.sh <pr-number>}

title=$(gh pr view "$pr" --json title --jq .title)
url=$(gh pr view "$pr" --json url --jq .url)
head=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)

node tools/check-pr.mjs --title "$title"
gh pr merge "$pr" --squash --delete-branch --match-head-commit "$head" --subject "$title" --body "$url"
