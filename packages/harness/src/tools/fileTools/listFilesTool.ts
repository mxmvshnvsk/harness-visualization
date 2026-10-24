// Тул list_files: показывает, какие файлы и папки есть в песочнице.
// Без него модели неоткуда узнать, что вообще можно прочитать.

import { z } from 'zod';
import type { WorkspaceEntry } from '../../workspace/Workspace.js';
import { defineTool } from '../defineTool.js';

const MAX_ENTRIES = 200;

export const listFilesTool = defineTool({
  name: 'list_files',
  description:
    'Показывает все файлы и папки внутри указанной папки рабочей папки, включая вложенные.',
  argumentsSchema: z.object({
    path: z
      .string()
      .default('.')
      .describe('Папка от корня рабочей папки; по умолчанию — сам корень'),
  }),
  async execute(toolArguments, context) {
    const entries = await context.workspace.listEntries(toolArguments.path);
    if (entries.length === 0) {
      return `Папка ${toolArguments.path} пуста`;
    }
    const lines = entries.slice(0, MAX_ENTRIES).map(describeEntry);
    if (entries.length > MAX_ENTRIES) {
      lines.push(`[показаны первые ${MAX_ENTRIES} из ${entries.length}]`);
    }
    return lines.join('\n');
  },
});

function describeEntry(entry: WorkspaceEntry): string {
  if (entry.isDirectory) {
    return `${entry.path}/`;
  }
  return `${entry.path} (${entry.sizeBytes} байт)`;
}
