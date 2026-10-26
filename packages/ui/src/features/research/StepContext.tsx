// Снимок контекста перед запросом: что ушло в модель, по сообщениям, с весом каждого и разницей
// с другим запросом того же агента (по умолчанию — с предыдущим). Сам список — тот же, что
// на экране «Контекст» (PromptContents): новое, заглушки очистки, сводка компакции, обрезка.

import type { PromptBudget } from '@harness-visualization/harness';
import { useState, type ReactElement } from 'react';
import { PromptContents } from '../context/PromptContents';
import type { ContextRequest } from '../../projections/projectContext';
import type { ResearchStep } from '../../projections/projectResearch';
import styles from './Research.module.css';

// Тот же коэффициент, что у харнесса по умолчанию: у запросов без бюджета (судья) его нет.
const DEFAULT_CHARS_PER_TOKEN = 3.24;

export function StepContext(props: {
  step: ResearchStep;
  steps: readonly ResearchStep[];
}): ReactElement {
  const { step } = props;
  const sameAgent = props.steps
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.agentId === step.agentId && item.number < step.number);
  // undefined — по умолчанию (предыдущий), null — ни с чем не сравнивать.
  const [compareWith, setCompareWith] = useState<number | null | undefined>(undefined);
  const against = compareWith === undefined ? step.previous : compareWith;
  const other = against === null ? null : (props.steps[against] ?? null);
  return (
    <div className={styles.body}>
      <div className={styles.compare}>
        <span className={styles.muted}>разница с</span>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={against === null}
          onClick={() => setCompareWith(null)}
        >
          ничем
        </button>
        {sameAgent.map(({ item, index }) => (
          <button
            key={index}
            type="button"
            className={styles.chip}
            aria-pressed={against === index}
            onClick={() => setCompareWith(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <PromptContents
        request={toContextRequest(step)}
        previous={other === null ? null : toContextRequest(other)}
      />
    </div>
  );
}

function toContextRequest(step: ResearchStep): ContextRequest {
  const { request, response } = step;
  const budget: PromptBudget =
    request.budget ?? ({ charsPerToken: DEFAULT_CHARS_PER_TOKEN } as PromptBudget);
  return {
    requestId: request.requestId,
    index: step.index,
    at: 0,
    turn: 1,
    step: request.purpose === 'agentStep' ? request.iteration : null,
    purpose: request.purpose,
    budget,
    body: request.body,
    exactTokens: response?.reply.usage.inputTokens ?? null,
    cacheHitTokens: response?.reply.usage.inputCacheHitTokens ?? null,
    truncated: 0,
    cleared: 0,
    compacted: false,
  };
}
