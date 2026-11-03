import type { FC } from 'react';
import { BoardA1Gate } from './BoardA1Gate';
import { BoardA2Policy } from './BoardA2Policy';
import { BoardA3Funding } from './BoardA3Funding';
import { BoardA4Finance } from './BoardA4Finance';
import { BoardA5Failure } from './BoardA5Failure';
import { BoardA6Build } from './BoardA6Build';
import { BoardA7Decision } from './BoardA7Decision';
import { arrOf, lampOf, objOf, str } from './shared';

/**
 * boards — 七块智能体专属结论展板注册表（展板海报式看板）。
 *
 * 调度规则（AgentBoard）：有输出 + 展板组件存在 + hasBoardData 通过
 * → 渲染专属展板；否则回退 ConclusionMatrix → 再回退通用模板三段式。
 * 每块展板内部继续容错：缺字段显示占位，绝不阻塞版式。
 */

type BoardProps = { json: Record<string, unknown> };

export const AGENT_BOARDS: Record<string, FC<BoardProps>> = {
  'agent1-固有对象': BoardA1Gate,
  'agent2-政策应答': BoardA2Policy,
  'agent3-多元融资': BoardA3Funding,
  'agent4-财务模型': BoardA4Finance,
  'agent5-失败案例': BoardA5Failure,
  // 展示序 A6 = id agent7-建造判别；A7 = id agent6-双层决策（执行序 ≠ id 数字）
  'agent7-建造判别': BoardA6Build,
  'agent6-双层决策': BoardA7Decision,
};

/** 展板数据门槛：结论层 JSON 至少含该 agent 的核心字段才走专属展板 */
export function hasBoardData(agentId: string, json: Record<string, unknown>): boolean {
  if (!json || Object.keys(json).length === 0) return false;
  const hasFields = (v: unknown) => Object.keys(objOf(v)).length > 0;
  switch (agentId) {
    case 'agent1-固有对象':
      return lampOf(json) !== null || Array.isArray(json['命中判据']) || Array.isArray(json['风险点']);
    case 'agent2-政策应答':
      return arrOf(json['可适用政策清单']).length > 0 || arrOf(json['未适用政策及原因']).length > 0;
    case 'agent3-多元融资':
      return arrOf(json['可适用融资工具清单']).length > 0 || Boolean(str(json['推荐资金组合']));
    case 'agent4-财务模型':
      return hasFields(json['财务指标']) || Array.isArray(json['现金流时序']);
    case 'agent5-失败案例':
      return arrOf(json['Top3案例']).length > 0 || lampOf(json) !== null;
    case 'agent7-建造判别':
      return Object.keys(json).filter((k) => !k.startsWith('_') && k !== 'agent').length > 1;
    case 'agent6-双层决策':
      return lampOf(json) !== null || hasFields(json['四维子灯']);
    default:
      return false;
  }
}
