// Легенда графика: цвета частей prompt, черта точного размера, линии и значки действий.

import type { CSSProperties, ReactElement } from 'react';
import styles from './Context.module.css';
import { PARTS } from './contextScale';

export function ContextLegend(): ReactElement {
  return (
    <ul className={styles.legend} aria-label="Легенда">
      {PARTS.map((part) => (
        <li
          key={part.key}
          className={styles.swatch}
          style={{ '--swatch': part.color } as CSSProperties}
        >
          {part.label} (≈)
        </li>
      ))}
      <li className={styles.legendExact}>точно по usage</li>
      <li className={styles.legendThreshold}>порог</li>
      <li>✂ обрезал результат</li>
      <li>⌫ убрал старые результаты</li>
      <li>≡ сжал историю</li>
    </ul>
  );
}
