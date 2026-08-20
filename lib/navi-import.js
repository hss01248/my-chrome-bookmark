/** @param {unknown} url */
export function isHttpUrl(url) {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  return /^https?:\/\//i.test(t);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ id: number|string, name?: string }[]} tabs
 * @param {Record<string|number, { name?: string, itemList?: { name?: string, url?: string }[] }[]>} groupsByTabId
 */
export function buildNaviImportTree(tabs, groupsByTabId) {
  /** @type {{ name: string, groups: { name: string, items: { title: string, url: string }[] }[] }[]} */
  const outTabs = [];
  /** @type {{ reason: string, tab?: string, group?: string, name?: string, url?: string }[]} */
  const skipped = [];
  let itemCount = 0;
  let groupCount = 0;

  for (const tab of tabs || []) {
    const tabName = (tab.name && String(tab.name).trim()) || '未命名';
    const rawGroups = groupsByTabId[tab.id] || groupsByTabId[String(tab.id)] || [];
    /** @type {{ name: string, items: { title: string, url: string }[] }[]} */
    const groups = [];

    for (const g of rawGroups) {
      const groupName = (g.name && String(g.name).trim()) || '未命名';
      /** @type {{ title: string, url: string }[]} */
      const items = [];
      for (const it of g.itemList || []) {
        const url = (it.url && String(it.url).trim()) || '';
        const title = (it.name && String(it.name).trim()) || url;
        if (!isHttpUrl(url)) {
          skipped.push({
            reason: 'non-http',
            tab: tabName,
            group: groupName,
            name: title,
            url,
          });
          continue;
        }
        items.push({ title, url });
      }
      if (items.length === 0) {
        skipped.push({ reason: 'empty-group', tab: tabName, group: groupName });
        continue;
      }
      groups.push({ name: groupName, items });
      groupCount += 1;
      itemCount += items.length;
    }

    if (groups.length === 0) {
      skipped.push({ reason: 'empty-tab', tab: tabName });
      continue;
    }
    outTabs.push({ name: tabName, groups });
  }

  return {
    tabs: outTabs,
    skipped,
    stats: { tabs: outTabs.length, groups: groupCount, items: itemCount },
  };
}

/**
 * @param {{ tabs: { name: string, groups: { name: string, items: { title: string, url: string }[] }[] }[] }} tree
 */
export function toNetscapeHtml(tree) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const tab of tree.tabs || []) {
    lines.push(`    <DT><H3>${escapeHtml(tab.name)}</H3>`);
    lines.push('    <DL><p>');
    for (const group of tab.groups || []) {
      lines.push(`        <DT><H3>${escapeHtml(group.name)}</H3>`);
      lines.push('        <DL><p>');
      for (const item of group.items || []) {
        lines.push(
          `            <DT><A HREF="${escapeHtml(item.url)}">${escapeHtml(item.title)}</A>`
        );
      }
      lines.push('        </DL><p>');
    }
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>');
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {{ id?: string, title?: string, url?: string, children?: object[] }[]} nodes
 * @param {string} title
 */
function findFolderByTitle(nodes, title) {
  return (nodes || []).find((n) => !n.url && n.title === title) || null;
}

/**
 * Plan create/reuse/skip against an existing Chrome bookmark-bar children snapshot.
 * Folder ids may be real Chrome ids or temporary keys like `new:0` for folders not yet created.
 *
 * @param {{ tabs: { name: string, groups: { name: string, items: { title: string, url: string }[] }[] }[] }} tree
 * @param {{ id?: string, title?: string, url?: string, children?: object[] }[]} barChildren
 */
export function resolveImportActions(tree, barChildren) {
  /** @type {{ title: string, parentKey: string, tempId: string }[]} */
  const createFolder = [];
  /** @type {{ title: string, url: string, parentKey: string }[]} */
  const createBookmark = [];
  /** @type {{ reason: string, title?: string, url?: string, parent?: string }[]} */
  const skipped = [];

  let tempSeq = 0;
  /** @type {Map<string, { id: string, title: string, url?: string, children: object[] }>} */
  const folderByKey = new Map();

  const barKey = 'bar';
  folderByKey.set(barKey, {
    id: '1',
    title: 'Bookmarks Bar',
    children: [...(barChildren || [])],
  });

  for (const tab of tree.tabs || []) {
    const bar = folderByKey.get(barKey);
    let tabFolder = findFolderByTitle(bar.children, tab.name);
    let tabKey;
    if (tabFolder) {
      tabKey = `folder:${tabFolder.id}`;
      if (!folderByKey.has(tabKey)) {
        folderByKey.set(tabKey, {
          id: tabFolder.id,
          title: tabFolder.title,
          children: [...(tabFolder.children || [])],
        });
      }
    } else {
      const tempId = `new:${tempSeq++}`;
      tabKey = tempId;
      createFolder.push({ title: tab.name, parentKey: barKey, tempId });
      tabFolder = { id: tempId, title: tab.name, children: [] };
      folderByKey.set(tabKey, tabFolder);
      bar.children.push(tabFolder);
    }

    const tabNode = folderByKey.get(tabKey);
    for (const group of tab.groups || []) {
      let groupFolder = findFolderByTitle(tabNode.children, group.name);
      let groupKey;
      if (groupFolder) {
        groupKey = `folder:${groupFolder.id}`;
        if (!folderByKey.has(groupKey)) {
          folderByKey.set(groupKey, {
            id: groupFolder.id,
            title: groupFolder.title,
            children: [...(groupFolder.children || [])],
          });
        }
      } else {
        const tempId = `new:${tempSeq++}`;
        groupKey = tempId;
        createFolder.push({ title: group.name, parentKey: tabKey, tempId });
        groupFolder = { id: tempId, title: group.name, children: [] };
        folderByKey.set(groupKey, groupFolder);
        tabNode.children.push(groupFolder);
      }

      const groupNode = folderByKey.get(groupKey);
      const existingUrls = new Set(
        (groupNode.children || [])
          .filter((c) => c.url)
          .map((c) => String(c.url).toLowerCase())
      );

      for (const item of group.items || []) {
        const key = item.url.toLowerCase();
        if (existingUrls.has(key)) {
          skipped.push({
            reason: 'duplicate-url',
            title: item.title,
            url: item.url,
            parent: group.name,
          });
          continue;
        }
        createBookmark.push({
          title: item.title,
          url: item.url,
          parentKey: groupKey,
        });
        existingUrls.add(key);
        groupNode.children.push({
          title: item.title,
          url: item.url,
        });
      }
    }
  }

  return { createFolder, createBookmark, skipped };
}

export const NAVI_API_BASE = 'https://navi-api.hss01248.tech';
export const NAVI_TABS_PATH = '/navi/nav-tab/getTabs';
export const NAVI_GROUPS_PATH = '/navi3/navi-item-group/getAll2';
