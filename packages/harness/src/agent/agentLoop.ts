// Цикл агента без подготовки хода: запрос к модели → тулы → запрос, пока модель не ответит
// текстом или не кончится лимит шагов. Его крутит и главный агент (runAgentTurn), и субагент
// (этап 6c) — каждый над своей историей. Перед каждым запросом харнесс освобождает место
// в prompt: очистка старых результатов тулов, затем компакция.

import type {
  AssistantMessage,
  ChatMessage,
  ModelReply,
  ReasoningEffort,
  ToolCall,
} from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';
import { clearOldToolResults } from '../context/clearOldToolResults.js';
import { compactHistory } from '../context/compactHistory.js';
import { restoreAfterCompaction } from '../context/restoreAfterCompaction.js';
import { estimatePromptBudget } from '../context/promptBudget.js';
import { executeToolCall } from './executeToolCall.js';
import { requestModel } from './requestModel.js';
import { DELEGATE_TOOL_NAME } from '../subagents/delegateToolName.js';

export interface LoopOptions {
  reasoningEffort: ReasoningEffort;
  maxIterations: number;
  // Где в настройках лимит шагов — для понятной ошибки.
  limitSetting: string;
}

// Возвращает ответ модели текстом; история дописана ответами и результатами тулов.
export async function runAgentLoop(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  options: LoopOptions,
): Promise<string> {
  const { tools } = dependencies;
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const last = iteration === options.maxIterations;
    if (last) {
      askToFinish(messages, dependencies, options);
    }
    await freeContextSpace(messages, dependencies, options.reasoningEffort);
    const { reply } = await requestModel(
      {
        messages,
        tools: tools.definitions(),
        reasoningEffort: options.reasoningEffort,
        ...(last ? { toolChoice: 'none' as const } : {}),
      },
      dependencies,
      { purpose: 'agentStep', iteration },
    );
    rejectEmptyReply(reply);
    messages.push(toAssistantMessage(reply));
    const answer = finalAnswer(reply, last);
    if (answer !== null) {
      return answer;
    }
    if (last) {
      break;
    }
    await (reply.finishReason === 'length'
      ? refuseTruncatedCalls(reply.toolCalls, messages, dependencies)
      : runRequestedTools(reply.toolCalls, messages, dependencies));
  }
  throw new Error(
    `Агент не закончил работу за ${String(options.maxIterations)} шагов. ` +
      `Лимит задаётся в harness.config.json: ${options.limitSetting}.`,
  );
}

export const ITERATION_LIMIT_PREFIX = '[Харнесс] Лимит шагов';

// Последний разрешённый шаг: вместо обрыва — просьба ответить по найденному. Без неё всё
// прочитанное пропало бы: субагент не вернул бы отчёт, главный — ответ пользователю.
function askToFinish(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  options: LoopOptions,
): void {
  const note =
    `${ITERATION_LIMIT_PREFIX} (${String(options.maxIterations)}): это последний шаг, тулы больше ` +
    'недоступны. Ответь сейчас по тому, что уже нашёл; чего не успел проверить — так и напиши.';
  messages.push({ role: 'user', content: note });
  dependencies.events.emit({
    type: 'iteration_limit_reached',
    limit: options.maxIterations,
    setting: options.limitSetting,
    note,
  });
}

// Перед запросом к модели: prompt дорос до порога — сначала убрать старые результаты тулов
// (этап 6.4), не хватило — сжать прошлые ходы в сводку (этап 6.5).
async function freeContextSpace(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  reasoningEffort: ReasoningEffort,
): Promise<void> {
  const { budget, provider, tools, events } = dependencies;
  // Оценка — по телу запроса, как его соберёт провайдер: той же формулой, что бюджет.
  const estimateTotal = (): number =>
    estimatePromptBudget(
      provider.prepareRequest({ messages, tools: tools.definitions(), reasoningEffort }).body,
      budget,
    ).estimate.total;
  const thresholdTokens = Math.round((budget.limitTokens * budget.thresholdPercent) / 100);
  const targetTokens = Math.round((budget.limitTokens * budget.clearTargetPercent) / 100);
  const clearing = clearOldToolResults(messages, estimateTotal, {
    thresholdTokens,
    targetTokens,
    charsPerToken: budget.charsPerToken,
  });
  if (clearing !== null) {
    events.emit({
      type: 'tool_results_cleared',
      ...clearing,
      thresholdTokens,
      targetTokens,
      preset: budget.preset,
    });
  }
  const beforeTokens = estimateTotal();
  if (beforeTokens > thresholdTokens) {
    await compact(messages, dependencies, { beforeTokens, thresholdTokens, estimateTotal });
  }
}

interface CompactionContext {
  beforeTokens: number;
  thresholdTokens: number;
  estimateTotal: () => number;
}

// Сводка — служебный запрос; не удался — продолжаем без неё: ошибка уже в model_error.
async function compact(
  messages: ChatMessage[],
  dependencies: AgentDependencies,
  { beforeTokens, thresholdTokens, estimateTotal }: CompactionContext,
): Promise<void> {
  const { events, budget, compactionProvider } = dependencies;
  try {
    const compaction = await compactHistory(messages, {
      ...dependencies,
      provider: compactionProvider,
    });
    if (compaction !== null) {
      // Сводка — пересказ; инструкции скиллов, план и свежую память харнесс дописывает сам.
      const restored = await restoreAfterCompaction(messages, dependencies);
      events.emit({
        type: 'history_compacted',
        ...compaction,
        restored,
        beforeTokens,
        afterTokens: estimateTotal(),
        thresholdTokens,
        preset: budget.preset,
      });
    }
  } catch {
    // Пусть запрос уйдёт как есть: бюджет — учебный лимит харнесса, а не окно модели.
  }
}

// Ответ модели становится частью истории — вместе с рассуждениями и просьбами вызвать тулы.
// Ни текста, ни тулов — это не ответ, а сбой. Так бывает, когда рассуждение съедает весь лимит
// ответа (finish_reason: length, прогон bbd5a21e). Пустое сообщение в историю не кладём:
// следующий запрос с ним DeepSeek отклоняет ошибкой 400.
function rejectEmptyReply(reply: ModelReply): void {
  if (reply.toolCalls.length > 0 || (reply.text ?? '') !== '') {
    return;
  }
  throw new Error(
    reply.finishReason === 'length'
      ? 'Модель не дописала ответ: рассуждение заняло весь лимит длины ответа ' +
          '(model.maxOutputTokens в harness.config.json)'
      : `Модель вернула пустой ответ (finish_reason: ${reply.finishReason})`,
  );
}

export const TRUNCATED_ANSWER_NOTE =
  '[Харнесс] Ответ обрезан: модель упёрлась в лимит длины ответа ' +
  '(model.maxOutputTokens в harness.config.json).';

const TRUNCATED_CALL_NOTE =
  '[Харнесс] Вызов не выполнен: ответ модели обрезан по лимиту длины (model.maxOutputTokens), ' +
  'аргументы неполные. Повтори вызов короче.';

// Ответ текстом — конец цикла. Обрезанный по лимиту длины харнесс не выдаёт за целый: дописывает
// пометку (в историю модели — без неё). В прогоне d7839b6c итог обрывался на полуслове молча.
function finalAnswer(reply: ModelReply, last: boolean): string | null {
  const text = reply.text ?? '';
  if (reply.toolCalls.length > 0 && !(last && text !== '')) {
    return null;
  }
  return reply.finishReason === 'length' ? `${text}\n\n${TRUNCATED_ANSWER_NOTE}` : text;
}

// Вызовы тулов из обрезанного ответа: аргументы оборваны, выполнять их нельзя — каждому вызову
// харнесс отвечает ошибкой с причиной, а не «некорректный JSON» без объяснений.
async function refuseTruncatedCalls(
  toolCalls: ToolCall[],
  messages: ChatMessage[],
  dependencies: AgentDependencies,
): Promise<void> {
  for (const toolCall of toolCalls) {
    dependencies.events.emit({
      type: 'tool_call',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      argumentsText: toolCall.argumentsText,
      arguments: null,
    });
    dependencies.events.emit({
      type: 'tool_result',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      status: 'error',
      content: TRUNCATED_CALL_NOTE,
      details: null,
      cost: null,
      durationMs: 0,
    });
    messages.push({ role: 'tool', toolCallId: toolCall.id, content: TRUNCATED_CALL_NOTE });
  }
  return Promise.resolve();
}

function toAssistantMessage(reply: ModelReply): AssistantMessage {
  return {
    role: 'assistant',
    content: reply.text,
    reasoningContent: reply.reasoningText,
    toolCalls: reply.toolCalls,
  };
}

// Тулы выполняются по очереди, в том порядке, в каком их попросила модель. Исключение —
// поручения субагентам (этап 6c): идущие подряд delegate_task харнесс запускает разом, если
// это разрешено в subagents.parallel. Результаты всё равно ложатся в историю по порядку вызовов.
async function runRequestedTools(
  toolCalls: ToolCall[],
  messages: ChatMessage[],
  dependencies: AgentDependencies,
): Promise<void> {
  for (const group of groupForExecution(toolCalls, dependencies.parallelDelegation)) {
    const results = await Promise.all(
      group.map((toolCall) => executeToolCall(toolCall, dependencies)),
    );
    messages.push(...results);
  }
}

// Работа субагентов идёт одновременно: поручения и доработки после приёмки (этап 6d.2).
const PARALLEL_TOOLS = new Set([DELEGATE_TOOL_NAME, 'review_report']);

// Группы вызовов: внутри группы — одновременно. Каждый обычный тул — отдельная группа.
function groupForExecution(toolCalls: ToolCall[], parallelDelegation: boolean): ToolCall[][] {
  const groups: ToolCall[][] = [];
  for (const toolCall of toolCalls) {
    const previous = groups.at(-1);
    const delegates = PARALLEL_TOOLS.has(toolCall.name);
    if (
      parallelDelegation &&
      delegates &&
      previous !== undefined &&
      PARALLEL_TOOLS.has(previous[0]?.name ?? '')
    ) {
      previous.push(toolCall);
    } else {
      groups.push([toolCall]);
    }
  }
  return groups;
}
