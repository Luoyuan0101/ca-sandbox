"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlPanel from "@/components/ControlPanel";
import FireCanvas from "@/components/FireCanvas";
import StatsChart from "@/components/StatsChart";
import TerrainEditor from "@/components/TerrainEditor";
import {
  CellState,
  DEFAULT_PARAMS,
  DEFAULT_RESCUE,
  IGNITION_CAUSES,
  createBlankGrid,
  createCrews,
  createGrid,
  countFlammable,
  countStates,
  igniteAt,
  makeRng,
  paintFuel,
  stepCrews,
  stepGrid,
  type FireCrew,
  type Grid,
  type RescueParams,
  type SimParams,
  type Snapshot,
} from "@/lib/fireModel";
import {
  buildSummary,
  downloadBlob,
  downloadText,
  timestampName,
  toCSV,
  toDocxBlob,
  toJSON,
  toPptxBlob,
  type ExperimentRecord,
} from "@/lib/export";

export default function FirePage() {
  const [params, setParamsState] = useState<SimParams>(DEFAULT_PARAMS);
  const [causeId, setCauseId] = useState("lightning");
  const [rescue, setRescueState] = useState<RescueParams>(DEFAULT_RESCUE);
  const [seed, setSeed] = useState(DEFAULT_PARAMS.seed);

  const [grid, setGrid] = useState<Grid>(() => createGrid(DEFAULT_PARAMS));
  const [crews, setCrews] = useState<FireCrew[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [turn, setTurn] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [toast, setToast] = useState<string | null>(null);
  const [suppressedTotal, setSuppressedTotal] = useState(0);
  const [cutTotal, setCutTotal] = useState(0);
  const [rescueMode, setRescueMode] = useState("idle");

  // 地形编辑器
  const [paintMode, setPaintMode] = useState(false);
  const [brush, setBrush] = useState("conifer");
  const [brushRadius, setBrushRadius] = useState(1);

  // 随机数发生器要在多次渲染间保持一致，否则每轮重新播种就不随机了
  const rngRef = useRef(makeRng(seed));
  const startedRef = useRef(true);

  const cause = useMemo(
    () => IGNITION_CAUSES.find((c) => c.id === causeId) ?? IGNITION_CAUSES[0],
    [causeId]
  );

  const flammable = useMemo(() => countFlammable(grid), [grid]);

  const setParams = useCallback((patch: Partial<SimParams>) => {
    setParamsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setRescue = useCallback((patch: Partial<RescueParams>) => {
    setRescueState((prev) => {
      const next = { ...prev, ...patch };
      // 队伍数量变化时立即重排消防队
      if (patch.crews !== undefined) {
        setCrews(createCrews(next, grid));
        setSuppressedTotal(0);
      }
      return next;
    });
  }, [grid]);

  /* ---------- 重置 ---------- */
  const reset = useCallback(
    (nextSeed?: number, nextParams?: SimParams) => {
      const p = nextParams ?? { ...params, seed: nextSeed ?? seed };
      rngRef.current = makeRng(p.seed);
      const g = createGrid(p);
      setGrid(g);
      setCrews([]);
      setSnapshots([]);
      setTurn(0);
      setSuppressedTotal(0);
      setCutTotal(0);
      setRescueMode("idle");
      setRunning(false);
      startedRef.current = true;
    },
    [params, seed]
  );

  // 参数里的种子变化时重建
  useEffect(() => {
    setParamsState((prev) => ({ ...prev, seed }));
  }, [seed]);

  /* ---------- 模拟主循环 ---------- */
  useEffect(() => {
    if (!running) return;
    // 速度 <1 时表示"每轮要等超过 1 秒"，用来慢慢观察火怎么爬。
    // 上限放到 4 秒，再慢就不如用"单步"按钮了。
    const interval = Math.min(4000, Math.max(40, 1000 / speed));
    const timer = setInterval(() => {
      setGrid((g) => {
        // 第一步：火势自然演化
        const fire = stepGrid(g, { ...params, seed }, turn, rngRef.current);

        // 第二步：消防队行动（在火势之后，顺序影响结果，这里固定）
        const resc = stepCrews(
          fire.grid,
          crews.length > 0 ? crews : createCrews(rescue, fire.grid),
          rescue,
          rngRef.current
        );
        if (resc.suppressed > 0) setSuppressedTotal((n) => n + resc.suppressed);
        if (resc.cut > 0) setCutTotal((n) => n + resc.cut);
        setRescueMode(resc.mode);
        setCrews(resc.crews);

        // 消防扑灭后再统计，曲线才反映"实际火情"
        const snap = countStates(resc.grid, turn);
        setSnapshots((prev) => [...prev, snap]);
        setTurn((t) => t + 1);
        const done =
          snap.burning === 0 && snap.ember === 0 && snap.heating === 0;
        if (done) setRunning(false);
        return resc.grid;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [running, speed, params, seed, turn, rescue, crews]);

  /* ---------- 鼠标操作：只用于点火 ---------- */
  const handleCell = useCallback(
    (x: number, y: number) => {
      setGrid((g) => igniteAt(g, x, y, cause));
      setSnapshots((prev) => (prev.length === 0 ? [countStates(grid, 0)] : prev));
      // 第一次点火时按当前配置派出消防队
      setCrews((prev) => (prev.length === 0 ? createCrews(rescue, grid) : prev));
      startedRef.current = false;
    },
    [cause, grid, rescue]
  );

  /* ---------- 刷地形 ---------- */
  const handlePaint = useCallback(
    (x: number, y: number) => {
      setGrid((g) => paintFuel(g, x, y, brush, brushRadius));
    },
    [brush, brushRadius]
  );

  /** 铺满枯草：清掉一切，只留一片最容易烧的草地 */
  function terrainClear() {
    rngRef.current = makeRng(seed);
    setGrid(createBlankGrid({ ...params, seed }, "drygrass"));
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    showToast("已铺满枯草，可以开始画地形了");
  }

  /** 随机地形：按当前植被构成重新生成（含天然屏障） */
  function terrainRandom() {
    rngRef.current = makeRng(seed);
    setGrid(createGrid({ ...params, seed }));
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    showToast("已按当前植被构成重新生成地形");
  }

  /** 清空火情：火和灰烬都清掉，地形不动 */
  function terrainClearFire() {
    setGrid((g) => {
      const state = new Uint8Array(g.state.length); // 全 0 = Normal
      return { ...g, state, age: new Uint8Array(g.age.length) };
    });
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    setCrews([]);
    showToast("火情已清空，地形保持不变");
  }

  /** 保存地图：把植被/湿度/火情打包成一个 .json 下载 */
  function terrainSave() {
    const data = {
      format: "ca-fire-map",
      version: 1,
      cols: grid.cols,
      rows: grid.rows,
      metersPerCell: 10,
      savedAt: new Date().toISOString(),
      fuel: Array.from(grid.fuel),
      moisture: Array.from(grid.moisture).map((m) => Number(m.toFixed(3))),
      state: Array.from(grid.state),
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `火场地图_${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("地图已保存为 JSON 文件");
  }

  /** 载入地图：读回之前保存的 .json */
  function terrainLoad() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const d = JSON.parse(String(reader.result));
          if (d.format !== "ca-fire-map" || !Array.isArray(d.fuel)) {
            showToast("这不是本沙盒保存的地图文件");
            return;
          }
          if (d.cols !== grid.cols || d.rows !== grid.rows) {
            showToast(`地图尺寸不符（存档 ${d.cols}×${d.rows}，当前 ${grid.cols}×${grid.rows}）`);
            return;
          }
          setGrid({
            ...grid,
            fuel: (d.fuel as string[]).slice(),
            moisture: Float32Array.from(
              (d.moisture ?? new Array(d.fuel.length).fill(0.3)) as number[]
            ) as Grid["moisture"],
            state: Uint8Array.from(
              (d.state ?? new Array(d.fuel.length).fill(0)) as number[]
            ) as Grid["state"],
            age: new Uint8Array(d.fuel.length) as Grid["age"],
          });
          setCrews([]);
          setSnapshots([]);
          setTurn(0);
          setSuppressedTotal(0);
          setCutTotal(0);
          setRescueMode("idle");
          setRunning(false);
          showToast("地图已载入，可以接着点火了");
        } catch {
          showToast("地图文件解析失败");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ---------- 随机点火 ---------- */
  function randomIgnite(n = 3) {
    setGrid((g) => {
      let next = g;
      const rng = rngRef.current;
      for (let k = 0; k < n; k++) {
        const x = Math.floor(rng() * g.cols);
        const y = Math.floor(rng() * g.rows);
        next = igniteAt(next, x, y, cause);
      }
      return next;
    });
    setSnapshots((prev) => (prev.length === 0 ? [countStates(grid, 0)] : prev));
    setCrews((prev) => (prev.length === 0 ? createCrews(rescue, grid) : prev));
  }

  /* ---------- 单步 ---------- */
  function stepOnce() {
    setGrid((g) => {
      const fire = stepGrid(g, { ...params, seed }, turn, rngRef.current);
      const resc = stepCrews(
        fire.grid,
        crews.length > 0 ? crews : createCrews(rescue, fire.grid),
        rescue,
        rngRef.current
      );
      if (resc.suppressed > 0) setSuppressedTotal((n) => n + resc.suppressed);
      if (resc.cut > 0) setCutTotal((n) => n + resc.cut);
      setRescueMode(resc.mode);
      setCrews(resc.crews);

      const snap = countStates(resc.grid, turn);
      setSnapshots((prev) =>
        prev.length === 0 ? [countStates(g, 0), snap] : [...prev, snap]
      );
      setTurn((t) => t + 1);
      return resc.grid;
    });
  }

  /* ---------- 导出 ---------- */
  function makeRecord(): ExperimentRecord {
    return {
      exportedAt: new Date().toLocaleString("zh-CN"),
      params: { ...params, seed },
      causeId,
      rescue: { ...rescue },
      suppressedTotal,
      cutTotal,
      snapshots,
      flammable,
      grid,
      turns: turn,
    };
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function exportDocx() {
    if (snapshots.length === 0) {
      showToast("先跑一轮模拟，再导出报告");
      return;
    }
    showToast("正在生成 Word 报告…");
    try {
      const blob = await toDocxBlob(makeRecord());
      downloadBlob(`火灾模拟实验报告_${timestampName()}.docx`, blob);
      showToast("Word 报告已生成");
    } catch (e) {
      showToast("生成失败：" + (e as Error).message);
    }
  }

  async function exportPptx() {
    if (snapshots.length === 0) {
      showToast("先跑一轮模拟，再导出 PPT");
      return;
    }
    showToast("正在生成 PPT…");
    try {
      const blob = await toPptxBlob(makeRecord());
      downloadBlob(`火灾模拟汇报_${timestampName()}.pptx`, blob);
      showToast("PPT 已生成（5 页，含原生折线图）");
    } catch (e) {
      showToast("生成失败：" + (e as Error).message);
    }
  }

  const summary = snapshots.length > 0 ? buildSummary(makeRecord()) : null;
  const burning = snapshots[snapshots.length - 1]?.burning ?? 0;

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8">
      {/* 顶部 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-[12.5px] text-ash-400 hover:text-ember-600">
            ← 返回沙盒选择
          </Link>
          <h1 className="mt-1.5 text-[24px] font-medium text-ash-900">
            火灾蔓延沙盒
          </h1>
          <p className="mt-1 text-[13px] text-ash-500">
            多阶段燃烧元胞自动机 · 状态机「正常 → 火星 → 升温 → 燃烧 → 灰烬」
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ash-200 bg-white px-3.5 py-2.5">
          <span className="text-[12px] text-ash-500">消防队</span>
          <b className="text-[13px] font-medium text-ash-800">
            {rescue.crews === 0 ? "未派出" : `${rescue.crews} 支`}
          </b>
          {rescue.crews > 0 && (
            <>
              <span className="text-ash-300">·</span>
              <span className="text-[12px] text-ash-500">
                已扑救{" "}
                <b className="font-medium text-[#2E6FB8]">{suppressedTotal}</b> 格
              </span>
              <span className="text-ash-300">·</span>
              <span className="text-[12px] text-ash-500">
                湿带{" "}
                <b className="font-medium text-[#4E8FCB]">{cutTotal}</b> 格
              </span>
              {rescueMode === "cutline" && (
                <span className="rounded-md bg-[#2E6FB8]/10 px-2 py-0.5 text-[11.5px] text-[#2E6FB8]">
                  正在开隔离带
                </span>
              )}
              {rescueMode === "fight" && (
                <span className="rounded-md bg-ember-50 px-2 py-0.5 text-[11.5px] text-ember-600">
                  正在扑打火线
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* 左侧：画布 + 曲线 */}
        <div className="space-y-5">
          <div className="panel p-4">
            <FireCanvas
              grid={grid}
              onCellAction={handleCell}
              crews={crews}
              rainId={params.rain}
              turn={turn}
              running={running}
              tool={paintMode ? "paint" : "ignite"}
              onPaint={handlePaint}
            />

            {/* 播放控制 */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ash-100 pt-4">
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (snapshots.length === 0) randomIgnite(2);
                  setRunning((r) => !r);
                }}
              >
                {running ? "⏸ 暂停" : "▶ 开始"}
              </button>
              <button className="btn btn-ghost" onClick={stepOnce}>
                ⏭ 单步
              </button>
              <button className="btn btn-ghost" onClick={() => randomIgnite(3)}>
                🎲 随机点火
              </button>
              <button className="btn btn-ghost" onClick={() => reset()}>
                🔄 重置
              </button>
              <span className="ml-auto text-[12.5px] text-ash-500">
                第 <b className="font-medium text-ash-800">{turn}</b> 轮 · 当前燃烧{" "}
                <b className="font-medium text-ember-600">{burning}</b> 格
              </span>
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="panel-title">实时统计曲线</span>
              <span className="text-[11.5px] text-ash-400">
                有曲线才是实验，不是动画
              </span>
            </div>
            <StatsChart data={snapshots} />
          </div>

          {/* 结果摘要 */}
          {summary && (
            <div className="panel grid gap-4 p-4 sm:grid-cols-4">
              {[
                { k: "总轮次", v: `${summary.turns}`, unit: "轮" },
                { k: "燃烧峰值", v: `${summary.peakBurning}`, unit: `格（第 ${summary.peakTurn} 轮）` },
                { k: "最终烧毁", v: `${summary.finalAsh}`, unit: "格" },
                {
                  k: "烧毁占比",
                  v: `${(summary.burnedRatio * 100).toFixed(1)}`,
                  unit: "% 可燃区",
                },
              ].map((x) => (
                <div key={x.k}>
                  <div className="text-[12px] text-ash-400">{x.k}</div>
                  <div className="mt-1 text-[22px] font-medium leading-none text-ash-900">
                    {x.v}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ash-400">{x.unit}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：控制面板 */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-ash-200 lg:pl-6">
          {/* 播放速度 */}
          <div className="panel px-4 py-3.5">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-ash-600">
                播放速度
                <b className="font-medium text-ash-800">
                  {speed < 1 ? `${Math.round(speed * 1000)} 毫秒/轮` : `${speed} 轮/秒`}
                </b>
              </span>
              <input
                type="range"
                className="slider"
                min={0.25}
                max={30}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span className="mt-1.5 flex justify-between text-[11px] text-ash-400">
                <span>极慢</span>
                <span>适合慢慢看火怎么爬</span>
                <span>快</span>
              </span>
            </label>
            {/* 常用档位，一键切换 */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { v: 0.5, label: "0.5×超慢" },
                { v: 1, label: "1×" },
                { v: 3, label: "3×" },
                { v: 8, label: "8×" },
                { v: 20, label: "20×" },
              ].map((p) => (
                <button
                  key={p.v}
                  onClick={() => setSpeed(p.v)}
                  className={`rounded-md border px-2 py-1 text-[11.5px] transition ${
                    speed === p.v
                      ? "border-ember-300 bg-ember-50 text-ember-700"
                      : "border-ash-200 bg-white text-ash-500 hover:bg-ash-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <TerrainEditor
            brush={brush}
            setBrush={setBrush}
            radius={brushRadius}
            setRadius={setBrushRadius}
            active={paintMode}
            setActive={setPaintMode}
            onClear={terrainClear}
            onRandom={terrainRandom}
            onClearFire={terrainClearFire}
            onSave={terrainSave}
            onLoad={terrainLoad}
            cols={grid.cols}
            rows={grid.rows}
          />

          <ControlPanel
            params={params}
            setParams={setParams}
            causeId={causeId}
            setCauseId={setCauseId}
            rescue={rescue}
            setRescue={setRescue}
            seed={seed}
            setSeed={setSeed}
          />

          {/* 导出 */}
          <div className="panel p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="panel-title">导出实验记录</span>
              <span className="text-[11px] text-ash-400">
                {snapshots.length} 轮数据
              </span>
            </div>
            <div className="space-y-2">
              <button
                className="btn btn-primary w-full"
                onClick={exportPptx}
                disabled={snapshots.length === 0}
              >
                📽 导出 PPT 汇报（推荐）
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={exportDocx}
                disabled={snapshots.length === 0}
              >
                📄 导出 Word 实验报告
              </button>
              <button
                className="btn btn-ghost w-full"
                disabled={snapshots.length === 0}
                onClick={() => {
                  downloadText(
                    `火灾模拟数据_${timestampName()}.csv`,
                    toCSV(makeRecord()),
                    "text/csv"
                  );
                  showToast("CSV 已导出（可直接用 Excel 画图）");
                }}
              >
                📊 导出 CSV 数据
              </button>
              <button
                className="btn btn-ghost w-full"
                disabled={snapshots.length === 0}
                onClick={() => {
                  downloadText(
                    `火灾模拟记录_${timestampName()}.json`,
                    toJSON(makeRecord()),
                    "application/json"
                  );
                  showToast("JSON 已导出（含完整参数，可复现）");
                }}
              >
                🗂 导出 JSON 记录
              </button>
              <p className="rounded-lg bg-ash-50 px-3 py-2.5 text-[11.5px] leading-5 text-ash-500">
                <b className="text-ash-700">PPT</b> 是「讲给别人听」的：5 页，
                含核心结论大数字、原生可编辑折线图、参数页、数据表。
                <b className="text-ash-700">Word</b> 是完整实验记录，<b className="text-ash-700">CSV</b> 用来自己画图。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 提示条 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-ash-800 px-4 py-2.5 text-[13px] text-white">
          {toast}
        </div>
      )}
    </main>
  );
}
