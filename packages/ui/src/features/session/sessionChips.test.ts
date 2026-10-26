import { describe, expect, it } from 'vitest';
import { EventLog, sessionStarted } from '../../projections/testEvents';
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
