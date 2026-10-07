import Link from "next/link";

/**
 * 传染病传播沙盒 —— 空架子
 *
 * 关于"网站罢工中，请 N 年后再尝试"：
 * 这是有意保留的幽默文案。半成品网站的正确写法不是遮遮掩掩，
 * 而是大方承认"这块还没做，而且我知道要做什么" —— 后面的规划清单
 * 比一个假的空壳更有说服力。
 */
export default function DiseasePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-[12.5px] text-ash-400 hover:text-ember-600">
        ← 返回沙盒选择
      </Link>

      <div className="mt-8 rounded-2xl border border-ash-200 bg-white px-8 py-14 text-center">
        <div className="text-[46px]">🦠</div>
        <h1 className="mt-5 text-[26px] font-medium text-ash-900">
          网站罢工中
        </h1>
        <p className="mt-4 text-[16px] text-ash-600">
          本模块尚未完工，请{" "}
          <b className="font-medium text-ember-600">N 年后再尝试</b>
        </p>
        <p className="mt-3 text-[13px] leading-7 text-ash-400">
          （N 的具体取值取决于作者何时填完这个坑）
        </p>
      </div>

      {/* 规划说明 —— 这才是"半成品"该有的样子 */}
      <section className="mt-10">
        <h2 className="text-[16px] font-medium text-ash-800">
          这个沙盒打算做什么
        </h2>
        <p className="mt-3 text-[13.5px] leading-8 text-ash-600">
          和火灾沙盒共用同一套元胞自动机引擎，但把「燃料」换成「人」，
          把「燃烧」换成「感染」。核心问题是一样的：
          <b className="font-medium text-ash-800">
            个体之间的局部接触，如何决定整体的传播规模？
          </b>
        </p>

        {/* 状态机 */}
        <div className="mt-6">
          <h3 className="panel-title mb-3">计划中的状态机</h3>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { n: "S 易感", d: "健康，可能被感染", c: "#67A455" },
              { n: "E 潜伏", d: "已感染，尚无传染力", c: "#F0B429" },
              { n: "I 感染", d: "有传染力，向外传播", c: "#F65C0A" },
              { n: "R 康复", d: "已免疫或死亡", c: "#6E6862" },
            ].map((s, idx) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className="rounded-xl border border-ash-200 bg-white px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-3 w-3 rounded-[3px]"
                      style={{ backgroundColor: s.c }}
                    />
                    <b className="text-[13px] font-medium text-ash-800">{s.n}</b>
                  </div>
                  <div className="mt-1 text-[11.5px] text-ash-500">{s.d}</div>
                </div>
                {idx < 3 && <span className="text-ash-300">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* 计划参数 */}
        <div className="mt-8">
          <h3 className="panel-title mb-3">计划中的参数</h3>
          <div className="panel divide-y divide-ash-100 overflow-hidden">
            {[
              {
                k: "传播方式",
                v: "接触 / 飞沫 / 空气 —— 决定「能传多远」，对应格子间的传播半径",
              },
              {
                k: "接触频率",
                v: "每人每轮接触几个邻居，直接决定传播速度的上限",
              },
              {
                k: "卫生习惯分布",
                v: "⭐ 每个格子有独立的卫生习惯值，抽自正态分布 —— 加入「个体异质性」，比标准 SIR 更接近真实",
              },
              {
                k: "人口密度",
                v: "市中心密、郊区疏，用地图分布控制「接触概率」的空间差异",
              },
              {
                k: "潜伏期",
                v: "引入 E 状态，模拟无症状传播 —— 这正是疫情难以防控的关键",
              },
              {
                k: "干预措施",
                v: "隔离、疫苗接种、减少流动，对应切换开关，用来做对照实验",
              },
            ].map((x) => (
              <div key={x.k} className="flex gap-4 px-4 py-3.5">
                <b className="w-28 shrink-0 text-[13px] font-medium text-ash-800">
                  {x.k}
                </b>
                <span className="text-[12.5px] leading-6 text-ash-600">{x.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 待办 */}
        <div className="mt-8">
          <h3 className="panel-title mb-3">开发进度</h3>
          <div className="space-y-2">
            {[
              { t: "元胞自动机核心引擎", done: true, note: "已在火灾沙盒中验证，可直接复用" },
              { t: "S/E/I/R 状态机实现", done: false, note: "待做" },
              { t: "接触网络与传播规则", done: false, note: "待做" },
              { t: "个体异质性（卫生习惯分布）", done: false, note: "待做" },
              { t: "干预措施开关与对照实验", done: false, note: "待做" },
              { t: "数据导出（复用火灾沙盒的方案）", done: false, note: "待做" },
            ].map((x) => (
              <div
                key={x.t}
                className="flex items-center gap-3 rounded-xl border border-ash-200 bg-white px-3.5 py-2.5"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                    x.done ? "bg-moss-500" : "bg-ash-200"
                  }`}
                >
                  {x.done ? "✓" : ""}
                </span>
                <span
                  className={`text-[13px] ${
                    x.done ? "text-ash-700" : "text-ash-500"
                  }`}
                >
                  {x.t}
                </span>
                <span className="ml-auto text-[11.5px] text-ash-400">{x.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-xl bg-ash-50 px-5 py-4">
          <p className="text-[12.5px] leading-7 text-ash-500">
            这是本项目的「半成品」部分 —— 模型设计已完成，实现待续。
            与之相对，<Link href="/fire" className="text-ember-600 underline">火灾蔓延沙盒</Link>{" "}
            是完整可用的。两者共用同一套元胞自动机引擎，逻辑上是一致的。
          </p>
        </div>
      </section>
    </main>
  );
}
