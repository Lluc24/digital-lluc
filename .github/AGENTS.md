# CI: GitHub Actions.
- Every PR runs the `make check` steps per area, a Conventional Commit check on the title, and, in eval.yml, `make eval` against the real OpenAI, Deepgram and Cartesia keys.
- Actions pinned to a major version; Dependabot updates them and every dependency weekly.
