/** @type {import('next').NextConfig} */
import { createRequire } from "module";

// next.config.mjs 是 ES 模块，没有 require，用 createRequire 借回来
const require = createRequire(import.meta.url);

/**
 * GitHub Pages 是纯静态托管，跑不了 Node 服务端，
 * 所以整站必须能 `output: "export"` 静态导出。
 * 项目里没有 route handler / cookies / headers，导出是无损的。
 *
 * basePath 也要跟着一起改：仓库是组织下的 `project-ca-fire`，
 * 页面挂在 https://rdfz-ai-challenge-2026.github.io/project-ca-fire/ 这个**子路径**上。
 * 不加 basePath 的话，HTML 里所有 /_next/... 都会指向
 * https://rdfz-ai-challenge-2026.github.io/_next/...（少一层），整站 404。
 *
 * 但本地 `next dev` / `next start` 是跑在根路径的，
 * 所以用环境变量 PAGES_BASE_PATH 开关：本地不设 → ""，CI 里设成 "/project-ca-fire"。
 */
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,

  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,

  /**
   * 静态导出时 next/image 的默认 loader 会去请求 /_next/image（一个服务端接口），
   * 静态站没有这个接口，必须关掉优化、按原图输出。
   */
  images: { unoptimized: true },

  /**
   * 导出默认生成 `/fire/index.html` 这类目录形式；
   * trailingSlash 打开后链接统一带尾斜杠，GitHub Pages 上更不容易出现
   * "访问 /fire 却 404"（Pages 不会自动补 index.html）。
   */
  trailingSlash: true,

  /**
   * pptxgenjs 的依赖链（jszip → readable-stream）里带着 Node 专用模块。
   * 浏览器里根本用不到它们，但 webpack 打包时仍会去解析，
   * 于是报 "Can't resolve 'process/'" 和 "node:https is not handled"。
   *
   * 这里把它们统统替换成空模块，构建就能通过；
   * 真正跑起来时，PPT 生成走的是浏览器的 Blob 下载路径，不受影响。
   */
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      const processBrowser = require.resolve("process/browser");
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        process: processBrowser,
        https: false,
        http: false,
        fs: false,
        net: false,
        tls: false,
        zlib: false,
        stream: false,
        path: false,
        crypto: false,
        os: false,
        buffer: false,
      };

      // `node:` 前缀的导入不走 resolve.fallback（webpack 在 scheme 阶段就拒了），
      // 必须用 NormalModuleReplacementPlugin 把整个 scheme 重定向掉。
      // pptxgenjs → jszip → readable-stream 会 import "node:https"/"node:fs" 等，
      // 这些在浏览器里统统用不到，指到空模块即可。
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = "data:text/javascript,export default {};";
        })
      );
    }
    return config;
  },
};

export default nextConfig;
