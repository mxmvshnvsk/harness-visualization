// Данные лаборатории evals с сервера: наборы задач, список прогонов и выбранный отчёт.
// Отчёт идущего прогона дописывается после каждой попытки — его можно перечитать.

import type { EvalReport } from '@harness-visualization/harness/evals';
import type { EvalsResponse } from '@harness-visualization/server';
import { getEvalReport, getEvals } from '../../api/serverApi';
import { useLoaded, type Loaded } from '../rag/useRagData';

export function useEvals(): Loaded<EvalsResponse> {
  return useLoaded(getEvals, []);
}

export function useEvalReport(file: string, version: number): Loaded<EvalReport> {
  return useLoaded(() => getEvalReport(file), [file, version]);
}
