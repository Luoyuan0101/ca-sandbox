"use client";

import { useEffect, useState } from "react";
import { FUELS, TERRAIN_FLAVORS } from "@/lib/fireModel";
import { REGIONS } from "@/lib/atlas";

interface Props {
  /** 当前选中的画笔燃料 id */
  brush: string;
  setBrush: (id: string) => void;
  /** 笔刷半径（格） */
  radius: number;
  setRadius: (r: number) => void;
  /** 是否处于刷地形模式 */
  active: boolean;
  setActive: (v: boolean) => void;
  /** 一键操作 */
  onClear: () => void;
  onRandom: () => void;
  onClearFire: () => void;
  /** 生成一片程序生成的真实地貌（山脉 / 河谷 / 湖泊 / 林带 / 城镇 / 林道） */
  onTerrain: () => void;
  /** 指定「地貌品种」生成 */
  onFlavor: (id: string) => void;
  /** 当前锁定的地貌品种（null = 由种子自己决定） */
  flavorId: string | null;
  /** 载入真实世界地图（按区域 id） */
  onWorld: (regionId: string) => void;
  /** 地图存档 */
  onSave: () => void;
  onLoad: () => void;
  /** 地图格数，用于换算比例尺 */
  cols: number;
  rows: number;
  /** 调整地图尺寸 */
  sizeScale: number;
  setSizeScale: (v: number) => void;
  /** 当前区域 id（"" 表示程序生成地形） */
  region: string;
}

/** 一格 = 10 米 */
export const METERS_PER_CELL = 10;

/**
 * 尺寸档位
 *
 * 精度提高之后，尺寸不再按"长宽同比例放大"来算了 ——
 * 因为默认已经到 160×90（14,400 格），再等比放大到 4× 就是 640×360，
 * 画布上每格连 1 像素都分不到，看图变成看噪点。
 *
 * 改成「高度基本不动，横向往外看」：
 * 地图往两侧延伸，视野更宽，但每格的物理尺寸和画面颗粒度都保持稳定。
 * 这也更接近真实的使用场景 —— 火场要扩大，通常是往一个方向铺开，
 * 而不是把整块地等比吹大。
 *
 *   [宽倍率, 高倍率]
 *
 * 注意首档必须和模型默认值（lib/fireModel.ts 的 DEFAULT_PARAMS）对上，
 * 否则界面显示的尺寸会和实际生成的对不上。
 */
export const SIZE_STEPS: [number, number][] = [
  [1, 1], // 160 × 90（默认）
  [1.25, 1], // 200 × 90
  [1.6, 1.1], // 256 × 99
  [2, 1.2], // 320 × 108
  [2.5, 1.3], // 400 × 117
  [3, 1.5], // 480 × 135
  [4, 1.7], // 640 × 153
];

/** 最小地图尺寸（= 默认精度），1 格 = 10 米 */
export const MIN_COLS = 160;
export const MIN_ROWS = 90;

/** 子页面的四个分区 */
type Tab = "world" | "random" | "paint" | "io";

const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: "world", icon: "🌍", label: "真实世界", desc: "世界地图上的真实区域" },
  { id: "random", icon: "🎲", label: "随机生成", desc: "程序生成的地貌" },
  { id: "paint", icon: "🖌", label: "绘画地图", desc: "自己一笔一笔画" },
  { id: "io", icon: "💾", label: "导入 / 载入", desc: "存取地图存档" },
];

/**
 * 地图操作台
 *
 * 为什么要把这些操作收进一个子页面？
 *   因为现在的主角是「真实世界地图」—— 打开就应该看到亚欧大陆。
 *   而"随机生成""绘画""导入载入"这些都是**换地图**的手段，
 *   平铺在侧栏里会抢走主角的注意力。
 *   收成一层之后，主界面只剩一个「换地图」入口，语义清楚多了。
 */
export default function MapPanel({
  brush,
  setBrush,
  radius,
  setRadius,
  active,
  setActive,
  onClear,
  onRandom,
  onClearFire,
  onTerrain,
  onFlavor,
  flavorId,
  onWorld,
  onSave,
  onLoad,
  cols,
  rows,
  sizeScale,
  setSizeScale,
  region,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("world");

  const widthM = cols * METERS_PER_CELL;
  const heightM = rows * METERS_PER_CELL;
  const areaHa = (widthM * heightM) / 10000;
  const areaKm2 = (widthM * heightM) / 1e6;
  const football = (widthM * heightM) / (105 * 68);
  /** 当前档位在 SIZE_STEPS 里的下标；找不到就退回第 0 档 */
  const sizeIdx = Math.max(0, SIZE_STEPS.findIndex((s) => s[0] === sizeScale));
  const stepLabel = SIZE_STEPS[sizeIdx];
  const cells = cols * rows;
  const heavy = cells > 30000;
  const regionName = region ? REGIONS.find((r) => r.id === region)?.name ?? region : "";

  // 打开面板时按 Esc 关闭，符合所有弹层的习惯
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* ---------- 主界面：一个入口 ---------- */}
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="panel-title">地图</span>
          <span className="text-[10.5px] text-ash-400">1 格 = {METERS_PER_CELL} 米</span>
        </div>

        <button
          className="flex w-full items-center justify-between rounded-lg border border-[#2E7D4F]/40 bg-[#2E7D4F]/5 px-3 py-2.5 text-left transition hover:bg-[#2E7D4F]/10"
          onClick={() => setOpen(true)}
          title="更换地图 / 调整尺寸 / 绘画 / 导入载入"
        >
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-[#2E7D4F]">
              🗺 更换地图
            </span>
            <span className="mt-0.5 block truncate text-[10.5px] leading-4 text-ash-500">
              当前：{regionName || "程序生成地貌"} · {cols}×{rows} 格
            </span>
          </span>
          <span className="shrink-0 text-[10.5px] text-ash-400">打开 ›</span>
        </button>

        {/* 当前是哪块地，一眼看清 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ash-500">
          <span>
            共 <b className="font-medium text-ash-700">{cells.toLocaleString()}</b> 格
          </span>
          <span>
            {(widthM / 1000).toFixed(2)} × {(heightM / 1000).toFixed(2)} km
          </span>
          <span>
            {areaKm2 >= 6 ? `${areaKm2.toFixed(1)} km²` : `${areaHa.toFixed(0)} 公顷`}
          </span>
        </div>
      </div>

      {/* ---------- 子页面 ---------- */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ash-900/45 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[860px] rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-ash-100 px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-medium text-ash-900">地图操作</h2>
                <p className="mt-0.5 text-[11px] text-ash-400">
                  换一块地、调尺寸、自己画、存取存档
                </p>
              </div>
              <button
                className="rounded-lg border border-ash-200 px-2.5 py-1 text-[11.5px] text-ash-500 transition hover:bg-ash-50"
                onClick={() => setOpen(false)}
              >
                关闭 (Esc)
              </button>
            </div>

            {/* 四个分区 */}
            <div className="grid grid-cols-2 gap-1.5 border-b border-ash-100 px-5 py-3 sm:grid-cols-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    tab === t.id
                      ? "border-[#2E6FB8]/50 bg-[#2E6FB8]/5"
                      : "border-ash-200 bg-white hover:bg-ash-50"
                  }`}
                >
                  <span className="block text-[12.5px] font-medium text-ash-800">
                    {t.icon} {t.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-ash-400">
                    {t.desc}
                  </span>
                </button>
              ))}
            </div>

            <div className="px-5 py-4">
              {/* ===== 真实世界 ===== */}
              {tab === "world" && (
                <div>
                  <p className="mb-3 rounded-lg bg-ash-50 px-3 py-2 text-[11.5px] leading-5 text-ash-500">
                    地图不再是随机生成的，而是世界上真实存在的一块地方。
                    每格的植被由它的**真实纬度**决定 ——
                    赤道是雨林、副热带是干旱草原、寒带是针叶林。
                  </p>
                  <div className="space-y-2">
                    {REGIONS.map((r) => {
                      const on = region === r.id;
                      const gridCols = cols;
                      const gridRows = rows;
                      const [w, s, e, n] = r.bbox;
                      const realW = ((e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180)).toFixed(0);
                      const realH = ((n - s) * 111).toFixed(0);
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            onWorld(r.id);
                            setOpen(false);
                          }}
                          className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition ${
                            on
                              ? "border-[#2E7D4F]/60 bg-[#2E7D4F]/8"
                              : "border-ash-200 bg-white hover:bg-ash-50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <b className="text-[13px] font-medium text-ash-900">{r.name}</b>
                              {on && (
                                <span className="rounded bg-[#2E7D4F]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#2E7D4F]">
                                  当前
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-4 text-ash-500">
                              {r.desc}
                            </span>
                            <span className="mt-1.5 block text-[10.5px] text-ash-400">
                              经度 {w}° ~ {e}° · 纬度 {s}° ~ {n}° · 实地约 {realW} × {realH} km
                              （网格 {gridCols}×{gridRows}，1 格 ≈{" "}
                              {((e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180) / gridCols).toFixed(1)} km）
                            </span>
                          </span>
                          <span className="shrink-0 pt-0.5 text-[11px] text-[#2E7D4F]">
                            {on ? "重新载入" : "载入 ›"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10.5px] leading-4 text-ash-400">
                    轮廓数据内置于项目，是矢量多边形（不是位图），
                    所以放大到任何网格分辨率都不会糊，也不依赖任何外部图片或网络请求。
                  </p>
                </div>
              )}

              {/* ===== 随机生成 ===== */}
              {tab === "random" && (
                <div>
                  <p className="mb-3 rounded-lg bg-ash-50 px-3 py-2 text-[11.5px] leading-5 text-ash-500">
                    用噪声算法从零生成一片地貌。和真实地图的区别是：
                    它不在地球上的任何地方，但地貌逻辑（山脉、河谷、林带、城镇、林道）
                    是按照真实地理规律搭出来的。
                  </p>
                  <p className="mb-3 rounded-lg bg-[#2E7D4F]/5 px-3 py-2 text-[11.5px] leading-5 text-[#2E7D4F]">
                    每次随机都会换一种<b>地貌品种</b> —— 山脊、盆地、高原、湖沼、
                    疏林、密林各有各的火场脾气，不会每次都长一个样。
                  </p>
                  <div className="space-y-2">
                    <button
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-[#2E7D4F]/40 bg-[#2E7D4F]/5 px-3.5 py-3 text-left transition hover:bg-[#2E7D4F]/10"
                      onClick={() => {
                        onRandom();
                        setOpen(false);
                      }}
                      title="换一个种子 + 换一种地貌品种，得到一片全新的地方"
                    >
                      <span>
                        <span className="block text-[12.5px] font-medium text-[#2E7D4F]">
                          🎲 随机换一片
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-ash-500">
                          {region ? "重新采样当前的真实地图区域" : "随机挑一种地貌品种 + 随机地形"}
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10.5px] text-ash-400">推荐 ›</span>
                    </button>
                    <button
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-ash-200 bg-white px-3.5 py-3 text-left transition hover:bg-ash-50"
                      onClick={() => {
                        onTerrain();
                        setOpen(false);
                      }}
                      title="沿用当前的地貌品种，只换一套地形"
                    >
                      <span>
                        <span className="block text-[12.5px] font-medium text-ash-800">
                          🏔 重新生成同品种
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-ash-500">
                          沿用当前品种，只换一套地形
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10.5px] text-ash-400">›</span>
                    </button>
                    <button
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-ash-200 bg-white px-3.5 py-3 text-left transition hover:bg-ash-50"
                      onClick={onClear}
                      title="把整片地铺成枯草"
                    >
                      <span>
                        <span className="block text-[12.5px] font-medium text-ash-800">
                          🟨 铺满枯草
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-ash-500">
                          清掉一切，只留一片最容易烧的草地，方便做对照实验
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10.5px] text-ash-400">›</span>
                    </button>
                  </div>

                  {/* 地貌品种：点一下就换成那个品种 */}
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-medium text-ash-500">
                      直接指定一种地貌品种
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {TERRAIN_FLAVORS.map((f) => {
                        const on = flavorId === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => {
                              onFlavor(f.id);
                              setOpen(false);
                            }}
                            className={
                              "rounded-lg border px-3 py-2.5 text-left transition " +
                              (on
                                ? "border-[#2E7D4F]/60 bg-[#2E7D4F]/5"
                                : "border-ash-200 bg-white hover:bg-ash-50")
                            }
                            title={f.desc}
                          >
                            <span className="block text-[12px] font-medium text-ash-800">
                              {f.name}
                              {on && (
                                <span className="ml-2 rounded bg-[#2E7D4F]/10 px-1.5 py-px text-[10px] font-semibold text-[#2E7D4F]">
                                  当前
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-ash-400">
                              {f.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== 绘画地图 ===== */}
              {tab === "paint" && (
                <div>
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-ash-50 px-3 py-2">
                    <span className="text-[11.5px] text-ash-500">
                      {active
                        ? "画笔已打开：在地图上按住拖动即可刷地形。"
                        : "打开画笔后，就能自己布置植被和岩石。"}
                    </span>
                    <button
                      onClick={() => setActive(!active)}
                      className={`relative ml-3 h-5 w-9 shrink-0 rounded-full transition ${
                        active ? "bg-[#2E6FB8]" : "bg-ash-200"
                      }`}
                      title={active ? "关闭画笔" : "打开画笔"}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          active ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {FUELS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setBrush(f.id);
                          setActive(true);
                        }}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                          brush === f.id && active
                            ? "border-[#2E6FB8]/50 bg-[#2E6FB8]/5"
                            : "border-ash-200 bg-white hover:bg-ash-50"
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="min-w-0 truncate text-[12px] text-ash-700">{f.name}</span>
                      </button>
                    ))}
                  </div>

                  <label className="mb-3 block">
                    <span className="mb-1 flex items-center justify-between text-[12px] text-ash-600">
                      笔刷大小
                      <b className="font-medium text-ash-800">
                        {radius === 0 ? "单格" : `${radius * 2 + 1} 格宽`}
                      </b>
                    </span>
                    <input
                      type="range"
                      className="slider"
                      min={0}
                      max={6}
                      step={1}
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                    />
                  </label>

                  <button
                    className="w-full rounded-lg border border-ash-200 bg-white px-2 py-2 text-[11.5px] text-ash-600 transition hover:bg-ash-50"
                    onClick={onClearFire}
                    title="清掉所有火和灰烬，地形保持不变"
                  >
                    清空火情（地形不动）
                  </button>
                </div>
              )}

              {/* ===== 导入 / 载入 ===== */}
              {tab === "io" && (
                <div>
                  <p className="mb-3 rounded-lg bg-ash-50 px-3 py-2 text-[11.5px] leading-5 text-ash-500">
                    存档是一个 .json 文件，里面装着植被、湿度和当前火情。
                    存下来就能反复用同一片火场做对照实验。
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      className="rounded-lg border border-[#2E6FB8]/40 bg-[#2E6FB8]/5 px-3 py-3 text-[12px] font-medium text-[#2E6FB8] transition hover:bg-[#2E6FB8]/10"
                      onClick={onSave}
                      title="把当前地图存成一个 .json 文件（含植被、湿度、火情）"
                    >
                      ↓ 保存地图
                    </button>
                    <button
                      className="rounded-lg border border-ash-200 bg-white px-3 py-3 text-[12px] text-ash-600 transition hover:bg-ash-50"
                      onClick={onLoad}
                      title="读取之前保存的 .json 地图存档"
                    >
                      ↑ 载入地图
                    </button>
                  </div>
                  <p className="mt-3 text-[10.5px] leading-4 text-ash-400">
                    保存的是「当前这张图」的完整状态。载入时会自动按存档里的格数
                    调整地图尺寸，不需要手动改设置。
                  </p>
                </div>
              )}
            </div>

            {/* ---------- 尺寸 + 比例尺（始终可见，因为四个分区都要用） ---------- */}
            <div className="border-t border-ash-100 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-ash-200 bg-white px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ash-800">地图尺寸</span>
                    <b className="text-[12px] font-medium text-ash-800">
                      {cols} × {rows} 格
                    </b>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min={0}
                    max={SIZE_STEPS.length - 1}
                    step={1}
                    value={sizeIdx}
                    onChange={(e) => setSizeScale(SIZE_STEPS[Number(e.target.value)][0])}
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-ash-400">
                    <span>最小（{MIN_COLS}×{MIN_ROWS}）</span>
                    <span>
                      {stepLabel[0]}× 宽 / {stepLabel[1]}× 高
                    </span>
                    <span>最大</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ash-100 pt-2 text-[10.5px] text-ash-500">
                    <span>
                      共 <b className="font-medium text-ash-700">{cells.toLocaleString()}</b> 格
                    </span>
                    <span>
                      {(widthM / 1000).toFixed(2)} km × {(heightM / 1000).toFixed(2)} km
                    </span>
                    {heavy && (
                      <span className="rounded bg-ember-50 px-1.5 py-0.5 text-ember-600">
                        图较大，模拟会慢一些
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-ash-200 bg-white px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ash-800">比例尺</span>
                    <span className="text-[10.5px] text-ash-400">1 格 = {METERS_PER_CELL} 米</span>
                  </div>
                  <div className="space-y-1 text-[11px] leading-[1.55] text-ash-500">
                    <div className="flex justify-between">
                      <span>面积</span>
                      <b className="font-medium text-ash-700">
                        {areaHa.toFixed(1)} 公顷（{areaKm2.toFixed(2)} km²）
                      </b>
                    </div>
                    <div className="flex justify-between">
                      <span>≈ 足球场</span>
                      <b className="font-medium text-ash-700">{football.toFixed(0)} 个</b>
                    </div>
                  </div>
                  <p className="mt-2 border-t border-ash-100 pt-2 text-[10.5px] leading-4 text-ash-400">
                    1 格永远等于 {METERS_PER_CELL} 米。拉大尺寸不是"把格子拉大"，
                    而是"往外多看一圈地"。{areaKm2 >= 6
                      ? `当前 ${areaKm2.toFixed(1)} km²，已经接近一场真实山火的量级。`
                      : `真实山火动辄上万亩（>6 km²）。`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
