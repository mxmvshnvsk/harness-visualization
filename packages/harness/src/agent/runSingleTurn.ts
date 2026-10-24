// Один ход агента без тулов: сообщение пользователя → контекст → модель → ответ.
// На этапе 2 этот ход превратится в цикл: если модель попросит тул,
// харнесс выполнит его и снова обратится к модели.

import type { ChatMessage, ReasoningEffort } from '../model/chatTypes.js';
import type { AgentDependencies } from './agentDependencies.js';
import { requestModel } from './requestModel.js';
import { BASE_SYSTEM_PROMPT } from './systemPrompt.js';

export interface TurnOptions {
  reasoningEffort: ReasoningEffort;
}

export async function runSingleTurn(
  userText: string,
  dependencies: AgentDependencies,
  options: TurnOptions,
): Promise<string> {
  const { events } = dependencies;
  events.emit({ type: 'user_message', text: userText });

  const messages = assembleContext(userText);
  events.emit({ type: 'prompt_assembled', messages });

  const reply = await requestModel(
    { messages, reasoningEffort: options.reasoningEffort },
    dependencies,
  );
  const answer = reply.text ?? '';
  events.emit({ type: 'assistant_message', text: answer });
  return answer;
}

// Пока контекст — это системный промпт и одно сообщение пользователя.
// Модель не помнит прошлых запросов: всё, что она должна знать, харнесс кладёт сюда.
function assembleContext(userText: string): ChatMessage[] {
  return [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ];
}
