## Rebuild `dist/` in the same commit as any `src/` change

`action.yml` runs `dist/index.js`. Consumers never execute `src/`.

```bash
make build
git add src/<file>.js dist/index.js
make check-dist          # exit 0 = committed bundle matches a fresh build
```

Nothing local catches a stale bundle. Lefthook's pre-commit hooks run format,
lint, and tests — none touch `dist/`. The failure appears only after the push,
as the `Rebuild and compare` job on the PR.

Staging an explicit path (`git add src/groups.js`) is how the bundle gets left
behind. Run `git status --porcelain -- dist/` before every commit that touches
`src/` or `.churnignore`.

`make ai-checks` runs `build` but never compares — it leaves a rebuilt `dist/`
sitting dirty in the tree instead of failing. `make check-dist` is a separate run.

Tracked bundle files: `dist/index.js`, `dist/.churnignore`, `dist/package.json`.

---

## Commands

| Task                | Command                                               |
| ------------------- | ----------------------------------------------------- |
| Everything          | `make ai-checks` (install, format, lint, test, build) |
| Bundle parity       | `make check-dist`                                     |
| Tests + coverage    | `make test`                                           |
| Lint + format check | `make lint`                                           |
| Rebuild bundle      | `make build`                                          |

`make ai-checks` opens with `npm install`, which can move `package-lock.json`.
Use `make install-locked` (`npm ci`) when the lockfile must not move.

---

## Commits

Enforced by `commitlint.config.js`:

| Rule                     | Requirement                |
| ------------------------ | -------------------------- |
| `header-max-length`      | 72                         |
| `footer-max-line-length` | 100                        |
| `rai-footer-exists`      | one AI attribution trailer |
| `rai-signed-off-by`      | `Signed-off-by:` trailer   |
| `subject-case`           | disabled                   |

Both trailers, attribution first:

```
Generated-by: Claude Opus 5 <noreply@anthropic.com>
Signed-off-by: Ashley Childress <anchildress1@gmail.com>
```

Commit with `git commit -S`. Write bodies as prose paragraphs naming the failure
the change prevents — match `git --no-pager log`, not a bullet list.

---

## Footer keys mirror rai-lint

`AI_ATTRIBUTION_KEYS` in `src/keys.js` must equal rai-lint's list in
`packages/python-gitlint/gitlint_rai/rules.py`. `scripts/check-key-parity.js`
fetches and compares it on every PR.

Add a key and its lowercase `WEIGHTS` entry together. A key with no weight makes
the mean `NaN` — `?? 0` does not catch `NaN` — and surfaces as a `TypeError` in
`bandColor`, three modules from the cause.

Keys interpolate into `FOOTER_PATTERN` unescaped. Keep them `[A-Za-z-]`.

---

## Runtime

- Node `>=24`, `"type": "module"`. ESM only — no `require`, no CJS shims.
- `.churnignore` is read at module scope in `src/churn.js` as a bundled asset.
  Do not defer that read into a try/catch; ncc then emits the file under an
  opaque hash instead of its own name.
- `src/index.js` is Actions-runtime wiring only, and is excluded from coverage.

---

## Tests

- Vitest, `globals: true`, node environment, 30s timeout — fixtures shell out to git.
- Coverage gates: lines 90, functions 90, branches 85, statements 90.
- Build fixtures with `tests/helpers.js` (`initRepo`, `initBareRepo`), never a raw
  `git init`. The helpers pin `GIT_CONFIG_GLOBAL=/dev/null` and
  `GIT_CONFIG_SYSTEM=/dev/null` so a developer's `commit.gpgsign` or commit-msg
  hook cannot fail every fixture commit.

---

## Sonar

- Project key `anchildress1_rai-commit-badge`, configured in `sonar-project.properties`.
- `dist/` is excluded; analysing a minified ncc bundle measures ncc.
- `sonar.qualitygate.wait=true` — the scan job fails on a failing gate.
- Suppress a rule by adding a `sonar.issue.ignore.multicriteria` entry with a
  comment giving the reason, following the existing `javascript:S4036` entry.
- The SonarCloud job is skipped for forks; `SONAR_TOKEN` is unavailable there.
