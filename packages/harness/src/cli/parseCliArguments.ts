// Разбирает аргументы командной строки:
//   pnpm chat "Сколько дней отпуска положено?"
//   pnpm chat --effort off "вопрос"   — уровень рассуждений: off, low, high, max
//   pnpm chat --search yandex "вопрос" — поисковый провайдер: tavily или yandex
//   pnpm chat --retrieval auto "вопрос" — кто ищет в базе знаний: tool (модель), auto (харнесс
//                                        словами пользователя), rewrite (харнесс запросом модели)
//   pnpm chat --retrieval auto --retrieval-tool kedr__hybrid_search "вопрос" — каким тулом ищет харнесс
//   pnpm chat --fresh "вопрос"        — начать с чистой рабочей папки (пересоздать из примеров)
//   pnpm chat --verbose "вопрос"      — печатать и полные события в JSON

import { parseArgs } from 'node:util';
import { REASONING_EFFORTS, type ReasoningEffort } from '../model/chatTypes.js';
import {
  RETRIEVAL_MODES,
  SEARCH_PROVIDER_NAMES,
  type RetrievalMode,
  type SearchProviderName,
} from '../settings/settingsSchema.js';

export interface CliOptions {
  // null — вопрос не передан, спросим его интерактивно.
  question: string | null;
  // null — флаг не передан, берём уровень из harness.config.json.
  reasoningEffort: ReasoningEffort | null;
  // null — флаг не передан, берём провайдера из harness.config.json.
  searchProvider: SearchProviderName | null;
  // null — флаг не передан, берём режим из harness.config.json.
  retrievalMode: RetrievalMode | null;
  // null — тул поиска харнесса из harness.config.json (retrieval.toolName).
  retrievalToolName: string | null;
  freshWorkspace: boolean;
  verbose: boolean;
}

export function parseCliArguments(argumentList: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argumentList,
    allowPositionals: true,
    options: {
      effort: { type: 'string' },
      search: { type: 'string' },
      retrieval: { type: 'string' },
      'retrieval-tool': { type: 'string' },
      fresh: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
  });
  const question = positionals.join(' ').trim();
  return {
    question: question === '' ? null : question,
    reasoningEffort: values.effort === undefined ? null : parseReasoningEffort(values.effort),
    searchProvider: values.search === undefined ? null : parseSearchProvider(values.search),
    retrievalMode: values.retrieval === undefined ? null : parseRetrievalMode(values.retrieval),
    retrievalToolName: values['retrieval-tool'] ?? null,
    freshWorkspace: values.fresh,
    verbose: values.verbose,
  };
}

function parseSearchProvider(value: string): SearchProviderName {
  const matchingProvider = SEARCH_PROVIDER_NAMES.find((providerName) => providerName === value);
  if (matchingProvider === undefined) {
    throw new Error(
      `Неизвестный поисковый провайдер «${value}». Допустимые: ${SEARCH_PROVIDER_NAMES.join(', ')}.`,
    );
  }
  return matchingProvider;
}

function parseRetrievalMode(value: string): RetrievalMode {
  const matchingMode = RETRIEVAL_MODES.find((mode) => mode === value);
  if (matchingMode === undefined) {
    throw new Error(
      `Неизвестный режим поиска «${value}». Допустимые: ${RETRIEVAL_MODES.join(', ')}.`,
    );
  }
  return matchingMode;
}

function parseReasoningEffort(value: string): ReasoningEffort {
  const matchingEffort = REASONING_EFFORTS.find((effort) => effort === value);
  if (matchingEffort === undefined) {
    throw new Error(
      `Неизвестный уровень reasoning effort «${value}». Допустимые: ${REASONING_EFFORTS.join(', ')}.`,
    );
  }
  return matchingEffort;
}
