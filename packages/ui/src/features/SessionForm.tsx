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
  type OrchestrationChoice,
  type RetrievalChoice,
} from './session/sessionChoices';
import styles from './SessionForm.module.css';
import { formatRu } from '../text/formatNumber';

// Поле вопроса: в него ставит курсор «Спросить агента самому» на стартовом экране.
export const QUESTION_FIELD_ID = 'session-question';

const RETRIEVAL: Record<RetrievalChoice, { label: string; hint: string }> = {
  tool: { label: 'ищет модель', hint: 'сама решает, искать ли и сколько раз' },
  auto: { label: 'ищет харнесс', hint: 'всегда один раз до ответа, по словам вопроса' },
  rewrite: {
    label: 'ищет харнесс, запрос пишет модель',
    hint: 'всегда один раз до ответа, по запросу, который модель составила из вопроса',
  },
};

const RETRIEVAL_ORDER: readonly RetrievalChoice[] = ['tool', 'auto', 'rewrite'];

// Режимы оркестрации (этап 6d) — кто решает порядок шагов.
const ORCHESTRATION: Record<OrchestrationChoice, { label: string; hint: string }> = {
  pipeline: {
    label: 'пайплайн',
    hint: 'шаги задаёт код: найти документы → исследователи → ответ → проверка ссылок',
  },
  superagent: {
    label: 'суперагент',
    hint: 'план, поручения и приёмку решает модель — дороже и с разбросом',
  },
  hybrid: {
    label: 'гибрид',
    hint: 'каркас «план → выполнение → проверка → ответ» задаёт код, внутри шага решает модель',
  },
};

const ORCHESTRATION_ORDER: readonly OrchestrationChoice[] = ['pipeline', 'superagent', 'hybrid'];

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
        id={QUESTION_FIELD_ID}
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
          hint={subagentsHint(choices)}
          pressed={choices.subagents && !choices.orchestration}
          disabled={!choices.demoProject || choices.orchestration}
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
      {hasSubagents && (
        <TogglePill
          label="Оркестрация"
          hint={
            choices.demoProject
              ? 'Поручения будут точно: работу делят исполнители-субагенты, а кто решает порядок шагов — код, модель или оба — выбирается рядом с поиском.'
              : 'Без демо-проекта оркестрации нет: исполнителям нечего читать.'
          }
          pressed={choices.orchestration && choices.demoProject}
          disabled={!choices.demoProject}
          onChange={(orchestration) => {
            change({ orchestration });
          }}
        />
      )}
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
      {choices.orchestration && choices.demoProject ? (
        <OrchestrationMenu state={state} />
      ) : (
        <SearchMenu state={state} />
      )}
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

// В оркестрации вместо выбора поиска — выбор режима: искать будут исполнители или код.
function OrchestrationMenu({ state }: { state: ChoicesState }): ReactElement {
  const { choices, change } = state;
  return (
    <>
      <span className={styles.key}>Режим</span>
      <Menu
        label="Режим оркестрации"
        shape="small"
        align="left"
        trigger={<>{ORCHESTRATION[choices.orchestrationMode].label} ▾</>}
        sections={[
          {
            items: ORCHESTRATION_ORDER.map((mode) => ({
              ...ORCHESTRATION[mode],
              checked: mode === choices.orchestrationMode,
              onSelect: () => {
                change({ orchestrationMode: mode });
              },
            })),
          },
        ]}
      />
    </>
  );
}

function SearchMenu({ state }: { state: ChoicesState }): ReactElement {
  const { choices, change } = state;
  return (
    <>
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
    </>
  );
}

function subagentsHint(choices: ChoicesState['choices']): string {
  if (!choices.demoProject) {
    return 'Без демо-проекта субагентов нет: им нечего исследовать.';
  }
  if (choices.orchestration) {
    return 'В оркестрации поручения даёт код или оркестратор, а не агент тулом delegate_task.';
  }
  return 'Агент сможет поручить чтение субагенту-исследователю: у того своя история, вернётся короткий отчёт. Поручать или нет, решает модель — может справиться и сама. Чтобы поручения были точно — «Оркестрация».';
}

// Цена опции до запуска: delegate_task уходит модели в каждом запросе.
function describeCost({ choices, options }: ChoicesState): string {
  if (!choices.demoProject) {
    return 'без «Кедр Софт»: своя пустая песочница, тулы файлов и веба';
  }
  if (choices.orchestration) {
    return ORCHESTRATION[choices.orchestrationMode].hint;
  }
  const tokens = options?.subagents.delegateToolTokens ?? null;
  if (choices.subagents && tokens !== null) {
    return `delegate_task добавит ≈${formatRu(tokens)} токенов в каждый запрос к модели`;
  }
  return 'по умолчанию — как в harness.config.json; выбор запоминается';
}
