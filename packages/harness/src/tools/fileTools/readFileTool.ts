// Тул read_file: читает текстовый файл из песочницы.

import { z } from 'zod';
import { defineTool } from '../defineTool.js';

// Большой файл целиком в контекст не кладём: он съест бюджет токенов.
// Подробнее об обрезке результатов — на этапе 6.
const MAX_CHARACTERS = 20_000;

export const readFileTool = defineTool({
  name: 'read_file',
  description:
    'Читает текстовый файл из рабочей папки и возвращает его содержимое. ' +
    `Файлы длиннее ${MAX_CHARACTERS} символов обрезаются.`,
  argumentsSchema: z.object({
    path: z.string().min(1).describe('Путь к файлу от корня рабочей папки, например notes/plan.md'),
  }),
  async execute(toolArguments, context) {
    const text = await context.workspace.readText(toolArguments.path);
    if (text.length <= MAX_CHARACTERS) {
      return text;
    }
    const shownPart = text.slice(0, MAX_CHARACTERS);
    return `${shownPart}\n\n[Файл обрезан: показано ${MAX_CHARACTERS} из ${text.length} символов]`;
  },
});
