# my-site monorepo: lluc.sh, where visitors talk to digital-lluc by voice or text.
Read the AGENTS.md of every directory you touch. Rules: docs/CODING_RULES.md; they override habits and existing code.
- `backend/` (FastAPI session API + Pipecat bot), `frontend/` (Next.js), `profile/` (persona data). `bot/` and `web/` are the legacy apps, deleted at cutover: do not extend them.
- Validate once at the boundary into typed domain values; fail loud; no `Any`, `cast`, `as`, or `type: ignore` outside adapters.
- Decide an optional setting once, where it is wired (the composition root); the code it enables takes the non-optional value, with no `if x is None` guard or early return re-checking it.
- No inline `# noqa`: put a deliberate exception in `pyproject.toml` per-file-ignores with its reason. No `except Exception` except to re-raise: catch the library's own exceptions.
- Start simple: add a layer, module or abstraction only when concrete code needs it. Dependencies point inward only.
- Tests only for pure domain logic. `make check` passes before every commit.
- Never push to main: branch and PR per CONTRIBUTING.md. Never commit secrets.

## Commits
When Claude Code runs sandboxed (e.g. Claude Code on the web) and commits fully on its own, add: `Co-Authored-By: Lluc Santamaria Riba <lluc.santa@gmail.com>`
