"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 入口页：一个大按钮 → 二选一
 *
 * 设计意图：先讲清"元胞自动机是什么"，再让人选沙盒。
 * 因为第一次来的人多半不知道这个名词，直接丢沙盒会懵。
 */
export default function HomePage() {
  const [opened, setOpened] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
      {/* ---------- 标题区 ---------- */}
      <header className="text-center">
        <p className="text-[12.5px] font-medium uppercase tracking-[0.2em] text-ember-600">
          Complex Systems · Emergence
        </p>
        <h1 className="mt-4 text-[38px] font-medium leading-tight text-ash-900">
          元胞自动机沙盒
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-8 text-ash-600">
          每个格子只看它旁边的邻居，然后决定自己下一步变成什么。
          <br className="hidden sm:block" />
          就这么一条规则，跑起来却会长出火灾与疫情的完整形态。
        </p>
      </header>

      {/* ---------- 概念说明 ---------- */}
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "元胞",
            d: "一张方格纸上的每个小格子，同一时刻只有一种状态，比如「正常 / 燃烧」。",
          },
          {
            t: "自动",
            d: "没有人在指挥。每个格子按照同一条规则，自己决定下一步怎么变。",
          },
          {
            t: "机",
            d: "格子 + 规则构成的整套运转系统，跑一轮，全场同时更新一次。",
          },
        ].map((x) => (
          <div key={x.t} className="panel p-5">
            <b className="text-[15px] font-medium text-ash-800">{x.t}</b>
            <p className="mt-2 text-[13px] leading-7 text-ash-500">{x.d}</p>
          </div>
        ))}
      </section>

      {/* ---------- 大按钮 ---------- */}
      {!opened ? (
        <div className="mt-14 text-center">
          <button
            onClick={() => setOpened(true)}
            className="group relative inline-flex items-center gap-3 rounded-2xl bg-ember-500 px-12 py-6 text-[19px] font-medium text-white transition hover:bg-ember-600 active:scale-[0.98]"
          >
            <span className="text-[22px]">▶</span>
            开始模拟
          </button>
          <p className="mt-4 text-[12.5px] text-ash-400">
            点击后选择沙盒 · 所有计算都在你的浏览器里完成
          </p>
        </div>
      ) : (
        <section className="mt-14 animate-fade-up">
          <p className="mb-5 text-center text-[13px] text-ash-500">
            选择一个沙盒开始
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {/* 火灾沙盒 */}
            <Link
              href="/fire"
              className="panel group relative overflow-hidden p-6 transition hover:border-ember-300"
            >
              <div className="absolute right-5 top-5 text-[30px] opacity-80">
                🔥
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ember-50 px-2.5 py-1 text-[12px] font-medium text-ember-700">
                已开放
              </span>
              <h2 className="mt-4 text-[19px] font-medium text-ash-900">
                火灾蔓延沙盒
              </h2>
              <p className="mt-3 text-[13.5px] leading-7 text-ash-600">
                五种燃烧阶段、六类燃料，加上湿度、风力、降雨与人工扑救，
                看一场火怎么烧、怎么停。
              </p>
              <ul className="mt-4 space-y-1.5 text-[12.5px] text-ash-500">
                <li>· 状态机：正常 → 火星 → 升温 → 燃烧 → 灰烬</li>
                <li>· 变量：植被 / 湿度 / 风力 / 降雨 / 动物扰动</li>
                <li>· 可导出实验数据与 Word 报告</li>
              </ul>
              <div className="mt-5 text-[13px] font-medium text-ember-600">
                进入沙盒 →
              </div>
            </Link>

            {/* 传染病沙盒 */}
            <Link
              href="/disease"
              className="panel group relative overflow-hidden p-6 opacity-90 transition hover:border-ash-300"
            >
              <div className="absolute right-5 top-5 text-[30px] opacity-50">
                🦠
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ash-100 px-2.5 py-1 text-[12px] font-medium text-ash-600">
                开发中
              </span>
              <h2 className="mt-4 text-[19px] font-medium text-ash-700">
                传染病传播沙盒
              </h2>
              <p className="mt-3 text-[13.5px] leading-7 text-ash-500">
                S / E / I / R 多状态模型，考察接触频率、卫生习惯与人口密度
                如何影响疫情的传播曲线。
              </p>
              <ul className="mt-4 space-y-1.5 text-[12.5px] text-ash-400">
                <li>· 状态机：易感 → 潜伏 → 感染 → 康复</li>
                <li>· 计划变量：接触频率 / 卫生习惯分布 / 传播半径</li>
                <li>· 尚未实现</li>
              </ul>
              <div className="mt-5 text-[13px] font-medium text-ash-400">
                进入看看 →
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* ---------- 底部说明 ---------- */}
      <footer className="mt-16 border-t border-ash-200 pt-6 text-center text-[12px] leading-6 text-ash-400">
        <p>
          元胞自动机沙盒 · 面向对「传播现象」感兴趣的人 · 用于科学探究
        </p>
        <p className="mt-1">
          模型参数基于文献常见取值范围设定，用于演示机制而非预测真实灾害
        </p>
      </footer>
    </main>
  );
}
