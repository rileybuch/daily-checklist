# project-template

Starter template for new projects. Includes everything I normally set up at the start of a project:

- `CLAUDE.md` — Claude Code instructions: behavioral guidelines, Python tooling (uv, ruff, ty, pytest), code quality and testing standards. Fill in the `[bracketed]` placeholders in the **About Me** section for each new project.
- `.claude/settings.json` — shared Claude Code permissions for common test/lint/type-check commands, plus the [astral-sh plugin](https://github.com/astral-sh/claude-code-plugins) (skills for `uv`, `ruff`, and `ty`) declared via `enabledPlugins`. On a machine without the plugin, Claude Code will prompt to install it from the official marketplace.
- `.gitignore` — Python, Node, notebooks, macOS, editor cruft.

## Usage

Click **Use this template** on GitHub (or `gh repo create <name> --template rileybuch/project-template`), then:

1. Update `CLAUDE.md` placeholders for the new project.
2. For Python projects: `uv init` and `uv add --dev pytest ruff ty`.
3. Replace this README.
