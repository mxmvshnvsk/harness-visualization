// Точка входа pnpm import-trace (этап 9.4): запись чужого харнесса — в наш трейс.
//   pnpm import-trace claude-code ~/.claude/projects/<проект>/<id>.jsonl
// Трейс появится в traces/ и откроется в интерфейсе, как наши прогоны. Ключи и домашняя
// папка в тексте маскируются при импорте.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertClaudeCode } from '../adapters/claudeCode.js';
import { writeImportedTrace } from '../adapters/writeImportedTrace.js';

async function main(): Promise<void> {
  const [format, sourcePath] = process.argv.slice(2);
  if (format !== 'claude-code' || sourcePath === undefined) {
    throw new Error('Укажите формат и файл: pnpm import-trace claude-code <файл>.jsonl');
  }
  const events = convertClaudeCode(await readFile(sourcePath, 'utf8'));
  const filePath = await writeImportedTrace(join(process.cwd(), 'traces'), events, 'cc');
  console.log(`Сохранено: ${filePath} (${String(events.length)} событий)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
