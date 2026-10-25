// Окно справки — встроенный <dialog>: браузер сам держит фокус внутри и закрывает по Esc.

import { useEffect, useRef, type ReactElement } from 'react';
import { Button } from '../components/Button';
import styles from './Help.module.css';
import { helpText, type HelpTopic } from './helpTopics';
import { MarkdownView } from './MarkdownView';

interface HelpDialogProps {
  topic: HelpTopic | null;
  onClose: () => void;
}

export function HelpDialog({ topic, onClose }: HelpDialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (topic !== null && !dialog.open) {
      dialog.showModal();
    }
    if (topic === null && dialog.open) {
      dialog.close();
    }
  }, [topic]);
  const text = topic === null ? null : helpText(topic);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-label="Справка">
      <div className={styles.dialogBody}>
        {text === null ? <p>Справки по этой теме пока нет.</p> : <MarkdownView text={text} />}
      </div>
      <div className={styles.dialogFooter}>
        <Button variant="ink" onClick={onClose}>
          Понятно
        </Button>
      </div>
    </dialog>
  );
}
