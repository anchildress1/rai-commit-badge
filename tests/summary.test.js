import { describe, expect, it } from 'vitest';
import { MARKER_SNIPPET } from '../src/render.js';
import { buildSummary } from '../src/summary.js';

const scored = {
  attributed: true,
  percent: 42.35,
  displayed: 42,
  windowStart: '2026-03-01',
  commits: 10,
  botCommits: 2,
  windowCommits: 8,
  attributedCommits: 4,
  squashedCommits: 1,
  churn: 200,
};

const build = (result, overrides = {}) =>
  buildSummary({ result, badge: '![b](u)', readme: 'README.md', replaced: 1, commitState: 'unchanged', ...overrides });

describe('buildSummary', () => {
  it('reports the raw percent alongside the displayed integer', () => {
    expect(build(scored)).toContain('42.4% (badge shows 42%)');
  });

  it('reports the attributed share of the window', () => {
    expect(build(scored)).toContain('| Attributed commits | 4 (50.0%) |');
  });

  it('reports zero percent rather than dividing by an empty window', () => {
    const empty = { ...scored, windowCommits: 0, attributedCommits: 0 };
    expect(build(empty)).toContain('0 (0.0%)');
  });

  it('names a missing footer when nothing was attributed at all', () => {
    const none = { ...scored, attributed: false, attributedCommits: 0 };
    expect(build(none)).toContain('no RAI footer found in 10 commits');
  });

  it('names excluded churn when footers were found but nothing was countable', () => {
    // blaming a missing footer here sends someone hunting for one that is present
    const noChurn = { ...scored, attributed: false, attributedCommits: 3, churn: 0 };
    const out = build(noChurn);
    expect(out).toContain('3 attributed commits');
    expect(out).toContain('no countable churn');
    expect(out).not.toContain('no RAI footer found');
  });

  it('offers the marker snippet only when no markers were replaced', () => {
    expect(build(scored, { replaced: 0 })).toContain(MARKER_SNIPPET);
    expect(build(scored, { replaced: 1 })).not.toContain(MARKER_SNIPPET);
  });

  it('reports the commit state and target file', () => {
    const out = build(scored, { commitState: 'pull request #7 from rai-badge--branches--main', readme: 'docs/X.md' });
    expect(out).toContain('| Badge | pull request #7 from rai-badge--branches--main |');
    expect(out).toContain('`docs/X.md`');
  });
});
