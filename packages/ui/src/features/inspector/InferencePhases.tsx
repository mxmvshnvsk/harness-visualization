// Три фазы инференса на цифрах этого запроса (этап 8d.1): prefill — сколько prompt прочитано
// и сколько взято из кэша, decode — сколько токенов рассуждения и ответа, stop — чем кончилось.
// Время по фазам появится с потоковым ответом (8d.2); пока — только общее.

import type { ReactElement } from 'react';
import { Term } from '../../help/HelpLinks';
import type { ModelCall } from '../../projections/sessionView';
import styles from './Inspector.module.css';

const STOPS: Record<string, string> = {
  stop: 'модель сама закончила ответ',
  tool_calls: 'модель попросила тулы — дальше работает харнесс',
  length: 'упёрлась в лимит длины ответа',
};

export function InferencePhases({ call }: { call: ModelCall }): ReactElement | null {
  const response = call.response;
  if (response === null) {
    return null;
  }
  const { usage, finishReason } = response.reply;
  const fresh = usage.inputTokens - usage.inputCacheHitTokens;
  const answer = Math.max(usage.outputTokens - usage.reasoningTokens, 0);
  return (
    <section className={styles.block} aria-label="Фазы инференса">
      <span className={styles.blockTitle}>
        Внутри запроса — <Term topic="inference">инференс</Term> в три фазы
      </span>
      <div className={styles.phases}>
        <div className={styles.phase} data-phase="prefill">
          <b>Prefill — прочитать prompt</b>
          <Split
            parts={[
              { label: 'из кэша', value: usage.inputCacheHitTokens, kind: 'cache' },
              { label: 'заново', value: fresh, kind: 'fresh' },
            ]}
          />
          <span>
            {format(usage.inputTokens)} input: {format(usage.inputCacheHitTokens)} из кэша,{' '}
            {format(fresh)} посчитано заново
          </span>
        </div>
        <div className={styles.phase} data-phase="decode">
          <b>Decode — писать по токену</b>
          <Split
            parts={[
              { label: 'reasoning', value: usage.reasoningTokens, kind: 'reasoning' },
              { label: 'ответ', value: answer, kind: 'answer' },
            ]}
          />
          <span>
            {format(usage.outputTokens)} output: {format(usage.reasoningTokens)} рассуждения,{' '}
            {format(answer)} ответа
          </span>
        </div>
        <div className={styles.phase} data-phase="stop">
          <b>Stop — остановиться</b>
          <code className={styles.mono}>finish_reason: {finishReason ?? '—'}</code>
          <span>
            {STOPS[finishReason ?? ''] ?? 'причина от провайдера'} · весь запрос{' '}
            {(response.durationMs / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с
          </span>
        </div>
      </div>
    </section>
  );
}

interface Part {
  label: string;
  value: number;
  kind: 'cache' | 'fresh' | 'reasoning' | 'answer';
}

// Полоска из двух частей: доли — по токенам.
function Split({ parts }: { parts: Part[] }): ReactElement {
  const total = Math.max(
    parts.reduce((sum, part) => sum + part.value, 0),
    1,
  );
  return (
    <span
      className={styles.split}
      role="img"
      aria-label={parts.map((part) => `${part.label} ${String(part.value)}`).join(', ')}
    >
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <span
            key={part.kind}
            data-kind={part.kind}
            style={{ width: `${String((part.value / total) * 100)}%` }}
          />
        ))}
    </span>
  );
}

function format(value: number): string {
  return value.toLocaleString('ru-RU');
}
