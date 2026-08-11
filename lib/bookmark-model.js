const UNNAMED = '未命名';

function isFolder(node) {
  return !node.url;
}

function findBookmarkBar(treeRoot) {
  if (!treeRoot?.children?.length) return null;
  const byId = treeRoot.children.find((c) => c.id === '1');
  if (byId) return byId;
  return treeRoot.children[0] ?? null;
}

function toItem(node) {
  const url = node.url || '';
  const title = (node.title && node.title.trim()) || url;
  return {
    id: node.id,
    title,
    url,
    parentId: node.parentId ?? '',
    index: node.index ?? 0,
  };
}

/** 递归收集文件夹下所有链接（拍平） */
function collectLinks(node, out = []) {
  if (!node) return out;
  if (node.url) {
    out.push(toItem(node));
    return out;
  }
  for (const child of node.children || []) {
    collectLinks(child, out);
  }
  return out;
}

function buildGroupsForFolder(folderNode) {
  /** @type {{ name: string, folderId: string, items: ReturnType<typeof toItem>[] }[]} */
  const groups = [];
  /** @type {ReturnType<typeof toItem>[]} */
  const loose = [];

  for (const child of folderNode.children || []) {
    if (isFolder(child)) {
      groups.push({
        name: child.title || UNNAMED,
        folderId: child.id,
        items: collectLinks(child),
      });
    } else if (child.url) {
      loose.push(toItem(child));
    }
  }

  if (loose.length) {
    groups.push({
      name: UNNAMED,
      folderId: folderNode.id,
      items: loose,
    });
  }

  // Keep all real subfolders (even empty). Only drop empty synthetic loose-unnamed.
  const parentId = folderNode.id;
  return groups.filter(
    (g) =>
      !(g.name === UNNAMED && g.folderId === parentId && g.items.length === 0)
  );
}

/**
 * @param {object} treeRoot
 * @returns {{ tabs: { id: string, name: string, groups: { name: string, folderId: string, items: { id: string, title: string, url: string, parentId: string, index: number }[] }[] }[] }}
 */
export function buildBookmarkWall(treeRoot) {
  const bar = findBookmarkBar(treeRoot);
  if (!bar) return { tabs: [] };

  /** @type {ReturnType<typeof buildBookmarkWall>['tabs']} */
  const tabs = [];
  /** @type {ReturnType<typeof toItem>[]} */
  const barLoose = [];

  for (const child of bar.children || []) {
    if (isFolder(child)) {
      tabs.push({
        id: child.id,
        name: child.title || UNNAMED,
        groups: buildGroupsForFolder(child),
      });
    } else if (child.url) {
      barLoose.push(toItem(child));
    }
  }

  if (barLoose.length) {
    tabs.push({
      id: '__unnamed__',
      name: UNNAMED,
      groups: [{ name: UNNAMED, folderId: bar.id, items: barLoose }],
    });
  }

  return { tabs };
}

export { UNNAMED, findBookmarkBar, collectLinks };
