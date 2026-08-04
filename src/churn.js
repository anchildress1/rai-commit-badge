import { readFileSync } from 'node:fs';
import ignore from 'ignore';

// Read as an asset rather than inlined so `.churnignore` stays the single
// source of truth in plain gitignore syntax. ncc relocates it next to the bundle.
//
// Read at module scope deliberately. Deferring it so the entry point's try/catch
// could annotate a missing asset makes ncc emit the file under an opaque hash
// instead of its own name, and a stale bundle cannot reach consumers anyway:
// check-dist rebuilds on every PR and rai-badge.yml runs this bundle on main.
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
 * Total a commit's countable churn.
 *
 * @param {Array<{added: number, deleted: number, path: string}>} files
 * @returns {number} lines added plus deleted, excluded paths omitted
 */
export function countChurn(files) {
  return files.reduce((total, file) => (isExcluded(file.path) ? total : total + file.added + file.deleted), 0);
}
