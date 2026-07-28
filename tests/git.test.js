import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { git, isShallow, readCommits, resolveRenamePath, syncWithOrigin } from '../src/git.js';
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
