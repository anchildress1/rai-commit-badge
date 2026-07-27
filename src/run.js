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
 * @returns {{since: string | undefined, readme: string, style: string}}
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
    writeFileSync(target, content);
    const branch = commitAndPush({
      cwd,
      readme,
      message: commitMessage(result.displayed, result.attributed),
    });
    commitState = `committed to ${branch}`;
  }

  await core.summary.addRaw(buildSummary({ result, badge, readme, replaced, commitState })).write();
  const headline = result.attributed ? `${result.percent.toFixed(1)}%` : 'no attribution';
  core.info(`AI attribution: ${headline}`);
  return result;
}
