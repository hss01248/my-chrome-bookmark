# 从导航站导入 Chrome 书签

把 [navi.hss01248.tech](https://navi.hss01248.tech/#/navi/home) 的 **Tab → Group → 链接** 写成书签栏的两层文件夹，以便书签墙与网站观感一致。

| 导航站 | Chrome 书签栏 | 书签墙 |
| --- | --- | --- |
| Tab | 一级文件夹 | 顶部 Tab |
| Group | 二级文件夹 | Group |
| Item | 书签 | 卡片 |

**不要**再套一层「Navi」总文件夹，否则墙只会看到一个 Tab，原 Group 会被拍平。

数据源（公开 API）：

- `GET https://navi-api.hss01248.tech/navi/nav-tab/getTabs`
- `POST https://navi-api.hss01248.tech/navi3/navi-item-group/getAll2`，body `{"tabId": N}`

---

## Netscape HTML 导入

### 1. 生成文件

在仓库根目录：

```bash
npm run navi:html
# 或指定输出路径
node scripts/navi-to-bookmarks-html.js -o /tmp/navi-bookmarks.html
```

默认写出 `dist/navi-bookmarks.html`。控制台会打印 tabs/groups/items 数量，以及跳过项（空 Tab、空 Group、非 http(s) 链接）。

### 2. 备份现有书签

Chrome → `chrome://bookmarks` → 右上角 ⋮ → **导出书签**，保存一份 HTML 备份。

### 3. 导入

`chrome://bookmarks` → ⋮ → **导入书签** → 选中上一步生成的 HTML。

### 4. 确认落点（重要）

书签墙**只读书签栏**，不读「其他书签」。

- 若导入结果出现在 **书签栏** 下（每个导航 Tab 一个一级文件夹）→ 打开书签墙即可核对。
- 若落在 **其他书签** /「已导入」文件夹 → 在书签管理器里把那批一级文件夹**拖到书签栏**，再打开书签墙。

### 5. 注意

- 再次导入同名文件夹会**并排出现**，不会自动合并。
- `description` 不会写入 Chrome 书签。
- 空 Tab（如无分组的「spring boot项目」）和非法 URL 会被跳过。

---

## 相关代码

| 文件 | 作用 |
| --- | --- |
| [`lib/navi-import.js`](../lib/navi-import.js) | 树映射、Netscape HTML、去重计划 |
| [`lib/navi-fetch.js`](../lib/navi-fetch.js) | 拉 getTabs + getAll2 |
| [`lib/navi-apply.js`](../lib/navi-apply.js) | 用 `chrome.bookmarks.create` 执行计划（库/测试用） |
| [`scripts/navi-to-bookmarks-html.js`](../scripts/navi-to-bookmarks-html.js) | CLI 导出 HTML |
| [`tests/navi-import.test.js`](../tests/navi-import.test.js) | 单测 |
