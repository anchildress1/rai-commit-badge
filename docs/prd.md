# PRD — rai-commit-badge 📊

**Status:** Draft · **Date:** 2026-07-26 · **Owner:** Ashley Childress

---

## Problem

[rai-lint](https://github.com/anchildress1/rai-lint) enforces AI attribution footers on every commit. Nothing reads them back.

## Goal

A GitHub Marketplace Action that scores a repo's footers and commits a shields.io badge.

### Non-goals

| Not doing                          | Why                             |
| ---------------------------------- | ------------------------------- |
| Enforcement                        | rai-lint gates at commit time   |
| Hosted `?repo=org/name` service    | Line stats need a clone         |
| Incremental scoring / cached state | Full recompute is ~1s           |
| npm package or CLI                 | Nobody asked                    |
| Semantic AI-detection              | Scores what the author declared |
| Python twin                        | Runs in CI                      |

---

## Scoring

| Footer                | Weight |
| --------------------- | ------ |
| `Authored-by`         | 0.00   |
| `Commit-generated-by` | 0.05   |
| `Assisted-by`         | 0.25   |
| `Co-authored-by`      | 0.50   |
| `Generated-by`        | 0.90   |

```
aiPercent = Σ(weight × churn) / Σ(churn)
```

Ceiling is 0.90.

`Co-authored-by` scores 0.50 when the identity matches a known AI tool, otherwise 0.

**Churn** = lines added + deleted, from `--numstat`.

- Binary files (`-\t-`) contribute 0
- Walks every non-merge commit reachable from HEAD

Footer keys match **case-insensitively, anchored to line start** — mirroring rai-lint's `/i` and `re.IGNORECASE`. Anchoring is required: `Commit-generated-by` ends with `generated-by`, and an unanchored match scores it 0.90 instead of 0.05.

### Exclusions

Machine-written files carry no attribution signal and are excluded from churn. The list ships **with this action** as `.churnignore`, gitignore syntax, parsed with [`ignore`](https://www.npmjs.com/package/ignore). Consumers configure nothing.

|                  |                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lockfiles        | `package-lock.json` `npm-shrinkwrap.json` `yarn.lock` `pnpm-lock.yaml` `bun.lockb` `uv.lock` `poetry.lock` `Pipfile.lock` `Cargo.lock` `composer.lock` `Gemfile.lock` `go.sum` |
| Dependency trees | `node_modules/` `vendor/`                                                                                                                                                      |
| Build output     | `dist/` `build/`                                                                                                                                                               |
| Minified         | `*.min.js` `*.min.css` `*.map`                                                                                                                                                 |

Exclusion is per line, not per commit — a commit that only touches excluded paths drops out of both sides of the ratio.

Measured across 24 repos, exclusions account for a **median 33% of churn**, ranging 0% to 97%.

### Window

Scoring starts at the earliest RAI footer. Everything before is excluded.

- Unattributed commits inside the window score 0 and stay in the denominator
- `since` input overrides auto-detection
- Zero footers and zero `since` → badge reads `no attribution` in grey

---

## Merge strategies

| Strategy     | Attribution        |
| ------------ | ------------------ |
| Merge commit | Per-commit, intact |
| Rebase       | Per-commit, intact |
| Squash       | Collapsed          |

Squash concatenates every commit message, so one commit can carry several footer blocks against one churn number.

**Group-aware resolution.** Split the message on blank lines; each paragraph containing a RAI footer is a group.

- Within a group → **max** weight
- Across groups → **mean** of group weights
- A group whose only RAI-keyed line is a non-AI `Co-authored-by` is **discarded**
- `Authored-by` counts as a group, at 0.00

The average is size-blind. README documents the cost, without prescribing a merge strategy — squashing is the common case, measured across 24 repos.

### Known gaps

- Conflict-resolution edits living only in a merge commit are invisible
- Rebase and cherry-pick can double-count churn

---

## Outputs

The action writes one thing: badge markdown between markers in the consumer's README.

```markdown
<!--START_SECTION:rai-badge-->
![AI attribution](https://img.shields.io/badge/AI%20attribution-42%25%20since%202026--03-7C3AED?style=flat)
<!--END_SECTION:rai-badge-->
```

The score is encoded in the URL, so a score change is a URL change. GitHub's camo proxy treats it as a new image and fetches it fresh — which is what keeps the badge current, since camo caches opaquely and holds the badge stale longer than any `cacheSeconds` setting can fix.

Shields static-badge escaping applies: `-` → `--`, `_` → `__`, space → `%20`, `%` → `%25`. The window date's hyphen doubles.

Every other computed value lives in the job summary, where a human reads it.

Three colors, on the bands the RAI scale already uses:

| Score            | Color             |           |
| ---------------- | ----------------- | --------- |
| 0–33%            | `#0875AE` blue    | human-led |
| 34–66%           | `#7C3AED` violet  | shared    |
| 67–100%          | `#C03070` magenta | AI-led    |
| `no attribution` | `#9F9F9F` grey    |           |

All three clear 4.5:1 against the white text shields forces.

Setup is one paste, into any file the `readme` input points at:

```markdown
<!--START_SECTION:rai-badge-->
<!--END_SECTION:rai-badge-->
```

When the target file lacks markers, the action leaves it untouched and the job summary prints the snippet.

### Job summary

Written to `$GITHUB_STEP_SUMMARY` every run, computed in-memory: score, window start, granularity, and commit counts. Plus the marker snippet when the README lacks them.

---

## Action

| Input    | Default     | Accepts                                                     |
| -------- | ----------- | ----------------------------------------------------------- |
| `since`  | auto        | `YYYY-MM-DD` window start                                   |
| `readme` | `README.md` | path to the file holding the markers                        |
| `style`  | `flat`      | `flat`, `flat-square`, `plastic`, `for-the-badge`, `social` |

`label` and the color bands stay fixed — they carry the meaning that makes one repo's badge comparable to another's.

```yaml
branding:
  icon: edit-2
  color: purple
```

- Hard-fail on shallow clones; requires `fetch-depth: 0`
- Skip the commit when output is byte-identical
- Its own commit carries RAI footers
- Job-level `contents: write`
- Colour band lookup uses the displayed integer, so the badge colour always matches the number printed on it

### Triggers

Document both. The score is a lifetime measure, so it moves slowly — a 50-line commit shifts a 150-commit repo by ~0.03 points.

| Trigger                      | For                                                                  |
| ---------------------------- | -------------------------------------------------------------------- |
| `push` to the default branch | Immediate feedback; the byte-identical check makes most runs a no-op |
| `schedule`, weekly           | The steady-state cost floor once the number stabilises               |

### Marketplace

- Single action, `action.yml` at repo root, public repo
- Listing name: **RAI Commit Attribution Badge**
- JavaScript action (`using: node24`); commit the ncc `dist/` bundle, with `check-dist` in CI

### Cross-repo key parity

CI fetches rai-lint's `rules.py` and asserts the footer key sets match.

---

## Phasing

**Phase 1** — scoring, badge, Marketplace listing, squash warning.

**Phase 2** — scope undefined. Agreed requirement: "assume human" needs to get smarter, starting with bot-authored commits.

## Success criteria

- Output matches a hand-computed score on rai-lint's own history
- Badge renders on shields.io
- A repo with zero footers badges `no attribution`
- Pre-adoption history excluded; `since` overrides a stray footer
- Squashed history flagged in the job summary
- Badge markdown lands between the markers, and a score change changes the URL
- A file lacking markers gets the snippet printed in the job summary
- Each `style` value renders on shields
