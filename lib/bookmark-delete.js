/**
 * @typedef {{ parentId: string, index: number, title: string, url: string }} UndoSnapshot
 */

/**
 * Build an undo snapshot from a Chrome BookmarkTreeNode.
 * Returns null for folders (nodes without url).
 * @param {{ parentId?: string, index?: number, title?: string, url?: string } | null | undefined} node
 * @returns {UndoSnapshot | null}
 */
export function snapshotFromNode(node) {
  if (!node?.url) return null;
  return {
    parentId: node.parentId ?? '',
    index: node.index ?? 0,
    title: node.title || '',
    url: node.url,
  };
}

/**
 * Map an undo snapshot to chrome.bookmarks.create() arguments.
 * @param {UndoSnapshot} snapshot
 */
export function createArgsFromSnapshot(snapshot) {
  return {
    parentId: snapshot.parentId,
    index: snapshot.index,
    title: snapshot.title,
    url: snapshot.url,
  };
}

/**
 * Remove a bookmark item from the in-memory wall.
 * Drops empty synthetic「未命名」groups; keeps empty real folder groups.
 * Mutates `wall`. Returns whether the item was found.
 * @param {{ tabs?: { id?: string, groups: { name?: string, folderId?: string, items: { id: string }[] }[] }[] } | null | undefined} wall
 * @param {string} id
 */
export function removeItemFromWall(wall, id) {
  if (!wall?.tabs?.length || !id) return false;
  for (const tab of wall.tabs) {
    for (let gi = 0; gi < tab.groups.length; gi++) {
      const group = tab.groups[gi];
      const idx = group.items.findIndex((item) => item.id === id);
      if (idx < 0) continue;
      group.items.splice(idx, 1);
      if (group.items.length === 0) {
        const isSyntheticUnnamed =
          group.name === '未命名' &&
          (group.folderId === tab.id || tab.id === '__unnamed__');
        if (isSyntheticUnnamed) {
          tab.groups.splice(gi, 1);
        }
      }
      return true;
    }
  }
  return false;
}
