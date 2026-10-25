// Что харнесс сделал сам, до первого запроса агента: переформулировал вопрос (rewrite)
// и нашёл материал, который подмешал в контекст (auto, rewrite).

import type { ReactElement } from 'react';
import type { RetrievalView } from '../../projections/sessionView';
import styles from './Inspector.module.css';
import { HelpButton } from '../../help/HelpLinks';

export function RetrievalPanel({ retrieval }: { retrieval: RetrievalView }): ReactElement {
  const { rewrite, retrieved } = retrieval;
  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.eventType} data-group="retrieval">
          context_retrieved
        </span>
        <h2 className={styles.panelTitle}>Харнесс ищет сам</h2>
        <span className={styles.headerHelp}>
          <HelpButton topic="retrieval" />
        </span>
      </header>
      {rewrite !== null && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>query от модели (rewrite)</h3>
          <div>
            «{rewrite.userQuestion}» → «{rewrite.query}»
            {rewrite.usedFallback && ' — модель не ответила, ищем по вопросу как есть'}
          </div>
        </section>
      )}
      {retrieved !== null && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>
            {retrieved.toolName} · query от {retrieved.queryAuthor} · {retrieved.status} ·{' '}
            {retrieved.durationMs.toLocaleString('ru-RU')} мс
          </h3>
          <pre className={styles.code}>{JSON.stringify(retrieved.arguments, null, 2)}</pre>
          <div className={styles.caption}>подмешано в контекст до первого запроса:</div>
          <pre className={styles.code}>{retrieved.content}</pre>
        </section>
      )}
    </article>
  );
}
