import { writeFileSync } from 'node:fs';
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

    const branch = commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) });

    expect(branch).toBe('main');
    expect(git(['log', '-1', '--format=%s', 'main'], remote)).toBe('docs: update AI attribution badge to 42%');
    expect(git(['log', '-1', '--format=%an'], local)).toBe(COMMITTER_NAME);
    expect(git(['log', '-1', '--format=%ae'], local)).toBe(COMMITTER_EMAIL);
  });

  it('leaves unrelated staged changes out of the badge commit', () => {
    const { remote, local } = clonePair();
    writeFileSync(join(local, 'unrelated.txt'), 'staged\n');
    run(['add', 'unrelated.txt'], local);
    writeFileSync(join(local, 'README.md'), 'badged\n');

    commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) });

    expect(git(['show', '--name-only', '--format=', 'HEAD'], remote)).toBe('README.md');
    expect(git(['diff', '--cached', '--name-only'], local)).toBe('unrelated.txt');
  });

  it('surfaces a rejected push', () => {
    const { remote, local } = clonePair();
    const other = initRepo();
    run(['remote', 'add', 'origin', remote], other);
    run(['fetch', '-q', 'origin'], other);
    run(['reset', '-q', '--hard', 'origin/main'], other);
    commit(other, { message: `feat: racer\n\nAuthored-by: ${HUMAN}\n`, files: { 'other.txt': 'x\n' } });
    run(['push', '-q', 'origin', 'main'], other);

    writeFileSync(join(local, 'README.md'), 'badged\n');
    expect(() => commitAndPush({ cwd: local, readme: 'README.md', message: commitMessage(42, true) })).toThrow();
  });
});
