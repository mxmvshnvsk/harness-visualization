// Проходит события трейса по порядку и собирает, что модель видела по каждому источнику
// и на каком уровне. Уровень определяется тем, какой тул его показал:
//   - read_document, read_file, fetch_url — источник прочитан целиком (full);
//   - search, semantic_search, web_search, search_files — виден только фрагментом в выдаче (fragment);
//   - list_documents, list_files — виден только в каталоге (catalog).
// Найденное харнессом до запроса (context_retrieved) — тоже фрагменты в выдаче поиска.
// Побеждает самый сильный уровень: если документ сначала мелькнул в каталоге,
// а потом был прочитан целиком, останется full.

import type { HarnessEvent } from '../events/harnessEvents.js';
import type { SeenSource, SourceLevel } from './referenceTypes.js';

// Чем меньше число, тем сильнее уровень.
const LEVEL_RANK: Record<SourceLevel, number> = { full: 0, fragment: 1, catalog: 2, notSeen: 3 };

// Действие тула (без префикса MCP-сервера) → уровень, который он даёт источнику.
const FULL_READ_ACTIONS = ['read_document', 'read_file'];
const FRAGMENT_ACTIONS = ['search', 'semantic_search', 'web_search', 'search_files'];
const CATALOG_ACTIONS = ['list_documents', 'list_files'];

export type SeenSources = Map<string, SeenSource>;

export function collectSeenSources(events: HarnessEvent[]): SeenSources {
  const seen: SeenSources = new Map();
  const argumentsByToolCall = new Map<string, unknown>();
  for (const event of events) {
    if (event.type === 'tool_call') {
      argumentsByToolCall.set(event.toolCallId, event.arguments);
    }
    if (event.type === 'tool_result' && event.status === 'success') {
      recordToolResult(event, argumentsByToolCall.get(event.toolCallId), seen);
    }
    if (event.type === 'context_retrieved' && event.status === 'success') {
      for (const reference of extractListedReferences(event.content)) {
        remember(seen, reference, 'fragment', event.sequence);
      }
    }
  }
  return seen;
}

function recordToolResult(
  event: Extract<HarnessEvent, { type: 'tool_result' }>,
  toolArguments: unknown,
  seen: SeenSources,
): void {
  const action = stripServerPrefix(event.toolName);
  if (FULL_READ_ACTIONS.includes(action)) {
    remember(seen, readTarget(toolArguments), 'full', event.sequence);
    return;
  }
  if (action === 'fetch_url') {
    remember(seen, readTarget(toolArguments), 'full', event.sequence);
    return;
  }
  const listingLevel = listingLevelOf(action);
  if (listingLevel !== null) {
    for (const reference of extractListedReferences(event.content)) {
      remember(seen, reference, listingLevel, event.sequence);
    }
  }
}

// Тулы, которые показывают источник не целиком, а в списке: поиск — фрагментом, каталог — строкой.
function listingLevelOf(action: string): SourceLevel | null {
  if (FRAGMENT_ACTIONS.includes(action)) {
    return 'fragment';
  }
  if (CATALOG_ACTIONS.includes(action)) {
    return 'catalog';
  }
  return null;
}

// kedr__read_document → read_document; read_file → read_file.
function stripServerPrefix(toolName: string): string {
  const separatorIndex = toolName.indexOf('__');
  return separatorIndex === -1 ? toolName : toolName.slice(separatorIndex + 2);
}

// Что именно прочитал тул: id документа, путь к файлу или адрес страницы.
function readTarget(toolArguments: unknown): string | null {
  if (typeof toolArguments !== 'object' || toolArguments === null) {
    return null;
  }
  const fields = toolArguments as Record<string, unknown>;
  for (const key of ['id', 'path', 'url']) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return null;
}

// В выдаче поиска и каталоге id документа стоит первым словом строки:
//   regulations/remoteWork — Регламент удалённой работы (regulation, 2026-06-01)
const LINE_REFERENCE_PATTERN = /^\s*([A-Za-z][\w-]*(?:\/[\w.-]+)+)\b/;

function extractListedReferences(content: string): string[] {
  const references: string[] = [];
  for (const line of content.split('\n')) {
    const match = LINE_REFERENCE_PATTERN.exec(line);
    if (match?.[1] !== undefined) {
      references.push(match[1]);
    }
  }
  return references;
}

function remember(
  seen: SeenSources,
  reference: string | null,
  level: SourceLevel,
  eventSequence: number,
): void {
  if (reference === null) {
    return;
  }
  const key = normalizeReference(reference);
  const current = seen.get(key);
  if (current === undefined || LEVEL_RANK[level] < LEVEL_RANK[current.level]) {
    seen.set(key, { level, eventSequence });
  }
}

// id документа и путь к файлу различаются расширением: regulations/vacation и
// regulations/vacation.md — один источник. Сравниваем без расширения .md.
export function normalizeReference(reference: string): string {
  return reference.replace(/\.md$/, '');
}
