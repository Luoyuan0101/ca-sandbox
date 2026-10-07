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
  /** 地图存档 */
  onSave: () => void;
  onLoad: () => void;
  /** 地图格数，用于换算比例尺 */
  cols: number;
  rows: number;
}

/** 一格 = 10 米 */
const METERS_PER_CELL = 10;

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
  onSave,
  onLoad,
  cols,
  rows,
}: Props) {
  const widthM = cols * METERS_PER_CELL;
  const heightM = rows * METERS_PER_CELL;
  const areaHa = (widthM * heightM) / 10000;
  const football = (widthM * heightM) / (105 * 68);
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
              {widthM} m × {heightM} m
            </b>
          </div>
          <div className="flex justify-between">
            <span>面积</span>
            <b className="font-medium text-ash-700">
              {areaHa.toFixed(1)} 公顷（{((widthM * heightM) / 1e6).toFixed(2)} km²）
            </b>
          </div>
          <div className="flex justify-between">
            <span>≈ 足球场</span>
            <b className="font-medium text-ash-700">{football.toFixed(0)} 个</b>
          </div>
        </div>
        <p className="mt-2 border-t border-ash-100 pt-2 text-[10.5px] leading-4 text-ash-400">
          单格约一片宅基地大小，整张图相当于一座小型林场 / 牧场。真实山火动辄上万亩（&gt;6 km²），
          所以这里模拟的是一场&lt;500 米见方的局部火，重点看「规律」，不看「体量」。
        </p>
      </div>
    </div>
  );
}
