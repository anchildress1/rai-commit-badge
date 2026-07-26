import { git } from './git.js';

export const COMMITTER_NAME = 'github-actions[bot]';
export const COMMITTER_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

/**
 * Build the commit message for a badge update.
 *
 * `Commit-generated-by` rather than `Generated-by`: the change is a machine-
 * written doc line, and scoring it any higher would let the action inflate the
 * number it publishes.
 *
 * @param {number} displayed the displayed integer percentage
 * @param {boolean} attributed whether any footer was found
 * @returns {string} a commit message carrying RAI footers and a sign-off
 */
export function commitMessage(displayed, attributed) {
  const subject = attributed
    ? `docs: update AI attribution badge to ${displayed}%`
    : 'docs: update AI attribution badge';
  return [
    subject,
    '',
    'Commit-generated-by: rai-commit-badge <noreply@github.com>',
    `Signed-off-by: ${COMMITTER_NAME} <${COMMITTER_EMAIL}>`,
    '',
  ].join('\n');
}

/**
 * Commit the badge change and push it to the current branch.
 *
 * A concurrent run makes the first push non-fast-forward; the rebase-and-retry
 * covers that. A rejection that survives the retry is branch protection, and the
 * action fails rather than pretending the badge shipped.
 *
 * @param {object} params
 * @param {string} params.cwd repository directory
 * @param {string} params.readme path to the rewritten file
 * @param {string} params.message the commit message
 * @param {(args: string[], cwd: string) => string} [params.run] git runner, injected for tests
 * @returns {{branch: string, rebased: boolean}}
 * @throws {Error} on a detached HEAD or a push that survives one rebase retry
 */
export function commitAndPush({ cwd, readme, message, run = git }) {
  let branch;
  try {
    branch = run(['symbolic-ref', '--short', 'HEAD'], cwd);
  } catch {
    throw new Error('HEAD is detached — check out a branch before publishing the badge');
  }

  run(['config', 'user.name', COMMITTER_NAME], cwd);
  run(['config', 'user.email', COMMITTER_EMAIL], cwd);
  run(['add', '--', readme], cwd);
  run(['commit', '-m', message], cwd);

  try {
    run(['push', 'origin', `HEAD:${branch}`], cwd);
    return { branch, rebased: false };
  } catch (first) {
    try {
      run(['pull', '--rebase', 'origin', branch], cwd);
      run(['push', 'origin', `HEAD:${branch}`], cwd);
      return { branch, rebased: true };
    } catch (second) {
      throw new Error(
        `Push to ${branch} was rejected. If the branch is protected, grant the workflow ` +
          `an exception or run this action on an unprotected branch.\n${second.stderr ?? second.message}\n` +
          `First attempt: ${first.stderr ?? first.message}`,
        { cause: second }
      );
    }
  }
}
