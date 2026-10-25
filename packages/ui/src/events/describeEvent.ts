// Короткая строка о событии для списка; полное событие — по клику, в JSON.
// Термины индустрии — по-английски (docs/code-style.md, «Термины в терминале и интерфейсе»).

import type { HarnessEvent, HarnessEventType, TokenUsage } from '@harness-visualization/harness';
import { plural } from '../text/plural';
import type { EventOfType } from './eventTypes';

const SKILL_TRIGGERS = {
  always: 'харнесс при старте',
  model: 'модель тулом load_skill',
  user: 'пользователь командой /имя',
} as const;

const MODEL_REQUESTS = { one: 'запрос', few: 'запроса', many: 'запросов' };

// Для каждого типа — своя функция, и tsc знает поля события этого типа.
type Describers = { [Type in HarnessEventType]: (event: EventOfType<Type>) => string };

const SUMMARY_LIMIT = 240;

const DESCRIBERS: Describers = {
  session_started: (event) =>
    `${event.model}, reasoning effort ${event.reasoningEffort}, retrieval ${event.retrievalMode}`,
  workspace_prepared: (event) => event.directory + (event.wasReset ? ' (пересоздан)' : ''),
  mcp_server_starting: (event) => `${event.serverName}: ${event.command} ${event.args.join(' ')}`,
  mcp_server_ready: (event) =>
    `${event.serverName}: ${String(event.tools.length)} тулов за ${String(event.durationMs)} мс`,
  mcp_server_failed: (event) => `${event.serverName}: ${event.message}`,
  mcp_message: (event) =>
    `${event.serverName} ${event.direction === 'to_server' ? '→' : '←'} ${describeMcpMessage(event.message)}`,
  mcp_server_log: (event) => `${event.serverName}: ${event.text}`,
  mcp_server_stopped: (event) => event.serverName,
  network_request: (event) => `${event.host}, ${event.viaProxy ? 'через прокси' : 'напрямую'}`,
  user_message: (event) => event.text,
  query_rewritten: (event) =>
    `query «${event.query}»${event.usedFallback ? ' (fallback: вопрос как есть)' : ''}`,
  context_retrieved: (event) =>
    `${event.toolName}, query от ${event.queryAuthor}: ${event.status}, ${String(event.durationMs)} мс`,
  grounding_check_started: (event) =>
    `${event.sourceTracePath}: ${String(event.claimCount)} claims, судья ${event.judgeModel}`,
  claim_judged: (event) => `#${String(event.claimNumber)} ${event.verdict}: ${event.claim}`,
  prompt_assembled: (event) =>
    `${String(event.messages.length)} messages, ${String(event.toolNames.length)} тулов`,
  model_request: (event) =>
    event.iteration === null ? event.purpose : `${event.purpose}, шаг ${String(event.iteration)}`,
  model_response: (event) =>
    [
      event.reply.finishReason,
      describeUsage(event.reply.usage),
      event.cost === null ? null : formatMoney(event.cost.total, event.cost.currency),
      `${String(event.durationMs)} мс`,
    ]
      .filter((part) => part !== null)
      .join(' · '),
  model_error: (event) => event.message,
  tool_call: (event) => `${event.toolName} ${event.argumentsText}`,
  permission_evaluated: (event) => `${event.decision}: ${event.reason}`,
  permission_requested: (event) => event.actionDescription,
  permission_resolved: (event) =>
    `${event.approved ? 'разрешено' : 'запрещено'}, answeredBy ${event.answeredBy}, ждали ${String(event.waitedForUserMs)} мс`,
  tool_result: (event) => `${event.status}, ${String(event.durationMs)} мс: ${event.content}`,
  assistant_message: (event) => event.text,
  tool_result_truncated: (event) =>
    `${event.toolName}: обрезан харнессом ≈${String(event.originalTokens)} → ≈${String(event.keptTokens)} токенов`,
  tool_results_cleared: (event) =>
    `убрано результатов тулов: ${String(event.cleared.length)}, prompt ≈${String(event.beforeTokens)} → ≈${String(event.afterTokens)}`,
  history_compacted: (event) =>
    `сводка вместо ${String(event.replacedMessages)} сообщений, prompt ≈${String(event.beforeTokens)} → ≈${String(event.afterTokens)}`,
  skill_catalog: (event) =>
    event.skills.length === 0
      ? `скиллов нет (${event.directory})`
      : `скиллы: ${event.skills.map((skill) => `${skill.name} (${skill.mode})`).join(', ')}`,
  skill_loaded: (event) => `скилл ${event.name} загружен: ${SKILL_TRIGGERS[event.trigger]}`,
  memory_loaded: (event) =>
    event.memoCharacters === null
      ? `памяти ещё нет (${event.memoPath})`
      : `${event.memoPath} в system prompt: ${String(event.memoCharacters)} симв., файлов памяти ${String(event.files.length)}`,
  memory_updated: (event) =>
    `память: ${event.command} ${event.path}${event.newPath === null ? '' : ` → ${event.newPath}`}`,
  awaiting_question: (event) => `ход ${String(event.turn)} закончен, ждём следующий вопрос`,
  session_finished: (event) =>
    [
      `${plural(event.modelRequests, MODEL_REQUESTS)} к модели`,
      describeUsage(event.usage),
      event.modelCost === null
        ? null
        : formatMoney(event.modelCost.total, event.modelCost.currency),
      `${String(event.durationMs)} мс`,
    ]
      .filter((part) => part !== null)
      .join(' · '),
  error: (event) => event.message,
};

export function describeEvent(event: HarnessEvent): string {
  // TypeScript не связывает тип события с ключом таблицы сам — помогаем приведением.
  const describe = DESCRIBERS[event.type] as (event: HarnessEvent) => string;
  const text = describe(event).replaceAll('\n', ' ');
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}…` : text;
}

export function describeUsage(usage: TokenUsage): string {
  return `input ${formatNumber(usage.inputTokens)} (cache hit ${formatNumber(usage.inputCacheHitTokens)}), output ${formatNumber(usage.outputTokens)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function formatMoney(value: number, currency: string): string {
  return `${value.toFixed(6)} ${currency}`;
}

function describeMcpMessage(message: unknown): string {
  if (typeof message !== 'object' || message === null) {
    return '';
  }
  if ('method' in message && typeof message.method === 'string') {
    return message.method;
  }
  return 'id' in message ? `ответ на ${String(message.id)}` : '';
}
