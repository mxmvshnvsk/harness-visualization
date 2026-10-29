// Плашка над «Запросом» и «Ответом» (мокап, одобренный 29.10.2026): что это за JSON — сеть
// выбранного шага, а не снимок на момент плеера, — когда ушло и пришло и какого размера.

import type { ReactElement } from 'react';
import type { ResearchStep } from '../../projections/projectResearch';
import { formatNumber, formatSeconds } from './StepsView';
import styles from './Research.module.css';

interface StepExplainProps {
  step: ResearchStep;
  side: 'request' | 'response';
  // Время первого события сессии, мс эпохи.
  startedAt: number;
}

export function StepExplain({ step, side, startedAt }: StepExplainProps): ReactElement {
  const sentAt = Date.parse(step.request.timestamp) - startedAt;
  const outcome = step.response ?? step.error;
  const usage = step.response?.reply.usage ?? null;
  return (
    <dl className={styles.explain}>
      <dt>что это</dt>
      <dd>{side === 'request' ? requestText(step.number) : responseText(step.number)}</dd>
      <dt>{side === 'request' ? 'ушёл' : 'пришёл'}</dt>
      <dd className={styles.mono}>{describeTiming(sentAt, outcome?.durationMs ?? null, side)}</dd>
      <dt>размер</dt>
      <dd className={styles.mono}>{describeSize(usage, side)}</dd>
    </dl>
  );
}

function requestText(number: number): string {
  return `Тело HTTP-запроса к модели на запросе ${String(number)} — ровно как ушло по сети: system, вся история, описания тулов.`;
}

function responseText(number: number): string {
  return `Ответ модели на запрос ${String(number)}: «разобранный» — по частям, «сырой» — тело, как пришло по сети (поток собран в один объект).`;
}

function describeTiming(
  sentAt: number,
  durationMs: number | null,
  side: 'request' | 'response',
): string {
  if (durationMs === null) {
    return `${formatSeconds(sentAt)} от начала сессии · ответа ещё нет`;
  }
  return side === 'request'
    ? `${formatSeconds(sentAt)} от начала сессии · ответ через ${formatSeconds(durationMs)}`
    : `${formatSeconds(sentAt + durationMs)} от начала сессии · через ${formatSeconds(durationMs)} после запроса`;
}

function describeSize(
  usage: NonNullable<ResearchStep['response']>['reply']['usage'] | null,
  side: 'request' | 'response',
): string {
  if (usage === null) {
    return 'usage придёт с ответом';
  }
  return side === 'request'
    ? `${formatNumber(usage.inputTokens)} input tokens (из usage ответа)`
    : `${formatNumber(usage.outputTokens)} output tokens, из них reasoning ${formatNumber(usage.reasoningTokens)}`;
}
