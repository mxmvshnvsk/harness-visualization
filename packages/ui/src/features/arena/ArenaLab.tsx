// Лаборатория «Код-арена» (этап 10) — по мокапу, одобренному автором: здесь выбирают задачу
// и режим, а прогон — обычная живая сессия с вкладкой «Код» и приёмкой в «Диалоге».
// Свободный режим (код с нуля) — шаг 10.4.

import type {
  ArenaRunRequest,
  ArenaTaskSummary,
  ArenaTasksResponse,
} from '@harness-visualization/server';
import { useState, type ReactElement } from 'react';
import { getArenaTasks, startArenaRun } from '../../api/serverApi';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { ThemeToggle } from '../../components/ThemeToggle';
import { TogglePill } from '../../components/TogglePill';
import { HelpButton } from '../../help/HelpLinks';
import { MarkdownView } from '../../help/MarkdownView';
import labStyles from '../rag/RagLab.module.css';
import { useLoaded } from '../rag/useRagData';
import styles from './Arena.module.css';

type Mode = 'kedr' | 'free';
type Effort = ArenaTasksResponse['defaults']['reasoningEffort'];

const MODES = [
  { value: 'kedr', label: 'Кедр Софт' },
  { value: 'free', label: 'Свободный' },
] as const;

const TESTS = [
  { value: 'tests', label: 'с run_tests' },
  { value: 'blind', label: 'вслепую' },
] as const;

const EFFORTS = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
] as const;

interface ArenaLabProps {
  backLabel: string;
  onBack: () => void;
  onStarted: (sessionId: string) => void;
}

export function ArenaLab({ backLabel, onBack, onStarted }: ArenaLabProps): ReactElement {
  const [mode, setMode] = useState<Mode>('kedr');
  const tasks = useLoaded(getArenaTasks, []);
  return (
    <div className={labStyles.screen}>
      <header className={labStyles.top}>
        <Button variant="quiet" onClick={onBack}>
          {backLabel}
        </Button>
        <ThemeToggle />
      </header>
      <div>
        <h1 className={labStyles.title}>Код-арена</h1>
        <p className={labStyles.lead}>
          Агент правит маленький проект и сам запускает тесты, а харнесс принимает работу тестами,
          которых агент не видел. Главный вопрос: когда агент говорит «готово» — это правда? Прогон
          откроется обычной сессией: поток, инспектор, вкладка «Код» и приёмка в «Диалоге».{' '}
          <HelpButton topic="code-arena" />
        </p>
      </div>
      <div className={labStyles.tabs}>
        <Segmented label="Режим" options={MODES} value={mode} onChange={setMode} />
      </div>
      {mode === 'free' ? (
        <div className={labStyles.card}>
          <p className={styles.muted}>
            Свободный режим — простая песочница: новый проект с нуля, задача словами, принимаете вы.
            Появится на шаге 10.4.
          </p>
        </div>
      ) : (
        <TasksPanel tasks={tasks} onStarted={onStarted} />
      )}
    </div>
  );
}

function TasksPanel(props: {
  tasks: ReturnType<typeof useLoaded<ArenaTasksResponse>>;
  onStarted: (sessionId: string) => void;
}): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (props.tasks.status !== 'ready') {
    return (
      <div className={labStyles.card}>
        <p className={props.tasks.status === 'error' ? styles.error : styles.muted}>
          {props.tasks.status === 'loading' ? 'Загружаем задачи…' : props.tasks.message}
        </p>
      </div>
    );
  }
  const { tasks } = props.tasks.value;
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;
  return (
    <div className={styles.layout}>
      <ul className={styles.tasks}>
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={styles.task}
              aria-current={selected?.id === task.id}
              onClick={() => {
                setSelectedId(task.id);
              }}
            >
              <span className={styles.taskHead}>
                <span className={styles.kind}>{task.kind}</span>
                <b>{task.title}</b>
              </span>
              <span className={styles.muted}>{task.summary}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected !== null && (
        <TaskCard
          key={selected.id}
          task={selected}
          response={props.tasks.value}
          onStarted={props.onStarted}
        />
      )}
    </div>
  );
}

function TaskCard(props: {
  task: ArenaTaskSummary;
  response: ArenaTasksResponse;
  onStarted: (sessionId: string) => void;
}): ReactElement {
  const { task, response } = props;
  return (
    <section className={labStyles.card}>
      <p className={styles.muted}>
        <span className={styles.mono}>{task.id}</span> · видимых тестов {task.visibleTests} · 🔒
        скрытых {task.hiddenTests} — откроются после приёмки
      </p>
      <div className={styles.taskText}>
        <MarkdownView text={task.text} />
      </div>
      <p className={styles.lesson}>{task.lesson}</p>
      <LaunchForm task={task} response={response} onStarted={props.onStarted} />
    </section>
  );
}

function LaunchForm(props: {
  task: ArenaTaskSummary;
  response: ArenaTasksResponse;
  onStarted: (sessionId: string) => void;
}): ReactElement {
  const { defaults, nodeVersion, network } = props.response;
  const [tests, setTests] = useState<'tests' | 'blind'>('tests');
  const [effort, setEffort] = useState<Effort>(defaults.reasoningEffort);
  const [squeezed, setSqueezed] = useState(false);
  const { state, launch } = useLaunch(props.onStarted, {
    taskId: props.task.id,
    runTests: tests === 'tests',
    reasoningEffort: effort,
    contextPreset: squeezed ? 'demo' : null,
    maxIterations: squeezed ? 10 : null,
  });
  return (
    <div className={styles.options}>
      <div className={styles.option}>
        <span className={styles.optionLabel}>Тесты</span>
        <Segmented label="Тесты" size="small" options={TESTS} value={tests} onChange={setTests} />
      </div>
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
      <div className={styles.option}>
        <span className={styles.optionLabel}>Харнесс</span>
        <TogglePill
          label="зажат: контекст demo, 10 шагов"
          hint={`По умолчанию у арены контекст ${defaults.contextPreset} и до ${String(defaults.maxIterations)} шагов. Зажатый харнесс — как в первых прогонах 26.10.2026: агент терял вывод тестов и не успевал доделать работу.`}
          pressed={squeezed}
          onChange={setSqueezed}
        />
      </div>
      <SandboxNote nodeVersion={nodeVersion} network={network} />
      <div className={styles.launch}>
        <Button
          variant="accent"
          disabled={state.busy}
          onClick={() => {
            void launch();
          }}
        >
          {state.busy ? 'Запускаем…' : 'Запустить'}
        </Button>
        {state.error !== null && <p className={styles.error}>{state.error}</p>}
      </div>
    </div>
  );
}

function SandboxNote(props: { nodeVersion: string; network: 'closed' | 'open' }): ReactElement {
  return (
    <p className={styles.muted}>
      Тесты пойдут в Node {props.nodeVersion} с --permission: файлы — только в копии проекта, ключей
      в окружении нет; сеть{' '}
      {props.network === 'closed' ? 'закрыта' : 'открыта — её закрывает только Node 25'}.
    </p>
  );
}

function useLaunch(
  onStarted: (sessionId: string) => void,
  request: ArenaRunRequest,
): { state: { busy: boolean; error: string | null }; launch: () => Promise<void> } {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const launch = async (): Promise<void> => {
    setState({ busy: true, error: null });
    try {
      const started = await startArenaRun(request);
      onStarted(started.sessionId);
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return { state, launch };
}
