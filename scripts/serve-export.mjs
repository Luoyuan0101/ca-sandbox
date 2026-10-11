// 本地预览「静态导出的整站」。
//
// 为什么需要它：`next build` 配了 `output: "export"` 之后，
// 产物是 out/ 里的一堆 .html，`next start`（要求 Node 服务端）已经用不了了。
// 而直接拿 file:// 打开也不行 —— 子路径和尾斜杠的解析会和线上不一致。
//
// 用法：
//   node scripts/serve-export.mjs                    # 挂根路径，http://localhost:3000/
//   node scripts/serve-export.mjs /project-ca-fire   # 模拟 GitHub Pages 子路径
//
// 第二个参数用来复现线上环境：仓库挂在 /<repo>/ 下，
// 不模拟这一层的话，"链接少了个前缀" 这类问题在本地根本看不出来。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const prefix = (process.argv[2] ?? "").replace(/\/$/, "");
const port = Number(process.argv[3] ?? 3000);

if (!fs.existsSync(root)) {
  console.error(`找不到导出目录：${root}\n先运行 npm run build`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);

    if (prefix && !url.startsWith(prefix)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(`请求不在 ${prefix} 前缀下`);
      return;
    }

    const rel = prefix ? url.slice(prefix.length) : url;
    let file = path.join(root, rel || "/");

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file) && fs.existsSync(file + ".html")) {
      file += ".html";
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 " + rel);
      return;
    }

    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => {
    console.log(`静态导出预览：http://localhost:${port}${prefix}/`);
  });
