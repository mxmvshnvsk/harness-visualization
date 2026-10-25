// Очистка старых результатов тулов (этап 6.4). Когда prompt дорастает до порога, харнесс
// заменяет самые старые результаты тулов заглушкой — сам вызов и ответ модели остаются, модель
// видит, что был вызов и что результат убран, и может вызвать тул ещё раз.
//
// Чистим сразу пачкой — до целевого размера ниже порога, а не по одному результату каждый раз:
// любая очистка меняет начало prompt, и кэш провайдера с этого места больше не совпадает.
// Реже и сразу больше — дешевле, чем понемногу на каждом шаге.
//
// Инструкции скиллов (load_skill, read_skill_file) не чистим: это не данные, а правила работы —
// без них модель забудет, по какому шаблону отвечает (этап 6b).

import type { ChatMessage, ToolResultMessage } from '../model/chatTypes.js';
import { SKILL_TOOLS } from './promptMarkers.js';

export interface ClearedToolResult {
  toolCallId: string;
  toolName: string;
  // Сколько занимал результат, ≈ токенов.
  tokens: number;
}

export interface ToolResultsClearing {
  cleared: ClearedToolResult[];
  // Оценка prompt до и после очистки, ≈ токенов.
  beforeTokens: number;
  afterTokens: number;
}

const STUB_PREFIX = '[Результат удалён харнессом';

export interface ClearingLimits {
  thresholdTokens: number;
  targetTokens: number;
  charsPerToken: number;
}

// estimateTotal — оценка всего prompt по текущей истории (тело запроса, как его соберёт провайдер).
// null — prompt ниже порога или убирать нечего.
export function clearOldToolResults(
  messages: ChatMessage[],
  estimateTotal: () => number,
  limits: ClearingLimits,
): ToolResultsClearing | null {
  const beforeTokens = estimateTotal();
  if (beforeTokens <= limits.thresholdTokens) {
    return null;
  }
  const names = toolNames(messages);
  const cleared: ClearedToolResult[] = [];
  let total = beforeTokens;
  const clearable = candidates(messages).filter(
    (message) => !SKILL_TOOLS.has(names.get(message.toolCallId) ?? ''),
  );
  for (const message of clearable) {
    if (total <= limits.targetTokens) {
      break;
    }
    const tokens = Math.round(message.content.length / limits.charsPerToken);
    const toolName = names.get(message.toolCallId) ?? 'тул';
    message.content = `${STUB_PREFIX}, чтобы освободить место в контексте: ${toolName}, было ≈${String(tokens)} токенов. Если он снова нужен — вызовите тул ещё раз.]`;
    cleared.push({ toolCallId: message.toolCallId, toolName, tokens });
    total = estimateTotal();
  }
  return cleared.length === 0 ? null : { cleared, beforeTokens, afterTokens: total };
}

// Кого можно убрать: результаты тулов от самых старых, кроме последних — их модель только что
// попросила и ещё не видела — и кроме уже убранных.
function candidates(messages: ChatMessage[]): ToolResultMessage[] {
  const lastAssistant = messages.findLastIndex((message) => message.role === 'assistant');
  return messages
    .slice(0, Math.max(0, lastAssistant))
    .filter(
      (message): message is ToolResultMessage =>
        message.role === 'tool' && !message.content.startsWith(STUB_PREFIX),
    );
}

function toolNames(messages: ChatMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls) {
        names.set(call.id, call.name);
      }
    }
  }
  return names;
}
