import { useId, useState, type ReactElement } from 'react';
import { SelectField } from '../../components/SelectField';
import { useMode } from '../../app/mode';
import { formatRu } from '../../text/formatNumber';
import { ModelPicker } from './ModelPicker';
import { RoleModelSettings } from './RoleModelSettings';
import { activeRoleModels } from './roleModelChoices';
import {
  selectedSessionModel,
  type ChoicesState,
  type EffortChoice,
  type OrchestrationChoice,
  type RetrievalChoice,
} from './sessionChoices';
import styles from './SessionSettings.module.css';

const RETRIEVAL: Record<RetrievalChoice, { label: string; hint: string }> = {
  tool: { label: 'Ищет модель', hint: 'сама решает, искать ли и сколько раз' },
  auto: { label: 'Ищет харнесс', hint: 'всегда один раз до ответа, по словам вопроса' },
  rewrite: {
    label: 'Харнесс ищет по запросу модели',
    hint: 'всегда один раз до ответа, по запросу, который модель составила из вопроса',
  },
};

const RETRIEVAL_ORDER: readonly RetrievalChoice[] = ['tool', 'auto', 'rewrite'];

// Режимы оркестрации (этап 6d) — кто решает порядок шагов.
const ORCHESTRATION: Record<OrchestrationChoice, { label: string; hint: string }> = {
  pipeline: {
    label: 'пайплайн',
    hint: 'все шаги задаёт код: найти документы → раздать их исследователям → написать ответ → проверить ссылки',
  },
  superagent: {
    label: 'суперагент',
    hint: 'план, задачи исполнителям и проверку их работы решает модель — дороже и с разбросом',
  },
  hybrid: {
    label: 'гибрид',
    hint: 'порядок «план → выполнение → проверка → ответ» задаёт код, а что делать на каждом шаге — модель',
  },
};

const ORCHESTRATION_ORDER: readonly OrchestrationChoice[] = ['pipeline', 'superagent', 'hybrid'];

const EFFORTS: readonly { value: EffortChoice; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
];

// Каждая новая форма начинает с раскрытых настроек в обоих режимах.
// Старый сохранённый флаг сворачивания больше не скрывает настройки от пользователя.
export function SessionSettings({ state }: { state: ChoicesState }): ReactElement {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <>
      <section className={styles.settings} aria-labelledby={`${id}-heading`}>
        <div className={styles.heading}>
          <h3 id={`${id}-heading`}>Настройки харнесса</h3>
          <button
            type="button"
            className={styles.collapse}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Свернуть' : 'Развернуть'}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div id={id} hidden={!open} className={styles.body}>
          <SessionFlags state={state} />
          <RetrievalSettings state={state} />
          <RoleModelSettings state={state} />
        </div>
      </section>
      <div className={`${styles.fields} ${styles.sessionFields}`}>
        <ModelPicker state={state} />
        <EffortSelector state={state} />
      </div>
    </>
  );
}

function EffortSelector({ state }: { state: ChoicesState }): ReactElement {
  const sessionModel = selectedSessionModel(state);
  const orchestrator = activeRoleModels(state).find((role) => role.orchestrator);
  const model =
    sessionModel?.reasoningEfforts.length === 0
      ? (orchestrator?.model ?? sessionModel)
      : sessionModel;
  const efforts =
    model === undefined
      ? EFFORTS
      : EFFORTS.filter((option) => model.reasoningEfforts.includes(option.value));
  return (
    <SelectField
      label="Reasoning effort"
      width={180}
      value={state.choices.reasoningEffort}
      disabled={efforts.length === 0}
      options={
        efforts.length === 0
          ? [{ value: state.choices.reasoningEffort, label: 'Не передаётся' }]
          : efforts
      }
      onChange={(reasoningEffort) => state.change({ reasoningEffort })}
    />
  );
}

function SessionFlags({ state }: { state: ChoicesState }): ReactElement {
  const { choices, options, change } = state;
  const hasSubagents = options === null || options.subagents.agents.length > 0;
  const orchestrated = choices.demoProject && choices.orchestration;
  return (
    <div className={styles.flags}>
      <SessionCheckbox
        label="Демо-проект «Кедр Софт»"
        checked={choices.demoProject}
        hint="Документы компании, MCP, скиллы и память. Без демо-проекта — своя пустая песочница, файловые тулы и веб."
        onChange={(demoProject) => change({ demoProject })}
      />
      {hasSubagents && (
        <SessionCheckbox
          label="Субагенты"
          checked={choices.demoProject && (choices.subagents || orchestrated)}
          disabled={!choices.demoProject || orchestrated}
          hint={subagentsHint(choices)}
          onChange={(subagents) => change({ subagents })}
        />
      )}
      {hasSubagents && (
        <SessionCheckbox
          label="Оркестрация"
          checked={orchestrated}
          disabled={!choices.demoProject}
          hint="Субагенты задействованы обязательно; порядок шагов задаёт выбранный режим."
          onChange={(orchestration) => change({ orchestration })}
        />
      )}
      <SessionCheckbox
        label="Clean Workspace"
        checked={choices.cleanWorkspace}
        hint="Пересоздать workspace из примеров — заметки и память прошлых сессий пропадут."
        onChange={(cleanWorkspace) => change({ cleanWorkspace })}
      />
    </div>
  );
}

function SessionCheckbox(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint: string;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <label className={styles.checkbox} title={props.hint}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

const SEARCH_IN_ORCHESTRATION: Record<OrchestrationChoice, string> = {
  pipeline: 'В пайплайне документы ищет код — один раз, до исполнителей.',
  superagent: 'У суперагента исполнители ищут сами, своими тулами.',
  hybrid: 'В гибриде исполнители ищут сами внутри шага «выполнение».',
};

function RetrievalSettings({ state }: { state: ChoicesState }): ReactElement {
  const { choices, change } = state;
  const mode = useMode();
  const orchestrated = choices.demoProject && choices.orchestration;
  let searchOptions = RETRIEVAL_ORDER.map((value) => ({ value, label: RETRIEVAL[value].label }));
  if (!choices.demoProject) {
    searchOptions = [{ value: choices.retrievalMode, label: 'Без базы знаний' }];
  } else if (orchestrated) {
    searchOptions = [{ value: choices.retrievalMode, label: 'Задаёт режим оркестрации' }];
  }
  return (
    <>
      <div className={styles.fields}>
        <SelectField
          label="Поиск в базе знаний"
          value={choices.retrievalMode}
          disabled={!choices.demoProject || orchestrated}
          options={searchOptions}
          hint={RETRIEVAL[choices.retrievalMode].hint}
          onChange={(retrievalMode) => change({ retrievalMode })}
        />
        {orchestrated && (
          <SelectField
            label="Режим оркестрации"
            width={260}
            value={choices.orchestrationMode}
            options={ORCHESTRATION_ORDER.map((value) => ({
              value,
              label: ORCHESTRATION[value].label,
            }))}
            hint={ORCHESTRATION[choices.orchestrationMode].hint}
            onChange={(orchestrationMode) => change({ orchestrationMode })}
          />
        )}
      </div>
      {orchestrated && (
        <p className={styles.note}>{SEARCH_IN_ORCHESTRATION[choices.orchestrationMode]}</p>
      )}
      {!orchestrated && mode === 'learn' && (
        <p className={styles.note}>
          {choices.demoProject
            ? 'Агент отвечает по документам вымышленной компании «Кедр Софт».'
            : 'Своя пустая песочница, файловые тулы и веб — без базы знаний «Кедр Софт».'}
        </p>
      )}
    </>
  );
}

function subagentsHint(choices: ChoicesState['choices']): string {
  if (!choices.demoProject) {
    return 'Без демо-проекта субагентов нет: им нечего исследовать.';
  }
  if (choices.orchestration) {
    return 'В оркестрации задачи субагентам раздаёт код или модель-оркестратор, а не сам агент тулом delegate_task.';
  }
  return 'Агент сможет отдать чтение документов субагенту: тот прочитает их в своём отдельном контексте и вернёт короткий отчёт. Отдавать или нет, решает модель — может и всё прочитать сама. Чтобы субагенты были задействованы обязательно, а не на усмотрение модели, — «Оркестрация».';
}

// Цена опции до запуска: delegate_task уходит модели в каждом запросе.
export function describeCost({ choices, options }: ChoicesState): string {
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
