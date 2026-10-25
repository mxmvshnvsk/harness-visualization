// Запуск новой сессии — по мокапу, одобренному автором: вопрос, что включить (галочками), кто ищет
// в базе знаний, effort. Значения — из harness.config.json, последний выбор запоминается в браузере.

import { useState, type FormEvent, type ReactElement } from 'react';
import { startSession } from '../api/serverApi';
import { Button } from '../components/Button';
import { Menu } from '../components/Menu';
import { Segmented } from '../components/Segmented';
import { TogglePill } from '../components/TogglePill';
import {
  toStartRequest,
  useSessionChoices,
  type ChoicesState,
  type EffortChoice,
  type RetrievalChoice,
} from './session/sessionChoices';
import styles from './SessionForm.module.css';

const RETRIEVAL: Record<RetrievalChoice, { label: string; hint: string }> = {
  tool: { label: 'ищет модель', hint: 'сама решает, искать ли и сколько раз' },
  auto: { label: 'ищет харнесс', hint: 'всегда один раз до ответа, по словам вопроса' },
  rewrite: {
    label: 'ищет харнесс, запрос пишет модель',
    hint: 'всегда один раз до ответа, по запросу, который модель составила из вопроса',
  },
};

const RETRIEVAL_ORDER: readonly RetrievalChoice[] = ['tool', 'auto', 'rewrite'];

const EFFORTS: readonly { value: EffortChoice; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
];

interface SessionFormProps {
  onStarted: (sessionId: string) => void;
}

export function SessionForm({ onStarted }: SessionFormProps): ReactElement {
  const [question, setQuestion] = useState('');
  const state = useSessionChoices();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setStarting(true);
    startSession(toStartRequest(question, state.choices))
      .then((response) => {
        setError(null);
        state.change({ cleanWorkspace: false });
        onStarted(response.sessionId);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setStarting(false);
      });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <textarea
        className={styles.question}
        aria-label="Вопрос агенту"
        value={question}
        required
        placeholder="Вопрос агенту — например: удалёнка"
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
      />
      <Toggles state={state} />
      <Choices state={state} />
      {error !== null && <div className={styles.error}>Сессия не запущена: {error}</div>}
      <div className={styles.foot}>
        <span className={styles.cost}>{describeCost(state)}</span>
        <Button type="submit" variant="accent" disabled={starting}>
          {starting ? 'Запускаю…' : 'Запустить'}
        </Button>
      </div>
    </form>
  );
}

function Toggles({ state }: { state: ChoicesState }): ReactElement {
  const { choices, options, change } = state;
  const hasSubagents = options === null || options.subagents.agents.length > 0;
  return (
    <div className={styles.row}>
      <span className={styles.key}>Включить</span>
      <TogglePill
        label="Без демо-проекта"
        hint="Агент без «Кедр Софт»: ни базы знаний, ни MCP, ни скиллов, ни памяти, ни слова о компании в system prompt. Своя пустая песочница, тулы файлов и веба — видно, как модель ведёт себя сама."
        pressed={!choices.demoProject}
        onChange={(pressed) => {
          change({ demoProject: !pressed });
        }}
      />
      {hasSubagents && (
        <TogglePill
          label="Субагенты"
          hint={
            choices.demoProject
              ? 'Агент сможет поручить чтение субагенту-исследователю: у того своя история, вернётся короткий отчёт.'
              : 'Без демо-проекта субагентов нет: им нечего исследовать.'
          }
          pressed={choices.subagents}
          disabled={!choices.demoProject}
          onChange={(subagents) => {
            change({ subagents });
          }}
        />
      )}
      <TogglePill
        label="Clean Workspace"
        hint="Пересоздать workspace из примеров — заметки и память прошлых сессий пропадут."
        pressed={choices.cleanWorkspace}
        onChange={(cleanWorkspace) => {
          change({ cleanWorkspace });
        }}
      />
      <TogglePill
        label="Оркестрация"
        hint="Пайплайн, суперагент или гибрид на одной задаче — появится на этапе 6d."
        pressed={false}
        soon="6d"
      />
      <TogglePill
        label="Injection"
        hint="Атака в документах: кто защитит — промпт или харнесс. Этап 4b."
        pressed={false}
        soon="4b"
      />
    </div>
  );
}

function Choices({ state }: { state: ChoicesState }): ReactElement {
  const { choices, change } = state;
  return (
    <div className={styles.row}>
      <span className={styles.key}>Поиск</span>
      <Menu
        label="Кто ищет в базе знаний"
        shape="small"
        align="left"
        disabled={!choices.demoProject}
        trigger={
          choices.demoProject ? (
            <>в базе знаний {RETRIEVAL[choices.retrievalMode].label} ▾</>
          ) : (
            <>без базы знаний</>
          )
        }
        sections={[
          {
            items: RETRIEVAL_ORDER.map((mode) => ({
              ...RETRIEVAL[mode],
              checked: mode === choices.retrievalMode,
              onSelect: () => {
                change({ retrievalMode: mode });
              },
            })),
          },
        ]}
      />
      <span className={styles.key}>Effort</span>
      <Segmented
        label="Reasoning effort"
        size="small"
        options={EFFORTS}
        value={choices.reasoningEffort}
        onChange={(reasoningEffort) => {
          change({ reasoningEffort });
        }}
      />
    </div>
  );
}

// Цена опции до запуска: delegate_task уходит модели в каждом запросе.
function describeCost({ choices, options }: ChoicesState): string {
  if (!choices.demoProject) {
    return 'без «Кедр Софт»: своя пустая песочница, тулы файлов и веба';
  }
  const tokens = options?.subagents.delegateToolTokens ?? null;
  if (choices.subagents && tokens !== null) {
    return `delegate_task добавит ≈${tokens.toLocaleString('ru-RU')} токенов в каждый запрос к модели`;
  }
  return 'по умолчанию — как в harness.config.json; выбор запоминается';
}
