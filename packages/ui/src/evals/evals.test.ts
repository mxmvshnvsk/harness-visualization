import { describe, expect, it } from 'vitest';
import {
  runCodeCheck,
  summarizeCell,
  summarizeConfig,
  trialPassed,
  type EvalReport,
  type TrialResult,
} from '@harness-visualization/harness/evals';
import {
  EventLog,
  modelRequest,
  modelResponse,
  sessionFinished,
  toolCall,
  toolCallEvent,
  toolResult,
  usage,
} from '../projections/testEvents';

function trialLog(answer: string) {
  const search = toolCall('call-1', 'kedr__search', '{"query":"удалёнка"}');
  return new EventLog()
    .add({ type: 'user_message', text: 'удалёнка' })
    .add(modelRequest('request-1', 1))
    .add(modelResponse('request-1', { usage: usage(1000, 0), toolCalls: [search] }))
    .add(toolCallEvent(search))
    .add(toolResult(search))
    .add(modelRequest('request-2', 2))
    .add(modelResponse('request-2', { usage: usage(2000, 1000), text: answer }))
    .add({ type: 'assistant_message', text: answer })
    .add(sessionFinished(usage(3000, 1000, 100), 2)).events;
}

describe('проверки кодом', () => {
  const events = trialLog('До трёх дней в неделю.');

  it('текст ответа — без учёта регистра, хоть одна из строк', () => {
    const check = runCodeCheck({ kind: 'answerIncludes', anyOf: ['два', 'ТРЁХ'] }, events);
    expect(check).toMatchObject({ passed: true, detail: 'нашлось «ТРЁХ»' });
  });

  it('тул ищется по полному имени и по окончанию', () => {
    expect(runCodeCheck({ kind: 'toolCalled', tool: 'search' }, events).passed).toBe(true);
    expect(runCodeCheck({ kind: 'toolNotCalled', tool: 'web_search' }, events).passed).toBe(true);
  });

  it('лимиты — по трейсу: шаги агента и вызовы тулов', () => {
    expect(runCodeCheck({ kind: 'maxModelRequests', value: 1 }, events)).toMatchObject({
      passed: false,
      detail: '2 запросов',
    });
    expect(runCodeCheck({ kind: 'maxToolCalls', value: 0 }, events).passed).toBe(false);
  });

  it('поиск харнесса до ответа — не вызов тула моделью', () => {
    const log = new EventLog().add({
      type: 'context_retrieved',
      toolName: 'kedr__semantic_search',
      arguments: { query: '17 умножить на 23' },
      queryAuthor: 'user',
      userQuestion: 'сколько будет 17 умножить на 23',
      status: 'success',
      content: 'найдено',
      durationMs: 5,
    });
    expect(runCodeCheck({ kind: 'noRetrieval' }, log.events)).toMatchObject({
      passed: false,
      detail: 'искал «17 умножить на 23»',
    });
    expect(runCodeCheck({ kind: 'noRetrieval' }, events).passed).toBe(true);
  });

  it('судью без судьи не засчитывают ни в плюс, ни в минус', () => {
    const judge = runCodeCheck({ kind: 'judge', rubric: 'что-то' }, events);
    expect(judge.passed).toBeNull();
    const ok = runCodeCheck({ kind: 'maxToolCalls', value: 5 }, events);
    expect(trialPassed(false, [ok, judge])).toBeNull();
    expect(trialPassed(false, [ok])).toBe(true);
    expect(trialPassed(true, [ok])).toBe(false);
  });
});

function trial(
  taskId: string,
  config: string,
  number: number,
  passed: boolean | null,
): TrialResult {
  return {
    taskId,
    config,
    trial: number,
    tracePath: `traces/${taskId}-${config}-${String(number)}.jsonl`,
    failed: false,
    checks: [],
    passed,
    modelRequests: 2,
    toolCalls: 1,
    costUsd: 0.001,
    durationMs: 1000 * number,
    cacheWarm: false,
  };
}

describe('pass@k и pass^k', () => {
  const report: EvalReport = {
    kind: 'evalReport',
    version: 1,
    set: { name: 'тест', description: 'тест', file: 'evals/test.json' },
    model: 'deepseek-flash',
    reasoningEffort: 'high',
    startedAt: '2026-10-26T10:00:00.000Z',
    finishedAt: null,
    trials: 3,
    configs: [{ name: 'tool', description: 'модель ищет сама' }],
    tasks: [
      { id: 'steady', question: 'q', origin: 'o', checks: [{ kind: 'maxToolCalls', value: 1 }] },
      { id: 'flaky', question: 'q', origin: 'o', checks: [{ kind: 'maxToolCalls', value: 1 }] },
    ],
    results: [
      trial('steady', 'tool', 1, true),
      trial('steady', 'tool', 2, true),
      trial('steady', 'tool', 3, true),
      trial('flaky', 'tool', 1, false),
      trial('flaky', 'tool', 2, true),
      trial('flaky', 'tool', 3, null),
    ],
    judgeTracePath: null,
  };

  it('непостоянная задача: решена хоть раз, но не всегда', () => {
    expect(summarizeCell(report, 'flaky', 'tool')).toMatchObject({
      passes: 1,
      unknown: 1,
      passAtK: true,
      passHatK: false,
    });
  });

  it('попыток меньше k — pass^k ещё неизвестен', () => {
    const partial = { ...report, results: report.results.slice(0, 4) };
    expect(summarizeCell(partial, 'flaky', 'tool')).toMatchObject({
      passAtK: null,
      passHatK: null,
    });
    expect(summarizeConfig(partial, 'tool').passHatK).toBe(1);
  });

  it('по видам задач: трудное не прячется в общем проценте', () => {
    const mixed = {
      ...report,
      tasks: report.tasks.map((task) =>
        task.id === 'flaky' ? { ...task, suite: 'capability' as const } : task,
      ),
    };
    expect(summarizeConfig(mixed, 'tool', 'regression').passHatK).toBe(1);
    expect(summarizeConfig(mixed, 'tool', 'capability').passHatK).toBe(0);
  });

  it('по конфигурации: доля задач и удачных попыток', () => {
    const summary = summarizeConfig(report, 'tool');
    expect(summary.passAtK).toBe(1);
    expect(summary.passHatK).toBe(0.5);
    expect(summary.trialPassRate).toBeCloseTo(4 / 6);
    expect(summary.costUsd).toBeCloseTo(0.006);
    expect(summary.medianDurationMs).toBe(2000);
  });
});
