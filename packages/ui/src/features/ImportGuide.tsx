// Окно «Открыть запись другого агента»: где лежит запись Claude Code или OpenCode и что из неё
// будет видно — до выбора файла. По фидбэку экспертов (29.10.2026): было непонятно, как выгрузить
// трейс из соседних инструментов. Встроенный <dialog>: фокус внутри и Esc — от браузера.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import styles from './ImportGuide.module.css';

type Source = 'claude' | 'opencode';

const SOURCES = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
] as const;

interface ImportGuideProps {
  open: boolean;
  onClose: () => void;
  onChooseFile: () => void;
}

export function ImportGuide({ open, onClose, onChooseFile }: ImportGuideProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Source>('claude');
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="import-title">
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 id="import-title" className={styles.title}>
            Открыть запись другого агента
          </h2>
          <Segmented label="Чья запись" options={SOURCES} value={source} onChange={setSource} />
        </div>
        {source === 'claude' ? <ClaudeSteps /> : <OpenCodeSteps />}
        <p className={styles.note}>
          Файл переводится в наш формат и сохраняется в <code>traces/</code>, ключи и домашняя папка
          маскируются. Видно: вопросы, ответы с рассуждениями, тулы, токены и кэш, правки файлов. Не
          видно: system prompt того агента (только его размер) и решения его политики.
        </p>
      </div>
      <div className={styles.footer}>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="accent" onClick={onChooseFile}>
          Выбрать файл…
        </Button>
      </div>
    </dialog>
  );
}

function ClaudeSteps(): ReactElement {
  return (
    <ol className={styles.steps}>
      <li>
        <b>Найдите запись.</b> Claude Code пишет каждую сессию в файл:
        <pre className={styles.code}>~/.claude/projects/&lt;папка проекта&gt;/&lt;id&gt;.jsonl</pre>
        <span className={styles.small}>
          Папка скрытая — в окне выбора файла на macOS нажмите Cmd + Shift + .
        </span>
      </li>
      <li>
        <b>Выберите файл</b> — формат определится сам.
      </li>
      <li>
        <b>Были субагенты?</b> Появится кнопка «Добавить записи субагентов» — выберите файлы{' '}
        <code>agent-*.jsonl</code> из папки <code>&lt;id&gt;/subagents/</code>.
      </li>
    </ol>
  );
}

function OpenCodeSteps(): ReactElement {
  return (
    <ol className={styles.steps}>
      <li>
        <b>Выгрузите сессию в файл</b> в папке проекта:
        <pre className={styles.code}>
          {'opencode session list\nopencode session export <id> > session.json'}
        </pre>
        <span className={styles.small}>
          Если «command not found» — вызовите по полному пути (<code>which opencode</code>), иначе
          получится пустой файл.
        </span>
      </li>
      <li>
        <b>Выберите файл</b> <code>session.json</code> — формат определится сам.
      </li>
    </ol>
  );
}
