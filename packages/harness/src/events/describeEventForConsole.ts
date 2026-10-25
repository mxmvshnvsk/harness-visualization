// Короткое описание каждого типа события для консоли.
// Для каждого типа — своя функция, собранные в одну таблицу:
// так легко найти, как печатается конкретное событие, и добавить новое.

import { styleText } from 'node:util';
import type { RetrievalMode } from '../settings/settingsSchema.js';
import type { HarnessEvent, HarnessEventType } from './harnessEvents.js';
import { describeJsonRpcMessage } from '../mcp/describeJsonRpcMessage.js';
import {
  formatAmount,
  formatCallCount,
  formatMoney,
  formatNumber,
  formatUsage,
  shortenForPreview,
} from './formatForConsole.js';

type EventOfType<Type extends HarnessEventType> = Extract<HarnessEvent, { type: Type }>;

const RETRIEVAL_MODE_DESCRIPTIONS: Record<RetrievalMode, string> = {
  tool: 'модель ищет сама тулами (retrieval tool)',
  auto: 'харнесс сам ищет словами пользователя и подмешивает найденное (retrieval auto)',
  rewrite:
    'модель составляет запрос, харнесс ищет по нему и подмешивает найденное (retrieval rewrite)',
};

type EventDescribers = {
  [Type in HarnessEventType]: (event: EventOfType<Type>) => string[];
};

const EVENT_DESCRIBERS: EventDescribers = {
  session_started: (event) => [
    styleText(
      'bold',
      `Сессия ${event.sessionId} · ${event.providerName} · ${event.model} · effort ${event.reasoningEffort}`,
    ),
    styleText(
      'dim',
      event.networkProxy === null
        ? 'Сеть: прокси не задан, все запросы напрямую'
        : `Сеть: прокси для маршрута proxy — ${event.networkProxy}`,
    ),
    styleText('dim', `Поиск: ${event.searchProvider ?? 'выключен'}`),
    styleText('dim', `База знаний: ${RETRIEVAL_MODE_DESCRIPTIONS[event.retrievalMode]}`),
  ],
  workspace_prepared: describeWorkspacePrepared,
  mcp_server_starting: (event) => [
    styleText(
      'blue',
      `Харнесс запускает MCP-сервер ${event.serverName}: ${event.command} ${event.args.join(' ')}`,
    ),
  ],
  mcp_server_ready: describeMcpServerReady,
  mcp_server_failed: (event) => [
    styleText('red', `MCP-сервер ${event.serverName} не запустился: ${event.message}`),
  ],
  mcp_message: (event) => [
    styleText(
      'dim',
      event.direction === 'to_server'
        ? `    харнесс → MCP ${event.serverName}: ${describeJsonRpcMessage(event.message)}`
        : `    MCP ${event.serverName} → харнесс: ${describeJsonRpcMessage(event.message)}`,
    ),
  ],
  mcp_server_log: (event) => [
    styleText('dim', `    MCP ${event.serverName} (stderr): ${event.text}`),
  ],
  network_request: describeNetworkRequest,
  mcp_server_stopped: (event) => [styleText('dim', `MCP-сервер ${event.serverName} остановлен`)],
  user_message: (event) => [`Пользователь → харнесс: «${shortenForPreview(event.text)}»`],
  context_retrieved: describeContextRetrieved,
  prompt_assembled: describePromptAssembled,
  model_request: describeModelRequest,
  query_rewritten: describeQueryRewritten,
  model_response: describeModelResponse,
  model_error: (event) => [styleText('red', `Ошибка модели: ${event.message}`)],
  tool_call: (event) => [
    styleText(
      'yellow',
      `Харнесс → тул ${event.toolName}: ${shortenForPreview(event.argumentsText)}`,
    ),
  ],
  permission_evaluated: describePermissionEvaluated,
  permission_requested: (event) => [
    styleText('magenta', `Нужно разрешение пользователя: ${event.actionDescription}`),
  ],
  permission_resolved: (event) => [
    styleText(
      'magenta',
      `${event.approved ? 'Пользователь разрешил' : 'Пользователь отказал'} (думал ${formatNumber(event.waitedForUserMs)} мс)`,
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

function describeWorkspacePrepared(event: EventOfType<'workspace_prepared'>): string[] {
  if (event.wasReset) {
    return [`Рабочая папка пересоздана из примеров: ${event.directory}/`];
  }
  if (event.createdFromSeed) {
    return [`Рабочая папка создана из примеров: ${event.directory}/`];
  }
  return [styleText('dim', `Рабочая папка: ${event.directory}/ (файлы прошлых сессий сохранены)`)];
}

// Сеть: api.deepseek.com → через прокси http://127.0.0.1:12334/ (маршрут по умолчанию)
function describeNetworkRequest(event: EventOfType<'network_request'>): string[] {
  const rule = event.rule === null ? 'маршрут по умолчанию' : `правило «${event.rule}»`;
  if (event.route === 'proxy' && !event.viaProxy) {
    return [
      styleText(
        'yellow',
        `    Сеть: ${event.host} → напрямую: маршрут proxy, но прокси не задан (${rule})`,
      ),
    ];
  }
  const path = event.viaProxy ? `через прокси ${event.proxyUrl ?? ''}` : 'напрямую';
  return [styleText('dim', `    Сеть: ${event.host} → ${path} (${rule})`)];
}

function describeMcpServerReady(event: EventOfType<'mcp_server_ready'>): string[] {
  const server =
    event.serverInfo === null ? '' : ` (${event.serverInfo.name} ${event.serverInfo.version})`;
  const lines = [
    styleText(
      'blue',
      `MCP-сервер ${event.serverName}${server} готов за ${formatNumber(event.durationMs)} мс, протокол ${event.protocolVersion ?? '—'}`,
    ),
  ];
  for (const tool of event.tools) {
    const effects =
      tool.effects.length > 0 ? tool.effects.join(', ') : 'не заявлены — решит defaultDecision';
    lines.push(styleText('dim', `    тул ${tool.name}: ${effects}`));
  }
  if (event.instructions !== null) {
    lines.push(
      styleText(
        'dim',
        `    инструкции → в системный промпт: ${shortenForPreview(event.instructions)}`,
      ),
    );
  }
  return lines;
}

function describePromptAssembled(event: EventOfType<'prompt_assembled'>): string[] {
  const roles = event.messages.map((message) => message.role).join(', ');
  const tools = event.toolNames.length > 0 ? event.toolNames.join(', ') : 'нет';
  return [`Харнесс собрал контекст: ${event.messages.length} сообщ. (${roles}), тулы: ${tools}`];
}

function describeModelRequest(event: EventOfType<'model_request'>): string[] {
  const target = `${event.method} ${event.url} · effort ${event.reasoningEffort}`;
  if (event.purpose === 'queryRewrite') {
    return [
      styleText(
        'cyan',
        `Харнесс → модель (служебный запрос: переписать вопрос в поисковый, без тулов): ${target}`,
      ),
    ];
  }
  return [styleText('cyan', `Харнесс → модель (шаг ${event.iteration ?? '?'}): ${target}`)];
}

function describeQueryRewritten(event: EventOfType<'query_rewritten'>): string[] {
  if (event.usedFallback) {
    return [styleText('yellow', 'Модель не дала запрос — харнесс ищет словами пользователя')];
  }
  return [
    styleText('yellow', `Запрос для поиска составила модель: «${event.query}»`),
    styleText('dim', `    вместо слов пользователя: «${event.userQuestion}»`),
  ];
}

function describeContextRetrieved(event: EventOfType<'context_retrieved'>): string[] {
  const author = event.queryAuthor === 'model' ? 'запросом модели' : 'словами пользователя';
  const request = styleText(
    'yellow',
    `Харнесс сам → тул ${event.toolName}, до запроса к модели, ${author}: ${JSON.stringify(event.arguments)}`,
  );
  if (event.status === 'error') {
    return [
      request,
      styleText('red', `    не нашёл: ${event.content} — модель получит вопрос без найденного`),
    ];
  }
  return [
    request,
    styleText(
      'yellow',
      `    найдено ${formatNumber(event.content.length)} симв. за ${event.durationMs} мс — в сообщение пользователя`,
    ),
    styleText('dim', `    ${shortenForPreview(event.content)}`),
  ];
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

const TOOL_STATUS_LABELS = {
  success: { label: 'готово', color: 'yellow' },
  error: { label: 'ошибка', color: 'red' },
  denied: { label: 'отказано пользователем', color: 'magenta' },
  blocked: { label: 'запрещено политикой', color: 'red' },
} as const;

const DECISION_STYLES = {
  allow: { label: 'разрешено', color: 'dim' },
  ask: { label: 'спросить пользователя', color: 'magenta' },
  deny: { label: 'запрещено', color: 'red' },
} as const;

// Разрешённые вызовы печатаем одной тусклой строкой, остальные — с цепочкой проверок.
function describePermissionEvaluated(event: EventOfType<'permission_evaluated'>): string[] {
  const { label, color } = DECISION_STYLES[event.decision];
  const summary = styleText(color, `Политика: ${label} — ${event.reason}`);
  if (event.decision === 'allow') {
    return [summary];
  }
  const checks = event.checks.map((check) => {
    const result = check.matched ? `→ ${check.decision ?? '—'}` : 'не подходит';
    return styleText('dim', `    ${check.source}: ${check.label} ${result}`);
  });
  return [summary, ...checks];
}

function describeToolResult(event: EventOfType<'tool_result'>): string[] {
  const { label: status, color } = TOOL_STATUS_LABELS[event.status];
  const lines = [
    styleText(
      color,
      `Тул ${event.toolName} → харнесс: ${status}, ${formatNumber(event.content.length)} симв. за ${event.durationMs} мс`,
    ),
    styleText('dim', `    ${shortenForPreview(event.content)}`),
  ];
  if (event.cost !== null) {
    const amount = formatAmount(event.cost.amount, event.cost.currency);
    lines.push(`    стоимость: ${amount} (тариф ${event.cost.tariffName})`);
  }
  if (event.details !== null) {
    lines.push(styleText('dim', `    подробности: ${describeDetails(event.details)}`));
  }
  return lines;
}

// { credits: 1, downloadedBytes: 52000 } → credits: 1, downloadedBytes: 52000
function describeDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
}

function describeSessionFinished(event: EventOfType<'session_finished'>): string[] {
  const seconds = (event.durationMs / 1000).toFixed(1);
  // Валюты не складываем: каждая сумма — отдельно, со своим источником.
  const costs = [
    `модель ${formatMoney(event.modelCost)}`,
    ...event.toolCosts.map(
      (toolCost) =>
        `${toolCost.toolName} ${formatMoney(toolCost)} (${formatCallCount(toolCost.calls)})`,
    ),
  ];
  return [
    styleText(
      'bold',
      `Итого: запросов к модели ${event.modelRequests}, ${formatUsage(event.usage)}, ${seconds} с`,
    ),
    styleText('bold', `    стоимость: ${costs.join(' · ')}`),
  ];
}
