"use client";

import { FUELS } from "@/lib/fireModel";

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
  /** 生成一片真实地貌（山脉 / 河谷 / 湖泊 / 林带 / 城镇 / 林道） */
  onTerrain: () => void;
  /** 地图存档 */
  onSave: () => void;
  onLoad: () => void;
  /** 地图格数，用于换算比例尺 */
  cols: number;
  rows: number;
  /** 调整地图尺寸 */
  sizeScale: number;
  setSizeScale: (v: number) => void;
}

/** 一格 = 10 米 */
const METERS_PER_CELL = 10;

/** 尺寸档位：最小就是原来那张图，往上每次长宽各涨 20% */
const SIZE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4];
const MIN_COLS = 80;
const MIN_ROWS = 50;

/**
 * 地形编辑器
 *
 * 让用户自己"画"一片考场：想在针叶林里点火会怎样？
 * 在湿草包围的小岛上点火会怎样？自己搭一遍比看别人演示印象深得多。
 */
export default function TerrainEditor({
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
  onSave,
  onLoad,
  cols,
  rows,
  sizeScale,
  setSizeScale,
}: Props) {
  const widthM = cols * METERS_PER_CELL;
  const heightM = rows * METERS_PER_CELL;
  const areaHa = (widthM * heightM) / 10000;
  const areaKm2 = (widthM * heightM) / 1e6;
  const football = (widthM * heightM) / (105 * 68);
  const sizeIdx = SIZE_STEPS.indexOf(sizeScale);
  const cells = cols * rows;
  // 大图会明显变慢，提前说清楚，别让用户以为卡死了
  const heavy = cells > 30000;
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="panel-title">地形编辑器</span>
        <button
          onClick={() => setActive(!active)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
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

      <p className="mb-3 rounded-lg bg-ash-50 px-3 py-2 text-[11.5px] leading-5 text-ash-500">
        {active
          ? "画笔已打开：在左侧地图上按住拖动即可刷地形。"
          : "打开画笔后，就能自己布置植被和岩石，设计一片专属火场。"}
      </p>

      {/* 一键生成真实地貌 */}
      <button
        className="mb-3 flex w-full items-center justify-between rounded-lg border border-[#2E7D4F]/40 bg-[#2E7D4F]/5 px-3 py-2 text-left transition hover:bg-[#2E7D4F]/10"
        onClick={onTerrain}
        title="用噪声算法生成一片真实地貌：山脉、河谷、湖泊、针叶林带、城镇、林道"
      >
        <span>
          <span className="block text-[12.5px] font-medium text-[#2E7D4F]">
            🏔 生成真实地貌
          </span>
          <span className="mt-0.5 block text-[10.5px] leading-4 text-ash-500">
            山脉 · 河谷 · 湖泊 · 林带 · 城镇 · 林道
          </span>
        </span>
        <span className="text-[10.5px] text-ash-400">推荐</span>
      </button>

      {/* 地图尺寸 */}
      <div className="mb-3 rounded-lg border border-ash-200 bg-white px-3 py-2.5">
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
          value={sizeIdx < 0 ? 0 : sizeIdx}
          onChange={(e) => setSizeScale(SIZE_STEPS[Number(e.target.value)])}
        />
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-ash-400">
          <span>最小（{MIN_COLS}×{MIN_ROWS}）</span>
          <span>{sizeScale}×</span>
          <span>最大</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ash-100 pt-2 text-[10.5px] text-ash-500">
          <span>
            共 <b className="font-medium text-ash-700">{cells.toLocaleString()}</b> 格
          </span>
          <span>
            实际范围{" "}
            <b className="font-medium text-ash-700">
              {(widthM / 1000).toFixed(2)} km × {(heightM / 1000).toFixed(2)} km
            </b>
          </span>
          {heavy && (
            <span className="rounded bg-ember-50 px-1.5 py-0.5 text-ember-600">
              图较大，模拟会比小图慢
            </span>
          )}
        </div>
      </div>

      {/* 燃料选择 */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
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

      {/* 笔刷大小 */}
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

      {/* 一键操作 */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          className="rounded-lg border border-ash-200 bg-white px-2 py-1.5 text-[11.5px] text-ash-600 transition hover:bg-ash-50"
          onClick={onClear}
          title="把整片地铺成枯草"
        >
          铺满枯草
        </button>
        <button
          className="rounded-lg border border-ash-200 bg-white px-2 py-1.5 text-[11.5px] text-ash-600 transition hover:bg-ash-50"
          onClick={onRandom}
          title="按当前植被构成重新随机生成"
        >
          随机地形
        </button>
        <button
          className="rounded-lg border border-ash-200 bg-white px-2 py-1.5 text-[11.5px] text-ash-600 transition hover:bg-ash-50"
          onClick={onClearFire}
          title="清掉所有火和灰烬，地形保持不变"
        >
          清空火情
        </button>
      </div>

      {/* 地图存档 */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          className="rounded-lg border border-[#2E6FB8]/40 bg-[#2E6FB8]/5 px-2 py-1.5 text-[11.5px] font-medium text-[#2E6FB8] transition hover:bg-[#2E6FB8]/10"
          onClick={onSave}
          title="把当前地图存成一个 .json 文件（含植被、湿度、火情）"
        >
          ↓ 保存地图
        </button>
        <button
          className="rounded-lg border border-ash-200 bg-white px-2 py-1.5 text-[11.5px] text-ash-600 transition hover:bg-ash-50"
          onClick={onLoad}
          title="读取之前保存的 .json 地图存档"
        >
          ↑ 载入地图
        </button>
      </div>

      {/* 比例尺 */}
      <div className="mt-3 rounded-lg border border-ash-200 bg-white px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ash-800">比例尺</span>
          <span className="text-[10.5px] text-ash-400">1 格 = {METERS_PER_CELL} 米</span>
        </div>
        <div className="space-y-1 text-[11px] leading-[1.55] text-ash-500">
          <div className="flex justify-between">
            <span>整张地图</span>
            <b className="font-medium text-ash-700">
              {widthM >= 1000 ? `${(widthM / 1000).toFixed(2)} km` : `${widthM} m`} ×{" "}
              {heightM >= 1000 ? `${(heightM / 1000).toFixed(2)} km` : `${heightM} m`}
            </b>
          </div>
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
          比例尺是固定的：无论地图多大，1 格永远等于 {METERS_PER_CELL} 米。
          所以拉大尺寸不是「把格子拉大」，而是「往外多看一圈地」——
          面积随尺寸增长，单格代表的实际大小不变。
          {areaKm2 >= 6
            ? `当前 ${areaKm2.toFixed(1)} km²，已经接近一场真实山火的量级。`
            : `真实山火动辄上万亩（>6 km²），把尺寸拉大就能对上这个量级。`}
        </p>
      </div>
    </div>
  );
}
