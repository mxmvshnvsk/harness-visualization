// Собирает отчёт об опоре ответа: для каждой ссылки из ответа — что модель видела по трейсу.

import type { HarnessEvent } from '../events/harnessEvents.js';
import { collectSeenSources, normalizeReference } from './collectSeenSources.js';
import { extractReferences } from './extractReferences.js';
import type { CheckedReference, GroundingReport } from './referenceTypes.js';

export function checkGrounding(events: HarnessEvent[]): GroundingReport {
  const answer = findFinalAnswer(events);
  const seen = collectSeenSources(events);
  const references = extractReferences(answer).map<CheckedReference>((reference) => ({
    reference,
    seen: seen.get(normalizeReference(reference)) ?? { level: 'notSeen', eventSequence: null },
  }));
  return { answer, references };
}

// Ответ пользователю — последнее сообщение assistant_message в трейсе.
function findFinalAnswer(events: HarnessEvent[]): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'assistant_message') {
      return event.text;
    }
  }
  throw new Error('В трейсе нет ответа модели (события assistant_message)');
}
