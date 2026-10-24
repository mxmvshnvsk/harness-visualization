// Тул write_file: создаёт или перезаписывает текстовый файл в песочнице.

import { z } from 'zod';
import { defineTool } from '../defineTool.js';

export const writeFileTool = defineTool({
  name: 'write_file',
  description:
    'Записывает текст в файл в рабочей папке. Если файл существует, он будет перезаписан. ' +
    'Недостающие папки создаются автоматически.',
  argumentsSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe('Путь к файлу от корня рабочей папки, например notes/answer.md'),
    content: z.string().describe('Полный текст файла'),
  }),
  effects: ['write'],
  describeAction: (toolArguments) => `Записать файл ${toolArguments.path}`,
  targets: (toolArguments) => [{ kind: 'path', path: toolArguments.path }],
  async execute(toolArguments, context) {
    const writtenBytes = await context.workspace.writeText(
      toolArguments.path,
      toolArguments.content,
    );
    return `Записано ${writtenBytes} байт в ${toolArguments.path}`;
  },
});
