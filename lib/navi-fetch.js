import {
  NAVI_API_BASE,
  NAVI_GROUPS_PATH,
  NAVI_TABS_PATH,
  buildNaviImportTree,
} from './navi-import.js';

/**
 * @param {string} [base]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchNaviTree(base = NAVI_API_BASE, fetchImpl = fetch) {
  const tabsRes = await fetchImpl(`${base}${NAVI_TABS_PATH}`);
  if (!tabsRes.ok) {
    throw new Error(`getTabs HTTP ${tabsRes.status}`);
  }
  const tabsBody = await tabsRes.json();
  if (!tabsBody?.success || !Array.isArray(tabsBody.data)) {
    throw new Error(`getTabs failed: ${tabsBody?.msg || 'invalid response'}`);
  }
  const tabs = tabsBody.data;
  /** @type {Record<number|string, object[]>} */
  const groupsByTabId = {};
  for (const tab of tabs) {
    const res = await fetchImpl(`${base}${NAVI_GROUPS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId: tab.id }),
    });
    if (!res.ok) {
      throw new Error(`getAll2 HTTP ${res.status} for tab ${tab.id}`);
    }
    const body = await res.json();
    if (!body?.success) {
      throw new Error(
        `getAll2 failed for tab ${tab.id} (${tab.name}): ${body?.msg || 'invalid'}`
      );
    }
    groupsByTabId[tab.id] = body.data || [];
  }
  return buildNaviImportTree(tabs, groupsByTabId);
}
