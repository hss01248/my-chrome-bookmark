# 书签 Group / Tab 新建与重命名 — 设计规格

日期：2026-08-11  
状态：已确认

## 背景与目标

已有书签 item 编辑（弹层）、删除、拖拽，以及 Group/Tab 同级拖拽。本阶段补齐 **真实文件夹** 的新建与重命名，使 Tab / Group 文本可改、空文件夹可出现在墙面上。

## Chrome API

| UI | Chrome 节点 | API |
| --- | --- | --- |
| 新建 Tab | 书签栏子文件夹 | `chrome.bookmarks.create({ parentId: barId, title, index })` |
| 新建 Group | 当前 Tab 文件夹子文件夹 | `chrome.bookmarks.create({ parentId: selectedTabId, title, index })` |
| 重命名 | 对应 folder id | `chrome.bookmarks.update(id, { title })` |

`index`：对 `getChildren(parentId)`，取**第一个带 `url` 的子节点下标**；若无则 `children.length`（真实文件夹之后、松散书签之前，保证「未命名」置底）。

## 范围

### 做

- 悬停 ✎、双击标题 → 弹层重命名（仅名称字段，复用 `.edit-popover` 风格）
- Tab 栏「+」新建 Tab；当前真实 Tab 下「+」新建 Group
- 默认名：`新建文件夹`；trim 后空标题拒绝保存；Esc / 取消关闭
- 有名空文件夹 Group 仍渲染；虚拟「未命名」空 Group 仍不渲染
- 新建 Tab 成功后选中该 Tab；其余依赖现有 `onCreated` / `onChanged` → `reload`
- 与书签编辑弹层互斥

### 不做

- 删除文件夹、改父级、更深嵌套可视化
- 虚拟「未命名」Tab/Group 改名或提升为真实文件夹
- 「未命名」Tab 下新建 Group
- 新建书签链接（仅文件夹）
- 搜索模式下的新建 / 重命名入口

## 交互

### 入口

- **真实 Tab**：悬停显示 ✎；双击标题打开重命名弹层；栏末（未命名之前）「+」新建 Tab
- **真实 Group 标题**：悬停 ✎；双击打开重命名；主区「+ 新建分组」（仅非 `__unnamed__` Tab、非搜索）
- **虚拟未命名**：无 ✎、无双击改名、无对应新建误用

### 与拖拽共存

- ✎ / 「+」：`click` 时 `stopPropagation`，不启动 folder drag
- 双击打开弹层；`pointerdown` 后位移超过现有阈值仍进入拖拽

### 弹层

- `mode: 'create' | 'rename'`，单字段「名称」
- create 预填 `新建文件夹`；rename 预填当前名
- 失败时弹层内错误文案

### 空 Group UI

- 空 grid 显示轻量「暂无书签」，不阻塞后续拖入/新建书签

## 模型

`buildGroupsForFolder`：

- 保留所有真实子文件夹 Group（即使 `items` 为空）
- 仅「松散链接汇总」虚拟未命名（`folderId === 父文件夹 id && name === 未命名`）仍要求 `items.length > 0`

## 纯函数

- `normalizeFolderTitle(title)` → trim；空则 `null`
- `DEFAULT_FOLDER_TITLE = '新建文件夹'`
- `resolveNewFolderIndex(children)` → 松散书签前下标

## 文件

| 文件 | 角色 |
| --- | --- |
| `lib/bookmark-edit.js` | `normalizeFolderTitle`、`resolveNewFolderIndex`、`DEFAULT_FOLDER_TITLE` |
| `lib/bookmark-model.js` | 空有名 Group 保留 |
| `bookmarks.js` / `bookmarks.css` | 入口、弹层、create/update |
| `tests/*` | 模型与 edit helpers |
| `README.md` | 功能说明 |

## 验证

- 单测：normalize / index / 空文件夹进 wall
- 手测：新建位置在未命名前；重命名同步 Chrome；空 Group 可见；未命名与搜索无入口；拖拽仍可用
