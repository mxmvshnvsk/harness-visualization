// Экран «Лаборатории»: у каждой — вопрос, на который она отвечает, что поймёте, сколько времени
// и нужен ли ключ модели. По фидбэку экспертов (29.10.2026): было неочевидно, как попасть
// в лаборатории и зачем они нужны.

import type { ReactElement } from 'react';
import { Button } from '../../components/Button';
import { ThemeToggle } from '../../components/ThemeToggle';
import { labEntries } from '../labEntries';
import { useMode } from '../mode';
import type { LabName } from '../useSelection';
import styles from './Start.module.css';

interface LabsScreenProps {
  onBack: () => void;
  onOpenLab: (lab: LabName) => void;
}

export function LabsScreen({ onBack, onOpenLab }: LabsScreenProps): ReactElement {
  const mode = useMode();
  return (
    <div className={styles.labsScreen}>
      <header className={styles.labsTop}>
        <Button variant="quiet" onClick={onBack}>
          ← на старт
        </Button>
        <ThemeToggle />
      </header>
      <div className={styles.introText}>
        <h1 className={styles.labsTitle}>Лаборатории</h1>
        <p className={styles.muted}>
          Каждая отвечает на один вопрос об агентах — по шагам, на настоящих данных. Проходить можно
          в любом порядке; из записанной сессии сюда ведут ссылки «подробнее в лаборатории».
        </p>
      </div>
      <div className={styles.labGrid}>
        {labEntries(mode).map((entry) => (
          <article key={entry.lab} className={styles.labCard}>
            <span className={styles.label}>{entry.title}</span>
            <h2 className={styles.labQuestion}>{entry.question}</h2>
            <dl className={styles.labFacts}>
              <dt>Поймёте</dt>
              <dd>{entry.learn}</dd>
              <dt>Время</dt>
              <dd>около {entry.minutes} минут</dd>
              <dt>Ключ модели</dt>
              <dd>{entry.key}</dd>
            </dl>
            <Button
              className={styles.entryAction}
              variant="ink"
              onClick={() => {
                onOpenLab(entry.lab);
              }}
            >
              Открыть
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
