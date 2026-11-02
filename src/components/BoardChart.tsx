import React, { useEffect, useState } from 'react';

/**
 * BoardChart —— 结论看板迷你条形图（三态）：
 *
 *   idle    空图表：坐标轨道 + 中央「空图表 · 等待结论数据」提示
 *   running 随机数据跳动：柱高按节奏波动，示意运算进行中
 *   done    固定结论数据：柱高按真实值归一，缺值字段显示「—」占位
 *
 * bars 的 label 恒定（模板骨架）；value 为 null 表示该字段尚无结论数据。
 */

export interface BarSpec {
  label: string;
  /** 归一化前的数值；null = 无结论数据（占位柱） */
  value: number | null;
  /** 展示文本（原始值截断）；null 态显示占位 */
  display: string | null;
}

interface Props {
  state: 'idle' | 'running' | 'done';
  bars: BarSpec[];
  zh: boolean;
}

/** 确定性伪随机（0-1）：跳动期每根柱按 tick 波动，避免真随机导致的闪烁杂乱 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const BoardChart: React.FC<Props> = ({ state, bars, zh }) => {
  const [tick, setTick] = useState(0);

  // 运行态：柱值按 620ms 节奏跳动
  useEffect(() => {
    if (state !== 'running') return;
    const t = setInterval(() => setTick((v) => v + 1), 620);
    return () => clearInterval(t);
  }, [state]);

  // done 态公共最大值（柱长相对化）；running/idle 不需要
  const globalMax = Math.max(
    1e-9,
    ...bars.map((b) => (b.value != null && b.value > 0 ? b.value : 0)),
  ) * 1.05;

  const stateText =
    state === 'idle' ? (zh ? '待运行' : 'idle') : state === 'running' ? (zh ? '运算中' : 'running') : (zh ? '结论数据' : 'final');

  return (
    <div className={`board-chart bc-${state}`}>
      <div className="bc-head">
        <span>{zh ? '结论可视化' : 'VISUALIZATION'}</span>
        <span className="bc-state">{stateText}</span>
      </div>
      <div className="bc-plot">
        {bars.map((b, i) => {
          let pct = 0;
          let text = '—';
          if (state === 'running') {
            pct = 22 + pseudoRandom((tick + 1) * (i + 3)) * 62;
            text = '···';
          } else if (state === 'done') {
            pct = b.value != null ? Math.max(3, Math.min(100, (b.value / globalMax) * 100)) : 0;
            text = b.display ?? '—';
          }
          return (
            <div key={b.label} className="bc-row">
              <span className="bc-label" title={b.label}>{b.label}</span>
              <div className="bc-track">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="bc-val" title={text}>{text}</span>
            </div>
          );
        })}
      </div>
      {state === 'idle' && (
        <div className="bc-empty">{zh ? '空图表 · 等待结论数据' : 'empty chart · awaiting conclusion data'}</div>
      )}
    </div>
  );
};

export default BoardChart;
