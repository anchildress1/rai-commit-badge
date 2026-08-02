import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { git } from '../src/git.js';
import {
  badgeBranchName,
  commitMessage,
  commitToBadgeBranch,
  COMMITTER_EMAIL,
  COMMITTER_NAME,
  ensurePullRequest,
} from '../src/publish.js';
import { cleanup, commit, initBareRepo, initRepo, run } from './helpers.js';

const HUMAN = 'Jane Doe <jane@example.com>';

afterAll(cleanup);

/** A clone wired to a fresh bare remote, with one commit on main. */
function clonePair() {
  const remote = initBareRepo();
  const local = initRepo();
  commit(local, { message: `feat: base\n\nAuthored-by: ${HUMAN}\n`, files: { 'README.md': 'start\n' } });
  run(['remote', 'add', 'origin', remote], local);
  run(['push', '-q', '-u', 'origin', 'main'], local);
  return { remote, local };
}

describe('commitMessage', () => {
  it('is the scored subject and nothing else', () => {
    expect(commitMessage(66, true)).toBe('docs: update AI attribution badge to 66%\n');
  });

  it('drops the number when nothing is attributed', () => {
    expect(commitMessage(0, false)).toBe('docs: update AI attribution badge\n');
  });

  it('keeps the subject inside 72 characters', () => {
    expect(commitMessage(100, true).split('\n')[0].length).toBeLessThanOrEqual(72);
  });
});

describe('badgeBranchName', () => {
  it('namespaces the branch by its base', () => {
    expect(badgeBranchName('main')).toBe('rai-badge--branches--main');
    expect(badgeBranchName('release/2.x')).toBe('rai-badge--branches--release/2.x');
  });
});

describe('commitToBadgeBranch', () => {
  it('commits to the badge branch and leaves the base untouched', () => {
    const { remote, local } = clonePair();
    const before = git(['rev-parse', 'main'], remote);
    writeFileSync(join(local, 'README.md'), 'badged\n');

    const { branch } = commitToBadgeBranch({
      cwd: local,
      path: 'README.md',
      message: commitMessage(42, true),
      base: 'main',
    });

    expect(branch).toBe('rai-badge--branches--main');
    // later steps in the job share this checkout and must not inherit the badge branch
    expect(git(['symbolic-ref', '--short', 'HEAD'], local)).toBe('main');
    expect(git(['log', '-1', '--format=%s', branch], remote)).toBe('docs: update AI attribution badge to 42%');
    expect(git(['rev-parse', 'main'], remote)).toBe(before);
    expect(git(['log', '-1', '--format=%an', branch], local)).toBe(COMMITTER_NAME);
    expect(git(['log', '-1', '--format=%ae', branch], local)).toBe(COMMITTER_EMAIL);
    // the bot identity must not outlive the commit: a later step inheriting it would
    // author commits this action then excludes from its own scoring
    expect(git(['config', '--local', 'user.name'], local)).toBe('Fixture');
    expect(git(['config', '--local', 'user.email'], local)).toBe('fixture@example.com');
  });

  it('leaves unrelated staged changes out of the badge commit', () => {
    const { remote, local } = clonePair();
    writeFileSync(join(local, 'unrelated.txt'), 'staged\n');
    run(['add', 'unrelated.txt'], local);
    writeFileSync(join(local, 'README.md'), 'badged\n');

    const { branch } = commitToBadgeBranch({
      cwd: local,
      path: 'README.md',
      message: commitMessage(42, true),
      base: 'main',
    });

    expect(git(['show', '--name-only', '--format=', branch], remote)).toBe('README.md');
    expect(git(['diff', '--cached', '--name-only'], local)).toBe('unrelated.txt');
  });

  it('replaces whatever the previous run left on the badge branch', () => {
    const { remote, local } = clonePair();
    writeFileSync(join(local, 'README.md'), 'first\n');
    const { branch } = commitToBadgeBranch({
      cwd: local,
      path: 'README.md',
      message: commitMessage(11, true),
      base: 'main',
    });
    const stale = git(['rev-parse', branch], remote);

    run(['checkout', '-q', 'main'], local);
    writeFileSync(join(local, 'README.md'), 'second\n');
    commitToBadgeBranch({ cwd: local, path: 'README.md', message: commitMessage(42, true), base: 'main' });

    expect(git(['rev-parse', branch], remote)).not.toBe(stale);
    expect(git(['log', '-1', '--format=%s', branch], remote)).toBe('docs: update AI attribution badge to 42%');
    // one commit on top of base, never a chain of stale badge commits
    expect(git(['rev-list', '--count', `main..${branch}`], remote)).toBe('1');
  });

  it('surfaces the push failure when restoring the checkout also fails', () => {
    // the finally throwing over the in-flight error would bury the half worth debugging
    const runner = (args) => {
      if (args[0] === 'ls-files') return 'tracked';
      if (args.includes('push')) throw new Error('remote rejected refs/heads/rai-badge');
      if (args[0] === 'checkout' && args[1] === 'main') throw new Error('pathspec main did not match');
      return '';
    };

    expect(() =>
      commitToBadgeBranch({ cwd: '/nowhere', path: 'README.md', message: 'm\n', base: 'main', run: runner })
    ).toThrow(/remote rejected/);
  });

  it('surfaces a checkout failure after the badge was pushed', () => {
    const runner = (args) => {
      if (args[0] === 'ls-files') return 'tracked';
      if (args[0] === 'checkout' && args[1] === 'main') throw new Error('pathspec main did not match');
      return '';
    };

    expect(() =>
      commitToBadgeBranch({ cwd: '/nowhere', path: 'README.md', message: 'm\n', base: 'main', run: runner })
    ).toThrow(/pathspec main did not match/);
  });

  it('preserves the commit failure when badge cleanup also fails', () => {
    const runner = (args) => {
      if (args[0] === 'ls-files') return 'tracked';
      if (args.includes('commit')) throw new Error('commit hook rejected badge');
      if (args[0] === 'restore') throw new Error('could not restore README');
      return '';
    };

    expect(() =>
      commitToBadgeBranch({ cwd: '/nowhere', path: 'README.md', message: 'm\n', base: 'main', run: runner })
    ).toThrow(/commit hook rejected badge/);
  });

  it('restores only the badge path when the commit fails', () => {
    const { local } = clonePair();
    writeFileSync(join(local, 'unrelated.txt'), 'staged\n');
    run(['add', 'unrelated.txt'], local);
    writeFileSync(join(local, 'README.md'), 'badged\n');
    writeFileSync(join(local, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    expect(() =>
      commitToBadgeBranch({ cwd: local, path: 'README.md', message: commitMessage(42, true), base: 'main' })
    ).toThrow();

    expect(git(['symbolic-ref', '--short', 'HEAD'], local)).toBe('main');
    expect(git(['status', '--short'], local)).toBe('A  unrelated.txt');
    expect(git(['diff', '--cached', '--name-only'], local)).toBe('unrelated.txt');
    expect(git(['diff', '--name-only'], local)).toBe('');
  });

  it('preserves an untracked badge path when the commit fails', () => {
    const local = initRepo();
    commit(local, { message: 'feat: base', files: { 'tracked.txt': 'tracked\n' } });
    writeFileSync(join(local, 'README.md'), 'original\n');
    writeFileSync(join(local, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    expect(() =>
      commitToBadgeBranch({ cwd: local, path: 'README.md', message: commitMessage(42, true), base: 'main' })
    ).toThrow();

    expect(readFileSync(join(local, 'README.md'), 'utf8')).toBe('original\n');
    expect(git(['status', '--short'], local)).toBe('?? README.md');
  });

  it('restores the base checkout even when the push fails', () => {
    const { local } = clonePair();
    writeFileSync(join(local, 'README.md'), 'badged\n');
    run(['remote', 'set-url', 'origin', '/nonexistent/remote.git'], local);

    expect(() =>
      commitToBadgeBranch({ cwd: local, path: 'README.md', message: commitMessage(42, true), base: 'main' })
    ).toThrow();
    expect(git(['symbolic-ref', '--short', 'HEAD'], local)).toBe('main');
  });
});

describe('ensurePullRequest', () => {
  const ARGS = {
    owner: 'anchildress1',
    repo: 'rai-commit-badge',
    base: 'main',
    branch: 'rai-badge--branches--main',
    title: 'docs: update AI attribution badge to 42%',
    token: 'ghs_fake',
  };

  /** Fake fetch that records calls and replies with canned bodies. */
  function fakeFetch(bodies) {
    const calls = [];
    const impl = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body, headers: init.headers });
      const next = bodies.shift();
      return { ok: next.ok ?? true, status: next.status ?? 200, text: async () => JSON.stringify(next.body ?? null) };
    };
    impl.calls = calls;
    return impl;
  }

  it('reuses a pull request that is already open', async () => {
    const fetchImpl = fakeFetch([{ body: [{ number: 4, title: ARGS.title }] }]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).resolves.toBe(4);
    expect(fetchImpl.calls).toHaveLength(1);
    const query = new URL(fetchImpl.calls[0].url).searchParams;
    expect(query.get('head')).toBe('anchildress1:rai-badge--branches--main');
    expect(query.get('base')).toBe('main');
  });

  it('retitles an open pull request left on a stale score', async () => {
    const fetchImpl = fakeFetch([
      { body: [{ number: 4, title: 'docs: update AI attribution badge to 11%' }] },
      { body: { number: 4 } },
    ]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).resolves.toBe(4);
    expect(fetchImpl.calls[1].method).toBe('PATCH');
    expect(fetchImpl.calls[1].url).toMatch(/\/pulls\/4$/);
    expect(JSON.parse(fetchImpl.calls[1].body)).toEqual({ title: ARGS.title });
  });

  it('names the pushed branch when the create call returns no body', async () => {
    // the push has already landed by this point, so dying on a property of null
    // would hide which half of the publish succeeded
    const fetchImpl = fakeFetch([{ body: [] }, { status: 204, body: null }]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).rejects.toThrow(/branch is pushed/);
  });

  it('opens one when none is open', async () => {
    const fetchImpl = fakeFetch([{ body: [] }, { body: { number: 9 } }]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).resolves.toBe(9);
    expect(fetchImpl.calls[1].method).toBe('POST');
    expect(JSON.parse(fetchImpl.calls[1].body)).toMatchObject({
      base: 'main',
      head: 'rai-badge--branches--main',
      title: ARGS.title,
    });
  });

  it('carries the bearer token on every call', async () => {
    const fetchImpl = fakeFetch([{ body: [] }, { body: { number: 9 } }]);

    await ensurePullRequest({ ...ARGS, fetchImpl });

    for (const call of fetchImpl.calls) {
      expect(call.headers.authorization).toBe('Bearer ghs_fake');
    }
  });

  it('honours a GitHub Enterprise api root', async () => {
    const fetchImpl = fakeFetch([{ body: [] }, { body: { number: 9 } }]);

    await ensurePullRequest({ ...ARGS, apiUrl: 'https://ghe.example.com/api/v3', fetchImpl });

    for (const call of fetchImpl.calls) {
      expect(call.url.startsWith('https://ghe.example.com/api/v3/')).toBe(true);
    }
  });

  it('surfaces the status and body of a failed call', async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 403, body: { message: 'Resource not accessible' } }]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).rejects.toThrow(/403.*Resource not accessible/);
  });
});
