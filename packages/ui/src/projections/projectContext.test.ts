import { describe, expect, it } from 'vitest';
import { projectContext, requestLabel } from './projectContext';
import { EventLog, modelRequest, modelResponse, sessionStarted, usage } from './testEvents';

const budget = {
  preset: 'stress',
  limitTokens: 6000,
  thresholdTokens: 4800,
  charsPerToken: 3.24,
  estimate: { system: 180, tools: 720, dialog: 3900, toolResults: 0, total: 4800 },
};

function withBudget(requestId: string, iteration: number | null, purpose = 'agentStep') {
  return { ...modelRequest(requestId, iteration), purpose, budget } as ReturnType<
    typeof modelRequest
  >;
}

describe('projectContext', () => {
  it('у запроса — бюджет, точный размер и что харнесс сделал перед ним', () => {
    const log = new EventLog()
      .add(sessionStarted())
      .add({ type: 'user_message', text: 'первый' })
      .add(withBudget('r1', 1))
      .add(modelResponse('r1', { usage: usage(4810, 3000), text: 'ответ' }))
      .add({ type: 'user_message', text: 'второй' })
      .add(withBudget('c1', null, 'compaction'))
      .add(modelResponse('c1', { usage: usage(5000, 0), text: 'сводка' }))
      .add({
        type: 'history_compacted',
        requestId: 'c1',
        replacedMessages: 4,
        summary: 'сводка',
        beforeTokens: 5900,
        afterTokens: 990,
        thresholdTokens: 4800,
        preset: 'stress',
      })
      .add(withBudget('r2', 1));
    const [first, compaction, second] = projectContext(log.events);

    expect(first).toMatchObject({ turn: 1, step: 1, exactTokens: 4810, cacheHitTokens: 3000 });
    expect(compaction && requestLabel(compaction)).toBe('сводка');
    expect(second).toMatchObject({ turn: 2, step: 1, compacted: true, exactTokens: null });
    expect(second && requestLabel(second)).toBe('в2 ш1');
  });

  it('запросы без бюджета (трейсы до этапа 6.2) не попадают', () => {
    const log = new EventLog().add(sessionStarted()).add(modelRequest('r1', 1));

    expect(projectContext(log.events)).toEqual([]);
  });
});
