// Вызов тула: аргументы, цепочка разрешения (политика → вопрос → ответ) и результат —
// ровно то, что увидит модель, и подробности, которые видит только харнесс.

import type { ReactElement } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import type { ToolCallView } from '../../projections/sessionView';
import styles from './Inspector.module.css';

export function ToolCallPanel({ tool }: { tool: ToolCallView }): ReactElement {
  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.eventType} data-group="tool">
          tool_call
        </span>
        <h2 className={styles.panelTitle}>{tool.toolName}</h2>
        <Badge tone={STATUS_TONES[tool.status]}>{tool.status}</Badge>
      </header>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>аргументы от модели</h3>
        <pre className={styles.code}>{formatJson(tool.call.arguments)}</pre>
      </section>
      <PermissionChain tool={tool} />
      <ToolResult tool={tool} />
    </article>
  );
}

function PermissionChain({ tool }: { tool: ToolCallView }): ReactElement {
  const { evaluation, question, answer } = tool;
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>разрешение</h3>
      {evaluation === null ? (
        <div className={styles.muted}>Политика ещё не проверила вызов.</div>
      ) : (
        <ol className={styles.chain}>
          <li>
            <span className={styles.eventType} data-group="permission">
              permission_evaluated
            </span>{' '}
            {evaluation.decision}: {evaluation.reason}
            <ul className={styles.checks}>
              {evaluation.checks.map((check) => (
                <li key={`${check.source}:${check.label}`} data-matched={check.matched}>
                  {check.matched ? 'сработало' : 'не подошло'} · {check.label}
                  {check.decision === null ? '' : ` → ${check.decision}`}
                </li>
              ))}
            </ul>
          </li>
          {question !== null && <li>Вопрос пользователю: {question.actionDescription}</li>}
          {answer !== null && (
            <li>
              {answer.approved ? 'Разрешено' : 'Запрещено'} · answeredBy {answer.answeredBy} · ждали{' '}
              {answer.waitedForUserMs.toLocaleString('ru-RU')} мс
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

function ToolResult({ tool }: { tool: ToolCallView }): ReactElement {
  const { result } = tool;
  if (result === null) {
    return <div className={styles.muted}>Результата ещё нет.</div>;
  }
  const cost =
    result.cost === null ? '' : ` · ${String(result.cost.amount)} ${result.cost.currency}`;
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>
        результат · {result.status} · {result.durationMs.toLocaleString('ru-RU')} мс{cost}
      </h3>
      <div className={styles.caption}>модель увидит ровно это:</div>
      <pre className={styles.code}>{result.content}</pre>
      {result.details !== null && (
        <>
          <div className={styles.caption}>подробности для харнесса (модель их не видит):</div>
          <pre className={styles.code}>{formatJson(result.details)}</pre>
        </>
      )}
    </section>
  );
}

const STATUS_TONES: Record<ToolCallView['status'], BadgeTone> = {
  pending: 'neutral',
  waitingForUser: 'permission',
  success: 'retrieval',
  error: 'error',
  denied: 'error',
  blocked: 'error',
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
