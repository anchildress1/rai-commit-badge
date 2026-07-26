import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as core from '@actions/core';
import { isShallow, readCommits } from './git.js';
import { commitAndPush, commitMessage } from './publish.js';
import { badgeMarkdown, replaceMarkers, STYLES } from './render.js';
import { score } from './score.js';
import { buildSummary } from './summary.js';

const SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read and validate the action's inputs.
 *
 * @returns {{since: string | undefined, readme: string, style: string}}
 * @throws {Error} on an unknown style or a malformed `since`
 */
export function readInputs() {
  const style = core.getInput('style') || 'flat';
  if (!STYLES.includes(style)) {
    throw new Error(`Unknown style "${style}". Valid styles: ${STYLES.join(', ')}`);
  }

  const since = core.getInput('since').trim();
  if (since && !SINCE_PATTERN.test(since)) {
    throw new Error(`Invalid since "${since}". Expected YYYY-MM-DD.`);
  }

  return { since: since || undefined, readme: core.getInput('readme') || 'README.md', style };
}

/**
 * Score the repository, rewrite the badge, and publish the change.
 *
 * @param {{cwd?: string}} [options] repository directory, defaults to the workspace
 * @returns {Promise<object>} the scored result
 * @throws {Error} on a shallow clone, bad input, or a push that cannot land
 */
export async function run({ cwd = process.env.GITHUB_WORKSPACE || process.cwd() } = {}) {
  const { since, readme, style } = readInputs();

  if (isShallow(cwd)) {
    throw new Error('Shallow clone: the history has nothing to score. Set `fetch-depth: 0` on actions/checkout.');
  }

  const result = score(readCommits(cwd), { since });
  const badge = badgeMarkdown(result, style);
  const target = resolve(cwd, readme);

  let original = null;
  try {
    original = readFileSync(target, 'utf8');
  } catch {
    core.warning(`${readme} not found — nothing to rewrite.`);
  }

  const { content, replaced } = original === null ? { content: null, replaced: 0 } : replaceMarkers(original, badge);

  let commitState = 'no markers';
  if (replaced === 0) {
    core.warning(`No RAI badge markers in ${readme} — see the job summary for the snippet to paste.`);
  } else if (content === original) {
    commitState = 'unchanged';
    core.info('Badge is byte-identical — skipping the commit.');
  } else {
    writeFileSync(target, content);
    const { branch, rebased } = commitAndPush({
      cwd,
      readme,
      message: commitMessage(result.displayed, result.attributed),
    });
    commitState = rebased ? `committed to ${branch} after rebase` : `committed to ${branch}`;
  }

  await core.summary.addRaw(buildSummary({ result, badge, readme, replaced, commitState })).write();
  core.info(`AI attribution: ${result.attributed ? `${result.percent.toFixed(1)}%` : 'no attribution'}`);
  return result;
}
