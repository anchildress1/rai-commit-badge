import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as core from '@actions/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { git } from '../src/git.js';
import { END_MARKER, START_MARKER } from '../src/render.js';
import { readInputs, run } from '../src/run.js';
import { cleanup, commit, initBareRepo, initRepo, run as gitRun } from './helpers.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';
const README = `# Fixture\n\n${START_MARKER}\n${END_MARKER}\n`;

// core.summary memoises the resolved path on first write, so every test in this
// file has to share one file and truncate it rather than take a fresh temp path.
let summaryPath;

beforeAll(() => {
  summaryPath = join(mkdtempSync(join(tmpdir(), 'rai-badge-summary-')), 'summary.md');
});

beforeEach(() => {
  writeFileSync(summaryPath, '');
  process.env.GITHUB_STEP_SUMMARY = summaryPath;
  process.env.GITHUB_REPOSITORY = 'anchildress1/rai-commit-badge';
  core.summary.emptyBuffer();
});

afterEach(() => {
  for (const key of [
    'INPUT_SINCE',
    'INPUT_README',
    'INPUT_STYLE',
    'GITHUB_STEP_SUMMARY',
    'GITHUB_WORKSPACE',
    'GITHUB_REPOSITORY',
  ]) {
    delete process.env[key];
  }
});

/** Fake fetch standing in for the pull request API: none open, then created. */
function fakeFetch(number = 7) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method });
    const body = method === 'POST' ? { number } : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  impl.calls = calls;
  return impl;
}

const BADGE_BRANCH = 'rai-badge--branches--main';

afterAll(cleanup);

const summary = () => readFileSync(summaryPath, 'utf8');

/** Fixture repo wired to a bare remote, holding a README with markers. */
function repoWithRemote(readme = README) {
  const remote = initBareRepo();
  const local = initRepo();
  commit(local, {
    message: `feat: generated\n\nGenerated-by: ${AI}\n`,
    files: { 'README.md': readme, 'src/a.js': 'a\n'.repeat(90) },
    date: '2026-01-01T12:00:00 +0000',
  });
  commit(local, {
    message: `feat: human\n\nAuthored-by: ${HUMAN}\n`,
    files: { 'src/b.js': 'b\n'.repeat(10) },
    date: '2026-01-02T12:00:00 +0000',
  });
  gitRun(['remote', 'add', 'origin', remote], local);
  gitRun(['push', '-q', '-u', 'origin', 'main'], local);
  return { remote, local };
}

describe('readInputs', () => {
  it('defaults every input', () => {
    expect(readInputs()).toEqual({ since: undefined, readme: 'README.md', style: 'flat', token: '' });
  });

  it('rejects an unknown style', () => {
    process.env.INPUT_STYLE = 'neon';
    expect(() => readInputs()).toThrow(/Unknown style "neon"/);
  });

  it('rejects a malformed since', () => {
    process.env.INPUT_SINCE = 'March 2026';
    expect(() => readInputs()).toThrow(/YYYY-MM-DD/);
  });

  it.each(['2026-99-99', '2026-02-30', '2026-13-01', '2026-00-10'])('rejects the impossible date %s', (since) => {
    process.env.INPUT_SINCE = since;
    expect(() => readInputs()).toThrow(/real calendar date/);
  });

  it('accepts a leap day that exists', () => {
    process.env.INPUT_SINCE = '2024-02-29';
    expect(readInputs().since).toBe('2024-02-29');
  });

  it('accepts a well-formed since', () => {
    process.env.INPUT_SINCE = '2026-01-02';
    expect(readInputs().since).toBe('2026-01-02');
  });
});

describe('run', () => {
  it('writes the badge onto a branch and opens a pull request', async () => {
    const { remote, local } = repoWithRemote();
    const base = git(['rev-parse', 'main'], remote);
    const fetchImpl = fakeFetch(7);

    const result = await run({ cwd: local, fetchImpl });

    expect(result.displayed).toBe(81);
    const content = readFileSync(join(local, 'README.md'), 'utf8');
    expect(content).toContain('https://img.shields.io/badge/AI%20attribution-81%25%20since%202026--01-C03070');
    expect(git(['log', '-1', '--format=%s', BADGE_BRANCH], remote)).toBe('docs: update AI attribution badge to 81%');
    // the base never takes a direct push, so its checks stay in charge
    expect(git(['rev-parse', 'main'], remote)).toBe(base);
    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['GET', 'POST']);
    expect(summary()).toContain('| Scored churn | 104 lines |');
    expect(summary()).toContain('pull request #7');
  });

  it('skips the commit when the badge is byte-identical', async () => {
    const { remote, local } = repoWithRemote();
    await run({ cwd: local, fetchImpl: fakeFetch() });
    const head = git(['rev-parse', BADGE_BRANCH], remote);

    core.summary.emptyBuffer();
    const fetchImpl = fakeFetch();
    await run({ cwd: local, fetchImpl });

    expect(git(['rev-parse', BADGE_BRANCH], remote)).toBe(head);
    expect(fetchImpl.calls).toHaveLength(0);
    expect(summary()).toContain('| Badge | unchanged |');
  });

  it('fails when the repository is unknown', async () => {
    const { local } = repoWithRemote();
    delete process.env.GITHUB_REPOSITORY;

    await expect(run({ cwd: local, fetchImpl: fakeFetch() })).rejects.toThrow(/GITHUB_REPOSITORY/);
  });

  it('prints the snippet when the file has no markers', async () => {
    const { local } = repoWithRemote('# Fixture\n\nNo markers here.\n');

    await run({ cwd: local });

    expect(summary()).toContain('### No markers in `README.md`');
    expect(summary()).toContain(START_MARKER);
    expect(git(['log', '-1', '--format=%s'], local)).toBe('feat: human');
  });

  it('badges no attribution when the history has no footers', async () => {
    const remote = initBareRepo();
    const local = initRepo();
    commit(local, { message: 'feat: nothing', files: { 'README.md': README, 'src/a.js': 'a\n' } });
    gitRun(['remote', 'add', 'origin', remote], local);
    gitRun(['push', '-q', '-u', 'origin', 'main'], local);

    await run({ cwd: local, fetchImpl: fakeFetch() });

    expect(readFileSync(join(local, 'README.md'), 'utf8')).toContain(
      'AI%20attribution-no%20attribution-9F9F9F?style=flat'
    );
    expect(summary()).toContain('no attribution — no RAI footer found');
  });

  it('honours since, readme, and style', async () => {
    const { local } = repoWithRemote();
    writeFileSync(join(local, 'BADGE.md'), README);
    process.env.INPUT_README = 'BADGE.md';
    process.env.INPUT_STYLE = 'for-the-badge';
    process.env.INPUT_SINCE = '2026-01-02';

    await run({ cwd: local, fetchImpl: fakeFetch() });

    const content = readFileSync(join(local, 'BADGE.md'), 'utf8');
    expect(content).toContain('0%25%20since%202026--01-0875AE?style=for-the-badge');
    expect(summary()).toContain('| Window start | 2026-01-02');
  });

  it('fails on a shallow clone', async () => {
    const { remote } = repoWithRemote();
    const shallow = join(mkdtempSync(join(tmpdir(), 'rai-badge-shallow-')), 'clone');
    gitRun(['clone', '-q', '--depth', '1', `file://${remote}`, shallow], tmpdir());

    await expect(run({ cwd: shallow })).rejects.toThrow(/Shallow clone/);
  });

  it('warns when the target file is missing', async () => {
    const { local } = repoWithRemote();
    process.env.INPUT_README = 'MISSING.md';

    await run({ cwd: local });

    expect(summary()).toContain('### No markers in `MISSING.md`');
  });
});
