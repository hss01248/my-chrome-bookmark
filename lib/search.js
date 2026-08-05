/**
 * @param {{ tabs: { name: string, groups: { name: string, items: { id: string, title: string, url: string }[] }[] }[] }} wall
 * @param {string} query
 * @returns {{ id: string, title: string, url: string, tabName: string, groupName: string }[]}
 */
export function searchBookmarkWall(wall, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];

  const hits = [];
  for (const tab of wall.tabs || []) {
    for (const group of tab.groups || []) {
      for (const item of group.items || []) {
        const hay = `${item.title}\n${item.url}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({
            ...item,
            tabName: tab.name,
            groupName: group.name,
          });
        }
      }
    }
  }
  return hits;
}
