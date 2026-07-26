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
  return text.replace(/-/g, '--').replace(/_/g, '__').replace(/%/g, '%25').replace(/ /g, '%20');
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

const isFenceDelimiter = (line) => /^\s*(?:```|~~~)/.test(line);

/**
 * Replace the body of every marker pair with `block`.
 *
 * Pairs inside a fenced code block are skipped — the setup instructions in a
 * README are themselves a fenced pair. A `START` with no matching `END` is left
 * alone.
 *
 * @param {string} content the file's current contents
 * @param {string} block the markdown to place between the markers
 * @returns {{content: string, replaced: number}} rewritten content and the number of pairs replaced
 */
export function replaceMarkers(content, block) {
  const lines = content.split('\n');
  const out = [];
  let fenced = false;
  let replaced = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isFenceDelimiter(line)) fenced = !fenced;

    if (fenced || line.trim() !== START_MARKER) {
      out.push(line);
      continue;
    }

    let end = i + 1;
    let sawFence = false;
    while (end < lines.length) {
      if (isFenceDelimiter(lines[end])) sawFence = !sawFence;
      if (!sawFence && lines[end].trim() === END_MARKER) break;
      end += 1;
    }
    if (end >= lines.length) {
      out.push(line);
      continue;
    }

    out.push(line, block, lines[end]);
    replaced += 1;
    i = end;
  }

  return { content: out.join('\n'), replaced };
}
