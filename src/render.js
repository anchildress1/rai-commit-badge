export const START_MARKER = '<!--START_SECTION:rai-badge-->';
export const END_MARKER = '<!--END_SECTION:rai-badge-->';

export const MARKER_SNIPPET = `${START_MARKER}\n${END_MARKER}`;

export const LABEL = 'AI attribution';

export const STYLES = ['flat', 'flat-square', 'plastic', 'for-the-badge', 'social'];

export const NO_ATTRIBUTION = 'no attribution';

// Bands are keyed off the displayed integer, so the colour never disagrees with
// the number printed on the badge.
const BANDS = [
  { max: 33, color: '0875AE' },
  { max: 66, color: '7C3AED' },
  { max: 100, color: 'C03070' },
];
const NO_ATTRIBUTION_COLOR = '9F9F9F';

/**
 * Apply shields static-badge escaping.
 *
 * @param {string} text raw label or message
 * @returns {string} escaped for a shields path segment
 */
export function shieldsEscape(text) {
  return text.replaceAll('-', '--').replaceAll('_', '__').replaceAll('%', '%25').replaceAll(' ', '%20');
}

/**
 * @param {number} displayed the displayed integer percentage
 * @returns {string} hex colour without the leading `#`
 */
export function bandColor(displayed) {
  return BANDS.find((band) => displayed <= band.max).color;
}

/**
 * Build the shields URL for a scored result.
 *
 * @param {{attributed: boolean, displayed: number, windowStart: string | null}} result
 * @param {string} style a shields badge style
 * @returns {string} the full shields.io URL
 */
export function badgeUrl(result, style) {
  const message = result.attributed ? `${result.displayed}% since ${result.windowStart.slice(0, 7)}` : NO_ATTRIBUTION;
  const color = result.attributed ? bandColor(result.displayed) : NO_ATTRIBUTION_COLOR;
  return `https://img.shields.io/badge/${shieldsEscape(LABEL)}-${shieldsEscape(message)}-${color}?style=${style}`;
}

/**
 * @param {{attributed: boolean, displayed: number, windowStart: string | null}} result
 * @param {string} style a shields badge style
 * @returns {string} the badge image markdown
 */
export function badgeMarkdown(result, style) {
  return `![${LABEL}](${badgeUrl(result, style)})`;
}

/**
 * Replace the body of the marker pair with `block`.
 *
 * @param {string} content the file's current contents
 * @param {string} block the markdown to place between the markers
 * @returns {{content: string, replaced: number}} rewritten content and 1 when a pair was found
 */
export function replaceMarkers(content, block) {
  // rejoin on whatever the file already uses, or a CRLF repo gets rewritten whole
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(newline);
  const start = lines.findIndex((line) => line.trim() === START_MARKER);
  if (start === -1) return { content, replaced: 0 };

  const end = lines.findIndex((line, index) => index > start && line.trim() === END_MARKER);
  if (end === -1) return { content, replaced: 0 };

  lines.splice(start + 1, end - start - 1, block);
  return { content: lines.join(newline), replaced: 1 };
}
