.PHONY: help install install-locked clean ai-checks test lint format build check-dist

help:
	@echo "Main targets:"
	@echo "  ai-checks      - Full env refresh + all checks (clean, install, format, lint, test, build)"
	@echo "  test           - Run tests with coverage"
	@echo "  lint           - Run eslint and prettier checks"
	@echo "  format         - Format all sources"
	@echo "  build          - Bundle src/ into dist/ with ncc"
	@echo "  check-dist     - Fail if dist/ is stale relative to src/"
	@echo "  install        - Install dependencies"
	@echo "  install-locked - Install from the lock file (CI mode)"
	@echo "  clean          - Remove build and test artifacts"

install:
	npm install

install-locked:
	npm ci

clean:
	rm -rf node_modules dist coverage reports

format:
	npm run format

lint:
	npm run lint
	npm run format:check

test:
	npm test

build:
	npm run build

check-dist: build
	@git diff --exit-code --stat -- dist/ || \
		(echo "dist/ is stale — run 'make build' and commit the result"; exit 1)

ai-checks: install format lint test build
