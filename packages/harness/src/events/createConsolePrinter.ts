// Подписчик потока событий, который печатает их в консоль коротко и по-русски.
// С флагом --verbose под каждой строкой печатается и полное событие в JSON.

import { styleText } from 'node:util';
import type { HarnessEvent } from './harnessEvents.js';
import type { EventListener } from './EventStream.js';
import { formatMoney, formatNumber, formatUsage, shortenForPreview } from './formatForConsole.js';

export interface ConsolePrinterOptions {
  verbose: boolean;
}

export function createConsolePrinter(options: ConsolePrinterOptions): EventListener {
  return (event) => {
    const prefix = styleText('dim', `[${event.sequence}]`);
    for (const line of describeEvent(event)) {
      console.log(`${prefix} ${line}`);
    }
    if (options.verbose) {
      console.log(styleText('dim', JSON.stringify(event, null, 2)));
    }
  };
}

function describeEvent(event: HarnessEvent): string[] {
  switch (event.type) {
    case 'session_started':
      return [
        styleText(
          'bold',
          `Сессия ${event.sessionId} · ${event.providerName} · ${event.model} · effort ${event.reasoningEffort}`,
        ),
      ];
    case 'user_message':
      return [`Пользователь → харнесс: «${shortenForPreview(event.text)}»`];
    case 'prompt_assembled':
      return [describePromptAssembled(event.messages.map((message) => message.role))];
    case 'model_request':
      return [
        styleText(
          'cyan',
          `Харнесс → модель: ${event.method} ${event.url} · effort ${event.reasoningEffort}`,
        ),
      ];
    case 'model_response':
      return describeModelResponse(event);
    case 'model_error':
      return [styleText('red', `Ошибка модели: ${event.message}`)];
    case 'assistant_message':
      return [styleText('green', 'Харнесс → пользователь:'), event.text];
    case 'session_finished':
      return [describeSessionFinished(event)];
    case 'error':
      return [styleText('red', `Ошибка: ${event.message}`)];
  }
}

function describePromptAssembled(roles: string[]): string {
  return `Харнесс собрал контекст: ${roles.length} сообщ. (${roles.join(', ')})`;
}

function describeModelResponse(event: Extract<HarnessEvent, { type: 'model_response' }>): string[] {
  const lines = [
    styleText(
      'cyan',
      `Модель → харнесс: HTTP ${event.status} за ${formatNumber(event.durationMs)} мс, finish_reason: ${event.reply.finishReason}`,
    ),
    `    токены: ${formatUsage(event.reply.usage)}`,
    `    стоимость: ${formatMoney(event.cost)}${event.cost === null ? '' : ` (тариф ${event.cost.tariffName})`}`,
  ];
  if (event.reply.reasoningText !== null && event.reply.reasoningText !== '') {
    lines.push(
      styleText('dim', `    рассуждения: ${shortenForPreview(event.reply.reasoningText)}`),
    );
  }
  return lines;
}

function describeSessionFinished(
  event: Extract<HarnessEvent, { type: 'session_finished' }>,
): string {
  const seconds = (event.durationMs / 1000).toFixed(1);
  return styleText(
    'bold',
    `Итого: запросов к модели ${event.modelRequests}, ${formatUsage(event.usage)}, ${formatMoney(event.cost)}, ${seconds} с`,
  );
}
