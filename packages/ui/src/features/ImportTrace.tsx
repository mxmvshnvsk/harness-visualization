// «Открыть трейс другого харнесса…» (этап 9.4): запись сессии Claude Code или экспорт OpenCode;
// формат сервер определяет по содержимому. Запись переводится в наш трейс и открывается как своя.

import { useRef, useState, type ReactElement } from 'react';
import { importTrace } from '../api/serverApi';
import { Button } from '../components/Button';
import { HelpButton } from '../help/HelpLinks';
import styles from './SourceList.module.css';

interface ImportTraceProps {
  onImported: (file: string) => void;
}

export function ImportTrace({ onImported }: ImportTraceProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string | null>(null);
  const upload = async (file: File): Promise<void> => {
    setState('Перевожу…');
    try {
      const result = await importTrace(await file.text());
      setState(null);
      onImported(result.file);
    } catch (error) {
      setState(`Не получилось: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <div className={styles.import}>
      <span className={styles.importRow}>
        <Button onClick={() => input.current?.click()}>Открыть трейс другого харнесса…</Button>
        <HelpButton topic="imported-traces" />
      </span>
      <input
        ref={input}
        type="file"
        accept=".jsonl,.json,application/x-ndjson,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) {
            void upload(file);
          }
        }}
      />
      <span className={styles.importHint}>
        {state ??
          'Claude Code: ~/.claude/projects/<проект>/<id>.jsonl (папка скрытая — в окне выбора Cmd+Shift+.). OpenCode: файл из opencode session export. Формат определится сам; ключи и домашняя папка маскируются.'}
      </span>
    </div>
  );
}
