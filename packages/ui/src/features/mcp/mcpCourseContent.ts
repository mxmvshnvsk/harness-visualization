// Содержание курса про тулы и MCP: шаги и пояснения к сообщениям протокола.

import type { McpCourse, McpMessageKind } from '../../projections/projectMcpCourse';

export const MCP_STEPS = [
  { id: 'tool', title: 'Что такое тул для модели' },
  { id: 'protocol', title: 'Что добавляет MCP' },
  { id: 'cost', title: 'Сколько стоят тулы' },
  { id: 'trust', title: 'Можно ли верить серверу' },
] as const;

export const MCP_ENDING =
  'Это весь маршрут. Дальше — лаборатория prompt injection: что будет, если в результате тула окажутся чужие инструкции.';

// Заголовок и пояснение сообщения: у ответа — по тому, на что он отвечает.
export function describeMessage(
  kind: McpMessageKind,
  answers: McpMessageKind | null,
  serverToolCount: number,
): { title: string; text: string } {
  if (kind === 'response') {
    return RESPONSES[answers ?? 'other'] ?? RESPONSES.other ?? FALLBACK;
  }
  if (kind === 'list') {
    return { title: 'tools/list', text: 'Харнесс спрашивает: какие у тебя тулы?' };
  }
  const known = REQUESTS[kind];
  if (known !== undefined) {
    return known;
  }
  return {
    title: kind,
    text: `Сообщение протокола. Тулов у сервера — ${String(serverToolCount)}.`,
  };
}

const FALLBACK = { title: 'ответ', text: 'Ответ сервера.' };

const REQUESTS: Partial<Record<McpMessageKind, { title: string; text: string }>> = {
  initialize: {
    title: 'initialize',
    text: 'Харнесс запустил программу сервера командой из настроек и представляется: кто он и на какой версии протокола говорит.',
  },
  initialized: {
    title: 'notifications/initialized',
    text: 'Харнесс подтверждает, что знакомство закончено. Это уведомление: у него нет id, ответа никто не ждёт.',
  },
  call: {
    title: 'tools/call',
    text: 'Модель попросила тул с приставкой сервера — харнесс снял приставку и зовёт тул на сервере с теми же аргументами. id связывает вопрос с ответом.',
  },
};

const RESPONSES: Partial<Record<McpMessageKind, { title: string; text: string }>> = {
  initialize: {
    title: 'ответ: знакомство',
    text: 'Сервер отвечает: кто он, что умеет (tools — тулы) и инструкции — текст для модели от автора сервера.',
  },
  list: {
    title: 'ответ: список тулов',
    text: 'Сервер присылает тулы: имя, описание, схему параметров и пометки (annotations). Модель увидит не все — какие-то харнесс может скрыть настройкой hiddenTools.',
  },
  call: {
    title: 'ответ: результат',
    text: 'Сервер отвечает текстом. Харнесс отдаст его модели как результат тула — сообщение с ролью tool из шага 1.',
  },
  other: FALLBACK,
};

export interface McpStepProps {
  course: McpCourse;
  onStep: (index: number) => void;
}

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
