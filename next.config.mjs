/** @type {import('next').NextConfig} */
import { createRequire } from "module";

// next.config.mjs 是 ES 模块，没有 require，用 createRequire 借回来
const require = createRequire(import.meta.url);

const nextConfig = {
  reactStrictMode: true,

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
