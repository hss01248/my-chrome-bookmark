/**
 * @typedef {{ id: string, title: string, url: string }} BookmarkItem
 * @typedef {{ name: string, items: BookmarkItem[] }} BookmarkGroup
 * @typedef {{ id: string, name: string, groups: BookmarkGroup[] }} BookmarkTab
 * @typedef {{ tabs: BookmarkTab[] }} BookmarkWall
 */

/**
 * @param {object} treeRoot chrome.bookmarks.getTree()[0]
 * @returns {BookmarkWall}
 */
export function buildBookmarkWall(treeRoot) {
  return { tabs: [] };
}
