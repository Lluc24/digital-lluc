.PHONY: setup check fix dev-api dev-bot dev-web repo-bootstrap

setup:
	uv sync --all-packages --all-extras
	cd frontend && pnpm install
	git config core.hooksPath .githooks

check:
	uv run ruff format --check
	uv run ruff check
	uv run mypy backend/src
	uv run pytest backend/tests -q
	cd frontend && pnpm check
	cd frontend && pnpm build

fix:
	uv run ruff format
	uv run ruff check --fix
	cd frontend && pnpm fix

dev-api:
	uv run --env-file backend/.env uvicorn digital_lluc.api:app --reload --port 8000

dev-bot:
	uv run --env-file backend/.env python -m digital_lluc.bot -t webrtc

dev-web:
	cd frontend && pnpm dev

# One-time, by a repo admin with gh authenticated: squash-only merges, auto-delete branches, the main ruleset.
# Re-running updates the ruleset in place.
repo-bootstrap:
	gh api -X PATCH repos/Lluc24/digital-lluc -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
	ruleset_id=$$(gh api repos/Lluc24/digital-lluc/rulesets --jq '.[] | select(.name == "main") | .id'); \
	if [ -n "$$ruleset_id" ]; then \
		gh api -X PUT repos/Lluc24/digital-lluc/rulesets/$$ruleset_id --input .github/rulesets/main.json; \
	else \
		gh api -X POST repos/Lluc24/digital-lluc/rulesets --input .github/rulesets/main.json; \
	fi
