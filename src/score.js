import { isKnownBotIdentity } from './ai-identities.js';
import { countChurn } from './churn.js';
import { resolveWeight } from './groups.js';

/**
 * Score a repository's commits.
 *
 * The window opens at the earliest attributed commit, or at `since` when given.
 * Unattributed commits inside the window score 0 and stay in the denominator.
 * Commits authored by a known bot — release-please, this action's own committer —
 * are dropped from the commit list outright, before any churn is counted, unless
 * they carry a footer: bare automation isn't the thing being measured, but a
 * squash merge lands under the merge bot's name and still holds the real
 * attribution of the work it squashed.
 *
 * @param {Array<{sha: string, date: string, author: string, message: string, files: Array}>} commits
 * @param {{since?: string}} [options] `since` as `YYYY-MM-DD`
 * @returns {{attributed: boolean, percent: number, displayed: number, windowStart: string | null,
 *   commits: number, botCommits: number, windowCommits: number, attributedCommits: number,
 *   squashedCommits: number, churn: number}}
 */
export function score(commits, { since } = {}) {
  // resolved before the bot filter rather than inside it, so a footer-carrying bot
  // commit is weighed once instead of twice
  const scored = commits
    .map((commit) => {
      const { weight, groups } = resolveWeight(commit.message);
      return { date: commit.date, author: commit.author, weight, groups, churn: countChurn(commit.files) };
    })
    .filter((commit) => commit.weight !== null || !isKnownBotIdentity(commit.author));
  const botCommits = commits.length - scored.length;

  // scanned rather than sorted so the empty case falls out as null without a guard
  let earliest = null;
  for (const { weight, date } of scored) {
    if (weight !== null && (earliest === null || date < earliest)) earliest = date;
  }
  const windowStart = since ?? earliest;
  const window = windowStart === null ? [] : scored.filter((c) => c.date >= windowStart);
  const churn = window.reduce((sum, c) => sum + c.churn, 0);

  const counts = {
    commits: scored.length,
    botCommits,
    windowCommits: window.length,
    attributedCommits: window.filter((c) => c.weight !== null).length,
    squashedCommits: window.filter((c) => c.groups > 1).length,
    churn,
  };

  // Churn is the denominator, so without it nothing was measured — and a 0% badge
  // is indistinguishable from a measured zero. Catches a `since` past the last
  // commit and a window whose every file is excluded, both of which would
  // otherwise publish "0% AI" over history that is nothing of the sort.
  // windowStart is kept rather than nulled: it is what separates "no footer anywhere"
  // from "a window that caught no commits", and the summary names the wrong cause
  // without it. The badge ignores it entirely unless `attributed` is true.
  if (churn === 0) {
    return { attributed: false, percent: 0, displayed: 0, windowStart, ...counts };
  }

  const weighted = window.reduce((sum, c) => sum + (c.weight ?? 0) * c.churn, 0);
  const percent = (100 * weighted) / churn;

  return { attributed: true, percent, displayed: Math.round(percent), windowStart, ...counts };
}
