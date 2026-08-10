# 书签 Group / Tab 拖拽排序 — 设计规格（Phase 2）

日期：2026-08-10  
状态：已确认（待实现计划）

## 背景

Phase 1 已支持书签 item 长按拖拽（组内排序、跨 Group 换文件夹）。本阶段补齐 **Group 标题** 与 **Tab** 的同级排序，与 Chrome 书签栏 / 二级文件夹顺序对齐。

## Chrome API

沿用 `chrome.bookmarks.move(id, { parentId?, index? })`。

| UI 对象 | Chrome 节点 | 落点 |
| --- | --- | --- |
| Tab（真实一级文件夹） | 书签栏子文件夹 | `parentId = 书签栏 id`，`index` 为栏内兄弟位置 |
| Group（真实二级文件夹） | 当前 Tab 文件夹的子文件夹 | `parentId = 当前 Tab 文件夹 id`，`index` 为组间兄弟位置 |

Index 语义与 Phase 1 相同：传入 **当前 children 列表中「插到 ahead 节点之前」的下标**；同父向下移动时由 Chromium `BookmarkModel::Move` 自行 `index--`。复用 `getChildren` + 与 Phase 1 同类的「beforeChildId → index」解析（可抽公共 helper）。

## 范围

### 做

- **Tab**：按下标题即可拖；仅在 Tab 栏内同级重排；插入指示（竖线 / 缝）
- **Group**：按下 Group 标题即可拖；仅在当前 Tab 的 Group 列表内同级重排；插入指示（横线）
- 成功后依赖已有 `onMoved` → `reload`；保持当前 `selectedTabId`；尽量保持主区滚动（沿用 Phase 1 scroll helper）
- 与 item 拖拽互斥：同时只允许一种拖拽会话

### 不做

- item 跨 Tab（可另开 Phase 2.5）
- 「未命名」**虚拟** Tab（`id === '__unnamed__'`）不可拖
- 「未命名」**虚拟** Group（无独立 folder，仅松散链接）不可拖
- 把 Tab 拖成某 Group 子级、或把 Group 拖进另一 Tab（本阶段只做同级排序，不改父级）
- 搜索模式下的 Group/Tab 拖拽（搜索时 Tab 栏已隐藏）

## 交互

### 启动

- Tab 按钮、Group 标题（`.group-title`）：`pointerdown` 后位移超过约 6–8px 即进入拖拽（标题不可打开链接，无需长按）
- 点击（几乎无位移松手）：Tab 仍切换选中；Group 标题无额外动作（或保持现状仅作标题）
- item 卡片区域不启动 Folder 拖拽

### 反馈

- 拖源半透明；幽灵跟随指针
- Tab：目标缝显示竖向插入线
- Group：目标缝显示横向插入线（与 item 的 `.drop-indicator` 可复用样式变体）
- 非法落点（其他层级、虚拟节点）：无高亮，松开取消

### 虚拟节点

- 未命名 Tab / Group：`draggable=false` / 不绑 folder 拖拽
- 真实节点不可插入到「虚拟未命名」缝的「作为文件夹目标」——排序时虚拟未命名始终置底：真实文件夹只能在彼此之间排序，不可排到未命名之后改变「未命名置底」规则；若 UI 中未命名在末尾，只允许在真实 Groups/Tabs 之间插入

## 架构

```
lib/bookmark-move.js     # 扩展：resolveFolderReorderDestination(childIds, draggedId, beforeId)
bookmarks.js             # Tab / Group 指针拖拽会话（可与 item 会话共用结构或并列）
bookmarks.css            # tab/group drag ghost、竖线指示
tests/bookmark-move.test.js
```

`buildBookmarkWall` 已提供 Tab `id`（文件夹 id）与 Group `folderId`；虚拟节点继续用 `__unnamed__` / 名称判断禁用拖拽。

### 落点解析（文件夹同级）

```ts
resolveFolderReorderDestination({
  draggedId: string,
  childIds: string[],      // getChildren(parentId).map(c => c.id)
  beforeId: string | null, // null = append among siblings（但受「未命名置底」约束时 append = 最后一个真实文件夹之后、虚拟之前）
}): { parentId: string, index: number }
```

实现：在完整 `childIds` 上取 `beforeId` 的下标（或 length）；Chromium 同父语义不再手动 +1。

对 Tab：`parentId = 书签栏 id`（`findBookmarkBar`）。  
对 Group：`parentId = selectedTab.id`（非 `__unnamed__`）。

当 siblings 中存在「栏上的松散链接」或「Tab 下松散链接」时，`childIds` 含书签与文件夹混排：只对 **文件夹节点** 做 UI 排序；计算 before 时 ahead 目标必须是文件夹 id。松散链接保持其相对位置即可（只 move 被拖文件夹）。

## 错误处理

- move 失败：toast「移动失败」
- 拖到自身相邻缝（Chromium no-op）：直接忽略
- managed / 不可改节点：失败 toast

## 测试

单测：

1. 文件夹同级：before 某 sibling / append 的 index
2. 与 item 解析分离，不破坏现有 item 用例

手动：

1. 拖 Tab 改变顺序，与 `chrome://bookmarks` 书签栏一致；未命名 Tab 不能拖且仍在末尾
2. 拖 Group 标题排序，二级文件夹顺序正确；未命名 Group 不能拖
3. 短按 Tab 仍切换；item 长按拖拽仍可用
4. 拖拽中刷新不残留幽灵

## 验收

1. 仅同级排序；虚拟未命名不可拖且置底规则不变  
2. 按下即拖（小位移阈值）；不与 item 拖拽冲突  
3. 持久化到 Chrome；单测覆盖 folder reorder helper
