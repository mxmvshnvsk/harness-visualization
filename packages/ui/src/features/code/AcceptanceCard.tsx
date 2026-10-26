// Приёмка Код-арены (этап 10): что сказал агент и что показали тесты харнесса. Та же карточка —
// во вкладке «Код» и в «Диалоге» под ответом агента.

import type { AcceptanceCheckedPayload } from '@harness-visualization/harness';
import type { ReactElement } from 'react';
import styles from './Code.module.css';

export function AcceptanceCard({
  acceptance,
}: {
  acceptance: AcceptanceCheckedPayload;
}): ReactElement {
  const { visible, hidden } = acceptance;
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>Приёмка харнессом</h3>
      <div className={styles.verdict}>
        <div className={styles.verdictCell} data-ok={acceptance.passed}>
          <span className={styles.muted}>итог</span>
          <b>{acceptance.passed ? '✓ пройдена' : '✗ не пройдена'}</b>
          {acceptance.timedOut && <span>тесты не уложились во время</span>}
        </div>
        <div className={styles.verdictCell} data-ok={visible.failed === 0}>
          <span className={styles.muted}>видимые тесты — исходные</span>
          <b>
            {visible.passed} из {visible.passed + visible.failed}
          </b>
        </div>
        <div className={styles.verdictCell} data-ok={hidden.failed === 0}>
          <span className={styles.muted}>скрытые — агент их не видел</span>
          <b>
            {hidden.passed} из {hidden.passed + hidden.failed}
          </b>
        </div>
      </div>
      <ul className={styles.tests}>
        {hidden.tests.map((test) => (
          <li key={test.name}>
            <span className={test.ok ? styles.add : styles.del}>{test.ok ? '✓' : '✗'}</span>
            <span>
              {test.name}
              {test.error === null ? '' : ` — ${test.error}`}
            </span>
          </li>
        ))}
      </ul>
      {acceptance.changedTests.length > 0 && (
        <p className={styles.muted}>
          Агент менял тесты: {acceptance.changedTests.join(', ')}. На итог это не влияет: приёмка
          запускала исходные, а дописывать свои тесты можно.
        </p>
      )}
    </section>
  );
}
