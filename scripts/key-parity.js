/**
 * Decide whether two key lists hold the same keys, ignoring order.
 *
 * A duplicate on either side fails the comparison: two lists can carry the same
 * distinct keys while one repeats one of them, and a repeated footer key upstream is
 * drift worth reporting rather than the match a plain set comparison would call it.
 *
 * @param {string[]} left one key list
 * @param {string[]} right the other key list
 * @returns {boolean} true when both hold the same keys, each exactly once
 */
export function sameUniqueKeys(left, right) {
  const leftKeys = new Set(left);
  const rightKeys = new Set(right);
  if (leftKeys.size !== left.length || rightKeys.size !== right.length || leftKeys.size !== rightKeys.size)
    return false;
  for (const key of leftKeys) {
    if (!rightKeys.has(key)) return false;
  }
  return true;
}
