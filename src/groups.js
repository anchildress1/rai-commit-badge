import { isKnownAiIdentity } from './ai-identities.js';
import { parseFooterLine, WEIGHTS } from './keys.js';

/**
 * Weigh one paragraph: the highest RAI footer in it, ignoring human co-authors.
 *
 * @param {string} paragraph one blank-line-delimited block of the message
 * @returns {number | null} the group's weight, or null when it holds no attribution
 */
function groupWeight(paragraph) {
  let best = null;
  for (const line of paragraph.split('\n')) {
    const footer = parseFooterLine(line);
    if (!footer) continue;
    if (footer.key === 'co-authored-by' && !isKnownAiIdentity(footer.value)) continue;
    best = best === null ? WEIGHTS[footer.key] : Math.max(best, WEIGHTS[footer.key]);
  }
  return best;
}

/**
 * Resolve one commit message to a single attribution weight.
 *
 * Squash merges concatenate every commit message against one churn number, so
 * the message is split on blank lines and each paragraph holding a RAI footer
 * is a group: max weight within a group, mean across groups. A group whose only
 * RAI-keyed line is a non-AI `Co-authored-by` is discarded.
 *
 * @param {string} message the full commit message body
 * @returns {{weight: number | null, groups: number}} null weight when nothing is attributed
 */
export function resolveWeight(message) {
  const weights = message
    .split(/\n[ \t]*\n/)
    .map(groupWeight)
    .filter((weight) => weight !== null);

  if (weights.length === 0) return { weight: null, groups: 0 };
  const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
  return { weight: mean, groups: weights.length };
}
