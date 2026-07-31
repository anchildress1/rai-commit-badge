import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import * as core from '@actions/core';
import { isShallow, readCommits, syncWithOrigin } from './git.js';
import { commitMessage, commitToBadgeBranch, ensurePullRequest } from './publish.js';
import { badgeMarkdown, replaceMarkers, STYLES } from './render.js';
import { score } from './score.js';
import { buildSummary } from './summary.js';

const SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Test that a `YYYY-MM-DD` string names a day that exists.
 *
 * The shape check alone admits `2026-02-30`, which then compares lexicographically
 * against commit dates and silently scores the wrong window.
 *
 * @param {string} value a shape-valid date string
 * @returns {boolean} true when the date round-trips unchanged
 */
function isRealDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Read and validate the action's inputs.
 *
 * @returns {{since: string | undefined, readme: string, style: string, token: string}}
 * @throws {Error} on an unknown style or a malformed `since`
 */
export function readInputs() {
  const style = core.getInput('style') || 'flat';
  if (!STYLES.includes(style)) {
    throw new Error(`Unknown style "${style}". Valid styles: ${STYLES.join(', ')}`);
  }

  const since = core.getInput('since').trim();
  if (since && !(SINCE_PATTERN.test(since) && isRealDate(since))) {
    throw new Error(`Invalid since "${since}". Expected a real calendar date as YYYY-MM-DD.`);
  }

  return {
    since: since || undefined,
    readme: core.getInput('readme') || 'README.md',
    style,
    token: core.getInput('token'),
  };
}

/**
 * Split `owner/repo` out of the Actions environment.
 *
 * @returns {{owner: string, repo: string}}
 * @throws {Error} when the variable is absent, which means this is not a runner
 */
function readRepository() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY is not set — the badge pull request needs a repository to open against.');
  }
  return { owner, repo };
}

/**
 * Score the repository, rewrite the badge, and publish the change.
 *
 * @param {{cwd?: string, fetchImpl?: typeof fetch}} [options] repository directory and fetch, injected for tests
 * @returns {Promise<object>} the scored result
 * @throws {Error} on a shallow clone, bad input, or a push or pull request that cannot land
 */
export async function run({ cwd = process.env.GITHUB_WORKSPACE || process.cwd(), fetchImpl } = {}) {
  const { since, readme, style, token } = readInputs();

  if (isShallow(cwd)) {
    throw new Error('Shallow clone: the history has nothing to score. Set `fetch-depth: 0` on actions/checkout.');
  }

  const base = syncWithOrigin(cwd);
  if (base === null) {
    core.warning('HEAD is detached — scoring the checkout as-is; publishing is disabled.');
  }

  const result = score(readCommits(cwd), { since });
  const badge = badgeMarkdown(result, style);

  // an absolute or `../` readme resolves outside the workspace, and the write lands
  // there before `git add --` rejects the out-of-tree path and fails the job
  const target = resolve(cwd, readme);
  if (target !== cwd && !target.startsWith(resolve(cwd) + sep)) {
    throw new Error(`readme "${readme}" resolves outside the workspace. Give a path relative to the repository root.`);
  }

  let original = null;
  try {
    original = readFileSync(target, 'utf8');
  } catch (error) {
    // only a missing file is a skip; a permission or IO failure must not read
    // as success with the badge quietly left alone
    if (error.code !== 'ENOENT') throw error;
    core.warning(`${readme} not found — nothing to rewrite.`);
  }

  const { content, replaced } = original === null ? { content: null, replaced: 0 } : replaceMarkers(original, badge);

  let commitState = 'no markers';
  if (replaced === 0) {
    // a missing file already warned; saying "no markers" as well misreads the cause
    if (original !== null) {
      core.warning(`No RAI badge markers in ${readme} — see the job summary for the snippet to paste.`);
    }
  } else if (content === original) {
    commitState = 'unchanged';
    core.info('Badge is byte-identical — skipping the commit.');
  } else {
    if (base === null) {
      throw new Error('Cannot publish from a detached HEAD.');
    }
    // both resolved before the write: the push lands before the pull request call,
    // so a missing repository or token would otherwise be discovered with a rewritten
    // badge in the tree and a branch already on origin
    const { owner, repo } = readRepository();
    if (!token.trim()) {
      throw new Error(
        'No token supplied — cannot open the badge pull request. Leave `token:` unset to use github.token.'
      );
    }
    writeFileSync(target, content);
    const message = commitMessage(result.displayed, result.attributed);
    const { branch } = commitToBadgeBranch({ cwd, readme, message, base });
    const number = await ensurePullRequest({
      owner,
      repo,
      base,
      branch,
      title: message.split('\n')[0],
      token,
      apiUrl: process.env.GITHUB_API_URL,
      fetchImpl,
    });
    commitState = `pull request #${number} from ${branch}`;
  }

  await core.summary.addRaw(buildSummary({ result, badge, readme, replaced, commitState })).write();
  const headline = result.attributed ? `${result.percent.toFixed(1)}%` : 'no attribution';
  core.info(`AI attribution: ${headline}`);
  return result;
}
