# Chrome 书签墙扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Manifest V3 原生扩展：工具栏打开全页，书签栏一级文件夹作可换行 Tab，二级子文件夹作 Group，更深拍平；Grid 展示 favicon+标题；全局搜索；点击新标签打开。

**Architecture:** 纯函数把 `chrome.bookmarks` 树映射为 `tabs → groups → items`（`lib/bookmark-model.js`），用 Node 单测锁住两层/拍平/「未命名」规则；页面脚本只负责渲染、搜索切换与变更监听；`background.js` 负责点击图标打开扩展页。

**Tech Stack:** Chrome Extension MV3、Vanilla HTML/CSS/JS、Node.js 内置 `node:test`（仅测纯逻辑）

**Spec:** `docs/superpowers/specs/2026-08-05-chrome-bookmark-wall-design.md`

---

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | MV3、权限、action、web_accessible 等 |
| `background.js` | `action.onClicked` → 打开 `bookmarks.html` |
| `lib/bookmark-model.js` | 书签栏 → Tab/Group/Item 映射（纯函数） |
| `lib/search.js` | 全局搜索过滤（纯函数） |
| `lib/favicon.js` | 生成 favicon URL + 占位 |
| `bookmarks.html` | 全页结构：搜索框、Tab 栏、内容区 |
| `bookmarks.css` | flex Tab、grid item、空状态 |
| `bookmarks.js` | 读 API、调用 model、渲染、监听 |
| `tests/bookmark-model.test.js` | 映射规则单测 |
| `tests/search.test.js` | 搜索单测 |
| `icons/icon16.png` 等 | 扩展图标（可用简单占位 PNG） |
| `package.json` | `"test": "node --test"` |
| `README.md` | 如何加载未打包扩展 |

---

### Task 1: 测试脚手架 + bookmark-model 失败测试

**Files:**
- Create: `package.json`
- Create: `tests/bookmark-model.test.js`
- Create: `lib/bookmark-model.js`（先空导出，让测试失败）

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "my-chrome-bookmark",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 写失败测试（核心规则）**

创建 `tests/bookmark-model.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBookmarkWall } from '../lib/bookmark-model.js';

/** 最小书签栏夹具：根 → 书签栏(id=1) → 子节点 */
function bar(children) {
  return {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks Bar',
        children,
      },
      { id: '2', title: 'Other Bookmarks', children: [] },
    ],
  };
}

describe('buildBookmarkWall', () => {
  it('maps top-level folders to tabs and bar links to trailing 未命名', () => {
    const tree = bar([
      { id: '10', title: 'github', children: [] },
      { id: '11', title: 'Direct Link', url: 'https://a.example/' },
      { id: '12', title: '2026', children: [
        { id: '20', title: 'AI工具', children: [
          { id: '30', title: 'Claude', url: 'https://claude.example/' },
          { id: '31', title: 'nested', children: [
            { id: '40', title: 'Deep', url: 'https://deep.example/' },
          ]},
        ]},
        { id: '21', title: 'Loose', url: 'https://loose.example/' },
      ]},
    ]);

    const wall = buildBookmarkWall(tree);
    assert.deepEqual(
      wall.tabs.map((t) => t.name),
      ['github', '2026', '未命名']
    );

    const unnamedTab = wall.tabs[2];
    assert.equal(unnamedTab.groups.length, 1);
    assert.equal(unnamedTab.groups[0].items[0].url, 'https://a.example/');

    const t2026 = wall.tabs[1];
    assert.deepEqual(
      t2026.groups.map((g) => g.name),
      ['AI工具', '未命名']
    );
    const ai = t2026.groups[0];
    assert.equal(ai.items.length, 2);
    assert.ok(ai.items.some((i) => i.url === 'https://deep.example/'));
    assert.ok(ai.items.some((i) => i.url === 'https://claude.example/'));
    assert.equal(t2026.groups[1].items[0].url, 'https://loose.example/');
  });

  it('omits empty 未命名 tab and group', () => {
    const tree = bar([
      {
        id: '10',
        title: 'only',
        children: [
          { id: '20', title: 'sub', children: [
            { id: '30', title: 'x', url: 'https://x.example/' },
          ]},
        ],
      },
    ]);
    const wall = buildBookmarkWall(tree);
    assert.deepEqual(wall.tabs.map((t) => t.name), ['only']);
    assert.deepEqual(wall.tabs[0].groups.map((g) => g.name), ['sub']);
  });

  it('uses url as title when title is empty', () => {
    const tree = bar([
      { id: '11', title: '', url: 'https://empty-title.example/' },
    ]);
    const item = buildBookmarkWall(tree).tabs[0].groups[0].items[0];
    assert.equal(item.title, 'https://empty-title.example/');
  });
});
```

- [ ] **Step 3: 写空模块让测试能 import 但失败**

Create `lib/bookmark-model.js`:

```js
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
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd /Users/hss/my-chrome-bookmark && npm test`

Expected: FAIL（断言 tabs 与期望不符）

- [ ] **Step 5: Commit（若用户允许提交）**

```bash
git add package.json lib/bookmark-model.js tests/bookmark-model.test.js
git commit -m "$(cat <<'EOF'
test: add failing bookmark wall model tests

EOF
)"
```

---

### Task 2: 实现 `buildBookmarkWall`

**Files:**
- Modify: `lib/bookmark-model.js`

- [ ] **Step 1: 实现完整映射**

Replace `lib/bookmark-model.js` with:

```js
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
  return { id: node.id, title, url };
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
  /** @type {{ name: string, items: ReturnType<typeof toItem>[] }[]} */
  const groups = [];
  /** @type {ReturnType<typeof toItem>[]} */
  const loose = [];

  for (const child of folderNode.children || []) {
    if (isFolder(child)) {
      groups.push({
        name: child.title || UNNAMED,
        items: collectLinks(child),
      });
    } else if (child.url) {
      loose.push(toItem(child));
    }
  }

  if (loose.length) {
    groups.push({ name: UNNAMED, items: loose });
  }

  return groups.filter((g) => g.items.length > 0);
}

/**
 * @param {object} treeRoot
 * @returns {{ tabs: { id: string, name: string, groups: { name: string, items: { id: string, title: string, url: string }[] }[] }[] }}
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
      groups: [{ name: UNNAMED, items: barLoose }],
    });
  }

  return { tabs };
}

export { UNNAMED, findBookmarkBar, collectLinks };
```

- [ ] **Step 2: 跑测试确认通过**

Run: `npm test`

Expected: PASS（`tests/bookmark-model.test.js` 全部通过）

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add lib/bookmark-model.js
git commit -m "$(cat <<'EOF'
feat: map bookmark bar into two-level tab/group wall

EOF
)"
```

---

### Task 3: 搜索纯函数 + 测试

**Files:**
- Create: `lib/search.js`
- Create: `tests/search.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchBookmarkWall } from '../lib/search.js';

const wall = {
  tabs: [
    {
      id: '10',
      name: '2026',
      groups: [
        {
          name: 'AI工具',
          items: [
            { id: '1', title: 'Claude Code', url: 'https://claude.example/' },
            { id: '2', title: 'Other', url: 'https://other.example/' },
          ],
        },
      ],
    },
    {
      id: '__unnamed__',
      name: '未命名',
      groups: [
        {
          name: '未命名',
          items: [{ id: '3', title: 'VidBee', url: 'https://vidbee.example/' }],
        },
      ],
    },
  ],
};

describe('searchBookmarkWall', () => {
  it('returns empty for blank query', () => {
    assert.deepEqual(searchBookmarkWall(wall, '  '), []);
  });

  it('matches title or url case-insensitively with tab/group labels', () => {
    const hits = searchBookmarkWall(wall, 'CLAUDE');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, '1');
    assert.equal(hits[0].tabName, '2026');
    assert.equal(hits[0].groupName, 'AI工具');
  });

  it('searches globally across tabs', () => {
    const hits = searchBookmarkWall(wall, 'vidbee');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].tabName, '未命名');
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `npm test`

Expected: FAIL（模块不存在或函数未定义）

- [ ] **Step 3: 实现 `lib/search.js`**

```js
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
```

- [ ] **Step 4: 跑测确认通过**

Run: `npm test`

Expected: 全部 PASS

- [ ] **Step 5: Commit（若用户允许）**

```bash
git add lib/search.js tests/search.test.js
git commit -m "$(cat <<'EOF'
feat: add global bookmark wall search helper

EOF
)"
```

---

### Task 4: favicon 辅助

**Files:**
- Create: `lib/favicon.js`
- Create: `tests/favicon.test.js`

- [ ] **Step 1: 实现并测试 URL 构造（不依赖 Chrome 运行时）**

`lib/favicon.js`:

```js
export const PLACEHOLDER_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#dadce0"/></svg>`
  );

/**
 * @param {string} pageUrl
 * @param {string} [extensionOrigin] e.g. chrome.runtime.getURL('/').replace(/\\/$/, '')
 */
export function faviconUrlFor(pageUrl, extensionOrigin) {
  if (!pageUrl) return PLACEHOLDER_FAVICON;
  if (extensionOrigin) {
    const base = extensionOrigin.replace(/\/$/, '');
    return `${base}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
  }
  return PLACEHOLDER_FAVICON;
}
```

`tests/favicon.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from '../lib/favicon.js';

describe('faviconUrlFor', () => {
  it('returns placeholder without origin', () => {
    assert.equal(faviconUrlFor('https://a.com'), PLACEHOLDER_FAVICON);
  });

  it('builds chrome favicon endpoint with origin', () => {
    const u = faviconUrlFor('https://a.com/x', 'chrome-extension://abc');
    assert.equal(
      u,
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fa.com%2Fx&size=32'
    );
  });
});
```

- [ ] **Step 2: `npm test` 期望 PASS**

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add lib/favicon.js tests/favicon.test.js
git commit -m "$(cat <<'EOF'
feat: add favicon URL helper with placeholder fallback

EOF
)"
```

---

### Task 5: manifest + background + 占位图标

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: 写 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "书签墙",
  "version": "1.0.0",
  "description": "用 Tab + Grid 浏览书签栏",
  "permissions": ["bookmarks", "favicon"],
  "action": {
    "default_title": "打开书签墙",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

说明：`favicon` 权限用于 `/_favicon/`；若某 Chrome 版本不认可该权限名，改为文档所述回退占位（实现时以实际加载报错为准，优先保留占位逻辑）。

- [ ] **Step 2: 写 `background.js`**

```js
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('bookmarks.html');
  await chrome.tabs.create({ url });
});
```

注意：有 `onClicked` 时 **不要** 设置 `default_popup`，否则点击不会进 listener。

- [ ] **Step 3: 生成简单 PNG 占位图标**

Run（需本机有 Python3 + 可用 PIL 或用纯写最小 PNG）:

```bash
python3 - <<'PY'
import struct, zlib, pathlib
outdir = pathlib.Path('/Users/hss/my-chrome-bookmark/icons')
outdir.mkdir(exist_ok=True)

def png(size, rgb=(26, 115, 232)):
    r, g, b = rgb
    raw = b''.join(b'\x00' + bytes([r, g, b]) * size for _ in range(size))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

for s in (16, 48, 128):
    (outdir / f'icon{s}.png').write_bytes(png(s))
print('ok')
PY
```

- [ ] **Step 4: Commit（若用户允许）**

```bash
git add manifest.json background.js icons/
git commit -m "$(cat <<'EOF'
feat: add MV3 manifest and toolbar open handler

EOF
)"
```

---

### Task 6: 页面 HTML + CSS

**Files:**
- Create: `bookmarks.html`
- Create: `bookmarks.css`

- [ ] **Step 1: `bookmarks.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>书签墙</title>
    <link rel="stylesheet" href="bookmarks.css" />
  </head>
  <body>
    <header class="top">
      <h1 class="brand">书签墙</h1>
      <input
        id="search"
        class="search"
        type="search"
        placeholder="搜索书签（全局）"
        autocomplete="off"
      />
    </header>
    <nav id="tabs" class="tabs" aria-label="书签文件夹"></nav>
    <main id="main" class="main"></main>
    <script type="module" src="bookmarks.js"></script>
  </body>
</html>
```

- [ ] **Step 2: `bookmarks.css`**

```css
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #202124;
  --muted: #5f6368;
  --border: #dadce0;
  --accent: #1a73e8;
  --accent-soft: #e8f0fe;
  --radius: 8px;
  font-family: "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px 8px;
  flex-wrap: wrap;
}
.brand {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.search {
  flex: 1;
  min-width: 200px;
  max-width: 480px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 14px;
  background: var(--surface);
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 20px 16px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, #fbfbfc, var(--bg));
}
.tab {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}
.tab[aria-selected="true"] {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
  font-weight: 600;
}

.main { padding: 16px 20px 40px; }
.group { margin-bottom: 24px; }
.group-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  border-left: 3px solid var(--accent);
  padding-left: 8px;
}
.group-title.is-unnamed {
  border-left-color: #9aa0a6;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid #e8eaed;
  border-radius: var(--radius);
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.item:hover { border-color: var(--accent); }
.item img {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.meta {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.chip {
  font-size: 11px;
  color: var(--muted);
  background: #eee;
  border-radius: 4px;
  padding: 2px 6px;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: var(--muted);
  padding: 48px 12px;
  text-align: center;
}
```

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add bookmarks.html bookmarks.css
git commit -m "$(cat <<'EOF'
feat: add bookmark wall page shell styles

EOF
)"
```

---

### Task 7: 页面逻辑 `bookmarks.js`

**Files:**
- Create: `bookmarks.js`

- [ ] **Step 1: 实现加载、渲染、搜索、监听**

```js
import { buildBookmarkWall, UNNAMED } from './lib/bookmark-model.js';
import { searchBookmarkWall } from './lib/search.js';
import { faviconUrlFor, PLACEHOLDER_FAVICON } from './lib/favicon.js';

const tabsEl = document.getElementById('tabs');
const mainEl = document.getElementById('main');
const searchEl = document.getElementById('search');

/** @type {ReturnType<typeof buildBookmarkWall>} */
let wall = { tabs: [] };
let selectedTabId = null;
const extensionOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');

function favicon(url) {
  return faviconUrlFor(url, extensionOrigin);
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const tab of wall.tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.textContent = tab.name;
    btn.setAttribute('aria-selected', String(tab.id === selectedTabId));
    btn.addEventListener('click', () => {
      selectedTabId = tab.id;
      searchEl.value = '';
      render();
    });
    tabsEl.appendChild(btn);
  }
}

function itemLink(item, { showMeta = false } = {}) {
  const a = document.createElement('a');
  a.className = 'item';
  a.href = item.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const img = document.createElement('img');
  img.src = favicon(item.url);
  img.alt = '';
  img.addEventListener('error', () => {
    img.src = PLACEHOLDER_FAVICON;
  });

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  title.title = item.title;

  a.append(img, title);

  if (showMeta) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    for (const label of [item.tabName, item.groupName].filter(Boolean)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = label;
      meta.appendChild(chip);
    }
    a.appendChild(meta);
  }
  return a;
}

function renderGroups(groups, { hideSingleUnnamedTitle = false } = {}) {
  mainEl.innerHTML = '';
  if (!groups.length) {
    mainEl.innerHTML = `<p class="empty">这里还没有书签</p>`;
    return;
  }
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    const onlyUnnamed =
      hideSingleUnnamedTitle &&
      groups.length === 1 &&
      group.name === UNNAMED;
    if (!onlyUnnamed) {
      const h = document.createElement('h2');
      h.className = 'group-title' + (group.name === UNNAMED ? ' is-unnamed' : '');
      h.textContent = group.name;
      section.appendChild(h);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of group.items) {
      grid.appendChild(itemLink(item));
    }
    section.appendChild(grid);
    mainEl.appendChild(section);
  }
}

function renderSearchResults(query) {
  const hits = searchBookmarkWall(wall, query);
  mainEl.innerHTML = '';
  if (!hits.length) {
    mainEl.innerHTML = `<p class="empty">无匹配书签</p>`;
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const item of hits) {
    grid.appendChild(itemLink(item, { showMeta: true }));
  }
  mainEl.appendChild(grid);
}

function render() {
  renderTabs();
  const q = searchEl.value.trim();
  if (q) {
    renderSearchResults(q);
    return;
  }
  if (!wall.tabs.length) {
    mainEl.innerHTML = `<p class="empty">书签栏还没有内容</p>`;
    return;
  }
  const tab =
    wall.tabs.find((t) => t.id === selectedTabId) || wall.tabs[0];
  selectedTabId = tab.id;
  renderTabs();
  renderGroups(tab.groups, {
    hideSingleUnnamedTitle: tab.name === UNNAMED,
  });
}

async function reload() {
  const tree = await chrome.bookmarks.getTree();
  const prev = selectedTabId;
  wall = buildBookmarkWall(tree[0]);
  if (prev && wall.tabs.some((t) => t.id === prev)) {
    selectedTabId = prev;
  } else {
    selectedTabId = wall.tabs[0]?.id ?? null;
  }
  render();
}

searchEl.addEventListener('input', () => render());

for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
  chrome.bookmarks[ev].addListener(() => {
    reload();
  });
}

reload();
```

- [ ] **Step 2: 本地自检**

Run: `npm test`（仍应全部 PASS）

在 Chrome：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选本仓库根目录 → 点工具栏图标，目视验收（见 Task 8）。

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add bookmarks.js
git commit -m "$(cat <<'EOF'
feat: wire bookmark wall UI with search and live reload

EOF
)"
```

---

### Task 8: README + 手测清单

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 README**

Create `README.md` with:

- 标题「书签墙」与一句说明（MV3，Tab + Grid）
- 安装步骤：`chrome://extensions` → 开发者模式 → 加载已解压 → 选仓库根目录 → 点工具栏图标
- 开发命令：`npm test`
- 行为摘要三条：两层 Tab/Group + 未命名置底；搜索全局/清空恢复；点击新标签打开

- [ ] **Step 2: 手测清单（全部勾完才算完成）**

1. 工具栏点击打开全页  
2. Tab 自动换行；「未命名」在最后；无零散链接则无该 Tab  
3. 二级 Group 正确；三级链接落在二级 Group；「未命名」Group 在最后  
4. 点击书签新标签打开  
5. 搜索全局命中并显示 Tab/Group chip；清空恢复当前 Tab  
6. 在官方书签管理器增删改后本页自动刷新且尽量保持 Tab  

- [ ] **Step 3: Commit（若用户允许）**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: explain how to load the bookmark wall extension

EOF
)"
```

---

## Spec 覆盖自检

| Spec 要求 | Task |
| --- | --- |
| 工具栏全页 MV3 | 5, 7 |
| 原生无构建 | 全篇 |
| 两层 Tab/Group + 拍平 + 未命名置底 | 1–2 |
| flex Tab + grid item + favicon/标题 | 6–7 |
| 新标签打开 | 7（`<a target="_blank">`） |
| 全局搜索 / 清空恢复 | 3, 7 |
| 不做编辑删除 | 遵守 YAGNI |
| 空状态 / 空标题 / favicon 失败 | 2, 4, 7 |
| 书签变更刷新 | 7 |
| 仅书签栏 | 2（`findBookmarkBar`） |

无 TBD/占位步骤；类型命名在 Task 2/3/7 一致（`buildBookmarkWall` / `searchBookmarkWall` / `UNNAMED`）。
