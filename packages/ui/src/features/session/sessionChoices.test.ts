import { describe, expect, it } from 'vitest';
import type { ModelOption } from '@harness-visualization/harness';
import type { SessionOptionsResponse } from '@harness-visualization/server';
import {
  normalizeModelChoice,
  selectedSessionModel,
  toStartRequest,
  type SessionChoices,
} from './sessionChoices';

const choices: SessionChoices = {
  demoProject: true,
  subagents: false,
  orchestration: false,
  orchestrationMode: 'pipeline',
  cleanWorkspace: false,
  retrievalMode: 'tool',
  reasoningEffort: 'high',
  modelKey: 'default',
};
const model: ModelOption = {
  key: 'default',
  label: 'DeepSeek',
  model: 'deepseek-flash',
  providerName: 'DeepSeek',
  dialect: 'deepseek',
  apiKeyVariable: 'DEEPSEEK_API_KEY',
  available: true,
  reasoningEfforts: ['off', 'low', 'high', 'max'],
  defaultReasoningEffort: 'high',
  capabilities: {},
  priceSource: 'tariffs',
};
const options: SessionOptionsResponse = {
  defaultModelKey: 'default',
  models: [
    model,
    { ...model, key: 'limited', reasoningEfforts: ['low'], defaultReasoningEffort: 'low' },
    { ...model, key: 'unavailable', available: false },
  ],
  reasoningEffort: 'high',
  retrievalMode: 'tool',
  subagents: { enabledByDefault: false, parallel: true, agents: [], delegateToolTokens: 0 },
};

describe('Выбор модели в форме', () => {
  it('показывает выбранную модель сессии и при включённой оркестрации', () => {
    const selected = { ...choices, modelKey: 'limited' };
    expect(selectedSessionModel({ choices: selected, options })?.key).toBe('limited');
    expect(
      selectedSessionModel({ choices: { ...selected, orchestration: true }, options })?.key,
    ).toBe('limited');
    expect(
      selectedSessionModel({
        choices: { ...selected, orchestration: true, demoProject: false },
        options,
      })?.key,
    ).toBe('limited');
  });
  it('без выбора новой модели запрос сохраняет прежний формат', () => {
    expect(toStartRequest('question', choices)).toEqual({
      question: 'question',
      retrievalMode: 'tool',
      reasoningEffort: 'high',
      subagents: false,
    });
  });
  it('передаёт выбор в обычную сессию с демо и без него', () => {
    expect(toStartRequest('question', { ...choices, modelKey: 'limited' }).modelKey).toBe(
      'limited',
    );
    expect(
      toStartRequest('question', { ...choices, modelKey: 'limited', demoProject: false }).modelKey,
    ).toBe('limited');
  });
  it('передаёт выбранную модель сессии в оркестрацию', () => {
    expect(
      toStartRequest('question', { ...choices, modelKey: 'limited', orchestration: true }).modelKey,
    ).toBe('limited');
  });
  it('восстанавливает default после удаления модели или ключа, согласует effort', () => {
    expect(normalizeModelChoice({ ...choices, modelKey: 'removed' }, options).modelKey).toBe(
      'default',
    );
    expect(normalizeModelChoice({ ...choices, modelKey: 'unavailable' }, options).modelKey).toBe(
      'default',
    );
    expect(normalizeModelChoice({ ...choices, modelKey: 'limited' }, options).reasoningEffort).toBe(
      'low',
    );
  });
});
