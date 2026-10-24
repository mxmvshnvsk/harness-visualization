// Тул delete_file: удаляет файл из песочницы — только с разрешения пользователя.

import { z } from 'zod';
import { defineTool } from '../defineTool.js';

export const deleteFileTool = defineTool({
  name: 'delete_file',
  description:
    'Удаляет файл из рабочей папки. Папки удалять нельзя. ' +
    'Харнесс может спросить разрешения у пользователя.',
  argumentsSchema: z.object({
    path: z.string().min(1).describe('Путь к файлу от корня рабочей папки, например notes/old.md'),
  }),
  effects: ['delete'],
  describeAction: (toolArguments) => `Удалить файл ${toolArguments.path}`,
  targets: (toolArguments) => [{ kind: 'path', path: toolArguments.path }],
  async checkBeforeExecution(toolArguments, context) {
    await context.workspace.assertExistingFile(toolArguments.path);
  },
  async execute(toolArguments, context) {
    await context.workspace.deleteFile(toolArguments.path);
    return `Файл ${toolArguments.path} удалён`;
  },
});
