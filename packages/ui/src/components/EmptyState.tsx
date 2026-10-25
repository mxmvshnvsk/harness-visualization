// Пустое состояние: стеклянная карточка на переливах — единственное место для стекла
// (docs/plan.md, «Этап 8: решения»).

import type { ReactElement, ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  children: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps): ReactElement {
  return (
    <div className={styles.stage}>
      <div className={`${styles.blob} ${styles.blobA}`} aria-hidden="true" />
      <div className={`${styles.blob} ${styles.blobB}`} aria-hidden="true" />
      <div className={`${styles.blob} ${styles.blobC}`} aria-hidden="true" />
      <div className={styles.glass}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.text}>{children}</div>
      </div>
    </div>
  );
}
