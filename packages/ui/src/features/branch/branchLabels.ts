// Подписи веток: узел дерева и «эта сессия» — открытая живая ветка, ещё не ставшая трейсом.

import type { BranchNode } from '../../projections/branchTree';

export const CURRENT = '(эта сессия)';

export function describeNode(node: BranchNode): string {
  const { branch } = node.trace;
  if (branch === null || node.parentFile === null) {
    return 'исходная сессия';
  }
  const change = branch.change === 'replay' ? 'переиграть' : 'результат тула изменён';
  return `⑂ с шага ${String(branch.step)} · ${change}`;
}
