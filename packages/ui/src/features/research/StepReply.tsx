// Ответ модели по-человечески: рассуждение, текст, вызовы тулов, токены и цена запроса.

import type { ReactElement } from 'react';
import type { ResearchStep } from '../../projections/projectResearch';
import { formatNumber, percent } from './StepsView';
import styles from './Research.module.css';

export function StepReply({ step }: { step: ResearchStep }): ReactElement {
  if (step.response === null) {
    return (
      <div className={styles.body}>
        <p className={styles.muted}>{step.error?.message ?? 'Ответа ещё нет.'}</p>
      </div>
    );
  }
  const { reply, cost } = step.response;
  return (
    <div className={styles.body}>
      <div className={styles.split}>
        <ReplyText reply={reply} />
        <div className={styles.stack}>
          <h3 className={styles.subTitle}>Вызовы тулов · {reply.toolCalls.length}</h3>
          <dl className={styles.kv}>
            {reply.toolCalls.map((call) => (
              <div key={call.id}>
                <dt>{call.name}</dt>
                <dd>{call.argumentsText}</dd>
              </div>
            ))}
          </dl>
          <ReplyNumbers reply={reply} cost={cost} />
        </div>
      </div>
    </div>
  );
}

type Response = NonNullable<ResearchStep['response']>;

function ReplyText({ reply }: { reply: Response['reply'] }): ReactElement {
  return (
    <div className={styles.stack}>
      {reply.reasoningText !== null && (
        <>
          <h3 className={styles.subTitle}>
            Рассуждение · {formatNumber(reply.usage.reasoningTokens)} ток.
          </h3>
          <pre className={styles.text}>{reply.reasoningText}</pre>
        </>
      )}
      <h3 className={styles.subTitle}>Текст ответа</h3>
      <pre className={styles.text}>{reply.text ?? '— нет: модель только вызвала тулы'}</pre>
    </div>
  );
}

function ReplyNumbers(props: { reply: Response['reply']; cost: Response['cost'] }): ReactElement {
  const { usage } = props.reply;
  const { cost } = props;
  return (
    <>
      <h3 className={styles.subTitle}>Токены и цена</h3>
      <dl className={styles.kv}>
        <div>
          <dt>input</dt>
          <dd>
            {formatNumber(usage.inputTokens)} · кэш {formatNumber(usage.inputCacheHitTokens)} (
            {percent(usage.inputCacheHitTokens, usage.inputTokens)})
          </dd>
        </div>
        <div>
          <dt>output</dt>
          <dd>
            {formatNumber(usage.outputTokens)} · рассуждение {formatNumber(usage.reasoningTokens)}
          </dd>
        </div>
        <div>
          <dt>finish</dt>
          <dd>{props.reply.finishReason}</dd>
        </div>
        {cost !== null && (
          <div>
            <dt>цена</dt>
            <dd>
              {cost.total.toFixed(5)} {cost.currency} = кэш {cost.inputCacheHit.toFixed(5)} + промах{' '}
              {cost.inputCacheMiss.toFixed(5)} + вывод {cost.output.toFixed(5)} · тариф{' '}
              {cost.tariffName}
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}
