// Короткое описание каждого типа события для консоли.
// Для каждого типа — своя функция, собранные в одну таблицу:
// так легко найти, как печатается конкретное событие, и добавить новое.

import { styleText } from 'node:util';
import type { ResponseTiming } from '../model/chatTypes.js';
import type { RetrievalMode } from '../settings/settingsSchema.js';
import type {
  AcceptanceCheckedPayload,
  EventMetadata,
  HarnessEvent,
  HarnessEventType,
} from './harnessEvents.js';
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
  auto: 'харнесс сам делает retrieval словами пользователя и подмешивает найденное (retrieval auto)',
  rewrite:
    'модель составляет query, харнесс делает retrieval по нему и подмешивает найденное (retrieval rewrite)',
};

const SKILL_TRIGGERS: Record<EventOfType<'skill_loaded'>['trigger'], string> = {
  always: 'харнесс при старте (always)',
  model: 'модель выбрала его тулом load_skill',
  user: 'пользователь командой /имя',
};

const PROGRESS_MARKS: Record<EventOfType<'progress_updated'>['steps'][number]['status'], string> = {
  pending: '[ ]',
  in_progress: '[~]',
  done: '[x]',
  blocked: '[!]',
};

const SKILL_MODES: Record<EventOfType<'skill_catalog'>['skills'][number]['mode'], string> = {
  always: 'always',
  on_demand: 'по выбору модели',
  manual: 'по команде /имя',
};

function describeRestored(restored: EventOfType<'history_compacted'>['restored']): string[] {
  if (restored === undefined) {
    return [];
  }
  const parts = [
    ...(restored.memo ? ['текущий memo.md'] : []),
    ...(restored.progress ? ['план'] : []),
    ...restored.skills.map((name) => `скилл ${name}`),
  ];
  return parts.length === 0
    ? []
    : [styleText('yellow', `    к сводке дописано как есть: ${parts.join(', ')}`)];
}

function describeSkillCatalog(event: EventOfType<'skill_catalog'>): string[] {
  if (event.skills.length === 0 && event.problems.length === 0) {
    return [styleText('dim', `Скиллов нет (папка ${event.directory}).`)];
  }
  return [
    styleText('cyan', `Скиллы (${event.directory}): ${String(event.skills.length)}`),
    ...event.skills.map((skill) =>
      styleText(
        'dim',
        `    ${skill.name} — ${SKILL_MODES[skill.mode]}: ${shortenForPreview(skill.description)}`,
      ),
    ),
    ...event.problems.map((problem) =>
      styleText('yellow', `    ${problem.folder} — не скилл: ${problem.message}`),
    ),
  ];
}

type EventDescribers = {
  [Type in HarnessEventType]: (event: EventOfType<Type>) => string[];
};

const ORCHESTRATION_MODE_NAMES = {
  pipeline: 'пайплайн — шаги задаёт код',
  superagent: 'суперагент — план и поручения решает модель',
  hybrid: 'гибрид — каркас задаёт код, внутри шага решает модель',
} as const;

const STEP_STATUS_COLORS = { done: 'cyan', warning: 'yellow', failed: 'red' } as const;

// Оркестрация (этап 6d): режим, план, шаги кода и итог.
const ORCHESTRATION_DESCRIBERS: Pick<
  EventDescribers,
  | 'orchestration_started'
  | 'plan_created'
  | 'pipeline_step_started'
  | 'pipeline_step_finished'
  | 'orchestration_finished'
  | 'task_reviewed'
  | 'subagent_resumed'
> = {
  task_reviewed: (event) => [
    styleText(
      event.verdict === 'accepted' ? 'magenta' : 'yellow',
      `Приёмка ${event.subagentId}${event.taskId === null ? '' : ` (${event.taskId})`}: ${event.verdict === 'accepted' ? 'принято' : 'вернуть на доработку'} — ${shortenForPreview(event.comment)}`,
    ),
  ],
  subagent_resumed: (event) => [
    styleText('yellow', `Субагент ${event.subagentId} дорабатывает (отчёт ${String(event.round)})`),
  ],
  orchestration_started: (event) => [
    styleText('bold', `Оркестрация: ${ORCHESTRATION_MODE_NAMES[event.mode]}`),
    ...event.steps.map((step, index) =>
      styleText('dim', `    ${String(index + 1)}. ${step.title}`),
    ),
  ],
  plan_created: (event) => [
    styleText(
      'cyan',
      `План (${event.author === 'code' ? 'составил код' : 'составила модель'}): ${String(event.tasks.length)} поручений`,
    ),
    ...event.tasks.map((task) =>
      styleText('dim', `    ${task.taskId} → ${task.agent}: ${task.title}`),
    ),
  ],
  pipeline_step_started: (event) => [styleText('cyan', `Шаг «${event.title}»`)],
  pipeline_step_finished: (event) => [
    styleText(
      STEP_STATUS_COLORS[event.status],
      `    шаг ${event.stepId}: ${event.summary} · ${formatNumber(event.durationMs)} мс`,
    ),
  ],
  orchestration_finished: (event) => [
    styleText(
      event.status === 'done' ? 'bold' : 'red',
      `Оркестрация закончена: поручений ${String(event.tasks)}, доработок ${String(event.reworks)} · ${formatNumber(event.durationMs)} мс`,
    ),
  ],
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
    styleText('dim', describeSessionMode(event)),
    styleText(
      'dim',
      event.subagents === undefined || event.subagents === null
        ? 'Субагенты: выключены'
        : `Субагенты: ${event.subagents.agents.join(', ')}${event.subagents.parallel ? ' · поручения параллельно' : ''}`,
    ),
    ...(event.orchestration === undefined || event.orchestration === null
      ? []
      : [styleText('dim', `Оркестрация: ${ORCHESTRATION_MODE_NAMES[event.orchestration]}`)]),
  ],
  acceptance_checked: describeAcceptance,
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
  grounding_check_started: (event) => [
    styleText(
      'bold',
      `Grounding check с судьёй (judge, ${event.judgeModel}) по трейсу ${event.sourceTracePath}: ${String(event.claimCount)} claims`,
    ),
  ],
  branch_started: (event) => [
    styleText(
      'bold',
      `⑂ Ветка от ${event.sourceTracePath}, шаг ${String(event.step)}: replay ${String(event.replayedSteps)} шагов из трейса, дальше — новый прогон (${event.change.kind === 'replay' ? 'ничего не меняли' : `результат ${event.change.toolName} изменён`})`,
    ),
  ],
  claim_judged: (event) => [
    styleText(
      'magenta',
      `Судья о claim ${String(event.claimNumber)}: ${event.verdict} — ${shortenForPreview(event.explanation)}`,
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
  permission_evaluated: describePermissionEvaluated,
  permission_requested: (event) => [
    styleText('magenta', `Нужно разрешение пользователя: ${event.actionDescription}`),
  ],
  permission_resolved: (event) => [
    styleText(
      'magenta',
      `${describePermissionAnswer(event)} (ждали ${formatNumber(event.waitedForUserMs)} мс)`,
    ),
  ],
  tool_result: describeToolResult,
  assistant_message: (event) => [styleText('green', 'Харнесс → пользователь:'), event.text],
  tool_result_truncated: (event) => [
    styleText(
      'yellow',
      `    Харнесс обрезал результат ${event.toolName}: ≈${formatNumber(event.originalTokens)} → ≈${formatNumber(event.keptTokens)} токенов (лимит на результат ${formatNumber(event.limitTokens)}, пресет ${event.preset})`,
    ),
  ],
  tool_results_cleared: (event) => [
    styleText(
      'yellow',
      `Харнесс убрал старые результаты тулов (${String(event.cleared.length)}): prompt ≈${formatNumber(event.beforeTokens)} → ≈${formatNumber(event.afterTokens)} токенов, порог ${formatNumber(event.thresholdTokens)}, цель ${formatNumber(event.targetTokens)} (${event.preset})`,
    ),
    styleText(
      'dim',
      `    убраны: ${event.cleared.map((item) => `${item.toolName} ≈${formatNumber(item.tokens)}`).join(', ')} — начало prompt изменилось, кэш с этого места не совпадёт`,
    ),
  ],
  history_compacted: (event) => [
    styleText(
      'yellow',
      `Харнесс сжал прошлые ходы в сводку: ${String(event.replacedMessages)} сообщений → 1, prompt ≈${formatNumber(event.beforeTokens)} → ≈${formatNumber(event.afterTokens)} токенов (порог ${formatNumber(event.thresholdTokens)}, ${event.preset})`,
    ),
    styleText('dim', `    сводка: ${shortenForPreview(event.summary)}`),
    ...describeRestored(event.restored),
  ],
  skill_catalog: describeSkillCatalog,
  skill_loaded: (event) => [
    styleText(
      'cyan',
      `Скилл ${event.name} загружен: ${SKILL_TRIGGERS[event.trigger]}${event.files.length > 0 ? ` · файлы: ${event.files.join(', ')}` : ''}`,
    ),
  ],
  memory_loaded: (event) => [
    styleText(
      'cyan',
      event.memoCharacters === null
        ? `Память: ${event.memoPath} пока нет — модель начнёт с чистого листа`
        : `Память: ${event.memoPath} (${formatNumber(event.memoCharacters)} симв.) → в system prompt`,
    ),
    ...(event.files.length > 0
      ? [styleText('dim', `    файлы памяти: ${event.files.join(', ')}`)]
      : []),
  ],
  memory_updated: (event) => [
    styleText(
      'cyan',
      `    Память изменена: ${event.command} ${event.path}${event.newPath === null ? '' : ` → ${event.newPath}`}`,
    ),
  ],
  progress_updated: (event) => [
    styleText(
      'cyan',
      `    План v${String(event.version)} → ${event.path}: ${event.goal} — сделано ${String(event.steps.filter((step) => step.status === 'done').length)} из ${String(event.steps.length)}`,
    ),
    ...event.steps.map((step) =>
      styleText(
        'dim',
        `      ${PROGRESS_MARKS[step.status]} ${step.title}${step.note === null ? '' : ` — ${step.note}`}`,
      ),
    ),
  ],
  awaiting_question: (event) => [
    styleText(
      'dim',
      `Ход ${String(event.turn)} закончен — история диалога остаётся для следующего вопроса.`,
    ),
  ],
  iteration_limit_reached: (event) => [
    styleText(
      'yellow',
      `Лимит шагов (${String(event.limit)}, ${event.setting}): харнесс просит ответить по найденному — последний шаг без тулов`,
    ),
  ],
  subagent_started: (event) => [
    styleText(
      'magenta',
      `Харнесс запускает субагента ${event.subagentId}: «${shortenForPreview(event.task)}»`,
    ),
    styleText(
      'dim',
      `    тулы: ${event.toolNames.join(', ')} · до ${String(event.maxIterations)} шагов · effort ${event.reasoningEffort}`,
    ),
  ],
  subagent_finished: (event) => [
    styleText(
      event.status === 'done' ? 'magenta' : 'red',
      event.status === 'done'
        ? `Субагент ${event.subagentId} → главный агент: отчёт ${formatNumber(event.report?.length ?? 0)} символов`
        : `Субагент ${event.subagentId} не вернул отчёт: ${event.errorMessage ?? ''}`,
    ),
    styleText(
      'dim',
      `    ${String(event.modelRequests)} запросов к модели · ${formatUsage(event.usage)} · ${formatMoney(event.modelCost)} · ${formatNumber(event.durationMs)} мс`,
    ),
  ],
  ...ORCHESTRATION_DESCRIBERS,
  session_finished: describeSessionFinished,
  error: (event) => [styleText('red', `Ошибка: ${event.message}`)],
};

export function describeEventForConsole(event: HarnessEvent): string[] {
  // TypeScript не может сам связать тип события с его функцией в таблице,
  // хотя по построению таблицы они всегда совпадают, — поэтому приводим тип явно.
  const describe = EVENT_DESCRIBERS[event.type] as (event: HarnessEvent) => string[];
  const lines = describe(event);
  // События субагента (этап 6c) — с его id в начале строки: в консоли они идут вперемешку.
  return event.agentId === undefined
    ? lines
    : lines.map((line) => `${styleText('magenta', `[${event.agentId}]`)} ${line}`);
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
    const hidden = tool.hiddenFromModel ? ' · только для харнесса, модель его не видит' : '';
    lines.push(styleText('dim', `    тул ${tool.name}: ${effects}${hidden}`));
  }
  if (event.instructions !== null) {
    lines.push(
      styleText(
        'dim',
        `    инструкции → в system prompt: ${shortenForPreview(event.instructions)}`,
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
  if (event.purpose === 'compaction') {
    return [
      styleText(
        'cyan',
        `Харнесс → модель (служебный запрос: сжать прошлые ходы в сводку, без тулов): ${target}`,
      ),
      ...describeBudget(event.budget),
    ];
  }
  if (event.purpose === 'evalJudge') {
    return [styleText('cyan', `Харнесс → модель (судья evals: ответ против рубрики): ${target}`)];
  }
  if (event.purpose === 'groundingJudge') {
    return [styleText('cyan', `Харнесс → модель (судья: оценить claim, без тулов): ${target}`)];
  }
  if (event.purpose === 'queryRewrite') {
    return [
      styleText(
        'cyan',
        `Харнесс → модель (служебный запрос: переписать вопрос в поисковый, без тулов): ${target}`,
      ),
    ];
  }
  return [
    styleText('cyan', `Харнесс → модель (шаг ${event.iteration ?? '?'}): ${target}`),
    ...describeBudget(event.budget),
  ];
}

// Оценка размера prompt — до ответа модели; точное число придёт в usage ответа.
function describeBudget(budget: EventOfType<'model_request'>['budget']): string[] {
  if (budget === null || budget === undefined) {
    return [];
  }
  const { estimate, limitTokens, preset } = budget;
  const share = Math.round((estimate.total / limitTokens) * 100);
  const extra = [
    ...(estimate.skills ? [`скиллы ≈${formatNumber(estimate.skills)}`] : []),
    ...(estimate.memory ? [`память ≈${formatNumber(estimate.memory)}`] : []),
  ];
  const parts = [
    `system ≈${formatNumber(estimate.system)}`,
    ...extra,
    `тулы ≈${formatNumber(estimate.tools)}`,
    `диалог ≈${formatNumber(estimate.dialog)}`,
    `результаты тулов ≈${formatNumber(estimate.toolResults)}`,
  ].join(', ');
  return [
    styleText(
      share >= 100 ? 'red' : 'dim',
      `    prompt ≈ ${formatNumber(estimate.total)} из ${formatNumber(limitTokens)} токенов (${preset}, ${String(share)} %): ${parts}`,
    ),
  ];
}

function describeQueryRewritten(event: EventOfType<'query_rewritten'>): string[] {
  if (event.usedFallback) {
    return [styleText('yellow', 'Модель не дала запрос — харнесс ищет словами пользователя')];
  }
  return [
    styleText('yellow', `Query для поиска составила модель: «${event.query}»`),
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
    ...describeTiming(event.timing ?? null),
    `    стоимость: ${formatMoney(event.cost)}${tariff}`,
  ];
  if (reply.reasoningText !== null && reply.reasoningText !== '') {
    lines.push(styleText('dim', `    reasoning: ${shortenForPreview(reply.reasoningText)}`));
  }
  if (reply.toolCalls.length > 0) {
    const toolNames = reply.toolCalls.map((toolCall) => toolCall.name).join(', ');
    lines.push(styleText('yellow', `    модель просит тулы: ${toolNames}`));
  }
  return lines;
}

// Фазы потокового ответа: до первого токена — сеть, очередь и prefill; дальше — decode.
function describeTiming(timing: ResponseTiming | null): string[] {
  if (timing?.firstTokenMs === null || timing === null) {
    return [];
  }
  const parts = [`первый токен через ${formatNumber(timing.firstTokenMs)} мс`];
  if (timing.firstAnswerTokenMs !== null && timing.firstAnswerTokenMs > timing.firstTokenMs) {
    parts.push(`ответ — с ${formatNumber(timing.firstAnswerTokenMs)} мс`);
  }
  if (timing.lastTokenMs !== null) {
    parts.push(`последний — ${formatNumber(timing.lastTokenMs)} мс`);
  }
  return [`    поток: ${parts.join(', ')}`];
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

// { credits: 1, downloadedBytes: 52000 } → credits: 1, downloadedBytes: 52000.
// Длинное (вывод тестов, списки) — только размером: целиком оно в трейсе.
function describeDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${describeDetailValue(value)}`)
    .join(', ');
}

function describeDetailValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${String(value.length)}]`;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 120 ? `«${String(text.length)} символов»` : text;
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

function describePermissionAnswer(event: { approved: boolean; answeredBy: string }): string {
  switch (event.answeredBy) {
    case 'timeout':
      return 'Никто не ответил вовремя — действие запрещено';
    case 'noOneToAsk':
      return 'Спросить некого — действие запрещено';
    default:
      return event.approved ? 'Пользователь разрешил' : 'Пользователь отказал';
  }
}

// Приёмка Код-арены (этап 10): итог, скрытые тесты по одному, изменённые тесты агента.
function describeAcceptance(event: AcceptanceCheckedPayload & EventMetadata): string[] {
  const verdict = event.passed ? '✓ приёмка пройдена' : '✗ приёмка не пройдена';
  return [
    styleText(
      event.passed ? 'green' : 'red',
      `${verdict}: видимые ${String(event.visible.passed)} из ${String(event.visible.passed + event.visible.failed)}, скрытые ${String(event.hidden.passed)} из ${String(event.hidden.passed + event.hidden.failed)}`,
    ),
    ...event.hidden.tests.map((test) =>
      styleText(
        test.ok ? 'dim' : 'red',
        `    ${test.ok ? '✓' : '✗'} ${test.name}${test.error === null ? '' : ` — ${test.error}`}`,
      ),
    ),
    ...(event.changedTests.length === 0
      ? []
      : [
          styleText(
            'dim',
            `    агент менял тесты: ${event.changedTests.join(', ')} — приёмка запускала исходные`,
          ),
        ]),
    ...(event.timedOut ? [styleText('red', '    тесты не уложились во время')] : []),
  ];
}

function describeSessionMode(event: EventOfType<'session_started'>): string {
  const arena = event.arena ?? null;
  if (arena !== null) {
    const tests = `${arena.runTests ? 'файлы и run_tests' : 'файлы без run_tests — «вслепую»'}${arena.runNode === true ? ', run_node с подтверждением' : ''}`;
    const network = arena.network === 'closed' ? 'сеть закрыта' : 'сеть открыта';
    return `Код-арена: задача ${arena.taskId ?? 'своя'}, ${tests}; контекст ${arena.contextPreset}, до ${String(arena.maxIterations)} шагов; тесты в Node ${arena.nodeVersion} с --permission, ${network}`;
  }
  return event.demoProject === false
    ? 'Без демо-проекта: ни «Кедр Софт», ни MCP, ни базы знаний — пустая песочница, файлы и веб'
    : `База знаний: ${RETRIEVAL_MODE_DESCRIPTIONS[event.retrievalMode]}`;
}
