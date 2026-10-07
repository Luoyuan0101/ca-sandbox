"use client";

import type { RescueParams, SimParams } from "@/lib/fireModel";
import { FUELS, IGNITION_CAUSES, RAIN_LEVELS, RESCUE_MODES, RESCUE_STRATEGIES } from "@/lib/fireModel";

interface Props {
  params: SimParams;
  setParams: (p: Partial<SimParams>) => void;
  causeId: string;
  setCauseId: (v: string) => void;
  rescue: RescueParams;
  setRescue: (p: Partial<RescueParams>) => void;
  seed: number;
  setSeed: (v: number) => void;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-ash-100 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="panel-title">{title}</span>
        {hint && <span className="text-[11px] text-ash-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[12.5px] text-ash-600">
        {label}
        <b className="font-medium text-ash-800">{display ?? value}</b>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function ControlPanel({
  params,
  setParams,
  causeId,
  setCauseId,
  rescue,
  setRescue,
  seed,
  setSeed,
}: Props) {
  const mixTotal = Object.values(params.mix).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="panel divide-y divide-ash-100 overflow-hidden">
      {/* 全局湿度 */}
      <Section title="环境" hint="湿度越高越难点燃">
        <div className="space-y-3.5">
          <Slider
            label="全局湿度"
            value={params.humidity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setParams({ humidity: v })}
            display={params.humidity.toFixed(2)}
          />
          <Slider
            label="风力强度"
            value={params.windPower}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setParams({ windPower: v })}
            display={params.windPower.toFixed(2)}
          />
          <Slider
            label="风向"
            value={Math.round((params.windDir * 180) / Math.PI)}
            min={0}
            max={360}
            step={15}
            onChange={(v) => setParams({ windDir: (v * Math.PI) / 180 })}
            display={`${Math.round((params.windDir * 180) / Math.PI)}°`}
          />
        </div>
      </Section>

      {/* 降雨 */}
      <Section title="气象事件 · 降雨" hint="压制火势，雨停后地还是湿的">
        <div className="flex flex-wrap gap-1.5">
          {RAIN_LEVELS.map((r) => (
            <button
              key={r.id}
              onClick={() => setParams({ rain: r.id })}
              className={`chip ${params.rain === r.id ? "chip-active" : ""}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </Section>

      {/* 着火原因 */}
      <Section title="着火原因" hint="不同原因 = 不同初始条件">
        <div className="space-y-1.5">
          {IGNITION_CAUSES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCauseId(c.id)}
              className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                causeId === c.id
                  ? "border-ember-300 bg-ember-50"
                  : "border-ash-200 bg-white hover:bg-ash-50"
              }`}
            >
              <span className="mt-[1px] text-[13px]">{c.icon}</span>
              <span className="min-w-0">
                <b className="block text-[12.5px] font-medium text-ash-800">
                  {c.name}
                </b>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-ash-500">
                  {c.desc}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* 动物扰动 */}
      <Section title="动物扰动" hint="外部随机性，可关掉做对照">
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-1"
              checked={params.animalEmber}
              onChange={(e) => setParams({ animalEmber: e.target.checked })}
            />
            <span>
              <b className="block text-[12.5px] font-medium text-ash-800">飞火</b>
              <span className="text-[11.5px] leading-5 text-ash-500">
                飞鸟与气流把火星带到远处，形成跳跃式蔓延 —— 真实大火最麻烦的现象
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-1"
              checked={params.animalTrample}
              onChange={(e) => setParams({ animalTrample: e.target.checked })}
            />
            <span>
              <b className="block text-[12.5px] font-medium text-ash-800">踩踏</b>
              <span className="text-[11.5px] leading-5 text-ash-500">
                动物踩出裸地，意外形成天然防火隔离带
              </span>
            </span>
          </label>
        </div>
      </Section>

      {/* 消防队救援 */}
      <Section
        title="消防队救援"
        hint={rescue.crews === 0 ? "已关闭" : "从外围压火线"}
      >
        {/* 救援开关：关掉就是纯自然蔓延，用来做对照组 */}
        <button
          onClick={() => setRescue({ crews: rescue.crews === 0 ? 2 : 0 })}
          className={`mb-3.5 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 transition ${
            rescue.crews === 0
              ? "border-ash-200 bg-white hover:bg-ash-50"
              : "border-[#2E6FB8]/30 bg-[#2E6FB8]/5"
          }`}
        >
          <span className="text-left">
            <b className="block text-[12.5px] font-medium text-ash-800">
              {rescue.crews === 0 ? "🙅 无消防队（对照组）" : "🚒 消防队已派出"}
            </b>
            <span className="mt-0.5 block text-[11.5px] leading-5 text-ash-500">
              {rescue.crews === 0
                ? "纯自然蔓延，用来对比「有人救火」的差别"
                : "点击可关闭，做无救援对照实验"}
            </span>
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
              rescue.crews === 0 ? "bg-ash-200" : "bg-[#2E6FB8]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                rescue.crews === 0 ? "left-0.5" : "left-[18px]"
              }`}
            />
          </span>
        </button>

        <div
          className={`space-y-3.5 transition ${rescue.crews === 0 ? "pointer-events-none opacity-40" : ""}`}
        >
          <Slider
            label="消防队数量"
            value={rescue.crews}
            min={0}
            max={4}
            step={1}
            onChange={(v) => setRescue({ crews: v })}
            display={rescue.crews === 0 ? "无救援" : `${rescue.crews} 支`}
          />
          <Slider
            label="每轮移动格数"
            value={rescue.speed}
            min={1}
            max={8}
            step={1}
            onChange={(v) => setRescue({ speed: v })}
            display={`${rescue.speed} 格`}
          />
          <Slider
            label="出警延迟"
            value={rescue.delay}
            min={0}
            max={40}
            step={1}
            onChange={(v) => setRescue({ delay: v })}
            display={`${rescue.delay} 轮`}
          />
          <p className="rounded-lg bg-ash-50 px-3 py-2 text-[11.5px] leading-5 text-ash-500">
            现实里从报警到消防车抵达火场需要时间。延迟设得太小，
            火还没烧起来队伍就到了 —— 那样反而不真实，也观察不到「早期扑救」的价值。
            <b className="text-ash-700">试着把延迟从 0 调到 40，看烧毁面积怎么变。</b>
          </p>

          <div>
            <span className="mb-2 block text-[12.5px] text-ash-600">扑救方式</span>
            <div className="space-y-1.5">
              {RESCUE_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setRescue({ mode: m.id })}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                    rescue.mode === m.id
                      ? "border-[#2E6FB8]/40 bg-[#2E6FB8]/5"
                      : "border-ash-200 bg-white hover:bg-ash-50"
                  }`}
                >
                  <span className="min-w-0">
                    <b className="block text-[12.5px] font-medium text-ash-800">
                      {m.name}
                    </b>
                    <span className="mt-0.5 block text-[11.5px] leading-5 text-ash-500">
                      {m.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[12.5px] text-ash-600">调度策略</span>
            <div className="space-y-1.5">
              {RESCUE_STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setRescue({ strategy: s.id })}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                    rescue.strategy === s.id
                      ? "border-ember-300 bg-ember-50"
                      : "border-ash-200 bg-white hover:bg-ash-50"
                  }`}
                >
                  <span className="min-w-0">
                    <b className="block text-[12.5px] font-medium text-ash-800">
                      {s.name}
                    </b>
                    <span className="mt-0.5 block text-[11.5px] leading-5 text-ash-500">
                      {s.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[11.5px] leading-5 text-amber-800">
            消防队从地图外围的消防站出发，只扑【还在往外蔓延的火线】，
            不会追着已烧成灰烬的地方跑（焦土不可通行）；
            自身被火包围时会先撤离保命。
            <b>湿隔离带</b>是真正能断火的手段 —— 火头前方打湿一条带，
            火走到那里就过不去了，但湿带会随时间蒸干。
          </p>
        </div>
      </Section>

      {/* 植被构成 */}
      <Section title="植被构成" hint={`归一化前合计 ${mixTotal}`}>
        <div className="space-y-2.5">
          {FUELS.map((f) => (
            <Slider
              key={f.id}
              label={f.name}
              value={params.mix[f.id] ?? 0}
              min={0}
              max={60}
              step={5}
              onChange={(v) => setParams({ mix: { ...params.mix, [f.id]: v } })}
              display={`${params.mix[f.id] ?? 0}%`}
            />
          ))}
        </div>
      </Section>

      {/* 种子 */}
      <Section title="随机种子" hint="同种子 = 可复现">
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-ash-200 px-2.5 py-1.5 text-[13px] text-ash-700 outline-none focus:border-ember-400"
          />
          <button
            className="btn btn-ghost shrink-0"
            onClick={() => setSeed(Math.floor(Math.random() * 99999999))}
          >
            换一个
          </button>
        </div>
      </Section>
    </div>
  );
}
