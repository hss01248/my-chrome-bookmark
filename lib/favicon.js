export const PLACEHOLDER_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#dadce0"/></svg>`
  );

/**
 * @param {string} pageUrl
 * @param {string} [extensionOrigin] e.g. chrome.runtime.getURL('/').replace(/\/$/, '')
 */
export function faviconUrlFor(pageUrl, extensionOrigin) {
  if (!pageUrl) return PLACEHOLDER_FAVICON;
  if (extensionOrigin) {
    const base = extensionOrigin.replace(/\/$/, '');
    return `${base}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
  }
  return PLACEHOLDER_FAVICON;
}
