import { findBookmarkBar } from './bookmark-model.js';
import { resolveImportActions } from './navi-import.js';

/**
 * @param {string} parentKey
 * @param {Map<string, string>} idByKey
 */
export function resolveBookmarkParentId(parentKey, idByKey) {
  if (idByKey.has(parentKey)) return idByKey.get(parentKey);
  if (parentKey.startsWith('folder:')) return parentKey.slice('folder:'.length);
  throw new Error(`Unknown parent key: ${parentKey}`);
}

/**
 * @typedef {{
 *   getTree: () => Promise<object[]>,
 *   getSubTree: (id: string) => Promise<object[]>,
 *   create: (node: { parentId?: string, title?: string, url?: string }) => Promise<{ id: string }>,
 * }} BookmarksApi
 */

/**
 * Create folders/bookmarks on the Chrome bookmark bar from a navi import tree.
 * Reuses same-name folders; skips duplicate URLs under a group (see resolveImportActions).
 *
 * @param {{ tabs: object[] }} tree
 * @param {BookmarksApi} bookmarksApi
 */
export async function importNaviToBookmarkBar(tree, bookmarksApi) {
  const roots = await bookmarksApi.getTree();
  const bar = findBookmarkBar(roots[0]);
  if (!bar) {
    throw new Error('找不到书签栏');
  }
  const [barNode] = await bookmarksApi.getSubTree(bar.id);
  const plan = resolveImportActions(tree, barNode.children || []);
  /** @type {Map<string, string>} */
  const idByKey = new Map([['bar', bar.id]]);

  for (const folder of plan.createFolder) {
    const parentId = resolveBookmarkParentId(folder.parentKey, idByKey);
    const created = await bookmarksApi.create({
      parentId,
      title: folder.title,
    });
    idByKey.set(folder.tempId, created.id);
  }

  for (const bm of plan.createBookmark) {
    const parentId = resolveBookmarkParentId(bm.parentKey, idByKey);
    await bookmarksApi.create({
      parentId,
      title: bm.title,
      url: bm.url,
    });
  }

  return {
    createdFolders: plan.createFolder.length,
    createdBookmarks: plan.createBookmark.length,
    skippedDuplicates: plan.skipped.filter((s) => s.reason === 'duplicate-url')
      .length,
    skipped: plan.skipped,
    stats: tree.stats,
  };
}
