// Свободный режим Код-арены (этап 10.4) — простая песочница: проект с нуля, продолжение
// прошлого или копия своей папки; задача словами, дальше — диалог. Принимаете вы.

import type { FreeProject } from '@harness-visualization/harness';
import type { FreeRunRequest } from '@harness-visualization/server';
import { useState, type ReactElement } from 'react';
import { getFreeProjects, startFreeRun } from '../../api/serverApi';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import labStyles from '../rag/RagLab.module.css';
import { useLoaded } from '../rag/useRagData';
import styles from './Arena.module.css';

type Source = FreeRunRequest['source'];
type Effort = FreeRunRequest['reasoningEffort'];

const EFFORTS = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
] as const;

interface Choice {
  source: Source;
  // Имя проекта для continue; для new и copy — вводят в форме.
  project: string | null;
}

export function FreePanel({ onStarted }: { onStarted: (sessionId: string) => void }): ReactElement {
  const projects = useLoaded(getFreeProjects, []);
  const [choice, setChoice] = useState<Choice>({ source: 'new', project: null });
  const list = projects.status === 'ready' ? projects.value.projects : [];
  return (
    <div className={styles.layout}>
      <ul className={styles.tasks}>
        <SourceItem
          title="Новый проект"
          text="Пустая папка, Node без зависимостей"
          current={choice.source === 'new'}
          onSelect={() => {
            setChoice({ source: 'new', project: null });
          }}
        />
        <SourceItem
          title="Начать с копии папки…"
          text="Копия как есть, с node_modules — зависимости поставьте заранее"
          current={choice.source === 'copy'}
          onSelect={() => {
            setChoice({ source: 'copy', project: null });
          }}
        />
        {list.map((project) => (
          <SourceItem
            key={project.name}
            title={project.name}
            text={describeProject(project)}
            current={choice.source === 'continue' && choice.project === project.name}
            onSelect={() => {
              setChoice({ source: 'continue', project: project.name });
            }}
          />
        ))}
      </ul>
      <section className={labStyles.card}>
        <FreeForm
          key={`${choice.source}-${choice.project ?? ''}`}
          choice={choice}
          onStarted={onStarted}
        />
        {projects.status === 'ready' && (
          <p className={styles.muted}>
            Проекты лежат в <code className={styles.mono}>{projects.value.directory}</code> и живут
            между сессиями — к ним можно вернуться.
          </p>
        )}
      </section>
    </div>
  );
}

function describeProject(project: FreeProject): string {
  const date = new Date(project.updatedAt).toLocaleString('ru-RU');
  return `файлов ${String(project.files)}${project.hasNodeModules ? ' · node_modules' : ''} · ${date}`;
}

function SourceItem(props: {
  title: string;
  text: string;
  current: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        className={styles.task}
        aria-current={props.current}
        onClick={props.onSelect}
      >
        <b>{props.title}</b>
        <span className={styles.muted}>{props.text}</span>
      </button>
    </li>
  );
}

function FreeForm({
  choice,
  onStarted,
}: {
  choice: Choice;
  onStarted: (sessionId: string) => void;
}): ReactElement {
  const [name, setName] = useState(choice.project ?? '');
  const [copyFrom, setCopyFrom] = useState('');
  const [question, setQuestion] = useState('');
  const [effort, setEffort] = useState<Effort>('high');
  const { state, launch } = useFreeLaunch(onStarted, {
    project: name.trim(),
    source: choice.source,
    copyFrom: choice.source === 'copy' ? copyFrom.trim() : null,
    question,
    reasoningEffort: effort,
  });
  return (
    <div className={styles.options}>
      {choice.source !== 'continue' && <NameField value={name} onChange={setName} />}
      {choice.source === 'copy' && <CopyField value={copyFrom} onChange={setCopyFrom} />}
      <QuestionField
        value={question}
        onChange={setQuestion}
        placeholder={
          choice.source === 'continue'
            ? 'Добавь флаг --pretty'
            : 'Сделай CLI, который переводит CSV в JSON'
        }
      />
      <div className={styles.option}>
        <span className={styles.optionLabel}>Effort</span>
        <Segmented
          label="Effort"
          size="small"
          options={EFFORTS}
          value={effort}
          onChange={setEffort}
        />
      </div>
      <FreeNote />
      <div className={styles.launch}>
        <Button
          variant="accent"
          disabled={state.busy || question.trim() === ''}
          onClick={() => void launch()}
        >
          {state.busy ? 'Запускаем…' : launchLabel(choice.source)}
        </Button>
        {state.error !== null && <p className={styles.error}>{state.error}</p>}
      </div>
    </div>
  );
}

function NameField(props: { value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.optionLabel}>Имя проекта</span>
      <input
        className={styles.input}
        value={props.value}
        placeholder="csv-tool"
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </label>
  );
}

function FreeNote(): ReactElement {
  return (
    <p className={styles.muted}>
      Агенту даны файлы, run_tests и run_node — каждый запуск программы вы подтверждаете в
      «Диалоге». Сети и npm install нет. Скрытых тестов нет: принимаете вы.
    </p>
  );
}

function QuestionField(props: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.optionLabel}>Задача</span>
      <textarea
        className={styles.input}
        rows={4}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </label>
  );
}

function CopyField(props: { value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.optionLabel}>Папка</span>
      <input
        className={styles.input}
        value={props.value}
        placeholder="/Users/вы/projects/my-app"
        onChange={(event) => props.onChange(event.target.value)}
      />
      <span className={styles.muted}>
        Абсолютный путь на машине, где запущен сервер. Копируется как есть, вместе с node_modules;
        .git — нет. Зависимости ставьте до копирования: в арене npm install нет.
      </span>
    </label>
  );
}

const LAUNCH_LABELS: Record<Source, string> = {
  new: 'Создать и начать',
  continue: 'Продолжить',
  copy: 'Скопировать и начать',
};

function launchLabel(source: Source): string {
  return LAUNCH_LABELS[source];
}

function useFreeLaunch(
  onStarted: (sessionId: string) => void,
  request: FreeRunRequest,
): { state: { busy: boolean; error: string | null }; launch: () => Promise<void> } {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const launch = async (): Promise<void> => {
    setState({ busy: true, error: null });
    try {
      onStarted((await startFreeRun(request)).sessionId);
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return { state, launch };
}
