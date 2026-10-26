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

const MAIN = '';

export function reconstructRequests(events: HarnessEvent[]): HarnessEvent[] {
  // История у каждого агента своя: у субагента она начинается с поручения.
  const state: State = { histories: new Map([[MAIN, []]]), pending: new Map() };
  for (const event of events) {
    const key = event.agentId ?? MAIN;
    const history = state.histories.get(key) ?? [];
    state.histories.set(key, history);
    apply(state, key, history, event);
  }
  return events;
}

interface State {
  histories: Map<string, WireMessage[]>;
  pending: Map<string, Extract<HarnessEvent, { type: 'model_request' }>>;
}

function apply(state: State, key: string, history: WireMessage[], event: HarnessEvent): void {
  if (event.type === 'subagent_started') {
    state.histories.set(event.subagentId, [{ role: 'user', content: event.task }]);
  } else if (event.type === 'user_message') {
    history.push({ role: 'user', content: event.text });
  } else if (event.type === 'history_compacted') {
    state.histories.set(key, [{ role: 'user', content: event.summary }]);
  } else if (event.type === 'model_request' && event.purpose === 'agentStep') {
    event.body = { messages: [...history] };
    state.pending.set(event.requestId, event);
  } else if (event.type === 'model_response') {
    const request = state.pending.get(event.requestId);
    if (request !== undefined) {
      request.budget = budgetOf(request.body, event.reply.usage.inputTokens);
    }
    history.push(assistantMessage(event.reply));
  } else if (event.type === 'tool_result') {
    history.push({ role: 'tool', tool_call_id: event.toolCallId, content: event.content });
  }
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
