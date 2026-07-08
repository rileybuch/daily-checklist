# CLAUDE.md

## About Me
Name: Riley
Role: full-stack data scientist and machine learning engineer

What I'm working on: Daily checklist and habit tracker
Goal: Track by daily habits across time, including both binary habits (e.g. Bible Study) and integer habits (e.g. sets of pushups).
Audience: Me
Stack context: I want to be able to access this app from both my iPhone. It doesn't need to be an app if it's accessible from the web, but I want the data to persist, whether that's in my own google drive or a separate backend system.
What to avoid: [list].
Apply this context to every task. When something doesn't fit, flag it before proceeding.

## Behavioral guidelines
1. Ask, don't assume. If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements.
2. Simplest solution first. Always implement the simplest thing that could work. Do not add abstractions or flexibility that weren't explicitly requested.
3. Don't touch unrelated code. If a file or function is not directly part of the current task, do not modify it, even if you think it could be improved.
4. Verify, don't approximate. Every task needs a concrete success condition before you start — a test, an output, a measurable state. "Make it work" is not a success condition.
5. After any coding task, end with: Files changed (list every file touched) / What was modified (one line per file) / Files intentionally not touched / Follow-up needed.
6. Never open responses with filler phrases like "Great question!", "Of course!", "Certainly!", or similar warmups. Start every response with the actual answer.

## Python Tooling
- Use `uv` to manage environments and dependencies. Never edit `pyproject.toml` directly — use `uv add` and `uv add --dev`.
- Use `uv run` to execute scripts and commands.
- Use `pytest` for testing. Collect shared fixtures in `conftest.py`.
- Use `hypothesis` for property-based testing when input spaces are complex or edge cases matter.
- Use `ruff` for linting, `ty` for type checking, `prek` for pre-commit hooks, and `wily` for complexity tracking. Run them after every change.

## Code Quality
- Use type hints for all function parameters and return types.
- Use numpy-style docstrings. Include doctests to provide usage examples.
- Avoid excessive casting. Cast only at boundary layers where you interface with external systems.
- Use logging for insight into failures — not `print`. Don't use logging to suppress stack traces.

## Testing
- Practice TDD: write tests before implementation.
- When you find a bug, write a test that catches it before fixing it.
- When a test fails, run `uv run pytest --last-failed` first.
- Prefer testing real code. Use doubles and `monkeypatch` only when necessary.
- Favor `pytest` monkeypatch over other mocking approaches.

## Non-Python Side Projects
Some projects are not Python/ML. The Behavioral guidelines above still apply; the Python Tooling section does not.
