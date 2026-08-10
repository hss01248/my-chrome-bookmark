# 用 Cloudflare Pages 托管隐私政策（国内更稳）

Chrome 商店审核仍可用 GitHub Pages；若希望**中国大陆用户**也能较稳定打开隐私政策，可把同一页面再部署到 Cloudflare Pages，商店表单改填 Cloudflare 域名。

源文件：仓库内 `docs/privacy.html`  
当前 GitHub Pages（备用）：https://hss01248.github.io/my-chrome-bookmark/privacy.html

---

## 方式 A：Dashboard 点选（推荐，零 CLI）

1. 注册/登录 https://dash.cloudflare.com  
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权并选择仓库 `hss01248/my-chrome-bookmark`
4. 构建设置：
   - Framework preset: **None**
   - Build command: **留空**
   - Build output directory: **`docs`**
   - Root directory: `/`（默认）
5. **Save and Deploy**
6. 部署完成后会得到类似：
   - `https://my-chrome-bookmark.pages.dev/privacy.html`  
   或你自定义的 `https://<project>.pages.dev/privacy.html`
7. 用浏览器打开该 URL，确认能看到「书签墙 - 隐私政策」标题
8. 将该 **HTTPS URL** 填入 Chrome Web Store → Privacy → Privacy policy

之后每次 `main` 有 `docs/` 变更，Cloudflare 会自动重新部署（取决于你在 Pages 里勾选的生产分支）。

### 可选：自定义域名

在 Pages 项目 → **Custom domains** 绑定你已有域名（若面向国内且要备案域名，需按中国法规自行处理备案；`.pages.dev` 一般无需备案但国内仍可能偶发波动）。

---

## 方式 B：Wrangler CLI（可选）

```bash
npm i -g wrangler
wrangler login
# 在仓库根目录一次性直传 docs（适合手动发版）
wrangler pages deploy docs --project-name=my-chrome-bookmark
```

---

## 商店填哪个 URL？

| 场景 | URL |
|------|-----|
| 默认 / 审核够用 | `https://hss01248.github.io/my-chrome-bookmark/privacy.html` |
| 希望国内打开更稳 | Cloudflare 给的 `https://xxxx.pages.dev/privacy.html` |

**只填一个**隐私政策链接即可；选你更在意可达性的那个。

---

## 注意

- Cloudflare 免费节点对中国访问通常好于裸 `github.io`，但**不保证**全国各地、各运营商都快。
- 若必须「国内绝对可达」，需国内云厂商静态托管 + 备案域名（阿里云 OSS/COS、腾讯云等）。
- jsDelivr 链接常返回 `text/plain`，**不要**用作商店隐私政策主 URL。
