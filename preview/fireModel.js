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
import { isLand, latitudeHumidity, latitudeTemp, REGION_MAP } from "./atlas";
export const STATE_META = [
    { key: 0 /* CellState.Normal */, label: "正常", color: "#4A8538" },
    { key: 1 /* CellState.Ember */, label: "火星", color: "#FFC020" },
    { key: 2 /* CellState.Heating */, label: "升温", color: "#FF7A22" },
    { key: 3 /* CellState.Burning */, label: "燃烧", color: "#FF4400" },
    // 灰烬色比初版（#3B3733）还稍暗一点点，但**刻意不取纯黑**：
    // 烧过的区域往往连成大片，如果压到 #111 就成了一块死黑斑，
    // 底下的地形起伏全被盖住，海拔视图更是直接失效。
    // 现在这个值离纯黑还有 149 的距离，看一眼就知道"这是烧过的地"，
    // 同时也还能隐约透出原来的高低。
    { key: 4 /* CellState.Ash */, label: "灰烬", color: "#38322C" },
    // 湿隔离带是**人工**打出来的水带，必须和天然河流（#1E6FB8）分开。
    // 旧版 #4E8FCB 和河水只差 101，两条水带摆在一起经常看混；
    // 改成更亮更青的 #2FA8E8 之后距离拉到 142，一眼可辨。
    { key: 5 /* CellState.WetLine */, label: "湿隔离带", color: "#2FA8E8" },
];
/* ------------------------------------------------------------
 * 配色调整（第二版）
 *
 * 用户反馈："这个地图太白了，加大饱和度"。
 *
 * "白"是可以量出来的 —— HSL 的 S（饱和度）太低、L（亮度）太高，
 * 看着就是灰蒙蒙一片。旧配色实测：
 *     沙土岩石 #C9BFA8  S 0.234  L 0.724   ← 最白，饱和度也最低
 *     平均饱和度 0.380
 *
 * 新版不是凭眼睛调，而是用 .vt/palette-search3.mjs 在 HSL 空间里
 * 做了坐标下降搜索，目标是"在保住饱和度的前提下，让两两最小距离尽量大"。
 * 之所以要"搜"而不是手调，是因为踩过一次坑：
 * 单独把针叶林和阔叶林拉开之后，瓶颈立刻转移到"湿草 vs 阔叶林"
 * （距离只剩 69）—— 五种绿挤在同一个色相带里，调一个就动全局，
 * 手调必然是打地鼠。最终改成把四个绿当成一条**有序阶梯**一起解。
 *
 * 实测结果：
 *     平均饱和度 0.380 → 0.533（+40%）
 *     最亮颜色   L 0.724 → 0.590
 *     两两最小距离 56.9 → 81.2   ← 不仅没糊在一起，反而更分得开
 *
 * 四个绿按"亮 → 暗"排出一条阶梯，色相同时从黄绿漂到青绿，
 * 和真实植被遥感影像的观感一致：
 *     湿草   L 0.471  hue  92°   （草甸，最亮最黄）
 *     阔叶林  L 0.371  hue 100°   （林冠，亮绿）
 *     灌木   L 0.290  hue 112°   （中层，中绿）
 *     针叶林  L 0.200  hue 127°   （林下，暗青绿）
 * ---------------------------------------------------------- */
export const FUELS = [
    {
        id: "drygrass",
        name: "枯草",
        flammability: 0.9,
        burnDuration: 4,
        spreadRange: 1,
        emberRate: 0.1,
        moisture: 0.05,
        color: "#D9A94E",
    },
    {
        id: "wetgrass",
        name: "湿草",
        flammability: 0.25,
        burnDuration: 5,
        spreadRange: 1,
        emberRate: 0.03,
        moisture: 0.65,
        color: "#74B63A",
    },
    {
        id: "shrub",
        name: "灌木",
        flammability: 0.75,
        burnDuration: 7,
        spreadRange: 1,
        emberRate: 0.2,
        moisture: 0.2,
        color: "#2F6F25",
    },
    {
        id: "conifer",
        name: "针叶林",
        flammability: 0.6,
        burnDuration: 14,
        spreadRange: 2,
        emberRate: 0.45,
        moisture: 0.3,
        color: "#1E4823",
    },
    {
        id: "broadleaf",
        name: "阔叶林",
        flammability: 0.4,
        burnDuration: 10,
        spreadRange: 1,
        emberRate: 0.08,
        moisture: 0.45,
        color: "#4B9924",
    },
    {
        id: "barren",
        name: "沙土/岩石",
        flammability: 0,
        burnDuration: 0,
        spreadRange: 0,
        emberRate: 0,
        moisture: 0,
        color: "#B8A275",
    },
    {
        // 河流、湖泊。和裸岩的"不燃"性质完全一样，
        // 但颜色不同 —— 让地貌一眼能看出水系在哪。
        // 地图上水系是最好的天然防火隔离带，火烧到河边就断了。
        id: "water",
        name: "河流/湖泊",
        flammability: 0,
        burnDuration: 0,
        spreadRange: 0,
        emberRate: 0,
        moisture: 1,
        color: "#1E6FB8",
    },
];
export const FUEL_MAP = Object.fromEntries(FUELS.map((f) => [f.id, f]));
export const RAIN_LEVELS = [
    { id: "none", name: "无雨", suppress: 0, moistureAdd: 0, density: 0 },
    { id: "light", name: "小雨", suppress: 0.05, moistureAdd: 0.002, density: 40 },
    { id: "moderate", name: "中雨", suppress: 0.25, moistureAdd: 0.015, density: 110 },
    { id: "heavy", name: "大雨", suppress: 0.6, moistureAdd: 0.04, density: 220 },
    { id: "storm", name: "暴雨", suppress: 0.95, moistureAdd: 0.1, density: 380 },
];
export const RAIN_MAP = Object.fromEntries(RAIN_LEVELS.map((r) => [r.id, r]));
export const IGNITION_CAUSES = [
    {
        id: "lightning",
        name: "雷击",
        icon: "⚡",
        desc: "瞬间高温，直接燃起明火，常为单点",
        startState: 3 /* CellState.Burning */,
        scatter: 0,
    },
    {
        id: "human",
        name: "人为点火",
        icon: "🔥",
        desc: "从火星开始缓慢引燃，有时间被发现扑救",
        startState: 1 /* CellState.Ember */,
        scatter: 1,
    },
    {
        id: "cigarette",
        name: "烟头未熄",
        icon: "🚬",
        desc: "低概率引燃，多自己熄灭，风大时突然炸开",
        startState: 1 /* CellState.Ember */,
        scatter: 0,
    },
    {
        id: "campfire",
        name: "篝火失控",
        icon: "🏕️",
        desc: "由火堆中心向外扩张，受风向影响极大",
        startState: 2 /* CellState.Heating */,
        scatter: 2,
    },
    {
        id: "equipment",
        name: "设备故障",
        icon: "⚙️",
        desc: "多点同时起火，模拟线路老化等场景",
        startState: 3 /* CellState.Burning */,
        scatter: 4,
    },
];
export const DEFAULT_PARAMS = {
    /**
     * 默认地图精度：160 × 90 = 14,400 格
     *
     * 为什么从 80×50（4,000 格）提到这里？
     * ────────────────
     * 80×50 一格代表 10 米，只有 4000 个格子，
     * 山脊、河谷、林道这些小尺度地貌根本铺不开 —— 看起来像色块。
     * 14,400 格是原来的 3.6 倍，是"细节翻了近两番但依然流畅"的甜点：
     *   · 像素块缩小到 0.61 倍边长 → 地貌纹理真正显出来
     *   · 依然能跑满 30 轮/秒（单轮只多花约 3 倍时间，仍远低于一帧）
     *   · 保持 16:9，和屏幕比例一致，没有黑边
     *   · 比例尺不变（1 格仍 = 10 米），所以地图实际范围变成
     *     1600 m × 900 m —— 更接近一片真实林场的尺度
     *
     * 注意：地形是**程序化生成**的，不是一张被插值放大的图片。
     * 所以格子变细之后，长出来的是**更多细节**（新的支沟、新的林斑），
     * 而不是把原来的图放大糊一遍。
     */
    cols: 160,
    rows: 90,
    humidity: 0.3,
    windPower: 0.4,
    windDir: 0,
    rain: "none",
    animalEmber: true,
    animalTrample: false,
    mix: { drygrass: 30, wetgrass: 15, shrub: 15, conifer: 20, broadleaf: 10, barren: 10 },
    seed: 20261007,
    region: "",
};
/**
 * 一支消防队的扑救效率
 *
 * 现实里一支消防队不是"一个人一次泼一桶水"，
 * 而是几台水车 + 一组人员同时作业。早期把效率压成 1 格/轮
 * 会让消防队看起来完全没用 —— 那不真实，也观察不到价值。
 * 1.8 格/轮意味着：小火时压得住，大火时仍然力不从心。
 */
const CREW_EFFECTIVENESS = 1.8;
export const RESCUE_STRATEGIES = [
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
/**
 * 默认扑救参数
 *
 * crews: 0 —— 默认【不派消防队】。
 * 为什么？因为项目的核心问题是"火自己会怎么烧"，
 * 默认就该让火不受干扰地烧完，看到自然状态下的蔓延规律；
 * 想研究扑救再手动把队伍加进去。一上来就有消防队，
 * 反而看不清地形和风到底起了多大作用。
 */
export const DEFAULT_RESCUE = {
    crews: 0,
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
 * 并且落点必须落在未燃烧、非水面的地面上（不会站在灰烬、火里或河中间）。
 */
export function createCrews(params, grid) {
    const crews = [];
    const { cols, rows, state } = grid;
    // 地图四边中点附近的消防站坐标（按顺序取用，保证分散）
    const stations = [
        { x: 1, y: 1 },
        { x: cols - 2, y: 1 },
        { x: 1, y: rows - 2 },
        { x: cols - 2, y: rows - 2 },
    ];
    for (let i = 0; i < params.crews; i++) {
        const s = stations[i % stations.length];
        // 万一消防站位置不可用（正好落在水面、焦土或正在烧的地方），
        // 从站址向外螺旋找最近的可用格
        let px = s.x;
        let py = s.y;
        if (!isCrewPassable(grid.fuel, state, py * cols + px)) {
            outer: for (let r = 1; r < Math.max(cols, rows); r++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dy = -r; dy <= r; dy++) {
                        const nx = s.x + dx;
                        const ny = s.y + dy;
                        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                            continue;
                        if (isCrewPassable(grid.fuel, state, ny * cols + nx)) {
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
function isFireFront(state, cols, rows, x, y) {
    const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
            continue;
        const s = state[ny * cols + nx];
        // 邻居是可燃的原始地面（正常态），说明这里有蔓延压力
        if (s === 0 /* CellState.Normal */)
            return true;
    }
    return false;
}
/**
 * 一格对消防队来说能不能站 / 能不能走
 *
 * 三条硬规则：
 *   1. 不能站在正在燃烧的格上（那是送死）
 *   2. 不能站在焦土上（现实里烧过的地还在阴燃、滚烫，且没有落脚点）
 *   3. **不能走进水里** —— 消防员背着装备，不能从河面/湖面走过去
 *
 * 注意第 3 条是燃料属性，不是状态属性：
 * 水面本身永远不燃（flammability = 0），所以它的 state 一直是 Normal，
 * 老代码只看 state 就把它当成了普通地面，于是消防员能在水上平移。
 * 这里必须同时看 fuel。
 */
function isCrewPassable(fuel, state, i) {
    const s = state[i];
    if (s === 4 /* CellState.Ash */ || s === 3 /* CellState.Burning */)
        return false;
    if (fuel[i] === "water")
        return false;
    return true;
}
/**
 * 寻找距 (x, y) 最近的、消防队可以站的格
 *
 * 灰烬（焦土）、正在燃烧的格、以及水面都不能落脚。
 * 消防队如果被火追上了（自己站的格烧起来了），必须先撤到安全地面，
 * 否则就会被"困在灰烬里" —— 这正是现实里最危险的情况。
 */
function findSafeSpot(fuel, state, cols, rows, x, y, maxR = 6) {
    if (x < 0 || y < 0 || x >= cols || y >= rows)
        return null;
    if (isCrewPassable(fuel, state, y * cols + x))
        return { x, y };
    for (let r = 1; r <= maxR; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                // 只看这一圈的边缘，避免重复检查
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r)
                    continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                    continue;
                if (isCrewPassable(fuel, state, ny * cols + nx))
                    return { x: nx, y: ny };
            }
        }
    }
    return null;
}
/**
 * 从 (sx, sy) 朝 (tx, ty) 走一步，绕开灰烬、火墙和水面
 *
 * 关键：消防队【停在目标旁边的安全格上】，不会走进火里。
 * 现实里消防员是站在安全位置用水枪/灭火器压制前方的火，
 * 绝不可能站在正在燃烧的格子里。
 *
 * 走法：贪心朝目标方向前进，每一格都要落在可站的地面上，
 * 一旦下一步就是目标（或已贴到目标旁边）就停下。
 * 遇到河流湖泊会尝试绕行；实在过不去就原地待命 ——
 * 这也解释了为什么"隔着一条河的火"扑救队到不了。
 */
function stepToward(fuel, state, cols, rows, sx, sy, tx, ty, maxStep) {
    let x = sx;
    let y = sy;
    for (let step = 0; step < maxStep; step++) {
        // 已经贴到目标旁边 → 停下，就地压制
        const curDist = Math.max(Math.abs(tx - x), Math.abs(ty - y));
        if (curDist <= 1)
            break;
        const dx = Math.sign(tx - x);
        const dy = Math.sign(ty - y);
        // 候选顺序：先斜着走，再横向、再纵向
        const tries = [
            [dx, dy],
            [dx, 0],
            [0, dy],
        ];
        // 主方向都被水挡住时，再试几个"绕行"方向（贴着河边往下游走找浅滩）
        if (dx !== 0 && dy !== 0) {
            tries.push([dx, -dy], [-dx, dy]);
        }
        tries.push([dy, dx], [-dy, -dx]);
        let moved = false;
        for (const [mx, my] of tries) {
            if (mx === 0 && my === 0)
                continue;
            const nx = x + mx;
            const ny = y + my;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                continue;
            // 不能踩到目标格本身（那是火）；也不能踩灰烬、火和水
            if (nx === tx && ny === ty)
                continue;
            if (!isCrewPassable(fuel, state, ny * cols + nx))
                continue;
            x = nx;
            y = ny;
            moved = true;
            break;
        }
        if (!moved)
            break; // 被焦土、火墙或河面挡住，本轮原地待命
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
export function stepCrews(grid, crews, params, rng) {
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
    const targets = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const s = state[i];
            if (s !== 3 /* CellState.Burning */ && s !== 2 /* CellState.Heating */ && s !== 1 /* CellState.Ember */) {
                continue;
            }
            // 被焦土完全包围的"死火"不再处理 —— 它烧不动了
            if (!isFireFront(state, cols, rows, x, y))
                continue;
            const f = FUEL_MAP[fuel[i]];
            let prio = s === 3 /* CellState.Burning */ ? 3 : s === 2 /* CellState.Heating */ ? 2 : 1;
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
         * 如果火追上了消防队（自己那格烧起来了），或不小心站在水里，
         * 必须立刻撤到最近的正常地面。这是现实里最优先的事：
         * 消防员不会为了救火把自己搭进去，也不会傻站在灰烬堆或河中间。 */
        if (!isCrewPassable(next.fuel, next.state, crew.y * cols + crew.x)) {
            const safe = findSafeSpot(next.fuel, next.state, cols, rows, crew.x, crew.y);
            if (safe) {
                crew.x = safe.x;
                crew.y = safe.y;
                crew.delay = 1; // 撤离要花时间，本轮不再扑救
            }
            continue;
        }
        /* ---- 第二步：按模式选目标 ---- */
        let goal = null;
        let isCutGoal = false;
        // auto 大火灾：偶数队扑打火线，奇数队开隔离带
        const thisCrewCuts = autoSplit ? crewIdx % 2 === 1 : fullMode === "cutline";
        if (thisCrewCuts) {
            // 在火头前方找一格还没烧的地面，去打湿它
            const ct = findCutTarget(next.fuel, next.state, cols, rows, crew.x, crew.y);
            if (ct) {
                goal = { x: ct.x, y: ct.y, i: ct.y * cols + ct.x };
                isCutGoal = true;
            }
        }
        if (!goal) {
            // 扑打模式：选一个火线目标
            let best = null;
            let bestScore = -Infinity;
            for (const t of targets) {
                // 已经被别的队伍压掉了
                if (next.state[t.i] === 4 /* CellState.Ash */)
                    continue;
                const dist = Math.max(Math.abs(t.x - crew.x), Math.abs(t.y - crew.y));
                let score;
                if (params.strategy === "protect") {
                    // 优先保护易燃植被，同时不能离得太远
                    score = t.prio * 10 - dist * 0.6;
                }
                else if (params.strategy === "frontline") {
                    // 火力集中：优先扑最猛烈、最优先级的火点，距离权重最低
                    score = t.prio * 6 - dist * 0.25;
                }
                else {
                    // 就近扑救：距离为主，但给燃烧格一点额外权重
                    score = -dist * 3 + t.prio * 0.5;
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = t;
                }
            }
            if (best)
                goal = { x: best.x, y: best.y, i: best.i };
        }
        if (!goal)
            continue;
        // 朝目标移动（绕开灰烬、火墙和水面）
        const moved = stepToward(next.fuel, next.state, cols, rows, crew.x, crew.y, goal.x, goal.y, params.speed);
        // 落点必须安全：万一绕行把队伍送进了灰烬或水里，就地退回
        if (isCrewPassable(next.fuel, next.state, moved.y * cols + moved.x)) {
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
                if (s === 0 /* CellState.Normal */) {
                    next.state[goal.i] = 5 /* CellState.WetLine */;
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
                            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                                continue;
                            const j = ny * cols + nx;
                            if (next.state[j] === 0 /* CellState.Normal */) {
                                next.state[j] = 5 /* CellState.WetLine */;
                                next.age[j] = 0;
                                done += 1;
                                cut += 1;
                            }
                        }
                    }
                }
            }
            else if (s !== 0 /* CellState.Normal */ && s !== 4 /* CellState.Ash */) {
                // 直接压灭燃烧/升温/火星的格；一支队一轮能压若干格
                next.state[goal.i] = 4 /* CellState.Ash */;
                next.age[goal.i] = 0;
                suppressed += 1;
                // 顺带压制紧邻的其它火点
                let quota = Math.round(CREW_EFFECTIVENESS) - 1;
                for (let dy = -1; dy <= 1 && quota > 0; dy++) {
                    for (let dx = -1; dx <= 1 && quota > 0; dx++) {
                        const nx = goal.x + dx;
                        const ny = goal.y + dy;
                        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                            continue;
                        const j = ny * cols + nx;
                        const js = next.state[j];
                        if (js === 3 /* CellState.Burning */ || js === 2 /* CellState.Heating */) {
                            next.state[j] = 4 /* CellState.Ash */;
                            next.age[j] = 0;
                            suppressed += 1;
                            quota -= 1;
                        }
                    }
                }
            }
        }
        // 极小概率队伍"体力不支"暂时减速（随机性）
        if (rng() < 0.02)
            crew.delay = 1;
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
function findCutTarget(fuel, state, cols, rows, crewX, crewY) {
    let best = null;
    let bestScore = -Infinity;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const s = state[i];
            // 只能打湿「还能烧起来」的原始地面。
            // 水面虽然 state 也是 Normal，但它本来就烧不着，打湿它纯属浪费。
            if (s !== 0 /* CellState.Normal */)
                continue;
            if (fuel[i] === "water")
                continue;
            const fuelType = FUEL_MAP[fuel[i]];
            if (!fuelType || fuelType.flammability <= 0)
                continue;
            // 它必须紧邻燃烧格，才算是"火头前方"
            let touchFire = false;
            for (let dy = -1; dy <= 1 && !touchFire; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0)
                        continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                        continue;
                    if (state[ny * cols + nx] === 3 /* CellState.Burning */) {
                        touchFire = true;
                        break;
                    }
                }
            }
            if (!touchFire)
                continue;
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
export function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * 把种子推进到下一个
 *
 * 为什么不用 `(seed * 1103515245 + 12345) & 0x7fffffff`？
 * ────────────────────────────────────────────────
 * 因为 JS 的 number 是 float64，尾数只有 53 位有效位。
 * `seed * 1103515245` 在 seed 稍大时就会超过 2^53，乘法结果直接被截断，
 * 低比特全是 0 —— 也就是说，那个公式算出来的"新种子"其实丢掉了一半信息，
 * 连续推进时会出现明显的规律（高位变化很单调）。
 *
 * `Math.imul` 是 JS 里唯一能"精确做 32 位整数乘法"的算子，
 * 它按 32 位截断，不经过 float64，所以每一步都保留全部熵。
 *
 * 实现用的是 **splitmix32 的 32 位变体**：
 *   三轮"异或位移 + 乘法"混合，最后再整体搅一次。
 * 这一点很关键：只做一次乘加的话，虽然 2000 步不重复，
 * 但**高比特的空间没有被填满**（实测 2000 个种子里高 9 位只用到 256/512 种取值）——
 * 而 fBm 的随机格点表恰恰最吃高位。混合不够，地图的"骨架"就会撞脸。
 *
 * 实测三轮混合之后：2000 步 0 碰撞，高 9 位用满 512/512。
 */
export function nextSeed(seed) {
    let z = seed >>> 0;
    // 第 1 轮
    z = (z + 0x9e3779b9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    // 第 2 轮
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    // 第 3 轮
    z = Math.imul(z ^ (z >>> 15), 0x85ebca6b) >>> 0;
    z = (z ^ (z >>> 13)) >>> 0;
    // 收进 31 位，保持和其它种子同量级
    return z & 0x7fffffff;
}
/* ============================================================
 * 六之二、噪声与真实地貌生成
 *
 * 为什么要噪声？
 * ──────────────
 * 之前的「多数平滑」能生成成片的植被，但那是"色块"，
 * 不像真实地形：真实的山是有起伏的、河是顺地势流的、
 * 针叶林长在高海拔、阔叶林长在河谷、草地铺在平缓处。
 *
 * 这里改用「值噪声 + 分形叠加（fBm）」：
 *   1. 生成一张高程图 → 决定山脉、丘陵、河谷、湖泊；
 *   2. 生成一张湿度图 → 决定植被类型；
 *   3. 按「高程 × 湿度」查表分配植被。
 * 这样地形会自带因果：山脊是岩石，山腰是针叶林，
 * 河谷是阔叶林，平地是草地。
 * ============================================================ */
/** 值噪声：用种子生成一张低频起伏场 */
function makeValueNoise(seed) {
    const rng = makeRng(seed);
    // 预生成一张随机格点表，之后做双线性插值
    const SIZE = 256;
    const table = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++)
        table[i] = rng();
    const at = (ix, iy) => {
        const x = ((ix % SIZE) + SIZE) % SIZE;
        const y = ((iy % SIZE) + SIZE) % SIZE;
        return table[y * SIZE + x];
    };
    // 平滑插值曲线（避免出现网格状的棱角）
    const smooth = (t) => t * t * (3 - 2 * t);
    return function noise(x, y) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = smooth(x - x0);
        const fy = smooth(y - y0);
        const a = at(x0, y0);
        const b = at(x0 + 1, y0);
        const c = at(x0, y0 + 1);
        const d = at(x0 + 1, y0 + 1);
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
}
/**
 * 分形布朗运动（fBm）：把多个倍频噪声叠起来
 *
 * 一层噪声只有大团的起伏，叠上更细的层之后，
 * 就会同时具备"山脉的大轮廓"和"山坡上的小起伏"，
 * 这就是真实地形看起来自然的原因。
 */
function makeFbm(seed, octaves = 4, baseFreq = 3, lacunarity = 2, gain = 0.5) {
    const noise = makeValueNoise(seed);
    return function fbm(x, y) {
        let value = 0;
        let amp = 1;
        let freq = baseFreq;
        let norm = 0;
        for (let o = 0; o < octaves; o++) {
            value += noise(x * freq, y * freq) * amp;
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return value / norm;
    };
}
export const TERRAIN_FLAVORS = [
    {
        id: "ridge",
        name: "连绵山脊",
        desc: "山连山、沟壑纵横，针叶林长在坡上 —— 火烧起来会被山脊拖住",
        octaves: 6,
        baseFreq: 3.1,
        ridge: 0.85,
        waterLevel: [0.10, 0.15],
        rivers: [2, 4],
        townBias: 1,
        roads: [1, 2],
        moistureBias: -0.02,
        forestBias: 0.1,
    },
    {
        id: "basin",
        name: "河谷盆地",
        desc: "四周高、中间低，几条大河横贯 —— 河就是现成的隔离带",
        octaves: 4,
        baseFreq: 1.9,
        ridge: 0.35,
        // 水量要克制：0.26~0.36 实测会淹掉 28% 的地，火根本没地方烧
        waterLevel: [0.15, 0.21],
        rivers: [2, 4],
        townBias: 2,
        roads: [2, 3],
        moistureBias: 0.06,
        forestBias: 0,
    },
    {
        id: "plateau",
        name: "高原缓坡",
        desc: "一望无际的缓坡，草甸与疏林交错 —— 火会走得很远很快",
        octaves: 3,
        baseFreq: 1.4,
        ridge: 0.15,
        waterLevel: [0.06, 0.10],
        rivers: [0, 2],
        townBias: 1,
        roads: [1, 2],
        moistureBias: -0.1,
        forestBias: -0.25,
    },
    {
        id: "lakeside",
        name: "湖沼密布",
        desc: "大大小小的水面把地切成碎块 —— 火的传播被水体反复打断",
        octaves: 5,
        baseFreq: 2.4,
        ridge: 0.45,
        waterLevel: [0.26, 0.36],
        rivers: [4, 6],
        townBias: 2,
        roads: [2, 3],
        moistureBias: 0.16,
        forestBias: 0.05,
    },
    {
        id: "dryland",
        name: "干旱疏林",
        desc: "土薄树稀，枯草连片 —— 一点就着，但没什么可烧的",
        octaves: 5,
        baseFreq: 2.8,
        ridge: 0.6,
        waterLevel: [0.05, 0.09],
        rivers: [0, 1],
        townBias: 0,
        roads: [1, 2],
        moistureBias: -0.18,
        forestBias: -0.3,
    },
    {
        id: "deepforest",
        name: "连片密林",
        desc: "针叶林铺满大半个图 —— 这是最难打的一种火场",
        octaves: 5,
        baseFreq: 2.2,
        ridge: 0.5,
        waterLevel: [0.08, 0.13],
        rivers: [1, 3],
        townBias: 1,
        roads: [1, 2],
        // 密林要"干"而不是"湿"：湿度太高反而全变湿草，长不出连片的林子。
        // 微微偏干 + 大幅下压阔叶阈值，才能得到大面积的 conifer。
        moistureBias: -0.06,
        forestBias: 0.5,
    },
];
/** 按 id 取地貌品种 */
export const FLAVOR_MAP = Object.fromEntries(TERRAIN_FLAVORS.map((f) => [f.id, f]));
/**
 * 生成一片「真实地貌」
 *
 * 和 createGrid 的区别：
 *   createGrid  → 色块式的随机地形，够用但不像真地
 *   createTerrain → 有海拔、有山脊、有河谷、植被随高度和湿度分布，
 *                   看起来像一张真实的自然林区
 *
 * 生成流程（三步，每步都有明确的地理学依据）：
 *   1. 高程场：多层 fBm 叠出连绵起伏。再做一次"山脊锐化"，
 *      把高的地方推得更高，形成清晰的山脊线（不是平滑的土包）。
 *   2. 水系：从高处顺地势往下"淌"，低洼处积水成湖，
 *      沿途画出蜿蜒的河谷。河谷两侧自动变湿。
 *   2.5 人类活动：低平近水处生成城镇，地图被几条弯曲的林道切开。
 *   3. 植被：按「高程 + 湿度 + 坡度」查表 ——
 *        山顶裸岩 → 高海拔针叶林 → 中海拔混交 → 河谷阔叶林
 *        → 平地草地 → 低洼湿地
 *
 * 结果就是：你看到的每一片林子，都能说清楚它为什么长在那儿。
 *
 * 第二个参数 `flavorId` 指定「地貌品种」。不传的话就按 seed 自动挑一个 ——
 * 于是同一颗种子永远对应同一种地貌（可复现），不同种子大概率是不同品种（有变化）。
 */
export function createTerrain(params, flavorId) {
    const { cols, rows, seed } = params;
    const total = cols * rows;
    const rng = makeRng(seed ^ 0x9e3779b9);
    // 挑品种：显式指定就用指定的，否则由 seed 决定（可复现）
    const flavor = (flavorId ? FLAVOR_MAP[flavorId] : undefined) ??
        TERRAIN_FLAVORS[Math.floor(makeRng(seed ^ 0x5bf03635)() * TERRAIN_FLAVORS.length)];
    // 归一化坐标（0~1），让不同尺寸的地图看起来是同一套地貌尺度
    const nx = (x) => x / cols;
    const ny = (y) => y / rows;
    // 长宽比补偿：避免地图被拉扁
    const aspect = cols / Math.max(rows, 1);
    /* ---------- 第 1 步：高程场 ---------- */
    const elevFbm = makeFbm(seed, flavor.octaves, flavor.baseFreq, 2.0, 0.52);
    const elev = new Float32Array(total);
    let eMin = Infinity;
    let eMax = -Infinity;
    // 山脊锐化指数：品种决定锋利程度
    const ridgePow = 1.6 + flavor.ridge * 1.6;
    const ridgeMix = 0.2 + flavor.ridge * 0.45;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const n = elevFbm(nx(x) * aspect, ny(y));
            // 山脊锐化：越高的地方抬得越猛，形成清晰的山脊线
            const ridged = n < 0.5 ? n * 0.72 : 1 - Math.pow(1 - n, ridgePow) * 0.72 - 0.28 + 0.28;
            const v = n * (1 - ridgeMix) + ridged * ridgeMix;
            elev[y * cols + x] = v;
            if (v < eMin)
                eMin = v;
            if (v > eMax)
                eMax = v;
        }
    }
    // 拉伸到 0~1 全量程，保证每张图都能用上完整的地貌层次
    const eSpan = eMax - eMin || 1;
    for (let i = 0; i < total; i++)
        elev[i] = (elev[i] - eMin) / eSpan;
    /* ---------- 第 2 步：湿度场 + 水系 ---------- */
    // 湿度基频也跟着品种走：碎地形配碎湿度，大平原配大块湿度
    const moistFbm = makeFbm(seed + 7919, 4, flavor.baseFreq * 1.2, 2.0, 0.5);
    const humidity = new Float32Array(total);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            humidity[y * cols + x] = clamp01(moistFbm(nx(x) * aspect + 11.3, ny(y) + 5.7) + flavor.moistureBias);
        }
    }
    // 湖：低洼处积水
    const isWater = new Uint8Array(total);
    const waterLevel = flavor.waterLevel[0] + rng() * (flavor.waterLevel[1] - flavor.waterLevel[0]);
    for (let i = 0; i < total; i++) {
        if (elev[i] < waterLevel)
            isWater[i] = 1;
    }
    // 河：从高处选几个源头，顺地势往低处淌，一路刻出河谷
    const riverCount = flavor.rivers[0] + Math.floor(rng() * (flavor.rivers[1] - flavor.rivers[0] + 1));
    for (let r = 0; r < riverCount; r++) {
        let x = Math.floor(rng() * cols);
        let y = Math.floor(rng() * rows);
        // 找一个足够高的源头，河才有落差可淌
        let best = -1;
        for (let k = 0; k < 60; k++) {
            const cx = Math.floor(rng() * cols);
            const cy = Math.floor(rng() * rows);
            const h = elev[cy * cols + cx];
            if (h > best && h > 0.55) {
                best = h;
                x = cx;
                y = cy;
            }
        }
        if (best < 0)
            continue;
        // 顺流而下：每一步都走向 3×3 邻域里最低的格
        for (let step = 0; step < cols + rows; step++) {
            const i = y * cols + x;
            if (isWater[i])
                break;
            isWater[i] = 1;
            // 河边两格也降低高程、抬高湿度（河漫滩）
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ax = x + dx;
                    const ay = y + dy;
                    if (ax < 0 || ay < 0 || ax >= cols || ay >= rows)
                        continue;
                    const j = ay * cols + ax;
                    elev[j] = Math.max(0, elev[j] - 0.06);
                    humidity[j] = Math.min(1, humidity[j] + 0.22);
                }
            }
            // 找最低的邻居继续走
            let lowX = -1;
            let lowY = -1;
            let lowH = elev[i];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0)
                        continue;
                    const ax = x + dx;
                    const ay = y + dy;
                    if (ax < 0 || ay < 0 || ax >= cols || ay >= rows)
                        continue;
                    const h = elev[ay * cols + ax];
                    // 加一点随机，河道才不会笔直得假
                    if (h + (rng() - 0.5) * 0.05 < lowH) {
                        lowH = h;
                        lowX = ax;
                        lowY = ay;
                    }
                }
            }
            // 已经到洼地了，注水成塘，停下
            if (lowX < 0) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ax = Math.max(0, Math.min(cols - 1, x + dx));
                        const ay = Math.max(0, Math.min(rows - 1, y + dy));
                        isWater[ay * cols + ax] = 1;
                    }
                }
                break;
            }
            x = lowX;
            y = lowY;
        }
    }
    /* ---------- 第 2.5 步：人类活动 —— 城镇与林道 ----------
     * 为什么要有这一层？
     *   真实林区火灾很少发生在"纯无人区"。山脚下有村子、有林道，
     *   而村子和道路既是点火源（炊烟、车、电线），也是天然阻火带。
     *   把它画进地图，才能讨论"火会不会烧到镇子"这种真问题。
     */
    const isTown = new Uint8Array(total);
    const isRoad = new Uint8Array(total);
    // 城镇：挑一块低、平、离水近的地方安家（人类选址的真实逻辑）
    // 干旱疏林（townBias=0）几乎没人住；河谷盆地/湖沼密布人多（townBias=2）
    const townRoll = rng() * (2 + flavor.townBias);
    const townCount = townRoll < 0.9 ? 2 : townRoll < 1.9 ? 1 : 0;
    const towns = [];
    for (let t = 0; t < townCount; t++) {
        let bx = -1;
        let by = -1;
        let bestScore = -Infinity;
        for (let k = 0; k < 120; k++) {
            const cx = Math.floor(rng() * cols);
            const cy = Math.floor(rng() * rows);
            const i = cy * cols + cx;
            if (isWater[i])
                continue;
            const flat = 1 - Math.abs(elev[i] - 0.3); // 越接近低海拔越好
            const wet = humidity[i] * 0.4; // 靠水好
            const s = flat + wet + rng() * 0.15;
            if (s > bestScore) {
                bestScore = s;
                bx = cx;
                by = cy;
            }
        }
        if (bx < 0)
            continue;
        const rad = 1 + Math.floor(rng() * 2.6); // 半径 1~3 格
        towns.push({ x: bx, y: by, r: rad });
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                const ax = bx + dx;
                const ay = by + dy;
                if (ax < 0 || ay < 0 || ax >= cols || ay >= rows)
                    continue;
                // 圆形城镇 + 边缘抖一点，不是个方块
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > rad + (rng() - 0.5) * 0.9)
                    continue;
                isTown[ay * cols + ax] = 1;
            }
        }
    }
    // 林道：从最边缘随机走向对侧，把地图切成几块
    // —— 这既是扑火队的进场路线，也是天然的阻火带
    const roadCount = flavor.roads[0] + Math.floor(rng() * (flavor.roads[1] - flavor.roads[0] + 1));
    for (let r = 0; r < roadCount; r++) {
        const vertical = rng() < 0.5;
        let x = vertical
            ? Math.floor(rng() * cols)
            : rng() < 0.5
                ? 0
                : cols - 1;
        let y = vertical
            ? rng() < 0.5
                ? 0
                : rows - 1
            : Math.floor(rng() * rows);
        const steps = vertical ? rows * 2 : cols * 2;
        // 前进方向：尽量往对侧走，但会随机漂移，于是路是弯的
        const dirX = vertical ? (rng() - 0.5) * 0.35 : x === 0 ? 1 : -1;
        const dirY = vertical ? (y === 0 ? 1 : -1) : (rng() - 0.5) * 0.35;
        let fx = x;
        let fy = y;
        for (let s = 0; s < steps; s++) {
            const cx = Math.round(fx);
            const cy = Math.round(fy);
            if (cx < 0 || cy < 0 || cx >= cols || cy >= rows)
                break;
            const i = cy * cols + cx;
            isRoad[i] = 1;
            fx += dirX + (rng() - 0.5) * 0.3;
            fy += dirY + (rng() - 0.5) * 0.3;
        }
    }
    /* ---------- 第 3 步：按高程 + 湿度分配植被 ---------- */
    const fuel = new Array(total);
    // 品种的"森林偏好"平移所有湿度阈值：
    //   forestBias > 0 → 阈值降低 → 更容易长成林子（连片密林）
    //   forestBias < 0 → 阈值升高 → 更多草地/裸地（干旱疏林）
    // 注意阈值不能越界，所以夹在合理区间里。
    const fb = flavor.forestBias;
    const tMidBroad = clamp01(0.58 - fb * 0.5); // 中山带：> 这个湿度算阔叶
    const tMidConif = clamp01(0.30 - fb * 0.5); // 中山带：> 这个湿度算针叶
    const tLowWet = clamp01(0.62 - fb * 0.5); // 丘陵：> 这个湿度算湿草
    const tLowShrub = clamp01(0.34 - fb * 0.5); // 丘陵：> 这个湿度算灌木
    const tPlainWet = clamp01(0.50 - fb * 0.4); // 低地：> 这个湿度算湿地
    const tHighConif = clamp01(0.30 + fb * 0.35); // 高海拔：低于这个湿度就是裸岩
    /* ------------------------------------------------------------
     * 「密林度」：光调湿度阈值是不够的
     *
     * 试过只压 tMidConif，结果 deepforest 的针叶林只有 17% ——
     * 因为阈值一压，中山带的干格从"灌木"变成了"针叶"，
     * 但丘陵和低地那两带（占半张图）依然是草和灌木，没动。
     *
     * 真正的"连片密林"是：**森林下限整体下沉**。
     * 所以这里再加一个独立的机制 —— 对每个格子做一次
     * "树线判定"：湿度够 + 海拔不太低 → 就是树。
     * forestBias 越大，这条判定越宽松。
     * ------------------------------------------------------------ */
    const forest = clamp01(flavor.forestBias * 2.4); // 0~1 的"密林度"
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const h = elev[i];
            const m = humidity[i];
            let id;
            if (isTown[i]) {
                id = "barren"; // 城镇：房子和水泥地，烧不起来
            }
            else if (isRoad[i]) {
                id = "barren"; // 林道：车能开进来的路，也是阻火带
            }
            else if (isWater[i]) {
                id = "water"; // 河流 / 湖泊 —— 火过不去的天然屏障
            }
            else if (h > 0.88) {
                // 山顶、陡脊：土层薄，裸岩为主，偶尔几丛灌木
                // （只留最顶上那一小撮，不然"石头山"会占掉半张图）
                id = rng() < 0.55 - forest * 0.2 ? "barren" : "shrub";
            }
            else if (h > 0.7) {
                // 高海拔：针叶林带（喜冷、连片、燃点低、烧得久）
                id = m < tHighConif ? "barren" : "conifer";
            }
            else if (h > 0.45) {
                // 中山带：针叶与阔叶混交，湿度说了算
                if (m > tMidBroad)
                    id = "broadleaf";
                else if (m > tMidConif)
                    id = "conifer";
                else
                    id = "shrub";
            }
            else if (h > 0.22) {
                // 丘陵、缓坡：灌木与草地交错
                if (m > tLowWet)
                    id = "wetgrass";
                else if (m > tLowShrub)
                    id = "shrub";
                else
                    id = "drygrass";
            }
            else {
                // 低地：草为主，湿度高的地方是湿地
                id = m > tPlainWet ? "wetgrass" : "drygrass";
            }
            /* 树线判定：密林度越高，越多的草/灌木被"森林"接管。
               高海拔偏针叶（冷），低海拔偏阔叶（暖），
               这条海拔偏好本身就是真实的地理规律。 */
            if (forest > 0 && id !== "water" && !isTown[i] && !isRoad[i]) {
                // 这块地"该不该长树"：湿度要够、别在最高的裸岩上
                const treeOk = m > 0.24 + (1 - forest) * 0.26 && h < 0.86;
                if (treeOk) {
                    // 越高越可能是针叶，越低越可能是阔叶
                    const coniferChance = clamp01(0.35 + h * 0.8);
                    if (rng() < forest)
                        id = rng() < coniferChance ? "conifer" : "broadleaf";
                }
            }
            // 少量随机扰动，避免出现"教科书式"的完美分层
            // （水面、城镇、道路不参与扰动，它们是"硬"地貌）
            if (rng() < 0.06 && id !== "water" && !isTown[i] && !isRoad[i]) {
                const alt = ["drygrass", "wetgrass", "shrub", "conifer", "broadleaf", "barren"];
                id = alt[Math.floor(rng() * alt.length)];
            }
            fuel[i] = id;
        }
    }
    /* ---------- 收尾：含水率 ---------- */
    const moisture = new Float32Array(total);
    for (let i = 0; i < total; i++) {
        if (fuel[i] === "water") {
            moisture[i] = 1;
            continue;
        }
        const base = FUEL_MAP[fuel[i]]?.moisture ?? 0;
        // 靠水的地方天然更湿
        const nearWater = humidity[i] * 0.12;
        moisture[i] = clamp01(base + nearWater + (rng() - 0.5) * 0.06);
    }
    return {
        cols,
        rows,
        fuel,
        state: new Uint8Array(total),
        age: new Uint8Array(total),
        moisture,
        // 把生成植被时用的高程场一并交出去，供「海拔视图」使用。
        // elev 在这之前已经归一化到 0~1，正是视图需要的量纲。
        elevation: elev,
        flavor: { id: flavor.id, name: flavor.name, desc: flavor.desc },
    };
}
/**
 * 生成一张「真实世界地图」
 *
 * 这是整件事的重点：地图不再是随机生成的，而是**世界上真实存在的一块地方**。
 *
 * 数据来源：lib/atlas.ts 里的经纬度多边形轮廓（矢量数据，可无损放大）。
 *
 * 生成流程：
 *   1. 把网格坐标 (x, y) 反算成经纬度 (lon, lat)
 *      —— 这一步就是"地图投影"：把矩形网格铺到真实经纬度上
 *   2. 每个格子问一句 isLand(region, lon, lat)：
 *        是陆地 → 继续判植被
 *        是海/湖 → water（火过不去的天然屏障）
 *   3. 植被由【纬度气候带 + 局部高程扰动】决定，而不是纯随机：
 *        赤道附近  → 热带雨林（broadleaf，常年湿）
 *        副热带    → 干旱草原 / 荒漠（drygrass / barren）
 *        温带      → 阔叶林、混交林（broadleaf / conifer）
 *        寒温带    → 针叶林（conifer，就是西伯利亚那种）
 *        极地      → 苔原（shrub / barren）
 *   4. 在气候带的基础上叠一层 fBm 噪声，让同一纬度带上也有林地/空旷地的区别
 *      （真实世界里，即使是同一纬度，山脊和河谷的植被也完全不同）
 *
 * 为什么这样做才有意义？
 *   因为"火在寒带针叶林里烧"和"火在热带雨林里烧"是完全不同的两件事。
 *   前者燃料干、连片、烧得凶；后者湿、碎、往往烧不起来。
 *   只有纬度真的对应上植被，地图上那条从西伯利亚到东南亚的斜线才有物理含义。
 */
export function createRealWorld(params, region) {
    const { cols, rows, seed } = params;
    const total = cols * rows;
    const rng = makeRng(seed ^ 0x1b873593);
    // 拿不到区域就退回到程序生成地形，保证永远有地图可用
    const reg = region ?? REGION_MAP[params.region];
    if (!reg)
        return createTerrain(params);
    const [west, south, east, north] = reg.bbox;
    const lonSpan = east - west;
    const latSpan = north - south;
    // 网格 → 经纬度。注意 y 往下是南，所以纬度要倒过来算。
    const lonAt = (x) => west + ((x + 0.5) / cols) * lonSpan;
    const latAt = (y) => north - ((y + 0.5) / rows) * latSpan;
    /* ---------- 第 1 步：海陆掩膜 ---------- */
    const isSea = new Uint8Array(total);
    for (let y = 0; y < rows; y++) {
        const lat = latAt(y);
        for (let x = 0; x < cols; x++) {
            if (!isLand(reg, lonAt(x), lat))
                isSea[y * cols + x] = 1;
        }
    }
    /* ---------- 第 2 步：局部地形噪声（让同纬度带有变化） ---------- */
    // 用一个大尺度的 fBm 当"海拔"，它决定同一纬度带内部是密林还是空地
    const reliefFbm = makeFbm(seed, 5, 3.4, 2.0, 0.5);
    const wetFbm = makeFbm(seed + 6151, 4, 4.2, 2.0, 0.5);
    const aspect = cols / Math.max(rows, 1);
    const relief = new Float32Array(total);
    const localWet = new Float32Array(total);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            relief[i] = reliefFbm((x / cols) * aspect, y / rows);
            localWet[i] = wetFbm((x / cols) * aspect + 3.1, y / rows + 7.9);
        }
    }
    /* ---------- 第 2.5 步：把 relief 归一化成「海拔场」 ----------
     * 真实地图的海拔不是纯噪声 —— 海面必须是 0，陆地才有起伏。
     * 所以这里做两件事：
     *   ① 把 relief 拉伸到 0~1（保证整条色带都用得上）
     *   ② 所有海格强制归 0，这样海拔视图里海是一整片均匀的深蓝，
     *      海岸线会非常清楚，而陆地的沟谷山脊一目了然。
     */
    const elev = new Float32Array(total);
    let rMin = Infinity;
    let rMax = -Infinity;
    for (let i = 0; i < total; i++) {
        if (isSea[i])
            continue;
        if (relief[i] < rMin)
            rMin = relief[i];
        if (relief[i] > rMax)
            rMax = relief[i];
    }
    const rSpan = rMax - rMin || 1;
    for (let i = 0; i < total; i++) {
        elev[i] = isSea[i] ? 0 : clamp01((relief[i] - rMin) / rSpan);
    }
    /* ---------- 第 3 步：按气候带 + 局部地形分配植被 ---------- */
    const fuel = new Array(total);
    const humidity = new Float32Array(total);
    for (let y = 0; y < rows; y++) {
        const lat = latAt(y);
        // 这一行的气候基准值：由纬度唯一决定
        const baseMoist = latitudeHumidity(lat);
        const temp = latitudeTemp(lat);
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (isSea[i]) {
                fuel[i] = "water";
                humidity[i] = 1;
                continue;
            }
            // 气候基准 + 局部起伏：山里比同纬度的平原湿，向阳坡比背阴坡干
            const r = relief[i];
            const m = clamp01(baseMoist + (localWet[i] - 0.5) * 0.42 + (0.5 - r) * 0.18);
            humidity[i] = m;
            let id;
            if (temp < -2) {
                // 极地 / 高山苔原：长不出树，只有地衣和矮灌木
                id = r > 0.72 ? "barren" : "shrub";
            }
            else if (temp < 5) {
                // 寒温带：针叶林带 —— 西伯利亚、斯堪的纳维亚
                // 这里就是"最容易被点着的那片林子"
                if (r > 0.82)
                    id = "barren"; // 山顶裸岩
                else if (m > 0.62 && r < 0.45)
                    id = "wetgrass";
                else
                    id = "conifer";
            }
            else if (temp < 14) {
                // 温带：阔叶林与针叶林混交，湿度说了算
                if (r > 0.85)
                    id = "barren";
                else if (m > 0.63)
                    id = "broadleaf";
                else if (m > 0.36)
                    id = r > 0.6 ? "conifer" : "broadleaf";
                else
                    id = "drygrass";
            }
            else if (temp < 21) {
                // 亚热带 / 地中海：灌木与草地为主，夏天容易起山火
                if (r > 0.86)
                    id = "barren";
                else if (m > 0.66)
                    id = "broadleaf";
                else if (m > 0.4)
                    id = "shrub";
                else
                    id = "drygrass";
            }
            else {
                // 热带：雨林（湿）→ 稀树草原（干）
                if (m > 0.66)
                    id = "broadleaf"; // 热带雨林，湿到基本烧不动
                else if (m > 0.42)
                    id = "shrub";
                else
                    id = "drygrass";
            }
            // 一小撮随机扰动，避免"教科书式"的完美分层
            if (rng() < 0.055 && id !== "barren") {
                const alt = ["drygrass", "wetgrass", "shrub", "conifer", "broadleaf"];
                id = alt[Math.floor(rng() * alt.length)];
            }
            fuel[i] = id;
        }
    }
    /* ---------- 收尾：含水率 ---------- */
    const moisture = new Float32Array(total);
    for (let i = 0; i < total; i++) {
        if (fuel[i] === "water") {
            moisture[i] = 1;
            continue;
        }
        const callBase = FUEL_MAP[fuel[i]]?.moisture ?? 0;
        // 气候带越湿，同一类燃料也越难着
        const climate = humidity[i] * 0.18;
        moisture[i] = clamp01(callBase + climate + (rng() - 0.5) * 0.05);
    }
    return {
        cols,
        rows,
        fuel,
        state: new Uint8Array(total),
        age: new Uint8Array(total),
        moisture,
        // 真实地图的海拔场：海面 0，陆地内部归一化起伏
        elevation: elev,
    };
}
/** 生成初始地图 */
export function createGrid(params) {
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
    const acc = [];
    let running = 0;
    for (const [id, v] of entries) {
        running += v / sum;
        acc.push([id, running]);
    }
    const pickOne = () => {
        const r = rng();
        for (const [id, threshold] of acc) {
            if (r <= threshold)
                return id;
        }
        return acc[acc.length - 1]?.[0] ?? "barren";
    };
    let fuel = new Array(total);
    for (let i = 0; i < total; i++)
        fuel[i] = pickOne();
    // 第二步：多数平滑若干轮，让同类地块聚成片
    for (let pass = 0; pass < 4; pass++) {
        const out = fuel.slice();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                // 数一数 3×3 邻域里各燃料各有多少格
                const tally = {};
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                            continue;
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
                    if (xx >= 0 && xx < cols)
                        fuel[y * cols + xx] = "barren";
                }
                // 弯曲幅度小一点，避免屏障自己断开
                if (rng() < 0.3)
                    x += rng() < 0.5 ? -1 : 1;
                x = Math.max(1, Math.min(cols - thickness - 1, x));
            }
        }
        else {
            let y = Math.floor(rows * (0.2 + rng() * 0.6));
            for (let x = 0; x < cols; x++) {
                for (let w = 0; w < thickness; w++) {
                    const yy = y + w;
                    if (yy >= 0 && yy < rows)
                        fuel[yy * cols + x] = "barren";
                }
                if (rng() < 0.3)
                    y += rng() < 0.5 ? -1 : 1;
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
export function createBlankGrid(params, defaultFuel = "drygrass") {
    const { cols, rows } = params;
    const total = cols * rows;
    const fuel = new Array(total).fill(defaultFuel);
    const moisture = new Float32Array(total);
    const base = FUEL_MAP[defaultFuel]?.moisture ?? 0;
    for (let i = 0; i < total; i++)
        moisture[i] = base;
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
export function paintFuel(grid, cx, cy, fuelId, radius = 0) {
    const { cols, rows } = grid;
    const fuel = grid.fuel.slice();
    const moisture = new Float32Array(grid.moisture);
    const state = new Uint8Array(grid.state);
    const base = FUEL_MAP[fuelId]?.moisture ?? 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            // 圆形笔刷
            if (dx * dx + dy * dy > radius * radius + 0.5)
                continue;
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= cols || y >= rows)
                continue;
            const i = y * cols + x;
            fuel[i] = fuelId;
            moisture[i] = base;
            // 刷过的地方恢复成未燃状态，避免残留火/灰
            state[i] = 0 /* CellState.Normal */;
        }
    }
    return { ...grid, fuel, moisture, state };
}
export function stepGrid(grid, params, turn, rng) {
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
            if (!f)
                continue;
            const s = state[i];
            /* ---- 不可燃格永远不动 ---- */
            if (f.flammability <= 0) {
                nextState[i] = 0 /* CellState.Normal */;
                nextAge[i] = 0;
                continue;
            }
            /* ---- 灰烬：不参与传播，但会挡火（这里什么都不做就是"挡"） ---- */
            if (s === 4 /* CellState.Ash */) {
                nextAge[i] = age[i];
                continue;
            }
            /* ---- 湿隔离带：极难被点燃，但会随时间蒸干 ---- */
            if (s === 5 /* CellState.WetLine */) {
                const a = age[i] + 1;
                // 湿带能撑 hold 轮；雨越大，干得越慢。
                // 这是个关键可调量：湿带越持久，隔离带战术越有效。
                const hold = Math.round(24 + rain.suppress * 30);
                if (a >= hold) {
                    nextState[i] = 0 /* CellState.Normal */;
                    nextAge[i] = 0;
                    nextMoisture[i] = clamp01(moisture[i] - 0.15);
                }
                else {
                    nextAge[i] = a;
                }
                continue;
            }
            /* ---- 燃烧：维持 N 轮后转灰烬 ---- */
            if (s === 3 /* CellState.Burning */) {
                const a = age[i] + 1;
                if (a >= f.burnDuration) {
                    nextState[i] = 4 /* CellState.Ash */;
                    nextAge[i] = 0;
                    // 烧完之后该处变干，为后续复燃留伏笔
                    nextMoisture[i] = clamp01(moisture[i] - 0.1);
                }
                else {
                    nextAge[i] = a;
                }
                continue;
            }
            /* ---- 火星 / 升温：向上提升的判定 ---- */
            if (s === 1 /* CellState.Ember */ || s === 2 /* CellState.Heating */) {
                // 被雨压制得越强，越可能退回正常（相当于被浇灭）
                if (rain.suppress > 0 && rng() < rain.suppress * 0.5) {
                    nextState[i] = 0 /* CellState.Normal */;
                    nextAge[i] = 0;
                    continue;
                }
                // 提升概率 = 燃料可燃性 × 干旱度 × (1-雨压制)
                const dryness = 1 - moisture[i];
                let promote = f.flammability * (0.35 + 0.65 * dryness) * (1 - rain.suppress);
                // 已升温的更容易烧起来（火在烤它）
                if (s === 2 /* CellState.Heating */)
                    promote *= 1.8;
                promote = clamp01(promote);
                // 火星 → 升温 → 燃烧 是多阶段过程，每一步都要花时间。
                // 系数调小，火就不会"一轮从火星跳到明火"。
                if (rng() < promote * 0.28) {
                    nextState[i] =
                        s === 1 /* CellState.Ember */ ? 2 /* CellState.Heating */ : 3 /* CellState.Burning */;
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
                    if (dx === 0 && dy === 0)
                        continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                        continue;
                    const j = ny * cols + nx;
                    if (state[j] !== 3 /* CellState.Burning */)
                        continue;
                    const nf = FUEL_MAP[fuel[j]];
                    if (!nf)
                        continue;
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    if (dist > nf.spreadRange)
                        continue;
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
                let p = f.flammability *
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
                    nextState[i] = 1 /* CellState.Ember */;
                    nextAge[i] = 0;
                }
            }
        }
    }
    /* ---- 动物扰动：飞火（跳到远处） ---- */
    if (params.animalEmber) {
        const burningCells = [];
        for (let i = 0; i < state.length; i++) {
            if (state[i] === 3 /* CellState.Burning */)
                burningCells.push(i);
        }
        if (burningCells.length > 0) {
            // 火越大，飞火越频繁，但给一个上限避免爆炸
            const attempts = Math.min(3, Math.ceil(burningCells.length / 120));
            for (let k = 0; k < attempts; k++) {
                const src = burningCells[Math.floor(rng() * burningCells.length)];
                const srcF = FUEL_MAP[fuel[src]];
                if (!srcF || rng() > srcF.emberRate * 1.6)
                    continue;
                // 顺风方向飘一段距离
                const dist = 4 + Math.floor(rng() * 8);
                const sx = src % cols;
                const sy = Math.floor(src / cols);
                const tx = Math.round(sx + windX * dist + (rng() - 0.5) * 6);
                const ty = Math.round(sy + windY * dist + (rng() - 0.5) * 6);
                if (tx < 0 || ty < 0 || tx >= cols || ty >= rows)
                    continue;
                const ti = ty * cols + tx;
                const tf = FUEL_MAP[fuel[ti]];
                if (!tf || tf.flammability <= 0)
                    continue;
                if (nextState[ti] === 0 /* CellState.Normal */ && rng() < 0.55) {
                    nextState[ti] = 1 /* CellState.Ember */;
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
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                    continue;
                const j = ny * cols + nx;
                const nf = FUEL_MAP[fuel[j]];
                if (!nf || nf.flammability <= 0)
                    continue;
                if (nextState[j] === 0 /* CellState.Normal */) {
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
            if (!f || f.flammability <= 0)
                continue;
            nextMoisture[i] = clamp01(nextMoisture[i] + rain.moistureAdd);
        }
    }
    const nextGrid = {
        ...grid,
        state: nextState,
        age: nextAge,
        moisture: nextMoisture,
    };
    const snapshot = countStates(nextGrid, turn);
    const extinguished = snapshot.burning === 0 && snapshot.ember === 0 && snapshot.heating === 0;
    return { grid: nextGrid, snapshot, extinguished };
}
/* ============================================================
 * 九、统计与工具函数
 * ============================================================ */
export function countStates(grid, turn) {
    const c = [0, 0, 0, 0, 0, 0];
    const { state, fuel } = grid;
    for (let i = 0; i < state.length; i++) {
        const f = FUEL_MAP[fuel[i]];
        // 不可燃格算作"正常"，不参与统计口径的干扰
        if (f && f.flammability <= 0) {
            c[0 /* CellState.Normal */]++;
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
export function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
/** 统计可燃格总数，用于算"烧毁占比" */
export function countFlammable(grid) {
    let n = 0;
    for (const id of grid.fuel) {
        const f = FUEL_MAP[id];
        if (f && f.flammability > 0)
            n++;
    }
    return n;
}
/** 在指定位置点火 */
export function igniteAt(grid, x, y, cause) {
    const next = { ...grid, state: new Uint8Array(grid.state), age: new Uint8Array(grid.age) };
    const { cols, rows } = grid;
    const r = cause.scatter;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows)
                continue;
            const i = ny * cols + nx;
            const f = FUEL_MAP[grid.fuel[i]];
            if (!f || f.flammability <= 0)
                continue;
            if (next.state[i] === 0 /* CellState.Normal */) {
                next.state[i] = cause.startState;
                next.age[i] = 0;
            }
        }
    }
    return next;
}
/**
 * 随机点火：在可燃的陆地上随机挑 n 处点着
 *
 * 为什么要单独写一个，而不是 `igniteAt(grid, rng()*cols, rng()*rows)`？
 * ────────────────────────────────────────────────────────────────
 * 因为"随机丢两个点"在真实地图上经常会丢到海里。
 * 亚欧大陆那张图有 56% 是海 —— 闭着眼睛点两下，
 * 有相当大概率两下全落在水上，于是**看起来像是什么都没发生**，
 * 用户会以为按钮坏了。
 *
 * 所以这里的做法是：先把所有「能烧的格子」的序号收集起来，
 * 再从中等概率抽样。这样无论地图长什么样，
 * 一次随机点火一定真的点着了 n 处不同的地方。
 *
 * 另外刻意避开已经烧过的格子（灰烬/正在烧的），
 * 否则可能两处都点在同一个火场里，等于只点了一处。
 */
export function igniteRandom(grid, n, cause, rng) {
    const { cols, rows } = grid;
    const burnable = [];
    for (let i = 0; i < grid.fuel.length; i++) {
        const f = FUEL_MAP[grid.fuel[i]];
        if (!f || f.flammability <= 0)
            continue; // 水 / 裸岩 / 城镇
        if (grid.state[i] !== 0 /* CellState.Normal */)
            continue; // 已经烧过或正在烧
        burnable.push(i);
    }
    // 整张图已经没得烧了：原样返回，让界面去提示
    if (burnable.length === 0)
        return grid;
    let next = grid;
    const picked = new Set();
    for (let k = 0; k < n; k++) {
        // 可点数少于要点的数量时，点满为止（避免死循环）
        if (picked.size >= burnable.length)
            break;
        let idx = burnable[Math.floor(rng() * burnable.length)];
        // 抽到重复的就再抽一次，最多试 40 次，避免极端情况下卡住
        for (let t = 0; t < 40 && picked.has(idx); t++) {
            idx = burnable[Math.floor(rng() * burnable.length)];
        }
        if (picked.has(idx))
            continue;
        picked.add(idx);
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        next = igniteAt(next, x, y, cause);
    }
    return next;
}
/** 计算当前火势规模，用于"扑救是否跟得上"的反馈 */
export function countBurning(grid) {
    let n = 0;
    for (let i = 0; i < grid.state.length; i++) {
        if (grid.state[i] === 3 /* CellState.Burning */)
            n++;
    }
    return n;
}
