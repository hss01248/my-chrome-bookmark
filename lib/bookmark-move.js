/**
 * @deprecated Chrome BookmarkModel::Move already decrements when moving down
 * in the same folder. Prefer resolveDropDestination with live childIds.
 * Kept for any callers/tests documenting the old SO workaround.
 * @param {number} oldIndex
 * @param {number} desiredFinalIndex
 */
export function adjustIndexForSameParentMove(oldIndex, desiredFinalIndex) {
  if (oldIndex < desiredFinalIndex) return desiredFinalIndex + 1;
  return desiredFinalIndex;
}

/**
 * True when the drop insert index in the target visual grid (excluding dragged)
 * matches the dragged item's original visual slot — a no-op reorder.
 * @param {{
 *   draggedId: string,
 *   beforeItemId: string | null,
 *   visualItems: { id: string }[],
 * }} args
 */
export function isNoOpVisualReorder({ draggedId, beforeItemId, visualItems }) {
  const from = visualItems.findIndex((v) => v.id === draggedId);
  if (from < 0) return false;
  const without = visualItems.filter((v) => v.id !== draggedId);
  let to = beforeItemId
    ? without.findIndex((v) => v.id === beforeItemId)
    : without.length;
  if (to < 0) to = without.length;
  return to === from;
}

/**
 * @typedef {{ id: string, parentId: string, index: number }} MoveItemRef
 */

/**
 * Resolve which child id to insert before among live folder children.
 * @param {{
 *   beforeItem: MoveItemRef | null,
 *   childIds: string[],
 *   visualItems: MoveItemRef[],
 * }} args
 * @returns {string | null} null means append
 */
function resolveBeforeChildId({ beforeItem, childIds, visualItems }) {
  if (!beforeItem) return null;
  if (childIds.includes(beforeItem.id)) return beforeItem.id;

  const start = visualItems.findIndex((v) => v.id === beforeItem.id);
  const rest = start >= 0 ? visualItems.slice(start + 1) : visualItems;
  for (const v of rest) {
    if (childIds.includes(v.id)) return v.id;
  }
  return null;
}

/**
 * Resolve chrome.bookmarks.move destination from live folder children + visual drop.
 *
 * Chromium BookmarkModel::Move treats `index` as the insertion index in the
 * current child list (node still present). Same-parent moves with
 * index == oldIndex or index == oldIndex + 1 are no-ops; when index > oldIndex
 * Chromium decrements before remove+add.
 *
 * @param {{
 *   dragged: MoveItemRef,
 *   targetFolderId: string,
 *   beforeItem: MoveItemRef | null,
 *   childIds: string[],
 *   visualItems: MoveItemRef[],
 * }} args
 * @returns {{ parentId: string, index: number }}
 */
export function resolveDropDestination({
  dragged,
  targetFolderId,
  beforeItem,
  childIds,
  visualItems,
}) {
  const beforeChildId = resolveBeforeChildId({
    beforeItem,
    childIds,
    visualItems,
  });
  const index =
    beforeChildId == null ? childIds.length : childIds.indexOf(beforeChildId);

  return { parentId: targetFolderId, index };
}
