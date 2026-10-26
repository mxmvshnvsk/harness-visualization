// Какой харнесс записал файл — по содержимому: экспорт OpenCode — один JSON с info.id ses_…,
// запись Claude Code — JSONL. Перевод — в наши события.

import type { HarnessEvent } from '../events/harnessEvents.js';
import { convertClaudeCode } from './claudeCode.js';
import { convertOpenCode, isOpenCodeExport } from './openCode.js';

export type ImportFormat = 'claude-code' | 'opencode';

export function detectImportFormat(text: string): ImportFormat {
  try {
    if (isOpenCodeExport(JSON.parse(text))) {
      return 'opencode';
    }
  } catch {
    // Не один JSON — значит, JSONL.
  }
  return 'claude-code';
}

export function convertImported(text: string, format: ImportFormat | 'auto'): HarnessEvent[] {
  // Пустой файл — частая история: `opencode session export … > файл` при ненайденной команде
  // создаёт файл до ошибки. Без проверки разбор падает «Unexpected end of JSON input».
  if (text.trim() === '') {
    throw new Error(
      'Файл пустой: запись не сохранилась. Если файл делали командой с «>», проверьте, что сама команда сработала (например, opencode есть в PATH).',
    );
  }
  const resolved = format === 'auto' ? detectImportFormat(text) : format;
  return resolved === 'opencode' ? convertOpenCode(text) : convertClaudeCode(text);
}

// Префикс в имени трейса: чей это импорт.
export const IMPORT_PREFIXES: Record<ImportFormat, string> = {
  'claude-code': 'cc',
  opencode: 'oc',
};
