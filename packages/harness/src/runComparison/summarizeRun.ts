// Показатели одного прогона — по трейсу сессии, теми же функциями, что и check-grounding.
// Трейс — источник правды: показатели можно пересчитать в любой момент.

import type { HarnessEvent } from '../events/harnessEvents.js';
import { checkGrounding } from '../grounding/checkGrounding.js';
import { collectSeenSources, normalizeReference } from '../grounding/collectSeenSources.js';
import type { SourceLevel } from '../grounding/referenceTypes.js';
import { classifyCacheWarmth, type CacheWarmth } from '../tokenomics/cacheWarmth.js';
import type { ComparisonQuestion } from './comparisonQuestions.js';

const READ_DOCUMENT_ACTION = 'read_document';

// Грубая проверка по тексту ответа, без модели-судьи (судья — этап 5b): модель
// говорит о противоречии, если называет старый FAQ, его «два дня» или само слово.
const CONTRADICTION_PATTERNS = [/противореч/i, /устар/i, /faq\/hrFaq/, /(два|двух|2)\s+дн/i];

export interface RunSummary {
  failed: boolean;
  modelRequests: number;
  inputTokens: number;
  inputCacheHitTokens: number;
  // null — цена хотя бы одного запроса неизвестна.
  costUsd: number | null;
  durationMs: number;
  // По какому запросу искал харнесс до запроса к модели; null — харнесс не искал (вариант tool).
  harnessQuery: string | null;
  // Прогрет ли кэш к первому шагу агента — то есть чужой сессией, а не этой; null — шагов не было.
  firstRequestCache: CacheWarmth | null;
  // Сколько тулов попросила модель (без поиска харнессом до запроса).
  toolCalls: number;
  // Документы, которые модель прочитала целиком, по порядку.
  documentsRead: string[];
  // Что модель видела из нужного документа — независимо от того, назвала ли его.
  expectedSeen: SourceLevel;
  // Назвала ли модель нужный документ в ответе.
  expectedCited: boolean;
  // null — в вопросе нет противоречия, считать нечего.
  mentionsContradiction: boolean | null;
}

export function summarizeRun(
  events: HarnessEvent[],
  question: ComparisonQuestion,
  failed: boolean,
): RunSummary {
  const answer = findAnswer(events);
  const expectedId = normalizeReference(question.expectedDocumentId);
  return {
    failed,
    ...readSessionTotals(events),
    firstRequestCache: readFirstRequestCache(events),
    harnessQuery: readHarnessQuery(events),
    toolCalls: events.filter((event) => event.type === 'tool_call').length,
    documentsRead: collectDocumentsRead(events),
    expectedSeen: collectSeenSources(events).get(expectedId)?.level ?? 'notSeen',
    expectedCited: answer !== null && citesDocument(events, expectedId),
    mentionsContradiction: question.hasContradiction ? mentionsContradiction(answer ?? '') : null,
  };
}

type SessionTotals = Pick<
  RunSummary,
  'modelRequests' | 'inputTokens' | 'inputCacheHitTokens' | 'costUsd' | 'durationMs'
>;

// Итоги — из события session_finished; если сессия оборвалась без него, считаем нули.
function readSessionTotals(events: HarnessEvent[]): SessionTotals {
  const finished = events.find((event) => event.type === 'session_finished');
  if (finished === undefined) {
    return {
      modelRequests: 0,
      inputTokens: 0,
      inputCacheHitTokens: 0,
      costUsd: null,
      durationMs: 0,
    };
  }
  return {
    modelRequests: finished.modelRequests,
    inputTokens: finished.usage.inputTokens,
    inputCacheHitTokens: finished.usage.inputCacheHitTokens,
    costUsd: finished.modelCost?.total ?? null,
    durationMs: finished.durationMs,
  };
}

// Первый шаг агента, а не первый запрос вообще: служебный запрос rewrite короткий,
// без тулов и с другим началом — его кэш ничего не говорит о прогретости контекста агента.
export function readFirstRequestCache(events: HarnessEvent[]): CacheWarmth | null {
  const firstAgentRequest = events.find(
    (event) => event.type === 'model_request' && event.purpose === 'agentStep',
  );
  const firstResponse = events.find(
    (event) =>
      event.type === 'model_response' &&
      firstAgentRequest?.type === 'model_request' &&
      event.requestId === firstAgentRequest.requestId,
  );
  if (firstResponse?.type !== 'model_response') {
    return null;
  }
  return classifyCacheWarmth(firstResponse.reply.usage);
}

function readHarnessQuery(events: HarnessEvent[]): string | null {
  const retrieved = events.find((event) => event.type === 'context_retrieved');
  const query = retrieved?.arguments['query'];
  return typeof query === 'string' ? query : null;
}

function findAnswer(events: HarnessEvent[]): string | null {
  const answers = events.filter((event) => event.type === 'assistant_message');
  return answers.at(-1)?.text ?? null;
}

function citesDocument(events: HarnessEvent[], documentId: string): boolean {
  return checkGrounding(events).references.some(
    (checked) => normalizeReference(checked.reference) === documentId,
  );
}

// id из успешных вызовов read_document: аргументы — в tool_call, статус — в tool_result.
function collectDocumentsRead(events: HarnessEvent[]): string[] {
  const requestedIds = new Map<string, string>();
  const documentsRead: string[] = [];
  for (const event of events) {
    if (event.type === 'tool_call' && event.toolName.endsWith(READ_DOCUMENT_ACTION)) {
      const documentId = readDocumentId(event.arguments);
      if (documentId !== null) {
        requestedIds.set(event.toolCallId, documentId);
      }
    }
    if (event.type === 'tool_result' && event.status === 'success') {
      const documentId = requestedIds.get(event.toolCallId);
      if (documentId !== undefined && !documentsRead.includes(documentId)) {
        documentsRead.push(documentId);
      }
    }
  }
  return documentsRead;
}

function readDocumentId(toolArguments: unknown): string | null {
  if (typeof toolArguments !== 'object' || toolArguments === null) {
    return null;
  }
  const value = (toolArguments as Record<string, unknown>)['id'];
  return typeof value === 'string' ? normalizeReference(value) : null;
}

function mentionsContradiction(answer: string): boolean {
  return CONTRADICTION_PATTERNS.some((pattern) => pattern.test(answer));
}
