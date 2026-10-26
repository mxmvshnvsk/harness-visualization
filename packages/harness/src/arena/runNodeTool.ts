// Тул run_node (этап 10.4): запустить свою программу — node <файл> [аргументы] — в той же
// песочнице, что и тесты. Агентам арены этого не хватало: в прогонах 26.10.2026 они писали
// временные скрипты сравнить старую и новую реализацию — и запустить их было нечем.
// Каждый запуск харнесс по умолчанию спрашивает у пользователя (permissions.tools.run_node:
// ask): это код модели на вашей машине. Без терминала и без браузера спросить некого — запрет.

import { extname } from 'node:path';
import { z } from 'zod';
import { ToolError } from '../tools/ToolError.js';
import { defineTool } from '../tools/defineTool.js';
import type { Tool } from '../tools/toolTypes.js';
import type { ArenaSettings } from '../settings/settingsSchema.js';
import { networkClosedByPermissions, runSandboxedNode, truncate } from './nodeSandbox.js';

const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs'];

export function createRunNodeTool(settings: ArenaSettings): Tool {
  return defineTool({
    name: 'run_node',
    description:
      'Запускает JavaScript-файл из рабочей папки: node <файл> [аргументы]. Возвращает код выхода и вывод. Сеть и установка пакетов недоступны.',
    argumentsSchema: z.object({
      file: z.string().min(1).describe('Файл от корня рабочей папки, например scripts/check.mjs'),
      args: z.array(z.string()).max(20).default([]).describe('Аргументы командной строки'),
    }),
    effects: ['execute'],
    describeAction: (toolArguments) =>
      `Запустить на вашей машине: node ${[toolArguments.file, ...toolArguments.args].join(' ')}`,
    targets: (toolArguments) => [{ kind: 'path', path: toolArguments.file }],
    async checkBeforeExecution(toolArguments, context) {
      if (!SCRIPT_EXTENSIONS.includes(extname(toolArguments.file))) {
        throw new ToolError(`Запускать можно только ${SCRIPT_EXTENSIONS.join(', ')}`);
      }
      await context.workspace.assertExistingFile(toolArguments.file);
    },
    async execute(toolArguments, context) {
      const run = await runSandboxedNode({
        directory: context.workspace.rootDirectory,
        // «--» — дальше аргументы программы, а не флаги Node: модель не включит себе --allow-*.
        args: ['--', toolArguments.file, ...toolArguments.args],
        timeoutMs: settings.testTimeoutSeconds * 1000,
      });
      const output = truncate(run.output, settings.outputMaxCharacters);
      const head = run.timedOut
        ? 'Программа не уложилась в отведённое время и остановлена.'
        : `Код выхода: ${String(run.exitCode)}.`;
      return {
        content: `${head}\n${output === '' ? '(вывода нет)' : output}`,
        details: {
          file: toolArguments.file,
          args: toolArguments.args,
          exitCode: run.exitCode,
          timedOut: run.timedOut,
          durationMs: run.durationMs,
          network: networkClosedByPermissions() ? 'closed' : 'open',
          output,
        },
      };
    },
  });
}
