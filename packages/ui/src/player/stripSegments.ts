// Отрезки ленты действий: из расписания повтора — что рисовать и что подписать под курсором.
// Общие для ленты и её мини-карты.

import type { AgentLabels } from '../features/agents/agentLabels';
import type { Schedule } from '../timeline/schedule';

export interface Segment {
  key: string;
  from: number;
  to: number;
  group: string;
  waiting: boolean;
  title: string;
  // Цвет субагента, чьё это действие (этап 6c); null — главный агент или обычная сессия.
  agent: string | null;
}

// Что происходит в этот момент повтора: последнее начавшееся действие.
export function actionAt(schedule: Schedule, time: number): string | null {
  let found: string | null = null;
  for (const item of schedule.actions) {
    if (item.outFrom > time) {
      break;
    }
    const back = item.backFrom !== null && time >= item.backFrom;
    found = back ? (item.action.whatBack ?? item.action.what) : item.action.what;
  }
  return found;
}

// Где начинается каждый вопрос диалога: первый — сообщение пользователя, следующие — обратный
// полёт после «читает ответ…».
export function questionMarks(schedule: Schedule): number[] {
  const marks: number[] = [];
  for (const item of schedule.actions) {
    if (item.action.kind === 'message' && item.action.from === 'user') {
      marks.push(item.outFrom);
    }
    if (item.action.id.startsWith('reading:') && item.backFrom !== null) {
      marks.push(item.backFrom);
    }
  }
  return marks.sort((left, right) => left - right);
}

export function segmentsOf(schedule: Schedule, labels: AgentLabels): Segment[] {
  const segments: Segment[] = [];
  for (const item of schedule.actions) {
    const { action } = item;
    const agent = labels.enabled && action.agentId !== null ? labels.colorOf(action.agentId) : null;
    const base = { group: action.group, waiting: false, agent };
    segments.push({
      ...base,
      key: `${action.id}:out`,
      from: item.outFrom,
      to: item.outTo,
      title: action.what,
    });
    if (item.backFrom !== null && item.backTo !== null) {
      segments.push({
        ...base,
        key: `${action.id}:wait`,
        from: item.outTo,
        to: item.backFrom,
        waiting: true,
        title: `${action.what} — ожидание`,
      });
      segments.push({
        ...base,
        key: `${action.id}:back`,
        from: item.backFrom,
        to: item.backTo,
        title: action.whatBack ?? action.what,
      });
    }
  }
  return segments;
}
