import { describe, expect, it } from 'vitest';
import {
  badgeMarkdown,
  badgeUrl,
  bandColor,
  END_MARKER,
  replaceMarkers,
  shieldsEscape,
  START_MARKER,
} from '../src/render.js';

const scored = (displayed, windowStart = '2026-03-14') => ({ attributed: true, displayed, windowStart });

describe('shieldsEscape', () => {
  it('doubles hyphens and underscores, then percent-encodes', () => {
    expect(shieldsEscape('42% since 2026-03')).toBe('42%25%20since%202026--03');
  });

  it('doubles underscores', () => {
    expect(shieldsEscape('a_b')).toBe('a__b');
  });

  it('encodes the label', () => {
    expect(shieldsEscape('AI attribution')).toBe('AI%20attribution');
  });
});

describe('bandColor', () => {
  it.each([
    [0, '0875AE'],
    [33, '0875AE'],
    [34, '7C3AED'],
    [66, '7C3AED'],
    [67, 'C03070'],
    [100, 'C03070'],
  ])('maps %i to %s', (displayed, color) => {
    expect(bandColor(displayed)).toBe(color);
  });

  it('falls back to the top band above the last threshold', () => {
    // no weight reaches 100 today, so this only fires if WEIGHTS grows — and the
    // badge rendering the wrong shade beats it throwing on the way to the README
    expect(bandColor(101)).toBe('C03070');
  });
});

describe('badgeUrl', () => {
  it('matches the documented shape', () => {
    expect(badgeUrl(scored(42, '2026-03-01'), 'flat')).toBe(
      'https://img.shields.io/badge/AI%20attribution-42%25%20since%202026--03-7C3AED?style=flat'
    );
  });

  it('renders no attribution in grey', () => {
    expect(badgeUrl({ attributed: false, displayed: 0, windowStart: null }, 'flat')).toBe(
      'https://img.shields.io/badge/AI%20attribution-no%20attribution-9F9F9F?style=flat'
    );
  });

  it('colours by the displayed integer, not the raw percent', () => {
    expect(badgeUrl(scored(67), 'flat')).toContain('-C03070?');
    expect(badgeUrl(scored(66), 'flat')).toContain('-7C3AED?');
  });

  it('honours the style input', () => {
    expect(badgeUrl(scored(10), 'for-the-badge')).toMatch(/\?style=for-the-badge$/);
  });

  it('shows month granularity', () => {
    expect(badgeUrl(scored(10, '2025-10-31'), 'flat')).toContain('2025--10-');
  });
});

describe('badgeMarkdown', () => {
  it('wraps the URL in an image', () => {
    expect(badgeMarkdown(scored(42), 'flat')).toMatch(/^!\[AI attribution]\(https:\/\/img\.shields\.io\/.+\)$/);
  });
});

describe('replaceMarkers', () => {
  const block = '![badge](url)';

  it('fills an empty marker pair', () => {
    const { content, replaced } = replaceMarkers(`# Title\n\n${START_MARKER}\n${END_MARKER}\n`, block);
    expect(replaced).toBe(1);
    expect(content).toBe(`# Title\n\n${START_MARKER}\n${block}\n${END_MARKER}\n`);
  });

  it('replaces an existing badge', () => {
    const before = `${START_MARKER}\n![badge](old)\nstray\n${END_MARKER}\n`;
    expect(replaceMarkers(before, block).content).toBe(`${START_MARKER}\n${block}\n${END_MARKER}\n`);
  });

  it('is a no-op when the block already matches', () => {
    const before = `${START_MARKER}\n${block}\n${END_MARKER}\n`;
    expect(replaceMarkers(before, block).content).toBe(before);
  });

  it('preserves CRLF line endings instead of rewriting the whole file', () => {
    // rejoining on \n would rewrite every line of a CRLF repo's README as a diff
    const before = `# Title\r\n${START_MARKER}\r\n![badge](old)\r\n${END_MARKER}\r\n`;
    const { content, replaced } = replaceMarkers(before, block);

    expect(replaced).toBe(1);
    expect(content).toBe(`# Title\r\n${START_MARKER}\r\n${block}\r\n${END_MARKER}\r\n`);
    expect(content).not.toMatch(/[^\r]\n/);
  });

  it('finds the markers when one unrelated line is CRLF', () => {
    // splitting the whole file on \r\n leaves the LF lines glued together, so nothing
    // trims to a bare marker and a README that plainly has the pair reports none
    const before = `| a | b |\r\n${START_MARKER}\n${END_MARKER}\n`;
    const { content, replaced } = replaceMarkers(before, block);

    expect(replaced).toBe(1);
    expect(content).toBe(`| a | b |\r\n${START_MARKER}\n${block}\n${END_MARKER}\n`);
  });

  it('leaves every other line ending exactly as it found it', () => {
    const before = `a\r\nb\n${START_MARKER}\r\nold\r\n${END_MARKER}\nc\r\n`;
    const { content } = replaceMarkers(before, block);

    expect(content).toBe(`a\r\nb\n${START_MARKER}\r\n${block}\r\n${END_MARKER}\nc\r\n`);
  });

  it('leaves a START with no END untouched', () => {
    const before = `# Title\n${START_MARKER}\nbody\n`;
    expect(replaceMarkers(before, block)).toEqual({ content: before, replaced: 0 });
  });

  it('reports zero when the file has no markers', () => {
    expect(replaceMarkers('# Title\n', block)).toEqual({ content: '# Title\n', replaced: 0 });
  });

  it('tolerates indented markers', () => {
    const { replaced } = replaceMarkers(`  ${START_MARKER}\n  ${END_MARKER}\n`, block);
    expect(replaced).toBe(1);
  });
});
