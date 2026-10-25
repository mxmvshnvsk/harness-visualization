// Тул update_progress: модель присылает план целиком, харнесс проверяет его и пишет progress.md.
// Целиком, а не правками: так в каждом вызове виден весь план, и его нельзя «потерять» по частям.

import { z } from 'zod';
import { ToolError } from '../tools/ToolError.js';
import { defineTool } from '../tools/defineTool.js';
import type { Tool } from '../tools/toolTypes.js';
import { PROGRESS_PATH, STEP_STATUSES, type ProgressTracker } from './ProgressTracker.js';

const MAX_STEPS = 20;

const argumentsSchema = z.object({
  goal: z.string().min(1).max(200).describe('Цель — что должно получиться в конце'),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(160).describe('Шаг — коротко, глаголом'),
        status: z
          .enum(STEP_STATUSES)
          .describe(
            'pending — впереди, in_progress — делаешь сейчас, done — сделан, blocked — не выходит',
          ),
        note: z.string().max(300).optional().describe('Результат или почему заблокирован'),
      }),
    )
    .min(1)
    .max(MAX_STEPS)
    .describe('Все шаги плана по порядку, с текущими статусами'),
});

export function createProgressTool(tracker: ProgressTracker): Tool {
  return defineTool({
    name: 'update_progress',
    description:
      'План для задачи из нескольких шагов: цель и шаги со статусами. Составь план в начале ' +
      'такой задачи и присылай его целиком после каждого шага — харнесс хранит его в ' +
      `${PROGRESS_PATH} и вернёт тебе, если контекст сожмут. В работе — не больше одного шага.`,
    argumentsSchema,
    effects: ['write'],
    describeAction: (toolArguments) => `Обновить план «${toolArguments.goal}»`,
    targets: () => [{ kind: 'path', path: PROGRESS_PATH }],
    async execute(toolArguments) {
      const inProgress = toolArguments.steps.filter((step) => step.status === 'in_progress');
      if (inProgress.length > 1) {
        throw new ToolError(
          `В работе может быть только один шаг, а их ${String(inProgress.length)}: ${inProgress.map((step) => step.title).join('; ')}`,
        );
      }
      const markdown = await tracker.update(toolArguments);
      return { content: `План сохранён в ${PROGRESS_PATH}:\n\n${markdown}` };
    },
  });
}
