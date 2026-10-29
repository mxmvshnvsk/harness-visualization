// Память: memo.md на начало сессии (как он ушёл в system prompt) и правки по ходу.

import type { ReactElement } from 'react';
import type { Moment, SkillsMemoryView } from '../../projections/projectSkillsMemory';
import { CallLink } from './CallLink';
import styles from './SkillsMemory.module.css';

interface CardProps {
  view: SkillsMemoryView;
  shown: number;
  focused: string | null;
  onSeek: (moment: Moment) => void;
}

export function MemoryCard({ view, shown, focused, onSeek }: CardProps): ReactElement | null {
  if (view.memoPath === null) {
    return null;
  }
  return (
    <section className={styles.card} aria-label="Память">
      <header className={styles.head}>
        <h2 className={styles.title}>Память</h2>
        <span className={styles.meta}>/memories · файлов на старте: {view.memoryFiles.length}</span>
      </header>
      <h3 className={styles.subtitle}>{view.memoPath} на начало сессии — в system prompt</h3>
      {view.memoAtStart === null ? (
        <p className={styles.muted}>Пусто: агент начал без заметок.</p>
      ) : (
        <pre className={styles.memo}>{view.memoAtStart}</pre>
      )}
      <h3 className={styles.subtitle}>Правки за сессию</h3>
      {view.changes.length === 0 ? (
        <p className={styles.muted}>Агент память не менял.</p>
      ) : (
        <ol className={styles.timeline}>
          {view.changes.map((change) => (
            <li
              key={change.index}
              data-future={change.index >= shown ? 'true' : undefined}
              data-focused={focused !== null && change.toolCallId === focused}
            >
              <button
                type="button"
                className={styles.timelineRow}
                onClick={() => {
                  onSeek(change);
                }}
              >
                <span className={styles.place}>{change.place}</span>
                <span className={styles.badge}>{change.command}</span>
                <span className={styles.mono}>
                  {change.path}
                  {change.newPath !== null && ` → ${change.newPath}`}
                </span>
                {change.detail !== '' && <span className={styles.detail}>{change.detail}</span>}
              </button>
              {change.index < shown && <CallLink moment={change} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
