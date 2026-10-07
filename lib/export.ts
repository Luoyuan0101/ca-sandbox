/**
 * 数据导出 —— JSON / CSV / Word 实验报告
 *
 * 这个模块的意义：把沙盒从「动画」变成「研究工具」。
 * 有了导出，你才能说"我跑了 8 组对照实验，数据在这里"。
 *
 * 注意：全部在浏览器端本地生成，不上传任何数据。
 */

import type { Grid, RescueParams, SimParams, Snapshot } from "./fireModel";
import {
  FUEL_MAP,
  RAIN_MAP,
  IGNITION_CAUSES,
  RESCUE_MODES,
  RESCUE_STRATEGIES,
  countFlammable,
} from "./fireModel";

export interface ExperimentRecord {
  /** 导出时间 */
  exportedAt: string;
  /** 参数快照 */
  params: SimParams;
  /** 点火原因 */
  causeId: string;
  /** 消防队救援配置 */
  rescue?: RescueParams;
  /** 累计扑救明火格数 */
  suppressedTotal?: number;
  /** 累计打湿隔离带格数 */
  cutTotal?: number;
  /** 逐轮统计 */
  snapshots: Snapshot[];
  /** 可燃格总数 */
  flammable: number;
  /** 当前地图（用于报告里的植被构成统计） */
  grid: Grid;
  /** 总轮次 */
  turns: number;
}

/* ============================================================
 * 一、整理实验摘要（导出内容的公共部分）
 * ============================================================ */

export interface Summary {
  turns: number;
  peakBurning: number;
  peakTurn: number;
  finalAsh: number;
  burnedRatio: number;
  durationTurns: number;
  mixText: string;
  causeName: string;
  rainName: string;
  windDirText: string;
  windPower: number;
  humidity: number;
}

const WIND_DIRS = ["东", "东南", "南", "西南", "西", "西北", "北", "东北"];

export function windDirText(rad: number) {
  const deg = ((rad * 180) / Math.PI + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return WIND_DIRS[idx];
}

export function buildSummary(rec: ExperimentRecord): Summary {
  const { snapshots, flammable, params } = rec;

  let peakBurning = 0;
  let peakTurn = 0;
  for (const s of snapshots) {
    if (s.burning > peakBurning) {
      peakBurning = s.burning;
      peakTurn = s.turn;
    }
  }

  const last = snapshots[snapshots.length - 1];
  const finalAsh = last?.ash ?? 0;

  // 植被构成文字化
  const fuelCount: Record<string, number> = {};
  for (const id of rec.grid.fuel) {
    fuelCount[id] = (fuelCount[id] ?? 0) + 1;
  }
  const total = rec.grid.fuel.length || 1;
  const mixText = Object.entries(fuelCount)
    .filter(([id]) => FUEL_MAP[id] && FUEL_MAP[id].flammability > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${FUEL_MAP[id].name} ${((n / total) * 100).toFixed(0)}%`)
    .join(" / ");

  const cause = IGNITION_CAUSES.find((c) => c.id === rec.causeId);

  return {
    turns: rec.turns,
    peakBurning,
    peakTurn,
    finalAsh,
    burnedRatio: flammable > 0 ? finalAsh / flammable : 0,
    durationTurns: rec.turns,
    mixText,
    causeName: cause?.name ?? "手动点火",
    rainName: RAIN_MAP[params.rain]?.name ?? "无雨",
    windDirText: windDirText(params.windDir),
    windPower: params.windPower,
    humidity: params.humidity,
  };
}

/* ============================================================
 * 二、JSON 导出 —— 完整可复现的记录
 * ============================================================ */

export function toJSON(rec: ExperimentRecord): string {
  const payload = {
    meta: {
      title: "火灾蔓延元胞自动机模拟实验记录",
      exportedAt: rec.exportedAt,
      model: "多阶段燃烧元胞自动机（5 状态）",
      reproducible: true,
      note: "使用相同 seed 与参数可复现本次模拟",
    },
    summary: buildSummary(rec),
    params: rec.params,
    snapshots: rec.snapshots,
  };
  return JSON.stringify(payload, null, 2);
}

/* ============================================================
 * 三、CSV 导出 —— 直接丢进 Excel 画图
 * ============================================================ */

export function toCSV(rec: ExperimentRecord): string {
  const header = "轮次,正常,火星,升温,燃烧,灰烬,湿隔离带,累计烧毁率";
  const flammable = rec.flammable || 1;
  const lines = rec.snapshots.map((s) => {
    const rate = ((s.ash / flammable) * 100).toFixed(2);
    return [s.turn, s.normal, s.ember, s.heating, s.burning, s.ash, s.wetline, rate].join(",");
  });
  return [header, ...lines].join("\n");
}

/* ============================================================
 * 四、Word 报告导出
 *
 * 用 docx 库在前端生成，结构模拟一份规范的实验报告。
 * Excel 打开 CSV 就能画图，Word 则是"给人看"的成品。
 * ============================================================ */

let docxCache: any = null;

async function loadDocx() {
  if (!docxCache) docxCache = await import("docx");
  return docxCache;
}

export async function toDocxBlob(rec: ExperimentRecord): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
  } = await loadDocx();

  const s = buildSummary(rec);
  const flammable = rec.flammable || 1;

  const H = (text: string, level: any = HeadingLevel.HEADING_2) =>
    new Paragraph({
      heading: level,
      spacing: { before: 260, after: 120 },
      children: [new TextRun({ text, bold: true })],
    });

  const P = (text: string, opts: any = {}) =>
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text, ...opts })],
    });

  // ---- 参数表 ----
  const paramRows: Array<[string, string]> = [
    ["地图规模", `${rec.params.cols} × ${rec.params.rows} 格`],
    ["植被构成", s.mixText],
    ["全局湿度", rec.params.humidity.toFixed(2)],
    ["风力", `${s.windDirText}向，强度 ${rec.params.windPower.toFixed(2)}`],
    ["降雨", s.rainName],
    ["着火原因", s.causeName],
    ["动物扰动·飞火", rec.params.animalEmber ? "开启" : "关闭"],
    ["动物扰动·踩踏", rec.params.animalTrample ? "开启" : "关闭"],
    ["随机种子", String(rec.params.seed)],
  ];

  // 救援配置（如果有）
  if (rec.rescue) {
    const strat = RESCUE_STRATEGIES.find((x) => x.id === rec.rescue!.strategy);
    const modeInfo = RESCUE_MODES.find((x) => x.id === rec.rescue!.mode);
    paramRows.push(
      ["消防队数量", rec.rescue.crews === 0 ? "未派出" : `${rec.rescue.crews} 支`],
      ["每轮移动", `${rec.rescue.speed} 格`],
      ["出警延迟", `${rec.rescue.delay} 轮`],
      ["调度策略", strat?.name ?? "—"],
      ["扑救方式", modeInfo?.name ?? "自动"]
    );
    if (typeof rec.suppressedTotal === "number") {
      paramRows.push(["累计扑救明火", `${rec.suppressedTotal} 格`]);
    }
    if (typeof rec.cutTotal === "number") {
      paramRows.push(["累计打湿隔离带", `${rec.cutTotal} 格`]);
    }
  }

  const paramTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: paramRows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              children: [P(k, { bold: true })],
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              children: [P(v)],
            }),
          ],
        })
    ),
  });

  // ---- 数据表（每 5 轮抽一行，避免过长） ----
  const sampled = rec.snapshots.filter((_, idx) => idx % 5 === 0 || idx === rec.snapshots.length - 1);
  const dataRows = [
    new TableRow({
      tableHeader: true,
      children: ["轮次", "正常", "火星", "升温", "燃烧", "灰烬", "湿带", "烧毁率"].map(
        (h) =>
          new TableCell({
            children: [P(h, { bold: true })],
          })
      ),
    }),
    ...sampled.map(
      (sn) =>
        new TableRow({
          children: [
            String(sn.turn),
            String(sn.normal),
            String(sn.ember),
            String(sn.heating),
            String(sn.burning),
            String(sn.ash),
            String(sn.wetline),
            `${((sn.ash / flammable) * 100).toFixed(1)}%`,
          ].map((v) => new TableCell({ children: [P(v)] })),
        })
    ),
  ];

  const dataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: dataRows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: "火灾蔓延元胞自动机模拟", bold: true, size: 32 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: "实 验 报 告", size: 26 })],
          }),

          H("一、实验目的"),
          P(
            "本实验使用多阶段燃烧元胞自动机模型，探究植被类型、空气湿度、风力、降雨及人为扑救等因素，对火灾蔓延速度、蔓延范围与最终烧毁面积的影响。"
          ),
          P(
            "模型特征：每个格子需依次经历「正常 → 火星 → 升温 → 燃烧 → 灰烬」五个阶段，每一步的状态提升均为概率判定，受环境参数调控；所有宏观火势形态均由格子与其邻居之间的局部规则自发形成（即「涌现」现象）。"
          ),

          H("二、实验参数"),
          paramTable,

          H("三、实验结果"),
          P(`模拟总轮次：${s.turns} 轮`),
          P(`燃烧峰值：第 ${s.peakTurn} 轮，同时燃烧 ${s.peakBurning} 格`),
          P(
            `最终烧毁面积：${s.finalAsh} 格，占全部可燃区域的 ${(s.burnedRatio * 100).toFixed(1)}%`
          ),
          P(`可燃格总数：${rec.flammable} 格`),

          H("四、逐轮数据（每 5 轮采样）"),
          dataTable,

          H("五、结论"),
          P(
            `在本次模拟中，火势于第 ${s.peakTurn} 轮达到峰值（同时燃烧 ${s.peakBurning} 格），最终烧毁 ${s.finalAsh} 格，占可燃区 ${(s.burnedRatio * 100).toFixed(1)}%。`
          ),
          P(
            s.rainName === "无雨"
              ? "本次模拟未施加降雨。可尝试在火势峰值时施加降雨，观察曲线下降速率的差异，形成对照实验。"
              : `本次模拟施加了「${s.rainName}」，可见其对状态提升概率产生了压制作用，火势受到明显抑制。`
          ),
          P(
            "建议进一步实验：固定其他参数，仅调整单一变量（如湿度 0.2 / 0.4 / 0.6），对比燃烧峰值与烧毁面积的变化，从而定量描述该因素的影响强度。"
          ),

          H("六、其他说明", HeadingLevel.HEADING_3),
          P(`导出时间：${rec.exportedAt}`, { italics: true, size: 20 }),
          P(
            "本报告由「元胞自动机沙盒」自动生成。使用相同的随机种子与参数，可复现完全一致的模拟结果。",
            { italics: true, size: 20 }
          ),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/* ============================================================
 * 五、PPT 导出
 *
 * 为什么还要 PPT？
 * Word 是"给自己看的完整记录"，PPT 是"讲给别人听的"。
 * 汇报时你不可能把 40 轮数据表念一遍，你需要：
 *   一张结论页 + 一张曲线图 + 一张参数页。
 * 所以 PPT 只放"最能说明问题的那几个数字"。
 * ============================================================ */

let pptxCache: any = null;

async function loadPptx() {
  if (!pptxCache) {
    const mod: any = await import("pptxgenjs");
    pptxCache = mod.default ?? mod;
  }
  return pptxCache;
}

/** 把逐轮数据抽稀成不超过 max 个点，用于画图 */
function downsample(snaps: Snapshot[], max = 60) {
  if (snaps.length <= max) return snaps;
  const step = Math.ceil(snaps.length / max);
  const out = snaps.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== snaps[snaps.length - 1]) {
    out.push(snaps[snaps.length - 1]);
  }
  return out;
}

export async function toPptxBlob(rec: ExperimentRecord): Promise<Blob> {
  const PptxGenJS = await loadPptx();
  const pptx = new PptxGenJS();

  // 16:9 宽屏
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  const s = buildSummary(rec);
  const flammable = rec.flammable || 1;
  const burnedPct = (s.burnedRatio * 100).toFixed(1);
  const burnedPctNum = s.burnedRatio * 100;

  // 配色（与网页一致）
  const INK = "2B2824";
  const INK2 = "5C554D";
  const INK3 = "918A81";
  const EMBER = "F65C0A";
  const BLUE = "2E6FB8";
  const LINE = "E5E1DA";

  /* ---------- 封面 ---------- */
  const s1 = pptx.addSlide();
  s1.background = { color: "FAF9F7" };
  s1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.16, fill: { color: EMBER },
  });
  s1.addText("火灾蔓延元胞自动机模拟", {
    x: 0.9, y: 2.3, w: 11.5, h: 1.0,
    fontSize: 40, bold: true, color: INK, fontFace: "微软雅黑",
  });
  s1.addText("实 验 报 告", {
    x: 0.9, y: 3.35, w: 11.5, h: 0.6,
    fontSize: 22, color: INK2, fontFace: "微软雅黑", charSpacing: 3,
  });
  s1.addShape(pptx.ShapeType.rect, {
    x: 0.95, y: 4.15, w: 2.2, h: 0.04, fill: { color: LINE },
  });
  s1.addText(
    [
      { text: "模型：", options: { bold: true, color: INK2 } },
      { text: "多阶段燃烧元胞自动机（正常 → 火星 → 升温 → 燃烧 → 灰烬）", options: { color: INK3 } },
    ],
    { x: 0.9, y: 4.45, w: 11.5, h: 0.4, fontSize: 13, fontFace: "微软雅黑" }
  );
  s1.addText(`导出时间：${rec.exportedAt}`, {
    x: 0.9, y: 4.85, w: 11.5, h: 0.35,
    fontSize: 11, color: INK3, fontFace: "微软雅黑",
  });

  /* ---------- 核心结论（一页说清） ---------- */
  const s2 = pptx.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText("核心结论", {
    x: 0.7, y: 0.45, w: 6, h: 0.55,
    fontSize: 26, bold: true, color: INK, fontFace: "微软雅黑",
  });

  // 四个大数字卡片
  const cards = [
    { label: "模拟总轮次", value: String(s.turns), unit: "轮", color: INK },
    { label: "燃烧峰值", value: String(s.peakBurning), unit: `格（第 ${s.peakTurn} 轮）`, color: EMBER },
    { label: "最终烧毁", value: String(s.finalAsh), unit: "格", color: INK },
    { label: "烧毁占比", value: burnedPct, unit: "% 可燃区", color: EMBER },
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 3.12;
    s2.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.35, w: 2.85, h: 1.75,
      fill: { color: "FAF9F7" }, line: { color: LINE, width: 1 },
      rectRadius: 0.08,
    });
    s2.addText(c.label, {
      x: x + 0.18, y: 1.52, w: 2.5, h: 0.3,
      fontSize: 11, color: INK3, fontFace: "微软雅黑",
    });
    s2.addText(c.value, {
      x: x + 0.18, y: 1.85, w: 2.5, h: 0.72,
      fontSize: 34, bold: true, color: c.color, fontFace: "微软雅黑",
    });
    s2.addText(c.unit, {
      x: x + 0.18, y: 2.6, w: 2.5, h: 0.3,
      fontSize: 10.5, color: INK3, fontFace: "微软雅黑",
    });
  });

  // 关键发现
  s2.addText("关键发现", {
    x: 0.7, y: 3.45, w: 6, h: 0.4,
    fontSize: 15, bold: true, color: INK, fontFace: "微软雅黑",
  });
  // 消防队那条结论要"会说话"：不只是报数字，还要判断这次扑救到底有没有用
  let rescueFinding: string;
  if (!rec.rescue || rec.rescue.crews <= 0) {
    rescueFinding = "本次未派出消防队，为纯自然蔓延的对照组。";
  } else {
    const sup = rec.suppressedTotal ?? 0;
    const cut = rec.cutTotal ?? 0;
    const modeName =
      RESCUE_MODES.find((m) => m.id === rec.rescue!.mode)?.name ?? rec.rescue.mode;
    const total = sup + cut;
    // 判断这支队伍是否真的改变了结局
    let verdict: string;
    if (total === 0) {
      verdict = "但这支队伍整场都没能靠近火线 —— 火势太快，扑救完全没跟上。";
    } else if (burnedPctNum >= 90) {
      verdict = "不过出警太晚，火势已经失控，扑救只改变了局部形态，没能扭转结局。";
    } else if (burnedPctNum >= 60) {
      verdict = "可以看到扑救确实延缓了蔓延，但没能把火压住。";
    } else {
      verdict = "扑救明显发挥了作用，火势被有效压制。";
    }
    rescueFinding =
      `派出 ${rec.rescue.crews} 支消防队（${modeName}，出警延迟 ${rec.rescue.delay} 轮），` +
      `累计扑救明火 ${sup} 格、打出湿隔离带 ${cut} 格。${verdict}`;
  }

  const findings: string[] = [
    `火势在第 ${s.peakTurn} 轮达到峰值，同时燃烧 ${s.peakBurning} 格；最终烧毁 ${s.finalAsh} 格，占可燃区的 ${burnedPct}%。`,
    s.rainName === "无雨"
      ? "本次模拟未施加降雨。建议对照实验：在火势峰值时施加降雨，观察曲线下降速率的变化。"
      : `施加了「${s.rainName}」，可见降雨对状态提升概率有明显压制，火势受到抑制。`,
    rescueFinding,
    "所有宏观火势形态均由格子与其邻居之间的局部规则自发形成，即「涌现」现象。",
  ];
  s2.addText(
    findings.map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true } })),
    {
      x: 0.85, y: 3.9, w: 11.7, h: 2.6,
      fontSize: 12.5, color: INK2, fontFace: "微软雅黑", lineSpacing: 22,
    }
  );

  /* ---------- 曲线图（原生 PPT 折线图） ---------- */
  const s3 = pptx.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addText("火势演化曲线", {
    x: 0.7, y: 0.45, w: 8, h: 0.55,
    fontSize: 26, bold: true, color: INK, fontFace: "微软雅黑",
  });
  s3.addText("状态格数随轮次的变化 —— 有曲线才是实验，不是动画", {
    x: 0.7, y: 1.0, w: 11, h: 0.35,
    fontSize: 12, color: INK3, fontFace: "微软雅黑",
  });

  const ds = downsample(rec.snapshots, 60);
  const chartData = [
    {
      name: "燃烧",
      labels: ds.map((x) => String(x.turn)),
      values: ds.map((x) => x.burning),
    },
    {
      name: "升温",
      labels: ds.map((x) => String(x.turn)),
      values: ds.map((x) => x.heating),
    },
    {
      name: "火星",
      labels: ds.map((x) => String(x.turn)),
      values: ds.map((x) => x.ember),
    },
    {
      name: "灰烬",
      labels: ds.map((x) => String(x.turn)),
      values: ds.map((x) => x.ash),
    },
    {
      name: "湿隔离带",
      labels: ds.map((x) => String(x.turn)),
      values: ds.map((x) => x.wetline),
    },
  ];

  s3.addChart(pptx.ChartType.line, chartData, {
    x: 0.6, y: 1.45, w: 12.1, h: 5.5,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 11,
    chartColors: ["F65C0A", "E8703A", "F0B429", "3B3733", "4E8FCB"],
    lineSize: 2.2,
    lineSmooth: false,
    showValue: false,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisTitle: "轮次",
    valAxisTitle: "格数",
    showCatAxisTitle: true,
    showValAxisTitle: true,
    catAxisTitleFontSize: 11,
    valAxisTitleFontSize: 11,
    catAxisLineShow: true,
    valAxisLineShow: true,
  });

  /* ---------- 实验参数 ---------- */
  const s4 = pptx.addSlide();
  s4.background = { color: "FFFFFF" };
  s4.addText("实验参数", {
    x: 0.7, y: 0.45, w: 8, h: 0.55,
    fontSize: 26, bold: true, color: INK, fontFace: "微软雅黑",
  });

  const paramPairs: Array<[string, string]> = [
    ["地图规模", `${rec.params.cols} × ${rec.params.rows} 格`],
    ["植被构成", s.mixText],
    ["空气湿度", rec.params.humidity.toFixed(2)],
    ["风力", `${s.windDirText}向，强度 ${rec.params.windPower.toFixed(2)}`],
    ["降雨", s.rainName],
    ["着火原因", s.causeName],
    ["动物扰动·飞火", rec.params.animalEmber ? "开启" : "关闭"],
    ["动物扰动·踩踏", rec.params.animalTrample ? "开启" : "关闭"],
    [
      "消防队",
      rec.rescue && rec.rescue.crews > 0
        ? `${rec.rescue.crews} 支 · 移动 ${rec.rescue.speed} 格/轮 · 延迟 ${rec.rescue.delay} 轮`
        : "未派出（对照组）",
    ],
    ["随机种子", String(rec.params.seed)],
  ];

  // 左右两栏排布
  paramPairs.forEach(([k, v], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = 0.7 + col * 6.2;
    const y = 1.4 + row * 0.92;
    s4.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 5.9, h: 0.78,
      fill: { color: "FAF9F7" }, line: { color: LINE, width: 0.75 },
      rectRadius: 0.06,
    });
    s4.addText(k, {
      x: x + 0.22, y: y + 0.07, w: 2.0, h: 0.3,
      fontSize: 11, color: INK3, fontFace: "微软雅黑",
    });
    s4.addText(v, {
      x: x + 0.22, y: y + 0.36, w: 5.45, h: 0.35,
      fontSize: 13, bold: true, color: INK, fontFace: "微软雅黑",
    });
  });

  s4.addText("使用相同的随机种子与参数，可复现完全一致的模拟结果。", {
    x: 0.7, y: 6.45, w: 11.5, h: 0.35,
    fontSize: 11, italic: true, color: INK3, fontFace: "微软雅黑",
  });

  /* ---------- 数据表 ---------- */
  const s5 = pptx.addSlide();
  s5.background = { color: "FFFFFF" };
  s5.addText("逐轮数据（抽样）", {
    x: 0.7, y: 0.45, w: 8, h: 0.55,
    fontSize: 26, bold: true, color: INK, fontFace: "微软雅黑",
  });
  s5.addText("完整数据请见导出的 CSV / Word 报告", {
    x: 0.7, y: 1.0, w: 11, h: 0.35,
    fontSize: 12, color: INK3, fontFace: "微软雅黑",
  });

  const tableSnaps = downsample(rec.snapshots, 18);
  const header = ["轮次", "正常", "火星", "升温", "燃烧", "灰烬", "湿带", "烧毁率"];
  const rows: any[] = [
    header.map((h) => ({
      text: h,
      options: { bold: true, color: "FFFFFF", fill: { color: INK }, fontSize: 11, align: "center" },
    })),
  ];
  tableSnaps.forEach((sn) => {
    rows.push([
      String(sn.turn),
      String(sn.normal),
      String(sn.ember),
      String(sn.heating),
      String(sn.burning),
      String(sn.ash),
      String(sn.wetline),
      `${((sn.ash / flammable) * 100).toFixed(1)}%`,
    ].map((v, ci) => ({
      text: v,
      options: {
        fontSize: 10.5,
        align: ci === 0 ? "center" : "right",
        color: ci === 5 ? "3B3733" : INK2,
        fill: { color: tableSnaps.indexOf(sn) % 2 === 0 ? "FFFFFF" : "FAF9F7" },
      },
    })));
  });

  s5.addTable(rows, {
    x: 0.7, y: 1.5, w: 11.9,
    colW: [1.3, 1.6, 1.4, 1.4, 1.6, 1.6, 1.4, 1.6],
    border: { type: "solid", color: LINE, pt: 0.5 },
    rowH: 0.28,
    valign: "middle",
  });

  /* ---------- 页脚统一加页码 ---------- */
  const total = pptx._slides.length;
  pptx._slides.forEach((sl: any, i: number) => {
    if (i === 0) return;
    sl.addText(`${i + 1} / ${total}`, {
      x: 12.2, y: 7.02, w: 0.9, h: 0.3,
      fontSize: 9, color: INK3, align: "right", fontFace: "微软雅黑",
    });
  });

  // pptxgenjs 在浏览器里 write() 得到 Blob
  const out = await pptx.write({ outputType: "blob" });
  return out as Blob;
}

/* ============================================================
 * 六、浏览器下载工具
 * ============================================================ */

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob(["\ufeff" + text], { type: `${mime};charset=utf-8` });
  triggerDownload(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function timestampName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export { countFlammable };
