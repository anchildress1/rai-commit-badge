import { MARKER_SNIPPET } from './render.js';

const pct = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '0.0%');

/**
 * Build the job summary markdown.
 *
 * @param {object} params
 * @param {object} params.result the scored result
 * @param {string} params.badge the badge markdown
 * @param {string} params.readme the target file path
 * @param {number} params.replaced marker pairs rewritten
 * @param {string} params.commitState `no markers`, `unchanged`, or `pull request #<n> from <branch>`
 * @returns {string} markdown for `$GITHUB_STEP_SUMMARY`
 */
export function buildSummary({ result, badge, readme, replaced, commitState }) {
  const lines = ['## RAI attribution', '', badge, '', '| | |', '|---|---|'];

  if (result.attributed) {
    lines.push(
      `| Score | ${result.percent.toFixed(1)}% (badge shows ${result.displayed}%) |`,
      `| Window start | ${result.windowStart} — badge shows month granularity |`,
      `| Commits in window | ${result.windowCommits} of ${result.commits} |`,
      `| Attributed commits | ${result.attributedCommits} (${pct(result.attributedCommits, result.windowCommits)}) |`,
      `| Squashed commits | ${result.squashedCommits} — footer weights averaged |`,
      `| Bot commits excluded | ${result.botCommits} — release-please, this action, and friends |`,
      `| Scored churn | ${result.churn} lines |`
    );
  } else {
    // footers with no countable churn and no footers at all both land here, and
    // conflating them sends someone hunting for a missing footer that is present
    const reason = result.attributedCommits
      ? `${result.attributedCommits} attributed commits, but no countable churn in the window`
      : `no RAI footer found in ${result.commits} commits`;
    lines.push(`| Score | no attribution — ${reason} |`);
  }

  lines.push(`| Target file | \`${readme}\` |`, `| Badge | ${commitState} |`, '');

  if (replaced === 0) {
    lines.push(
      `### No markers in \`${readme}\``,
      '',
      'Paste this where the badge belongs:',
      '',
      '```markdown',
      MARKER_SNIPPET,
      '```',
      ''
    );
  }

  return lines.join('\n');
}
