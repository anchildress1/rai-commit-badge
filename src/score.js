import { countChurn } from './churn.js';
import { resolveWeight } from './groups.js';

/**
 * Score a repository's commits.
 *
 * The window opens at the earliest attributed commit, or at `since` when given.
 * Unattributed commits inside the window score 0 and stay in the denominator.
 *
 * @param {Array<{sha: string, date: string, message: string, files: Array}>} commits
 * @param {{since?: string}} [options] `since` as `YYYY-MM-DD`
 * @returns {{attributed: boolean, percent: number, displayed: number, windowStart: string | null,
 *   commits: number, windowCommits: number, attributedCommits: number, squashedCommits: number,
 *   churn: number}}
 */
export function score(commits, { since } = {}) {
  const scored = commits.map((commit) => {
    const { weight, groups } = resolveWeight(commit.message);
    return { date: commit.date, weight, groups, churn: countChurn(commit.files) };
  });

  const attributedDates = scored.filter((c) => c.weight !== null).map((c) => c.date);
  // min rather than sort: one pass, no mutation of the mapped array, and no
  // reliance on the default comparator to order ISO dates
  const earliest = attributedDates.length ? attributedDates.reduce((min, date) => (date < min ? date : min)) : null;
  const windowStart = since ?? earliest;

  if (windowStart === null) {
    return {
      attributed: false,
      percent: 0,
      displayed: 0,
      windowStart: null,
      commits: scored.length,
      windowCommits: 0,
      attributedCommits: 0,
      squashedCommits: 0,
      churn: 0,
    };
  }

  const window = scored.filter((c) => c.date >= windowStart);
  const churn = window.reduce((sum, c) => sum + c.churn, 0);
  const weighted = window.reduce((sum, c) => sum + (c.weight ?? 0) * c.churn, 0);
  const percent = churn ? (100 * weighted) / churn : 0;

  return {
    attributed: true,
    percent,
    displayed: Math.round(percent),
    windowStart,
    commits: scored.length,
    windowCommits: window.length,
    attributedCommits: window.filter((c) => c.weight !== null).length,
    squashedCommits: window.filter((c) => c.groups > 1).length,
    churn,
  };
}
