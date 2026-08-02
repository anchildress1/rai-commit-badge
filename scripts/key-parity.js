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
