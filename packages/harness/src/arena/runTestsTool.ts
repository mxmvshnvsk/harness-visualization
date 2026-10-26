// Тул run_tests (этап 10): модель сама решает, когда проверить себя. Запускает видимые тесты
// копии — node --test под моделью разрешений Node (runNodeTests.ts) — и отдаёт модели
// короткую сводку: сколько прошло, какие упали и почему. Сырой вывод — в трейс.

import { z } from 'zod';
import { defineTool } from '../tools/defineTool.js';
import type { Tool } from '../tools/toolTypes.js';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import { runNodeTests } from './runNodeTests.js';
import { summarizeTests, testDetails } from './testResults.js';

export function createRunTestsTool(settings: ArenaSettings): Tool {
  return defineTool({
    name: 'run_tests',
    description:
      'Запускает тесты проекта (node --test) в рабочей папке и возвращает, какие прошли и какие упали.',
    argumentsSchema: z.object({}),
    effects: ['execute'],
    describeAction: () => 'Запустить тесты проекта: node --test',
    async execute(_toolArguments, context) {
      const result = await runNodeTests({
        directory: context.workspace.rootDirectory,
        patterns: [],
        timeoutMs: settings.testTimeoutSeconds * 1000,
        outputMaxCharacters: settings.outputMaxCharacters,
        sandbox: settings,
      });
      return { content: summarizeTests(result), details: testDetails(result) };
    },
  });
}
