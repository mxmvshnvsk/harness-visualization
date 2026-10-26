// Строка токеномики — на всех видах сессии, рядом с плеером: сколько запросов, токенов и денег
// ушло к этому месту сессии. Валюты не складываем; неизвестная цена — так и написано, не ноль.

import type { ReactElement } from 'react';
import { Term } from '../help/HelpLinks';
import type { SessionTotals } from '../projections/sessionView';
import { plural } from '../text/plural';
import styles from './TokenomicsLine.module.css';

const REQUESTS = { one: 'запрос', few: 'запроса', many: 'запросов' };

export function TokenomicsLine({ totals }: { totals: SessionTotals }): ReactElement {
  const { usage } = totals;
  const cacheShare = usage.inputTokens === 0 ? 0 : usage.inputCacheHitTokens / usage.inputTokens;
  return (
    <div className={styles.line}>
      <span>{plural(totals.modelRequests, REQUESTS)} к модели</span>
      <span>
        <Term topic="tokens">input</Term> {formatNumber(usage.inputTokens)}{' '}
        <span className={styles.muted}>
          (<Term topic="prompt-cache">cache hit</Term> {formatNumber(usage.inputCacheHitTokens)},{' '}
          {String(Math.round(cacheShare * 100))} %)
        </span>
      </span>
      <span>
        output {formatNumber(usage.outputTokens)}{' '}
        <span className={styles.muted}>(reasoning {formatNumber(usage.reasoningTokens)})</span>
      </span>
      <span className={styles.money}>{describeCosts(totals)}</span>
      <Duration totals={totals} />
      <span className={styles.help}>
        <Term topic="tokens">что это?</Term>
      </span>
    </div>
  );
}

// Работа и простой — отдельно: после ответа сессия ждёт вопроса, и это не время агента.
// Простой меньше секунды не показываем.
function Duration({ totals }: { totals: SessionTotals }): ReactElement {
  if (totals.durationMs - totals.workMs < 1000) {
    return <span className={styles.muted}>{formatSeconds(totals.durationMs)}</span>;
  }
  return (
    <span
      className={styles.muted}
      title="Работа — без простоя между ответом и новым вопросом; сессия открыта — вся запись"
    >
      работа {formatSeconds(totals.workMs)} · сессия открыта {formatSeconds(totals.durationMs)}
    </span>
  );
}

function describeCosts(totals: SessionTotals): string {
  const parts = totals.modelCosts.map((cost) => `${cost.total.toFixed(6)} ${cost.currency}`);
  if (totals.unpricedModelRequests > 0) {
    parts.push(`цена неизвестна: ${plural(totals.unpricedModelRequests, REQUESTS)}`);
  }
  for (const tool of totals.toolCosts) {
    parts.push(
      `${tool.toolName} ×${String(tool.calls)}: ${String(Number(tool.total.toFixed(3)))} ${tool.currency}`,
    );
  }
  return parts.length === 0 ? 'стоимость: 0' : parts.join(' · ');
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}
