// Субагенты сессии (этап 6c): кому главный агент что поручил, чем кончилось и сколько стоило.
// События субагента несут agentId; у главного агента его нет. Цвет — по порядку запуска:
// у первых двух свои (палитра проверена validate_palette.js из скилла dataviz, Anthropic),
// дальше — нейтральный: различать их помогает подпись с id, а не новый оттенок.

import type { HarnessEvent, TokenUsage } from '@harness-visualization/harness';

export type AgentColor = 'main' | 'one' | 'two' | 'other';

export interface SubagentRun {
  subagentId: string;
  agent: string;
  task: string;
  parentToolCallId: string;
  toolNames: string[];
  color: AgentColor;
  // Номера событий начала и конца; null — субагент ещё работает.
  startedIndex: number;
  finishedIndex: number | null;
  status: 'running' | 'done' | 'failed';
  // Отчёт написан по лимиту шагов: харнесс попросил закончить.
  limited: boolean;
  report: string | null;
  errorMessage: string | null;
  modelRequests: number;
  usage: TokenUsage | null;
  durationMs: number | null;
}

const COLORS: readonly AgentColor[] = ['one', 'two'];

export function isMainEvent(event: HarnessEvent): boolean {
  return event.agentId === undefined;
}

export function projectSubagents(events: readonly HarnessEvent[]): SubagentRun[] {
  const runs: SubagentRun[] = [];
  events.forEach((event, index) => {
    if (event.type === 'subagent_started') {
      runs.push({
        subagentId: event.subagentId,
        agent: event.agent,
        task: event.task,
        parentToolCallId: event.parentToolCallId,
        toolNames: event.toolNames,
        color: COLORS[runs.length] ?? 'other',
        startedIndex: index,
        finishedIndex: null,
        status: 'running',
        limited: false,
        report: null,
        errorMessage: null,
        modelRequests: 0,
        usage: null,
        durationMs: null,
      });
    }
    if (event.type === 'iteration_limit_reached' && event.agentId !== undefined) {
      const limited = runs.find((item) => item.subagentId === event.agentId);
      if (limited !== undefined) {
        limited.limited = true;
      }
    }
    if (event.type === 'subagent_finished') {
      const run = runs.find((item) => item.subagentId === event.subagentId);
      if (run !== undefined) {
        Object.assign(run, {
          finishedIndex: index,
          status: event.status,
          report: event.report,
          errorMessage: event.errorMessage,
          modelRequests: event.modelRequests,
          usage: event.usage,
          durationMs: event.durationMs,
        });
      }
    }
  });
  return runs;
}

// Что видно на месте повтора: до старта субагента нет, после конца — готов.
export function runAt(run: SubagentRun, shown: number): 'future' | 'running' | 'finished' {
  if (shown <= run.startedIndex) {
    return 'future';
  }
  return run.finishedIndex !== null && shown > run.finishedIndex ? 'finished' : 'running';
}
