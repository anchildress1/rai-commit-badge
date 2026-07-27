import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Fixture repos must ignore the developer's global config — a global
// commit.gpgsign or a commit-msg hook would fail every fixture commit.
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

const created = [];

export function run(args, cwd, env = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...ENV, ...env } }).trim();
}

export function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rai-badge-'));
  created.push(dir);
  run(['init', '-q', '-b', 'main'], dir);
  run(['config', 'user.name', 'Fixture'], dir);
  run(['config', 'user.email', 'fixture@example.com'], dir);
  run(['config', 'commit.gpgsign', 'false'], dir);
  return dir;
}

export function initBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rai-badge-remote-'));
  created.push(dir);
  run(['init', '-q', '--bare', '-b', 'main'], dir);
  return dir;
}

/**
 * Write files and commit them.
 *
 * @param {string} dir repository directory
 * @param {{message: string, files?: Record<string, string|Buffer>, date?: string}} params
 */
export function commit(dir, { message, files = {}, date = '2026-01-01T12:00:00 +0000' }) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  run(['add', '-A'], dir);
  run(['commit', '-q', '--no-verify', '--cleanup=verbatim', '-m', message], dir, {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

export function cleanup() {
  while (created.length) rmSync(created.pop(), { recursive: true, force: true });
}
