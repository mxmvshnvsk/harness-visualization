import { describe, expect, it } from 'vitest';
import { projectModelActors } from './modelActors';
import {
  EventLog,
  modelRequest,
  modelResponse,
  toolCall,
  toolCallEvent,
  toolResult,
} from './testEvents';
import type { HarnessEventPayload } from '@harness-visualization/harness';
const usage = {
  inputTokens: 10,
  inputCacheHitTokens: 0,
  inputCacheMissTokens: 10,
  outputTokens: 3,
  reasoningTokens: 0,
};
function request(
  id: string,
  model: string,
  agentId?: string,
): Extract<HarnessEventPayload, { type: 'model_request' }> {
  const payload = modelRequest(id, 1);
  if (payload.type !== 'model_request') {
    throw new Error('fixture');
  }
  return { ...payload, ...(agentId === undefined ? {} : { agentId }), body: { model } };
}
function response(
  id: string,
  model: string,
  callId: string,
  agentId?: string,
): HarnessEventPayload {
  const payload = modelResponse(id, { usage, toolCalls: [toolCall(callId, 'read')] });
  if (payload.type !== 'model_response') {
    throw new Error('fixture');
  }
  return {
    ...payload,
    ...(agentId === undefined ? {} : { agentId }),
    reply: { ...payload.reply, model },
  };
}
describe('model attribution', () => {
  it('interleaved agents and compaction retain request/tool associations', checkInterleavedActors);
  it('legacy unknown actor remains unknown; alias is one exchange', checkLegacyAlias);
  it(
    'a future response never becomes the author of earlier prompt history',
    checkHistoryChronology,
  );
  it('history enables labels without becoming a fresh request', checkInheritedActors);
});

function checkInterleavedActors(): void {
  const call = toolCall('main-call', 'read');
  const log = new EventLog()
    .add(request('main', 'DeepSeek'))
    .add(request('sub', 'GLM', 'researcher'))
    .add(response('main', 'DeepSeek', 'main-call'))
    .add(response('sub', 'GLM', 'sub-call', 'researcher'))
    .add(toolCallEvent(call))
    .add(toolResult(call))
    .add({ ...request('compact', 'summary-model'), purpose: 'compaction', iteration: null })
    .add(response('compact', 'summary-model', 'summary-call'))
    .add({ type: 'assistant_message', text: 'done' });
  const actors = projectModelActors(log.events);
  expect(actors.multiple).toBe(true);
  expect(actors.tools.get(':main-call')?.label).toBe('DeepSeek');
  expect(actors.tools.get('researcher:sub-call')?.label).toBe('GLM');
  expect(actors.events.get(log.events.at(-1)?.sequence ?? 0)?.label).toBe('DeepSeek');
}

function checkLegacyAlias(): void {
  const log = new EventLog()
    .add(request('r', 'alias'))
    .add(response('r', 'actual-model', 'c'))
    .add(toolResult(toolCall('unknown', 'read')));
  const actors = projectModelActors(log.events);
  expect(actors.multiple).toBe(false);
  expect(actors.requests.get('r')).toMatchObject({
    requested: 'alias',
    returned: 'actual-model',
  });
  expect(actors.events.has(log.events.at(-1)?.sequence ?? 0)).toBe(false);
}

function checkHistoryChronology(): void {
  const log = new EventLog()
    .add(request('before', 'DeepSeek'))
    .add(response('before', 'DeepSeek', 'call-before'))
    .add(request('after', 'GLM'))
    .add(response('after', 'GLM', 'call-after'));
  const actors = projectModelActors(log.events);
  expect(actors.histories.get('before')?.has('call-before')).toBe(false);
  expect(actors.histories.get('after')?.get('call-before')?.actor?.label).toBe('DeepSeek');
  expect(actors.histories.get('after')?.has('call-after')).toBe(false);
}

function checkInheritedActors(): void {
  const log = new EventLog()
    .add({
      type: 'branch_started',
      sourceTracePath: 'source.jsonl',
      sourceSessionId: 'source',
      step: 2,
      replayedSteps: 1,
      replayedMessages: 1,
      change: { kind: 'replay' },
      sourceModel: {
        model: 'DeepSeek',
        baseUrl: 'https://deepseek.test',
        providerName: 'deepseek',
      },
    })
    .add(request('r', 'GLM'));
  const actors = projectModelActors(log.events);
  expect(actors.multiple).toBe(true);
  expect(actors.requests.size).toBe(1);
  expect(actors.inherited[0]?.label).toBe('DeepSeek');
}
