// Полоса фаз запроса к модели (этап 8d.3): до первого токена, рассуждение, ответ или вызов тула.
// Полная — с подписями; мини — для сравнения шагов в одном масштабе. И строка фаз для заголовка шага.

import type { ReactElement } from 'react';
import type { InferenceTiming } from '../../projections/inferenceTiming';
import { formatSeconds } from '../../text/formatDuration';
import styles from './PhaseBar.module.css';

interface PhaseBarProps {
  timing: InferenceTiming;
  // Ширина всей полосы в миллисекундах: у мини-полос сравнения — самый долгий запрос.
  scaleMs?: number;
  mini?: boolean;
}

export function PhaseBar({ timing, scaleMs, mini = false }: PhaseBarProps): ReactElement {
  const scale = scaleMs ?? timing.totalMs;
  const width = (ms: number): string => `${String((ms / Math.max(scale, 1)) * 100)}%`;
  const parts = [
    { kind: 'wait', ms: timing.waitMs, label: `до первого токена ${formatSeconds(timing.waitMs)}` },
    { kind: 'reasoning', ms: timing.reasoningMs, label: formatSeconds(timing.reasoningMs) },
    { kind: 'answer', ms: timing.answerMs, label: formatSeconds(timing.answerMs) },
  ];
  return (
    <span
      className={styles.bar}
      data-mini={mini}
      role="img"
      aria-label={`до первого токена ${formatSeconds(timing.waitMs)}, рассуждение ${formatSeconds(timing.reasoningMs)}, ${answerWord(timing)} ${formatSeconds(timing.answerMs)}`}
    >
      {parts.map((part) => (
        <span key={part.kind} data-kind={part.kind} style={{ width: width(part.ms) }}>
          {mini ? null : part.label}
        </span>
      ))}
    </span>
  );
}

export function answerWord(timing: InferenceTiming): string {
  return timing.toolCalls ? 'вызов тулов' : 'ответ';
}

// Строка под заголовком шага: фазы видно, не открывая «Подробнее».
export function PhaseLine({ timing }: { timing: InferenceTiming }): ReactElement {
  return (
    <p className={styles.line}>
      <span data-kind="wait">первый токен +{formatSeconds(timing.waitMs)}</span>
      {timing.reasoningMs > 0 && (
        <span data-kind="reasoning">рассуждает {formatSeconds(timing.reasoningMs)}</span>
      )}
      <span data-kind="answer">
        {timing.toolCalls ? 'зовёт тулы' : 'пишет ответ'} {formatSeconds(timing.answerMs)}
      </span>
    </p>
  );
}

export function PhaseLegend(): ReactElement {
  return (
    <p className={styles.legend}>
      <span data-kind="wait">до первого токена — сеть, очередь, prefill</span>
      <span data-kind="reasoning">рассуждение</span>
      <span data-kind="answer">ответ или вызов тула</span>
    </p>
  );
}
