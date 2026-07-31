// Must stay identical to rai-lint's AI_ATTRIBUTION_KEYS in both plugins.
// Keys are interpolated into a regex unescaped, so they stay plain [A-Za-z-].
export const AI_ATTRIBUTION_KEYS = [
  'Authored-by',
  'Commit-generated-by',
  'Assisted-by',
  'Co-authored-by',
  'Generated-by',
];

export const WEIGHTS = {
  'authored-by': 0.0,
  'commit-generated-by': 0.05,
  'assisted-by': 0.25,
  'co-authored-by': 0.5,
  'generated-by': 0.9,
};

// Anchored at line start: `Commit-generated-by` ends with `generated-by`, and an
// unanchored match would score it 0.90 instead of 0.05.
export const FOOTER_PATTERN = new RegExp(String.raw`^(${AI_ATTRIBUTION_KEYS.join('|')}):[ \t]+(.*)$`, 'i');

/**
 * Parse one message line as a RAI footer.
 *
 * @param {string} line raw line, CR tolerated
 * @returns {{key: string, value: string} | null} lowercased key and trimmed value, or null
 */
export function parseFooterLine(line) {
  const match = FOOTER_PATTERN.exec(line.replace(/\r$/, ''));
  if (!match) return null;
  return { key: match[1].toLowerCase(), value: match[2].trim() };
}
