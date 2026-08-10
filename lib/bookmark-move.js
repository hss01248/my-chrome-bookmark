/**
 * Chrome bookmarks.move same-parent downward index quirk.
 * @param {number} oldIndex
 * @param {number} newIndex desired index before removal adjustment
 */
export function adjustIndexForSameParentMove(oldIndex, newIndex) {
  if (oldIndex < newIndex) return newIndex + 1;
  return newIndex;
}

/**
 * @typedef {{ id: string, parentId: string, index: number }} MoveItemRef
 */

/**
 * @param {{
 *   dragged: MoveItemRef,
 *   targetFolderId: string,
 *   beforeItem: MoveItemRef | null,
 *   folderChildCount: number,
 *   visualItems: MoveItemRef[],
 * }} args
 * @returns {{ parentId: string, index: number }}
 */
export function resolveDropDestination({
  dragged,
  targetFolderId,
  beforeItem,
  folderChildCount,
  visualItems,
}) {
  let index;
  if (!beforeItem) {
    index = folderChildCount;
  } else if (beforeItem.parentId === targetFolderId) {
    index = beforeItem.index;
  } else {
    const start = visualItems.findIndex((v) => v.id === beforeItem.id);
    const rest = start >= 0 ? visualItems.slice(start + 1) : visualItems;
    const next = rest.find((v) => v.parentId === targetFolderId);
    index = next ? next.index : folderChildCount;
  }

  if (dragged.parentId === targetFolderId) {
    index = adjustIndexForSameParentMove(dragged.index, index);
  }

  return { parentId: targetFolderId, index };
}
