/**
 * 火灾蔓延元胞自动机 —— 核心模型
 *
 * 设计说明
 * ─────────
 * 这是一个「多阶段燃烧」元胞自动机。与传统「着/不着」二值模型不同，
 * 每个格子要经历 5 个状态，燃料在着火前要先"被烤热"：
 *
 *   正常 ──→ 火星 ──→ 升温 ──→ 燃烧 ──→ 灰烬
 *            ↓        ↓        ↓
 *          熄灭     熄灭    持续 N 轮后转灰烬
 *
 * 每一步状态提升都是一次「概率判定」，受湿度、风力、燃料含水率、
 * 降雨等参数影响 —— 这就是各种环境变量"介入"模型的地方。
 *
 * 核心规则（真正的元胞自动机规则，只有这一条）：
 *   一个格子的命运，取决于它「邻居」的状态。
 * 所有宏观现象（蔓延、跳跃、隔离带）都是这条规则 + 参数涌现出来的，
 * 模型里没有任何一条规则直接描述"火灾的形状"。
 */

/* ============================================================
 * 一、状态定义
 * ============================================================ */

export const enum CellState {
  /** 正常：完整燃料，未受火影响 */
  Normal = 0,
  /** 火星：被火星击中，尚未确定能否点燃 */
  Ember = 1,
  /** 升温：已引燃，正在被烤热，还没出明火 */
  Heating = 2,
  /** 燃烧：明火，主动向外传火 */
  Burning = 3,
  /** 灰烬：已烧毁，不可再燃，但能阻挡传播 */
  Ash = 4,
  /**
   * 隔离带：消防队用水枪打湿的未燃地面
   *
   * 这是现实里扑救大火【唯一真正有效】的手段：
   * 不是傻追着火线每一格打，而是在火头前方抢出一条湿带，
   * 火走到这里就断了。海南、大兴起火时都是先开隔离带。
   * 湿带会随时间蒸发变干（几轮后失效），所以必须持续维护。
   */
  WetLine = 5,
}

export const STATE_META = [
  { key: CellState.Normal, label: "正常", color: "#4A8538" },
  { key: CellState.Ember, label: "火星", color: "#F0B429" },
  { key: CellState.Heating, label: "升温", color: "#E8703A" },
  { key: CellState.Burning, label: "燃烧", color: "#F65C0A" },
  { key: CellState.Ash, label: "灰烬", color: "#3B3733" },
  { key: CellState.WetLine, label: "湿隔离带", color: "#4E8FCB" },
] as const;

/* ============================================================
 * 二、燃料类型
 *
 * 关键：六种燃料的差异不是"可燃性高低"这一个数字，
 * 而是四个维度共同作用，才会产生不同的宏观火灾形态：
 *   - 枯草：烧得快、传得近，火势瞬间铺开但跑不远
 *   - 针叶林：烧得慢、飞火多，容易"跳过隔离带"（真实森林大火最麻烦处）
 *   - 湿草/阔叶林：含水率高，本身就是天然防火隔离带
 * ============================================================ */

export interface FuelType {
  id: string;
  name: string;
  /** 可燃基础概率（0-1），越高越容易被点燃 */
  flammability: number;
  /** 燃烧持续轮数，之后转为灰烬 */
  burnDuration: number;
  /** 传火距离（格），1 = 仅正交邻居，2 = 含斜角邻居 */
  spreadRange: number;
  /** 飞火播撒概率，越高越容易产生"跳跃式蔓延" */
  emberRate: number;
  /** 初始含水率（0-1），越高越难升温 */
  moisture: number;
  /** 地图上的绘制色 */
  color: string;
}

export const FUELS: FuelType[] = [
  {
    id: "drygrass",
    name: "枯草",
    flammability: 0.9,
    burnDuration: 4,
    spreadRange: 1,
    emberRate: 0.1,
    moisture: 0.05,
    color: "#D4B483",
  },
  {
    id: "wetgrass",
    name: "湿草",
    flammability: 0.25,
    burnDuration: 5,
    spreadRange: 1,
    emberRate: 0.03,
    moisture: 0.65,
    color: "#67A455",
  },
  {
    id: "shrub",
    name: "灌木",
    flammability: 0.75,
    burnDuration: 7,
    spreadRange: 1,
    emberRate: 0.2,
    moisture: 0.2,
    color: "#4A7C3F",
  },
  {
    id: "conifer",
    name: "针叶林",
    flammability: 0.6,
    burnDuration: 14,
    spreadRange: 2,
    emberRate: 0.45,
    moisture: 0.3,
    color: "#2A5020",
  },
  {
    id: "broadleaf",
    name: "阔叶林",
    flammability: 0.4,
    burnDuration: 10,
    spreadRange: 1,
    emberRate: 0.08,
    moisture: 0.45,
    color: "#386A2A",
  },
  {
    id: "barren",
    name: "沙土/岩石",
    flammability: 0,
    burnDuration: 0,
    spreadRange: 0,
    emberRate: 0,
    moisture: 0,
    color: "#C9BFA8",
  },
];

export const FUEL_MAP: Record<string, FuelType> = Object.fromEntries(
  FUELS.map((f) => [f.id, f])
);

/* ============================================================
 * 三、降雨
 *
 * 雨的作用不是"直接灭火"，而是压制状态提升的概率，
 * 并持续给全场补水 —— 所以开雨后要等几轮才见效，
 * 雨停后地面还是湿的，也有一段时间不易复燃。
 * ============================================================ */

export interface RainLevel {
  id: string;
  name: string;
  /** 每轮对状态提升概率的压制系数（0-1，1 = 完全压制） */
  suppress: number;
  /** 每轮给全场增加的环境湿度 */
  moistureAdd: number;
  /** 画布上的雨丝密度 */
  density: number;
}

export const RAIN_LEVELS: RainLevel[] = [
  { id: "none", name: "无雨", suppress: 0, moistureAdd: 0, density: 0 },
  { id: "light", name: "小雨", suppress: 0.05, moistureAdd: 0.002, density: 40 },
  { id: "moderate", name: "中雨", suppress: 0.25, moistureAdd: 0.015, density: 110 },
  { id: "heavy", name: "大雨", suppress: 0.6, moistureAdd: 0.04, density: 220 },
  { id: "storm", name: "暴雨", suppress: 0.95, moistureAdd: 0.1, density: 380 },
];

export const RAIN_MAP: Record<string, RainLevel> = Object.fromEntries(
  RAIN_LEVELS.map((r) => [r.id, r])
);

/* ============================================================
 * 四、着火原因
 *
 * 不同原因不只是文案差异，而是改变初始条件：
 *   雷击 → 瞬间高温，直接进入燃烧态（跳过火星/升温）
 *   人为 → 从火星开始，缓慢引燃（给一个反应时间）
 * ============================================================ */

export interface IgnitionCause {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 点火时格子直接进入的状态 */
  startState: CellState;
  /** 生成着火点时的散布半径（0 = 精确单点） */
  scatter: number;
}

export const IGNITION_CAUSES: IgnitionCause[] = [
  {
    id: "lightning",
    name: "雷击",
    icon: "⚡",
    desc: "瞬间高温，直接燃起明火，常为单点",
    startState: CellState.Burning,
    scatter: 0,
  },
  {
    id: "human",
    name: "人为点火",
    icon: "🔥",
    desc: "从火星开始缓慢引燃，有时间被发现扑救",
    startState: CellState.Ember,
    scatter: 1,
  },
  {
    id: "cigarette",
    name: "烟头未熄",
    icon: "🚬",
    desc: "低概率引燃，多自己熄灭，风大时突然炸开",
    startState: CellState.Ember,
    scatter: 0,
  },
  {
    id: "campfire",
    name: "篝火失控",
    icon: "🏕️",
    desc: "由火堆中心向外扩张，受风向影响极大",
    startState: CellState.Heating,
    scatter: 2,
  },
  {
    id: "equipment",
    name: "设备故障",
    icon: "⚙️",
    desc: "多点同时起火，模拟线路老化等场景",
    startState: CellState.Burning,
    scatter: 4,
  },
];

/* ============================================================
 * 五、模拟参数
 * ============================================================ */

export interface SimParams {
  /** 地图列数 */
  cols: number;
  /** 地图行数 */
  rows: number;
  /** 全局环境湿度 0-1，越高越难点燃 */
  humidity: number;
  /** 风力强度 0-1 */
  windPower: number;
  /** 风向（弧度），0 = 向右（东） */
  windDir: number;
  /** 降雨档位 id */
  rain: string;
  /** 动物扰动：飞火（鸟/风把火星带到远处） */
  animalEmber: boolean;
  /** 动物扰动：踩踏（踩出隔离带） */
  animalTrample: boolean;
  /** 植被构成比例（会自动归一化） */
  mix: Record<string, number>;
  /** 随机数种子，保证同一组参数可复现 */
  seed: number;
}

export const DEFAULT_PARAMS: SimParams = {
  cols: 80,
  rows: 50,
  humidity: 0.3,
  windPower: 0.4,
  windDir: 0,
  rain: "none",
  animalEmber: true,
  animalTrample: false,
  mix: { drygrass: 30, wetgrass: 15, shrub: 15, conifer: 20, broadleaf: 10, barren: 10 },
  seed: 20261007,
};

/* ============================================================
 * 五之二、消防队救援系统
 *
 * 设计立场（重要）
 * ────────────────
 * 早期版本提供了"鼠标笔刷直接灭火"，但那是「上帝之手」：
 * 指挥官想抹掉哪格就抹掉哪格，不符合现实，也让实验失去意义。
 *
 * 真实世界里，救援力量是【有限】的：
 *   · 队伍数量有限
 *   · 每支队伍每轮的处理量有物理上限
 *   · 队伍移动需要时间
 *   · 出警需要反应时间
 *
 * 所以这里把"灭火"重做成一支支【自动行动的消防队】：
 * 它们自己找火、自己跑过去、一轮只能压住一个格。
 * 火大时，你的队伍根本救不过来 —— 这不是 bug，这就是结论。
 * 而"临界点在哪里"正是可以实验出来的量。
 * ============================================================ */

/**
 * 消防队的调度策略 */
export interface RescueStrategy {
  id: string;
  name: string;
  desc: string;
}

/**
 * 一支消防队的扑救效率
 *
 * 现实里一支消防队不是"一个人一次泼一桶水"，
 * 而是几台水车 + 一组人员同时作业。早期把效率压成 1 格/轮
 * 会让消防队看起来完全没用 —— 那不真实，也观察不到价值。
 * 1.8 格/轮意味着：小火时压得住，大火时仍然力不从心。
 */
const CREW_EFFECTIVENESS = 1.8;

export const RESCUE_STRATEGIES: RescueStrategy[] = [
  {
    id: "nearest",
    name: "就近扑救",
    desc: "直奔离自己最近的火点 —— 反应快，但容易被局部火情牵着走",
  },
  {
    id: "frontline",
    name: "沿火线推进",
    desc: "优先处理火势最猛烈处 —— 火力集中，但移动距离可能很远",
  },
  {
    id: "protect",
    name: "优先保护植被",
    desc: "优先扑救最易燃的区域（针叶林/枯草）—— 从源头减势",
  },
];

/** 一支消防队 */
export interface FireCrew {
  id: number;
  x: number;
  y: number;
  /** 出警延迟剩余轮数（>0 表示还在赶来的路上） */
  delay: number;
}

export interface RescueParams {
  /** 队伍数量 0-4 */
  crews: number;
  /** 每轮最大移动格数 */
  speed: number;
  /** 出警延迟（轮） */
  delay: number;
  /** 策略 id */
  strategy: string;
  /**
   * 消防队的工作模式
   *   fight   —— 直接扑打燃烧格（见效快，但追不上大火）
   *   cutline —— 在火头前方抢开湿隔离带（慢，但能真正断火）
   *   auto    —— 前期直接扑救，火势变大后转为开隔离带
   */
  mode: string;
}

export const RESCUE_MODES = [
  {
    id: "auto",
    name: "分兵：一半扑火，一半开隔离带",
    desc: "最接近真实战术：小火集中扑灭；火大了就分兵，扑打的照常压火线，其余抢在火头前方切断",
  },
  {
    id: "fight",
    name: "只扑打明火",
    desc: "每轮压掉 1–3 格燃烧 —— 小规模火情很有效，大火时被拖着跑",
  },
  {
    id: "cutline",
    name: "只开湿隔离带",
    desc: "不灭火，专在火头前方打湿一条带 —— 立竿见影，但湿带会蒸干",
  },
];

export const DEFAULT_RESCUE: RescueParams = {
  crews: 2,
  speed: 3,
  delay: 18,
  strategy: "nearest",
  mode: "auto",
};

/**
 * 在地图【外围】生成消防队
 *
 * 现实里消防站设在城区边缘，出警后从外往里开进火场，
 * 绝不会凭空出现在火心里。所以这里固定把队伍放在地图四周的消防站，
 * 并且落点必须落在未燃烧的地面上（不会站在灰烬或火里）。
 */
export function createCrews(params: RescueParams, grid: Grid): FireCrew[] {
  const crews: FireCrew[] = [];
  const { cols, rows, state } = grid;

  // 地图四边中点附近的消防站坐标（按顺序取用，保证分散）
  const stations: Array<{ x: number; y: number }> = [
    { x: 1, y: 1 },
    { x: cols - 2, y: 1 },
    { x: 1, y: rows - 2 },
    { x: cols - 2, y: rows - 2 },
  ];

  for (let i = 0; i < params.crews; i++) {
    const s = stations[i % stations.length];
    // 万一消防站位置不可用（比如正好是水塘/岩石），沿边找最近的可用格
    let px = s.x;
    let py = s.y;
    if (state[py * cols + px] === CellState.Ash) {
      outer: for (let r = 1; r < Math.max(cols, rows); r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const nx = s.x + dx;
            const ny = s.y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (state[ny * cols + nx] !== CellState.Ash) {
              px = nx;
              py = ny;
              break outer;
            }
          }
        }
      }
    }
    crews.push({ id: i, x: px, y: py, delay: params.delay });
  }
  return crews;
}

/**
 * 判断某格是否是"火线"上的格
 *
 * 火线 = 正在燃烧 / 升温 / 火星，且【四周至少有一个尚未被烧过的邻居】。
 * 也就是说，这一格的火还在往外蔓延；如果它已经被灰烬完全包住，
 * 说明这里的火已经烧到头了，属于"死火"，消防队没有再去的意义。
 */
function isFireFront(
  state: Uint8Array,
  cols: number,
  rows: number,
  x: number,
  y: number
): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const s = state[ny * cols + nx];
    // 邻居是可燃的原始地面（正常态），说明这里有蔓延压力
    if (s === CellState.Normal) return true;
  }
  return false;
}

/**
 * 寻找距 (x, y) 最近的、消防队可以站的格
 *
 * 灰烬（焦土）和正在燃烧的格都不能落脚。
 * 消防队如果被火追上了（自己站的格烧起来了），必须先撤到安全地面，
 * 否则就会被"困在灰烬里" —— 这正是现实里最危险的情况。
 */
function findSafeSpot(
  state: Uint8Array,
  cols: number,
  rows: number,
  x: number,
  y: number,
  maxR = 6
): { x: number; y: number } | null {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  const s = state[y * cols + x];
  if (s !== CellState.Ash && s !== CellState.Burning) return { x, y };

  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // 只看这一圈的边缘，避免重复检查
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ns = state[ny * cols + nx];
        if (ns !== CellState.Ash && ns !== CellState.Burning) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/**
 * 从 (sx, sy) 朝 (tx, ty) 走一步，绕开灰烬和火墙
 *
 * 关键：消防队【停在目标旁边的安全格上】，不会走进火里。
 * 现实里消防员是站在安全位置用水枪/灭火器压制前方的火，
 * 绝不可能站在正在燃烧的格子里。
 *
 * 走法：贪心朝目标方向前进，每一格都要落在可站的地面上，
 * 一旦下一步就是目标（或已贴到目标旁边）就停下。
 */
function stepToward(
  state: Uint8Array,
  cols: number,
  rows: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxStep: number
): { x: number; y: number } {
  let x = sx;
  let y = sy;

  for (let step = 0; step < maxStep; step++) {
    // 已经贴到目标旁边 → 停下，就地压制
    const curDist = Math.max(Math.abs(tx - x), Math.abs(ty - y));
    if (curDist <= 1) break;

    const dx = Math.sign(tx - x);
    const dy = Math.sign(ty - y);

    // 候选顺序：先斜着走，再横向、再纵向，都走不通就不动
    const tries: Array<[number, number]> = [
      [dx, dy],
      [dx, 0],
      [0, dy],
    ];

    let moved = false;
    for (const [mx, my] of tries) {
      if (mx === 0 && my === 0) continue;
      const nx = x + mx;
      const ny = y + my;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      // 不能踩到目标格本身（那是火）；也不能踩灰烬
      if (nx === tx && ny === ty) continue;
      const s = state[ny * cols + nx];
      if (s === CellState.Ash || s === CellState.Burning) continue;
      x = nx;
      y = ny;
      moved = true;
      break;
    }
    if (!moved) break; // 被焦土和火墙挡住，本轮原地待命
  }

  return { x, y };
}

/**
 * 每轮推进消防队
 *
 * 现实约束：
 *   1. 只打【火线】—— 也就是还在往外蔓延的那一圈火，
 *      已经烧成灰烬包围的"死火"没有扑救价值。
 *   2. 不从灰烬里穿行 —— 焦土不可通行，所以消防队总是
 *      从外往里压火，而不是追着火屁股跑。
 *   3. 每队每轮【只能扑灭 1 个格】—— 火势一轮可能新增几十个
 *      燃烧格，所以队伍少时注定压不住。这不是 bug，这就是结论。
 */
export function stepCrews(
  grid: Grid,
  crews: FireCrew[],
  params: RescueParams,
  rng: () => number
): { grid: Grid; crews: FireCrew[]; suppressed: number; cut: number; mode: string } {
  if (params.crews <= 0 || crews.length === 0) {
    return { grid, crews, suppressed: 0, cut: 0, mode: "none" };
  }

  const { cols, rows, state, fuel } = grid;
  const next = {
    ...grid,
    state: new Uint8Array(state),
    age: new Uint8Array(grid.age),
  };

  // 只收集【火线】上的目标：正在烧、且有未燃邻居的格
  const targets: Array<{ i: number; x: number; y: number; prio: number }> = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const s = state[i];
      if (s !== CellState.Burning && s !== CellState.Heating && s !== CellState.Ember) {
        continue;
      }
      // 被焦土完全包围的"死火"不再处理 —— 它烧不动了
      if (!isFireFront(state, cols, rows, x, y)) continue;

      const f = FUEL_MAP[fuel[i]];
      let prio = s === CellState.Burning ? 3 : s === CellState.Heating ? 2 : 1;
      if (params.strategy === "protect" && f) {
        // 越易燃越优先
        prio += f.flammability * 3;
      }
      targets.push({ i, x, y, prio });
    }
  }

  if (targets.length === 0) {
    return { grid: next, crews, suppressed: 0, cut: 0, mode: "idle" };
  }

  let suppressed = 0;
  let cut = 0;
  /* ---- 火势规模决定「怎么打」 ----
   * 早期版本的 auto 是「小火灾就扑打，大火灾就只开隔离带」，
   * 结果一旦火头超过 22 格就永久切成隔离带，再也不碰明火，
   * 实际效果跟纯 cutline 一模一样 —— 这是错的。
   *
   * 真实火场的做法是「两条线同时干」：
   *   1. 少数人在火头正面扑打，压住蔓延速度；
   *   2. 大部队在火头前方抢开隔离带，把它围起来。
   * 所以这里改成：大火灾时把队伍分成两拨，扑打的那拨照常打火线。 */
  const isBigFire = targets.length > 22;
  const fullMode = params.mode === "auto" ? (isBigFire ? "cutline" : "fight") : params.mode;
  // auto 模式下的大火灾：一半队伍扑明火，一半去开隔离带
  const autoSplit = params.mode === "auto" && isBigFire;
  // 对外汇报用的模式标签
  const mode = autoSplit ? "both" : fullMode;

  const nextCrews = crews.map((c) => ({ ...c }));

  // auto 大火灾时，按队伍序号交替分工（0/2 扑打，1/3 开带）
  let crewIdx = -1;

  for (const crew of nextCrews) {
    crewIdx += 1;
    // 还在出警路上
    if (crew.delay > 0) {
      crew.delay -= 1;
      continue;
    }

    /* ---- 第一步：先保证自己站在安全地面上 ----
     * 如果火追上了消防队（自己那格烧起来了，或站到了焦土上），
     * 必须立刻撤到最近的正常地面。这是现实里最优先的事：
     * 消防员不会为了救火把自己搭进去，也不会傻站在灰烬堆里。 */
    const here = next.state[crew.y * cols + crew.x];
    if (here === CellState.Ash || here === CellState.Burning) {
      const safe = findSafeSpot(next.state, cols, rows, crew.x, crew.y);
      if (safe) {
        crew.x = safe.x;
        crew.y = safe.y;
        crew.delay = 1; // 撤离要花时间，本轮不再扑救
      }
      continue;
    }

    /* ---- 第二步：按模式选目标 ---- */
    let goal: { x: number; y: number; i?: number } | null = null;
    let isCutGoal = false;

    // auto 大火灾：偶数队扑打火线，奇数队开隔离带
    const thisCrewCuts = autoSplit ? crewIdx % 2 === 1 : fullMode === "cutline";

    if (thisCrewCuts) {
      // 在火头前方找一格还没烧的地面，去打湿它
      const ct = findCutTarget(next.state, cols, rows, crew.x, crew.y);
      if (ct) {
        goal = { x: ct.x, y: ct.y, i: ct.y * cols + ct.x };
        isCutGoal = true;
      }
    }

    if (!goal) {
      // 扑打模式：选一个火线目标
      let best: (typeof targets)[number] | null = null;
      let bestScore = -Infinity;
      for (const t of targets) {
        // 已经被别的队伍压掉了
        if (next.state[t.i] === CellState.Ash) continue;
        const dist = Math.max(Math.abs(t.x - crew.x), Math.abs(t.y - crew.y));

        let score: number;
        if (params.strategy === "protect") {
          // 优先保护易燃植被，同时不能离得太远
          score = t.prio * 10 - dist * 0.6;
        } else if (params.strategy === "frontline") {
          // 火力集中：优先扑最猛烈、最优先级的火点，距离权重最低
          score = t.prio * 6 - dist * 0.25;
        } else {
          // 就近扑救：距离为主，但给燃烧格一点额外权重
          score = -dist * 3 + t.prio * 0.5;
        }
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (best) goal = { x: best.x, y: best.y, i: best.i };
    }

    if (!goal) continue;

    // 朝目标移动（绕开灰烬和火墙）
    const moved = stepToward(
      next.state,
      cols,
      rows,
      crew.x,
      crew.y,
      goal.x,
      goal.y,
      params.speed
    );

    // 落点必须安全：万一绕行把队伍送进了灰烬，就地退回
    const land = next.state[moved.y * cols + moved.x];
    if (land !== CellState.Ash && land !== CellState.Burning) {
      crew.x = moved.x;
      crew.y = moved.y;
    }

    // 到达或已贴近 → 动手（本轮可处理若干格，取决于队伍战力）
    const nowDist = Math.max(Math.abs(goal.x - crew.x), Math.abs(goal.y - crew.y));
    if (nowDist <= 1 && goal.i !== undefined) {
      const s = next.state[goal.i];
      if (isCutGoal) {
        // 打湿：把未燃地面变成湿隔离带。
        // 开隔离带是一气呵成的，效率比逐格扑打高。
        const quota = Math.round(CREW_EFFECTIVENESS * 1.6);
        let done = 0;
        if (s === CellState.Normal) {
          next.state[goal.i] = CellState.WetLine;
          next.age[goal.i] = 0;
          cut += 1;
          done = 1;
        }
        // 顺便把附近几格也打湿，形成连续的一条带（否则单格没有意义）
        if (done > 0) {
          for (let dy = -1; dy <= 1 && done < quota; dy++) {
            for (let dx = -1; dx <= 1 && done < quota; dx++) {
              const nx = goal.x + dx;
              const ny = goal.y + dy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              const j = ny * cols + nx;
              if (next.state[j] === CellState.Normal) {
                next.state[j] = CellState.WetLine;
                next.age[j] = 0;
                done += 1;
                cut += 1;
              }
            }
          }
        }
      } else if (s !== CellState.Normal && s !== CellState.Ash) {
        // 直接压灭燃烧/升温/火星的格；一支队一轮能压若干格
        next.state[goal.i] = CellState.Ash;
        next.age[goal.i] = 0;
        suppressed += 1;
        // 顺带压制紧邻的其它火点
        let quota = Math.round(CREW_EFFECTIVENESS) - 1;
        for (let dy = -1; dy <= 1 && quota > 0; dy++) {
          for (let dx = -1; dx <= 1 && quota > 0; dx++) {
            const nx = goal.x + dx;
            const ny = goal.y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const j = ny * cols + nx;
            const js = next.state[j];
            if (js === CellState.Burning || js === CellState.Heating) {
              next.state[j] = CellState.Ash;
              next.age[j] = 0;
              suppressed += 1;
              quota -= 1;
            }
          }
        }
      }
    }

    // 极小概率队伍"体力不支"暂时减速（随机性）
    if (rng() < 0.02) crew.delay = 1;
  }

  return { grid: next, crews: nextCrews, suppressed, cut, mode };
}

/**
 * 找出「火头前方的待守格」—— 也就是最该打湿的那一格
 *
 * 真实扑救不是追着火线打，而是判断火往哪边烧，
 * 然后抢在它前面把那条线打湿。这里用最简单的判据：
 * 找到一个【尚未燃烧】、且紧邻燃烧格的格，它离队伍越近越好。
 * 打湿它，火就少一个可以蔓延的出口。
 */
function findCutTarget(
  state: Uint8Array,
  cols: number,
  rows: number,
  crewX: number,
  crewY: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const s = state[i];
      // 只能打湿「还能烧起来」的原始地面
      if (s !== CellState.Normal) continue;

      // 它必须紧邻燃烧格，才算是"火头前方"
      let touchFire = false;
      for (let dy = -1; dy <= 1 && !touchFire; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (state[ny * cols + nx] === CellState.Burning) {
            touchFire = true;
            break;
          }
        }
      }
      if (!touchFire) continue;

      const dist = Math.max(Math.abs(x - crewX), Math.abs(y - crewY));
      // 越近越好；同距离时偏向靠近地图中心（那里通常火势最盛）
      const score = -dist;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/* ============================================================
 * 六、可复现的伪随机数
 *
 * 科学探究要求同一组参数能跑出同样的结果，
 * 所以不用 Math.random()，改用带种子的 mulberry32。
 * ============================================================ */

export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
 * 七、地图与状态容器
 * ============================================================ */

export interface Grid {
  cols: number;
  rows: number;
  /** 每格的燃料类型 id */
  fuel: string[];
  /** 每格当前状态 */
  state: Uint8Array;
  /** 每格当前状态已持续的轮数（用于判燃尽） */
  age: Uint8Array;
  /** 每格自身含水率（受降雨影响，会变化） */
  moisture: Float32Array;
}

/** 各状态的格子数统计（用于画曲线） */
export interface Snapshot {
  turn: number;
  normal: number;
  ember: number;
  heating: number;
  burning: number;
  ash: number;
  /** 消防队打出的湿隔离带格数 */
  wetline: number;
}

/** 生成初始地图 */
export function createGrid(params: SimParams): Grid {
  const { cols, rows } = params;
  const rng = makeRng(params.seed);
  const total = cols * rows;

  /* ------------------------------------------------------------
   * 地块生成：先随机撒点，再做「多数平滑」
   *
   * 为什么要平滑？如果每一格都独立随机取值，
   * 整张图会变成"胡椒盐"—— 没有任何成片的结构，
   * 火一烧就到处都是，既不像真实地形，
   * 也让"隔离带"这种战术完全无用武之地。
   *
   * 真实地形是【成片】的：一片针叶林连着几百米，
   * 一条河/一片岩地横贯全场。所以这里用元胞自动机自己的
   * 老朋友 —— 多数投票平滑 —— 来生成有连通性的地块。
   * ---------------------------------------------------------- */

  // 第一步：按权重随机撒点，得到"初始噪声"
  const entries = Object.entries(params.mix).filter(([, v]) => v > 0);
  const sum = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const acc: Array<[string, number]> = [];
  let running = 0;
  for (const [id, v] of entries) {
    running += v / sum;
    acc.push([id, running]);
  }

  const pickOne = () => {
    const r = rng();
    for (const [id, threshold] of acc) {
      if (r <= threshold) return id;
    }
    return acc[acc.length - 1]?.[0] ?? "barren";
  };

  let fuel: string[] = new Array(total);
  for (let i = 0; i < total; i++) fuel[i] = pickOne();

  // 第二步：多数平滑若干轮，让同类地块聚成片
  for (let pass = 0; pass < 4; pass++) {
    const out = fuel.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // 数一数 3×3 邻域里各燃料各有多少格
        const tally: Record<string, number> = {};
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const id = fuel[ny * cols + nx];
            tally[id] = (tally[id] ?? 0) + 1;
          }
        }
        let bestId = fuel[y * cols + x];
        let bestN = -1;
        for (const [id, n] of Object.entries(tally)) {
          if (n > bestN) {
            bestN = n;
            bestId = id;
          }
        }
        out[y * cols + x] = bestId;
      }
    }
    fuel = out;
  }

  /* ------------------------------------------------------------
   * 第三步：开几条「天然屏障」
   *
   * 真实的火场之所以能被控制住，靠的往往不是人多，
   * 而是地形本身：一条河、一条公路、一片裸岩，火过不去。
   * 这里随机开 1-3 条贯穿全图的屏障，给"隔离带战术"留出支点。
   * ---------------------------------------------------------- */
  const barrierCount = 1 + Math.floor(rng() * 3);
  for (let b = 0; b < barrierCount; b++) {
    const vertical = rng() < 0.5;
    // 屏障要有厚度，太薄了火可能从边上"蹭"过去
    const thickness = 2 + Math.floor(rng() * 2);
    if (vertical) {
      // 竖着来一条，位置带点弯曲（更像河道）
      let x = Math.floor(cols * (0.2 + rng() * 0.6));
      for (let y = 0; y < rows; y++) {
        for (let w = 0; w < thickness; w++) {
          const xx = x + w;
          if (xx >= 0 && xx < cols) fuel[y * cols + xx] = "barren";
        }
        // 弯曲幅度小一点，避免屏障自己断开
        if (rng() < 0.3) x += rng() < 0.5 ? -1 : 1;
        x = Math.max(1, Math.min(cols - thickness - 1, x));
      }
    } else {
      let y = Math.floor(rows * (0.2 + rng() * 0.6));
      for (let x = 0; x < cols; x++) {
        for (let w = 0; w < thickness; w++) {
          const yy = y + w;
          if (yy >= 0 && yy < rows) fuel[yy * cols + x] = "barren";
        }
        if (rng() < 0.3) y += rng() < 0.5 ? -1 : 1;
        y = Math.max(1, Math.min(rows - thickness - 1, y));
      }
    }
  }

  const moisture = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    // 在燃料固有含水率上叠加一点个体差异，让画面更自然
    const base = FUEL_MAP[fuel[i]]?.moisture ?? 0;
    moisture[i] = clamp01(base + (rng() - 0.5) * 0.08);
  }

  return {
    cols,
    rows,
    fuel,
    state: new Uint8Array(total),
    age: new Uint8Array(total),
    moisture,
  };
}

/**
 * 生成一张「空白」地图，用于自己动手画地形
 *
 * 默认铺满枯草（最容易烧），玩家可以像画画一样
 * 刷上针叶林、湿草、岩石，自己设计一片考场。
 */
export function createBlankGrid(params: SimParams, defaultFuel = "drygrass"): Grid {
  const { cols, rows } = params;
  const total = cols * rows;
  const fuel: string[] = new Array(total).fill(defaultFuel);
  const moisture = new Float32Array(total);
  const base = FUEL_MAP[defaultFuel]?.moisture ?? 0;
  for (let i = 0; i < total; i++) moisture[i] = base;

  return {
    cols,
    rows,
    fuel,
    state: new Uint8Array(total),
    age: new Uint8Array(total),
    moisture,
  };
}

/**
 * 在地图上刷一块地形（用于地形编辑器）
 *
 * 用圆盘而不是单格，手感更接近"刷子"；
 * 半径 0 就是单格画笔。
 */
export function paintFuel(
  grid: Grid,
  cx: number,
  cy: number,
  fuelId: string,
  radius = 0
): Grid {
  const { cols, rows } = grid;
  const fuel = grid.fuel.slice();
  const moisture = new Float32Array(grid.moisture);
  const state = new Uint8Array(grid.state);
  const base = FUEL_MAP[fuelId]?.moisture ?? 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // 圆形笔刷
      if (dx * dx + dy * dy > radius * radius + 0.5) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      fuel[i] = fuelId;
      moisture[i] = base;
      // 刷过的地方恢复成未燃状态，避免残留火/灰
      state[i] = CellState.Normal;
    }
  }
  return { ...grid, fuel, moisture, state };
}

/* ============================================================
 * 八、单步演化
 *
 * 这是整个模型的心脏。每个格子只看邻居，不看全局。
 * ============================================================ */

export interface StepResult {
  grid: Grid;
  snapshot: Snapshot;
  /** 本轮是否已经没有任何火（全部熄灭或烧完） */
  extinguished: boolean;
}

export function stepGrid(
  grid: Grid,
  params: SimParams,
  turn: number,
  rng: () => number
): StepResult {
  const { cols, rows, fuel, state, age, moisture } = grid;
  const nextState = new Uint8Array(state);
  const nextAge = new Uint8Array(age);
  const nextMoisture = new Float32Array(moisture);

  const rain = RAIN_MAP[params.rain] ?? RAIN_MAP.none;

  // 风向单位向量：风把火往这个方向推
  const windX = Math.cos(params.windDir);
  const windY = Math.sin(params.windDir);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const f = FUEL_MAP[fuel[i]];
      if (!f) continue;
      const s = state[i];

      /* ---- 不可燃格永远不动 ---- */
      if (f.flammability <= 0) {
        nextState[i] = CellState.Normal;
        nextAge[i] = 0;
        continue;
      }

      /* ---- 灰烬：不参与传播，但会挡火（这里什么都不做就是"挡"） ---- */
      if (s === CellState.Ash) {
        nextAge[i] = age[i];
        continue;
      }

      /* ---- 湿隔离带：极难被点燃，但会随时间蒸干 ---- */
      if (s === CellState.WetLine) {
        const a = age[i] + 1;
        // 湿带能撑 hold 轮；雨越大，干得越慢。
        // 这是个关键可调量：湿带越持久，隔离带战术越有效。
        const hold = Math.round(24 + rain.suppress * 30);
        if (a >= hold) {
          nextState[i] = CellState.Normal;
          nextAge[i] = 0;
          nextMoisture[i] = clamp01(moisture[i] - 0.15);
        } else {
          nextAge[i] = a;
        }
        continue;
      }

      /* ---- 燃烧：维持 N 轮后转灰烬 ---- */
      if (s === CellState.Burning) {
        const a = age[i] + 1;
        if (a >= f.burnDuration) {
          nextState[i] = CellState.Ash;
          nextAge[i] = 0;
          // 烧完之后该处变干，为后续复燃留伏笔
          nextMoisture[i] = clamp01(moisture[i] - 0.1);
        } else {
          nextAge[i] = a;
        }
        continue;
      }

      /* ---- 火星 / 升温：向上提升的判定 ---- */
      if (s === CellState.Ember || s === CellState.Heating) {
        // 被雨压制得越强，越可能退回正常（相当于被浇灭）
        if (rain.suppress > 0 && rng() < rain.suppress * 0.5) {
          nextState[i] = CellState.Normal;
          nextAge[i] = 0;
          continue;
        }

        // 提升概率 = 燃料可燃性 × 干旱度 × (1-雨压制)
        const dryness = 1 - moisture[i];
        let promote = f.flammability * (0.35 + 0.65 * dryness) * (1 - rain.suppress);
        // 已升温的更容易烧起来（火在烤它）
        if (s === CellState.Heating) promote *= 1.8;
        promote = clamp01(promote);

        // 火星 → 升温 → 燃烧 是多阶段过程，每一步都要花时间。
        // 系数调小，火就不会"一轮从火星跳到明火"。
        if (rng() < promote * 0.28) {
          nextState[i] =
            s === CellState.Ember ? CellState.Heating : CellState.Burning;
          nextAge[i] = 0;
        }
        continue;
      }

      /* ---- 正常格：看邻居有没有火，决定是否被点燃 ---- */
      let fireNeighbors = 0;
      let windBonus = 0;
      let maxRange = 1;

      // 先扫一圈找出最大传火距离（针叶林能跳 2 格）
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (state[j] !== CellState.Burning) continue;
          const nf = FUEL_MAP[fuel[j]];
          if (!nf) continue;
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          if (dist > nf.spreadRange) continue;

          maxRange = Math.max(maxRange, nf.spreadRange);
          fireNeighbors += dist === 1 ? 1 : 0.5;

          // 风向加成：火源在"上风向"时更容易烧过来
          const dirX = dx / (dist || 1);
          const dirY = dy / (dist || 1);
          const align = dirX * windX + dirY * windY;
          windBonus += align * params.windPower * 0.8;
        }
      }

      if (fireNeighbors > 0) {
        const dryness = 1 - moisture[i];
        // 基础蔓延概率整体压低：火要慢慢"啃"过去，
        // 而不是一轮就窜出几十格 —— 那样既看不清过程，
        // 也根本不给消防队留出任何干预的窗口。
        let p =
          f.flammability *
          0.42 *
          (0.12 + 0.88 * dryness) *
          (1 - rain.suppress) *
          (1 - params.humidity * 0.75);

        // 邻居越多越容易着；顺风方向加成
        p *= 1 + Math.min(fireNeighbors, 4) * 0.16;
        p *= 1 + clamp(windBonus / Math.max(fireNeighbors, 1), -0.5, 1.0);
        // 针叶林这类"飞火"燃料，即使隔得远也有机会
        p *= 1 + f.emberRate * 0.5;

        p = clamp01(p);

        if (rng() < p) {
          nextState[i] = CellState.Ember;
          nextAge[i] = 0;
        }
      }
    }
  }

  /* ---- 动物扰动：飞火（跳到远处） ---- */
  if (params.animalEmber) {
    const burningCells: number[] = [];
    for (let i = 0; i < state.length; i++) {
      if (state[i] === CellState.Burning) burningCells.push(i);
    }
    if (burningCells.length > 0) {
      // 火越大，飞火越频繁，但给一个上限避免爆炸
      const attempts = Math.min(3, Math.ceil(burningCells.length / 120));
      for (let k = 0; k < attempts; k++) {
        const src = burningCells[Math.floor(rng() * burningCells.length)];
        const srcF = FUEL_MAP[fuel[src]];
        if (!srcF || rng() > srcF.emberRate * 1.6) continue;

        // 顺风方向飘一段距离
        const dist = 4 + Math.floor(rng() * 8);
        const sx = src % cols;
        const sy = Math.floor(src / cols);
        const tx = Math.round(sx + windX * dist + (rng() - 0.5) * 6);
        const ty = Math.round(sy + windY * dist + (rng() - 0.5) * 6);
        if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;

        const ti = ty * cols + tx;
        const tf = FUEL_MAP[fuel[ti]];
        if (!tf || tf.flammability <= 0) continue;
        if (nextState[ti] === CellState.Normal && rng() < 0.55) {
          nextState[ti] = CellState.Ember;
          nextAge[ti] = 0;
        }
      }
    }
  }

  /* ---- 动物扰动：踩踏（踩出隔离带） ---- */
  if (params.animalTrample && rng() < 0.06) {
    const bx = Math.floor(rng() * cols);
    const by = Math.floor(rng() * rows);
    const r = 1 + Math.floor(rng() * 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        const nf = FUEL_MAP[fuel[j]];
        if (!nf || nf.flammability <= 0) continue;
        if (nextState[j] === CellState.Normal) {
          // 踩踏把植被压成裸地，直接用 barren 的燃料 id
          fuel[j] = "barren";
          nextMoisture[j] = 0;
        }
      }
    }
  }

  /* ---- 降雨给全场补水 ---- */
  if (rain.moistureAdd > 0) {
    for (let i = 0; i < nextMoisture.length; i++) {
      const f = FUEL_MAP[fuel[i]];
      if (!f || f.flammability <= 0) continue;
      nextMoisture[i] = clamp01(nextMoisture[i] + rain.moistureAdd);
    }
  }

  const nextGrid: Grid = {
    ...grid,
    state: nextState,
    age: nextAge,
    moisture: nextMoisture,
  };

  const snapshot = countStates(nextGrid, turn);
  const extinguished =
    snapshot.burning === 0 && snapshot.ember === 0 && snapshot.heating === 0;

  return { grid: nextGrid, snapshot, extinguished };
}

/* ============================================================
 * 九、统计与工具函数
 * ============================================================ */

export function countStates(grid: Grid, turn: number): Snapshot {
  const c = [0, 0, 0, 0, 0, 0];
  const { state, fuel } = grid;
  for (let i = 0; i < state.length; i++) {
    const f = FUEL_MAP[fuel[i]];
    // 不可燃格算作"正常"，不参与统计口径的干扰
    if (f && f.flammability <= 0) {
      c[CellState.Normal]++;
      continue;
    }
    c[state[i]]++;
  }
  return {
    turn,
    normal: c[0],
    ember: c[1],
    heating: c[2],
    burning: c[3],
    ash: c[4],
    wetline: c[5],
  };
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 统计可燃格总数，用于算"烧毁占比" */
export function countFlammable(grid: Grid) {
  let n = 0;
  for (const id of grid.fuel) {
    const f = FUEL_MAP[id];
    if (f && f.flammability > 0) n++;
  }
  return n;
}

/** 在指定位置点火 */
export function igniteAt(
  grid: Grid,
  x: number,
  y: number,
  cause: IgnitionCause
): Grid {
  const next = { ...grid, state: new Uint8Array(grid.state), age: new Uint8Array(grid.age) };
  const { cols, rows } = grid;
  const r = cause.scatter;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      const f = FUEL_MAP[grid.fuel[i]];
      if (!f || f.flammability <= 0) continue;
      if (next.state[i] === CellState.Normal) {
        next.state[i] = cause.startState;
        next.age[i] = 0;
      }
    }
  }
  return next;
}

/** 计算当前火势规模，用于"扑救是否跟得上"的反馈 */
export function countBurning(grid: Grid) {
  let n = 0;
  for (let i = 0; i < grid.state.length; i++) {
    if (grid.state[i] === CellState.Burning) n++;
  }
  return n;
}
