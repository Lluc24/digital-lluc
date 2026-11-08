.PHONY: setup check fix dev-api

setup:
	uv sync --all-packages
	git config core.hooksPath .githooks

check:
	uv run ruff format --check
	uv run ruff check
	uv run mypy backend/src
	uv run pytest backend/tests -q

fix:
	uv run ruff format
	uv run ruff check --fix

dev-api:
	uv run --env-file backend/.env uvicorn digital_lluc.api:app --reload --port 8000
