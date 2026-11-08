# Contributing
- Never push to main. Branch from main as `<type>/<short-description>`, e.g. `feat/session-api`.
- PR title is a Conventional Commit (`feat(backend): start sessions`); it becomes the squash commit on main.
- PR body: a one-line summary, a What section, a Why section; plain English, at most 15 lines.
- `make check` passes locally (pre-commit hook, enabled by `make setup`) and in CI.
- Merge is squash only; the branch is deleted on merge.
- Repo settings live in `.github/rulesets` and `make repo-bootstrap`; change them there, not in the GitHub UI.
