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
