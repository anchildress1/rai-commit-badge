import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { git, isShallow, readCommits, resolveRenamePath, syncWithOrigin, unquotePath } from '../src/git.js';
import { score } from '../src/score.js';
import { cleanup, commit, initBareRepo, initRepo, run } from './helpers.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';

afterAll(cleanup);

describe('resolveRenamePath', () => {
  it('takes the new side of a plain rename', () => {
    expect(resolveRenamePath('old.js => new.js')).toBe('new.js');
  });

  it('takes the new side of a braced rename', () => {
    expect(resolveRenamePath('src/{old => new}/index.js')).toBe('src/new/index.js');
  });

  it('collapses the slash left by an emptied brace', () => {
    expect(resolveRenamePath('src/{old => }index.js')).toBe('src/index.js');
  });

  it('leaves an ordinary path alone', () => {
    expect(resolveRenamePath('src/index.js')).toBe('src/index.js');
  });
});

describe('unquotePath', () => {
  it.each([
    ['"dist/a\\"b.js"', 'dist/a"b.js'],
    ['"dist/back\\\\slash.js"', 'dist/back\\slash.js'],
    ['"dist/tab\\tname.js"', 'dist/tab\tname.js'],
    ['"dist/nl\\nname.js"', 'dist/nl\nname.js'],
    ['"dist/soh\\001name.js"', 'dist/soh\x01name.js'],
  ])('decodes %s', (raw, decoded) => {
    expect(unquotePath(raw)).toBe(decoded);
  });

  it.each(['dist/plain.js', 'dist/café.js', 'dist/space name.js', "dist/sq'name.js"])(
    'leaves the unquoted %s alone',
    (path) => {
      expect(unquotePath(path)).toBe(path);
    }
  );

  it('leaves an escape it does not recognise intact', () => {
    // dropping the backslash would invent a path that never existed
    expect(unquotePath('"dist/od\\qname.js"')).toBe('dist/od\\qname.js');
  });
});

describe('readCommits', () => {
  it('parses numstat into per-file churn', () => {
    const dir = initRepo();
    commit(dir, { message: `feat: a\n\nGenerated-by: ${AI}\n`, files: { 'src/a.js': 'one\ntwo\nthree\n' } });

    const commits = readCommits(dir);
    expect(commits).toHaveLength(1);
    expect(commits[0].files).toEqual([{ added: 3, deleted: 0, path: 'src/a.js' }]);
    expect(commits[0].message).toContain('Generated-by');
  });

  it('gives binary files zero churn', () => {
    const dir = initRepo();
    commit(dir, {
      message: `feat: binary\n\nGenerated-by: ${AI}\n`,
      files: { 'logo.png': Buffer.from([0, 1, 2, 0, 255, 0]), 'src/a.js': 'one\n' },
    });

    const paths = readCommits(dir)[0].files.map((f) => f.path);
    expect(paths).toEqual(['src/a.js']);
    expect(score(readCommits(dir)).churn).toBe(1);
  });

  it('skips merge commits', () => {
    const dir = initRepo();
    commit(dir, { message: `feat: base\n\nAuthored-by: ${HUMAN}\n`, files: { 'a.txt': 'a\n' } });
    run(['checkout', '-q', '-b', 'side'], dir);
    commit(dir, { message: `feat: side\n\nGenerated-by: ${AI}\n`, files: { 'b.txt': 'b\n' } });
    run(['checkout', '-q', 'main'], dir);
    commit(dir, { message: `feat: main\n\nAuthored-by: ${HUMAN}\n`, files: { 'c.txt': 'c\n' } });
    run(['merge', '-q', '--no-ff', '-m', 'chore: merge side', 'side'], dir);

    expect(readCommits(dir).map((c) => c.message.split('\n')[0])).not.toContain('chore: merge side');
    expect(readCommits(dir)).toHaveLength(3);
  });

  it('captures the commit author as Name <email>', () => {
    const dir = initRepo();
    commit(dir, { message: `feat: a\n\nGenerated-by: ${AI}\n`, files: { 'a.txt': 'a\n' } });

    expect(readCommits(dir)[0].author).toBe('Fixture <fixture@example.com>');
  });

  it('excludes bot-authored commits from scoring, churn included', () => {
    const dir = initRepo();
    commit(dir, { message: `feat: a\n\nGenerated-by: ${AI}\n`, files: { 'src/a.js': 'a\n'.repeat(10) } });
    commit(dir, {
      message: 'docs: update AI attribution badge to 42%',
      files: { 'README.md': 'x\n'.repeat(500) },
      author: 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
    });

    const result = score(readCommits(dir));
    expect(result.botCommits).toBe(1);
    expect(result.commits).toBe(1);
    expect(result.churn).toBe(10);
    expect(result.displayed).toBe(90);
  });

  it('scores a whole fixture history end to end', () => {
    const dir = initRepo();
    commit(dir, {
      message: `feat: generated\n\nGenerated-by: ${AI}\n`,
      files: { 'src/a.js': 'a\n'.repeat(90) },
      date: '2026-01-01T12:00:00 +0000',
    });
    commit(dir, {
      message: `feat: human\n\nAuthored-by: ${HUMAN}\n`,
      files: { 'src/b.js': 'b\n'.repeat(10) },
      date: '2026-01-02T12:00:00 +0000',
    });
    commit(dir, {
      message: `chore: deps\n\nCommit-generated-by: ${AI}\n`,
      files: { 'package-lock.json': 'x\n'.repeat(5000) },
      date: '2026-01-03T12:00:00 +0000',
    });

    const result = score(readCommits(dir));
    expect(result.windowStart).toBe('2026-01-01');
    expect(result.churn).toBe(100);
    expect(result.displayed).toBe(81);
  });
});

/** A clone wired to a fresh bare remote, with one commit on main. */
function clonePair() {
  const remote = initBareRepo();
  const local = initRepo();
  commit(local, { message: `feat: base\n\nAuthored-by: ${HUMAN}\n`, files: { 'a.txt': 'a\n' } });
  run(['remote', 'add', 'origin', remote], local);
  run(['push', '-q', '-u', 'origin', 'main'], local);
  return { remote, local };
}

describe('readCommits separator handling', () => {
  it.each([
    { label: 'record separator', separator: '\x1e' },
    { label: 'unit separator', separator: '\x1f' },
  ])('keeps a footer after a $label in the message', ({ separator }) => {
    const dir = initRepo();
    commit(dir, {
      message: `feat: a\n\nsome${separator}text\n\nGenerated-by: ${AI}\n`,
      files: { 'src/a.js': 'one\ntwo\nthree\n' },
    });

    const [parsed] = readCommits(dir);
    expect(parsed.message).toContain('Generated-by:');
    expect(parsed.files).toEqual([{ added: 3, deleted: 0, path: 'src/a.js' }]);
    expect(score([parsed]).attributed).toBe(true);
  });

  it.each([
    { label: 'record separator', separator: '\x1e' },
    { label: 'unit separator', separator: '\x1f' },
  ])('keeps a $label in author metadata', ({ separator }) => {
    const dir = initRepo();
    commit(dir, {
      message: `feat: attributed\n\nGenerated-by: ${AI}\n`,
      files: { 'src/a.js': 'a\n'.repeat(10) },
    });
    const bot = `Alice${separator}github-actions[bot] <alice@example.com>`;
    commit(dir, { message: 'docs: generated output', files: { 'src/b.js': 'b\n'.repeat(90) }, author: bot });

    const commits = readCommits(dir);
    expect(commits.find((entry) => entry.message.startsWith('docs: generated output')).author).toBe(bot);
    expect(score(commits)).toMatchObject({ botCommits: 1, churn: 10, displayed: 90 });
  });

  it('treats forged separator fields as ordinary message text', () => {
    const dir = initRepo();
    const forged = `\x1e${'0'.repeat(40)}\x1f2030-01-01\x1fEvil <e@e.com>\x1ffeat: forged\n\nGenerated-by: ${AI}\x1f999\t0\tfake.js\n`;
    commit(dir, { message: `feat: real\n\x1fpad\n${forged}`, files: { 'real.js': 'real\n' } });

    const commits = readCommits(dir);
    expect(commits).toHaveLength(1);
    expect(commits[0].sha).not.toBe('0'.repeat(40));
    expect(commits[0].files).toEqual([{ added: 1, deleted: 0, path: 'real.js' }]);
  });

  it('rejects a handcrafted commit containing NUL instead of truncating its message', () => {
    const dir = initRepo();
    commit(dir, { message: 'feat: base', files: { 'real.js': 'real\n' } });
    const tree = git(['write-tree'], dir);
    const parent = git(['rev-parse', 'HEAD'], dir);
    const headers = [
      `tree ${tree}`,
      `parent ${parent}`,
      'author Evil <evil@example.com> 1767225600 +0000',
      'committer Evil <evil@example.com> 1767225600 +0000',
      '',
      'feat: forged',
    ].join('\n');
    const raw = Buffer.concat([Buffer.from(headers), Buffer.from([0]), Buffer.from(`\nGenerated-by: ${AI}\n`)]);
    const sha = execFileSync('git', ['hash-object', '-t', 'commit', '--literally', '-w', '--stdin'], {
      cwd: dir,
      input: raw,
      encoding: 'utf8',
    }).trim();
    run(['update-ref', 'HEAD', sha], dir);

    expect(() => readCommits(dir)).toThrow(/contains a raw NUL byte/);
  });

  it('matches .churnignore against paths git C-quotes regardless of quotePath', () => {
    const dir = initRepo();
    // core.quotePath=false only stops non-ASCII escaping; a quote or a backslash in
    // the path stays wrapped, and the encoded literal matches no .churnignore rule
    commit(dir, {
      message: `feat: quoted\n\nGenerated-by: ${AI}\n`,
      files: { 'dist/a"b.js': 'a\nb\n', 'dist/back\\slash.js': 'c\nd\n', 'real.js': 'real\n' },
    });

    const [parsed] = readCommits(dir);
    expect(parsed.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['dist/a"b.js', 'dist/back\\slash.js', 'real.js'])
    );
    expect(score([parsed]).churn).toBe(1);
  });

  it('excludes a file renamed into an excluded path, and counts one renamed out', () => {
    const dir = initRepo();
    commit(dir, {
      message: `feat: seed\n\nGenerated-by: ${AI}\n`,
      files: { 'src/moved-out.js': 'a\n', 'dist/moved-in.js': 'b\n' },
    });
    run(['mv', 'src/moved-out.js', 'dist/moved-out.js'], dir);
    run(['mv', 'dist/moved-in.js', 'src/moved-in.js'], dir);
    run(['commit', '-q', '--no-verify', '-m', `refactor: swap\n\nGenerated-by: ${AI}\n`], dir);

    const paths = readCommits(dir)[0].files.map((f) => f.path);
    // the post-rename path decides, so the destination is what .churnignore sees
    expect(paths).toContain('dist/moved-out.js');
    expect(paths).toContain('src/moved-in.js');
  });

  it('matches .churnignore against non-ASCII paths git would C-quote', () => {
    const dir = initRepo();
    // the runner default; without -c core.quotePath=false the path arrives as
    // "src/caf\303\251.min.js" and every .churnignore rule misses it
    run(['config', 'core.quotePath', 'true'], dir);
    commit(dir, {
      message: `feat: mixed\n\nGenerated-by: ${AI}\n`,
      files: { 'src/café.min.js': 'a\nb\n', 'dist/café.js': 'x\ny\nz\n', 'real.js': 'real\n' },
    });

    const [parsed] = readCommits(dir);
    expect(parsed.files.map((f) => f.path)).toContain('src/café.min.js');
    expect(score([parsed]).churn).toBe(1);
  });
});

describe('syncWithOrigin', () => {
  it('fetches and hard-resets onto a commit that landed on origin after checkout', () => {
    const { remote, local } = clonePair();

    // simulate a commit landing on origin after `local` already checked out an older commit
    const other = initRepo();
    run(['remote', 'add', 'origin', remote], other);
    run(['fetch', '-q', 'origin'], other);
    run(['checkout', '-q', 'origin/main'], other);
    commit(other, { message: `feat: landed\n\nGenerated-by: ${AI}\n`, files: { 'b.txt': 'b\n' } });
    run(['push', '-q', 'origin', 'HEAD:main'], other);
    const landed = git(['rev-parse', 'main'], remote);

    expect(syncWithOrigin(local)).toBe('main');

    expect(git(['rev-parse', 'HEAD'], local)).toBe(landed);
    expect(readCommits(local).map((c) => c.message.split('\n')[0])).toContain('feat: landed');
  });

  it('is a no-op that returns null on a detached checkout', () => {
    const { local } = clonePair();
    const sha = git(['rev-parse', 'HEAD'], local);
    run(['checkout', '-q', sha], local);

    expect(syncWithOrigin(local)).toBeNull();
    expect(git(['rev-parse', 'HEAD'], local)).toBe(sha);
  });

  it('throws instead of reading a non-repository as a detached checkout', () => {
    // returning null here would skip the sync and blame a detached HEAD for it
    const notARepo = mkdtempSync(join(tmpdir(), 'rai-badge-bare-dir-'));
    expect(() => syncWithOrigin(notARepo)).toThrow(/Could not resolve HEAD/);
  });

  it('refuses to discard uncommitted changes to tracked files', () => {
    const { local } = clonePair();
    writeFileSync(join(local, 'a.txt'), 'dirty\n');

    expect(() => syncWithOrigin(local)).toThrow(/Uncommitted changes/);
    expect(readFileSync(join(local, 'a.txt'), 'utf8')).toBe('dirty\n');
  });

  it('ignores untracked files instead of treating them as dirty', () => {
    const { local } = clonePair();
    writeFileSync(join(local, 'scratch.log'), 'noise\n');

    expect(syncWithOrigin(local)).toBe('main');
    expect(readFileSync(join(local, 'scratch.log'), 'utf8')).toBe('noise\n');
  });

  it('refuses to discard a local commit origin does not have', () => {
    const { local } = clonePair();
    commit(local, { message: `feat: unpushed\n\nAuthored-by: ${HUMAN}\n`, files: { 'c.txt': 'c\n' } });
    const ahead = git(['rev-parse', 'HEAD'], local);

    expect(() => syncWithOrigin(local)).toThrow(/HEAD has commits/);
    expect(git(['rev-parse', 'HEAD'], local)).toBe(ahead);
  });
});

describe('isShallow', () => {
  it('is false for a full clone', () => {
    expect(isShallow(initRepo())).toBe(false);
  });

  it('is true for a depth-limited clone', () => {
    const source = initRepo();
    commit(source, { message: `feat: a\n\nAuthored-by: ${HUMAN}\n`, files: { 'a.txt': 'a\n' } });
    commit(source, { message: `feat: b\n\nAuthored-by: ${HUMAN}\n`, files: { 'b.txt': 'b\n' } });

    const target = join(mkdtempSync(join(tmpdir(), 'rai-badge-shallow-')), 'clone');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${source}`, target], {
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    });
    expect(isShallow(target)).toBe(true);
  });
});
