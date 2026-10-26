// Тело запроса и бюджет prompt для чужой записи (этап 9.4). В записях Claude Code и OpenCode
// тела запроса нет — только ответы. Но историю, которую видела модель, можно собрать заново:
// вопросы, ответы модели с вызовами тулов, результаты тулов, сводки компакции. Этого хватает
// вкладке «Контекст»: что было в prompt на каждом шаге и сколько оно весит.
//
// Чего собрать нельзя — system prompt и описания тулов чужого харнесса. Их размер — разница
// между настоящим input из usage ответа и оценкой видимой части; он идёт в часть system
// с пометкой reconstructed. Рассуждения модели в историю не кладём: передаёт ли их харнесс
// обратно, по записи не видно.

import { estimatePromptBudget } from '../context/promptBudget.js';
import type { HarnessEvent } from '../events/harnessEvents.js';

// Тот же коэффициент, что у нашего харнесса (context/promptBudget.ts, подобран по трейсам).
const CHARS_PER_TOKEN = 3.24;

type WireMessage = Record<string, unknown>;

export function reconstructRequests(events: HarnessEvent[]): HarnessEvent[] {
  let history: WireMessage[] = [];
  const pending = new Map<string, Extract<HarnessEvent, { type: 'model_request' }>>();
  for (const event of events) {
    if (event.agentId !== undefined) {
      continue;
    }
    if (event.type === 'user_message') {
      history.push({ role: 'user', content: event.text });
    } else if (event.type === 'history_compacted') {
      history = [{ role: 'user', content: event.summary }];
    } else if (event.type === 'model_request' && event.purpose === 'agentStep') {
      event.body = { messages: [...history] };
      pending.set(event.requestId, event);
    } else if (event.type === 'model_response') {
      const request = pending.get(event.requestId);
      if (request !== undefined) {
        request.budget = budgetOf(request.body, event.reply.usage.inputTokens);
      }
      history.push(assistantMessage(event.reply));
    } else if (event.type === 'tool_result') {
      history.push({ role: 'tool', tool_call_id: event.toolCallId, content: event.content });
    }
  }
  return events;
}

function assistantMessage(
  reply: Extract<HarnessEvent, { type: 'model_response' }>['reply'],
): WireMessage {
  return {
    role: 'assistant',
    content: reply.text,
    ...(reply.toolCalls.length === 0
      ? {}
      : {
          tool_calls: reply.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.argumentsText },
          })),
        }),
  };
}

function budgetOf(body: Record<string, unknown>, exactTokens: number) {
  const budget = estimatePromptBudget(body, {
    preset: 'импорт',
    limitTokens: 0,
    toolResultMaxTokens: 0,
    thresholdPercent: 0,
    clearTargetPercent: 0,
    charsPerToken: CHARS_PER_TOKEN,
  });
  const hiddenTokens = Math.max(0, exactTokens - budget.estimate.total);
  return {
    ...budget,
    estimate: {
      ...budget.estimate,
      system: budget.estimate.system + hiddenTokens,
      total: budget.estimate.total + hiddenTokens,
    },
    reconstructed: { hiddenTokens },
  };
}
