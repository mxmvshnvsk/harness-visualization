// Evals без зависимостей от Node — для интерфейса (@harness-visualization/harness/evals):
// типы набора и отчёта, подписи проверок и итоги pass@k / pass^k.

export { describeCheck, type EvalCheck, type EvalSet, type EvalTask } from './evalSet.js';
export { readTrialFacts, runCodeCheck, type CheckResult, type TrialFacts } from './codeChecks.js';
export {
  EVAL_REPORT_VERSION,
  summarizeCell,
  summarizeConfig,
  trialPassed,
  type CellSummary,
  type ConfigSummary,
  type EvalConfig,
  type EvalReport,
  type TrialResult,
} from './evalReport.js';
