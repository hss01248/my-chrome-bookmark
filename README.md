# 书签墙（Bookmark Wall）

Manifest V3 Chrome 扩展：用顶部可换行 Tab + 分组 Grid 浏览 Chrome **书签栏**，点击工具栏图标打开全页。

| 项 | 值 |
| --- | --- |
| 仓库 | https://github.com/hss01248/my-chrome-bookmark |
| 入口文件 | 仓库根目录的 `manifest.json` |
| 权限 | `bookmarks`、`favicon` |
| 运行时 | 原生 HTML/CSS/JS，无构建步骤 |

---

## 给 AI Agent：快速安装（Load Unpacked）

目标：让扩展出现在 Chrome，并可用工具栏图标打开书签墙。

### 前提

- 本机已安装 Google Chrome（或 Chromium）。
- 当前工作区包含 `manifest.json`（扩展根目录 = 仓库根目录）。
- **不要**把子目录（如 `docs/`、`lib/`）当成扩展根目录去加载。

### 步骤（必须按序）

1. 确认扩展根目录绝对路径（含 `manifest.json`），例如：
   ```bash
   ls "$(pwd)/manifest.json"
   ```
2. 在 Chrome 打开：`chrome://extensions`
3. 右上角打开 **开发者模式（Developer mode）**
4. 点击 **加载已解压的扩展程序（Load unpacked）**
5. 在文件选择对话框中选择**上一步的扩展根目录**（选中含 `manifest.json` 的那一层）
6. 首次加载后，Chrome 可能询问书签权限 → **允许**
7. 点击工具栏上的「书签墙」图标（必要时在扩展拼图菜单中固定到工具栏）
8. 应打开全页 `bookmarks.html`，看到顶部 Tab 与书签网格

### 成功判据

- `chrome://extensions` 列表中有「书签墙」，无错误红字。
- 点击工具栏图标可打开书签墙页面。
- 页面能列出书签栏下的文件夹 Tab（若用户书签栏为空，会显示空状态文案，也算成功）。

### 更新代码后

修改源码后，在 `chrome://extensions` 找到「书签墙」→ 点 **重新加载（Reload）**，再刷新已打开的书签墙标签页。

### Agent 常见失败

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 找不到 `manifest.json` | 选错目录 | 选仓库根目录 |
| Service worker 报错 | 文件缺失/语法错误 | 看扩展「错误」详情；先跑 `npm test` |
| 点图标无反应 | `default_popup` 误配或 SW 挂了 | 本项目无 popup，依赖 `background.js` 的 `action.onClicked` |
| 无书签显示 | 未授 `bookmarks` 或书签栏为空 | 检查权限；确认书签栏有内容 |

> Agent **无法**代替用户在 GUI 中完成「加载已解压」；请输出上述路径与步骤，并请用户点选，或在用户已授权的自动化环境中操作。

---

## 给人看：安装

1. 打开 `chrome://extensions`
2. 开启 **开发者模式**
3. **加载已解压的扩展程序** → 选择本仓库根目录（里面有 `manifest.json`）
4. 点击工具栏「书签墙」图标打开全页

克隆后本地路径示例：

```bash
git clone https://github.com/hss01248/my-chrome-bookmark.git
cd my-chrome-bookmark
# 然后在 Chrome 里 Load unpacked → 选择该目录
```

---

## 功能行为

- **Tab**：书签栏一级文件夹；栏上零散链接归入末尾「未命名」Tab（无则不显示）。
- **Group**：当前 Tab 下二级子文件夹；更深层级书签拍平进对应 Group；无归属的归「未命名」Group（末尾，空则不显示）。
- **网格**：favicon + 标题（最多两行）；点击新标签打开。
- **左侧导航**：多 Group 时显示，点击平滑跳转。
- **搜索**：全局搜标题/URL；搜索时隐藏 Tab 栏；清空后恢复。结果右侧竖排显示 Tab、以及非「未命名」的 Group。
- **滚动**：下滚隐藏「书签墙 + 搜索」标题行，Tab 仍置顶；回到顶部恢复。
- **实时**：书签增删改移后自动刷新。

数据范围：仅 **书签栏**，不含「其他书签」。

---

## 开发

```bash
npm test          # Node 单测（映射 / 搜索 / favicon URL）
npm run pack      # 打商店包 → dist/bookmark-wall-<version>.zip
```

无 `npm install` 必要依赖也可跑测试（仅用 Node 内置 `node:test`）。

### 目录（Agent 定向）

```
manifest.json          # 扩展清单（根）
background.js          # 点击图标 → 打开 bookmarks.html
bookmarks.html|css|js  # 全页 UI
lib/                   # 纯逻辑（可单测）
icons/                 # 16 / 48 / 128
scripts/pack-store.sh  # 打包
docs/privacy.html      # 隐私政策草稿（商店用）
tests/                 # 单测
```

不要把测试、docs、`.git` 打进扩展运行目录的“加载”选择——Load unpacked 仍选**仓库根**即可（Chrome 会读 manifest，多余文件通常无妨；商店 zip 由 `npm run pack` 过滤）。

---

## 商店发布备忘

1. `npm run pack` 得到 `dist/bookmark-wall-*.zip`
2. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) 上传
3. 隐私政策：将 `docs/privacy.html` 挂到公网 HTTPS，URL 填入 Privacy 表单  
   （本仓库若为 Private，免费 GitHub Pages 不可用，需自备托管）
4. 准备截图（1280×800 或 640×400）与小宣传图（440×280）

---

## 手测清单

- [ ] 工具栏图标打开全页
- [ ] Tab 换行；「未命名」逻辑正确
- [ ] Group / 拍平 / 左侧跳转正确
- [ ] 点击书签新标签打开
- [ ] 搜索与清空恢复；多书签 Tab 切换不卡顿
- [ ] 官方书签管理器改动后本页刷新
