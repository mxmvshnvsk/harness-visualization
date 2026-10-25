// Поручения и отчёты: что главный агент поручил субагенту, что тот сделал и что вернул.
// Отчёт и есть результат delegate_task — больше главный агент ничего не увидит.

import { useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import type { AgentLane, AgentsView } from '../../projections/projectAgents';
import { reportTokens } from '../../projections/projectAgents';
import type { SubagentRun } from '../../projections/projectSubagents';
import { ChainLinks, hasVector } from '../ChainLinks';
import { formatSeconds, formatTokens } from './agentFormat';
import styles from './Agents.module.css';

export function Handoffs({ view }: { view: AgentsView }): ReactElement | null {
  const [chosen, setChosen] = useState<string | null>(null);
  const run = view.runs.find((item) => item.subagentId === chosen) ?? view.runs[0];
  if (run === undefined) {
    return null;
  }
  const lane = view.lanes.find((item) => item.id === run.subagentId);
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.title}>Поручения и отчёты</h2>
        {view.runs.length > 1 && (
          <Segmented
            label="Субагент"
            size="small"
            options={view.runs.map((item) => ({ value: item.subagentId, label: item.subagentId }))}
            value={run.subagentId}
            onChange={setChosen}
          />
        )}
      </div>
      <div className={styles.handoff} data-color={run.color}>
        <div>
          <span className={styles.eyebrow}>поручение · главный → {run.subagentId}</span>
          <p className={styles.quote}>{run.task}</p>
          <span className={styles.mono}>тулы: {run.toolNames.join(', ')}</span>
          <ChainLinks link={{ toolCallId: run.parentToolCallId, query: '' }} inspector />
        </div>
        <Report run={run} charsPerToken={view.charsPerToken} lane={lane} />
      </div>
      {lane !== undefined && <Calls lane={lane} />}
    </section>
  );
}

function Report(props: {
  run: SubagentRun;
  charsPerToken: number;
  lane: AgentLane | undefined;
}): ReactElement {
  const { run, charsPerToken, lane } = props;
  return (
    <div>
      <span className={styles.eyebrow}>отчёт — это и есть результат тула для главного</span>
      <p className={styles.quote}>{reportText(run)}</p>
      <div className={styles.facts}>
        {facts(run, charsPerToken, lane).map((fact) => (
          <span key={fact} className={styles.fact}>
            {fact}
          </span>
        ))}
      </div>
    </div>
  );
}

function reportText(run: SubagentRun): string {
  if (run.status === 'running') {
    return 'Субагент ещё работает — отчёта пока нет.';
  }
  return (
    run.report ?? `Отчёта нет: ${run.errorMessage ?? 'ошибка'}. Главный получил это ошибкой тула.`
  );
}

function facts(run: SubagentRun, charsPerToken: number, lane: AgentLane | undefined): string[] {
  const counts = lane ?? {
    modelRequests: run.modelRequests,
    calls: [],
    inputTokens: 0,
    toolResultTokens: 0,
  };
  const report =
    run.report === null ? [] : [`отчёт ≈${formatTokens(reportTokens(run, charsPerToken))}`];
  const duration = run.durationMs === null ? [] : [formatSeconds(run.durationMs)];
  return [
    `запросов к модели ${String(counts.modelRequests)}`,
    `тулов ${String(counts.calls.length)}`,
    `input ${formatTokens(counts.inputTokens)}`,
    `прочитано ≈${formatTokens(counts.toolResultTokens)}`,
    ...report,
    ...duration,
  ];
}

// Что субагент вызывал — с ссылками на тот же вызов в журнале MCP и, у поиска по смыслу, в «RAG».
function Calls({ lane }: { lane: AgentLane }): ReactElement | null {
  if (lane.calls.length === 0) {
    return null;
  }
  return (
    <div className={styles.calls}>
      <span className={styles.eyebrow}>что субагент вызывал</span>
      <ul>
        {lane.calls.map((call) => {
          const mcpName = call.toolName.split('__')[1] ?? null;
          return (
            <li key={call.toolCallId}>
              <code className={styles.mono}>{call.toolName}</code>{' '}
              <span className={styles.muted}>{call.query ?? call.argumentsText}</span>
              <ChainLinks
                link={{ toolCallId: call.toolCallId, query: call.query ?? '' }}
                mcp={mcpName !== null}
                rag={mcpName !== null && hasVector(mcpName)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
