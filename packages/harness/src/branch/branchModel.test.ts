import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { branchSourceModel } from './branchModel.js';
import { adaptBranchHistory, validateBranchHistory } from './branchHistory.js';
import { continuationEvents } from './continuationEvents.js';
import { branchSourceKey, selectBranchModel } from './selectBranchModel.js';
import { harnessSettingsSchema } from '../settings/settingsSchema.js';
import type { ChatMessage } from '../model/chatTypes.js';
import type { HarnessEvent, HarnessEventPayload } from '../events/harnessEvents.js';

const settings = harnessSettingsSchema.parse(
  JSON.parse(await readFile(new URL('../../../../harness.config.json', import.meta.url), 'utf8')),
);
const loaded = { settings, modelApiKey: 'private-test-key' };
function trace(payloads: HarnessEventPayload[]): HarnessEvent[] {
  return payloads.map((payload, index) => ({
    ...payload,
    sequence: index + 1,
    sessionId: 'test',
    timestamp: new Date(index * 1000).toISOString(),
  }));
}
const request = (id: string): HarnessEventPayload => ({
  type: 'model_request',
  requestId: id,
  purpose: 'agentStep',
  iteration: 1,
  reasoningEffort: 'high',
  method: 'POST',
  url: `${settings.model.baseUrl}/chat/completions`,
  headers: {},
  body: { model: settings.model.model, messages: [{ role: 'user', content: 'question' }] },
});

it('legacy source resolves by model and endpoint; missing or ambiguous source never defaults', async () => {
  const events = trace([request('r1')]);
  assert.equal(branchSourceModel(events, 1).model, settings.model.model);
  assert.equal(branchSourceKey(loaded, events, 1), 'default');
  assert.equal((await selectBranchModel(loaded, events, 1)).settings.model, settings.model);
  const ambiguous = {
    ...loaded,
    settings: {
      ...settings,
      models: {
        duplicate: {
          model: settings.model.model,
          baseUrl: settings.model.baseUrl,
          apiKeyVariable: null,
        },
      },
    },
  };
  assert.equal(branchSourceKey(ambiguous, events, 1), null);
  await assert.rejects(selectBranchModel(ambiguous, events, 1), /Выберите модель явно/);
  const different = structuredClone(events);
  const first = different[0];
  if (first?.type === 'model_request') {
    first.body.model = 'no-longer-configured';
  }
  await assert.rejects(selectBranchModel(loaded, different, 1), /Выберите модель явно/);
  assert.equal(
    (await selectBranchModel(loaded, different, 1, 'default')).settings.model,
    settings.model,
  );
});

it('same model preserves reasoning and signatures; switch strips both without touching source', () => {
  const history: ChatMessage[] = [
    { role: 'user', content: 'q' },
    {
      role: 'assistant',
      content: null,
      reasoningContent: 'private reasoning',
      reasoningDetails: [{ signature: 'signed' }],
      toolCalls: [{ id: 'c', name: 'read', argumentsText: '{}' }],
    },
    { role: 'tool', toolCallId: 'c', content: 'data' },
  ];
  assert.equal(adaptBranchHistory(history, false), history);
  const adapted = adaptBranchHistory(history, true);
  assert.equal('reasoningDetails' in (adapted[1] ?? {}), false);
  assert.equal(
    history[1]?.role === 'assistant' && history[1].reasoningContent,
    'private reasoning',
  );
  assert.throws(
    () => validateBranchHistory(adapted, true, 'deepseek'),
    /более ранний шаг|Выберите шаг/,
  );
  assert.doesNotThrow(() => validateBranchHistory(adapted, false, 'deepseek'));
  assert.doesNotThrow(() => validateBranchHistory(history, true, 'deepseek'));
  assert.throws(() => validateBranchHistory(history.slice(0, 2), false, 'none'), /не завершены/);
  assert.throws(() => validateBranchHistory(history.slice(2), false, 'none'), /без вызова/);
});

it('comparison excludes shared prefix and subsequent dialogue, retaining selected request', () => {
  const events = trace([
    request('prefix'),
    { type: 'assistant_message', text: 'prefix answer' },
    { type: 'user_message', text: 'next question' },
    request('selected'),
    { type: 'assistant_message', text: 'selected answer' },
    { type: 'user_message', text: 'later' },
    request('later'),
  ]);
  const selected = continuationEvents(events, 2);
  assert.equal(selected.length, 2);
  assert.equal(selected[0]?.type === 'model_request' && selected[0].requestId, 'selected');
  assert.equal(selected.at(-1)?.type, 'assistant_message');
});
