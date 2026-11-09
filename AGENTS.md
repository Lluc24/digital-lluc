# my-site monorepo: lluc.sh, where visitors talk to digital-lluc by voice or text.
Read the AGENTS.md of every directory you touch. Rules: docs/CODING_RULES.md; they override habits and existing code.
- `backend/` (FastAPI session API + Pipecat bot), `frontend/` (Next.js), `profile/` (persona data). `bot/` and `web/` are the legacy apps, deleted at cutover: do not extend them.
- Validate once at the boundary into typed domain values; fail loud; no `Any`, `cast`, `as`, or ignores outside adapters.
- Start simple: add a layer, module or abstraction only when concrete code needs it. Dependencies point inward only.
- No automated tests, by the owner's decision: do not add tests, test scaffolding, test dependencies, or test CI. `make check` passes before every commit.
- Never push to main: branch and PR per CONTRIBUTING.md. Never commit secrets.

## Commits
When Claude Code runs sandboxed (e.g. Claude Code on the web) and commits fully on its own, add: `Co-Authored-By: Lluc Santamaria Riba <lluc.santa@gmail.com>`
