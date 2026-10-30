import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evalConfigModelLabel,
  evalReportModelLabel,
  evalTrialModelLabel,
  evalJudgeLabel,
  type EvalReport,
  type EvalModel,
} from '@harness-visualization/harness/evals';

function legacyReport(): EvalReport {
  return JSON.parse(
    readFileSync(
      new URL('../../../../examples/evals/2026-10-26T08-02-42_kedr.json', import.meta.url),
      'utf8',
    ),
  ) as EvalReport;
}
const selected: EvalModel = {
  key: 'local',
  label: 'Локальная',
  model: 'local-test',
  baseUrl: 'https://local.test',
  providerName: 'Test provider',
};

describe('метаданные моделей в Evals', () => {
  it('старый отчёт использует записанную модель, без обращения к текущему реестру', () => {
    const report = legacyReport();
    const config = report.configs[0];
    expect(config).toBeDefined();
    expect(evalReportModelLabel(report)).toBe(report.model);
    expect(evalConfigModelLabel(report, config?.name ?? '')).toContain(report.model);
  });
  it('показывает модель и effort конкретной конфигурации', () => {
    const report = legacyReport();
    report.configs[0] = {
      name: 'tool@local',
      description: 'test',
      model: selected,
      reasoningEffort: 'low',
    };
    expect(evalConfigModelLabel(report, 'tool@local')).toBe(
      'Локальная (local-test) · Test provider · effort low',
    );
    expect(evalReportModelLabel(report)).toContain('Test provider');
  });
  it('отделяет запрошенную модель от фактического имени в ответе API', () => {
    const report = legacyReport();
    const trial = report.results[0];
    expect(trial).toBeDefined();
    if (trial === undefined) {
      throw new Error('В примере нет попыток');
    }
    trial.actualModels = ['different-model'];
    expect(evalTrialModelLabel(report, trial)).toContain('в ответах API: different-model');
  });
  it('не придумывает модель судьи в старых отчётах', () => {
    const report = legacyReport();
    report.judgeTracePath = 'legacy-judge.jsonl';
    expect(evalJudgeLabel(report)).toContain('не записана');
    report.judgeModel = selected;
    expect(evalJudgeLabel(report)).toContain('один для всех');
    report.judgeModel = null;
    expect(evalJudgeLabel(report)).toBe('Судья выключен.');
  });
});
