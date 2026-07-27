import { describe, expect, it } from 'vitest';
import { AI_ATTRIBUTION_KEYS, parseFooterLine, WEIGHTS } from '../src/keys.js';

describe('parseFooterLine', () => {
  it('matches every key case-insensitively', () => {
    for (const key of AI_ATTRIBUTION_KEYS) {
      expect(parseFooterLine(`${key.toUpperCase()}: Tool <t@example.com>`)?.key).toBe(key.toLowerCase());
      expect(parseFooterLine(`${key.toLowerCase()}: Tool <t@example.com>`)?.key).toBe(key.toLowerCase());
    }
  });

  it('matches Co-Authored-By as written in the wild', () => {
    expect(parseFooterLine('Co-Authored-By: Claude <noreply@anthropic.com>')?.key).toBe('co-authored-by');
  });

  it('scores Commit-generated-by at 0.05, not as Generated-by', () => {
    const parsed = parseFooterLine('Commit-generated-by: Claude <noreply@anthropic.com>');
    expect(parsed.key).toBe('commit-generated-by');
    expect(WEIGHTS[parsed.key]).toBe(0.05);
  });

  it('anchors to line start', () => {
    expect(parseFooterLine('See also Generated-by: Claude <noreply@anthropic.com>')).toBeNull();
    expect(parseFooterLine('  Generated-by: Claude <noreply@anthropic.com>')).toBeNull();
  });

  it('requires whitespace after the colon', () => {
    expect(parseFooterLine('Generated-by:Claude <noreply@anthropic.com>')).toBeNull();
  });

  it('tolerates a trailing carriage return', () => {
    expect(parseFooterLine('Assisted-by: Claude <noreply@anthropic.com>\r')?.value).toBe(
      'Claude <noreply@anthropic.com>'
    );
  });

  it('ignores lines that are not footers', () => {
    expect(parseFooterLine('feat: add a thing')).toBeNull();
  });
});
