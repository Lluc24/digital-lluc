.PHONY: setup check fix dev-api dev-bot dev-web

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
