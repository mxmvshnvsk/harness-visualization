// Режим retrieval rewrite: прежде чем искать, харнесс просит модель переписать вопрос
// пользователя в поисковый запрос. Короткий или разговорный вопрос («удалёнка»,
// «сидишь дома с температурой») поиск понимает плохо, а развёрнутый запрос — хорошо.
// Цена — лишний запрос к модели; его видно в событиях и в токеномике.
//
// Запрос служебный: без тулов, без рассуждений и без истории — только вопрос.

import type { AgentDependencies } from './agentDependencies.js';
import { requestModel } from './requestModel.js';

const REWRITE_INSTRUCTIONS = [
  'Ты помогаешь харнессу искать в базе знаний компании: регламенты, FAQ, протоколы встреч,',
  'проекты, справочник сотрудников. Перепиши вопрос пользователя в поисковый запрос:',
  'раскрой разговорные и короткие слова, добавь синонимы и официальные названия.',
  'Ответь только запросом, одной строкой, без пояснений и кавычек.',
].join('\n');

export async function rewriteSearchQuery(
  userQuestion: string,
  dependencies: AgentDependencies,
): Promise<string> {
  const { requestId, reply } = await requestModel(
    {
      messages: [
        { role: 'system', content: REWRITE_INSTRUCTIONS },
        { role: 'user', content: userQuestion },
      ],
      tools: [],
      reasoningEffort: 'off',
    },
    dependencies,
    { purpose: 'queryRewrite', iteration: null },
  );
  const rewritten = cleanQuery(reply.text ?? '');
  const usedFallback = rewritten === '';
  const query = usedFallback ? userQuestion : rewritten;
  dependencies.events.emit({
    type: 'query_rewritten',
    requestId,
    userQuestion,
    query,
    usedFallback,
  });
  return query;
}

// Модель иногда всё же оборачивает запрос в кавычки или пишет его в несколько строк.
function cleanQuery(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«"']+|[»"']+$/g, '')
    .trim();
}
