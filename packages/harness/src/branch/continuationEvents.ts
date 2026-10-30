import type { HarnessEvent } from '../events/harnessEvents.js';
import { listBranchSteps } from './branchPoint.js';

// Общий префикс и следующие вопросы не входят в цену сравниваемого продолжения.
export function continuationEvents(events: readonly HarnessEvent[], step = 1): HarnessEvent[] {
  const requestId = listBranchSteps(events).find(
    (branchStep) => branchStep.step === step,
  )?.requestId;
  const startIndex = events.findIndex(
    (event) => event.type === 'model_request' && event.requestId === requestId,
  );
  if (startIndex < 0) {
    return [];
  }
  const continuation = events.slice(startIndex);
  const endIndex = continuation.findIndex(isMainTurnBoundary);
  if (endIndex < 0) {
    return continuation;
  }
  const boundary = continuation[endIndex];
  const endExclusive = boundary?.type === 'assistant_message' ? endIndex + 1 : endIndex;
  return continuation.slice(0, endExclusive);
}

function isMainTurnBoundary(event: HarnessEvent): boolean {
  const isTurnMessage = event.type === 'assistant_message' || event.type === 'user_message';
  return isTurnMessage && event.agentId === undefined;
}
