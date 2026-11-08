.PHONY: setup check fix

setup:
	uv sync --all-packages
	git config core.hooksPath .githooks

check:
	uv run ruff format --check
	uv run ruff check
	uv run mypy backend/src

fix:
	uv run ruff format
	uv run ruff check --fix
