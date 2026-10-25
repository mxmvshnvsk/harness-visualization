// Шаг 3. Сколько стоят тулы: описания всех тулов — в каждом запросе к модели. Первый запрос
// по частям, вес каждого тула с галочкой «как будто не подключили» и итог за сессию.

import { useState, type ReactElement } from 'react';
import type { McpCourse } from '../../projections/projectMcpCourse';
import { Lab, StepShell } from '../rag/course/StepShell';
import shared from '../rag/RagLab.module.css';
import { MCP_ENDING, MCP_STEPS, type McpStepProps } from './mcpCourseContent';
import styles from './Mcp.module.css';

// Части prompt — в цветах экрана «Контекст» (--part-*).
const PARTS = [
  { key: 'system', label: 'system prompt', color: 'var(--part-system)' },
  { key: 'tools', label: 'описания тулов', color: 'var(--part-tools)' },
  { key: 'dialog', label: 'диалог', color: 'var(--part-dialog)' },
  { key: 'toolResults', label: 'результаты тулов', color: 'var(--part-results)' },
] as const;

export function StepCost({ course, onStep }: McpStepProps): ReactElement {
  const mcpTokens = course.tools
    .filter((tool) => tool.fromServer)
    .reduce((sum, tool) => sum + tool.tokens, 0);
  return (
    <StepShell
      index={2}
      steps={MCP_STEPS}
      ending={MCP_ENDING}
      onStep={onStep}
      question="Сколько стоят тулы?"
      prose={
        <>
          <p>
            Чтобы модель могла попросить тул, она должна знать о нём. Поэтому описания всех тулов
            лежат в <i>каждом</i> запросе к модели — нужны они в этот раз или нет.
          </p>
          <p>
            А за каждый токен запроса платят. У MCP-сервера это особенно заметно: подключили сервер
            — его тулы попали в каждый запрос, даже если сервер в этой сессии ни разу не позвали.
          </p>
        </>
      }
      lab={<CostLab course={course} />}
      notice={
        <>
          Тулы MCP-сервера здесь — ≈{mcpTokens} токенов в каждом запросе. Серверы с десятками тулов
          — обычное дело, и тогда тулы съедают тысячи токенов до первого слова пользователя. Поэтому
          подключают только нужные серверы и прячут лишние тулы настройкой{' '}
          <span className={shared.mono}>hiddenTools</span>.
        </>
      }
      takeaway="Тул стоит места в каждом запросе, даже если его не зовут. Подключить сервер — значит платить за его описания постоянно."
    />
  );
}

function CostLab({ course }: { course: McpCourse }): ReactElement {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const first = course.budgets[0];
  if (first === undefined) {
    return <p className={shared.hint}>В этой записи харнесс ещё не считал бюджет prompt.</p>;
  }
  const removed = course.tools
    .filter((tool) => off.has(tool.name))
    .reduce((sum, tool) => sum + tool.tokens, 0);
  const tools = Math.max(0, first.estimate.tools - removed);
  const total = first.estimate.total - (first.estimate.tools - tools);
  const toggle = (name: string): void => {
    const next = new Set(off);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setOff(next);
  };
  return (
    <Lab
      title="Опыт: что занимает первый запрос к модели"
      hint={`Оценка харнесса по символам (${String(first.charsPerToken)} символа на токен) — та же, что на экране «Контекст».`}
    >
      <div className={styles.stats}>
        <Stat
          value={`${String(Math.round((tools / total) * 100))}%`}
          label="запроса — описания тулов"
        />
        <Stat value={String(tools)} label={`токенов тулов из ${String(total)}`} />
        <Stat value={String(first.estimate.dialog)} label="токенов — сам вопрос" />
      </div>
      <PartsBar estimate={{ ...first.estimate, tools, total }} />
      <p className={shared.hint}>
        Снимите галочку у тула — как будто его не подключили. Тулы MCP-сервера — с приставкой{' '}
        {course.serverName}__.
      </p>
      <ToolWeights course={course} off={off} onToggle={toggle} />
      <SessionTotals course={course} />
    </Lab>
  );
}

function Stat({ value, label }: { value: string; label: string }): ReactElement {
  return (
    <div className={styles.stat}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function PartsBar({
  estimate,
}: {
  estimate: Record<(typeof PARTS)[number]['key'] | 'total', number>;
}): ReactElement {
  return (
    <>
      <div className={styles.parts} role="img" aria-label="Первый запрос по частям">
        {PARTS.map((part) =>
          estimate[part.key] > 0 ? (
            <span key={part.key} style={{ flex: estimate[part.key], background: part.color }}>
              {estimate[part.key] / estimate.total > 0.12 ? estimate[part.key] : ''}
            </span>
          ) : null,
        )}
      </div>
      <ul className={styles.legend}>
        {PARTS.map((part) => (
          <li key={part.key}>
            <span className={styles.swatch} style={{ background: part.color }} />
            {part.label}
          </li>
        ))}
      </ul>
    </>
  );
}

interface WeightsProps {
  course: McpCourse;
  off: ReadonlySet<string>;
  onToggle: (name: string) => void;
}

function ToolWeights({ course, off, onToggle }: WeightsProps): ReactElement {
  const max = Math.max(...course.tools.map((tool) => tool.tokens), 1);
  return (
    <ul className={styles.weights}>
      {course.tools.map((tool) => (
        <li key={tool.name} data-off={off.has(tool.name) ? 'true' : undefined}>
          <input
            type="checkbox"
            checked={!off.has(tool.name)}
            aria-label={tool.name}
            onChange={() => {
              onToggle(tool.name);
            }}
          />
          <span className={shared.mono}>{tool.name}</span>
          <span className={styles.weightBar} data-server={tool.fromServer ? 'true' : undefined}>
            <span style={{ width: `${String((tool.tokens / max) * 100)}%` }} />
          </span>
          <span className={shared.mono}>≈{tool.tokens} ток.</span>
        </li>
      ))}
    </ul>
  );
}

function SessionTotals({ course }: { course: McpCourse }): ReactElement {
  const tools = course.budgets.reduce((sum, budget) => sum + budget.estimate.tools, 0);
  const total = course.budgets.reduce((sum, budget) => sum + budget.estimate.total, 0);
  const weights = course.tools.reduce((sum, tool) => sum + tool.tokens, 0);
  return (
    <>
      <p className={shared.hint}>
        Сумма по тулам — ≈{weights}, оценка харнесса для всей части «тулы» —{' '}
        {course.budgets[0]?.estimate.tools}: обе считаются по символам схем, поэтому почти
        совпадают.
        {course.firstUsage !== null &&
          ` Сама модель насчитала весь первый запрос в ${String(course.firstUsage.inputTokens)} токенов.`}
      </p>
      <div className={styles.stats}>
        <Stat
          value={String(tools)}
          label={`токенов на тулы за ${String(course.budgets.length)} запроса сессии — ${String(Math.round((tools / total) * 100))}% всего, что ушло модели`}
        />
        {course.firstUsage !== null && (
          <Stat
            value={String(course.firstUsage.cachedTokens)}
            label="токенов первого запроса — из кэша: начало запроса с тулами не меняется и стоит дешевле"
          />
        )}
      </div>
    </>
  );
}
