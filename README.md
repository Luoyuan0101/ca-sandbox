# 元胞自动机沙盒 · CA Sandbox

一个用「元胞自动机」做科学探究的小平台。

不用公式、不解方程 —— 只给每一格定几条最简单的局部规则，然后在旁边看着，
整片火场该烧成什么样，自己就长出来了。这就是**涌现（emergence）**。

---

## Members & Progress

> Members and current status, as required by the course conventions.
> Everything below this section is written in Chinese, because the sandbox is
> used in class by Chinese-speaking students and the in-app wording has to match.
> The project review in [`plan.md`](plan.md) is written in English.

**Project:** a cellular-automata sandbox for wildfire spread. The goal is not to
predict a specific real fire, but to make one question testable: *does attacking
a fire early matter, and by how much?*

| Member | GitHub username | Role |
|---|---|---|
| 郭俊辰 | [@Luoyuan0101](https://github.com/Luoyuan0101) | Sole author — model, renderer, UI, writing |

**Status: working.** A complete experiment loop runs end to end —
generate a map → ignite it → watch it spread → read the burned fraction.

**Done**

- Five-state combustion model (normal → ember → heating → burning → ash) with
  fuel types, moisture, humidity, wind and rain
- Fire crews with configurable count, arrival delay and tactic
- Procedural terrain, plus a real-world mode using built-in lat/lon outlines of Eurasia
- Elevation view, mouse-wheel zoom, full-screen mode, adjustable playback speed
  (0.25×–2×) and fast-forward
- Live statistics chart; export to CSV / JSON / Word / PPT
- Entry page with a sandbox picker, plus a self-contained single-file build;
  the full site is deployed to GitHub Pages

**In progress / planned**

- The epidemic (SIR) sandbox is still a placeholder page
- Spotting distance: firebrands currently ignore distance, which makes a firebreak
  binary (blocked / not blocked) instead of a gradient. See `plan.md` §7.

---

## 🔥 在线演示

**https://luoyuan0101.github.io/project-ca-fire/**

点开即玩，不用安装任何东西。线上跑的是**完整的 Next.js 站点**，
所以从入口页可以进入火灾沙盒，也能打开传染病占位页。

> 如果打不开或页面空白：GitHub Pages 首次部署需要 1–2 分钟。
> 到仓库的 **Actions** 标签页看部署进度，跑完了再刷新。

---

## 这是什么

一个可调尺寸的格子世界，默认 **160 × 90（14,400 格）**。
每个格子只知道两件事：**自己是什么**、**邻居在干什么**。
在这之上跑了两个沙盒：

| 沙盒 | 状态机 | 状态 |
|---|---|---|
| 🔥 火灾蔓延 | 正常 → 火星 → 升温 → 燃烧 → 灰烬 | ✅ 已完成 |
| 🦠 传染病传播 | SIR 模型（易感 / 潜伏 / 感染 / 康复） | 🚧 规划中 |

---

## 火灾沙盒里有什么

### 五个状态，一条链子

```
正常 ──点燃──▶ 火星 ──▶ 升温 ──▶ 燃烧 ──燃尽──▶ 灰烬
```

关键在于**不是「一点就着」**。火要一格一格地爬过中间状态，所以蔓延是有速度、有节奏的，
不会「唰」地一下铺满全屏 —— 这也正是真实火场的模样。

### 消防队是有脑子的

- **从地图四角出发**，不会凭空出现在火场中心
- **只打火线**：已经烧成焦土、「死火」了的格子，理都不理
- **不走焦土**：灰烬不可通行，绕行过去
- **先保命**：万一火追上来了，先撤到安全地面，下一轮再干活
- **停在火边**：贴近到 1 格就动手，绝不踏进火里
- **两种战术**：扑打明火 / 打湿隔离带（火大了会**分兵**，一半扑火一半开带）

还可以直接**关掉消防队**，看看无人发现、任由它烧会怎样。

### 湿隔离带 —— 唯一真能灭火的东西

新增了第 6 个状态 `湿隔离带`。火过不去，但**它会慢慢蒸干**，干了之后火照样冲过来。
所以开隔离带是跟时间赛跑。

### 地图是地球上真实存在的一块地方

点侧栏的「**🗺 更换地图**」，第一页就是**真实世界**。目前内置的是**亚欧大陆**：

| 项 | 值 |
|---|---|
| 经纬度范围 | 西经 11° ~ 东经 147°，南纬 10° ~ 北纬 75° |
| 实地跨度 | 约 14,600 km × 7,200 km |
| 陆地占比 | 稳定 **43.5%**（80×50 到 320×200 都一样） |
| 默认网格 | 144×90，1 格 ≈ 95 km |

**轮廓是矢量多边形，不是位图** —— 它内置在代码里（`lib/atlas.ts`），
所以放大到任何网格分辨率都不会糊，也不依赖任何外部图片或网络请求。
用的是**射线法（奇偶规则）**做点内判定：每个格子问一句"这个经纬度在陆地上吗"。

植被**不是随机撒的，是按纬度气候带定的** ——

| 纬度带 | 气候 | 长什么 |
|---|---|---|
| < 10° | 赤道雨林 | 阔叶林，常年湿 |
| 18° ~ 30° | 副热带干旱带 | 枯草 / 荒漠（撒哈拉、阿拉伯） |
| 30° ~ 40° | 地中海气候 | 灌木与草地 |
| 40° ~ 55° | 温带西风带 | 阔叶林、混交林 |
| 55° ~ 65° | 寒温带 | 针叶林（西伯利亚那种） |
| > 65° | 苔原 | 矮灌木、裸地 |

实测结果和真实地理对得上：副热带 95% 是枯草，
温带 81% 阔叶 + 16% 针叶，寒温带 85% 针叶。

**为什么这件事有意义** —— 因为"火在寒带针叶林里烧"和"火在热带雨林里烧"
完全是两回事。前者燃料干、连片、烧得凶；后者湿、碎、往往烧不起来。
只有纬度真的对应上植被，地图上那条从西伯利亚斜到东南亚的线才有物理含义。

### 换地图是一个独立子页面

「随机生成」「绘画地图」「导入载入」都收进了一个弹窗里，分四个页签：

| 页签 | 干什么 |
|---|---|
| 🌍 真实世界 | 载入亚欧大陆（矢量轮廓） |
| 🎲 随机生成 | 程序生成地貌，**每次换一种品种** |
| 🖌 绘画地图 | 自己一笔一笔刷地形 |
| 💾 导入 / 载入 | 存取地图存档 |

**为什么要收起来**：现在的主角是真实世界地图，打开就应该看到亚欧大陆。
这些操作都是「换地图」的手段，平铺在侧栏里会抢主角的注意力。

### 随机地图不会每次都长一个样

点「🎲 随机换一片」，每次都会换一个**地貌品种**：

| 品种 | 火场脾气 |
|---|---|
| 连绵山脊 | 山连山、沟壑纵横，火会被山脊拖住 |
| 河谷盆地 | 几条大河横贯，河就是现成的隔离带 |
| 高原缓坡 | 一望无际的缓坡草甸，火走得很远很快 |
| 湖沼密布 | 水面把地切成碎块，火的传播被反复打断 |
| 干旱疏林 | 土薄树稀、枯草连片，一点就着但没什么可烧 |
| 连片密林 | 针叶林铺满大半个图，最难打的一种火场 |

每个品种有自己的高程参数（山多高、山脊多锋利）、水系参数
（湖面高低、河多长）、人类参数（城镇密度、林道数量）和植被参数。

实测连点 6 次 → **6 张互不相同的图、5 种不同的品种**；
6000 次抽样里六个品种的分布是 16.1% ~ 17.2%（期望 16.7%），非常均匀。

**同一颗种子永远给同一片地**（科学探究要能重复实验），
但换一颗种子就是另一个地方。

### 地形不再是色块，是真的地貌

点一下「**生成真实地貌**」，地图会用**值噪声 + 分形叠加（fBm）**算出一片自然林区：

1. **高程场** —— 多层 fBm 叠出连绵起伏，再做一次「山脊锐化」，把高处推得更高，
   形成清晰的山脊线（而不是平滑的土包）。
2. **水系** —— 从高处顺地势往下淌，低洼处积水成湖，沿途刻出蜿蜒的河谷。
   河谷两侧自动降低高程、抬高湿度，形成河漫滩。
3. **人类活动** —— 在低平近水处生成城镇（人类选址的真实逻辑），
   再开几条弯曲的林道把地图切开。它们既是点火源，也是天然阻火带。
4. **植被查表** —— 按「高程 + 湿度」决定种什么：

   | 位置 | 长什么 |
   |---|---|
   | 山顶、陡脊 | 裸岩为主，偶有灌木 |
   | 高海拔 | 针叶林带（喜冷、连片、燃点低、烧得久） |
   | 中山带 | 针叶与阔叶混交，湿度说了算 |
   | 河谷 | 阔叶林（含水率高，天然防火带） |
   | 平地 | 灌木与草地交错 |
   | 低洼 | 湿地 |

   结果是：**你看到的每一片林子，都能说清楚它为什么长在那儿。**

### 地图尺寸可以调

默认就是 **160×90（14,400 格）**，拖滑块可以从 **80×50** 一直调到 **320×200**。

**比例尺是固定的：1 格永远 = 10 米。** 所以拉大尺寸不是「把格子拉大」，
而是「往外多看一圈地」——面积随尺寸增长，单格代表的实际大小不变。

| 尺寸 | 实际范围 | 面积 |
|---|---|---|
| 80×50（最小） | 0.80 km × 0.50 km | 0.40 km² |
| **160×90（默认）** | **1.60 km × 0.90 km** | **1.44 km²** |
| 320×200（最大） | 3.20 km × 2.00 km | 6.40 km² ≈ 896 个足球场 |

拉满之后就是 **6.4 km²**，已经和一场真实山火同一个量级了 ——
「为什么扑不灭」这件事，在尺寸拉大之后会变得非常直观。

### 天气看得见

**雨不是把地图涂成绿色。** 植被底色永远保留，湿度只是叠一层很淡的湿润色罩，
针叶林的深绿、枯草的米黄都还认得出。雨量分级有各自的视觉语言：

| 雨量 | 地图上是什么样 |
|---|---|
| 小雨 | 几缕细雨丝，慢慢飘，地面慢慢回潮 |
| 中雨 | 雨丝变密变长，蒙一层薄雾，火明显蔫了 |
| 大雨 | 雨丝连成线，地上溅起水花，整张图微微发暗 |
| 暴雨 | 几乎是雨墙，还带**闪电** —— 火基本压死了 |

风力也会影响雨丝：风越大，雨斜得越狠。而且**暂停时雨照下**，
不会出现「一按暂停雨就停了」的错觉。

### 自己画地图

内置地形编辑器，用笔刷铺植被（枯草 / 湿草 / 灌木 / 针叶林 / 阔叶林 / 岩石 / 河流湖泊），
笔刷宽度可调。画好的地图能**存成 JSON 文件**，下次载回来接着用。

### 导出实验报告

一键导出 **PPT / Word / CSV / JSON**。
PPT 里的火势演化曲线是**原生可编辑图表**，双击就能改数据，不是截图。

---

## 跑起来

### 方式一：在线演示（最快）

直接打开 **https://luoyuan0101.github.io/project-ca-fire/** —— 不用装任何东西。

线上是**完整的 Next.js 站点**：入口页可以二选一，进而进入火灾沙盒或传染病占位页。

### 方式二：完整 Next.js 项目（推荐）

```bash
npm install
npm run dev
```

打开 http://localhost:3000

> 首次 `npm install` 需要联网下载依赖，命令行窗口别关。

功能跟线上一致（画布、速度、消防队、地形编辑器、环境参数全套）。

### 方式三：本地单文件（不用装依赖）

`docs/index.html` 是一个**完全自包含**的单文件（模型代码已内联），
双击就能在浏览器里跑 —— 只有火灾沙盒这一页。

适合**离线使用**或**当附件发给别人**：整个应用就是一个 HTML 文件，
不依赖服务器、不依赖网络。代价是装不下多页站点（所以到不了入口页和传染病页）。

---

## 几个可以自己试试的实验

1. **打早打小是真的吗**
   把「出警延迟」从 0 慢慢调到 40，看烧毁面积怎么变。
   → 延迟 18 轮时，结果已经和**没派消防队**差不多了。

2. **隔离带能撑多久**
   选「只开湿隔离带」，观察火线在湿带前停住 —— 然后再看它蒸干之后怎么越过去。

3. **地形决定命运**
   用笔刷铺一片纯针叶林，再铺一片湿草包围的小岛，分别点一把火。

4. **无人之境**
   关掉消防队开关，看火自己烧。这就是「无人发现」的对照组。

---

## 项目结构

```
project-ca-fire/
├─ lib/
│  ├─ fireModel.ts      ★ 模型核心：状态机、蔓延概率、消防队、地形生成
│  ├─ atlas.ts          ★ 真实世界地图：经纬度多边形轮廓 + 点内判定
│  └─ export.ts           导出 PPT / Word / CSV / JSON
├─ components/
│  ├─ FireCanvas.tsx      Canvas 渲染（含放大 / 全屏模式）
│  ├─ ControlPanel.tsx    所有参数面板
│  ├─ MapPanel.tsx      ★ 地图操作台（真实世界 / 随机 / 绘画 / 导入载入）
│  └─ StatsChart.tsx      手绘 SVG 折线图
├─ app/
│  ├─ page.tsx            入口页：二选一（火灾 / 传染病）
│  ├─ fire/page.tsx       火灾沙盒主页面
│  └─ disease/page.tsx    传染病沙盒（占位）
├─ docs/
│  └─ index.html          单文件版（自包含，可离线双击打开）
├─ out/                   静态导出产物（npm run build 生成，不入库）
├─ preview/               开发用的零构建版（依赖外部 fireModel.js / atlas.js）
├─ scripts/
│  ├─ build-docs.mjs      把 preview/index.html 打成自包含单文件
│  └─ serve-export.mjs    本地预览 out/（模拟 GitHub Pages 子路径）
├─ plan.md                项目评审（课程任务 3）
└─ .github/workflows/
   └─ pages.yml           构建并部署整站到 GitHub Pages
```

想改物理效果 → 只动 `lib/fireModel.ts`。
想改地图轮廓 → 只动 `lib/atlas.ts`。
想改界面 → 动 `components/` 或 `app/`。

> ⚠️ `docs/index.html` 是**把模型内联进来**的单文件版本，和整站是两套产物。
> 改了 `lib/fireModel.ts` 后，如果还想让单文件版保持最新，要重新生成它 —— 见下方说明。

---

## 部署

线上是纯静态站点，由 GitHub Actions 自动构建（`.github/workflows/pages.yml`）：
`npm ci` → `npm run build` → 把 `out/` 上传到 Pages。

两个容易踩的坑，都已经在工作流里处理：

- **basePath**：仓库挂在 `/<repo>/` 子路径下，构建时必须设
  `PAGES_BASE_PATH=/project-ca-fire`，否则所有 `/_next/...` 资源会 404（少一层路径）。
- **Pages Source 必须是 `GitHub Actions`**：如果留在 `Deploy from a branch`，
  它会去跑 Jekyll 渲染 README，而不是用我们的产物 —— 页面看起来"更新了"，
  其实是另一个东西。改名/转移仓库之后要重新确认一次这个设置。

本地想预览部署效果（含子路径）：

```bash
npm run build
node scripts/serve-export.mjs /project-ca-fire
# → http://localhost:3000/project-ca-fire/
```

## 更新单文件版（可选）

`docs/index.html` 里内联的是编译后的模型代码（**fireModel + atlas 两份都要**）。改了模型之后：

```bash
# 1. 编译模型（注意 atlas.ts 也要一起编译）
npx tsc lib/fireModel.ts lib/atlas.ts --outDir ./preview \
  --module esnext --target es2020 --moduleResolution bundler --skipLibCheck

# 2. 打包成自包含单文件（会自动把两份模块都内联进去）
node scripts/build-docs.mjs
#    → ✅ 已生成 docs/index.html，外部 import 数量：0
```

> 为什么要内联？因为从 GitHub 网页直接预览 `blob` 链接时，
> 外部 ES 模块请求会被拦，脚本整段不执行 → 画布黑屏。内联成单文件后彻底免疫这个问题。
>
> 真要手动核对一遍的话，`docs/index.html` 里应该搜不到任何
> `import` 语句、`<script src=` 或 `<link href=`。

---

## 技术栈

Next.js 14 · TypeScript · Tailwind CSS · Canvas 2D · pptxgenjs · docx

所有计算和文件导出**都在浏览器本地完成**，不联网、不上传任何数据。

---

## 一句话总结

> 简单的规则，复杂的世界。
> 没有一行代码在描述「火场应该长什么样」，
> 但火场就是长出来了。
