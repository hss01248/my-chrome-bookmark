/**
 * Chrome bookmarks.move same-parent downward index quirk.
 * @param {number} oldIndex
 * @param {number} newIndex desired index before removal adjustment
 */
export function adjustIndexForSameParentMove(oldIndex, newIndex) {
  if (oldIndex < newIndex) return newIndex + 1;
  return newIndex;
}
