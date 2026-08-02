import { execFileSync, spawnSync } from 'node:child_process';

const FIELD = '\0';
const FIELDS_PER_COMMIT = 5;

// Git's ordinary writers reject NUL, so it is safe framing for ordinary history.
// readCommits separately rejects handcrafted objects that smuggle one in.
const LOG_FORMAT = '%x00%H%x00%ad%x00%an <%ae>%x00%B%x00';

/** Reject objects Git's pretty formatter would silently truncate at a raw NUL. */
function rejectNulCommitObjects(cwd, shas) {
  if (shas.length === 0) return;

  const batch = execFileSync('git', ['cat-file', '--batch'], {
    cwd,
    input: `${shas.join('\n')}\n`,
    maxBuffer: 512 * 1024 * 1024,
  });
  let offset = 0;

  for (const expectedSha of shas) {
    const headerEnd = batch.indexOf(0x0a, offset);
    const header = headerEnd === -1 ? '' : batch.subarray(offset, headerEnd).toString('utf8');
    const match = /^([0-9a-f]+) commit (\d+)$/.exec(header);
    if (!match || match[1] !== expectedSha) throw new Error('Unparsable git cat-file output.');

    const bodyStart = headerEnd + 1;
    const bodyEnd = bodyStart + Number(match[2]);
    const nul = batch.indexOf(0, bodyStart);
    if (nul !== -1 && nul < bodyEnd) {
      throw new Error(`Commit ${expectedSha} contains a raw NUL byte — refusing to score truncated history.`);
    }
    if (bodyEnd >= batch.length || batch[bodyEnd] !== 0x0a) throw new Error('Unparsable git cat-file output.');
    offset = bodyEnd + 1;
  }

  if (offset !== batch.length) throw new Error('Unparsable git cat-file output.');
}

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
  // Under `--quiet` a detached HEAD is exit 1 with no stderr, while a broken or
  // absent repository is 128 with a fatal. Catching both as "detached" would skip
  // the sync this function exists to perform and blame the wrong cause for it.
  const head = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  if (head.error) throw head.error;
  if (head.status === 1) return null;
  if (head.status !== 0) {
    const reason = head.stderr.trim() || `git exited ${head.status}`;
    throw new Error(`Could not resolve HEAD in ${cwd}: ${reason}`);
  }
  const branch = head.stdout.trim();

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

// `\a` has no JS escape, and `"` and `\` are the two git emits most often.
const C_ESCAPES = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '"': '"', '\\': '\\' };

/**
 * Decode a C-quoted `--numstat` path.
 *
 * `core.quotePath=false` stops git escaping non-ASCII, but a path holding a quote,
 * a backslash, or a control character still arrives wrapped and escaped. Left encoded
 * it matches no `.churnignore` rule, so excluded build output counts as real churn and
 * deflates the score. Renames quote each side separately, so this runs after the
 * rename split — the braced form git uses for a shared prefix is never quoted.
 *
 * @param {string} path a numstat path, quoted or not
 * @returns {string} the decoded path, returned unchanged when it was not quoted
 */
export function unquotePath(path) {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path;
  return path.slice(1, -1).replaceAll(/\\([0-7]{3}|.)/g, (whole, code) =>
    // octal is per byte, and quotePath=false leaves only control bytes escaped
    code.length === 3 ? String.fromCodePoint(Number.parseInt(code, 8)) : (C_ESCAPES[code] ?? whole)
  );
}

/**
 * Read every non-merge commit reachable from HEAD.
 *
 * @param {string} cwd repository directory
 * @returns {Array<{sha: string, date: string, author: string, message: string,
 *   files: Array<{added: number, deleted: number, path: string}>}>}
 */
export function readCommits(cwd) {
  const out = execFileSync(
    'git',
    // core.quotePath defaults on, and C-quotes every non-ASCII path in --numstat as
    // `"src/caf\303\251.js"`. That literal reaches .churnignore, which matches none of
    // it, so a repo with one accented directory counts its own build output as scored
    // churn. Never reproduces where the developer has set quotePath=false. Paths holding
    // a quote, a backslash, or a control byte stay quoted regardless — unquotePath
    // decodes those.
    ['-c', 'core.quotePath=false', 'log', '--no-merges', '--numstat', '--date=short', `--format=${LOG_FORMAT}`],
    { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
  );

  const fields = out.split(FIELD);
  if (fields[0] !== '' || (fields.length - 1) % FIELDS_PER_COMMIT !== 0) {
    throw new Error('Unparsable NUL-framed git log output.');
  }

  const commits = [];
  for (let index = 1; index < fields.length; index += FIELDS_PER_COMMIT) {
    const [sha, date, author, message, tail] = fields.slice(index, index + FIELDS_PER_COMMIT);

    const files = [];
    for (const line of tail.split('\n')) {
      const fields = line.split('\t');
      // binary files render as `-\t-\tpath` and contribute no churn
      if (fields.length !== 3 || fields[0] === '-') continue;
      files.push({
        added: Number(fields[0]),
        deleted: Number(fields[1]),
        path: unquotePath(resolveRenamePath(fields[2])),
      });
    }
    commits.push({ sha, date, author, message, files });
  }

  rejectNulCommitObjects(
    cwd,
    commits.map(({ sha }) => sha)
  );

  return commits;
}
