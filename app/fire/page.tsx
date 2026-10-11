"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlPanel from "@/components/ControlPanel";
import FireCanvas from "@/components/FireCanvas";
import StatsChart from "@/components/StatsChart";
import MapPanel, { MIN_COLS, MIN_ROWS, SIZE_STEPS } from "@/components/MapPanel";
import {
  CellState,
  DEFAULT_PARAMS,
  DEFAULT_RESCUE,
  IGNITION_CAUSES,
  createBlankGrid,
  createCrews,

  createRealWorld,
  createTerrain,
  countFlammable,
  countStates,
  igniteAt,
  igniteRandom,
  makeRng,
  paintFuel,
  stepCrews,
  stepGrid,
  nextSeed,
  TERRAIN_FLAVORS,
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
import { REGION_MAP, REGIONS } from "@/lib/atlas";
import { ELEVATION_GRADIENT_CSS } from "@/lib/elevation";

/**
 * 1× 倍速对应的绝对速度（轮/秒）
 *
 * 为什么要有这个基准值，而不是直接让滑块存"轮/秒"？
 * ──────────────────────────────────────────────
 * 因为用户要的是「0.25x - 2.0x 的倍速」—— 这里的关键词是**倍速**，
 * 也就是"相对于正常速度的倍数"。如果滑块直接存轮/秒，
 * 那"1×"就没有确切含义（改成 1 还是 3？），以后想调基准也没有落脚点。
 *
 * 拆成"倍率 × 基准"之后：
 *   · 1× 永远等于"正常速度"，与基准数值无关
 *   · 想整体调快调慢，只改这一个数
 *   · 「快进」那种 30 轮/秒级别的需求不再挤进倍速滑块里
 *     （慢速细看和一步算到结果是两种意图，共用一个控件必然别扭）
 */
const BASE_RPS = 3;

/** 「快进」一次算多少轮 */
const FASTFORWARD_ROUNDS = 200;

/**
 * 按 params.region 决定用哪种地形
 *
 * region === "" → 程序生成的真实地貌（createTerrain）
 * region === "eurasia" 等 → 真实世界地图（createRealWorld）
 *
 * 所有"重建地图"的地方都必须走这个函数，
 * 否则切换区域之后一按"随机种子"就又变回程序地形了。
 *
 * `flavorId` 是程序地形的「地貌品种」，真实地图用不上（传 undefined）。
 */
function buildMap(p: SimParams, flavorId?: string): Grid {
  return p.region ? createRealWorld(p) : createTerrain(p, flavorId);
}

export default function FirePage() {  const [params, setParamsState] = useState<SimParams>(DEFAULT_PARAMS);
  const [causeId, setCauseId] = useState("lightning");
  const [rescue, setRescueState] = useState<RescueParams>(DEFAULT_RESCUE);
  const [seed, setSeed] = useState(DEFAULT_PARAMS.seed);

  // 一进来就给一片真实地貌，而不是色块
  const [grid, setGrid] = useState<Grid>(() => createTerrain(DEFAULT_PARAMS));
  const [crews, setCrews] = useState<FireCrew[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [turn, setTurn] = useState(0);
  const [running, setRunning] = useState(false);
  /**
   * 播放倍率（0.25 ~ 2.0）
   *
   * 注意它是**倍率**，不是"轮/秒"。
   * 之前的 `speed` 直接把滑块值当轮/秒用（0.25~30），
   * 于是"3"这个数字既是倍率又是速度，换个基准就全乱。
   * 现在 1× 永远 = BASE_RPS 轮/秒，30 轮/秒那种速度交给「快进」。
   */
  const [speedMul, setSpeedMul] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [suppressedTotal, setSuppressedTotal] = useState(0);
  const [cutTotal, setCutTotal] = useState(0);
  const [rescueMode, setRescueMode] = useState("idle");

  // 地形编辑器
  const [paintMode, setPaintMode] = useState(false);
  const [brush, setBrush] = useState("conifer");
  const [brushRadius, setBrushRadius] = useState(1);
  // 地图尺寸倍率：1 = 最小（128×72，约 720p），往上主要往横向铺开
  const [sizeScale, setSizeScaleState] = useState(1);
  /**
   * 当前锁定的「地貌品种」。null = 不指定，由种子自己决定。
   * 有了它，"随机换一片"才能真的换一个脾气，而不是只换细节。
   */
  const [flavorId, setFlavorId] = useState<string | null>(null);
  /**
   * 是否显示「海拔视图」
   *
   * 海拔场是高程生成植被时的中间量，和植被图同一次产出、天然对齐。
   * 打开后画布按高程着色，能一眼看出火是在爬山脊还是顺河谷跑。
   */
  const [showElevation, setShowElevation] = useState(false);

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
      const g = buildMap(p, flavorId ?? undefined);
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

  /**
   * 调整地图尺寸
   *
   * 比例尺固定（1 格 = 10 米），所以尺寸一变，
   * 相当于换了一块更大的地重新开始 —— 火情、消防队、曲线全部归零，
   * 不然曲线会把两片不同大小的地拼在一张图上，没法解释。
   */
  const setSizeScale = useCallback((scale: number) => {
    setSizeScaleState(scale);
    // 档位是 [宽倍率, 高倍率]，高度只缓涨，横向主要往外铺
    const step = SIZE_STEPS.find((s) => s[0] === scale) ?? SIZE_STEPS[0];
    const cols = Math.round((MIN_COLS * step[0]) / 2) * 2;
    const rows = Math.round((MIN_ROWS * step[1]) / 2) * 2;
    rngRef.current = makeRng(seed);
    setParamsState((prev) => {
      const next = { ...prev, cols, rows, seed };
      const g = buildMap(next, flavorId ?? undefined);
      setGrid(g);
      return next;
    });
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    startedRef.current = true;
    showToast(
      `地图已调整为 ${cols}×${rows} 格（${((cols * 10) / 1000).toFixed(1)} km × ${((rows * 10) / 1000).toFixed(1)} km，共 ${(cols * rows).toLocaleString()} 格）`
    );
  }, [seed, flavorId]);

  /* ---------- 模拟主循环 ---------- */
  useEffect(() => {
    if (!running) return;
    // speedMul 是**倍率**（0.25~2），真正的轮/秒 = BASE_RPS × 倍率。
    // 0.25× 时一轮要等 1.33 秒，用来慢慢观察火怎么爬；
    // 上限放 4 秒，再慢就不如用"单步"按钮了。
    const interval = Math.min(4000, Math.max(40, 1000 / (BASE_RPS * speedMul)));
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
  }, [running, speedMul, params, seed, turn, rescue, crews]);

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

  /**
   * 点火之后要做的公共收尾
   *
   * 为什么抽出来？因为「点地图」和「随机点火」两条路径都必须：
   *   ① 如果这是第一次点火，补一条第 0 轮的基线快照（曲线才有起点）
   *   ② 按当前配置派出消防队
   * 以前这两段是复制粘贴的，很容易改了一处忘了另一处。
   */
  const afterIgnite = useCallback(() => {
    setSnapshots((prev) => (prev.length === 0 ? [countStates(grid, 0)] : prev));
    setCrews((prev) => (prev.length === 0 ? createCrews(rescue, grid) : prev));
    startedRef.current = false;
  }, [grid, rescue]);

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
    setFlavorId(null);
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    showToast("已铺满枯草，可以开始画地形了");
  }

  /**
   * 随机地形：换种子 + 换品种
   *
   * 这里以前有个 bug：种子不推进就直接重建，于是点一百次都是同一张图。
   * 现在两件事一起做 ——
   *   ① 用 nextSeed() 真正推进种子（Math.imul 保证 32 位精度不丢）
   *   ② 从种子里**排除掉当前品种**再随机挑一个
   * 这样每次点都会换一种"脾气"，不会连着随出同一片地方。
   */
  function terrainRandom() {
    const s = nextSeed(seed);
    setSeed(s);
    setParamsState((prev) => ({ ...prev, seed: s, region: "" }));
    rngRef.current = makeRng(s);

    if (params.region) {
      // 当前是真实地图：重新投影同一块地方（换种子 → 局部植被重采样）
      setGrid(createRealWorld({ ...params, seed: s }));
      showToast("已重新载入真实地图（同一块地方，重新采样）");
    } else {
      const pool = TERRAIN_FLAVORS.filter((f) => f.id !== flavorId);
      const next = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
      setFlavorId(next);
      const g = createTerrain({ ...params, seed: s }, next ?? undefined);
      setGrid(g);
      showToast(`🎲 ${g.flavor?.name ?? "新地形"} —— ${g.flavor?.desc ?? ""}`);
    }

    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    startedRef.current = true;
  }

  /** 指定地貌品种：直接换成那个品种的一片新地形 */
  function terrainFlavor(id: string) {
    const s = nextSeed(seed);
    setSeed(s);
    setParamsState((prev) => ({ ...prev, seed: s, region: "" }));
    rngRef.current = makeRng(s);
    setFlavorId(id);
    const g = createTerrain({ ...params, seed: s }, id);
    setGrid(g);
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    startedRef.current = true;
    showToast(`${g.flavor?.name} —— ${g.flavor?.desc}`);
  }

  /**
   * 重新生成真实地貌
   *
   * `newSeed` 给了就用它（外部指定种子），否则推进一格。
   * 品种默认沿用当前的 —— 想换脾气去点品种卡片，这里只换地形。
   */
  function terrainReal(newSeed?: number) {
    const s = newSeed ?? nextSeed(seed);
    rngRef.current = makeRng(s);
    // 从真实地图切回程序地貌，记得把 region 清掉
    setParamsState((prev) => ({ ...prev, seed: s, region: "" }));
    const g = createTerrain({ ...params, seed: s, region: "" }, flavorId ?? undefined);
    setGrid(g);
    setCrews([]);
    setSnapshots([]);
    setTurn(0);
    setSuppressedTotal(0);
    setCutTotal(0);
    setRescueMode("idle");
    setRunning(false);
    startedRef.current = true;
    showToast(`🏔 已重新生成：${g.flavor?.name ?? "真实地貌"}`);
  }

  /**
   * 切到真实世界地图
   *
   * region 为空字符串时表示"不用真实地图"。
   * 切换后火情/消防队/曲线全部归零 —— 换了一块地方，旧数据没有意义。
   */
  const terrainWorld = useCallback(
    (regionId: string) => {
      // 真实地图至少给到默认精度 —— 一整块大陆塞进更小的网格会糊成一团。
      // 取较大值，避免把已经更细的图反而降下来。
      const cols = Math.max(grid.cols, MIN_COLS);
      const rows = Math.max(grid.rows, MIN_ROWS);
      const next = { ...params, region: regionId, seed, cols, rows };
      setParamsState(next);
      rngRef.current = makeRng(seed);
      setGrid(createRealWorld(next));
      setCrews([]);
      setSnapshots([]);
      setTurn(0);
      setSuppressedTotal(0);
      setCutTotal(0);
      setRescueMode("idle");
      setRunning(false);
      startedRef.current = true;
      const name = REGION_MAP[regionId]?.name ?? regionId;
      const [w, s, e, n] = REGION_MAP[regionId]?.bbox ?? [0, 0, 1, 1];
      const realW = (e - w) * 111 * Math.cos((((s + n) / 2) * Math.PI) / 180);
      const realH = (n - s) * 111;
      showToast(
        `已载入真实世界地图：${name}（${cols}×${rows} 格，1 格 ≈ ${(realW / cols).toFixed(0)} km）`
      );
    },
    [params, seed, grid.cols, grid.rows]
  );

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
  /**
   * 随机点 n 处火（默认 2 处）
   *
   * 关键改动：走 igniteRandom 而不是「随机抽两个坐标」。
   * 亚欧大陆那张图有 56% 是海，随手抽两个坐标很可能全落在水上，
   * 用户会以为按钮坏了。igniteRandom 只在**可燃的陆地格**里抽样，
   * 保证一次点击真的点着两处不同的地方。
   */
  function randomIgnite(n = 2) {
    let lit = 0;
    setGrid((g) => {
      const next = igniteRandom(g, n, cause, rngRef.current);
      // 用状态有没有变过来判断"到底点着了没有"
      for (let i = 0; i < g.state.length; i++) {
        if (next.state[i] !== g.state[i] && g.state[i] === CellState.Normal) lit++;
      }
      return next;
    });
    if (lit === 0) {
      showToast("这片地已经没得可烧了 —— 换一张地图，或先按「重置」");
      return;
    }
    afterIgnite();
    showToast(`🎲 随机点燃了 ${n} 处`);
  }

  /**
   * 「开始」按钮
   *
   * 语义已经改掉：开始**只启动演化，绝不替你点火**。
   * 点火这件事完全交给人 ——
   *   · 在地图上点哪里，哪里起火
   *   · 或者按「随机点火」随机点两处
   * 这样"火是从哪起的"始终是你自己决定的，实验才说得清。
   *
   * 如果地图上一处火都没有就按了开始，给个提示而不是空转 ——
   * 一片没有火的林子，演化一万轮也不会有任何变化。
   */
  function togglePlay() {
    if (running) {
      setRunning(false);
      return;
    }
    const hasFire = grid.state.some(
      (s) =>
        s === CellState.Ember || s === CellState.Heating || s === CellState.Burning
    );
    if (!hasFire) {
      showToast("还没有火 —— 在地图上点一下点火，或按「随机点火」");
      return;
    }
    setRunning(true);
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

  /* ---------- 快进 ----------
   * 一次性把接下来 FASTFORWARD_ROUNDS 轮算完，不经过定时器 ——
   * 所以它不是"更快地播放"，而是"跳过播放、直接给结果"。
   *
   * ⚠️ React 版本比单文件版本多一个坑：
   *    单文件版里 turn / crews / grid 都是普通变量，循环里直接改就行；
   *    但在 React 里，setState 是**异步批处理**的 ——
   *    如果在循环里写 `setTurn(t => t+1)`，那么下一轮读到的 `turn`
   *    还是**旧值**，stepGrid 拿到的轮次永远是初始轮，
   *    算出来的结果和逐轮播放对不上（火势演化的随机数消耗节奏会错位）。
   *    所以这里**在循环外用局部变量完整算完**，
   *    最后一次性 setState 提交结果。
   *    这也是我先写 .vt/fastforward.mjs 对比"快进 vs 逐轮逐格一致"
   *    的原因 —— 这种错误肉眼完全看不出来。
   */
  function fastForward() {
    const hasFire = grid.state.some(
      (s) =>
        s === CellState.Ember || s === CellState.Heating || s === CellState.Burning
    );
    if (!hasFire) {
      showToast("还没有火 —— 先在地图上点一下，或按「随机点火」");
      return;
    }

    setRunning(false);

    // 用局部变量跑完整段，避免读到过期的 state
    const t0 = performance.now();
    let g = grid;
    let crewList = crews;
    let t = turn;
    let addSuppressed = 0;
    let addCut = 0;
    let lastMode = rescueMode;
    const newSnaps: Snapshot[] = [];
    let done = 0;

    for (let k = 0; k < FASTFORWARD_ROUNDS; k++) {
      const fire = stepGrid(g, { ...params, seed }, t, rngRef.current);
      const resc = stepCrews(
        fire.grid,
        crewList.length > 0 ? crewList : createCrews(rescue, fire.grid),
        rescue,
        rngRef.current
      );
      g = resc.grid;
      crewList = resc.crews;
      addSuppressed += resc.suppressed;
      addCut += resc.cut;
      lastMode = resc.mode;
      newSnaps.push(countStates(g, t));
      t++;
      done++;
      // 火烧完了就提前收工 —— 为凑满 200 轮空转只会让用户以为"快进很慢"
      const s = newSnaps[newSnaps.length - 1];
      if (s.burning === 0 && s.ember === 0 && s.heating === 0) break;
    }
    const ms = Math.round(performance.now() - t0);

    // 一次性提交
    setGrid(g);
    setCrews(crewList);
    setTurn(t);
    if (addSuppressed > 0) setSuppressedTotal((n) => n + addSuppressed);
    if (addCut > 0) setCutTotal((n) => n + addCut);
    setRescueMode(lastMode);
    setSnapshots((prev) =>
      prev.length === 0 ? [countStates(grid, 0), ...newSnaps] : [...prev, ...newSnaps]
    );

    const s = newSnaps[newSnaps.length - 1];
    const spent = s.burning === 0 && s.ember === 0 && s.heating === 0;
    showToast(
      spent
        ? `⏩ 火已熄灭（推进 ${done} 轮，用时 ${ms} ms）`
        : `⏩ 快进 ${done} 轮（用时 ${ms} ms）`
    );
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

  /**
   * 「在烧的格子数」—— 明火 + 火星 + 升温 三种状态之和。
   *
   * 口径为什么是三个之和，而不是只看 Burning？
   *   ① 引火源不同，起始状态就不同：雷击/设备直接是 Burning，
   *      人为点火和烟头是 Ember，篝火是 Heating。
   *      只看 Burning 的话，选"人为点火"点着了也会显示 0，还是"点了没反应"。
   *   ② "有没有火"这件事，页面里别处（开始按钮的判断）用的就是这三者之和，
   *      这里如果换一套口径，就会出现"按开始能跑，但数字显示 0"的矛盾。
   *
   * 从**实时 grid** 数，不读快照 —— 原因见下方注释。
   */
  const burning = useMemo(() => {
    const c = countStates(grid, turn);
    return c.burning + c.ember + c.heating;
  }, [grid, turn]);

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
              windPower={params.windPower}
              turn={turn}
              running={running}
              tool={paintMode ? "paint" : "ignite"}
              onPaint={handlePaint}
              showElevation={showElevation}
              burning={burning}
            />

            {/* 播放控制 */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ash-100 pt-4">
              <button className="btn btn-primary" onClick={togglePlay}>
                {running ? "⏸ 暂停" : "▶ 开始"}
              </button>
              <button className="btn btn-ghost" onClick={stepOnce}>
                ⏭ 单步
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => randomIgnite(2)}
                title="在可燃的陆地上随机点燃两处"
              >
                🎲 随机点火
              </button>
              <button
                className={`btn ${showElevation ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setShowElevation((v) => !v)}
                title="按海拔给地图着色，一眼看出山脊和河谷"
              >
                🏔 海拔视图
              </button>
              <button className="btn btn-ghost" onClick={() => reset()}>
                🔄 重置
              </button>
              <span className="ml-auto text-[12.5px] text-ash-500">
                第 <b className="font-medium text-ash-800">{turn}</b> 轮 · 正在燃烧{" "}
                <b className="font-medium text-ember-600">{burning}</b> 格
              </span>
            </div>

            {/* 海拔视图打开时，说明现在看的是什么 */}
            {showElevation && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-ash-50 px-3 py-2">
                <span className="text-[11.5px] text-ash-500">
                  现在看的是<b className="font-medium text-ash-700">海拔</b> ——
                  越亮越高，越暗越低。火是在爬山脊还是顺河谷跑，一眼就看出来了。
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-ash-400">
                  <span className="inline-block h-3 w-16 rounded-[3px]" style={{ background: ELEVATION_GRADIENT_CSS }} />
                  低 → 高
                </span>
              </div>
            )}
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
          {/* 播放倍速 */}
          <div className="panel px-4 py-3.5">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-ash-600">
                播放倍速
                <b className="font-medium text-ash-800">
                  {speedMul}× · {BASE_RPS * speedMul} 轮/秒
                </b>
              </span>
              <input
                type="range"
                className="slider"
                min={0.25}
                max={2}
                step={0.25}
                value={speedMul}
                onChange={(e) => setSpeedMul(Number(e.target.value))}
              />
              <span className="mt-1.5 flex justify-between text-[11px] text-ash-400">
                <span>0.25× 极慢</span>
                <span>1× 是正常速度</span>
                <span>2× 最快</span>
              </span>
            </label>
            {/* 常用档位，一键切换 */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { v: 0.25, label: "0.25×最慢" },
                { v: 0.5, label: "0.5×" },
                { v: 1, label: "1×正常" },
                { v: 1.5, label: "1.5×" },
                { v: 2, label: "2×最快" },
              ].map((p) => (
                <button
                  key={p.v}
                  onClick={() => setSpeedMul(p.v)}
                  className={`rounded-md border px-2 py-1 text-[11.5px] transition ${
                    speedMul === p.v
                      ? "border-ember-300 bg-ember-50 text-ember-700"
                      : "border-ash-200 bg-white text-ash-500 hover:bg-ash-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* 快进：和倍速是两个概念，所以单独一个按钮 + 一句话说明 */}
            <div className="mt-3 border-t border-ash-100 pt-3">
              <button
                onClick={fastForward}
                className="w-full rounded-md border border-ash-200 bg-white px-2 py-1.5 text-[12px] text-ash-600 transition hover:bg-ash-50"
              >
                ⏩ 快进 {FASTFORWARD_ROUNDS} 轮
              </button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ash-400">
                不是&ldquo;更快地播放&rdquo;，而是一次把接下来 {FASTFORWARD_ROUNDS} 轮
                直接算完 —— 想看到最后烧成什么样就用它，不用干等。
              </p>
            </div>
          </div>

          <MapPanel
            brush={brush}
            setBrush={setBrush}
            radius={brushRadius}
            setRadius={setBrushRadius}
            active={paintMode}
            setActive={setPaintMode}
            onClear={terrainClear}
            onRandom={terrainRandom}
            onClearFire={terrainClearFire}
            onTerrain={terrainReal}
            onFlavor={terrainFlavor}
            flavorId={grid.flavor?.id ?? flavorId}
            onWorld={terrainWorld}
            onSave={terrainSave}
            onLoad={terrainLoad}
            cols={grid.cols}
            rows={grid.rows}
            sizeScale={sizeScale}
            setSizeScale={setSizeScale}
            region={params.region}
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
