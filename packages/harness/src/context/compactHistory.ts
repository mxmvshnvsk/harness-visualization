// Компакция истории (этап 6.5). Если очистки старых результатов тулов не хватило и prompt
// всё ещё выше порога — обычно разросся сам диалог, — харнесс просит модель сжать прошлые ходы
// в сводку и заменяет их ею. Текущий ход (последний вопрос и его шаги) остаётся как есть:
// модели он нужен целиком.
//
// Сводка — место, где теряются факты: что не попало в неё, агент больше не узнает. Поэтому
// инструкция просит сохранить вопросы и ответы, факты с источниками и договорённости, а сводку
// делает та же модель (docs/plan.md, этап 6: решения). Запрос служебный: без тулов, effort low.

import { requestModel, type ModelRequestDependencies } from '../agent/requestModel.js';
import type { ChatMessage } from '../model/chatTypes.js';

const COMPACTION_INSTRUCTIONS = [
  'Ты сжимаешь историю диалога агента с пользователем в сводку: агент продолжит работу,',
  'видя только её, — исходной истории у него больше не будет.',
  'Сохрани: вопросы пользователя и данные на них ответы; факты, цифры и даты из результатов',
  'тулов вместе с источниками (пути к файлам, адреса страниц); решения и договорённости;',
  'что осталось не сделанным. Ничего не придумывай и не добавляй от себя.',
  'Пиши кратко, списком, на языке диалога.',
].join('\n');

export const SUMMARY_PREFIX =
  '[Сводка предыдущей части диалога — составлена харнессом при компакции]';

export interface Compaction {
  requestId: string;
  // Сколько сообщений истории заменила сводка.
  replacedMessages: number;
  summary: string;
}

// Прошлые ходы — сообщения между system и последним вопросом пользователя. Нечего сжимать —
// null. Сжатые заменяются одним сообщением со сводкой; массив меняется на месте.
export async function compactHistory(
  messages: ChatMessage[],
  dependencies: ModelRequestDependencies,
): Promise<Compaction | null> {
  const lastQuestion = messages.findLastIndex((message) => message.role === 'user');
  const firstPast = messages.findIndex((message) => message.role !== 'system');
  if (firstPast === -1 || lastQuestion <= firstPast) {
    return null;
  }
  const past = messages.slice(firstPast, lastQuestion);
  const { requestId, reply } = await requestModel(
    {
      messages: [
        { role: 'system', content: COMPACTION_INSTRUCTIONS },
        { role: 'user', content: transcript(past) },
      ],
      tools: [],
      reasoningEffort: 'low',
    },
    dependencies,
    { purpose: 'compaction', iteration: null },
  );
  const summary = (reply.text ?? '').trim();
  if (summary === '') {
    return null;
  }
  messages.splice(firstPast, past.length, {
    role: 'user',
    content: `${SUMMARY_PREFIX}\n${summary}`,
  });
  return { requestId, replacedMessages: past.length, summary };
}

// История текстом — так модели проще пересказать её, чем разбирать сообщения API.
function transcript(messages: ChatMessage[]): string {
  return messages.map(describeMessage).join('\n\n');
}

function describeMessage(message: ChatMessage): string {
  switch (message.role) {
    case 'system':
    case 'user':
      return `Пользователь: ${message.content}`;
    case 'assistant': {
      const calls = message.toolCalls.map((call) => `${call.name} ${call.argumentsText}`);
      const text = message.content ?? '';
      return calls.length === 0
        ? `Агент: ${text}`
        : `Агент вызвал тулы: ${calls.join('; ')}${text === '' ? '' : `\nАгент: ${text}`}`;
    }
    case 'tool':
      return `Результат тула: ${message.content}`;
  }
}
