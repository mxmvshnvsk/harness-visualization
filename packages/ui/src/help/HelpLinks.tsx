// Входы в справку: кнопка «Что это?» и термин с пунктирным подчёркиванием.

import type { ReactElement, ReactNode } from 'react';
import { Button } from '../components/Button';
import { useOpenHelp } from './HelpContext';
import styles from './Help.module.css';
import type { HelpTopic } from './helpTopics';

export function HelpButton({ topic }: { topic: HelpTopic }): ReactElement {
  const openHelp = useOpenHelp();
  return (
    <Button
      onClick={() => {
        openHelp(topic);
      }}
    >
      Что это?
    </Button>
  );
}

export function Term({ topic, children }: { topic: HelpTopic; children: ReactNode }): ReactElement {
  const openHelp = useOpenHelp();
  return (
    <button
      type="button"
      className={styles.term}
      title="Что это? — открыть справку"
      onClick={() => {
        openHelp(topic);
      }}
    >
      {children}
    </button>
  );
}
