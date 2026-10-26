// Точка входа pnpm import-trace (этап 9.4): запись чужого харнесса — в наш трейс.
//   pnpm import-trace claude-code ~/.claude/projects/<проект>/<id>.jsonl
//   pnpm import-trace opencode session.json   — экспорт `opencode session export` (OpenCode 2.x)
//   pnpm import-trace auto <файл>             — формат по содержимому
// Трейс появится в traces/ и откроется в интерфейсе, как наши прогоны. Ключи и домашняя
// папка в тексте маскируются при импорте.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  convertImported,
  detectImportFormat,
  IMPORT_PREFIXES,
  type ImportFormat,
} from '../adapters/importTrace.js';
import { writeImportedTrace } from '../adapters/writeImportedTrace.js';

const FORMATS: readonly (ImportFormat | 'auto')[] = ['claude-code', 'opencode', 'auto'];

async function main(): Promise<void> {
  const [format, sourcePath] = process.argv.slice(2);
  const known = FORMATS.find((item) => item === format);
  if (known === undefined || sourcePath === undefined) {
    throw new Error(
      `Укажите формат (${FORMATS.join(', ')}) и файл: pnpm import-trace opencode session.json`,
    );
  }
  const text = await readFile(sourcePath, 'utf8');
  const resolved = known === 'auto' ? detectImportFormat(text) : known;
  const events = convertImported(text, resolved);
  const filePath = await writeImportedTrace(
    join(process.cwd(), 'traces'),
    events,
    IMPORT_PREFIXES[resolved],
  );
  console.log(`Сохранено: ${filePath} (${String(events.length)} событий)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
