import { describe, expect, it } from 'vitest';
import { score } from '../src/score.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';

const commit = (date, message, files, author = HUMAN) => ({ sha: date, date, author, message, files });
const src = (lines, path = 'src/index.js') => [{ added: lines, deleted: 0, path }];

describe('score', () => {
  it('weights each commit by churn', () => {
    const result = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(90)),
      commit('2026-01-02', `feat: b\n\nAuthored-by: ${HUMAN}`, src(10)),
    ]);
    expect(result.percent).toBeCloseTo((0.9 * 90 * 100) / 100, 6);
    expect(result.displayed).toBe(81);
  });

  it('opens the window at the earliest attributed commit', () => {
    const result = score([
      commit('2025-01-01', 'chore: pre-adoption', src(1000)),
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(100)),
    ]);
    expect(result.windowStart).toBe('2026-01-01');
    expect(result.churn).toBe(100);
    expect(result.commits).toBe(2);
    expect(result.windowCommits).toBe(1);
  });

  it('keeps unattributed commits inside the window in the denominator', () => {
    const result = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(50)),
      commit('2026-01-02', 'chore: no footer', src(50)),
    ]);
    expect(result.percent).toBeCloseTo(45, 6);
    expect(result.attributedCommits).toBe(1);
  });

  it('lets since override auto-detection', () => {
    const result = score(
      [
        commit('2025-01-01', `feat: stray\n\nGenerated-by: ${AI}`, src(1000)),
        commit('2026-01-01', `feat: a\n\nAssisted-by: ${AI}`, src(100)),
      ],
      { since: '2026-01-01' }
    );
    expect(result.windowStart).toBe('2026-01-01');
    expect(result.percent).toBeCloseTo(25, 6);
  });

  it('reports no attribution when nothing is footered', () => {
    const result = score([commit('2026-01-01', 'chore: nothing', src(100))]);
    expect(result.attributed).toBe(false);
    expect(result.windowStart).toBeNull();
    expect(result.displayed).toBe(0);
  });

  it('scores zero when since is set but nothing is footered', () => {
    const result = score([commit('2026-01-01', 'chore: nothing', src(100))], { since: '2026-01-01' });
    expect(result.attributed).toBe(true);
    expect(result.percent).toBe(0);
  });

  it('drops excluded paths from both sides of the ratio', () => {
    const withLock = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(10)),
      commit('2026-01-02', 'chore: lockfile churn', src(9990, 'package-lock.json')),
    ]);
    expect(withLock.churn).toBe(10);
    expect(withLock.percent).toBeCloseTo(90, 6);
  });

  it('scores a commit that only touches excluded paths out of existence', () => {
    const result = score([
      commit('2026-01-01', `feat: a\n\nAssisted-by: ${AI}`, src(100)),
      commit('2026-01-02', `chore: bump\n\nGenerated-by: ${AI}`, src(100, 'package-lock.json')),
    ]);
    expect(result.percent).toBeCloseTo(25, 6);
  });

  it('drops footerless bot-authored commits from both sides of the ratio', () => {
    const BOT = 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>';
    const result = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(10)),
      commit('2026-01-02', 'docs: update AI attribution badge to 42%', src(500), BOT),
    ]);
    expect(result.botCommits).toBe(1);
    expect(result.commits).toBe(1);
    expect(result.churn).toBe(10);
    expect(result.displayed).toBe(90);
  });

  it('reports no attribution when only bot commits exist', () => {
    const BOT = 'release-please[bot] <example@example.com>';
    const result = score([commit('2026-01-01', 'chore: release main', src(100), BOT)]);
    expect(result.attributed).toBe(false);
    expect(result.botCommits).toBe(1);
    expect(result.commits).toBe(0);
  });

  it('scores a bot-authored commit that carries a footer', () => {
    // a squash merge lands under the merge bot but holds the attribution of the
    // branch it squashed, so dropping it would erase real AI churn
    const BOT = 'mergify[bot] <37929162+mergify[bot]@users.noreply.github.com>';
    const result = score([commit('2026-01-01', `feat: squashed\n\nGenerated-by: ${AI}`, src(100), BOT)]);

    expect(result.botCommits).toBe(0);
    expect(result.commits).toBe(1);
    expect(result.attributedCommits).toBe(1);
    expect(result.displayed).toBe(90);
  });

  it('drops the footerless bot commit while keeping the footered one', () => {
    const BOT = 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>';
    const result = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(50), BOT),
      commit('2026-01-02', 'docs: update AI attribution badge to 42%', src(500), BOT),
    ]);

    expect(result.botCommits).toBe(1);
    expect(result.churn).toBe(50);
    expect(result.displayed).toBe(90);
  });

  it('counts squashed commits', () => {
    const squashed = `* a\n\nGenerated-by: ${AI}\n\n* b\n\nAssisted-by: ${AI}`;
    expect(score([commit('2026-01-01', squashed, src(10))]).squashedCommits).toBe(1);
  });

  it('counts a squash whose sub-commits are not all attributed', () => {
    // counted off attributed paragraphs, this reported zero squashes while
    // averaging one commit's footer across three commits' churn
    const squashed = `* a\n\nGenerated-by: ${AI}\n\n* b\n\n* c`;
    expect(score([commit('2026-01-01', squashed, src(10))]).squashedCommits).toBe(1);
  });

  it('does not count a plain commit whose trailers span two paragraphs', () => {
    const message = `feat: one commit\n\nGenerated-by: ${AI}\n\nAssisted-by: ${AI}`;
    const result = score([commit('2026-01-01', message, src(10))]);

    expect(result.squashedCommits).toBe(0);
    expect(result.displayed).toBe(90);
  });

  it('tops out at 90% because Generated-by is the heaviest footer', () => {
    const result = score([commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(100))]);
    expect(result.displayed).toBe(90);
  });

  it('reports no attribution when an attributed commit has no countable churn', () => {
    const result = score([commit('2026-01-01', `docs: a\n\nGenerated-by: ${AI}`, [])]);
    // the footer is present, so the badge must not claim a measured 0%
    expect(result.attributed).toBe(false);
    expect(result.attributedCommits).toBe(1);
    expect(result.churn).toBe(0);
  });

  it('reports no attribution when since lands past the last commit', () => {
    const result = score([commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(10))], { since: '2030-01-01' });
    expect(result.attributed).toBe(false);
    expect(result.displayed).toBe(0);
    expect(result.windowCommits).toBe(0);
  });

  it('reports no attribution when every windowed file is excluded', () => {
    const lockfile = [{ added: 900, deleted: 900, path: 'package-lock.json' }];
    const result = score([commit('2026-01-01', `chore: deps\n\nGenerated-by: ${AI}`, lockfile)]);
    expect(result.attributed).toBe(false);
    expect(result.churn).toBe(0);
  });

  it('reports no attribution for an empty history, with and without since', () => {
    expect(score([]).attributed).toBe(false);
    expect(score([], { since: '2026-01-01' }).attributed).toBe(false);
    expect(score([], { since: '2026-01-01' }).windowCommits).toBe(0);
  });

  it('rounds to the displayed integer at the band boundary', () => {
    // 66.6% raw sits in the shared band, but the badge prints 67 and must read AI-led
    const result = score([
      commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(74)),
      commit('2026-01-02', 'chore: none', src(26)),
    ]);
    expect(result.percent).toBeCloseTo(66.6, 6);
    expect(result.displayed).toBe(67);
  });
});
