// Короткое описание каждого типа события для консоли.
// Для каждого типа — своя функция, собранные в одну таблицу:
// так легко найти, как печатается конкретное событие, и добавить новое.

import { styleText } from 'node:util';
import type { HarnessEvent, HarnessEventType } from './harnessEvents.js';
import { formatMoney, formatNumber, formatUsage, shortenForPreview } from './formatForConsole.js';

type EventOfType<Type extends HarnessEventType> = Extract<HarnessEvent, { type: Type }>;

type EventDescribers = {
  [Type in HarnessEventType]: (event: EventOfType<Type>) => string[];
};

const EVENT_DESCRIBERS: EventDescribers = {
  session_started: (event) => [
    styleText(
      'bold',
      `Сессия ${event.sessionId} · ${event.providerName} · ${event.model} · effort ${event.reasoningEffort}`,
    ),
  ],
  user_message: (event) => [`Пользователь → харнесс: «${shortenForPreview(event.text)}»`],
  prompt_assembled: describePromptAssembled,
  model_request: (event) => [
    styleText(
      'cyan',
      `Харнесс → модель (шаг ${event.iteration}): ${event.method} ${event.url} · effort ${event.reasoningEffort}`,
    ),
  ],
  model_response: describeModelResponse,
  model_error: (event) => [styleText('red', `Ошибка модели: ${event.message}`)],
  tool_call: (event) => [
    styleText(
      'yellow',
      `Харнесс → тул ${event.toolName}: ${shortenForPreview(event.argumentsText)}`,
    ),
  ],
  tool_result: describeToolResult,
  assistant_message: (event) => [styleText('green', 'Харнесс → пользователь:'), event.text],
  session_finished: describeSessionFinished,
  error: (event) => [styleText('red', `Ошибка: ${event.message}`)],
};

export function describeEventForConsole(event: HarnessEvent): string[] {
  // TypeScript не может сам связать тип события с его функцией в таблице,
  // хотя по построению таблицы они всегда совпадают, — поэтому приводим тип явно.
  const describe = EVENT_DESCRIBERS[event.type] as (event: HarnessEvent) => string[];
  return describe(event);
}

function describePromptAssembled(event: EventOfType<'prompt_assembled'>): string[] {
  const roles = event.messages.map((message) => message.role).join(', ');
  const tools = event.toolNames.length > 0 ? event.toolNames.join(', ') : 'нет';
  return [`Харнесс собрал контекст: ${event.messages.length} сообщ. (${roles}), тулы: ${tools}`];
}

function describeModelResponse(event: EventOfType<'model_response'>): string[] {
  const { reply } = event;
  const tariff = event.cost === null ? '' : ` (тариф ${event.cost.tariffName})`;
  const lines = [
    styleText(
      'cyan',
      `Модель → харнесс: HTTP ${event.status} за ${formatNumber(event.durationMs)} мс, finish_reason: ${reply.finishReason}`,
    ),
    `    токены: ${formatUsage(reply.usage)}`,
    `    стоимость: ${formatMoney(event.cost)}${tariff}`,
  ];
  if (reply.reasoningText !== null && reply.reasoningText !== '') {
    lines.push(styleText('dim', `    рассуждения: ${shortenForPreview(reply.reasoningText)}`));
  }
  if (reply.toolCalls.length > 0) {
    const toolNames = reply.toolCalls.map((toolCall) => toolCall.name).join(', ');
    lines.push(styleText('yellow', `    модель просит тулы: ${toolNames}`));
  }
  return lines;
}

function describeToolResult(event: EventOfType<'tool_result'>): string[] {
  const status = event.isError ? 'ошибка' : 'готово';
  const color = event.isError ? 'red' : 'yellow';
  return [
    styleText(
      color,
      `Тул ${event.toolName} → харнесс: ${status}, ${formatNumber(event.content.length)} симв. за ${event.durationMs} мс`,
    ),
    styleText('dim', `    ${shortenForPreview(event.content)}`),
  ];
}

function describeSessionFinished(event: EventOfType<'session_finished'>): string[] {
  const seconds = (event.durationMs / 1000).toFixed(1);
  return [
    styleText(
      'bold',
      `Итого: запросов к модели ${event.modelRequests}, ${formatUsage(event.usage)}, ${formatMoney(event.cost)}, ${seconds} с`,
    ),
  ];
}
