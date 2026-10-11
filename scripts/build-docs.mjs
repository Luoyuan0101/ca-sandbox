#!/usr/bin/env node
/**
 * 把 preview/index.html（依赖外部 fireModel.js）打包成
 * docs/index.html（完全自包含的单文件）。
 *
 * 为什么需要这一步：
 *   浏览器加载外部 ES 模块时，如果页面是通过 file:// 打开、
 *   或者托管在会拦模块请求的环境里，import 会失败，
 *   整个 <script> 不执行 → 画布黑屏。
 *   内联成单文件后，任何方式打开都能正常跑。
 *
 * 用法：
 *   node scripts/build-docs.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const srcHtml = path.join(root, "preview", "index.html");
const srcModel = path.join(root, "preview", "fireModel.js");
const srcAtlas = path.join(root, "preview", "atlas.js");
const srcElev = path.join(root, "preview", "elevation.js");
const outDir = path.join(root, "docs");
const outHtml = path.join(outDir, "index.html");

if (!fs.existsSync(srcHtml) || !fs.existsSync(srcModel)) {
  console.error("找不到 preview/index.html 或 preview/fireModel.js");
  console.error("请先编译模型：");
  console.error(
    "  npx tsc lib/fireModel.ts lib/atlas.ts lib/elevation.ts --outDir ./preview \\\n" +
      "    --module esnext --target es2020 --moduleResolution bundler --skipLibCheck"
  );
  process.exit(1);
}

const html = fs.readFileSync(srcHtml, "utf8");
let model = fs.readFileSync(srcModel, "utf8");
const atlas = fs.existsSync(srcAtlas) ? fs.readFileSync(srcAtlas, "utf8") : "";
const elevation = fs.existsSync(srcElev) ? fs.readFileSync(srcElev, "utf8") : "";

// 0. 把 fireModel 里对 atlas 的 import 换成"直接引用下面的 atlas 包"
//    （atlas 会被放在同一个 IIFE 前面，见第 2 步）
if (atlas) {
  model = model.replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/atlas["']\s*;?/g, "");
  model = model.replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/atlas\.js["']\s*;?/g, "");
}

// 1. 收集所有导出符号
//
//    ⚠️ 必须用**和产物一致的正则**。踩过的坑：
//    原来是 /^export\s+(?:const|function)\s+/，只认 const/function。
//    而 atlas 的导出是 `export const REGIONS` 和 `export const REGION_MAP`，
//    确实会被抓到 —— 但 names（fireModel 的导出列表）里**没有**这些名字，
//    于是 M 的返回对象里缺 REGIONS / REGION_MAP。
//    preview/ 版本是真 import，所以只有内联产物会缺，
//    `npx tsc`、`next build` 全都看不见 —— 一打开就是白屏。
//    修法见第 2 步：把 atlas 的导出也并进 M 的返回对象。
const exportRe = /^export\s+(?:const|function|class|let|var|async function)\s+([A-Za-z_$][\w$]*)/gm;
const names = [...model.matchAll(exportRe)].map((m) => m[1]);
if (names.length === 0) {
  console.error("没有在 fireModel.js 里找到任何 export，编译产物可能不对");
  process.exit(1);
}
const atlasNames = [...atlas.matchAll(exportRe)].map((m) => m[1]);
const elevNames = [...elevation.matchAll(exportRe)].map((m) => m[1]);

// M 对外暴露的完整符号表 = fireModel 自己的导出 + atlas 的导出 + elevation 的导出
//
// ⚠️ 注意这里**不能**简单地把三份名字并起来丢进同一个 return 对象里。
//   踩过的坑：elevation 的导出（elevationColor / ELEVATION_LUT / ...）
//   是在 __ca_elev 那个**独立 IIFE 内部**定义的，
//   而 M 的 return 对象在外层，根本看不见它们 ——
//   产物一执行就 `ReferenceError: elevationColor is not defined`，
//   又一次白屏。
//   所以拆成两份：M 只暴露"模型能看见的"，elevation 的符号单独就地展开。
const modelVisible = [...new Set([...names, ...atlasNames])];
const elevOnly = elevNames;

// 2. 去掉 export 关键字，包进 IIFE 并显式返回。
//    atlas 必须在 fireModel 之前求值，因为 fireModel 的函数体里用到它。
//
//    ⚠️ 这里用的包装变量名必须**不可能和页面脚本撞车**。
//    踩过的坑：最初用 `const A`，而 preview/index.html 自己也有
//    `const A = { NORMAL:0, EMBER:1, ... }` 声明状态常量 ——
//    两个 `const A` 落在同一个块作用域里，直接 SyntaxError，
//    整段 <script> 不执行 → 画布全白，而且控制台之外看不出任何异常。
//    所以这里统一加 `__ca_` 前缀。
const ATLAS_VAR = "__ca_atlas";
const MODEL_VAR = "__ca_model";
const ELEV_VAR = "__ca_elev";

const atlasBody = atlas
  ? `const ${ATLAS_VAR} = (function () {\n` +
    atlas.replace(/^export\s+/gm, "") +
    "\n  return { " +
    atlasNames.join(", ") +
    " };\n})();\n" +
    // 把 fireModel 里散用的标识符接到 atlas 包上
    `const { ${atlasNames.join(", ")} } = ${ATLAS_VAR};\n`
  : "";

// 海拔模块只被**页面**用（画布换色），fireModel 不依赖它。
// 它的符号必须**解构到外层作用域**，页面里的 `ELEVATION_LUT`
// 才引用得到 —— 塞进 M 的 return 对象里是没用的（那是个独立作用域）。
const elevBody = elevation
  ? `const ${ELEV_VAR} = (function () {\n` +
    elevation.replace(/^export\s+/gm, "") +
    "\n  return { " +
    elevOnly.join(", ") +
    " };\n})();\n" +
    `const { ${elevOnly.join(", ")} } = ${ELEV_VAR};\n`
  : "";

const body = model.replace(/^export\s+/gm, "");
const inline =
  "/* ==== 内联的模型代码（由 scripts/build-docs.mjs 自动生成）====\n" +
  "   内联原因：外部 ES 模块在 file:// 或某些托管环境下加载失败，\n" +
  "   会导致脚本不执行、画布黑屏。合并成单文件后免疫此问题。 */\n" +
  `const M = (function () {\n` +
  atlasBody +
  body +
  "\n  return { " +
  modelVisible.join(", ") +
  " };\n" +
  "})();\n" +
  elevBody;

// 3. 替换掉原来的 import 行
//
//    页面里现在有**两行** import：fireModel 和 elevation。
//    fireModel 那行换成上面那个大 IIFE；
//    elevation 那行删掉即可 —— 它的内容已经在 elevBody 里就地展开了
//    （以 ELEVATION_LUT / ELEVATION_GRADIENT_CSS 两个变量的形式）。
const importRe = /import\s+\*\s+as\s+M\s+from\s+["']\.\/fireModel\.js["'];?/;
const elevImportRe = /import\s*\{[^}]*\}\s*from\s*["']\.\/elevation\.js["']\s*;?/;
if (!importRe.test(html)) {
  console.error("preview/index.html 里没有找到预期的 fireModel import 行，请检查文件是否被改动过");
  process.exit(1);
}
let out = html.replace(importRe, inline);
if (elevImportRe.test(out)) {
  out = out.replace(elevImportRe, "/* elevation 模块已内联到上面的 __ca_elev 里 */");
} else {
  // 没有 elevation import 也不算错（可能是旧版页面），但要说一声
  console.log("   注意：页面里没有 elevation import，海拔视图可能没接上");
}

/* ------------------------------------------------------------
 * 3.2 自检：页面用到的每一个符号都真的能引用到
 *
 * 为什么非要这一步？
 *   我们踩的第二个坑：返回对象里漏了 REGIONS / REGION_MAP，
 *   于是产物里 `M.REGIONS.forEach(...)` 一上来就 TypeError，
 *   脚本中断 → 画布空白。而 preview/ 版是真 import，完全正常，
 *   所以 tsc / next build / 只看 preview 的测试统统测不出来。
 *
 * ★ 后来又踩了第三个坑，而且是同一个坑的升级版：
 *   加了 elevation 模块之后，我把它的导出**并进了 M 的 return 对象**。
 *   名字全都在（所以"名字检查"通过了），
 *   可那些名字是在 __ca_elev 这个**独立 IIFE 内部**定义的，
 *   M 的 return 对象在外层根本看不见 ——
 *   一执行就 `ReferenceError: elevationColor is not defined`，又白屏。
 *
 *   教训：「名字存在」不等于「引用得到」。
 *   所以这里不只查名字，还查**这个符号到底定义在哪一层**。
 * ---------------------------------------------------------- */
{
  // 页面脚本 = 从 import 那行往后（inline 是我们自己塞的，跳过）
  const pageScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join("\n")
    .replace(importRe, "");

  // ① M.xxx 必须都在 M 的 return 清单里
  const used = new Set();
  for (const m of pageScripts.matchAll(/\bM\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  const missing = [...used].filter((n) => !modelVisible.includes(n));
  if (missing.length) {
    console.error(`❌ 页面用到但 M 没暴露的符号：${missing.join(", ")}`);
    console.error("   这会让产物在浏览器里抛 TypeError、整段脚本中断、画布空白。已中止写入。");
    process.exit(1);
  }
  console.log(`   M.* 引用检查：${used.size} 个符号全部命中`);

  // ② 页面里**裸用**（不写 M. 前缀）的标识符，必须能在最外层找到定义。
  //
  //    只查那些确实由内联模块导出的名字（elevation 那几个），
  //    免得把 document / window / Math 这些全局量误报进来。
  const outerDecls = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) outerDecls.add(m[1]);
    // const { a, b } = ... 形式的解构
    const d = /^(?:const|let|var)\s*\{([^}]+)\}\s*=/.exec(line);
    if (d) for (const part of d[1].split(",")) {
      const t = part.split(":").pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(t)) outerDecls.add(t);
    }
  }
  const unreachable = [];
  for (const n of elevOnly) {
    // 只要在页面里出现过（裸用），就必须有外层定义
    const bare = new RegExp(`(?<![.\\w$])${n}\\b`);
    if (bare.test(pageScripts) && !outerDecls.has(n)) unreachable.push(n);
  }
  if (unreachable.length) {
    console.error(`❌ 页面引用了但外层作用域里没有定义的符号：${unreachable.join(", ")}`);
    console.error("   这类符号可能被误塞进了某个 IIFE 的 return 对象里 ——");
    console.error("   名字看着在，实际引用不到，产物会 ReferenceError 白屏。已中止写入。");
    process.exit(1);
  }
  console.log(`   内联符号可见性检查：${elevOnly.length} 个模块导出，全部可达`);
}

/* ------------------------------------------------------------
 * 3.5 自检：把产物当普通脚本解析一遍
 *
 * 为什么非要这一步？
 *   上一版死于「两个 const A 重复声明」。那次 `npx tsc`、`next build`、
 *   无头 DOM 测试**全部通过** —— 因为那些都跑的是 preview/ 版本，
 *   而 bug 只存在于「内联之后」的产物里。
 *   单文件版本必须自己验一遍，不能指望别的测试顺带覆盖到。
 *
 * 用 new Function 而不是 vm.Script：前者不做任何模块/作用域包装，
 * 最接近浏览器 <script> 的行为，重复声明会直接抛。
 * ---------------------------------------------------------- */
{
  const scripts = [...out.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let syntaxError = null;
  for (let i = 0; i < scripts.length; i++) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(scripts[i]);
    } catch (e) {
      syntaxError = { index: i, message: e.message };
      break;
    }
  }
  if (syntaxError) {
    console.error(`❌ 产物的第 ${syntaxError.index + 1} 段 <script> 语法错误：`);
    console.error(`   ${syntaxError.message}`);
    console.error("   这会直接导致浏览器里整段脚本不执行、画布空白。已中止写入。");
    process.exit(1);
  }

  // 顶层 const/let/class 撞名检查。
  //
  // 为什么 new Function 之外还要再兜这一层？
  //   `new Function(body)` 是把 body 整个当**函数体**重新解析的，
  //   它确实能抓到"两个 const 同名"，但它**看不见 <script> 之外的东西**，
  //   而且报错信息里没有行号，定位起来很费劲。
  //   这一层直接扫产物的字面文本，能报出准确行号。
  //
  // ⚠️ 必须同时容忍 LF 和 CRLF。
  //   踩过的坑（这个坑很深）：
  //   产物是从 preview/index.html 复制过来的，而那个文件在 Windows 上是
  //   **CRLF** 换行。于是正则里不用 `m` 的话，`^` 只匹配整个字符串的开头
  //   （偏移 0），后面所有行都匹配不到 —— 匹配结果是 0 个声明，
  //   守卫就这么静默"通过"了，看起来和"扫到了且没撞名"一模一样。
  //   第一版还加了 `m`，结果 `\r` 卡在行尾，`^const` 依然匹配不上。
  //   正确做法：手动按换行切行，先 String.trim() 掉 `\r` 再判断，
  //   这样 LF / CRLF 都稳。
  const seen = new Map();
  const lines = out.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    const lineNo = i + 1;
    if (seen.has(name)) {
      console.error(`❌ 产物里有重复的顶层声明：\`${name}\`（第 ${seen.get(name)} 行 与 第 ${lineNo} 行）`);
      console.error("   同一个块作用域里重复声明 const/let 会 SyntaxError，");
      console.error("   后果是整段 <script> 不执行、画布全白，控制台之外看不出异常。已中止写入。");
      process.exit(1);
    }
    seen.set(name, lineNo);
  }
  // 把扫描结果报出来 —— 否则"一个都没扫到"也会静默通过，
  // 看起来和"扫到了且没撞名"一模一样。
  // 0 个声明是个明显的异常信号，直接拦下来。
  if (seen.size === 0) {
    console.error("❌ 顶层声明撞名检查扫到了 0 个声明，说明这个检查本身失效了（换行符？）。已中止写入。");
    process.exit(1);
  }
  console.log(`   顶层声明撞名检查：${seen.size} 个声明，无重复`);
}

// 4. 写文件
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outHtml, out, "utf8");

// .nojekyll 让 GitHub Pages 跳过 Jekyll 处理
const nojekyll = path.join(outDir, ".nojekyll");
if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, "", "utf8");

const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
console.log(`✅ 已生成 docs/index.html（${kb} KB，内联 ${names.length} 个导出符号）`);
console.log("   外部 import 数量：", (out.match(/^\s*import\s/gm) || []).length);
console.log("   产物语法自检：通过");
