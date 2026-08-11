/**
 * Normalize title/url for chrome.bookmarks.update().
 * @param {{ title: string, url: string }} input
 * @returns {{ title: string, url: string } | null}
 */
export function normalizeBookmarkUpdate(input) {
  const url = (input.url || '').trim();
  if (!url) return null;
  const title = (input.title || '').trim() || url;
  return { title, url };
}

export const DEFAULT_FOLDER_TITLE = '新建文件夹';

/**
 * Normalize folder title for create/update. Empty after trim → null.
 * @param {string} title
 * @returns {string | null}
 */
export function normalizeFolderTitle(title) {
  const t = (title || '').trim();
  return t || null;
}

/**
 * Insert index before the first loose bookmark (node with url), else append.
 * Keeps real folders before the synthetic「未命名」bucket.
 * @param {{ url?: string }[]} children
 * @returns {number}
 */
export function resolveNewFolderIndex(children) {
  const list = children || [];
  const firstLink = list.findIndex((c) => Boolean(c?.url));
  return firstLink === -1 ? list.length : firstLink;
}
