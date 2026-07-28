import { execFileSync } from 'node:child_process';

const RECORD = '\x1e';
const FIELD = '\x1f';

const LOG_FORMAT = `${RECORD}%H${FIELD}%ad${FIELD}%an <%ae>${FIELD}%B${FIELD}`;

/**
 * Run git and return stdout.
 *
 * @param {string[]} args git arguments
 * @param {string} cwd repository directory
 * @returns {string} trimmed stdout
 * @throws {Error} when git exits non-zero
 */
export function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

/**
 * @param {string} cwd repository directory
 * @returns {boolean} true when the clone is shallow
 */
export function isShallow(cwd) {
  return git(['rev-parse', '--is-shallow-repository'], cwd) === 'true';
}

/**
 * Fetch the checked-out branch's upstream tip and hard-reset onto it.
 *
 * An earlier step in the same job — an autoformat commit, a merge landing mid-run —
 * can leave this checkout behind origin's true tip. Scoring or branching off it would
 * silently miss that history and reopen a PR that's already out of date with its base.
 *
 * `reset --hard` discards uncommitted changes to every tracked file, and local commits
 * origin doesn't have yet, not just the badge's own — so this refuses to run against
 * a dirty tree or a checkout that's ahead of origin rather than eat someone else's
 * work. It's also a no-op on a detached `HEAD` — there's no upstream branch to resolve
 * — so callers checked out at a tag or SHA fall back to scoring whatever is already
 * there, same as before this sync existed.
 *
 * @param {string} cwd repository directory
 * @returns {string | null} the branch that was synced, or null when HEAD is detached
 * @throws {Error} when the working tree is dirty or HEAD has commits origin lacks
 */
export function syncWithOrigin(cwd) {
  let branch;
  try {
    branch = git(['symbolic-ref', '--short', 'HEAD'], cwd);
  } catch {
    return null;
  }

  if (git(['status', '--porcelain', '--untracked-files=no'], cwd)) {
    throw new Error('Uncommitted changes present — refusing to sync with origin and discard them.');
  }

  git(['fetch', 'origin', branch], cwd);

  if (git(['rev-list', '--count', `origin/${branch}..HEAD`], cwd) !== '0') {
    throw new Error(`HEAD has commits origin/${branch} doesn't have — refusing to reset and discard them.`);
  }

  git(['reset', '--hard', `origin/${branch}`], cwd);
  return branch;
}

/**
 * Resolve a rename path to its post-rename form.
 *
 * `--numstat` renders renames as `old => new` or `pre/{old => new}/post`.
 *
 * @param {string} path raw numstat path field
 * @returns {string} the path after the rename
 */
export function resolveRenamePath(path) {
  // classes exclude the braces they sit between; `(.*)` runs would backtrack
  const braced = /^([^{]*)\{([^{}]*) => ([^{}]*)\}(.*)$/.exec(path);
  if (braced) return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/{2,}/g, '/');
  const arrow = /^(.*) => (.*)$/.exec(path);
  return arrow ? arrow[2] : path;
}

/**
 * Read every non-merge commit reachable from HEAD.
 *
 * @param {string} cwd repository directory
 * @returns {Array<{sha: string, date: string, author: string, message: string,
 *   files: Array<{added: number, deleted: number, path: string}>}>}
 */
export function readCommits(cwd) {
  const out = execFileSync('git', ['log', '--no-merges', '--numstat', '--date=short', `--format=${LOG_FORMAT}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });

  const commits = [];
  for (const record of out.split(RECORD)) {
    if (!record.trim()) continue;
    const parts = record.split(FIELD);
    if (parts.length < 5) continue;
    const [sha, date, author, message, tail] = parts;

    const files = [];
    for (const line of tail.split('\n')) {
      const fields = line.split('\t');
      // binary files render as `-\t-\tpath` and contribute no churn
      if (fields.length !== 3 || fields[0] === '-') continue;
      files.push({
        added: Number(fields[0]),
        deleted: Number(fields[1]),
        path: resolveRenamePath(fields[2]),
      });
    }
    commits.push({ sha, date, author, message, files });
  }
  return commits;
}
