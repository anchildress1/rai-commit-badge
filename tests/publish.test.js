import { writeFileSync } from 'node:fs';
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

    const { base, branch } = commitToBadgeBranch({
      cwd: local,
      readme: 'README.md',
      message: commitMessage(42, true),
      base: 'main',
    });

    expect(base).toBe('main');
    expect(branch).toBe('rai-badge--branches--main');
    expect(git(['log', '-1', '--format=%s', branch], remote)).toBe('docs: update AI attribution badge to 42%');
    expect(git(['rev-parse', 'main'], remote)).toBe(before);
    expect(git(['log', '-1', '--format=%an'], local)).toBe(COMMITTER_NAME);
    expect(git(['log', '-1', '--format=%ae'], local)).toBe(COMMITTER_EMAIL);
  });

  it('leaves unrelated staged changes out of the badge commit', () => {
    const { remote, local } = clonePair();
    writeFileSync(join(local, 'unrelated.txt'), 'staged\n');
    run(['add', 'unrelated.txt'], local);
    writeFileSync(join(local, 'README.md'), 'badged\n');

    const { branch } = commitToBadgeBranch({
      cwd: local,
      readme: 'README.md',
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
      readme: 'README.md',
      message: commitMessage(11, true),
      base: 'main',
    });
    const stale = git(['rev-parse', branch], remote);

    run(['checkout', '-q', 'main'], local);
    writeFileSync(join(local, 'README.md'), 'second\n');
    commitToBadgeBranch({ cwd: local, readme: 'README.md', message: commitMessage(42, true), base: 'main' });

    expect(git(['rev-parse', branch], remote)).not.toBe(stale);
    expect(git(['log', '-1', '--format=%s', branch], remote)).toBe('docs: update AI attribution badge to 42%');
    // one commit on top of base, never a chain of stale badge commits
    expect(git(['rev-list', '--count', `main..${branch}`], remote)).toBe('1');
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
      calls.push({ url, method: init.method ?? 'GET', body: init.body });
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

  it('surfaces the status and body of a failed call', async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 403, body: { message: 'Resource not accessible' } }]);

    await expect(ensurePullRequest({ ...ARGS, fetchImpl })).rejects.toThrow(/403.*Resource not accessible/);
  });
});
