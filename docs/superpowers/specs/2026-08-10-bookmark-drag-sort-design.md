# 书签拖拽排序 / 换文件夹 — 设计规格

日期：2026-08-10  
状态：已确认（待实现计划）

## 背景与目标

在现有书签 item 删除、编辑能力之上，增加拖拽以改变排序与所属文件夹。最终目标覆盖 item / Group / Tab；首版（Phase 1）只交付 **item 的组内排序 + 跨 Group 换文件夹**。

## Chrome API 调研结论

| 能力 | 支持情况 |
| --- | --- |
| 同文件夹排序 | ✅ `chrome.bookmarks.move(id, { index })` |
| 换文件夹 | ✅ `chrome.bookmarks.move(id, { parentId, index? })` |
| 额外权限 | ❌ 不需要；现有 `bookmarks` 已足够 |
| 变更回流 | ✅ 页面已监听 `onMoved` 等事件，move 成功后可走现有刷新路径 |

要点：

- `destination` 可同时提供 `parentId` 与 `index`；省略 `parentId` 表示留在当前父文件夹；省略 `index` 表示放到新父文件夹末尾。
- 同父文件夹内**向下**移动时，Chrome 的 index 语义常导致落点偏上一位；实现时若 `oldIndex < targetIndex` 需按约定补偿（常见做法：`targetIndex += 1`，并以单测锁住）。
- 不可移动：书签树根、`unmodifiable: "managed"` 节点。
- `onChildrenReordered` 仅在 UI 排序（非 `move()`）时触发；本功能走 `move()`，依赖 `onMoved` / 主动刷新即可。

## 与现有信息架构的关系

书签墙将 Chrome 树投影为两层：

- **Tab** = 书签栏一级文件夹（「未命名」Tab 为虚拟，id = `__unnamed__`）
- **Group** = 一级下的二级文件夹；「未命名」Group 为虚拟（松散挂在 Tab 文件夹下的链接）
- **更深层级**被拍平进对应 Group（`collectLinks`）

因此 UI 落点必须映射回真实 `parentId`：

| UI 落点 | Chrome `parentId` |
| --- | --- |
| 某真实 Group | 该二级文件夹 id |
| 「未命名」Group | 当前 Tab 对应的一级文件夹 id |
| 「未命名」Tab 内 | 书签栏 id（通常 `"1"`） |

拍平进 Group 的深层书签，其真实 `parentId` 可能不是 Group 文件夹。Phase 1 约定：在 UI Group 内排序或移入某 Group 时，**统一落到该 Group 对应文件夹**（必要时把深层书签「提升」到组文件夹）。这样插入线与视觉顺序可预测。

## 范围

### Phase 1（本规格实现范围）

- 当前 Tab 内容区：item 长按拖拽
- 同 Group 内改变相对顺序
- 拖到其他 Group（标题区 / 网格空区 / item 间插入线）以换文件夹并可指定位置
- 乐观 UI 可选；至少以 `move` 成功 + 现有树刷新为准
- 搜索模式下**禁用**拖拽

### 明确不做（后续阶段）

- Phase 2：拖 Group 标题调整同级 Group 顺序；item 跨 Tab
- Phase 3：拖 Tab 调整书签栏一级顺序
- 多选拖拽、从桌面拖入 URL、文件夹整树拖到自身子孙（非法环）的复杂 UI 提示以外的能力

## 交互设计

### 启动：长按

- 短按 / 点击：保持打开链接
- 在 item 上按下约 **400ms** 后进入拖拽态：卡片浮起、`cursor: grabbing`；指针移动超过小阈值才算拖拽开始，避免误触
- 编辑 / 删除按钮、右键菜单区域不启动长按拖拽
- 拖拽中阻止默认打开与文本选择

### 落点反馈

- **同 Group**：item 之间显示蓝色插入线（网格布局按指针最近边计算 before/after）
- **跨 Group**：目标 Group 容器高亮边框；若落在该组某 item 间，同时显示插入线
- 非法目标（自身、搜索结果、虚拟结构无法解析的节点）：无高亮，松开为取消

### 完成与失败

- 松手调用 `chrome.bookmarks.move`
- 成功：依赖现有 `onMoved` → 重新拉树渲染；尽量保持当前 Tab
- 失败：短暂 toast 提示，不持久错误态

## 架构

延续 edit / delete 模式：纯函数进 `lib/`，页面脚本管手势与 DOM。

```
lib/bookmark-model.js     # 扩展：item 携带 parentId/index；group 携带 folderId
lib/bookmark-move.js      # 纯函数：落点解析、index 补偿、move 参数构造
bookmarks.js              # 长按 / pointer 拖拽、插入线、调用 chrome.bookmarks.move
bookmarks.css             # 拖拽态、插入线、Group 高亮
tests/bookmark-move.test.js
tests/bookmark-model.test.js  # 补 folderId / parentId 映射断言
```

### 数据模型补充

```ts
// item
{
  id: string
  title: string
  url: string
  parentId: string
  index: number
}

// group
{
  name: string
  folderId: string   // 真实二级文件夹 id；「未命名」则为 tab 文件夹 id
  items: Item[]
}
```

Tab 上「未命名」虚拟 Tab 的 `folderId` 语义 = 书签栏 id。

### `bookmark-move` 核心 API（建议）

```ts
resolveDropDestination({
  dragged,
  targetGroupFolderId,
  // 目标组内「视觉上 before 此 item」；末尾则为 null
  beforeItem: { id, parentId, index } | null,
  // 目标组当前 children 的有序 id 列表（或同 parent 下的 index 视图）
  siblingSnapshot,
}): { parentId: string, index: number }

adjustIndexForSameParentMove(oldIndex, newIndex): number
```

页面在 drop 时：

1. 用 `resolveDropDestination` 得到 `{ parentId, index }`
2. 若与当前位置相同则 no-op
3. `await chrome.bookmarks.move(id, destination)`

### 手势实现取向

不用第三方库。使用 Pointer Events + 长按计时器：

1. `pointerdown` 启动计时；`pointerup` / `pointercancel` / 位移过大（长按未触发前）取消
2. 进入拖拽态后跟踪 `pointermove`，计算 hit-test（`elementFromPoint`）得到 Group / item
3. `pointerup` 提交 move 或取消

不依赖 HTML5 `draggable` 为主路径（长按后再 `draggable=true` 在部分浏览器不稳定）；自管「幽灵」卡片位移更可控。

## 错误处理与边界

- `get` 节点失败 / 已删除：取消拖拽
- move 被 Chrome 拒绝：toast
- 拖到空 Group：index = 该文件夹 children 长度（末尾）
- 同一位置松开：no-op
- 并发：单次拖拽完成前忽略新的长按；刷新 generation 机制沿用现有 `renderGeneration`

## 测试计划

纯函数单测（Node，对齐现有 `node:test`）：

1. 同父向上 / 向下移动的 index 补偿
2. 跨 Group：`parentId` 变为目标 `folderId`，index 正确
3. 落入「未命名」Group → `parentId` 为 Tab 文件夹 id
4. before 某 item / 落到末尾两种插入线语义
5. 深层拍平 item 在组内重排后 parent 归到 group `folderId`
6. model：group 带 `folderId`；item 带 `parentId`/`index`

手动（扩展页）：

1. 长按未移动松手 ≈ 不打开链接且不 move
2. 短按仍打开
3. 组内换序后与 `chrome://bookmarks` 一致
4. 拖到另一 Group 后位置正确
5. 搜索中无法拖

## 验收标准

1. Phase 1 仅 item；搜索禁用拖拽
2. 长按启动；点击打开不受破坏
3. 组内排序与跨 Group 移动均持久化到 Chrome 书签树
4. 「未命名」落点映射正确；拍平深层书签按「提升到组文件夹」语义工作
5. 单测覆盖 move 纯函数与 model 字段；无需新增权限
