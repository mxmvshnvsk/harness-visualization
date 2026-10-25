// Что выбрано в таймлайне и показано в инспекторе.

import type { SessionView } from '../../projections/sessionView';

export type Focus =
  | { kind: 'model'; requestId: string }
  | { kind: 'tool'; toolCallId: string }
  | { kind: 'retrieval' };

// Выбранное есть в виде сессии? В повторе на раннем шаге его может ещё не быть.
// Не выбрано или не найдено — показываем последний запрос к модели: в живой сессии это «сейчас».
export function resolveFocus(view: SessionView, focus: Focus | null): Focus | null {
  if (focus !== null && exists(view, focus)) {
    return focus;
  }
  const last = view.modelCalls.at(-1);
  if (last !== undefined) {
    return { kind: 'model', requestId: last.requestId };
  }
  return hasRetrieval(view) ? { kind: 'retrieval' } : null;
}

export function isFocused(focus: Focus | null, candidate: Focus): boolean {
  if (focus === null || focus.kind !== candidate.kind) {
    return false;
  }
  if (focus.kind === 'model' && candidate.kind === 'model') {
    return focus.requestId === candidate.requestId;
  }
  if (focus.kind === 'tool' && candidate.kind === 'tool') {
    return focus.toolCallId === candidate.toolCallId;
  }
  return true;
}

export function hasRetrieval(view: SessionView): boolean {
  return view.retrieval.rewrite !== null || view.retrieval.retrieved !== null;
}

function exists(view: SessionView, focus: Focus): boolean {
  switch (focus.kind) {
    case 'model':
      return view.modelCalls.some((call) => call.requestId === focus.requestId);
    case 'tool':
      return view.toolCalls.some((tool) => tool.toolCallId === focus.toolCallId);
    case 'retrieval':
      return hasRetrieval(view);
  }
}
