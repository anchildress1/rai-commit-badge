<div align="center">

<img
  src="https://repository-images.githubusercontent.com/1312856781/4ef0f801-6ea3-4a1c-b898-d4b1e8f5d671"
  alt="rai-commit-badge — your git history already knows how much AI wrote"
  width="720"
/>

# rai-commit-badge

**Your git history already knows how much AI wrote. This reads it back.**

_A GitHub Action that scores [RAI attribution footers](https://github.com/anchildress1/rai-lint) and publishes a shields.io badge._

### 📊 Project Stats

[![GitHub Issues](https://img.shields.io/github/issues/anchildress1/rai-commit-badge?style=for-the-badge&color=34A853&cacheSeconds=3600)](https://github.com/anchildress1/rai-commit-badge/issues) [![Release](https://img.shields.io/github/v/release/anchildress1/rai-commit-badge?style=for-the-badge&color=0875AE)](https://github.com/anchildress1/rai-commit-badge/releases) [![License: Polyform Shield License 1.0.0](https://img.shields.io/badge/license-Polyform%20Shield%20License%201.0.0-orange?style=for-the-badge)](LICENSE)

[![Sonar Tech Debt](https://img.shields.io/sonar/alert_status/anchildress1_rai-commit-badge?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge&logo=sonarqubecloud)](https://sonarcloud.io/summary/new_code?id=anchildress1_rai-commit-badge) [![Coverage](https://img.shields.io/sonar/coverage/anchildress1_rai-commit-badge?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge&logo=sonarqubecloud)](https://sonarcloud.io/summary/new_code?id=anchildress1_rai-commit-badge) [![Bugs](https://img.shields.io/sonar/bugs/anchildress1_rai-commit-badge?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge&logo=sonarqubecloud)](https://sonarcloud.io/summary/new_code?id=anchildress1_rai-commit-badge) [![Code Smells](https://img.shields.io/sonar/code_smells/anchildress1_rai-commit-badge?server=https%3A%2F%2Fsonarcloud.io&label=code_smells&style=for-the-badge&logo=sonarqubecloud)](https://sonarcloud.io/summary/new_code?id=anchildress1_rai-commit-badge)

[![CI](https://img.shields.io/github/actions/workflow/status/anchildress1/rai-commit-badge/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=fff&label=tests)](https://github.com/anchildress1/rai-commit-badge/actions/workflows/ci.yml) [![check-dist](https://img.shields.io/github/actions/workflow/status/anchildress1/rai-commit-badge/check-dist.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=fff&label=dist)](https://github.com/anchildress1/rai-commit-badge/actions/workflows/check-dist.yml)

### 📦 Marketplace

[![Marketplace](https://img.shields.io/badge/marketplace-RAI%20Commit%20Attribution%20Badge-7C3AED?style=for-the-badge&logo=githubactions&logoColor=fff)](https://github.com/marketplace/actions/rai-commit-attribution-badge)

<!-- prettier-ignore-start -->
<!--START_SECTION:rai-badge-->
![AI attribution](https://img.shields.io/badge/AI%20attribution-88%25%20since%202026--07-C03070?style=for-the-badge)
<!--END_SECTION:rai-badge-->
<!-- prettier-ignore-end -->

_That badge is this action, scoring itself._

### 🗣️ Languages

[![JavaScript Badge](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=000&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript) [![Node.js Badge](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=fff&style=for-the-badge)](https://nodejs.org/)

### 🤖 AI & Automation

[![Claude Badge](https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=fff&style=for-the-badge)](https://claude.com/claude-code) ![GitHub Actions Badge](https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=githubactions&logoColor=fff&style=for-the-badge)

### 🔧 Quality & Standards

[![Conventional Commits Badge](https://img.shields.io/badge/Conventional%20Commits-FE5196?logo=conventionalcommits&logoColor=fff&style=for-the-badge)](https://conventionalcommits.org/) [![commitlint Badge](https://img.shields.io/badge/commitlint-000?logo=commitlint&logoColor=fff&style=for-the-badge)](https://commitlint.js.org/) [![ESLint Badge](https://img.shields.io/badge/ESLint-4B32C3?logo=eslint&logoColor=fff&style=for-the-badge)](https://eslint.org/) ![Lefthook Badge](https://img.shields.io/badge/Lefthook-FF1E1E?logo=lefthook&logoColor=fff&style=for-the-badge)

[![Vitest Badge](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=fff&style=for-the-badge)](https://vitest.dev/) [![Prettier Badge](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=000&style=for-the-badge)](https://prettier.io/) ![SonarQube Cloud Badge](https://img.shields.io/badge/SonarQube%20Cloud-126ED3?logo=sonarqubecloud&logoColor=fff&style=for-the-badge)

---

[Getting Started](#getting-started-) • [Configuration](#configuration-) • [About](#about-) • [Score](#how-the-score-works-) • [Related](#related-)

</div>

---

## Getting Started 🚀

> [!NOTE]
> This action scores RAI footers — it has nothing to read until [rai-lint](https://github.com/anchildress1/rai-lint) is enforcing them on your commits.

**1.** Mark where the badge belongs in your `README.md`:

```markdown
<!--START_SECTION:rai-badge-->
<!--END_SECTION:rai-badge-->
```

> [!TIP]
> If prettier formats your README, wrap the pair in `<!-- prettier-ignore-start -->` and `<!-- prettier-ignore-end -->`. Prettier adds a blank line after the start marker, which the action then rewrites on the next run — the fences keep the block byte-stable.

**2.** Add the workflow:

```yaml
name: RAI Attribution

on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}

jobs:
  score:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: anchildress1/rai-commit-badge@v1
```

> [!IMPORTANT]
> `fetch-depth: 0` is required. A shallow clone has no history to score, and the action fails rather than publishing a wrong number.

> [!IMPORTANT]
> Turn on **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**, or the action cannot open its pull request.

> [!IMPORTANT]
> The action syncs the checkout with `origin` before scoring, and refuses to run if the workspace has uncommitted changes or local commits `origin` doesn't have yet — commit or push those in an earlier step, not after this one.

The badge arrives as a pull request on `rai-badge--branches--<base>`, rebuilt from the base each run, so it always holds one commit.

---

## Configuration ⚙️

### Inputs

| Input    | Default               | Description                                                                                                                     |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `since`  | auto                  | Window start as `YYYY-MM-DD`. Auto-detects your earliest RAI footer. Set it when a stray old footer opens the window too early. |
| `readme` | `README.md`           | Path to the file holding the markers.                                                                                           |
| `style`  | `flat`                | Valid shields style: `flat`, `flat-square`, `plastic`, `for-the-badge`, `social`.                                               |
| `token`  | `${{ github.token }}` | Token used to open the badge pull request. See [Which token](#which-token).                                                     |

### Which token

The default `GITHUB_TOKEN` covers most repos: grant `contents: write` and `pull-requests: write` at the job level and pass nothing.

This input authorises the pull-request API call only — `actions/checkout` supplies the credential that pushes the branch.

Use a PAT or GitHub App token when either applies:

- **You want checks to start on their own.** A pull request opened with `GITHUB_TOKEN` [creates its workflow runs in an approval-required state](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow): the PR shows a banner, and anyone with write access clicks **Approve workflows to run**. A PAT skips that click.
- **An organisation that disables Actions from creating pull requests.** That setting overrides every repo, and `GITHUB_TOKEN` gets a 403.

The input needs only **Pull requests: Read and write**. Pass the same token to `actions/checkout` so pushes carry it too, and it needs **Contents: Read and write** as well:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
    token: ${{ secrets.RAI_BADGE_TOKEN }}

- uses: anchildress1/rai-commit-badge@v1
  with:
    token: ${{ secrets.RAI_BADGE_TOKEN }}
```

### Output

The badge markdown, written between your markers:

```markdown
<!--START_SECTION:rai-badge-->
![AI attribution](https://img.shields.io/badge/AI%20attribution-42%25%20since%202026--03-7C3AED?style=flat)
<!--END_SECTION:rai-badge-->
```

Granularity and commit counts go to the workflow job summary.

---

## About 🤖

[RAI Lint](https://github.com/anchildress1/rai-lint) enforces AI attribution footers on every commit. Those footers encode an ordinal scale — from `Authored-by` (zero AI) to `Generated-by` (majority AI) — and then sit in your history doing nothing.

`rai-commit-badge` walks that history, weights each commit by how many lines it actually changed, and publishes the result as a badge.

**rai-lint gates, this measures.**

---

## How the score works 🧮

Each footer carries a weight derived from what it declares:

| Footer                | Declares             | Weight |
| --------------------- | -------------------- | ------ |
| `Authored-by`         | Zero AI              | 0.00   |
| `Commit-generated-by` | Trivial AI           | 0.05   |
| `Assisted-by`         | AI helped, human led | 0.25   |
| `Co-authored-by`      | Roughly 50/50        | 0.50   |
| `Generated-by`        | Majority AI          | 0.90   |

Commits are weighted by lines changed. Lockfiles, dependency trees, build output, and minified assets are excluded — so is any commit authored by a known bot (release-please, this action's own committer), since automation has no attribution to declare.

The ceiling is 0.90.

### Scoring starts when you adopted

The window opens at your **earliest RAI footer**, and the badge says so:

```
AI attribution | 42% since 2026-03
```

Inside the window, commits with no footer count as human, at weight 0.

The colour tracks which footer dominates:

| Score   |           |           |
| ------- | --------- | --------- |
| 0–33%   | `#0875AE` | human-led |
| 34–66%  | `#7C3AED` | shared    |
| 67–100% | `#C03070` | AI-led    |

> [!NOTE]
> `Co-authored-by` counts as AI only when the identity matches a known AI tool. Human co-authors score 0 — including the ones GitHub injects automatically when squashing.

---

## What squashing costs 🗜️

Squash merging collapses a PR into one commit: several footers, one line count. With no way to split the churn, the scorer averages the footer weights instead.

| Merge strategy | Attribution                      |
| -------------- | -------------------------------- |
| Merge commit   | Per-commit, exact                |
| Rebase         | Per-commit, exact                |
| Squash         | Averaged across the PR's footers |

The average is size-blind — a one-line config tweak and a full feature count the same. Squashed commits are flagged in the job summary, so the share of your score that was averaged is always visible.

---

## Architecture 🏗️

```mermaid
flowchart LR
    accTitle: How rai-commit-badge produces a badge
    accDescr: Git history is scored, the score is encoded into a shields URL, and that URL is written between markers in the README.

    H[Git history] --> S[Scorer]
    S -->|weights by churn| P[Score and window]
    P -->|encodes into URL| U[Shields badge URL]
    U -->|writes between markers| R[README]
    R --> B[Rendered badge]
```

A new score produces a new URL, so the image refreshes on its own.

---

## Security 🔒

- Runs on the default `GITHUB_TOKEN` and talks to no third-party service. See [Which token](#which-token).
- Needs `contents: write` to push the badge branch and `pull-requests: write` to open the PR. Grant both at the job level.
- Writes only to `rai-badge--branches--<base>`, so your base branch keeps its required checks.
- Reads git history and writes one thing: the marked block in the file you point `readme` at.

---

## What's Next 🔭

- Smarter handling of unattributed commits beyond bots — scope still undefined

See [`docs/prd.md`](docs/prd.md) for full scope.

---

## Related 🔗

| Project                                                  | What it does                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[rai-lint](https://github.com/anchildress1/rai-lint)** | Enforces the footers at commit time. `commitlint-plugin-rai` for Node, `gitlint-rai` for Python. **Start here** — this action has nothing to score without it. |
| **rai-commit-badge** (you are here)                      | Reads the footers back out of history and publishes the badge.                                                                                                 |

Background on the convention: [Did AI Erase Attribution? Your Git History Is Missing a Co-Author](https://dev.to/anchildress1/did-ai-erase-attribution-your-git-history-is-missing-a-co-author-1m2l)

---

## License 📄

[PolyForm Shield License 1.0.0](./LICENSE) — **not** an OSI open-source licence, so read this bit before you assume MIT-shaped permissions.

Use it, fork it, run it in your company's CI, ship it inside a product you sell. All fine. The one thing Shield forbids is turning this into a competing product — a resale, a rebrand, a hosted version, paid or free. Want to do that? Let's talk first: [anchildress1@gmail.com](mailto:anchildress1@gmail.com).

If you redistribute it, keep the licence and any `Required Notice:` lines intact. That's the whole attribution ask.

---

## Author ✍️

**Ashley Childress**

[![dev.to](https://img.shields.io/badge/dev.to-0A0A0A?logo=devdotto&logoColor=fff&style=for-the-badge)](https://dev.to/anchildress1) [![LinkedIn](https://img.shields.io/badge/linkedin-%230077B5.svg?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/anchildress1/) [![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/anchildress1) [![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/anchildress1)

---

<div align="center">

_Stop guessing. Start tracking._

</div>
