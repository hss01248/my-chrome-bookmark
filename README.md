# 书签墙

MV3 Chrome 扩展：用 Tab + Grid 浏览书签栏，工具栏图标打开全页视图。

## 安装

1. 打开 `chrome://extensions`
2. 开启 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 **包含 `manifest.json` 的目录**（本仓库根目录 `/Users/hss/my-chrome-bookmark`）
5. 点击浏览器工具栏中的扩展图标打开书签墙

## 开发

```bash
npm test
```

## 行为

- **两层 Tab / Group**：一级 Tab 对应书签栏文件夹；二级 Group 展示该 Tab 下的子文件夹；三级链接归入对应 Group。「未命名」Tab / Group 始终排在最后；若无零散链接则不显示「未命名」Tab。
- **全局搜索**：搜索命中所有 Tab 与 Group，并显示 Tab / Group chip；清空搜索框后恢复当前 Tab 视图。
- **打开方式**：点击书签在新标签页打开。

## 手测清单

完成以下验收后再视为可用：

- [ ] 点击工具栏图标，打开全页书签墙
- [ ] Tab 自动换行；「未命名」Tab 在最后；无零散链接时不显示该 Tab
- [ ] 二级 Group 划分正确；三级链接落在对应 Group；「未命名」Group 在最后
- [ ] 点击书签在新标签页打开
- [ ] 搜索可全局命中并显示 Tab / Group chip；清空后恢复当前 Tab
- [ ] 在 Chrome 官方书签管理器增删改后，本页自动刷新并尽量保持当前 Tab
