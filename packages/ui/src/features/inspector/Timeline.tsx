// Таймлайн: шаги цикла агента, а в каждом — тулы, которые попросила модель.
// Служебные запросы харнесса (переформулировка, судья) и подмешанное — отдельно от шагов.

import type { ReactElement, ReactNode } from 'react';
import type {
  AgentStep,
  ModelCall,
  SessionView,
  ToolCallView,
} from '../../projections/sessionView';
import { hasRetrieval, isFocused, type Focus } from './focus';
import styles from './Inspector.module.css';

interface TimelineProps {
  view: SessionView;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}

export function Timeline({ view, focus, onFocus }: TimelineProps): ReactElement {
  const serviceCalls = view.modelCalls.filter((call) => call.purpose !== 'agentStep');
  return (
    <nav className={styles.timeline} aria-label="Шаги сессии">
      {(serviceCalls.length > 0 || hasRetrieval(view)) && (
        <div className={styles.stepCard}>
          <div className={styles.stepCaption}>Харнесс, вне цикла агента</div>
          {serviceCalls.map((call) => (
            <TimelineButton
              key={call.requestId}
              focus={focus}
              target={{ kind: 'model', requestId: call.requestId }}
              onFocus={onFocus}
              tone="model"
            >
              model_request · {call.purpose}
            </TimelineButton>
          ))}
          {view.retrieval.retrieved !== null && (
            <TimelineButton
              focus={focus}
              target={{ kind: 'retrieval' }}
              onFocus={onFocus}
              tone="retrieval"
            >
              context_retrieved · {view.retrieval.retrieved.toolName}
            </TimelineButton>
          )}
        </div>
      )}
      {view.steps.map((step) => (
        <StepCard key={step.call.requestId} step={step} focus={focus} onFocus={onFocus} />
      ))}
      {view.steps.length === 0 && serviceCalls.length === 0 && (
        <div className={styles.muted}>Запросов к модели пока нет.</div>
      )}
    </nav>
  );
}

interface StepCardProps {
  step: AgentStep;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}

function StepCard({ step, focus, onFocus }: StepCardProps): ReactElement {
  const target: Focus = { kind: 'model', requestId: step.call.requestId };
  return (
    <div className={styles.stepCard} data-active={isFocused(focus, target)}>
      <button
        type="button"
        className={styles.stepHeader}
        onClick={() => {
          onFocus(target);
        }}
      >
        <span className={styles.stepTitle}>Шаг {step.iteration}</span>
        <span className={styles.mono}>{formatDuration(step.call)}</span>
        <span className={styles.stepOutcome}>model_request → {OUTCOMES[step.outcome]}</span>
      </button>
      {step.toolCalls.map((tool) => (
        <TimelineButton
          key={tool.toolCallId}
          focus={focus}
          target={{ kind: 'tool', toolCallId: tool.toolCallId }}
          onFocus={onFocus}
          tone="tool"
        >
          ↳ {tool.toolName} <span className={styles.toolStatus}>{TOOL_STATUSES[tool.status]}</span>
        </TimelineButton>
      ))}
    </div>
  );
}

interface TimelineButtonProps {
  focus: Focus | null;
  target: Focus;
  onFocus: (focus: Focus) => void;
  tone: 'model' | 'tool' | 'retrieval';
  children: ReactNode;
}

function TimelineButton({
  focus,
  target,
  onFocus,
  tone,
  children,
}: TimelineButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.timelineItem}
      data-tone={tone}
      aria-current={isFocused(focus, target)}
      onClick={() => {
        onFocus(target);
      }}
    >
      {children}
    </button>
  );
}

const OUTCOMES: Record<AgentStep['outcome'], string> = {
  pending: 'ждёт ответа модели',
  toolCalls: 'tool_calls',
  answer: 'ответ пользователю',
  error: 'ошибка',
};

const TOOL_STATUSES: Record<ToolCallView['status'], string> = {
  pending: 'выполняется',
  waitingForUser: 'ждёт разрешения',
  success: 'success',
  error: 'error',
  denied: 'denied',
  blocked: 'blocked',
};

function formatDuration(call: ModelCall): string {
  if (call.response !== null) {
    return `${call.response.durationMs.toLocaleString('ru-RU')} мс`;
  }
  return call.error === null ? '…' : 'ошибка';
}
