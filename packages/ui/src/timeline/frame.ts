// Кадр «Потока» в момент повтора: где точки, кто чего ждёт, какие подписи видны,
// какая доля времени у каждого участника и что написать под схемой. Чистая функция:
// её проверяют тесты, а рисует FlowView — прямо в SVG, без перерисовки React на каждый кадр.

import type { EventGroup } from '../events/eventGroups';
import type { FlowNodeId } from '../features/flow/flowGraph';
import type { FlowAction, ModelPhases } from './actions';
import { realAt, type ScheduledAction, type Schedule } from './schedule';

export type Lane = 'out' | 'back';

export interface MovingDot {
  action: FlowAction;
  lane: Lane;
  // 0–1 вдоль полосы, ещё без сглаживания.
  progress: number;
}

export interface LaneLabel {
  action: FlowAction;
  lane: Lane;
  opacity: number;
}

export interface WaitingNode {
  node: FlowNodeId;
  group: EventGroup;
  label: string;
  // Сколько ждём по времени записи.
  elapsedMs: number;
  // Фаза запроса к модели (этап 8d.3); null — фаз нет.
  phase: ModelPhase | null;
  action: FlowAction;
}

export type ModelPhase = 'wait' | 'reasoning' | 'answer' | 'done';

export interface Frame {
  real: number;
  dots: MovingDot[];
  // Точки, стоящие у адресата, пока он работает.
  parked: FlowAction[];
  labels: LaneLabel[];
  insideLabels: LaneLabel[];
  waiting: WaitingNode[];
  // Доля прошедшего времени записи, которую участник был занят.
  busyShare: Partial<Record<FlowNodeId, number>>;
  caption: { what: string; detail: string } | null;
}

// liveReal — для живой сессии, идущей сейчас: время записи «сейчас», чтобы счётчик ожидания
// шёл, пока ответа нет. null — повтор записи.
export function computeFrame(
  schedule: Schedule,
  time: number,
  liveReal: number | null = null,
): Frame {
  const real = liveReal ?? realAt(schedule, time);
  const frame: Frame = {
    real,
    dots: [],
    parked: [],
    labels: [],
    insideLabels: [],
    waiting: [],
    busyShare: {},
    caption: null,
  };
  let latest = -1;
  for (const item of schedule.actions) {
    if (time < item.outFrom) {
      continue;
    }
    addActionToFrame(frame, item, time, real);
    const shownAt = item.backFrom !== null && time >= item.backFrom ? item.backFrom : item.outFrom;
    if (shownAt >= latest) {
      latest = shownAt;
      frame.caption = captionOf(item, time);
    }
  }
  frame.busyShare = busyShares(schedule, real);
  return frame;
}

function addActionToFrame(frame: Frame, item: ScheduledAction, time: number, real: number): void {
  const { action } = item;
  if (action.kind === 'inside') {
    if (time < item.outTo) {
      frame.insideLabels.push({
        action,
        lane: 'out',
        opacity: fade(time, item.outFrom, item.outTo),
      });
    }
    return;
  }
  if (time < item.outTo) {
    frame.dots.push({
      action,
      lane: 'out',
      progress: (time - item.outFrom) / (item.outTo - item.outFrom),
    });
    frame.labels.push({
      action,
      lane: 'out',
      opacity: Math.min(1, ((time - item.outFrom) / (item.outTo - item.outFrom)) * 2.5),
    });
    return;
  }
  if (action.kind === 'message') {
    return;
  }
  const backFrom = item.backFrom ?? Number.POSITIVE_INFINITY;
  if (time < backFrom) {
    frame.parked.push(action);
    frame.labels.push({ action, lane: 'out', opacity: 1 });
    pushWaiting(frame, action, real);
    return;
  }
  const backTo = item.backTo ?? backFrom;
  if (time < backTo) {
    const progress = (time - backFrom) / (backTo - backFrom);
    frame.dots.push({ action, lane: 'back', progress });
    frame.labels.push({ action, lane: 'back', opacity: Math.min(1, progress * 2.5) });
  }
}

// Адресат работает: что он делает и сколько ждём; у модели — фаза запроса (этап 8d.3).
function pushWaiting(frame: Frame, action: FlowAction, real: number): void {
  if (action.busy === null) {
    return;
  }
  const elapsedMs = Math.max(0, real - action.start);
  const phase = phaseAt(action.phases, elapsedMs);
  frame.waiting.push({
    node: action.to,
    group: action.group,
    label: phase === null ? action.busy : phaseLabel(phase, action.phases?.toolCalls ?? false),
    elapsedMs,
    phase,
    action,
  });
}

// Фаза запроса к модели по прошедшему времени: те же моменты, что в инспекторе.
function phaseAt(phases: ModelPhases | null, elapsedMs: number): ModelPhase | null {
  if (phases === null) {
    return null;
  }
  if (elapsedMs < phases.firstMs) {
    return 'wait';
  }
  if (elapsedMs < phases.answerAtMs) {
    return 'reasoning';
  }
  return elapsedMs < phases.lastMs ? 'answer' : 'done';
}

const PHASE_LABELS: Record<ModelPhase, string> = {
  wait: 'ждёт 1-й токен',
  reasoning: 'рассуждает',
  answer: 'пишет ответ',
  done: 'дописала',
};

function phaseLabel(phase: ModelPhase, toolCalls: boolean): string {
  return phase === 'answer' && toolCalls ? 'зовёт тулы' : PHASE_LABELS[phase];
}

// Подпись над узлом: проявляется и гаснет.
function fade(time: number, from: number, to: number): number {
  const progress = (time - from) / (to - from);
  return Math.max(0, Math.min(1, progress * 4, (1 - progress) * 4));
}

function captionOf(item: ScheduledAction, time: number): { what: string; detail: string } {
  const { action } = item;
  const back = item.backFrom !== null && time >= item.backFrom && action.whatBack !== null;
  return back
    ? { what: action.whatBack ?? action.what, detail: action.detailBack ?? '' }
    : { what: action.what, detail: action.detail };
}

// Занятость: сумма времени обменов, адресованных участнику, к моменту real.
function busyShares(schedule: Schedule, real: number): Partial<Record<FlowNodeId, number>> {
  const busy: Partial<Record<FlowNodeId, number>> = {};
  if (real <= 0) {
    return busy;
  }
  for (const { action } of schedule.actions) {
    if (action.kind !== 'exchange' || action.start > real) {
      continue;
    }
    const until = Math.min(real, action.end ?? real);
    busy[action.to] = (busy[action.to] ?? 0) + Math.max(0, until - action.start);
  }
  for (const node of Object.keys(busy) as FlowNodeId[]) {
    busy[node] = Math.min(1, (busy[node] ?? 0) / real);
  }
  return busy;
}
