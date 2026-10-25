// План сессии (этап 6b): модель присылает его тулом update_progress целиком — цель и шаги со
// статусами, харнесс проверяет и пишет progress.md в песочницу. План живёт в рамках сессии:
// файл прошлой сессии харнесс убирает при старте. После компакции харнесс вернёт план в prompt
// (этап 6b.4), поэтому модель не потеряет, что уже сделано, даже когда история сжата.
//
// Идея — как TodoWrite в Claude Code: модель ведёт список задач сама, а харнесс его хранит
// и показывает.

import type { EventStream } from '../events/EventStream.js';
import type { Workspace } from '../workspace/Workspace.js';

export const PROGRESS_PATH = 'progress.md';

export const STEP_STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface ProgressStep {
  title: string;
  status: StepStatus;
  // Что важно знать о шаге: результат, почему заблокирован.
  note?: string | undefined;
}

export interface ProgressPlan {
  goal: string;
  steps: ProgressStep[];
}

const MARKS: Record<StepStatus, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  done: '[x]',
  blocked: '[!]',
};

export class ProgressTracker {
  private plan: ProgressPlan | null = null;
  private version = 0;

  constructor(
    private readonly workspace: Workspace,
    private readonly events: EventStream,
  ) {}

  get current(): ProgressPlan | null {
    return this.plan;
  }

  // Файл прошлой сессии — не наш план: убираем, чтобы модель не приняла его за текущий.
  async reset(): Promise<boolean> {
    try {
      await this.workspace.deleteFile(PROGRESS_PATH);
      return true;
    } catch {
      return false;
    }
  }

  async update(plan: ProgressPlan): Promise<string> {
    this.plan = plan;
    this.version += 1;
    const markdown = renderProgress(plan);
    await this.workspace.writeText(PROGRESS_PATH, markdown);
    this.events.emit({
      type: 'progress_updated',
      path: PROGRESS_PATH,
      version: this.version,
      goal: plan.goal,
      steps: plan.steps.map((step) => ({ ...step, note: step.note ?? null })),
    });
    return markdown;
  }
}

export function renderProgress(plan: ProgressPlan): string {
  const done = plan.steps.filter((step) => step.status === 'done').length;
  return [
    `# План: ${plan.goal}`,
    '',
    `Сделано ${String(done)} из ${String(plan.steps.length)}.`,
    '',
    ...plan.steps.map(
      (step, index) =>
        `${String(index + 1)}. ${MARKS[step.status]} ${step.title}${step.note === undefined ? '' : ` — ${step.note}`}`,
    ),
    '',
  ].join('\n');
}
