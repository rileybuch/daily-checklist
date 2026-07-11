# Thin wrapper mapping the agent-process hooks onto this no-build static stack.
# The app is plain static files: there is nothing to compile or bundle.
.PHONY: format-fix format-check lint-fix lint-check pre-commit unit-tests integration-tests tests serve

format-fix:
	@echo "format-fix: no-op (no formatter configured — plain static files, no build step)"

format-check:
	@echo "format-check: no-op (no formatter configured — plain static files, no build step)"

lint-fix:
	@echo "lint-fix: no-op (no linter configured — plain static files, no build step)"

lint-check:
	@echo "lint-check: no-op (no linter configured — plain static files, no build step)"

unit-tests:
	node --test

integration-tests:
	@echo "no integration tests (backend requires live Google deploy — see [HUMAN] steps in task 001)"

tests: unit-tests integration-tests

pre-commit: unit-tests

serve:
	bash scripts/serve.sh
