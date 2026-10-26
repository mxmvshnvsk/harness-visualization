// «Открыть трейс другого харнесса…» (этап 9.4): запись сессии Claude Code или экспорт OpenCode;
// формат сервер определяет по содержимому. Запись переводится в наш трейс и открывается как своя.
// Субагенты Claude Code 2.1 записаны в отдельных файлах (<id>/subagents/agent-*.jsonl): если
// в главной записи есть поручения без них, предлагаем добавить — главная запись переводится
// заново вместе с ними (трейс с тем же именем перезаписывается).

import { useRef, useState, type ReactElement, type Ref } from 'react';
import { importTrace } from '../api/serverApi';
import { Button } from '../components/Button';
import { HelpButton } from '../help/HelpLinks';
import styles from './SourceList.module.css';

interface ImportTraceProps {
  onImported: (file: string) => void;
}

interface Imported {
  text: string;
  subagentsWithoutRecord: number;
}

const HINT =
  'Claude Code: ~/.claude/projects/<проект>/<id>.jsonl (папка скрытая — в окне выбора Cmd+Shift+.). OpenCode: файл из opencode session export. Формат определится сам; ключи и домашняя папка маскируются.';

export function ImportTrace({ onImported }: ImportTraceProps): ReactElement {
  const mainInput = useRef<HTMLInputElement>(null);
  const subagentsInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const upload = async (text: string): Promise<void> => {
    setState('Перевожу…');
    try {
      const result = await importTrace(text);
      setState(null);
      setImported({ text, subagentsWithoutRecord: result.subagentsWithoutRecord });
      onImported(result.file);
    } catch (error) {
      setState(`Не получилось: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const missing = imported?.subagentsWithoutRecord ?? 0;
  return (
    <div className={styles.import}>
      <span className={styles.importRow}>
        <Button onClick={() => mainInput.current?.click()}>Открыть трейс другого харнесса…</Button>
        <HelpButton topic="imported-traces" />
      </span>
      <FileInput
        ref={mainInput}
        multiple={false}
        onFiles={(files) => {
          void readAll(files).then(upload);
        }}
      />
      {missing > 0 && imported !== null && (
        <span className={styles.importRow}>
          <Button onClick={() => subagentsInput.current?.click()}>
            Добавить записи субагентов ({missing})…
          </Button>
        </span>
      )}
      <FileInput
        ref={subagentsInput}
        multiple
        onFiles={(files) => {
          if (imported !== null) {
            void readAll(files).then((texts) => upload(`${imported.text}\n${texts}`));
          }
        }}
      />
      <span className={styles.importHint}>
        {state ??
          (missing > 0
            ? `Субагентов без записи: ${String(missing)}. Claude Code пишет их рядом с главной записью: папка <id сессии>/subagents/, файлы agent-*.jsonl — выберите их все.`
            : HINT)}
      </span>
    </div>
  );
}

function FileInput({
  ref,
  multiple,
  onFiles,
}: {
  ref: Ref<HTMLInputElement>;
  multiple: boolean;
  onFiles: (files: File[]) => void;
}): ReactElement {
  return (
    <input
      ref={ref}
      type="file"
      multiple={multiple}
      accept=".jsonl,.json,application/x-ndjson,application/json"
      hidden
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        if (files.length > 0) {
          onFiles(files);
        }
      }}
    />
  );
}

async function readAll(files: readonly File[]): Promise<string> {
  const texts = await Promise.all(files.map((file) => file.text()));
  return texts.join('\n');
}
