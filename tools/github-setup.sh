#!/usr/bin/env bash
# Apply this repository's GitHub settings (docs/infra.md#branch-protection), idempotently:
#   - merging: squash only, title = PR title, blank body, delete head branches, offer "Update branch";
#   - Actions may create PRs (the submodule bot; GitHub ties this to "approve", but no workflow here approves);
#   - the rulesets in .github/rulesets/ (main: reviews and checks; branch-names: only <name>/<thing> branches can be
#     created), created or updated in place by name;
#   - the labels the workflows and issue forms use.
# Needs `gh`, logged in as a repository admin.
#
#   tools/github-setup.sh [owner/repo]
set -euo pipefail
cd "$(dirname "$0")/.."
repo=${1:-brandenleong1/nonograms-katana-dungeon-viewer}

gh api -X PATCH "repos/$repo" \
	-F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
	-f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK \
	-F delete_branch_on_merge=true -F allow_update_branch=true >/dev/null
echo "merge settings: squash only, branches deleted on merge"

gh api -X PUT "repos/$repo/actions/permissions/workflow" \
	-f default_workflow_permissions=read -F can_approve_pull_request_reviews=true >/dev/null
echo "actions: read-only token by default, may create pull requests"

for file in .github/rulesets/*.json; do
	name=$(node -p "require('./$file').name")
	id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
	if [ -n "$id" ]; then
		gh api -X PUT "repos/$repo/rulesets/$id" --input "$file" >/dev/null
		echo "ruleset $name: updated ($id)"
	else
		gh api -X POST "repos/$repo/rulesets" --input "$file" >/dev/null
		echo "ruleset $name: created"
	fi
done

gh label create stale --repo "$repo" --color cfd3d7 --description "No activity for 30 days" --force >/dev/null
gh label create keep-open --repo "$repo" --color 0e8a16 --description "Never closed as stale" --force >/dev/null
gh label create mismatch --repo "$repo" --color d93f0b --description "A dungeon differs from the game" --force >/dev/null
echo "labels: stale, keep-open, mismatch"
