import { git } from './git.js';

export const COMMITTER_NAME = 'github-actions[bot]';
export const COMMITTER_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

const PR_BODY = [
  'Scored from the commit history by [rai-commit-badge](https://github.com/anchildress1/rai-commit-badge).',
  '',
  'The branch is cut fresh from the base on every run, so this PR always holds exactly one commit.',
  '',
].join('\n');

/**
 * Build the commit message for a badge update.
 *
 * Subject only. Every RAI footer declares AI involvement and this action runs
 * none, and a bot cannot sign off on itself.
 *
 * @param {number} displayed the displayed integer percentage
 * @param {boolean} attributed whether any footer was found
 * @returns {string} the commit subject
 */
export function commitMessage(displayed, attributed) {
  const subject = attributed
    ? `docs: update AI attribution badge to ${displayed}%`
    : 'docs: update AI attribution badge';
  return `${subject}\n`;
}

/**
 * Name the machine-owned branch that badge updates land on.
 *
 * @param {string} base the branch the badge is measured from
 * @returns {string} the badge branch name
 */
export function badgeBranchName(base) {
  return `rai-badge--branches--${base}`;
}

/**
 * Commit the badge onto a branch cut from the checked-out base and force-push it.
 *
 * @param {object} params
 * @param {string} params.cwd repository directory
 * @param {string} params.readme path to the rewritten file
 * @param {string} params.message the commit message
 * @param {(args: string[], cwd: string) => string} [params.run] git runner, injected for tests
 * @returns {{base: string, branch: string}} the base branch and the branch the badge landed on
 */
export function commitToBadgeBranch({ cwd, readme, message, run = git }) {
  const base = run(['symbolic-ref', '--short', 'HEAD'], cwd);
  const branch = badgeBranchName(base);

  run(['config', 'user.name', COMMITTER_NAME], cwd);
  run(['config', 'user.email', COMMITTER_EMAIL], cwd);
  run(['checkout', '-B', branch], cwd);
  run(['add', '--', readme], cwd);
  run(['commit', '--only', '-m', message, '--', readme], cwd);
  // the branch is machine-owned and rebuilt from base every run, so the push
  // has to clobber whatever the previous run left behind
  run(['push', '--force', 'origin', `HEAD:refs/heads/${branch}`], cwd);

  return { base, branch };
}

/**
 * Call the GitHub REST API and return the parsed body.
 *
 * @param {typeof fetch} fetchImpl fetch implementation
 * @param {string} url absolute request URL
 * @param {RequestInit} init fetch options
 * @returns {Promise<any>} the parsed response body, or null when empty
 * @throws {Error} on any non-2xx response, carrying the status and body
 */
async function request(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${init.method ?? 'GET'} ${url} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Open a pull request from the badge branch, reusing one that is already open.
 *
 * @param {object} params
 * @param {string} params.owner repository owner
 * @param {string} params.repo repository name
 * @param {string} params.base branch the pull request merges into
 * @param {string} params.branch the badge branch
 * @param {string} params.title pull request title
 * @param {string} params.token token carrying `pull-requests: write`
 * @param {string} [params.apiUrl] GitHub API root
 * @param {typeof fetch} [params.fetchImpl] fetch, injected for tests
 * @returns {Promise<number>} the pull request number
 */
export async function ensurePullRequest({
  owner,
  repo,
  base,
  branch,
  title,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
}) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
  const query = new URLSearchParams({
    state: 'open',
    head: `${owner}:${branch}`,
    base,
  });

  const json = { ...headers, 'content-type': 'application/json' };

  const open = await request(fetchImpl, `${apiUrl}/repos/${owner}/${repo}/pulls?${query}`, { headers });
  if (open?.length) {
    const [existing] = open;
    // the branch was rebuilt with a fresh score, so a title left over from the
    // previous run advertises a percentage the diff no longer contains
    if (existing.title !== title) {
      await request(fetchImpl, `${apiUrl}/repos/${owner}/${repo}/pulls/${existing.number}`, {
        method: 'PATCH',
        headers: json,
        body: JSON.stringify({ title }),
      });
    }
    return existing.number;
  }

  const created = await request(fetchImpl, `${apiUrl}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ title, head: branch, base, body: PR_BODY }),
  });
  return created.number;
}
