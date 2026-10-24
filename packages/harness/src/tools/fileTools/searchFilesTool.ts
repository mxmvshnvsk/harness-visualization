// Тул search_files: ищет текст во всех файлах песочницы, без учёта регистра.
// Это поиск по словам; поиск по смыслу появится на этапе 5.

import { z } from 'zod';
import type { Workspace } from '../../workspace/Workspace.js';
import { defineTool } from '../defineTool.js';

const MAX_MATCHES = 50;
const MAX_FILE_BYTES = 1_000_000;
const MAX_LINE_LENGTH = 200;

interface SearchRequest {
  workspace: Workspace;
  query: string;
  directory: string;
}

export const searchFilesTool = defineTool({
  name: 'search_files',
  description:
    'Ищет текст во всех файлах указанной папки без учёта регистра. ' +
    'Возвращает совпавшие строки в формате путь:номер_строки: текст.',
  argumentsSchema: z.object({
    query: z.string().min(1).describe('Искомый текст, например «отпуск»'),
    path: z
      .string()
      .default('.')
      .describe('Папка, в которой искать; по умолчанию — вся рабочая папка'),
  }),
  effects: ['read'],
  describeAction: (toolArguments) =>
    `Искать «${toolArguments.query}» в папке ${toolArguments.path}`,
  targets: (toolArguments) => [{ kind: 'path', path: toolArguments.path }],
  async execute(toolArguments, context) {
    const matches = await findMatches({
      workspace: context.workspace,
      query: toolArguments.query,
      directory: toolArguments.path,
    });
    if (matches.length === 0) {
      return `Совпадений с «${toolArguments.query}» не найдено`;
    }
    const lines = matches.slice(0, MAX_MATCHES);
    if (matches.length > MAX_MATCHES) {
      lines.push(`[показаны первые ${MAX_MATCHES} из ${matches.length} совпадений]`);
    }
    return lines.join('\n');
  },
});

async function findMatches(request: SearchRequest): Promise<string[]> {
  const normalizedQuery = request.query.toLocaleLowerCase();
  const entries = await request.workspace.listEntries(request.directory);
  const matches: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory || entry.sizeBytes > MAX_FILE_BYTES) {
      continue;
    }
    const fileText = await request.workspace.readText(entry.path);
    matches.push(...findMatchingLines(entry.path, fileText, normalizedQuery));
  }
  return matches;
}

function findMatchingLines(filePath: string, fileText: string, normalizedQuery: string): string[] {
  const matchingLines: string[] = [];
  const lines = fileText.split('\n');
  lines.forEach((line, lineIndex) => {
    if (line.toLocaleLowerCase().includes(normalizedQuery)) {
      const shortLine = line.trim().slice(0, MAX_LINE_LENGTH);
      matchingLines.push(`${filePath}:${lineIndex + 1}: ${shortLine}`);
    }
  });
  return matchingLines;
}
