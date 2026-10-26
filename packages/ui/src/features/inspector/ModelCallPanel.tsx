// Запрос к модели: числа, кэш prompt с объяснением, что ушло в модель и что она ответила.

import type { ReactElement } from 'react';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import type { ModelCall } from '../../projections/sessionView';
import { BudgetBlock } from './BudgetBlock';
import { InferencePhases } from './InferencePhases';
import { TimingBlock } from './TimingBlock';
import { explainCache, type CacheExplanation } from './explainCache';
import type { Focus } from './focus';
import styles from './Inspector.module.css';
import { MessageList } from './MessageList';
import { ReplyTokens } from '../tokens/ReplyTokens';
import { HelpButton, Term } from '../../help/HelpLinks';

interface ModelCallPanelProps {
  call: ModelCall;
  // Все запросы сессии — для сравнения фаз (этап 8d.3).
  calls: ModelCall[];
  onFocus: (focus: Focus) => void;
}

export function ModelCallPanel({ call, calls, onFocus }: ModelCallPanelProps): ReactElement {
  const cache = explainCallCache(call);
  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.eventType} data-group="model">
          model_request
        </span>
        <h2 className={styles.panelTitle}>{describePurpose(call)}</h2>
        {cache !== null && <Badge dot={cache.warm}>{cache.label}</Badge>}
        <span className={styles.headerHelp}>
          <HelpButton topic="agent-loop" />
        </span>
      </header>
      {call.response !== null && (
        <CallStats response={call.response} share={call.cache?.share ?? 0} />
      )}
      <InferencePhases call={call} />
      <TimingBlock call={call} calls={calls} />
      <CallBudget call={call} />
      <CallNotes call={call} cacheText={cache?.text ?? null} />
      <div className={styles.columns}>
        <MessageList body={call.request.body} />
        <Reply call={call} onFocus={onFocus} />
      </div>
    </article>
  );
}

// Бюджет prompt — у запросов, записанных начиная с этапа 6.2.
function CallBudget({ call }: { call: ModelCall }): ReactElement | null {
  const { budget } = call.request;
  if (budget === undefined || budget === null) {
    return null;
  }
  return (
    <BudgetBlock budget={budget} exactTokens={call.response?.reply.usage.inputTokens ?? null} />
  );
}

interface CallStatsProps {
  response: NonNullable<ModelCall['response']>;
  share: number;
}

function CallStats({ response, share }: CallStatsProps): ReactElement {
  const { usage } = response.reply;
  const { cost } = response;
  return (
    <div className={styles.stats}>
      <StatCard label="input tokens" value={formatNumber(usage.inputTokens)} note="весь prompt" />
      <StatCard
        label="cache hit"
        value={formatNumber(usage.inputCacheHitTokens)}
        note={`${String(Math.round(share * 100))} % prompt`}
      />
      <StatCard
        label="output"
        value={formatNumber(usage.outputTokens)}
        note={`reasoning ${formatNumber(usage.reasoningTokens)}`}
      />
      <StatCard label="время" value={formatSeconds(response.durationMs)} note="ответ модели" />
      <StatCard
        label="стоимость"
        // Крупно — две значащие цифры, точно — в подписи: иначе число не помещается в карточку.
        value={cost === null ? '—' : cost.total.toPrecision(2)}
        note={
          cost === null
            ? 'цена неизвестна'
            : `${cost.total.toFixed(6)} ${cost.currency} · ${cost.tariffName}`
        }
      />
    </div>
  );
}

// Пометки под цифрами: объяснение кэша, ошибка или «ответа ещё нет».
function CallNotes({
  call,
  cacheText,
}: {
  call: ModelCall;
  cacheText: string | null;
}): ReactElement {
  return (
    <>
      {cacheText !== null && (
        <p className={styles.note}>
          <span className={styles.noteDot} aria-hidden="true" />
          <span>
            {cacheText} <Term topic="prompt-cache">Что такое prompt cache?</Term>
          </span>
        </p>
      )}
      {call.error !== null && <p className={styles.errorNote}>Ошибка: {call.error.message}</p>}
      {call.response === null && call.error === null && (
        <p className={styles.muted}>Модель ещё не ответила.</p>
      )}
    </>
  );
}

function Reply({ call, onFocus }: Omit<ModelCallPanelProps, 'calls'>): ReactElement | null {
  const reply = call.response?.reply;
  if (reply === undefined) {
    return null;
  }
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>ответ модели · {reply.finishReason}</h3>
      {reply.reasoningText !== null && reply.reasoningText !== '' && (
        <>
          <div className={styles.caption}>reasoning</div>
          <ReplyTokens
            reply={reply}
            part="reasoning"
            fallback={<pre className={styles.code}>{reply.reasoningText}</pre>}
          />
        </>
      )}
      {reply.text !== null && reply.text !== '' && (
        <ReplyTokens
          reply={reply}
          part="content"
          fallback={<div className={styles.answer}>{reply.text}</div>}
        />
      )}
      {reply.toolCalls.map((toolCall) => (
        <button
          key={toolCall.id}
          type="button"
          className={styles.toolLink}
          onClick={() => {
            onFocus({ kind: 'tool', toolCallId: toolCall.id });
          }}
        >
          → tool_call {toolCall.name} {toolCall.argumentsText}
        </button>
      ))}
    </section>
  );
}

function explainCallCache(call: ModelCall): (CacheExplanation & { warm: boolean }) | null {
  if (call.cache === null || call.response === null) {
    return null;
  }
  const explanation = explainCache(call.cache, call.response.reply.usage.inputTokens);
  return { ...explanation, warm: call.cache.warmth === 'warm' };
}

function describePurpose(call: ModelCall): string {
  switch (call.purpose) {
    case 'agentStep':
      return `Шаг ${String(call.iteration ?? '?')} · agentStep`;
    case 'queryRewrite':
      return 'Переформулировка запроса · queryRewrite';
    case 'groundingJudge':
      return 'Вопрос судье · groundingJudge';
    case 'compaction':
      return 'Сводка истории · compaction';
    case 'evalJudge':
      return 'Вопрос судье evals · evalJudge';
    case 'tokenLab':
      return 'Вероятности токенов · tokenLab';
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}
