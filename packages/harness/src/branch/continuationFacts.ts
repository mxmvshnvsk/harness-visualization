import type { HarnessEvent } from '../events/harnessEvents.js';
import { readTrialFacts, type TrialFacts } from '../evals/codeChecks.js';
import { continuationEvents } from './continuationEvents.js';

export function continuationFacts(events: readonly HarnessEvent[], step = 1): TrialFacts {
  const selected = continuationEvents(events, step);
  const facts = readTrialFacts(selected);
  const requests = selected.filter((event) => event.type === 'model_request');
  const responses = selected.filter((event) => event.type === 'model_response');
  const costKnown =
    requests.length === responses.length && responses.every((event) => event.cost !== null);
  const start = selected[0]?.timestamp;
  const end = selected.at(-1)?.timestamp;
  return {
    ...facts,
    modelRequests: requests.length,
    costUsd:
      costKnown && requests.length > 0
        ? responses.reduce((sum, event) => sum + (event.cost?.total ?? 0), 0)
        : null,
    durationMs: start === undefined || end === undefined ? 0 : Date.parse(end) - Date.parse(start),
  };
}
