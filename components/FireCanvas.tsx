"use client";

import { useEffect, useRef } from "react";
import type { FireCrew, Grid } from "@/lib/fireModel";
import { CellState, FUEL_MAP, RAIN_MAP, STATE_META } from "@/lib/fireModel";

interface Props {
  grid: Grid;
  /** 点击网格时触发，用于点火 */
  onCellAction?: (x: number, y: number) => void;
  /** 消防队位置，用于在地图上标记 */
  crews: FireCrew[];
  rainId: string;
  turn: number;
  running: boolean;
  /**
   * 交互模式
   *   ignite —— 点击点火（默认）
   *   paint  —— 拖拽刷地形（配合 onPaint）
   */
  tool?: "ignite" | "paint";
  /** 刷地形时回调，参数是刷子中心 */
  onPaint?: (x: number, y: number) => void;
}

const CELL = 11;
const MARGIN = 1;

/**
 * 网格画布
 *
 * 为什么用 Canvas 而不是 DOM？
 * 80×50 = 4000 个格子，如果用 4000 个 <div>，浏览器每次更新都要重排，
 * 调到每秒 10 轮就会卡。Canvas 直接画像素，4000 格毫无压力。
 */
export default function FireCanvas({
  grid,
  onCellAction,
  crews,
  rainId,
  turn,
  running,
  tool = "ignite",
  onPaint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const { cols, rows } = grid;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = cols * CELL;
    const h = rows * CELL;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景
    ctx.fillStyle = "#FAF9F7";
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const fuel = FUEL_MAP[grid.fuel[i]];
        const st = grid.state[i];
        const px = x * CELL;
        const py = y * CELL;

        let color: string;

        if (!fuel || fuel.flammability <= 0) {
          // 不可燃：沙土/岩石
          color = "#C9BFA8";
        } else if (st === CellState.Ash) {
          color = "#3B3733";
        } else if (st === CellState.WetLine) {
          // 湿隔离带：一条醒目的水蓝带，一眼能看出"这里断火了"
          color = "#4E8FCB";
        } else if (st === CellState.Burning) {
          // 明火：在橙红之间随轮次微抖，看起来在"跳"
          const t = (turn + i * 7) % 3;
          color = t === 0 ? "#F65C0A" : t === 1 ? "#FF7A2F" : "#FFB020";
        } else if (st === CellState.Heating) {
          color = "#E8703A";
        } else if (st === CellState.Ember) {
          color = "#F0B429";
        } else {
          // 正常燃料：用底色，并按含水率叠加深浅
          color = fuel.color;
          const m = grid.moisture[i];
          if (m > 0.5) color = "#7FBF6A";
        }

        ctx.fillStyle = color;
        ctx.fillRect(px, py, CELL - MARGIN, CELL - MARGIN);
      }
    }

    // 消防队标记（画在最上层）
    for (const crew of crews) {
      const px = crew.x * CELL + CELL / 2;
      const py = crew.y * CELL + CELL / 2;
      const onScene = crew.delay <= 0;

      // 到场后有一圈淡淡的水雾范围
      if (onScene) {
        ctx.beginPath();
        ctx.arc(px, py, CELL * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(70, 150, 220, 0.14)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, CELL * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = onScene ? "#2E6FB8" : "#9AA6B2";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();

      // 出警路上：加一个闪动的小方框提示"正在赶来"
      if (!onScene && running && turn % 2 === 0) {
        ctx.strokeStyle = "rgba(46, 111, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px - CELL, py - CELL, CELL * 2, CELL * 2);
      }
    }

    // 雨丝
    const rain = RAIN_MAP[rainId];
    if (rain && rain.density > 0 && running) {
      ctx.strokeStyle = "rgba(90, 140, 200, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < rain.density; k++) {
        const rx = ((k * 97 + turn * 13) % w) + 0.5;
        const ry = (k * 53 + turn * 41) % h;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 2, ry + 7);
      }
      ctx.stroke();

      // 暴雨时整体压暗
      if (rain.id === "storm") {
        ctx.fillStyle = "rgba(40, 60, 90, 0.18)";
        ctx.fillRect(0, 0, w, h);
      } else if (rain.id === "heavy") {
        ctx.fillStyle = "rgba(40, 60, 90, 0.09)";
        ctx.fillRect(0, 0, w, h);
      }
    }
  }, [grid, cols, rows, turn, rainId, running, crews]);

  function handlePos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    if (tool === "paint") {
      onPaint?.(x, y);
    } else {
      onCellAction?.(x, y);
    }
  }

  const hint =
    tool === "paint"
      ? `按住拖动刷地形 · ${cols}×${rows}`
      : `点击网格点火 · ${cols}×${rows}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {STATE_META.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[12px] text-ash-600">
              <span
                className="inline-block h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[12px] text-ash-600">
            <span className="inline-block h-3 w-3 rounded-full bg-[#2E6FB8]" />
            消防队
          </span>
        </div>
        <span className="text-[12px] text-ash-400">{hint}</span>
      </div>

      <canvas
        ref={canvasRef}
        className="cursor-crosshair rounded-xl border border-ash-200"
        onMouseDown={(e) => {
          draggingRef.current = true;
          handlePos(e);
        }}
        onMouseMove={(e) => {
          if (draggingRef.current) handlePos(e);
        }}
        onMouseUp={() => {
          draggingRef.current = false;
        }}
        onMouseLeave={() => {
          draggingRef.current = false;
        }}
      />
    </div>
  );
}
