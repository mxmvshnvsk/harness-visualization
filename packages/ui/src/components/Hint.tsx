// Термин с подсказкой: пунктир под словом, пояснение — при наведении и фокусе (Tab).
// Для коротких пояснений прямо на месте; длинное — в справке (Term).

import type { ReactElement, ReactNode } from 'react';
import styles from './Hint.module.css';

export function Hint({ text, children }: { text: string; children: ReactNode }): ReactElement {
  return (
    <span className={styles.wrap} tabIndex={0}>
      <span className={styles.term}>{children}</span>
      <span className={styles.hint} role="tooltip">
        {text}
      </span>
    </span>
  );
}
