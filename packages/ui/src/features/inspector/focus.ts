// Что раскрыто в карточке этапа инспектора: запрос к модели, тул или retrieval.

import type { SessionView } from '../../projections/sessionView';

export type Focus =
  | { kind: 'model'; requestId: string }
  | { kind: 'tool'; toolCallId: string }
  | { kind: 'retrieval' };

export function hasRetrieval(view: SessionView): boolean {
  return view.retrieval.rewrite !== null || view.retrieval.retrieved !== null;
}
