// Точка входа pnpm import-trace (этап 9.4): запись чужого харнесса — в наш трейс.
//   pnpm import-trace claude-code ~/.claude/projects/<проект>/<id>.jsonl
//                             — записи субагентов из <id>/subagents/ подхватываются сами
//   pnpm import-trace opencode session.json   — экспорт `opencode session export` (OpenCode 2.x)
//   pnpm import-trace auto <файл>             — формат по содержимому
// Трейс появится в traces/ и откроется в интерфейсе, как наши прогоны. Ключи и домашняя
// папка в тексте маскируются при импорте.

import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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
  const main = await readFile(sourcePath, 'utf8');
  const resolved = known === 'auto' ? detectImportFormat(main) : known;
  const subagents = resolved === 'claude-code' ? await readSubagents(sourcePath) : [];
  if (subagents.length > 0) {
    console.log(`Записи субагентов: ${String(subagents.length)} из папки subagents/`);
  }
  const events = convertImported([main, ...subagents].join('\n'), resolved);
  const filePath = await writeImportedTrace(
    join(process.cwd(), 'traces'),
    events,
    IMPORT_PREFIXES[resolved],
  );
  console.log(`Сохранено: ${filePath} (${String(events.length)} событий)`);
}

// Claude Code 2.1 пишет субагентов рядом: <id>.jsonl и папка <id>/subagents/agent-*.jsonl.
// Строки субагентов помечены isSidechain и agentId — их достаточно дописать к главной записи.
async function readSubagents(sourcePath: string): Promise<string[]> {
  const folder = join(dirname(sourcePath), basename(sourcePath, '.jsonl'), 'subagents');
  const names = await readdir(folder).catch(() => []);
  const files = names.filter((name) => name.startsWith('agent-') && name.endsWith('.jsonl'));
  return Promise.all(files.sort().map((name) => readFile(join(folder, name), 'utf8')));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
