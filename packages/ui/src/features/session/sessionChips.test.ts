import { describe, expect, it } from 'vitest';
import { EventLog, sessionStarted, subagentStarted } from '../../projections/testEvents';
import { sessionChips } from './sessionChips';

describe('sessionChips', () => {
  it('показывает субагентов и Clean Workspace, если они были', () => {
    const log = new EventLog()
      .add(sessionStarted('rewrite', { agents: ['researcher'], parallel: true }))
      .add({
        type: 'workspace_prepared',
        directory: 'workspace',
        createdFromSeed: true,
        wasReset: true,
      });

    expect(sessionChips(log.events)).toEqual([
      { label: 'субагенты: researcher', on: true },
      { label: 'clean workspace', on: true },
      { label: 'поиск: харнесс по запросу модели', on: false },
      { label: 'effort high', on: false },
    ]);
  });

  it('у трейса до этапа 6c — только поиск и effort', () => {
    const log = new EventLog().add(sessionStarted('tool'));

    expect(sessionChips(log.events).map((chip) => chip.label)).toEqual([
      'поиск: модель',
      'effort high',
    ]);
  });

  it('без демо-проекта — чип режима, без поиска', () => {
    const started = sessionStarted('tool');
    const log = new EventLog().add(
      started.type === 'session_started' ? { ...started, demoProject: false } : started,
    );

    expect(sessionChips(log.events).map((chip) => chip.label)).toEqual([
      'без демо-проекта',
      'effort high',
    ]);
  });

  it('режим оркестрации — выделенным чипом, без чипа поиска', () => {
    const started = sessionStarted('tool');
    const log = new EventLog().add(
      started.type === 'session_started' ? { ...started, orchestration: 'pipeline' } : started,
    );

    expect(sessionChips(log.events)).toEqual([
      { label: 'оркестрация: пайплайн', on: true },
      { label: 'effort high', on: false },
    ]);
  });
});

describe('sessionChips: субагенты и ветка', () => {
  it('субагенты включены, а модель справилась сама — «не понадобились»', () => {
    const log = new EventLog()
      .add(sessionStarted('tool', { agents: ['researcher'], parallel: true }))
      .add({ type: 'assistant_message', text: 'VPN нужен для внутренних систем.' });

    expect(sessionChips(log.events)[0]).toEqual({
      label: 'субагенты: researcher · не понадобились',
      on: false,
    });
  });

  it('поручения были — их число в чипе', () => {
    const log = new EventLog()
      .add(sessionStarted('tool', { agents: ['researcher'], parallel: true }))
      .add(subagentStarted('researcher-1', 'call-1'));

    expect(sessionChips(log.events)[0]?.label).toBe('субагенты: researcher · поручений 1');
  });

  it('ветка — первым чипом: от какой сессии, с какого шага, что поменяли', () => {
    const log = new EventLog().add(sessionStarted('tool')).add({
      type: 'branch_started',
      sourceTracePath: 'traces/x_5930b821.jsonl',
      sourceSessionId: '5930b821',
      step: 4,
      replayedSteps: 3,
      replayedMessages: 11,
      change: {
        kind: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'kedr__read_document',
        before: 'FAQ',
        after: 'не найден',
      },
    });
    expect(sessionChips(log.events)[0]).toEqual({
      label: '⑂ ветка от 5930b821 · шаг 4 · результат kedr__read_document изменён',
      on: true,
    });
  });
});
