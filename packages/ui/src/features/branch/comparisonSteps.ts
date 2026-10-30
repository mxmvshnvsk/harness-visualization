import type { BranchNode } from '../../projections/branchTree';

export interface ComparisonSteps {
  left: number;
  right: number;
}

// Сравниваем один и тот же суффикс: шаг родителя против первого нового шага его ветки.
export function comparisonSteps(
  family: BranchNode[],
  leftFile: string,
  rightFile: string,
): ComparisonSteps | null {
  const left = family.find((node) => node.trace.file === leftFile);
  const right = family.find((node) => node.trace.file === rightFile);
  if (right?.parentFile === leftFile && right.trace.branch !== null) {
    return { left: right.trace.branch.step, right: 1 };
  }
  if (left?.parentFile === rightFile && left.trace.branch !== null) {
    return { left: 1, right: left.trace.branch.step };
  }
  return null;
}
