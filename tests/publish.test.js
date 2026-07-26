import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { git } from '../src/git.js';
import { commitAndPush, commitMessage, COMMITTER_EMAIL, COMMITTER_NAME } from '../src/publish.js';
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

/** Second working copy of the same remote, used to race the first. */
function secondClone(remote) {
  const other = initRepo();
  run(['remote', 'add', 'origin', remote], other);
  run(['fetch', '-q', 'origin'], other);
  run(['reset', '-q', '--hard', 'origin/main'], other);
  return other;
}

describe('commitMessage', () => {
  it('carries a RAI footer and a sign-off', () => {
    const message = commitMessage(66, true);
    expect(message).toMatch(/^docs: update AI attribution badge to 66%$/m);
    expect(message).toMatch(/^Commit-generated-by: rai-commit-badge <noreply@github\.com>$/m);
    expect(message).toMatch(/^Signed-off-by: .+ <.+>$/m);
  });

  it('drops the number when nothing is attributed', () => {
    expect(commitMessage(0, false)).toMatch(/^docs: update AI attribution badge$/m);
  });

  it('keeps the subject inside 72 characters', () => {
    expect(commitMessage(100, true).split('\n')[0].length).toBeLessThanOrEqual(72);
  });
});

describe('commitAndPush', () => {
  it('commits and pushes to the current branch', () => {
    const { remote, local } = clonePair();
    writeFileSync(join(local, 'README.md'), 'badged\n');

    const result = commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) });

    expect(result).toEqual({ branch: 'main', rebased: false });
    expect(git(['log', '-1', '--format=%s', 'main'], remote)).toBe('docs: update AI attribution badge to 42%');
    expect(git(['log', '-1', '--format=%an'], local)).toBe(COMMITTER_NAME);
    expect(git(['log', '-1', '--format=%ae'], local)).toBe(COMMITTER_EMAIL);
  });

  it('rebases and retries when a concurrent run wins the race', () => {
    const { remote, local } = clonePair();
    const other = secondClone(remote);
    commit(other, { message: `feat: racer\n\nAuthored-by: ${HUMAN}\n`, files: { 'other.txt': 'x\n' } });
    run(['push', '-q', 'origin', 'main'], other);

    writeFileSync(join(local, 'README.md'), 'badged\n');
    const result = commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) });

    expect(result).toEqual({ branch: 'main', rebased: true });
    expect(git(['log', '--format=%s', 'main'], remote).split('\n')).toEqual([
      'docs: update AI attribution badge to 42%',
      'feat: racer',
      'feat: base',
    ]);
  });

  it('fails with a branch-protection hint when the push cannot land', () => {
    const { remote, local } = clonePair();
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "protected branch" >&2\nexit 1\n');
    chmodSync(hook, 0o755);

    writeFileSync(join(local, 'README.md'), 'badged\n');
    expect(() => commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) })).toThrow(
      /branch is protected/
    );
  });

  it('refuses to publish from a detached HEAD', () => {
    const { local } = clonePair();
    run(['checkout', '-q', '--detach'], local);
    writeFileSync(join(local, 'README.md'), 'badged\n');

    expect(() => commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) })).toThrow(
      /detached/
    );
  });
});
