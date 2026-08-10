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
