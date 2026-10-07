# 元胞自动机沙盒 · 上传 GitHub 操作指南

> 项目位置：`C:\Users\洛渊\WorkBuddy\2026-10-06-17-52-52\ca-sandbox`
> 当前状态：✅ 本地 git 仓库已建好（分支 `main`，24 个文件已提交，工作区干净）
> 还差一步：关联远程仓库 → 上传

---

## 已经帮你做好的事

| 项目 | 状态 |
|---|---|
| 创建本地 git 仓库 | ✅ 分支 `main` |
| 首次提交 | ✅ 24 个文件，commit `46b4d6e` |
| 提交作者身份 | ✅ `Luoyuan0101 <13311189941@163.com>`（你自己的账号，不是占位） |
| `node_modules`（307 MB）排除 | ✅ |
| `.next`（32 MB）排除 | ✅ |
| `.verify3` 调试脚手架排除 | ✅ |
| 敏感文件自查 | ✅ 无 `.env` / 密钥 / token |
| 提交体积 | ✅ 仅 310 KB |
| README.md | ✅ 已写好（仓库首页会显示） |

**你现在只需要做下面一件事：打开 GitHub Desktop → 发布仓库。**

---

## 路线 A：用 GitHub Desktop（推荐，最省事）

### 第 1 步 · 打开 GitHub Desktop

Windows 搜索「GitHub Desktop」打开。如果没登录，先点 **Sign in to GitHub.com** 完成登录。

### 第 2 步 · 添加本地仓库

菜单 **File → Add Local Repository…** → 点 **Choose…** → 选中这个文件夹：

```
C:\Users\洛渊\WorkBuddy\2026-10-06-17-52-52\ca-sandbox
```

→ 点 **Add Repository**

> ⚠️ 关键：要选到 `ca-sandbox` 这一层，**不要**选它的上一层。
> 因为仓库已经存在，不会提示"是否创建"，会直接添加成功。

### 第 3 步 · 发布

1. 上方点 **Publish repository**
2. **Name** 填 `ca-sandbox`（或你喜欢的名字，比如 `cellular-automata-sandbox`）
3. **Description** 可以填：`元胞自动机沙盒：火灾蔓延模拟与科学探究`
4. **Keep this code private** 要不要勾：
   - **要交作业 → 不勾（公开）**，最省事
   - 若一定要私有，发布后到网页 **Settings → Collaborators** 把老师账号加进去
5. 点 **Publish repository**

完成！网页打开 `https://github.com/Luoyuan0101/ca-sandbox` 就能看到代码。
**把这条链接记下来交给老师。**

### 第 4 步 · 以后每次修改

在 Desktop 里：
1. 左侧 **Changes** 会列出你改动的文件
2. 左下 **Summary** 填一句说明，例如「调整火势蔓延速度」
3. 点 **Commit to main**
4. 再点上方 **Push origin** 上传

> Commit = 存到本地；Push = 传到 GitHub。两步都做完才算上传成功。

---

## 路线 B：命令行（更快）

你的机器 git 2.55.0 已装好，且全局身份已配好。

### 第 1 步 · 网页建空仓库

1. 打开 https://github.com → 右上角 **+** → **New repository**
2. **Repository name** 填 `ca-sandbox`
3. **Add a README / .gitignore / license 全部不要勾**（勾了会和本地版本冲突）
4. 点 **Create repository**
5. 复制 HTTPS 地址，形如 `https://github.com/Luoyuan0101/ca-sandbox.git`

### 第 2 步 · 终端执行

```bash
cd "C:/Users/洛渊/WorkBuddy/2026-10-06-17-52-52/ca-sandbox"

git remote add origin https://github.com/Luoyuan0101/ca-sandbox.git

git push -u origin main
```

第一次 push 会弹登录窗口，选 **Sign in with your browser** → 浏览器授权 → 自动继续。
看到 `branch 'main' set up to track 'origin/main'` 就成功了。

### 第 3 步 · 以后每次修改

```bash
cd "C:/Users/洛渊/WorkBuddy/2026-10-06-17-52-52/ca-sandbox"
git add -A
git commit -m "改了什么的说明"
git push
```

---

## 仓库里会有什么（24 个文件）

```
ca-sandbox/
├─ README.md                    ★ 仓库首页说明
├─ package.json / package-lock.json
├─ tsconfig.json / next.config.mjs
├─ tailwind.config.ts / postcss.config.mjs
├─ app/
│  ├─ page.tsx                  首页（两个沙盒入口）
│  ├─ layout.tsx                全局骨架
│  ├─ globals.css
│  ├─ fire/page.tsx             ★ 火灾沙盒主页面
│  └─ disease/page.tsx          传染病沙盒（占位）
├─ components/
│  ├─ FireCanvas.tsx            Canvas 渲染（4000 格）
│  ├─ ControlPanel.tsx          参数面板
│  ├─ TerrainEditor.tsx         地形编辑器
│  └─ StatsChart.tsx            手绘 SVG 折线图
├─ lib/
│  ├─ fireModel.ts              ★ 模型核心（状态机/蔓延/消防队/地形）
│  └─ export.ts                 PPT / Word / CSV / JSON 导出
├─ preview/                     零构建演示版
│  ├─ fireModel.js
│  ├─ index.html
│  ├─ serve.mjs
│  └─ package.json
└─ 火灾模拟汇报_样例.pptx        样例 PPT
```

### 没有上传的（刻意排除）

| 排除项 | 大小 | 原因 |
|---|---|---|
| `node_modules/` | 307 MB | 依赖包，别人 `npm install` 就能重建 |
| `.next/` | 32 MB | 构建产物，自动生成 |
| `.verify3/` | — | 我调试用的脚手架，不属于项目 |
| `.env` 等 | — | 密钥类文件，绝对不能传 |

> 自查命令：`git ls-files` 列出所有被跟踪的文件，扫一眼有没有不该出现的。

---

## 常见问题

**Q：push 报 `failed to push some refs` / `rejected`**

建仓库时勾了 README 或 .gitignore。执行：

```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

**Q：GitHub Desktop 里 Changes 一片空白**

说明没有新改动，正常。你已经提交过一次了，直接点 **Publish repository**。

**Q：老师要能看到私有仓库**

网页进仓库 → **Settings → Collaborators → Add people** → 输入老师 GitHub 用户名或邮箱 → 等对方接受邀请。

**Q：clone 下来跑不起来 / 白屏**

项目依赖 Next.js，需要先装依赖：

```bash
npm install
npm run dev
```

打开 http://localhost:3000

如果只是想快速看看效果，**不用装依赖** —— `preview/` 里有零构建版本：

```bash
cd preview
node serve.mjs
```

访问 http://127.0.0.1:3300 即可（功能与正式版一致）。

**Q：想改仓库名字**

网页进仓库 → **Settings** → 顶部 **Rename**。

---

## 附：提交历史

```
46b4d6e  火灾蔓延元胞自动机沙盒：五状态燃烧模型 + 智能消防队 + 地形编辑器 + PPT/Word 导出
```

想再看一次：`git log --oneline`
