"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FireCrew, Grid } from "@/lib/fireModel";
import { CellState, FUEL_MAP, RAIN_MAP, STATE_META } from "@/lib/fireModel";
import { elevationColorFast, ELEVATION_GRADIENT_CSS } from "@/lib/elevation";

interface Props {
  grid: Grid;
  /** 点击网格时触发，用于点火 */
  onCellAction?: (x: number, y: number) => void;
  /** 消防队位置，用于在地图上标记 */
  crews: FireCrew[];
  rainId: string;
  /** 风力（0-1），用来决定雨丝的倾斜程度 —— 风越大雨越斜 */
  windPower?: number;
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
  /**
   * 海拔视图：按高程着色而不是按植被着色
   *
   * 高程场和植被图是**同一次生成**的产物，所以两者天然对齐 ——
   * 换地图、换品种、换尺寸时一起更新，不会出现"图对不上"的情况。
   */
  showElevation?: boolean;
}

const BASE_CELL = 11;
const MARGIN = 1;
/** 画布最多铺多宽（px）。地图变大时格子会自动缩小，而不是撑破布局。 */
const MAX_CANVAS_W = 760;

/**
 * 放大模式的缩放范围与步长。
 *
 * 下限 0.5 是「能缩到比整张图更小」（方便一眼看全 + 周围留白），
 * 上限 4 是「格子最大 44px」—— 再大就只是几个放大的色块，
 * 除了看单格没别的信息量，反而把滚动条拖得很长。
 * 步长取 1.25 的**等比**而不是等差的 "+1px"：
 * 等比手感在 1× 附近是每格 +25%（细腻），到 4× 附近依然是 +25%，
 * 而等差步长在大图上会显得"滚半天没动"。
 */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

/**
 * 状态色只从 STATE_META 取，画布不再自己写死字面量。
 *
 * 为什么专门收一个函数？
 * 以前画布里散着 `color = "#3B3733"` 这种硬编码，而图例读的是 STATE_META ——
 * 同一件事有两份真相。这次调饱和度就吃了亏：
 * 改了 STATE_META，图例跟着变了，画布却还是旧色，
 * 于是一眼看去"图例和地图对不上"。
 * 现在两边读同一份常量，物理上不可能再分叉。
 */
function stateColor(key: CellState): string {
  return STATE_META.find((s) => s.key === key)?.color ?? "#888888";
}

/** 沙土/岩石的兜底色（图中无高程、无燃料信息时用），也从模型里取 */
const FALLBACK_FUEL = FUEL_MAP["barren"].color;

/**
 * 各级雨量的视觉参数
 *
 * 为什么要分开定义？因为"雨大不大"必须一眼看出来。
 * 如果只是把雨丝画多几条，视觉上几乎没有区别；
 * 真正的差异在于：雨丝更粗更长更斜、下落更快、颜色从亮蓝变成灰蓝。
 */
const RAIN_STYLE: Record<
  string,
  { color: string; width: number; length: number; driftX: number; driftY: number }
> = {
  // 小雨：细、短、淡，慢慢飘
  light: { color: "rgba(120, 168, 214, 0.34)", width: 0.8, length: 5, driftX: 7, driftY: 19 },
  // 中雨：明显看得见的雨丝
  moderate: { color: "rgba(104, 156, 210, 0.5)", width: 1, length: 9, driftX: 13, driftY: 33 },
  // 大雨：又长又密，颜色更深
  heavy: { color: "rgba(88, 140, 198, 0.62)", width: 1.3, length: 14, driftX: 19, driftY: 49 },
  // 暴雨：几乎是"雨墙"，斜得最狠、落得最快
  storm: { color: "rgba(74, 124, 184, 0.72)", width: 1.6, length: 20, driftX: 27, driftY: 67 },
};

/**
 * 网格画布
 *
 * 为什么用 Canvas 而不是 DOM？
 * 80×50 = 4000 个格子，如果用 4000 个 <div>，浏览器每次更新都要重排，
 * 调到每秒 10 轮就会卡。Canvas 直接画像素，4000 格毫无压力。
 *
 * 地图尺寸可调后，格子大小反过来由画布宽度决定：
 * 小图保持 11px 好点击，大图自动缩到 1px 保证整张图可见。
 */
export default function FireCanvas({
  grid,
  onCellAction,
  crews,
  rainId,
  windPower = 0.4,
  turn,
  running,
  tool = "ignite",
  onPaint,
  showElevation = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  /**
   * 放大模式：用户点右下角图标进入；进入后滚轮才改地图大小。
   *
   * 为什么必须是一个**显式模式**，而不是"滚轮一直能缩放"？
   * 因为页面本身是要上下滚的（地图下面还有图表和参数）。
   * 如果滚轮无条件缩放地图，用户想往下翻就翻不动，非常讨厌。
   * 所以做成两道闸：指针在画布上 + 已进入放大模式。
   */
  const [zoomed, setZoomed] = useState(false);
  const [zoom, setZoom] = useState(1);

  /**
   * 缩放锚点。用 ref 而不是 state —— 它只是「这一帧要滚到哪」的临时便笺，
   * 存进 state 会额外触发一次渲染，而且中间态的滚动位置会闪。
   */
  const pendingAnchor = useRef<{
    ratioX: number;
    ratioY: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const { cols, rows } = grid;

  const isZoomMode = useCallback(() => zoomed, [zoomed]);
  const isZoomModeRef = useRef(isZoomMode);
  isZoomModeRef.current = isZoomMode;

  /**
   * 每格实际像素：至少 1px，避免大图被缩成 0 宽。
   *
   * 关键点：放大模式下**不再封顶到 BASE_CELL**。
   * 160 列时基础值只有 4px，如果还留着封顶，乘 4 倍也只有 16px 却被卡回 11px，
   * 用户会觉得"滚了没反应"。所以只在非放大模式下封顶。
   */
  const CELL = (() => {
    const base = Math.max(1, Math.min(BASE_CELL, Math.floor(MAX_CANVAS_W / cols)));
    if (!zoomed) return base;
    return Math.max(1, Math.round(base * zoom));
  })();
  // 格子太小（<3px）时不再留缝，否则整张图会发白
  const gap = CELL >= 3 ? MARGIN : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = cols * CELL;
    const h = rows * CELL;
    const dpr = window.devicePixelRatio || 1;
    /* ⚠️ 这里以前是 `if (canvas.width !== w * dpr)` 的保护，为的是
     * "尺寸没变就别重设 width，免得清空画布"。
     * 加缩放之后这个保护会**直接吃掉缩放**：调整 canvas.width 只是改**像素**尺寸，
     * 真正决定显示大小的是 style.width —— 而 style.width 在尺寸相同的那条分支里根本不会被写。
     * 结果就是 width 一路变大，屏幕上却纹丝不动，"滚轮放大没反应"。
     * 现在改成每次渲染都完整写一遍，代价可以忽略（赋值是幂等的，
     * 尺寸真没变时浏览器也不会真的重新分配缓冲区）。 */
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
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

        /* ------------------------------------------------------------
         * 海拔视图
         *
         * 关键设计：**只有"没着火"的地面才换成海拔色**。
         * 火、火星、升温、灰烬、湿隔离带这些"事件"照常显示原色。
         *
         * 为什么？因为开海拔视图的目的是看"火和地形的关系" ——
         * 火在不在爬坡、有没有顺沟走。
         * 如果把火也涂成地形色，那这张图就只剩地形、没有火了，
         * 也就没法回答这个问题了。
         * ---------------------------------------------------------- */
        const isFireEvent =
          st === CellState.Burning ||
          st === CellState.Heating ||
          st === CellState.Ember ||
          st === CellState.Ash ||
          st === CellState.WetLine;

        if (showElevation && !isFireEvent) {
          const h = grid.elevation?.[i];
          // 没有高程场（比如手工画的图）就退回燃料色，不至于一片黑
          color =
            h === undefined
              ? fuel?.color ?? FALLBACK_FUEL
              : elevationColorFast(h);

          // 海/湖压一层青，和"低地"区分开 —— 不然海岸线看不出来
          if (fuel?.flammability === 0 && fuel.id === "water") {
            ctx.fillStyle = color;
            ctx.fillRect(px, py, CELL - gap, CELL - gap);
            ctx.fillStyle = "rgba(38,86,132,0.62)";
            ctx.fillRect(px, py, CELL - gap, CELL - gap);
            continue;
          }
        } else if (st === CellState.Ash) {
          color = stateColor(CellState.Ash);
        } else if (st === CellState.WetLine) {
          // 湿隔离带：一条醒目的水蓝带，一眼能看出"这里断火了"
          color = stateColor(CellState.WetLine);
        } else if (st === CellState.Burning) {
          // 明火：在橙红之间随轮次微抖，看起来在"跳"。
          // 三级都必须**比底色更亮更饱和** —— 植被加饱和之后，
          // 如果火焰还停在旧值上，火反而会被底色压住看不见，
          // 那就和"加饱和"的初衷反了。
          const t = (turn + i * 7) % 3;
          color =
            t === 0 ? stateColor(CellState.Burning) : t === 1 ? "#FF7A2F" : "#FFC24A";
        } else if (st === CellState.Heating) {
          color = stateColor(CellState.Heating);
        } else if (st === CellState.Ember) {
          color = stateColor(CellState.Ember);
        } else if (!fuel || fuel.flammability <= 0) {
          // 不可燃：裸岩/沙土 或 河流湖泊
          color = fuel?.color ?? FALLBACK_FUEL;
        } else {
          // 正常燃料：先铺植被本身的颜色
          color = fuel.color;

          // 再按含水率叠一层「湿润色罩」，而不是把颜色整个换掉。
          // 这是关键区别：针叶林的深绿、枯草的米黄都还认得出，
          // 只是整体偏冷、偏润一点 —— 不然一下雨整张图就糊成一片绿。
          const m = grid.moisture[i];
          if (m > 0.35) {
            const wet = Math.min(1, (m - 0.35) / 0.5); // 0.35~0.85 映射到 0~1
            ctx.fillStyle = color;
            ctx.fillRect(px, py, CELL - gap, CELL - gap);
            ctx.fillStyle = `rgba(96, 150, 196, ${(wet * 0.3).toFixed(3)})`;
            ctx.fillRect(px, py, CELL - gap, CELL - gap);
            continue;
          }
        }

        ctx.fillStyle = color;
        ctx.fillRect(px, py, CELL - gap, CELL - gap);
      }
    }

    // 消防队标记（画在最上层）
    // 格子太小时圆点会糊成一团，所以半径跟着 CELL 缩，但有下限
    const crewR = Math.max(1.5, CELL * 0.62);
    for (const crew of crews) {
      const px = crew.x * CELL + CELL / 2;
      const py = crew.y * CELL + CELL / 2;
      const onScene = crew.delay <= 0;

      // 到场后有一圈淡淡的水雾范围
      if (onScene && CELL >= 4) {
        ctx.beginPath();
        ctx.arc(px, py, CELL * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(70, 150, 220, 0.14)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, crewR, 0, Math.PI * 2);
      ctx.fillStyle = onScene ? "#2E6FB8" : "#9AA6B2";
      ctx.fill();
      if (CELL >= 4) {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();
      }

      // 出警路上：加一个闪动的小方框提示"正在赶来"
      if (!onScene && running && turn % 2 === 0 && CELL >= 4) {
        ctx.strokeStyle = "rgba(46, 111, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px - CELL, py - CELL, CELL * 2, CELL * 2);
      }
    }

    /* ============================================================
     * 天气层
     *
     * 设计原则：天气是「叠加在地图上的」，不是「把地图涂掉」。
     * 所以植被配色始终保留，天气只做三件事 ——
     *   1. 加雨丝（斜着飘，随轮次流动）
     *   2. 加雾气（雨越大越朦胧）
     *   3. 暴雨时压暗 + 偶发闪电
     *
     * 另外：雨丝不再依赖 running。
     * 之前暂停就看不见雨，用户以为雨停了 —— 其实雨一直在下。
     * ============================================================ */
    const rain = RAIN_MAP[rainId];
    if (rain && rain.density > 0) {
      // 风的倾斜：雨丝不是垂直落的，风越大越斜
      const slant = 2 + windPower * 4;

      // 1) 雨中含水汽，越大雨越朦胧 —— 先铺一层薄雾
      if (rain.id === "moderate" || rain.id === "heavy" || rain.id === "storm") {
        const haze = rain.id === "moderate" ? 0.05 : rain.id === "heavy" ? 0.08 : 0.11;
        ctx.fillStyle = `rgba(196, 214, 232, ${haze})`;
        ctx.fillRect(0, 0, w, h);
      }

      // 2) 雨丝：每一级雨量有自己的粗细、长短、透明度和颜色
      const style = RAIN_STYLE[rain.id] ?? RAIN_STYLE.light;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.beginPath();
      for (let k = 0; k < rain.density; k++) {
        const rx = ((k * 97 + turn * style.driftX) % w) + 0.5;
        // 不同雨量的雨滴下落速度不同：暴雨砸得快，小雨飘得慢
        const ry = (k * 53 + turn * style.driftY) % h;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - slant, ry + style.length);
      }
      ctx.stroke();

      // 3) 大雨以上：地上溅起水花（一簇簇小点，看起来像雨打在叶面上）
      if (rain.id === "heavy" || rain.id === "storm") {
        const splashes = rain.id === "storm" ? 120 : 60;
        ctx.fillStyle = "rgba(168, 205, 236, 0.55)";
        for (let k = 0; k < splashes; k++) {
          const sx = (k * 173 + turn * 29) % w;
          const sy = (k * 311 + turn * 17) % h;
          // 用 (turn+k) 的奇偶当闪烁，水花才有"啪嗒"的节奏
          if ((turn + k) % 3 === 0) ctx.fillRect(sx, sy, 1.6, 1.6);
        }
      }

      // 4) 暴雨：整体压暗 + 偶发闪电
      if (rain.id === "storm") {
        ctx.fillStyle = "rgba(38, 56, 88, 0.16)";
        ctx.fillRect(0, 0, w, h);

        // 闪电：用 (turn * 大素数) % 周期 制造不规则的间隔，
        // 每约 11 轮闪一次，一次闪两下（真实闪电就是这样）
        const phase = (turn * 7) % 11;
        if (phase === 0 || phase === 1) {
          ctx.fillStyle = phase === 0 ? "rgba(255, 255, 240, 0.22)" : "rgba(255, 255, 240, 0.12)";
          ctx.fillRect(0, 0, w, h);
          // 一道折线闪电劈在地上
          const lx = ((turn * 137) % Math.max(1, w - 60)) + 30;
          ctx.strokeStyle = "rgba(255, 255, 235, 0.9)";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(lx, 0);
          ctx.lineTo(lx - 10, h * 0.35);
          ctx.lineTo(lx + 8, h * 0.5);
          ctx.lineTo(lx - 6, h * 0.78);
          ctx.lineTo(lx + 2, h);
          ctx.stroke();
        }
      } else if (rain.id === "heavy") {
        ctx.fillStyle = "rgba(38, 56, 88, 0.07)";
        ctx.fillRect(0, 0, w, h);
      }
    }
  }, [grid, cols, rows, turn, rainId, running, crews, CELL, gap, windPower, showElevation]);

  /**
   * 滚轮缩放。
   *
   * 为什么用 addEventListener 而不是 JSX 的 onWheel？
   * 因为必须传 `{ passive: false }`。React 的合成事件挂在根节点上、
   * 无法指定 passive，而 wheel 在 Chrome 里默认按 passive 处理 ——
   * 于是 preventDefault() 只会打一行控制台警告、**完全不生效**，
   * 缩放的同时整个页面跟着滚，手感极差。
   *
   * 两级判断（对应用户明确提出的第 5 条要求）：
   *   ① 不在放大模式 → 直接 return，连 preventDefault 都不调，
   *      让浏览器照常滚页面；
   *   ② 在放大模式 → 吃掉事件，改缩放。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    function onWheel(e: WheelEvent) {
      if (!isZoomModeRef.current()) return; // ① 正常模式：什么都不做
      e.preventDefault(); // ② 放大模式：别让页面跟着一起滚

      // 上面的 if 已经排除了 null，这里用局部变量收窄一次，
      // 免得在闭包里反复为 TS 解释"它真的不是 null"
      const cv = canvas as HTMLCanvasElement;
      const wp = wrap as HTMLDivElement;

      setZoom((prev) => {
        const next = e.deltaY < 0 ? prev * ZOOM_STEP : prev / ZOOM_STEP;
        const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
        if (clamped === prev) return prev; // 到边界了，不触发重渲染

        /* 以「光标下的那个格子」为锚点缩放。
         * 不做这件事的话，放大后画面会往左上角跑 ——
         * 用户盯着的地方反而被挤出视口，得反复滚动去找，很难用。
         * 做法：记下光标相对整张画布的滚动坐标占比，缩放后按同一比例滚回去。
         *
         * 注意：这里读的是**缩放前**的 rect。滚动位置的校正在
         * 下面的 useLayoutEffect 里做，因为那一刻不能同步读到新的布局。 */
        const r = cv.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        pendingAnchor.current = {
          ratioX: (wp.scrollLeft + cx) / (r.width || 1),
          ratioY: (wp.scrollTop + cy) / (r.height || 1),
          clientX: e.clientX,
          clientY: e.clientY,
        };
        return clamped;
      });
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  /**
   * 缩放后把视图滚回锚点位置。
   *
   * 必须放在 useLayoutEffect（而不是 useEffect）里：
   * 布局动画之间插一帧会让画面先跳到左上角再弹回来，肉眼看得见。
   * useLayoutEffect 在浏览器绘制**之前**同步跑，用户只会看到最终结果。
   */
  useLayoutEffect(() => {
    const a = pendingAnchor.current;
    if (!a) return;
    pendingAnchor.current = null;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const r = canvas.getBoundingClientRect();
    wrap.scrollLeft = a.ratioX * r.width - (a.clientX - r.left);
    wrap.scrollTop = a.ratioY * r.height - (a.clientY - r.top);
  }, [CELL]);

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

  const w = cols * CELL;
  const hint = showElevation
    ? `海拔视图 · 越亮越高 · ${cols}×${rows}`
    : tool === "paint"
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
          {/* 水的色块从模型里取，不写死 ——
              写死了以后改配色，图例就会和地图对不上。 */}
          <span className="flex items-center gap-1.5 text-[12px] text-ash-600">
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: FUEL_MAP["water"].color }}
            />
            河流/湖泊
          </span>
          {/* 海拔视图打开时，图例跟着换成色带，不然这些色块全是错的 */}
          {showElevation && (
            <span className="flex items-center gap-1.5 text-[12px] text-ash-600">
              <span
                className="inline-block h-3 w-14 rounded-[3px]"
                style={{ background: ELEVATION_GRADIENT_CSS }}
              />
              海拔 低 → 高
            </span>
          )}
        </div>
        <span className="text-[12px] text-ash-400">{hint}</span>
      </div>

      {/* 画布外面套一层相对定位容器，专门用来挂右下角的放大按钮。
          按钮不能绝对定位挂在更大范围的卡片上 —— 卡片里还有图例和统计行，
          那样按钮会掉到统计行下面去，就不在"地图的右下角"了。 */}
      <div
        ref={wrapRef}
        className={
          "relative " +
          (zoomed
            ? "max-h-[72vh] overflow-auto rounded-xl bg-[#F3F1ED] [scrollbar-width:thin]"
            : "")
        }
      >
        <canvas
          ref={canvasRef}
          style={{ width: w }}
          /* `max-w-full` 是为了让地图在小屏上不撑破布局。
             ⚠️ 但放大模式下这条规则会和缩放**直接对冲**：
             浏览器会把 4 倍宽的画布硬压回容器宽度，
             于是"滚轮放大"看起来毫无效果（尺寸其实变了，只是又被压回去了）。
             这是典型的"代码没错、CSS 在拖后腿"，所以放大时切到 max-w-none。 */
          className={
            "cursor-crosshair rounded-xl border border-ash-200 " +
            (zoomed ? "max-w-none" : "max-w-full")
          }
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

        {/* 右下角放大图标。
            ⚠️ 它必须在画布**之后**渲染：DOM 顺序决定层叠顺序，
            放前面会被画布盖住，点不到。 */}
        <button
          type="button"
          title={zoomed ? "退出放大模式" : "放大查看整张地图（滚轮可缩放）"}
          aria-label={zoomed ? "退出放大模式" : "放大查看整张地图"}
          aria-pressed={zoomed}
          onClick={(e) => {
            // 别让这次点击穿到画布上去点火 —— 那也是"点图"，会点出一个火来
            e.stopPropagation();
            setZoomed((v) => !v);
            setZoom(1); // 退出时复位，免得下次进来还是上次的倍数
          }}
          /* 进入放大模式时染成"燃烧色"。这个色**从 STATE_META 动态取**，
             不写死 —— 否则以后调火焰配色，按钮会独自停在一个旧值上，
             和它旁边的火苗对不上。上一轮的教训就是"同一件事有两份真相"，
             这次不从面板色系里复制一份新的。 */
          style={
            zoomed
              ? { backgroundColor: stateColor(CellState.Burning), borderColor: stateColor(CellState.Burning), color: "#fff" }
              : undefined
          }
          className={
            "absolute bottom-2.5 right-2.5 z-[5] flex h-8 w-8 items-center justify-center " +
            "rounded-[9px] border text-[15px] leading-none shadow-[0_1px_4px_rgba(0,0,0,0.10)] " +
            "transition-colors " +
            (zoomed
              ? ""
              : "border-[#D6D1C8] bg-white/90 text-[#5C554D] hover:border-[#B8B2A7] hover:bg-white hover:text-[#2B2824]")
          }
        >
          {zoomed ? "⤡" : "⤢"}
        </button>
      </div>

      {zoomed && (
        <div className="rounded-lg border border-ash-200 bg-ash-50/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ash-600">
          <b className="text-ash-800">放大模式</b>
          ：滚轮缩放（{ZOOM_MIN}× – {ZOOM_MAX}×，当前 {zoom.toFixed(2)}×）·
          在图上点一下照样点火 · 再点右下角按钮退出
        </div>
      )}
    </div>
  );
}
