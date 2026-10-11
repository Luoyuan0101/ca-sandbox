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
const outDir = path.join(root, "docs");
const outHtml = path.join(outDir, "index.html");

if (!fs.existsSync(srcHtml) || !fs.existsSync(srcModel)) {
  console.error("找不到 preview/index.html 或 preview/fireModel.js");
  console.error("请先编译模型：");
  console.error(
    "  npx tsc lib/fireModel.ts --outDir ./preview --module esnext --target es2020 --moduleResolution bundler --skipLibCheck"
  );
  process.exit(1);
}

const html = fs.readFileSync(srcHtml, "utf8");
const model = fs.readFileSync(srcModel, "utf8");

// 1. 收集所有导出符号
const names = [...model.matchAll(/^export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)].map(
  (m) => m[1]
);
if (names.length === 0) {
  console.error("没有在 fireModel.js 里找到任何 export，编译产物可能不对");
  process.exit(1);
}

// 2. 去掉 export 关键字，包进 IIFE 并显式返回
const body = model.replace(/^export\s+/gm, "");
const inline =
  "/* ==== 内联的模型代码（由 scripts/build-docs.mjs 自动生成）====\n" +
  "   内联原因：外部 ES 模块在 file:// 或某些托管环境下加载失败，\n" +
  "   会导致脚本不执行、画布黑屏。合并成单文件后免疫此问题。 */\n" +
  "const M = (function () {\n" +
  body +
  "\n  return { " +
  names.join(", ") +
  " };\n" +
  "})();";

// 3. 替换掉原来的 import 行
const importRe = /import\s+\*\s+as\s+M\s+from\s+["']\.\/fireModel\.js["'];?/;
if (!importRe.test(html)) {
  console.error("preview/index.html 里没有找到预期的 import 行，请检查文件是否被改动过");
  process.exit(1);
}
const out = html.replace(importRe, inline);

// 4. 写文件
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outHtml, out, "utf8");

// .nojekyll 让 GitHub Pages 跳过 Jekyll 处理
const nojekyll = path.join(outDir, ".nojekyll");
if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, "", "utf8");

const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
console.log(`✅ 已生成 docs/index.html（${kb} KB，内联 ${names.length} 个导出符号）`);
console.log("   外部 import 数量：", (out.match(/^\s*import\s/gm) || []).length);
