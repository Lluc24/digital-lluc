# Coding Rules

Follow these exactly. When they conflict with a habit, the rules win; when they conflict with existing code, refactor the code.

## 1. Validate once at the boundary, then trust; fail loud

- Validate where untrusted data enters: HTTP handlers, CLI args, file parsers, external APIs, database reads, environment variables. Reject bad input with a message naming what was expected and what was received.
- Validation turns raw input into typed domain values. Past the boundary the data is valid **by construction**: no `if x is None`, no `hasattr`, no `isinstance` against your own types, no try/except around internal calls.
- Never branch on a state that cannot occur. If you cannot tell whether a value can be absent, the contract is broken: fix the signature or the construction site, never the call site.
- Let exceptions propagate to the layer that can act on them. Never catch to return `None` or a default, never swallow, never log-and-continue past a broken invariant.
- `assert` is acceptable for invariants that must hold by construction.

## 2. Make invalid states unrepresentable

- Types over checks. Parse strings into domain types at the boundary. Dataclasses, TypedDict, and enums instead of loose dicts.
- Narrow `Optional` away early. A field always present after validation is not `Optional`.
- One canonical representation per concept. Raw JSON and dicts do not travel past the boundary.

## 3. Layers point inward

- `domain` holds types and business rules and knows nothing about `db`, `api`, adapters, or frameworks: no imports from them, and no table names, column names, status codes, or ORM models in its vocabulary.
- `application` orchestrates use cases and imports `domain`. No business rules, no SQL.
- `db`, `api`, and external-service adapters import `domain` and `application`. Only the composition root imports them.
- The database layer is thin: it maps rows to domain types and back. No decisions in SQL, ORM hooks, or triggers. Triggers only for bookkeeping (`updated_at`, cascading deletes), readable in one glance.
- A script that fits in one file is its own boundary; do not scaffold layers for it.

## 4. Pure by default

- Prefer functions over state. A function that takes data and returns data beats a class that mutates itself through methods. A class earns its place only when it protects an invariant or a framework requires it.
- A function computes from its arguments: no hidden state, no mutation of arguments, no I/O.
- Data is immutable: `frozen=True` dataclasses, tuples over lists when the value will not change.
- Side effects (database, network, clock, randomness) live in adapters and are passed in. A function that needs the time takes `now` as an argument.

## 5. One source of truth

- A business rule, calculation, or mapping lives in exactly one function. Call it; never re-implement it.
- Duplication is cheaper than a wrong abstraction. Three similar lines are fine; the same decision in two places is not.

## 6. No escape hatches

- No `# type: ignore`, `cast()`, or `Any` outside adapters. Each hides a broken contract. Fix the type or the code. Inside an adapter, name the library and reason on the same line.
- No inline `# noqa`. A deliberate lint exception is a `per-file-ignores` entry in `pyproject.toml`, scoped to the one file, with a comment naming the library and the reason.
- No `except Exception`. Catch the specific exceptions the library documents (e.g. `httpx.HTTPError`), and validate inputs at the boundary so nothing else can be raised. A catch-all is allowed only to re-raise. Catching to log and continue is allowed only for a side effect whose failure must not stop the caller, such as a notification.
- A badly typed third-party library gets one typed wrapper at the boundary, not an ignore at every call site.

## 7. Functions and names

- One function, one job. The name states what it does; the body does exactly that.
- When types do not say it all, the docstring states **Pre** (what the caller guarantees) and **Post** (what the function guarantees). The body trusts its Pre completely.
- Names are unambiguous: `retry_delay_seconds`, not `rd`. Units and qualifiers go in the name. No abbreviations except universal ones (`id`, `url`, `db`).
- Booleans read as predicates (`is_ready`, `has_items`), never negated.

## 8. Comments

Default count is **zero**. Allowed only for what code cannot carry: a non-obvious **why**, a Pre/Post **contract**, or a **reference** to a spec or issue. Forbidden: narrating what the code does, restating a signature, excusing weak code, commented-out code, changelog comments. A comment that justifies a workaround is a bug report: refactor.

## 9. Leave it better than you found it

- Dead code, stale comments, unused imports, or wrong logic in a file you already edit: fix it in the same change.
- Problems in files you are not touching: report them in the PR description.
- One way to do each thing. Match surrounding patterns; if a pattern violates these rules, refactor it. The formatter and linter own layout.

## Example

```python
# Bad: defensive, noisy, hides the contract
def get_discount(user):
    if user is None:
        return 0
    if not hasattr(user, "plan"):   # TODO: shouldn't happen but just in case
        return 0
    plan = PLANS.get(user.plan)
    if plan is None:
        return 0
    return plan.discount

# Good: validated at the boundary, typed, trusts the contract
def get_discount(user: User) -> float:
    """Pre: user.plan is a key of PLANS (enforced at login).
    Post: returns the plan's discount rate."""
    return PLANS[user.plan].discount
```
