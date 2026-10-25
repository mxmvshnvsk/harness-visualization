// Вызов тула: аргументы, цепочка разрешения (политика → вопрос → ответ) и результат —
// ровно то, что увидит модель, и подробности, которые видит только харнесс.

import type { ReactElement } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import type { ToolCallView } from '../../projections/sessionView';
import styles from './Inspector.module.css';
import { isMcpTool } from '../../timeline/actions';
import { HelpButton, Term } from '../../help/HelpLinks';

export function ToolCallPanel({ tool }: { tool: ToolCallView }): ReactElement {
  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.eventType} data-group="tool">
          tool_call
        </span>
        <h2 className={styles.panelTitle}>{tool.toolName}</h2>
        <Badge tone={STATUS_TONES[tool.status]}>{tool.status}</Badge>
        <span className={styles.headerHelp}>
          {isMcpTool(tool.toolName) && <Term topic="mcp">это tool MCP-сервера</Term>}
          <HelpButton topic="tool-calls" />
        </span>
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
      <h3 className={styles.blockTitle}>
        <Term topic="permissions">разрешение</Term>
      </h3>
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
      <ResultContent content={result.content} truncation={tool.truncation} />
      {result.details !== null && (
        <>
          <div className={styles.caption}>подробности для харнесса (модель их не видит):</div>
          <pre className={styles.code}>{formatJson(result.details)}</pre>
        </>
      )}
    </section>
  );
}

// Что увидит модель. Обрезанный харнессом результат — с линией отреза: выше — что ушло в
// историю, ниже — что модель не увидит.
function ResultContent({
  content,
  truncation,
}: {
  content: string;
  truncation: ToolCallView['truncation'];
}): ReactElement {
  if (truncation === null) {
    return (
      <>
        <div className={styles.caption}>модель увидит ровно это:</div>
        <pre className={styles.code}>{content}</pre>
      </>
    );
  }
  const format = (value: number): string => value.toLocaleString('ru-RU');
  return (
    <>
      <div className={styles.caption}>
        тул вернул ≈{format(truncation.originalTokens)} токенов; модель увидит начало и пометку
        харнесса:
      </div>
      <pre className={styles.code}>{content.slice(0, truncation.keptChars)}</pre>
      <div className={styles.cut}>
        ✂ <Term topic="context-budget">обрезано харнессом</Term>: ≈
        {format(truncation.originalTokens)} → ≈{format(truncation.keptTokens)} токенов (лимит на
        результат {format(truncation.limitTokens)}, пресет {truncation.preset}). Ниже — то, чего
        модель не увидит:
      </div>
      <pre className={`${styles.code} ${styles.dropped}`}>
        {content.slice(truncation.keptChars)}
      </pre>
    </>
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
