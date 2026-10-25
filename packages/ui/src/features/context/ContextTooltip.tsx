// Подсказка при наведении на запрос: части prompt, точный размер, ошибка оценки, кэш и
// что харнесс сделал перед запросом.

import type { CSSProperties, ReactElement } from 'react';
import { requestLabel, type ContextRequest } from '../../projections/projectContext';
import styles from './Context.module.css';
import { actionsOf, cachePercent, errorPercent, formatTokens, PARTS } from './contextScale';

interface ContextTooltipProps {
  request: ContextRequest;
  // Края колонки и ширина графика: подсказка встаёт сбоку от колонки, не закрывая её.
  left: number;
  right: number;
  width: number;
}

export function ContextTooltip({ request, left, right, width }: ContextTooltipProps): ReactElement {
  const { estimate } = request.budget;
  const error = errorPercent(request);
  const cache = cachePercent(request);
  return (
    <div
      className={styles.tooltip}
      style={right + 280 < width ? { left: right + 8 } : { left: Math.max(0, left - 288) }}
      role="status"
    >
      <strong>
        {requestLabel(request)} · {request.purpose}
      </strong>
      <ul className={styles.tooltipParts}>
        {PARTS.map((part) => (
          <li key={part.key} style={{ '--swatch': part.color } as CSSProperties}>
            <span>{part.label}</span>
            <span>≈ {formatTokens(estimate[part.key])}</span>
          </li>
        ))}
      </ul>
      <div className={styles.tooltipRow}>
        <span>оценка</span>
        <span>≈ {formatTokens(estimate.total)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>точно (usage)</span>
        <span>
          {request.exactTokens === null ? 'ждём ответ' : formatTokens(request.exactTokens)}
          {error !== null && ` (${error > 0 ? '+' : ''}${String(error)} %)`}
        </span>
      </div>
      {cache !== null && (
        <div className={styles.tooltipRow}>
          <span>из кэша</span>
          <span>{cache} %</span>
        </div>
      )}
      {actionsOf(request).map((action) => (
        <div key={action} className={styles.tooltipAction}>
          {action}
        </div>
      ))}
      <span className={styles.tooltipHint}>клик — перемотать сюда</span>
    </div>
  );
}
