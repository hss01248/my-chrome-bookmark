# Chrome 书签墙扩展 — 设计规格

日期：2026-08-05  
状态：已确认（待实现计划）

## 背景与目标

官方 `chrome://bookmarks` 为侧栏 + 长列表，浏览效率差。本扩展读取 Chrome 书签，用顶部可换行 Tab + 分组 Grid 展示，点击书签在新标签打开。

## 入口与形态

- **Manifest V3** Chrome 扩展
- 点击**工具栏图标** → 打开扩展内全页（`bookmarks.html`），由 service worker `chrome.action.onClicked` + `chrome.tabs.create` 打开
- **不做**新标签页覆盖、popup 小窗、Side Panel、劫持官方书签管理器

## 技术选型

- **原生 HTML / CSS / JS**，无构建工具、无框架
- 权限：`bookmarks`（读树 + 变更监听）；打开链接用 `<a target="_blank" rel="noopener">`，**不申请** `tabs`（除非后续发现必须用 API）
- 可选后续再加 `favicon` 相关权限；首版 favicon 策略见下文

### 建议文件结构

```
manifest.json
background.js          # service worker：点击图标打开全页
bookmarks.html
bookmarks.css
bookmarks.js           # 读树、映射、渲染、搜索
icons/                 # 16/32/48/128
```

## 信息架构：两层文件夹

整体只表达 **两层**：Tab（第 1 层）→ Group（第 2 层）。更深全部拍平。

### Tab 层（数据源：书签栏，通常 `id === "1"`）

| 书签栏直接子节点 | 映射 |
| --- | --- |
| 文件夹 | 一个 Tab（标题 = 文件夹名，顺序同 Chrome） |
| 书签链接 | 汇总进名为「未命名」的 Tab |

规则：

- 「未命名」Tab **永远排在最后**
- 若没有任何「直接挂在书签栏上的链接」，**不渲染**「未命名」Tab
- **不包含**「其他书签」及其子树（首版范围仅书签栏）

### Group 层（进入某个一级文件夹 Tab 后）

| 该文件夹直接子节点 | 映射 |
| --- | --- |
| 子文件夹 | 一个 Group（title = 子文件夹名） |
| 书签链接 | 汇总进名为「未命名」的 Group |
| 更深嵌套（孙文件夹及以下） | **拍平**：递归收集其中所有书签链接，并入对应的第 2 层 Group；不保留更深路径名 |

规则：

- 「未命名」Group **永远排在最后**
- 空的「未命名」Group **不渲染**
- 「未命名」Tab（书签栏根下零散链接）：其内容可视为单一扁平 Grid，或一个隐式/显式「未命名」Group；实现上统一为「仅一组，全部 item」，UI 可不重复显示 Group 标题「未命名」

### 书签 Item 模型

```ts
{
  id: string
  title: string      // 空则展示 url
  url: string
  faviconUrl: string
  tabName?: string   // 搜索结果用：所属 Tab
  groupName?: string // 搜索结果用：所属 Group
}
```

## UI 布局与交互

### Tab 栏

- `display: flex; flex-wrap: wrap`
- 从左到右排布，空间不足自动换行
- 选中态高亮；默认选中第一个 Tab（按排序后的列表）

### 内容区（某 Tab 选中时）

- Group 纵向排列
- 每个 Group：标题 + CSS Grid（如 `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`）
- Item：左 favicon（约 16px）+ 右标题（单行 ellipsis）；整卡可点
- 点击：新标签打开 `url`

### 搜索（v1 必做）

- 输入时：**全局搜索**（跨所有 Tab / Group），结果列表/网格展示匹配书签
- 结果项可展示所属 Tab / Group 小标签，便于定位
- 匹配字段：`title` 与 `url`（大小写不敏感包含即可）
- **清空搜索框**：回到「当前选中 Tab」的 Group/Grid 正常视图

### v1 明确不做

- 编辑 / 删除 / 重命名书签或文件夹
- 右键菜单、拖拽排序
- 暗色主题切换器（可用轻量 `prefers-color-scheme` 适配，非必须）

## Favicon

优先级：

1. 若扩展环境允许：`chrome-extension://<id>/_favicon/?pageUrl=...&size=32`（Chrome 扩展 favicon API）
2. 否则回退：透明/灰色占位图；`onerror` 切换占位
3. 不依赖第三方 s2 作为硬性依赖（可作最后回退，但需注意隐私与可用性）

## 数据流

1. `chrome.bookmarks.getTree()` → 找到书签栏节点
2. 映射为 `tabs: Array<{ id, name, groups: Array<{ name, items }> }>`
3. 渲染 Tab 栏 + 当前 Tab 内容；或搜索模式下渲染全局结果
4. 监听 `chrome.bookmarks.onCreated / onRemoved / onChanged / onMoved` → 重新拉树并映射；尽量保持当前选中 Tab id/名称与搜索框内容

## 空状态与错误

- 书签栏无任何可展示内容：友好空状态文案（如「书签栏还没有内容」）
- 当前 Tab 无书签：该区域空状态
- 搜索无结果：「无匹配书签」
- 标题为空：显示 url
- favicon 失败：灰色占位

## 测试要点（手测）

1. 工具栏点击打开全页
2. Tab flex 换行；「未命名」在最后；无零散链接时无「未命名」Tab
3. 二级 Group 正确；三级及以上书签出现在对应二级 Group；「未命名」Group 在最后
4. 点击书签新标签打开
5. 搜索全局命中；清空恢复当前 Tab
6. 在 Chrome 书签管理器增删改移后，本页自动刷新且尽量保持选中 Tab

## 成功标准

用户打开扩展页后，能按文件夹快速扫视书签栏结构，在网格中凭图标+标题找到目标，一键新标签打开；搜索能跨文件夹找回书签。
