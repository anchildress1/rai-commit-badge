import { readFileSync } from 'node:fs';
import ignore from 'ignore';

// Read as an asset rather than inlined so `.churnignore` stays the single
// source of truth in plain gitignore syntax. ncc relocates it next to the bundle.
const RULES = readFileSync(new URL('../.churnignore', import.meta.url), 'utf8');

const matcher = ignore().add(RULES);

/**
 * @param {string} path repository-relative path
 * @returns {boolean} true when the path carries no attribution signal
 */
export function isExcluded(path) {
  return matcher.ignores(path);
}

/**
 * Split a commit's files into counted and excluded churn.
 *
 * @param {Array<{added: number, deleted: number, path: string}>} files
 * @returns {{churn: number, excluded: number}} lines added plus deleted, per side
 */
export function splitChurn(files) {
  let churn = 0;
  let excluded = 0;
  for (const file of files) {
    const lines = file.added + file.deleted;
    if (isExcluded(file.path)) excluded += lines;
    else churn += lines;
  }
  return { churn, excluded };
}
