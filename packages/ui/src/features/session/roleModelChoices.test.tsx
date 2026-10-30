import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ModelOption } from '@harness-visualization/harness';
import type { SessionOptionsResponse } from '@harness-visualization/server';
import { activeRoleModels, roleModelErrors } from './roleModelChoices';
import { RoleModelSettings } from './RoleModelSettings';
import {
  readSavedChoices,
  saveSessionChoices,
  restoreSessionChoices,
  toStartRequest,
  type ChoicesState,
} from './sessionChoices';

const MODEL: ModelOption = {
  key: 'default',
  label: 'DeepSeek',
  model: 'deepseek-flash',
  providerName: 'deepseek',
  dialect: 'deepseek',
  apiKeyVariable: 'DEEPSEEK_API_KEY',
  available: true,
  reasoningEfforts: ['off', 'low', 'high', 'max'],
  defaultReasoningEffort: 'high',
  capabilities: {},
  priceSource: 'tariffs',
};

function fixture(): ChoicesState {
  const options: SessionOptionsResponse = {
    models: [MODEL, { ...MODEL, key: 'other', label: 'Другая', model: 'other-model' }],
    defaultModelKey: 'default',
    reasoningEffort: 'high',
    retrievalMode: 'tool',
    subagents: {
      enabledByDefault: true,
      parallel: true,
      agents: ['researcher'],
      delegateToolTokens: 100,
    },
    roleModels: {
      orchestrator: null,
      pipelineResearcher: 'researcher',
      subagents: {
        researcher: { modelKey: null, reasoningEffort: 'low', description: 'Читает документы' },
      },
    },
  };
  return {
    choices: {
      demoProject: true,
      subagents: true,
      orchestration: true,
      orchestrationMode: 'superagent',
      cleanWorkspace: false,
      retrievalMode: 'tool',
      reasoningEffort: 'high',
      modelKey: 'other',
      roleModels: { orchestrator: 'default', subagents: { researcher: null } },
    },
    options,
    modelNotice: null,
    change: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

it('исполнитель наследует модель сессии независимо от модели оркестратора', () => {
  const state = fixture();
  const roles = activeRoleModels(state);
  expect(roles.map((role) => role.model?.model)).toEqual(['deepseek-flash', 'other-model']);
  state.choices.modelKey = 'default';
  expect(activeRoleModels(state).map((role) => role.model?.model)).toEqual([
    'deepseek-flash',
    'deepseek-flash',
  ]);
});

it('восстанавливает назначения после сохранения, не сохраняя Clean Workspace', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const state = fixture();
  saveSessionChoices({ ...state.choices, cleanWorkspace: true });
  const saved = readSavedChoices();
  expect(saved).not.toHaveProperty('cleanWorkspace');
  const restored = restoreSessionChoices(state.choices, state.options!, saved);
  expect(restored.roleModels).toEqual(state.choices.roleModels);
  expect(restored.modelKey).toBe('other');
  expect(activeRoleModels({ ...state, choices: restored })[1]?.model?.key).toBe('other');
});

it('отличает старое сохранение от явного наследования и удаляет отсутствующих агентов', () => {
  const state = fixture();
  state.options!.roleModels!.orchestrator = 'default';
  const restored = restoreSessionChoices(state.choices, state.options!, {});
  expect(restored.roleModels?.orchestrator).toBe('default');
  const explicit = restoreSessionChoices(state.choices, state.options!, {
    roleModels: { orchestrator: null, subagents: { removed: 'other', researcher: null } },
  });
  expect(explicit.roleModels).toEqual({ orchestrator: null, subagents: { researcher: null } });
});

it('передаёт отдельные назначения, сохраняя старый запрос без них', () => {
  const state = fixture();
  expect(toStartRequest('Вопрос', state.choices).roleModels).toEqual(state.choices.roleModels);
  const blank = toStartRequest('Вопрос', { ...state.choices, demoProject: false });
  expect(blank).not.toHaveProperty('roleModels');
  const plain = toStartRequest('Вопрос', {
    ...state.choices,
    orchestration: false,
    subagents: false,
  });
  expect(plain).not.toHaveProperty('roleModels');
  const delegated = toStartRequest('Вопрос', { ...state.choices, orchestration: false });
  expect(delegated.roleModels).toEqual({ subagents: { researcher: null } });
});

it('выявляет недоступную модель и несовместимый effort без подмены назначения', () => {
  const state = fixture();
  state.options!.models[1] = { ...MODEL, key: 'other', available: false };
  expect(roleModelErrors(state)[0]).toContain('нет ключа');
  state.options!.models[1] = { ...MODEL, key: 'other', reasoningEfforts: ['high'] };
  expect(roleModelErrors(state)[0]).toContain('effort low');
  state.choices.roleModels = { subagents: { researcher: 'removed' } };
  expect(roleModelErrors(state)[0]).toContain('удалена');
  expect(state.choices.roleModels.subagents?.researcher).toBe('removed');
});

it('проверяет только активные роли, включая выбранного исследователя пайплайна', () => {
  const state = fixture();
  state.choices.roleModels = { orchestrator: 'removed', subagents: { researcher: null } };
  state.choices.orchestration = false;
  expect(roleModelErrors(state)).toEqual([]);
  state.choices.demoProject = false;
  expect(activeRoleModels(state)).toEqual([]);
  state.choices.demoProject = true;
  state.choices.orchestration = true;
  state.choices.orchestrationMode = 'pipeline';
  state.options!.subagents.agents.push('unused');
  expect(activeRoleModels(state).map((role) => role.name)).toEqual(['orchestrator', 'researcher']);
});

it('скрывает блок при одной модели и показывает его для исправления ошибки', () => {
  const state = fixture();
  state.options!.models = [MODEL];
  state.choices.modelKey = 'default';
  expect(renderToStaticMarkup(<RoleModelSettings state={state} />)).toBe('');
  state.choices.roleModels = { subagents: { researcher: 'removed' } };
  const html = renderToStaticMarkup(<RoleModelSettings state={state} />);
  expect(html).toContain('Модели по ролям');
  expect(html).toContain('удалена из реестра');
});

it('не падает при повреждённом или недоступном хранилище', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  expect(readSavedChoices()).toEqual({});
  vi.stubGlobal('localStorage', { getItem: () => 'null' });
  expect(readSavedChoices()).toEqual({});
});
