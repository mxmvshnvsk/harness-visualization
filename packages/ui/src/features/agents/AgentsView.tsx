// Вкладка «Агенты» (этап 6c.3) — по мокапу, одобренному автором: сколько агентов и во что
// обошлись, кто когда работал (по настоящему времени), что кому поручили и что вернулось,
// какой самый большой prompt у каждого. Идёт за курсором повтора.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import {
  projectAgents,
  reportTokens,
  type AgentsView as View,
} from '../../projections/projectAgents';
import { HelpButton } from '../../help/HelpLinks';
import { AgentLanes } from './AgentLanes';
import { BudgetBars } from './BudgetBars';
import { Handoffs } from './Handoffs';
import { formatSeconds, formatTokens } from './agentFormat';
import styles from './Agents.module.css';

interface AgentsViewProps {
  events: readonly HarnessEvent[];
  shown: number;
}

export function AgentsView({ events, shown }: AgentsViewProps): ReactElement {
  const view = useMemo(() => projectAgents(events, shown), [events, shown]);
  if (view.runs.length === 0) {
    return (
      <div className={styles.empty}>
        Главный агент ещё никому ничего не поручал — повтор до поручений не дошёл.
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <div className={styles.screenHead}>
        <p className={styles.muted}>
          Главный агент и субагенты, которым он поручал задачи: у каждого своя история.
        </p>
        <HelpButton topic="subagents" />
      </div>
      <Tiles view={view} />
      <AgentLanes view={view} />
      <Handoffs view={view} />
      <BudgetBars view={view} />
    </div>
  );
}

function Tiles({ view }: { view: View }): ReactElement {
  const subagents = view.lanes.filter((lane) => lane.id !== 'main');
  const read = subagents.reduce((sum, lane) => sum + lane.toolResultTokens, 0);
  const reported = view.runs.reduce((sum, run) => sum + reportTokens(run, view.charsPerToken), 0);
  const input = view.lanes.reduce((sum, lane) => sum + lane.inputTokens, 0);
  const perAgent = view.lanes
    .map((lane) => `${lane.id === 'main' ? 'главный' : lane.id} ${formatTokens(lane.inputTokens)}`)
    .join(' · ');
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}>
        <small>агенты</small>
        <b>{String(view.lanes.length)}</b>
        <span>
          главный и {plural(subagents.length)} · поручений {view.runs.length}
        </span>
      </div>
      <div className={styles.tile}>
        <small>в контекст главного</small>
        <b>
          ≈{formatTokens(reported)} вместо ≈{formatTokens(read)}
        </b>
        <span>отчёты вместо всего, что вернули тулы субагентов</span>
      </div>
      <div className={styles.tile}>
        <small>input за сессию</small>
        <b>{formatTokens(input)}</b>
        <span>{perAgent}</span>
      </div>
      <div className={styles.tile}>
        <small>время</small>
        <b>{formatSeconds(view.now)}</b>
        <span>{describeTiming(view)}</span>
      </div>
    </div>
  );
}

function plural(count: number): string {
  if (count === 1) {
    return '1 субагент';
  }
  return count < 5 ? `${String(count)} субагента` : `${String(count)} субагентов`;
}

// Шли ли субагенты одновременно — по пересечению их времени.
function describeTiming(view: View): string {
  const spans = view.lanes
    .filter((lane) => lane.id !== 'main' && lane.segments.length > 0)
    .map((lane) => ({
      start: lane.segments[0]?.start ?? 0,
      end: lane.segments.at(-1)?.end ?? view.now,
    }));
  const overlap = spans.some((one, index) =>
    spans.slice(index + 1).some((other) => one.start < other.end && other.start < one.end),
  );
  if (spans.length < 2) {
    return 'главный ждал отчёта субагента';
  }
  return overlap ? 'субагенты работали одновременно' : 'субагенты работали по очереди';
}
