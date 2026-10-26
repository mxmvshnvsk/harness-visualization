// Точка ветвления (этап 9): что модель видела на шаге N исходной сессии. Шаг — запрос главного
// агента к модели (purpose agentStep, без agentId), по порядку во всей сессии: у второго вопроса
// диалога шаги продолжают нумерацию первого.
//
// История берётся из тела model_request шага — уже после очистки старых результатов и компакции,
// то есть ровно то, что получила модель. Replay ничего не запрашивает и тулов не выполняет:
// побочные действия прошлых шагов (запись файлов) не повторяются.

import type { BranchChange, HarnessEvent } from '../events/harnessEvents.js';
import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import { fromWireMessages } from '../model/fromWireFormat.js';

export interface BranchStep {
  step: number;
  requestId: string;
  // Шаг внутри своего хода — так его пишет цикл агента.
  iteration: number;
  reasoningEffort: ReasoningEffort;
  // Вопрос пользователя, на который отвечает ход этого шага.
  question: string;
  // Результаты тулов, которые модель уже получила к этому шагу, — их можно подменить.
  toolResults: { toolCallId: string; toolName: string; content: string }[];
}

// Запись чужого харнесса (этап 9.4) без тел запросов: историю шага взять неоткуда.
function isImported(events: readonly HarnessEvent[]): boolean {
  return events.some(
    (event) => event.type === 'session_started' && (event.importedFrom ?? null) !== null,
  );
}

export function listBranchSteps(events: readonly HarnessEvent[]): BranchStep[] {
  return isImported(events) ? [] : collectSteps(events);
}

function collectSteps(events: readonly HarnessEvent[]): BranchStep[] {
  const steps: BranchStep[] = [];
  let question = '';
  const toolNames = new Map<string, string>();
  const toolResults: BranchStep['toolResults'] = [];
  for (const event of events) {
    if (event.agentId !== undefined) {
      continue;
    }
    if (event.type === 'user_message') {
      question = event.text;
    } else if (event.type === 'tool_call') {
      toolNames.set(event.toolCallId, event.toolName);
    } else if (event.type === 'tool_result') {
      toolResults.push({
        toolCallId: event.toolCallId,
        toolName: toolNames.get(event.toolCallId) ?? event.toolName,
        content: event.content,
      });
    } else if (event.type === 'model_request' && event.purpose === 'agentStep') {
      steps.push({
        step: steps.length + 1,
        requestId: event.requestId,
        iteration: event.iteration ?? steps.length + 1,
        reasoningEffort: event.reasoningEffort,
        question,
        toolResults: [...toolResults],
      });
    }
  }
  return steps;
}

export interface BranchPoint {
  step: BranchStep;
  messages: ChatMessage[];
  change: BranchChange;
}

export type BranchEdit =
  { kind: 'replay' } | { kind: 'toolResult'; toolCallId: string; content: string };

export function prepareBranchPoint(
  events: readonly HarnessEvent[],
  stepNumber: number,
  edit: BranchEdit,
): BranchPoint {
  const steps = listBranchSteps(events);
  const step = steps.find((item) => item.step === stepNumber);
  if (step === undefined) {
    throw new Error(
      `В трейсе нет шага ${String(stepNumber)}: шагов главного агента ${String(steps.length)}`,
    );
  }
  const request = events.find(
    (event) => event.type === 'model_request' && event.requestId === step.requestId,
  );
  if (request?.type !== 'model_request') {
    throw new Error(`Нет запроса шага ${String(stepNumber)}`);
  }
  const messages = fromWireMessages(request.body);
  return { step, messages, change: applyEdit(messages, edit) };
}

// Правка — прямо в истории: модель получит её на шаге N, как будто так и было.
function applyEdit(messages: ChatMessage[], edit: BranchEdit): BranchChange {
  if (edit.kind === 'replay') {
    return { kind: 'replay' };
  }
  const index = messages.findIndex(
    (message) => message.role === 'tool' && message.toolCallId === edit.toolCallId,
  );
  const target = messages[index];
  if (target?.role !== 'tool') {
    throw new Error(
      `Результата тула ${edit.toolCallId} нет в истории шага: он пришёл позже или его убрала очистка`,
    );
  }
  messages[index] = { ...target, content: edit.content };
  return {
    kind: 'toolResult',
    toolCallId: edit.toolCallId,
    toolName: toolNameOf(messages, edit.toolCallId),
    before: target.content,
    after: edit.content,
  };
}

function toolNameOf(messages: ChatMessage[], toolCallId: string): string {
  for (const message of messages) {
    if (message.role === 'assistant') {
      const call = message.toolCalls.find((item) => item.id === toolCallId);
      if (call !== undefined) {
        return call.name;
      }
    }
  }
  return 'тул';
}
