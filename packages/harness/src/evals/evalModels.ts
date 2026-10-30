import type { ModelDialect } from '../settings/modelRegistrySchema.js';
import type { EvalReport, TrialResult } from './evalReport.js';

// Снимок выбранной модели не зависит от последующих правок реестра или .env.
export interface EvalModel {
  key: string;
  label: string;
  model: string;
  providerName: string;
  baseUrl: string;
  dialect?: ModelDialect;
}

export function evalModelLabel(model: EvalModel): string {
  const name = model.label === model.model ? model.label : `${model.label} (${model.model})`;
  return `${name} · ${model.providerName}`;
}

export function evalReportModelLabel(report: EvalReport): string {
  const labels = report.configs.map((config) =>
    config.model === undefined ? report.model : evalModelLabel(config.model),
  );
  return labels.length === 0 ? report.model : [...new Set(labels)].join(', ');
}

export function evalConfigModelLabel(report: EvalReport, configName: string): string {
  const config = report.configs.find((entry) => entry.name === configName);
  const model = config?.model;
  const label = model === undefined ? report.model : evalModelLabel(model);
  const effort = config?.reasoningEffort ?? report.reasoningEffort;
  return `${label} · effort ${effort}`;
}

export function evalTrialModelLabel(report: EvalReport, trial: TrialResult): string {
  const config = report.configs.find((entry) => entry.name === trial.config);
  const label = evalConfigModelLabel(report, trial.config);
  const requestedModel = config?.model?.model ?? report.model;
  const actualModels = trial.actualModels?.filter((model) => model !== requestedModel) ?? [];
  if (actualModels.length === 0) {
    return label;
  }
  return `${label} · в ответах API: ${actualModels.join(', ')}`;
}

export function evalJudgeLabel(report: EvalReport): string {
  if (report.judgeModel === undefined) {
    return report.judgeTracePath === null
      ? 'Судья выключен.'
      : 'Модель судьи не записана в старом отчёте.';
  }
  if (report.judgeModel === null) {
    return 'Судья выключен.';
  }
  return `Судья: ${evalModelLabel(report.judgeModel)} · effort off · один для всех конфигураций.`;
}
