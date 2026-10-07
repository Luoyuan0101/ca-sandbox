"use client";

import type { Snapshot } from "@/lib/fireModel";

interface Props {
  data: Snapshot[];
  width?: number;
  height?: number;
}

/**
 * 实时统计曲线
 *
 * 这张图是「动画」与「实验」的分界线：
 * 没有曲线，你只能说"火看起来烧得挺快"；
 * 有了曲线，你才能说"峰值是 482 格，出现在第 34 轮"。
 *
 * 手绘折线，不引入图表库 —— 少一个依赖，少一个出错点。
 */
export default function StatsChart({ data, width = 640, height = 190 }: Props) {
  const PAD = { l: 42, r: 12, t: 12, b: 24 };
  const w = width - PAD.l - PAD.r;
  const h = height - PAD.t - PAD.b;

  const series = [
    { key: "burning", label: "燃烧", color: "#F65C0A" },
    { key: "heating", label: "升温", color: "#E8703A" },
    { key: "ember", label: "火星", color: "#F0B429" },
    { key: "ash", label: "灰烬", color: "#6E6862" },
    { key: "wetline", label: "湿隔离带", color: "#4E8FCB" },
  ] as const;

  const maxTurn = Math.max(20, data.length);
  const maxVal = Math.max(
    10,
    ...data.flatMap((d) => series.map((s) => d[s.key]))
  );

  const xOf = (i: number) => PAD.l + (i / maxTurn) * w;
  const yOf = (v: number) => PAD.t + h - (v / maxVal) * h;

  // Y 轴刻度
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-ash-600">
            <span
              className="inline-block h-[3px] w-4 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-xl border border-ash-200 bg-white"
      >
        {/* 网格线 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="#EDEBE7"
              strokeWidth={1}
            />
            <text
              x={PAD.l - 7}
              y={yOf(t) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="#948E85"
            >
              {t}
            </text>
          </g>
        ))}

        {/* 曲线 */}
        {series.map((s) => {
          if (data.length < 2) return null;
          const pts = data
            .map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[s.key]).toFixed(1)}`)
            .join(" ");
          return (
            <polyline
              key={s.key}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* X 轴 */}
        <line
          x1={PAD.l}
          x2={width - PAD.r}
          y1={PAD.t + h}
          y2={PAD.t + h}
          stroke="#D9D5CE"
          strokeWidth={1}
        />
        <text x={PAD.l} y={height - 6} fontSize={10} fill="#948E85">
          第 1 轮
        </text>
        <text x={width - PAD.r} y={height - 6} textAnchor="end" fontSize={10} fill="#948E85">
          第 {maxTurn} 轮
        </text>
      </svg>
    </div>
  );
}
