import { isKnownAiIdentity } from './ai-identities.js';
import { parseFooterLine, WEIGHTS } from './keys.js';

// GitHub's squash body prefixes each collapsed commit with `* `. It is the only
// in-message signal that one commit holds several, and it is what separates a
// squash from a plain commit whose trailers happen to sit in two paragraphs.
const SQUASH_BULLET = /^\* \S/;

// CommonMark allows up to three leading spaces and any run of three or more.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Drop fenced code blocks from a message.
 *
 * A commit that documents the footer format carries a trailer inside a fence, and
 * `^Key: value` matches there exactly as it does in a real trailer block — so a
 * human-written docs commit scores as AI work. Unterminated fences swallow the
 * rest of the message, which is what a reader sees rendered too.
 *
 * @param {string[]} lines the message, already split on line endings
 * @returns {string[]} the lines outside any fence
 */
function stripFencedBlocks(lines) {
  const kept = [];
  let fence = null;

  for (const line of lines) {
    const match = FENCE.exec(line);
    if (fence === null) {
      if (match) fence = match[1];
      else kept.push(line);
      continue;
    }
    // a closing fence is the same character, at least as long, and nothing else
    if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !line.slice(match[0].length).trim()) {
      fence = null;
    }
  }

  return kept;
}

/**
 * Weigh one sub-commit: the highest RAI footer it carries, ignoring human co-authors.
 *
 * @param {string[]} lines the sub-commit's lines
 * @returns {number | null} the weight, or null when it holds no attribution
 */
function subCommitWeight(lines) {
  let best = null;
  for (const line of lines) {
    const footer = parseFooterLine(line);
    if (!footer) continue;
    if (footer.key === 'co-authored-by' && !isKnownAiIdentity(footer.value)) continue;
    best = best === null ? WEIGHTS[footer.key] : Math.max(best, WEIGHTS[footer.key]);
  }
  return best;
}

/**
 * Split a message into one unit per squashed sub-commit.
 *
 * Fewer than two bullets is a plain commit, which is one unit whatever its paragraph
 * shape — splitting on blank lines instead meant a trailer block broken in two scored
 * a mean where one block scored a max, so a blank line moved the number.
 *
 * The text above the first bullet is the squash subject and is dropped, unless it
 * carries attribution of its own: a hand-edited squash message can hold a trailer
 * there, and discarding it would lose real churn.
 *
 * @param {string[]} lines the message, fences already stripped
 * @returns {string[][]} one entry per sub-commit, never empty
 */
function splitSubCommits(lines) {
  const starts = [];
  for (const [index, line] of lines.entries()) {
    if (SQUASH_BULLET.test(line)) starts.push(index);
  }
  if (starts.length < 2) return [lines];

  const units = starts.map((start, i) => lines.slice(start, starts[i + 1] ?? lines.length));

  const preamble = lines.slice(0, starts[0]);
  if (subCommitWeight(preamble) !== null) units.unshift(preamble);

  return units;
}

/**
 * Resolve one commit message to a single attribution weight.
 *
 * Max within a sub-commit, mean across the attributed ones. A sub-commit carrying
 * no footer is left out of the mean rather than averaged in as a zero: the squash
 * body is the only record of it, and it says nothing about how much of the churn
 * was that sub-commit's. Counting it as human would charge the whole PR for a
 * one-line follow-up. `subCommits` still counts every unit, attributed or not, so
 * the job summary reports the squash even when one footer covers it.
 *
 * @param {string} message the full commit message body
 * @returns {{weight: number | null, subCommits: number}} null weight when nothing is attributed
 */
export function resolveWeight(message) {
  const units = splitSubCommits(stripFencedBlocks(message.split(/\r?\n/)));
  const weights = units.map(subCommitWeight).filter((weight) => weight !== null);

  if (weights.length === 0) return { weight: null, subCommits: units.length };

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return { weight: total / weights.length, subCommits: units.length };
}
