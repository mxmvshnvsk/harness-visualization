// Evals без зависимостей от Node — для интерфейса (@harness-visualization/harness/evals):
// типы набора и отчёта, подписи проверок и итоги pass@k / pass^k.

export {
  describeCheck,
  EVAL_SUITES,
  type EvalCheck,
  type EvalSet,
  type EvalSuite,
  type EvalTask,
} from './evalSet.js';
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
  type ReportTask,
  type TrialResult,
} from './evalReport.js';
export {
  compareReports,
  passRate,
  type CellChange,
  type CellComparison,
  type ReportComparison,
} from './compareReports.js';
