# Backend: Python 3.13, uv, one package `digital_lluc` in src/digital_lluc/.
Two composition roots share one domain: api.py (FastAPI, deployed on Vercel) and bot.py (Pipecat, deployed on Pipecat Cloud).
- domain.py: pure, sync types and rules (session, daily cap, persona). No I/O, no framework imports.
- application.py: orchestrates use cases; takes `now` and ids as arguments, never reads the clock or randomness itself.
- Adapters (one module per external service) are the only code that does I/O; they parse responses into domain types and raise domain exceptions.
- api.py and bot.py wire adapters together. One pydantic-settings object per root; no `os.environ` anywhere else.
- `mypy --strict` and ruff clean; config in the root pyproject.toml.
