// Что колонка «Диалог» может сейчас: спросить (сессия ждёт вопроса), подождать (идёт ход),
// только смотреть (запись или законченная сессия). Нужен и колонке, и свёрнутой полосе.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { DialogMode } from './Composer';

export function modeOf(
  sessionId: string | null,
  live: boolean,
  events: readonly HarnessEvent[],
): DialogMode {
  if (sessionId === null) {
    return 'record';
  }
  if (!live) {
    return 'ended';
  }
  return events.at(-1)?.type === 'awaiting_question' ? 'awaiting' : 'working';
}

export const STATE_LABELS: Record<DialogMode, string> = {
  record: 'запись',
  ended: 'закончена',
  working: 'агент отвечает',
  awaiting: 'ждёт вопроса',
};
