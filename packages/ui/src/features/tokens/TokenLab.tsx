// Лаборатория «Выбор токена» (этап 11) — по мокапу, одобренному автором 26.10.2026: ответ
// по токенам с альтернативами, температура на настоящих ответах и пересчёт в браузере.
// Прогон — три запроса к модели (T = 1, 0 и 1.5) с logprobs; он же обычный трейс.

import type { TokenLabResponse, TokenLabRunResponse } from '@harness-visualization/server';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { getTokenLab, getTokenLabRun, startTokenFork, startTokenLabRun } from '../../api/serverApi';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { ThemeToggle } from '../../components/ThemeToggle';
import { HelpButton } from '../../help/HelpLinks';
import { projectTokenLab, type TokenLabView } from '../../projections/projectTokenLab';
import labStyles from '../rag/RagLab.module.css';
import { useLoaded } from '../rag/useRagData';
import { AnswerCard, ReasoningCard, type ForkHandler } from './AnswerCard';
import { ForkCard, type ForkState } from './ForkCard';
import { TemperatureCard } from './TemperatureCard';
import styles from './TokenLab.module.css';

// Готовые вопросы: факт (уверенность высокая), придумать (развилок много), счёт.
const PRESETS = [
  'Сколько календарных дней ежегодного оплачиваемого отпуска положено по Трудовому кодексу РФ?',
  'Придумай название для внутреннего портала IT-компании. Ответь одним словом.',
  'Сколько будет 17 × 23? Ответь только числом.',
  'Продолжи одним предложением: «Жили-были в одной IT-компании…»',
];

const EFFORTS = [
  { value: 'off', label: 'без рассуждений' },
  { value: 'high', label: 'с рассуждениями' },
] as const;

interface TokenLabProps {
  backLabel: string;
  onBack: () => void;
  onOpenTrace: (file: string) => void;
}

export function TokenLab({ backLabel, onBack, onOpenTrace }: TokenLabProps): ReactElement {
  const [reload, setReload] = useState(0);
  const list = useLoaded(getTokenLab, [reload]);
  const [file, setFile] = useState<string | null>(null);
  const opened = file ?? (list.status === 'ready' ? (list.value.runs[0]?.file ?? null) : null);
  return (
    <div className={labStyles.screen}>
      <header className={labStyles.top}>
        <Button variant="quiet" onClick={onBack}>
          {backLabel}
        </Button>
        <ThemeToggle />
      </header>
      <div>
        <h1 className={labStyles.title}>Как модель выбирает токен</h1>
        <p className={labStyles.lead} data-teaching>
          Модель не пишет ответ целиком. На каждом шаге она считает вероятность каждого возможного
          следующего кусочка текста — токена — и выбирает один. Здесь видно, где модель была
          уверена, где колебалась и как выбор меняет температура. <HelpButton topic="token-lab" />
        </p>
      </div>
      <AskForm
        onDone={(next) => {
          setFile(next);
          setReload((value) => value + 1);
        }}
      />
      <RunsList list={list} opened={opened} onOpen={setFile} />
      {opened !== null && <RunPanel key={opened} file={opened} onOpenTrace={onOpenTrace} />}
    </div>
  );
}

function AskForm({ onDone }: { onDone: (file: string) => void }): ReactElement {
  const [question, setQuestion] = useState(PRESETS[0] ?? '');
  const [effort, setEffort] = useState<'off' | 'high'>('off');
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const ask = async (): Promise<void> => {
    setState({ busy: true, error: null });
    try {
      const result = await startTokenLabRun({ question, reasoningEffort: effort });
      setState({ busy: false, error: null });
      onDone(result.file);
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <section className={labStyles.card}>
      <PresetChips value={question} onPick={setQuestion} />
      <textarea
        className={styles.question}
        aria-label="Вопрос модели"
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
      />
      <div className={styles.row}>
        <Segmented
          label="Режим"
          size="small"
          options={EFFORTS}
          value={effort}
          onChange={setEffort}
        />
        <Button
          variant="accent"
          disabled={state.busy || question.trim() === ''}
          onClick={() => void ask()}
        >
          {state.busy ? 'Спрашиваем три раза…' : 'Спросить'}
        </Button>
      </div>
      <p className={styles.muted}>
        Три запроса к модели с вероятностями токенов (top 20): при temperature 1, 0 и 1.5. Без тулов
        и базы знаний — только вопрос. Прогон сохранится трейсом.
      </p>
      {state.error !== null && <p className={styles.error}>{state.error}</p>}
    </section>
  );
}

function PresetChips(props: { value: string; onPick: (question: string) => void }): ReactElement {
  return (
    <div className={styles.presets}>
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          className={styles.preset}
          aria-pressed={props.value === preset}
          onClick={() => props.onPick(preset)}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

function RunsList(props: {
  list: ReturnType<typeof useLoaded<TokenLabResponse>>;
  opened: string | null;
  onOpen: (file: string) => void;
}): ReactElement | null {
  if (props.list.status !== 'ready' || props.list.value.runs.length === 0) {
    return null;
  }
  return (
    <div className={styles.runs}>
      {props.list.value.runs.slice(0, 12).map((run) => (
        <button
          key={run.file}
          type="button"
          className={styles.run}
          aria-current={props.opened === run.file}
          onClick={() => {
            props.onOpen(run.file);
          }}
        >
          {run.example ? 'пример · ' : ''}
          {run.title ?? run.file}
          {run.startedAt === null ? '' : ` · ${run.startedAt.slice(11, 16)}`}
        </button>
      ))}
    </div>
  );
}

function RunPanel(props: { file: string; onOpenTrace: (file: string) => void }): ReactElement {
  const run = useLoaded<TokenLabRunResponse>(() => getTokenLabRun(props.file), [props.file]);
  const view = useMemo(
    () => (run.status === 'ready' ? projectTokenLab(run.value.events) : null),
    [run],
  );
  if (run.status === 'error') {
    return <p className={styles.error}>{run.message}</p>;
  }
  if (view === null) {
    return <p className={styles.muted}>Загружаем прогон…</p>;
  }
  return <RunBody view={view} file={props.file} onOpenTrace={props.onOpenTrace} />;
}

function RunBody(props: {
  view: TokenLabView;
  file: string;
  onOpenTrace: (file: string) => void;
}): ReactElement {
  const { view } = props;
  const base = view.answers.find((answer) => answer.temperature === 1) ?? view.answers[0];
  const forks = useForks(props.file);
  return (
    <>
      {view.error !== null && <p className={styles.error}>{view.error}</p>}
      {base !== undefined && <AnswerCard view={view} answer={base} onFork={forks.start} />}
      {base !== undefined &&
        forks.items.map((fork) => <ForkCard key={fork.key} fork={fork} original={base} />)}
      {base !== undefined && base.reasoningTokens.length > 0 && <ReasoningCard answer={base} />}
      {view.answers.length > 1 && <TemperatureCard view={view} />}
      <p className={styles.muted}>
        Трейс прогона:{' '}
        <button type="button" className={styles.link} onClick={() => props.onOpenTrace(props.file)}>
          {props.file}
        </button>{' '}
        — запросы с logprobs видны в «Сырых событиях».
      </p>
    </>
  );
}

// Развилки прогона: каждая — свой запрос и свой трейс; новые — сверху.
function useForks(file: string): { items: ForkState[]; start: ForkHandler } {
  const [items, setItems] = useState<ForkState[]>([]);
  const start = useCallback(
    (position: number, token: string) => {
      const key = `${String(position)}:${token}:${String(Date.now())}`;
      const update = (patch: Partial<ForkState>): void => {
        setItems((current) =>
          current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
      };
      setItems((current) => [
        { key, position, token, status: 'running', run: null, error: null },
        ...current,
      ]);
      startTokenFork({ file, position, token }).then(
        (run) => update({ status: 'ready', run }),
        (error: unknown) =>
          update({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    },
    [file],
  );
  return { items, start };
}
