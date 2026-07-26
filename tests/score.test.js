import { describe, expect, it } from 'vitest';
import { score } from '../src/score.js';

const AI = 'Claude Opus 5 <noreply@anthropic.com>';
const HUMAN = 'Jane Doe <jane@example.com>';

const commit = (date, message, files) => ({ sha: date, date, message, files });
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
    expect(withLock.excludedChurn).toBe(9990);
    expect(withLock.percent).toBeCloseTo(90, 6);
  });

  it('scores a commit that only touches excluded paths out of existence', () => {
    const result = score([
      commit('2026-01-01', `feat: a\n\nAssisted-by: ${AI}`, src(100)),
      commit('2026-01-02', `chore: bump\n\nGenerated-by: ${AI}`, src(100, 'package-lock.json')),
    ]);
    expect(result.percent).toBeCloseTo(25, 6);
  });

  it('counts squashed commits', () => {
    const squashed = `feat: squashed\n\nGenerated-by: ${AI}\n\nAssisted-by: ${AI}`;
    expect(score([commit('2026-01-01', squashed, src(10))]).squashedCommits).toBe(1);
  });

  it('holds the ceiling at 0.90', () => {
    const result = score([commit('2026-01-01', `feat: a\n\nGenerated-by: ${AI}`, src(100))]);
    expect(result.displayed).toBe(90);
  });

  it('scores zero churn without dividing by zero', () => {
    const result = score([commit('2026-01-01', `docs: a\n\nGenerated-by: ${AI}`, [])]);
    expect(result.percent).toBe(0);
    expect(result.churn).toBe(0);
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
