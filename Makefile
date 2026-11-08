.PHONY: setup check fix dev-api dev-bot

setup:
	uv sync --all-packages --all-extras
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

dev-bot:
	uv run --env-file backend/.env python -m digital_lluc.bot -t webrtc
