// Шкала графика «Контекст»: до какого числа токенов тянется ось и какие деления подписать.

import type { ContextRequest } from '../../projections/projectContext';

export const PARTS = [
  { key: 'system', label: 'system', color: 'var(--part-system)' },
  { key: 'tools', label: 'описания тулов', color: 'var(--part-tools)' },
  { key: 'dialog', label: 'диалог', color: 'var(--part-dialog)' },
  { key: 'toolResults', label: 'результаты тулов', color: 'var(--part-results)' },
] as const;

export interface Scale {
  max: number;
  ticks: number[];
  // Лимит и порог влезают в ось — их рисуем линиями; иначе пишем числом в подписи.
  showLimit: boolean;
  showThreshold: boolean;
}

// Ось — по самому большому prompt. Порог и лимит тянут её вверх, только если они рядом:
// на пресете real (лимит 1 000 000) столбики иначе превратились бы в полоски у нуля.
export function contextScale(requests: readonly ContextRequest[]): Scale {
  const data = Math.max(1, ...requests.map(peakOf));
  const first = requests[0];
  const limit = first?.budget.limitTokens ?? 0;
  const threshold = first?.budget.thresholdTokens ?? 0;
  const showThreshold = threshold > 0 && threshold <= data * 3;
  const showLimit = showThreshold && limit <= data * 3;
  const top = Math.max(data, showThreshold ? threshold : 0, showLimit ? limit : 0) * 1.08;
  const step = niceStep(top / 4);
  const max = Math.ceil(top / step) * step;
  return { max, ticks: ticksOf(max, step), showLimit, showThreshold };
}

function peakOf(request: ContextRequest): number {
  return Math.max(request.budget.estimate.total, request.exactTokens ?? 0);
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= raw) ?? 10;
  return nice * power;
}

function ticksOf(max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    ticks.push(value);
  }
  return ticks;
}

export function formatTokens(value: number): string {
  return value.toLocaleString('ru-RU');
}

// Коротко для делений оси: 12 000 → «12 тыс.».
export function formatTick(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('ru-RU')} млн`;
  }
  return value >= 1000 ? `${(value / 1000).toLocaleString('ru-RU')} тыс.` : String(value);
}

export function errorPercent(request: ContextRequest): number | null {
  const exact = request.exactTokens;
  if (exact === null || exact === 0) {
    return null;
  }
  return Math.round(((request.budget.estimate.total - exact) / exact) * 100);
}

export function cachePercent(request: ContextRequest): number | null {
  const { exactTokens, cacheHitTokens } = request;
  if (exactTokens === null || cacheHitTokens === null || exactTokens === 0) {
    return null;
  }
  return Math.round((cacheHitTokens / exactTokens) * 100);
}

// Что харнесс сделал с контекстом перед запросом — по-человечески, для подсказки и таблицы.
export function actionsOf(request: ContextRequest): string[] {
  const actions: string[] = [];
  if (request.truncated > 0) {
    actions.push(`обрезал результатов: ${String(request.truncated)}`);
  }
  if (request.cleared > 0) {
    actions.push(`убрал старых результатов: ${String(request.cleared)}`);
  }
  if (request.compacted) {
    actions.push('сжал историю в сводку');
  }
  return actions;
}
