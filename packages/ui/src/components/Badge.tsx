// Бейдж-пометка. dot — нейтральная плашка с цветной точкой (так помечаем «prompt cache прогрет»:
// смысл виден, а экран не заливается акцентом). Остальные — контур цвета группы.

import type { ReactElement, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'error' | 'judge' | 'permission' | 'retrieval';

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps): ReactElement {
  return (
    <span className={`${styles.badge} ${dot ? styles.dotted : styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
