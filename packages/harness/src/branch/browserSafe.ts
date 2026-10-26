// Ветки без зависимостей от Node — для интерфейса (@harness-visualization/harness/branch):
// какие шаги есть у трейса и какие результаты тулов к шагу можно подменить.

export {
  listBranchSteps,
  prepareBranchPoint,
  type BranchEdit,
  type BranchPoint,
  type BranchStep,
} from './branchPoint.js';
export { fromWireMessages } from '../model/fromWireFormat.js';
