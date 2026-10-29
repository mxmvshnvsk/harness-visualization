// Входы в справку: кнопка «Что это?» и термин с пунктирным подчёркиванием.

import type { ReactElement, ReactNode } from 'react';
import { Button } from '../components/Button';
import { useOpenHelp } from './HelpContext';
import styles from './Help.module.css';
import type { HelpTopic } from './helpTopics';

export function HelpButton({ topic }: { topic: HelpTopic }): ReactElement {
  const openHelp = useOpenHelp();
  return (
    <span data-teaching>
      <Button
        onClick={() => {
          openHelp(topic);
        }}
      >
        Что это?
      </Button>
    </span>
  );
}

// Длинная фраза-термин переносится по строкам вместе с абзацем — кнопка так не умеет (она
// переносится целым блоком), поэтому фраза — строчный span с ролью кнопки и клавишами Enter / пробел.
export function TermPhrase({
  topic,
  children,
}: {
  topic: HelpTopic;
  children: ReactNode;
}): ReactElement {
  const openHelp = useOpenHelp();
  return (
    <span
      role="button"
      tabIndex={0}
      className={styles.term}
      title="Что это? — открыть справку"
      onClick={() => {
        openHelp(topic);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openHelp(topic);
        }
      }}
    >
      {children}
    </span>
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
